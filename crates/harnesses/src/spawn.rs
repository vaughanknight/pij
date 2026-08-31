use pij_core::error::{PijError, Result};
use pij_core::model::{Harness, SeatId};

const PIJ_SESSION_ID: &str = "PIJ_SESSION_ID";
const PIJ_SPAWN_ID: &str = "PIJ_SPAWN_ID";
const CLAUDE_ACCEPT_SETTINGS: &str = r#"{"crossSessionInbound":"accept"}"#;

/// Facts known by the launcher and the exact command it will execute.
///
/// `cross_session_inbound_accept` is derived from `args`; callers cannot stamp it
/// independently of the command that establishes the fact.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpawnPlan {
    /// Harness being launched.
    pub harness: Harness,
    /// `env`, which applies [`PIJ_SESSION_ID`] before starting the harness.
    pub executable: String,
    /// The assigned identity, actual harness executable, and its discrete arguments.
    /// No shell joins this vector.
    pub args: Vec<String>,
    /// Exact requested model selector, when supplied.
    pub model: Option<String>,
    /// Provider only when model resolution established it.
    pub provider: Option<String>,
    /// Exact requested reasoning effort, when supplied.
    pub effort: Option<String>,
    /// True only when the Claude accept setting is present in `args`.
    pub cross_session_inbound_accept: bool,
    /// Port emitted with Copilot's `--ui-server --port N`, if present in `args`.
    /// This records argv intent, not listener possession.
    pub rpc_port_intent: Option<u16>,
}

/// Inputs used to build one spawn command.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpawnPlanInput {
    /// Seat id already assigned by the daemon under its spawn lock.
    pub seat_id: SeatId,
    /// Correlator minted for this exact launch and carried into registration.
    pub spawn_id: String,
    /// Harness to launch.
    pub harness: Harness,
    /// Executable override from `--bin`; the harness name is used when absent.
    pub executable: Option<String>,
    /// Exact model selector requested by the caller.
    pub model: Option<String>,
    /// Provider established by model resolution, not guessed from the selector.
    pub resolved_provider: Option<String>,
    /// Exact reasoning effort requested by the caller.
    pub effort: Option<String>,
    /// Whether to configure Claude to accept cross-session inbound messages.
    pub accept_inbound: bool,
    /// Copilot RPC port selected by the daemon for this launch.
    pub copilot_rpc_port_intent: Option<u16>,
}

/// Build the exact environment launcher and harness argv for one spawn.
///
/// # Composition recipe
///
/// `use pij_harnesses::{SpawnPlanInput, build_spawn_plan};` in the authenticated
/// `POST /v1/spawn` handler. Assign the seat id under the spawn lock, then build
/// `SpawnPlanInput` from that exact id and launch correlator plus the request's
/// harness, executable/model/effort, `accept_inbound`, and any Rust-allocated
/// Copilot port. Pass the returned `plan.executable` and discrete `plan.args` as
/// `Some(&LaunchCommand)` to `Services.tmux.new_window`. Only after that call
/// returns a pane, write the pre-bind descriptor and copy both argv-derived
/// stamps from the plan; never derive a stamp from the request.
///
/// # Errors
///
/// Refuses `accept_inbound` for non-Claude harnesses because those runtimes do
/// not establish the capability represented by the descriptor stamp.
pub fn build_spawn_plan(input: SpawnPlanInput) -> Result<SpawnPlan> {
    if input.spawn_id.trim().is_empty() {
        return Err(PijError::Adapter {
            adapter: "spawn".to_string(),
            message: "spawn id must be non-empty so the first bind can correlate its launch"
                .to_string(),
        });
    }
    if input.accept_inbound && input.harness != Harness::Claude {
        return Err(PijError::Adapter {
            adapter: "spawn".to_string(),
            message: format!(
                "--accept-inbound applies only to claude, not {} — omit it for this harness",
                input.harness
            ),
        });
    }
    if input.copilot_rpc_port_intent.is_some() && input.harness != Harness::Copilot {
        return Err(PijError::Adapter {
            adapter: "spawn".to_string(),
            message: format!(
                "a Copilot RPC port applies only to copilot, not {}",
                input.harness
            ),
        });
    }
    if input.copilot_rpc_port_intent == Some(0) {
        return Err(PijError::Adapter {
            adapter: "spawn".to_string(),
            message: "a Copilot RPC port must be non-zero".to_string(),
        });
    }

    let harness_executable = input
        .executable
        .clone()
        .unwrap_or_else(|| input.harness.as_str().to_string());
    let mut args = vec![
        format!("{PIJ_SESSION_ID}={}", input.seat_id),
        format!("{PIJ_SPAWN_ID}={}", input.spawn_id),
        harness_executable,
    ];
    match input.harness {
        Harness::Pi => {
            if let Some(model) = &input.model {
                let selector = input
                    .effort
                    .as_ref()
                    .map_or_else(|| model.clone(), |effort| format!("{model}:{effort}"));
                args.extend(["--model".to_string(), selector]);
            }
        }
        Harness::Omp => {
            args.push("--auto-approve".to_string());
            push_option(&mut args, "--model", input.model.as_deref());
            push_option(&mut args, "--thinking", input.effort.as_deref());
        }
        Harness::Claude => {
            args.push("--dangerously-skip-permissions".to_string());
            if input.accept_inbound {
                args.extend(["--settings".to_string(), CLAUDE_ACCEPT_SETTINGS.to_string()]);
            }
            push_option(&mut args, "--model", input.model.as_deref());
            push_option(&mut args, "--effort", input.effort.as_deref());
        }
        Harness::Copilot => {
            args.push("--yolo".to_string());
            if let Some(port) = input.copilot_rpc_port_intent {
                args.extend([
                    "--ui-server".to_string(),
                    "--port".to_string(),
                    port.to_string(),
                ]);
            }
            push_option(&mut args, "--model", input.model.as_deref());
            if input.model.is_some() {
                args.extend(["--context".to_string(), "long_context".to_string()]);
            }
            push_option(&mut args, "--effort", input.effort.as_deref());
        }
        Harness::Codex => {
            args.push("--dangerously-bypass-approvals-and-sandbox".to_string());
            push_option(&mut args, "--model", input.model.as_deref());
            if let Some(effort) = &input.effort {
                args.extend(["-c".to_string(), format!("model_reasoning_effort={effort}")]);
            }
        }
    }

    let cross_session_inbound_accept = args
        .windows(2)
        .any(|pair| pair[0] == "--settings" && pair[1] == CLAUDE_ACCEPT_SETTINGS);
    let rpc_port_intent = args.windows(3).find_map(|triple| {
        (triple[0] == "--ui-server" && triple[1] == "--port")
            .then(|| triple[2].parse::<u16>().ok())
            .flatten()
            .filter(|port| *port != 0)
    });

    Ok(SpawnPlan {
        harness: input.harness,
        executable: "env".to_string(),
        args,
        model: input.model,
        provider: input.resolved_provider,
        effort: input.effort,
        cross_session_inbound_accept,
        rpc_port_intent,
    })
}

fn push_option(args: &mut Vec<String>, flag: &str, value: Option<&str>) {
    if let Some(value) = value {
        args.extend([flag.to_string(), value.to_string()]);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        CLAUDE_ACCEPT_SETTINGS, PIJ_SESSION_ID, PIJ_SPAWN_ID, SpawnPlanInput, build_spawn_plan,
    };
    use pij_core::model::{Harness, SeatId};

    fn input(harness: Harness) -> SpawnPlanInput {
        SpawnPlanInput {
            seat_id: SeatId::from("pij-assigned"),
            spawn_id: "spawn-assigned".to_string(),
            harness,
            executable: None,
            model: Some("provider/model".to_string()),
            resolved_provider: Some("provider".to_string()),
            effort: Some("high".to_string()),
            accept_inbound: false,
            copilot_rpc_port_intent: None,
        }
    }

    #[test]
    fn every_harness_builds_discrete_ruled_argv() {
        let cases = [
            (Harness::Pi, "pi", vec!["--model", "provider/model:high"]),
            (
                Harness::Omp,
                "omp",
                vec![
                    "--auto-approve",
                    "--model",
                    "provider/model",
                    "--thinking",
                    "high",
                ],
            ),
            (
                Harness::Claude,
                "claude",
                vec![
                    "--dangerously-skip-permissions",
                    "--model",
                    "provider/model",
                    "--effort",
                    "high",
                ],
            ),
            (
                Harness::Copilot,
                "copilot",
                vec![
                    "--yolo",
                    "--model",
                    "provider/model",
                    "--context",
                    "long_context",
                    "--effort",
                    "high",
                ],
            ),
            (
                Harness::Codex,
                "codex",
                vec![
                    "--dangerously-bypass-approvals-and-sandbox",
                    "--model",
                    "provider/model",
                    "-c",
                    "model_reasoning_effort=high",
                ],
            ),
        ];

        for (harness, harness_executable, expected_harness_args) in cases {
            let plan = build_spawn_plan(input(harness)).expect("build plan");
            assert_eq!(plan.executable, "env");
            assert_eq!(
                plan.args,
                [
                    vec![
                        format!("{PIJ_SESSION_ID}=pij-assigned"),
                        format!("{PIJ_SPAWN_ID}=spawn-assigned"),
                        harness_executable.to_string()
                    ],
                    expected_harness_args
                        .into_iter()
                        .map(str::to_string)
                        .collect(),
                ]
                .concat()
            );
            assert!(!plan.cross_session_inbound_accept);
            assert_eq!(plan.rpc_port_intent, None);
            assert_eq!(plan.model.as_deref(), Some("provider/model"));
            assert_eq!(plan.provider.as_deref(), Some("provider"));
            assert_eq!(plan.effort.as_deref(), Some("high"));
        }
    }

    #[test]
    fn accept_stamp_is_true_only_when_exact_setting_is_emitted() {
        let without = build_spawn_plan(input(Harness::Claude)).expect("closed plan");
        assert!(!without.cross_session_inbound_accept);
        assert!(!without.args.iter().any(|arg| arg == "--settings"));
        assert_eq!(without.args[0], "PIJ_SESSION_ID=pij-assigned");

        let mut accepted_input = input(Harness::Claude);
        accepted_input.accept_inbound = true;
        let accepted = build_spawn_plan(accepted_input).expect("accepted plan");
        assert!(accepted.cross_session_inbound_accept);
        assert!(
            accepted
                .args
                .windows(2)
                .any(|pair| { pair == ["--settings", CLAUDE_ACCEPT_SETTINGS] })
        );
    }

    #[test]
    fn copilot_rpc_stamp_is_derived_only_from_the_exact_emitted_argv() {
        let mut request = input(Harness::Copilot);
        request.copilot_rpc_port_intent = Some(47_781);
        let plan = build_spawn_plan(request).expect("Copilot RPC plan");

        assert!(
            plan.args
                .windows(3)
                .any(|triple| triple == ["--ui-server", "--port", "47781"])
        );
        assert_eq!(plan.rpc_port_intent, Some(47_781));

        let without = build_spawn_plan(input(Harness::Copilot)).expect("pointer-only plan");
        assert!(!without.args.iter().any(|arg| arg == "--ui-server"));
        assert_eq!(without.rpc_port_intent, None);
    }

    #[test]
    fn copilot_rpc_port_is_refused_for_other_harnesses_and_port_zero() {
        let mut wrong_harness = input(Harness::Claude);
        wrong_harness.copilot_rpc_port_intent = Some(47_781);
        assert!(
            build_spawn_plan(wrong_harness)
                .expect_err("wrong harness")
                .to_string()
                .contains("only to copilot")
        );

        let mut zero = input(Harness::Copilot);
        zero.copilot_rpc_port_intent = Some(0);
        assert!(
            build_spawn_plan(zero)
                .expect_err("port zero")
                .to_string()
                .contains("non-zero")
        );
    }

    #[test]
    fn accept_inbound_is_refused_for_every_non_claude_harness() {
        for harness in [Harness::Pi, Harness::Omp, Harness::Copilot, Harness::Codex] {
            let mut request = input(harness);
            request.accept_inbound = true;
            let error = build_spawn_plan(request).expect_err("must refuse");
            assert!(error.to_string().contains("applies only to claude"));
        }
    }

    #[test]
    fn executable_override_and_absent_optional_facts_are_preserved() {
        let plan = build_spawn_plan(SpawnPlanInput {
            seat_id: SeatId::from("pij-override"),
            spawn_id: "spawn-override".to_string(),
            harness: Harness::Claude,
            executable: Some("/opt/harnesses/claude".to_string()),
            model: None,
            resolved_provider: None,
            effort: None,
            accept_inbound: false,
            copilot_rpc_port_intent: None,
        })
        .expect("build plan");

        assert_eq!(plan.executable, "env");
        assert_eq!(
            plan.args,
            [
                "PIJ_SESSION_ID=pij-override",
                "PIJ_SPAWN_ID=spawn-override",
                "/opt/harnesses/claude",
                "--dangerously-skip-permissions"
            ]
        );
        assert_eq!(plan.model, None);
        assert_eq!(plan.provider, None);
        assert_eq!(plan.effort, None);
        assert!(!plan.cross_session_inbound_accept);
        assert_eq!(plan.rpc_port_intent, None);
    }
}
