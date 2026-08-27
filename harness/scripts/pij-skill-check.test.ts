import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SCRIPT = join(ROOT, "harness", "scripts", "pij-skill-check.sh");
const SOURCE_SKILL = join(ROOT, "skills", "pij");

let fixtureRoot: string;
let fixtureSkill: string;
let orchestratorPath: string;

beforeEach(() => {
	fixtureRoot = mkdtempSync(join(tmpdir(), "pij-skill-check-"));
	fixtureSkill = join(fixtureRoot, "nested", "skills", "pij");
	cpSync(SOURCE_SKILL, fixtureSkill, { recursive: true });
	const linkedGuide = join(fixtureRoot, "nested", "docs", "how", "pij-team-scaffold.md");
	mkdirSync(resolve(linkedGuide, ".."), { recursive: true });
	cpSync(join(ROOT, "docs", "how", "pij-team-scaffold.md"), linkedGuide);
	orchestratorPath = join(fixtureSkill, "references", "prime", "orchestrator.md");
});

afterEach(() => {
	rmSync(fixtureRoot, { recursive: true, force: true });
});

function editOrchestrator(from: string, to: string): void {
	const source = readFileSync(orchestratorPath, "utf8");
	if (!source.includes(from)) throw new Error(`fixture source missing: ${from}`);
	writeFileSync(orchestratorPath, source.replace(from, to));
}

function runCheck(): { status: number | null; output: string } {
	const result = spawnSync("bash", [SCRIPT], {
		cwd: ROOT,
		env: { ...process.env, PIJ_SKILL_ROOT: fixtureSkill },
		encoding: "utf8",
	});
	return {
		status: result.status,
		output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
	};
}

describe("pij-skill-check order assertions", () => {
	it("passes correct canonical order despite a backward human-preamble cross-reference", () => {
		expect(readFileSync(orchestratorPath, "utf8")).toContain(
			"after the human preamble checkpoint, before mutation",
		);

		const result = runCheck();

		expect(result.status, result.output).toBe(0);
		expect(result.output).toContain("orchestrator order: preamble");
	});

	it("fails when read-back remains present but moves after fleet confirmation", () => {
		editOrchestrator(
			"11. Read the selected profile back verbatim and confirm inline. After the human confirms the fleet, persist it in the plan roster.",
			"11. After the human confirms the fleet, persist it in the plan roster, then read it back verbatim and confirm inline before fleet creation.",
		);

		const result = runCheck();

		expect(result.status).toBe(1);
		expect(result.output).toContain("read-back precondition");
		expect(result.output).toContain("out of order");
	});

	it("rejects an inverted step 11 despite an in-section read-back decoy", () => {
		editOrchestrator(
			"Run these steps in order. A later step never retroactively satisfies an earlier one.",
			"Run these steps in order. A later step never retroactively satisfies an earlier one.\nStep 11 is where you read the profile back verbatim and confirm inline.",
		);
		editOrchestrator(
			"11. Read the selected profile back verbatim and confirm inline. After the human confirms the fleet, persist it in the plan roster.",
			"11. After the human confirms the fleet, persist it in the plan roster, then read the profile back verbatim and confirm inline.",
		);

		const result = runCheck();

		expect(result.status).toBe(1);
		expect(result.output).toContain("read-back precondition");
		expect(result.output).toContain("out of order");
	});

	it("fails when Build configuration moves read-back after fleet confirmation", () => {
		editOrchestrator(
			"Persist the pending choice and remain reachable; read it back verbatim and confirm inline before fleet creation (global invariant 9).",
			"Persist the pending choice and remain reachable; after the human confirms the fleet, persist the choice and read it back verbatim before creation (global invariant 9).",
		);

		const result = runCheck();

		expect(result.status).toBe(1);
		expect(result.output).toContain("orchestrator pair config: read-back before fleet creation");
		expect(result.output).toContain("missing");
	});

	it("rejects a Build configuration inversion despite a later literal decoy", () => {
		editOrchestrator(
			"Persist the pending choice and remain reachable; read it back verbatim and confirm inline before fleet creation (global invariant 9).",
			"Persist the pending choice and remain reachable; after the human confirms the fleet, persist the choice and read it back verbatim before creation (global invariant 9).",
		);
		editOrchestrator(
			"## Packaging and review law",
			"## Packaging and review law\n\nA summary may still say to read it back verbatim and confirm inline before fleet creation.",
		);

		const result = runCheck();

		expect(result.status).toBe(1);
		expect(result.output).toContain(
			"orchestrator pair config: read-back before fleet creation — missing in ## Build configuration",
		);
	});

	it("scopes pair order to Ordered entry instead of an outside fallback", () => {
		editOrchestrator(
			"11. Read the selected profile back verbatim and confirm inline. After the human confirms the fleet, persist it in the plan roster.",
			"11. Read the selected profile back verbatim and confirm inline. Once the human has confirmed the fleet, persist it in the plan roster.",
		);
		editOrchestrator(
			"Persist the pending choice and remain reachable; read it back verbatim and confirm inline before fleet creation (global invariant 9).",
			"Persist the pending choice and remain reachable; read it back verbatim and confirm inline before fleet creation (global invariant 9). After the human confirms the fleet, record the grant.",
		);

		const result = runCheck();

		expect(result.status).toBe(1);
		expect(result.output).toContain("orchestrator pair order: missing human confirmation marker");
		expect(result.output).not.toContain(
			"orchestrator pair order: coder override marker '--coder-model <confirmed>' is out of order",
		);
		expect(result.output).not.toContain(
			"orchestrator pair order: reviewer override marker '--reviewer-model <confirmed>' is out of order",
		);
		expect(result.output).not.toContain(
			"orchestrator pair order: phase delegation marker 'Delegate each whole phase' is out of order",
		);
	});

	it("still fails a genuinely out-of-order canonical journey", () => {
		editOrchestrator(
			"4. Invoke `/thesis` against the ask and nearest authoritative artifacts.\n5. Use the host skill mechanism.",
			"4. Use the host skill mechanism.\n5. Invoke `/thesis` against the ask and nearest authoritative artifacts.",
		);

		const result = runCheck();

		expect(result.status).toBe(1);
		expect(result.output).toContain("orchestrator order: real invocation");
		expect(result.output).toContain("out of order");
	});
});

describe("pij-skill-check prime-pointer placeholder handling (R5)", () => {
	it("accepts a bracketed link whose target is an angle-bracket <placeholder>", () => {
		editOrchestrator(
			"## Required status steps",
			"## Required status steps\n\nSee the [phase report](<path>) placeholder link.",
		);
		const result = runCheck();
		expect(result.status).toBe(0);
		expect(result.output).not.toContain("prime pointer:");
	});

	it("still fails a bracketed link whose target is a real missing path", () => {
		editOrchestrator(
			"## Required status steps",
			"## Required status steps\n\nSee the [gone](./does-not-exist.md) real broken link.",
		);
		const result = runCheck();
		expect(result.status).not.toBe(0);
		expect(result.output).toContain("does-not-exist.md");
	});

	it("fails a bracketed pointy link whose target is a real missing path", () => {
		editOrchestrator(
			"## Required status steps",
			"## Required status steps\n\nSee the [gone](<./does-not-exist.md>) pointy broken link.",
		);
		const result = runCheck();
		expect(result.status).not.toBe(0);
		expect(result.output).toContain("does-not-exist.md");
	});
});
