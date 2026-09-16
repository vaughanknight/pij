import type { ICopilotClient } from "minih/adapter";
import { describe, expect, it, vi } from "vitest";
import { COPILOT_SDK_PACKAGE, CopilotSdkMissingError, createCopilotAdapter } from "./copilot.js";

/** A minimal ICopilotClient stub — SdkCopilotAdapter stores it without calling
 *  any method at construction, so no-op async methods suffice. */
class FakeCopilotClient implements ICopilotClient {
	constructor(public readonly options: unknown) {}
	async createSession(): Promise<never> {
		throw new Error("not used in this test");
	}
	async resumeSession(): Promise<never> {
		throw new Error("not used in this test");
	}
	async stop(): Promise<unknown> {
		return undefined;
	}
}

describe("copilot adapter — optional peer loading (AC-07)", () => {
	it("peer present: loads the fake SDK and returns a working IAgentAdapter", async () => {
		const loadSdk = vi.fn(async () => ({ CopilotClient: FakeCopilotClient }));
		const adapter = await createCopilotAdapter({ loadSdk, clientOptions: { gitHubToken: "t" } });
		expect(loadSdk).toHaveBeenCalledOnce();
		expect(typeof adapter.run).toBe("function");
		expect(typeof adapter.compact).toBe("function");
		expect(typeof adapter.terminate).toBe("function");
	});

	it("peer absent (ERR_MODULE_NOT_FOUND): throws a named-package error", async () => {
		const loadSdk = vi.fn(async () => {
			const err = new Error("Cannot find package") as NodeJS.ErrnoException;
			err.code = "ERR_MODULE_NOT_FOUND";
			throw err;
		});
		await expect(createCopilotAdapter({ loadSdk })).rejects.toBeInstanceOf(CopilotSdkMissingError);
		await expect(createCopilotAdapter({ loadSdk })).rejects.toThrow(COPILOT_SDK_PACKAGE);
		await expect(createCopilotAdapter({ loadSdk })).rejects.toThrow(/npm install/);
	});

	it("a non-missing load error propagates unchanged (not masked as missing)", async () => {
		const loadSdk = vi.fn(async () => {
			throw new Error("some other failure");
		});
		await expect(createCopilotAdapter({ loadSdk })).rejects.toThrow("some other failure");
		await expect(createCopilotAdapter({ loadSdk })).rejects.not.toBeInstanceOf(
			CopilotSdkMissingError,
		);
	});
});
