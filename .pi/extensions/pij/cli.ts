#!/usr/bin/env -S NODE_NO_WARNINGS=1 npm_config_loglevel=error npm_config_yes=true npx tsx
// pij-messaging — the `pij` CLI bin. THIN: wires the real fs adapters to the
// pure core/cli.ts, owns Node I/O (argv, stdout/stderr, exit) and the only two
// imperative loops (--follow tail, --wait receipt poll). Pi-free by design —
// remote `compact` rides the channel as a command message the extension runs;
// this process never imports @earendil-works/*.

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	accessSync,
	appendFileSync,
	constants,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir, uptime } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FakeAgentAdapter } from "minih";
import { validateInput } from "minih/runner";
import { FsAllocationStore } from "./adapters/allocation-store.js";
import { FsAssignmentStore } from "./adapters/assignment-store.js";
import { writeTextAtomic } from "./adapters/atomic-file.js";
import { FsBatonStore } from "./adapters/baton-store.js";
import { FsChannel } from "./adapters/channel.js";
import { FsContextReader } from "./adapters/context-reader.js";
import { TmuxContextWindowReader } from "./adapters/context-window-reader.js";
import { FsDispatchStore } from "./adapters/dispatch-store.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsFenceStore } from "./adapters/fence-store.js";
import { FsFocusStore } from "./adapters/focus-store.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { GitRepositoryAdapter } from "./adapters/git-repository.js";
import { FsOpJournal } from "./adapters/op-journal.js";
import { FsPlatformWriteLock } from "./adapters/platform-write-lock.js";
import { NodeProcess } from "./adapters/process.js";
import { FsProjectStore } from "./adapters/project-store.js";
import { FsSpawnExpectationStore } from "./adapters/spawn-expectation-store.js";
import { FsSpineLog } from "./adapters/spine-store.js";
import { TmuxAdapter } from "./adapters/tmux.js";
import { execFileRunner, pressKey, typeLiteral } from "./adapters/tmux-keys.js";
import { FsWatchStore } from "./adapters/watch-store.js";
import { FsWatchdogGlobalStore, FsWatchdogStore } from "./adapters/watchdog-store.js";
import {
	type AgentSpawnPaneInfo,
	buildAgentPeerEnv,
	executeAgentReport,
	finalizeAgentSpawn,
	prepareAgentSpawn,
} from "./core/agent-peer.js";
import { ClaudeHeadlessAdapter } from "./core/agents/adapters/claude.js";
import { CodexExecAdapter } from "./core/agents/adapters/codex.js";
import {
	COPILOT_SDK_PACKAGE,
	CopilotSdkMissingError,
	createCopilotAdapter,
} from "./core/agents/adapters/copilot.js";
import { type ParsedAgentCommand, parseAgentArgs } from "./core/agents/cli-args.js";
import {
	type AdapterResolution,
	dispatchAgent,
	exitCodeFor,
	renderAgentError,
	type VerbDeps,
} from "./core/agents/cli-verbs.js";
import { type DiscoverySource, discoverAgents } from "./core/agents/pack.js";
import { agentsDir } from "./core/agents/paths.js";
import { archiveAgeAnchorMs } from "./core/archive.js";
import { applyBinding, reattachIdentity, resolveAdoptSessionIdForHarness } from "./core/binding.js";
import { renderCanaryTimeout } from "./core/canary.js";
import {
	applyWaitReceiptSources,
	type CliDeps,
	type CliResult,
	dispatch,
	finalizeCanary,
	type ParsedCommand,
	PROVIDER_HARNESS_MAP,
	parseArgs,
	renderDispatchWaitTimeout,
	renderWaitReceipt,
	renderWaitTimeout,
	type WaitTarget,
} from "./core/cli.js";
import { parseCloseArgs, planClose } from "./core/close.js";
import {
	type AmbientNativeIdentity,
	pendingPaneOccupant,
	planCurrentSessionDescriptor,
	resolveAmbientNativeIdentity,
	resolveRegisteredAmbientSelf,
} from "./core/current-session.js";
import { daemonStatus, needsAutoStart, planStop } from "./core/daemon/lifecycle.js";
import { parseLockFile } from "./core/daemon/lock.js";
import {
	deriveHarnessPijId,
	filterByFolder,
	memorableIdentitySeed,
	resolveSelf,
} from "./core/discovery.js";
import { formatFocusList, launchFocus, listFocuses, saveFocus } from "./core/focus.js";
import {
	summarizeTranscriptLine,
	transcriptDir,
	transcriptPathFor,
} from "./core/harness/claude.js";
import {
	codexRolloutForSession,
	codexTranscriptRoot,
	listCodexRollouts,
	summarizeCodexEvent,
} from "./core/harness/codex.js";
import {
	type CopilotSessionDir,
	isCopilotSessionId,
	resolveCopilotCurrentSession,
	sessionEventsPath,
	summarizeCopilotEvent,
} from "./core/harness/copilot.js";
import { daemonOwnsDelivery } from "./core/harness/pi.js";
import { supportsBranching } from "./core/harness/types.js";
import {
	consumeInbox,
	type InboxAction,
	type InboxResult,
	inboxTimeoutResult,
	parseInboxArgs,
	persistReceiptEnvelope,
	prepareReceiptEnvelopes,
	renderInboxRegistration,
	renderInboxResult,
	renderInboxWaiting,
} from "./core/inbox.js";
import { parseReceiptBody, receiptBody } from "./core/message.js";
import { normalizeModelQuery } from "./core/models/match.js";
import type { ModelEntry } from "./core/models/registry.js";
import { loadModels } from "./core/models/registry.js";
import {
	type BatonNotice,
	type BatonNoticeReceipt,
	type BatonNoticeSink,
	BatonService,
	renderBatonNotice as renderBatonNoticeBody,
} from "./core/orchestration/baton.js";
import {
	dispatchOrchestration,
	ORCHESTRATION_USAGE,
	parseOrchestrationArgs,
} from "./core/orchestration/cli.js";
import { PrimeService } from "./core/orchestration/prime.js";
import { renderSpineMd } from "./core/platform/render-spine-md.js";
import { daemonTickStatus } from "./core/receipts.js";
import {
	type AttachmentLiveness,
	type AttachmentProbe,
	buildRevivedDescriptor,
	buildRevivePrintout,
	classifyAttachment,
	type PaneObservation,
	parseReviveArgs,
	planRevive,
	resolveSeatForFolder,
	type SeatCandidate,
	uncertaintyReason,
} from "./core/revive.js";
import { buildSeatLabel } from "./core/seat-label.js";
import { buildExportLines } from "./core/session-join.js";
import {
	aliasAgentSpawnArgs,
	buildControlSpawnCommand,
	buildEffortWarning,
	buildPendingDescriptor,
	buildPlanIdWarning,
	buildSpawnCommand,
	buildSpawnOutput,
	buildSpawnWarning,
	deriveCallerParent,
	livePeerPanes,
	markCompactingSelf,
	parseAdoptArgs,
	parseCompactSelfArgs,
	parseSpawnArgs,
	planBranch,
	planPlacement,
	renderSpawnReceipt,
	resolvePiBin,
	resolvePiModelBinding,
	type SpawnLayout,
	spawnIdentitySeed,
} from "./core/spawn.js";
import {
	createSpawnExpectation,
	requestClose,
	spawnExpectationDeadline,
} from "./core/spawn-expectation.js";
import { planLink } from "./core/tree.js";
import {
	err,
	type HarnessKind,
	ok,
	type ReceiptState,
	type Result,
	type SessionDescriptor,
	type SessionId,
	type WatchMode,
} from "./core/types.js";
import { addWatch, removeWatch } from "./core/watch-subscription.js";
import { applyWatchdogExemption } from "./core/watchdog.js";
import { WorktreeManager } from "./core/worktree.js";
import { runTelegram } from "./telegram/index.js";

const pijHome = process.env.PIJ_HOME ?? join(homedir(), ".pij");
const FOLLOW_MS = 200;
const WAIT_TIMEOUT_MS = 15_000;

/** Test-only ordered trace seam for the subprocess CLI close contract. */
function traceP3(event: string): void {
	const path = process.env.PIJ_TEST_P3_TRACE;
	if (path) appendFileSync(path, `${event}\n`);
}

// The COMPLETE surface. The control-plane verbs (spawn/adopt/compact-self/daemon)
// are intercepted here in the bin and never reach the pure core parser, so the
// core parser's E-ARG strings can't (and shouldn't — it's pi/tmux-free) list
// them. This bin-level usage is the one place that advertises every verb, printed
// on no args / --help and on an unknown top-level command.
const USAGE = `pij — session messaging + tmux control plane

Control plane (spawn colleagues in tmux):
  pij spawn --harness pi|claude|copilot|codex [--model <m>]   spawn a colleague (pi self-registers; claude/copilot/codex daemon-bound)
  pij focus save|list|launch ...                      save immutable native-session focuses and fork them on demand
  pij revive [<id>] [--print] [--attach] [--layout ...]   relaunch a native session under the same pij id; no id = the seat for this folder, --print = paste-able command (after a reboot)
  pij close <id> [--force]                            tear down a colleague's pane + descriptor (--force closes one you don't own)
  pij adopt "$TMUX_PANE" --harness <h> [--parent <id>] [--session-id <native-id>] [--export]    register/re-attach your pane
                                                        adopts INTO an existing pending descriptor for the same pane — it never mints a duplicate id
  pij attest <id> --plan-id <id>                       explicitly attest or correct a seat's opaque plan id
  pij identity release <id> [--json]                 free a pij id's native-identity claim WITHOUT teardown (recovery; pane + descriptor survive)
  pij daemon <start|status|stop|kill>                manage the daemon (auto-started by spawn)
  pij compact-self [--pane %N] [--delay-ms N] [instruction…]   compact this pane, queue a follow-up
  pij telegram <init|start|stop>                     bridge pij sessions to a Telegram bot

Agents (run declarative minih agent packs):
  pij agent list [--json]                            merged agent inventory (project · user · built-in)
  pij agent run <slug> [-p k=v…] [--json]            run a named pack (--ephemeral to not record)
  pij agent run --prompt "<text>" [--json]           inline zero-setup run (nothing recorded)
  pij agent show|new|check|eject <slug>              inspect · scaffold · validate · customise a pack

Orchestration (machine-wide coordination):
  pij orchestration baton <define|list|show|request|grant|return|reclaim>   atomic resource leases + pushed notices
  pij orchestration prime <set|unset> [<id>] [--json]                      designate self or another session prime

Platform (durable projects + the shared spine log):
  pij project create "<description>" [--slug <slug>] [--actor <label>] [--json]   create a project (kebab slug, collision-resolved; --slug is verbatim and errors on collision)
  pij project list [--json]                          all projects, sorted by slug
  pij project show <slug> [--json]                   one full project record
  pij project set <slug> [--plan <path>] [--prime <id>] [--actor <label>] [--json]   update a project's plan/prime
  pij stream create --project <slug> --slug <stream> [--base <ref>] [--ordinal N] [--actor <label>] [--json]   reserve + create one attributed worktree allocation
  pij stream close <allocation-id> [--actor <label>] [--json]   preserve WIP, safely remove the worktree, and retain the ordinal tombstone
  pij fence set <stream> --paths <a,b> [--shared <x,y>] [--actor <label>] [--json]   write a descriptive notify-only fence
  pij fence show [--path <repo-path>] [--json]       list fences or answer path ownership (overlap is reported, never blocked)
  pij dispatch <id> --packet <file> [--wait[=MS]] [--actor <label>] [--json]   send a packet with a durable three-state dispatch receipt
  pij ack <dispatch-id> --packet-sha <sha256> [--json]   verify packet bytes and emit a brief-ack receipt
  pij canary <id> [--expect-model <model>] [--wait[=MS]] [--json]   dispatch a nonce packet, verify identity/runtime, and attach pass evidence
  pij spine append --kind <k> [--refs a,b,…] [--peer <id>] [--project <slug>] [--bare] [--actor <label>] [--json]   append one spine event
  pij spine events [--since N] [--peer <id>] [--project <slug>] [--json]   read the spine (exact filters, exclusive --since)
  pij spine render [--project <slug>] [--json]       regenerate spine/spine.md (--project: filtered view → spine/<slug>.spine.md; stale per-project files are never cleaned up)
  pij task set <node> "<task>" [--project <slug>] [--actor <label>] [--json]   open an assignment and point the node at it
  pij state set <node> <state> [--assignment <id>] [--refs a,b,…] [--actor <label>] [--json]   declare a per-assignment semantic state
  pij state clear <node> [--assignment <id>] [--actor <label>] [--json]   remove the current declared semantic state (assignment history remains)
  pij state verify <node> [--assignment <id>] [--actor <label>] [--json]   verify a done state (stamps verifiedBy — done is a claim until verified)
  pij node show <id> [--json]                        the full node card: both state axes, badge, assignments, terminal address, context gauges
  pij anomalies [--here] [--project <slug>] [--json]   derived safety queries: axis-disagreement, unverified done, foreign hold-clear (--here: this folder's peers; --project: one project's assignments)

Messaging:
  pij inbox [check|register] [--wait [ms]] [--json]   pull messages; first use auto-registers this ambient session
                                                        non-tmux external peers use 'pij inbox --wait'; tmux/pi stay push-first
  pij whoami [--json] [--env]                        your stable session id (--env: eval-able export PIJ_SESSION_ID line)
  pij list [--here] [--prime] [--archived] [--badge] [--json]  known sessions
                                                     (--badge: worst-first badge per row; opt-in, costs one spine read)
                                                        --here filters by FOLDER (cwd), so peers living in a worktree are invisible from the repo root — omit it to see the whole fleet
                                                        --archived lists seats moved out of the hot registry (terminal >48h); they stay reachable by id
  pij sessions [--here] [--json]                     telemetry join table: one row per session of the harness↔pij keys (pijId·harness·harnessSessionId·transcriptPath·boundModel)
  pij tree [<id> | --global] [--activity <v>] [--liveness <v>] [--lifecycle <v>] [--all] [--json]
                                                        repository forest by default; global forest or arbitrary subtree on request
  pij link <child> --parent <parent> | --root [--actor <label>] [--json]  reparent or explicitly root a session without changing close ownership (audited as a node-linked spine event)
  pij send <id> "<text>" | <id> --body-file <path|-> | --to <id> --to <id> "<text>" | <id> --command <name> [--wait]
                                                     (--body-file/- reads the body LITERALLY — use it for text with backticks/$( ; a double-quoted body substitutes in YOUR shell before pij runs)
                                                        deliver one message, broadcast text, or run a control command
  pij watch [--debounce n[ms|s]] <glob...>          watch files and inject [file-watch] notices into this non-pi peer
  pij unwatch [<glob...>]                           remove matching watches, or all watches with no args
  pij tail <id> [--since N --type T --lines N --follow]   peek a peer's transcript/log
  pij state <id> [--json]                            liveness + working/idle
  pij watchdog status|pause|resume|exempt|reset|interval|watch|unwatch|list|disable-all|enable-all …   supervise peers
  pij phonehome [--json]                             confirm a pending binding
  pij path <id> [--events|--state|--dir]             resolve on-disk paths`;

const WATCHDOG_USAGE = `pij watchdog — supervise peer progress

USAGE
  pij watchdog status <id> [--json]
  pij watchdog pause|resume|exempt <id> [--json]     pause / clear pause / bounded exempt
  pij watchdog reset <id> [--json]                   back to default (on, 20m, un-paused, UN-exempt)
  pij watchdog interval <id> <duration> [--json]     set the timeout (e.g. 30s, 20m, 1h, or ms)
  pij watchdog watch <id> [--capture anomaly|always|never] [--max-lines N] [--max-bytes N]
  pij watchdog unwatch <id> [--json]
  pij watchdog list [--json]
  pij watchdog disable-all | enable-all [--json]     machine-wide kill switch (no id)

JSON
  status/state/list include watchdog: { enabled, globallyDisabled, relay,
  intervalMs, pausedBy, exempt, exemptUntilMs, exemptRemainingMs, lastFireAt,
  watchers }. Watcher captures are
  pointer files under ~/.pij/<watcher>/watchdog-captures/ with a bounded head.`;

const WATCH_USAGE = `pij watch — subscribe this non-pi peer to file changes

USAGE
  pij watch [--diff | --mode notify|diff] [--debounce n[ms|s]] <glob...>
  pij unwatch [<glob...>]

MODES
  notify  (default)  changed-line ranges per file, e.g. "modified (+12/-3) lines 40-42"
  diff    (--diff)   a pointer to ~/.pij/<id>/watch-diffs/<path>.diff

FLAGS
  --debounce <n>     collate window per subscription: integer ms, Nms, or Ns
                     (default: 750ms)

NOTES
  Inside a git repo, .gitignore'd paths never notify.

EXAMPLES
  pij watch "src/**/*.ts"
  pij watch --debounce 2s "src/**/*.ts"
  pij watch --diff "src/**/*.ts"
  pij unwatch "src/**/*.ts"
  pij unwatch`;

const SPAWN_USAGE = `pij spawn — spawn a colleague in a tmux pane (one uniform surface for every harness)

USAGE
  pij spawn --harness pi|claude|copilot|codex [--bin pi|omp] [--model <m>] [--effort <lvl>] [--task "<t>"] [--plan-id <id>] [--branch]

FLAGS
  --harness <h>   pi | claude | copilot | codex  (the harness to launch in a new tmux pane)
                    pi      -> self-registers at boot; NO daemon, NO binding step
                    claude  -> daemon-bound via transcript discovery
                    copilot -> daemon-bound via deterministic --session-id
                    codex   -> daemon-bound via transcript discovery (date-nested rollout)
  --bin <b>       pi | omp  (pi-family binary; --harness pi only). Default pi.
                    omp = oh-my-pi, a bundled pi build that loads the same pij extension
                    and self-registers as harness:pi — so it needs NO new bind machinery.
                    omp gets --auto-approve (headless permission bypass); --branch is
                    rejected for omp (no --session-id to pin a fork). Also: PIJ_PI_BIN env.
  --model <m>     model id for that harness:
                    pi      -> a pi model/preset (e.g. @preset/glm-1m; pair with the
                               session's configured provider)
                    claude  -> sonnet | opus | haiku | claude-opus-5 | claude-fable-5 | claude-sonnet-5
                    copilot -> gpt-5.5 | claude-sonnet-4.6 | …
                    codex   -> gpt-5.5 | o3 | … (codex -m model id)
                  NOTE: an unknown model is currently passed through to the harness,
                  which may silently fall back to its default — verify with the pane
                  footer / pij tail until spawn-time validation lands.
  --effort <lvl>  thinking/reasoning effort: off|minimal|low|medium|high|xhigh|max
                  (per-model — see the 'thinking' column in \`pij models\`). Translated
                  per harness: claude/copilot \`--effort\`, codex \`-c model_reasoning_effort=\`,
                  pi a \`:<lvl>\` suffix on the model id. Unset ⇒ the colleague's own default.
                  Validated warn-don't-block (an unsupported level warns, never blocks).
  --task "<t>"    first task. pi: rides PIJ_SPAWN_TASK env (finding 01). claude/copilot/
                  codex: queued to the peer's INBOX — the daemon injects it as the first
                  turn after bind (FX001-2; env alone was never read by these harnesses).
  --plan-id <id>  opaque plan attestation. Exports HARNESS_PLAN_ID + PIJ_PLAN_ID and
                  stamps the seat descriptor. Missing docs/plans/<id> warns but never blocks.
  --layout <l>    stack | right | below | window (FX001-3). Unset = stack (the DEFAULT):
                  peers stack in a ~1/3-width column on YOUR right — first spawn opens the
                  column, later spawns append below and the stack evens itself (no cap).
                  right/below split YOUR pane once (main+2 cap applies); window opens a
                  background window in YOUR session, named after the peer (cap-exempt).
  --branch        fork YOUR OWN session into the new pane (branch-from-self), so the
                  colleague inherits your full context. Claude only (pi/copilot/codex reject).
                  Requires: the new harness MATCHES yours and your session is bound.
  --no-watchdog   persist an exempt watchdog sidecar for the spawned colleague.

pi: prints the new pane id immediately; the child self-registers and its pij-id arrives
via its ready-ping (see \`pij list\`). claude/copilot: returns the pre-allocated pij id
immediately; the daemon drives boot -> ready -> bound.`;

const FOCUS_USAGE = `pij focus — save and relaunch immutable native-session focuses

USAGE
  pij focus save <name> [--json]
  pij focus list [--global] [--json]
  pij focus launch <name> [--json]

NOTES
  save requires the caller to be a bound pi or claude pij peer.
  list is repository-filtered by default; --global shows every saved focus.
  launch starts a fresh tmux fork in pending-canary state; it is not ready until
  the operator verifies golden recall. pi must launch from the main checkout,
  not a git worktree (#21).
  copilot and codex adapters are not yet available in v1.`;

const REVIVE_USAGE = `pij revive — relaunch one native session with its prior context

USAGE
  pij revive [<pij-id>] [--print] [--attach [%pane]] [--assume-dead]
             [--layout stack|right|below|window] [--json]

NO ID — resolve the seat from the CURRENT FOLDER (after a reboot you know the
  path, not the id). Prefers the seat designated prime; a single non-prime seat
  is used and said so; two or more with no prime is E-AMBIG listing them. Hot
  tier first, then ~/.pij/archive/ (a reboot can outlast the 48h archive window);
  the answer says which tier it came from.

--print — render the paste-able launch command and EXIT. Touches no tmux pane,
  spawns nothing, writes no descriptor. The line carries the PIJ_* env prefix
  inline (without it the seat comes back nameless), and for claude/copilot/codex
  it is prefixed with the \`--attach\` re-bind those harnesses need. --json emits
  { id, harness, model, effort, cmd, args, env, shellLine, tier, ... }.

--attach [%pane] — bind an EXISTING pane (default $TMUX_PANE) to the seat rather
  than spawning one. This is what makes a hand-pasted launch addressable.

--assume-dead — operator override when the prior pane is gone but its recorded
  pid still answers (the OS recycles pids across a reboot). --print never needs
  it: it mutates nothing, and says so when liveness is unproven.

The native transcript must still exist. The command never falls back to a fresh
session and returns PENDING CANARY until golden recall is verified.`;

/** Package version for `pij --version` (best-effort; "unknown" if unreadable). */
function pijVersion(): string {
	try {
		const here = fileURLToPath(import.meta.url);
		const pkg = JSON.parse(readFileSync(join(here, "../../../../package.json"), "utf8"));
		return typeof pkg.version === "string" ? pkg.version : "unknown";
	} catch {
		return "unknown";
	}
}

function consumeCurrentInbox(self: SessionId, channel: FsChannel) {
	const consumed = consumeInbox({
		inbox: channel,
		self,
		readAt: new Date().toISOString(),
	});
	if (!consumed.ok) failInbox(consumed.code, consumed.message);
	return consumed.value;
}

function waitForInbox(
	self: SessionId,
	channel: FsChannel,
	waitMs: number | undefined,
	json: boolean,
): void {
	const started = Date.now();
	if (!json) process.stdout.write(`${renderInboxWaiting(waitMs)}\n`);
	const tick = (): void => {
		const result = consumeCurrentInbox(self, channel);
		if (result.messages.length > 0) {
			process.stdout.write(`${renderInboxResult(result, json)}\n`);
			executeInboxActions(self, result.actions, channel);
			if (result.failure) failInbox(result.failure.code, result.failure.message);
			process.exit(0);
		}
		executeInboxActions(self, result.actions, channel);
		if (result.failure) failInbox(result.failure.code, result.failure.message);
		if (waitMs !== undefined && Date.now() - started >= waitMs) {
			process.stdout.write(`${renderInboxResult(inboxTimeoutResult(self), json)}\n`);
			process.exit(0);
		}
		setTimeout(tick, FOLLOW_MS);
	};
	setTimeout(tick, FOLLOW_MS);
}

/** Block the current thread for `ms` without spawning a process (no async). Used
 *  by compact-self to settle between keystrokes and to wait out compaction. */
function sleepSync(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function write(res: CliResult): void {
	if (res.stdout) process.stdout.write(`${res.stdout}\n`);
	if (res.stderr) process.stderr.write(`${res.stderr}\n`);
}

function listAllDescriptors(registry: FsRegistry): SessionDescriptor[] {
	const descriptors: SessionDescriptor[] = [];
	let names: string[] = [];
	try {
		names = readdirSync(pijHome);
	} catch {
		return descriptors;
	}
	for (const name of names) {
		if (!name.endsWith(".json")) continue;
		const descriptor = registry.read(name.slice(0, -".json".length));
		if (descriptor) descriptors.push(descriptor);
	}
	return descriptors;
}

function deps(): CliDeps {
	const registry = new FsRegistry(pijHome);
	const channel = new FsChannel(pijHome);
	const cwd = process.cwd();
	const repository = new GitRepositoryAdapter();
	const commonDir = repository.gitCommonDir(cwd);
	const repositoryRoot = commonDir === null ? undefined : dirname(commonDir);
	return {
		registry,
		eventLogFor: (id) => new FsEventLog(pijHome, id),
		delivery: channel,
		inbox: channel,
		process: new NodeProcess(),
		cwd,
		pijHome,
		models: loadModels(),
		resolveAmbientSelf: () => resolveAmbientSelf(registry),
		repository,
		treeDescriptors: listAllDescriptors(registry),
		projectStore: new FsProjectStore(pijHome),
		assignmentStore: new FsAssignmentStore(pijHome),
		allocationStore: new FsAllocationStore(pijHome),
		fenceStore: new FsFenceStore(pijHome),
		dispatchStore: new FsDispatchStore(pijHome),
		packetIdentity: (path) => {
			const absolutePath = resolve(cwd, path);
			try {
				const bytes = readFileSync(absolutePath);
				return ok({
					path: absolutePath,
					sha256: createHash("sha256").update(bytes).digest("hex"),
				});
			} catch (error) {
				return err("E-ARG", `cannot read packet '${path}': ${String(error)}`);
			}
		},
		nextDispatchId: () => `dispatch-${randomUUID()}`,
		nextCanaryNonce: () => `canary-${randomUUID()}`,
		writeCanaryPacket: ({ caller, dispatchId, body }) => {
			const path = join(caller.dataDir, "canary-packets", `${dispatchId}.md`);
			try {
				writeTextAtomic(path, body);
				return ok({
					path,
					sha256: createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex"),
				});
			} catch (error) {
				return err("E-NOREG", `cannot write canary packet '${path}': ${String(error)}`);
			}
		},
		worktrees: new WorktreeManager(),
		...(repositoryRoot === undefined
			? {}
			: {
					worktreeRoot: join(dirname(repositoryRoot), `${basename(repositoryRoot)}-worktrees`),
				}),
		spineLog: new FsSpineLog(pijHome),
		opJournal: new FsOpJournal(pijHome),
		platformWriteLock: new FsPlatformWriteLock(pijHome),
		contextReader: new FsContextReader(homedir()),
		contextWindowReader: new TmuxContextWindowReader(),
		watchdogStore: new FsWatchdogStore(pijHome),
		watchdogGlobalStore: new FsWatchdogGlobalStore(pijHome),
	};
}

function resolveAmbientIdentity(): Result<AmbientNativeIdentity | null> {
	let copilotCurrentSessionId: string | null = null;
	const copilotSignal = process.env.COPILOT_AGENT_SESSION_ID;
	if (copilotSignal?.trim()) {
		const current = resolveCopilotCurrentSession(copilotSignal, listCopilotStateDirs, homedir());
		if (!current.ok) {
			return err(current.reason === "invalid-env" ? "E-AMBIG" : "E-NOID", current.message);
		}
		copilotCurrentSessionId = current.sessionId;
	}

	let codexCurrentSession: { threadId: string; transcriptPath: string } | null = null;
	const codexThreadId = process.env.CODEX_THREAD_ID?.trim();
	if (codexThreadId) {
		if (!isCopilotSessionId(codexThreadId)) {
			return err("E-AMBIG", `CODEX_THREAD_ID is not a UUID: ${codexThreadId}`);
		}
		const normalized = codexThreadId.toLowerCase();
		const rollouts = listCodexRollouts((dir) => {
			try {
				return readdirSync(dir);
			} catch {
				return [];
			}
		}, codexTranscriptRoot(homedir()));
		const transcriptPath = codexRolloutForSession(rollouts, normalized, readableRegularFile);
		if (!transcriptPath) {
			return err("E-NOID", `CODEX_THREAD_ID ${normalized} has no matching readable rollout`);
		}
		codexCurrentSession = { threadId: normalized, transcriptPath };
	}

	return resolveAmbientNativeIdentity({
		claudeCodeSessionId: process.env.CLAUDE_CODE_SESSION_ID,
		copilotCurrentSessionId,
		codexCurrentSession,
	});
}

function resolveAmbientSelf(registry: FsRegistry): Result<SessionId | undefined> {
	const identity = resolveAmbientIdentity();
	if (!identity.ok) return identity;
	if (!identity.value) return ok(undefined);
	const resolved = registry.resolveIdentity(
		identity.value.harness,
		identity.value.harnessSessionId,
	);
	if (!resolved.ok) return resolved;
	return resolveRegisteredAmbientSelf(
		identity.value,
		registry.list(),
		resolved.value,
		process.env.TMUX_PANE,
	);
}

interface CurrentRegistration {
	readonly descriptor: SessionDescriptor;
	readonly identity: {
		readonly harness: HarnessKind;
		readonly harnessSessionId: string;
		readonly transcriptPath?: string;
	};
	readonly existing: boolean;
}

function isPushedSeat(descriptor: SessionDescriptor): boolean {
	return (
		daemonOwnsDelivery(descriptor.harness ?? "pi", descriptor.deliveryMode) ||
		Boolean(descriptor.paneId)
	);
}

function ensureCurrentRegistration(registry: FsRegistry): Result<CurrentRegistration> {
	const identity = resolveAmbientIdentity();
	if (!identity.ok) return identity;
	const currentPane =
		process.env.TMUX_PANE && process.env.TMUX_PANE.trim() !== ""
			? process.env.TMUX_PANE
			: undefined;
	if (!identity.value) {
		if (currentPane) {
			const byPane = registry
				.list()
				.filter(
					(descriptor) =>
						descriptor.paneId === currentPane &&
						isPushedSeat(descriptor) &&
						Boolean(descriptor.harnessSessionId) &&
						descriptor.lifecycle !== "dissolved",
				);
			const snapshot = byPane.length === 1 ? byPane[0] : undefined;
			const descriptor = snapshot ? registry.read(snapshot.id) : undefined;
			if (descriptor?.harness && descriptor.harnessSessionId) {
				return ok({
					descriptor,
					identity: {
						harness: descriptor.harness,
						harnessSessionId: descriptor.harnessSessionId,
						...(descriptor.transcriptPath ? { transcriptPath: descriptor.transcriptPath } : {}),
					},
					existing: true,
				});
			}
		}
		// Residual: without ambient identity or TMUX_PANE, a pushed seat has no local
		// signal; the daemon would need to thread paneId into this command.
		return err(
			"E-AMBIG",
			"cannot detect a current Claude, Copilot, or Codex session; run inside an agent tool shell",
		);
	}
	if (currentPane) {
		const resolved = registry.resolveIdentity(
			identity.value.harness,
			identity.value.harnessSessionId,
		);
		if (!resolved.ok) return resolved;
		const registered = resolveRegisteredAmbientSelf(
			identity.value,
			registry.list(),
			resolved.value,
			currentPane,
		);
		if (!registered.ok) return registered;
		const descriptor = registry.read(registered.value);
		if (!descriptor) {
			return err(
				"E-NOID",
				`current ${identity.value.harness} session descriptor disappeared; run pij adopt "$TMUX_PANE" --harness ${identity.value.harness} from this exact pane`,
			);
		}
		return ok({ descriptor, identity: identity.value, existing: true });
	}
	const allocated = registry.allocateIdentity(
		identity.value.harness,
		identity.value.harnessSessionId,
		memorableIdentitySeed(identity.value.harness, identity.value.harnessSessionId),
		deriveHarnessPijId(identity.value.harness, identity.value.harnessSessionId),
	);
	if (!allocated.ok) return allocated;
	const descriptor = planCurrentSessionDescriptor({
		id: allocated.value.id,
		identity: identity.value,
		pijHome,
		folder: process.cwd(),
		pid: process.ppid > 1 ? process.ppid : process.pid,
		startedAt: new Date().toISOString(),
		...(allocated.value.descriptor ? { existing: allocated.value.descriptor } : {}),
	});
	try {
		registry.write(descriptor, "cli");
	} catch (error) {
		return err("E-AMBIG", error instanceof Error ? error.message : String(error));
	}
	return ok({
		descriptor,
		identity: identity.value,
		existing: allocated.value.kind === "reuse",
	});
}

function exitCodeForCore(code: string): number {
	if (code === "E-ARG") return 64;
	if (code === "E-NOREG") return 3;
	if (code === "E-DEAD") return 1;
	return 2;
}

function failInbox(code: string, message: string): never {
	process.stderr.write(`${code}: ${message}\n`);
	process.exit(exitCodeForCore(code));
}

function executeInboxActions(
	self: SessionId,
	actions: readonly InboxAction[],
	channel: FsChannel,
): void {
	const log = new FsEventLog(pijHome, self);
	for (const action of actions) {
		if (
			action.kind === "persist-receipt-envelope" ||
			action.kind === "persist-brief-ack-envelope"
		) {
			const persisted = persistReceiptEnvelope({
				inbox: channel,
				eventLog: log,
				self,
				action,
				nowMs: Date.now(),
			});
			if (!persisted.ok) failInbox(persisted.code, persisted.message);
			continue;
		}
		const delivered = channel.deliver({
			from: self,
			to: action.to,
			body: receiptBody(action.messageId, "delivered"),
			kind: "receipt",
		});
		if (!delivered.ok) failInbox(delivered.code, delivered.message);
	}
}

function settleInboxResult(
	result: InboxResult,
	json: boolean,
	channel: FsChannel,
	renderEmpty: boolean,
): boolean {
	const hasMessages = result.messages.length > 0;
	if (hasMessages || renderEmpty) {
		process.stdout.write(`${renderInboxResult(result, json)}\n`);
	}
	executeInboxActions(result.self, result.actions, channel);
	if (result.failure) failInbox(result.failure.code, result.failure.message);
	return hasMessages;
}

function runInbox(argv: readonly string[]): void {
	const parsed = parseInboxArgs(argv);
	if (!parsed.ok) failInbox(parsed.code, parsed.message);
	const registry = new FsRegistry(pijHome);
	const registration = ensureCurrentRegistration(registry);
	if (!registration.ok) failInbox(registration.code, registration.message);
	const output = {
		id: registration.value.descriptor.id,
		harness: registration.value.identity.harness,
		harnessSessionId: registration.value.identity.harnessSessionId,
		deliveryMode:
			registration.value.descriptor.deliveryMode ??
			(registration.value.descriptor.paneId ? "push" : "pull"),
		existing: registration.value.existing,
	};
	if (parsed.value.verb === "register") {
		if (output.harness === "pi") {
			const rendered = parsed.value.json
				? JSON.stringify(output)
				: `registered ${output.id} ↔ pi session ${output.harnessSessionId} (push${output.existing ? "; existing" : ""})`;
			process.stdout.write(`${rendered}\n`);
		} else {
			process.stdout.write(
				`${renderInboxRegistration({ ...output, harness: output.harness }, parsed.value.json)}\n`,
			);
		}
		process.exit(0);
	}
	if (parsed.value.wait && isPushedSeat(registration.value.descriptor)) {
		failInbox(
			"error",
			`this seat is a pushed-delivery peer (${registration.value.descriptor.harness ?? "pi"}, pane ${registration.value.descriptor.paneId ?? "unknown"}); it receives turns pushed by the daemon and must not block on 'pij inbox --wait'. End your turn instead.`,
		);
	}
	const channel = new FsChannel(pijHome);
	const consumed = consumeCurrentInbox(registration.value.descriptor.id, channel);
	if (consumed.messages.length > 0) {
		settleInboxResult(consumed, parsed.value.json, channel, false);
		process.exit(0);
	}
	executeInboxActions(consumed.self, consumed.actions, channel);
	if (consumed.failure) failInbox(consumed.failure.code, consumed.failure.message);
	if (parsed.value.wait) {
		waitForInbox(registration.value.descriptor.id, channel, parsed.value.waitMs, parsed.value.json);
		return;
	}
	process.stdout.write(`${renderInboxResult(consumed, parsed.value.json)}\n`);
	process.exit(0);
}

/** --follow: poll the peer's log from the trailer cursor, print only new batches. */
function followTail(cmd: ParsedCommand & { verb: "tail" }, d: CliDeps, fromSeq: number): void {
	let cursor = fromSeq;
	const tick = (): void => {
		// follow:true so dispatch returns the {kind:tail,nextSince} cursor hint;
		// with follow:false res.follow is absent and the cursor never advances (F002).
		const res = dispatch({ ...cmd, since: cursor, follow: true }, d);
		const next = res.follow?.kind === "tail" ? res.follow.nextSince : cursor;
		if (next > cursor) {
			write({ ...res, follow: undefined });
			cursor = next;
		}
		setTimeout(tick, FOLLOW_MS);
	};
	setTimeout(tick, FOLLOW_MS);
}

/** --wait: poll self's receipt events until every target/message pair reaches a
 * terminal receipt (delivered or unverified), or the single timeout elapses. */
function waitReceipts(
	d: CliDeps,
	self: string,
	targets: readonly WaitTarget[],
	timeoutMs = WAIT_TIMEOUT_MS,
	exitCode = 0,
	broadcast = false,
): void {
	const started = Date.now();
	const log = d.eventLogFor(self);
	let seen: readonly string[] = [];
	let pending = targets;
	const tick = (): void => {
		const eventReceipts: Array<{ messageId: string; state: ReceiptState }> = [];
		for (const e of log.read({ type: "receipt" })) {
			const body = (e.data as { body?: string } | undefined)?.body;
			const r = body ? parseReceiptBody(body) : null;
			if (r) eventReceipts.push(r);
		}
		let envelopeReceipts: readonly Extract<
			InboxAction,
			{ readonly kind: "persist-receipt-envelope" }
		>[] = [];
		if (d.inbox) {
			const prepared = prepareReceiptEnvelopes({
				inbox: d.inbox,
				self,
				readAt: new Date().toISOString(),
			});
			if (!prepared.ok) failInbox(prepared.code, prepared.message);
			envelopeReceipts = prepared.value.filter(
				(action): action is Extract<InboxAction, { readonly kind: "persist-receipt-envelope" }> =>
					action.kind === "persist-receipt-envelope",
			);
			for (const action of prepared.value) {
				const persisted = persistReceiptEnvelope({
					inbox: d.inbox,
					eventLog: log,
					self,
					action,
					nowMs: Date.now(),
				});
				if (!persisted.ok) failInbox(persisted.code, persisted.message);
			}
		}
		const merged = applyWaitReceiptSources(pending, seen, eventReceipts, envelopeReceipts);
		for (const update of merged.updates) {
			process.stdout.write(`${renderWaitReceipt(update.target.to, update.state, broadcast)}\n`);
		}
		pending = merged.pending;
		seen = merged.seen;
		if (pending.length === 0) process.exit(exitCode);
		if (Date.now() - started > timeoutMs) {
			process.stdout.write(`${renderWaitTimeout(pending, broadcast)}\n`);
			process.exit(exitCode);
		}
		setTimeout(tick, FOLLOW_MS);
	};
	tick();
}

function waitDispatch(
	d: CliDeps,
	dispatchId: string,
	timeoutMs = WAIT_TIMEOUT_MS,
	exitCode = 0,
): void {
	if (!d.dispatchStore) failInbox("E-NOREG", "dispatch store is not wired — update the pij bin");
	const started = Date.now();
	const tick = (): void => {
		const record = d.dispatchStore?.read(dispatchId);
		if (!record) failInbox("E-NOREG", `no dispatch '${dispatchId}'`);
		if (record.state === "acked") {
			process.stdout.write(
				`dispatch ${record.id} state=acked\nbrief-ack seat=${record.ack?.seat ?? "unknown"} message=${record.ack?.messageId ?? "unknown"}\n`,
			);
			process.exit(exitCode);
		}
		if (Date.now() - started >= timeoutMs) {
			process.stdout.write(`${renderDispatchWaitTimeout(record)}\n`);
			process.exit(exitCode);
		}
		setTimeout(tick, FOLLOW_MS);
	};
	tick();
}

function waitCanary(
	d: CliDeps,
	follow: Extract<NonNullable<CliResult["follow"]>, { readonly kind: "canary-wait" }>,
): void {
	if (!d.dispatchStore) failInbox("E-NOREG", "dispatch store is not wired — update the pij bin");
	const started = Date.now();
	const timeoutMs = follow.timeoutMs ?? WAIT_TIMEOUT_MS;
	const tick = (): void => {
		const record = d.dispatchStore?.read(follow.dispatchId);
		if (!record) failInbox("E-NOREG", `no dispatch '${follow.dispatchId}'`);
		if (record.state === "acked") {
			const result = finalizeCanary(
				{
					dispatchId: follow.dispatchId,
					nonce: follow.nonce,
					expectedModel: follow.expectedModel,
					json: follow.json,
				},
				d,
			);
			write(result);
			process.exit(result.exitCode);
		}
		if (Date.now() - started >= timeoutMs) {
			process.stdout.write(`${renderCanaryTimeout(record)}\n`);
			process.exit(3);
		}
		setTimeout(tick, FOLLOW_MS);
	};
	tick();
}

// ─── daemon lifecycle (auto-start on demand + `pij daemon` verb) ──────────────

/** tmux window name pij gives a daemon window it creates. The convention is the
 *  robust ownership signal (survives a missing/stale lock): a window named this
 *  IS a pij-managed daemon window — safe to find and to tear down. */
const DAEMON_WINDOW_NAME = "pij-daemon";
const daemonLockPath = join(pijHome, "daemon.lock");

function readDaemonStatus() {
	let raw: string | null = null;
	try {
		raw = readFileSync(daemonLockPath, "utf8");
	} catch {
		/* no lock → absent */
	}
	return daemonStatus(parseLockFile(raw), (pid) => new NodeProcess().isAlive(pid));
}

/** Window ids (`@N`) of every tmux window named `pij-daemon`, across all sessions
 *  (`list-windows -a`). The lock-independent convention signal — used both to
 *  avoid double-starting and to tear the daemon's window down on stop. */
function daemonWindows(): string[] {
	try {
		const raw = execFileSync("tmux", ["list-windows", "-a", "-F", "#{window_id} #{window_name}"], {
			encoding: "utf8",
		});
		return raw
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean)
			.map((l) => {
				const sp = l.indexOf(" ");
				return { id: l.slice(0, sp), name: l.slice(sp + 1) };
			})
			.filter((w) => w.name === DAEMON_WINDOW_NAME && /^@\d+$/.test(w.id))
			.map((w) => w.id);
	} catch {
		return [];
	}
}

/** Ensure a daemon is running for a control-plane command. No-op when the lock
 *  shows a LIVE daemon, or when a `pij-daemon` window already exists (one is
 *  booting — the convention guard against a double-start race before the lock is
 *  written). Otherwise create a tmux window that runs the daemon and return a
 *  note so the calling agent KNOWS one was auto-started. Returns null if a daemon
 *  was already up (nothing to report). */
function ensureDaemonRunning(): string | null {
	if (!needsAutoStart(readDaemonStatus())) return null; // lock says a live daemon
	const tmux = new TmuxAdapter();
	if (!tmux.currentSession()) {
		return "⚠️ no pij daemon running and not inside tmux — start one with `pij daemon start`";
	}
	if (daemonWindows().length > 0) return null; // a pij-daemon window already exists (booting)
	const daemonPath = fileURLToPath(new URL("./daemon.ts", import.meta.url));
	const res = tmux.newWindow({
		name: DAEMON_WINDOW_NAME,
		title: "pij daemon",
		cwd: process.cwd(),
		env: { PIJ_DAEMON_OWNED: "1" },
		cmd: "npx",
		args: ["tsx", daemonPath],
		detached: true, // background — never steal the operator's focus
	});
	if (!res.ok) return `⚠️ could not auto-start pij daemon: ${res.message}`;
	return `⚙ no pij daemon was running — started one in tmux window '${DAEMON_WINDOW_NAME}' (pane ${res.value.paneId}); it will drive control-plane sessions to bound.`;
}

/** `pij daemon [start|status|stop|kill]` — lifecycle for the machine-wide daemon.
 *  start: auto-start if absent. status: report lock + convention windows.
 *  stop/kill: SIGTERM the daemon AND kill any `pij-daemon` window pij owns. */
function runDaemonVerb(argv: readonly string[]): void {
	const sub = argv[0] ?? "start";
	if (sub === "start") {
		const note = ensureDaemonRunning();
		if (note) process.stdout.write(`${note}\n`);
		else {
			const st = readDaemonStatus();
			process.stdout.write(
				`pij daemon already running (pid ${st.kind === "running" ? st.pid : "?"})\n`,
			);
		}
		process.exit(0);
	}
	if (sub === "status") {
		const st = readDaemonStatus();
		const wins = daemonWindows();
		const winNote = wins.length ? `; pij-daemon window(s): ${wins.join(", ")}` : "";
		if (st.kind === "running") {
			process.stdout.write(
				`running (pid ${st.pid}${st.window ? `, window ${st.window}` : ""})${winNote}\n`,
			);
		} else if (st.kind === "stale") {
			process.stdout.write(`stale lock (dead pid ${st.pid})${winNote}\n`);
		} else {
			process.stdout.write(`not running${wins.length ? ` (orphan${winNote})` : ""}\n`);
		}
		process.exit(0);
	}
	if (sub === "stop" || sub === "kill") {
		const plan = planStop(readDaemonStatus());
		const did: string[] = [];
		if (plan.kind === "kill") {
			try {
				process.kill(plan.pid, "SIGTERM");
				did.push(`signalled daemon pid ${plan.pid}`);
			} catch {
				did.push(`daemon pid ${plan.pid} already gone`);
			}
		} else if (plan.kind === "cleanup") {
			did.push(`cleared stale lock (dead pid ${plan.pid})`);
		}
		// Convention teardown: kill EVERY pij-daemon window (the one in the lock +
		// any orphan a crashed start left behind). We own these by naming.
		for (const w of daemonWindows()) {
			try {
				// stderr piped (not inherited) so an already-auto-closed window's
				// "can't find window" never leaks to the caller — teardown is idempotent.
				execFileSync("tmux", ["kill-window", "-t", w], { stdio: ["ignore", "pipe", "pipe"] });
				did.push(`killed tmux window ${w}`);
			} catch {
				/* already gone */
			}
		}
		try {
			rmSync(daemonLockPath, { force: true });
		} catch {
			/* already gone */
		}
		process.stdout.write(
			did.length ? `pij daemon stopped — ${did.join("; ")}\n` : "no pij daemon running\n",
		);
		process.exit(0);
	}
	process.stderr.write(`E-ARG: unknown 'pij daemon' subcommand '${sub}' (use start|status|stop)\n`);
	process.exit(64);
}

function focusNameAndJson(
	subcommand: "save" | "launch",
	argv: readonly string[],
): { name: string; json: boolean } | null {
	let name: string | undefined;
	let json = false;
	for (const arg of argv) {
		if (arg === "--json") {
			json = true;
		} else if (arg.startsWith("--")) {
			process.stderr.write(`E-ARG: unknown focus ${subcommand} flag '${arg}'\n${FOCUS_USAGE}\n`);
			process.exit(64);
		} else if (name === undefined) {
			name = arg;
		} else {
			process.stderr.write(`E-ARG: focus ${subcommand} takes exactly one <name>\n${FOCUS_USAGE}\n`);
			process.exit(64);
		}
	}
	if (!name) {
		process.stderr.write(`E-ARG: focus ${subcommand} needs <name>\n${FOCUS_USAGE}\n`);
		process.exit(64);
	}
	return { name, json };
}

function focusTranscriptFiles() {
	return {
		flat: (dir: string): string[] =>
			readdirSync(dir)
				.filter((name) => name.endsWith(".jsonl"))
				.map((name) => join(dir, name)),
		deep: (_dir: string): string[] => [],
		read: (path: string): string => readFileSync(path, "utf8"),
	};
}

function listJsonlDeep(root: string, depth = 8): string[] {
	if (depth < 0) return [];
	try {
		const out: string[] = [];
		for (const entry of readdirSync(root, { withFileTypes: true })) {
			const path = join(root, entry.name);
			if (entry.isDirectory()) out.push(...listJsonlDeep(path, depth - 1));
			else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(path);
		}
		return out;
	} catch {
		return [];
	}
}

function exactPiFamilySessions(root: string, nativeId: string): string[] {
	return listJsonlDeep(root).filter(
		(path) => basename(path).endsWith(`_${nativeId}.jsonl`) && readableRegularFile(path),
	);
}

function isLinkedGitWorktree(cwd: string): boolean {
	try {
		const gitDir = execFileSync(
			"git",
			["-C", cwd, "rev-parse", "--path-format=absolute", "--git-dir"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		).trim();
		const commonDir = execFileSync(
			"git",
			["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		).trim();
		return resolve(cwd, gitDir) !== resolve(cwd, commonDir);
	} catch {
		return false;
	}
}

/** realpath, falling back to the raw path when the folder is gone. Raw strings
 *  never compare safely: worktrees, symlinked homes, `/tmp` → `/private/tmp`. */
function resolvedRealPath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

/** Every seat pij has ever recorded for a folder, hot tier and archive both
 *  (s072 D1 — a reboot can outlast the 48h archive window). The archive index's
 *  `folder` is a cheap pre-filter; only entries that could match are read. */
function seatCandidatesForFolder(registry: FsRegistry, resolvedFolder: string): SeatCandidate[] {
	const candidates: SeatCandidate[] = [];
	for (const descriptor of listAllDescriptors(registry)) {
		candidates.push({
			descriptor,
			resolvedFolder: resolvedRealPath(descriptor.folder),
			tier: "hot",
		});
	}
	const hotIds = new Set(candidates.map((candidate) => candidate.descriptor.id));
	for (const entry of registry.listArchived()) {
		if (hotIds.has(entry.id)) continue;
		if (entry.folder !== undefined && resolvedRealPath(entry.folder) !== resolvedFolder) continue;
		const descriptor = registry.read(entry.id);
		if (!descriptor) continue;
		candidates.push({
			descriptor,
			resolvedFolder: resolvedRealPath(descriptor.folder),
			tier: "archive",
		});
	}
	return candidates;
}

/** Epoch ms of the host's last boot — the corroboration that breaks the pid
 *  recycle trap (s072 D3). `os.uptime()` is seconds since boot on every
 *  platform Node supports. */
function hostBootAtMs(): number | undefined {
	const uptimeSeconds = uptime();
	if (!Number.isFinite(uptimeSeconds) || uptimeSeconds <= 0) return undefined;
	return Date.now() - uptimeSeconds * 1000;
}

/** Ask tmux what it knows about a recorded pane — and whether that pane is still
 *  OURS (s072 FIX-1). `#{pane_pid}` is the exact field pij records as a seat's
 *  pid at spawn/adopt time (see the `#{pane_pid}` reads at spawn), so comparing
 *  it back is the identity check tmux will actually give us.
 *
 *  `ours` here means ONLY "the ids match". It is NOT a liveness verdict: pids are
 *  recycled by a reboot exactly as pane ids are, so `classifyAttachment` weighs
 *  this against absolute-time evidence before it will call anything `live`
 *  (s072 FIX-6). Do not read `ours` as proof of life at any call site.
 *
 *  tmux exits 0 with an EMPTY body when the server is up but the pane does not
 *  exist, and non-zero when there is no server (or no tmux binary) to ask. That
 *  distinction is the whole point: "no such pane" is an answer, "no tmux" is
 *  not, and only the former may count as evidence. */
function observePane(paneId: string | undefined, recordedPid: number): PaneObservation {
	if (!paneId) return "gone";
	let raw: string;
	try {
		raw = execFileSync(
			"tmux",
			["display-message", "-p", "-t", paneId, "#{pane_dead},#{pane_pid}"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
		);
	} catch {
		return "unprobed";
	}
	const answer = raw.trim();
	if (answer === "") return "gone";
	const match = /^([01]),(\d+)$/.exec(answer);
	if (!match) return "unprobed";
	if (match[1] !== "0") return "gone";
	return Number(match[2]) === recordedPid ? "ours" : "not-ours";
}

/** When did the process holding a pane START? (s072 FIX-6.)
 *
 *  This is the ONLY non-recycled identity signal available here: an absolute
 *  wall-clock instant that no allocator hands out twice. `ps -o lstart=` is the
 *  signal — it exists on darwin and linux and prints e.g.
 *  `Sun 26 Jul 12:49:51 2026`. (tmux's own `#{pane_start_time}` was probed on
 *  tmux 3.6a and returns EMPTY — the format does not exist, so `ps` it is.)
 *
 *  Returns undefined when `ps` cannot be run, the pid is gone, or the stamp does
 *  not parse. Undefined is honest: no evidence, not evidence of absence. */
function processStartedAtMs(pid: number): number | undefined {
	let raw: string;
	try {
		raw = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return undefined;
	}
	const parsed = Date.parse(raw.trim());
	return Number.isFinite(parsed) ? parsed : undefined;
}

function probeAttachment(descriptor: SessionDescriptor): {
	readonly liveness: AttachmentLiveness;
	readonly probe: AttachmentProbe;
} {
	const anchorMs = archiveAgeAnchorMs(descriptor);
	const pane = observePane(descriptor.paneId, descriptor.pid);
	// Only worth a `ps` when the pane pid matched: `ours` is the sole verdict that
	// needs corroborating, and in that branch the pane's pid IS `descriptor.pid`
	// (that equality is what produced `ours`), so this asks about the very process
	// tmux says is sitting in the pane.
	const startedAtMs = pane === "ours" ? processStartedAtMs(descriptor.pid) : undefined;
	const probe: AttachmentProbe = {
		pane,
		pidAlive: new NodeProcess().isAlive(descriptor.pid),
		// An `unavailable` observation is pij saying it could NOT look; it proves
		// nothing and must never count as evidence of death.
		terminalObserved:
			descriptor.terminal !== undefined && descriptor.terminal.disposition !== "unavailable",
		...(hostBootAtMs() === undefined ? {} : { hostBootAtMs: hostBootAtMs() }),
		...(anchorMs === null ? {} : { lastActivityAtMs: anchorMs }),
		...(startedAtMs === undefined ? {} : { paneProcessStartedAtMs: startedAtMs }),
	};
	return { liveness: classifyAttachment(probe), probe };
}

/** The tmux window a pane belongs to (`@N`), or undefined when tmux can't say. */
function tmuxWindowIdForPane(paneId: string): string | undefined {
	try {
		const raw = execFileSync("tmux", ["display-message", "-p", "-t", paneId, "#{window_id}"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return /^@\d+$/.test(raw) ? raw : undefined;
	} catch {
		return undefined;
	}
}

function focusPanePid(paneId: string): number {
	try {
		const raw = execFileSync("tmux", ["display-message", "-p", "-t", paneId, "#{pane_pid}"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return /^\d+$/.test(raw) ? Number(raw) : process.pid;
	} catch {
		return process.pid;
	}
}

function writeFocusMaterialized(path: string, contents: string): void {
	mkdirSync(dirname(path), { recursive: true });
	if (existsSync(path)) {
		if (readFileSync(path, "utf8") === contents) return;
		throw new Error(`existing transcript materialization differs: ${path}`);
	}
	writeFileSync(path, contents, { flag: "wx", mode: 0o400 });
}

function waitForFocusPiRegistration(
	registry: FsRegistry,
	paneId: string,
	spawnId: string,
): Result<SessionDescriptor> {
	const deadline = Date.now() + WAIT_TIMEOUT_MS;
	while (Date.now() <= deadline) {
		let matches: SessionDescriptor[];
		try {
			matches = registry
				.list()
				.filter(
					(descriptor) => descriptor.paneId === paneId && (descriptor.harness ?? "pi") === "pi",
				);
		} catch (error) {
			return err(
				"E-NOREG",
				`cannot inspect pi self-registration for focus spawn '${spawnId}': ${String(error)}`,
			);
		}
		const registered = matches[0];
		if (matches.length === 1 && registered) return ok(registered);
		if (matches.length > 1) {
			return err(
				"E-AMBIG",
				`multiple pi sessions self-registered in focus pane ${paneId} for spawn '${spawnId}'`,
			);
		}
		sleepSync(FOLLOW_MS);
	}
	return err(
		"E-NOREG",
		`pi focus spawn '${spawnId}' timed out waiting for self-registration/ready-ping in pane ${paneId}`,
	);
}

function runFocus(argv: readonly string[]): void {
	if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(`${FOCUS_USAGE}\n`);
		return;
	}
	const subcommand = argv[0];
	const rest = argv.slice(1);
	const store = new FsFocusStore(pijHome);
	const registry = new FsRegistry(pijHome);
	const repository = new GitRepositoryAdapter();

	if (subcommand === "save") {
		const parsed = focusNameAndJson("save", rest);
		if (!parsed) return;
		const self = resolveSelf(
			process.env.PIJ_SESSION_ID,
			filterByFolder(registry.list(), process.cwd()),
			process.env.TMUX_PANE,
		);
		if (!self.ok) {
			process.stderr.write(`${self.code}: ${self.message}\n`);
			process.exit(exitCodeForCore(self.code));
		}
		const result = saveFocus(
			{ name: parsed.name, sourcePijId: self.value },
			{
				registry,
				store,
				home: homedir(),
				piSessionDir: process.env.PI_CODING_AGENT_SESSION_DIR,
				transcripts: focusTranscriptFiles(),
				nowIso: () => new Date().toISOString(),
			},
		);
		if (!result.ok) {
			process.stderr.write(`${result.code}: ${result.message}\n`);
			process.exit(exitCodeForCore(result.code));
		}
		process.stdout.write(
			parsed.json
				? `${JSON.stringify(result.value)}\n`
				: `saved focus '${result.value.name}' (${result.value.harness}, ${result.value.model ?? "default"}) at ${store.snapshotPath(result.value.name)}\n`,
		);
		return;
	}

	if (subcommand === "list") {
		let global = false;
		let json = false;
		for (const arg of rest) {
			if (arg === "--global") global = true;
			else if (arg === "--json") json = true;
			else {
				process.stderr.write(`E-ARG: unknown focus list argument '${arg}'\n${FOCUS_USAGE}\n`);
				process.exit(64);
			}
		}
		const result = listFocuses(
			{ cwd: process.cwd(), global },
			{ store, gitCommonDir: (cwd) => repository.gitCommonDir(cwd) },
		);
		if (!result.ok) {
			process.stderr.write(`${result.code}: ${result.message}\n`);
			process.exit(exitCodeForCore(result.code));
		}
		process.stdout.write(`${formatFocusList(result.value, json)}\n`);
		return;
	}

	if (subcommand === "launch") {
		const parsed = focusNameAndJson("launch", rest);
		if (!parsed) return;
		const launchManifest = store.read(parsed.name);
		if (launchManifest?.harness === "claude") {
			const daemonNote = ensureDaemonRunning();
			if (daemonNote) {
				(parsed.json ? process.stderr : process.stdout).write(`${daemonNote}\n`);
			}
		}
		const caller = resolveSelf(
			process.env.PIJ_SESSION_ID,
			filterByFolder(registry.list(), process.cwd()),
			process.env.TMUX_PANE,
		);
		const parentId = caller.ok ? caller.value : undefined;
		const result = launchFocus(
			{ name: parsed.name, launchCwd: process.cwd(), parentId },
			{
				registry,
				store,
				expectations: new FsSpawnExpectationStore(pijHome),
				tmux: new TmuxAdapter(),
				home: homedir(),
				pijHome,
				nowIso: () => new Date().toISOString(),
				randomUuid: randomUUID,
				spawnToken: () => `focus-${Date.now()}-${process.pid}`,
				ownerToken: () => `focus-launch:${Date.now()}:${process.pid}:${randomUUID()}`,
				pid: () => process.pid,
				panePid: focusPanePid,
				cwdExists: (cwd) => {
					try {
						return statSync(cwd).isDirectory();
					} catch {
						return false;
					}
				},
				isGitWorktree: isLinkedGitWorktree,
				gitCommonDir: (cwd) => repository.gitCommonDir(cwd),
				ensureDir: (path) => mkdirSync(path, { recursive: true }),
				writeMaterialized: writeFocusMaterialized,
				waitForPiRegistration: (paneId, spawnId) =>
					waitForFocusPiRegistration(registry, paneId, spawnId),
			},
		);
		if (!result.ok) {
			process.stderr.write(`${result.code}: ${result.message}\n`);
			process.exit(exitCodeForCore(result.code));
		}
		const output = {
			focus: parsed.name,
			id: result.value.id,
			paneId: result.value.paneId,
			harness: result.value.descriptor.harness,
			lifecycle: result.value.descriptor.lifecycle ?? null,
			state: result.value.state,
			forkSessionId: result.value.forkSessionId,
			branchedFrom: result.value.branchedFrom,
		};
		process.stdout.write(
			parsed.json
				? `${JSON.stringify(output)}\n`
				: `started focus '${parsed.name}' as ${output.id} (${output.harness}) in pane ${output.paneId} — PENDING CANARY (not ready); verify golden recall before assigning work\n`,
		);
		return;
	}

	process.stderr.write(`E-ARG: unknown focus subcommand '${subcommand}'\n${FOCUS_USAGE}\n`);
	process.exit(64);
}

function runRevive(argv: readonly string[]): void {
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(`${REVIVE_USAGE}\n`);
		return;
	}
	const parsed = parseReviveArgs(argv);
	if (!parsed.ok) {
		process.stderr.write(`${parsed.code}: ${parsed.message}\n`);
		process.exit(exitCodeForCore(parsed.code));
	}
	const registry = new FsRegistry(pijHome);
	// s072 D1 — no id means "the seat that was driving THIS folder". Resolved
	// against realpath'd folders across both tiers, prime first.
	let seatId = parsed.value.id;
	let seatViaPrime = true;
	if (seatId === undefined) {
		const here = resolvedRealPath(process.cwd());
		const resolved = resolveSeatForFolder(seatCandidatesForFolder(registry, here), here);
		if (!resolved.ok) {
			process.stderr.write(`${resolved.code}: ${resolved.message}\n`);
			process.exit(exitCodeForCore(resolved.code));
		}
		seatId = resolved.value.descriptor.id;
		seatViaPrime = resolved.value.viaPrime;
	}
	// Read the tier from DISK, before any unarchive moves it — an explicitly
	// named archived seat must not be reported as hot.
	const seatTier: "hot" | "archive" = existsSync(join(pijHome, `${seatId}.json`))
		? "hot"
		: "archive";
	// s066 × s071 D1. `pij revive` targets DISSOLVED seats, which is exactly the
	// population the two-tier janitor moves to `~/.pij/archive/` after 48h — so the
	// seats most worth reviving are the ones most likely to be archived. Keyed
	// `read()` still finds them, but an archived descriptor's dataDir/eventsPath
	// point INTO the archive, so a revived session would write its events there and
	// `pij list --archived` would keep listing a seat that is now live. Pull it back
	// to the hot tier first; a non-archived id is a no-op.
	//
	// s072 D2: NOT under `--print`, which must mutate nothing — `read()` already
	// falls through to the archive, and unarchive is a file move.
	if (!parsed.value.print) registry.unarchive(seatId);
	const descriptor = registry.read(seatId);
	const tmux = new TmuxAdapter();
	const reviverId = deriveCallerParent(
		process.env.PIJ_SESSION_ID,
		registry.list(),
		process.env.TMUX_PANE,
	);
	// s072 D3 — the host-restart liveness path. A rebooted host leaves a
	// `bound` descriptor with a stale pane id and a pid the OS has since handed
	// to someone else, so "is that attachment still live" needs both probes plus
	// the boot-time corroboration.
	const attachmentProbe = descriptor ? probeAttachment(descriptor) : undefined;
	const attachment: AttachmentLiveness | undefined = attachmentProbe?.liveness;
	if (descriptor) {
		try {
			if (!statSync(descriptor.folder).isDirectory()) throw new Error("not a directory");
		} catch {
			process.stderr.write(
				`E-NOREG: revive cwd '${descriptor.folder}' for '${descriptor.id}' is unavailable\n`,
			);
			process.exit(3);
		}
	}
	const nativeId = descriptor?.harnessSessionId ?? "";
	const claudePath =
		descriptor?.harness === "claude"
			? transcriptPathFor(homedir(), descriptor.folder, nativeId)
			: undefined;
	const copilotPath =
		descriptor?.harness === "copilot" ? sessionEventsPath(homedir(), nativeId) : undefined;
	const codexPaths =
		descriptor?.harness === "codex"
			? [
					...(descriptor.transcriptPath ? [descriptor.transcriptPath] : []),
					...listCodexRollouts((dir) => {
						try {
							return readdirSync(dir);
						} catch {
							return [];
						}
					}, codexTranscriptRoot(homedir())).filter(
						(path) => codexRolloutForSession([path], nativeId, readableRegularFile) === path,
					),
				].filter(readableRegularFile)
			: [];
	const plan = planRevive(
		descriptor,
		{
			claudePath: claudePath && readableRegularFile(claudePath) ? claudePath : undefined,
			copilotPath: copilotPath && readableRegularFile(copilotPath) ? copilotPath : undefined,
			codexPaths,
			piPaths: exactPiFamilySessions(join(homedir(), ".pi", "agent", "sessions"), nativeId),
			ompPaths: exactPiFamilySessions(join(homedir(), ".omp", "agent", "sessions"), nativeId),
		},
		{
			spawnId: `revive-${Date.now()}-${process.pid}`,
			parentId: reviverId,
			...(attachment === undefined ? {} : { attachment }),
			...(attachmentProbe === undefined
				? {}
				: { attachmentReason: uncertaintyReason(attachmentProbe.probe) }),
			print: parsed.value.print,
			assumeDead: parsed.value.assumeDead,
		},
	);
	if (!plan.ok) {
		process.stderr.write(`${plan.code}: ${plan.message}\n`);
		process.exit(exitCodeForCore(plan.code));
	}
	// s072 D2 — hand the command to the human and exit. Amended contract (s072
	// FIX-2): `--print` MUTATES NOTHING — no descriptor write, no unarchive, no
	// spawn, no send-keys. It MAY issue read-only tmux queries, and it must still
	// work when tmux is absent entirely (the real reboot case), degrading to an
	// `unprobed` attachment rather than an error.
	if (parsed.value.print) {
		const printout = buildRevivePrintout(plan.value);
		const seat = plan.value.descriptor;
		const uncertain = attachment === "uncertain";
		if (parsed.value.json) {
			process.stdout.write(
				`${JSON.stringify({
					id: printout.id,
					harness: seat.harness ?? "pi",
					runtime: printout.runtime,
					model: seat.boundModel ?? null,
					effort: seat.effort ?? null,
					cmd: plan.value.command.cmd,
					args: plan.value.command.args,
					env: plan.value.command.env,
					shellLine: printout.shellLine,
					launchLine: printout.launchLine,
					attachLine: printout.attachLine ?? null,
					selfAdopts: printout.selfAdopts,
					tier: seatTier,
					folder: seat.folder,
					artifactPath: plan.value.artifactPath,
					priorAttachment: attachment ?? "unprobed",
					priorPane: attachmentProbe?.probe.pane ?? "unprobed",
				})}\n`,
			);
			return;
		}
		const origin =
			parsed.value.id === undefined
				? ` · resolved from ${seat.folder} (${seatTier} tier, ${seatViaPrime ? "prime seat" : "NOT prime — the only seat for this folder"})`
				: ` · ${seatTier} tier`;
		const lines = [
			`${printout.id} — ${printout.runtime}${seat.boundModel ? ` ${seat.boundModel}` : ""}${seat.effort ? `/${seat.effort}` : ""}${origin}`,
			"",
			"paste this into the pane you already opened:",
			"",
			`  ${printout.shellLine}`,
			"",
			printout.selfAdopts
				? `${printout.runtime} self-adopts: the resumed session re-derives its own pij identity from its native session artifact, finds this dissolved descriptor, and calls registry.revive() itself. No follow-up adopt.`
				: `${printout.runtime} does NOT self-adopt — nothing in it writes the pij registry. The leading \`pij revive ${printout.id} --attach "$TMUX_PANE"\` binds YOUR pane to the seat first; without it the seat comes back unaddressable.`,
			`prior attachment: ${attachment ?? "unprobed"} (pane ${seat.paneId ?? "—"}: ${attachmentProbe?.probe.pane ?? "unprobed"}).`,
			"nothing was written: --print issues read-only tmux and ps queries only — no descriptor write, no unarchive, no spawn.",
		];
		if (uncertain) {
			lines.push(
				`WARNING: the prior attachment could NOT be proven dead — ${attachmentProbe ? uncertaintyReason(attachmentProbe.probe) : "it was not probed"}. If that seat is in fact alive, running this will fight it.`,
			);
		}
		process.stdout.write(`${lines.join("\n")}\n`);
		return;
	}
	if (plan.value.runtime !== "pi" && plan.value.runtime !== "omp") {
		const daemonNote = ensureDaemonRunning();
		if (daemonNote) (parsed.value.json ? process.stderr : process.stdout).write(`${daemonNote}\n`);
	}
	// s072 D2 — bind an EXISTING pane (the operator's own) to the seat instead of
	// spawning one. This is the half of `--print` that has to run BEFORE the
	// harness starts: claude/copilot/codex carry no pij extension, so nothing
	// else ever rewrites the descriptor's pane.
	if (parsed.value.attach !== undefined) {
		const pane = parsed.value.attach !== "" ? parsed.value.attach : (process.env.TMUX_PANE ?? "");
		if (pane === "") {
			process.stderr.write(
				"E-NOTMUX: --attach needs a pane — run it inside tmux ($TMUX_PANE) or pass --attach %N\n",
			);
			process.exit(2);
		}
		if (!tmux.isPaneLive(pane)) {
			process.stderr.write(`E-ARG: pane ${pane} is not a live tmux pane\n`);
			process.exit(2);
		}
		const attachSpawnId =
			plan.value.command.env.PIJ_SPAWN_ID ?? `revive-${Date.now()}-${process.pid}`;
		const attachRequestedAt = new Date().toISOString();
		const attachExpectations = new FsSpawnExpectationStore(pijHome);
		attachExpectations.write({
			...createSpawnExpectation({
				spawnId: attachSpawnId,
				creatorId: plan.value.command.env.PIJ_PARENT_ID || undefined,
				requestedHarness: plan.value.descriptor.harness ?? "pi",
				requestedAt: attachRequestedAt,
				deadlineAt: spawnExpectationDeadline(attachRequestedAt),
			}),
			paneId: pane,
		});
		// pi/omp self-register from the env at boot (session.ts), so they get the
		// same in-flight marker the spawn path uses and nothing more — writing a
		// descriptor for them here would race their own boot write.
		if (plan.value.runtime === "pi" || plan.value.runtime === "omp") {
			const current = registry.read(plan.value.descriptor.id);
			if (current) {
				registry.writeExact({ ...current, revivePendingAt: new Date().toISOString() });
			}
		} else {
			const attachWindowId = tmuxWindowIdForPane(pane);
			const revived = buildRevivedDescriptor(plan.value.descriptor, {
				paneId: pane,
				...(attachWindowId === undefined ? {} : { windowId: attachWindowId }),
				pid: focusPanePid(pane),
				spawnId: attachSpawnId,
				nowIso: new Date().toISOString(),
				reviverId,
			});
			const persisted = registry.revive(revived);
			if (!persisted.ok) {
				attachExpectations.remove(attachSpawnId);
				process.stderr.write(`${persisted.code}: ${persisted.message}\n`);
				process.exit(exitCodeForCore(persisted.code));
			}
		}
		const attachOutput = {
			id: plan.value.id,
			paneId: pane,
			harness: plan.value.descriptor.harness,
			runtime: plan.value.runtime,
			state: "pending-canary" as const,
			attached: true,
		};
		process.stdout.write(
			parsed.value.json
				? `${JSON.stringify(attachOutput)}\n`
				: `attached ${attachOutput.id} (${attachOutput.runtime}) to pane ${attachOutput.paneId} — now launch the harness in it; PENDING CANARY until golden recall is verified\n`,
		);
		return;
	}
	const ownPane = tmux.currentPane();
	if (!ownPane || !tmux.currentSession()) {
		process.stderr.write("E-NOTMUX: pij revive needs an active tmux session\n");
		process.exit(2);
	}
	const placement = planPlacement(
		parsed.value.layout,
		ownPane,
		livePeerPanes(registry.list(), tmux.currentWindowPanes(), ownPane),
	);
	if (!placement.ok) {
		process.stderr.write(`${placement.code}: ${placement.message}\n`);
		process.exit(2);
	}
	const spawnId = plan.value.command.env.PIJ_SPAWN_ID ?? `revive-${Date.now()}-${process.pid}`;
	const requestedAt = new Date().toISOString();
	const expectations = new FsSpawnExpectationStore(pijHome);
	const expectation = createSpawnExpectation({
		spawnId,
		creatorId: plan.value.command.env.PIJ_PARENT_ID || undefined,
		requestedHarness: plan.value.descriptor.harness ?? "pi",
		requestedAt,
		deadlineAt: spawnExpectationDeadline(requestedAt),
	});
	const seatLabel = buildSeatLabel({
		cwd: plan.value.descriptor.folder,
		job: "revive",
		peerId: plan.value.id,
		model: plan.value.descriptor.boundModel,
	});
	expectations.write(expectation);
	const spawned =
		"window" in placement
			? tmux.newWindow({
					cmd: plan.value.command.cmd,
					args: plan.value.command.args,
					env: plan.value.command.env,
					cwd: plan.value.descriptor.folder,
					name: seatLabel.windowName,
					title: seatLabel.paneTitle,
					detached: true,
				})
			: tmux.splitWindow({
					cmd: plan.value.command.cmd,
					args: plan.value.command.args,
					env: plan.value.command.env,
					cwd: plan.value.descriptor.folder,
					title: seatLabel.paneTitle,
					target: placement.target,
					direction: placement.direction,
					percent: placement.percent,
					evenOut: placement.evenOut,
					columnPercent: placement.columnPercent,
					detached: true,
				});
	if (!spawned.ok) {
		expectations.remove(spawnId);
		process.stderr.write(`${spawned.code}: ${spawned.message}\n`);
		process.exit(2);
	}
	const paneId = spawned.value.paneId;
	expectations.write({ ...expectation, paneId });
	// Review round 1 §2.1 — pi/omp deliberately get NO new descriptor here (they
	// self-register on boot), so without a marker the record stays `dissolved` for
	// the whole boot and the 60s archive janitor moves its session dir out from
	// under the booting process. Stamp the in-flight marker on the EXISTING record
	// so the tier policy can see the revive; the seat's own boot write replaces it.
	if (plan.value.runtime === "pi" || plan.value.runtime === "omp") {
		const current = registry.read(plan.value.descriptor.id);
		if (current) {
			registry.writeExact({ ...current, revivePendingAt: new Date().toISOString() });
		}
	}
	if (plan.value.runtime !== "pi" && plan.value.runtime !== "omp") {
		const revived = buildRevivedDescriptor(plan.value.descriptor, {
			paneId,
			windowId: spawned.value.windowId,
			pid: focusPanePid(paneId),
			spawnId,
			nowIso: new Date().toISOString(),
			reviverId,
		});
		const persisted = registry.revive(revived);
		if (!persisted.ok) {
			tmux.killPane(paneId);
			expectations.remove(spawnId);
			process.stderr.write(`${persisted.code}: ${persisted.message}\n`);
			process.exit(exitCodeForCore(persisted.code));
		}
	}
	const operatorAction =
		plan.value.runtime === "copilot"
			? "needs-human if Copilot shows 'Session in use': press 1 (Resume anyway), then Enter"
			: undefined;
	const output = {
		id: plan.value.id,
		paneId,
		harness: plan.value.descriptor.harness,
		runtime: plan.value.runtime,
		state: "pending-canary" as const,
		...(operatorAction ? { operatorAction } : {}),
	};
	process.stdout.write(
		parsed.value.json
			? `${JSON.stringify(output)}\n`
			: `started revival of ${output.id} (${output.runtime}) in pane ${output.paneId} — PENDING CANARY (not ready); ask a golden-recall question before assigning work${operatorAction ? `; ${operatorAction}` : ""}\n`,
	);
}

/** `pij spawn --harness claude|copilot` (T018, AC-01): split a pane right running
 *  the harness under a PRE-ALLOCATED pij-id, write the `pending` descriptor, and
 *  return the id IMMEDIATELY (<500ms). The running daemon (auto-started here if
 *  absent) drives the pane to ready → bound asynchronously; this never blocks on
 *  boot. Impure (tmux + fs), so it lives in the bin; the parse + builders are pure. */
function runSpawn(argv: readonly string[]): void {
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(`${SPAWN_USAGE}\n`);
		return;
	}
	const req = parseSpawnArgs(argv);
	if (!req.ok) {
		process.stderr.write(`${req.code}: ${req.message}\n`);
		process.exit(64);
	}
	// T006 / #3: warn (never block) on an unknown model OR an effort the chosen model
	// doesn't support, so the caller knows before the pane opens. Both continue.
	const known = loadModels();
	const spawnWarn = buildSpawnWarning(req.value.model, known);
	if (spawnWarn) process.stderr.write(`${spawnWarn}\n`);
	const effortWarn = buildEffortWarning(req.value.effort, req.value.model, known);
	if (effortWarn) process.stderr.write(`${effortWarn}\n`);
	const spawnCwd = process.cwd();
	const planWarn = buildPlanIdWarning(req.value.planId, spawnCwd, (path) => {
		try {
			return statSync(path).isDirectory();
		} catch {
			return false;
		}
	});
	const warnings = planWarn === null ? [] : [planWarn];
	let resolvedPiModel = req.value.model;
	let resolvedPiProvider: string | undefined;
	if (req.value.harness === "pi") {
		const binding = resolvePiModelBinding(req.value.model, known);
		if (!binding.ok) {
			process.stderr.write(`${binding.code}: ${binding.message}\n`);
			process.exit(64);
		}
		resolvedPiModel = binding.value.model;
		resolvedPiProvider = binding.value.provider;
		if (binding.value.notice) process.stderr.write(`${binding.value.notice}\n`);
	}
	const tmux = new TmuxAdapter();
	const ownPane = tmux.currentPane();
	if (!ownPane || !tmux.currentSession()) {
		process.stderr.write("E-NOTMUX: pij spawn --harness needs an active tmux session\n");
		process.exit(2);
	}
	// ── pi path (Plan 021 — one uniform spawn surface) ────────────────────────────
	// A pi child derives its OWN pij-id at boot and self-registers (core/session.ts
	// §H1), and its in-process receiver handles delivery (selectTransport: pi→inbox).
	// So unlike claude/copilot it needs NO daemon, NO pre-allocated id, NO pending
	// descriptor, NO transcript snapshot, and NO binding. We reuse the IDENTICAL
	// registry-based split layout so the fleet sits in one window just like the
	// daemon-bound harnesses — only the command builder + the (absent) bind differ.
	if (req.value.harness === "pi") {
		if (req.value.branch && !supportsBranching(req.value.harness)) {
			// pi cannot fork-from-self (supportsBranching → claude only); reject clearly.
			// Same predicate planBranch gates on, so the two never drift.
			process.stderr.write("E-BRANCH: --branch is not supported for pi (claude only)\n");
			process.exit(64);
		}
		const cwdPi = spawnCwd;
		const regPi = new FsRegistry(pijHome);
		// announce-to = the child's parent (it self-registers spawnedBy from it),
		// so it follows AC-08 caller truth: identity only (env id → pane-exact
		// across the FULL registry), never cwd cohabitation (issue #20).
		// Unresolved caller → "" → the child fresh-boots and announces to all peers.
		const announceTo =
			deriveCallerParent(process.env.PIJ_SESSION_ID, regPi.list(), process.env.TMUX_PANE) ?? "";
		const spawnId = `s${Date.now()}-${process.pid}`;
		const requestedAt = new Date().toISOString();
		const expectations = new FsSpawnExpectationStore(pijHome);
		const expectation = createSpawnExpectation({
			spawnId,
			creatorId: announceTo || undefined,
			requestedHarness: "pi",
			requestedAt,
			deadlineAt: spawnExpectationDeadline(requestedAt),
		});
		// Which pi-family binary to exec: explicit --bin wins, else PIJ_PI_BIN env,
		// else "pi" (default byte-unchanged). omp = oh-my-pi, which self-registers as
		// harness:"pi" exactly like pi — only the binary + its --auto-approve differ.
		const piBin = resolvePiBin(req.value.bin, process.env.PIJ_PI_BIN);
		const spawnCmdPi = buildSpawnCommand({
			spawnId,
			announceTo,
			cwd: cwdPi,
			role: "worker",
			bin: piBin,
			model: resolvedPiModel,
			provider: resolvedPiProvider,
			effort: req.value.effort,
			task: req.value.task,
			planId: req.value.planId,
			noWatchdog: req.value.noWatchdog,
		});
		const seatLabelPi = buildSeatLabel({
			cwd: cwdPi,
			job: "worker",
			peerId: `pending:${spawnId}`,
			model: resolvedPiModel,
		});
		// Same side-stack layout as the daemon-bound harnesses (shared helper → one
		// behaviour across the whole mixed fleet): first peer → right ~1/3 column,
		// later peers append to the stack (uncapped, evens itself).
		const peerPanesPi = livePeerPanes(regPi.list(), tmux.currentWindowPanes(), ownPane);
		const planPi = planPlacement(req.value.layout, ownPane, peerPanesPi);
		if (!planPi.ok) {
			process.stderr.write(`${planPi.code}: ${planPi.message}\n`);
			process.exit(2);
		}
		// Persist before the pane launch: a child can die before self-registering.
		expectations.write(expectation);
		const splitPi =
			"window" in planPi
				? tmux.newWindow({
						cmd: spawnCmdPi.cmd,
						args: spawnCmdPi.args,
						env: spawnCmdPi.env,
						cwd: cwdPi,
						name: seatLabelPi.windowName,
						title: seatLabelPi.paneTitle,
						detached: true,
					})
				: tmux.splitWindow({
						cmd: spawnCmdPi.cmd,
						args: spawnCmdPi.args,
						env: spawnCmdPi.env,
						title: seatLabelPi.paneTitle,
						cwd: cwdPi,
						target: planPi.target,
						direction: planPi.direction,
						percent: planPi.percent,
						evenOut: planPi.evenOut,
						columnPercent: planPi.columnPercent,
						detached: true, // keep focus here; the child boots on its own
					});
		if (!splitPi.ok) {
			expectations.remove(spawnId);
			process.stderr.write(`${splitPi.code}: ${splitPi.message}\n`);
			process.exit(2);
		}
		const panePi = splitPi.value.paneId;
		expectations.write({ ...expectation, paneId: panePi });
		const output = buildSpawnOutput({
			paneId: panePi,
			harness: "pi",
			model: resolvedPiModel,
			effort: req.value.effort,
			planId: req.value.planId,
			warnings,
			note: `${piBin} self-registers as harness:pi; its id is assigned by the child at boot — watch for its ready-ping or \`pij list\``,
		});
		const humanLine = `spawned ${piBin} worker in pane ${panePi} (model ${resolvedPiModel ?? "default"}, effort ${req.value.effort ?? "default"}) — it self-registers at boot (no daemon); its pij-id arrives via the ready-ping (see \`pij list\`)`;
		process.stdout.write(`${renderSpawnReceipt(output, humanLine, req.value.json)}\n`);
		return;
	}
	// A control-plane spawn is inert without a daemon to drive it → ready → bound.
	// Auto-start one if none is running, and tell the caller we did (so the agent
	// knows a new tmux window appeared and that binding is now in motion).
	const daemonNote = ensureDaemonRunning();
	if (daemonNote) process.stdout.write(`${daemonNote}\n`);
	const cwd = spawnCwd;
	const isCopilot = req.value.harness === "copilot";
	const isCodex = req.value.harness === "codex";
	// Branch-from-self (Plan 020): `--branch` forks the CALLER's own session into the
	// new pane. Resolve who's calling (PIJ_SESSION_ID → lone-local → $TMUX_PANE),
	// then gate purely via planBranch (same-harness + supports-branching + bound).
	// A forked claude pins its id (`--session-id`), so it binds on the planned id —
	// no transcript snapshot. branch-from-ANOTHER-peer is out of scope (we only ever
	// pass our own resolved descriptor as `self`), but the seam doesn't preclude it.
	// Parent = the CALLING session, from identity ONLY (AC-08 / issue #20):
	// PIJ_SESSION_ID, else a unique pane-exact match across the FULL registry.
	// cwd cohabitation never makes a parent — unresolved caller → no parent.
	const reg0 = new FsRegistry(pijHome);
	const parentId = deriveCallerParent(
		process.env.PIJ_SESSION_ID,
		reg0.list(),
		process.env.TMUX_PANE,
	);
	// --branch keeps resolveSelf ("which session am I", s051's contract): the
	// fork source is OUR OWN descriptor, a distinct question from who parents
	// the child.
	const callerRes = resolveSelf(
		process.env.PIJ_SESSION_ID,
		filterByFolder(reg0.list(), cwd),
		process.env.TMUX_PANE,
	);
	const gitCommonDir = new GitRepositoryAdapter().gitCommonDir(cwd) ?? undefined;
	let branchFrom: string | undefined;
	let forkSessionId: string | undefined;
	if (req.value.branch) {
		const self = callerRes.ok ? (reg0.read(callerRes.value) ?? null) : null;
		const plan = planBranch(req.value.harness, self, supportsBranching, randomUUID());
		if (!plan.ok) {
			process.stderr.write(`${plan.code}: ${plan.message}\n`);
			process.exit(64);
		}
		branchFrom = plan.value.from;
		forkSessionId = plan.value.newSessionId;
	}
	// Copilot lets us CHOOSE the session UUID (`--session-id`), so binding is
	// deterministic at spawn — no transcript-discovery snapshot needed. A branched
	// claude is the same: it pins its forked id. A NON-branch claude's id is
	// auto-generated, so snapshot the transcript dir NOW (before the pane and Claude
	// exist) so new-path discovery is genuinely deterministic (the daemon's
	// first-tick snapshot would race Claude's early transcript write — H1).
	const copilotSessionId = isCopilot ? randomUUID() : undefined;
	// s071 D4 — pin a PLAIN claude spawn's session id too (`claude --session-id
	// <uuid>`, supported standalone). Transcript discovery identifies a session by
	// "the path that wasn't there before", so two claude peers booting into one
	// folder are permanently ambiguous and never bind. A pinned id makes the bind
	// deterministic, exactly as copilot and branched-claude already are.
	if (req.value.harness === "claude" && forkSessionId === undefined) {
		forkSessionId = randomUUID();
	}
	const skipSnapshot = isCopilot || forkSessionId !== undefined;
	let transcriptsAtSpawn: string[] = [];
	if (!skipSnapshot) {
		if (isCodex) {
			// Codex's rollouts live in the GLOBAL date-nested tree ~/.codex/sessions/**
			// (Plan 022) — snapshot it recursively BEFORE the pane exists so new-path
			// discovery is deterministic (the same H1 race-avoidance as claude, with
			// codex's layout). The daemon binds the one rollout absent from this set.
			transcriptsAtSpawn = listCodexRollouts((d) => {
				try {
					return readdirSync(d);
				} catch {
					return [];
				}
			}, codexTranscriptRoot(homedir()));
		} else {
			const dir = transcriptDir(homedir(), cwd);
			try {
				transcriptsAtSpawn = readdirSync(dir)
					.filter((n) => n.endsWith(".jsonl"))
					.map((n) => `${dir}/${n}`);
			} catch {
				/* dir not created yet → empty before-set */
			}
		}
	}
	const token = `s${Date.now()}-${process.pid}`;
	const requestedAt = new Date().toISOString();
	const expectations = new FsSpawnExpectationStore(pijHome);
	const expectation = createSpawnExpectation({
		spawnId: token,
		creatorId: parentId,
		requestedHarness: req.value.harness,
		requestedAt,
		deadlineAt: spawnExpectationDeadline(requestedAt),
	});
	const reservationOwnerToken = `spawn:${token}:${randomUUID()}`;
	const reserved = reg0.reserveMemorableId(
		spawnIdentitySeed(token, process.pid),
		reservationOwnerToken,
		process.pid,
	);
	if (!reserved.ok) {
		process.stderr.write(`${reserved.code}: ${reserved.message}\n`);
		process.exit(2);
	}
	const pijId = reserved.value.id;
	const spawnCmd = buildControlSpawnCommand({
		harness: req.value.harness,
		pijId,
		cwd,
		model: req.value.model,
		effort: req.value.effort,
		task: req.value.task,
		planId: req.value.planId,
		parentId,
		copilotSessionId,
		branchFrom,
		forkSessionId,
	});
	const seatLabel = buildSeatLabel({
		cwd,
		job: "worker",
		peerId: pijId,
		model: req.value.model,
	});
	// Layout (parity with pi's pij_spawn): the FIRST peer splits the orchestrator
	// pane right (a ~1/3 column); every later peer appends to the stack (vertical,
	// evened out — uncapped). The shared helper derives the live peer panes
	// (registry ∩ this window) — harness-agnostic, one stack for the mixed fleet.
	const peerPanes = livePeerPanes(
		new FsRegistry(pijHome).list(),
		tmux.currentWindowPanes(),
		ownPane,
	);
	const plan = planPlacement(req.value.layout, ownPane, peerPanes);
	if (!plan.ok) {
		reg0.releaseReservation(pijId, reservationOwnerToken);
		process.stderr.write(`${plan.code}: ${plan.message}\n`);
		process.exit(2);
	}
	// FX001-3 / SUGG-001: --layout window opens a background window in the CALLER's
	// session (named after the peer, so it's findable) instead of splitting.
	// Persist the no-show key before tmux can launch and vanish.
	expectations.write(expectation);
	const split =
		"window" in plan
			? tmux.newWindow({
					cmd: spawnCmd.cmd,
					args: spawnCmd.args,
					env: spawnCmd.env,
					cwd,
					name: seatLabel.windowName,
					title: seatLabel.paneTitle,
					detached: true,
				})
			: tmux.splitWindow({
					cmd: spawnCmd.cmd,
					args: spawnCmd.args,
					env: spawnCmd.env,
					title: seatLabel.paneTitle,
					cwd,
					target: plan.target,
					direction: plan.direction,
					percent: plan.percent,
					evenOut: plan.evenOut,
					columnPercent: plan.columnPercent,
					detached: true, // keep focus here; the daemon drives the new pane
				});
	if (!split.ok) {
		expectations.remove(token);
		reg0.releaseReservation(pijId, reservationOwnerToken);
		process.stderr.write(`${split.code}: ${split.message}\n`);
		process.exit(2);
	}
	const paneId = split.value.paneId;
	expectations.write({ ...expectation, paneId });
	// Record the PANE's foreground pid (#{pane_pid}), not this short-lived
	// spawner's pid — otherwise the descriptor probes "dead" the instant the
	// spawn CLI exits and `pij send` refuses a perfectly live claude (liveness
	// is pid-based). The pane pid is the harness process and lives with the pane.
	let panePid = process.pid;
	try {
		const raw = execFileSync("tmux", ["display-message", "-p", "-t", paneId, "#{pane_pid}"], {
			encoding: "utf8",
		}).trim();
		if (/^\d+$/.test(raw)) panePid = Number(raw);
	} catch {
		/* fall back to the spawner pid */
	}
	const dataDir = join(pijHome, pijId);
	const pending = buildPendingDescriptor({
		pijId,
		paneId,
		windowId: split.value.windowId,
		cwd,
		harness: req.value.harness,
		dataDir,
		eventsPath: join(dataDir, "events.ndjson"),
		pid: panePid,
		startedAtIso: new Date().toISOString(),
		// Record who spawned this worker so `pij close` is ownership-aware (a pi
		// child self-registers spawnedBy; claude/copilot get it written here).
		spawnedBy: parentId,
		parentId,
		gitCommonDir,
		transcriptsAtSpawn: skipSnapshot ? undefined : transcriptsAtSpawn,
		plannedHarnessSessionId: copilotSessionId ?? forkSessionId,
		branchedFrom: branchFrom,
		spawnId: token,
		model: req.value.model,
		provider: req.value.harness === "copilot" ? "github-copilot" : undefined,
		effort: req.value.effort,
		planId: req.value.planId,
	});
	const promoted = reg0.promoteReservation(pending, reservationOwnerToken);
	if (!promoted.ok) {
		expectations.remove(token);
		process.stderr.write(`${promoted.code}: ${promoted.message}\n`);
		process.exit(2);
	}
	expectations.write({ ...expectation, paneId, sessionId: pijId });
	if (req.value.noWatchdog === true) {
		const watchdog = new FsWatchdogStore(pijHome);
		watchdog.write(pijId, applyWatchdogExemption(watchdog.read(pijId), Date.now()));
	}
	// FX001-2 / DL-002: a daemon-bound peer never reads PIJ_SPAWN_TASK (only pi
	// children do), so --task rode env into a void. Queue it in the peer's INBOX
	// instead — the daemon injects it as the first turn after bind, exactly like
	// an agent packet pointer (daemon.ts drainInbox). Env stays for the pi path.
	if (req.value.task !== undefined) {
		new FsChannel(pijHome).deliver({
			from: parentId && parentId.trim() !== "" ? parentId : pijId,
			to: pijId,
			body: req.value.task,
		});
	}
	const output = buildSpawnOutput({
		id: pijId,
		paneId,
		harness: req.value.harness,
		lifecycle: "pending",
		model: req.value.model,
		effort: req.value.effort,
		planId: req.value.planId,
		warnings,
		branchedFrom: branchFrom,
	});
	const branchNote = branchFrom ? ` — branched from ${branchFrom}` : "";
	const humanLine = `spawned ${pijId} (${req.value.harness}, model ${req.value.model ?? "default"}, effort ${req.value.effort ?? "default"})${branchNote} in pane ${paneId} — daemon will drive it to ready→bound (track: pij state ${pijId} · pij tail ${pijId})`;
	process.stdout.write(`${renderSpawnReceipt(output, humanLine, req.value.json)}\n`);
	process.exit(0);
}

/** `pij compact-self [--pane %N] [--delay-ms N] [instruction…]` — type `/compact`
 *  + Enter into the CURRENT tmux pane (default `$TMUX_PANE`) so a session compacts
 *  ITSELF. With an `instruction`, after firing `/compact` it waits `--delay-ms`
 *  (default ~1.5s, so compaction has begun) then types the instruction + Enter —
 *  the harness QUEUES input entered during compaction, so the follow-up runs as the
 *  first turn of the fresh context. Works for any harness (pi/claude/copilot all
 *  run `/compact` + queue typed input). No daemon/registry: just send-keys. */
function runCompactSelf(argv: readonly string[]): void {
	const req = parseCompactSelfArgs(argv, process.env.TMUX_PANE);
	const pane = req.pane;
	if (!pane || !/^%\d+$/.test(pane)) {
		process.stderr.write(
			"E-NOTMUX: compact-self needs a tmux pane (set $TMUX_PANE, or pass --pane %N)\n",
		);
		process.exit(2);
	}

	// DL-004: best-effort mark the compact window on the caller's descriptor so
	// the daemon HOLDS inbox drain while this pane compacts (an injection into
	// the compact window is eaten by the harness's fresh-context reset). An
	// unregistered/unresolvable pane gets no mark — send-keys behavior unchanged.
	try {
		const reg = new FsRegistry(pijHome);
		const self = resolveSelf(
			process.env.PIJ_SESSION_ID,
			filterByFolder(reg.list(), process.cwd()),
			pane,
		);
		if (self.ok) markCompactingSelf(reg, self.value, new Date().toISOString());
	} catch {
		/* best-effort — compacting still works without the daemon hold */
	}

	typeLiteral(pane, "/compact", execFileRunner);
	// Settle so the paste/slash-menu detection resolves before Enter (same lesson
	// as the daemon's send-keys — fire Enter too soon and it's swallowed).
	sleepSync(300);
	pressKey(pane, "Enter", 1, execFileRunner);
	if (req.instruction) {
		// Let compaction BEGIN, then type the follow-up. The harness queues input
		// entered mid-compaction and runs it once the fresh context is ready.
		sleepSync(req.delayMs);
		typeLiteral(pane, req.instruction, execFileRunner);
		sleepSync(300);
		pressKey(pane, "Enter", 1, execFileRunner);
		process.stdout.write(
			`compact-self → fired /compact into ${pane}, queued follow-up (after ${req.delayMs}ms): ${req.instruction}\n`,
		);
	} else {
		process.stdout.write(`compact-self → fired /compact into ${pane}\n`);
	}
	process.exit(0);
}

function resolveWatchSelf(): { id: string; harness: HarnessKind | undefined } {
	const reg = new FsRegistry(pijHome);
	const self = resolveSelf(
		process.env.PIJ_SESSION_ID,
		filterByFolder(reg.list(), process.cwd()),
		process.env.TMUX_PANE,
	);
	if (!self.ok) {
		process.stderr.write(
			`${self.code}: ${self.message}; set PIJ_SESSION_ID or run inside an adopted/spawned pane\n`,
		);
		process.exit(2);
	}
	const descriptor = reg.read(self.value);
	if (!descriptor) {
		process.stderr.write(`E-NOID: no such session '${self.value}'\n`);
		process.exit(2);
	}
	if ((descriptor.harness ?? "pi") === "pi") {
		process.stderr.write(
			"E-ARG: pij watch is for non-pi peers only; use the file-watch-notify extension inside pi sessions\n",
		);
		process.exit(64);
	}
	return { id: descriptor.id, harness: descriptor.harness };
}

function runWatch(argv: readonly string[]): void {
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(`${WATCH_USAGE}\n`);
		process.exit(0);
	}
	const { mode, debounceMs, globs, error } = splitWatchFlags(argv);
	if (error) {
		process.stderr.write(`E-ARG: ${error}\n${WATCH_USAGE}\n`);
		process.exit(64);
	}
	if (globs.length === 0) {
		process.stderr.write(`E-ARG: watch requires at least one glob\n${WATCH_USAGE}\n`);
		process.exit(64);
	}
	const self = resolveWatchSelf();
	const store = new FsWatchStore(pijHome);
	const watches = addWatch(
		store.readWatches(self.id),
		globs,
		new Date().toISOString(),
		mode,
		debounceMs,
	);
	store.writeWatches(self.id, watches);
	process.stdout.write(
		`watching ${watches.length} subscription(s) for ${self.id} (mode: ${mode}, debounce: ${debounceMs === undefined ? "default" : `${debounceMs}ms`})\n`,
	);
}

/** Split watch flags from globs (`notify` mode and daemon default cadence when absent). */
function splitWatchFlags(argv: readonly string[]): {
	mode: WatchMode;
	debounceMs?: number;
	globs: string[];
	error?: string;
} {
	let mode: WatchMode = "notify";
	let debounceMs: number | undefined;
	const globs: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--diff") {
			mode = "diff";
		} else if (arg === "--notify") {
			mode = "notify";
		} else if (arg === "--mode") {
			const next = argv[i + 1];
			if (next !== "notify" && next !== "diff") {
				return { mode, globs, error: "--mode must be notify or diff" };
			}
			mode = next;
			i++;
		} else if (arg === "--debounce") {
			const next = argv[i + 1];
			const parsed = next === undefined ? undefined : parseDebounceMs(next);
			if (parsed === undefined) {
				return {
					mode,
					debounceMs,
					globs,
					error: "--debounce must be a positive duration in ms or s (for example 750ms or 2s)",
				};
			}
			debounceMs = parsed;
			i++;
		} else if (arg !== undefined) {
			globs.push(arg);
		}
	}
	return { mode, debounceMs, globs };
}

function parseDebounceMs(value: string): number | undefined {
	const match = /^(\d+)(ms|s)?$/u.exec(value);
	if (!match) return undefined;
	const amount = Number(match[1]);
	const result = amount * (match[2] === "s" ? 1000 : 1);
	return Number.isSafeInteger(result) && result > 0 ? result : undefined;
}

function runUnwatch(argv: readonly string[]): void {
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(`${WATCH_USAGE}\n`);
		process.exit(0);
	}
	const self = resolveWatchSelf();
	const store = new FsWatchStore(pijHome);
	const watches = removeWatch(store.readWatches(self.id), argv);
	store.writeWatches(self.id, watches);
	process.stdout.write(`watching ${watches.length} subscription(s) for ${self.id}\n`);
}

function readableRegularFile(path: string): boolean {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

/** Best-effort mtime (ms) of a path — `-1` if unreadable, so it sorts last. */
function statMtime(path: string): number {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return -1;
	}
}

/** Best-effort metadata for `~/.copilot/session-state/*`. Identity selection is
 * env-correlated; mtime is diagnostic metadata only and never a winner rule. */
function listCopilotStateDirs(root: string): CopilotSessionDir[] {
	try {
		return readdirSync(root).flatMap((name) => {
			try {
				const stat = statSync(join(root, name));
				return [{ name, mtimeMs: stat.mtimeMs, isDirectory: stat.isDirectory() }];
			} catch {
				return [];
			}
		});
	} catch {
		return [];
	}
}

/** `pij adopt <pane> --harness <h> [--session-id <native-id>] [--export]`
 *  (T023/T029, AC-14/15; harness-aware per Plan 031): register or re-attach an
 *  ALREADY-running tmux agent (e.g. this orchestrator's
 *  own pane) as a bound pij peer so other sessions can `pij send` to it and the
 *  daemon dumps the message into its pane. Adopt has no post-spawn new-file event,
 *  so it binds by its OWN harness-aware rule (`resolveAdoptSessionIdForHarness`):
 *    - claude → the adopting shell's CLAUDE_CODE_SESSION_ID, else the newest
 *      transcript stem in the cwd (unchanged);
 *    - codex → the newest rollout's trailing UUID + its absolute transcriptPath;
 *    - copilot → validated current `COPILOT_AGENT_SESSION_ID` with matching
 *      session-state directory metadata; global newest-by-mtime is forbidden;
 *  else pending + `pij phonehome`. `--export` prints ONLY the eval-able
 *  `export PIJ_SESSION_ID=…` block (ergonomic self-resolution sugar — NOT the
 *  telemetry fix; finding 04). */
function runAdopt(argv: readonly string[]): void {
	// `--export` is not a parseAdoptArgs flag (that parser lives in core/spawn.ts);
	// strip it here so the rest parses cleanly, then emit the eval block instead of
	// the human confirmation line.
	const wantExport = argv.includes("--export");
	const req = parseAdoptArgs(argv.filter((a) => a !== "--export"));
	if (!req.ok) {
		process.stderr.write(`${req.code}: ${req.message}\n`);
		process.exit(64);
	}
	const pane = req.value.pane;
	const harness = req.value.harness;
	// Resolve the pane's cwd + foreground pid + window id from tmux (window id:
	// plan 054 P2 T006 — AC-09 terminal addressability rides the same call).
	let cwd = process.cwd();
	let panePid = process.pid;
	let windowId: string | undefined;
	try {
		const out = execFileSync(
			"tmux",
			["display-message", "-p", "-t", pane, "#{pane_current_path}\t#{pane_pid}\t#{window_id}"],
			{ encoding: "utf8" },
		).trim();
		const [path, pid, win] = out.split("\t");
		if (path) cwd = path;
		if (pid && /^\d+$/.test(pid)) panePid = Number(pid);
		if (win && /^@\d+$/.test(win)) windowId = win;
	} catch {
		process.stderr.write(`E-ARG: cannot resolve pane ${pane} (is it a live tmux pane?)\n`);
		process.exit(2);
	}
	const gitCommonDir = new GitRepositoryAdapter().gitCommonDir(cwd) ?? undefined;
	// Harness-aware newest-first listings (the impure readdir/mtime-sort lives here;
	// the decision is the pure resolver). Only the relevant harness's listing runs.
	let claudeStemsNewestFirst: string[] = [];
	let codexRolloutPathsNewestFirst: string[] = [];
	let copilotCurrentSessionId: string | null = null;
	let copilotBindingIssue: string | undefined;
	if (harness === "codex") {
		// Codex's rollouts live in the GLOBAL date-nested tree ~/.codex/sessions/**;
		// deep-list then mtime-sort newest-first (the pane-start-time proxy).
		const paths = listCodexRollouts((d) => {
			try {
				return readdirSync(d);
			} catch {
				return [];
			}
		}, codexTranscriptRoot(homedir()));
		codexRolloutPathsNewestFirst = paths
			.map((p) => ({ p, t: statMtime(p) }))
			.sort((a, b) => b.t - a.t)
			.map(({ p }) => p);
	} else if (harness === "copilot") {
		const current = resolveCopilotCurrentSession(
			process.env.COPILOT_AGENT_SESSION_ID,
			listCopilotStateDirs,
			homedir(),
		);
		if (current.ok) copilotCurrentSessionId = current.sessionId;
		else copilotBindingIssue = current.message;
	} else {
		// claude (+ pi): unchanged — newest transcript stems in the cwd's project dir.
		const dir = transcriptDir(homedir(), cwd);
		try {
			claudeStemsNewestFirst = readdirSync(dir)
				.filter((n) => n.endsWith(".jsonl"))
				.map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs }))
				.sort((a, b) => b.t - a.t)
				.map(({ n }) => n.slice(0, -".jsonl".length));
		} catch {
			/* no transcripts yet */
		}
	}
	const resolution = resolveAdoptSessionIdForHarness({
		harness,
		envSessionId: process.env.CLAUDE_CODE_SESSION_ID,
		claudeStemsNewestFirst,
		codexRolloutPathsNewestFirst,
		copilotCurrentSessionId,
	});
	// An explicit --session-id is authoritative for restart re-attachment.
	// Harness artifact discovery remains an initial-adopt fallback only.
	const harnessSessionId = req.value.sessionId ?? resolution.harnessSessionId ?? undefined;
	const bindingIssue = req.value.sessionId ? undefined : copilotBindingIssue;
	const registry = new FsRegistry(pijHome);
	let durablePijId: string | undefined;
	let durableDescriptor: SessionDescriptor | undefined;
	if (harnessSessionId) {
		const durable = registry.resolveIdentity(harness, harnessSessionId);
		if (!durable.ok) {
			process.stderr.write(`${durable.code}: ${durable.message}\n`);
			process.exit(2);
		}
		durablePijId = durable.value;
		const snapshot = registry.resolveIdentitySnapshot(harness, harnessSessionId);
		if (!snapshot.ok) {
			process.stderr.write(`${snapshot.code}: ${snapshot.message}\n`);
			process.exit(2);
		}
		durableDescriptor = snapshot.value;
	}
	// Defect B (plan 071 D4): adopt INTO the descriptor that already owns this
	// pane instead of minting a second one. Without this, `pij adopt` on a
	// spawned-but-unbound seat allocated a fresh memorable id and claimed the
	// native identity for it, after which the ORIGINAL seat's `pij phonehome`
	// failed with "identity claude:<uuid> is already mapped to <the duplicate>" —
	// a self-inflicted E-AMBIG that took three hand-deleted files to undo.
	//
	// Only ever an INFERENCE for the id: an explicit `--id` still wins, and a pane
	// with two pre-bind descriptors is left alone (ambiguity is a defect to
	// surface, not to guess past).
	const paneOccupant = req.value.id
		? undefined
		: pendingPaneOccupant(listAllDescriptors(registry), pane);
	if (paneOccupant) {
		process.stderr.write(
			`note: pane ${pane} is already owned by pending descriptor ${paneOccupant.id} — adopting INTO it rather than minting a new id\n`,
		);
	}
	const requestedId = req.value.id ?? paneOccupant?.id;
	const requestedDescriptor = requestedId ? registry.read(requestedId) : null;
	let requestedReservation = false;
	if (requestedId) {
		const reservation = registry.hasReservation(requestedId);
		if (!reservation.ok) {
			process.stderr.write(`${reservation.code}: ${reservation.message}\n`);
			process.exit(2);
		}
		requestedReservation = reservation.value;
		if (!requestedDescriptor && !requestedReservation) {
			process.stderr.write(`E-NOID: pij id ${requestedId} does not exist\n`);
			process.exit(2);
		}
		if (durablePijId && durablePijId !== requestedId) {
			process.stderr.write(
				`E-AMBIG: durable ${harness}:${harnessSessionId} identity is ${durablePijId}, not requested ${requestedId}\n`,
			);
			process.exit(2);
		}
	}
	if (req.value.parentId !== undefined) {
		const parentDescriptor = registry.read(req.value.parentId);
		if (!parentDescriptor) {
			process.stderr.write(`E-NOID: no parent session '${req.value.parentId}' in registry\n`);
			process.exit(2);
		}
		const candidateId = requestedId ?? durablePijId ?? durableDescriptor?.id;
		if (candidateId) {
			const candidate =
				requestedDescriptor ??
				durableDescriptor ??
				buildPendingDescriptor({
					pijId: candidateId,
					paneId: pane,
					cwd,
					harness,
					dataDir: join(pijHome, candidateId),
					eventsPath: join(pijHome, candidateId, "events.ndjson"),
					pid: panePid,
					startedAtIso: new Date().toISOString(),
				});
			const graph = listAllDescriptors(registry).filter(
				(descriptor) => descriptor.id !== candidate.id,
			);
			graph.push(candidate);
			const linked = planLink(graph, candidate.id, req.value.parentId);
			if (!linked.ok) {
				process.stderr.write(`${linked.code}: ${linked.message}\n`);
				process.exit(2);
			}
		}
	}
	let descriptor: SessionDescriptor;
	if (harnessSessionId) {
		let transcriptPath =
			resolution.harnessSessionId === harnessSessionId ? resolution.transcriptPath : undefined;
		if (harness === "codex" && req.value.sessionId) {
			const storedPath = requestedDescriptor?.transcriptPath ?? durableDescriptor?.transcriptPath;
			transcriptPath =
				(storedPath && readableRegularFile(storedPath) ? storedPath : undefined) ??
				codexRolloutForSession(
					codexRolloutPathsNewestFirst,
					harnessSessionId,
					readableRegularFile,
				) ??
				undefined;
			if (!transcriptPath) {
				process.stderr.write(
					`E-NOID: no Codex rollout found for authoritative session ${harnessSessionId}\n`,
				);
				process.exit(2);
			}
		}

		if (requestedId) {
			if (requestedDescriptor) {
				if (
					(requestedDescriptor.harness && requestedDescriptor.harness !== harness) ||
					(requestedDescriptor.harnessSessionId &&
						requestedDescriptor.harnessSessionId !== harnessSessionId)
				) {
					process.stderr.write(
						`E-AMBIG: pij id ${requestedId} is already bound to ${requestedDescriptor.harness ?? "legacy"}:${requestedDescriptor.harnessSessionId ?? "unknown"}\n`,
					);
					process.exit(2);
				}
				descriptor = reattachIdentity(requestedDescriptor, {
					harness,
					harnessSessionId,
					folder: cwd,
					pid: panePid,
					paneId: pane,
					transcriptPath,
				});
				try {
					registry.write(descriptor, "cli");
				} catch (error) {
					process.stderr.write(`E-AMBIG: ${(error as Error).message}\n`);
					process.exit(2);
				}
			} else {
				const dataDir = join(pijHome, requestedId);
				descriptor = applyBinding(
					buildPendingDescriptor({
						pijId: requestedId,
						paneId: pane,
						cwd,
						harness,
						dataDir,
						eventsPath: join(dataDir, "events.ndjson"),
						pid: panePid,
						startedAtIso: new Date().toISOString(),
					}),
					harnessSessionId,
				);
				if (transcriptPath) descriptor = { ...descriptor, transcriptPath };
				const recovered = registry.recoverReservation(descriptor);
				if (!recovered.ok) {
					process.stderr.write(`${recovered.code}: ${recovered.message}\n`);
					process.exit(2);
				}
				try {
					registry.write(descriptor, "cli");
				} catch (error) {
					process.stderr.write(`E-AMBIG: ${(error as Error).message}\n`);
					process.exit(2);
				}
			}
		} else {
			const allocated = registry.allocateIdentity(
				harness,
				harnessSessionId,
				memorableIdentitySeed(harness, harnessSessionId),
				deriveHarnessPijId(harness, harnessSessionId),
			);
			if (!allocated.ok) {
				process.stderr.write(`${allocated.code}: ${allocated.message}\n`);
				process.exit(2);
			}
			const reusable = allocated.value.descriptor ?? durableDescriptor;
			if (reusable && reusable.id !== allocated.value.id) {
				process.stderr.write(
					`E-AMBIG: durable metadata belongs to ${reusable.id}, not resolved ${allocated.value.id}\n`,
				);
				process.exit(2);
			}
			if (reusable) {
				descriptor = reattachIdentity(reusable, {
					harness,
					harnessSessionId,
					folder: cwd,
					pid: panePid,
					paneId: pane,
					transcriptPath,
				});
			} else {
				const dataDir = join(pijHome, allocated.value.id);
				descriptor = applyBinding(
					buildPendingDescriptor({
						pijId: allocated.value.id,
						paneId: pane,
						cwd,
						harness,
						dataDir,
						eventsPath: join(dataDir, "events.ndjson"),
						pid: panePid,
						startedAtIso: new Date().toISOString(),
					}),
					harnessSessionId,
				);
				if (transcriptPath) descriptor = { ...descriptor, transcriptPath };
			}
			try {
				registry.write(descriptor, "cli");
			} catch (error) {
				process.stderr.write(`E-AMBIG: ${(error as Error).message}\n`);
				process.exit(2);
			}
		}
	} else {
		if (requestedId && requestedDescriptor) {
			if (requestedDescriptor.harness && requestedDescriptor.harness !== harness) {
				process.stderr.write(
					`E-AMBIG: pij id ${requestedId} belongs to ${requestedDescriptor.harness}, not ${harness}\n`,
				);
				process.exit(2);
			}
			if (requestedDescriptor.harnessSessionId) {
				descriptor = reattachIdentity(requestedDescriptor, {
					harness,
					harnessSessionId: requestedDescriptor.harnessSessionId,
					folder: cwd,
					pid: panePid,
					paneId: pane,
					transcriptPath: requestedDescriptor.transcriptPath,
				});
			} else {
				descriptor = {
					...requestedDescriptor,
					folder: cwd,
					pid: panePid,
					state: "idle",
					paneId: pane,
					harness,
					lifecycle: "pending",
				};
			}
			registry.write(descriptor, "cli");
		} else if (requestedId && requestedReservation) {
			const dataDir = join(pijHome, requestedId);
			descriptor = buildPendingDescriptor({
				pijId: requestedId,
				paneId: pane,
				cwd,
				harness,
				dataDir,
				eventsPath: join(dataDir, "events.ndjson"),
				pid: panePid,
				startedAtIso: new Date().toISOString(),
			});
			const recovered = registry.recoverReservation(descriptor);
			if (!recovered.ok) {
				process.stderr.write(`${recovered.code}: ${recovered.message}\n`);
				process.exit(2);
			}
		} else {
			const ownerToken = `adopt:${harness}:${pane}:${randomUUID()}`;
			const reserved = registry.reserveMemorableId(
				`adopt\0${harness}\0${pane}\0${panePid}`,
				ownerToken,
				process.pid,
			);
			if (!reserved.ok) {
				process.stderr.write(`${reserved.code}: ${reserved.message}\n`);
				process.exit(2);
			}
			const dataDir = join(pijHome, reserved.value.id);
			descriptor = buildPendingDescriptor({
				pijId: reserved.value.id,
				paneId: pane,
				cwd,
				harness,
				dataDir,
				eventsPath: join(dataDir, "events.ndjson"),
				pid: panePid,
				startedAtIso: new Date().toISOString(),
			});
			const promoted = registry.promoteReservation(descriptor, ownerToken);
			if (!promoted.ok) {
				process.stderr.write(`${promoted.code}: ${promoted.message}\n`);
				process.exit(2);
			}
		}
	}
	descriptor = {
		...descriptor,
		...(req.value.parentId !== undefined ? { parentId: req.value.parentId } : {}),
		...(windowId !== undefined ? { windowId } : {}),
		gitCommonDir,
	};
	try {
		registry.write(descriptor, "cli");
	} catch (error) {
		process.stderr.write(`E-AMBIG: ${(error as Error).message}\n`);
		process.exit(2);
	}
	const pijId = descriptor.id;
	const finalHarnessSessionId = descriptor.harnessSessionId ?? null;
	const finalBindingIssue = finalHarnessSessionId ? undefined : bindingIssue;
	if (wantExport) {
		// AC-5: the eval-able block is the ONLY stdout, safe to `eval`.
		process.stdout.write(`${buildExportLines(descriptor)}\n`);
	} else if (req.value.json) {
		process.stdout.write(
			`${JSON.stringify({ id: pijId, paneId: pane, harness, harnessSessionId: finalHarnessSessionId, transcriptPath: descriptor.transcriptPath ?? null, lifecycle: descriptor.lifecycle, ...(finalBindingIssue ? { bindingIssue: finalBindingIssue } : {}) })}\n`,
		);
	} else if (finalHarnessSessionId) {
		process.stdout.write(
			`adopted ${pijId} ↔ ${harness} session ${finalHarnessSessionId} (pane ${pane}, bound) — peers can now: pij send ${pijId} "<text>"\n`,
		);
	} else {
		process.stdout.write(
			`adopted ${pijId} (pane ${pane}, pending) — ${finalBindingIssue ? `${finalBindingIssue}; ` : ""}run \`pij phonehome\` in that pane to confirm the binding\n`,
		);
	}
	process.exit(0);
}

/** `pij close <id> [--force]` — tear down a colleague's tmux pane and drop its
 *  descriptor with just the pij-id (the first-class replacement for hand-rolled
 *  `tmux kill-pane` + `rm ~/.pij/<id>.json`). Ownership-guarded by `planClose`:
 *  you may close a worker you spawned; closing one you don't own is refused
 *  (E-OWN) unless `--force`. Impure (tmux killPane + registry.remove), so it
 *  lives in the bin; the decision is the pure core. */
/** `pij identity release <id>` — free a pij id's native-identity claim WITHOUT
 *  teardown (plan 071 D4, defect C).
 *
 *  The recovery hole this closes: when a duplicate descriptor claimed a native
 *  session id, the ONLY verb that could free the claim was `pij close`, which
 *  kills the pane — so a peer trying to fix its own identity would have been
 *  committing suicide. The operator instead hand-deleted three files under
 *  `~/.pij/identities/`. Recovery must never require that. */
function runIdentity(argv: readonly string[]): void {
	const action = argv[0];
	const id = argv[1];
	const json = argv.includes("--json");
	if (action !== "release" || !id || id.startsWith("--")) {
		process.stderr.write("usage: pij identity release <id> [--json]\n");
		process.exit(64);
	}
	const registry = new FsRegistry(pijHome);
	if (!registry.read(id)) {
		process.stderr.write(`E-NOID: no session '${id}' in registry\n`);
		process.exit(2);
	}
	const released = registry.releaseIdentity(id);
	if (!released.ok) {
		process.stderr.write(`${released.code}: ${released.message}\n`);
		process.exit(2);
	}
	if (json) {
		process.stdout.write(`${JSON.stringify({ id, ...released.value })}\n`);
		return;
	}
	if (!released.value.released) {
		process.stdout.write(`${id} holds no native-identity claim — nothing to release\n`);
		return;
	}
	process.stdout.write(
		`released ${id}'s native-identity claim (${released.value.removedPaths.length} record(s)); ` +
			"the pane and descriptor are untouched — re-bind with `pij phonehome` from that pane\n",
	);
}

function runClose(argv: readonly string[]): void {
	if (argv.includes("--help") || argv.includes("-h")) {
		process.stdout.write(
			"pij close — tear down a colleague's pane + descriptor by pij-id\n\n" +
				"USAGE\n  pij close <id> [--force]\n\n" +
				"FLAGS\n  --force   close a session you did NOT spawn (default: refuse with E-OWN)\n",
		);
		return;
	}
	const parsed = parseCloseArgs(argv);
	if (!parsed.ok) {
		process.stderr.write(`${parsed.code}: ${parsed.message}\n`);
		process.exit(64);
	}
	const reg = new FsRegistry(pijHome);
	const descriptor = reg.read(parsed.value.id);
	// Resolve who's asking (PIJ_SESSION_ID → lone-local → $TMUX_PANE) for the
	// ownership check. Unresolved self is fine — a non-owner without --force is
	// refused either way, and --force always proceeds.
	// INS-004 interim (close is the 3rd site of the caller-identity resolution bug):
	// route through the STRONG full-registry-pane resolver (orchestrationSelf) instead
	// of the folder-starving weak path, so a seat closing its OWN peer from a shell
	// whose cwd != its recorded folder resolves instead of being refused as a
	// non-owner (blocked teardown → accumulating seats). Full consolidation onto one
	// canonical resolver (+ hyena's s051 pid seam) follows as Stream-3 work.
	const selfRes = orchestrationSelf(reg);
	const self = selfRes.ok ? selfRes.value : undefined;
	const plan = planClose(descriptor, parsed.value.id, self, parsed.value.force);
	if (!plan.ok) {
		process.stderr.write(`${plan.code}: ${plan.message}\n`);
		// E-NOID / E-SELF / E-OWN are all precondition refusals → exit 2.
		process.exit(2);
	}
	if (plan.value.warning) process.stderr.write(`${plan.value.warning}\n`);
	if (plan.value.alreadyDissolved) {
		process.stdout.write(`closed ${plan.value.id} — already dissolved\n`);
		process.exit(0);
	}
	const tmux = new TmuxAdapter();
	const expectations = new FsSpawnExpectationStore(pijHome);
	const closeIntent = {
		actor: self ?? "operator",
		kind: "cli-close" as const,
		requestedAt: new Date().toISOString(),
	};
	if (descriptor) {
		// Persist intent before touching tmux so a later observed absence is correctly classified.
		// "close": this verb IS the terminal-truth authority (s070/#47).
		reg.write({ ...descriptor, closeIntent }, "close");
		// s070: the DESCRIPTOR write alone is not enough. Once close dissolves the
		// descriptor it is filtered out of registry.list() and the death sweep can no
		// longer see the intent; the sweep then falls through to the EXPECTATION,
		// which has no closeIntent of its own and is classified `unrequested-by-pij`.
		// session.ts:436 already does this; the CLI path was the asymmetry.
		if (descriptor.spawnId) {
			const expectation = expectations.read(descriptor.spawnId);
			if (expectation) expectations.write(requestClose(expectation, closeIntent));
		}
		traceP3("close:intent-write");
	}
	traceP3("close:kill");
	const killed = tmux.killPane(plan.value.paneId); // idempotent: swallows "already gone"
	if (!killed.ok) {
		process.stderr.write(`${killed.code}: ${killed.message}\n`);
		process.exit(2);
	}
	const observedAt = new Date().toISOString();
	if (descriptor) {
		// A successful idempotent kill is our owned observation: persist terminal
		// truth before hiding the descriptor, so history can distinguish requested.
		reg.write(
			{
				...descriptor,
				closeIntent,
				terminal: { disposition: "requested", observedAt, evidence: "pane-missing" },
				deathNoticeLatchedAt: observedAt,
			},
			"close",
		);
		traceP3("close:terminal-write");
	}
	reg.dissolve(plan.value.id);
	traceP3("close:dissolve");
	process.stdout.write(
		`closed ${plan.value.id} — killed pane ${plan.value.paneId}, requested terminal recorded, descriptor dissolved\n`,
	);
	process.exit(0);
}

/** `pij tail <pij-id>` for a BOUND control-plane session (T022, AC-09): a coding
 *  harness writes its OWN per-session JSONL transcript, not pij's events.ndjson —
 *  claude under ~/.claude/projects/…/<sid>.jsonl, copilot under
 *  ~/.copilot/session-state/<sid>/events.jsonl, codex under the persisted
 *  ~/.codex/sessions/…/rollout-…<uuid>.jsonl (Plan 022, Finding 06). Resolve that
 *  file (by harness) and stream a summarized view (`[role] text`, tool calls as
 *  `⚙ name`); `--follow` polls for new lines. Returns false when the target is not
 *  a bound claude/copilot/codex (caller falls back to the normal event tail). */
function tailTranscript(id: string, follow: boolean, linesArg: number | undefined): boolean {
	const d = new FsRegistry(pijHome).read(id);
	if (!d?.harnessSessionId) return false;
	let path: string;
	let summarize: (raw: string) => { role: "user" | "assistant"; text: string } | null;
	if (d.harness === "claude") {
		path = transcriptPathFor(homedir(), d.folder, d.harnessSessionId);
		summarize = summarizeTranscriptLine;
	} else if (d.harness === "copilot") {
		path = sessionEventsPath(homedir(), d.harnessSessionId);
		summarize = summarizeCopilotEvent;
	} else if (d.harness === "codex") {
		// Codex's date-nested rollout path can't be rebuilt from the bare UUID, so
		// tail reads the absolute path the daemon persisted at bind (Finding 06).
		if (!d.transcriptPath) return false;
		path = d.transcriptPath;
		summarize = summarizeCodexEvent;
	} else {
		return false;
	}
	const render = (raw: string): void => {
		const e = summarize(raw);
		if (e) process.stdout.write(`[${e.role}] ${e.text.replace(/\n/g, " ").slice(0, 200)}\n`);
	};
	let consumed = 0;
	const flush = (initial: boolean): void => {
		let all: string[];
		try {
			all = readFileSync(path, "utf8").split("\n").filter(Boolean);
		} catch {
			return;
		}
		if (initial && linesArg !== undefined) {
			// show the last N summarizable lines on first paint
			const tailSlice = all.slice(-Math.max(linesArg * 4, linesArg));
			consumed = all.length;
			for (const l of tailSlice) render(l);
			return;
		}
		for (let i = consumed; i < all.length; i++) render(all[i] as string);
		consumed = all.length;
	};
	flush(true);
	if (!follow) {
		process.exit(0);
	}
	setInterval(() => flush(false), FOLLOW_MS);
	return true;
}

// ─── `pij agent` verb family (plan 029 Phase 2) ──────────────────────────────

const AGENT_USAGE = `pij agent — run declarative minih agent packs (discover · run · author)

USAGE
  pij agent list [--json]                         merged inventory: ./agents · ~/.pij/agents · built-ins
  pij agent run <slug> [-p k=v…] [flags]          run a named pack (records under runs/ by default)
  pij agent run <slug> --ephemeral                run a named pack without recording (temp-copy path)
  pij agent run --prompt "<text>"                 inline zero-setup run (nothing left on disk)
  pij agent run --prompt -                         read the inline prompt from stdin
  pij agent show <slug>                           pack defaults, schemas, files (+ eject hint)
  pij agent new <slug>                            scaffold ./agents/<slug> (minih init when on PATH)
  pij agent check <slug>                          validate frontmatter + schemas (exit 1 on failure)
  pij agent eject <slug>                          copy a built-in into ./agents to customise + record

  pij agent spawn <slug> [-p k=v…] [--once] [--layout stack|right|below|window]   run a pack as a daemon-bound pij peer (packet auto-delivered; default = side stack)
  pij agent spawn --prompt "<text>" [--once]      spawn an inline pack peer
  pij spawn --agent <slug> [-p k=v…] [--once]     alias for \`pij agent spawn\`
  pij agent report --json '<payload>'             (inside a peer pane) push a schema-valid report to the spawner

  pij agents …                                    alias for \`pij agent list\`

RUN FLAGS (override pack frontmatter — warn, never block)
  -p key=value        input param (repeatable; JSON-coerced: 20→number, true→bool)
  --model <m>         override the pack's model              --effort <lvl>   override reasoning effort
  --harness <h>       claude | codex | copilot              --permissions <p> minih preset
  --timeout <s>       wall-clock budget in seconds          --cwd <dir>       run cwd
  --output-schema <f> attach an output schema (inline)      --json            machine envelope on stdout
  --quiet             silence the stderr progress stream

EXIT CODES  0 success · 1 user/agent error (bad input, run failed) · 2 system error (harness CLI missing)`;

function renderBatonNotice(notice: BatonNotice): string {
	return renderBatonNoticeBody(notice);
}

class CliBatonNoticeSink implements BatonNoticeSink {
	constructor(
		private readonly registry: FsRegistry,
		private readonly channel: FsChannel,
		private readonly proc: NodeProcess,
	) {}

	push(notice: BatonNotice): BatonNoticeReceipt {
		const target = this.registry.read(notice.to);
		if (!target || target.lifecycle === "dissolved") {
			return { state: "unverified" };
		}
		const delivered = this.channel.deliver({
			from: notice.from,
			to: notice.to,
			body: renderBatonNotice(notice),
		});
		if (!delivered.ok) return { state: "unverified" };
		if (target.deliveryMode === "pull") {
			return { state: "queued", messageId: delivered.value.messageId };
		}
		if (!this.proc.isAlive(target.pid)) {
			return { state: "unverified", messageId: delivered.value.messageId };
		}
		if (target.harness === "claude" || target.harness === "copilot" || target.harness === "codex") {
			const tick = daemonTickStatus(target.lastTickAt, this.proc.now());
			return {
				state: tick.daemonTickStale ? "unverified" : "queued",
				messageId: delivered.value.messageId,
			};
		}
		return {
			state: target.state === "working" ? "queued" : "delivered",
			messageId: delivered.value.messageId,
		};
	}
}

function orchestrationActor(registry: FsRegistry): string {
	if (process.env.PIJ_SESSION_ID) return process.env.PIJ_SESSION_ID;
	// Reuse the SAME shared resolver the `prime` primitive uses (deps.resolveSelf):
	// orchestrationSelf tries a $TMUX_PANE match against the FULL registry BEFORE the
	// folder-filtered path, so a seat filing from a shell whose cwd differs from its
	// recorded folder still resolves to its real id instead of the silent 'operator'
	// phantom (identity-attribution fix-loop). The pane/pid enhancement rides s051's
	// adopt resolver (G7) through this same seam — no second resolver forked here.
	const resolved = orchestrationSelf(registry);
	return resolved.ok ? resolved.value : "operator";
}

function orchestrationSelf(registry: FsRegistry) {
	const envId = process.env.PIJ_SESSION_ID;
	const pane = process.env.TMUX_PANE;
	if ((!envId || envId.trim() === "") && pane && pane.trim() !== "") {
		const byPane = registry.list().filter((descriptor) => descriptor.paneId === pane);
		const only = byPane[0];
		if (byPane.length === 1 && only) return resolveSelf(only.id, [], pane);
	}
	return resolveSelf(envId, filterByFolder(registry.list(), process.cwd()), pane);
}

function batonHead(store: FsBatonStore, name: string): string | null {
	const definition = store.readDefinition(name);
	if (!definition.ok || !definition.value?.repo) return null;
	try {
		return execFileSync("git", ["-C", definition.value.repo, "rev-parse", "HEAD"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

function runOrchestrationVerb(args: string[]): void {
	if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
		process.stdout.write(`${ORCHESTRATION_USAGE}\n`);
		process.exit(0);
	}
	const parsed = parseOrchestrationArgs(args);
	if (!parsed.ok) {
		process.stderr.write(`E-ARG: ${parsed.message}\n\n${ORCHESTRATION_USAGE}\n`);
		process.exit(64);
	}
	const store = new FsBatonStore(pijHome);
	const registry = new FsRegistry(pijHome);
	const channel = new FsChannel(pijHome);
	const proc = new NodeProcess();
	const service = new BatonService({
		store,
		notices: new CliBatonNoticeSink(registry, channel, proc),
		now: () => proc.now(),
		newId: () => randomUUID(),
	});
	const result = dispatchOrchestration(parsed.command, {
		service,
		actor: orchestrationActor(registry),
		currentHead: (name) => batonHead(store, name),
		primeService: new PrimeService(registry),
		resolveSelf: () => orchestrationSelf(registry),
	});
	if (result.stdout) process.stdout.write(`${result.stdout}\n`);
	if (result.stderr) process.stderr.write(`${result.stderr}\n`);
	process.exit(result.exitCode);
}

const FAKE_ENVELOPE = JSON.stringify({
	summary: "Fake agent run (PIJ_AGENT_FAKE=1) — no real harness was invoked.",
	retrospective: {
		workedWell: "The deterministic fake-adapter seam kept the run hermetic and free.",
		confusing: "Nothing — this is a scripted stand-in for a real harness (test seam only).",
		magicWand: "A first-class record/replay fixture harness upstream in minih.",
	},
});

/** Is `cmd` resolvable on PATH? Used to fail fast with E-HARNESSBIN before any LLM session. */
function onPath(cmd: string): boolean {
	try {
		execFileSync("which", [cmd], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/** Model id → harness via the pi models registry provider + PROVIDER_HARNESS_MAP. */
function harnessForModel(
	models: readonly ModelEntry[],
	model: string | undefined,
): string | undefined {
	if (!model) return undefined;
	const norm = normalizeModelQuery(model);
	const entry = models.find((e) => normalizeModelQuery(e.id) === norm);
	return entry ? PROVIDER_HARNESS_MAP[entry.provider] : undefined;
}

/** Build a harness adapter, or a structured harness error. `PIJ_AGENT_FAKE=1` is a
 *  test seam: a deterministic FakeAgentAdapter so scripted runs (scratch/, CI) need
 *  no real CLI + burn no tokens. Copilot's SDK-missing case maps to E-HARNESSBIN. */
async function makeAgentAdapter(harness: string): Promise<AdapterResolution> {
	if (process.env.PIJ_AGENT_FAKE === "1") {
		return { ok: true, adapter: new FakeAgentAdapter({ output: FAKE_ENVELOPE }) };
	}
	switch (harness) {
		case "claude":
			if (!onPath("claude")) return { ok: false, error: { code: "E-HARNESSBIN", bin: "claude" } };
			return { ok: true, adapter: new ClaudeHeadlessAdapter() };
		case "codex":
			if (!onPath("codex")) return { ok: false, error: { code: "E-HARNESSBIN", bin: "codex" } };
			return { ok: true, adapter: new CodexExecAdapter() };
		case "copilot":
			try {
				return { ok: true, adapter: await createCopilotAdapter() };
			} catch (err) {
				if (err instanceof CopilotSdkMissingError) {
					return {
						ok: false,
						error: { code: "E-HARNESSBIN", bin: COPILOT_SDK_PACKAGE, message: err.message },
					};
				}
				throw err;
			}
		default:
			return { ok: false, error: { code: "E-NOADAPTER", harness } };
	}
}

/** Delegate `new` to minih's own scaffolder when the binary is on PATH (byte-compat). */
function runMinihInit(slug: string, cwd: string): { ok: boolean; stderr: string } {
	try {
		execFileSync("minih", ["init", slug], { cwd, stdio: "pipe" });
		return { ok: true, stderr: "" };
	} catch (err) {
		return { ok: false, stderr: (err as Error).message };
	}
}

function agentDeps(quiet: boolean): VerbDeps {
	const models = loadModels();
	const runCwd = process.cwd();
	// The adapter subprocess runs in minih's run dir (isolated), so agents can't see
	// the project by cwd. Export the repo root so packs (e.g. flowspace-search) can
	// reach it — they read $PIJ_AGENT_CWD to locate this repo's fs2 graph.
	process.env.PIJ_AGENT_CWD = runCwd;
	return {
		pijHome,
		cwd: runCwd,
		builtinDir: fileURLToPath(new URL("./builtin-agents", import.meta.url)),
		defaultHarness: "claude",
		harnessForModel: (m) => harnessForModel(models, m),
		modelWarning: (m) => buildSpawnWarning(m, models),
		effortWarning: (e, m) => buildEffortWarning(e, m, models),
		makeAdapter: makeAgentAdapter,
		progress: (line) => {
			if (!quiet) process.stderr.write(`${line}\n`);
		},
		readStdin: () => readFileSync(0, "utf8"),
		hasMinihBinary: () => onPath("minih"),
		runMinihInit,
	};
}

/** The 3-tier agent discovery sources (project → user → built-in), in precedence
 *  order — the same set the pure verbs use, resolved at the bin for spawn/report. */
function agentDiscoverySources(cwd: string): DiscoverySource[] {
	const builtinDir = fileURLToPath(new URL("./builtin-agents", import.meta.url));
	return [
		{ dir: join(cwd, "agents"), source: "project" },
		{ dir: agentsDir(pijHome), source: "user" },
		{ dir: builtinDir, source: "builtin" },
	];
}

interface AgentPaneOutcome {
	ok: boolean;
	pane?: AgentSpawnPaneInfo;
	message?: string;
	exitCode?: number;
}

/** Open the tmux pane for a daemon-bound agent peer (mirrors runSpawn's control
 *  split): snapshot transcripts (claude/codex) or mint a copilot session-id for a
 *  deterministic bind, build the spawn command with the peer env (PIJ_AGENT_CWD),
 *  split per the shared layout, and capture the pane's foreground pid. Returns the
 *  {@link AgentSpawnPaneInfo} the descriptor write needs. */
function spawnAgentPane(
	plan: {
		id: string;
		harness: HarnessKind;
		model?: string;
		effort?: string;
		spawnedBy?: string;
		layout?: SpawnLayout;
	},
	cwd: string,
): AgentPaneOutcome {
	if (plan.harness === "pi") {
		return {
			ok: false,
			message: "E-NOADAPTER: pij agent peers require a daemon-bound harness",
			exitCode: 2,
		};
	}
	const tmux = new TmuxAdapter();
	const ownPane = tmux.currentPane();
	if (!ownPane || !tmux.currentSession()) {
		return {
			ok: false,
			message: "E-NOTMUX: pij agent spawn needs an active tmux session",
			exitCode: 2,
		};
	}
	const isCopilot = plan.harness === "copilot";
	const isCodex = plan.harness === "codex";
	const copilotSessionId = isCopilot ? randomUUID() : undefined;
	// Same deterministic-bind pin as `pij spawn` (s071 D4): agent peers were on
	// the identical discovery race.
	const claudeSessionId = plan.harness === "claude" ? randomUUID() : undefined;
	const plannedSessionId = copilotSessionId ?? claudeSessionId;
	const skipSnapshot = isCopilot || claudeSessionId !== undefined;
	let transcriptsAtSpawn: string[] = [];
	if (!skipSnapshot) {
		if (isCodex) {
			transcriptsAtSpawn = listCodexRollouts((d) => {
				try {
					return readdirSync(d);
				} catch {
					return [];
				}
			}, codexTranscriptRoot(homedir()));
		} else {
			const dir = transcriptDir(homedir(), cwd);
			try {
				transcriptsAtSpawn = readdirSync(dir)
					.filter((n) => n.endsWith(".jsonl"))
					.map((n) => `${dir}/${n}`);
			} catch {
				/* dir not created yet → empty before-set */
			}
		}
	}
	const base = buildControlSpawnCommand({
		harness: plan.harness,
		pijId: plan.id,
		cwd,
		...(plan.model ? { model: plan.model } : {}),
		...(plan.effort ? { effort: plan.effort } : {}),
		...(plan.spawnedBy ? { parentId: plan.spawnedBy } : {}),
		...(copilotSessionId ? { copilotSessionId } : {}),
		...(claudeSessionId ? { forkSessionId: claudeSessionId } : {}),
	});
	const env = buildAgentPeerEnv(base.env, { agentCwd: cwd });
	const seatLabel = buildSeatLabel({
		cwd,
		job: "agent",
		peerId: plan.id,
		model: plan.model,
	});
	const peerPanes = livePeerPanes(
		new FsRegistry(pijHome).list(),
		tmux.currentWindowPanes(),
		ownPane,
	);
	const splitPlan = planPlacement(plan.layout, ownPane, peerPanes);
	if (!splitPlan.ok)
		return { ok: false, message: `${splitPlan.code}: ${splitPlan.message}`, exitCode: 2 };
	const split =
		"window" in splitPlan
			? tmux.newWindow({
					cmd: base.cmd,
					args: base.args,
					env,
					cwd,
					name: seatLabel.windowName,
					title: seatLabel.paneTitle,
					detached: true,
				})
			: tmux.splitWindow({
					cmd: base.cmd,
					args: base.args,
					env,
					title: seatLabel.paneTitle,
					cwd,
					target: splitPlan.target,
					direction: splitPlan.direction,
					percent: splitPlan.percent,
					evenOut: splitPlan.evenOut,
					columnPercent: splitPlan.columnPercent,
					detached: true,
				});
	if (!split.ok) return { ok: false, message: `${split.code}: ${split.message}`, exitCode: 2 };
	const paneId = split.value.paneId;
	let panePid = process.pid;
	try {
		const raw = execFileSync("tmux", ["display-message", "-p", "-t", paneId, "#{pane_pid}"], {
			encoding: "utf8",
		}).trim();
		if (/^\d+$/.test(raw)) panePid = Number(raw);
	} catch {
		/* fall back to the spawner pid */
	}
	const dataDir = join(pijHome, plan.id);
	return {
		ok: true,
		pane: {
			paneId,
			panePid,
			dataDir,
			eventsPath: join(dataDir, "events.ndjson"),
			startedAtIso: new Date().toISOString(),
			...(skipSnapshot ? {} : { transcriptsAtSpawn }),
			...(plannedSessionId ? { plannedHarnessSessionId: plannedSessionId } : {}),
		},
	};
}

/** `pij agent spawn <slug|--prompt> [-p k=v] [--once]` — run a pack as a
 *  daemon-bound pij peer (AC-14). Validates `-p` input BEFORE any pane opens,
 *  splits a control pane, records the peer (with agent + lifecycle fields), and
 *  delivers the packet pointer to its inbox for the daemon to inject after bind. */
function runAgentSpawn(cmd: ParsedAgentCommand): void {
	const cwd = process.cwd();
	// Export PIJ_AGENT_CWD for this process too (parity with agentDeps); the child
	// gets it via the spawn env.
	process.env.PIJ_AGENT_CWD = cwd;
	const models = loadModels();
	const token = `s${Date.now()}-${process.pid}`;
	const reservationOwnerToken = `agent-spawn:${token}:${randomUUID()}`;
	const reservationRegistry = new FsRegistry(pijHome);
	const reserved = reservationRegistry.reserveMemorableId(
		spawnIdentitySeed(token, process.pid),
		reservationOwnerToken,
		process.pid,
	);
	if (!reserved.ok) {
		process.stderr.write(`${reserved.code}: ${reserved.message}\n`);
		process.exit(2);
	}
	const id = reserved.value.id;

	// Resolve the caller so the peer is ownership-stamped + can report back.
	// Pane-first across the FULL registry (FX001-1 / DL-003): the folder filter
	// starved the pane match on cross-repo spawns (cd other-repo && pij agent spawn),
	// silently losing spawnedBy — the report then died E-NOREPORTTARGET and a
	// --once peer never auto-closed.
	const reg = new FsRegistry(pijHome);
	const ownPaneEnv = process.env.TMUX_PANE;
	const byPane = ownPaneEnv ? reg.list().filter((d) => d.paneId === ownPaneEnv) : [];
	const callerRes =
		!process.env.PIJ_SESSION_ID && byPane.length === 1 && byPane[0]
			? { ok: true as const, value: byPane[0].id }
			: resolveSelf(process.env.PIJ_SESSION_ID, filterByFolder(reg.list(), cwd), ownPaneEnv);
	const spawnedBy = callerRes.ok ? callerRes.value : undefined;
	// Fail-fast advisory (FX001-1): without a resolved caller there is NO report
	// target — `pij agent report` will die E-NOREPORTTARGET and a --once peer can
	// never auto-close. Warn loudly, never block (register with `pij adopt` first).
	if (!spawnedBy) {
		process.stderr.write(
			"⚠️  caller unresolved — spawnedBy will NOT be stamped: the peer's report has no target " +
				"(E-NOREPORTTARGET) and --once auto-close cannot fire. Register this pane first: " +
				'pij adopt "$TMUX_PANE" --harness <h>, or set PIJ_SESSION_ID.\n',
		);
	}

	// Prepare = resolve pack + AJV-validate input + derive harness/lifecycle/advisory
	// + render packet. A bad input fails HERE — before any daemon start or tmux call.
	const prep = prepareAgentSpawn(
		{ cmd, id, ...(spawnedBy ? { spawnedBy } : {}) },
		{
			pijHome,
			cwd,
			discover: () => discoverAgents(agentDiscoverySources(cwd)),
			validateInput,
			harnessForModel: (m) => harnessForModel(models, m),
			defaultHarness: "claude",
		},
	);
	if (!prep.ok) {
		reservationRegistry.releaseReservation(id, reservationOwnerToken);
		process.stderr.write(`${renderAgentError(prep.error)}\n`);
		process.exit(exitCodeFor(prep.error.code));
	}
	const plan = prep.plan;
	const requestedAt = new Date().toISOString();
	const expectations = new FsSpawnExpectationStore(pijHome);
	const expectation = createSpawnExpectation({
		spawnId: token,
		creatorId: spawnedBy,
		requestedHarness: plan.harness,
		requestedAt,
		deadlineAt: spawnExpectationDeadline(requestedAt),
	});

	// Warn-never-block on model/effort (same policy as run), then the one-shot
	// permissions advisory (KF-09) — printed exactly once on stderr.
	const mw = buildSpawnWarning(plan.model, models);
	if (mw) process.stderr.write(`${mw}\n`);
	const ew = buildEffortWarning(plan.effort, plan.model, models);
	if (ew) process.stderr.write(`${ew}\n`);
	if (plan.advisory) process.stderr.write(`${plan.advisory}\n`);

	// A daemon must be up to drive the peer pending→bound (and inject the packet).
	const daemonNote = ensureDaemonRunning();
	if (daemonNote) process.stdout.write(`${daemonNote}\n`);

	// Persist before the agent's daemon-bound pane is opened.
	expectations.write(expectation);
	const paneRes = spawnAgentPane(
		{
			id,
			harness: plan.harness,
			...(plan.model ? { model: plan.model } : {}),
			...(plan.effort ? { effort: plan.effort } : {}),
			...(spawnedBy ? { spawnedBy } : {}),
			...(cmd.layout ? { layout: cmd.layout } : {}),
		},
		cwd,
	);
	if (!paneRes.ok || !paneRes.pane) {
		expectations.remove(token);
		reservationRegistry.releaseReservation(id, reservationOwnerToken);
		process.stderr.write(`${paneRes.message ?? "E-SPAWN: could not open pane"}\n`);
		process.exit(paneRes.exitCode ?? 2);
	}

	expectations.write({ ...expectation, paneId: paneRes.pane.paneId });
	const { packetPath } = finalizeAgentSpawn(plan, paneRes.pane, {
		pijHome,
		registry: reg,
		channel: new FsChannel(pijHome),
		cwd,
	});
	const spawnedDescriptor = reg.read(id);
	if (!spawnedDescriptor) {
		expectations.remove(token);
		process.stderr.write(`E-NOREG: spawned agent descriptor ${id} is missing\n`);
		process.exit(3);
	}
	const gitCommonDir = new GitRepositoryAdapter().gitCommonDir(cwd) ?? undefined;
	// "cli" — REQUIRED, not decorative (review round 2 §MED-a). This carries the
	// CLI-owned `parentId`/`gitCommonDir`. On a fresh spawn disk has neither, so an
	// undeclared write happened to work; on adopt-into-pending — D4's own new path —
	// the pending descriptor ALREADY has a parentId, so the law would take the old
	// value from disk and the re-parent would silently pin to it.
	reg.write(
		{
			...spawnedDescriptor,
			spawnId: token,
			...(spawnedBy !== undefined ? { parentId: spawnedBy } : {}),
			...(gitCommonDir !== undefined ? { gitCommonDir } : {}),
		},
		"cli",
	);
	expectations.write({
		...expectation,
		paneId: paneRes.pane.paneId,
		sessionId: id,
		runtimeHarness: plan.harness,
		boundAt: new Date().toISOString(),
	});
	const consumed = reg.consumeReservation(id, reservationOwnerToken);
	if (!consumed.ok) {
		process.stderr.write(`${consumed.code}: ${consumed.message}\n`);
		process.exit(2);
	}

	if (cmd.json) {
		process.stdout.write(
			`${JSON.stringify({
				id,
				paneId: paneRes.pane.paneId,
				harness: plan.harness,
				agentPack: plan.slug,
				lifecycle: plan.lifecycle,
				packet: packetPath,
			})}\n`,
		);
	} else {
		process.stdout.write(
			`spawned agent '${plan.slug}' as ${id} (${plan.harness}, ${plan.lifecycle}) in pane ${paneRes.pane.paneId} — ` +
				`the daemon will inject its packet after bind (track: pij state ${id} · pij tail ${id})\n`,
		);
	}
	process.exit(0);
}

/** `pij agent report --json '<payload>'` — a spawned peer's synchronous done
 *  signal (AC-15): resolve self from PIJ_SESSION_ID, validate the payload against
 *  the pack's output schema, and on success push it to the spawner + stamp
 *  reportedAt. An invalid report exits 1 with the AJV lines and delivers nothing. */
function runAgentReport(cmd: ParsedAgentCommand): void {
	const reg = new FsRegistry(pijHome);
	const selfRes = resolveSelf(
		process.env.PIJ_SESSION_ID,
		filterByFolder(reg.list(), process.cwd()),
		process.env.TMUX_PANE,
	);
	if (!selfRes.ok) {
		process.stderr.write(
			`${selfRes.code}: ${selfRes.message}\n` +
				"pij agent report must run inside the spawned pack's own pane (PIJ_SESSION_ID is set there).\n",
		);
		process.exit(1);
	}
	let payload: unknown;
	try {
		payload = JSON.parse(cmd.reportJson as string);
	} catch (e) {
		process.stderr.write(`E-ARG: report --json is not valid JSON: ${(e as Error).message}\n`);
		process.exit(1);
	}
	const res = executeAgentReport(selfRes.value, payload, {
		pijHome,
		registry: reg,
		channel: new FsChannel(pijHome),
		now: () => Date.now(),
	});
	if (!res.ok) {
		process.stderr.write(`${res.error.code}: ${res.error.message}\n`);
		if (res.error.code === "E-BADREPORT") {
			for (const line of res.error.errors) process.stderr.write(`  ${line}\n`);
		}
		process.exit(1);
	}
	process.stdout.write(`reported to ${res.to}\n`);
	process.exit(0);
}

/** Intercept + drive `pij agent <subverb>`. Async (a run awaits minih); resolves by
 *  exiting the process with the verb's exit code. Reachable with a daemon-less home. */
async function runAgentVerb(args: string[]): Promise<void> {
	if (args.length === 0) {
		process.stdout.write(`${AGENT_USAGE}\n`);
		process.exit(0);
	}
	const parsed = parseAgentArgs(args);
	if (!parsed.ok) {
		process.stderr.write(
			`${renderAgentError({ code: "E-ARG", message: parsed.message })}\n\n${AGENT_USAGE}\n`,
		);
		process.exit(exitCodeFor("E-ARG"));
	}
	// Peer-mode subverbs are impure (tmux split / registry / channel) — the bin owns
	// them (they never reach the pure dispatchAgent).
	if (parsed.cmd.subverb === "spawn") {
		runAgentSpawn(parsed.cmd);
		return;
	}
	if (parsed.cmd.subverb === "report") {
		runAgentReport(parsed.cmd);
		return;
	}
	try {
		const res = await dispatchAgent(parsed.cmd, agentDeps(parsed.cmd.quiet));
		if (res.stdout) process.stdout.write(`${res.stdout}\n`);
		if (res.stderr) process.stderr.write(`${res.stderr}\n`);
		process.exit(res.exitCode);
	} catch (err) {
		process.stderr.write(`E-RUNFAILED: ${(err as Error).message}\n`);
		process.exit(1);
	}
}

/** `pij spine render` — bin-owned (plan 054 P4 T002, AC-10): SpineLogPort has
 *  no markdown-write method by design, so the bin reads the log and publishes
 *  `$PIJ_HOME/spine/spine.md` atomically. Core keeps the parse row for
 *  usage/E-ARG parity and E-NOREGs if ever reached without this intercept.
 *  `--project` (s057 dogfood) publishes a FILTERED view to its OWN file,
 *  `$PIJ_HOME/spine/<slug>.spine.md` — never over the machine-wide spine.md
 *  (a filtered view at that path would lie about the whole log). Stale
 *  per-project files are never cleaned up (surfaced residue, acted on never). */
function runSpineRender(json: boolean, project?: string): void {
	// The slug becomes a filename — the shape guard blocks `--project ../x`
	// traversal, so it is part of the contract, not cosmetics.
	if (project !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(project)) {
		process.stderr.write(`E-ARG: --project takes a kebab project slug (got '${project}')\n`);
		process.exit(64);
	}
	// Same exact-match filter path `spine events --project` uses.
	const events = new FsSpineLog(pijHome).read(project === undefined ? undefined : { project });
	const md = renderSpineMd(
		events,
		project === undefined ? {} : { title: `pij spine — project ${project}` },
	);
	const path = join(pijHome, "spine", project === undefined ? "spine.md" : `${project}.spine.md`);
	try {
		writeTextAtomic(path, md);
	} catch (error) {
		// Same code family as the fs spine adapters use for fs failures.
		process.stderr.write(`E-NOREG: spine render could not write ${path}: ${String(error)}\n`);
		process.exit(3);
	}
	const bytes = Buffer.byteLength(md, "utf8");
	if (json) {
		process.stdout.write(`${JSON.stringify({ path, bytes, events: events.length })}\n`);
	} else {
		process.stdout.write(`spine render: ${events.length} events → ${path} (${bytes} bytes)\n`);
	}
	process.exit(0);
}

function main(): void {
	// Full-surface usage on no args / --help (the core parser only knows the
	// messaging verbs; the control-plane verbs live here in the bin).
	const top = process.argv[2];
	if (top === undefined || top === "--help" || top === "-h" || top === "help") {
		process.stdout.write(`${USAGE}\n`);
		process.exit(0);
	}
	if (top === "--version" || top === "-v" || top === "version") {
		process.stdout.write(`pij ${pijVersion()}\n`);
		process.exit(0);
	}
	// Inbox registration is the one messaging surface allowed to create PIJ_HOME,
	// so it must run before the ordinary E-NOREG guard.
	if (top === "inbox") {
		runInbox(process.argv.slice(3));
		return;
	}
	if (top === "adopt" && process.argv[3] === "--current") {
		runInbox(["register", ...process.argv.slice(4)]);
		return;
	}
	// `spawn` is impure (tmux split + pending write) — intercept before the pure
	// dispatch path. It writes the registry home itself, so it predates the
	// E-NOREG guard below.
	if (process.argv[2] === "spawn") {
		// `pij spawn --agent <slug> …` is an alias for `pij agent spawn <slug> …`
		// (one uniform spawn surface). Detect + forward verbatim; else a colleague spawn.
		const spawnArgs = process.argv.slice(3);
		const aliased = aliasAgentSpawnArgs(spawnArgs);
		if (aliased) {
			void runAgentVerb(aliased);
			return;
		}
		runSpawn(spawnArgs);
		return;
	}
	if (
		top === "watchdog" &&
		(process.argv[3] === "--help" || process.argv[3] === "-h" || process.argv[3] === "help")
	) {
		process.stdout.write(`${WATCHDOG_USAGE}\n`);
		return;
	}
	if (top === "focus") {
		runFocus(process.argv.slice(3));
		return;
	}
	if (top === "revive") {
		runRevive(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "adopt") {
		runAdopt(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "identity") {
		runIdentity(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "close") {
		runClose(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "compact-self") {
		runCompactSelf(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "watch") {
		runWatch(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "unwatch") {
		runUnwatch(process.argv.slice(3));
		return;
	}
	if (process.argv[2] === "daemon") {
		runDaemonVerb(process.argv.slice(3));
		return;
	}
	// `telegram` is a self-contained bridge surface (its own .env + bot process);
	// it never reads the pij registry home, so it predates the E-NOREG guard too.
	if (process.argv[2] === "telegram") {
		runTelegram(process.argv.slice(3));
		return;
	}
	// `agent` (+ `agents` alias → `agent list`) drives the declarative-agent surface.
	// It reads ./agents + ~/.pij/agents + built-ins — no daemon, no registry home —
	// so it predates the E-NOREG guard. Async: it exits the process itself.
	if (top === "agent" || top === "agents") {
		const rest = top === "agents" ? ["list", ...process.argv.slice(3)] : process.argv.slice(3);
		void runAgentVerb(rest);
		return;
	}
	if (top === "orchestration") {
		runOrchestrationVerb(process.argv.slice(3));
		return;
	}
	// E-NOREG: registry home absent => the extension never booted here.
	if (!existsSync(pijHome)) {
		process.stderr.write("E-NOREG: no pij registry — is the pij extension loaded?\n");
		process.exit(3);
	}
	// T8 (dogfood, mastodon#3): `pij <verb> [sub] --help` prints that verb's
	// USAGE lines and exits 0 — before this, subcommand --help was a bare
	// E-ARG. Generic: filter the one usage text by the verb token, so every
	// verb family gets --help for free and the surface can never drift from
	// the documented one.
	if (process.argv.includes("--help") && process.argv.length > 3) {
		const verb = process.argv[2] ?? "";
		const lines = USAGE.split("\n").filter((l) => l.includes(`pij ${verb}`));
		process.stdout.write(lines.length > 0 ? `${lines.join("\n")}\n` : USAGE);
		process.exit(0);
	}
	// T2 (dogfood, osk#4): a literal-body channel that bypasses the caller's
	// shell entirely — double-quoted backticks/$( substitute in the SENDER'S
	// shell before pij ever runs (osk accidentally executed `pij close` from
	// quoted text). `--body-file <path>` (or `-` for stdin) reads the body raw.
	let argvForParse = process.argv.slice(2);
	const bodyFileIdx = argvForParse.indexOf("--body-file");
	if (bodyFileIdx !== -1) {
		if (argvForParse[0] !== "send") {
			process.stderr.write("E-ARG: --body-file is a send flag\n");
			process.exit(64);
		}
		const bodyPath = argvForParse[bodyFileIdx + 1];
		if (bodyPath === undefined || bodyPath.startsWith("--")) {
			process.stderr.write("E-ARG: --body-file takes a path (or - for stdin)\n");
			process.exit(64);
		}
		let body: string;
		try {
			body = readFileSync(bodyPath === "-" ? 0 : bodyPath, "utf8");
		} catch (error) {
			process.stderr.write(`E-ARG: --body-file: ${String(error)}\n`);
			process.exit(64);
		}
		const rest = [...argvForParse.slice(0, bodyFileIdx), ...argvForParse.slice(bodyFileIdx + 2)];
		// The file IS the body: refuse a competing positional body (send's body
		// is the sole non-flag positional after the target id).
		const positionals = rest.filter(
			(a, i) => i > 0 && !a.startsWith("--") && rest[i - 1]?.startsWith("--") !== true,
		);
		if (positionals.length > 1) {
			process.stderr.write("E-ARG: --body-file replaces the body — drop the inline text\n");
			process.exit(64);
		}
		argvForParse = [...rest, body.trimEnd()];
	}
	const parsed = parseArgs(argvForParse);
	if (!parsed.ok) {
		// A top-level unknown verb gets the COMPLETE surface (core only lists the
		// messaging verbs); per-verb arity/flag errors keep core's precise message.
		if (parsed.message.startsWith("unknown command")) {
			process.stderr.write(`E-ARG: unknown command '${top}'\n${USAGE}\n`);
			process.exit(64);
		}
		process.stderr.write(`${parsed.code}: ${parsed.message}\n`);
		process.exit(64);
	}
	// `spine render` writes markdown the pure core cannot (bin-owned, plan 054
	// P4 T002) — intercept BEFORE dispatch, after core's parse gave E-ARG parity.
	if (parsed.value.verb === "spine-render") {
		runSpineRender(parsed.value.json, parsed.value.project);
		return;
	}
	// `pij tail` of a bound claude/copilot session streams ITS JSONL transcript,
	// not the pij event log (T022). Try that first; fall through to the event tail
	// if the target isn't a bound control-plane harness.
	if (parsed.value.verb === "tail") {
		if (tailTranscript(parsed.value.id, parsed.value.follow, parsed.value.lines)) {
			return; // tailTranscript owns output (and the follow loop)
		}
	}
	const d = deps();
	const res = dispatch(parsed.value, d);
	write(res);
	if (res.follow?.kind === "tail" && parsed.value.verb === "tail") {
		followTail(parsed.value, d, res.follow.nextSince);
		return; // loops until killed
	}
	if (res.follow?.kind === "dispatch-wait") {
		waitDispatch(d, res.follow.dispatchId, res.follow.timeoutMs, res.follow.exitCode);
		return;
	}
	if (res.follow?.kind === "canary-wait") {
		waitCanary(d, res.follow);
		return;
	}
	if (res.follow?.kind === "wait") {
		const broadcast = parsed.value.verb === "send" && parsed.value.broadcast === true;
		waitReceipts(
			d,
			res.follow.self,
			res.follow.targets,
			res.follow.timeoutMs,
			res.follow.exitCode,
			broadcast,
		);
		return;
	}
	// Flush stdout fully before exiting. A hard process.exit() races the pipe
	// buffer and truncates any payload past the pipe boundary (dogfood: `tree
	// --global --json` and `spine events --json` cut at 64KB of a 1.1MB payload).
	// Both `stdout.write("", () => process.exit())` and this exitCode form drain
	// fully in testing (delayed-reader integration test below), so this is a
	// hardening, not a bug fix: setting exitCode and returning is the idiomatic,
	// unambiguously-correct pattern — it makes no assumption about empty-write
	// callback ordering and lets Node drain stdout naturally before exit.
	// (Read/dispatch verbs open no ref'd handles; the follow verbs above return
	// early and own their own exit.)
	process.exitCode = res.exitCode;
}

main();
