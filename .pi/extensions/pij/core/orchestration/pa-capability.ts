// pij-orchestration — PA capability boundary (plan 078).
//
// A PA (Prime Assistant) is READ-ONLY BY CONSTRUCTION, not by prompt. It runs on
// a cheap fast model doing a prime's maintenance chores, so its boundary cannot
// depend on it choosing well — the gate has to refuse it.
//
// ONE PREDICATE, TWO SEAMS. There is no single chokepoint: `core/cli.ts
// dispatch()` covers every PARSED verb, but `spawn`/`adopt`/`close`/
// `orchestration` branch on raw `process.argv[2]` in the bin and return BEFORE
// core parse runs. A gate at dispatch() alone would refuse `task set` and
// silently permit `close` — and it would LOOK complete. **A verb list you can
// tick is the most believable kind of incomplete gate.** So both seams consult
// this one predicate, and `PA_VERB_CLASSIFICATION` below is total: the suite
// fails if any verb in either file is unclassified.

/** Every verb a PA may be asked to run, classified. TOTAL BY CONTRACT.
 *
 * `refuse` carries WHY, because the refusal is the only place a caller learns
 * the boundary — and a gate whose input is unobservable is the defect this
 * stream exists to prevent (see `pij whoami`, which now projects role and
 * capability so a PA can know before it attempts).
 */
export type PaCapability =
	| { readonly kind: "allow" }
	| { readonly kind: "refuse"; readonly why: string };

const ALLOW: PaCapability = { kind: "allow" };
const refuse = (why: string): PaCapability => ({ kind: "refuse", why });

/** Reasons, named once so the error text cannot drift between seams. */
const LINEAGE = refuse(
	"it changes seat lineage or existence — a PA never creates, adopts, or ends a seat",
);
const OBLIGATION = refuse("it opens or discharges an obligation another party must satisfy");
const TESTIMONY = refuse(
	"it is testimony — a PA may report on ITSELF, never attest for another seat",
);
const GRANT = refuse("it grants or seizes authority");

/** The complete verb surface, both files. Adding a verb without adding it here
 *  fails `pa-capability.test.ts`, which is the whole point: drift becomes loud
 *  rather than silent, and that property survives its author leaving. */
export const PA_VERB_CLASSIFICATION: Readonly<Record<string, PaCapability>> = {
	// ── lineage / seat control (bin seam: raw argv, pre-parse) ────────────────
	spawn: LINEAGE,
	adopt: LINEAGE,
	close: LINEAGE,
	revive: LINEAGE,
	orchestration: GRANT,
	link: LINEAGE,
	// ── obligation and authority ─────────────────────────────────────────────
	"task-set": OBLIGATION,
	"task-close": OBLIGATION,
	// ── testimony ────────────────────────────────────────────────────────────
	"state-verify": TESTIMONY,
	attest: TESTIMONY,
	canary: TESTIMONY,
	// `state-set` and `report-now` are FIRST-PERSON by construction (they resolve
	// the caller's own seat), so they are allowed — the PA's own card is
	// explicitly permitted. Cross-seat status is impossible through them, which
	// is why they need no gate here rather than being trusted not to be misused.
	"state-set": ALLOW,
	"report-now": ALLOW,
	"state-clear": ALLOW,
	// ── reads: explicitly allowed and must not regress ────────────────────────
	whoami: ALLOW,
	list: ALLOW,
	tree: ALLOW,
	tail: ALLOW,
	state: ALLOW,
	path: ALLOW,
	sessions: ALLOW,
	models: ALLOW,
	anomalies: ALLOW,
	"node-show": ALLOW,
	"spine-events": ALLOW,
	"spine-render": ALLOW,
	"project-list": ALLOW,
	"project-show": ALLOW,
	"fence-show": ALLOW,
	phonehome: ALLOW,
	focus: ALLOW,
	// ── bin early-branch verbs the exhaustive test caught on its first run ────
	// It found these before a human did, which is the test earning its keep.
	inbox: ALLOW,
	// COARSE ON PURPOSE, and the coarseness is recorded rather than hidden: the
	// bin branches on the top-level token, so `agent` cannot be split here into
	// its read subverbs (list/show) and its seat-creating ones (run/spawn). A PA
	// does chores by reading and relaying and has no need to run agent packs, so
	// refusing the family is the safe side of a granularity limit we cannot fix
	// at this seam. If a PA ever needs `agent list`, split it THEN — do not
	// pre-emptively widen a hole for a need nobody has.
	agent: LINEAGE,
	agents: LINEAGE,
	// Chore reads/runs plus ack are the PA's deterministic maintenance surface.
	// Definition mutation stays outside the read-only PA boundary; the bin maps
	// add/remove to the finer keys below before consulting this table.
	chore: ALLOW,
	"chore add": refuse("it edits the durable duty roster; a PA may run/list/ack chores"),
	"chore remove": refuse("it edits the durable duty roster; a PA may run/list/ack chores"),
	// `pij agent report` — first-person, and unreachable for a PA anyway because
	// the `agent` family above is refused. Classified so the table stays total.
	report: ALLOW,
	// Second sweep the test forced — every one of these is a bin early-branch I
	// would not have thought to enumerate by hand, which is the argument for
	// scraping the source rather than listing verbs from memory.
	identity: ALLOW,
	"compact-self": ALLOW,
	unwatch: ALLOW,
	// Daemon lifecycle and the operator bridge are machine-wide, not seat-scoped:
	// a PA restarting the daemon or reconfiguring the Telegram bridge reaches
	// every seat on the box and the human's phone. Well outside a chore boundary.
	daemon: refuse("it controls machine-wide daemon lifecycle, not this seat"),
	telegram: refuse("it reconfigures the operator bridge, which reaches the human directly"),
	// ── messaging: a PA relays, so send is its whole job ──────────────────────
	send: ALLOW,
	watch: ALLOW,
	// ── background work on its own behalf ─────────────────────────────────────
	"bg-create": ALLOW,
	"bg-list": ALLOW,
	"bg-tail": ALLOW,
	"bg-kill": ALLOW,
	"bg-deliver": ALLOW,
	// ── writes a PA must not make ────────────────────────────────────────────
	"project-create": refuse("it creates governance records"),
	"project-set": refuse("it edits governance records"),
	"stream-create": LINEAGE,
	"stream-close": LINEAGE,
	"fence-set": refuse("it declares a construction fence"),
	"spine-append": refuse("it writes directly to the spine"),
	"dispatch-packet": OBLIGATION,
	"ack-dispatch": refuse("acknowledging a brief is the assignee's own act"),
	watchdog: refuse("it changes supervision policy for a seat"),
};

/** Is this caller barred from this verb?
 *
 * Returns the refusal reason, or null when permitted. Only a `pa`-roled caller
 * is ever refused: every other role keeps today's behaviour exactly, so this
 * cannot regress an existing seat.
 *
 * An UNKNOWN verb is permitted rather than refused. That is deliberate and is
 * the safer default here: this gate is a capability boundary for a cooperative
 * internal seat, not a security perimeter against an adversary, and refusing
 * unknown verbs would break every future verb until someone remembered this
 * file. The exhaustive test — not the runtime default — is what keeps the table
 * total, so the failure lands on the author at build time instead of on a PA at
 * runtime.
 */
export function paRefusal(role: string | null, verb: string): string | null {
	if (role !== "pa") return null;
	const capability = PA_VERB_CLASSIFICATION[verb];
	if (capability === undefined) return null;
	return capability.kind === "refuse" ? capability.why : null;
}

export function paCapabilityVerb(top: string, subverb: string | undefined): string {
	if (top === "chore" && (subverb === "add" || subverb === "remove")) {
		return `chore ${subverb}`;
	}
	return top;
}

/** The refusal text every seam emits, so the message cannot drift between them. */
export function paRefusalMessage(verb: string, why: string): string {
	return `'${verb}' is not available to a PA (role 'pa'): ${why}. Run 'pij whoami --json' to see your role and capabilities.`;
}
