import type { MinihInventorySnapshot, MinihRunSummary } from "./store.js";

export function formatRunSummaryLine(run: MinihRunSummary): string {
	const report = run.report.state === "ready" ? ` report:${run.report.findingsCount}` : "";
	const diagnostics = run.diagnostics.length > 0 ? ` diagnostics:${run.diagnostics.length}` : "";
	return [
		`${run.slug}/${run.runId}`,
		`kind:${run.kind}`,
		`live:${run.status.liveness}`,
		`terminal:${run.status.terminal}`,
		`inside:${run.status.inside}`,
		`outside:${run.status.outside}`,
		`attention:${run.status.attention}${report}${diagnostics}`,
	].join(" ");
}

export function formatInventoryText(snapshot: MinihInventorySnapshot): string {
	const lines = [
		`minih: ${snapshot.runs.length} visible runs (${snapshot.activeCount} active, ${snapshot.staleCount} stale, ${snapshot.completedCount} completed)`,
	];
	for (const run of snapshot.runs) lines.push(formatRunSummaryLine(run));
	if (snapshot.truncated) lines.push("minih: inventory truncated");
	if (snapshot.diagnosticCount > 0) lines.push(`minih: ${snapshot.diagnosticCount} diagnostics`);
	return lines.join("\n");
}
