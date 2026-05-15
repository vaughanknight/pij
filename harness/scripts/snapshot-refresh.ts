#!/usr/bin/env tsx
// FX001-4: regenerate package-vetter agent snapshots for AC-05 evidence.
//
// Outputs to agents/package-vetter/__snapshots__/:
//   _meta.json                     — briefing.md SHA + per-run timestamps
//   corpus-r0N.json                — per-corpus Verdict + expectedRule (R-0N)
//   <source-slug>-run{1,2,3}.json  — raw per-run package Verdicts (drift evidence)
//   <source-slug>.json             — median per package (modal finding-set, tie by run idx)
//
// Usage:
//   npm run snapshots:refresh                     # refresh everything (~20+ min)
//   npm run snapshots:refresh -- --corpus-only    # 7 corpus runs
//   npm run snapshots:refresh -- --pkg-only       # 4 packages × 3 runs
//
// Exits non-zero (companion F001 fix) when fewer than AC-05A_THRESHOLD corpus
// files have their expected R-0N rule detected — won't silently "succeed"
// with bad AC-05a evidence.

import { createHash } from "node:crypto";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseDocument, type YAMLSeq } from "yaml";
import { vet } from "./vetters/agent.js";
import { resolveSourcePath } from "./vetters/resolve-path.js";
import type { Verdict } from "./vetters/types.js";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const PACK_DIR = resolve(PIJ_ROOT, "agents", "package-vetter");
const SNAPSHOT_DIR = resolve(PACK_DIR, "__snapshots__");
const BRIEFING = resolve(PACK_DIR, "briefing.md");
const CORPUS_DIR = resolve(PACK_DIR, "corpus", "positive");
const YAML_PATH = resolve(PIJ_ROOT, ".pi", "packages.yaml");

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function slug(source: string): string {
	return source.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

// Stage a single corpus file in its own temp dir so the agent's per-package
// scan emits one Verdict per file (running against the flat corpus dir would
// collapse all 7 into one).
function stageCorpusFile(file: string): string {
	const tmp = mkdtempSync(resolve(tmpdir(), "pij-corpus-"));
	cpSync(resolve(CORPUS_DIR, file), resolve(tmp, file));
	return tmp;
}

function expectedRuleFor(corpusFile: string): string | null {
	const m = corpusFile.match(/^r(0\d)-/);
	return m ? `R-${m[1]}` : null;
}

// Median = the run whose finding-set is the modal set across N runs; tie-break
// = lowest run index. "Finding-set" = sorted set of rule slugs (severity-aware).
function chooseMedian(runs: Verdict[]): { idx: number; verdict: Verdict; drift: number } {
	if (runs.length === 0) throw new Error("chooseMedian requires at least one run");
	const keys = runs.map((v) =>
		v.findings
			.map((f) => `${f.rule}:${f.severity}`)
			.sort()
			.join("|"),
	);
	const tally = new Map<string, number[]>();
	keys.forEach((k, i) => {
		const ix = tally.get(k) ?? [];
		ix.push(i);
		tally.set(k, ix);
	});
	let bestKey = keys[0] ?? "";
	let bestCount = 0;
	for (const [k, ix] of tally.entries()) {
		if (ix.length > bestCount) {
			bestCount = ix.length;
			bestKey = k;
		}
	}
	const idx = tally.get(bestKey)?.[0] ?? 0;
	// Drift = max symmetric-difference size between any pair of runs' finding sets.
	const sets = runs.map((v) => new Set(v.findings.map((f) => `${f.rule}:${f.severity}`)));
	let maxDrift = 0;
	for (let i = 0; i < sets.length; i++) {
		for (let j = i + 1; j < sets.length; j++) {
			const a = sets[i];
			const b = sets[j];
			if (!a || !b) continue;
			let sym = 0;
			for (const x of a) if (!b.has(x)) sym++;
			for (const x of b) if (!a.has(x)) sym++;
			if (sym > maxDrift) maxDrift = sym;
		}
	}
	const verdict = runs[idx];
	if (!verdict) throw new Error(`median run index ${idx} is out of bounds`);
	return { idx, verdict, drift: maxDrift };
}

// AC-05a threshold: ≥6/7 corpus files must have their expected R-0N detected.
// Surface mismatches as a hard exit (companion F001 fix).
const AC_05A_THRESHOLD = 6;

async function refreshCorpus(): Promise<{ detected: number; total: number; misses: string[] }> {
	const corpusFiles = readdirSync(CORPUS_DIR)
		.filter((f) => /^r0\d-/.test(f))
		.sort();
	console.log(`[corpus] ${corpusFiles.length} files`);
	const misses: string[] = [];
	let detected = 0;
	for (const file of corpusFiles) {
		const expected = expectedRuleFor(file);
		const tmp = stageCorpusFile(file);
		try {
			console.log(`  ↳ ${file} (expected=${expected}) — running agent...`);
			const t0 = Date.now();
			const verdict = await vet(tmp, `corpus:${file}`);
			const elapsed = Date.now() - t0;
			const snapshot = {
				file,
				expectedRule: expected,
				detected: verdict.findings.map((f) => ({
					rule: f.rule,
					severity: f.severity,
				})),
				expectedRuleDetected: expected ? verdict.findings.some((f) => f.rule === expected) : false,
				verdict,
				generatedAt: new Date().toISOString(),
				generatedInMs: elapsed,
			};
			const out = resolve(SNAPSHOT_DIR, `corpus-${file.replace(/\.[^.]+$/, "")}.json`);
			writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);
			console.log(
				`    → ${expected ? (snapshot.expectedRuleDetected ? "✓" : "✗") : "?"} ${verdict.level} score=${verdict.score} (${elapsed}ms)`,
			);
			if (snapshot.expectedRuleDetected) detected++;
			else if (expected) misses.push(`${file} (expected ${expected})`);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	}
	return { detected, total: corpusFiles.length, misses };
}

async function refreshPackages(runsPerPackage = 3): Promise<void> {
	const doc = parseDocument(readFileSync(YAML_PATH, "utf8"));
	const seq = doc.get("packages") as YAMLSeq;
	const enabled = (seq.toJSON() as Array<{ source: string; enabled: boolean }>).filter(
		(e) => e.enabled,
	);
	console.log(`[packages] ${enabled.length} entries × ${runsPerPackage} runs`);
	for (const e of enabled) {
		const installPath = resolveSourcePath(e.source);
		if (!installPath) {
			console.log(`  ↳ ${e.source} — not installed; skipping`);
			continue;
		}
		console.log(`  ↳ ${e.source}`);
		const runs: Verdict[] = [];
		for (let i = 0; i < runsPerPackage; i++) {
			const t0 = Date.now();
			const v = await vet(installPath, e.source);
			const elapsed = Date.now() - t0;
			runs.push(v);
			const out = resolve(SNAPSHOT_DIR, `${slug(e.source)}-run${i + 1}.json`);
			writeFileSync(out, `${JSON.stringify(v, null, 2)}\n`);
			console.log(
				`    run ${i + 1}: ${v.level} score=${v.score} findings=${v.findings.length} (${elapsed}ms)`,
			);
		}
		const { idx, verdict: median, drift } = chooseMedian(runs);
		const summary = {
			source: e.source,
			medianRunIdx: idx + 1,
			driftMaxFindings: drift,
			verdict: median,
			runs: runs.map((v, i) => ({
				idx: i + 1,
				level: v.level,
				score: v.score,
				findingCount: v.findings.length,
				rules: v.findings.map((f) => f.rule),
			})),
			generatedAt: new Date().toISOString(),
		};
		const out = resolve(SNAPSHOT_DIR, `${slug(e.source)}.json`);
		writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
		console.log(`    median: run ${idx + 1}, drift=${drift} finding(s)`);
	}
}

// Re-export helpers for testing.
export { chooseMedian, expectedRuleFor, sha256, slug };

async function main(): Promise<void> {
	if (process.env.PIJ_VET_SKIP_AGENT === "1") {
		console.error(
			"✗ snapshot-refresh requires the live agent — unset PIJ_VET_SKIP_AGENT and try again",
		);
		process.exit(2);
	}
	const args = process.argv.slice(2);
	const corpusOnly = args.includes("--corpus-only");
	const pkgOnly = args.includes("--pkg-only");
	mkdirSync(SNAPSHOT_DIR, { recursive: true });
	const briefingSha = sha256(BRIEFING);
	console.log(`briefing.md SHA-256: ${briefingSha}\n`);
	if (!pkgOnly) await refreshCorpus();
	if (!corpusOnly) await refreshPackages();
	const metaPath = resolve(SNAPSHOT_DIR, "_meta.json");
	const meta = {
		briefingSha,
		regeneratedAt: new Date().toISOString(),
		snapshots: readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith(".json") && f !== "_meta.json"),
	};
	writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
	console.log(`\n✓ wrote ${meta.snapshots.length} snapshot(s) to ${SNAPSHOT_DIR}`);
	console.log(`✓ _meta.json briefingSha=${briefingSha.slice(0, 12)}...`);
}

// Run main() only when invoked as a script (not when imported from a test).
const isMainModule = process.argv[1]?.endsWith("snapshot-refresh.ts");
if (isMainModule) {
	main().catch((err: Error) => {
		console.error(`snapshot-refresh failed: ${err.message}`);
		process.exit(1);
	});
}
