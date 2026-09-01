import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	DaemonRefusalError,
	decodeEnvelope,
	decodeStreamLine,
	PijNoDaemonError,
	PijWireSkewError,
	parseProcessStart,
} from "./daemon-wire.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIRE = resolve(HERE, "../../../../crates/testkit/fixtures/wire");
const fixture = (name: string): string => readFileSync(resolve(WIRE, name), "utf8");

describe("pij-rs envelope", () => {
	it("decodes the recorded v1 health response", () => {
		const envelope = decodeEnvelope<{
			status: string;
			build: string;
			machine: string;
		}>(fixture("health-v1.json"));
		expect(envelope).toMatchObject({
			ok: true,
			command: "pij ping",
			v: 1,
			data: { status: "healthy", build: "pij-rs 0.1.0", machine: "workstation" },
		});
	});

	it("refuses an unsupported envelope whole with structured versions", () => {
		try {
			decodeEnvelope(fixture("health-future.json"));
			throw new Error("future envelope was accepted");
		} catch (error) {
			expect(error).toBeInstanceOf(PijWireSkewError);
			expect(error).toMatchObject({ code: "PIJ_WIRE_SKEW", found: 2, supported: 1 });
		}
	});

	it("preserves cursor-reset refusals as structured daemon errors", () => {
		expect(() =>
			decodeEnvelope(
				JSON.stringify({
					ok: false,
					command: "pij events",
					v: 1,
					error: "cursor_reset",
					meta: "cursor 7 is beyond spine 2",
				}),
			),
		).toThrow(DaemonRefusalError);
		try {
			decodeEnvelope(
				JSON.stringify({
					ok: false,
					command: "pij events",
					v: 1,
					error: "cursor_reset",
					meta: "cursor 7 is beyond spine 2",
				}),
			);
		} catch (error) {
			expect(error).toMatchObject({
				command: "pij events",
				kind: "cursor_reset",
				message: "cursor 7 is beyond spine 2",
			});
		}
	});

	it("keeps no-daemon address and state directory as fields", () => {
		const error = new PijNoDaemonError("127.0.0.1:7461", "/tmp/pij-rs");
		expect(error).toMatchObject({
			code: "PIJ_NO_DAEMON",
			addr: "127.0.0.1:7461",
			stateDir: "/tmp/pij-rs",
		});
	});
});

describe("pij-rs event stream", () => {
	it("forwards an unknown event and continues to the pushed turn", () => {
		const decoded = fixture("events-v1.ndjson").trim().split("\n").map(decodeStreamLine);
		expect(decoded[0]).toEqual({ hello: true, v: 1, build: "pij-rs 0.1.0" });
		expect(decoded[1]).toMatchObject({
			cursor: 41,
			event: { kind: "future.kind", payload: '{"opaque":true}' },
		});
		expect(decoded[2]).toMatchObject({
			cursor: 42,
			event: { kind: "message.pushed", seat: "pij-test-seat" },
		});
	});
});

describe("process identity", () => {
	it("packs C-locale ps lstart exactly like pij-rs ProcLiveness", () => {
		expect(parseProcessStart("Sat Aug 29 10:30:52 2026")).toBe(20260829103052);
		expect(parseProcessStart("Wed Jan  8 00:20:51 2026")).toBe(20260108002051);
	});
});
