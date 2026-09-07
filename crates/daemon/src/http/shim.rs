//! The **shim-originated** endpoints (plan 119).
//!
//! # Why these are separate routes rather than fields on `/v1/send` and `/v1/inbox`
//!
//! The `pij` CLI's generation shim posts one body shape for every routed verb —
//! `{argv, caller}` (`adapters/generation-router.ts`, `callRs`). `/v1/send` and
//! `/v1/inbox` speak a different language: `SendRequest` wants a caller-supplied
//! `from`, and `InboxQuery` wants a caller-supplied `seat`.
//!
//! The obvious repair — add `caller` to those structs and make `from`/`seat`
//! optional — was REJECTED by the reviewer, and its reason is the one that
//! matters and is not the obvious one. **Those structs tolerate unknown fields.**
//! Measured against the live daemon on 2026-09-01:
//!
//! ```text
//! POST /v1/send {"to":…,"body":…,"msg_id":…,"caller":{"tmuxPane":"%2159"}}
//!   -> 422 "missing field `from`"        <- it failed on `from`, NOT on `caller`
//! ```
//!
//! So an older daemon handed the additive shape does not reject it. It accepts
//! the asserted `from` and **silently discards the caller evidence that exists
//! to constrain it** — the tolerance that looks like forward-compatibility is
//! exactly what makes the additive path unsafe. Overloading fails QUIETLY.
//!
//! A distinct path fails LOUDLY in the direction that matters, and gracefully in
//! the direction that does not:
//!
//! * **Daemon older than this route** — axum answers 404 with an EMPTY body,
//!   which the shim classifies as route-absence and falls back to legacy. Skew
//!   across the endpoint's birth degrades safely, by itself.
//! * **Shim newer than this daemon** — [`ShimRequest`] is
//!   `deny_unknown_fields`, so a field this version does not understand is
//!   REFUSED rather than dropped. That is the direct answer to the reviewer's
//!   third ladder-is-wrong condition: *compatibility must never let a handler
//!   accept the request while ignoring caller evidence.*
//!
//! # What the ladder does here, and what it does not
//!
//! It is **subject resolution only** — never the routing mechanism, and never an
//! authority for the act. `identity::resolve_seat` takes the pane as its
//! strictest evidence, checks it against the live roster, and refuses when a
//! pane and an asserted id DISAGREE rather than preferring the claim. Leniency
//! about ABSENT evidence is not leniency about CONTRADICTED evidence.
//!
//! # Every refusal here answers 400 with an envelope
//!
//! Never a bare 404: the shim reads "404/405 with a body that does not decode as
//! a pij envelope" as ROUTE ABSENCE and falls back to legacy. A refusal wearing
//! that shape would silently re-home the caller into the other store while every
//! surface reported success.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use axum::extract::State;
use axum::response::Response;
use pij_core::model::{Harness, SeatId};
use pij_core::ports::SeatFilter;

use super::identity::{self, CallerContext, Resolved};
use super::{AppState, envelope, internal, refused};

pub(crate) const SEND: &str = "pij send";
pub(crate) const INBOX: &str = "pij inbox";

pub(crate) const SESSIONS: &str = "pij sessions";

#[derive(serde::Serialize)]
struct SessionRows {
    rows: Vec<SessionRow>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionRow {
    pij_id: SeatId,
    harness: Harness,
    harness_session_id: Option<String>,
    git_common_dir: String,
    lifecycle: Option<String>,
    bound_model: Option<String>,
    spawned_by: Option<SeatId>,
    transcript_path: Option<String>,
    generation: &'static str,
}

/// Return rs seats in the frozen legacy session-row shape.
///
/// # Composition recipe
///
/// Add a GET `Endpoint::ShimSessions` row at `/v1/shim/sessions` and route it
/// directly to this handler. The TypeScript composer unions these rows with its
/// legacy rows; rs does not translate them again.
pub(crate) async fn shim_sessions(State(state): State<AppState>) -> Response {
    let seats = match state.services.registry.list(SeatFilter::default()).await {
        Ok(seats) => seats,
        Err(error) => return internal(SESSIONS, error),
    };
    let mut git_common_dirs = HashMap::new();
    let rows = seats
        .into_iter()
        .filter(|seat| seat.tombstoned_at.is_none())
        .map(|seat| {
            let git_common_dir = git_common_dirs
                .entry(seat.folder.clone())
                .or_insert_with(|| git_common_dir(Path::new(&seat.folder)))
                .clone();
            SessionRow {
                git_common_dir,
                pij_id: seat.id,
                harness: seat.harness,
                harness_session_id: seat.harness_session,
                lifecycle: None,
                bound_model: seat.model,
                spawned_by: seat.parent,
                transcript_path: None,
                generation: "rs",
            }
        })
        .collect();
    envelope(
        axum::http::StatusCode::OK,
        &pij_core::model::Envelope::ok(SESSIONS, SessionRows { rows }),
    )
}

fn git_common_dir(folder: &Path) -> String {
    discover_git_common_dir(folder)
        .unwrap_or_else(|| folder.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

fn discover_git_common_dir(folder: &Path) -> Option<PathBuf> {
    for directory in folder.ancestors() {
        let dot_git = directory.join(".git");
        if dot_git.is_dir() {
            return Some(std::fs::canonicalize(&dot_git).unwrap_or(dot_git));
        }
        if !dot_git.is_file() {
            continue;
        }
        let pointer = std::fs::read_to_string(&dot_git).ok()?;
        let git_dir = pointer.trim().strip_prefix("gitdir:")?.trim();
        let git_dir = resolve_path(directory, Path::new(git_dir));
        let common = std::fs::read_to_string(git_dir.join("commondir"))
            .ok()
            .and_then(|value| {
                let value = value.trim();
                (!value.is_empty()).then(|| resolve_path(&git_dir, Path::new(value)))
            })
            .unwrap_or(git_dir);
        return Some(std::fs::canonicalize(&common).unwrap_or(common));
    }
    None
}

fn resolve_path(base: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    }
}

/// The one body every shim-originated route accepts.
///
/// `deny_unknown_fields` is load-bearing — see the module header. It is the
/// property that makes this endpoint fail loudly where an overload would fail
/// quietly, so it is not tidy-up and must not be removed.
///
/// KNOWN RESIDUAL, stated rather than hidden: [`CallerContext`] itself stays
/// field-tolerant, because it is shared with the `/v1` identity routes and
/// giving this endpoint a private copy would be two names for one wire object —
/// the split-brain this whole generation split exists to remove. So a *newer*
/// shim that adds a field INSIDE `caller` still has it silently ignored. The
/// versioned path is the primary guarantee; this is the secondary one, and it
/// covers the outer envelope only.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ShimRequest {
    /// `process.argv.slice(2)`, verbatim, exactly as the caller typed it.
    pub argv: Vec<String>,
    /// Forwarded environment. A CLAIM, never an identity: every field is checked
    /// against something the daemon can observe.
    #[serde(default)]
    pub caller: Option<CallerContext>,
    /// The literal body bytes for `pij send <id> --body-file <path|->`.
    ///
    /// Read by the CALLER and sent whole, because only the caller can read it:
    /// the path is relative to the caller's cwd, `-` is the caller's stdin, and
    /// the daemon may not share either. The body is NEVER a token this parser
    /// sees — it does not pass through argv at all — which is deliberate: on the
    /// TypeScript side a body re-appended to argv and re-parsed made a body
    /// starting `--` into a FLAG, and `--wait` silently swallowed a whole file
    /// (`cli.ts`, plan 093 D4). Same defect, avoided the same way.
    #[serde(default)]
    pub body_literal: Option<String>,
}

/// One parsed `pij send` invocation, in the only shapes rs serves.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SendCall {
    pub to: SeatId,
    pub body: String,
    pub command: Option<String>,
}

/// Parse a body send or one allowlisted, bodyless control command.
///
/// Derived from the TypeScript surface callers actually hit
/// (`.pi/extensions/pij/cli.ts:354`), not from a description of it:
///
/// ```text
/// pij send <id> "<text>" | <id> --body-file <path|-> | --to <id> --to <id> "<text>"
///          | <id> --command <name> [--wait]
/// ```
///
/// Unsupported broadcast, attachment and wait shapes refuse by name.
pub(crate) fn parse_send(argv: &[String], body_literal: Option<&str>) -> Result<SendCall, String> {
    let mut tokens = argv.iter().map(String::as_str);
    match tokens.next() {
        Some("send") => {}
        Some(other) => return Err(format!("'{other}' is not the send verb")),
        None => return Err("usage: pij send <id> \"<text>\"".to_string()),
    }

    let mut positionals: Vec<&str> = Vec::new();
    let mut saw_body_file = false;
    let mut command = None;
    let mut rest = tokens.collect::<Vec<_>>().into_iter().peekable();
    while let Some(token) = rest.next() {
        let flag = token
            .strip_prefix("--")
            .map(|name| match name.split_once('=') {
                Some((head, _)) => head,
                None => name,
            });
        let Some(name) = flag else {
            positionals.push(token);
            continue;
        };
        match name {
            // Served, and its VALUE is consumed here but never used: the bytes
            // travel in `body_literal`, read by the caller.
            "body-file" => {
                saw_body_file = true;
                if !token.contains('=') {
                    rest.next();
                }
            }
            // `--json` is answered by the shim's own projection layer, not here.
            "json" => {}
            "to" => {
                return Err(
                    "rs cannot serve a broadcast `pij send --to <id> --to <id>`: it fans one \
                     typed message out to many recipients as several sends, and rs's endpoint \
                     accepts exactly one destination. Send them individually, or use \
                     PIJ_DAEMON_GENERATION=legacy."
                        .to_string(),
                );
            }
            "command" => {
                if command.is_some() {
                    return Err(
                        "E-RS-CONTROL-INVALID: --command may be supplied only once".to_string()
                    );
                }
                let value = token
                    .split_once('=')
                    .map(|(_, value)| value)
                    .or_else(|| rest.next());
                command = Some(
                    value
                        .ok_or_else(|| "E-RS-CONTROL-INVALID: --command needs a name".to_string())?
                        .to_string(),
                );
            }
            "file" | "caption" => {
                return Err(format!(
                    "rs cannot serve `pij send --{name}`: it attaches a path BY REFERENCE and \
                     only a pull/telegram peer renders it. rs has no attachment model, and \
                     dropping the attachment while reporting the send as sent would be worse \
                     than refusing. Use --body-file to send a file's CONTENTS."
                ));
            }
            "wait" => {
                return Err(
                    "rs cannot serve `pij send --wait`: it blocks the sender on a reply, which \
                     is a legacy inbox affordance rs has no equivalent for."
                        .to_string(),
                );
            }
            other => return Err(format!("unknown send flag `--{other}`")),
        }
    }

    let Some(to) = positionals.first() else {
        return Err("usage: pij send <id> \"<text>\" (no recipient was given)".to_string());
    };

    if let Some(command) = command {
        if saw_body_file {
            return Err(
                "E-RS-CONTROL-BODY: --command and --body-file are mutually exclusive".to_string(),
            );
        }
        if positionals.len() > 2 {
            return Err(
                "E-RS-CONTROL-BODY: --command cannot carry extra positional text".to_string(),
            );
        }
        pij_core::control::validate_command(
            &command,
            positionals.get(1).copied().unwrap_or_default(),
        )?;
        if let Some(body) = body_literal {
            pij_core::control::validate_command(&command, body)?;
        }
        return Ok(SendCall {
            to: SeatId::from(*to),
            body: String::new(),
            command: Some(command),
        });
    }
    // The two body channels are exclusive, and BOTH must be refused rather than
    // silently preferring one — a caller who typed both has a mistaken model of
    // which one is being sent, and picking for them hides it.
    let inline = positionals.get(1).copied();
    let body = match (saw_body_file, body_literal, inline) {
        (true, _, Some(_)) => {
            return Err(
                "--body-file replaces the body — drop the inline text (pij send <id> \
                 --body-file <path>)"
                    .to_string(),
            );
        }
        (true, Some(literal), None) => literal.to_string(),
        (true, None, None) => {
            return Err(
                "--body-file was typed but no body reached rs. The caller reads the file and \
                 forwards its bytes; this request carried none."
                    .to_string(),
            );
        }
        (false, _, Some(text)) => text.to_string(),
        (false, _, None) => {
            return Err("usage: pij send <id> \"<text>\" (no body was given)".to_string());
        }
    };

    if positionals.len() > 2 {
        return Err(format!(
            "pij send takes one recipient and one body; {} positional arguments were given. \
             Quote the body.",
            positionals.len()
        ));
    }

    Ok(SendCall {
        to: SeatId::from(*to),
        body,
        command: None,
    })
}

/// `POST /v1/shim/send` — one message, sender DERIVED.
///
/// The sender is never asserted. `from` on `/v1/send` is a caller-supplied field
/// with no derivation path, which is the same hole plan 117 closed on `report`:
/// a hand-started seat has no `PIJ_SESSION_ID` to assert, so the verb refused
/// the very seats that most needed it. Here the subject comes from the ladder.
pub(crate) async fn shim_send(State(state): State<AppState>, body: axum::body::Bytes) -> Response {
    let request = match decode(&body, SEND) {
        Decoded::Request(request) => request,
        Decoded::Refusal(response) => return response,
    };
    if request
        .argv
        .first()
        .is_some_and(|verb| verb == "compact-self")
    {
        if request.argv.iter().skip(1).any(|arg| arg != "--json") || request.body_literal.is_some()
        {
            return refused(
                "pij compact-self",
                "E-RS-CONTROL-BODY: compact-self takes no body or additional arguments",
            );
        }
        return super::send_control(
            &state,
            "pij compact-self",
            super::ControlRequest {
                to: None,
                asserted_from: None,
                body: String::new(),
                command: "compact".to_string(),
                msg_id: state.services.delivery.next_message_id(),
                in_reply_to: None,
                caller: request.caller,
            },
        )
        .await;
    }
    let call = match parse_send(&request.argv, request.body_literal.as_deref()) {
        Ok(call) => call,
        Err(why) => return refused(SEND, why),
    };
    if let Some(command) = call.command {
        return super::send_control(
            &state,
            SEND,
            super::ControlRequest {
                to: Some(call.to),
                asserted_from: None,
                body: call.body,
                command,
                msg_id: state.services.delivery.next_message_id(),
                in_reply_to: None,
                caller: request.caller,
            },
        )
        .await;
    }
    let from = match subject(&state, SEND, request.caller.as_ref()).await {
        Subject::Seat(seat) => seat,
        Subject::Refusal(response) => return response,
    };
    match state.services.delivery.send(from, call.to, call.body).await {
        Ok(receipt) => super::envelope(
            axum::http::StatusCode::OK,
            &pij_core::model::Envelope::ok(SEND, receipt),
        ),
        // Every failure below is a REFUSAL with an envelope, never a bare status:
        // the shim classifies an undecodable 404/405 as route absence and falls
        // back to legacy, which would send the message from the other store.
        Err(error) => super::send_failure(SEND, error),
    }
}

/// `POST /v1/shim/inbox` — claim this seat's mail, reader DERIVED.
///
/// `GET /v1/inbox?seat=<id>` is never issued straight from shim argv. The reader
/// is resolved from the caller's pane, and a seat supplied alongside it must
/// AGREE — the ladder refuses a disagreement rather than preferring the claim.
pub(crate) async fn shim_inbox(State(state): State<AppState>, body: axum::body::Bytes) -> Response {
    let request = match decode(&body, INBOX) {
        Decoded::Request(request) => request,
        Decoded::Refusal(response) => return response,
    };
    if let Err(why) = parse_inbox(&request.argv) {
        return refused(INBOX, why);
    }
    let reader = match subject(&state, INBOX, request.caller.as_ref()).await {
        Subject::Seat(seat) => seat,
        Subject::Refusal(response) => return response,
    };
    // `wait: false`, always. A blocking claim would hold this request open for
    // the caller's whole timeout, and the shim has no way to cancel it.
    match state.services.delivery.claim_inbox(&reader, false).await {
        Ok(claims) => super::envelope(
            axum::http::StatusCode::OK,
            &pij_core::model::Envelope::ok(INBOX, claims),
        ),
        Err(error) => super::inbox_failure(error),
    }
}

/// The acknowledgement half of a routed inbox read.
///
/// `InboxClaim` is a two-step contract: a claim moves the job to `running` and
/// records nothing, and the CLIENT acknowledges only after it has received and
/// DECODED the message (`delivery/mod.rs`). The native rs client does exactly
/// that (`crates/cli/src/client.rs`). Without this the routed read left the job
/// `running`, recorded no `ReaderRead`, and let the same message be claimed
/// again after the lease expired — rendering "claimed" honestly while the
/// operation was half-finished.
///
/// Why a shim path rather than reusing `/v1/inbox/ack`: that route takes a
/// caller-supplied `seat`, and this endpoint family exists precisely so a seat
/// is never asserted. Here the reader is DERIVED, exactly as the claim was, so
/// the two halves of one read are attributed the same way. (The existing route
/// already ignores its `seat` field for attribution — it keys on the job's
/// serial key — so nothing is weakened by not sending one.)
///
/// Copilot requires its native tuple at the service boundary. This legacy shim
/// cannot supply one, so neither claim nor ack may retire native work. Other
/// harnesses retain machine-grade acknowledgement with queue-owned attribution.
pub(crate) async fn shim_inbox_ack(
    State(state): State<AppState>,
    body: axum::body::Bytes,
) -> Response {
    let request = match decode_ack(&body) {
        DecodedAck::Request(request) => request,
        DecodedAck::Refusal(response) => return response,
    };
    // The reader is derived BEFORE the ack, so an unresolvable caller cannot
    // retire another seat's message.
    let reader = match subject(&state, INBOX, request.caller.as_ref()).await {
        Subject::Seat(reader) => reader,
        Subject::Refusal(response) => return response,
    };
    match state
        .services
        .delivery
        .acknowledge_inbox(
            &reader,
            request.job_id,
            &crate::delivery::NativeInboxIdentity::default(),
            None,
        )
        .await
    {
        Ok(acknowledged) => super::envelope(
            axum::http::StatusCode::OK,
            &pij_core::model::Envelope::ok(INBOX, acknowledged.origin),
        ),
        Err(error) => super::inbox_failure(error),
    }
}

/// A decoded acknowledgement, or the refusal. Same shape and same reason as
/// [`Decoded`]: an axum `Response` is a large error variant.
enum DecodedAck {
    Request(Box<ShimAckRequest>),
    Refusal(Response),
}

/// The ack body. `deny_unknown_fields` for the same reason [`ShimRequest`] has
/// it: a field this daemon does not understand must be refused, never dropped.
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ShimAckRequest {
    #[serde(default)]
    pub caller: Option<CallerContext>,
    pub job_id: pij_core::model::JobId,
}

fn decode_ack(body: &[u8]) -> DecodedAck {
    match serde_json::from_slice::<ShimAckRequest>(body) {
        Ok(request) => DecodedAck::Request(Box::new(request)),
        Err(error) => DecodedAck::Refusal(refused(
            INBOX,
            format!(
                "this acknowledgement does not match the shim wire contract: {error}. The \
                 contract is {{caller, job_id}} and unknown fields are REFUSED on purpose."
            ),
        )),
    }
}

/// Which `pij inbox` shapes rs serves.
///
/// `register` is NOT among them and must never reach here — the route table's
/// per-leaf policy holds it back, and this refusal is the second line of that
/// defence rather than the first. Its reason is unchanged and is not this
/// plan's to withdraw: the paneless ready form names no pane and no process, so
/// rs has no bind evidence to derive, and an rs refusal never falls back — a
/// routed `inbox register` would stop paneless seats registering ANYWHERE,
/// where today they register in legacy and work. Jordan's ruling of 2026-09-01
/// replaces that refusal with an admission GRADE; until the graded path is live
/// (s120) the denial stands, because striking a deny reason in a unit that does
/// not supply its replacement leaves the justification gone and the hazard.
pub(crate) fn parse_inbox(argv: &[String]) -> Result<(), String> {
    let mut tokens = argv.iter().map(String::as_str);
    match tokens.next() {
        Some("inbox") => {}
        Some(other) => return Err(format!("'{other}' is not the inbox verb")),
        None => return Err("usage: pij inbox [check]".to_string()),
    }
    for token in tokens {
        match token {
            "check" | "--json" => {}
            "register" => {
                return Err(
                    "rs does not serve `pij inbox register`. It is the PANELESS ready form: it \
                     names no pane and no process, so there is no bind evidence for rs to \
                     corroborate, and an rs refusal never falls back — routing it would stop \
                     paneless seats registering anywhere, where today they register in legacy \
                     and work. Tracked as s120 (admission becomes a GRADE, not a gate)."
                        .to_string(),
                );
            }
            "--wait" => {
                return Err(
                    "rs does not serve `pij inbox --wait`: a blocking claim would hold the \
                     request open for the caller's whole timeout with no way to cancel it. A \
                     pushed seat must not block on it at all; a pull peer should use legacy."
                        .to_string(),
                );
            }
            other => return Err(format!("unknown inbox argument `{other}`")),
        }
    }
    Ok(())
}

/// A decode's two answers.
///
/// A plain enum rather than `Result<_, Response>`, for the reason
/// [`Resolved`] gives one module over: an axum `Response` is a large error
/// variant, and the two arms are not success-and-failure anyway — a refusal is
/// an answer this route gives on purpose.
enum Decoded {
    Request(Box<ShimRequest>),
    Refusal(Response),
}

/// The acting seat, or the refusal to send back. See [`Decoded`].
enum Subject {
    Seat(SeatId),
    Refusal(Response),
}

/// Decode the shim envelope, naming a shape mismatch instead of letting axum
/// answer a bare 422 the shim would read as a hard rs error with no reason.
fn decode(body: &[u8], command: &'static str) -> Decoded {
    match serde_json::from_slice::<ShimRequest>(body) {
        Ok(request) => Decoded::Request(Box::new(request)),
        Err(error) => Decoded::Refusal(refused(
            command,
            format!(
                "this request does not match the shim wire contract for {command}: {error}. The \
                 contract is {{argv, caller, body_literal}} and unknown fields are REFUSED on \
                 purpose — a field this daemon does not understand must not be silently \
                 dropped, because dropping caller evidence is how an asserted identity goes \
                 unchallenged."
            ),
        )),
    }
}

/// Resolve the acting seat through the shared identity ladder.
///
/// Pane first, checked against the live roster; an asserted id second; a
/// DISAGREEMENT between them refused rather than resolved in either direction.
async fn subject(
    state: &AppState,
    command: &'static str,
    caller: Option<&CallerContext>,
) -> Subject {
    let asserted = caller.and_then(|caller| caller.session_id.clone());
    let pane = caller.and_then(|caller| caller.pane.clone());
    match identity::resolve_seat(state, command, asserted, pane).await {
        Resolved::Seat(descriptor, _) => Subject::Seat(descriptor.id),
        Resolved::Refusal(response) => Subject::Refusal(response),
    }
}
