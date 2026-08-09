// Stream s098 — counts the per-tick work and measures the GROWTH LAW.
// Runs real `Daemon.tick()` against isolated clones of ~/.pij pruned to N
// descriptors. Never touches the real home; tmux ports are stubbed.
import { execFileSync } from "node:child_process";  // read-only tmux probes only
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "/tmp/pij-perf-home";
const base = "/Users/jordanknight/pi-hacking/pij-worktrees/s098-daemon-perf/.pi/extensions/pij";

const daemonMod = await import(`${base}/daemon.ts`);
const registryMod = await import(`${base}/adapters/fs-registry.ts`);
const channelMod = await import(`${base}/adapters/channel.ts`);

const stubTmux = {  // READ-REAL variant: only MUTATING methods are stubbed
	// `capturePane` and `isPaneDead` hit real tmux, because the subprocess half
	// of the tick is exactly what the fully-stubbed harness cannot see.
	// `sendText`/`killPane` are never real — a profile must not type into a pane
	// or kill one.
	sendText: () => "confirmed",
	killPane: () => {},
	capturePane: (paneId: string) => {
		try {
			return execFileSync("tmux", ["capture-pane", "-t", paneId, "-p", "-J"], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			});
		} catch {
			return "";
		}
	},
	isPaneDead: (paneId: string) => {
		try {
			return (
				execFileSync("tmux", ["display-message", "-p", "-t", paneId, "#{pane_dead}"], {
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
				}).trim() !== "0"
			);
		} catch {
			return true;
		}
	},
	listPanes: () => [],
	attachPaneTap: () => {},
	drainPaneTap: () => Buffer.alloc(0),
	detachPaneTap: () => {},
	isAlive: (pid: number) => {
		try {
			process.kill(pid, 0);
			return true;
		} catch (e) {
			return (e as NodeJS.ErrnoException).code === "EPERM";
		}
	},
	now: () => Date.now(),
};

const counts = new Map<string, number>();
const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);

// Count registry writes + subprocesses WITHOUT monkey-patching node:fs (ESM
// named imports do not observe that). Prototype patching does work.
const RegProto = registryMod.FsRegistry.prototype as Record<string, unknown>;
for (const m of ["write", "writeExact", "dissolve", "read", "list", "revive"]) {
	const orig = RegProto[m] as (...a: unknown[]) => unknown;
	if (typeof orig !== "function") continue;
	RegProto[m] = function patched(this: unknown, ...a: unknown[]) {
		bump(`registry.${m}`);
		return orig.apply(this, a);
	};
}

function buildHome(n: number): string {
	const dir = `/tmp/pij-perf-n${n}`;
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	const jsons = readdirSync(SOURCE).filter((f) => f.endsWith(".json"));
	// Keep a deterministic prefix so every size is a subset of the next.
	jsons.sort();
	for (const f of jsons.slice(0, n)) cpSync(join(SOURCE, f), join(dir, f));
	for (const sub of ["spine", "identities", "projects", "assignments", "allocations", "fences", "dispatches", "ops"]) {
		try {
			cpSync(join(SOURCE, sub), join(dir, sub), { recursive: true });
		} catch {
			/* absent in source → fine */
		}
	}
	return dir;
}

function runTick(home: string): { ms: number; live: number; counts: Map<string, number> } {
	const daemon = new daemonMod.Daemon(
		home,
		stubTmux as never,
		new registryMod.FsRegistry(home),
		new channelMod.FsChannel(home),
		() => {},
	);
	daemon.tick(); // warm: one-time windowId backfill + adapter construction
	counts.clear();
	const psBefore = Number(
		execFileSync("sh", ["-c", "echo 0"], { encoding: "utf8" }).trim(),
	);
	void psBefore;
	const t0 = Date.now();
	daemon.tick();
	const ms = Date.now() - t0;
	const live = readdirSync(home).filter((f) => f.endsWith(".json")).length;
	return { ms, live, counts: new Map(counts) };
}

const sizes = (process.env.SIZES ?? "40,100,200,350,549").split(",").map(Number);
console.log(`${"descriptors".padStart(12)}${"tick ms".padStart(10)}${"ms/descriptor".padStart(15)}  registry calls`);
const rows: Array<{ n: number; ms: number }> = [];
for (const n of sizes) {
	const home = buildHome(n);
	const r = runTick(home);
	rows.push({ n: r.live, ms: r.ms });
	const c = [...r.counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" ");
	console.log(`${String(r.live).padStart(12)}${String(r.ms).padStart(10)}${(r.ms / r.live).toFixed(1).padStart(15)}  ${c}`);
	rmSync(home, { recursive: true, force: true });
}
console.log("\ngrowth law (ratio of tick ms to ratio of size, consecutive):");
for (let i = 1; i < rows.length; i++) {
	const a = rows[i - 1];
	const b = rows[i];
	if (!a || !b) continue;
	const sizeRatio = b.n / a.n;
	const timeRatio = b.ms / a.ms;
	console.log(
		`  ${a.n} -> ${b.n}: size x${sizeRatio.toFixed(2)}, time x${timeRatio.toFixed(2)}  (exponent ${(Math.log(timeRatio) / Math.log(sizeRatio)).toFixed(2)})`,
	);
}
writeFileSync("/tmp/growth.json", JSON.stringify(rows));
