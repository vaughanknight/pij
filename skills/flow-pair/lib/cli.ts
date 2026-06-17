#!/usr/bin/env -S npx tsx

// skills/flow-pair/lib/cli.ts
// Thin flow-pair CLI entrypoint.
// The flow-pair SKILL.md shells out to this — it is NEVER imported into pi (P2 boundary, Finding 08).
// P2: zero @earendil-works/* imports | P7: .js ESM relative imports
// Exit codes: 0=success  1=usage error  2=runtime error

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveRepoId, nodeGitDeps } from "./identity.js";
import { LedgerWriter, nodeLedgerDeps } from "./ledger.js";
import { LEDGER_ROOT, resolveRunDir } from "./paths.js";

// ─── Constants (P5) ──────────────────────────────────────────────────────────

const SUBCOMMANDS = ["start", "dispatch", "observe", "review", "fix", "accept", "ledger"] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

const HELP = `\
flow-pair — orchestrator/worker delegation CLI

Usage:
  flow-pair <subcommand> [options]

Subcommands:
  start      Start a new flow-pair run          (Phase 1 functional)
  dispatch   Dispatch a worker packet           [stub — Phase 4]
  observe    Capture diffs after execution      [stub — Phase 5]
  review     Run review rubric on output        [stub — Phase 6]
  fix        Generate a fix packet              [stub — Phase 6]
  accept     Accept and close a run             [stub — Phase 7]
  ledger     Print run.json for --run-id                (Phase 2)

Options:
  --json             Emit structured JSON to stdout
  --repo <path>      Target repo path (start; default: cwd)
  --ledger-root <p>  Ledger root directory (start; default: .flow-pair)
  --run-id <id>      Run id (observe/review/fix/accept/ledger)
  --packet <path>    Packet file path (dispatch)
  --delegation <id>  Delegation id (review/accept)
  --review <id>      Review id (fix)
  --help             Show this help

Exit codes: 0=success  1=usage error  2=runtime error
`;

// ─── Argument parser ──────────────────────────────────────────────────────────

interface ParsedArgs {
	subcommand: string | undefined;
	flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
	const flags: Record<string, string | boolean> = {};
	let subcommand: string | undefined;
	let i = 0;

	while (i < argv.length) {
		const arg = argv[i];
		if (arg === undefined) break;

		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("--")) {
				flags[key] = next;
				i += 2;
			} else {
				flags[key] = true;
				i++;
			}
		} else if (!arg.startsWith("-") && subcommand === undefined) {
			subcommand = arg;
			i++;
		} else {
			i++;
		}
	}

	return { subcommand, flags };
}

// ─── Subcommand handlers ──────────────────────────────────────────────────────

function runStart(flags: Record<string, string | boolean>): Record<string, unknown> {
	const repoPath = typeof flags.repo === "string" ? flags.repo : process.cwd();
	const ledgerRoot = typeof flags["ledger-root"] === "string" ? flags["ledger-root"] : LEDGER_ROOT;

	const idResult = deriveRepoId(repoPath, nodeGitDeps());
	if (!idResult.ok) {
		throw new Error(idResult.error ?? "failed to derive repo id");
	}

	const writer = new LedgerWriter(ledgerRoot, nodeLedgerDeps());
	const result = writer.createRun(idResult.repoId);
	if (!result.ok || !result.run) {
		throw new Error(result.error ?? "failed to create run");
	}
	const { run } = result;
	return { ok: true, repoId: run.repoId, runId: run.runId, runDir: run.runDir };
}

function runLedger(flags: Record<string, string | boolean>): Record<string, unknown> {
	const ledgerRoot = typeof flags["ledger-root"] === "string" ? flags["ledger-root"] : LEDGER_ROOT;
	const runId = typeof flags["run-id"] === "string" ? flags["run-id"] : undefined;

	if (!runId) {
		throw new Error("--run-id is required for ledger subcommand");
	}

	const dirResult = resolveRunDir(ledgerRoot, runId);
	if (!dirResult.ok) {
		throw new Error(dirResult.error ?? "invalid run id");
	}

	const runJsonPath = join(dirResult.runDir, "run.json");
	if (!existsSync(runJsonPath)) {
		throw new Error(`run not found: ${runId}`);
	}

	return JSON.parse(readFileSync(runJsonPath, "utf8")) as Record<string, unknown>;
}

function runStub(cmd: Subcommand): Record<string, unknown> {
	return { ok: true, subcommand: cmd, status: "stub — not yet implemented" };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function usageError(useJson: boolean, message: string): never {
	if (useJson) {
		process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
	} else {
		process.stderr.write(`${message}\n\n${HELP}`);
	}
	process.exit(1);
}

function main(): void {
	const argv = process.argv.slice(2);

	// Parse early so --json is known before any error path.
	const { subcommand, flags } = parseArgs(argv);
	const useJson = flags.json === true;

	if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
		process.stdout.write(HELP);
		process.exit(0);
	}

	if (subcommand === undefined) {
		usageError(useJson, "No subcommand given.");
	}

	if (!(SUBCOMMANDS as readonly string[]).includes(subcommand)) {
		usageError(useJson, `Unknown subcommand: "${subcommand}"`);
	}

	try {
		const cmd = subcommand as Subcommand;
		const out =
			cmd === "start" ? runStart(flags) : cmd === "ledger" ? runLedger(flags) : runStub(cmd);

		if (useJson) {
			process.stdout.write(`${JSON.stringify(out)}\n`);
		} else {
			for (const [k, v] of Object.entries(out)) {
				process.stdout.write(`${k}: ${String(v)}\n`);
			}
		}
		process.exit(0);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (useJson) {
			process.stderr.write(`${JSON.stringify({ ok: false, error: msg })}\n`);
		} else {
			process.stderr.write(`Error: ${msg}\n`);
		}
		process.exit(2);
	}
}

main();
