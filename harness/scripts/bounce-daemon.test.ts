import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(import.meta.dirname, "bounce-daemon.sh");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function executable(path: string, body: string): void {
	writeFileSync(path, `#!/bin/sh\nset -eu\n${body}`);
	chmodSync(path, 0o755);
}

function fixture(overrides: Record<string, string> = {}) {
	const root = mkdtempSync(join(tmpdir(), "pij-bounce-"));
	roots.push(root);
	const bin = join(root, "bin");
	mkdirSync(join(root, ".pi", "extensions", "pij"), { recursive: true });
	const canonical = realpathSync(root);
	mkdirSync(bin);
	writeFileSync(join(root, "package.json"), JSON.stringify({ version: "9.8.7" }));
	writeFileSync(join(root, "state"), "running\n");
	writeFileSync(join(root, "log"), "");

	executable(
		join(bin, "pij"),
		`case "$*" in
+  "daemon status")
+    if [ "$(cat "$BOUNCE_ROOT/state")" = running ]; then
+      echo "running (pid 999999, window @44); pij-daemon window(s): @44"
+    else
+      echo "not running"
+    fi ;;
+  "daemon stop") echo stop >> "$BOUNCE_ROOT/log"; echo stopped > "$BOUNCE_ROOT/state"; echo "pij daemon stopped" ;;
+  report\\ now*) echo report >> "$BOUNCE_ROOT/log" ;;
+  *) echo "unexpected pij args: $*" >&2; exit 2 ;;
+esac`.replace(/^\+/gm, ""),
	);
	executable(
		join(bin, "ps"),
		`echo "/usr/bin/node --import file://$BOUNCE_ROOT/node_modules/tsx/loader.mjs $BOUNCE_ROOT/.pi/extensions/pij/daemon.ts"`,
	);
	executable(
		join(bin, "tmux"),
		`case "$1" in
+  list-panes) printf '@44|pij-daemon|%%55|88888|%s\\n' "$BOUNCE_ROOT" ;;
+  new-window) echo start >> "$BOUNCE_ROOT/log"; echo running > "$BOUNCE_ROOT/state" ;;
+  *) echo "unexpected tmux args: $*" >&2; exit 2 ;;
+esac`.replace(/^\+/gm, ""),
	);
	executable(
		join(bin, "git"),
		`[ "$1" = -C ] && shift 2
+case "$1 $2" in
+  "fetch origin") echo fetch >> "$BOUNCE_ROOT/log" ;;
+  "rev-parse --show-toplevel") echo "$BOUNCE_ROOT" ;;
+  "rev-parse HEAD") echo "$BOUNCE_HEAD" ;;
+  "rev-parse refs/remotes/origin/main") echo "$BOUNCE_MAIN" ;;
+  "rev-parse --short") echo "${overrides.BOUNCE_SHORT ?? "aaaaaaaa"}" ;;
+  "status --porcelain")
+    for path in "$@"; do
+      case "$BOUNCE_DIRTY" in
+        " M $path"|" M $path/"*) printf '%s\\n' "$BOUNCE_DIRTY" ;;
+      esac
+    done ;;
+  *) echo "unexpected git args: $*" >&2; exit 2 ;;
+esac`.replace(/^\+/gm, ""),
	);
	executable(join(bin, "node"), 'echo "9.8.7"');

	const env = {
		...process.env,
		PATH: `${bin}:/usr/bin:/bin`,
		BOUNCE_ROOT: canonical,
		BOUNCE_HEAD: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		BOUNCE_MAIN: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		BOUNCE_DIRTY: "",
		...overrides,
	};
	return {
		root,
		run: (...args: string[]) => spawnSync(SCRIPT, args, { encoding: "utf8", env }),
		log: () => readFileSync(join(root, "log"), "utf8").trim().split("\n").filter(Boolean),
	};
}

describe("bounce-daemon", () => {
	it("fetches and refuses a canonical checkout behind origin/main before stopping", () => {
		const f = fixture({ BOUNCE_MAIN: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
		const result = f.run();

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("REFUSING stale-tree daemon bounce");
		expect(f.log()).toEqual(["fetch"]);
	});

	it.each([
		".pi/extensions/pij",
		".omp/extensions/pij/core/spawn.ts",
	])("refuses daemon-relevant dirt at %s unless --force is explicit", (path) => {
		const f = fixture({ BOUNCE_DIRTY: ` M ${path}` });
		const result = f.run();

		expect(f.log()).toEqual(["fetch"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("just bounce-daemon --force");
	});

	it("announces, gracefully stops, restarts the captured invocation, and verifies health", () => {
		const f = fixture();
		const result = f.run();

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("pij daemon healthy: version 9.8.7");
		expect(result.stdout).toContain("HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		expect(f.log()).toEqual(["fetch", "report", "stop", "start"]);
	});
});
