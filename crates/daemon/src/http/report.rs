//! The `report` family, served by rs (plan 114, u-report; ac-1142 + ac-1144).
//!
//! ONE endpoint serves the whole family, because the shim routes by verb and
//! hands the daemon the caller's `argv` untouched. So the argument shapes are
//! parsed HERE, once, and the rs CLI forwards argv rather than re-parsing it —
//! two parsers for one grammar is how the generations would drift.
//!
//! # Where the shapes come from
//!
//! Every rule below was derived from the TYPESCRIPT SOURCE callers actually hit,
//! not from a description of it, and each carries the line it came from. The
//! packet that commissioned this work said so in as many words, and it was
//! right to: a packet is a description, the source is the thing.
//!
//! # Two rules that shape every refusal here
//!
//! 1. **A shape rs cannot honour refuses BY NAME.** rs has no assignment model
//!    and no project model, and its `SemanticState` is six words where the
//!    TypeScript vocabulary is eight. Every one of those gaps had an available
//!    near-fit that would have compiled — `--project` dropped on the floor,
//!    `failed` mapped to `Done`. A near-fit that type-checks is the worst
//!    outcome available here, because the caller cannot see it.
//! 2. **No refusal may be a bare 404.** Wave 1's shim classifies "404 or 405
//!    with a body that does not decode as a pij envelope" as ROUTE ABSENCE and
//!    falls back to legacy. A refusal wearing that shape would not be a refusal
//!    at all — it would silently re-home the seat into the other store while
//!    every surface reported success. Everything here answers 400 with an
//!    envelope, and `report_http.rs` pins it by replaying the shim's own
//!    classification over every refusal this module can emit.

use pij_core::model::{CARD_LIMIT, NOTE_LIMIT, SemanticState};

/// Every semantic state the TypeScript generation accepts today —
/// `SEMANTIC_STATES`, `.pi/extensions/pij/core/types.ts:110`, commented
/// "HUMAN-RULED vocabulary, byte-exact: never extend, rename, or reorder".
///
/// rs's [`SemanticState`] carries six of these eight. The two it lacks are not
/// an oversight to paper over; they are a divergence between the generations,
/// and this constant exists so the gap is visible in the code rather than
/// implied by an incomplete match arm.
const TS_ONLY_STATES: [&str; 2] = ["failed", "cancelled"];

/// The rs vocabulary, in the order [`SemanticState`] declares it. Named in every
/// refusal, so a caller who typed a word rs lacks learns what it does have.
const RS_STATE_WORDS: &str = "ready|waiting|hold|blocked|question|done";

/// One parsed report invocation — the six leaves of the family.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ReportCall {
    /// `report now "<did>" "<next>" [--state <word>] [--note <text>]`.
    ///
    /// `state` rides along because TypeScript performs both writes under one
    /// lock (`core/cli.ts:1631`), so the two are one caller-visible act.
    Now {
        did: String,
        next: String,
        state: Option<SemanticState>,
        note: Option<String>,
    },
    /// `report state <state>` — `core/cli.ts:1708`.
    State(SemanticState),
    /// `report blocked "<text>"` — `core/cli.ts:1690`.
    Blocked(String),
    /// `report question "<text>"` — `core/cli.ts:1689`.
    Question(String),
    /// `report clear` — `core/cli.ts:1746`.
    Clear,
}

/// A refusal, in the caller's own vocabulary.
///
/// It is a plain string because it is destined for `Envelope::refused`'s `meta`,
/// which is prose for a human; the machine-readable half is the `ErrorKind` the
/// handler attaches. Splitting them is the existing convention here
/// (`http/mod.rs`, `refused`).
pub(crate) type Refusal = String;

/// One `--flag` with the value it took, if any. `None` is a valueless flag,
/// which here is only ever `--json`.
type Flag<'a> = (&'a str, Option<&'a str>);

/// The tokens after the leaf, sorted into the two kinds a caller can type.
struct Arguments<'a> {
    positionals: Vec<&'a str>,
    flags: Vec<Flag<'a>>,
}

/// Parse the `argv` the caller typed into one report invocation.
///
/// `argv` arrives as `process.argv.slice(2)` verbatim, so it still carries the
/// verb: `["report", "now", "<did>", "<next>"]`.
pub(crate) fn parse_report(argv: &[String]) -> Result<ReportCall, Refusal> {
    let mut tokens = argv.iter().map(String::as_str);
    match tokens.next() {
        Some("report") => {}
        Some(other) => return Err(format!("'{other}' is not the report verb")),
        None => return Err("usage: pij report <now|state|blocked|question|clear>".to_string()),
    }
    let leaf = tokens
        .next()
        .ok_or_else(|| "usage: pij report <now|state|blocked|question|clear>".to_string())?;

    let Arguments { positionals, flags } = split_arguments(tokens)?;

    // Flags that address objects rs does not have. Checked BEFORE the leaf is
    // dispatched so the answer is the same wherever the flag was typed — the
    // caller's mistake is the flag, not the verb they attached it to.
    for (name, _) in &flags {
        if let Some(why) = unsupported_flag(name) {
            return Err(why);
        }
    }

    match leaf {
        "now" => parse_now(&positionals, &flags),
        "state" => parse_state_leaf(&positionals, &flags),
        "blocked" | "question" => parse_note_leaf(leaf, &positionals, &flags),
        "clear" => {
            expect_positionals("report clear", &positionals, 0, "usage: pij report clear")?;
            reject_unknown_flags("report clear", &flags, &[])?;
            Ok(ReportCall::Clear)
        }
        // `verify` is deliberately here rather than in `unsupported_flag`: it is
        // a whole verb rs cannot serve, not a flag on one it can. It should not
        // reach us at all — the route table holds it back so it keeps working on
        // legacy, where the assignment it verifies actually lives — but if the
        // table ever changes, this refuses by name instead of half-serving it.
        "verify" => Err(
            "rs cannot serve `report verify`: it stamps verifiedBy on an ASSIGNMENT record \
             (.pi/extensions/pij/core/cli.ts:1733) and rs has no assignment model, so there is \
             nothing here to verify. It is deliberately left unrouted and served by legacy."
                .to_string(),
        ),
        other => Err(format!(
            "unknown report subcommand '{other}' (now|state|blocked|question|clear)"
        )),
    }
}

/// `--assignment`, `--refs`, `--project` and `--for` each address an object that
/// exists in the TypeScript generation and nowhere in rs.
///
/// Accepting and ignoring them was the tempting failure: the report would have
/// succeeded, the caller would have seen success, and the scoping they asked for
/// would have been silently discarded.
fn unsupported_flag(name: &str) -> Option<Refusal> {
    let subject = match name {
        "assignment" => {
            "an ASSIGNMENT id (.pi/extensions/pij/core/cli.ts:888-892). rs has no assignment model"
        }
        "refs" => {
            "assignment state REFS (.pi/extensions/pij/core/cli.ts:890). rs has no assignment model"
        }
        "project" => {
            "a PROJECT slug (.pi/extensions/pij/core/cli.ts:887). rs reports carry no project"
        }
        "for" => {
            "a RELAY subject — another seat's card written by its PA (plan 078, \
             .pi/extensions/pij/core/cli.ts:1646). rs has no PA/prime relation to authorise it, \
             and an unauthorised relay is exactly the identity borrowing the flag exists to make \
             attributable"
        }
        _ => return None,
    };
    Some(format!(
        "rs cannot honour --{name}: it names {subject}. Refusing by name rather than accepting \
         the flag and discarding what it asked for. This verb still works on the legacy \
         generation: PIJ_DAEMON_GENERATION=legacy pij report …"
    ))
}

/// Split the remaining tokens into positionals and `--flag [value]` pairs.
///
/// `--json` is accepted and carries no value: every rs answer is already an
/// envelope, so the flag is satisfied by construction. Refusing it would break
/// the many callers that pass it habitually.
fn split_arguments<'a>(tokens: impl Iterator<Item = &'a str>) -> Result<Arguments<'a>, Refusal> {
    let tokens: Vec<&str> = tokens.collect();
    let mut positionals = Vec::new();
    let mut flags: Vec<Flag<'a>> = Vec::new();
    let mut index = 0;
    while index < tokens.len() {
        let token = tokens[index];
        if let Some(name) = token.strip_prefix("--") {
            let (name, inline) = match name.split_once('=') {
                Some((name, value)) => (name, Some(value)),
                None => (name, None),
            };
            if name.is_empty() {
                return Err("'--' is not a flag".to_string());
            }
            let value = match inline {
                Some(value) => Some(value),
                // A valueless flag: only `--json` is one here, so anything else
                // consumes the next token as its value, exactly as the
                // TypeScript lexer does for its non-boolean flags.
                None if name == "json" => None,
                None => {
                    index += 1;
                    tokens.get(index).copied()
                }
            };
            flags.push((name, value));
        } else {
            positionals.push(token);
        }
        index += 1;
    }
    Ok(Arguments { positionals, flags })
}

/// `report now "<did>" "<next>" [--state <word>] [--note <text>] [--json]`
/// — `.pi/extensions/pij/core/cli.ts:1631-1687`.
fn parse_now(positionals: &[&str], flags: &[Flag<'_>]) -> Result<ReportCall, Refusal> {
    reject_unknown_flags("report now", flags, &["state", "note"])?;
    expect_positionals(
        "report now",
        positionals,
        2,
        r#"usage: pij report now "<did>" "<next>" [--state <word>]"#,
    )?;
    let did = normalize_card_field("did", positionals[0])?;
    let next = normalize_card_field("next", positionals[1])?;

    let state = match flag_value(flags, "state")? {
        // `--state` with no value is its own message in TypeScript
        // (`core/cli.ts:1645`), and the wording is kept.
        Some("") | None if flags.iter().any(|(name, _)| *name == "state") => {
            return Err("--state takes a semantic state".to_string());
        }
        Some(word) => Some(parse_semantic_state(word)?),
        None => None,
    };

    let note = match flag_value(flags, "note")? {
        Some(text) => {
            // `--note` is permitted ONLY with a state that carries an
            // explanation — `core/cli.ts:1653`. Without that guard a note on
            // `--state done` would be accepted and then have nowhere to live.
            if !matches!(
                state,
                Some(SemanticState::Question) | Some(SemanticState::Blocked)
            ) {
                return Err(
                    "--note is permitted only with --state question or --state blocked".to_string(),
                );
            }
            Some(normalize_note(text)?)
        }
        None if flags.iter().any(|(name, _)| *name == "note") => {
            return Err("--note takes text".to_string());
        }
        None => None,
    };

    Ok(ReportCall::Now {
        did,
        next,
        state,
        note,
    })
}

/// `report state <state> [--json]` — `.pi/extensions/pij/core/cli.ts:1708-1731`.
fn parse_state_leaf(positionals: &[&str], flags: &[Flag<'_>]) -> Result<ReportCall, Refusal> {
    reject_unknown_flags("report state", flags, &[])?;
    expect_positionals(
        "report state",
        positionals,
        1,
        "usage: pij report state <state>",
    )?;
    Ok(ReportCall::State(parse_semantic_state(positionals[0])?))
}

/// `report blocked|question "<text>" [--json]` —
/// `.pi/extensions/pij/core/cli.ts:1689-1707`.
fn parse_note_leaf(
    leaf: &str,
    positionals: &[&str],
    flags: &[Flag<'_>],
) -> Result<ReportCall, Refusal> {
    reject_unknown_flags(&format!("report {leaf}"), flags, &[])?;
    expect_positionals(
        &format!("report {leaf}"),
        positionals,
        1,
        &format!(r#"usage: pij report {leaf} "<text>""#),
    )?;
    let note = normalize_note(positionals[0])?;
    Ok(if leaf == "blocked" {
        ReportCall::Blocked(note)
    } else {
        ReportCall::Question(note)
    })
}

/// Map a typed word onto rs's [`SemanticState`].
///
/// Three outcomes, and the middle one is the point: a word BOTH generations
/// know, a word only TypeScript knows, and a word neither knows. Collapsing the
/// middle into either neighbour is how `failed` would have quietly become
/// `Done`.
fn parse_semantic_state(word: &str) -> Result<SemanticState, Refusal> {
    match word {
        "ready" => Ok(SemanticState::Ready),
        "waiting" => Ok(SemanticState::Waiting),
        "hold" => Ok(SemanticState::Hold),
        "blocked" => Ok(SemanticState::Blocked),
        "question" => Ok(SemanticState::Question),
        "done" => Ok(SemanticState::Done),
        word if TS_ONLY_STATES.contains(&word) => Err(format!(
            "rs has no semantic state '{word}'. It is in the TypeScript vocabulary \
             (.pi/extensions/pij/core/types.ts:110) and not in rs's \
             (crates/core/src/model.rs, SemanticState), whose words are {RS_STATE_WORDS}. \
             Refusing by name: mapping '{word}' onto the nearest rs state would record a \
             declaration you did not make. Declare it on the legacy generation instead: \
             PIJ_DAEMON_GENERATION=legacy pij report state {word}"
        )),
        other => Err(format!(
            "invalid semantic state '{other}' ({RS_STATE_WORDS})"
        )),
    }
}

/// The card-field rules the TypeScript generation enforces —
/// `normalizeReportText`, `.pi/extensions/pij/core/cli.ts:817-830`.
///
/// Two of these three rules exist ONLY here, and deliberately so.
/// `pij_core::report` documents that an empty card is valid ("a present empty
/// card and no card are different facts") and collapses newlines silently. Both
/// are right for an in-process caller and neither matches what the CLI's callers
/// hit today, so the divergence is settled at this BOUNDARY rather than by
/// overruling core.
///
/// The length rule is NOT re-implemented here: it is [`CARD_LIMIT`], cited, and
/// core checks it again on the way through. One constant, one owner.
fn normalize_card_field(label: &str, input: &str) -> Result<String, Refusal> {
    if input.contains(['\r', '\n', '\u{2028}', '\u{2029}']) {
        return Err(format!("report {label} must be one line"));
    }
    let normalized = collapse_whitespace(input);
    if normalized.is_empty() {
        return Err(format!("report {label} must not be empty"));
    }
    if normalized.chars().count() > CARD_LIMIT {
        return Err(format!(
            "report {label} exceeds the {CARD_LIMIT}-character limit after whitespace collapsing"
        ));
    }
    Ok(normalized)
}

/// The note rules — `normalizeReportNote`, `.pi/extensions/pij/core/cli.ts:832-845`.
///
/// [`NOTE_LIMIT`] is 200 and is NOT [`CARD_LIMIT`]. rs core applies no limit to a
/// note at all, so unlike the card rules there is nothing downstream to catch a
/// miss here.
fn normalize_note(input: &str) -> Result<String, Refusal> {
    if input.contains(['\r', '\n', '\u{2028}', '\u{2029}']) {
        return Err("report note must be one line".to_string());
    }
    let normalized = collapse_whitespace(input);
    if normalized.is_empty() {
        return Err("report note must not be empty".to_string());
    }
    if normalized.chars().count() > NOTE_LIMIT {
        return Err(format!(
            "report note exceeds the {NOTE_LIMIT}-character limit after whitespace collapsing"
        ));
    }
    Ok(normalized)
}

/// `input.trim().replace(/\s+/g, " ")` — `.pi/extensions/pij/core/cli.ts:821`.
fn collapse_whitespace(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn flag_value<'a>(flags: &[Flag<'a>], name: &str) -> Result<Option<&'a str>, Refusal> {
    Ok(flags
        .iter()
        .find(|(flag, _)| *flag == name)
        .and_then(|(_, value)| *value))
}

/// TypeScript refuses an unrecognised flag per verb (`ALLOWED_FLAGS`,
/// `core/cli.ts:887-892`) rather than ignoring it, and so does this.
fn reject_unknown_flags(key: &str, flags: &[Flag<'_>], allowed: &[&str]) -> Result<(), Refusal> {
    for (name, _) in flags {
        if *name == "json" || allowed.contains(name) {
            continue;
        }
        return Err(format!("unknown flag --{name} for `pij {key}`"));
    }
    Ok(())
}

/// TypeScript caps positionals per verb (`MAX_POS`, `core/cli.ts:932-937`) and
/// requires the ones the usage line names.
fn expect_positionals(
    key: &str,
    positionals: &[&str],
    expected: usize,
    usage: &str,
) -> Result<(), Refusal> {
    if positionals.len() == expected {
        return Ok(());
    }
    if positionals.len() < expected {
        return Err(usage.to_string());
    }
    Err(format!(
        "too many arguments for `pij {key}` (expected {expected}, got {}) — {usage}",
        positionals.len()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(tokens: &[&str]) -> Vec<String> {
        tokens.iter().map(ToString::to_string).collect()
    }

    #[test]
    fn now_carries_did_next_and_an_optional_state() {
        assert_eq!(
            parse_report(&argv(&["report", "now", " a  b ", "c"])),
            Ok(ReportCall::Now {
                did: "a b".to_string(),
                next: "c".to_string(),
                state: None,
                note: None,
            })
        );
        assert_eq!(
            parse_report(&argv(&[
                "report", "now", "a", "b", "--state", "blocked", "--note", "why"
            ])),
            Ok(ReportCall::Now {
                did: "a".to_string(),
                next: "b".to_string(),
                state: Some(SemanticState::Blocked),
                note: Some("why".to_string()),
            })
        );
    }

    /// `--json` is habitual in this fleet and must never be the reason a report
    /// fails: every rs answer is an envelope already.
    #[test]
    fn json_is_accepted_everywhere_and_consumes_no_positional() {
        assert_eq!(
            parse_report(&argv(&["report", "now", "a", "b", "--json"])),
            Ok(ReportCall::Now {
                did: "a".to_string(),
                next: "b".to_string(),
                state: None,
                note: None,
            })
        );
        assert_eq!(
            parse_report(&argv(&["report", "clear", "--json"])),
            Ok(ReportCall::Clear)
        );
    }

    #[test]
    fn a_note_without_an_explaining_state_is_refused() {
        let refusal = parse_report(&argv(&[
            "report", "now", "a", "b", "--state", "done", "--note", "why",
        ]))
        .expect_err("a note has nowhere to live on --state done");
        assert!(refusal.contains("only with --state question or --state blocked"));
    }

    /// The discriminating arm for the whole "refuse by name" rule: both words
    /// have a near-fit one line away in [`SemanticState`], and the refusal names
    /// the word AND the vocabulary rs has.
    #[test]
    fn typescript_only_states_refuse_by_name_and_name_the_rs_vocabulary() {
        for word in TS_ONLY_STATES {
            let refusal =
                parse_report(&argv(&["report", "state", word])).expect_err("rs has no such state");
            assert!(refusal.contains(word), "{refusal}");
            assert!(refusal.contains(RS_STATE_WORDS), "{refusal}");
        }
    }

    #[test]
    fn flags_backed_by_objects_rs_lacks_are_refused_on_every_leaf_that_takes_them() {
        for tokens in [
            vec!["report", "state", "done", "--assignment", "as-1"],
            vec!["report", "blocked", "t", "--assignment", "as-1"],
            vec!["report", "state", "done", "--refs", "a,b"],
            vec!["report", "now", "a", "b", "--project", "slug"],
            vec!["report", "now", "a", "b", "--for", "pij-other"],
        ] {
            let refusal = parse_report(&argv(&tokens)).expect_err("rs lacks the object");
            let flag = tokens
                .iter()
                .find(|token| token.starts_with("--"))
                .expect("a flag");
            assert!(refusal.contains(flag), "{refusal}");
        }
    }

    /// The three card rules that exist only at this boundary, plus the one that
    /// does not: the length rule cites [`CARD_LIMIT`] rather than a literal.
    #[test]
    fn card_fields_follow_the_typescript_rules() {
        assert!(
            parse_report(&argv(&["report", "now", "a\nb", "c"]))
                .expect_err("newline")
                .contains("must be one line")
        );
        assert!(
            parse_report(&argv(&["report", "now", "   ", "c"]))
                .expect_err("empty")
                .contains("must not be empty")
        );
        let over = "a".repeat(CARD_LIMIT + 1);
        assert!(
            parse_report(&argv(&["report", "now", &over, "c"]))
                .expect_err("too long")
                .contains(&CARD_LIMIT.to_string())
        );
        let at = "a".repeat(CARD_LIMIT);
        assert!(parse_report(&argv(&["report", "now", &at, "c"])).is_ok());
    }

    /// Pins that the note limit is its own number. A handler that reused
    /// `CARD_LIMIT` here would pass every other test in this module.
    #[test]
    fn the_note_limit_is_not_the_card_limit() {
        const { assert!(NOTE_LIMIT < CARD_LIMIT) };
        let note = "n".repeat(NOTE_LIMIT + 1);
        assert!(
            parse_report(&argv(&["report", "blocked", &note]))
                .expect_err("over the note limit")
                .contains(&NOTE_LIMIT.to_string())
        );
        assert!(parse_report(&argv(&["report", "blocked", &"n".repeat(NOTE_LIMIT)])).is_ok());
    }

    #[test]
    fn arity_follows_the_typescript_table() {
        assert!(parse_report(&argv(&["report", "now", "only-did"])).is_err());
        assert!(parse_report(&argv(&["report", "now", "a", "b", "c"])).is_err());
        assert!(parse_report(&argv(&["report", "clear", "extra"])).is_err());
        assert!(parse_report(&argv(&["report", "state"])).is_err());
    }

    #[test]
    fn verify_refuses_by_name_and_says_where_it_still_works() {
        let refusal =
            parse_report(&argv(&["report", "verify", "nd-1"])).expect_err("rs cannot verify");
        assert!(refusal.contains("verify"), "{refusal}");
        assert!(refusal.contains("legacy"), "{refusal}");
    }
}
