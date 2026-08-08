import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const home = join(process.env.HOME, ".pij");
const ds = [];
for (const n of readdirSync(home)) {
  if (!n.endsWith(".json")) continue;
  try { const d = JSON.parse(readFileSync(join(home, n), "utf8"));
        if (d && typeof d.id === "string") ds.push(d); } catch {}
}
const ws = ds.filter(d => d.lifecycle !== "dissolved");
const alive = (pid) => { if (typeof pid !== "number") return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const now = Date.now();
const STALE = 60_000;
console.log("working set (lifecycle!=dissolved):", ws.length);
// --- pushProviderFailure reach (daemon.ts:843-866) ---
const ppf = ws.filter(d =>
  d.spawnedBy && d.paneId && d.lifecycle !== "pending" && alive(d.pid) && d.state !== "working");
const ppfStale = ppf.filter(d => { const age = d.lastEventAt ? now - Date.parse(d.lastEventAt) : null;
  return age === null || age > STALE; });
console.log("pushProviderFailure: spawnedBy+paneId+notPending+pidAlive+notWorking:", ppf.length);
console.log("  ...and stale (age>60s or never)  -> capturePane EVERY TICK:", ppfStale.length);
// --- reconcileDeaths input ---
console.log("reconcileDeaths descriptors (registry.list()):", ws.length);
console.log("  ...with a paneId (isPaneDead candidates):", ws.filter(d=>!!d.paneId).length);
// --- pid liveness truth ---
console.log("working set with pid ALIVE:", ws.filter(d=>alive(d.pid)).length);
const livePanes = new Set(execFileSync("tmux",["list-panes","-a","-F","#{pane_id}"],{encoding:"utf8"}).trim().split("\n"));
console.log("working set pid ALIVE but pane GONE (recycled-pid corpses):",
  ws.filter(d=>alive(d.pid) && d.paneId && !livePanes.has(d.paneId)).length);
console.log("of the stale-capture set, pane GONE:", ppfStale.filter(d=>!livePanes.has(d.paneId)).length);
