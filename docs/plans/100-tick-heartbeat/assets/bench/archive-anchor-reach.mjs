import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const HOME = process.env.PIJ_HOME ?? join(process.env.HOME, ".pij");
const NOW = Date.now();
const ARCHIVE_AFTER_MS = 48 * 60 * 60 * 1000;

const anchor = (d) => {
  let newest = null;
  for (const s of [d.lastEventAt, d.lastTickAt, d.startedAt]) {
    if (typeof s !== "string") continue;
    const p = Date.parse(s);
    if (!Number.isFinite(p)) continue;
    if (newest === null || p > newest) newest = p;
  }
  return newest;
};
const anchorNoTick = (d) => {
  let newest = null;
  for (const s of [d.lastEventAt, d.startedAt]) {
    if (typeof s !== "string") continue;
    const p = Date.parse(s);
    if (!Number.isFinite(p)) continue;
    if (newest === null || p > newest) newest = p;
  }
  return newest;
};
const terminal = (d) => d.lifecycle === "dissolved" || d.lifecycle === "failed";

let total = 0, term = 0, withTick = 0, heldHotByTick = 0, alreadyArchivable = 0;
const samples = [];
for (const name of readdirSync(HOME)) {
  if (!name.endsWith(".json")) continue;
  let d;
  try { d = JSON.parse(readFileSync(join(HOME, name), "utf8")); } catch { continue; }
  if (!d || typeof d !== "object" || !d.id) continue;
  total++;
  if (!terminal(d)) continue;
  term++;
  if (typeof d.lastTickAt === "string") withTick++;
  const a = anchor(d), b = anchorNoTick(d);
  const archNow = a !== null && (NOW - a) >= ARCHIVE_AFTER_MS;
  const archWithout = b !== null && (NOW - b) >= ARCHIVE_AFTER_MS;
  if (archNow) alreadyArchivable++;
  if (!archNow && archWithout) {
    heldHotByTick++;
    if (samples.length < 5) samples.push({
      id: d.id, lifecycle: d.lifecycle,
      startedAt: d.startedAt, lastEventAt: d.lastEventAt, lastTickAt: d.lastTickAt,
      ageWithTickH: a === null ? null : +((NOW - a) / 3.6e6).toFixed(2),
      ageWithoutTickH: b === null ? null : +((NOW - b) / 3.6e6).toFixed(2),
    });
  }
}
console.log(JSON.stringify({
  pijHome: HOME, totalDescriptors: total, terminalRecords: term,
  terminalWithLastTickAt: withTick,
  archivableToday: alreadyArchivable,
  HELD_HOT_ONLY_BY_lastTickAt: heldHotByTick,
  samples,
}, null, 2));
