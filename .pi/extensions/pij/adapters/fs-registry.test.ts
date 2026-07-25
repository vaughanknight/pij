import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reattachIdentity, resolveStableIdentity } from "../core/binding.js";
import { deriveHarnessPijId } from "../core/discovery.js";
import { memorablePijIdCandidate } from "../core/memorable-id.js";
import type { SessionDescriptor } from "../core/types.js";
import { renameReplaceWithRetry } from "./atomic-file.js";
import { FsRegistry } from "./fs-registry.js";

const nodeRequire = createRequire(import.meta.url);
const TSX_CLI = nodeRequire.resolve("tsx/cli");
const REGISTRY_MODULE = pathToFileURL(join(import.meta.dirname, "fs-registry.ts")).href;

function descriptor(id: string): SessionDescriptor {
	return {
		id,
		role: "worker",
		folder: "/proj",
		dataDir: `/home/.pij/${id}`,
		eventsPath: `/home/.pij/${id}/events.ndjson`,
		pid: 4242,
		startedAt: "2026-06-16T00:00:00.000Z",
	};
}

function candidate(seed: string, attempt: number): string {
	const result = memorablePijIdCandidate(seed, attempt);
	if (!result.ok) throw new Error(result.message);
	return result.value;
}

async function waitUntil(check: () => boolean, timeoutMs = 10_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!check()) {
		if (Date.now() >= deadline) throw new Error("timed out waiting for allocation workers");
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

async function runAllocationRace(
	raceHome: string,
	harness: "pi" | "claude" | "copilot" | "codex",
	nativeId: string,
	seed: string,
	workers = 6,
): Promise<Array<{ ok: boolean; value?: { id: string }; code?: string; message?: string }>> {
	mkdirSync(raceHome, { recursive: true });
	const barrier = join(raceHome, "start");
	const script = join(raceHome, "allocate-worker.ts");
	writeFileSync(
		script,
		`import { existsSync, writeFileSync } from "node:fs";
import { FsRegistry } from ${JSON.stringify(REGISTRY_MODULE)};

const [home, harness, nativeId, seed, barrier, ready] = process.argv.slice(2);
if (!home || !harness || !nativeId || !seed || !barrier || !ready) process.exit(64);
if (harness !== "pi" && harness !== "claude" && harness !== "copilot" && harness !== "codex") process.exit(64);
writeFileSync(ready, "");
const sleeper = new Int32Array(new SharedArrayBuffer(4));
while (!existsSync(barrier)) Atomics.wait(sleeper, 0, 0, 5);
const result = new FsRegistry(home).allocateIdentity(harness, nativeId, seed);
process.stdout.write(JSON.stringify(result));
`,
	);

	const readyPaths = Array.from({ length: workers }, (_, index) =>
		join(raceHome, `ready-${index}`),
	);
	const outcomes = readyPaths.map(
		(ready) =>
			new Promise<{ ok: boolean; value?: { id: string }; code?: string; message?: string }>(
				(resolve, reject) => {
					const child = spawn(
						process.execPath,
						[TSX_CLI, script, raceHome, harness, nativeId, seed, barrier, ready],
						{
							stdio: ["ignore", "pipe", "pipe"],
						},
					);
					let stdout = "";
					let stderr = "";
					child.stdout.setEncoding("utf8");
					child.stderr.setEncoding("utf8");
					child.stdout.on("data", (chunk: string) => {
						stdout += chunk;
					});
					child.stderr.on("data", (chunk: string) => {
						stderr += chunk;
					});
					child.on("error", reject);
					child.on("exit", (code) => {
						if (code !== 0) {
							reject(new Error(`allocation worker exited ${code}: ${stderr}`));
							return;
						}
						resolve(JSON.parse(stdout) as { ok: boolean; value?: { id: string } });
					});
				},
			),
	);
	await waitUntil(() => readyPaths.every(existsSync));
	writeFileSync(barrier, "go");
	return Promise.all(outcomes);
}

describe("FsRegistry", () => {
	let home: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-reg-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("write → read/list returns the descriptor", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("alice"));
		expect(reg.read("alice")?.id).toBe("alice");
		expect(reg.list().map((d) => d.id)).toEqual(["alice"]);
	});

	it("retries transient Windows replace failures without weakening other platforms", () => {
		const delays: number[] = [];
		let attempts = 0;
		renameReplaceWithRetry("staged", "final", {
			platform: "win32",
			rename: () => {
				attempts += 1;
				if (attempts < 3) {
					const error = new Error("target temporarily locked") as NodeJS.ErrnoException;
					error.code = "EPERM";
					throw error;
				}
			},
			sleep: (delayMs) => delays.push(delayMs),
			retryDelaysMs: [5, 10, 20],
		});

		expect(attempts).toBe(3);
		expect(delays).toEqual([5, 10]);

		const permanent = new Error("not found") as NodeJS.ErrnoException;
		permanent.code = "ENOENT";
		expect(() =>
			renameReplaceWithRetry("staged", "final", {
				platform: "win32",
				rename: () => {
					throw permanent;
				},
				sleep: () => {
					throw new Error("must not retry");
				},
				retryDelaysMs: [5],
			}),
		).toThrow(permanent);
	});

	it("uses a unique temp path instead of clobbering the legacy pid temp name", () => {
		const legacyTmp = join(home, `alice.json.tmp-${process.pid}`);
		writeFileSync(legacyTmp, "sentinel");

		new FsRegistry(home).write(descriptor("alice"));

		expect(readFileSync(legacyTmp, "utf8")).toBe("sentinel");
		expect(new FsRegistry(home).read("alice")?.id).toBe("alice");
	});

	it.runIf(process.platform === "win32")(
		"retries atomic replacement while Windows temporarily denies delete sharing",
		{ timeout: 10_000 },
		async () => {
			const registry = new FsRegistry(home);
			registry.write(descriptor("alice"));
			const target = join(home, "alice.json");
			const ready = join(home, "lock-ready");
			const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
			const powershell = join(
				systemRoot,
				"System32",
				"WindowsPowerShell",
				"v1.0",
				"powershell.exe",
			);
			const lockScriptPath = join(home, "hold-lock.ps1");
			writeFileSync(
				lockScriptPath,
				[
					"param([string]$TargetPath, [string]$ReadyPath)",
					"$stream = [IO.File]::Open($TargetPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)",
					"try {",
					"  [IO.File]::WriteAllText($ReadyPath, 'ready')",
					"  Start-Sleep -Milliseconds 250",
					"} finally {",
					"  $stream.Dispose()",
					"}",
				].join("\n"),
			);
			const child = spawn(
				powershell,
				[
					"-NoProfile",
					"-NonInteractive",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
					lockScriptPath,
					target,
					ready,
				],
				{ stdio: ["ignore", "ignore", "pipe"] },
			);
			let stderr = "";
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk;
			});
			const completed = new Promise<void>((resolve, reject) => {
				child.on("error", reject);
				child.on("close", (code) => {
					code === 0 ? resolve() : reject(new Error(`lock holder exited ${code}: ${stderr}`));
				});
			});

			await waitUntil(() => existsSync(ready));
			expect(() => registry.write({ ...descriptor("alice"), state: "working" })).not.toThrow();
			await completed;
			expect(registry.read("alice")?.state).toBe("working");
		},
	);

	it("claim creates once and returns the existing descriptor to concurrent claimers", () => {
		const first = new FsRegistry(home).claim(descriptor("stable"));
		expect(first).toMatchObject({ ok: true, value: { kind: "claimed" } });

		const competing = { ...descriptor("stable"), pid: 9999 };
		const second = new FsRegistry(home).claim(competing);
		expect(second).toMatchObject({
			ok: true,
			value: { kind: "exists", descriptor: { id: "stable", pid: 4242 } },
		});
		expect(new FsRegistry(home).list().map((d) => d.id)).toEqual(["stable"]);
	});

	it("fresh registry instances re-attach an external native session to the same pij id", () => {
		const original: SessionDescriptor = {
			...descriptor("pij-original"),
			harness: "claude",
			harnessSessionId: "native-session",
			paneId: "%1",
			pid: 10,
			lifecycle: "bound",
			lastEventAt: "2026-07-10T00:00:00.000Z",
		};
		new FsRegistry(home).write(original);

		// Simulate a full restart: discard every object, then reconstruct from disk.
		const afterRestart = new FsRegistry(home);
		const resolved = resolveStableIdentity(
			afterRestart.list(),
			"claude",
			"native-session",
			deriveHarnessPijId("claude", "native-session"),
		);
		expect(resolved).toMatchObject({
			ok: true,
			value: { kind: "reuse", descriptor: { id: "pij-original" } },
		});
		if (!resolved.ok || resolved.value.kind !== "reuse") throw new Error("expected reuse");
		afterRestart.write(
			reattachIdentity(resolved.value.descriptor, {
				harness: "claude",
				harnessSessionId: "native-session",
				folder: "/repo-after-restart",
				pid: 99,
				paneId: "%9",
			}),
		);

		const verified = new FsRegistry(home).read("pij-original");
		expect(verified).toMatchObject({
			id: "pij-original",
			// Derived from the REGISTRY's own home, not carried from the caller's
			// snapshot (review round 2 §3.1): the registry owns the tier, so it owns
			// the paths. The fixture's `/home/.pij/...` was a fiction that only held
			// because nothing enforced the invariant.
			dataDir: join(home, "pij-original"),
			eventsPath: join(home, "pij-original", "events.ndjson"),
			lastEventAt: "2026-07-10T00:00:00.000Z",
			folder: "/repo-after-restart",
			pid: 99,
			paneId: "%9",
			lifecycle: "bound",
		});
		expect(new FsRegistry(home).list()).toHaveLength(1);
	});

	it("a first bound-descriptor write automatically claims durable identity", () => {
		new FsRegistry(home).write({
			...descriptor("spawned-claude"),
			harness: "claude",
			harnessSessionId: "spawn-native",
			lifecycle: "bound",
		});
		new FsRegistry(home).remove("spawned-claude");
		expect(new FsRegistry(home).resolveIdentity("claude", "spawn-native")).toEqual({
			ok: true,
			value: "spawned-claude",
		});
	});

	it("a conflicting first bound write fails before replacing the live descriptor", () => {
		const registry = new FsRegistry(home);
		registry.write({
			...descriptor("shared"),
			harness: "claude",
			harnessSessionId: "native-a",
			lifecycle: "bound",
		});
		expect(() =>
			registry.write({
				...descriptor("shared"),
				harness: "claude",
				harnessSessionId: "native-b",
				lifecycle: "bound",
			}),
		).toThrow(/already owned|identity/i);
		expect(registry.read("shared")?.harnessSessionId).toBe("native-a");
	});

	it("rolls back provisional identity when a live descriptor claim is incompatible", () => {
		const registry = new FsRegistry(home);
		registry.write({
			...descriptor("pending-peer"),
			harness: "claude",
			lifecycle: "pending",
		});
		const failed = registry.claim({
			...descriptor("pending-peer"),
			harness: "claude",
			harnessSessionId: "wrong-native",
			lifecycle: "bound",
		});
		expect(failed).toMatchObject({ ok: false, code: "E-AMBIG" });
		expect(registry.resolveIdentity("claude", "wrong-native")).toEqual({
			ok: true,
			value: undefined,
		});
		// The pending peer can still bind to its real native identity.
		expect(() =>
			registry.write({
				...descriptor("pending-peer"),
				harness: "claude",
				harnessSessionId: "real-native",
				lifecycle: "bound",
			}),
		).not.toThrow();
	});

	it("durable native-identity bindings survive descriptor removal and adapter restart", () => {
		const first = new FsRegistry(home).claimIdentity("pi", "pi-native", "pij-original");
		expect(first).toEqual({
			ok: true,
			value: { kind: "claimed", id: "pij-original" },
		});
		new FsRegistry(home).write({
			...descriptor("pij-original"),
			role: "parent",
			harness: "pi",
			harnessSessionId: "pi-native",
			spawnedBy: "pij-creator",
			boundModel: "model-before-restart",
		});
		new FsRegistry(home).remove("pij-original");

		expect(new FsRegistry(home).resolveIdentity("pi", "pi-native")).toEqual({
			ok: true,
			value: "pij-original",
		});
		expect(new FsRegistry(home).resolveIdentitySnapshot("pi", "pi-native")).toMatchObject({
			ok: true,
			value: {
				id: "pij-original",
				role: "parent",
				spawnedBy: "pij-creator",
				boundModel: "model-before-restart",
			},
		});
	});

	it("keeps parent and repository metadata in identity snapshots through removal and dissolve", () => {
		const registry = new FsRegistry(home);
		registry.write({
			...descriptor("pij-structural"),
			harness: "pi",
			harnessSessionId: "pi-native-structural",
			parentId: null,
			gitCommonDir: "/repo/.git",
			spawnedBy: "pij-close-owner",
		});
		registry.remove("pij-structural");

		const removed = new FsRegistry(home).resolveIdentitySnapshot("pi", "pi-native-structural");
		expect(removed).toMatchObject({
			ok: true,
			value: {
				parentId: null,
				gitCommonDir: "/repo/.git",
				spawnedBy: "pij-close-owner",
			},
		});
		if (!removed.ok || !removed.value) throw new Error("expected durable identity snapshot");

		const hydrated = new FsRegistry(home);
		hydrated.write({ ...removed.value, pid: 99, lifecycle: "bound" });
		hydrated.dissolve("pij-structural");
		hydrated.remove("pij-structural");

		expect(
			new FsRegistry(home).resolveIdentitySnapshot("pi", "pi-native-structural"),
		).toMatchObject({
			ok: true,
			value: {
				parentId: null,
				gitCommonDir: "/repo/.git",
				spawnedBy: "pij-close-owner",
				lifecycle: "dissolved",
			},
		});
	});

	it("a second id cannot claim an already-owned native tuple", () => {
		new FsRegistry(home).claimIdentity("claude", "native", "pij-first");
		expect(new FsRegistry(home).claimIdentity("claude", "native", "pij-second")).toMatchObject({
			ok: false,
			code: "E-AMBIG",
		});
	});

	it("distinct native tuples cannot claim the same pij id", () => {
		new FsRegistry(home).claimIdentity("claude", "native-a", "pij-shared");
		expect(new FsRegistry(home).claimIdentity("claude", "native-b", "pij-shared")).toMatchObject({
			ok: false,
			code: "E-AMBIG",
		});
	});

	it("rejects a concrete collision from the legacy 32-bit candidate derivation", () => {
		const nativeA = "1bhrg2q-45e";
		const nativeB = "1f04tud-e0v";
		const candidate = deriveHarnessPijId("claude", nativeA);
		expect(deriveHarnessPijId("claude", nativeB)).toBe(candidate);
		new FsRegistry(home).claimIdentity("claude", nativeA, candidate);
		expect(new FsRegistry(home).claimIdentity("claude", nativeB, candidate)).toMatchObject({
			ok: false,
			code: "E-AMBIG",
		});
	});

	it("repeating the same tuple and pij id is idempotent", () => {
		new FsRegistry(home).claimIdentity("claude", "native", "pij-first");
		expect(new FsRegistry(home).claimIdentity("claude", "native", "pij-first")).toEqual({
			ok: true,
			value: { kind: "exists", id: "pij-first" },
		});
	});

	it("allocates the next memorable candidate when attempt zero belongs to another tuple", () => {
		const seed = "forced-collision";
		const first = candidate(seed, 0);
		const second = candidate(seed, 1);
		const registry = new FsRegistry(home);
		expect(registry.claimIdentity("claude", "native-owner", first).ok).toBe(true);

		expect(registry.allocateIdentity("claude", "native-new", seed)).toEqual({
			ok: true,
			value: { kind: "claimed", id: second },
		});
		expect(registry.resolveIdentity("claude", "native-owner")).toEqual({
			ok: true,
			value: first,
		});
	});

	it("concurrent registry instances converge for one native tuple and diverge for different tuples", () => {
		const seed = "same-start";
		const first = new FsRegistry(home).allocateIdentity("copilot", "native-same", seed);
		const same = new FsRegistry(home).allocateIdentity("copilot", "native-same", seed);
		const different = new FsRegistry(home).allocateIdentity("copilot", "native-other", seed);

		expect(first).toMatchObject({ ok: true, value: { kind: "claimed", id: candidate(seed, 0) } });
		expect(same).toMatchObject({ ok: true, value: { kind: "reuse", id: candidate(seed, 0) } });
		expect(different).toMatchObject({
			ok: true,
			value: { kind: "claimed", id: candidate(seed, 1) },
		});
	});

	// 4 rounds of real overlapping process spawns; exceeds the 5s default on slow CI runners.
	it("overlapping processes claiming one free native identity all converge on attempt zero", {
		timeout: 30_000,
	}, async () => {
		const seed = "multiprocess-free";
		for (let round = 0; round < 4; round++) {
			const raceHome = join(home, `free-${round}`);
			const outcomes = await runAllocationRace(raceHome, "claude", `native-free-${round}`, seed);
			expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
			expect(new Set(outcomes.map((outcome) => outcome.value?.id))).toEqual(
				new Set([candidate(seed, 0)]),
			);
			const registry = new FsRegistry(raceHome);
			expect(registry.resolveIdentity("claude", `native-free-${round}`)).toEqual({
				ok: true,
				value: candidate(seed, 0),
			});
			expect(
				registry.claimIdentity("claude", `native-free-${round}`, candidate(seed, 0)),
			).toMatchObject({ ok: true, value: { kind: "exists" } });
		}
	});

	it("overlapping processes skip an unowned legacy attempt zero without changing its bytes", {
		timeout: 30_000,
	}, async () => {
		const seed = "multiprocess-legacy";
		for (let round = 0; round < 4; round++) {
			const raceHome = join(home, `legacy-${round}`);
			mkdirSync(raceHome, { recursive: true });
			const legacyId = candidate(seed, 0);
			const legacyPath = join(raceHome, `${legacyId}.json`);
			const legacyBytes = `${JSON.stringify({
				...descriptor(legacyId),
				prime: round % 2 === 0,
				customLegacyField: `round-${round}`,
			})}\n`;
			writeFileSync(legacyPath, legacyBytes);

			const nativeId = `native-legacy-race-${round}`;
			const outcomes = await runAllocationRace(raceHome, "copilot", nativeId, seed);
			expect(
				outcomes.every((outcome) => outcome.ok),
				JSON.stringify(outcomes),
			).toBe(true);
			expect(new Set(outcomes.map((outcome) => outcome.value?.id))).toEqual(
				new Set([candidate(seed, 1)]),
			);
			expect(readFileSync(legacyPath, "utf8")).toBe(legacyBytes);

			const registry = new FsRegistry(raceHome);
			expect(registry.resolveIdentity("copilot", nativeId)).toEqual({
				ok: true,
				value: candidate(seed, 1),
			});
			expect(registry.claimIdentity("copilot", nativeId, candidate(seed, 1))).toMatchObject({
				ok: true,
				value: { kind: "exists" },
			});
			const probe = registry.reserveMemorableId(seed, `probe-${round}`, process.pid);
			expect(probe).toMatchObject({ ok: true, value: { id: candidate(seed, 2) } });
		}
	});

	it("fails loudly when durable identity coexists with multiple live descriptors for one tuple", () => {
		const registry = new FsRegistry(home);
		expect(registry.claimIdentity("claude", "native-corrupt", "pij-first").ok).toBe(true);
		for (const id of ["pij-first", "pij-duplicate"]) {
			writeFileSync(
				join(home, `${id}.json`),
				JSON.stringify({
					...descriptor(id),
					harness: "claude",
					harnessSessionId: "native-corrupt",
					lifecycle: "bound",
				}),
			);
		}
		expect(registry.allocateIdentity("claude", "native-corrupt", "unused")).toMatchObject({
			ok: false,
			code: "E-AMBIG",
		});
	});

	it("upgrades and preserves an existing opaque Pi descriptor instead of renaming it", () => {
		const legacy = {
			...descriptor("pij-1opaque"),
			prime: true,
		};
		new FsRegistry(home).write(legacy);

		const allocated = new FsRegistry(home).allocateIdentity(
			"pi",
			"native-legacy",
			"new-memorable-seed",
			legacy.id,
		);
		expect(allocated).toMatchObject({
			ok: true,
			value: { kind: "reuse", id: legacy.id, descriptor: { prime: true } },
		});
		expect(new FsRegistry(home).resolveIdentity("pi", "native-legacy")).toEqual({
			ok: true,
			value: legacy.id,
		});
	});

	it("reserves before bind, retries collisions, and never reclaims an orphan from pid death alone", () => {
		const seed = "pre-bind";
		const first = new FsRegistry(home).reserveMemorableId(seed, "owner-a", 111);
		const second = new FsRegistry(home).reserveMemorableId(seed, "owner-b", 999_999);

		expect(first).toEqual({
			ok: true,
			value: { kind: "claimed", id: candidate(seed, 0) },
		});
		expect(second).toEqual({
			ok: true,
			value: { kind: "claimed", id: candidate(seed, 1) },
		});
		expect(new FsRegistry(home).hasReservation(candidate(seed, 0))).toEqual({
			ok: true,
			value: true,
		});
	});

	it("releases only a known owner's unconsumed reservation", () => {
		const seed = "known-failure";
		const id = candidate(seed, 0);
		const registry = new FsRegistry(home);
		expect(registry.reserveMemorableId(seed, "owner-a", 111).ok).toBe(true);
		expect(registry.releaseReservation(id, "owner-b")).toMatchObject({
			ok: false,
			code: "E-OWN",
		});
		expect(registry.releaseReservation(id, "owner-a")).toEqual({ ok: true, value: true });
		expect(registry.reserveMemorableId(seed, "owner-c", 333)).toEqual({
			ok: true,
			value: { kind: "claimed", id },
		});
	});

	it("promotes a reservation into a descriptor and refuses stale release afterward", () => {
		const seed = "promotion";
		const registry = new FsRegistry(home);
		const reserved = registry.reserveMemorableId(seed, "owner-a", 111);
		if (!reserved.ok) throw new Error(reserved.message);
		const pending = {
			...descriptor(reserved.value.id),
			harness: "claude" as const,
			lifecycle: "pending" as const,
		};

		expect(registry.promoteReservation(pending, "owner-a")).toMatchObject({
			ok: true,
			value: { kind: "claimed", descriptor: { id: reserved.value.id } },
		});
		expect(registry.read(reserved.value.id)).toMatchObject({ id: reserved.value.id });
		expect(registry.hasReservation(reserved.value.id)).toEqual({ ok: true, value: false });
		expect(registry.releaseReservation(reserved.value.id, "owner-a")).toEqual({
			ok: true,
			value: false,
		});
	});

	it("consumes a reservation after an existing writer publishes the descriptor", () => {
		const registry = new FsRegistry(home);
		const reserved = registry.reserveMemorableId("agent-finalize", "owner-agent", 222);
		if (!reserved.ok) throw new Error(reserved.message);
		registry.write({ ...descriptor(reserved.value.id), harness: "copilot", lifecycle: "pending" });

		expect(registry.consumeReservation(reserved.value.id, "owner-agent")).toEqual({
			ok: true,
			value: true,
		});
		expect(registry.hasReservation(reserved.value.id)).toEqual({ ok: true, value: false });
	});

	it("explicitly recovers a crash-orphan reservation without automatic reclamation", () => {
		const registry = new FsRegistry(home);
		const reserved = registry.reserveMemorableId("operator-recovery", "dead-owner", 999_999);
		if (!reserved.ok) throw new Error(reserved.message);
		const pending = {
			...descriptor(reserved.value.id),
			harness: "codex" as const,
			lifecycle: "pending" as const,
		};

		expect(registry.recoverReservation(pending)).toMatchObject({
			ok: true,
			value: { descriptor: { id: reserved.value.id } },
		});
		expect(registry.read(reserved.value.id)).toMatchObject({ id: reserved.value.id });
	});

	it("rolls back a provisional reservation when a legacy descriptor already owns the candidate", () => {
		const seed = "legacy-live-collision";
		const first = candidate(seed, 0);
		const registry = new FsRegistry(home);
		registry.write(descriptor(first));

		expect(registry.reserveMemorableId(seed, "owner-a", 111)).toMatchObject({
			ok: true,
			value: { id: candidate(seed, 1) },
		});
		registry.remove(first);
		expect(registry.reserveMemorableId(seed, "owner-b", 222)).toEqual({
			ok: true,
			value: { kind: "claimed", id: first },
		});
	});

	it("remove deletes the descriptor (idempotent)", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("bob"));
		reg.remove("bob");
		expect(reg.read("bob")).toBeNull();
		expect(() => reg.remove("bob")).not.toThrow();
	});

	it("dissolve persists a hidden terminal tombstone and blocks stale bound writes", () => {
		const reg = new FsRegistry(home);
		const live: SessionDescriptor = {
			...descriptor("bob"),
			harness: "claude",
			harnessSessionId: "native-bob",
			lifecycle: "bound",
			paneId: "%7",
		};
		reg.write(live);

		reg.dissolve("bob");

		expect(reg.read("bob")).toMatchObject({
			id: "bob",
			lifecycle: "dissolved",
			paneId: "%7",
		});
		expect(reg.list()).toEqual([]);

		// Simulate a queued daemon activity write derived from its pre-close snapshot.
		reg.write({ ...live, state: "idle", lastEventAt: "2026-06-16T00:00:01.000Z" });
		expect(reg.read("bob")?.lifecycle).toBe("dissolved");
		expect(reg.list()).toEqual([]);

		expect(() => reg.dissolve("bob")).not.toThrow();
		expect(reg.read("bob")?.lifecycle).toBe("dissolved");
	});

	it("revive replaces a dissolved tombstone even when the OS pid is reused", () => {
		const reg = new FsRegistry(home);
		const live: SessionDescriptor = {
			...descriptor("revivable"),
			harness: "claude",
			harnessSessionId: "native-revivable",
			lifecycle: "bound",
			pid: 77,
			paneId: "%7",
		};
		reg.write(live);
		reg.dissolve(live.id);
		const result = reg.revive({
			...live,
			pid: 77,
			paneId: "%99",
			lifecycle: "pending",
		});
		expect(result).toEqual({ ok: true, value: undefined });
		expect(reg.read(live.id)).toMatchObject({ lifecycle: "pending", paneId: "%99" });
	});

	it("revive rejects either harness or native-session identity mismatch", () => {
		const reg = new FsRegistry(home);
		const live: SessionDescriptor = {
			...descriptor("identity-guard"),
			harness: "claude",
			harnessSessionId: "native-original",
			lifecycle: "bound",
		};
		reg.write(live);
		reg.dissolve(live.id);
		expect(
			reg.revive({ ...live, pid: 88, lifecycle: "pending", harness: "copilot" }),
		).toMatchObject({ ok: false, code: "E-AMBIG" });
		expect(
			reg.revive({ ...live, pid: 88, lifecycle: "pending", harnessSessionId: "native-other" }),
		).toMatchObject({ ok: false, code: "E-AMBIG" });
		expect(reg.read(live.id)).toMatchObject({
			harness: "claude",
			harnessSessionId: "native-original",
			lifecycle: "dissolved",
		});
	});

	it("ordinary write cannot bypass a dissolved tombstone with a different pid", () => {
		const reg = new FsRegistry(home);
		const live = { ...descriptor("write-guard"), lifecycle: "bound" as const, pid: 1 };
		reg.write(live);
		reg.dissolve(live.id);
		reg.write({ ...live, pid: 2, lifecycle: "pending" });
		expect(reg.read(live.id)?.lifecycle).toBe("dissolved");
	});

	it("read of an absent id is null; list of an empty home is []", () => {
		const reg = new FsRegistry(join(home, "nope"));
		expect(reg.read("ghost")).toBeNull();
		expect(reg.list()).toEqual([]);
	});

	it("skips a malformed descriptor file instead of throwing", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("good"));
		writeFileSync(join(home, "bad.json"), "{ not json");
		expect(reg.list().map((d) => d.id)).toEqual(["good"]);
	});

	it("ignores per-session <id>/ subdirectories", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("alice"));
		mkdirSync(join(home, "alice"), { recursive: true }); // the data dir
		expect(reg.list().map((d) => d.id)).toEqual(["alice"]);
	});

	it("a fresh adapter over the same home reads prior writes", () => {
		new FsRegistry(home).write(descriptor("carol"));
		expect(new FsRegistry(home).read("carol")?.id).toBe("carol");
	});

	// ─── Plan 019: new control-plane fields round-trip; old files still parse ──

	it("round-trips the control-plane fields (harness/harnessSessionId/initInjectedAt/lifecycle)", () => {
		const reg = new FsRegistry(home);
		const d: SessionDescriptor = {
			...descriptor("dave"),
			harness: "claude",
			harnessSessionId: "8f3a-uuid",
			initInjectedAt: "2026-06-27T00:00:01.000Z",
			lifecycle: "bound",
		};
		reg.write(d);
		expect(reg.read("dave")).toMatchObject({
			harness: "claude",
			harnessSessionId: "8f3a-uuid",
			initInjectedAt: "2026-06-27T00:00:01.000Z",
			lifecycle: "bound",
		});
	});

	it("an OLD descriptor without the new fields still parses (migration-safe)", () => {
		const reg = new FsRegistry(home);
		// A pre-Plan-019 descriptor literally has none of the new keys.
		writeFileSync(
			join(home, "legacy.json"),
			JSON.stringify({
				id: "legacy",
				folder: "/proj",
				dataDir: "/home/.pij/legacy",
				eventsPath: "/home/.pij/legacy/events.ndjson",
				pid: 7,
				startedAt: "2026-06-16T00:00:00.000Z",
			}),
		);
		const read = reg.read("legacy");
		expect(read?.id).toBe("legacy");
		expect(read?.harness).toBeUndefined();
		expect(read?.lifecycle).toBeUndefined();
	});
});

// ─── plan 054 Phase 2 T001 — AC-11 legacy round-trip (node-truth block) ─────
// The registry is a pass-through for fields it does not interpret: a
// pre-Phase-2 descriptor loads untouched, unknown/foreign fields survive a
// write round-trip, and the new node-truth fields persist byte-faithfully.
describe("descriptor node-truth fields — AC-11 legacy round-trip (plan 054 P2)", () => {
	let home: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-reg-ac11-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	function base(id: string): SessionDescriptor {
		return {
			id,
			folder: "/proj",
			dataDir: `/home/.pij/${id}`,
			eventsPath: `/home/.pij/${id}/events.ndjson`,
			pid: 4242,
			startedAt: "2026-07-17T00:00:00.000Z",
		};
	}

	it("a descriptor carrying the full node-truth block round-trips field-by-field", () => {
		const reg = new FsRegistry(home);
		reg.write({
			...base("truthy"),
			currentAssignment: "asg-general-truthy",
			currentTask: "hold the line",
			semanticState: "hold",
			systemState: "working",
			windowId: "@3",
			contextMax: 200_000,
			contextCurrent: {
				value: "unknown",
				asOf: "2026-07-17T01:00:00.000Z",
				provenance: "copilot-none",
			},
		});
		const read = reg.read("truthy");
		expect(read?.currentAssignment).toBe("asg-general-truthy");
		expect(read?.currentTask).toBe("hold the line");
		expect(read?.semanticState).toBe("hold");
		expect(read?.systemState).toBe("working");
		expect(read?.windowId).toBe("@3");
		expect(read?.contextMax).toBe(200_000);
		expect(read?.contextCurrent).toEqual({
			value: "unknown",
			asOf: "2026-07-17T01:00:00.000Z",
			provenance: "copilot-none",
		});
	});

	it("an old descriptor (no node-truth fields) loads with every new field absent", () => {
		writeFileSync(join(home, "old.json"), JSON.stringify(base("old")));
		const read = new FsRegistry(home).read("old");
		expect(read?.id).toBe("old");
		expect(read?.currentAssignment).toBeUndefined();
		expect(read?.currentTask).toBeUndefined();
		expect(read?.semanticState).toBeUndefined();
		expect(read?.systemState).toBeUndefined();
		expect(read?.windowId).toBeUndefined();
		expect(read?.contextMax).toBeUndefined();
		expect(read?.contextCurrent).toBeUndefined();
	});

	it("unknown foreign fields survive a read → write round-trip (additive-schema law)", () => {
		writeFileSync(
			join(home, "foreign.json"),
			JSON.stringify({ ...base("foreign"), futureField: { nested: true }, extra: "kept" }),
		);
		const reg = new FsRegistry(home);
		const read = reg.read("foreign");
		expect(read).not.toBeNull();
		if (!read) throw new Error("unreachable");
		reg.write(read);
		const roundTripped = JSON.parse(readFileSync(join(home, "foreign.json"), "utf8")) as Record<
			string,
			unknown
		>;
		expect(roundTripped.futureField).toEqual({ nested: true });
		expect(roundTripped.extra).toBe("kept");
		expect(roundTripped.id).toBe("foreign");
	});
});
