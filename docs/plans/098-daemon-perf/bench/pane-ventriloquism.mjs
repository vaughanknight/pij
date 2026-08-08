import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const home = join(process.env.HOME, ".pij");
const ds = [];
for (const n of readdirSync(home)) {
  if (!n.endsWith(".json")) continue;
  try { const d = JSON.parse(readFileSync(join(home, n), "utf8")); if (d?.id) ds.push(d); } catch {}
}
const ws = ds.filter(d => d.lifecycle !== "dissolved");
// real panes -> real pid
const panePid = new Map();
for (const line of execFileSync("tmux", ["list-panes","-a","-F","#{pane_id} #{pane_pid}"], {encoding:"utf8"}).trim().split("\n")) {
  const [p, pid] = line.split(" ");
  panePid.set(p, Number(pid));
}
const byPane = new Map();
for (const d of ws) { if (!d.paneId) continue;
  if (!byPane.has(d.paneId)) byPane.set(d.paneId, []);
  byPane.get(d.paneId).push(d); }
console.log(`working set: ${ws.length}   real panes: ${panePid.size}`);
let contestedPanes = 0, ventriloquised = 0, soleLive = 0;
const rows = [];
for (const [pane, claimants] of byPane) {
  if (!panePid.has(pane)) continue;            // pane no longer exists
  const realPid = panePid.get(pane);
  const occupant = claimants.filter(d => d.pid === realPid);
  const impostors = claimants.filter(d => d.pid !== realPid);
  if (claimants.length > 1) contestedPanes++;
  if (impostors.length > 0 && occupant.length > 0) {
    ventriloquised += impostors.length;
    for (const im of impostors) rows.push({ pane, realPid,
      corpse: im.id, corpsePid: im.pid, corpseLastEvent: im.lastEventAt,
      corpseTerminal: im.terminal?.disposition ?? "none",
      live: occupant[0].id, liveLastEvent: occupant[0].lastEventAt });
  }
  if (claimants.length === 1 && occupant.length === 1) soleLive++;
}
console.log(`live panes claimed by >1 descriptor      : ${contestedPanes}`);
console.log(`CORPSES BEING VENTRILOQUISED (pane held by a different, live descriptor): ${ventriloquised}`);
console.log(`live panes with exactly one correct claimant: ${soleLive}`);
console.log("");
for (const r of rows) {
  console.log(`pane ${r.pane} (real pid ${r.realPid})`);
  console.log(`   corpse ${r.corpse} pid ${r.corpsePid} terminal=${r.corpseTerminal} lastEventAt=${r.corpseLastEvent}`);
  console.log(`   live   ${r.live} lastEventAt=${r.liveLastEvent}`);
}
// how many corpses sit on a pane id that has been re-issued at all (regardless of claimant)
const reissued = ws.filter(d => d.paneId && panePid.has(d.paneId) && d.pid !== panePid.get(d.paneId));
console.log(`\ndescriptors whose paneId exists but whose pid is NOT the pane's pid: ${reissued.length}`);
