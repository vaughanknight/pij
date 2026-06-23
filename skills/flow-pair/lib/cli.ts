#!/usr/bin/env -S npx tsx

// skills/flow-pair/lib/cli.ts
// Thin flow-pair CLI entrypoint.
// The flow-pair SKILL.md shells out to this — it is NEVER imported into pi (P2 boundary, Finding 08).
// P2: zero @earendil-works/* imports | P7: .js ESM relative imports
// Exit codes: 0=success  1=usage error  2=runtime error

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContextPackCompiler, nodeContextPackDeps } from "./context-pack.js";
import { deriveRepoId, nodeGitDeps } from "./identity.js";
import { LedgerWriter, nodeLedgerDeps, PROMPTS_DIR } from "./ledger.js";
import { nodeObserveDeps, Observe } from "./observe.js";
import { nodePacketRendererDeps, PacketRenderer } from "./packet.js";
import { LEDGER_ROOT, resolveRunDir } from "./paths.js";

// ─── Constants (P5) ──────────────────────────────────────────────────────────

const SUBCOMMANDS = ["start", "dispatch", "observe", "review", "fix", "accept", "ledger"] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

const HELP = `\
flow-pair — orchestrator/worker delegation CLI

Usage:
  flow-pair <subcommand> [options]

Subcommands:
  start      Start a new flow-pair run          (Phase 1 functional)
  dispatch   Compile a context pack for a delegation      (Phase 3)
  observe    Capture diffs after worker execution     (Phase 5)
  review     Run review rubric on output        [stub — Phase 6]
  fix        Generate a fix packet              [stub — Phase 6]
  accept     Accept and close a run             [stub — Phase 7]
  ledger     Print run.json for --run-id                (Phase 2)

Options:
  --json             Emit structured JSON to stdout
  --repo <path>      Target repo path (start; default: cwd)
  --ledger-root <p>  Ledger root directory (start; default: .flow-pair)
  --run-id <id>      Run id (dispatch/observe/review/fix/accept/ledger)
  --delegation <id>  Delegation id (observe/review/accept; allocated automatically by dispatch)
  --plan-path <p>    Absolute path to plan file (dispatch)
  --phase <text>     Phase section heading to extract (dispatch)
  --tasks-dir <p>    Absolute path to tasks directory (dispatch)
  --task-description <t>  Task description for worker packet (dispatch; default: phase name)
  --cluster <name>   Prompt-lab cluster name (dispatch; default: implement-code)
  --allowed-paths <p1,p2,...>  Comma-separated allowed paths (dispatch)
  --review <id>      Review id (fix)
  --help             Show this help

Dispatch stdout contract:
  Non-JSON: exactly one line — "[flow-pair <delegationId>] Packet at: <rel-path>"
  --json: full JSON object (pointerMsg + delegationId + packId + packetPath + promptHash)

Exit codes: 0=success  1=usage error  2=runtime error
`;

// ─── Argument parser ──────────────────────────────────────────────────────────

interface ParsedArgs {
	subcommand: string | undefined;
	flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
	const flags: Record<string, string | boolean> = {};
	let subcommand: string | undefined;
	let i = 0;

	while (i < argv.length) {
		const arg = argv[i];
		if (arg === undefined) break;

		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("--")) {
				flags[key] = next;
				i += 2;
			} else {
				flags[key] = true;
				i++;
			}
		} else if (!arg.startsWith("-") && subcommand === undefined) {
			subcommand = arg;
			i++;
		} else {
			i++;
		}
	}

	return { subcommand, flags };
}

// ─── Subcommand handlers ──────────────────────────────────────────────────────

function runStart(flags: Record<string, string | boolean>): Record<string, unknown> {
	const repoPath = typeof flags.repo === "string" ? flags.repo : process.cwd();
	const ledgerRoot = typeof flags["ledger-root"] === "string" ? flags["ledger-root"] : LEDGER_ROOT;

	const idResult = deriveRepoId(repoPath, nodeGitDeps());
	if (!idResult.ok) {
		throw new Error(idResult.error ?? "failed to derive repo id");
	}

	const writer = new LedgerWriter(ledgerRoot, nodeLedgerDeps());
	const result = writer.createRun(idResult.repoId);
	if (!result.ok || !result.run) {
		throw new Error(result.error ?? "failed to create run");
	}
	const { run } = result;
	return { ok: true, repoId: run.repoId, runId: run.runId, runDir: run.runDir };
}

function runLedger(flags: Record<string, string | boolean>): Record<string, unknown> {
	const ledgerRoot = typeof flags["ledger-root"] === "string" ? flags["ledger-root"] : LEDGER_ROOT;
	const runId = typeof flags["run-id"] === "string" ? flags["run-id"] : undefined;

	if (!runId) {
		throw new Error("--run-id is required for ledger subcommand");
	}

	const dirResult = resolveRunDir(ledgerRoot, runId);
	if (!dirResult.ok) {
		throw new Error(dirResult.error ?? "invalid run id");
	}

	const runJsonPath = join(dirResult.runDir, "run.json");
	if (!existsSync(runJsonPath)) {
		throw new Error(`run not found: ${runId}`);
	}

	return JSON.parse(readFileSync(runJsonPath, "utf8")) as Record<string, unknown>;
}

function runDispatch(flags: Record<string, string | boolean>): Record<string, unknown> {
	const ledgerRoot = typeof flags["ledger-root"] === "string" ? flags["ledger-root"] : LEDGER_ROOT;
	const repoRoot = typeof flags.repo === "string" ? flags.repo : process.cwd();
	const runId = typeof flags["run-id"] === "string" ? flags["run-id"] : undefined;
	const planPath = typeof flags["plan-path"] === "string" ? flags["plan-path"] : undefined;
	const phase = typeof flags.phase === "string" ? flags.phase : undefined;
	const tasksDir = typeof flags["tasks-dir"] === "string" ? flags["tasks-dir"] : undefined;
	const taskDescription =
		typeof flags["task-description"] === "string"
			? flags["task-description"]
			: (phase ?? "implement");
	const cluster = typeof flags.cluster === "string" ? flags.cluster : "implement-code";
	const allowedPathsRaw = typeof flags["allowed-paths"] === "string" ? flags["allowed-paths"] : "";
	const allowedPaths = allowedPathsRaw ? allowedPathsRaw.split(",").map((p) => p.trim()) : [];

	if (!runId || !planPath || !phase || !tasksDir) {
		throw new Error("dispatch requires: --run-id --plan-path --phase --tasks-dir");
	}

	const dirResult = resolveRunDir(ledgerRoot, runId);
	if (!dirResult.ok) {
		throw new Error(dirResult.error ?? "invalid run id");
	}
	const { runDir } = dirResult;

	// Step 1: pre-compute expected delegationId so packetPath can be passed to writeDelegation.
	// Uses the same nextId logic as LedgerWriter (OQ-01: single-writer assumption).
	const delegationsDir = join(runDir, "delegations");
	const existingCount = existsSync(delegationsDir)
		? readdirSync(delegationsDir).filter((f) => f.endsWith(".json")).length
		: 0;
	const delegationId = `dlg-${String(existingCount + 1).padStart(4, "0")}`;
	const packetPath = join(runDir, PROMPTS_DIR, `${delegationId}.md`);

	const writer = new LedgerWriter(ledgerRoot, nodeLedgerDeps());

	// Step 2: create delegation record (packetPath is now known)
	const delegResult = writer.writeDelegation(runId, {
		taskRef: taskDescription,
		packetPath,
	});
	if (!delegResult.ok || !delegResult.delegation) {
		throw new Error(delegResult.error ?? "writeDelegation failed");
	}

	// Step 3: compile context pack
	const compiler = new ContextPackCompiler(repoRoot, ledgerRoot, nodeContextPackDeps());
	const compileResult = compiler.compile({
		runId,
		delegationId: delegResult.delegation.delegationId,
		planPath,
		phase,
		tasksDir,
		cluster,
		allowedPaths,
	});
	if (!compileResult.ok || !compileResult.manifest) {
		throw new Error(compileResult.error ?? "compile failed");
	}

	// Step 4: render + write packet (P9 inside writePacket)
	// templateDir is adjacent to this file: lib/../references/templates/
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	const templateDir = join(__dirname, "..", "references", "templates");
	const renderer = new PacketRenderer(ledgerRoot, templateDir, writer, nodePacketRendererDeps());
	const packetResult = renderer.writePacket({
		manifest: compileResult.manifest,
		taskDescription,
		repoRoot,
	});
	if (!packetResult.ok || !packetResult.packet) {
		throw new Error(packetResult.error ?? "writePacket failed");
	}

	// P2 boundary: pointerMsg is printed to stdout; the ORCHESTRATOR calls pij_send.
	// NO --send-to, NO execSync("pij send ...") — transport stays above the lib layer.
	return {
		ok: true,
		pointerMsg: packetResult.packet.pointerMsg,
		delegationId: packetResult.packet.delegationId,
		packId: compileResult.manifest.packId,
		packetPath: packetResult.packet.packetPath,
		promptHash: packetResult.packet.promptHash,
	};
}

function runObserve(flags: Record<string, string | boolean>): Record<string, unknown> {
	const ledgerRoot = typeof flags["ledger-root"] === "string" ? flags["ledger-root"] : LEDGER_ROOT;
	const repoRoot = typeof flags.repo === "string" ? flags.repo : process.cwd();
	const runId = typeof flags["run-id"] === "string" ? flags["run-id"] : undefined;
	const delegationId = typeof flags.delegation === "string" ? flags.delegation : undefined;

	if (!runId || !delegationId) {
		throw new Error("observe requires: --run-id --delegation");
	}

	const obs = new Observe(ledgerRoot, nodeObserveDeps());
	const res = obs.capture({ repoRoot, runId, delegationId });
	if (!res.ok || !res.result) {
		throw new Error(res.error ?? "observe capture failed");
	}
	return {
		ok: true,
		diffId: res.result.diffId,
		runId: res.result.runId,
		delegationId: res.result.delegationId,
		changedFiles: res.result.changedFiles,
		patchPath: res.result.patchPath,
		statPath: res.result.statPath,
		manifestPath: res.result.manifestPath,
	};
}

function runStub(cmd: Subcommand): Record<string, unknown> {
	return { ok: true, subcommand: cmd, status: "stub — not yet implemented" };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function usageError(useJson: boolean, message: string): never {
	if (useJson) {
		process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
	} else {
		process.stderr.write(`${message}\n\n${HELP}`);
	}
	process.exit(1);
}

function main(): void {
	const argv = process.argv.slice(2);

	// Parse early so --json is known before any error path.
	const { subcommand, flags } = parseArgs(argv);
	const useJson = flags.json === true;

	if (argv.length === 0 || flags.help === true || argv[0] === "--help" || argv[0] === "-h") {
		process.stdout.write(HELP);
		process.exit(0);
	}

	if (subcommand === undefined) {
		usageError(useJson, "No subcommand given.");
	}

	if (!(SUBCOMMANDS as readonly string[]).includes(subcommand)) {
		usageError(useJson, `Unknown subcommand: "${subcommand}"`);
	}

	try {
		const cmd = subcommand as Subcommand;
		const out =
			cmd === "start"
				? runStart(flags)
				: cmd === "dispatch"
					? runDispatch(flags)
					: cmd === "observe"
						? runObserve(flags)
						: cmd === "ledger"
							? runLedger(flags)
							: runStub(cmd);

		if (useJson) {
			process.stdout.write(`${JSON.stringify(out)}\n`);
		} else if (cmd === "dispatch") {
			// Fix 1: stdout = EXACTLY the pointer line so orchestrator can pipe stdout into pij_send.
			// Metadata (delegationId, packId, packetPath, promptHash) is only emitted under --json.
			process.stdout.write(`${out.pointerMsg as string}\n`);
		} else if (cmd === "observe") {
			// Observe stdout contract: exactly one line — "diffId: diff-NNNN"
			// Full ObserveResult is available under --json for Phase 6 consumers.
			process.stdout.write(`diffId: ${out.diffId as string}\n`);
		} else {
			for (const [k, v] of Object.entries(out)) {
				process.stdout.write(`${k}: ${String(v)}\n`);
			}
		}
		process.exit(0);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (useJson) {
			process.stderr.write(`${JSON.stringify({ ok: false, error: msg })}\n`);
		} else {
			process.stderr.write(`Error: ${msg}\n`);
		}
		process.exit(2);
	}
}

main();
