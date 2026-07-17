// pij platform — fs AssignmentStorePort adapter (plan 054, T006).
//
// Layout: `<pijHome>/assignments/<id>.json` — one record per assignment, kept
// strictly below `assignments/` (Finding 01: top-level PIJ_HOME/*.json belongs
// exclusively to FsRegistry and would surface as a phantom peer descriptor).
// `write` is atomic create-or-replace via writeJsonAtomic (last-writer-wins,
// temp staged as a sibling and always cleaned). Reads are guard-validated
// null-on-fail (focus-store precedent): missing, corrupt, foreign, or
// unversioned bytes never escape as an Assignment.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AssignmentStorePort } from "../core/platform/ports.js";
import { type Assignment, isAssignment } from "../core/platform/types.js";
import { err, ok, type Result } from "../core/types.js";
import { writeJsonAtomic } from "./atomic-file.js";

/** Filename-safe id law (focus-store name-guard precedent): the id becomes a
 *  basename, so separators or dot-leading names must never reach the fs. */
const ASSIGNMENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class FsAssignmentStore implements AssignmentStorePort {
	constructor(private readonly pijHome: string) {}

	private assignmentsDir(): string {
		return join(this.pijHome, "assignments");
	}

	private pathFor(id: string): string {
		return join(this.assignmentsDir(), `${id}.json`);
	}

	write(assignment: Assignment): Result<void> {
		if (!ASSIGNMENT_ID_RE.test(assignment.id)) {
			return err(
				"E-ARG",
				`invalid assignment id '${assignment.id}' (use letters, digits, dot, underscore, or hyphen)`,
			);
		}
		// Review 001 F5: a type-valid record the JSON round-trip poisons
		// (states: [NaN] → null) would serialize fine here and then be rejected
		// by every later read — reject it at the write boundary instead, in
		// lockstep with FakeAssignmentStore.write.
		try {
			const roundTripped: unknown = JSON.parse(JSON.stringify(assignment));
			if (!isAssignment(roundTripped)) {
				return err(
					"E-ARG",
					`assignment '${assignment.id}' fails the record contract after JSON round-trip (non-finite state ref?)`,
				);
			}
		} catch (error) {
			return err(
				"E-ARG",
				`assignment '${assignment.id}' is not JSON-serializable: ${String(error)}`,
			);
		}
		try {
			writeJsonAtomic(this.pathFor(assignment.id), assignment);
			return ok(undefined);
		} catch (error) {
			return err("E-NOREG", `cannot write assignment '${assignment.id}': ${String(error)}`);
		}
	}

	read(id: string): Assignment | null {
		if (!ASSIGNMENT_ID_RE.test(id)) return null;
		return this.readFile(this.pathFor(id), id);
	}

	list(): Assignment[] {
		let names: string[];
		try {
			names = readdirSync(this.assignmentsDir());
		} catch {
			return []; // fresh home: no assignments dir yet
		}
		const out: Assignment[] = [];
		for (const name of names) {
			if (!name.endsWith(".json")) continue;
			const stem = name.slice(0, -".json".length);
			const record = this.readFile(join(this.assignmentsDir(), name), stem);
			if (record) out.push(record);
		}
		out.sort((left, right) => left.id.localeCompare(right.id));
		return out;
	}

	listByNode(nodeId: string): Assignment[] {
		return this.list().filter((record) => record.nodeId === nodeId);
	}

	private readFile(path: string, expectedId: string): Assignment | null {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			// Filename stem is the identity authority (project-store parity): a
			// planted record whose internal id disagrees with its basename is
			// foreign, and skipping it keeps list()'s id sort total.
			return isAssignment(parsed) && parsed.id === expectedId ? parsed : null;
		} catch {
			return null; // missing or corrupt bytes are "no record"
		}
	}
}
