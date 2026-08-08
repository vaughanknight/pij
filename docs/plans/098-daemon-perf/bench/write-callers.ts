// Stream s098 — who issues the per-tick registry writes and subprocess probes.
import childProcess from "node:child_process";
const HOME = "/tmp/pij-perf-home";
const base = "/Users/jordanknight/pi-hacking/pij-worktrees/s098-daemon-perf/.pi/extensions/pij";
const daemonMod = await import(`${base}/daemon.ts`);
const registryMod = await import(`${base}/adapters/fs-registry.ts`);
const channelMod = await import(`${base}/adapters/channel.ts`);
const hits = new Map<string, number>();
function site(): string {
  const raw = (new Error().stack ?? "").split("\n").slice(3);
  const out: string[] = [];
  for (const l of raw) {
    if (l.includes("write-callers")) continue;
    const m = l.match(/at ([^ ]+) \((.*)\)/); if (!m) continue;
    const f = (m[2] ?? "").replace(/.*\/\.pi\//, ".pi/").replace(/\?.*$/, "");
    if (!f.includes(".pi/")) continue;
    out.push(`${m[1]} ${f}`);
    if (out.length === 3) break;
  }
  return out.join("  <-  ") || "<unknown>";
}
const bump = (k: string) => hits.set(k, (hits.get(k) ?? 0) + 1);
const RegProto = registryMod.FsRegistry.prototype as Record<string, unknown>;
for (const m of ["write", "writeExact", "dissolve"]) {
  const orig = RegProto[m] as (...a: unknown[]) => unknown;
  RegProto[m] = function (this: unknown, ...a: unknown[]) { bump(`registry.${m}  ${site()}`); return orig.apply(this, a); };
}
const origExec = childProcess.execFileSync;
(childProcess as unknown as Record<string, unknown>).execFileSync = function (this: unknown, ...a: unknown[]) {
  const cmd = String(a[0]); const argv = Array.isArray(a[1]) ? (a[1] as string[]) : [];
  bump(`spawn ${cmd} ${argv[0] ?? ""}  ${site()}`);
  return (origExec as (...x: unknown[]) => unknown).apply(this, a);
};
const stub = { capturePane: () => "", sendText: () => "confirmed", killPane: () => {}, isPaneDead: () => true,
  listPanes: () => [], attachPaneTap: () => {}, drainPaneTap: () => Buffer.alloc(0), detachPaneTap: () => {},
  isAlive: (p: number) => { try { process.kill(p, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } }, now: () => Date.now() };
const d = new daemonMod.Daemon(HOME, stub as never, new registryMod.FsRegistry(HOME), new channelMod.FsChannel(HOME), () => {});
d.tick(); hits.clear();
const t0 = Date.now(); d.tick(); const ms = Date.now() - t0;
console.log(`tick: ${ms}ms\n`);
let total = 0; for (const v of hits.values()) total += v;
console.log(`total counted operations: ${total}\n`);
for (const [k, v] of [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`${String(v).padStart(5)}  ${k}`);
