// Can the ventriloquism counter report anything OTHER than 9?
// Feed it synthetic pane tables with KNOWN answers. If it returns the same
// number regardless of input, the measurement is vacuous.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const home = join(process.env.HOME, ".pij");
const ds = [];
for (const n of readdirSync(home)) {
  if (!n.endsWith(".json")) continue;
  try { const d = JSON.parse(readFileSync(join(home, n), "utf8")); if (d?.id) ds.push(d); } catch {}
}
const ws = ds.filter(d => d.lifecycle !== "dissolved");
function count(panePid) {
  const byPane = new Map();
  for (const d of ws) { if (!d.paneId) continue;
    if (!byPane.has(d.paneId)) byPane.set(d.paneId, []);
    byPane.get(d.paneId).push(d); }
  let vent = 0;
  for (const [pane, claimants] of byPane) {
    if (!panePid.has(pane)) continue;
    const realPid = panePid.get(pane);
    const occupant = claimants.filter(d => d.pid === realPid);
    const impostors = claimants.filter(d => d.pid !== realPid);
    if (impostors.length > 0 && occupant.length > 0) vent += impostors.length;
  }
  return vent;
}
// case 1: no panes exist at all -> must be 0
console.log("empty pane table          ->", count(new Map()), "(expect 0)");
// case 2: every pane exists but pid matches the FIRST claimant -> only extra claimants count
const allPanes = new Map();
for (const d of ws) if (d.paneId && !allPanes.has(d.paneId)) allPanes.set(d.paneId, d.pid);
console.log("all panes, first claimant ->", count(allPanes), "(expect >0: every duplicate claimant)");
// case 3: every pane exists but pid matches NOBODY -> 0 (no live occupant to ventriloquise)
const nobody = new Map();
for (const d of ws) if (d.paneId) nobody.set(d.paneId, -1);
console.log("all panes, pid matches nobody ->", count(nobody), "(expect 0: no occupant)");
// case 4: how many descriptors share a paneId with any other descriptor at all
const dup = new Map();
for (const d of ws) if (d.paneId) dup.set(d.paneId, (dup.get(d.paneId) ?? 0) + 1);
let shared = 0; for (const [, c] of dup) if (c > 1) shared += c;
console.log(`descriptors sharing a paneId with another: ${shared} across ${[...dup.values()].filter(c=>c>1).length} panes`);
