// pij-orchestration — the TARGET arm of the PA capability boundary (plan 084).
//
// The gate this sits beside refuses by PARTY (`role === "pa"`) when the real
// rule is about the TARGET of the action. Refusing a PA `watchdog watch` in
// general is correct; refusing it `watchdog watch <its own parent>` is the
// defect `#95` reports — the PA is refused the one action it is uniquely
// positioned to take, over the one seat it is defined relative to.
//
// SAY "PARENT", NEVER "PRIME". These are DIFFERENT CONCEPTS in this codebase
// and the refusal text conflated them: `prime` is a separate stored flag
// (`SessionDescriptor.prime`, projected as role `"prime"`), while this gate
// keys on `effectiveParent` — and a PA's parent NEED NOT BE A PRIME. Caught on
// 2026-08-05 by review of a real refusal this file emitted, which told a PA its
// parent was "its own prime" when that seat was in fact role `pm` with
// `prime: false`. The message asserted something FALSE in the very artefact
// offered as evidence that the gate was working. A boundary that misnames the
// relationship it enforces teaches the reader the wrong model of the platform,
// and the reader here is a seat trying to work out what it may do.
//
// PURE, by construction: no ports, no DI, no registry. The caller descriptor
// and the target id are everything the decision needs, which is what lets the
// HANDLER own this check while the gate stays a zero-read table lookup
// (`core/cli.test.ts` asserts `reads === 0` on the hot path).
//
// PARENT MEANS `effectiveParent`, AND THIS FILE MUST NEVER REIMPLEMENT IT.
// `effectiveParent(d) = d.parentId !== undefined ? d.parentId : (d.spawnedBy ?? null)`
// (`core/tree.ts:15`). A PA its parent SPAWNED but never explicitly linked has
// no raw `parentId` at all, so a predicate keyed on the raw field would refuse
// that PA permission over its actual parent — rebuilding `#95` inside `#95`'s
// own fix. Importing the shared helper is deliberate: a local copy would drift
// from the notion `list`, `node show`, and `pij state` all project, and the
// whole point of this predicate is that it agrees with what an operator can SEE.

import { effectiveParent } from "../tree.js";
import type { SessionDescriptor, SessionId } from "../types.js";

/** Why a target was permitted — carried so a caller can log or render WHICH
 *  relationship justified the action rather than just that something did. */
export type PaTargetRelation = "self" | "parent";

export type PaTargetDecision =
	| { readonly kind: "allow"; readonly relation: PaTargetRelation }
	| { readonly kind: "refuse"; readonly why: string };

const allow = (relation: PaTargetRelation): PaTargetDecision => ({ kind: "allow", relation });
const refuse = (why: string): PaTargetDecision => ({ kind: "refuse", why });

/** May this PA act on this target?
 *
 * FAILS CLOSED on every target question — unresolvable target, no parent,
 * someone else's seat all REFUSE. That polarity is deliberate and is the
 * opposite of the gate's caller-identity behaviour, which fails OPEN: refusing
 * a caller we cannot identify would break every unregistered context (tests,
 * tooling, first run) to constrain a seat that is always registered by
 * construction, whereas a target we cannot resolve is a question we genuinely
 * cannot answer, and answering "permitted" to an unanswerable permission
 * question is how a boundary becomes decorative.
 *
 * Takes the caller's OWN descriptor, never the target's: the relationship is a
 * property of the asker, and reading the target's descriptor to decide would
 * let a seat's permissions change when someone else's record changed.
 */
export function paTargetDecision(
	caller: SessionDescriptor,
	targetId: SessionId | null | undefined,
): PaTargetDecision {
	if (targetId === undefined || targetId === null || targetId.trim() === "") {
		return refuse(
			"the target seat could not be resolved, and an unresolvable target cannot be checked against your lineage",
		);
	}
	if (targetId === caller.id) return allow("self");
	const parent = effectiveParent(caller);
	if (parent === null) {
		return refuse(
			`you have no parent to act on: '${caller.id}' is an explicit root, so '${targetId}' cannot be your parent — link it with 'pij link ${caller.id} --parent <parent> --role pa'`,
		);
	}
	if (targetId === parent) return allow("parent");
	return refuse(
		`'${targetId}' is neither you nor your parent — a PA may act only on ITSELF ('${caller.id}') or its own parent ('${parent}'), so ask '${parent}' to do it or relay the request`,
	);
}
