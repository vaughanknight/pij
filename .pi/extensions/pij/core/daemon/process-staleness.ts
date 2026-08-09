// pij — is the daemon PROCESS running the code now on disk? (s101, follow-up to
// pij#246.)
//
// TWO AXES, TWO LABELS, NEVER ONE FIELD DOING BOTH:
//
//   behind > 0            the DISK is stale relative to the REMOTE   (pij#246)
//   bootHead !== HEAD     the PROCESS is stale relative to the DISK  (this file)
//
// pij#246 catches "you did not pull" — the failure that produced it, where a
// daemon was restarted onto a checkout four commits behind and ran none of the
// three PRs that read merged. It cannot catch "you pulled AFTER starting the
// daemon", which is a different failure with an identical consequence: the
// process is executing source that is not what the tree now says.
//
// That second state arrived within twenty minutes of merging pij#246, CAUSED BY
// merging it: the checkout advanced to pick up the sensor, and the running daemon
// — which predated it — reported nothing, because its checkout was clean and
// current, which is all pij#246 measures. THE SENSOR COULD NOT SEE ITSELF LANDING.
//
// WHY A SHA AND NOT AN mtime. mtime was offered as the cruder-but-cheaper signal.
// It is neither, and it was tested rather than reasoned about:
//   · FALSE NEGATIVE, the one that hurts — `git checkout` only rewrites files it
//     actually changes, so a merge touching `core/archive.ts` leaves `daemon.ts`'s
//     mtime untouched and the sensor reports current while the loaded code changed.
//     Avoiding that needs the max mtime across the WHOLE TREE on every status call,
//     which costs more than the sha, not less.
//   · FALSE POSITIVE — mtime answers "was this file written", not "is the code
//     different": a branch switch and back, or a stray `touch`, rewrites it.
// **mtime collapses "this file was not rewritten" with "the code did not change"**
// — two facts sharing one answer, inside the sensor built to end that class.
//
// THE HONEST CAVEAT, stated here so the next reader does not "fix" it: a HEAD
// comparison OVER-WARNS. A docs-only commit moves HEAD while the process remains
// behaviourally identical, and this will still say the process is not running the
// tree. That is TRUE, and it is a false positive in the SAFE direction. The
// tempting repair — compare only source paths — reintroduces the false negative
// through the back door, because "which paths are source" is exactly the judgement
// that goes stale.

export interface ProcessStalenessFacts {
	/** Short sha the RUNNING daemon booted from, recorded in `daemon.lock`.
	 *  Undefined for a lock written before the field existed. */
	readonly bootHead?: string;
	/** Short sha the checkout is at NOW. Undefined when it could not be read. */
	readonly currentHead?: string;
	/** Commits added to the checkout since boot, when countable. */
	readonly commitsAhead?: number;
}

/** The one-line suffix `pij daemon status` appends, or "" when there is nothing
 *  worth saying.
 *
 *  SILENT ONLY ON A PROVEN MATCH. Every other outcome — no boot head, no current
 *  head, neither — reports UNKNOWN with the reason, because "I could not tell"
 *  and "they agree" are opposite facts and the second is the dangerous one to
 *  invent. A lock written before this field existed is the common case for
 *  exactly one restart, and it must not read as healthy during it. */
export function describeProcessStaleness(facts: ProcessStalenessFacts): string {
	if (facts.bootHead === undefined) {
		return facts.currentHead === undefined
			? "process: UNKNOWN (no boot head recorded and checkout HEAD not readable)"
			: "process: UNKNOWN (daemon lock predates the boot-head field — restart to populate it)";
	}
	if (facts.currentHead === undefined) return "process: UNKNOWN (checkout HEAD not readable)";
	if (facts.bootHead === facts.currentHead) return "";
	const ahead =
		typeof facts.commitsAhead === "number" && facts.commitsAhead > 0
			? ` (${facts.commitsAhead} commit${facts.commitsAhead === 1 ? "" : "s"} newer)`
			: "";
	return `process: running ${facts.bootHead}, checkout now ${facts.currentHead}${ahead}`;
}
