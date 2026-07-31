// s179 end-to-end delivery proof.
//
// ISOLATION: a temp pij home + a throwaway tmux session. The live ~/.pij registry
// and the running daemon are never read or written; no npm link, no daemon restart.
// Delivery runs through the REAL DaemonTmux (real tmux, real submission
// verification) driven by Daemon.tick(), which is where delivery actually lives.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DaemonTmux } from "/Users/vaughanknight/GitHub/pij-worktrees/s179-upstream-merge/.pi/extensions/pij/adapters/daemon-tmux.js";
import { FsChannel as Channel } from "/Users/vaughanknight/GitHub/pij-worktrees/s179-upstream-merge/.pi/extensions/pij/adapters/channel.js";
import { FsRegistry } from "/Users/vaughanknight/GitHub/pij-worktrees/s179-upstream-merge/.pi/extensions/pij/adapters/fs-registry.js";
import { Daemon } from "/Users/vaughanknight/GitHub/pij-worktrees/s179-upstream-merge/.pi/extensions/pij/daemon.js";

const SESSION = "s179-e2e";
const home = mkdtempSync(join(tmpdir(), "s179-pij-"));
console.log(`temp pij home: ${home}`);

const tmux = (args: string[]): string =>
	execFileSync("tmux", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const sleep = (ms: number) => {
	const until = Date.now() + ms;
	while (Date.now() < until) execFileSync("sleep", ["0.05"]);
};

function bodies(to: string): string[] {
	const inbox = join(home, to, "inbox");
	try {
		return readdirSync(inbox)
			.filter((n) => n.startsWith("msg-") && n.endsWith(".json"))
			.sort()
			.map((n) => (JSON.parse(readFileSync(join(inbox, n), "utf8")) as { body: string }).body);
	} catch {
		return [];
	}
}

function descriptor(over: Record<string, unknown> & { id: string }) {
	return {
		folder: process.cwd(),
		dataDir: join(home, over.id),
		eventsPath: join(home, over.id, "events.ndjson"),
		pid: process.pid,
		startedAt: new Date().toISOString(),
		...over,
	};
}

// ── tear down any leftovers, then build a throwaway tmux session ──────────────
try {
	tmux(["kill-session", "-t", SESSION]);
} catch {
	/* no leftover session */
}

const NONCE = `s179-${Math.floor(Date.now() / 1000)}`;

// Pane A: a REAL claude seat.
tmux(["new-session", "-d", "-s", SESSION, "-x", "200", "-y", "50", "claude"]);
const paneA = tmux(["list-panes", "-t", `${SESSION}:0`, "-F", "#{pane_id}"]).trim();

// Pane B: the forced wedge — a process that ECHOES typed text (so the payload is
// visibly in the "composer") but can never produce a submission signal.
tmux(["new-window", "-t", SESSION, "-d", "sh", "-c", "cat > /dev/null"]);
const paneB = tmux(["list-panes", "-t", `${SESSION}:1`, "-F", "#{pane_id}"]).trim();

console.log(`panes: claude=${paneA}  wedge=${paneB}`);

// Give claude time to boot its composer.
for (let i = 0; i < 60; i++) {
	sleep(1000);
	const pane = tmux(["capture-pane", "-p", "-t", paneA]);
	if (/│\s*>/.test(pane) || /shift\+tab to cycle/.test(pane)) break;
}
console.log("--- claude pane after boot ---");
console.log(tmux(["capture-pane", "-p", "-t", paneA]).trimEnd().split("\n").slice(-8).join("\n"));

// ── registry + mailbox, all inside the temp home ─────────────────────────────
const registry = new FsRegistry(home);
registry.write(descriptor({ id: "pij-s179-sender" }));
registry.write(
	descriptor({
		id: "pij-s179-claude",
		harness: "claude",
		lifecycle: "bound",
		paneId: paneA,
		harnessSessionId: "e2e-a",
	}),
);
registry.write(
	descriptor({
		id: "pij-s179-wedge",
		harness: "claude",
		lifecycle: "bound",
		paneId: paneB,
		harnessSessionId: "e2e-b",
	}),
);

const channel = new Channel(home);
const BODY_OK = `[${NONCE}] reply with the single word ARRIVED and nothing else`;
const BODY_WEDGE = `[${NONCE}-wedge] this payload can never be confirmed submitted`;

const sentOk = channel.deliver({ from: "pij-s179-sender", to: "pij-s179-claude", body: BODY_OK });
const sentWedge = channel.deliver({
	from: "pij-s179-sender",
	to: "pij-s179-wedge",
	body: BODY_WEDGE,
});
if (!sentOk.ok || !sentWedge.ok) throw new Error("could not enqueue test messages");

// ── drive the REAL delivery path ─────────────────────────────────────────────
const daemon = new Daemon(home, new DaemonTmux(), registry, new Channel(home), (l: string) =>
	console.log(`  daemon: ${l}`),
);

for (let tick = 0; tick < 8; tick++) {
	daemon.tick();
	sleep(700);
}

sleep(4000);

// ── evidence ─────────────────────────────────────────────────────────────────
const paneAText = tmux(["capture-pane", "-p", "-S", "-200", "-t", paneA]);
const paneBText = tmux(["capture-pane", "-p", "-S", "-200", "-t", paneB]);
const receipts = bodies("pij-s179-sender");

console.log("\n================ LEG 1: real claude seat ================");
console.log(`payload visible in claude pane : ${paneAText.includes(NONCE)}`);
console.log(`claude ANSWERED (said ARRIVED) : ${/ARRIVED/.test(paneAText)}`);
console.log(`receipt for ${sentOk.value.messageId}:`);
for (const b of receipts.filter((r) => r.includes(sentOk.value.messageId))) console.log(`  ${b}`);

console.log("\n================ LEG 2: forced wedge ====================");
console.log(`payload visible in wedge pane  : ${paneBText.includes(`${NONCE}-wedge`)}`);
console.log(`receipt for ${sentWedge.value.messageId}:`);
for (const b of receipts.filter((r) => r.includes(sentWedge.value.messageId))) console.log(`  ${b}`);

console.log("\n================ ALL RECEIPTS ===========================");
for (const b of receipts) console.log(`  ${b}`);

console.log("\n--- claude pane tail ---");
console.log(paneAText.trimEnd().split("\n").slice(-25).join("\n"));
console.log("\n--- wedge pane tail ---");
console.log(paneBText.trimEnd().split("\n").slice(-6).join("\n"));

console.log(`\nhome=${home}  session=${SESSION}  (left up for inspection)`);
