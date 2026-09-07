import { describe, expect, it } from "vitest";
import { COPILOT_CONTROL_REFUSAL } from "../core/commands.js";
import { describeOutcome, servedByLegacy } from "../core/generation-routing.js";
import { type GenerationRouterDeps, probeRs, routeVerb } from "./generation-router.js";

const KEY = "k".repeat(64);
const HEALTH = JSON.stringify({
	ok: true,
	command: "pij ping",
	v: 2,
	data: { status: "healthy", build: "pij-rs test", offline: false, machine: "test" },
});
const AUTH_401 = JSON.stringify({
	ok: false,
	command: "auth",
	v: 2,
	meta: "missing or wrong bearer token",
	error: "auth",
});

const refused = () => {
	const error = new Error("fetch failed");
	(error as { cause?: unknown }).cause = { code: "ECONNREFUSED" };
	return error;
};

interface Call {
	readonly url: string;
	readonly method: string;
}

function deps(
	handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
	over: Partial<GenerationRouterDeps> = {},
	calls: Call[] = [],
): GenerationRouterDeps {
	return {
		fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			calls.push({ url, method: init?.method ?? "GET" });
			return handler(url, init);
		}) as unknown as typeof fetch,
		readFile: (async () => KEY) as unknown as GenerationRouterDeps["readFile"],
		env: { PIJ_RS_ADDR: "127.0.0.1:7461", PIJ_RS_STATE_DIR: "/tmp/pij-rs-test" },
		home: "/tmp/home",
		...over,
	};
}

describe("probing rs through the shipped detector", () => {
	it("a listening daemon with a good key is live", async () => {
		const probe = await probeRs(deps(() => new Response(HEALTH, { status: 200 })));
		expect(probe.kind).toBe("live");
		expect(probe.location.addr).toBe("127.0.0.1:7461");
	});

	it("nothing listening is ABSENT (fall back quietly)", async () => {
		const probe = await probeRs(
			deps(() => {
				throw refused();
			}),
		);
		expect(probe.kind).toBe("absent");
	});

	// The distinction the whole 401 arm rests on: "nothing is there" and "it is
	// right there and said no" arrive as different exceptions from the same
	// detector, and collapsing them would make a wrong key look like an absent
	// daemon — silently re-homing every routed verb to legacy.
	it("a listening daemon that rejects the key is AUTH-REJECTED, not absent", async () => {
		const probe = await probeRs(deps(() => new Response(AUTH_401, { status: 401 })));
		expect(probe.kind).toBe("auth-rejected");
	});

	// The pair below is the distinction that keeps the fleet working. Both are
	// "rs is live and we are not talking to it", and they take OPPOSITE paths.
	it("NO key file at all is no-credentials — not auth-rejected, and not absent", async () => {
		const probe = await probeRs(
			deps(() => new Response(AUTH_401, { status: 401 }), {
				readFile: (async () => {
					throw new Error("ENOENT");
				}) as unknown as GenerationRouterDeps["readFile"],
			}),
		);
		expect(probe.kind).toBe("no-credentials");
	});

	it("a key that EXISTS and is refused is auth-rejected", async () => {
		const probe = await probeRs(deps(() => new Response(AUTH_401, { status: 401 })));
		expect(probe.kind).toBe("auth-rejected");
	});
});

describe("routeVerb end to end", () => {
	it.each([
		["send", ["send", "pij-target", "--command", "compact"], "/v1/shim/send"],
		["compact-self", ["compact-self"], "/v1/shim/compact-self"],
	] as const)("routes %s controls to rs with caller proof and command argv intact", async (verb, argv, path) => {
		let request: Record<string, unknown> | undefined;
		const { outcome } = await routeVerb(
			verb,
			undefined,
			argv,
			deps(
				(url, init) => {
					if (url.endsWith("/health")) return new Response(HEALTH);
					expect(new URL(url).pathname).toBe(path);
					request = JSON.parse(String(init?.body));
					return new Response(
						JSON.stringify({
							ok: true,
							command: `pij ${verb}`,
							v: 2,
							data: { msg_id: "control-1", outcome: "accepted", at: 1 },
						}),
					);
				},
				{
					env: {
						PIJ_RS_ADDR: "127.0.0.1:17610",
						PIJ_RS_STATE_DIR: "/tmp/state",
						TMUX_PANE: "%42",
						PIJ_SESSION_ID: "pij-self",
					},
					ambientSeatId: () => "pij-self",
					seatInRs: () => true,
					rsSeatByPane: async () => "pij-self",
				},
			),
		);
		expect(outcome.kind).toBe("rs");
		expect(request).toMatchObject({ argv, caller: { tmuxPane: "%42", pijSessionId: "pij-self" } });
	});

	it("preserves decodable rs control refusal without legacy fallback", async () => {
		const refusal = COPILOT_CONTROL_REFUSAL;
		const { outcome } = await routeVerb(
			"compact-self",
			undefined,
			["compact-self"],
			deps(
				(url) =>
					url.endsWith("/health")
						? new Response(HEALTH)
						: new Response(
								JSON.stringify({
									ok: false,
									command: "pij compact-self",
									v: 2,
									error: "refused",
									meta: refusal,
								}),
								{ status: 400 },
							),
				{ ambientSeatId: () => "pij-self", seatInRs: () => true },
			),
		);
		expect(outcome).toMatchObject({ kind: "rs-error", detail: refusal });
	});
	it("no rs daemon at all → legacy, with the addr named", async () => {
		const { outcome } = await routeVerb(
			"adopt",
			undefined,
			[],
			deps(() => {
				throw refused();
			}),
		);
		expect(outcome).toMatchObject({ kind: "legacy-no-rs-daemon", addr: "127.0.0.1:7461" });
	});

	it("forced legacy makes NO network call at all", async () => {
		const calls: Call[] = [];
		const { outcome } = await routeVerb(
			"adopt",
			undefined,
			[],
			deps(
				() => new Response(HEALTH, { status: 200 }),
				{ env: { PIJ_DAEMON_GENERATION: "legacy" } },
				calls,
			),
		);
		expect(outcome).toMatchObject({ kind: "legacy-forced" });
		expect(calls).toEqual([]);
	});

	it("an unrouted verb never reaches rs", async () => {
		const { outcome } = await routeVerb(
			"spawn",
			undefined,
			[],
			deps(() => new Response(HEALTH, { status: 200 })),
		);
		expect(outcome).toMatchObject({ kind: "legacy-unrouted" });
	});

	// THE LIVE SHAPE TODAY: rs is up, adopt is routed, and rs has no /v1/adopt
	// handler yet (wave 2 lands it). Fallback is visible and names the path.
	it("rs live but the route is absent (bodiless 404) → legacy, not-implemented", async () => {
		const { outcome } = await routeVerb(
			"adopt",
			undefined,
			[],
			deps((url) =>
				url.endsWith("/health")
					? new Response(HEALTH, { status: 200 })
					: new Response("", { status: 404 }),
			),
		);
		expect(outcome).toMatchObject({
			kind: "legacy-rs-not-implemented",
			rsPath: "/v1/adopt",
			addr: "127.0.0.1:7461",
		});
	});

	it("rs answering with a refusal envelope does NOT fall back", async () => {
		const refusal = JSON.stringify({
			ok: false,
			command: "pij adopt",
			v: 2,
			meta: "seat not found",
			error: "not_found",
		});
		const { outcome } = await routeVerb(
			"adopt",
			undefined,
			[],
			deps((url) =>
				url.endsWith("/health")
					? new Response(HEALTH, { status: 200 })
					: new Response(refusal, { status: 404 }),
			),
		);
		expect(outcome.kind).toBe("rs-error");
	});

	it("rs serving the verb → routed to rs, with the payload", async () => {
		const ok = JSON.stringify({
			ok: true,
			command: "pij adopt",
			v: 2,
			data: { id: "pij-minted-by-rs" },
		});
		const { outcome, payload } = await routeVerb(
			"adopt",
			undefined,
			[],
			deps((url) =>
				url.endsWith("/health")
					? new Response(HEALTH, { status: 200 })
					: new Response(ok, { status: 200 }),
			),
		);
		expect(outcome).toMatchObject({ kind: "rs", addr: "127.0.0.1:7461" });
		// The id came from rs. The shim did not invent it (ac-1147).
		expect(payload).toEqual({ id: "pij-minted-by-rs" });
	});

	it("unions a fake rs sessions answer and keeps the rs row while null-filling from legacy", async () => {
		const legacyRows = [
			{
				pijId: "pij-shared",
				harness: "pi",
				harnessSessionId: "legacy-native-session",
				lifecycle: "bound",
				boundModel: "legacy-model",
				spawnedBy: "pij-parent",
				transcriptPath: "/legacy/transcript.jsonl",
				prime: false,
				oldPrime: false,
			},
		];
		const rsRow = {
			pijId: "pij-shared",
			harness: "omp",
			harnessSessionId: null,
			gitCommonDir: "/repo/.git",
			lifecycle: null,
			boundModel: null,
			spawnedBy: null,
			transcriptPath: null,
			generation: "rs",
		};
		const over = {
			legacySessionRows: () => legacyRows,
			ambientSeatId: () => "pij-legacy-caller",
			seatInRs: () => false,
			seatInLegacy: () => true,
		} as Partial<GenerationRouterDeps>;
		const calls: Call[] = [];
		const { outcome, payload } = await routeVerb(
			"sessions",
			undefined,
			["sessions", "--json"],
			deps(
				(url) =>
					url.endsWith("/health")
						? new Response(HEALTH, { status: 200 })
						: new Response(
								JSON.stringify({
									ok: true,
									command: "pij sessions",
									v: 2,
									data: { rows: [rsRow] },
								}),
								{ status: 200 },
							),
				over,
				calls,
			),
		);

		expect(outcome.kind).toBe("rs");
		expect(calls.at(-1)).toEqual({
			url: "http://127.0.0.1:7461/v1/shim/sessions",
			method: "GET",
		});
		expect(payload).toEqual([
			{
				...rsRow,
				harnessSessionId: "legacy-native-session",
				lifecycle: "bound",
				boundModel: "legacy-model",
				spawnedBy: "pij-parent",
				transcriptPath: "/legacy/transcript.jsonl",
			},
		]);
	});

	it("fails loudly without fallback when the legacy half cannot be read", async () => {
		const result = await routeVerb(
			"sessions",
			undefined,
			["sessions", "--json"],
			deps(
				(url) =>
					url.endsWith("/health")
						? new Response(HEALTH, { status: 200 })
						: new Response(
								JSON.stringify({ ok: true, command: "pij sessions", v: 2, data: { rows: [] } }),
								{ status: 200 },
							),
				{
					legacySessionRows: () => {
						throw new Error("legacy registry corrupt");
					},
				},
			),
		);

		expect(result.outcome).toMatchObject({
			kind: "rs-error",
			detail: expect.stringContaining("legacy registry corrupt"),
		});
		expect(servedByLegacy(result.outcome)).toBe(false);
	});

	it("filters rs rows by caller git common dir only when --here is present", async () => {
		const rows = [
			{
				pijId: "pij-local",
				harness: "omp",
				harnessSessionId: "local-session",
				gitCommonDir: "/repo/.git",
				lifecycle: "bound",
				boundModel: null,
				spawnedBy: null,
				transcriptPath: null,
				generation: "rs",
			},
			{
				pijId: "pij-other",
				harness: "omp",
				harnessSessionId: "other-session",
				gitCommonDir: "/other/.git",
				lifecycle: "bound",
				boundModel: null,
				spawnedBy: null,
				transcriptPath: null,
				generation: "rs",
			},
		];
		const handler = (url: string) =>
			url.endsWith("/health")
				? new Response(HEALTH, { status: 200 })
				: new Response(
						JSON.stringify({ ok: true, command: "pij sessions", v: 2, data: { rows } }),
						{ status: 200 },
					);
		const over = {
			legacySessionRows: () => [],
			gitCommonDir: () => "/repo/.git",
		} as Partial<GenerationRouterDeps>;

		const all = await routeVerb("sessions", undefined, ["sessions", "--json"], deps(handler, over));
		const here = await routeVerb(
			"sessions",
			undefined,
			["sessions", "--here", "--json"],
			deps(handler, over),
		);

		expect((all.payload as Array<{ pijId: string }>).map((row) => row.pijId)).toEqual([
			"pij-local",
			"pij-other",
		]);
		expect((here.payload as Array<{ pijId: string }>).map((row) => row.pijId)).toEqual([
			"pij-local",
		]);
	});

	it("falls back to exact caller folder for non-git --here", async () => {
		const rows = [
			{
				pijId: "pij-local",
				harness: "omp",
				harnessSessionId: "local-session",
				gitCommonDir: "/plain/folder",
				lifecycle: "bound",
				boundModel: null,
				spawnedBy: null,
				transcriptPath: null,
				generation: "rs",
			},
			{
				pijId: "pij-other",
				harness: "omp",
				harnessSessionId: "other-session",
				gitCommonDir: "/other/folder",
				lifecycle: "bound",
				boundModel: null,
				spawnedBy: null,
				transcriptPath: null,
				generation: "rs",
			},
		];
		const handler = (url: string) =>
			url.endsWith("/health")
				? new Response(HEALTH, { status: 200 })
				: new Response(
						JSON.stringify({ ok: true, command: "pij sessions", v: 2, data: { rows } }),
						{ status: 200 },
					);
		const { payload } = await routeVerb(
			"sessions",
			undefined,
			["sessions", "--here", "--json"],
			deps(handler, {
				legacySessionRows: () => [],
				cwd: () => "/plain/folder",
				gitCommonDir: () => null,
			}),
		);

		expect((payload as Array<{ pijId: string }>).map((row) => row.pijId)).toEqual(["pij-local"]);
	});

	// o-prime's binding condition 3: an UNANSWERABLE capability question is an
	// ERROR, not "does not implement". rs answered the probe and then died on
	// the call — treating that as not-implemented would re-home the verb on the
	// strength of a failure.
	it("rs answers the probe then fails the call → ERROR, never a fallback", async () => {
		const { outcome } = await routeVerb(
			"adopt",
			undefined,
			[],
			deps((url) => {
				if (url.endsWith("/health")) return new Response(HEALTH, { status: 200 });
				throw new Error("socket hang up");
			}),
		);
		expect(outcome).toMatchObject({ kind: "rs-error", detail: "socket hang up" });
	});

	it("rs live but rejecting the key → named auth outcome, no fallback", async () => {
		const { outcome } = await routeVerb(
			"adopt",
			undefined,
			[],
			deps(() => new Response(AUTH_401, { status: 401 })),
		);
		expect(outcome).toMatchObject({ kind: "rs-auth-rejected", stateDir: "/tmp/pij-rs-test" });
	});

	it("a seat that lives only in legacy is FOLLOWED, not re-homed", async () => {
		const { outcome } = await routeVerb(
			"whoami",
			undefined,
			[],
			deps(
				(url) =>
					url.endsWith("/health")
						? new Response(HEALTH, { status: 200 })
						: new Response("", { status: 404 }),
				{
					ambientSeatId: () => "pij-legacy-only",
					seatInRs: () => false,
					seatInLegacy: () => true,
				},
			),
		);
		expect(outcome).toMatchObject({ kind: "legacy-seat-followed", seatId: "pij-legacy-only" });
	});

	it("the resolved addr is the NAMED one, not a hardcoded default", async () => {
		// Two rs daemons, each with its own state dir, have coexisted here. A
		// detector that only asks "is an rs daemon live?" can bind a demo store.
		const calls: Call[] = [];
		await routeVerb(
			"adopt",
			undefined,
			[],
			deps(
				() => new Response(HEALTH, { status: 200 }),
				{ env: { PIJ_RS_ADDR: "127.0.0.1:17610" } },
				calls,
			),
		);
		expect(calls[0]?.url).toContain("127.0.0.1:17610");
	});
});

describe("a keyless seat still works (the regression that 8 integration tests caught)", () => {
	const keyless = (over: Partial<GenerationRouterDeps> = {}) =>
		deps(() => new Response(AUTH_401, { status: 401 }), {
			readFile: (async () => {
				throw new Error("ENOENT");
			}) as unknown as GenerationRouterDeps["readFile"],
			...over,
		});

	// A seat holding no rs key could never have registered into rs, because
	// registering requires the key. Legacy is therefore where it has always
	// lived — answering from legacy is not re-homing it. Failing loud here
	// instead would break every seat that has never used rs.
	it("no rs credential → legacy, named, and NOT an error", async () => {
		const { outcome } = await routeVerb("whoami", undefined, [], keyless());
		expect(outcome).toMatchObject({ kind: "legacy-no-rs-credentials" });
		expect(servedByLegacy(outcome)).toBe(true);
	});

	it("but it says so out loud — the fallback is never silent", async () => {
		const { outcome } = await routeVerb("whoami", undefined, [], keyless());
		const line = describeOutcome(outcome);
		expect(line).toContain("no rs credential");
		expect(line).toContain("/tmp/pij-rs-test/daemon.key");
		expect(line).toContain("127.0.0.1:7461");
	});

	// The message must report the OBSERVATION (no credential at this path) and
	// not the INFERENCE (therefore never registered). Key-absent has a second
	// cause — a seat that IS in rs whose credential was lost — and in that
	// world the confident version is false while an rs-resident seat is quietly
	// served by legacy. Unresolvable from this side, so it must be stated.
	it("names the ambiguity instead of asserting the comfortable cause", async () => {
		const line = describeOutcome((await routeVerb("whoami", undefined, [], keyless())).outcome);
		expect(line).toContain("indistinguishable from here");
		expect(line).toMatch(/never registered in rs, or its credential is gone/);
		// The inference must NOT be stated as fact.
		expect(line).not.toMatch(/so it was never registered/);
	});

	it("and a PRESENT-but-refused key still fails loud — the guard is intact", async () => {
		const { outcome } = await routeVerb(
			"whoami",
			undefined,
			[],
			deps(() => new Response(AUTH_401, { status: 401 })),
		);
		expect(outcome.kind).toBe("rs-auth-rejected");
		expect(servedByLegacy(outcome)).toBe(false);
	});

	it("the two are different kinds AND different sentences", async () => {
		const a = (await routeVerb("whoami", undefined, [], keyless())).outcome;
		const b = (
			await routeVerb(
				"whoami",
				undefined,
				[],
				deps(() => new Response(AUTH_401, { status: 401 })),
			)
		).outcome;
		expect(a.kind).not.toBe(b.kind);
		expect(describeOutcome(a)).not.toBe(describeOutcome(b));
	});
});
