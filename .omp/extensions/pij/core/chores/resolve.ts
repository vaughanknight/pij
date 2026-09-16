import { type Chore, type ChoreScopeSource, isChoreScope } from "./types.js";

export interface ChoreResolutionIssue {
	readonly scope: Chore["scope"];
	readonly name: "<roster>";
	readonly reason: string;
}

export interface ResolvedChores {
	readonly chores: readonly Chore[];
	readonly issues: readonly ChoreResolutionIssue[];
}

export type ChoreReferenceResult =
	| { readonly ok: true; readonly chore: Chore }
	| { readonly ok: false; readonly code: "E-ARG" | "E-NOID" | "E-AMBIG"; readonly message: string };

export function choreKey(chore: Pick<Chore, "scope" | "name">): string {
	return `${chore.scope}:${chore.name}`;
}

export function stateKey(chore: Pick<Chore, "scope" | "name">, worktreeRoot: string): string {
	return chore.scope === "repo" ? `${choreKey(chore)}@${worktreeRoot}` : choreKey(chore);
}

export function resolveChores(sources: readonly ChoreScopeSource[]): ResolvedChores {
	const chores: Chore[] = [];
	const issues: ChoreResolutionIssue[] = [];

	for (const source of sources) {
		if (source.status === "malformed") {
			issues.push({ scope: source.scope, name: "<roster>", reason: "malformed roster" });
			continue;
		}
		if (source.status === "unavailable") {
			issues.push({
				scope: source.scope,
				name: "<roster>",
				reason: source.reason ?? "roster unavailable",
			});
			continue;
		}
		if (source.status === "missing") continue;
		chores.push(...[...source.chores].sort((left, right) => left.name.localeCompare(right.name)));
	}

	return { chores, issues };
}

export function resolveChoreReference(
	reference: string,
	chores: readonly Chore[],
): ChoreReferenceResult {
	const separator = reference.indexOf(":");
	if (separator !== -1) {
		const scope = reference.slice(0, separator);
		const name = reference.slice(separator + 1);
		if (!isChoreScope(scope) || name === "") {
			return { ok: false, code: "E-ARG", message: `invalid chore reference '${reference}'` };
		}
		const match = chores.find((chore) => chore.scope === scope && chore.name === name);
		return match
			? { ok: true, chore: match }
			: { ok: false, code: "E-NOID", message: `no chore '${reference}'` };
	}

	const matches = chores.filter((chore) => chore.name === reference);
	if (matches.length === 0) {
		return { ok: false, code: "E-NOID", message: `no chore '${reference}'` };
	}
	if (matches.length > 1) {
		const keys = matches.map(choreKey).sort();
		return {
			ok: false,
			code: "E-AMBIG",
			message: `chore '${reference}' is ambiguous: ${keys.join(", ")}`,
		};
	}
	const match = matches[0];
	return match
		? { ok: true, chore: match }
		: { ok: false, code: "E-NOID", message: `no chore '${reference}'` };
}
