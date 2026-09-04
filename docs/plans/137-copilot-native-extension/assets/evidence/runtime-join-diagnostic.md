# Native diagnostic API boundary

Current official SDK source https://raw.githubusercontent.com/github/copilot-sdk/main/nodejs/src/session.ts lines2199-2223 defines `async log(message, options?:{level?:"info"|"warning"|"error",ephemeral?:boolean}):Promise<void>` via native `rpc.log`; docs promise session timeline/event stream visibility and persistence for non-ephemeral messages. Using this for `[pij native] unavailable:` once per daemon/key failure episode; sink calls counted in unit tests.

Narrow unresolved boundary: when `joinSession()` itself rejects (or bundled SDK import is unsupported), there is no session object on which to call `session.log`. Current shell catches join failure and reports once to extension stderr, preserving ordinary Copilot; native timeline visibility of that pre-join stderr is not claimed. PM decision requested only for that pre-join unsupported case: accept native CLI's extension-loader error/once stderr as the diagnostic, or provide another documented pre-join sink. No private log-dir or acceptance-file sink added. Daemon/key-absent case occurs after successful join and is not blocked.

Additional environment steering retained: legacy pij CLI minih dependency missing per PM; no dependency repair or lock changes. Native node:test and pij-rs remain the unit tools.

Resolution: PM ruling relayed by NativeSdkScout permits one pre-join extension-stderr `[pij native] unavailable:` (or native loader import failure), with no claim of timeline visibility. Post-join failures use documented session.log. Implemented both; actual shell subprocess fixtures cover rejected join, missing key and unreachable daemon. These fixtures use an explicit SDK seam and do not replace PM's real Copilot terminal witness.
