// Shared test helpers. Keep tiny — extract patterns only after they're
// duplicated across ≥2 test files.

export interface AppendCall<T = unknown> {
	customType: string;
	data: T;
}

export function makeRecorder<T = unknown>() {
	const calls: AppendCall<T>[] = [];
	const append = (customType: string, data: unknown): void => {
		calls.push({ customType, data: data as T });
	};
	return { append, calls };
}

export function lastCustomType(calls: AppendCall[]): string | undefined {
	return calls.at(-1)?.customType;
}
