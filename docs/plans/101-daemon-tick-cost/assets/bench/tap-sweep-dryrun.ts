// s101 / pij#183 — DRY RUN of the orphaned-tap sweep against the real directory.
//
// Deletes nothing. Answers the only question that matters before a sweep that
// removes files: would it delete a tap belonging to a pane that is alive right
// now? That count must be ZERO, and it is asserted here rather than eyeballed.
//
// Usage: npx tsx docs/plans/101-daemon-tick-cost/assets/bench/tap-sweep-dryrun.ts

import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { orphanedTapFiles, tapFileStem } from "../../../../../.pi/extensions/pij/core/daemon/tap-retention.js";

const dir = join(process.env.PIJ_HOME ?? join(homedir(), ".pij"), "pane-signals");
const files = readdirSync(dir);
const live = execFileSync("tmux", ["list-panes", "-a", "-F", "#{pane_id}"], { encoding: "utf8" })
	.trim()
	.split("\n")
	.filter((line) => line.length > 0);

const size = (file: string): number => {
	try {
		return statSync(join(dir, file)).size;
	} catch {
		return 0;
	}
};

const orphans = orphanedTapFiles({
	files,
	livePaneIds: live,
	modifiedAtMs: (file) => {
		try {
			return statSync(join(dir, file)).mtimeMs;
		} catch {
			return Number.NaN;
		}
	},
	nowMs: Date.now(),
});

const liveStems = new Set(live.map(tapFileStem));
// THE SAFETY ASSERTION: not "did it find orphans" but "did it spare every live
// tap". A sweep that deletes nothing passes the first and is useless; a sweep
// that deletes everything passes the first and is destructive.
const liveTapsWronglySwept = orphans.filter((file) => liveStems.has(file.slice(0, -".raw".length)));

// THE EXACT PARTITION. Every file in the directory lands in exactly one bucket,
// and the buckets must sum to the directory. A bytes figure alone ("205MB") says
// nothing about WHICH files; this says which, why, and that nothing was missed or
// double-counted. Asserted as an equality, not as "no live taps were touched".
const sweptSet = new Set(orphans);
const keptLive: string[] = [];
const keptYoung: string[] = [];
const keptUnrecognised: string[] = [];
for (const file of files) {
	if (sweptSet.has(file)) continue;
	if (!file.endsWith(".raw")) keptUnrecognised.push(file);
	else if (liveStems.has(file.slice(0, -".raw".length))) keptLive.push(file);
	else keptYoung.push(file);
}
const partitionTotal = orphans.length + keptLive.length + keptYoung.length + keptUnrecognised.length;
const partitionIsExhaustive = partitionTotal === files.length;
// Every live pane's tap must be present and kept — the sweep must not merely
// avoid deleting them, it must account for all of them.
const liveTapsAccountedFor = keptLive.length === liveStems.size;

console.log(
	JSON.stringify(
		{
			dir,
			totalFiles: files.length,
			livePanes: live.length,
			wouldSweep: orphans.length,
			wouldReclaimMB: +(orphans.reduce((a, f) => a + size(f), 0) / 1048576).toFixed(1),
			wouldKeep: files.length - orphans.length,
			partition: {
				swept: orphans.length,
				keptLivePane: keptLive.length,
				keptWithinGrace: keptYoung.length,
				keptUnrecognised: keptUnrecognised.length,
				total: partitionTotal,
				EXHAUSTIVE: partitionIsExhaustive,
				LIVE_TAPS_ALL_ACCOUNTED_FOR: liveTapsAccountedFor,
			},
			keptMB: +(
				files.filter((f) => !orphans.includes(f)).reduce((a, f) => a + size(f), 0) / 1048576
			).toFixed(1),
			LIVE_TAPS_WRONGLY_SWEPT: liveTapsWronglySwept.length,
		},
		null,
		1,
	),
);
if (liveTapsWronglySwept.length > 0 || !partitionIsExhaustive || !liveTapsAccountedFor) {
	process.exit(1);
}
