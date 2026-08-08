import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const HOME = process.env.PIJ_HOME ?? join(process.env.HOME, ".pij");
const daemonOwns = (h, dm) => dm === "pull" ? false : (h === "claude" || h === "copilot" || h === "codex");

let total = 0, listed = 0, dissolved = 0;
const byHarness = {}, ownedByHarness = {}, ownedLifecycle = {};
let owned = 0;
for (const name of readdirSync(HOME)) {
  if (!name.endsWith(".json")) continue;
  let d; try { d = JSON.parse(readFileSync(join(HOME, name), "utf8")); } catch { continue; }
  if (!d || typeof d !== "object" || !d.id) continue;
  total++;
  if (d.lifecycle === "dissolved") { dissolved++; continue; }   // list() drops these
  listed++;
  const h = d.harness ?? "pi";
  byHarness[h] = (byHarness[h] ?? 0) + 1;
  if (!daemonOwns(h, d.deliveryMode)) continue;
  owned++;
  ownedByHarness[h] = (ownedByHarness[h] ?? 0) + 1;
  const lc = d.lifecycle ?? "(none)";
  ownedLifecycle[lc] = (ownedLifecycle[lc] ?? 0) + 1;
}
console.log(JSON.stringify({
  pijHome: HOME, totalJsonDescriptors: total, dissolvedExcludedByList: dissolved,
  listedWorkingSet: listed, byHarness,
  WRITES_PER_TICK_daemonOwned: owned, ownedByHarness, ownedLifecycle,
}, null, 2));
