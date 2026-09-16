// Copilot adapter — a lazy-loaded wrapper around minih's `SdkCopilotAdapter`.
//
// `@github/copilot-sdk` is an OPTIONAL peer dependency (KF-01): it may be absent,
// so it must NOT be imported at module load — a top-level import would crash this
// module whenever the SDK isn't installed. We therefore dynamically `import()` it
// only when the copilot harness is actually used, exactly as minih does at its own
// composition root (`dist/cli/commands/sdk-runtime.js:34`). This lazy import is the
// one deliberate exception to the repo's no-inline-import rule, mandated by the plan
// (T009 "lazy import() wrapper") because it is the only way an optional peer can be
// wired at a composition root. Importing `SdkCopilotAdapter` itself is safe — it
// only touches pure `copilot-types`, never the SDK.

import type { IAgentAdapter } from "minih";
import type { ICopilotClient } from "minih/adapter";
import { SdkCopilotAdapter, type SdkCopilotAdapterOptions } from "minih/adapter";

export const COPILOT_SDK_PACKAGE = "@github/copilot-sdk";

export const COPILOT_MISSING_MESSAGE =
	`The copilot harness requires "${COPILOT_SDK_PACKAGE}", which is not installed. ` +
	`Install it with: npm install ${COPILOT_SDK_PACKAGE}`;

/** Thrown when the copilot harness is requested but its optional peer is absent. */
export class CopilotSdkMissingError extends Error {
	constructor() {
		super(COPILOT_MISSING_MESSAGE);
		this.name = "CopilotSdkMissingError";
	}
}

/** The minimal shape we consume from `@github/copilot-sdk`. */
interface CopilotSdkModule {
	CopilotClient: new (options: unknown) => ICopilotClient;
}

export interface CopilotAdapterDeps {
	/** Injectable SDK loader (tests supply a fake module or a rejecting loader). */
	loadSdk?: () => Promise<CopilotSdkModule>;
	/** Options passed to `new CopilotClient(...)`; Phase 2 wires COPILOT_HOME isolation. */
	clientOptions?: unknown;
	/** Options forwarded to `SdkCopilotAdapter`. */
	adapterOptions?: SdkCopilotAdapterOptions;
}

/**
 * Build a copilot `IAgentAdapter`. Lazy-loads the SDK; when absent, throws
 * {@link CopilotSdkMissingError} naming the package + install command (AC-07).
 * Any other load error propagates unchanged (never masked as "missing").
 */
export async function createCopilotAdapter(deps: CopilotAdapterDeps = {}): Promise<IAgentAdapter> {
	const load = deps.loadSdk ?? defaultLoadSdk;
	let sdk: CopilotSdkModule;
	try {
		sdk = await load();
	} catch (err) {
		if (isModuleNotFound(err)) throw new CopilotSdkMissingError();
		throw err;
	}
	const client = new sdk.CopilotClient(deps.clientOptions ?? defaultClientOptions());
	return new SdkCopilotAdapter(client, deps.adapterOptions);
}

async function defaultLoadSdk(): Promise<CopilotSdkModule> {
	// Variable specifier (not a string literal) so tsc treats this as a runtime
	// dynamic import and does not require the optional peer at compile time.
	const mod = await import(COPILOT_SDK_PACKAGE);
	return mod as unknown as CopilotSdkModule;
}

function defaultClientOptions(): unknown {
	// Minimal default; the full per-repo COPILOT_HOME isolation is wired by the
	// Phase 2 CLI composition root. GH_TOKEN is the SDK's documented auth input.
	return { gitHubToken: process.env.GH_TOKEN };
}

function isModuleNotFound(err: unknown): boolean {
	const code = (err as NodeJS.ErrnoException | undefined)?.code;
	return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND";
}
