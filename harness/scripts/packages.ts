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
//   bootstrap                     — sync, then `pi install` every enabled entry, then
//                                   report-and-continue: re-vet stale entries offline and
//                                   surface findings for human review (never blocks)
//   vet <source> [--json]         — run vetter pipeline against one source; print Verdict
//                                   (STRICT escape hatch: still exits 0/2 for on-demand checks)
//   audit [--json] [--write]      — run pipeline across all enabled entries; REPORT-ONLY (exit 0).
//                                   Findings are surfaced for review, not enforced. vetted.date
//                                   refresh write-backs persist only under --write.
//
// Policy (changed 2026-06-16, per user): the vetter pipeline REPORTS rather than
// blocks. add/bootstrap/audit never refuse on stale/warn/fail — they print the
// findings and the agent relays them so the human can choose to keep a package or
// remove it with `pkg disable <source>`. `vet <source>` remains the strict, exit-
// coded check. The hand-edit bans (packages.yaml / settings.json) and the
// `requires.install` shell-vector caution still stand.

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { type Document, parseDocument, type YAMLMap, type YAMLSeq } from "yaml";
import { piInvocation } from "./cli-invocation.js";
import { releaseAgeEnvironment } from "./release-age-policy.js";
import { agentVetter } from "./vetters/agent.js";
import { aggregate, runPipeline } from "./vetters/aggregate.js";
import { buildUnmanifestedVerdict } from "./vetters/audit-unmanifested.js";
import { refreshVettedBlock } from "./vetters/audit-writeback.js";
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

// Offline subset used for report-only re-vetting during bootstrap: no LLM agent
// vetter, no scorecard network call, so routine installs stay fast and reliable.
// These cover the findings a human actually decides on (CVEs, lockfile, trust).
const OFFLINE_VETTERS: Parameters<typeof runPipeline>[0] = [
	lockfileLintVetter,
	npmAuditVetter,
	githubTrustVetter,
];

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
	// FX001-3: lineWidth: 0 disables YAML folded-scalar wrapping so long
	// strings (the `install:` shell command, override reasons) keep their
	// authored single-line shape across cmdAudit refresh write-backs.
	writeFileSync(YAML_PATH, doc.toString({ lineWidth: 0 }));
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
		const invocation = piInvocation(["remove", source]);
		execFileSync(invocation.file, invocation.args, { stdio: ["ignore", "pipe", "pipe"] });
		return "removed";
	} catch {
		return "missing";
	}
}

function installPiPackage(source: string): void {
	const invocation = piInvocation(["install", source]);
	execFileSync(invocation.file, invocation.args, {
		env: releaseAgeEnvironment(),
		stdio: "inherit",
	});
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
		installPiPackage(source);
	} catch {
		console.error(`! pi install failed for ${source}; aborting add`);
		process.exit(2);
	}

	const verdict = await vetSource(source);
	console.log("");
	printVerdict(verdict);

	if (verdict.level === "fail" && !unsafe) {
		console.error(
			`\n⚠ ${source} vetted ${verdict.level} — adding anyway (report-and-continue policy).`,
		);
		console.error(`  Review the findings above. Remove later with: npm run pkg disable ${source}`);
	}

	let overrides: Overrides | undefined;
	if (verdict.level !== "ok") {
		// add no longer blocks; --unsafe/--reason only records an acceptance note
		// as provenance. Prompt only when the user explicitly passed --unsafe.
		const reason =
			reasonFromFlag ?? (unsafe ? await promptReason(`acceptance note for ${source}`) : null);
		if (reason) {
			// FX001-1: rules:[] — fails/warns are never auto-downgraded; reason is
			// captured as provenance for later review.
			overrides = { rules: [], reason };
			logUnsafeOverride("add", source, reason);
		}
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

async function cmdBootstrap(_args: string[]): Promise<void> {
	cmdSync();
	const list = entries(readDoc()).filter((e) => e.enabled);
	if (list.length === 0) {
		console.log("nothing to install — manifest is empty");
		return;
	}

	// Report-and-continue: bootstrap NEVER blocks on staleness. Install
	// everything, then re-vet stale/unvetted entries offline and surface their
	// findings so the human can decide whether to keep each package.
	console.log(`\nbootstrapping ${list.length} package(s)...`);
	let installed = 0;
	let failed = 0;
	for (const e of list) {
		if (ensureRequires(e) === "skipped") {
			failed++;
			continue;
		}
		try {
			installPiPackage(e.source);
			installed++;
		} catch {
			console.error(`! failed: ${e.source}`);
			failed++;
		}
	}
	const failedNote = failed > 0 ? ` (${failed} failed)` : "";
	console.log(`\n✓ installed ${installed}/${list.length}${failedNote}`);

	const stale = list.filter((e) => !isFresh(e));
	const flagged: Array<{ source: string; verdict: Verdict }> = [];
	if (stale.length) {
		console.log(
			`\n⚠ re-vetting ${stale.length} stale/unvetted entr${stale.length === 1 ? "y" : "ies"} (offline) for review:`,
		);
		for (const e of stale) {
			const days = ageDays(e);
			const ageInfo = days === null ? "no vetted block" : `vetted ${days}d ago`;
			const verdict = await vetSource(e.source, OFFLINE_VETTERS);
			console.log(`\n=== ${e.source} (${ageInfo}) ===`);
			printVerdict(verdict);
			if (verdict.level !== "ok") flagged.push({ source: e.source, verdict });
		}
	}

	if (flagged.length) {
		console.log(`\n──── REVIEW: ${flagged.length} package(s) have findings — your call ────`);
		for (const f of flagged) {
			const fails = f.verdict.findings.filter((x) => x.severity === "fail").length;
			const warns = f.verdict.findings.filter((x) => x.severity === "warn").length;
			console.log(`  • ${f.source}: ${f.verdict.level} (${fails} fail, ${warns} warn)`);
		}
		console.log("  Keep: do nothing.  Remove: npm run pkg disable <source>");
	}
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

async function vetSource(
	source: string,
	vetters: Parameters<typeof runPipeline>[0] = [...VETTERS],
): Promise<Verdict> {
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
	const verdicts = await runPipeline(vetters, installPath, source, { shortCircuit: false });
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
	// Audit is REPORT-ONLY by contract: vetted.date refresh write-backs (FX001-3)
	// persist only under an explicit --write. A default-on write let the mandated
	// `harness checks` gate dirty .pi/packages.yaml inside every worker's diff.
	const write = args.includes("--write");
	const doc = readDoc();
	const list = entries(doc).filter((e) => e.enabled);
	const seq = doc.get("packages") as YAMLSeq;
	const results: Array<{
		source: string;
		verdict: Verdict;
		effective: Verdict["level"];
		override?: Overrides;
	}> = [];
	let refreshedCount = 0;
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
		// FX001-3: refresh write-back. Gated on RAW verdict.level === "ok"
		// (NOT effective via override — overrides must age out, otherwise we
		// re-create F004 through a different door). Requires explicit --write
		// (audit is otherwise report-only); still skipped on --json for CI
		// determinism.
		if (write && !json && verdict.level === "ok") {
			const idx = findIndex(doc, e.source);
			if (idx !== -1) {
				const item = seq.get(idx) as YAMLMap;
				const vetted = (item.get("vetted") as YAMLMap | null) ?? null;
				if (vetted && refreshVettedBlock(vetted, verdict)) {
					refreshedCount++;
				}
			}
		}
	}

	// FX001-2: cross-check pi list output against manifest. Unmanifested
	// project-scope installs are converted into a synthetic vetter:audit
	// Verdict so they participate in the worst-level aggregate (closes F002).
	const installed = piList();
	const manifestSources = new Set(list.map((e) => e.source));
	const unmanifested = installed
		.filter((p) => p.scope === "project" && !manifestSources.has(p.source))
		.map((p) => p.source);
	if (unmanifested.length) {
		const auditVerdict = buildUnmanifestedVerdict(unmanifested);
		results.push({
			source: "<audit:unmanifested>",
			verdict: auditVerdict,
			effective: auditVerdict.level,
		});
		if (!json) {
			console.log("\n=== <audit:unmanifested> ===");
			printVerdict(auditVerdict);
		}
	}

	if (json) {
		console.log(JSON.stringify({ results, unmanifestedProjectInstalls: unmanifested }, null, 2));
	}

	// FX001-3: persist refresh write-backs (if any). One write per cmdAudit run,
	// and only ever under --write (report-only otherwise).
	if (refreshedCount > 0) {
		writeDoc(doc);
		if (!json) {
			console.log(`\n✓ refreshed vetted.date for ${refreshedCount} entry/entries`);
		}
	}

	const worst = results.reduce<Verdict["level"]>(
		(acc, r) =>
			r.effective === "fail" ? "fail" : r.effective === "warn" && acc !== "fail" ? "warn" : acc,
		"ok",
	);
	if (!json) {
		if (worst === "ok") {
			console.log(`\n✓ ${results.length} entries vetted ok`);
		} else {
			const flagged = results.filter((r) => r.effective !== "ok");
			console.log(
				`\n⚠ REVIEW (report-only, not blocking): ${flagged.length}/${results.length} entr${flagged.length === 1 ? "y" : "ies"} flagged — aggregate ${worst}`,
			);
			for (const r of flagged) {
				const fails = r.verdict.findings.filter((f) => f.severity === "fail").length;
				const warns = r.verdict.findings.filter((f) => f.severity === "warn").length;
				const hint = r.source.startsWith("<") ? "" : ` — keep, or: npm run pkg disable ${r.source}`;
				console.log(`  • ${r.source}: ${r.effective} (${fails} fail, ${warns} warn)${hint}`);
			}
		}
	}
	// Report-only policy (2026-06-16): audit never fails the build. Use
	// `pkg vet <source>` for a strict, exit-coded check on demand.
	process.exit(0);
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
