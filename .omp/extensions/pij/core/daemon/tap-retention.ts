// pij — which pane-signal tap files are garbage (pij#183).
//
// THE LEAK, and it is not a missing delete. `DaemonTmux.detachPaneTap` already
// removes the tap file — but only when `tapFiles` (an in-memory `Map` on the
// adapter INSTANCE) still holds its path. That map is rebuilt empty on every
// daemon start, and `PaneSignalTracker`'s `retired` diff only ever names panes
// the CURRENT process saw alive. So a tap whose pane retired while the daemon was
// down, or which belonged to any earlier incarnation, has no in-memory entry, is
// never named as retired, and is therefore never deleted BY ANY CODE PATH.
//
// Durable garbage indexed by an ephemeral map. Measured on the live machine
// 2026-08-09: 213 `.raw` files for 28 live panes — 185 orphans, 205 MB of 244 MB,
// the largest 19.4 MB and only 2.1 days old.
//
// The repair is to reconcile against the DURABLE truth instead: the directory
// listing on disk, checked against the panes tmux reports right now. That is the
// only pairing where both sides outlive the process.
//
// WHY THIS IS PURE. The decision is "which of these filenames are garbage", which
// is a set operation over two lists of strings and needs no filesystem at all.
// Keeping it here means every dangerous case — an empty pane list, a name that
// does not round-trip, a file that appeared moments ago — is a table row in a test
// rather than a live experiment against a directory holding 205 MB of real logs.

/** The tap sink for pane `%954` is `_954.raw`: `attachPaneTap` sanitises the pane
 *  id before using it as a filename. The mapping is NOT reversible (`%9`, `$9`
 *  and `-9` all sanitise to `_9`), so orphan detection compares SANITISED names on
 *  both sides rather than trying to recover a pane id from a filename. Collisions
 *  are therefore resolved in the SAFE direction: a file that could belong to a live
 *  pane is kept. */
export function tapFileStem(paneId: string): string {
	return paneId.replaceAll(/[^A-Za-z0-9_-]/g, "_");
}

/** How recently a tap file must have been written to be spared regardless of the
 *  live-pane list.
 *
 *  THE RACE THIS CLOSES: `attachPaneTap` creates the sink file and only then runs
 *  `tmux pipe-pane`. A sweep landing between those two steps sees a file whose pane
 *  is not yet tracked and would delete the sink out from under the pipe that is
 *  about to be attached to it — turning a cleanup into data loss on a LIVE pane.
 *  A file younger than this is never touched, so the sweep can only ever act on
 *  files that have been sitting still far longer than any attach takes. */
export const TAP_ORPHAN_GRACE_MS = 5 * 60_000;

export interface TapSweepInput {
	/** Every filename in `pane-signals/`, as read from disk. */
	readonly files: readonly string[];
	/** Pane ids tmux reports as live RIGHT NOW. */
	readonly livePaneIds: readonly string[];
	/** Last-modified time per filename, for the grace check. */
	readonly modifiedAtMs: (file: string) => number;
	readonly nowMs: number;
}

/** The tap files that are provably garbage: a `.raw` sink whose pane is not live
 *  and which nothing has written to for {@link TAP_ORPHAN_GRACE_MS}.
 *
 *  RETURNS AN EMPTY LIST WHEN THE PANE LIST IS EMPTY, and that is the single most
 *  important line in this module. An empty `livePaneIds` means either "no panes
 *  exist" or "tmux could not be reached" — and those are opposite facts that
 *  arrive as the same value. Acting on the first interpretation deletes EVERY tap
 *  file on the machine, including the live ones, the moment tmux hiccups. The
 *  instrument's failure must not be rendered as the world's emptiness, so the
 *  sweep declines to act rather than guess. A daemon with genuinely zero panes has
 *  nothing worth reclaiming anyway, which is why refusing costs nothing.
 *
 *  Non-`.raw` entries are ignored rather than swept: this directory is not owned
 *  exclusively enough to delete things whose shape we do not recognise. */
export function orphanedTapFiles(input: TapSweepInput): string[] {
	if (input.livePaneIds.length === 0) return [];
	const live = new Set(input.livePaneIds.map(tapFileStem));
	const orphans: string[] = [];
	for (const file of input.files) {
		if (!file.endsWith(".raw")) continue;
		if (live.has(file.slice(0, -".raw".length))) continue;
		const age = input.nowMs - input.modifiedAtMs(file);
		// NaN-safe: an unreadable mtime fails this test and the file is KEPT.
		if (!(age >= TAP_ORPHAN_GRACE_MS)) continue;
		orphans.push(file);
	}
	return orphans;
}
