import { describe, expect, it } from "vitest";
import { FakeBatonNoticeSink, FakeBatonStore, FakeRegistry } from "../../adapters/fakes.js";
import type { Result, SessionDescriptor } from "../types.js";
import { err as resultErr, ok as resultOk } from "../types.js";
import { BatonService } from "./baton.js";
import {
	dispatchOrchestration,
	exitCodeForOrchestration,
	ORCHESTRATION_EXIT,
	parseOrchestrationArgs,
} from "./cli.js";
import { PrimeService } from "./prime.js";
import type { DesignationAuditInput, DesignationAuditPort } from "./role.js";
import { RoleService } from "./role.js";

function ok(args: string[]) {
	const parsed = parseOrchestrationArgs(args);
	if (!parsed.ok) throw new Error(`expected ok, got ${parsed.message}`);
	return parsed.command;
}

function err(args: string[]) {
	const parsed = parseOrchestrationArgs(args);
	if (parsed.ok) throw new Error("expected E-ARG");
	return parsed;
}

describe("parseOrchestrationArgs", () => {
	it("parses prime set/retire/unset with an optional target and JSON", () => {
		expect(ok(["prime", "set"])).toEqual({
			primitive: "prime",
			verb: "set",
			json: false,
		});
		expect(ok(["prime", "set", "pij-a", "--json"])).toEqual({
			primitive: "prime",
			verb: "set",
			id: "pij-a",
			json: true,
		});
		expect(ok(["prime", "retire", "pij-a", "--json"])).toEqual({
			primitive: "prime",
			verb: "retire",
			id: "pij-a",
			json: true,
		});
		expect(ok(["prime", "unset", "--json"])).toEqual({
			primitive: "prime",
			verb: "unset",
			json: true,
		});
	});

	it("parses role set/unset with optional targets and the closed role vocabulary", () => {
		expect(ok(["role", "set", "pm"])).toEqual({
			primitive: "role",
			verb: "set",
			role: "pm",
			json: false,
		});
		expect(ok(["role", "set", "pij-a", "worker", "--json"])).toEqual({
			primitive: "role",
			verb: "set",
			id: "pij-a",
			role: "worker",
			json: true,
		});
		expect(ok(["role", "unset", "--json"])).toEqual({
			primitive: "role",
			verb: "unset",
			json: true,
		});
		expect(ok(["role", "unset", "pij-a"])).toEqual({
			primitive: "role",
			verb: "unset",
			id: "pij-a",
			json: false,
		});
	});

	it("parses baton help", () => {
		expect(ok(["baton", "--help"])).toEqual({
			primitive: "baton",
			verb: "help",
			json: false,
		});
	});

	it("parses define with its complete flag set", () => {
		expect(
			ok([
				"baton",
				"define",
				"git-index",
				"--resource",
				"shared git index",
				"--probe",
				"git status --short",
				"--repo",
				"/repo",
				"--json",
			]),
		).toEqual({
			primitive: "baton",
			verb: "define",
			name: "git-index",
			resource: "shared git index",
			probe: "git status --short",
			repo: "/repo",
			json: true,
		});
	});

	it("parses list and show", () => {
		expect(ok(["baton", "list", "--json"])).toEqual({
			primitive: "baton",
			verb: "list",
			json: true,
		});
		expect(ok(["baton", "show", "dotnet"])).toEqual({
			primitive: "baton",
			verb: "show",
			name: "dotnet",
			json: false,
		});
	});

	it("parses a request with purpose, pin, and declared evidence", () => {
		expect(
			ok([
				"baton",
				"request",
				"push-main",
				"--purpose",
				"land phase 1",
				"--pin",
				"abc123",
				"--evidence",
				"commit on main",
				"--json",
			]),
		).toEqual({
			primitive: "baton",
			verb: "request",
			name: "push-main",
			purpose: "land phase 1",
			pin: "abc123",
			evidence: "commit on main",
			json: true,
		});
	});

	it("parses grant, return, and reclaim", () => {
		expect(ok(["baton", "grant", "push-main", "--to", "request-a", "--repin"])).toEqual({
			primitive: "baton",
			verb: "grant",
			name: "push-main",
			requestId: "request-a",
			repin: true,
			json: false,
		});
		expect(ok(["baton", "return", "push-main", "--evidence", "commit abc123"])).toEqual({
			primitive: "baton",
			verb: "return",
			name: "push-main",
			evidence: "commit abc123",
			json: false,
		});
		expect(
			ok(["baton", "reclaim", "push-main", "--evidence", "holder dead; purpose incomplete"]),
		).toEqual({
			primitive: "baton",
			verb: "reclaim",
			name: "push-main",
			evidence: "holder dead; purpose incomplete",
			json: false,
		});
	});

	it.each([
		[[]],
		[["unknown"]],
		[["baton"]],
		[["baton", "frobnicate"]],
		[["baton", "define", "x"]],
		[["baton", "define", "x", "--resource"]],
		[["baton", "list", "extra"]],
		[["baton", "show"]],
		[["baton", "request", "x"]],
		[["baton", "grant", "x"]],
		[["baton", "return"]],
		[["baton", "reclaim", "x"]],
		[["baton", "show", "../escape"]],
		[["baton", "show", "x", "--wat"]],
		[["baton", "list", "--json=true"]],
		[["baton", "grant", "x", "--to", "request-1", "--repin=yes"]],
		[["prime"]],
		[["prime", "show"]],
		[["prime", "set", "a", "b"]],
		[["prime", "retire", "a", "b"]],
		[["prime", "set", "--wat"]],
		[["prime", "retire", "--json=true"]],
		[["prime", "unset", "--json=true"]],
		[["role"]],
		[["role", "show"]],
		[["role", "set"]],
		[["role", "set", "pm", "extra"]],
		[["role", "unset", "a", "b"]],
		[["role", "set", "pm", "--wat"]],
		[["role", "unset", "--json=true"]],
	])("rejects malformed invocation %j", (args) => {
		expect(err(args).code).toBe("E-ARG");
	});

	it("names the two-word role vocabulary on an unknown role", () => {
		const parsed = err(["role", "set", "manager"]);
		expect(parsed.message).toContain("pm|worker");
	});

	it("rejects flags outside their verb", () => {
		expect(err(["baton", "show", "x", "--repin"]).message).toContain("--repin");
		expect(err(["baton", "grant", "x", "--to", "r", "--pin", "sha"]).message).toContain("--pin");
		expect(err(["baton", "list", "--resource", "x"]).message).toContain("--resource");
	});
});

describe("orchestration exit codes", () => {
	it("maps argument errors, firm-guide conflicts, and store failures", () => {
		expect(exitCodeForOrchestration("E-ARG")).toBe(64);
		expect(exitCodeForOrchestration("E-PIN")).toBe(1);
		expect(exitCodeForOrchestration("E-HELD")).toBe(1);
		expect(exitCodeForOrchestration("E-NOBATON")).toBe(1);
		expect(exitCodeForOrchestration("E-NOREQUEST")).toBe(1);
		expect(exitCodeForOrchestration("E-NOLEASE")).toBe(1);
		expect(exitCodeForOrchestration("E-STORE")).toBe(2);
		expect(exitCodeForOrchestration("E-NOID")).toBe(2);
		expect(exitCodeForOrchestration("E-AMBIG")).toBe(2);
	});

	it("defines an exit mapping for every orchestration error", () => {
		for (const code of Object.keys(ORCHESTRATION_EXIT)) {
			expect(typeof ORCHESTRATION_EXIT[code as keyof typeof ORCHESTRATION_EXIT]).toBe("number");
		}
	});
});

function descriptor(id: string, over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id,
		folder: "/repo",
		dataDir: `/home/.pij/${id}`,
		eventsPath: `/home/.pij/${id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-07-11T00:00:00.000Z",
		...over,
	};
}

function requiredDescriptor(registry: FakeRegistry, id: string): SessionDescriptor {
	const value = registry.read(id);
	if (!value) throw new Error(`missing descriptor '${id}'`);
	return value;
}

function dispatchPrime(
	args: string[],
	options: {
		descriptors?: SessionDescriptor[];
		resolveSelf?: () => Result<string>;
		audit?: DesignationAuditPort;
	} = {},
) {
	const parsed = parseOrchestrationArgs(args);
	if (!parsed.ok) throw new Error(parsed.message);
	const registry = new FakeRegistry(options.descriptors ?? []);
	const result = dispatchOrchestration(parsed.command, {
		service: new BatonService({
			store: new FakeBatonStore(),
			notices: new FakeBatonNoticeSink(),
			now: () => 0,
			newId: () => "id",
		}),
		actor: "operator",
		currentHead: () => null,
		primeService: new PrimeService(registry),
		designationAudit: options.audit,
		resolveSelf: options.resolveSelf ?? (() => resultOk("pij-a")),
	});
	return { result, registry };
}

class RecordingAudit implements DesignationAuditPort {
	readonly inputs: DesignationAuditInput[] = [];

	append(input: DesignationAuditInput): Result<number> {
		this.inputs.push(input);
		return resultOk(this.inputs.length);
	}
}

class FailingAudit implements DesignationAuditPort {
	append(): Result<number> {
		return resultErr("E-NOREG", "injected audit failure");
	}
}

describe("prime orchestration dispatch", () => {
	it("sets the exact resolved self and renders human output", () => {
		const { result, registry } = dispatchPrime(["prime", "set"], {
			descriptors: [descriptor("pij-a", { oldPrime: true })],
		});
		expect(result).toEqual({
			stdout: "prime set: pij-a",
			stderr: "",
			exitCode: 0,
		});
		expect(registry.read("pij-a")?.prime).toBe(true);
		expect(registry.read("pij-a")?.oldPrime).toBe(false);
	});

	it("uses an explicit target without consulting ambiguous self resolution", () => {
		const { result, registry } = dispatchPrime(["prime", "set", "pij-b", "--json"], {
			descriptors: [descriptor("pij-a"), descriptor("pij-b")],
			resolveSelf: () => resultErr("E-AMBIG", "ambiguous"),
		});
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({
			id: "pij-b",
			prime: true,
			changed: true,
		});
		expect(registry.read("pij-a")?.prime).toBeUndefined();
		expect(registry.read("pij-b")?.prime).toBe(true);
	});

	it("retires the exact resolved self and renders human output", () => {
		const { result, registry } = dispatchPrime(["prime", "retire"], {
			descriptors: [descriptor("pij-a", { prime: true })],
		});
		expect(result).toEqual({
			stdout: "prime retire: pij-a",
			stderr: "",
			exitCode: 0,
		});
		expect(registry.read("pij-a")).toMatchObject({ prime: false, oldPrime: true });
	});

	it("renders the retired marker additively in JSON without consulting self resolution", () => {
		const { result, registry } = dispatchPrime(["prime", "retire", "pij-b", "--json"], {
			descriptors: [descriptor("pij-a"), descriptor("pij-b", { prime: true })],
			resolveSelf: () => resultErr("E-AMBIG", "ambiguous"),
		});
		expect(JSON.parse(result.stdout)).toEqual({
			id: "pij-b",
			prime: false,
			oldPrime: true,
			changed: true,
		});
		expect(registry.read("pij-b")).toMatchObject({ prime: false, oldPrime: true });
	});

	it("unsets idempotently and reports changed=false in JSON", () => {
		const { result, registry } = dispatchPrime(["prime", "unset", "pij-a", "--json"], {
			descriptors: [descriptor("pij-a", { prime: false, oldPrime: false })],
		});
		expect(JSON.parse(result.stdout)).toEqual({
			id: "pij-a",
			prime: false,
			changed: false,
		});
		expect(registry.read("pij-a")?.prime).toBe(false);
		expect(registry.read("pij-a")?.oldPrime).toBe(false);
	});

	it("maps E-NOID and E-AMBIG without mutating descriptors", () => {
		const unknown = dispatchPrime(["prime", "set", "missing"], {
			descriptors: [descriptor("pij-a")],
		});
		expect(unknown.result).toMatchObject({
			exitCode: 2,
			stderr: expect.stringContaining("E-NOID"),
		});
		expect(unknown.registry.read("pij-a")?.prime).toBeUndefined();

		const ambiguous = dispatchPrime(["prime", "set"], {
			descriptors: [descriptor("pij-a"), descriptor("pij-b")],
			resolveSelf: () => resultErr("E-AMBIG", "cannot resolve self"),
		});
		expect(ambiguous.result).toMatchObject({
			exitCode: 2,
			stderr: expect.stringContaining("E-AMBIG"),
		});
		expect(ambiguous.registry.list().every((item) => item.prime === undefined)).toBe(true);
	});

	it("appends prime-set history on change only, including retire and unset transitions", () => {
		const audit = new RecordingAudit();
		const set = dispatchPrime(["prime", "set", "pij-a", "--json"], {
			descriptors: [descriptor("pij-a")],
			audit,
		});
		expect(JSON.parse(set.result.stdout)).toEqual({
			id: "pij-a",
			prime: true,
			changed: true,
		});
		const retired = dispatchPrime(["prime", "retire", "pij-a", "--json"], {
			descriptors: [requiredDescriptor(set.registry, "pij-a")],
			audit,
		});
		expect(JSON.parse(retired.result.stdout)).toEqual({
			id: "pij-a",
			prime: false,
			oldPrime: true,
			changed: true,
		});
		const unset = dispatchPrime(["prime", "unset", "pij-a", "--json"], {
			descriptors: [requiredDescriptor(retired.registry, "pij-a")],
			audit,
		});
		expect(JSON.parse(unset.result.stdout)).toEqual({
			id: "pij-a",
			prime: false,
			changed: true,
		});
		expect(audit.inputs).toEqual([
			{ kind: "prime-set", id: "pij-a", next: "prime" },
			{ kind: "prime-set", id: "pij-a", prev: "prime", next: "old-prime" },
			{ kind: "prime-set", id: "pij-a", prev: "old-prime" },
		]);

		dispatchPrime(["prime", "unset", "pij-a"], {
			descriptors: [requiredDescriptor(unset.registry, "pij-a")],
			audit,
		});
		expect(audit.inputs).toHaveLength(3);
	});

	it("materializes legacy unset flags without appending a hollow prime-set event", () => {
		const audit = new RecordingAudit();
		const { result, registry } = dispatchPrime(["prime", "unset", "pij-a", "--json"], {
			descriptors: [descriptor("pij-a")],
			audit,
		});

		expect(JSON.parse(result.stdout)).toEqual({
			id: "pij-a",
			prime: false,
			changed: true,
		});
		expect(registry.read("pij-a")).toMatchObject({ prime: false, oldPrime: false });
		expect(audit.inputs).toEqual([]);
	});
});

describe("role orchestration dispatch", () => {
	function dispatchRole(
		args: string[],
		options: {
			descriptors?: SessionDescriptor[];
			resolveSelf?: () => Result<string>;
			audit?: DesignationAuditPort;
		} = {},
	) {
		const parsed = parseOrchestrationArgs(args);
		if (!parsed.ok) throw new Error(parsed.message);
		const registry = new FakeRegistry(options.descriptors ?? []);
		const result = dispatchOrchestration(parsed.command, {
			service: new BatonService({
				store: new FakeBatonStore(),
				notices: new FakeBatonNoticeSink(),
				now: () => 0,
				newId: () => "id",
			}),
			actor: "operator",
			currentHead: () => null,
			primeService: new PrimeService(registry),
			roleService: new RoleService(registry),
			designationAudit: options.audit,
			resolveSelf: options.resolveSelf ?? (() => resultOk("pij-a")),
		});
		return { result, registry };
	}

	it("sets resolved self through RoleService and appends role-set history", () => {
		const audit = new RecordingAudit();
		const { result, registry } = dispatchRole(["role", "set", "pm", "--json"], {
			descriptors: [descriptor("pij-a")],
			audit,
		});
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({
			id: "pij-a",
			role: "pm",
			changed: true,
			spineSeq: 1,
		});
		expect(registry.read("pij-a")?.orchestrationRole).toBe("pm");
		expect(audit.inputs).toEqual([{ kind: "role-set", id: "pij-a", next: "pm" }]);
	});

	it("unsets an explicit target, omits next from history, and emits no event on a no-op", () => {
		const audit = new RecordingAudit();
		const changed = dispatchRole(["role", "unset", "pij-b", "--json"], {
			descriptors: [descriptor("pij-b", { orchestrationRole: "worker" })],
			resolveSelf: () => resultErr("E-AMBIG", "ambiguous"),
			audit,
		});
		expect(JSON.parse(changed.result.stdout)).toEqual({
			id: "pij-b",
			role: null,
			changed: true,
			spineSeq: 1,
		});
		expect(audit.inputs).toEqual([{ kind: "role-set", id: "pij-b", prev: "worker" }]);

		dispatchRole(["role", "unset", "pij-b"], {
			descriptors: [requiredDescriptor(changed.registry, "pij-b")],
			audit,
		});
		expect(audit.inputs).toHaveLength(1);
	});

	it("keeps descriptor truth and reports an audit warning when the uncoupled append fails", () => {
		const { result, registry } = dispatchRole(["role", "set", "pm", "--json"], {
			descriptors: [descriptor("pij-a")],
			audit: new FailingAudit(),
		});
		expect(result.exitCode).toBe(0);
		expect(registry.read("pij-a")?.orchestrationRole).toBe("pm");
		expect(JSON.parse(result.stdout)).toMatchObject({
			id: "pij-a",
			role: "pm",
			changed: true,
			spineSeq: null,
			spineWarning: expect.stringContaining("E-NOREG"),
		});
	});

	it("fails loud for missing services, unknown targets, and ambiguous self without writing", () => {
		const parsed = parseOrchestrationArgs(["role", "set", "pm"]);
		if (!parsed.ok) throw new Error(parsed.message);
		const unavailable = dispatchOrchestration(parsed.command, {
			service: new BatonService({
				store: new FakeBatonStore(),
				notices: new FakeBatonNoticeSink(),
				now: () => 0,
				newId: () => "id",
			}),
			actor: "operator",
			currentHead: () => null,
			resolveSelf: () => resultOk("pij-a"),
		});
		expect(unavailable).toMatchObject({ exitCode: 2, stderr: expect.stringContaining("E-STORE") });

		const missing = dispatchRole(["role", "set", "missing", "pm"], {
			descriptors: [descriptor("pij-a")],
		});
		expect(missing.result).toMatchObject({
			exitCode: 2,
			stderr: expect.stringContaining("E-NOID"),
		});
		expect(missing.registry.read("pij-a")?.orchestrationRole).toBeUndefined();

		const ambiguous = dispatchRole(["role", "set", "pm"], {
			descriptors: [descriptor("pij-a")],
			resolveSelf: () => resultErr("E-AMBIG", "cannot resolve self"),
		});
		expect(ambiguous.result).toMatchObject({
			exitCode: 2,
			stderr: expect.stringContaining("E-AMBIG"),
		});
		expect(ambiguous.registry.read("pij-a")?.orchestrationRole).toBeUndefined();
	});
});

describe("baton request dispatch — 'filed as:' visibility (identity-attribution fix-loop)", () => {
	function dispatch(store: FakeBatonStore, actor: string, args: string[]) {
		const parsed = parseOrchestrationArgs(args);
		if (!parsed.ok) throw new Error(parsed.message);
		return dispatchOrchestration(parsed.command, {
			service: new BatonService({
				store,
				notices: new FakeBatonNoticeSink(),
				now: () => 0,
				newId: () => "req-1",
			}),
			actor,
			currentHead: () => null,
			primeService: new PrimeService(new FakeRegistry([])),
			resolveSelf: () => resultOk(actor),
		});
	}

	it("echoes the recorded requester so a silent 'operator' phantom is self-evident, not concealed", () => {
		const store = new FakeBatonStore();
		expect(
			dispatch(store, "operator", ["baton", "define", "b1", "--resource", "the build"]).exitCode,
		).toBe(0);
		const res = dispatch(store, "operator", ["baton", "request", "b1", "--purpose", "ship it"]);
		expect(res.exitCode).toBe(0);
		expect(res.stdout).toContain("filed as: operator");
	});

	it("shows the real seat id when the requester resolves to a genuine seat", () => {
		const store = new FakeBatonStore();
		dispatch(store, "pij-superior-mastodon", ["baton", "define", "b2", "--resource", "the build"]);
		const res = dispatch(store, "pij-superior-mastodon", [
			"baton",
			"request",
			"b2",
			"--purpose",
			"ship it",
		]);
		expect(res.stdout).toContain("filed as: pij-superior-mastodon");
	});
});
