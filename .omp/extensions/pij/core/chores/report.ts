import { choreKey } from "./resolve.js";
import type { ChoreRunItem, ChoreRunReport, ChoreScopeSummary } from "./types.js";

function runItemKey(item: ChoreRunItem): string {
	return choreKey(item);
}

const UNTRUSTED_LINE_PREFIX = "  | ";

function frameUntrustedText(value: string): string[] {
	const lines = value.replace(/\r\n?/g, "\n").split("\n");
	if (lines.length > 1 && lines.at(-1) === "") lines.pop();
	return lines.map((line) => `${UNTRUSTED_LINE_PREFIX}${line}`);
}

function fingerprintLabel(value: string | null): string {
	return value ?? "none";
}

export function renderChoreReport(report: ChoreRunReport): string {
	const lines = [
		`${report.moved > 0 ? "CHANGES" : "NO CHANGE"} — ${report.probed} chores probed, ${report.moved} moved`,
	];

	for (const item of report.chores.filter((entry) => entry.status === "changed-value")) {
		lines.push(
			`CHANGED-VALUE ${runItemKey(item)}:`,
			`  OLD fingerprint=${fingerprintLabel(item.oldFingerprint)}`,
			...frameUntrustedText(item.old ?? "<none>"),
			`  NEW fingerprint=${fingerprintLabel(item.newFingerprint)}`,
			...frameUntrustedText(item.new ?? "<none>"),
		);
		if (!item.fullConfigured) {
			lines.push(
				`HINT ${runItemKey(item)}: if this delta needs more context, add --full '<cmd>' --full-every N for periodic absolute state.`,
			);
		}
	}
	for (const item of report.chores.filter((entry) => entry.status === "changed-probe")) {
		lines.push(
			`CHANGED-PROBE ${runItemKey(item)}: ${item.reason ?? "instrument changed; ack resets baseline"}`,
			`  BASELINE fingerprint=${fingerprintLabel(item.newFingerprint)}`,
			...frameUntrustedText(item.new ?? "<none>"),
		);
		if (item.preservedValueDelta) {
			lines.push(
				`CHANGED-VALUE ${runItemKey(item)}: pending before instrument changed`,
				`  OLD fingerprint=${fingerprintLabel(item.preservedValueDelta.oldFingerprint)}`,
				...frameUntrustedText(item.preservedValueDelta.old ?? "<none>"),
				`  NEW fingerprint=${fingerprintLabel(item.preservedValueDelta.newFingerprint)}`,
				...frameUntrustedText(item.preservedValueDelta.new),
			);
		}
	}
	for (const item of report.chores.filter((entry) => entry.status === "flapped")) {
		lines.push(
			`FLAPPED ${runItemKey(item)}: moved and returned since last ack`,
			`  CURRENT fingerprint=${fingerprintLabel(item.newFingerprint)}`,
			...frameUntrustedText(item.new ?? "<none>"),
		);
		if (!item.fullConfigured) {
			lines.push(
				`HINT ${runItemKey(item)}: if this flap needs more context, add --full '<cmd>' --full-every N for periodic absolute state.`,
			);
		}
	}
	for (const item of report.chores.filter((entry) => entry.status === "not-probeable")) {
		lines.push(
			`NOT-PROBEABLE ${runItemKey(item)}:`,
			...frameUntrustedText(item.reason ?? "unknown failure"),
		);
	}
	for (const item of report.chores.filter((entry) => entry.status === "unchanged")) {
		lines.push(
			`UNCHANGED ${runItemKey(item)} fingerprint=${fingerprintLabel(item.newFingerprint)}`,
			...frameUntrustedText(item.new ?? "<none>"),
		);
	}
	for (const item of report.chores) {
		if (item.fullOutput !== undefined) {
			lines.push(`FULL ${runItemKey(item)}`, ...frameUntrustedText(item.fullOutput));
		}
	}
	return lines.join("\n");
}

export function renderChoreJson(report: ChoreRunReport, scopes?: ChoreScopeSummary): string {
	return JSON.stringify(
		{
			...(scopes !== undefined ? { scopes } : {}),
			probed: report.probed,
			moved: report.moved,
			chores: report.chores.map((item) => ({
				scope: item.scope,
				name: item.name,
				status: item.status,
				old: item.old,
				new: item.new,
				oldFingerprint: item.oldFingerprint,
				newFingerprint: item.newFingerprint,
				...(item.reason !== undefined ? { reason: item.reason } : {}),
				...(item.preservedValueDelta !== undefined
					? { preservedValueDelta: item.preservedValueDelta }
					: {}),
				...(item.fullOutput !== undefined ? { fullOutput: item.fullOutput } : {}),
			})),
		},
		null,
		2,
	);
}
