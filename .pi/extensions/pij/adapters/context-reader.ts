// pij-control-plane — fs ContextReaderPort adapter (plan 054 P2 T007).
//
// The impure half of the context gauge: picks WHICH artifact to read per
// harness and reads it; all parsing is core/context/gauge.ts. Every miss —
// no source, unreadable file, nothing usable inside — is an HONEST unknown
// whose provenance names the source attempted (AC-09: real reads or
// `unknown`, never estimates).
//
//  • pi + legacy: the node's own events.ndjson (assistant usage rides the
//    captured message events) — readable from ANY process, which is what a
//    CLI `pij node show <id>` actually is. (The dossier sketched an
//    in-process PiRuntimePort read; that port only exists inside the live pi
//    extension and cannot serve a cross-process CLI — see execution log.)
//  • claude: transcript at the harness layout join (dir(home, folder) +
//    <harnessSessionId>.jsonl).
//  • codex: the persisted absolute rolloutPath (descriptor.transcriptPath).
//  • copilot: NO source exists — always unknown (Finding 08).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type ContextReaderPort,
	claudeContextFromTranscript,
	codexContextFromRollout,
	piContextFromEvents,
} from "../core/context/gauge.js";
import { transcriptDir } from "../core/harness/claude.js";
import type { ContextGauge, SessionDescriptor } from "../core/types.js";

export class FsContextReader implements ContextReaderPort {
	constructor(
		private readonly home: string,
		private readonly now: () => number = () => Date.now(),
	) {}

	current(descriptor: SessionDescriptor): ContextGauge {
		const asOf = new Date(this.now()).toISOString();
		const harness = descriptor.harness ?? "pi";
		if (harness === "copilot") {
			return { value: "unknown", asOf, provenance: "copilot-none" };
		}
		if (harness === "claude") {
			const value =
				descriptor.harnessSessionId === undefined
					? null
					: claudeContextFromTranscript(
							readTextOrEmpty(
								join(
									transcriptDir(this.home, descriptor.folder),
									`${descriptor.harnessSessionId}.jsonl`,
								),
							),
						);
			return { value: value ?? "unknown", asOf, provenance: "claude-transcript" };
		}
		if (harness === "codex") {
			const value =
				descriptor.transcriptPath === undefined
					? null
					: codexContextFromRollout(readTextOrEmpty(descriptor.transcriptPath));
			return { value: value ?? "unknown", asOf, provenance: "codex-rollout" };
		}
		const value = piContextFromEvents(readTextOrEmpty(descriptor.eventsPath));
		return { value: value ?? "unknown", asOf, provenance: "pi-events" };
	}
}

function readTextOrEmpty(path: string): string {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return ""; // absent/unreadable → the parser reports null → honest unknown
	}
}
