// image-see — pi wiring (the only pi-importing file).
//
// Registers ONE agent-callable tool, `see_image`, that lets a session whose
// own model can't receive a pasted image (e.g. remote xterm.js→tmux, no
// clipboard) still "see" an image: it shells a one-shot child `pi -p @<img>`
// on a vision-capable model and returns the description as tool output.
//
// All decisions (model, prompt, argv, validation) live in the pi-free
// store.ts; this file only does the fs check + child_process spawn.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
	buildSeeArgs,
	clampOutput,
	DEFAULT_SEE_MODEL,
	expandPath,
	isSubagentChild,
	resolveSeeModel,
	resolveSeePrompt,
	SEE_MAX_OUTPUT_BYTES,
	SEE_TIMEOUT_MS,
	seeChildEnv,
	validateSeeRequest,
} from "./store.js";

interface ChildResult {
	stdout: string;
	stderr: string;
}

/**
 * Run the one-shot vision child. Uses spawn (not execFile) so we can hand it an
 * EMPTY stdin: `pi -p` reads stdin and an inherited/open pipe makes it block
 * until EOF (D-043). stdin:"ignore" gives it /dev/null so it runs headless.
 * Rejects with an Error carrying { stdout, stderr, killed } on non-zero/timeout.
 */
function runVisionChild(
	args: string[],
	env: NodeJS.ProcessEnv,
	signal: AbortSignal | undefined,
): Promise<ChildResult> {
	return new Promise<ChildResult>((resolve, reject) => {
		const child = spawn("pi", args, { env, stdio: ["ignore", "pipe", "pipe"], signal });
		let stdout = "";
		let stderr = "";
		let killed = false;
		const cap = SEE_MAX_OUTPUT_BYTES * 4;
		const timer = setTimeout(() => {
			killed = true;
			child.kill("SIGKILL");
		}, SEE_TIMEOUT_MS);
		child.stdout?.on("data", (d: Buffer) => {
			if (stdout.length < cap) stdout += d.toString();
		});
		child.stderr?.on("data", (d: Buffer) => {
			if (stderr.length < cap) stderr += d.toString();
		});
		child.on("error", (err) => {
			clearTimeout(timer);
			reject(Object.assign(err, { stdout, stderr, killed }));
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0 && !killed) {
				resolve({ stdout, stderr });
				return;
			}
			reject(
				Object.assign(new Error(`pi exited with code ${code}`), {
					stdout,
					stderr,
					killed,
				}),
			);
		});
	});
}

export default function (pi: ExtensionAPI): void {
	// Never register inside our own vision-child (or any pi-subagents child):
	// the child runs --no-tools anyway, but this also prevents recursion.
	if (isSubagentChild(process.env)) return;

	pi.registerTool({
		name: "see_image",
		label: "See image",
		description:
			"Look at an image file the agent's own model can't receive (e.g. a pasted screenshot saved to disk over a remote terminal with no clipboard). Shells a one-shot child pi on a vision-capable model and returns a text description of the image. Use this whenever you need to actually SEE a PNG/JPEG/WEBP/GIF — typing @path only gives you the path text, not the pixels.",
		promptSnippet:
			"see_image: shell a vision-model child pi to describe an image file the current model can't receive (e.g. a pasted screenshot saved to disk over a remote terminal).",
		promptGuidelines: [
			`Default vision model is ${DEFAULT_SEE_MODEL}; override per-call with the model param or globally with the PI_SEE_MODEL env var.`,
			"Pass an absolute path when possible; relative paths resolve against the current working directory and ~ is expanded.",
			"Supported formats: png, jpg/jpeg, webp, gif. Convert others first (e.g. `sips -s format png in.heic --out out.png`).",
		],
		parameters: Type.Object({
			path: Type.String({
				description:
					"Path to the image file (absolute preferred; ~ and relative-to-cwd are resolved).",
			}),
			prompt: Type.Optional(
				Type.String({
					description:
						"What to ask about the image. Defaults to a faithful 'describe exactly what you see' report.",
				}),
			),
			model: Type.Optional(
				Type.String({
					description:
						"Override the vision model (provider/id). Defaults to PI_SEE_MODEL or the built-in default.",
				}),
			),
		}),
		executionMode: "parallel",
		async execute(_id, params, signal) {
			type SeeDetails = {
				error?: string;
				path?: string;
				model?: string;
				empty?: boolean;
			};
			const result = (text: string, details: SeeDetails) => ({
				content: [{ type: "text" as const, text }],
				details,
			});

			const valid = validateSeeRequest(params.path);
			if (!valid.ok) {
				return result(valid.message, { error: valid.reason });
			}

			const absPath = expandPath(params.path, homedir(), process.cwd());
			if (!existsSync(absPath)) {
				return result(`see_image: file not found: ${absPath}`, {
					error: "not_found",
					path: absPath,
				});
			}

			const model = resolveSeeModel(process.env, params.model);
			const prompt = resolveSeePrompt(params.prompt);
			const args = buildSeeArgs({ absPath, model, prompt });

			try {
				const { stdout, stderr } = await runVisionChild(args, seeChildEnv(process.env), signal);
				const text = clampOutput(stdout.trim());
				if (!text) {
					const note = stderr.trim() || "(child produced no output)";
					return result(`see_image: empty description. child stderr: ${clampOutput(note)}`, {
						model,
						path: absPath,
						empty: true,
					});
				}
				return result(text, { model, path: absPath });
			} catch (error: unknown) {
				const e = error as {
					stdout?: string;
					stderr?: string;
					message?: string;
					killed?: boolean;
				};
				const detail = (e.stderr || e.stdout || e.message || String(error)).trim();
				const hint = e.killed ? ` (timed out after ${SEE_TIMEOUT_MS}ms)` : "";
				return result(
					`see_image: child pi failed${hint}. Is the model '${model}' available + vision-capable? Detail: ${clampOutput(detail)}`,
					{ error: "child_failed", model, path: absPath },
				);
			}
		},
	});
}
