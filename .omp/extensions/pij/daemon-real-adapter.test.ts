// GATE (plan 071): the Daemon must work with the REAL `DaemonTmux` adapter.
//
// Why this file exists. On 2026-07-25 the daemon's ports wrapper was written as
// `{...rawPorts, sendText}`. Spreading copies OWN enumerable properties only —
// and `DaemonTmux` is a class, so all of its methods live on the prototype. The
// wrapper therefore produced an object with exactly one method, `sendText`, and
// EVERY tick died on `this.ports.now is not a function`. The fleet was down ~15
// minutes.
//
// The whole test suite stayed green through it, because every fake in the suite
// is a PLAIN OBJECT whose methods are own properties — the one shape that cannot
// reproduce the bug. Green meant nothing.
//
// So this file exercises a real `DaemonTmux` INSTANCE through the same wrapper.
//
// It must never touch the LIVE tmux server: `refreshPaneSignals` would attach a
// `pipe-pane` tap to every real pane on the machine, i.e. to the operator's own
// fleet. `ScanFreeDaemonTmux` below subclasses the real adapter and overrides
// ONLY `listPanes`, so nothing is enumerated and nothing is tapped. Subclassing
// also deepens the prototype chain, which makes the wrapper assertion strictly
// stronger: `now` now has to resolve two prototypes up.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsChannel } from "./adapters/channel.js";
import { DaemonTmux } from "./adapters/daemon-tmux.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import type { DaemonPorts } from "./core/daemon/loop.js";
import type { PaneListing } from "./core/daemon/pane-signals.js";
import { Daemon } from "./daemon.js";

/** The real adapter, with pane ENUMERATION disabled so no live pane is touched.
 *  Everything else — including every method the wrapper must preserve — is
 *  inherited, and inherited two levels up. */
class ScanFreeDaemonTmux extends DaemonTmux {
	override listPanes(): readonly PaneListing[] {
		return [];
	}
}

let home: string;
let logs: string[];

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-real-adapter-"));
	logs = [];
});
afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

/** Every method the daemon loop may call on its ports. A wrapper that drops any
 *  of these is the 2026-07-25 outage. */
const REQUIRED_PORT_METHODS = [
	"capturePane",
	"isPaneDead",
	"sendText",
	"sendKey",
	"killPane",
	"listTranscripts",
	"home",
	"now",
	"isAlive",
] as const satisfies readonly (keyof DaemonPorts)[];

describe("the Daemon over the REAL DaemonTmux class instance", () => {
	it("PROVES the shape that hid the bug: DaemonTmux's methods are on the prototype, not own properties", () => {
		const adapter = new ScanFreeDaemonTmux();

		// This is the entire reason plain-object fakes could not catch it.
		expect(Object.hasOwn(adapter, "now")).toBe(false);
		// Two prototypes up, in fact — the wrapper must walk the whole chain.
		expect(Object.hasOwn(Object.getPrototypeOf(adapter), "now")).toBe(false);
		expect(typeof adapter.now).toBe("function");
		// A naive spread loses them — asserted here so the failure mode stays
		// legible to whoever reads this test next.
		const spread = { ...adapter } as Partial<DaemonPorts>;
		expect(spread.now).toBeUndefined();
	});

	it("keeps every port method callable after the daemon wraps a real adapter", () => {
		// Constructing the Daemon applies the wrapper; reaching into it is the only
		// way to assert on the wrapped object itself.
		const daemon = new Daemon(
			home,
			new ScanFreeDaemonTmux(),
			new FsRegistry(home),
			new FsChannel(home),
			(line) => logs.push(line),
		);
		const wrapped = (daemon as unknown as { ports: DaemonPorts }).ports;

		for (const method of REQUIRED_PORT_METHODS) {
			expect(typeof wrapped[method], `ports.${method} must survive the wrapper`).toBe("function");
		}
	});

	it("ticks without throwing — the exact assertion the outage would have failed", () => {
		const daemon = new Daemon(
			home,
			new ScanFreeDaemonTmux(),
			new FsRegistry(home),
			new FsChannel(home),
			(line) => logs.push(line),
		);

		// `ports.now is not a function` was thrown from the FIRST line of tick().
		expect(() => daemon.tick()).not.toThrow();
		expect(() => daemon.deliverPass()).not.toThrow();
		expect(logs.some((line) => line.startsWith("tick: "))).toBe(true);

		daemon.dispose();
	});

	it("the wrapper's own sendText override still delegates to the real adapter's method", () => {
		const adapter = new ScanFreeDaemonTmux();
		const daemon = new Daemon(home, adapter, new FsRegistry(home), new FsChannel(home), () => {});
		const wrapped = (daemon as unknown as { ports: DaemonPorts }).ports;

		// The override is the ONE own property the wrapper adds; everything else
		// must still resolve through the prototype chain to the real adapter.
		expect(Object.hasOwn(wrapped, "sendText")).toBe(true);
		expect(wrapped.now()).toBeGreaterThan(0);
		expect(typeof wrapped.home()).toBe("string");
		expect(wrapped.isAlive(process.pid)).toBe(true);
	});

	it("degrades honestly with no tmux: a missing pane reads empty, never throws", () => {
		const adapter = new ScanFreeDaemonTmux();
		expect(() => adapter.capturePane("%99999")).not.toThrow();
		expect(adapter.capturePane("%99999")).toBe("");
		expect(() => adapter.listTranscripts(join(home, "does-not-exist"))).not.toThrow();
		expect(adapter.listTranscripts(join(home, "does-not-exist"))).toEqual([]);
	});
});
