import { describe, expect, it } from "vitest";
import { publishSeatName } from "./session-name.js";

const SELF = "pij-exceptional-planarian";

describe("publishSeatName", () => {
	it("retries until readback matches, then stops", async () => {
		let attempts = 0;
		let current: string | undefined;
		const sleeps: number[] = [];
		const statuses: Array<[string, string]> = [];
		const notices: string[] = [];

		const result = await publishSeatName(
			{
				setSessionName: async (name) => {
					attempts += 1;
					if (attempts === 3) current = name;
				},
				getSessionName: () => current,
				setStatus: (key, text) => statuses.push([key, text]),
				notice: (text) => notices.push(text),
				sleep: async (ms) => {
					sleeps.push(ms);
				},
			},
			SELF,
			[0, 250, 1_000, 3_000],
		);

		expect(result).toEqual({ took: true, attempts: 3 });
		expect(sleeps).toEqual([250, 750]);
		expect(statuses).toEqual([["pij", SELF]]);
		expect(notices).toEqual([]);
	});

	it("still performs one publication when readback already matches", async () => {
		let attempts = 0;
		const sleeps: number[] = [];

		const result = await publishSeatName(
			{
				setSessionName: async () => {
					attempts += 1;
				},
				getSessionName: () => SELF,
				setStatus: () => {},
				notice: () => {},
				sleep: async (ms) => {
					sleeps.push(ms);
				},
			},
			SELF,
			[0, 250],
		);

		expect(result).toEqual({ took: true, attempts: 1 });
		expect(attempts).toBe(1);
		expect(sleeps).toEqual([]);
	});

	it("sets fallback status and emits one honest notice after bounded failure", async () => {
		const statuses: Array<[string, string]> = [];
		const notices: string[] = [];
		const sleeps: number[] = [];

		const result = await publishSeatName(
			{
				setSessionName: async () => {},
				getSessionName: () => undefined,
				setStatus: (key, text) => statuses.push([key, text]),
				notice: (text) => notices.push(text),
				sleep: async (ms) => {
					sleeps.push(ms);
				},
			},
			SELF,
			[0, 250, 1_000],
		);

		expect(result).toEqual({ took: false, attempts: 3 });
		expect(sleeps).toEqual([250, 750]);
		expect(statuses).toEqual([["pij", SELF]]);
		expect(notices).toEqual([`pij: could not set omp session name — id is ${SELF}`]);
	});

	it("uses bounded blind retries when readback is unavailable", async () => {
		const notices: string[] = [];
		let attempts = 0;

		const result = await publishSeatName(
			{
				setSessionName: async () => {
					attempts += 1;
				},
				setStatus: () => {},
				notice: (text) => notices.push(text),
				sleep: async () => {},
			},
			SELF,
			[0, 0],
		);

		expect(result).toEqual({ took: false, attempts: 2 });
		expect(attempts).toBe(2);
		expect(notices).toHaveLength(1);
	});
});
