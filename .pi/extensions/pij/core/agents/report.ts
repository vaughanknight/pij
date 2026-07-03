// Synchronous report validation (Plan 029 Phase 3, T002 / AC-15).
//
// A spawned peer signals "done" by running `pij agent report --json '<payload>'`.
// The report is validated SYNCHRONOUSLY at the CLI (workshop 003 OQ2 — no daemon
// re-prompt loop): a valid report is pushed to the spawner; an invalid one is
// rejected with the AJV errors on stderr and NOTHING delivered, so the peer can
// fix + re-run. This wraps minih's `validateOutput` — the same AJV-2020 validator
// the one-shot `pij agent run` path uses — so the spawn surface and the run
// surface accept byte-identical reports.
//
// minih's `validateOutput(schemaPath, outputPath)` takes two FILE paths (it
// pre-checks missing/empty/invalid-JSON files), so this helper materialises the
// payload + schema to short-lived temp files, validates, and cleans them up.
// Pure otherwise (no daemon/tmux imports — the boundary sensor guards that).

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateOutput } from "minih/runner";

/** The result of validating a report payload. `valid` gates delivery; `errors`
 *  are minih/AJV's lines surfaced verbatim (T007 prints them on stderr). */
export interface ReportValidation {
	readonly valid: boolean;
	readonly errors: string[];
}

/**
 * Validate a report `payload` against a pack's output schema (the raw JSON string
 * of its `output-schema.json`). No schema ⇒ pass-through `{valid:true}` (a pack
 * without an `output-schema.json` accepts any object, mirroring `pij agent run`).
 * Delegates to minih's `validateOutput`; AJV error lines are returned unmodified.
 * Never throws — a malformed schema or unserialisable payload becomes a `{valid:
 * false}` with an explanatory error.
 */
export function validateReport(payload: unknown, schemaJson?: string): ReportValidation {
	if (schemaJson === undefined) return { valid: true, errors: [] };

	let outputContent: string;
	try {
		outputContent = JSON.stringify(payload);
	} catch (e) {
		return {
			valid: false,
			errors: [`report payload is not serialisable JSON: ${(e as Error).message}`],
		};
	}

	const scratch = mkdtempSync(join(tmpdir(), "pij-report-"));
	const schemaPath = join(scratch, `schema-${randomUUID()}.json`);
	const outputPath = join(scratch, `report-${randomUUID()}.json`);
	try {
		writeFileSync(schemaPath, schemaJson);
		// `undefined`/functions stringify to `undefined` → write "" so minih reports
		// the empty-output error rather than throwing on a non-string write.
		writeFileSync(outputPath, outputContent ?? "");
		const result = validateOutput(schemaPath, outputPath);
		return { valid: result.valid, errors: result.errors };
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}
