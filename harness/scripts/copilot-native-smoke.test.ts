import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	fixtureReply,
	object,
	sendPrompt,
	smokeEnvironment,
	startFixtureProvider,
} from "./copilot-native-fixture.js";
import {
	captureSmokePanes,
	confirmSmokeToolInvocation,
	driveSmokeLifecycleCommand,
	driveSmokeTypingWitness,
	nativeComposer,
	nativeMessages,
	parseSmokeArgs,
	readNativeEvents,
	runSmoke,
	verifyNativeContextHeld,
	verifyNativeLifecycleIdentity,
	verifyOrdinaryUsability,
	verifyToolApproval,
	verifyWorkspaceTrustDiscriminator,
} from "./copilot-native-smoke.js";

const roots: string[] = [];
function temporary(): string {
	const root = mkdtempSync(join(tmpdir(), "copilot-proof-test-"));
	roots.push(root);
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const tools = [
	{ type: "function", function: { name: "pij_send", parameters: { type: "object" } } },
];

describe("native smoke fixture protocol", () => {
	it("requests only the advertised native tool, once per explicit marker", () => {
		const prompt = sendPrompt("pij-target", "nonce-1");
		const messages = [{ role: "user", content: prompt }];
		const first = fixtureReply({ messages, tools });
		const call = object((first.tool_calls as unknown[])[0]);
		expect(object(call.function)).toMatchObject({
			name: "pij_send",
			arguments: JSON.stringify({ to: "pij-target", message: "nonce-1" }),
		});
		expect(
			fixtureReply({
				messages: [...messages, first, { role: "tool", tool_call_id: call.id, content: "receipt" }],
				tools,
			}),
		).toEqual({ role: "assistant", content: "PIJ_NATIVE_DONE" });
		expect(
			fixtureReply({ messages: [{ role: "user", content: "ordinary incoming data" }], tools })
				.tool_calls,
		).toBeUndefined();
	});

	it("refuses a missing native tool instead of fabricating an outgoing reply", () => {
		expect(() =>
			fixtureReply({
				messages: [{ role: "user", content: sendPrompt("pij-target", "nonce") }],
				tools: [],
			}),
		).toThrow("PIJ_NATIVE_TOOL_MISSING");
		expect(() => fixtureReply({ messages: [] })).not.toThrow();
		expect(() => fixtureReply({ messages: "bad" })).toThrow("messages must be an array");
	});

	it("serves actual streaming and non-streaming OpenAI protocol with explicit failure", async () => {
		const fixture = await startFixtureProvider();
		try {
			const send = (body: unknown) =>
				fetch(`${fixture.url}/chat/completions`, { method: "POST", body: JSON.stringify(body) });
			const body = {
				messages: [{ role: "user", content: sendPrompt("pij-peer", "nonce") }],
				tools,
			};
			const response = await send(body);
			expect(response.status).toBe(200);
			expect(object(await response.json()).object).toBe("chat.completion");
			const streaming = await send({ ...body, stream: true });
			expect(streaming.headers.get("content-type")).toBe("text/event-stream");
			const events = (await streaming.text()).split("\n\n").filter(Boolean);
			expect(events.at(-1)).toBe("data: [DONE]");
			expect(events.join("\n")).toContain('"finish_reason":"tool_calls"');
			const failed = await send({ ...body, tools: [] });

			expect(failed.status).toBe(400);
			expect(await failed.text()).toContain("PIJ_NATIVE_TOOL_MISSING");
			expect((await fetch(`${fixture.url}/models`)).status).toBe(200);
			expect((await fetch(`${fixture.url}/unknown`)).status).toBe(404);
		} finally {
			await fixture.close();
		}
	});
});

describe("isolated native tool human approval", () => {
	const expected = { pane: "%3", to: "pij-original-sender", message: "PIJ_NATIVE_exact-nonce" };
	const args = { to: expected.to, message: expected.message };
	// Observed CLI modal structure; the transcript intentionally repeats the correct arguments.
	const dialog = (parameters: unknown = args) =>
		[
			`Previous user message ${JSON.stringify(args)}`,
			"╭────────────────╮",
			'│ Run extension tool "pij_send" │',
			"│ Send a message to a Pij peer. │",
			...JSON.stringify(parameters, null, 2)
				.split("\n")
				.map((line) => `│ ${line} │`),
			"│ │",
			"│ ❯ 1. Yes │",
			'│ 2. Yes, and approve "pij_send" for the rest of the session │',
			"│ 3. No │",
			"│ 4. No, and tell Copilot why... (Esc to stop) │",
			"│ │",
			"│ ↑/↓ to navigate · enter to select · esc to cancel │",
			"╰────────────────╯",
		].join("\n");
	const welcome = object(
		JSON.parse(
			readFileSync(new URL("./fixtures/copilot-native-welcome.json", import.meta.url), "utf8"),
		),
	);
	const welcomeTerminal = String(welcome.terminal);
	const incomplete = dialog().replace("╰────────────────╯", "");

	it("recognizes the retained real welcome panel as history above the composer", () => {
		const nativeExpected = object(welcome.expected);
		expect(
			verifyToolApproval(welcomeTerminal, {
				to: String(nativeExpected.to),
				message: String(nativeExpected.message),
			}),
		).toBe(false);
		expect(nativeComposer(welcomeTerminal)).toBe("");
	});
	it.each([
		welcomeTerminal,
		`${dialog()}\n❯ ordinary composer`,
		incomplete,
		dialog().replace("╭────────────────╮", "╭────"),
		dialog().replace("╰────────────────╯", "╰────"),
	])("waits boundedly without keys on non-active boxes or incomplete repaint", async (terminal) => {
		const keys: string[][] = [];
		const witness: Record<string, unknown> = {};
		await expect(
			confirmSmokeToolInvocation(
				(command) => {
					if (command[0] === "send-keys") keys.push(command);
					return terminal;
				},
				expected,
				1,
				witness,
			),
		).rejects.toThrow("PIJ_NATIVE_TIMEOUT");
		expect(keys).toEqual([]);
		expect(witness.decision).toBe("withhold");
	});
	it("matches only the active bottom dialog after welcome and transcript boxes", () => {
		expect(verifyToolApproval(`${welcomeTerminal}\n${dialog()}`, args)).toBe(true);
		expect(
			verifyToolApproval(`${dialog({ ...args, to: "historic-peer" })}\n${dialog()}`, args),
		).toBe(true);
	});
	it.each([
		dialog({ ...args, to: "wrong-active-peer" }),
		dialog().replace('Run extension tool "pij_send"', "Confirm folder trust"),
	])("still refuses a complete mismatching active dialog below welcome", (active) => {
		expect(() => verifyToolApproval(`${welcomeTerminal}\n${active}`, args)).toThrow(
			"PIJ_NATIVE_UNEXPECTED_APPROVAL",
		);
	});
	it("waits through welcome and incomplete repaint before two exact confirmations", async () => {
		const frames = [welcomeTerminal, incomplete, dialog(), dialog(), welcomeTerminal];
		const keys: string[][] = [];
		await confirmSmokeToolInvocation(
			(command) => {
				if (command[0] === "capture-pane") return frames.shift() ?? welcomeTerminal;
				expect(frames).toHaveLength(1);
				keys.push(command);
				return "";
			},
			expected,
			2000,
			{},
		);
		expect(keys).toEqual([["send-keys", "-t", expected.pane, "Enter"]]);
	});
	it.each([
		incomplete,
		welcomeTerminal,
	])("retries a pre-key repaint or vanished dialog without approval", async (repaint) => {
		const frames = [dialog(), repaint, dialog(), dialog(), welcomeTerminal];
		const keys: string[][] = [];
		await confirmSmokeToolInvocation(
			(command) => {
				if (command[0] === "capture-pane") return frames.shift() ?? welcomeTerminal;
				expect(frames).toHaveLength(1);
				keys.push(command);
				return "";
			},
			expected,
			2000,
			{},
		);
		expect(keys).toHaveLength(1);
	});
	it("does not equate a post-key incomplete repaint with dismissal", async () => {
		const frames = [dialog(), dialog(), incomplete];
		const keys: string[][] = [];
		const witness: Record<string, unknown> = {};
		await expect(
			confirmSmokeToolInvocation(
				(command) => {
					if (command[0] === "capture-pane") return frames.shift() ?? incomplete;
					keys.push(command);
					return "";
				},
				expected,
				1,
				witness,
			),
		).rejects.toThrow("PIJ_NATIVE_TIMEOUT");
		expect(keys).toHaveLength(1);
		expect(witness).toMatchObject({ status: "failed", after_input: incomplete });
	});
	it("fails a complete unknown dialog after a post-key repaint without another key", async () => {
		const unknown = dialog().replace('Run extension tool "pij_send"', "Confirm folder trust");
		const frames = [dialog(), dialog(), incomplete, unknown];
		const keys: string[][] = [];
		await expect(
			confirmSmokeToolInvocation(
				(command) => {
					if (command[0] === "capture-pane") return frames.shift() ?? unknown;
					keys.push(command);
					return "";
				},
				expected,
				1,
				{},
			),
		).rejects.toThrow("PIJ_NATIVE_UNEXPECTED_APPROVAL");
		expect(keys).toHaveLength(1);
	});

	it("approves once only after two exact matches and retains before/after screens", async () => {
		const before = dialog({ message: expected.message, to: expected.to });
		const after = "PIJ_NATIVE_DONE\n❯";
		const frames = [before, before, before, after];
		const commands: string[][] = [];
		const witness: Record<string, unknown> = {};
		await confirmSmokeToolInvocation(
			(command) => {
				commands.push(command);
				if (command[0] === "capture-pane") return frames.shift() ?? after;
				expect(witness.before).toBe(before);
				expect(witness.before_confirm).toBe(before);
				return "";
			},
			expected,
			1,
			witness,
		);
		expect(commands.filter((command) => command[0] === "send-keys")).toEqual([
			["send-keys", "-t", expected.pane, "Enter"],
		]);
		expect(witness).toMatchObject({
			kind: "native-tool-human-approval",
			expected,
			status: "dismissed",
			decision: "approve-once",
			keys: ["Enter"],
			before,
			before_confirm: before,
			after_input: before,
			after,
		});
	});

	it("accepts immediate dismissal without another capture or approval key", async () => {
		const after = "PIJ_NATIVE_DONE\n❯";
		const frames = [dialog(), dialog(), after];
		const commands: string[][] = [];
		const witness: Record<string, unknown> = {};
		await confirmSmokeToolInvocation(
			(command) => {
				commands.push(command);
				if (command[0] !== "capture-pane") return "";
				const frame = frames.shift();
				if (frame === undefined) throw new Error("capture after observed dismissal");
				return frame;
			},
			expected,
			1,
			witness,
		);
		expect(commands.filter((command) => command[0] === "send-keys")).toEqual([
			["send-keys", "-t", expected.pane, "Enter"],
		]);
		expect(witness).toMatchObject({
			status: "dismissed",
			confirmation_sent: true,
			after_input: after,
			after,
		});
	});

	it.each([
		["wrong peer despite correct transcript", dialog({ ...args, to: "pij-wrong-peer" })],
		[
			"wrong nonce despite correct transcript",
			dialog({ ...args, message: `${args.message}-extra` }),
		],
		["extra arguments", dialog({ ...args, permission: "all" })],
		[
			"unknown tool",
			dialog().replace('Run extension tool "pij_send"', 'Run extension tool "shell"'),
		],
		["unknown dialog", dialog().replace('Run extension tool "pij_send"', "Confirm folder trust")],
		[
			"session approval selected",
			dialog().replace("❯ 1. Yes", "1. Yes").replace("│ 2. Yes", "│ ❯ 2. Yes"),
		],
		["missing selection", dialog().replace("❯ 1. Yes", "1. Yes")],
		["malformed JSON", dialog().replace('│   "to":', '│   "to" INVALID:')],
		["missing arguments", dialog().replace("│ { │", "│ missing │")],
		[
			"multiple argument objects",
			dialog().replace("│ ❯ 1. Yes │", '│ { │\n│ "to": "wrong" │\n│ } │\n│ ❯ 1. Yes │'),
		],
	])("rejects %s without pressing any key", async (_label, terminal) => {
		const commands: string[][] = [];
		const witness: Record<string, unknown> = {};
		await expect(
			confirmSmokeToolInvocation(
				(command) => {
					commands.push(command);
					return terminal;
				},
				expected,
				1,
				witness,
			),
		).rejects.toThrow("PIJ_NATIVE_UNEXPECTED_APPROVAL");
		expect(commands.every((command) => command[0] === "capture-pane")).toBe(true);
		expect(witness).toMatchObject({ status: "failed", before: terminal });
		expect(witness.decision).toBe("withhold");
	});

	it("rejects changed arguments at the last pre-key capture", async () => {
		const before = dialog();
		const changed = dialog({ ...args, to: "pij-wrong-peer" });
		const frames = [before, changed];
		const commands: string[][] = [];
		const witness: Record<string, unknown> = {};
		await expect(
			confirmSmokeToolInvocation(
				(command) => {
					commands.push(command);
					return frames.shift() ?? changed;
				},
				expected,
				1,
				witness,
			),
		).rejects.toThrow("PIJ_NATIVE_UNEXPECTED_APPROVAL");
		expect(commands.every((command) => command[0] === "capture-pane")).toBe(true);
		expect(witness).toMatchObject({ status: "failed", before, before_confirm: changed });
	});

	it.each([
		["unknown dialog", dialog().replace('Run extension tool "pij_send"', "Confirm folder trust")],
		["malformed dialog", dialog().replace('│   "to":', '│   "to" INVALID:')],
	])("fails %s immediately after the one-time confirmation", async (_label, terminal) => {
		const frames = [dialog(), dialog(), terminal, "ordinary composer"];
		const commands: string[][] = [];
		const witness: Record<string, unknown> = {};
		await expect(
			confirmSmokeToolInvocation(
				(command) => {
					commands.push(command);
					return command[0] === "capture-pane" ? (frames.shift() ?? "ordinary composer") : "";
				},
				expected,
				1,
				witness,
			),
		).rejects.toThrow("PIJ_NATIVE_UNEXPECTED_APPROVAL");
		expect(commands.filter((command) => command[0] === "send-keys")).toHaveLength(1);
		expect(witness).toMatchObject({ status: "failed", after_input: terminal });
	});

	it("times out without a modal and never resends approval if dismissal stalls", async () => {
		expect(verifyToolApproval(`Previous user ${JSON.stringify(args)}\n❯`, args)).toBe(false);
		for (const terminal of ["ordinary composer", dialog()]) {
			const commands: string[][] = [];
			const witness: Record<string, unknown> = {};
			await expect(
				confirmSmokeToolInvocation(
					(command) => {
						commands.push(command);
						return terminal;
					},
					expected,
					1,
					witness,
				),
			).rejects.toThrow("PIJ_NATIVE_TIMEOUT");
			expect(commands.filter((command) => command[0] === "send-keys")).toHaveLength(
				terminal === "ordinary composer" ? 0 : 1,
			);
			expect(witness.status).toBe("failed");
		}
	});

	it("retains capture failures after confirmation without pressing again", async () => {
		const commands: string[][] = [];
		const witness: Record<string, unknown> = {};
		await expect(
			confirmSmokeToolInvocation(
				(command) => {
					commands.push(command);
					if (commands.length > 3) throw new Error("pane exited after consent");
					return dialog();
				},
				expected,
				1,
				witness,
			),
		).rejects.toThrow("pane exited after consent");
		expect(commands.filter((command) => command[0] === "send-keys")).toHaveLength(1);
		expect(witness).toMatchObject({ decision: "approve-once", status: "failed", before: dialog() });
	});
});

describe("native lifecycle assertion boundaries, not live CLI proof", () => {
	const composer = (text = "") =>
		`Previous user /new\n╻▄▄▄▄▄▄\n┃  ${text}\n╹▀▀▀▀▀▀\n← open sidebar · / commands`;
	const dialog = "╭────────╮\n│ Confirm folder trust │\n╰────────╯";

	it.each([
		"newSession",
		"exit",
	] as const)("stages and submits only the documented %s command", async (action) => {
		const command = action === "newSession" ? "/new" : "/exit";
		const frames = [composer(), composer(command), composer(command), composer()];
		const keys: string[][] = [];
		const witness: Record<string, unknown> = {};
		let heldBeforeSubmit = false;
		await driveSmokeLifecycleCommand(
			(args) => {
				if (args[0] === "capture-pane") return frames.shift() ?? composer();
				if (args.at(-1) === "Enter") expect(heldBeforeSubmit).toBe(true);
				keys.push(args);
				return "";
			},
			{ pane: "%9", action },
			1,
			witness,
			async () => {
				expect(keys).toEqual([["send-keys", "-t", "%9", "-l", "--", command]]);
				heldBeforeSubmit = true;
			},
		);
		expect(keys).toEqual([
			["send-keys", "-t", "%9", "-l", "--", command],
			["send-keys", "-t", "%9", "Enter"],
		]);
		expect(witness).toMatchObject({
			command,
			before: composer(),
			staged: composer(command),
			before_submit: composer(command),
			after: composer(),
			command_submitted: true,
		});
	});

	it("uses only the composer and rejects unknown dialogs and existing drafts without keys", async () => {
		expect(nativeComposer(composer("/exit"))).toBe("/exit");
		expect(nativeComposer("Previous user /new")).toBeUndefined();
		for (const terminal of [dialog, composer("human draft")]) {
			const keys: string[][] = [];
			const witness: Record<string, unknown> = {};
			await expect(
				driveSmokeLifecycleCommand(
					(args) => {
						if (args[0] === "send-keys") keys.push(args);
						return terminal;
					},
					{ pane: "%9", action: "newSession" },
					1,
					witness,
				),
			).rejects.toThrow(/PIJ_NATIVE_/);
			expect(keys).toEqual([]);
			expect(witness).toMatchObject({ status: "failed", before: terminal });
		}
	});

	it.each([
		composer("/exit"),
		dialog,
	])("does not submit a changed staged control", async (changed) => {
		const frames = [composer(), composer("/new"), changed];
		const keys: string[][] = [];
		await expect(
			driveSmokeLifecycleCommand(
				(args) => {
					if (args[0] === "capture-pane") return frames.shift() ?? changed;
					keys.push(args);
					return "";
				},
				{ pane: "%9", action: "newSession" },
				1,
				{},
			),
		).rejects.toThrow(/PIJ_NATIVE_/);
		expect(keys).toEqual([["send-keys", "-t", "%9", "-l", "--", "/new"]]);
	});

	it("retains an exited pane capture error without claiming host death", async () => {
		const frames = [composer(), composer("/exit"), composer("/exit")];
		const witness: Record<string, unknown> = {};
		await driveSmokeLifecycleCommand(
			(args) => {
				if (args[0] !== "capture-pane") return "";
				const frame = frames.shift();
				if (frame === undefined) throw new Error("owned pane exited");
				return frame;
			},
			{ pane: "%9", action: "exit" },
			1,
			witness,
		);
		expect(witness).toMatchObject({
			command_submitted: true,
			after_capture_error: "Error: owned pane exited",
			status: "submitted-not-yet-lifecycle-proven",
		});
		expect(witness.host_death).toBeUndefined();
	});

	const previous = {
		id: "pij-old",
		session: "00000000-0000-4000-8000-000000000137",
		pane: "%9",
		harness: "copilot",
		native_extension_delivery: true,
		proc: { pid: 137, proc_start: 1 },
	};
	const successor = { ...previous, id: "pij-new", session: "00000000-0000-4000-8000-000000000138" };
	it("requires a new address on /new but stable identity on fresh-host resume", () => {
		expect(() => verifyNativeLifecycleIdentity(previous, successor, "new")).not.toThrow();
		expect(() =>
			verifyNativeLifecycleIdentity(
				successor,
				{ ...successor, proc: { pid: 138, proc_start: 2 } },
				"resume",
			),
		).not.toThrow();
	});
	it.each([
		{ ...successor, session: previous.session },
		{ ...successor, id: previous.id },
		{ ...successor, pane: "%10" },
		{ ...successor, proc: { pid: 138, proc_start: 2 } },
		{ ...successor, native_extension_delivery: false },
	])("rejects untruthful /new registration", (current) => {
		expect(() => verifyNativeLifecycleIdentity(previous, current, "new")).toThrow();
	});
	it.each([
		previous,
		{ ...previous, id: "different", proc: { pid: 138, proc_start: 2 } },
		{ ...previous, session: successor.session, proc: { pid: 138, proc_start: 2 } },
	])("rejects fake or identity-changing resume", (current) => {
		expect(() => verifyNativeLifecycleIdentity(previous, current, "resume")).toThrow();
	});

	const expected = {
		seat: previous.id,
		session: previous.session,
		msgId: "old-id",
		nonce: "OLD_CONTEXT_NONCE",
	};
	const payload = {
		to: previous.id,
		native_target_session: previous.session,
		msg_id: expected.msgId,
		body: expected.nonce,
	};
	const job = { state: "pending", payload: JSON.stringify(payload) };
	const held = {
		jobs: [job],
		acknowledgements: [],
		predecessorEvents: [],
		successorEvents: [],
		successorJobs: [],
	};
	const oldEvent = {
		id: "event",
		type: "user.message",
		data: { content: expected.nonce, messageId: "native-id" },
	};
	it("accepts only preserved unacknowledged old-context work", () => {
		expect(() => verifyNativeContextHeld(expected, held)).not.toThrow();
	});
	it.each([
		{ jobs: [] },
		{ jobs: [{ ...job, state: "done" }] },
		{ acknowledgements: [{ recipient: successor.id, msg_id: expected.msgId }] },
		{ predecessorEvents: [oldEvent] },
		{ successorEvents: [oldEvent] },
		{ successorJobs: [job] },
	])("rejects lost, consumed, acknowledged or migrated old-context work", (changed) => {
		expect(() => verifyNativeContextHeld(expected, { ...held, ...changed })).toThrow();
	});
	it.each([
		"to",
		"native_target_session",
		"msg_id",
		"body",
	] as const)("rejects changed old-context %s", (field) => {
		expect(() =>
			verifyNativeContextHeld(expected, {
				...held,
				jobs: [{ ...job, payload: JSON.stringify({ ...payload, [field]: "changed" }) }],
			}),
		).toThrow();
	});
});

describe("AC6 unchanged-draft witness boundaries, not live CLI proof", () => {
	const seat = {
		id: "pij-target",
		session: "00000000-0000-4000-8000-000000000137",
		pane: "%9",
		harness: "copilot",
		proc: { pid: 137, proc_start: 1370 },
		native_extension_delivery: true,
	};
	const expected = { seat, draft: "HUMAN_DRAFT_137", nonce: "PIJ_HELD_137", msgId: "msg-137" };
	const composer = (draft: string) => `Transcript\n╻▄▄▄▄▄▄\n┃ ${draft}\n╹▀▀▀▀▀▀`;
	const sensor = (retry: number, at = 100000) => ({
		state: "observed",
		native_consumer: { native_session: seat.session, ...seat.proc },
		typing_grace_ms: 60000,
		observed_at_ms: at,
		retry_after_ms: retry,
		semantic_hold: false,
		source: "pane-observed-edit-recency",
	});
	const event = (seq: number, kind: string, payload: Record<string, unknown>) => ({
		seq,
		at: 100000 + seq,
		kind,
		seat: seat.id,
		payload: JSON.stringify({ seat: seat.id, msg_id: expected.msgId, ...payload }),
	});
	const heldEvent = event(1, "delivery.held", { reason: "human-typing", since_ms: 99000 });
	const releasedEvent = event(2, "delivery.released", { at_ms: 159000 });
	const ackEvent = {
		seq: 3,
		at: 159001,
		kind: "delivery.inbox-ack",
		seat: seat.id,
		payload: JSON.stringify({
			job_id: 137,
			authenticated_machine: "local",
			evidence_grade: "machine",
			outcome: "reader-read",
		}),
	};
	const job = {
		id: 137,
		state: "pending",
		payload: JSON.stringify({
			to: seat.id,
			msg_id: expected.msgId,
			body: expected.nonce,
			native_target_session: seat.session,
		}),
	};
	const acceptedEvent = {
		id: "native-event",
		type: "user.message",
		data: {
			content: expected.nonce,
			messageId: "native-message",
		},
	};
	const ack = { recipient: seat.id, msg_id: expected.msgId, origin: "reader-read" };
	type Sample = Awaited<ReturnType<Parameters<typeof driveSmokeTypingWitness>[0]["observe"]>>;
	const sample = (overrides: Partial<Sample> = {}): Sample => ({
		sensor: sensor(59000),
		jobs: [job],
		acknowledgements: [],
		nativeEvents: [],
		deliveryEvents: [heldEvent],
		...overrides,
	});
	const samples = () => [
		sample({ jobs: [], deliveryEvents: [] }),
		sample(),
		sample({ sensor: sensor(0, 159000), deliveryEvents: [heldEvent, releasedEvent] }),
		sample({
			sensor: sensor(0, 159001),
			jobs: [{ ...job, state: "done" }],
			nativeEvents: [acceptedEvent],
			acknowledgements: [ack],
			deliveryEvents: [heldEvent, releasedEvent, ackEvent],
		}),
	];
	async function run(observations = samples(), changedDraft?: string) {
		let draft = "";
		let sends = 0;
		const keys: string[][] = [];
		const witness: Record<string, unknown> = {};
		const result = driveSmokeTypingWitness(
			{
				tmux(args: string[]) {
					if (args[0] === "capture-pane") return composer(draft);
					keys.push(args);
					draft = args.at(-1) === "C-u" ? "" : String(args.at(-1));
					return "";
				},
				async observe() {
					const next = observations.shift();
					if (!next) throw new Error("proof snapshots exhausted");
					if (changedDraft !== undefined && observations.length === 0) draft = changedDraft;
					return next;
				},
				async send() {
					sends++;
					return { outcome: "queued" };
				},
			},
			expected,
			1,
			witness,
		);
		return { result, keys, witness, sends: () => sends };
	}
	it("observes hold then expiry/release and one acceptance without clearing the draft", async () => {
		const proof = await run();
		await proof.result;
		expect(proof.sends()).toBe(1);
		expect(proof.keys).toEqual([["send-keys", "-t", seat.pane, "-l", "--", expected.draft]]);
		expect(proof.witness).toMatchObject({
			status: "passed",
			draft: expected.draft,
			grade: "native-accepted-not-model-complete",
			after: composer(expected.draft),
		});
	});
	it.each([
		"",
		"HUMAN_DRAFT_corrupted",
		`${expected.draft}${expected.nonce}`,
	])("rejects cleared or corrupted composer even after native acceptance: %s", async (draft) => {
		const proof = await run(samples(), draft);
		await expect(proof.result).rejects.toThrow(/PIJ_NATIVE_TYPING_PROOF/);
		expect(proof.keys).toHaveLength(1);
	});
	it.each([
		{ state: "unavailable" },
		{ state: "unknown" },
		{ semantic_hold: true },
		{ native_consumer: { native_session: "stale", ...seat.proc } },
		{ native_consumer: { native_session: seat.session, pid: 138, proc_start: 1370 } },
		{ native_consumer: { native_session: seat.session, pid: 137, proc_start: 1371 } },
		{ typing_grace_ms: 0 },
		{ retry_after_ms: -1 },
		{ retry_after_ms: 60001 },
		{ retry_after_ms: 0 },
		{ source: "invented-native-api" },
	])("rejects unavailable, stale, unheld or malformed initial sensor %j", async (changed) => {
		const observations = samples();
		observations[0] = sample({ sensor: { ...sensor(59000), ...changed } });
		const proof = await run(observations);
		await expect(proof.result).rejects.toThrow(/PIJ_NATIVE_TYPING_PROOF/);
		expect(proof.sends()).toBe(0);
	});
	it.each([
		{ deliveryEvents: [] },
		{ jobs: [] },
		{ jobs: [{ ...job, state: "done" }] },
		{ acknowledgements: [ack] },
		{ nativeEvents: [acceptedEvent] },
		{
			deliveryEvents: [
				event(1, "delivery.held", { msg_id: "wrong", reason: "human-typing", since_ms: 99000 }),
			],
		},
		{ deliveryEvents: [event(1, "delivery.held", { reason: "semantic-hold", since_ms: 99000 })] },
	])("rejects missing hold evidence, lost work or premature acceptance %j", async (changed) => {
		const observations = samples();
		observations[1] = sample(changed);
		const proof = await run(observations);
		await expect(proof.result).rejects.toThrow(/PIJ_NATIVE_(?:TYPING_PROOF|TIMEOUT)/);
	});
	it.each([
		{ nativeEvents: [acceptedEvent, { ...acceptedEvent, id: "duplicate-event" }] },
		{ acknowledgements: [ack, ack] },
		{ acknowledgements: [{ ...ack, origin: "tmux" }] },
		{ deliveryEvents: [heldEvent, releasedEvent] },
		{ deliveryEvents: [heldEvent, releasedEvent, { ...ackEvent, seq: 1 }] },
		{
			deliveryEvents: [
				heldEvent,
				releasedEvent,
				{ ...ackEvent, payload: JSON.stringify({ job_id: 138, outcome: "reader-read" }) },
			],
		},
		{ deliveryEvents: [heldEvent, releasedEvent, ackEvent, { ...ackEvent, seq: 4 }] },
		{ deliveryEvents: [heldEvent] },
		{ deliveryEvents: [heldEvent, event(0, "delivery.released", { at_ms: 159000 })] },
		{ deliveryEvents: [heldEvent, event(2, "delivery.released", { at_ms: 100001 })] },
		{
			deliveryEvents: [
				heldEvent,
				event(2, "delivery.released", { msg_id: "wrong", at_ms: 159000 }),
			],
		},
	])("rejects duplicate acceptance or uncorrelated/premature release %j", async (changed) => {
		const observations = samples();
		observations[3] = { ...sample(), ...observations[3], ...changed };
		const proof = await run(observations);
		await expect(proof.result).rejects.toThrow(/PIJ_NATIVE_(?:TYPING_PROOF|TIMEOUT)/);
	});
	it("rejects an early release hidden by an unrelated old hold timestamp", async () => {
		const observations = samples().map((value) => ({
			...value,
			deliveryEvents: value.deliveryEvents.map((row) =>
				row.kind === "delivery.held"
					? event(1, "delivery.held", { reason: "human-typing", since_ms: 0 })
					: row.kind === "delivery.released"
						? event(2, "delivery.released", { at_ms: 100001 })
						: row,
			),
		}));
		const proof = await run(observations);
		await expect(proof.result).rejects.toThrow(/PIJ_NATIVE_TYPING_PROOF/);
	});
	it("rechecks a positive sensor when later receipt reads cross the expiry boundary", async () => {
		const observations = samples();
		observations[2] = sample({
			sensor: sensor(1, 158999),
			nativeEvents: [acceptedEvent],
			acknowledgements: [ack],
			deliveryEvents: [heldEvent, releasedEvent, ackEvent],
			jobs: [{ ...job, state: "done" }],
		});
		observations.push({ ...sample(), ...observations[3] });
		const proof = await run(observations);
		await proof.result;
		expect(proof.witness).toMatchObject({ status: "passed" });
		expect(proof.sends()).toBe(1);
	});
	it("rejects an early release even when a later release satisfies the deadline", async () => {
		const observations = samples();
		observations[3] = {
			...sample(),
			...observations[3],
			deliveryEvents: [
				heldEvent,
				event(2, "delivery.released", { at_ms: 100001 }),
				event(3, "delivery.released", { at_ms: 159000 }),
				{ ...ackEvent, seq: 4 },
			],
		};
		const proof = await run(observations);
		await expect(proof.result).rejects.toThrow(/PIJ_NATIVE_TYPING_PROOF/);
	});
	it("uses a nondefault daemon grace rather than a second policy constant", async () => {
		const observations = samples().map((value, index) => ({
			...value,
			sensor: {
				...sensor(index < 2 ? 234 : 0, index < 2 ? 100000 : 100234 + index - 2),
				typing_grace_ms: 1234,
			},
			deliveryEvents: value.deliveryEvents.map((row) =>
				row.kind === "delivery.released" ? event(2, "delivery.released", { at_ms: 100234 }) : row,
			),
		}));
		const proof = await run(observations);
		await proof.result;
		expect(proof.sends()).toBe(1);
	});
	it.each([
		{ sensor: sensor(0, 100001) },
		{ sensor: { ...sensor(0, 159000), typing_grace_ms: 60001 } },
		{ sensor: { ...sensor(0, 159000), state: "unavailable" } },
		{ sensor: sensor(1, 158999), nativeEvents: [acceptedEvent] },
	])("rejects early expiry, changed grace, unavailable sensor or pre-expiry acceptance %j", async (changed) => {
		const observations = samples();
		observations[2] = sample(changed);
		if ("nativeEvents" in changed) observations.splice(3, 0, sample(changed));
		const proof = await run(observations);
		await expect(proof.result).rejects.toThrow(/PIJ_NATIVE_TYPING_PROOF/);
	});
});

describe("native witness boundaries", () => {
	it("captures all final panes before cleanup and preserves individual capture errors", () => {
		const commands: string[][] = [];
		const result = captureSmokePanes((args) => {
			commands.push(args);
			if (args[0] === "list-panes") return "%1 101 node\n%2 102 node\n%3 103 node";
			if (args.at(-1) === "%2") throw new Error("pane exited");
			return args.at(-1) === "%1" ? "Confirm folder trust" : "[pij native] unavailable: offline";
		});
		expect(result.panes).toBe("%1 101 node\n%2 102 node\n%3 103 node");
		expect(result.captures).toEqual([
			{ pane: "%1", terminal: "Confirm folder trust" },
			{ pane: "%2", error: "Error: pane exited" },
			{ pane: "%3", terminal: "[pij native] unavailable: offline" },
		]);
		expect(commands.slice(1).every((args) => args.includes("-2000"))).toBe(true);
	});

	it("requires ordinary native usability and exactly one actionable outage diagnostic", () => {
		const user = {
			id: "user-event",
			type: "user.message",
			data: { content: "ordinary-nonce", messageId: "user-native", interactionId: "turn-a" },
		};
		const assistant = {
			id: "assistant-event",
			type: "assistant.message",
			data: {
				content: "PIJ_NATIVE_OBSERVED",
				messageId: "assistant-native",
				interactionId: "turn-a",
			},
		};
		const diagnostic = "[pij native] unavailable: start the daemon";
		expect(() =>
			verifyOrdinaryUsability([user, assistant], "ordinary-nonce", diagnostic),
		).not.toThrow();
		expect(() => verifyOrdinaryUsability([user], "ordinary-nonce", diagnostic)).toThrow(
			"same native interaction",
		);
		expect(() =>
			verifyOrdinaryUsability(
				[user, { ...assistant, data: { ...assistant.data, interactionId: "other-turn" } }],
				"ordinary-nonce",
				diagnostic,
			),
		).toThrow("same native interaction");
		expect(() => verifyOrdinaryUsability([user, assistant], "ordinary-nonce", "")).toThrow(
			"one diagnostic",
		);
		expect(() =>
			verifyOrdinaryUsability([user, assistant], "ordinary-nonce", `${diagnostic}\n${diagnostic}`),
		).toThrow("one diagnostic");
		const positive = {
			run: "/fresh-seeded",
			isolation: {
				home: "/fresh-seeded/home",
				workspace: "/fresh-seeded/workspace",
				trust_config_before: '{"trustedFolders":["/fresh-seeded/workspace"]}',
			},
			witnesses: [
				{
					kind: "daemon-key-absent-ordinary-use",
					events: [user, assistant],
					nonce: "ordinary-nonce",
					terminal: diagnostic,
					daemon_started: false,
					key_present: false,
				},
			],
		};
		const negative = {
			run: "/fresh-prompt",
			isolation: {
				home: "/fresh-prompt/home",
				workspace: "/fresh-prompt/workspace",
				trust_config_before: null,
			},
			witnesses: [],
			fixture_requests: [],
			final_pane_captures: [
				{ pane: "%1", terminal: "Confirm folder trust\n/fresh-prompt/workspace" },
			],
		};
		expect(() => verifyWorkspaceTrustDiscriminator(positive, negative)).not.toThrow();
		expect(() =>
			verifyWorkspaceTrustDiscriminator(positive, { ...negative, isolation: positive.isolation }),
		).toThrow("distinct private HOMEs");
		expect(() =>
			verifyWorkspaceTrustDiscriminator(positive, {
				...negative,
				fixture_requests: ["POST /v1/chat/completions"],
			}),
		).toThrow("no provider activity");
		expect(() =>
			verifyWorkspaceTrustDiscriminator(positive, {
				...negative,
				final_pane_captures: [{ terminal: "Confirm folder trust\n/other-workspace" }],
			}),
		).toThrow("exact isolated workspace");
		expect(() =>
			verifyWorkspaceTrustDiscriminator({ ...positive, witnesses: [] }, negative),
		).toThrow("ordinary-use witness");
		expect(() =>
			verifyWorkspaceTrustDiscriminator(
				{ ...positive, isolation: { ...positive.isolation, trust_config_before: null } },
				negative,
			),
		).toThrow("seeded native config");
		expect(() =>
			verifyWorkspaceTrustDiscriminator(
				{
					...positive,
					isolation: { ...positive.isolation, trust_config_before: '{"trustedFolders":["/"]}' },
				},
				negative,
			),
		).toThrow("only the isolated workspace");
		expect(() =>
			verifyWorkspaceTrustDiscriminator(positive, {
				...negative,
				isolation: { ...negative.isolation, trust_config_before: "{}" },
			}),
		).toThrow("without native config");
		expect(() =>
			verifyWorkspaceTrustDiscriminator(positive, {
				...negative,
				final_pane_captures: [{ terminal: "Confirm folder trust\n/fresh-prompt/workspace-other" }],
			}),
		).toThrow("exact isolated workspace");
	});
	it("manual launch drops identity and SDK context, only real mode inherits auth in memory", () => {
		const inherited = {
			PATH: "/bin",
			PIJ_SESSION_ID: "real-seat",
			PIJ_SPAWN_ID: "real-spawn",
			TMUX: "live-socket",
			COPILOT_AGENT_SESSION_ID: "live-native",
			COPILOT_PROVIDER_BASE_URL: "http://foreign",
			COPILOT_PROVIDER_API_KEY: "foreign-secret",
			GH_TOKEN: "real-secret",
			NODE_OPTIONS: "--import=evil.js",
		};
		const local = smokeEnvironment(
			inherited,
			"/fixture/home",
			"/fixture/config",
			"/fixture/state",
			"127.0.0.1:1234",
			"local",
		);
		expect(local).toMatchObject({
			HOME: "/fixture/home",
			COPILOT_HOME: "/fixture/config",
			PIJ_RS_ADDR: "127.0.0.1:1234",
			PIJ_RS_STATE_DIR: "/fixture/state",
			COPILOT_OFFLINE: "true",
		});
		for (const key of [
			"PIJ_SESSION_ID",
			"PIJ_SPAWN_ID",
			"TMUX",
			"COPILOT_AGENT_SESSION_ID",
			"COPILOT_PROVIDER_BASE_URL",
			"COPILOT_PROVIDER_API_KEY",
			"GH_TOKEN",
			"NODE_OPTIONS",
		])
			expect(local[key]).toBeUndefined();
		const real = smokeEnvironment(inherited, "/h", "/c", "/s", "127.0.0.1:1234", "real");
		expect(real.GH_TOKEN).toBe("real-secret");
		expect(real.COPILOT_OFFLINE).toBe("false");
	});

	it("counts only actual native user messages, retains IDs, ignores partial final writes", () => {
		const path = join(temporary(), "events.jsonl");
		writeFileSync(
			path,
			[
				JSON.stringify({
					id: "assistant-id",
					type: "assistant.message",
					data: { content: "nonce" },
				}),
				JSON.stringify({
					id: "user-id",
					type: "user.message",
					data: { content: "[pij from peer]\nnonce" },
				}),
				'{"id":"partial',
			].join("\n"),
		);
		expect(nativeMessages(readNativeEvents(path), "nonce")).toEqual([
			{ id: "user-id", type: "user.message", data: { content: "[pij from peer]\nnonce" } },
		]);
		writeFileSync(path, '{"type":"user.message","data":{"content":"nonce"}}\n');
		expect(() => readNativeEvents(path)).toThrow("native event must have its real event id");
	});

	it("rejects ambiguous CLI inputs and never upgrades a missing binary to success", async () => {
		expect(() => parseSmokeArgs(["--provider", "fake"])).toThrow();
		expect(() => parseSmokeArgs(["--mode"])).toThrow();
		expect(() => parseSmokeArgs(["--timeout-seconds", "NaN"])).toThrow();
		expect(parseSmokeArgs([]).workspaceTrust).toBe("seeded");
		expect(parseSmokeArgs(["--workspace-trust", "prompt"]).workspaceTrust).toBe("prompt");
		expect(() => parseSmokeArgs(["--workspace-trust", "all"])).toThrow();
		const root = temporary();
		const output = join(root, "receipt.json");
		const options = parseSmokeArgs(["--pij-bin", join(root, "missing"), "--output", output]);
		const result = await runSmoke(options);
		expect(result.code).toBe(2);
		const receipt = JSON.parse(readFileSync(output, "utf8"));
		expect(receipt).toMatchObject({
			status: "prerequisite-missing",
			provider: "deterministic-local-fixture-not-real-inference",
			witnesses: [],
		});
		expect(receipt.error).toContain("PIJ_NATIVE_PREREQUISITE_BINARY");
		roots.push(receipt.run);
		await expect(runSmoke(options)).rejects.toThrow("refusing to overwrite receipt");
	});
});
