import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeTmux } from "../adapters/fakes.js";
import { FsFocusStore } from "../adapters/focus-store.js";
import { FsRegistry } from "../adapters/fs-registry.js";
import {
	type FocusLaunchDeps,
	type FocusSaveDeps,
	type FocusStorePort,
	formatFocusList,
	launchFocus,
	listFocuses,
	redactSnapshot,
	saveFocus,
} from "./focus.js";
import { transcriptDir } from "./harness/claude.js";
import type { RegistryPort } from "./ports.js";
import { DEFAULT_SPAWN_EXPECTATION_TTL_MS } from "./spawn-expectation.js";
import {
	err,
	type FocusManifest,
	ok,
	type Result,
	type SessionDescriptor,
	type SpawnExpectation,
} from "./types.js";

function descriptor(overrides: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id: "pij-source",
		folder: "/repo",
		dataDir: "/tmp/pij-source",
		eventsPath: "/tmp/pij-source/events.ndjson",
		pid: 42,
		startedAt: "2026-07-15T00:00:00.000Z",
		harness: "pi",
		harnessSessionId: "native-session-1",
		boundModel: "github-copilot/gpt-5.6-sol",
		effort: "xhigh",
		...overrides,
	};
}

describe("focus core", () => {
	let home: string;
	let pijHome: string;
	let previousPijHome: string | undefined;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-focus-core-"));
		pijHome = join(home, "pij-home");
		previousPijHome = process.env.PIJ_HOME;
		process.env.PIJ_HOME = pijHome;
	});

	afterEach(() => {
		if (previousPijHome === undefined) delete process.env.PIJ_HOME;
		else process.env.PIJ_HOME = previousPijHome;
		rmSync(home, { recursive: true, force: true });
	});

	it("copies a bound pi transcript through the real locator and records its sha256", () => {
		const nativeId = "native-session-1";
		const sourceDir = join(home, ".pi", "agent", "sessions", "--repo--");
		const sourcePath = join(sourceDir, `2026-07-15T00-00-00.000Z_${nativeId}.jsonl`);
		const source = [
			JSON.stringify({ type: "session", id: nativeId, cwd: "/repo" }),
			JSON.stringify({ type: "message", role: "user", content: "golden context" }),
			"",
		].join("\n");
		mkdirSync(sourceDir, { recursive: true });
		writeFileSync(sourcePath, source);
		const bound = descriptor({ harnessSessionId: nativeId });
		const registry: Pick<RegistryPort, "read"> = {
			read: (id) => (id === bound.id ? bound : null),
		};
		const store = new FsFocusStore();
		const deps: FocusSaveDeps = {
			registry,
			store,
			home,
			nowIso: () => "2026-07-15T01:02:03.000Z",
			transcripts: {
				flat: (dir) =>
					readdirSync(dir)
						.filter((name) => name.endsWith(".jsonl"))
						.map((name) => join(dir, name)),
				deep: () => [],
				read: (path) => readFileSync(path, "utf8"),
			},
		};

		const result = saveFocus({ name: "golden-pi", sourcePijId: bound.id }, deps);

		expect(result).toEqual({
			ok: true,
			value: {
				version: 1,
				name: "golden-pi",
				harness: "pi",
				harnessSessionId: nativeId,
				model: "github-copilot/gpt-5.6-sol",
				effort: "xhigh",
				originCwd: "/repo",
				sha256: createHash("sha256").update(source).digest("hex"),
				createdAt: "2026-07-15T01:02:03.000Z",
				lineage: {
					sourcePijId: bound.id,
					sourceHarnessSessionId: nativeId,
				},
			},
		});
		expect(readFileSync(store.snapshotPath("golden-pi"), "utf8")).toBe(source);
		expect(store.read("golden-pi")).toEqual(result.ok ? result.value : null);
	});

	it("refuses a descriptor that has not bound to a native harness session", () => {
		const unbound = descriptor({ harnessSessionId: undefined, lifecycle: "pending" });
		const result = saveFocus(
			{ name: "not-bound", sourcePijId: unbound.id },
			{
				registry: { read: () => unbound },
				store: new FsFocusStore(),
				home,
				nowIso: () => "2026-07-15T01:02:03.000Z",
				transcripts: {
					flat: () => [],
					deep: () => [],
					read: () => "",
				},
			},
		);

		expect(result).toEqual({
			ok: false,
			code: "E-ARG",
			message: expect.stringMatching(/not bound/i),
		});
	});

	function persistFocus(manifest: FocusManifest, snapshot: string): FsFocusStore {
		const store = new FsFocusStore();
		store.writeSnapshot(manifest.name, snapshot);
		store.write(manifest);
		return store;
	}

	function launchDeps(
		store: FocusStorePort,
		tmux = new FakeTmux(),
		overrides: Partial<FocusLaunchDeps> = {},
	) {
		const expectations = new Map<string, SpawnExpectation>();
		const trace: string[] = [];
		const splitWindow = tmux.splitWindow.bind(tmux);
		tmux.splitWindow = (opts) => {
			trace.push("tmux-launch");
			return splitWindow(opts);
		};
		return {
			trace,
			registry: new FsRegistry(pijHome),
			expectations: {
				list: () => [...expectations.values()],
				read: (spawnId: string) => expectations.get(spawnId) ?? null,
				write: (expectation: SpawnExpectation) => {
					trace.push(
						expectation.paneId === undefined ? "expectation-write" : "pane-or-bind-update",
					);
					expectations.set(expectation.spawnId, expectation);
				},
				remove: (spawnId: string) => {
					trace.push("expectation-remove");
					expectations.delete(spawnId);
				},
			},
			store,
			tmux,
			home,
			pijHome,
			nowIso: () => "2026-07-15T02:03:04.000Z",
			randomUuid: () => "019f-focus-native",
			spawnToken: () => "focus-launch-token",
			ownerToken: () => "focus-launch-owner",
			pid: () => 4242,
			panePid: () => 5252,
			cwdExists: () => true,
			isGitWorktree: () => false,
			gitCommonDir: () => "/repo/.git",
			ensureDir: (path) => mkdirSync(path, { recursive: true }),
			writeMaterialized: (path, contents) => {
				mkdirSync(dirname(path), { recursive: true });
				if (existsSync(path) && readFileSync(path, "utf8") === contents) return;
				writeFileSync(path, contents, { flag: "wx" });
			},
			waitForPiRegistration: (paneId: string) =>
				ok(
					descriptor({
						id: "pij-self-registered",
						harness: "pi",
						harnessSessionId: "019f-focus-native",
						paneId,
					}),
				),
			...overrides,
		};
	}

	it("returns the pi id allocated by self-registration without reserving a caller-owned id", () => {
		const snapshot = '{"type":"session","id":"source-pi","cwd":"/repo"}\n';
		const manifest: FocusManifest = {
			version: 1,
			name: "golden-pi",
			harness: "pi",
			harnessSessionId: "source-pi",
			model: "github-copilot/gpt-5.6-sol",
			effort: "xhigh",
			originCwd: "/repo",
			sha256: createHash("sha256").update(snapshot).digest("hex"),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: "pij-source",
				sourceHarnessSessionId: "source-pi",
			},
		};
		const store = persistFocus(manifest, snapshot);
		const tmux = new FakeTmux({ currentPane: "%500" });
		const registry = new FsRegistry(pijHome);
		const reserveMemorableId = vi.spyOn(registry, "reserveMemorableId");
		const selfRegistered = descriptor({
			id: "pij-child-owned",
			harness: "pi",
			harnessSessionId: "019f-focus-native",
			paneId: "%900",
			spawnedBy: "pij-parent",
		});
		const waitForPiRegistration = vi.fn(
			(paneId: string, spawnId: string): Result<SessionDescriptor> => {
				expect(paneId).toBe("%900");
				expect(spawnId).toBe("focus-launch-token");
				return ok(selfRegistered);
			},
		);
		const deps = launchDeps(store, tmux, { registry, waitForPiRegistration });

		const result = launchFocus(
			{ name: manifest.name, launchCwd: "/repo", parentId: "pij-parent" },
			deps,
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.id).toBe(selfRegistered.id);
		expect(result.value.descriptor).toEqual(selfRegistered);
		expect(reserveMemorableId).not.toHaveBeenCalled();
		expect(waitForPiRegistration).toHaveBeenCalledOnce();
		expect(result.value.forkSessionId).toBe("019f-focus-native");
		expect(result.value.command.args).toEqual([
			"--fork",
			store.snapshotPath(manifest.name),
			"--session-dir",
			join(pijHome, "focus-launches", "019f-focus-native", "pi-sessions"),
			"--session-id",
			"019f-focus-native",
			"--model",
			"github-copilot/gpt-5.6-sol:xhigh",
		]);
		expect(result.value.command.env).toMatchObject({
			PIJ_ANNOUNCE_TO: "pij-parent",
			PIJ_PARENT_ID: "pij-parent",
			PIJ_SPAWN_ID: "focus-launch-token",
			PIJ_ROLE: "worker",
		});
		expect(result.value.command.env).not.toHaveProperty("PIJ_SESSION_ID");
		expect(tmux.splits[0]?.opts).toMatchObject({
			cmd: "pi",
			cwd: "/repo",
			target: "%500",
			direction: "h",
		});
		expect(deps.trace).toEqual([
			"expectation-write",
			"tmux-launch",
			"pane-or-bind-update",
			"pane-or-bind-update",
		]);
		expect(deps.expectations.read("focus-launch-token")).toMatchObject({
			spawnId: "focus-launch-token",
			requestedAt: "2026-07-15T02:03:04.000Z",
			deadlineAt: new Date(
				Date.parse("2026-07-15T02:03:04.000Z") + DEFAULT_SPAWN_EXPECTATION_TTL_MS,
			).toISOString(),
			paneId: "%900",
			sessionId: "pij-child-owned",
		});
	});

	it("cleans only the focus-owned expectation when tmux launch fails synchronously", () => {
		const snapshot = '{"type":"user","sessionId":"source-claude"}\n';
		const manifest: FocusManifest = {
			version: 1,
			name: "failed-focus",
			harness: "claude",
			harnessSessionId: "source-claude",
			originCwd: "/repo",
			sha256: createHash("sha256").update(snapshot).digest("hex"),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: { sourcePijId: "pij-source", sourceHarnessSessionId: "source-claude" },
		};
		const tmux = new FakeTmux();
		tmux.splitWindow = () => err("E-NOTMUX", "injected split failure");
		const deps = launchDeps(persistFocus(manifest, snapshot), tmux);
		deps.expectations.write({
			spawnId: "sentinel",
			requestedHarness: "pi",
			requestedAt: "2026-07-15T00:00:00.000Z",
		});

		const result = launchFocus({ name: manifest.name, launchCwd: "/repo" }, deps);

		expect(result).toMatchObject({ ok: false, code: "E-NOTMUX" });
		expect(deps.trace.slice(-3)).toEqual([
			"expectation-write",
			"tmux-launch",
			"expectation-remove",
		]);
		expect(deps.expectations.list().map((item) => item.spawnId)).toEqual(["sentinel"]);
	});

	it("materializes a claude snapshot under a fresh focus-owned id when the donor file differs", () => {
		const snapshot = `${JSON.stringify({
			type: "user",
			sessionId: "source-claude",
			message: { content: "golden" },
		})}\n`;
		const manifest: FocusManifest = {
			version: 1,
			name: "golden-claude",
			harness: "claude",
			harnessSessionId: "source-claude",
			model: "claude-sonnet-5",
			effort: "high",
			originCwd: "/repo",
			sha256: createHash("sha256").update(snapshot).digest("hex"),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: "pij-source",
				sourceHarnessSessionId: "source-claude",
			},
		};
		const store = persistFocus(manifest, snapshot);
		const donorPath = join(transcriptDir(home, "/repo"), "source-claude.jsonl");
		const donor = `${JSON.stringify({
			type: "user",
			sessionId: "source-claude",
			gitBranch: "feature/live-donor",
			message: { content: "golden" },
		})}\n`;
		mkdirSync(dirname(donorPath), { recursive: true });
		writeFileSync(donorPath, donor);
		const ids = ["focus-materialized-id", "019f-focus-native"];
		const deps = launchDeps(store, new FakeTmux(), {
			randomUuid: () => {
				const id = ids.shift();
				if (!id) throw new Error("unexpected UUID request");
				return id;
			},
		});

		const result = launchFocus({ name: manifest.name, launchCwd: "/repo" }, deps);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.command.args).toEqual([
			"--dangerously-skip-permissions",
			"--resume",
			"focus-materialized-id",
			"--fork-session",
			"--session-id",
			"019f-focus-native",
			"--model",
			"claude-sonnet-5",
			"--effort",
			"high",
		]);
		expect(readFileSync(donorPath, "utf8")).toBe(donor);
		expect(
			readFileSync(join(transcriptDir(home, "/repo"), "focus-materialized-id.jsonl"), "utf8"),
		).toBe(snapshot);
		expect(result.value.descriptor).toMatchObject({
			harness: "claude",
			plannedHarnessSessionId: "019f-focus-native",
			branchedFrom: "source-claude",
		});
	});

	it("returns an explicit pending-canary state instead of claiming the launch is ready", () => {
		const snapshot = '{"type":"user","sessionId":"source-claude"}\n';
		const manifest: FocusManifest = {
			version: 1,
			name: "pending-canary-claude",
			harness: "claude",
			harnessSessionId: "source-claude",
			originCwd: "/repo",
			sha256: createHash("sha256").update(snapshot).digest("hex"),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: "pij-source",
				sourceHarnessSessionId: "source-claude",
			},
		};
		const result = launchFocus(
			{ name: manifest.name, launchCwd: "/repo" },
			launchDeps(persistFocus(manifest, snapshot)),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.state).toBe("pending-canary");
		expect(result.value).not.toHaveProperty("ready", true);
	});

	it("refuses to launch a pi focus from a git worktree", () => {
		const snapshot = '{"type":"session","id":"source-pi","cwd":"/repo"}\n';
		const manifest: FocusManifest = {
			version: 1,
			name: "worktree-pi",
			harness: "pi",
			harnessSessionId: "source-pi",
			originCwd: "/repo",
			sha256: createHash("sha256").update(snapshot).digest("hex"),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: "pij-source",
				sourceHarnessSessionId: "source-pi",
			},
		};
		const store = persistFocus(manifest, snapshot);
		const tmux = new FakeTmux();

		const result = launchFocus(
			{ name: manifest.name, launchCwd: "/repo-worktree" },
			launchDeps(store, tmux, { isGitWorktree: () => true }),
		);

		expect(result).toEqual({
			ok: false,
			code: "E-ARG",
			message: expect.stringMatching(/worktree/i),
		});
		expect(tmux.splits).toEqual([]);
	});

	it("refuses a claude launch cwd that cannot be resolved", () => {
		const snapshot = '{"type":"user","sessionId":"source-claude"}\n';
		const manifest: FocusManifest = {
			version: 1,
			name: "missing-cwd-claude",
			harness: "claude",
			harnessSessionId: "source-claude",
			originCwd: "/repo",
			sha256: createHash("sha256").update(snapshot).digest("hex"),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: "pij-source",
				sourceHarnessSessionId: "source-claude",
			},
		};
		const store = persistFocus(manifest, snapshot);
		const tmux = new FakeTmux();

		const result = launchFocus(
			{ name: manifest.name, launchCwd: "/missing" },
			launchDeps(store, tmux, { cwdExists: () => false }),
		);

		expect(result).toEqual({
			ok: false,
			code: "E-ARG",
			message: expect.stringMatching(/launch cwd/i),
		});
		expect(tmux.splits).toEqual([]);
	});

	it("keeps the saved snapshot byte-identical after launch", () => {
		const snapshot = '{"type":"session","id":"source-pi","cwd":"/repo"}\n';
		const manifest: FocusManifest = {
			version: 1,
			name: "immutable-pi",
			harness: "pi",
			harnessSessionId: "source-pi",
			originCwd: "/repo",
			sha256: createHash("sha256").update(snapshot).digest("hex"),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: "pij-source",
				sourceHarnessSessionId: "source-pi",
			},
		};
		const store = persistFocus(manifest, snapshot);
		const before = createHash("sha256").update(store.readSnapshot(manifest.name)).digest("hex");

		const result = launchFocus({ name: manifest.name, launchCwd: "/repo" }, launchDeps(store));

		expect(result.ok).toBe(true);
		const after = createHash("sha256").update(store.readSnapshot(manifest.name)).digest("hex");
		expect(after).toBe(before);
		expect(after).toBe(manifest.sha256);
	});

	it("kills the pane and releases ownership when the post-spawn snapshot hash changes", () => {
		const snapshot = '{"type":"user","sessionId":"source-claude"}\n';
		const manifest: FocusManifest = {
			version: 1,
			name: "changing-claude",
			harness: "claude",
			harnessSessionId: "source-claude",
			originCwd: "/repo",
			sha256: createHash("sha256").update(snapshot).digest("hex"),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: "pij-source",
				sourceHarnessSessionId: "source-claude",
			},
		};
		const baseStore = persistFocus(manifest, snapshot);
		let reads = 0;
		const store = {
			write: (value: FocusManifest) => baseStore.write(value),
			read: (name: string) => baseStore.read(name),
			list: () => baseStore.list(),
			snapshotPath: (name: string) => baseStore.snapshotPath(name),
			writeSnapshot: (name: string, contents: string) => baseStore.writeSnapshot(name, contents),
			readSnapshot: (name: string) => {
				reads += 1;
				return reads === 1 ? baseStore.readSnapshot(name) : `${snapshot}changed`;
			},
		};
		let reservationHeld = false;
		let persisted: SessionDescriptor | null = null;
		const registry = {
			list: () => (persisted ? [persisted] : []),
			reserveMemorableId: () => {
				reservationHeld = true;
				return ok({ kind: "claimed" as const, id: "pij-reserved-focus" });
			},
			releaseReservation: () => {
				const released = reservationHeld;
				reservationHeld = false;
				return ok(released);
			},
			promoteReservation: (value: SessionDescriptor) => {
				reservationHeld = false;
				persisted = value;
				return ok({ kind: "claimed" as const, descriptor: value });
			},
		};
		const tmux = new FakeTmux();

		const result = launchFocus(
			{ name: manifest.name, launchCwd: "/repo" },
			launchDeps(store, tmux, {
				registry,
				randomUuid: vi
					.fn<() => string>()
					.mockReturnValueOnce("focus-materialized-id")
					.mockReturnValueOnce("019f-focus-native"),
			}),
		);

		expect(result).toEqual({
			ok: false,
			code: "E-NOREG",
			message: expect.stringMatching(/changed during launch/i),
		});
		expect(tmux.killedPanes).toEqual(["%900"]);
		expect(persisted).toBeNull();
		expect(reservationHeld).toBe(false);
	});

	it("lists focuses from the current repository by default and all focuses globally", () => {
		const makeManifest = (name: string, originCwd: string): FocusManifest => ({
			version: 1,
			name,
			harness: "pi",
			harnessSessionId: `native-${name}`,
			originCwd,
			sha256: "a".repeat(64),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: `pij-${name}`,
				sourceHarnessSessionId: `native-${name}`,
			},
		});
		const store = new FsFocusStore();
		store.write(makeManifest("main", "/repo/main"));
		store.write(makeManifest("worktree", "/repo/worktree"));
		store.write(makeManifest("other", "/other"));
		const gitCommonDir = (cwd: string): string | null =>
			cwd.startsWith("/repo/") ? "/repo/.git" : cwd === "/other" ? "/other/.git" : null;

		const local = listFocuses({ cwd: "/repo/main", global: false }, { store, gitCommonDir });
		const global = listFocuses({ cwd: "/repo/main", global: true }, { store, gitCommonDir });

		expect(local.ok).toBe(true);
		if (!local.ok) return;
		expect(local.value.map((manifest) => manifest.name)).toEqual(["main", "worktree"]);
		expect(global.ok).toBe(true);
		if (!global.ok) return;
		expect(global.value.map((manifest) => manifest.name)).toEqual(["main", "other", "worktree"]);
		expect(JSON.parse(formatFocusList(local.value, true))).toEqual(local.value);
	});

	it("returns adapter-unavailable for save and launch on both copilot and codex", () => {
		for (const harness of ["copilot", "codex"] as const) {
			const nativeId = `${harness}-native`;
			const source = descriptor({ harness, harnessSessionId: nativeId });
			expect(
				saveFocus(
					{ name: `future-${harness}`, sourcePijId: source.id },
					{
						registry: { read: () => source },
						store: new FsFocusStore(),
						home,
						nowIso: () => "2026-07-15T00:00:00.000Z",
						transcripts: { flat: () => [], deep: () => [], read: () => "" },
					},
				),
			).toEqual({
				ok: false,
				code: "E-ARG",
				message: expect.stringMatching(new RegExp(`adapter not yet available.*${harness}`, "i")),
			});

			const snapshot = `${JSON.stringify({ type: "session", id: nativeId })}\n`;
			const manifest: FocusManifest = {
				version: 1,
				name: `future-${harness}`,
				harness,
				harnessSessionId: nativeId,
				originCwd: "/repo",
				sha256: createHash("sha256").update(snapshot).digest("hex"),
				createdAt: "2026-07-15T00:00:00.000Z",
				lineage: {
					sourcePijId: `pij-${harness}`,
					sourceHarnessSessionId: nativeId,
				},
			};
			expect(
				launchFocus(
					{ name: manifest.name, launchCwd: "/repo" },
					launchDeps(persistFocus(manifest, snapshot)),
				),
			).toEqual({
				ok: false,
				code: "E-ARG",
				message: expect.stringMatching(new RegExp(`adapter not yet available.*${harness}`, "i")),
			});
		}
	});

	describe("redactSnapshot", () => {
		it("removes claude gitBranch metadata while preserving the JSONL record", () => {
			const source = `${JSON.stringify({
				type: "user",
				sessionId: "native-session-1",
				gitBranch: "feature/private-name",
				message: { content: "golden context" },
			})}\n`;

			const result = redactSnapshot("claude", source);

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.value).not.toContain("gitBranch");
			expect(JSON.parse(result.value)).toEqual({
				type: "user",
				sessionId: "native-session-1",
				message: { content: "golden context" },
			});
		});

		it("leaves pi snapshots byte-identical", () => {
			const source = '{"type":"session","id":"native-session-1","cwd":"/repo"}\n';
			expect(redactSnapshot("pi", source)).toEqual({ ok: true, value: source });
		});

		it("refuses credential-shaped persisted fields", () => {
			const source = `${JSON.stringify({
				type: "session",
				id: "native-session-1",
				apiKey: "sk-ant-example",
			})}\n`;

			expect(redactSnapshot("claude", source)).toEqual({
				ok: false,
				code: "E-ARG",
				message: expect.stringMatching(/credential/i),
			});
		});
	});
});
