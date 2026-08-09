import { describe, expect, it } from "vitest";

import { fakeProcessSnapshot, fakeProcessSnapshotUnavailable } from "../adapters/fakes.js";
import {
	activityCredibility,
	activityOf,
	BADGE_SEVERITY,
	badgeOf,
	classifyDeathReason,
	isStalled,
	isWorking,
	liveness,
	resolveAgentLiveness,
	STALE_AFTER_MS,
	systemStateOf,
} from "./state.js";
import { SEMANTIC_STATES, SYSTEM_STATES } from "./types.js";

describe("isWorking", () => {
	it("treats in-progress/reviewing as working", () => {
		expect(isWorking("in-progress")).toBe(true);
		expect(isWorking("reviewing")).toBe(true);
	});
	it("treats idle/paused/complete/error as static", () => {
		expect(isWorking("idle")).toBe(false);
		expect(isWorking("paused")).toBe(false);
		expect(isWorking("complete")).toBe(false);
		expect(isWorking("error")).toBe(false);
	});
});

describe("liveness", () => {
	it("dead when pid is gone", () => {
		expect(liveness(false, 10)).toBe("dead");
	});
	it("active when pid alive + recent event", () => {
		expect(liveness(true, 5_000)).toBe("active");
	});
	// `stale` means "should be making progress but isn't" (a stall — mirrors
	// isStalled), NOT merely "quiet". It only fires for a WORKING peer gone silent.
	it("stale when WORKING + newest event too old (a stall)", () => {
		expect(liveness(true, STALE_AFTER_MS + 1, STALE_AFTER_MS, true)).toBe("stale");
	});
	it("stale when WORKING + no events", () => {
		expect(liveness(true, null, STALE_AFTER_MS, true)).toBe("stale");
	});
	it("active when WORKING but event is recent (making progress)", () => {
		expect(liveness(true, 5_000, STALE_AFTER_MS, true)).toBe("active");
	});
	// The fix (INS-001): a bound, pid-alive, IDLE/done peer that is simply quiet
	// past the threshold is reachable — it must read `active`, never `stale`.
	it("active (NOT stale) when an idle/done peer is quiet past the threshold", () => {
		expect(liveness(true, STALE_AFTER_MS + 1)).toBe("active");
	});
	it("active (NOT stale) when an idle peer has no events at all", () => {
		expect(liveness(true, null)).toBe("active");
	});
});

describe("isStalled", () => {
	it("flags a working session whose newest event is stale", () => {
		expect(isStalled("in-progress", STALE_AFTER_MS + 1)).toBe(true);
		expect(isStalled("in-progress", null)).toBe(true);
	});
	it("does not flag a working session with fresh events", () => {
		expect(isStalled("reviewing", 1_000)).toBe(false);
	});
	it("never flags a static session", () => {
		expect(isStalled("idle", null)).toBe(false);
	});
});

describe("activityOf", () => {
	it("working state → working (regardless of activity ts)", () => {
		expect(activityOf("working", true)).toBe("working");
		expect(activityOf("working", false)).toBe("working");
	});
	it("idle after having worked → done", () => {
		expect(activityOf("idle", true)).toBe("done");
	});
	it("idle and never active → idle", () => {
		expect(activityOf("idle", false)).toBe("idle");
		expect(activityOf(undefined, false)).toBe("idle");
	});
});

describe("classifyDeathReason", () => {
	it("treats transient provider quota/rate-limit text as non-fatal unknown", () => {
		const transientPanes = [
			"API Error: 429 Too Many Requests",
			"provider overloaded, retrying",
			"API Error: 529 overloaded",
			'{"error":{"code":"resource_exhausted","message":"rate limit exceeded"}}',
			'{"error":{"code":"rate_limit_exceeded"}}',
		];

		for (const pane of transientPanes) {
			expect(classifyDeathReason(pane)).toBe("unknown");
		}
	});

	it("classifies terminal quota/billing text as quota", () => {
		const terminalPanes = [
			"insufficient credit to continue", // anchored: insufficient + balance noun
			"prepaid balance exhausted", // exhausted signal next to a billing noun
		];

		for (const pane of terminalPanes) {
			expect(classifyDeathReason(pane)).toBe("quota");
		}
	});

	// Quota-classifier honesty (#5, task 1.1): bare billing-domain vocabulary —
	// the kind a billing/accounting repo prints in its OWN output — must never be
	// mistaken for a provider quota death. No error frame, no anchored phrase → unknown.
	it("returns unknown for billing-domain prose with no real error frame", () => {
		const prose = [
			"split billing",
			"credit memo",
			"insufficient line items", // NOT "insufficient credits"
			"billing is not enabled for this workspace", // bare billing, no error frame
			"reconcile the outstanding balance",
		];

		for (const pane of prose) {
			expect(classifyDeathReason(pane)).toBe("unknown");
		}
	});

	// Residual false-positive F3 (#5, task 1.6): classification is scoped to the
	// pane TAIL (last error region). A real provider-error string sitting HIGHER in
	// scrollback (e.g. a billing repo that printed `402 insufficient credits` in its
	// own output earlier) is NOT this session's death reason.
	it("does not classify quota from a real error string higher in scrollback (tail-scoped)", () => {
		const pane = [
			"API Error: 402 insufficient credits",
			...Array(25).fill("regular build output line"),
			"$ ready",
		].join("\n");
		expect(classifyDeathReason(pane)).toBe("unknown");
	});

	// 1.6 ordering: a clean `[exited]` death must read `dead`, not `quota`, even when
	// billing text sits higher in scrollback (quota-before-DEAD_RE ordering addressed
	// via tail-scoping — the high-scrollback billing string is out of the tail).
	it("returns dead for a clean [exited] even when billing text sits higher in scrollback", () => {
		const pane = [
			"API Error: 402 insufficient credits",
			...Array(25).fill("regular build output line"),
			"[exited]",
		].join("\n");
		expect(classifyDeathReason(pane)).toBe("dead");
	});

	// The pincer's other jaw: a GENUINE terminal quota error in the tail still → quota.
	it("still classifies a real terminal quota error in the pane tail as quota", () => {
		const pane = [
			...Array(25).fill("regular build output line"),
			"Error: prepaid credit balance exhausted — add credits at https://console.example.ai/billing",
		].join("\n");
		expect(classifyDeathReason(pane)).toBe("quota");
	});
});

// ─── plan 054 Phase 2 T003 — 7-state mechanical axis + worst-first badge ────

describe("systemStateOf (AC-04 — mechanical truth, never a guess)", () => {
	const bound = {
		lifecycle: "bound" as const,
		pidAlive: true,
		paneSuspended: false,
		latestEventAgeMs: 1_000,
	};

	it("a just-spawned unbound node reads starting (pending lifecycle)", () => {
		expect(systemStateOf({ lifecycle: "pending", pidAlive: true, latestEventAgeMs: null })).toBe(
			"starting",
		);
	});

	it("starting HOLDS through ready lifecycle until the bind verdict", () => {
		expect(systemStateOf({ lifecycle: "ready", pidAlive: true, latestEventAgeMs: null })).toBe(
			"starting",
		);
	});

	it("bound + working + fresh events reads working", () => {
		expect(systemStateOf({ ...bound, state: "working" })).toBe("working");
	});

	it("bound + working but silent past the stale threshold reads stalled", () => {
		expect(
			systemStateOf({ ...bound, state: "working", latestEventAgeMs: STALE_AFTER_MS + 1 }),
		).toBe("stalled");
	});

	it("bound + working with NO event telemetry at all reads stalled", () => {
		expect(systemStateOf({ ...bound, state: "working", latestEventAgeMs: null })).toBe("stalled");
	});

	it("bound + idle reads idle", () => {
		expect(systemStateOf({ ...bound, state: "idle" })).toBe("idle");
	});

	it("a gone pid reads dead — even while lifecycle still says pending", () => {
		expect(systemStateOf({ lifecycle: "pending", pidAlive: false, latestEventAgeMs: null })).toBe(
			"dead",
		);
	});

	it("a suspended-but-alive pane reads stopped — even mid-work", () => {
		expect(systemStateOf({ ...bound, paneSuspended: true, state: "working" })).toBe("stopped");
	});

	it("suspension beats the starting hold (definite telemetry wins)", () => {
		expect(
			systemStateOf({
				lifecycle: "pending",
				pidAlive: true,
				paneSuspended: true,
				latestEventAgeMs: null,
			}),
		).toBe("stopped");
	});

	it("missing pid telemetry reads unknown — never inferred dead", () => {
		expect(systemStateOf({ ...bound, pidAlive: null, state: "working" })).toBe("unknown");
	});

	it("bound + pid alive but NO state telemetry reads unknown — never inferred idle", () => {
		expect(systemStateOf({ lifecycle: "bound", pidAlive: true, latestEventAgeMs: null })).toBe(
			"unknown",
		);
	});

	it("a legacy node with no lifecycle and no state telemetry reads unknown", () => {
		expect(systemStateOf({ pidAlive: true, latestEventAgeMs: null })).toBe("unknown");
	});

	it("dead beats stopped (a gone pid is the stronger verdict)", () => {
		expect(
			systemStateOf({ ...bound, pidAlive: false, paneSuspended: true, state: "working" }),
		).toBe("dead");
	});

	it("honors a caller-supplied stale threshold", () => {
		expect(
			systemStateOf({ ...bound, state: "working", latestEventAgeMs: 500, staleAfterMs: 100 }),
		).toBe("stalled");
		expect(
			systemStateOf({ ...bound, state: "working", latestEventAgeMs: 500, staleAfterMs: 1_000 }),
		).toBe("working");
	});
});

describe("badgeOf (AC-05 — worst-first across both axes)", () => {
	it("a multi-assignment node badges its WORST semantic state (done on A, blocked on B)", () => {
		expect(badgeOf("idle", ["done", "blocked"])).toBe("blocked");
	});

	it("a dead system beats every semantic state", () => {
		expect(badgeOf("dead", ["blocked", "failed", "question"])).toBe("dead");
	});

	it("failed work beats a stalled system; stalled beats blocked", () => {
		expect(badgeOf("stalled", ["failed"])).toBe("failed");
		expect(badgeOf("stalled", ["blocked", "waiting"])).toBe("stalled");
	});

	it("question outranks hold, waiting and every calm state", () => {
		expect(badgeOf("working", ["question", "hold", "waiting", "ready"])).toBe("question");
	});

	it("with no open assignments the badge is the system state itself", () => {
		expect(badgeOf("working", [])).toBe("working");
		expect(badgeOf("idle", [])).toBe("idle");
	});

	it("all-done work on an idle node badges done (informative over idle)", () => {
		expect(badgeOf("idle", ["done"])).toBe("done");
	});

	it("an unknown system still surfaces above calm semantic states", () => {
		expect(badgeOf("unknown", ["waiting"])).toBe("unknown");
	});

	it("no system verdict at all (legacy descriptor) falls back to the semantic worst", () => {
		expect(badgeOf(undefined, ["waiting", "ready"])).toBe("waiting");
	});

	it("nothing known at all is an honest unknown", () => {
		expect(badgeOf(undefined, [])).toBe("unknown");
	});

	it("BADGE_SEVERITY covers BOTH ruled vocabularies completely, no extras", () => {
		expect([...BADGE_SEVERITY].sort()).toEqual([...SEMANTIC_STATES, ...SYSTEM_STATES].sort());
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// s095 — the identity ladder (AC-1..AC-6, AC-12, AC-13).
//
// DECLARED EXCEPTION TO FAIL-FIRST. These are NEW-API tests: `resolveAgentLiveness`
// does not exist on the pre-fix tree, so they fail to COMPILE there rather than
// failing an assertion — which is not evidence of anything. The behavioural
// evidence for this stream lives in `core/daemon/death-reconciler.test.ts`, was
// run against the unfixed tree, and is pasted into the execution log.
//
// Every fixture below is a MEASURED case from the research dossier, not an
// invented one.
describe("resolveAgentLiveness — bounded subtree, matched on identity", () => {
	const SEAT_ID = "9f3a1c2e-0000-4000-8000-000000000001";
	const OTHER_ID = "9f3a1c2e-0000-4000-8000-000000000002";
	const seat = (over: Record<string, unknown> = {}) => ({
		pid: 44535,
		harness: "copilot" as const,
		harnessSessionId: SEAT_ID,
		...over,
	});

	// AC-1 — `pij-annual-lemur`: a fresh `--session-id` spawn lands the agent AT
	// the registry pid. 16 of 23 measured seats look like this.
	it("AC-1 finds an agent AT the registry pid (depth 0)", () => {
		const probe = resolveAgentLiveness(
			seat(),
			fakeProcessSnapshot([
				{ pid: 44535, command: `node /opt/copilot/bin/copilot --yolo --session-id ${SEAT_ID}` },
			]),
		);
		expect(probe.liveness).toBe("alive");
		expect(probe.cause).toBe("session-id-match");
		expect(probe.agentPid).toBe(44535);
	});

	// AC-2 — `pij-tiny-bug`: a `--resume` re-launch runs under a shell, so the
	// agent is one level BELOW the registry pid. 7 of 23 measured seats. A probe
	// hardcoded at either depth is blind to one of these two tests.
	it("AC-2 finds an agent one level BELOW the registry pid (depth 1)", () => {
		const probe = resolveAgentLiveness(
			seat({ pid: 65242 }),
			fakeProcessSnapshot([
				{ pid: 65242, command: "-zsh" },
				{
					pid: 65349,
					ppid: 65242,
					command: `node /opt/copilot/bin/copilot --yolo --resume=${SEAT_ID}`,
				},
			]),
		);
		expect(probe.liveness).toBe("alive");
		expect(probe.agentPid).toBe(65349);
	});

	it("finds a claude agent below the registry pid too — the split is the spawn path, not the harness", () => {
		const probe = resolveAgentLiveness(
			{ pid: 39585, harness: "claude", harnessSessionId: SEAT_ID },
			fakeProcessSnapshot([
				{ pid: 39585, command: "-zsh" },
				{
					pid: 39670,
					ppid: 39585,
					command: `claude --dangerously-skip-permissions --resume ${SEAT_ID}`,
				},
			]),
		);
		expect(probe.liveness).toBe("alive");
	});

	// AC-3 — the string that destroyed a live pane in pij#142: a supervisor read
	// `-zsh` on a registry pid and concluded the agent was gone. Here it is the
	// CORRECT answer, because there is genuinely nothing below it — which is the
	// point: the same observation is only trustworthy when the walk was done.
	it("AC-3 reports absent for a bare shell with no harness descendant", () => {
		const probe = resolveAgentLiveness(
			seat({ pid: 65242 }),
			fakeProcessSnapshot([{ pid: 65242, command: "-zsh" }]),
		);
		expect(probe.liveness).toBe("absent");
		expect(probe.cause).toBe("no-harness-process");
	});

	// AC-4 — `pij-weak-gurgeh`. Pid 952 was recycled across the 2026-08-08 reboot
	// to a system daemon. `isAlive(952)` returns `true` and always will, so that
	// seat could NEVER be declared dead — the false-ALIVE direction, which
	// neither issue claimed and which opens widest at a reboot.
	it("AC-4 reports absent for a recycled pid holding an unrelated process", () => {
		const probe = resolveAgentLiveness(
			{ pid: 952, harness: "claude", harnessSessionId: SEAT_ID },
			fakeProcessSnapshot([
				{
					pid: 952,
					command: "/Library/Intune/Microsoft Intune Agent.app/Contents/MacOS/IntuneMdmDaemon",
					startedAtMs: Date.parse("2026-08-08T00:20:51.000Z"),
				},
			]),
		);
		expect(probe.liveness).toBe("absent");
		expect(probe.cause).toBe("no-harness-process");
	});

	// AC-5 — exact negative. A harness process that names ANOTHER seat is the one
	// kind of evidence strong enough to call a running process absent.
	it("AC-5 reports absent when the only harness process belongs to another seat", () => {
		const probe = resolveAgentLiveness(
			seat(),
			fakeProcessSnapshot([
				{ pid: 44535, command: `node /opt/copilot/bin/copilot --session-id ${OTHER_ID}` },
			]),
		);
		expect(probe.liveness).toBe("absent");
		expect(probe.cause).toBe("foreign-session-id");
	});

	it("still reports alive when the subtree holds this seat's agent AND a foreign one", () => {
		const probe = resolveAgentLiveness(
			seat(),
			fakeProcessSnapshot([
				{ pid: 44535, command: "-zsh" },
				{
					pid: 44600,
					ppid: 44535,
					command: `node /opt/copilot/bin/copilot --session-id ${OTHER_ID}`,
				},
				{
					pid: 44601,
					ppid: 44535,
					command: `node /opt/copilot/bin/copilot --session-id ${SEAT_ID}`,
				},
			]),
		);
		expect(probe.liveness).toBe("alive");
		expect(probe.agentPid).toBe(44601);
	});

	// AC-6 — we could not look. Never `absent`: an empty answer and an answer of
	// emptiness are different facts, and collapsing them is this stream's defect.
	it("AC-6 reports unknown when the process table could not be captured", () => {
		const probe = resolveAgentLiveness(seat(), fakeProcessSnapshotUnavailable("ps: exit 1"));
		expect(probe.liveness).toBe("unknown");
		expect(probe.cause).toBe("probe-unavailable");
	});

	// AC-12 — START TIME NEVER DEMOTES. A revived agent legitimately starts after
	// its descriptor was written, so a start-time plausibility check can only
	// corroborate a match. The previous draft of this ladder could manufacture a
	// false `absent` here.
	it("AC-12 keeps alive when the agent started AFTER the descriptor's startedAt", () => {
		const probe = resolveAgentLiveness(
			seat(),
			fakeProcessSnapshot([
				{
					pid: 44535,
					command: `node /opt/copilot/bin/copilot --session-id ${SEAT_ID}`,
					startedAtMs: Date.parse("2026-08-08T09:00:00.000Z"),
				},
			]),
		);
		expect(probe.liveness).toBe("alive");
	});

	// AC-13 — a truncated command line is MISSING EVIDENCE, not evidence of
	// absence. This is why `ps -ww` is mandatory upstream, and why the classifier
	// refuses to reason from a line it knows it could not read.
	it("AC-13 reports unknown for a truncated harness command line", () => {
		const probe = resolveAgentLiveness(
			seat(),
			fakeProcessSnapshot([
				{ pid: 44535, command: "node /opt/copilot/bin/copilot --yolo --ses", truncated: true },
			]),
		);
		expect(probe.liveness).toBe("unknown");
		expect(probe.cause).toBe("identity-indeterminate");
	});

	it("prefers an exact id match over a truncated sibling", () => {
		const probe = resolveAgentLiveness(
			seat(),
			fakeProcessSnapshot([
				{ pid: 44535, command: "-zsh" },
				{
					pid: 44600,
					ppid: 44535,
					command: "node /opt/copilot/bin/copilot --ses",
					truncated: true,
				},
				{
					pid: 44601,
					ppid: 44535,
					command: `node /opt/copilot/bin/copilot --session-id ${SEAT_ID}`,
				},
			]),
		);
		expect(probe.liveness).toBe("alive");
	});

	// A harness process with no id on its command line and a seat that HAS one:
	// nothing to compare, so the answer is the non-destructive one. Both measured
	// live seats (`pij-mental-dajeil`, `pij-related-koala`) look exactly like this.
	it("reports alive for a harness process carrying no session id to compare", () => {
		const probe = resolveAgentLiveness(
			{ pid: 39585, harness: "claude", harnessSessionId: SEAT_ID },
			fakeProcessSnapshot([
				{ pid: 39585, command: "-zsh" },
				{ pid: 39670, ppid: 39585, command: "claude --dangerously-skip-permissions --resume" },
			]),
		);
		expect(probe.liveness).toBe("alive");
		expect(probe.cause).toBe("harness-process-present");
	});

	// PARSE, DO NOT SUBSTRING. A worktree path containing a uuid must not be read
	// as an identity claim — that would let one seat's cwd vouch for another
	// seat's liveness, and the failure would look like a success.
	it("does not accept a session id that merely appears in a PATH", () => {
		const probe = resolveAgentLiveness(
			seat(),
			fakeProcessSnapshot([
				{
					pid: 44535,
					command: `node /opt/copilot/bin/copilot --session-id ${OTHER_ID} --cwd /w/${SEAT_ID}`,
				},
			]),
		);
		expect(probe.liveness).toBe("absent");
		expect(probe.cause).toBe("foreign-session-id");
	});

	it("matches the seat's PLANNED session id before it has been bound", () => {
		const probe = resolveAgentLiveness(
			{ pid: 44535, harness: "copilot", plannedHarnessSessionId: SEAT_ID },
			fakeProcessSnapshot([
				{ pid: 44535, command: `node /opt/copilot/bin/copilot --session-id ${SEAT_ID}` },
			]),
		);
		expect(probe.liveness).toBe("alive");
	});

	it("accepts omp for a pi seat — same HarnessKind, different binary", () => {
		const probe = resolveAgentLiveness(
			{ pid: 700, harness: "pi" },
			fakeProcessSnapshot([
				{ pid: 700, command: "-zsh" },
				{ pid: 701, ppid: 700, command: "/usr/local/bin/omp --resume" },
			]),
		);
		expect(probe.liveness).toBe("alive");
	});

	it("reports absent when the registry pid is not in the table at all", () => {
		const probe = resolveAgentLiveness(
			seat(),
			fakeProcessSnapshot([{ pid: 1, command: "/sbin/launchd" }]),
		);
		expect(probe.liveness).toBe("absent");
	});

	it("does not walk past the depth bound", () => {
		const probe = resolveAgentLiveness(
			seat({ pid: 10 }),
			fakeProcessSnapshot([
				{ pid: 10, command: "-zsh" },
				{ pid: 11, ppid: 10, command: "-zsh" },
				{ pid: 12, ppid: 11, command: `node /opt/copilot/bin/copilot --session-id ${SEAT_ID}` },
			]),
			{ maxDepth: 1 },
		);
		expect(probe.liveness).toBe("absent");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// s095 — activityCredibility (AC-14..AC-16). PUBLISHED CONTRACT, consumed by
// s097: `docs/plans/095-liveness-fields/activity-credibility.contract.md`.
// The `cause` values and the 9-rule precedence order are BYTE-STABLE.
//
// NEW-API, same declared exception as above.
describe("activityCredibility — may this activity be rendered as CURRENT?", () => {
	const TERMINAL_AT = "2026-08-07T23:14:05.850Z";
	const absentTerminal = {
		disposition: "unrequested-by-pij",
		observedAt: TERMINAL_AT,
		evidence: "pid-missing",
	} as const;

	it("rule 1 — dissolved outranks everything", () => {
		const result = activityCredibility({
			lifecycle: "dissolved",
			state: "working",
			agentLiveness: "alive",
		});
		expect(result).toMatchObject({ verdict: "superseded", cause: "dissolved" });
	});

	// AC-16 — a FRESH observation beats a DURABLE one, in both directions. This
	// is the rule that makes the predicate safe to ship at all: 15 seats carry a
	// latched `terminal` today and two of them are alive right now.
	it("AC-16 a fresh alive probe outranks a stored terminal record", () => {
		const result = activityCredibility({
			state: "working",
			terminal: absentTerminal,
			agentLiveness: "alive",
		});
		expect(result).toMatchObject({ verdict: "current", cause: "observed-live" });
	});

	it("rule 3 — a fresh absent probe supersedes even with no terminal record", () => {
		const result = activityCredibility({ state: "working", agentLiveness: "absent" });
		expect(result).toMatchObject({ verdict: "superseded", cause: "agent-absent" });
	});

	it("rule 4 — an unavailable terminal record is UNKNOWN, never superseded", () => {
		const result = activityCredibility({
			state: "working",
			terminal: {
				disposition: "unavailable",
				observedAt: TERMINAL_AT,
				evidence: "observation-unavailable",
			},
		});
		expect(result).toMatchObject({
			verdict: "unknown",
			cause: "probe-unavailable",
			asOf: TERMINAL_AT,
		});
	});

	it("rule 5 — a requested close is distinguishable from an inferred absence", () => {
		const result = activityCredibility({
			state: "working",
			terminal: { disposition: "requested", observedAt: TERMINAL_AT, evidence: "pid-missing" },
		});
		expect(result).toMatchObject({ verdict: "superseded", cause: "close-requested" });
	});

	// AC-14 — the butterfly. `state: working` + a terminal record is exactly the
	// row that reported a dead seat as actively working for 19 hours.
	it("AC-14 a terminal-stamped seat is superseded with cause agent-absent", () => {
		const result = activityCredibility({
			state: "working",
			lastEventAt: "2026-08-07T23:00:00.000Z",
			terminal: absentTerminal,
		});
		expect(result).toMatchObject({
			verdict: "superseded",
			cause: "agent-absent",
			asOf: TERMINAL_AT,
		});
	});

	it("rule 7 — an unknown probe with no terminal record is unknown", () => {
		const result = activityCredibility({ state: "idle", agentLiveness: "unknown" });
		expect(result).toMatchObject({ verdict: "unknown", cause: "probe-unavailable" });
		expect(result.asOf).toBeUndefined();
	});

	// AC-15 — `anomalies.ts:398` stated positively. "No telemetry" is not "nothing
	// to see": it is reported as unknown and still RENDERED. `unknown` is
	// NON-SUPPRESSING, and a consumer that silently drops it has converted a
	// refusal to accuse without proof into a refusal to look.
	it("AC-15 no state and no lastEventAt is unknown / no-activity-recorded", () => {
		const result = activityCredibility({});
		expect(result).toMatchObject({ verdict: "unknown", cause: "no-activity-recorded" });
	});

	it("rule 9 — an uncontradicted activity is current", () => {
		const result = activityCredibility({
			state: "working",
			lastEventAt: "2026-08-08T00:00:00.000Z",
		});
		expect(result).toMatchObject({ verdict: "current", cause: "uncontradicted" });
	});

	it("never invents, rewrites, or clears the activity it is asked about", () => {
		const input = {
			state: "working",
			lastEventAt: "2026-08-07T23:00:00.000Z",
			terminal: absentTerminal,
		} as const;
		const before = JSON.stringify(input);
		activityCredibility(input);
		expect(JSON.stringify(input)).toBe(before);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// The failure this stream nearly caused ITSELF.
//
// The first `ps` parser only knew GNU's `lstart` field order (`Sat Aug  8`);
// macOS renders `Sat  8 Aug`. Every row therefore fell through to the
// unreadable branch with an empty command — and an empty command is not a
// harness process, so the ladder returned `absent` for every seat on the
// machine. One capture bug would have stamped the entire fleet terminal on the
// first tick: the exact destructive answer this stream exists to remove,
// arriving via this stream.
//
// A capture defect must degrade to `unknown`. These pin that.
describe("resolveAgentLiveness — a capture defect degrades to unknown, never absent", () => {
	it("refuses to declare absence over rows whose command could not be read", () => {
		const probe = resolveAgentLiveness(
			{ pid: 44535, harness: "copilot", harnessSessionId: "seat-1" },
			fakeProcessSnapshot([
				{ pid: 44535, command: "", truncated: true },
				{ pid: 44600, ppid: 44535, command: "", truncated: true },
			]),
		);
		expect(probe.liveness).toBe("unknown");
		expect(probe.cause).toBe("identity-indeterminate");
	});

	it("still reports absent when the subtree is fully READABLE and simply has no harness", () => {
		const probe = resolveAgentLiveness(
			{ pid: 44535, harness: "copilot", harnessSessionId: "seat-1" },
			fakeProcessSnapshot([
				{ pid: 44535, command: "-zsh" },
				{ pid: 44600, ppid: 44535, command: "/usr/bin/vim notes.md" },
			]),
		);
		expect(probe.liveness).toBe("absent");
	});
});
