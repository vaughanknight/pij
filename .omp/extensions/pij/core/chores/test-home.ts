import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

export function assertTempPijHome(): string {
	const configured = process.env.PIJ_HOME;
	if (!configured) {
		throw new Error("chore tests require PIJ_HOME to be set to a temporary directory");
	}
	const resolved = resolve(configured);
	const tempRoots = new Set([resolve(tmpdir()), realpathSync(tmpdir())]);
	const isTemporary = [...tempRoots].some(
		(tempRoot) => resolved === tempRoot || resolved.startsWith(`${tempRoot}${sep}`),
	);
	if (!isTemporary) {
		throw new Error(`chore tests refuse non-temp PIJ_HOME: ${resolved}`);
	}
	return resolved;
}
