import { choreKey } from "./resolve.js";
import type { ChoreRunItem, ChoreRunReport } from "./types.js";

function runItemKey(item: ChoreRunItem): string {
	return choreKey(item);
}

const UNTRUSTED_LINE_PREFIX = "  | ";

function frameUntrustedText(value: string): string[] {
	return value
		.replace(/\r\n?/g, "\n")
		.split("\n")
		.map((line) => `${UNTRUSTED_LINE_PREFIX}${line}`);
}

export function renderChoreReport(report: ChoreRunReport): string {
	const lines = [
		`${report.moved > 0 ? "CHANGES" : "NO CHANGE"} — ${report.probed} chores probed, ${report.moved} moved`,
	];

	for (const item of report.chores.filter((entry) => entry.status === "changed")) {
		lines.push(`CHANGED ${runItemKey(item)}: ${item.old ?? "none"} → ${item.new ?? "none"}`);
	}
	for (const item of report.chores.filter((entry) => entry.status === "not-probeable")) {
		lines.push(
			`NOT-PROBEABLE ${runItemKey(item)}:`,
			...frameUntrustedText(item.reason ?? "unknown failure"),
		);
	}
	for (const item of report.chores.filter((entry) => entry.status === "unchanged")) {
		lines.push(`UNCHANGED ${runItemKey(item)}: ${item.new ?? "none"}`);
	}
	for (const item of report.chores) {
		if (item.fullOutput !== undefined) {
			lines.push(`FULL ${runItemKey(item)}`, ...frameUntrustedText(item.fullOutput));
		}
	}
	return lines.join("\n");
}

export function renderChoreJson(report: ChoreRunReport): string {
	return JSON.stringify(
		{
			probed: report.probed,
			moved: report.moved,
			chores: report.chores.map((item) => ({
				scope: item.scope,
				name: item.name,
				status: item.status,
				old: item.old,
				new: item.new,
				...(item.reason !== undefined ? { reason: item.reason } : {}),
				...(item.fullOutput !== undefined ? { fullOutput: item.fullOutput } : {}),
			})),
		},
		null,
		2,
	);
}
