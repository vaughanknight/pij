import { spawnSync } from "node:child_process";
import type { ChoreProbePort, ChoreProbeResult } from "../core/chores/types.js";

export class ShellChoreProbe implements ChoreProbePort {
	run(command: string, cwd: string, timeoutMs: number): ChoreProbeResult {
		try {
			const result = spawnSync("sh", ["-c", command], {
				cwd,
				encoding: "utf8",
				timeout: timeoutMs,
				stdio: ["ignore", "pipe", "pipe"],
			});
			if (result.error) {
				const code = (result.error as NodeJS.ErrnoException).code;
				return {
					ok: false,
					reason:
						code === "ETIMEDOUT"
							? `timeout after ${timeoutMs}ms`
							: `spawn failed: ${result.error.message}`,
				};
			}
			if (result.status !== 0) {
				const detail = result.stderr.trim();
				return {
					ok: false,
					reason: `exit ${result.status ?? "unknown"}${detail ? `: ${detail}` : ""}`,
				};
			}
			return { ok: true, output: result.stdout.trim() };
		} catch (error) {
			return {
				ok: false,
				reason: `spawn failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}
