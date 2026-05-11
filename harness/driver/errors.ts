// harness/driver/errors.ts
//
// Structured driver error hierarchy. Each subclass carries enough context
// that a human or agent reading a stack trace doesn't need to spelunk live
// state. T001 ships the minimal pair tmux.ts needs (DriverError +
// DriverBootError + DriverPaneDeadError). T002 adds the assertion + idle
// timeout classes once session.ts lands.

import type { BootOpts, PaneInfo, Target } from "./tmux.js";

export class DriverError extends Error {
	public override readonly cause?: Error;

	constructor(message: string, cause?: Error) {
		super(message);
		this.name = "DriverError";
		this.cause = cause;
	}
}

export class DriverBootError extends DriverError {
	public readonly opts: BootOpts;

	constructor(opts: BootOpts, cause: Error) {
		super(`boot failed: session=${opts.session} cmd=${opts.cmd}: ${cause.message}`, cause);
		this.name = "DriverBootError";
		this.opts = opts;
	}
}

export class DriverPaneDeadError extends DriverError {
	public readonly target: Target;
	public readonly info: PaneInfo;

	constructor(target: Target, info: PaneInfo) {
		super(`pane ${info.paneId} is dead (last cmd: ${info.cmd}, pid: ${info.pid})`);
		this.name = "DriverPaneDeadError";
		this.target = target;
		this.info = info;
	}
}
