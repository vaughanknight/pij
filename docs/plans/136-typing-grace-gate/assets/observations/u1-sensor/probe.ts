import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "/Users/jordanknight/.npm-global/lib/node_modules/@oh-my-pi/pi-coding-agent/dist/types/extensibility/extensions/types.d.ts";
import { PiRuntimeAdapter } from "/Users/jordanknight/pi-hacking/fs3-typing-grace-gate-u1/.pi/extensions/pij/adapters/pi-runtime.ts";

const log = (row: Record<string, unknown>) => appendFileSync("/tmp/pij-136-u1-sensor/evidence.jsonl", `${JSON.stringify(row)}\n`);
export default function probe(pi: ExtensionAPI): void {
	let unsubscribe: (() => void) | undefined;
	pi.on("session_start", (_event, ctx) => {
		let keys = 0;
		const adapter = new PiRuntimeAdapter(pi, ctx);
		unsubscribe = adapter.onEditorChange((at) => {
			keys += 1;
			log({ event: "terminal", at, keys });
			if (keys !== 1) return;
			setTimeout(() => {
				const before = keys;
				ctx.ui.setEditorText("PROGRAMMATIC-U1");
				adapter.setStatus("held sensor verified");
				setTimeout(() => log({ event: "programmatic-write", before, after: keys, text: ctx.ui.getEditorText() }), 150);
			}, 100);
		});
		log({ event: "ready" });
		ctx.ui.notify("U1_SENSOR_READY", "info");
	});
	pi.on("session_shutdown", () => { unsubscribe?.(); log({ event: "shutdown" }); });
}
