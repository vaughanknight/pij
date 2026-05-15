#!/usr/bin/env tsx
// npm run pkg <command> [args]
//
// Source of truth: .pi/packages.yaml
// Generated artifact:  .pi/settings.json#packages
//
// Commands:
//   list                          — show all entries with enabled/disabled state
//   add <source> [note...]        — append as enabled (T004: runs vet first), then sync
//   enable <source-or-substring>  — flip enabled=true, then sync
//   disable <source-or-substring> — flip enabled=false, sync (runs `pi remove`)
//   sync                          — regenerate settings.json, `pi remove` disabled entries
//   bootstrap                     — sync, then `pi install` every enabled entry (T004: gated on vetted: freshness)
//   vet <source> [--json]         — run vetter pipeline against one source; print Verdict
//   audit [--json]                — run pipeline across all enabled entries; exit 0/2 (warn-as-fail)

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { type Document, parseDocument, type YAMLMap, type YAMLSeq } from "yaml";
import { agentVetter } from "./vetters/agent.js";
import { aggregate, runPipeline } from "./vetters/aggregate.js";
import { githubTrustVetter } from "./vetters/github-trust.js";
import { lockfileLintVetter } from "./vetters/lockfile-lint.js";
import { npmAuditVetter } from "./vetters/npm-audit.js";
import { allWarnsAccepted, type Overrides, parseOverrides } from "./vetters/overrides.js";
import { piList, resolveSourcePath } from "./vetters/resolve-path.js";
import { scorecardVetter } from "./vetters/scorecard.js";
import type { Verdict } from "./vetters/types.js";

const VETTERS = [
	lockfileLintVetter,
	npmAuditVetter,
	githubTrustVetter,
	scorecardVetter,
	agentVetter, // last because it's slowest + uses LLM credits
] as const;

const VET_TTL_DAYS = 30;

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const YAML_PATH = resolve(PIJ_ROOT, ".pi", "packages.yaml");
const SETTINGS_PATH = resolve(PIJ_ROOT, ".pi", "settings.json");

// FX001-1: override shape lives in ./vetters/overrides.ts (parseOverrides +
// allWarnsAccepted). All readers go through that module — no direct
// `e.vetted?.overrides` field access in CLI code.
interface Entry {
	source: string;
	enabled: boolean;
	note?: string;
	requires?: { bin: string; install: string };
	vetted?: {
		date: string; // ISO8601
		score: number; // 0–100
		overrides?: Overrides | string; // typed since FX001; string form is legacy/deprecated
		agentRubric?: string; // sha256 hex of agent briefing (when agent ran)
	};
}

function ensureRequires(e: Entry): "ok" | "installed" | "skipped" {
	if (!e.requires) return "ok";
	const { bin, install } = e.requires;
	try {
		execFileSync(bin, ["--version"], { stdio: "ignore" });
		return "ok";
	} catch {
		console.log(`  dep '${bin}' missing — installing: ${install}`);
		try {
			execSync(install, { stdio: "inherit" });
			return "installed";
		} catch {
			console.error(`  ! failed to install '${bin}'`);
			return "skipped";
		}
	}
}

function readDoc(): Document {
	if (!existsSync(YAML_PATH)) {
		console.error(`no manifest at ${YAML_PATH}`);
		process.exit(1);
	}
	return parseDocument(readFileSync(YAML_PATH, "utf8"));
}

function entries(doc: Document): Entry[] {
	const seq = doc.get("packages") as YAMLSeq | null;
	if (!seq || !("items" in seq)) return [];
	return seq.toJSON() as Entry[];
}

function writeDoc(doc: Document): void {
	writeFileSync(YAML_PATH, doc.toString());
}

function readSettings(): Record<string, unknown> {
	if (!existsSync(SETTINGS_PATH)) return {};
	try {
		return JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
	} catch {
		return {};
	}
}

function writeSettings(s: Record<string, unknown>): void {
	writeFileSync(SETTINGS_PATH, `${JSON.stringify(s, null, "\t")}\n`);
}

function findIndex(doc: Document, needle: string): number {
	const list = entries(doc);
	const exact = list.findIndex((e) => e.source === needle);
	if (exact !== -1) return exact;
	const partial = list.findIndex((e) => e.source.includes(needle));
	return partial;
}

function piRemove(source: string): "removed" | "missing" {
	try {
		execFileSync("pi", ["remove", source], { stdio: ["ignore", "pipe", "pipe"] });
		return "removed";
	} catch {
		return "missing";
	}
}

function cmdSync(): void {
	const doc = readDoc();
	const list = entries(doc);
	const enabledSources = list.filter((e) => e.enabled).map((e) => e.source);
	const disabledSources = list.filter((e) => !e.enabled).map((e) => e.source);

	const settings = readSettings();
	settings.packages = enabledSources;
	writeSettings(settings);
	console.log(`✓ .pi/settings.json: ${enabledSources.length} enabled`);

	for (const src of disabledSources) {
		const result = piRemove(src);
		if (result === "removed") console.log(`✗ uninstalled ${src}`);
	}
}

function extractReason(args: string[]): string | null {
	const idx = args.indexOf("--reason");
	if (idx === -1 || idx === args.length - 1) return null;
	const r = args[idx + 1]?.trim();
	return r ? r : null;
}

async function cmdAdd(args: string[]): Promise<void> {
	const unsafe = args.includes("--unsafe");
	const positional = args.filter((a) => !a.startsWith("--"));
	const reasonFromFlag = extractReason(args);
	// also strip the value following --reason from positional
	if (reasonFromFlag) {
		const idx = args.indexOf("--reason");
		const dropped = args[idx + 1];
		const i = positional.indexOf(dropped ?? "");
		if (i !== -1) positional.splice(i, 1);
	}
	const [source, ...rest] = positional;
	if (!source) {
		console.error("usage: pkg add <source> [note...] [--unsafe [--reason <text>]]");
		process.exit(2);
	}
	const note = rest.join(" ") || undefined;

	const doc = readDoc();
	if (findIndex(doc, source) !== -1) {
		console.log(`= ${source} already in manifest`);
		return;
	}

	// Install first so vetters can scan
	console.error(`installing ${source} for pre-vet scan...`);
	try {
		execFileSync("pi", ["install", source], { stdio: "inherit" });
	} catch {
		console.error(`! pi install failed for ${source}; aborting add`);
		process.exit(2);
	}

	const verdict = await vetSource(source);
	console.log("");
	printVerdict(verdict);

	if (verdict.level === "fail" && !unsafe) {
		console.error(
			`\n✗ refusing to add: vet returned ${verdict.level}. Re-run with --unsafe to override.`,
		);
		// Roll back the install
		try {
			execFileSync("pi", ["remove", source], { stdio: ["ignore", "pipe", "pipe"] });
		} catch {
			/* best-effort */
		}
		process.exit(2);
	}

	let overrides: Overrides | undefined;
	if (unsafe && verdict.level !== "ok") {
		const reason = reasonFromFlag ?? (await promptReason(`unsafe add of ${source}`));
		if (!reason) {
			console.error("✗ --unsafe requires a non-empty reason");
			process.exit(2);
		}
		// FX001-1: --unsafe at add-time accepts a fail Verdict; fails are never
		// auto-downgraded by cmdAudit anyway, so rules:[] is correct. Reason is
		// captured as provenance.
		overrides = { rules: [], reason };
		logUnsafeOverride("add", source, reason);
	}

	let seq = doc.get("packages") as YAMLSeq | null;
	if (!seq) {
		doc.set("packages", []);
		seq = doc.get("packages") as YAMLSeq;
	}
	seq.flow = false;
	const entry: Record<string, unknown> = { source, enabled: true };
	if (note) entry.note = note;
	const vetted: Record<string, unknown> = {
		date: new Date().toISOString(),
		score: verdict.score,
	};
	if (overrides) vetted.overrides = overrides;
	if (verdict.agentRubric) vetted.agentRubric = verdict.agentRubric;
	entry.vetted = vetted;
	seq.add(entry);
	writeDoc(doc);
	console.log(`+ ${source}`);
	cmdSync();
}

function cmdToggle(needle: string, enabled: boolean): void {
	if (!needle) {
		console.error(`usage: pkg ${enabled ? "enable" : "disable"} <source-or-substring>`);
		process.exit(2);
	}
	const doc = readDoc();
	const idx = findIndex(doc, needle);
	if (idx === -1) {
		console.error(`no entry matching '${needle}'`);
		process.exit(1);
	}
	const seq = doc.get("packages") as YAMLSeq;
	const item = seq.get(idx) as YAMLMap;
	item.set("enabled", enabled);
	writeDoc(doc);
	const updated = entries(doc)[idx];
	if (updated) console.log(`${enabled ? "✓" : "✗"} ${updated.source}`);
	cmdSync();
}

async function cmdBootstrap(args: string[]): Promise<void> {
	const unsafe = args.includes("--unsafe");
	const reasonFromFlag = extractReason(args);

	cmdSync();
	const list = entries(readDoc()).filter((e) => e.enabled);
	if (list.length === 0) {
		console.log("nothing to install — manifest is empty");
		return;
	}

	// Gate: refuse entries with missing or stale vetted.date unless --unsafe
	const stale: Array<{ entry: Entry; ageInfo: string }> = [];
	for (const e of list) {
		if (!isFresh(e)) {
			const days = ageDays(e);
			stale.push({
				entry: e,
				ageInfo: days === null ? "no vetted: block" : `vetted ${days}d ago (>${VET_TTL_DAYS}d TTL)`,
			});
		}
	}
	if (stale.length && !unsafe) {
		console.error(`✗ refusing to bootstrap — ${stale.length} entry/entries are stale or unvetted:`);
		for (const s of stale) console.error(`  - ${s.entry.source}  (${s.ageInfo})`);
		console.error("Run `npm run pkg audit` to refresh, or pass --unsafe to override.");
		process.exit(2);
	}
	if (stale.length && unsafe) {
		const reason =
			reasonFromFlag ??
			(await promptReason(`unsafe bootstrap of ${stale.length} stale/unvetted entries`));
		if (!reason) {
			console.error("✗ --unsafe requires a non-empty reason");
			process.exit(2);
		}
		const doc = readDoc();
		const seq = doc.get("packages") as YAMLSeq;
		for (const s of stale) {
			const idx = findIndex(doc, s.entry.source);
			if (idx === -1) continue;
			const item = seq.get(idx) as YAMLMap;
			const vetted = (item.get("vetted") as YAMLMap | null) ?? null;
			// FX001-1: bootstrap --unsafe overrides staleness, not findings,
			// so rules:[]. Future audits still gate on real findings.
			const overrideObj: Overrides = { rules: [], reason };
			if (vetted) {
				vetted.set("overrides", overrideObj);
			} else {
				item.set("vetted", {
					date: new Date().toISOString(),
					score: 0,
					overrides: overrideObj,
				});
			}
			logUnsafeOverride("bootstrap", s.entry.source, reason);
		}
		writeDoc(doc);
	}

	console.log(`\nbootstrapping ${list.length} package(s)...`);
	let installed = 0;
	let failed = 0;
	for (const e of list) {
		if (ensureRequires(e) === "skipped") {
			failed++;
			continue;
		}
		try {
			execFileSync("pi", ["install", e.source], { stdio: "inherit" });
			installed++;
		} catch {
			console.error(`! failed: ${e.source}`);
			failed++;
		}
	}
	const failedNote = failed > 0 ? ` (${failed} failed)` : "";
	console.log(`\n✓ installed ${installed}/${list.length}${failedNote}`);
}

function isFresh(entry: Entry): boolean {
	if (!entry.vetted?.date) return false;
	const ageMs = Date.now() - Date.parse(entry.vetted.date);
	return ageMs >= 0 && ageMs <= VET_TTL_DAYS * 86_400_000;
}

function ageDays(entry: Entry): number | null {
	if (!entry.vetted?.date) return null;
	return Math.floor((Date.now() - Date.parse(entry.vetted.date)) / 86_400_000);
}

function summarizeVerdict(v: Verdict): string {
	const tag = v.level === "ok" ? "✓" : v.level === "warn" ? "⚠" : "✗";
	const findings = v.findings.length;
	return `${tag} ${v.vetter}: ${v.level} (score=${v.score}, findings=${findings}, ${v.durationMs}ms)`;
}

function printVerdict(v: Verdict): void {
	console.log(summarizeVerdict(v));
	for (const f of v.findings) {
		const loc = f.file ? ` @ ${f.file}${f.line ? `:${f.line}` : ""}` : "";
		const ctx = f.context ? ` [${f.context}]` : "";
		const sevSigil = f.severity === "fail" ? "  ✗" : f.severity === "warn" ? "  ⚠" : "  ·";
		console.log(`${sevSigil} ${f.rule}: ${f.msg}${loc}${ctx}`);
	}
}

async function vetSource(source: string): Promise<Verdict> {
	const installPath = resolveSourcePath(source);
	if (!installPath) {
		return aggregate([
			{
				vetter: "resolve-path",
				score: 0,
				level: "fail",
				findings: [
					{
						rule: "vetter:not-installed",
						msg: `source '${source}' is not installed; run \`pi install <source>\` first`,
						severity: "fail",
					},
				],
				scannedFiles: 0,
				durationMs: 0,
			},
		]);
	}
	const verdicts = await runPipeline([...VETTERS], installPath, source, { shortCircuit: false });
	return aggregate(verdicts);
}

async function promptReason(action: string): Promise<string | null> {
	if (!process.stdin.isTTY) {
		console.error(
			`${action} requires a --reason in non-TTY mode; rerun in a terminal or use \`--reason "<text>"\``,
		);
		return null;
	}
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	const answer = (await rl.question(`Reason for ${action} (required, non-empty): `)).trim();
	rl.close();
	if (!answer) return null;
	return answer;
}

function logUnsafeOverride(action: string, source: string, reason: string): void {
	const line = `[unsafe] ${new Date().toISOString()} ${action} ${source} reason:${reason}`;
	console.error(line);
}

async function cmdVet(args: string[]): Promise<void> {
	const json = args.includes("--json");
	const positional = args.filter((a) => !a.startsWith("--"));
	const source = positional[0];
	if (!source) {
		console.error("usage: pkg vet <source> [--json]");
		process.exit(2);
	}
	const verdict = await vetSource(source);
	if (json) {
		console.log(JSON.stringify(verdict, null, 2));
	} else {
		printVerdict(verdict);
	}
	process.exit(verdict.level === "ok" ? 0 : 2);
}

async function cmdAudit(args: string[]): Promise<void> {
	const json = args.includes("--json");
	const list = entries(readDoc()).filter((e) => e.enabled);
	const results: Array<{
		source: string;
		verdict: Verdict;
		effective: Verdict["level"];
		override?: Overrides;
	}> = [];
	for (const e of list) {
		const verdict = await vetSource(e.source);
		// FX001-1: per-finding override scope. cmdAudit downgrades warn→ok only
		// when EVERY warn finding's rule is in override.rules. New unrelated warns
		// keep their severity and propagate to exit code 2 — closes F004.
		// fail is NEVER auto-downgraded.
		const override = parseOverrides(e.vetted?.overrides);
		let effective = verdict.level;
		const accepted = verdict.level === "warn" && allWarnsAccepted(verdict.findings, override);
		if (accepted) effective = "ok";
		results.push({
			source: e.source,
			verdict,
			effective,
			...(override ? { override } : {}),
		});
		if (!json) {
			console.log(`\n=== ${e.source} ===`);
			printVerdict(verdict);
			if (accepted && override) {
				console.log(
					`  ↳ accepted via vetted.overrides.rules=[${override.rules.join(",")}]: ${override.reason.slice(0, 120)}`,
				);
			} else if (override && override.rules.length === 0 && verdict.level === "warn") {
				console.log(`  ↳ override present but accepts no rules (rules:[]); warn not downgraded`);
			}
		}
	}

	// Cross-check pi list output against manifest for unmanifested entries
	const installed = piList();
	const manifestSources = new Set(list.map((e) => e.source));
	const unmanifested = installed
		.filter((p) => p.scope === "project" && !manifestSources.has(p.source))
		.map((p) => p.source);
	if (unmanifested.length && !json) {
		console.log("\n⚠ installed-but-unmanifested (project scope):");
		for (const s of unmanifested) console.log(`  - ${s}`);
	}

	if (json) {
		console.log(JSON.stringify({ results, unmanifestedProjectInstalls: unmanifested }, null, 2));
	}

	const worst = results.reduce<Verdict["level"]>(
		(acc, r) =>
			r.effective === "fail" ? "fail" : r.effective === "warn" && acc !== "fail" ? "warn" : acc,
		"ok",
	);
	if (!json) {
		const summary =
			worst === "ok"
				? `✓ ${results.length} entries vetted ok`
				: `✗ aggregate ${worst} across ${results.length} entries`;
		console.log(`\n${summary}`);
	}
	process.exit(worst === "ok" ? 0 : 2);
}

function cmdList(): void {
	const list = entries(readDoc());
	if (list.length === 0) {
		console.log("no packages — `npm run pkg add <source>` to add one");
		return;
	}
	for (const e of list) {
		const marker = e.enabled ? "✓" : "✗";
		const note = e.note ? `  — ${e.note}` : "";
		console.log(`${marker} ${e.source}${note}`);
	}
}

const [cmd, ...args] = process.argv.slice(2);
async function main(): Promise<void> {
	switch (cmd) {
		case undefined:
		case "list":
			cmdList();
			break;
		case "sync":
			cmdSync();
			break;
		case "bootstrap":
			await cmdBootstrap(args);
			break;
		case "add":
			await cmdAdd(args);
			break;
		case "enable":
			cmdToggle(args[0] ?? "", true);
			break;
		case "disable":
			cmdToggle(args[0] ?? "", false);
			break;
		case "vet":
			await cmdVet(args);
			break;
		case "audit":
			await cmdAudit(args);
			break;
		default:
			console.error(`unknown command: ${cmd}`);
			console.error(
				"commands: list | sync | add <source> [--unsafe --reason <text>] | enable <s> | disable <s> | bootstrap [--unsafe --reason <text>] | vet <source> [--json] | audit [--json]",
			);
			process.exit(2);
	}
}

main().catch((err) => {
	console.error(err instanceof Error ? err.stack : String(err));
	process.exit(1);
});
