import { describe, expect, it } from "vitest";

import {
	planCurrentSessionDescriptor,
	resolveAmbientNativeIdentity,
	resolveRegisteredAmbientSelf,
} from "./current-session.js";
import type { SessionDescriptor } from "./types.js";

const COPILOT_UUID = "9A8F8BE6-3670-4E5C-B43E-09F46FE4DFAD";
const CODEX_UUID = "ABCDEF01-2222-4333-8444-555555555555";
const CODEX_PATH =
	"/Users/jo/.codex/sessions/2026/07/12/rollout-2026-07-12T00-00-00-abcdef01-2222-4333-8444-555555555555.jsonl";

describe("resolveAmbientNativeIdentity", () => {
	it("resolves a non-empty Claude current-session id", () => {
		expect(resolveAmbientNativeIdentity({ claudeCodeSessionId: " claude-current " })).toEqual({
			ok: true,
			value: {
				harness: "claude",
				harnessSessionId: "claude-current",
			},
		});
	});

	it("uses the validated Copilot current-session UUID supplied by the bin", () => {
		expect(resolveAmbientNativeIdentity({ copilotCurrentSessionId: COPILOT_UUID })).toEqual({
			ok: true,
			value: {
				harness: "copilot",
				harnessSessionId: COPILOT_UUID.toLowerCase(),
			},
		});
	});

	it("uses the canonical Codex thread id with its exact rollout path", () => {
		expect(
			resolveAmbientNativeIdentity({
				codexCurrentSession: {
					threadId: CODEX_UUID,
					transcriptPath: CODEX_PATH,
				},
			}),
		).toEqual({
			ok: true,
			value: {
				harness: "codex",
				harnessSessionId: CODEX_UUID.toLowerCase(),
				transcriptPath: CODEX_PATH,
			},
		});
	});

	it("returns null when no ambient native identity is present", () => {
		expect(resolveAmbientNativeIdentity({})).toEqual({ ok: true, value: null });
	});

	it("fails loudly when more than one harness identity is present", () => {
		const result = resolveAmbientNativeIdentity({
			claudeCodeSessionId: "claude-current",
			copilotCurrentSessionId: COPILOT_UUID,
		});
		expect(result).toMatchObject({ ok: false, code: "E-AMBIG" });
		if (!result.ok) {
			expect(result.message).toContain("claude");
			expect(result.message).toContain("copilot");
		}
	});
});

describe("planCurrentSessionDescriptor", () => {
	const existing: SessionDescriptor = {
		id: "pij-durable",
		folder: "/old",
		dataDir: "/home/.pij/pij-durable",
		eventsPath: "/home/.pij/pij-durable/events.ndjson",
		pid: 10,
		startedAt: "2026-07-01T00:00:00.000Z",
		state: "working",
		harness: "codex",
		harnessSessionId: CODEX_UUID.toLowerCase(),
		transcriptPath: "/old/rollout.jsonl",
		paneId: "%7",
		lifecycle: "bound",
		prime: true,
		failureReason: "dead",
	};

	it("preserves an existing pane-bound descriptor's push attachment", () => {
		expect(
			planCurrentSessionDescriptor({
				id: existing.id,
				identity: {
					harness: "codex",
					harnessSessionId: CODEX_UUID.toLowerCase(),
					transcriptPath: CODEX_PATH,
				},
				pijHome: "/home/.pij",
				folder: "/repo",
				pid: 99,
				startedAt: "2026-07-12T00:00:00.000Z",
				existing,
			}),
		).toMatchObject({
			id: "pij-durable",
			folder: "/old",
			dataDir: existing.dataDir,
			eventsPath: existing.eventsPath,
			pid: 10,
			startedAt: existing.startedAt,
			state: "working",
			harness: "codex",
			harnessSessionId: CODEX_UUID.toLowerCase(),
			transcriptPath: CODEX_PATH,
			lifecycle: "bound",
			prime: true,
			paneId: "%7",
		});
		const planned = planCurrentSessionDescriptor({
			id: existing.id,
			identity: {
				harness: "codex",
				harnessSessionId: CODEX_UUID.toLowerCase(),
				transcriptPath: CODEX_PATH,
			},
			pijHome: "/home/.pij",
			folder: "/repo",
			pid: 99,
			startedAt: "2026-07-12T00:00:00.000Z",
			existing,
		});
		expect(planned.deliveryMode).toBeUndefined();
		expect(planned.failureReason).toBeUndefined();
	});

	it("plans pull delivery when the reusable descriptor has no pane attachment", () => {
		const { paneId: _paneId, ...detached } = existing;
		const planned = planCurrentSessionDescriptor({
			id: detached.id,
			identity: {
				harness: "codex",
				harnessSessionId: CODEX_UUID.toLowerCase(),
				transcriptPath: CODEX_PATH,
			},
			pijHome: "/home/.pij",
			folder: "/repo",
			pid: 99,
			startedAt: "2026-07-12T00:00:00.000Z",
			existing: detached,
		});
		expect(planned).toMatchObject({
			id: "pij-durable",
			deliveryMode: "pull",
			lifecycle: "bound",
		});
		expect(planned.paneId).toBeUndefined();
	});
});

describe("resolveRegisteredAmbientSelf", () => {
	const identity = {
		harness: "claude",
		harnessSessionId: "claude-current",
	} as const;
	const descriptor = (id: string): SessionDescriptor => ({
		id,
		folder: "/repo",
		dataDir: `/home/.pij/${id}`,
		eventsPath: `/home/.pij/${id}/events.ndjson`,
		pid: 10,
		startedAt: "2026-07-12T00:00:00.000Z",
		harness: identity.harness,
		harnessSessionId: identity.harnessSessionId,
		lifecycle: "bound",
	});

	it("returns the durable reverse join when live metadata agrees", () => {
		expect(resolveRegisteredAmbientSelf(identity, [descriptor("pij-exact")], "pij-exact")).toEqual({
			ok: true,
			value: "pij-exact",
		});
	});

	it("fails loudly for duplicate or contradictory exact joins", () => {
		expect(
			resolveRegisteredAmbientSelf(
				identity,
				[descriptor("pij-first"), descriptor("pij-second")],
				"pij-first",
			),
		).toMatchObject({ ok: false, code: "E-AMBIG" });
		expect(
			resolveRegisteredAmbientSelf(identity, [descriptor("pij-live")], "pij-durable"),
		).toMatchObject({
			ok: false,
			code: "E-AMBIG",
		});
	});

	it("returns E-NOID when the ambient native tuple has no durable registration", () => {
		const result = resolveRegisteredAmbientSelf(identity, [], undefined);
		expect(result).toMatchObject({ ok: false, code: "E-NOID" });
		if (!result.ok) expect(result.message).toContain("pij inbox register");
	});
});
