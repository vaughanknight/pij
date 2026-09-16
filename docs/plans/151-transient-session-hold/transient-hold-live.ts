import { strict as assert } from "node:assert";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { smokeEnvironment, startFixtureProvider } from "../../../harness/scripts/copilot-native-fixture.js";
import { nativeComposer, nativeMessages, readNativeEvents } from "../../../harness/scripts/copilot-native-smoke.js";
import { manageCopilotExtension } from "../../../harness/scripts/link-global.js";

const root = resolve(import.meta.dirname, "../../..");
const run = mkdtempSync(join(tmpdir(), "pij-151-live-"));
const output = resolve(process.argv[2] ?? join(run, "receipt.json"));
assert(!existsSync(output), "never overwrite proof");
const home = join(run, "home"), state = join(run, "state"), cwd = join(run, "workspace");
const copilotHome = join(home, ".copilot"), socket = `pij-151-${randomUUID()}`;
for (const path of [home, state, cwd, copilotHome]) mkdirSync(path, { recursive: true, mode: 0o700 });
const free = createServer();
await new Promise<void>((ok) => free.listen(0, "127.0.0.1", ok));
const address = free.address();
assert(address && typeof address !== "string");
const daemonAddr = `127.0.0.1:${address.port}`;
await new Promise<void>((ok) => free.close(() => ok()));
assert.notEqual(daemonAddr, "127.0.0.1:7461");
const registrations: Record<string, unknown>[] = [];
let ac0: Record<string, unknown> | undefined;
let stretched: Record<string, unknown> | undefined;
let stretchTimer: ReturnType<typeof setTimeout> | undefined;
const proxy = createServer(async (request, response) => {
 const controller = new AbortController();
 response.on("close", () => controller.abort());
 try {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString();
  const started = Date.now();
  if (process.argv.includes("--stretch-transient") && !stretched && request.url?.startsWith("/v1/seats")) {
   const initial = registrations.find((row) => row.status === 200)?.claim as Record<string, unknown> | undefined;
   const logs = join(home, ".copilot/logs/extensions");
   if (initial && existsSync(logs)) {
    const latest = readdirSync(logs).filter((name) => name.startsWith("user-pij-")).sort().at(-1);
    const text = latest ? readFileSync(join(logs, latest), "utf8") : "";
    const match = /starting: pid=(\d+),.*SESSION_ID=([^\s]+)/.exec(text);
    if (match && match[2] !== initial.harness_session) {
     const pid = Number(execFileSync("ps", ["-p", match[1], "-o", "ppid="], { encoding: "utf8" }).trim());
     const observed = execFileSync("ps", ["-p", String(pid), "-o", "ppid=,comm="], { encoding: "utf8" }).trim();
     assert.equal(Number(observed.split(/\s+/)[0]), initial.pid, "only the owned restart child may be paused");
     stretched = { pid, observed, nativeSession: match[2], at: Date.now(), duration_ms: 15000,
      method: "SIGSTOP owned restart child AFTER extension requests roster; extension remains running" };
     process.kill(pid, "SIGSTOP");
     stretchTimer = setTimeout(() => { try { process.kill(pid, "SIGCONT"); } catch { /* owned child exited */ } }, 15000);
    }
   }
  }
  if (process.argv.includes("--ac0") && !ac0 && request.url === "/v1/register") {
   const incoming = JSON.parse(body);
   const initial = registrations.find((row) => row.status === 200);
   const owner = initial?.claim as Record<string, unknown> | undefined;
   if (owner && incoming.pid !== owner.pid) {
    const claim = { ...incoming, id: "", harness_session: `151-ac0-${randomUUID()}` };
    delete claim.spawn_id; delete claim.supersedes;
    ac0 = { source: "synthetic transient claim; real restart host, parent and tmux", claim, owner,
     ancestry: execFileSync("ps", ["-p", String(claim.pid), "-o", "pid=,ppid=,comm="], { encoding: "utf8" }).trim() };
    const probe = await fetch(`http://${daemonAddr}/v1/register`, { method: "POST",
     headers: { Authorization: request.headers.authorization ?? "", "Content-Type": "application/json" },
     body: JSON.stringify(claim), signal: AbortSignal.timeout(5000) });
    ac0.status = probe.status; ac0.envelope = await probe.json();
   }
  }
  const upstream = await fetch(`http://${daemonAddr}${request.url}`, {
   method: request.method, headers: { Authorization: request.headers.authorization ?? "", "Content-Type": "application/json" },
   body: body || undefined, signal: controller.signal,
  });
  const text = await upstream.text();
  if (request.url === "/v1/register") {
   const claim = JSON.parse(body);
   let ancestry: string;
   try { ancestry = execFileSync("ps", ["-p", String(claim.pid), "-o", "pid=,ppid=,comm="], { encoding: "utf8" }).trim(); }
   catch { ancestry = "host exited before receipt"; }
   registrations.push({ at: started, claim, status: upstream.status, envelope: JSON.parse(text), ancestry });
  }
  response.writeHead(upstream.status, { "Content-Type": "application/json" }).end(text);
 } catch (error) {
  if (!response.destroyed) response.writeHead(502).end(JSON.stringify({ error: String(error) }));
 }
});
await new Promise<void>((ok) => proxy.listen(0, "127.0.0.1", ok));
const proxyAddress = proxy.address();
assert(proxyAddress && typeof proxyAddress !== "string");
const addr = `127.0.0.1:${proxyAddress.port}`;
const fixture = await startFixtureProvider();
const env = { ...smokeEnvironment(process.env, home, copilotHome, state, addr, "local"),
 CLAUDE_CONFIG_DIR: join(home, ".claude-private"),
 COPILOT_PROVIDER_BASE_URL: fixture.url, COPILOT_PROVIDER_TYPE: "openai",
 COPILOT_PROVIDER_WIRE_API: "completions", COPILOT_MODEL: "pij-native-fixture" };
writeFileSync(join(copilotHome, "config.json"), JSON.stringify({ trustedFolders: [realpathSync(cwd)] }));
const extensionRoot = process.env.PIJ_151_EXTENSION_ROOT ?? root;
assert.equal(manageCopilotExtension({ pijRoot: extensionRoot, home, copilotHome, args: [], stdout: () => {}, stderr: () => {} }).skipped, 0);
const tmux = (args: string[], preserve = false) => {
 const text = execFileSync("tmux", ["-L", socket, ...args], { env, encoding: "utf8" });
 return preserve ? text : text.trim();
};
const bin = process.env.PIJ_151_BIN ?? join(root, "target/debug/pij-rs");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const receipt: Record<string, unknown> = { run, addr, daemonAddr, home, state, socket, registrations,
 binary_sha256: sha(bin), store_sha256: sha(join(extensionRoot, ".copilot/extensions/pij/store.mjs")),
 extension_sha256: sha(join(extensionRoot, ".copilot/extensions/pij/extension.mjs")),
 provider: "local deterministic provider; actual installed Copilot CLI/extension, daemon, HTTP and tmux" };
const until = async <T>(what: string, fn: () => Promise<T | undefined> | T | undefined): Promise<T> => {
 const deadline = Date.now() + 60000;
 while (Date.now() < deadline) { const value = await fn(); if (value !== undefined) return value; await delay(100); }
 throw new Error(`Timeout: ${what}`);
};
let daemonLog = "";
let daemon: ReturnType<typeof spawn> | undefined;
let pane: string | undefined;
try {
 tmux(["-f", "/dev/null", "new-session", "-d", "-s", "native-151", "-x", "160", "-y", "48", "-c", cwd, "/bin/sleep", "600"]);
 Object.assign(env, { TMUX: tmux(["display-message", "-p", "#{socket_path},#{pid},0"]) });
 tmux(["set-option", "-g", "remain-on-exit", "on"]);
 daemon = spawn(bin, ["--state-dir", state, "daemon", "--bind", daemonAddr], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
 daemon.stdout?.on("data", (data) => { daemonLog += data.toString(); });
 daemon.stderr?.on("data", (data) => { daemonLog += data.toString(); });
 const api = async (path: string) => {
  const key = readFileSync(join(state, "daemon.key"), "utf8").trim();
  const response = await fetch(`http://${daemonAddr}${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
  const answer = await response.json();
  assert(response.ok && answer.ok, JSON.stringify(answer)); return answer.data;
 };
 await until("isolated daemon health", async () => { if (!existsSync(join(state, "daemon.key"))) return undefined; try { return await api("/health"); } catch { return undefined; } });
 const loader = realpathSync(execFileSync("which", ["copilot"], { encoding: "utf8" }).trim());
 const copilot = join(dirname(loader), "node_modules", "@github", `copilot-${process.platform}-${process.arch}`, "copilot");
 assert(existsSync(copilot), "launch the installed native binary directly so pane pid IS the owner");
 receipt.copilot_binary = copilot;
 receipt.copilot_sha256 = sha(copilot);
 pane = tmux(["new-window", "-d", "-P", "-F", "#{pane_id}", "-t", "native-151", "-c", cwd,
  copilot, "--no-custom-instructions", "--disable-builtin-mcps", "--no-remote", "--no-auto-update", "--allow-tool=pij_send"]);
 const capture = () => tmux(["capture-pane", "-p", "-J", "-S", "-", "-t", pane as string]);
 const roster = async () => (await api("/v1/seats?scope=local")).seats;
 const first = await until("initial native seat", async () => (await roster()).find((row: { pane: string; native_extension_delivery: boolean }) => row.pane === pane && row.native_extension_delivery));
 receipt.before = first;
 const events = () => readNativeEvents(join(copilotHome, "session-state", first.session, "events.jsonl"));
 const warmup = `PIJ_151_WARMUP_${randomUUID()}`;
 await until("initial empty composer", () => nativeComposer(capture()) === "" ? true : undefined);
 tmux(["send-keys", "-t", pane, "-l", warmup]); tmux(["send-keys", "-t", pane, "Enter"]);
 await until("persisted conversation", () => nativeMessages(events(), warmup).length && events().some((event) => event.type === "assistant.turn_end") ? true : undefined);
 await until("restart empty composer", () => nativeComposer(capture()) === "" ? true : undefined);
 receipt.before_restart = capture();
 receipt.pane_process_before = tmux(["display-message", "-p", "-t", pane, "#{pane_pid}"]);
 tmux(["send-keys", "-t", pane, "-l", "/restart"]);
 await until("restart command staged", () => capture().includes("/restart") ? true : undefined);
 receipt.restart_staged = capture();
 receipt.restart_at = Date.now();
 tmux(["send-keys", "-t", pane, "Enter"]);
 const resumed = await until("same native session in new host", async () => (await roster()).find((row: { session: string; proc?: { pid: number }; native_extension_delivery: boolean }) => row.session === first.session && row.proc?.pid !== first.proc.pid && row.native_extension_delivery));
 receipt.after = resumed;
 await delay(1000);
 receipt.terminal = capture();
 const transient = registrations.filter((row) => (row.claim as Record<string, unknown>).harness_session !== first.session);
 receipt.transient = transient;
 const sessions = readdirSync(join(copilotHome, "session-state"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== first.session).map((entry) => entry.name);
 const logs = readdirSync(join(copilotHome, "logs/extensions")).filter((name) => name.startsWith("user-pij-"))
  .map((name) => ({ name, text: readFileSync(join(copilotHome, "logs/extensions", name), "utf8") }));
 receipt.fork_counts = sessions.map((session) => ({ session, forks: logs.filter((row) => row.text.includes(`SESSION_ID=${session}\n`)).length }));
 for (const session of sessions) {
  assert.equal(logs.filter((row) => row.text.includes(`SESSION_ID=${session}\n`)).length, 1, "one transient extension fork");
 }
 const db = new DatabaseSync(join(state, "pij.sqlite"), { readOnly: true });
 try {
  receipt.schemas = db.prepare("SELECT name,sql FROM sqlite_master WHERE name IN ('seats','jobs')").all();
  receipt.leak_queries = sessions.map((session) => {
   const seats = db.prepare("SELECT id FROM seats WHERE harness_session = ?").all(session);
   const jobs = db.prepare("SELECT id FROM jobs WHERE serial_key = ? OR json_extract(payload, '$.native_target_session') = ?").all(session, session);
   assert.deepEqual(seats, [], "transient session must have no Pij seat");
   assert.deepEqual(jobs, [], "transient session must have no keyed job");
   return { session, seats, jobs };
  });
  receipt.seats_after = db.prepare("SELECT id,harness_session FROM seats").all();
 } finally { db.close(); }
 assert.equal(resumed.id, first.id, "149 saved seat identity");
 if (ac0) assert.equal(ac0.status, 409, JSON.stringify(ac0.envelope));
 else assert(sessions.length > 0, "restart must actually create a throwaway native session");
 if (process.argv.includes("--stretch-transient")) assert(stretched && transient.length > 0, "scheduling-controlled hold must be exercised");
 assert(transient.every((row) => row.status === 409), "every transient registration must HOLD, not refuse");
 assert(!String(receipt.terminal).includes("[pij native] unavailable"), "no unavailable native timeline lines");
 assert(logs.every((row) => !row.text.includes('"kind":"extension-unavailable"')), "no terminal native registration failure");
 receipt.status = "passed";
} catch (error) {
 receipt.status = "failed"; receipt.error = error instanceof Error ? error.stack : String(error); process.exitCode = 1;
} finally {
 if (pane) { try { receipt.final_terminal = tmux(["capture-pane", "-p", "-J", "-S", "-", "-t", pane]); } catch { /* owned pane can exit */ } }
 const logs = join(copilotHome, "logs/extensions");
 receipt.extension_logs = existsSync(logs) ? readdirSync(logs).filter((name) => name.startsWith("user-pij-")).map((name) => ({ name, text: readFileSync(join(logs, name), "utf8") })) : [];
 receipt.ac0 = ac0;
 receipt.stretched = stretched;
 receipt.daemonLog = daemonLog;
 if (stretchTimer) clearTimeout(stretchTimer);
 if (stretched) { try { process.kill(Number(stretched.pid), "SIGCONT"); } catch { /* owned child exited */ } }
 try { tmux(["kill-server"]); } catch { /* private socket only */ }
 daemon?.kill("SIGTERM");
 proxy.closeAllConnections();
 await new Promise<void>((ok) => proxy.close(() => ok()));
 await fixture.close();
 writeFileSync(output, JSON.stringify(receipt, null, 2));
 console.log(JSON.stringify({ status: receipt.status, output, run, error: receipt.error }));
}
