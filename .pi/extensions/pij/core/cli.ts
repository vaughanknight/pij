// pij-messaging — pure CLI core (Pattern P2: pi-free; P4: tagged-union returns;
// P8: the testable backbone of the `pij` bin).
//
// Three pure pieces the thin `cli.ts` bin wires to process.argv/stdout:
//   parseArgs(argv) -> Result<ParsedCommand>     (E-ARG on bad invocation)
//   dispatch(cmd, deps) -> CliResult             ({stdout, stderr, exitCode})
// All six verbs reuse the proven core helpers (resolveSelf/filterByFolder/
// liveness/validateCommand/filterEvents via the ports) — no new logic. Node I/O
// (fs, argv, exit) and the imperative --follow / --wait loops live in the bin.

import { applyBinding } from "./binding.js";
import { ALLOWED_COMMANDS, validateCommand } from "./commands.js";
import { filterByFolder, resolveSelf } from "./discovery.js";
import { closestModel } from "./models/match.js";
import type { ModelEntry } from "./models/registry.js";
import type { DeliveryPort, EventLogPort, ProcessPort, RegistryPort } from "./ports.js";
import { daemonTickStatus } from "./receipts.js";
import { buildExportLines, buildSessionJoinRows } from "./session-join.js";
import { activityOf, liveness, STALE_AFTER_MS } from "./state.js";
import {
	err,
	ok,
	type PijErrorCode,
	type PijEvent,
	type Result,
	type SessionDescriptor,
	type SessionId,
} from "./types.js";

// ─── deps (injected — fakes in tests, real fs adapters in the bin) ──────────
export interface CliDeps {
	readonly registry: RegistryPort;
	/** A per-target event log (the bin builds `FsEventLog(pijHome, id)`). */
	readonly eventLogFor: (id: SessionId) => EventLogPort;
	readonly delivery: DeliveryPort;
	readonly process: ProcessPort;
	/** The invoking shell's cwd (ProcessPort has no cwd seam). */
	readonly cwd: string;
	/** Registry home (`~/.pij`) — only `path --state` needs it. */
	readonly pijHome: string;
	/** Model entries loaded by the bin (for pij models verb). Empty when absent. */
	readonly models?: readonly ModelEntry[];
}

// ─── parsed command (discriminated per verb) ────────────────────────────────
export type ParsedCommand =
	| { readonly verb: "whoami"; readonly json: boolean; readonly env?: boolean }
	| { readonly verb: "list"; readonly here: boolean; readonly json: boolean }
	| { readonly verb: "sessions"; readonly here: boolean; readonly json: boolean }
	| {
			readonly verb: "models";
			readonly filter?: string;
			/** Provider/harness filter: pi|claude|copilot (or any provider string). */
			readonly harnessFilter?: string;
			readonly json: boolean;
	  }
	| {
			readonly verb: "send";
			readonly to: SessionId;
			readonly text?: string;
			readonly command?: string;
			/** Reference-passing attachment (Plan 026 Phase 5): a local file path. */
			readonly file?: string;
			/** Caption for the attached file (only valid alongside `file`). */
			readonly caption?: string;
			readonly wait: boolean;
			readonly waitMs?: number;
			readonly json: boolean;
	  }
	| {
			readonly verb: "tail";
			readonly id: SessionId;
			readonly since?: number;
			readonly type?: string;
			readonly lines?: number;
			readonly follow: boolean;
			readonly json: boolean;
	  }
	| { readonly verb: "state"; readonly id: SessionId; readonly json: boolean }
	| { readonly verb: "phonehome"; readonly json: boolean }
	| {
			readonly verb: "path";
			readonly id: SessionId;
			readonly which: "dir" | "events" | "state";
			readonly json: boolean;
	  };

export interface CliResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	/** Set when the bin must keep going: --follow tails, --wait polls receipts. */
	readonly follow?:
		| { readonly kind: "tail"; readonly id: SessionId; readonly nextSince: number }
		| {
				readonly kind: "wait";
				readonly self: SessionId;
				readonly messageId: string;
				readonly timeoutMs?: number;
		  };
}

/** Workshop-001 exit codes. */
const EXIT: Record<PijErrorCode, number> = {
	"E-NOID": 2,
	"E-SELF": 2,
	"E-CMD": 2,
	"E-AMBIG": 2,
	"E-DEAD": 1,
	"E-NOREG": 3,
	"E-ARG": 64,
	"E-NOTMUX": 2,
	"E-FULL": 2,
	"E-BRANCH": 64,
	"E-OWN": 2,
};

function daemonReceiptAuthoritative(target: SessionDescriptor): boolean {
	return target.harness === "claude" || target.harness === "copilot" || target.harness === "codex";
}

// ─── argv parsing ───────────────────────────────────────────────────────────
/** Split argv into positionals + flags. `--k v` consumes the next token unless
 *  it is a known boolean flag; `--k=v` is also accepted. */
function lex(argv: readonly string[], booleans: ReadonlySet<string>) {
	const pos: string[] = [];
	const flags: Record<string, string | true> = {};
	for (let i = 0; i < argv.length; i++) {
		const tok = argv[i];
		if (tok === undefined) continue;
		if (tok.startsWith("--")) {
			const eq = tok.indexOf("=");
			if (eq !== -1) {
				flags[tok.slice(2, eq)] = tok.slice(eq + 1);
			} else {
				const key = tok.slice(2);
				const next = argv[i + 1];
				if (booleans.has(key) || next === undefined || next.startsWith("--")) {
					flags[key] = true;
				} else {
					flags[key] = next;
					i++;
				}
			}
		} else {
			pos.push(tok);
		}
	}
	return { pos, flags };
}

const BOOLEAN_FLAGS = new Set(["here", "json", "follow", "events", "state", "dir", "env"]);

/** Flags each verb accepts — anything else is E-ARG. */
const ALLOWED_FLAGS: Record<string, ReadonlySet<string>> = {
	whoami: new Set(["json", "env"]),
	list: new Set(["here", "json"]),
	sessions: new Set(["here", "json"]),
	models: new Set(["harness", "json"]),
	send: new Set(["command", "file", "caption", "wait", "json"]),
	tail: new Set(["since", "type", "lines", "follow", "json"]),
	state: new Set(["json"]),
	phonehome: new Set(["json"]),
	path: new Set(["events", "state", "dir", "json"]),
};
/** Max positionals per verb (send allows id + text; models allows optional filter). */
const MAX_POS: Record<string, number> = {
	whoami: 0,
	list: 0,
	sessions: 0,
	models: 1,
	send: 2,
	tail: 1,
	state: 1,
	phonehome: 0,
	path: 1,
};

export function parseArgs(argv: readonly string[]): Result<ParsedCommand> {
	const verb = argv[0];
	if (verb === undefined)
		return err(
			"E-ARG",
			"usage: pij <whoami|list|sessions|models|send|tail|state|phonehome|path> …",
		);
	const allowed = ALLOWED_FLAGS[verb];
	if (!allowed)
		return err(
			"E-ARG",
			`unknown command '${verb}' (whoami|list|sessions|models|send|tail|state|phonehome|path)`,
		);
	const { pos, flags } = lex(argv.slice(1), BOOLEAN_FLAGS);
	// strict: reject unknown flags and extra arity (finding F001).
	for (const k of Object.keys(flags)) {
		if (!allowed.has(k)) return err("E-ARG", `unknown flag --${k} for '${verb}'`);
	}
	if (pos.length > (MAX_POS[verb] ?? 0)) return err("E-ARG", `too many arguments for '${verb}'`);
	const json = flags.json === true;
	// number | undefined (absent) | "bad" (present but non-numeric -> E-ARG).
	const pnum = (v: string | true | undefined): number | undefined | "bad" =>
		v === undefined ? undefined : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : "bad";

	switch (verb) {
		case "whoami":
			return ok({ verb: "whoami", json, env: flags.env === true });
		case "list":
			return ok({ verb: "list", here: flags.here === true, json });
		case "sessions":
			return ok({ verb: "sessions", here: flags.here === true, json });
		case "models": {
			const filter = pos[0];
			const harnessFilter = typeof flags.harness === "string" ? flags.harness : undefined;
			return ok({ verb: "models", filter, harnessFilter, json });
		}
		case "send": {
			const to = pos[0];
			if (to === undefined) return err("E-ARG", 'usage: pij send <id> "<text>" | --command <name>');
			if (flags.command === true)
				return err("E-ARG", `--command needs a name (allowed: ${ALLOWED_COMMANDS.join(", ")})`);
			let command = typeof flags.command === "string" ? flags.command : undefined;
			let text = pos[1];
			// Reference-passing attachment (Plan 026 Phase 5): `--file <path>` carries one
			// local file, `--caption <text>` its caption. The file path + caption ride the
			// message's `attachments` field; only the telegram bridge acts on it. A bare
			// `--caption` without `--file` is a user error (nothing to caption), and a file
			// is mutually exclusive with `--command` (a remote command can't carry media).
			if (flags.file === true) return err("E-ARG", "--file needs a path");
			const file = typeof flags.file === "string" ? flags.file : undefined;
			if (flags.caption === true) return err("E-ARG", "--caption needs text");
			const caption = typeof flags.caption === "string" ? flags.caption : undefined;
			if (caption !== undefined && file === undefined)
				return err("E-ARG", "--caption requires --file <path>");
			if (file !== undefined && command !== undefined)
				return err("E-ARG", "pij send takes --file OR --command <name>, not both");
			// Ergonomic (D-042): a bare "/compact" | "/reload" | "/new" text body is
			// almost certainly meant as a remote command, not a chat line for the
			// peer's LLM. Route an EXACT, trimmed "/"+allow-listed name to the command
			// path so it executes instead of leaking as text. Anything else (extra
			// words, unknown name) stays plain text.
			if (command === undefined && text !== undefined) {
				const slug = text.trim();
				if (slug.startsWith("/")) {
					const name = slug.slice(1);
					if ((ALLOWED_COMMANDS as readonly string[]).includes(name)) {
						command = name;
						text = undefined;
					}
				}
			}
			if (command !== undefined && text !== undefined)
				return err("E-ARG", "pij send takes a <text> OR --command <name>, not both");
			if (command === undefined && text === undefined && file === undefined)
				return err("E-ARG", 'usage: pij send <id> "<text>" | --command <name> | --file <path>');
			let waitMs: number | undefined;
			if (typeof flags.wait === "string") {
				if (!/^\d+$/.test(flags.wait))
					return err("E-ARG", "--wait takes an optional milliseconds value");
				waitMs = Number(flags.wait);
			}
			return ok({
				verb: "send",
				to,
				text,
				command,
				file,
				caption,
				wait: flags.wait !== undefined,
				waitMs,
				json,
			});
		}
		case "tail": {
			const id = pos[0];
			if (id === undefined)
				return err("E-ARG", "usage: pij tail <id> [--since N --type T --lines N --follow]");
			const since = pnum(flags.since);
			if (since === "bad") return err("E-ARG", "--since takes a number");
			const lines = pnum(flags.lines);
			if (lines === "bad") return err("E-ARG", "--lines takes a number");
			if (flags.type === true) return err("E-ARG", "--type takes an event type");
			return ok({
				verb: "tail",
				id,
				since,
				type: typeof flags.type === "string" ? flags.type : undefined,
				lines,
				follow: flags.follow === true,
				json,
			});
		}
		case "state": {
			const id = pos[0];
			if (id === undefined) return err("E-ARG", "usage: pij state <id>");
			return ok({ verb: "state", id, json });
		}
		case "phonehome":
			return ok({ verb: "phonehome", json });
		case "path": {
			const id = pos[0];
			if (id === undefined) return err("E-ARG", "usage: pij path <id> [--events|--state|--dir]");
			const which = flags.events === true ? "events" : flags.state === true ? "state" : "dir";
			return ok({ verb: "path", id, which, json });
		}
		default:
			return err(
				"E-ARG",
				`unknown command '${verb}' (whoami|list|sessions|models|send|tail|state|phonehome|path)`,
			);
	}
}

// ─── render helpers (pure) ──────────────────────────────────────────────────
function hhmmss(iso: string | undefined): string {
	if (!iso) return "—";
	const t = iso.slice(11, 19);
	return t || "—";
}

function humanAge(ms: number | null): string {
	if (ms === null) return "never";
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m${s % 60}s`;
	const h = Math.floor(m / 60);
	return `${h}h${m % 60}m`;
}

function descAgeMs(d: SessionDescriptor, nowMs: number): number | null {
	if (!d.lastEventAt) return null;
	const t = Date.parse(d.lastEventAt);
	return Number.isNaN(t) ? null : nowMs - t;
}

function fail(code: PijErrorCode, message: string, json: boolean): CliResult {
	const stderr = json ? JSON.stringify({ error: code, message }) : `${code}: ${message}`;
	return { stdout: "", stderr, exitCode: EXIT[code] };
}

function selfId(deps: CliDeps): Result<SessionId> {
	const envId = deps.process.env("PIJ_SESSION_ID");
	const pane = deps.process.env("TMUX_PANE");
	// Pane-first across the FULL registry (FX001-1 / DL-003): tmux pane ids are
	// server-global, so a registered pane identifies the caller regardless of cwd.
	// The folder filter below starved resolveSelf's pane branch on cross-repo
	// calls, silently losing spawnedBy (reports then died E-NOREPORTTARGET).
	if ((!envId || envId.trim() === "") && pane && pane.trim() !== "") {
		const byPane = deps.registry.list().filter((d) => d.paneId === pane);
		const only = byPane[0];
		if (byPane.length === 1 && only) return resolveSelf(only.id, [], pane);
	}
	return resolveSelf(envId, filterByFolder(deps.registry.list(), deps.cwd), pane);
}

// ─── models helpers (pure) ──────────────────────────────────────────────────
/** Map a pi provider key (or harness name) to a pij harness. Exported so the
 *  `pij agent` CLI surface can derive a pack's HARNESS column from its model's
 *  provider without re-deriving the mapping (plan 029 T002 / KF-03). */
export const PROVIDER_HARNESS_MAP: Record<string, string> = {
	"github-copilot": "copilot",
	copilot: "copilot",
	claude: "claude",
	codex: "codex",
	pi: "pi",
};

function providerMatchesHarness(provider: string, harness: string): boolean {
	const mapped = PROVIDER_HARNESS_MAP[provider];
	return mapped === harness || provider === harness;
}

// ─── dispatch ───────────────────────────────────────────────────────────────
export function dispatch(cmd: ParsedCommand, deps: CliDeps): CliResult {
	const now = deps.process.now();
	switch (cmd.verb) {
		case "models": {
			let entries = deps.models ?? [];
			// pi proxies ALL providers — applying a provider filter would return nothing
			// because real provider keys are github-copilot, sakana, openrouter, etc.
			if (cmd.harnessFilter && cmd.harnessFilter !== "pi") {
				entries = entries.filter((e) => providerMatchesHarness(e.provider, cmd.harnessFilter!));
			}
			if (cmd.filter) {
				// Fuzzy filter: keep entries whose normalised id or name contains the query,
				// or match via closestModel.
				const q = cmd.filter.toLowerCase();
				const filtered = entries.filter(
					(e) => e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
				);
				if (filtered.length > 0) {
					entries = filtered;
				} else {
					const closest = closestModel(cmd.filter, entries);
					entries = closest ? [closest] : [];
				}
			}
			if (entries.length === 0) {
				return okOut(
					cmd.json ? JSON.stringify([]) : "no models found (try a different filter or harness)",
				);
			}
			if (cmd.json) return okOut(JSON.stringify(entries));
			const lines = entries.map((e) => {
				const tag = e.verified ? "" : " *";
				// `thinking` column (#1): the canonical effort levels the model honors,
				// or `yes`/`—` when only the reasoning flag (not the level set) is known.
				const thinking = e.levels?.length ? e.levels.join("/") : e.reasoning ? "yes" : "—";
				return `${pad(e.id, 36)} ${pad(e.name, 40)} ${pad(e.provider, 10)} ${thinking}${tag}`;
			});
			const header = `${pad("id", 36)} ${pad("name", 40)} ${pad("provider", 10)} thinking`;
			const unverNote = entries.some((e) => !e.verified)
				? "\n* unverified (best-effort alias list — not confirmed by a live registry)"
				: "";
			return okOut([header, ...lines, `\n${entries.length} model(s)${unverNote}`].join("\n"));
		}
		case "whoami": {
			const s = selfId(deps);
			if (!s.ok) return fail(s.code, s.message, cmd.json);
			const d = deps.registry.read(s.value);
			if (!d) return fail("E-NOID", `no session '${s.value}' in registry`, cmd.json);
			// `--env` (AC-5): the eval-able self-identity block is the ONLY stdout.
			if (cmd.env) return okOut(buildExportLines(d));
			if (cmd.json)
				return okOut(
					JSON.stringify({
						id: d.id,
						folder: d.folder,
						dataDir: d.dataDir,
						state: d.state ?? "idle",
						pid: d.pid,
					}),
				);
			return okOut(
				[
					`pij session: ${d.id}`,
					`folder:      ${d.folder}`,
					`data dir:    ${d.dataDir}`,
					`state:       ${d.state ?? "idle"}`,
				].join("\n"),
			);
		}
		case "list": {
			let descs = deps.registry.list();
			if (cmd.here) descs = filterByFolder(descs, deps.cwd);
			const s = selfId(deps);
			const self = s.ok ? s.value : undefined;
			const rows = descs.map((d) => {
				const live = liveOf(deps, d, now);
				return { d, live };
			});
			if (cmd.json)
				return okOut(
					JSON.stringify(
						rows.map(({ d, live }) => ({
							id: d.id,
							folder: d.folder,
							dataDir: d.dataDir,
							pid: d.pid,
							state: d.state ?? "idle",
							activity: activityOf(d.state, d.lastEventAt != null),
							liveness: live,
							lastEventAt: d.lastEventAt ?? null,
							boundModel: d.boundModel ?? null,
							effort: d.effort ?? null,
							failureReason: d.failureReason ?? null,
						})),
					),
				);
			if (rows.length === 0)
				return okOut(cmd.here ? "no pij sessions in this folder" : "no pij sessions");
			const lines = rows.map(
				({ d, live }) =>
					`${d.id === self ? "★ " : "  "}${pad(d.id, 14)} ${pad(activityOf(d.state, d.lastEventAt != null), 8)} ${pad(live, 7)} ${pad(d.boundModel ?? "—", 20)} ${pad(d.effort ?? "—", 7)} ${d.folder}`,
			);
			const header = `  ${pad("id", 14)} ${pad("activity", 8)} ${pad("liveness", 7)} ${pad("model", 20)} ${pad("effort", 7)} folder`;
			return okOut(
				[header, ...lines, `${rows.length} session(s)${self ? ` · ★ = you (${self})` : ""}`].join(
					"\n",
				),
			);
		}
		case "sessions": {
			// The telemetry join-table verb (AC-1/AC-2): a stable projection of the
			// already-persisted harness↔pij join keys (Finding 01/05) — no daemon, a
			// pure sibling of `list` decoupled from its human/live-state view.
			let descs = deps.registry.list();
			if (cmd.here) descs = filterByFolder(descs, deps.cwd);
			const rows = buildSessionJoinRows(descs);
			if (cmd.json) return okOut(JSON.stringify(rows));
			if (rows.length === 0)
				return okOut(cmd.here ? "no pij sessions in this folder" : "no pij sessions");
			// transcriptPath is LAST (longest, most-variable — codex-only) so the
			// aligned columns stay readable; `—` marks a null, same as the others.
			// Same-tuple parity with the `--json` projection above (AC-2).
			const lines = rows.map(
				(r) =>
					`${pad(r.pijId, 16)} ${pad(r.harness ?? "—", 8)} ${pad(r.harnessSessionId ?? "—", 38)} ${pad(r.lifecycle ?? "—", 8)} ${pad(r.boundModel ?? "—", 20)} ${pad(r.spawnedBy ?? "—", 14)} ${r.transcriptPath ?? "—"}`,
			);
			const header = `${pad("pij-id", 16)} ${pad("harness", 8)} ${pad("harness-session", 38)} ${pad("lifecycle", 8)} ${pad("model", 20)} ${pad("parent", 14)} transcript`;
			return okOut([header, ...lines, `${rows.length} session(s)`].join("\n"));
		}
		case "send": {
			const s = selfId(deps);
			if (!s.ok) return fail(s.code, s.message, cmd.json);
			const self = s.value;
			if (cmd.to === self) return fail("E-SELF", `cannot send to yourself (${self})`, cmd.json);
			const target = deps.registry.read(cmd.to);
			if (!target) return fail("E-NOID", `no session '${cmd.to}' in registry`, cmd.json);
			const live = liveOf(deps, target, now);
			if (live === "dead" || live === "dissolved") {
				const why = live === "dissolved" ? "dissolved (closed)" : "dead (pid gone)";
				return fail("E-DEAD", `session ${cmd.to} is ${why}`, cmd.json);
			}

			let messageId: string;
			let kindNote: string;
			if (cmd.command !== undefined) {
				const v = validateCommand(cmd.command);
				if (!v.ok)
					return fail(
						"E-CMD",
						`unknown command '${cmd.command}' (allowed: ${ALLOWED_COMMANDS.join(", ")})`,
						cmd.json,
					);
				const del = deps.delivery.deliver({ from: self, to: cmd.to, body: "", command: v.value });
				if (!del.ok) return fail(del.code, del.message, cmd.json);
				messageId = del.value.messageId;
				kindNote = `command=${v.value}`;
			} else {
				// F1: deliver the RAW text — the receiver frames on inject. NEVER frame() here.
				// Plan 026 Phase 5: a `--file` attaches one reference-passing entry (path +
				// optional caption); the attachments field is added ONLY when a file is given,
				// so a plain text send round-trips byte-for-byte unchanged (no `attachments` key).
				const attachments =
					cmd.file !== undefined
						? [
								cmd.caption !== undefined
									? { path: cmd.file, caption: cmd.caption }
									: { path: cmd.file },
							]
						: undefined;
				const del = deps.delivery.deliver(
					attachments !== undefined
						? { from: self, to: cmd.to, body: cmd.text ?? "", attachments }
						: { from: self, to: cmd.to, body: cmd.text ?? "" },
				);
				if (!del.ok) return fail(del.code, del.message, cmd.json);
				messageId = del.value.messageId;
				kindNote =
					attachments !== undefined
						? cmd.text !== undefined && cmd.text !== ""
							? "text+file"
							: "file"
						: "text";
			}
			const initial = daemonReceiptAuthoritative(target)
				? "queued"
				: (target.state ?? "idle") === "working"
					? "queued"
					: "delivered";
			const tickStatus = daemonReceiptAuthoritative(target)
				? daemonTickStatus(target.lastTickAt, now)
				: undefined;
			// Informational "quiet peer" note keys on event AGE, not the liveness
			// label: an idle/done peer is now `active` (INS-001), but a long-quiet
			// peer is still worth flagging to the sender. The send lands regardless.
			const targetAgeMs = descAgeMs(target, now);
			const warn =
				targetAgeMs === null || targetAgeMs > STALE_AFTER_MS
					? " (note: no recent pij events from peer — normal for a control-plane peer; the send still lands)"
					: "";
			const follow = cmd.wait
				? ({ kind: "wait", self, messageId, timeoutMs: cmd.waitMs } as const)
				: undefined;
			if (cmd.json)
				return {
					stdout: JSON.stringify({
						to: cmd.to,
						from: self,
						messageId,
						kind: kindNote,
						receipt: initial,
						liveness: live,
						...(tickStatus ?? {}),
					}),
					stderr: "",
					exitCode: 0,
					follow,
				};
			const recvHint =
				initial === "queued"
					? daemonReceiptAuthoritative(target)
						? tickStatus?.daemonTickStale
							? `queued: daemon tick stale (${humanAge(tickStatus.daemonTickAgeMs)} old)`
							: "queued: awaiting daemon delivery confirmation"
						: "queued: peer is busy, will steer after current turn"
					: "delivered: peer was idle";
			const tail = cmd.wait
				? ""
				: `\nreceipt → ${initial}   (also in: pij tail ${self} --type receipt)`;
			return {
				stdout: `sent → ${cmd.to}  ${kindNote}${warn}  (${recvHint})${tail}`,
				stderr: "",
				exitCode: 0,
				follow,
			};
		}
		case "tail": {
			const target = deps.registry.read(cmd.id);
			if (!target) return fail("E-NOID", `no session '${cmd.id}' in registry`, cmd.json);
			const evs = deps
				.eventLogFor(cmd.id)
				.read({ since: cmd.since, type: cmd.type, last: cmd.lines });
			const maxSeq = evs.reduce((m, e) => (e.seq > m ? e.seq : m), cmd.since ?? 0);
			const follow = cmd.follow
				? ({ kind: "tail", id: cmd.id, nextSince: maxSeq } as const)
				: undefined;
			if (cmd.json) return { stdout: JSON.stringify(evs), stderr: "", exitCode: 0, follow };
			if (evs.length === 0)
				return {
					stdout: `(no events${cmd.since !== undefined ? ` since ${cmd.since}` : ""})`,
					stderr: "",
					exitCode: 0,
					follow,
				};
			const body = evs.map((e) => renderEventLine(e, now)).join("\n");
			const newest = evs[evs.length - 1];
			const trailer = `(next: --since ${maxSeq} · newest event ${humanAge(newest ? now - Date.parse(newest.timestamp) : null)} ago)`;
			return {
				stdout: `${pad("seq", 5)} ${pad("ts", 8)} ${pad("age", 7)} ${pad("type", 12)} summary\n${body}\n${trailer}`,
				stderr: "",
				exitCode: 0,
				follow,
			};
		}
		case "state": {
			const d = deps.registry.read(cmd.id);
			if (!d) return fail("E-NOID", `no session '${cmd.id}' in registry`, cmd.json);
			const ageMs = descAgeMs(d, now);
			const live = liveOf(deps, d, now);
			const alive = deps.process.isAlive(d.pid);
			const tickStatus =
				d.lastTickAt !== undefined || daemonReceiptAuthoritative(d)
					? daemonTickStatus(d.lastTickAt, now)
					: null;
			if (cmd.json)
				return okOut(
					JSON.stringify({
						id: d.id,
						lifecycle: d.lifecycle ?? null,
						state: d.state ?? "idle",
						activity: activityOf(d.state, d.lastEventAt != null),
						liveness: live,
						lastEventAt: d.lastEventAt ?? null,
						pid: d.pid,
						ageMs,
						// First-class cwd + harness so a colleague's working dir is
						// machine-readable without scraping the tmux footer (feedback #4).
						cwd: d.folder,
						harness: d.harness ?? null,
						// Fail-loud model layer (T013): surface actual bound model + reason
						boundModel: d.boundModel ?? null,
						effort: d.effort ?? null,
						daemonLastTickAt: tickStatus?.daemonLastTickAt ?? null,
						daemonTickAgeMs: tickStatus?.daemonTickAgeMs ?? null,
						daemonTickStale: tickStatus?.daemonTickStale ?? null,
						failureReason: d.failureReason ?? null,
					}),
				);
			const modelLine = d.boundModel ? `  ·  model: ${d.boundModel}` : "";
			const effortLine = d.effort ? `  ·  effort: ${d.effort}` : "";
			const tickLine = tickStatus
				? `  ·  daemon tick: ${tickStatus.daemonTickStale ? "stale" : "fresh"} (${humanAge(
						tickStatus.daemonTickAgeMs,
					)} old)`
				: "";
			const failLine = d.failureReason ? `  ·  failure: ${d.failureReason}` : "";
			return okOut(
				`${d.id}: ${activityOf(d.state, d.lastEventAt != null)} · ${live}   (last event ${humanAge(ageMs)} ago, pid ${d.pid} ${alive ? "alive" : "gone"})\n  cwd: ${d.folder}${d.harness ? `  ·  harness: ${d.harness}` : ""}${modelLine}${effortLine}${tickLine}${failLine}`,
			);
		}
		case "phonehome": {
			// Confirmatory binding (AC-03): the agent self-reports its harness-native
			// session id (Claude exposes CLAUDE_CODE_SESSION_ID — the transcript stem
			// the daemon discovers deterministically). Deterministic discovery is
			// primary; this converges on the SAME id and resolves the ambiguous
			// (concurrent-boot) case. Idempotent: re-running is a no-op confirm.
			const s = selfId(deps);
			if (!s.ok) return fail(s.code, s.message, cmd.json);
			const d = deps.registry.read(s.value);
			if (!d) return fail("E-NOID", `no session '${s.value}' in registry`, cmd.json);
			const harnessSessionId = deps.process.env("CLAUDE_CODE_SESSION_ID");
			let bound = d;
			if (harnessSessionId && harnessSessionId.trim() !== "") {
				if (d.harnessSessionId !== harnessSessionId) {
					bound = applyBinding(d, harnessSessionId);
					deps.registry.write(bound);
				}
			}
			const confirmed = Boolean(bound.harnessSessionId);
			if (cmd.json)
				return okOut(
					JSON.stringify({
						id: bound.id,
						harness: bound.harness ?? null,
						harnessSessionId: bound.harnessSessionId ?? null,
						lifecycle: bound.lifecycle ?? null,
						confirmed,
					}),
				);
			return okOut(
				confirmed
					? `phoned home: ${bound.id} ↔ ${bound.harness ?? "?"} session ${bound.harnessSessionId} (${bound.lifecycle ?? "?"})`
					: `phoned home: ${bound.id} — no harness session id yet (CLAUDE_CODE_SESSION_ID unset); deterministic discovery will bind`,
			);
		}
		case "path": {
			const d = deps.registry.read(cmd.id);
			if (!d) return fail("E-NOID", `no session '${cmd.id}' in registry`, cmd.json);
			const p =
				cmd.which === "events"
					? d.eventsPath
					: cmd.which === "state"
						? `${deps.pijHome}/${d.id}.json`
						: d.dataDir;
			return okOut(cmd.json ? JSON.stringify({ path: p }) : p);
		}
	}
}

// ─── small shared helpers ───────────────────────────────────────────────────
function okOut(stdout: string): CliResult {
	return { stdout, stderr: "", exitCode: 0 };
}

function pad(s: string, n: number): string {
	return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function liveOf(
	deps: CliDeps,
	d: SessionDescriptor,
	nowMs: number,
): "active" | "stale" | "dead" | "dissolved" {
	if (d.lifecycle === "dissolved") return "dissolved";
	// `stale` is reserved for a peer that claims to be working but has gone quiet
	// (a stall). An idle/done peer that is simply quiet stays `active` (INS-001).
	return liveness(
		deps.process.isAlive(d.pid),
		descAgeMs(d, nowMs),
		STALE_AFTER_MS,
		d.state === "working",
	);
}

function renderEventLine(e: PijEvent, nowMs: number): string {
	const age = humanAge(nowMs - Date.parse(e.timestamp));
	let summary = "";
	if (e.data && typeof e.data === "object") {
		const rec = e.data as Record<string, unknown>;
		summary =
			typeof rec.name === "string"
				? rec.name
				: typeof rec.body === "string"
					? rec.body
					: JSON.stringify(e.data);
	} else if (e.data !== undefined) {
		summary = String(e.data);
	}
	return `${pad(String(e.seq), 5)} ${pad(hhmmss(e.timestamp), 8)} ${pad(age, 7)} ${pad(e.type, 12)} ${summary.slice(0, 80)}`;
}
