// pij-control-plane — pure model validation (T006).
//
// validateModel: ok when model is known (exact or fuzzy match), unknown when not.
// Never blocks — callers warn and continue; the spawn id is always returned.

import { closestModel, normalizeModelQuery } from "./match.js";
import type { ModelEntry } from "./registry.js";

export type ValidationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly unknown: true; readonly suggestion: string | null };

/**
 * Validate a model id against the known model list. Returns `ok` when:
 *   - model is empty/undefined (no --model flag — nothing to validate)
 *   - known list is empty (cannot validate, so never block)
 *   - model matches an entry by exact normalised id (case-insensitive)
 * Returns `{ ok: false, unknown: true, suggestion }` otherwise. Suggestion is
 * the closest known id, or null if nothing is close.
 */
export function validateModel(model: string, known: readonly ModelEntry[]): ValidationResult {
	if (!model || known.length === 0) return { ok: true };
	const norm = normalizeModelQuery(model);
	const exactMatch = known.find((e) => normalizeModelQuery(e.id) === norm);
	if (exactMatch) return { ok: true };
	const closest = closestModel(model, known);
	return { ok: false, unknown: true, suggestion: closest?.id ?? null };
}
