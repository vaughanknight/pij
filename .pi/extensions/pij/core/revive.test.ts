import { describe, expect, it } from "vitest";
import {
	type AttachmentLiveness,
	buildRevivedDescriptor,
	buildRevivePrintout,
	classifyAttachment,
	harnessSelfAdopts,
	parseReviveArgs,
	planRevive,
	REVIVE_REFRAME,
	type ReviveArtifacts,
	resolveSeatForFolder,
	type SeatCandidate,
	type SeatTier,
	shellQuote,
	uncertaintyReason,
} from "./revive.js";
import type { SessionDescriptor } from "./types.js";

const NOW = "2026-07-25T01:02:03.000Z";

function descriptor(overrides: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-finished-fox",
		role: "worker",
		folder: "/repo/s066-session-revive",
		dataDir: "/pij/pij-finished-fox",
		eventsPath: "/pij/pij-finished-fox/events.ndjson",
		pid: 10,
		startedAt: "2026-07-24T00:00:00.000Z",
		harness: "claude",
		harnessSessionId: "11111111-2222-4333-8444-555555555555",
		paneId: "%7",
		windowId: "@4",
		spawnedBy: "pij-parent",
		parentId: "pij-parent",
		lifecycle: "dissolved",
		boundModel: "claude-sonnet-5",
		effort: "high",
		closeIntent: {
			actor: "pij-parent",
			kind: "cli-close",
			requestedAt: "2026-07-24T02:00:00.000Z",
		},
		terminal: {
			disposition: "requested",
			observedAt: "2026-07-24T02:00:01.000Z",
			evidence: "pane-missing",
		},
		deathNoticeLatchedAt: "2026-07-24T02:00:01.000Z",
		failureReason: "dead",
		initInjectedAt: "2026-07-24T00:00:01.000Z",
		lastTickAt: "2026-07-24T01:00:00.000Z",
		...overrides,
	};
}

const noArtifacts = {
	claudePath: undefined,
	copilotPath: undefined,
	codexPaths: [] as string[],
	piPaths: [] as string[],
	ompPaths: [] as string[],
};

describe("parseReviveArgs", () => {
	it("accepts one id with layout and json", () => {
		expect(parseReviveArgs(["pij-finished-fox", "--layout", "window", "--json"])).toEqual({
			ok: true,
			value: {
				id: "pij-finished-fox",
				layout: "window",
				json: true,
				print: false,
				assumeDead: false,
			},
		});
	});

	it("rejects unknown flags and a second positional id", () => {
		expect(parseReviveArgs(["--fresh"])).toMatchObject({ ok: false, code: "E-ARG" });
		expect(parseReviveArgs(["pij-one", "pij-two"])).toMatchObject({ ok: false, code: "E-ARG" });
	});
});

describe("planRevive — exact native continuation only", () => {
	it("builds Claude --resume without fork/create flags", () => {
		const result = planRevive(
			descriptor(),
			{ ...noArtifacts, claudePath: "/home/.claude/native.jsonl" },
			{ spawnId: "revive-1", parentId: "pij-parent" },
		);
		expect(result).toMatchObject({ ok: true, value: { runtime: "claude" } });
		if (!result.ok) return;
		expect(result.value.command).toMatchObject({ cmd: "claude" });
		expect(result.value.command.args).toEqual([
			"--dangerously-skip-permissions",
			"--resume",
			"11111111-2222-4333-8444-555555555555",
			"--model",
			"claude-sonnet-5",
			"--effort",
			"high",
		]);
		expect(result.value.command.args).not.toContain("--fork-session");
		expect(result.value.command.args).not.toContain("--session-id");
	});

	it("uses Copilot's fail-loud --resume form, never create-when-missing --session-id", () => {
		const result = planRevive(
			descriptor({ harness: "copilot", boundModel: "gpt-5.6-sol" }),
			{ ...noArtifacts, copilotPath: "/home/.copilot/session-state/native/events.jsonl" },
			{ spawnId: "revive-2", parentId: "pij-parent" },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.command.cmd).toBe("copilot");
		expect(result.value.command.args).toContain("--resume=11111111-2222-4333-8444-555555555555");
		expect(result.value.command.args).not.toContain("--session-id");
	});

	it("puts Codex resume after global options and retains the exact rollout", () => {
		const rollout = "/home/.codex/sessions/2026/07/24/rollout-native.jsonl";
		const result = planRevive(
			descriptor({ harness: "codex", transcriptPath: rollout, boundModel: "gpt-5.5" }),
			{ ...noArtifacts, codexPaths: [rollout] },
			{ spawnId: "revive-3", parentId: "pij-parent" },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.artifactPath).toBe(rollout);
		expect(result.value.command.args).toEqual([
			"--dangerously-bypass-approvals-and-sandbox",
			"--model",
			"gpt-5.5",
			"-c",
			"model_reasoning_effort=high",
			"resume",
			"11111111-2222-4333-8444-555555555555",
		]);
	});

	it("uses existing-only Pi --session and persists runtime provenance", () => {
		const session = "/home/.pi/agent/sessions/repo/timestamp_native.jsonl";
		const result = planRevive(
			descriptor({ harness: "pi", runtimeBin: "pi", boundModel: "openai/gpt-5.5" }),
			{ ...noArtifacts, piPaths: [session] },
			{ spawnId: "revive-4", parentId: "pij-parent" },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.command.cmd).toBe("pi");
		expect(result.value.command.args.slice(0, 2)).toEqual(["--session", session]);
		expect(result.value.command.args).not.toContain("--session-id");
		expect(result.value.command.env.PIJ_PI_BIN).toBe("pi");
		expect(result.value.command.env.PIJ_SPAWN_TASK).toBe(REVIVE_REFRAME);
	});

	it("uses fail-loud OMP --resume and infers a legacy runtime only from one exact store match", () => {
		const session = "/home/.omp/agent/sessions/repo/timestamp_native.jsonl";
		const result = planRevive(
			descriptor({ harness: "pi", runtimeBin: undefined }),
			{ ...noArtifacts, ompPaths: [session] },
			{ spawnId: "revive-5", parentId: "pij-parent" },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.runtime).toBe("omp");
		expect(result.value.command.cmd).toBe("omp");
		expect(result.value.command.args).toContain(`--resume=${session}`);
		expect(result.value.command.args).not.toContain("--session-id");
	});

	it("accepts terminal or proven-dead descriptors but refuses a live prior attachment", () => {
		const artifact = { ...noArtifacts, claudePath: "/home/.claude/native.jsonl" };
		expect(
			planRevive(descriptor({ lifecycle: "bound" }), artifact, { spawnId: "terminal" }),
		).toMatchObject({ ok: true });
		expect(
			planRevive(descriptor({ lifecycle: "bound", terminal: undefined }), artifact, {
				spawnId: "dead",
				attachment: "stale",
			}),
		).toMatchObject({ ok: true });
		expect(
			planRevive(descriptor(), artifact, {
				spawnId: "alive",
				attachment: "live",
			}),
		).toMatchObject({ ok: false, code: "E-ARG", message: expect.stringContaining("live prior") });
	});

	it("rejects multiple exact artifacts for an explicitly recorded runtime", () => {
		expect(
			planRevive(
				descriptor({ harness: "pi", runtimeBin: "pi" }),
				{ ...noArtifacts, piPaths: ["/pi/a.jsonl", "/pi/b.jsonl"] },
				{ spawnId: "ambiguous" },
			),
		).toMatchObject({ ok: false, code: "E-AMBIG" });
	});

	it("fails before launch when identity, lifecycle, artifact, or legacy runtime is ambiguous", () => {
		expect(planRevive(null, noArtifacts, { spawnId: "r" })).toMatchObject({
			ok: false,
			code: "E-NOID",
		});
		expect(
			planRevive(descriptor({ lifecycle: "bound", terminal: undefined }), noArtifacts, {
				spawnId: "r",
			}),
		).toMatchObject({ ok: false, code: "E-ARG" });
		expect(planRevive(descriptor(), noArtifacts, { spawnId: "r" })).toMatchObject({
			ok: false,
			code: "E-NOREG",
		});
		expect(
			planRevive(
				descriptor({ harness: "pi", runtimeBin: undefined }),
				{ ...noArtifacts, piPaths: ["/pi/session.jsonl"], ompPaths: ["/omp/session.jsonl"] },
				{ spawnId: "r" },
			),
		).toMatchObject({ ok: false, code: "E-AMBIG" });
	});
});

describe("buildRevivedDescriptor", () => {
	it("preserves durable identity but removes terminal runtime state", () => {
		const revived = buildRevivedDescriptor(descriptor(), {
			paneId: "%99",
			windowId: "@20",
			pid: 999,
			spawnId: "revive-9",
			nowIso: NOW,
			reviverId: "pij-current-operator",
		});
		expect(revived).toMatchObject({
			id: "pij-finished-fox",
			dataDir: "/pij/pij-finished-fox",
			spawnedBy: "pij-current-operator",
			parentId: "pij-current-operator",
			paneId: "%99",
			windowId: "@20",
			pid: 999,
			lifecycle: "pending",
			plannedHarnessSessionId: "11111111-2222-4333-8444-555555555555",
			revivePendingAt: NOW,
		});
		for (const key of [
			"closeIntent",
			"terminal",
			"deathNoticeLatchedAt",
			"failureReason",
			"initInjectedAt",
			"lastTickAt",
		]) {
			expect(revived).not.toHaveProperty(key);
		}
	});

	it("the revive reframe forbids continuation without carrying a recall answer", () => {
		expect(REVIVE_REFRAME).toMatch(/REVIVED/);
		expect(REVIVE_REFRAME).toMatch(/Do NOT continue/i);
		expect(REVIVE_REFRAME).toMatch(/wait for new instructions/i);
		expect(REVIVE_REFRAME).not.toMatch(/seed|golden|answer/i);
	});
});

// ─── s072 — reboot rehydrate ──────────────────────────────────────────────────

describe("parseReviveArgs — s072 flags", () => {
	it("accepts no id at all (the seat is resolved from the folder)", () => {
		expect(parseReviveArgs([])).toEqual({
			ok: true,
			value: { json: false, print: false, assumeDead: false },
		});
	});

	it("parses --print, --assume-dead, and both --attach forms", () => {
		expect(parseReviveArgs(["--print", "--json"])).toEqual({
			ok: true,
			value: { json: true, print: true, assumeDead: false },
		});
		expect(parseReviveArgs(["pij-x", "--assume-dead"])).toEqual({
			ok: true,
			value: { id: "pij-x", json: false, print: false, assumeDead: true },
		});
		expect(parseReviveArgs(["pij-x", "--attach", "%42"])).toMatchObject({
			ok: true,
			value: { id: "pij-x", attach: "%42" },
		});
		expect(parseReviveArgs(["pij-x", "--attach=%42"])).toMatchObject({
			ok: true,
			value: { attach: "%42" },
		});
	});

	it("bare --attach takes $TMUX_PANE and never swallows the id", () => {
		expect(parseReviveArgs(["--attach", "pij-x"])).toMatchObject({
			ok: true,
			value: { id: "pij-x", attach: "" },
		});
	});

	it("refuses flag combinations that contradict each other", () => {
		expect(parseReviveArgs(["pij-x", "--print", "--attach"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(parseReviveArgs(["pij-x", "--print", "--layout", "window"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(parseReviveArgs(["pij-x", "--attach", "--layout", "window"])).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(parseReviveArgs(["--fresh"])).toMatchObject({ ok: false, code: "E-ARG" });
	});
});

describe("classifyAttachment — D3 host-restart liveness", () => {
	// Anchors used throughout: the seat was last active on the 2nd.
	const activeAt = Date.parse("2026-07-02T00:00:00.000Z");
	const bootBefore = Date.parse("2026-07-01T00:00:00.000Z");
	const bootAfter = Date.parse("2026-07-03T00:00:00.000Z");

	it("a pane is proof of life when its pid matches AND a non-recycled signal backs it", () => {
		// (1) the strongest backing: the pane process started BEFORE our last event.
		expect(
			classifyAttachment({
				pane: "ours",
				pidAlive: true,
				lastActivityAtMs: activeAt,
				paneProcessStartedAtMs: Date.parse("2026-07-01T09:00:00.000Z"),
			}),
		).toBe("live");
		// (2) the weaker backing: no `ps`, but the seat was active in THIS boot epoch.
		expect(
			classifyAttachment({
				pane: "ours",
				pidAlive: false,
				hostBootAtMs: bootBefore,
				lastActivityAtMs: activeAt,
			}),
		).toBe("live");
	});

	// s072 FIX-6 / reviewer round 2. A recycled identifier cannot be corroborated
	// by another recycled identifier: the reviewer built a fresh %0 server whose
	// pane pid happened to equal the descriptor's, with the descriptor predating
	// the boot, and got an IRREVOCABLE `live`.
	it("a matching pane pid does NOT survive host-boot evidence — the compound reboot case", () => {
		expect(
			classifyAttachment({
				pane: "ours",
				pidAlive: true,
				hostBootAtMs: bootAfter,
				lastActivityAtMs: activeAt,
			}),
		).toBe("stale");
	});

	it("a matching pane pid is uncertain when the pane's process is YOUNGER than our last event", () => {
		expect(
			classifyAttachment({
				pane: "ours",
				pidAlive: true,
				lastActivityAtMs: activeAt,
				paneProcessStartedAtMs: activeAt + 60_000,
			}),
		).toBe("uncertain");
	});

	it("a pane process that started AFTER our last event is uncertain, however close", () => {
		// s072 FIX-7 / reviewer round 3. This case used to return `live`: the old
		// tolerance was applied on the far side (`start <= activity + 5s`), so a
		// process born up to five seconds AFTER our newest activity was treated as
		// proof of life. The reviewer reproduced it on a fresh %0 server — pane
		// process at 03:30:25Z against a post-boot descriptor last active at
		// 03:30:21Z — and got an irrevocable E-ARG ahead of --assume-dead.
		//
		// Deliberately a LITERAL, not derived from PANE_START_MIN_LEAD_MS: a test
		// that computes its input from the constant it pins moves with the constant
		// and can never detect a change to it (an earlier version of this test
		// survived mutation G27 for exactly that reason).
		expect(
			classifyAttachment({
				pane: "ours",
				pidAlive: true,
				lastActivityAtMs: activeAt,
				paneProcessStartedAtMs: activeAt + 4_000,
			}),
		).toBe("uncertain");
	});

	// The tolerance may only ever widen the UNCERTAIN band, so the boundary sits
	// on the confident side: a full second of lead is required, and every
	// ambiguous reading falls outward. All three inputs are literals.
	it("pins the one-second lead boundary: before => live, same second or later => uncertain", () => {
		const at = (offsetMs: number): AttachmentLiveness =>
			classifyAttachment({
				pane: "ours",
				pidAlive: true,
				lastActivityAtMs: activeAt,
				paneProcessStartedAtMs: activeAt + offsetMs,
			});
		// exactly one full second before our last activity — provably our process.
		expect(at(-1_000)).toBe("live");
		// the same second: `ps` rounds to whole seconds, so this is indistinguishable
		// from a process that started just after us. Indistinguishable is uncertain.
		expect(at(0)).toBe("uncertain");
		// one second after: cannot have produced the activity we recorded.
		expect(at(1_000)).toBe("uncertain");
		// and just inside the lead is still short of proof.
		expect(at(-999)).toBe("uncertain");
	});

	it("a matching pane pid with NO time evidence at all is uncertain, not live", () => {
		expect(classifyAttachment({ pane: "ours", pidAlive: true })).toBe("uncertain");
	});

	// s072 FIX-1 / reviewer F-001. tmux numbers panes from %0 in every new
	// server: the reviewer restarted a private server twice and got %0 → %0.
	// A bare pane-id match after a reboot is a stranger, not our seat.
	it("a REUSED pane id is uncertain, never live — even with every other signal saying dead", () => {
		expect(classifyAttachment({ pane: "not-ours", pidAlive: false })).toBe("uncertain");
		expect(
			classifyAttachment({
				pane: "not-ours",
				pidAlive: false,
				terminalObserved: true,
				hostBootAtMs: bootAfter,
				lastActivityAtMs: activeAt,
			}),
		).toBe("uncertain");
	});

	// The forbidden direction: an uncorroborated pane must never be called dead,
	// because the pane really might be alive. `uncertain` is the honest answer and
	// it is the one `--assume-dead` can override.
	it("a reused pane id never classifies stale, so nothing here can call a live pane dead", () => {
		for (const pidAlive of [true, false]) {
			expect(classifyAttachment({ pane: "not-ours", pidAlive })).not.toBe("stale");
		}
	});

	it("pane gone AND pid dead is stale — both, never either", () => {
		expect(classifyAttachment({ pane: "gone", pidAlive: false })).toBe("stale");
	});

	// s072 FIX-2. tmux absent entirely (no binary, no server) is the real reboot
	// case. Absence of an answer is not an answer: a dead pid alone cannot settle
	// it, because we never got to look at the pane.
	it("an UNPROBED pane cannot be settled by the pid alone", () => {
		expect(classifyAttachment({ pane: "unprobed", pidAlive: false })).toBe("uncertain");
		expect(classifyAttachment({ pane: "unprobed", pidAlive: true })).toBe("uncertain");
	});

	it("an unprobed pane still yields to pij's own terminal observation and to boot time", () => {
		expect(classifyAttachment({ pane: "unprobed", pidAlive: true, terminalObserved: true })).toBe(
			"stale",
		);
		expect(
			classifyAttachment({
				pane: "unprobed",
				pidAlive: true,
				hostBootAtMs: bootAfter,
				lastActivityAtMs: activeAt,
			}),
		).toBe("stale");
	});

	it("pane gone but pid alive is uncertain without corroboration", () => {
		expect(classifyAttachment({ pane: "gone", pidAlive: true })).toBe("uncertain");
		expect(
			classifyAttachment({
				pane: "gone",
				pidAlive: true,
				hostBootAtMs: bootBefore,
				lastActivityAtMs: activeAt,
			}),
		).toBe("uncertain");
	});

	it("pij's OWN terminal observation outranks a live (recycled) pid", () => {
		expect(classifyAttachment({ pane: "gone", pidAlive: true, terminalObserved: true })).toBe(
			"stale",
		);
		// ...but it never rescues a pane that is genuinely still ours.
		expect(
			classifyAttachment({
				pane: "ours",
				pidAlive: true,
				terminalObserved: true,
				hostBootAtMs: bootBefore,
				lastActivityAtMs: activeAt,
			}),
		).toBe("live");
	});

	it("a host that booted AFTER the seat's last activity proves the live pid is a recycled one", () => {
		expect(
			classifyAttachment({
				pane: "gone",
				pidAlive: true,
				hostBootAtMs: bootAfter,
				lastActivityAtMs: activeAt,
			}),
		).toBe("stale");
	});
});

describe("uncertaintyReason — name the recycled identifier", () => {
	it("blames the reused pane id when the pane is somebody else's", () => {
		expect(uncertaintyReason({ pane: "not-ours", pidAlive: false })).toContain(
			"re-issues pane ids from %0",
		);
	});

	// s072 FIX-6: the operator has to be told WHICH signal disqualified a pid that
	// looks like a match, or "uncertain" reads as a bug.
	it("names the process start time when a matching pid is too young to be ours", () => {
		expect(
			uncertaintyReason({
				pane: "ours",
				pidAlive: true,
				lastActivityAtMs: Date.parse("2026-07-02T00:00:00.000Z"),
				paneProcessStartedAtMs: Date.parse("2026-07-04T00:00:00.000Z"),
			}),
		).toContain("did not start before this seat's last recorded activity (ps lstart");
	});

	it("says so when a matching pid had no absolute-time evidence behind it at all", () => {
		expect(uncertaintyReason({ pane: "ours", pidAlive: true })).toContain(
			"no absolute-time evidence",
		);
	});

	it("says tmux could not be reached when the pane was unprobed", () => {
		expect(uncertaintyReason({ pane: "unprobed", pidAlive: true })).toContain(
			"tmux could not be reached",
		);
	});

	it("blames the recycled pid when the pane is provably gone", () => {
		expect(uncertaintyReason({ pane: "gone", pidAlive: true })).toContain(
			"the recorded pane is gone but the recorded pid still answers",
		);
	});
});

describe("planRevive — uncertain liveness gates writes, not prints", () => {
	const artifact = { ...noArtifacts, claudePath: "/home/.claude/native.jsonl" };

	it("refuses to spawn over an attachment that could not be proven dead", () => {
		expect(
			planRevive(descriptor(), artifact, { spawnId: "r", attachment: "uncertain" }),
		).toMatchObject({ ok: false, code: "E-ARG", message: expect.stringContaining("recycled") });
	});

	it("allows --print on the same uncertain seat (it mutates nothing)", () => {
		expect(
			planRevive(descriptor(), artifact, { spawnId: "r", attachment: "uncertain", print: true }),
		).toMatchObject({ ok: true });
	});

	it("accepts the explicit operator override", () => {
		expect(
			planRevive(descriptor(), artifact, {
				spawnId: "r",
				attachment: "uncertain",
				assumeDead: true,
			}),
		).toMatchObject({ ok: true });
	});

	// s072 FIX-1 regression, end to end through the real classifier: a fresh tmux
	// server hands out the SAME %N to an unrelated pane. That must be `uncertain`
	// (not `live`, which no flag can override) and it must be revivable with the
	// documented escape hatch.
	it("a reused pane id classifies uncertain AND stays revivable with --assume-dead", () => {
		const reused = classifyAttachment({ pane: "not-ours", pidAlive: false });
		expect(reused).toBe("uncertain");
		expect(planRevive(descriptor(), artifact, { spawnId: "r", attachment: reused })).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(
			planRevive(descriptor(), artifact, {
				spawnId: "r",
				attachment: reused,
				assumeDead: true,
			}),
		).toMatchObject({ ok: true });
	});

	it("the refusal quotes the reason it was given, so the operator learns which id was recycled", () => {
		const probe = { pane: "not-ours", pidAlive: false } as const;
		expect(
			planRevive(descriptor(), artifact, {
				spawnId: "r",
				attachment: "uncertain",
				attachmentReason: uncertaintyReason(probe),
			}),
		).toMatchObject({
			ok: false,
			message: expect.stringContaining("re-issues pane ids from %0"),
		});
	});

	it("still refuses a live attachment even with --print or --assume-dead", () => {
		expect(
			planRevive(descriptor(), artifact, { spawnId: "r", attachment: "live", print: true }),
		).toMatchObject({ ok: false, code: "E-ARG" });
		expect(
			planRevive(descriptor(), artifact, { spawnId: "r", attachment: "live", assumeDead: true }),
		).toMatchObject({ ok: false, code: "E-ARG" });
	});

	it("--assume-dead unblocks a seat that never got a terminal observation", () => {
		expect(
			planRevive(descriptor({ lifecycle: "bound", terminal: undefined }), artifact, {
				spawnId: "r",
				assumeDead: true,
			}),
		).toMatchObject({ ok: true });
	});
});

describe("resolveSeatForFolder — D1 cwd resolution", () => {
	function seat(
		id: string,
		resolvedFolder: string,
		overrides: Partial<SessionDescriptor> = {},
		tier: SeatTier = "hot",
	): SeatCandidate {
		return {
			descriptor: descriptor({ id, folder: resolvedFolder, ...overrides }),
			resolvedFolder,
			tier,
		};
	}

	it("prefers the prime seat for the folder", () => {
		const result = resolveSeatForFolder(
			[seat("pij-other", "/repo/a"), seat("pij-prime", "/repo/a", { prime: true })],
			"/repo/a",
		);
		expect(result).toMatchObject({
			ok: true,
			value: { tier: "hot", viaPrime: true },
		});
		if (result.ok) expect(result.value.descriptor.id).toBe("pij-prime");
	});

	it("uses a lone non-prime seat and reports that it was not prime", () => {
		const result = resolveSeatForFolder([seat("pij-only", "/repo/a")], "/repo/a");
		expect(result).toMatchObject({ ok: true, value: { viaPrime: false } });
	});

	it("compares RESOLVED folders, never raw descriptor strings", () => {
		// /tmp -> /private/tmp on darwin: the caller realpaths both sides, so the
		// descriptor's raw folder never has to match the cwd byte-for-byte.
		const candidate: SeatCandidate = {
			descriptor: descriptor({ id: "pij-sym", folder: "/tmp/probe" }),
			resolvedFolder: "/private/tmp/probe",
			tier: "hot",
		};
		expect(resolveSeatForFolder([candidate], "/private/tmp/probe")).toMatchObject({ ok: true });
		expect(resolveSeatForFolder([candidate], "/tmp/probe")).toMatchObject({
			ok: false,
			code: "E-NOID",
		});
	});

	it("E-NOID names the folder it searched", () => {
		expect(resolveSeatForFolder([seat("pij-elsewhere", "/repo/b")], "/repo/a")).toMatchObject({
			ok: false,
			code: "E-NOID",
			message: expect.stringContaining("/repo/a"),
		});
	});

	it("E-AMBIG lists every candidate with id, harness, model and last activity", () => {
		const result = resolveSeatForFolder(
			[
				seat("pij-one", "/repo/a", { lastEventAt: "2026-07-25T10:00:00.000Z" }),
				seat("pij-two", "/repo/a", { harness: "codex", boundModel: "gpt-5.5" }),
			],
			"/repo/a",
		);
		expect(result).toMatchObject({ ok: false, code: "E-AMBIG" });
		if (result.ok) return;
		expect(result.message).toContain("pij-one");
		expect(result.message).toContain("2026-07-25T10:00:00.000Z");
		expect(result.message).toContain("pij-two");
		expect(result.message).toContain("gpt-5.5");
		expect(result.message).toContain("codex");
		expect(result.message).toContain("explicit pij id");
	});

	it("refuses to guess between two prime seats", () => {
		expect(
			resolveSeatForFolder(
				[seat("pij-one", "/repo/a", { prime: true }), seat("pij-two", "/repo/a", { prime: true })],
				"/repo/a",
			),
		).toMatchObject({ ok: false, code: "E-AMBIG" });
	});

	it("falls back to the archive tier and labels it", () => {
		const result = resolveSeatForFolder([seat("pij-buried", "/repo/a", {}, "archive")], "/repo/a");
		expect(result).toMatchObject({ ok: true, value: { tier: "archive" } });
	});

	it("a hot seat beats an archived one for the same folder", () => {
		const result = resolveSeatForFolder(
			[seat("pij-buried", "/repo/a", {}, "archive"), seat("pij-hot", "/repo/a")],
			"/repo/a",
		);
		expect(result).toMatchObject({ ok: true, value: { tier: "hot" } });
		if (result.ok) expect(result.value.descriptor.id).toBe("pij-hot");
	});

	it("an archived PRIME seat beats an archived non-prime one", () => {
		const result = resolveSeatForFolder(
			[
				seat("pij-buried", "/repo/a", {}, "archive"),
				seat("pij-buried-prime", "/repo/a", { prime: true }, "archive"),
			],
			"/repo/a",
		);
		expect(result).toMatchObject({ ok: true, value: { tier: "archive", viaPrime: true } });
	});
});

describe("shellQuote", () => {
	it("leaves shell-safe tokens bare and quotes everything else", () => {
		expect(shellQuote("pij-able-damselfly")).toBe("pij-able-damselfly");
		expect(shellQuote("--resume=11111111-2222")).toBe("--resume=11111111-2222");
		expect(shellQuote("@preset/glm-1m:high")).toBe("@preset/glm-1m:high");
		expect(shellQuote("")).toBe("''");
		expect(shellQuote("two words")).toBe("'two words'");
		expect(shellQuote("rm -rf /; echo $HOME `id`")).toBe("'rm -rf /; echo $HOME `id`'");
		expect(shellQuote("it's")).toBe(`'it'\\''s'`);
	});
});

describe("the five golden shell lines (D2/D4)", () => {
	function line(
		overrides: Partial<SessionDescriptor>,
		artifacts: Partial<ReviveArtifacts>,
	): string {
		const plan = planRevive(
			{ ...descriptor(overrides) },
			{ ...noArtifacts, ...artifacts },
			{
				spawnId: "revive-1",
				parentId: "pij-parent",
			},
		);
		if (!plan.ok) throw new Error(`${plan.code}: ${plan.message}`);
		return buildRevivePrintout(plan.value).shellLine;
	}

	it("claude", () => {
		expect(line({}, { claudePath: "/home/.claude/native.jsonl" })).toBe(
			'pij revive pij-finished-fox --attach "$TMUX_PANE" && ' +
				"PIJ_SESSION_ID=pij-finished-fox PIJ_HARNESS=claude PIJ_SPAWN_ID=revive-1 PIJ_PARENT_ID=pij-parent " +
				"claude --dangerously-skip-permissions --resume 11111111-2222-4333-8444-555555555555 " +
				"--model claude-sonnet-5 --effort high",
		);
	});

	it("copilot", () => {
		expect(
			line({ harness: "copilot", boundModel: "claude-opus-5" }, { copilotPath: "/home/c.json" }),
		).toBe(
			'pij revive pij-finished-fox --attach "$TMUX_PANE" && ' +
				"PIJ_SESSION_ID=pij-finished-fox PIJ_HARNESS=copilot PIJ_SPAWN_ID=revive-1 PIJ_PARENT_ID=pij-parent " +
				"copilot --yolo --resume=11111111-2222-4333-8444-555555555555 --model claude-opus-5 --effort high",
		);
	});

	it("codex", () => {
		expect(
			line({ harness: "codex", boundModel: "gpt-5.5" }, { codexPaths: ["/home/rollout.jsonl"] }),
		).toBe(
			'pij revive pij-finished-fox --attach "$TMUX_PANE" && ' +
				"PIJ_SESSION_ID=pij-finished-fox PIJ_HARNESS=codex PIJ_SPAWN_ID=revive-1 PIJ_PARENT_ID=pij-parent " +
				"codex --dangerously-bypass-approvals-and-sandbox --model gpt-5.5 " +
				"-c model_reasoning_effort=high resume 11111111-2222-4333-8444-555555555555",
		);
	});

	it("pi — self-adopts, so NO attach prefix; the long reframe is quoted", () => {
		expect(
			line(
				{
					harness: "pi",
					runtimeBin: "pi",
					boundModel: "@preset/glm-1m",
					boundProvider: "zai",
				},
				{ piPaths: ["/home/.pi/agent/sessions/s.json"] },
			),
		).toBe(
			"PIJ_ANNOUNCE_TO=pij-parent PIJ_PARENT_ID=pij-parent PIJ_SPAWN_ID=revive-1 PIJ_ROLE=worker " +
				`PIJ_SPAWN_TASK='${REVIVE_REFRAME}' ` +
				"PIJ_PI_BIN=pi PIJ_SPAWN_MODEL=@preset/glm-1m PIJ_SPAWN_PROVIDER=zai PIJ_SPAWN_EFFORT=high " +
				"pi --session /home/.pi/agent/sessions/s.json --model @preset/glm-1m:high",
		);
	});

	it("omp — self-adopts too", () => {
		expect(
			line(
				{ harness: "pi", runtimeBin: "omp", boundModel: "claude-opus-5" },
				{ ompPaths: ["/home/.omp/agent/sessions/s.json"] },
			),
		).toBe(
			"PIJ_ANNOUNCE_TO=pij-parent PIJ_PARENT_ID=pij-parent PIJ_SPAWN_ID=revive-1 PIJ_ROLE=worker " +
				`PIJ_SPAWN_TASK='${REVIVE_REFRAME}' ` +
				"PIJ_PI_BIN=omp PIJ_SPAWN_MODEL=claude-opus-5 PIJ_SPAWN_EFFORT=high " +
				"omp --auto-approve --resume=/home/.omp/agent/sessions/s.json --model claude-opus-5 --thinking high",
		);
	});

	it("every printed line carries PIJ_SESSION_ID or PIJ_ANNOUNCE_TO — a nameless seat is unaddressable", () => {
		const claude = line({}, { claudePath: "/home/.claude/native.jsonl" });
		const pi = line({ harness: "pi", runtimeBin: "pi" }, { piPaths: ["/home/s.json"] });
		expect(claude).toContain("PIJ_SESSION_ID=pij-finished-fox");
		expect(pi).toContain("PIJ_PARENT_ID=pij-parent");
		expect(pi).not.toContain("--attach");
	});
});

describe("buildRevivePrintout — who self-adopts", () => {
	it("claude/copilot/codex need the attach prefix; pi/omp do not", () => {
		expect(harnessSelfAdopts("claude")).toBe(false);
		expect(harnessSelfAdopts("copilot")).toBe(false);
		expect(harnessSelfAdopts("codex")).toBe(false);
		expect(harnessSelfAdopts("pi")).toBe(true);
		expect(harnessSelfAdopts("omp")).toBe(true);
	});

	it("pi/omp emit the launch line alone as the paste-able line", () => {
		const plan = planRevive(
			descriptor({ harness: "pi", runtimeBin: "pi" }),
			{ ...noArtifacts, piPaths: ["/home/s.json"] },
			{ spawnId: "revive-1" },
		);
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		const printout = buildRevivePrintout(plan.value);
		expect(printout.selfAdopts).toBe(true);
		expect(printout.attachLine).toBeUndefined();
		expect(printout.shellLine).toBe(printout.launchLine);
	});
});
