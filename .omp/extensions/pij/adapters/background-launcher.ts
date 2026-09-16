// pij-control-plane — detached background launcher (adapter for BackgroundLauncherPort).
//
// The child is deliberately fully detached: its own process group (`detached`),
// no inherited stdio, and `unref()`d so this process's event loop does not wait
// on it. A `pij bg` job must survive the CLI invocation that queued it — the
// caller's turn ends the moment we return.

import { spawn } from "node:child_process";

import type { BackgroundLauncherPort } from "../core/ports.js";
import { err, ok, type Result } from "../core/types.js";

export class NodeBackgroundLauncher implements BackgroundLauncherPort {
	launch(input: {
		readonly script: string;
		readonly env: Readonly<Record<string, string>>;
		readonly cwd: string;
	}): Result<{ readonly pid: number }> {
		try {
			const child = spawn("sh", ["-c", input.script], {
				cwd: input.cwd,
				env: { ...process.env, ...input.env },
				detached: true,
				stdio: "ignore",
			});
			child.unref();
			const pid = child.pid;
			if (pid === undefined) return err("E-CMD", "background job did not start (no pid)");
			return ok({ pid });
		} catch (error) {
			return err("E-CMD", error instanceof Error ? error.message : String(error));
		}
	}
}
