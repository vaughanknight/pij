import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REPORT_COMMAND, renderPeerPacket } from "./peer-packet.js";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pij-packet-"));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function writePack(files: Record<string, string>): void {
	for (const [name, content] of Object.entries(files)) {
		writeFileSync(join(dir, name), content);
	}
}

describe("renderPeerPacket", () => {
	it("includes the prompt body (frontmatter stripped), instructions, params, report command, and schema", () => {
		writePack({
			"prompt.md":
				"---\ndescription: Search the graph.\nmodel: claude-sonnet-4-6\n---\nYou answer questions about a codebase.",
			"instructions.md": "# Operating instructions\n\nAlways cd into $PIJ_AGENT_CWD first.",
			"output-schema.json": '{\n  "type": "object",\n  "required": ["summary"]\n}',
		});
		const packet = renderPeerPacket(
			{ slug: "flowspace-search", dir },
			{ query: "daemon stall", limit: 5 },
		);

		// prompt body, frontmatter removed
		expect(packet).toContain("You answer questions about a codebase.");
		expect(packet).not.toContain("description: Search the graph.");
		// instructions
		expect(packet).toContain("Always cd into $PIJ_AGENT_CWD first.");
		// coerced params (both key and value present)
		expect(packet).toContain("query");
		expect(packet).toContain("daemon stall");
		expect(packet).toContain("limit");
		expect(packet).toContain("5");
		// the LITERAL report command (KF-08 — weak models copy the named command)
		expect(packet).toContain(REPORT_COMMAND);
		expect(packet).toContain("pij agent report --json");
		// inlined output schema
		expect(packet).toContain('"required": ["summary"]');
	});

	it("names the slug in the packet header", () => {
		writePack({ "prompt.md": "---\ndescription: d.\n---\nBody." });
		const packet = renderPeerPacket({ slug: "my-agent", dir }, {});
		expect(packet).toContain("my-agent");
	});

	it("still names the literal report command when the pack has no output-schema", () => {
		writePack({ "prompt.md": "---\ndescription: d.\n---\nBody." });
		const packet = renderPeerPacket({ slug: "no-schema", dir }, {});
		expect(packet).toContain(REPORT_COMMAND);
		// no schema block fenced when absent
		expect(packet).not.toContain("```json");
	});

	it("omits the instructions section when instructions.md is absent", () => {
		writePack({ "prompt.md": "---\ndescription: d.\n---\nBody only." });
		const packet = renderPeerPacket({ slug: "bare", dir }, { q: "x" });
		expect(packet).toContain("Body only.");
		expect(packet).not.toContain("Operating instructions");
	});

	it("renders string param values without JSON quotes and non-strings as JSON", () => {
		writePack({ "prompt.md": "---\ndescription: d.\n---\nBody." });
		const packet = renderPeerPacket({ slug: "p", dir }, { q: "hello world", n: 42, flag: true });
		expect(packet).toContain("q: hello world");
		expect(packet).toContain("n: 42");
		expect(packet).toContain("flag: true");
	});
});
