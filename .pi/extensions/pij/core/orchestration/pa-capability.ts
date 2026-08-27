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

import type { SessionDescriptor } from "../types.js";

/** Every verb a PA may be asked to run, classified. TOTAL BY CONTRACT.
 *
 * `refuse` carries WHY, because the refusal is the only place a caller learns
 * the boundary — and a gate whose input is unobservable is the defect this
 * stream exists to prevent (see `pij whoami`, which now projects role and
 * capability so a PA can know before it attempts).
 *
 * `conditional` is the arm that lets this table stay TOTAL while admitting that
 * some verbs cannot be decided here at all. The table sees a verb; it does not
 * see the TARGET. `watchdog watch <my own parent>` and `watchdog watch <a
 * stranger>` are the same verb and opposite answers, so a table that must
 * answer will answer wrongly for one of them — which is exactly `#95`. A
 * `conditional` verb is passed through BOTH seams to the handler that knows the
 * target, and the handler owns the decision. `why` states the CONDITION, so a
 * seat reading `pij whoami` learns the rule rather than discovering it by
 * attempting.
 *
 * This is deliberately NOT a widening to role `pa`: widening buys one role and
 * re-arms the trap PR #71 disarmed. The verb stays classified; only the
 * decision moves to where the facts are.
 */
export type PaCapability =
	| { readonly kind: "allow" }
	| { readonly kind: "conditional"; readonly why: string }
	| { readonly kind: "refuse"; readonly why: string };

const ALLOW: PaCapability = { kind: "allow" };
const refuse = (why: string): PaCapability => ({ kind: "refuse", why });
const conditional = (why: string): PaCapability => ({ kind: "conditional", why });

/** Reasons, named once so the error text cannot drift between seams. */
const LINEAGE = refuse(
	"it changes seat lineage or existence — a PA never creates, adopts, or ends a seat",
);
const OBLIGATION = refuse("it opens or discharges an obligation another party must satisfy");
const TESTIMONY = refuse(
	"it is testimony — a PA may report on ITSELF, never attest for another seat",
);
const GRANT = refuse("it grants or seizes authority");

/** The CONDITION on `watchdog`, stated once. Named here, next to the table it
 *  qualifies (Pattern P5), because three surfaces must say the same thing: the
 *  table, the handler's refusal, and `pij whoami`'s conditional projection.
 *
 *  SPLIT BY ACTION (plan 094), because the actions are not alike and one
 *  sentence covering all of them was wrong in both directions:
 *   - `list` is a genuine pure read over every seat's roster, and it is the only
 *     way a PA can discover WHICH subscriptions it holds. Refusing it made the
 *     resignation below a verb with no way to learn its own argument.
 *   - `unwatch` is self-resignation BY CONSTRUCTION: `--for` is refused for a PA
 *     before the target is ever resolved, so the effective watcher is always the
 *     caller and the write can only ever reach the PA's OWN row. The target
 *     restriction that used to sit on it bought nothing and cost the PA the
 *     ability to release a subscription it created.
 *   - `watch` stays lineage-scoped. Binding a PA to a stranger CREATES a
 *     subscription rather than releasing one, and the ruling widened release and
 *     visibility only.
 *   - everything else — `status`, `pause`, `resume`, `exempt`, `reset`,
 *     `interval`, `disable-all`, `enable-all` — changes supervision policy for a
 *     seat and stays refused for every target. `status` is in that list
 *     deliberately: it READS like a read, but at this seam it falls through to
 *     the shared reconcile-and-write preamble, so permitting it would hand a PA
 *     a persisted write on a stranger's sidecar. */
export const PA_WATCHDOG_CONDITION =
	"a PA may 'list' the watchdog roster for any target, 'unwatch' any target — which removes only its OWN subscription and changes nothing else about that seat — and 'watch' only ITSELF or its own parent; every other watchdog action changes supervision policy for a seat and stays refused";

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
	// `pij queue` is a read view. Its subverbs are classified separately because
	// migrate is non-destructive maintenance while retire is a terminal state
	// change over another seat's mail.
	queue: ALLOW,
	"queue migrate": ALLOW,
	"queue retire": refuse(
		"it retires another seat's mail — a state change a zero-actuator PA reports, never performs (ruled 2026-08-27)",
	),
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
	// The definition mutators moved to ALLOW under the harm test (plan 094): the
	// bin maps add/update/remove to the finer keys below before consulting this
	// table.
	chore: ALLOW,
	// EVERY chore subverb is classified explicitly, because `paCapabilityVerb`
	// now maps all of them.
	"chore run": ALLOW,
	"chore list": ALLOW,
	"chore ack": ALLOW,
	// WIDENED (plan 094, #102). The old gate refused these on an AUTHORITY test:
	// editing a durable roster is authority, so refuse. The ruling replaced that
	// with a HARM test — recording vs deciding, reversible vs terminal — and all
	// three mutators land on the permitted side of both axes. `remove` writes a
	// `removals` record carrying scope, name, reason and timestamp BEFORE it
	// deletes (`core/chores/cli-verbs.ts`), so the act is attributed and the
	// chore is re-addable; `add`/`update` are ordinary roster edits with the
	// same property. Nothing here concludes, attests or ends anything.
	//
	// The seat that DISCOVERS a roster defect was the only one barred from
	// repairing it, so every finding had to be relayed through a prime who might
	// not be reading. That routing cost was the whole complaint.
	//
	// Widest consequence, recorded so it is a decision rather than a discovery:
	// chore scopes union, so a `fleet`-scoped add creates a duty for every seat
	// (plan 094 finding 07).
	"chore add": ALLOW,
	"chore update": ALLOW,
	"chore remove": ALLOW,
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
	// WIDENED (plan 094, #102). Appending to the spine is RECORDING, which the
	// harm test permits — not concluding, which it does not. The entry is
	// attributed and distinguishable at read time: `spine-append` resolves an
	// actor and stamps `actor` + `actorProvenance` under the platform write lock
	// (`core/cli.ts`), and the log is append-only, so nothing a PA writes can
	// overwrite or unsay anything already there.
	//
	// The alternative was worse than the risk. A PA is the seat closest to an
	// observation and was the one seat that could not durably record it, so every
	// finding depended on a prime being attentive at the moment of relay — a
	// durable observation traded for an ephemeral one.
	"spine-append": ALLOW,
	"dispatch-packet": OBLIGATION,
	// CONDITIONAL, not refused: the refusal reason WAS the argument for allowing
	// it. "Acknowledging a brief is the assignee's own act" — and when the PA IS
	// the assignee, that sentence permits rather than forbids (#99). The gate
	// cannot see the dispatch record, so the handler decides; `core/cli.ts`
	// already enforces `self !== dispatch.to` for every role, which is precisely
	// the check this condition needs.
	"ack-dispatch": conditional(
		"a PA may acknowledge a dispatch addressed to ITSELF, and no other seat's",
	),
	// CONDITIONAL, not refused: `watchdog` is one token covering eleven actions
	// over any target. The condition is split by ACTION (see
	// `PA_WATCHDOG_CONDITION`) — a read and a resignation are not the same kind
	// of act as binding a subscription, and refusing them all left a PA unable to
	// remove even a stale subscription it created (#95, then #102).
	// Target-scoped where that matters, action-scoped throughout, and enforced in
	// the handler that can see both.
	watchdog: conditional(PA_WATCHDOG_CONDITION),
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
	switch (capability.kind) {
		case "allow":
			return null;
		// NOT refused AT THE TABLE. The table cannot see the target, so returning
		// a refusal here would refuse the permitted case too — the exact `#95`
		// shape. Both seams therefore let it through, and the handler decides.
		// `paRefusal`'s SIGNATURE is deliberately unchanged: it has four
		// consumers, one of which (`whoami`) has no target concept at all.
		case "conditional":
			return null;
		case "refuse":
			return capability.why;
		default: {
			// PR #71's law: a new arm must break the BUILD here, not silently fall
			// through to a permissive default at runtime.
			const _exhaustive: never = capability;
			return _exhaustive;
		}
	}
}

/** The CONDITION on a conditionally-permitted verb, or null if it is not one.
 *
 * Exists so the handler's refusal and `pij whoami`'s projection read the reason
 * out of the same table the gate consults, rather than restating it. A boundary
 * whose reason is written down twice is a boundary that will one day give two
 * different answers.
 */
export function paConditionalWhy(verb: string): string | null {
	const capability = PA_VERB_CLASSIFICATION[verb];
	return capability !== undefined && capability.kind === "conditional" ? capability.why : null;
}

/** Map a raw `<top> <subverb>` pair to the key this table classifies.
 *
 * EVERY `chore` and `queue` subverb gets its own key. The
 * hand-written mutator list this replaced made `PA_VERB_CLASSIFICATION`'s
 * totality claim **overstated**: the scrape sees only the top-level `chore`
 * token, so a NEW mutating subverb would silently inherit `chore: ALLOW` and
 * the build would stay green — a gate hole opened by adding a verb somewhere
 * else entirely. Mapping every subverb makes each one an explicit decision that
 * `pa-capability.test.ts` can check against the real vocabulary in
 * `core/chores/cli-verbs.ts`.
 *
 * Flags are NOT subverbs: `pij chore --json` and `pij queue --json` keep
 * resolving to their family keys.
 */
export function paCapabilityVerb(top: string, subverb: string | undefined): string {
	if ((top !== "chore" && top !== "queue") || subverb === undefined || subverb.startsWith("-")) {
		return top;
	}
	return `${top} ${subverb}`;
}

/** The descriptor field this gate is KEYED ON, named once so the refusal can
 *  point a reader at something real. `satisfies keyof SessionDescriptor` makes
 *  the compiler the enforcer: rename the field and this stops compiling, rather
 *  than the message quietly naming a field that no longer exists. */
export const PA_ROLE_FIELD = "orchestrationRole" satisfies keyof SessionDescriptor;

/** The refusal text every seam emits, so the message cannot drift between them.
 *
 * NAMES THE FIELD, not just the role. A refusal that reports only its verdict is
 * unfalsifiable to the seat that hits it: it learns THAT it was refused and
 * nothing about WHERE the decision came from, so it cannot distinguish a
 * mis-stamp from a correct refusal and has no repair path but a human. Naming
 * the field — and the read that displays it — turns a dead end into a check the
 * seat can run on itself. `pij state` projects `orchestrationRole` for exactly
 * this reason (plan 084 Phase 1).
 */
export function paRefusalMessage(verb: string, why: string): string {
	return `'${verb}' is not available to a PA — refused by role 'pa' (field: ${PA_ROLE_FIELD}): ${why}. Run 'pij whoami --json' to see your role and capabilities, or 'pij state <id> --json' to read ${PA_ROLE_FIELD} and parent on any seat.`;
}
