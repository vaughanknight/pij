import { strict as assert } from "node:assert";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { smokeEnvironment, startFixtureProvider } from "../../../harness/scripts/copilot-native-fixture.js";
import { driveSmokeLifecycleCommand, nativeComposer, nativeMessages, readNativeEvents } from "../../../harness/scripts/copilot-native-smoke.js";
import { manageCopilotExtension } from "../../../harness/scripts/link-global.js";

const root = resolve(import.meta.dirname, "../../..");
const run = mkdtempSync(join(tmpdir(), "pij-149-live-"));
const output = resolve(process.argv[2] ?? join(run, "receipt.json"));
assert(!existsSync(output), "never overwrite proof");
const home = join(run, "home"), state = join(run, "state"), cwd = join(run, "workspace");
const copilotHome = join(home, ".copilot"), socket = `pij-149-${randomUUID()}`;
for (const path of [home, state, cwd, copilotHome]) mkdirSync(path, { recursive: true, mode: 0o700 });
const portServer = createServer();
await new Promise<void>((ok) => portServer.listen(0, "127.0.0.1", ok));
const portAddress = portServer.address();
assert(portAddress && typeof portAddress !== "string");
const addr = `127.0.0.1:${portAddress.port}`;
await new Promise<void>((ok) => portServer.close(() => ok()));
assert.notEqual(addr, "127.0.0.1:7461");
const fixture = await startFixtureProvider();
const env = { ...smokeEnvironment(process.env, home, copilotHome, state, addr, "local"),
 CLAUDE_CONFIG_DIR: join(home, ".claude-private"),
 COPILOT_PROVIDER_BASE_URL: fixture.url, COPILOT_PROVIDER_TYPE: "openai",
 COPILOT_PROVIDER_WIRE_API: "completions", COPILOT_MODEL: "pij-native-fixture" };
writeFileSync(join(copilotHome, "config.json"), JSON.stringify({ trustedFolders: [realpathSync(cwd)] }));
const install = manageCopilotExtension({ pijRoot: root, home, copilotHome, args: [], stdout: () => {}, stderr: () => {} });
assert.equal(install.skipped, 0);
const tmux = (args: string[], preserve = false) => {
 const text = execFileSync("tmux", ["-L", socket, ...args], { env, encoding: "utf8" });
 return preserve ? text : text.trim();
};
const bin = join(root, "target/debug/pij-rs");
const receipt: Record<string, unknown> = { run, addr, home, state, socket, claudeHome: env.CLAUDE_CONFIG_DIR,
 provider: "local deterministic provider; real installed Copilot CLI, real daemon, real tmux", stages: [] };
const stages = receipt.stages as Record<string, unknown>[];
const until = async <T>(what: string, fn: () => Promise<T | undefined> | T | undefined): Promise<T> => {
 const deadline = Date.now() + 45000;
 while (Date.now() < deadline) { const value = await fn(); if (value !== undefined) return value; await delay(100); }
 throw new Error(`Timeout: ${what}`);
};
let daemonLog = "";
let daemon: ReturnType<typeof spawn> | undefined;
try {
 tmux(["-f", "/dev/null", "new-session", "-d", "-s", "native-149", "-x", "160", "-y", "48", "-c", cwd, "/bin/sleep", "600"]);
 Object.assign(env, { TMUX: tmux(["display-message", "-p", "#{socket_path},#{pid},0"]) });
 tmux(["set-option", "-g", "remain-on-exit", "on"]);
 daemon = spawn(bin, ["--state-dir", state, "daemon", "--bind", addr], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
 daemon.stdout?.on("data", (data) => { daemonLog += data.toString(); });
 daemon.stderr?.on("data", (data) => { daemonLog += data.toString(); });
 const api = async (path: string, body?: unknown) => {
  const key = readFileSync(join(state, "daemon.key"), "utf8").trim();
  const response = await fetch(`http://${addr}${path}`, { method: body === undefined ? "GET" : "POST",
   headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
   body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  const answer = await response.json();
  assert(response.ok && answer.ok, JSON.stringify(answer)); return answer.data;
 };
 await until("isolated daemon health", async () => { if (!existsSync(join(state, "daemon.key"))) return undefined; try { return await api("/health"); } catch { return undefined; } });
 const copilot = realpathSync(execFileSync("which", ["copilot"], { encoding: "utf8" }).trim());
 const common = ["--no-custom-instructions", "--disable-builtin-mcps", "--no-remote", "--no-auto-update", "--allow-tool=pij_send"];
 const wrapper = join(run, "copilot-native");
 const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
 writeFileSync(wrapper, `#!/bin/sh\nexec ${[copilot, ...common].map(quote).join(" ")} "$@"\n`, { mode: 0o700 });
 const launched = JSON.parse(execFileSync(bin, ["--json", "--addr", addr, "--state-dir", state,
  "spawn", "--harness", "copilot", "--bin", wrapper, "--cwd", cwd, "--session", "native-149", "--no-wait"], { env, encoding: "utf8" })).data;
 const roster = async () => { const data = await api("/v1/seats?scope=local"); return Array.isArray(data) ? data : data.seats; };
 const observed = async (pane: string, previousPid?: number) => until("native registration", async () =>
  (await roster()).find((row: { pane: string; proc?: { pid: number }; native_extension_delivery?: boolean; tombstoned_at?: number }) =>
   row.pane === pane && row.proc?.pid && row.proc.pid !== previousPid && row.native_extension_delivery && row.tombstoned_at == null));
 const first = await observed(launched.pane);
 assert.equal(first.id, launched.id);
 stages.push({ kind: "spawn", seat: first });
 const events = () => readNativeEvents(join(copilotHome, "session-state", first.session, "events.jsonl"));
 const warmup = `PIJ_149_WARMUP_${randomUUID()}`;
 await until("initial empty composer", () => nativeComposer(tmux(["capture-pane", "-p", "-J", "-t", first.pane])) === "" ? true : undefined);
 tmux(["send-keys", "-t", first.pane, "-l", warmup]);
 tmux(["send-keys", "-t", first.pane, "Enter"]);
 await until("persisted native conversation", () => {
  const history = events();
  return nativeMessages(history, warmup).length && history.some((event) => event.type === "assistant.turn_end") ? true : undefined;
 });
 const rows = (sql: string, ...args: string[]) => { const db = new DatabaseSync(join(state, "pij.sqlite"), { readOnly: true }); try { return db.prepare(sql).all(...args); } finally { db.close(); } };
 let current = first;
 for (const sameWindow of [true, false]) {
  const leg: Record<string, unknown> = { kind: sameWindow ? "same-window" : "new-window", before: current };
  stages.push(leg);
  await until("empty native composer", () => nativeComposer(tmux(["capture-pane", "-p", "-J", "-t", current.pane])) === "" ? true : undefined);
  await driveSmokeLifecycleCommand(tmux, { pane: current.pane, action: "exit" }, 45000, (leg.control = {}) as Record<string, unknown>);
  await until("native pane exited", () => tmux(["display-message", "-p", "-t", current.pane, "#{pane_dead}"]) === "1" ? true : undefined);
  const msgId = randomUUID(), nonce = `PIJ_149_GAP_${randomUUID()}`;
  leg.msgId = msgId; leg.nonce = nonce;
  leg.send = await api("/v1/send", { from: "pij-149-proof", to: { seat: first.id }, body: nonce, msg_id: msgId });
  leg.jobs_before = rows("SELECT id,state,payload FROM jobs WHERE serial_key=? AND dedupe_key=?", first.id, msgId);
  if (!sameWindow) {
   tmux(["kill-pane", "-t", current.pane]);
   leg.reap = await api("/v1/reap", { caller: { PIJ_SESSION_ID: first.id }, dry_run: true });
   leg.retired = await api("/v1/close", { caller: { PIJ_SESSION_ID: first.id }, seat: first.id, reason: "149-owned-exited-native-proof" });
  }
  const args = [wrapper, `--resume=${first.session}`];
  const pane = sameWindow ? current.pane : tmux(["new-window", "-d", "-P", "-F", "#{pane_id}", "-t", "native-149", "-c", cwd, ...args]);
  if (sameWindow) tmux(["respawn-pane", "-t", pane, "-c", cwd, ...args]);
  const resumed = await observed(pane, current.proc.pid);
  leg.after = resumed;
  assert.equal(resumed.id, first.id, "native session retains seat id");
  assert.equal(resumed.session, first.session);
  assert.equal(resumed.pane === current.pane, sameWindow);
  await until("gap message native arrival", () => nativeMessages(events(), nonce)[0]);
  leg.ack = await until("reader-read ack", () => rows("SELECT recipient,msg_id,origin FROM delivered_messages WHERE recipient=? AND msg_id=?", first.id, msgId).find((row) => row.origin === "reader-read"));
  leg.jobs_after = rows("SELECT id,state,payload FROM jobs WHERE serial_key=? AND dedupe_key=?", first.id, msgId);
  leg.state = await api("/v1/state", { id: first.id });
  const projected = leg.state as Record<string, unknown>;
  assert.equal(projected.pid, resumed.proc.pid);
  assert.equal(projected.procStart, resumed.proc.proc_start);
  assert.equal(projected.tombstonedAt, null);
  assert.equal(projected.tombstoneReason, null);
  leg.terminal = tmux(["capture-pane", "-p", "-J", "-t", pane]);
  assert(!String(leg.terminal).includes("no retry is scheduled"));
  current = resumed;
 }
 receipt.status = "passed";
} catch (error) {
 receipt.status = "failed"; receipt.error = error instanceof Error ? error.stack : String(error);
 try { receipt.panes = tmux(["list-panes", "-a", "-F", "#{pane_id} #{pane_dead} #{pane_current_command}"]); for (const line of String(receipt.panes).split("\n")) { const pane = line.split(" ")[0]; stages.push({ kind: "failure-terminal", pane, terminal: tmux(["capture-pane", "-p", "-J", "-t", pane]) }); } } catch { /* private socket may not exist */ }
 process.exitCode = 1;
} finally {
 receipt.daemonLog = daemonLog;
 try { tmux(["kill-server"]); } catch { /* own socket only */ }
 daemon?.kill("SIGTERM");
 await fixture.close();
 writeFileSync(output, JSON.stringify(receipt, null, 2));
 console.log(JSON.stringify({ status: receipt.status, output, run, error: receipt.error }));
}
