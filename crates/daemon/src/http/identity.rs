//! Identity routes (plan 114, u-identity): `adopt`, `whoami`, `phonehome`.
//!
//! # One rule holds this module together
//!
//! **Caller context is a CLAIM. Identity is DERIVED, or it is refused.**
//!
//! Everything the caller says arrives over HTTP from a process the daemon cannot
//! see. So a claimed pane is checked against tmux, a claimed pid is only ever
//! believed PAIRED with a start time the liveness port observes independently
//! (a pid alone is recycled at boot), and a claimed seat id can LOCATE a row but
//! can never CREATE one and can never win an argument with what tmux says. This
//! platform has already paid for the opposite: an unvalidated `PIJ_SESSION_ID`
//! minted phantom seats and let one seat write as another.
//!
//! # Two smaller rules that are not style
//!
//! 1. **Every refusal carries a decodable envelope, never a bare 404.** The
//!    generation shim classifies `404`/`405` with an undecodable body as "rs does
//!    not implement this route" and falls back to LEGACY. A bare refusal here
//!    would therefore not be a refusal at all — it would silently re-home the
//!    seat into the other store while every surface reported success.
//! 2. **A success answer is READ BACK FROM THE STORE.** The TS route this ports
//!    prints `adopted <id> … (pane %N, bound)` on a dissolved descriptor and
//!    persists nothing. Answering from a re-read makes that class of defect
//!    unrepresentable rather than merely tested-against.

use axum::extract::{Json, Query, State};
use axum::http::StatusCode;
use axum::response::Response;
use pij_core::model::{Envelope, ProcIdentity, SeatDescriptor, SeatId};
use pij_core::ports::SeatFilter;
use serde::{Deserialize, Serialize};

use super::{AppState, Registration, allocate_memorable_id, envelope, internal, refused};
use crate::registration::{RegistrationError, RegistrationService};

/// The caller's environment, forwarded by the shim as a FIXED ALLOWLIST.
///
/// THREE SPELLINGS, and the third one is a scar. The shim sends camelCase
/// (`CALLER_WIRE_KEYS`, generation-routing.ts:242); the env NAMES are
/// SCREAMING_SNAKE; the `pij-rs` CLI uses snake_case. All three are accepted.
///
/// This reader originally accepted only the last two, because the wire contract
/// was distributed as PROSE — a flat list of the ENV names — while the TS source
/// held PAIRS of (env name, wire name). Six of nine keys never met. The block
/// deserialized to ALL-NONE, `whoami` and `phonehome` could not name a seat, and
/// BOTH SUITES STAYED GREEN because each side asserted its own spelling. serde
/// drops unknown fields in silence, so nothing anywhere failed.
///
/// The lesson is not "add an alias". It is that a cross-runtime contract living
/// in prose has one definition per reader, each self-consistent. The contract now
/// lives in `crates/daemon/tests/fixtures/caller-context.wire.json`, which both
/// runtimes read, and both halves assert on POPULATED values so neither can pass
/// vacuously.
///
/// Every field is a CLAIM. None of them is trusted on its own.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CallerContext {
    /// The seat the caller believes it is. LOCATES a row; never creates one.
    #[serde(
        default,
        rename = "PIJ_SESSION_ID",
        alias = "pij_session_id",
        alias = "pijSessionId"
    )]
    pub session_id: Option<String>,
    /// The pane the caller believes it occupies. CHECKED against tmux.
    #[serde(default, rename = "TMUX_PANE", alias = "tmux_pane", alias = "tmuxPane")]
    pub pane: Option<String>,
    /// The governing seat, self-declared at adoption.
    #[serde(
        default,
        rename = "PIJ_PARENT_ID",
        alias = "pij_parent_id",
        alias = "pijParentId"
    )]
    pub parent: Option<String>,
    /// Harness-native session ids.
    ///
    /// rs has NO column for these and does not bind by them — it binds by
    /// `(pid, proc_start)`, which it observes itself. They are declared here so
    /// that `phonehome` can SAY SO when one is supplied: the TS route binds
    /// exactly this value at exactly this moment, and a caller who sent one and
    /// got a bare "bound" back would reasonably conclude rs had pinned their
    /// native session. Naming the difference is the whole point.
    #[serde(
        default,
        rename = "CLAUDE_CODE_SESSION_ID",
        alias = "claude_code_session_id",
        alias = "claudeCodeSessionId"
    )]
    pub claude_session: Option<String>,
    /// See `claude_session`.
    #[serde(
        default,
        rename = "COPILOT_AGENT_SESSION_ID",
        alias = "copilot_agent_session_id",
        alias = "copilotAgentSessionId"
    )]
    pub copilot_session: Option<String>,
    /// See `claude_session`.
    #[serde(
        default,
        rename = "CODEX_THREAD_ID",
        alias = "codex_thread_id",
        alias = "codexThreadId"
    )]
    pub codex_session: Option<String>,
    /// The caller's working folder. Used only when no pane can supply one.
    #[serde(default)]
    pub cwd: Option<String>,
    /// Claimed pid. Only ever believed together with `proc_start`, and only
    /// after the liveness port observes the same start time.
    #[serde(default)]
    pub pid: Option<u32>,
    /// Claimed process start stamp.
    #[serde(default, rename = "procStart", alias = "proc_start")]
    pub proc_start: Option<u64>,
}

/// The body every identity route accepts.
///
/// `argv` is what the generation shim forwards verbatim; the explicit fields are
/// what the `pij-rs` CLI sends. Both are supported by the same handler so the
/// shim's fix is purely additive and neither caller is a second implementation.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct IdentityRequest {
    /// The typed command line, verb included.
    #[serde(default)]
    pub argv: Vec<String>,
    /// The caller's forwarded environment.
    #[serde(default)]
    pub caller: Option<CallerContext>,
    /// Explicit seat, for the read verbs.
    #[serde(default)]
    pub seat: Option<String>,
    /// Explicit pane, for the read verbs.
    #[serde(default)]
    pub pane: Option<String>,
    /// A caller trying to NAME the seat. Refused — see `ac-1147`.
    #[serde(default)]
    pub id: Option<String>,
}

/// `?seat=&pane=` for the read verbs.
///
/// Accepted on GET as well as POST deliberately. The route table flips `whoami`
/// to POST, but a shim that has not yet been updated still sends GET — and axum
/// would answer that `405` with an EMPTY body, which the shim classifies as
/// route-absence and falls back to legacy. Serving both methods turns that
/// silent re-homing into a decodable answer.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct IdentityQuery {
    /// Asserted seat id. Locates a row; never creates one.
    #[serde(default)]
    pub seat: Option<String>,
    /// Pane to derive from. MUST be percent-encoded: every pane id starts with
    /// `%`, so a raw `?pane=%77` decodes to `pane=w`.
    #[serde(default)]
    pub pane: Option<String>,
}

/// What `phonehome` answers: a CONFIRMATION of a binding adopt already made.
#[derive(Debug, Serialize, Deserialize)]
pub struct Phonehome {
    /// The seat this confirms.
    pub seat: SeatId,
    /// Its harness, as the store holds it.
    pub harness: String,
    /// Its pane, when it has one.
    pub pane: Option<String>,
    /// Is the process this seat was bound to still the process that is running?
    ///
    /// NOT "did something answer". The pair `(pid, proc_start)` is re-observed:
    /// a recycled pid presents as a live process at the same number and a
    /// DIFFERENT start, and reporting that as bound is the false-live bug.
    pub bound: bool,
    /// The bound pid, when the seat is bound.
    pub pid: Option<u32>,
    /// The start stamp recorded at bind time.
    pub proc_start: Option<u64>,
    /// The start stamp observed NOW. Differs from `proc_start` exactly when the
    /// pid was recycled — the one case a pid-only check cannot see.
    pub observed_proc_start: Option<u64>,
    /// How this seat was identified, so a reader can tell a derived answer from
    /// a merely-existing one.
    pub resolved_by: String,
    /// What rs bound by. Constant, and stated rather than assumed: a caller
    /// arriving from the TS route expects a harness-native session id here.
    pub bound_by: String,
}

/// The bind evidence rs actually holds.
const BOUND_BY: &str = "process identity (pid paired with proc_start), observed by the daemon";

/// How a seat was identified for a read verb.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ResolvedBy {
    /// Matched against a pane, which the daemon can check.
    Pane,
    /// Matched a caller-asserted id that exists. Existence is all that was proven.
    AssertedId,
}

impl ResolvedBy {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Pane => "pane (derived)",
            Self::AssertedId => "asserted seat id (existence checked only)",
        }
    }
}

/// What an `adopt` command line said.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct AdoptArgs {
    /// The pane to adopt, when the pane form was used.
    pub pane: Option<String>,
    /// The declared harness.
    pub harness: Option<String>,
    /// The declared governing seat.
    pub parent: Option<String>,
    /// True for the paneless `inbox register` form the ready route uses when a
    /// seat has no `$TMUX_PANE`.
    pub paneless: bool,
}

/// Parse the argv the shim forwards.
///
/// Pure, and separated from the handler so the shapes can be tested without a
/// daemon. An unknown flag is REFUSED BY NAME rather than ignored: silently
/// dropping `--session-id` would let a caller believe it had pinned a native
/// session that rs never stored.
pub(crate) fn parse_adopt_argv(argv: &[String]) -> Result<AdoptArgs, String> {
    let mut args = AdoptArgs::default();
    let mut tokens = argv.iter().map(String::as_str).peekable();
    match tokens.peek().copied() {
        Some("adopt") => {
            tokens.next();
        }
        Some("inbox") => {
            tokens.next();
            if tokens.next() != Some("register") {
                return Err(
                    "the only `inbox` form this route serves is `inbox register`".to_string(),
                );
            }
            args.paneless = true;
        }
        _ => {}
    }
    while let Some(token) = tokens.next() {
        match token {
            "--harness" => {
                args.harness = Some(
                    tokens
                        .next()
                        .ok_or_else(|| "--harness needs a value".to_string())?
                        .to_string(),
                );
            }
            "--parent" => {
                args.parent = Some(
                    tokens
                        .next()
                        .ok_or_else(|| "--parent needs a value".to_string())?
                        .to_string(),
                );
            }
            // Output-shape flags. They change how a CLI prints, and this route
            // does not print — accepting them is honest, storing them is not.
            "--json" | "--export" => {}
            "--session-id" => {
                return Err(
                    "rs does not store a harness-native session id, so `--session-id` cannot be \
                     honoured — refusing by name rather than accepting it and differing silently"
                        .to_string(),
                );
            }
            flag if flag.starts_with("--") => {
                return Err(format!(
                    "`{flag}` is not an argument this route understands"
                ));
            }
            positional if args.pane.is_none() && !args.paneless => {
                args.pane = Some(positional.to_string());
            }
            positional => {
                return Err(format!("unexpected argument `{positional}`"));
            }
        }
    }
    Ok(args)
}

const ADOPT: &str = "pij adopt";
const WHOAMI: &str = "pij whoami";
const PHONEHOME: &str = "pij phonehome";

/// `POST /v1/adopt` — register this seat, with rs minting the name.
pub(crate) async fn adopt(
    State(state): State<AppState>,
    Json(request): Json<IdentityRequest>,
) -> Response {
    if let Some(asserted) = request.id.as_deref() {
        // ac-1147: ONE MINTER, and it is here. `register` keeps the
        // caller-supplied case for callers that legitimately hold a name; adopt
        // never does, because two minters are two namespaces.
        return refused(
            ADOPT,
            format!(
                "adopt does not accept a caller-supplied id (`{asserted}`): rs mints the seat name. \
                 Use `register` for the explicit case."
            ),
        );
    }
    let caller = request.caller.unwrap_or_default();
    let args = match parse_adopt_argv(&request.argv) {
        Ok(args) => args,
        Err(reason) => return refused(ADOPT, reason),
    };
    let pane = request
        .pane
        .or(args.pane)
        .or_else(|| caller.pane.clone())
        .filter(|pane| !pane.trim().is_empty());
    let Some(harness) = args.harness.clone() else {
        return refused(
            ADOPT,
            "adopt needs `--harness <claude|copilot|codex|omp>` — the harness is declared, never guessed",
        );
    };

    // Derive folder and process identity. This is the whole difference between a
    // registration and an assertion.
    let (folder, proc) = if let Some(pane) = pane.as_deref() {
        let observed = match state.services.tmux.pane_process(pane).await {
            Ok(observed) => observed,
            Err(error) => return internal(ADOPT, error),
        };
        let Some(observed) = observed else {
            return refused(
                ADOPT,
                format!(
                    "pane `{pane}` is not running anything tmux can see — the descriptor is \
                     dissolved and NOTHING was written. Re-run from a live pane, or \
                     `pij-rs revive` the seat onto this one."
                ),
            );
        };
        // The start time comes from a DIFFERENT observer than the pid. That is
        // the point: pids are recycled at boot, so the pair is the identity.
        let start = match state.services.liveness.proc_start(observed.pid).await {
            Ok(start) => start,
            Err(error) => return internal(ADOPT, error),
        };
        let Some(proc_start) = start else {
            return refused(
                ADOPT,
                format!(
                    "tmux reports pid {} on pane `{pane}` but the process is already gone — \
                     nothing was written",
                    observed.pid
                ),
            );
        };
        (
            observed.cwd,
            Some(ProcIdentity {
                pid: observed.pid,
                proc_start,
            }),
        )
    } else {
        // The paneless form. There is no pane to derive from, so the folder must
        // be stated, and a process identity is believed only when the caller
        // supplies the PAIR — `RegistrationService` then re-observes it and
        // refuses a mismatch.
        let Some(folder) = caller.cwd.clone().filter(|cwd| !cwd.trim().is_empty()) else {
            return refused(
                ADOPT,
                "a paneless registration must state its folder (`caller.cwd`): with no pane there \
                 is nothing to derive one from",
            );
        };
        let proc = match (caller.pid, caller.proc_start) {
            (Some(pid), Some(proc_start)) => ProcIdentity { pid, proc_start },
            (None, None) => {
                // rs ADMISSION requires bind evidence for every registration
                // (`RefusalReason::NoBindEvidence`) — the control that stops a
                // subagent from claiming a seat it cannot prove it is. With no
                // pane there is nothing to derive from, so a paneless caller that
                // names no process cannot be admitted, and weakening admission to
                // let it in would retire an anti-impersonation control to serve a
                // convenience. Refused by name, with what it would take.
                return refused(
                    ADOPT,
                    "a paneless registration needs a process identity rs can corroborate: send \
                     `caller.pid` WITH `caller.procStart`. rs admits no seat without bind \
                     evidence, and with no pane there is nothing to derive it from. A seat that \
                     cannot supply one stays where it already lives — it is not re-homed here.",
                );
            }
            _ => {
                return refused(
                    ADOPT,
                    "a claimed pid must travel with its start stamp — a pid alone is recycled at \
                     boot and is not an identity",
                );
            }
        };
        (folder, Some(proc))
    };

    let seats = match state.services.registry.list(SeatFilter::default()).await {
        Ok(seats) => seats,
        Err(error) => return internal(ADOPT, error),
    };
    // Adopt INTO the seat that already owns this pane rather than minting a
    // second id for it. The TS route grew this the hard way (its plan-071 defect
    // B): without it, a re-adopt leaves two descriptors for one pane and peers
    // address the dead one.
    let incumbent = pane.as_deref().and_then(|pane| {
        seats
            .iter()
            .find(|seat| seat.tombstoned_at.is_none() && seat.pane.as_deref() == Some(pane))
    });
    let seat_id = match incumbent {
        Some(seat) => seat.id.clone(),
        None => {
            let seed = format!(
                "adopt:{harness}:{}:{}",
                pane.as_deref().unwrap_or("paneless"),
                proc.map_or(0, |proc| proc.pid)
            );
            match allocate_memorable_id(&*state.services.registry, &seed).await {
                Ok(Some(id)) => id,
                Ok(None) => {
                    return refused(ADOPT, "every memorable name is taken");
                }
                Err(error) => return internal(ADOPT, error),
            }
        }
    };

    // req-0008: an omitted argument means UNSAID, not CLEARED. `register`
    // overwrites `parent` and `relay` from the claim, so adopt carries the
    // incumbent's values forward when the command line was silent about them.
    let parent = args
        .parent
        .or_else(|| caller.parent.clone())
        .map(SeatId::from)
        .or_else(|| incumbent.and_then(|seat| seat.parent.clone()));
    let claim = Registration {
        supersedes: None,
        id: seat_id.0.clone(),
        harness,
        folder,
        pane: pane.clone(),
        pid: proc.map(|proc| proc.pid),
        proc_start: proc.map(|proc| proc.proc_start),
        spawn_id: None,
        model: None,
        provider: None,
        effort: None,
        parent,
        relay: incumbent.is_some_and(|seat| seat.relay),
    };
    let registration = RegistrationService::new(
        std::sync::Arc::clone(&state.services.registry),
        std::sync::Arc::clone(&state.services.liveness),
    );
    if let Err(error) = registration.register(claim).await {
        return match error {
            RegistrationError::Refused(reason) => refused(ADOPT, reason),
            RegistrationError::Runtime(error) => internal(ADOPT, error),
        };
    }

    // THE ANSWER IS A RE-READ. Not the descriptor we just built — the row the
    // store actually holds. A success line that persists nothing cannot be
    // expressed from here.
    match state.services.registry.get(&seat_id).await {
        Ok(Some(persisted)) => {
            let mut answer = Envelope::ok(ADOPT, persisted);
            // Found by running the real gesture: the caller's environment still
            // holds whatever id it had BEFORE this mint. A seat already
            // registered elsewhere then asks `whoami`, its stale
            // `PIJ_SESSION_ID` contradicts the pane, and the impersonation guard
            // correctly refuses — leaving a seat that adopted successfully
            // unable to name itself. The id is the one thing the caller cannot
            // derive, so adopt hands it back with the line that fixes it.
            answer.meta = Some(format!(
                "export PIJ_SESSION_ID={seat_id} — this shell still carries whatever id it had                  before, and an id that contradicts the pane is refused, not preferred"
            ));
            envelope(StatusCode::OK, &answer)
        }
        Ok(None) => internal(
            ADOPT,
            format!(
                "registration reported success but no row for `{seat_id}` exists — refusing to \
                 report an adoption that did not persist"
            ),
        ),
        Err(error) => internal(ADOPT, error),
    }
}

/// `GET|POST /v1/whoami` — name the seat this caller is, or refuse.
pub(crate) async fn whoami_get(
    State(state): State<AppState>,
    Query(query): Query<IdentityQuery>,
) -> Response {
    whoami_resolved(state, query.seat, query.pane).await
}

/// See [`whoami_get`]. The POST arm is the canonical one once the shim forwards
/// caller context.
pub(crate) async fn whoami_post(
    State(state): State<AppState>,
    Json(request): Json<IdentityRequest>,
) -> Response {
    let caller = request.caller.unwrap_or_default();
    whoami_resolved(
        state,
        request.seat.or(caller.session_id),
        request.pane.or(caller.pane),
    )
    .await
}

async fn whoami_resolved(
    state: AppState,
    asserted: Option<String>,
    pane: Option<String>,
) -> Response {
    match resolve_seat(&state, WHOAMI, asserted, pane).await {
        Resolved::Seat(descriptor, _) => {
            envelope(StatusCode::OK, &Envelope::ok(WHOAMI, descriptor))
        }
        Resolved::Refusal(response) => response,
    }
}

/// The identity ladder's answer.
///
/// A plain enum rather than `Result<_, Response>`: an axum `Response` is a large
/// error variant, and the two arms are not success-and-failure anyway — "no seat
/// resolved" is an answer this route gives on purpose.
enum Resolved {
    /// The seat, and what identified it.
    Seat(SeatDescriptor, ResolvedBy),
    /// The refusal to send back, already an envelope.
    Refusal(Response),
}

/// `POST /v1/phonehome` — confirm the binding adopt already made.
pub(crate) async fn phonehome(
    State(state): State<AppState>,
    Query(query): Query<IdentityQuery>,
    Json(request): Json<IdentityRequest>,
) -> Response {
    let caller = request.caller.unwrap_or_default();
    let asserted = request.seat.or(query.seat).or(caller.session_id);
    let pane = request.pane.or(query.pane).or(caller.pane);
    let (descriptor, resolved_by) = match resolve_seat(&state, PHONEHOME, asserted, pane).await {
        Resolved::Seat(descriptor, resolved_by) => (descriptor, resolved_by),
        Resolved::Refusal(response) => return response,
    };
    // Re-observe rather than re-derive. `adopt` bound this seat synchronously, so
    // there is nothing to poll for: the only open question is whether the process
    // it bound is still the process that is there.
    let observed = match descriptor.proc {
        Some(proc) => match state.services.liveness.proc_start(proc.pid).await {
            Ok(observed) => observed,
            Err(error) => return internal(PHONEHOME, error),
        },
        None => None,
    };
    let bound = descriptor
        .proc
        .is_some_and(|proc| observed == Some(proc.proc_start));
    // A caller that sent a harness-native session id is told plainly that rs did
    // not bind by it. Silence here would read as agreement.
    let claimed_harness_session = caller
        .claude_session
        .as_deref()
        .or(caller.copilot_session.as_deref())
        .or(caller.codex_session.as_deref())
        .map(str::trim)
        .filter(|session| !session.is_empty());
    let mut answer = Envelope::ok(
        PHONEHOME,
        Phonehome {
            seat: descriptor.id.clone(),
            harness: descriptor.harness.to_string(),
            pane: descriptor.pane.clone(),
            bound,
            pid: descriptor.proc.map(|proc| proc.pid),
            proc_start: descriptor.proc.map(|proc| proc.proc_start),
            observed_proc_start: observed,
            resolved_by: resolved_by.as_str().to_string(),
            bound_by: BOUND_BY.to_string(),
        },
    );
    if let Some(session) = claimed_harness_session {
        answer.meta = Some(format!(
            "the caller supplied harness session `{session}`; rs does not store one and did not bind by it — this confirmation is process identity, not a native-session pin"
        ));
    }
    envelope(StatusCode::OK, &answer)
}

/// The identity ladder, shared by the read verbs.
///
/// Strictest evidence first. A pane can be checked against tmux and the roster;
/// an asserted id can only be checked for EXISTENCE. When both are present and
/// they disagree, the assertion loses — that disagreement is what impersonation
/// looks like, and preferring the claim is how one seat comes to answer as
/// another.
async fn resolve_seat(
    state: &AppState,
    command: &str,
    asserted: Option<String>,
    pane: Option<String>,
) -> Resolved {
    let asserted = asserted.filter(|id| !id.trim().is_empty());
    let pane = pane.filter(|pane| !pane.trim().is_empty());
    if asserted.is_none() && pane.is_none() {
        return Resolved::Refusal(refused(
            command,
            "no caller context reached rs, so there is no seat to name. This route needs a pane \
             (`?pane=%N`, or `caller.TMUX_PANE`) or a seat id (`?seat=<id>`, or \
             `caller.PIJ_SESSION_ID`). Refusing rather than guessing: with one seat in the store \
             a guess would even look right.",
        ));
    }
    if let Some(pane) = pane.as_deref() {
        let seats = match state.services.registry.list(SeatFilter::default()).await {
            Ok(seats) => seats,
            Err(error) => return Resolved::Refusal(internal(command, error)),
        };
        let Some(seat) = seats
            .into_iter()
            .find(|seat| seat.tombstoned_at.is_none() && seat.pane.as_deref() == Some(pane))
        else {
            return Resolved::Refusal(refused(
                command,
                format!(
                    "no live seat in the rs store owns pane `{pane}` — this seat is not registered \
                     here. Run `pij adopt \"$TMUX_PANE\" --harness <h>` first."
                ),
            ));
        };
        if let Some(asserted) = asserted.as_deref()
            && asserted != seat.id.0
        {
            return Resolved::Refusal(refused(
                command,
                format!(
                    "the caller claims to be `{asserted}` but pane `{pane}` belongs to `{}` — \
                     refusing rather than answering for either. An asserted id never outranks an \
                     observable one.",
                    seat.id
                ),
            ));
        }
        return Resolved::Seat(seat, ResolvedBy::Pane);
    }
    let asserted = SeatId::from(asserted.expect("one of the two is present"));
    match state.services.registry.get(&asserted).await {
        Ok(Some(seat)) => Resolved::Seat(seat, ResolvedBy::AssertedId),
        // NOT a mint, and not a 404: an id that names nothing is a refusal with a
        // reason, and the store is untouched.
        Ok(None) => Resolved::Refusal(refused(
            command,
            format!(
                "`{asserted}` names no seat in the rs store. An asserted id is a claim, never an \
                 identity — nothing was created for it."
            ),
        )),
        Err(error) => Resolved::Refusal(internal(command, error)),
    }
}
