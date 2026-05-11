// harness/driver/session.ts
//
// T002 ships ONLY the public type surface (Step, WaitIdleOpts) — these
// are referenced by errors.ts at type-import time. T003 fills in the
// Session class implementation (start / waitIdle / run / execute /
// teardown / capturedNamed) and the matching unit tests.

import type { Key } from "./tmux.js";

// ─── Step types (IA-03) ─────────────────────────────────────────────────────

export type Step =
	| { kind: "type"; text: string; press?: Key; expect?: RegExp; expectTimeoutMs?: number }
	| { kind: "press"; key: Key; n?: number; expect?: RegExp; expectTimeoutMs?: number }
	| { kind: "paste"; data: string; expect?: RegExp; expectTimeoutMs?: number }
	| { kind: "wait"; quietMs?: number; signal?: RegExp; timeoutMs?: number }
	| { kind: "sleep"; ms: number } // explicit escape hatch — discouraged
	| { kind: "capture"; name: string }; // attach named capture to report

// ─── Readiness opts (PR-07) ─────────────────────────────────────────────────

export interface WaitIdleOpts {
	/** Bottom-line prompt regex. Default: `/^>\s/m` — pi's prompt (PR-01). */
	promptRe?: RegExp;
	/** Spinner glyphs to wait OUT. Default: pi's Braille frames (PR-07). */
	spinnerRe?: RegExp;
	/** Footer context-percent token. Default: `/\d+(\.\d+)?%\//` (PR-02). */
	contextRe?: RegExp;
	/** Polling interval. Default 250ms. */
	quietMs?: number;
	/** Hard ceiling. Default 5000ms; bump to 60000 for `/compact` / `/reload`. */
	timeoutMs?: number;
	/** Capture window in lines. Default 50. */
	scrollback?: number;
}
