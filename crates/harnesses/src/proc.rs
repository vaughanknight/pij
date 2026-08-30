//! Exact-pid process liveness for macOS and Linux.
//!
//! `ps -p <pid>` is deliberately narrower than the process-table snapshots used
//! by discovery: liveness may inspect only the pid the caller named. Removing
//! that constraint would make the adapter inspect more processes, so it is a
//! one-directional safety interlock (a brake), not policy.

use std::io;
use std::process::Command;
use std::sync::Arc;

use async_trait::async_trait;
use pij_core::error::{PijError, Result};
use pij_core::ports::LivenessPort;

const ADAPTER: &str = "process-liveness/ps";

/// The real [`LivenessPort`] backed by an exact-pid `ps` lookup.
///
/// The returned `u64` packs the C-locale `lstart` fields as
/// `YYYYMMDDhhmmss`. It is stable for the life of a process and ordered within
/// a boot, but callers compare it rather than interpreting it.
///
/// # Composition recipe
///
/// In `crates/daemon/src/lib.rs`:
///
/// ```ignore
/// use pij_harnesses::proc::ProcLiveness;
///
/// let liveness: Arc<dyn LivenessPort> = match config.adapters.liveness {
///     AdapterChoice::Fake => Arc::new(FakeLiveness::new()),
///     AdapterChoice::Real => Arc::new(ProcLiveness::new()),
/// };
/// ```
///
/// COMPOSED (wave 1). The refusal it replaced no longer exists; no new config
/// field is required.
pub struct ProcLiveness {
    runner: Arc<dyn CommandRunner>,
}

impl ProcLiveness {
    /// Construct the real process adapter.
    pub fn new() -> Self {
        Self {
            runner: Arc::new(PsRunner),
        }
    }

    #[cfg(test)]
    fn with_runner(runner: impl CommandRunner + 'static) -> Self {
        Self {
            runner: Arc::new(runner),
        }
    }
}

impl Default for ProcLiveness {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl LivenessPort for ProcLiveness {
    async fn proc_start(&self, pid: u32) -> Result<Option<u64>> {
        let output = self.runner.run(pid).map_err(|error| PijError::Adapter {
            adapter: ADAPTER.to_string(),
            message: format!("could not inspect pid {pid}: {error}"),
        })?;
        classify(pid, output)
    }
}

struct CommandOutput {
    success: bool,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

trait CommandRunner: Send + Sync {
    fn run(&self, pid: u32) -> io::Result<CommandOutput>;
}

struct PsRunner;

impl CommandRunner for PsRunner {
    fn run(&self, pid: u32) -> io::Result<CommandOutput> {
        let output = Command::new("ps")
            .args(["-o", "lstart=", "-p", &pid.to_string()])
            .env("LC_ALL", "C")
            .output()?;
        Ok(CommandOutput {
            success: output.status.success(),
            stdout: output.stdout,
            stderr: output.stderr,
        })
    }
}

fn classify(pid: u32, output: CommandOutput) -> Result<Option<u64>> {
    let stdout = std::str::from_utf8(&output.stdout).map_err(|error| PijError::Adapter {
        adapter: ADAPTER.to_string(),
        message: format!("pid {pid} produced non-UTF-8 stdout: {error}"),
    })?;
    let row = stdout.trim();
    if !row.is_empty() {
        if !output.success {
            return Err(PijError::Adapter {
                adapter: ADAPTER.to_string(),
                message: format!("ps failed for pid {pid} after returning a process row"),
            });
        }
        return parse_lstart(row).map(Some);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let reason = stderr.trim();
    if reason.is_empty() || means_no_process(reason) {
        return Ok(None);
    }

    Err(PijError::Adapter {
        adapter: ADAPTER.to_string(),
        message: format!("could not inspect pid {pid}: {reason}"),
    })
}

fn means_no_process(stderr: &str) -> bool {
    let stderr = stderr.to_ascii_lowercase();
    stderr.contains("no such process")
        || stderr.contains("process id too large")
        || stderr.contains("process id out of range")
        || stderr.contains("process id list syntax error")
}

fn parse_lstart(row: &str) -> Result<u64> {
    let mut fields = row.split_whitespace();
    let weekday = fields.next();
    let month = fields.next().and_then(parse_month);
    let day = fields.next().and_then(|value| value.parse::<u32>().ok());
    let time = fields.next().and_then(parse_time);
    let year = fields.next().and_then(|value| value.parse::<u32>().ok());

    let Some((month, day, (hour, minute, second), year)) = month
        .zip(day)
        .zip(time)
        .zip(year)
        .map(|(((m, d), t), y)| (m, d, t, y))
    else {
        return Err(parse_error(row));
    };
    if weekday.is_none()
        || fields.next().is_some()
        || !(1970..=9999).contains(&year)
        || day == 0
        || day > days_in_month(year, month)
    {
        return Err(parse_error(row));
    }

    Ok(u64::from(year) * 10_000_000_000
        + u64::from(month) * 100_000_000
        + u64::from(day) * 1_000_000
        + u64::from(hour) * 10_000
        + u64::from(minute) * 100
        + u64::from(second))
}

fn parse_month(value: &str) -> Option<u32> {
    match value {
        "Jan" => Some(1),
        "Feb" => Some(2),
        "Mar" => Some(3),
        "Apr" => Some(4),
        "May" => Some(5),
        "Jun" => Some(6),
        "Jul" => Some(7),
        "Aug" => Some(8),
        "Sep" => Some(9),
        "Oct" => Some(10),
        "Nov" => Some(11),
        "Dec" => Some(12),
        _ => None,
    }
}

fn parse_time(value: &str) -> Option<(u32, u32, u32)> {
    let mut fields = value.split(':');
    let hour = fields.next()?.parse::<u32>().ok()?;
    let minute = fields.next()?.parse::<u32>().ok()?;
    let second = fields.next()?.parse::<u32>().ok()?;
    if fields.next().is_some() || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    Some((hour, minute, second))
}

const fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year.is_multiple_of(400) || (year.is_multiple_of(4) && !year.is_multiple_of(100)) => {
            29
        }
        2 => 28,
        _ => 0,
    }
}

fn parse_error(row: &str) -> PijError {
    PijError::Adapter {
        adapter: ADAPTER.to_string(),
        message: format!(
            "could not parse `ps -o lstart=` row {row:?}; expected C-locale `Www Mmm DD HH:MM:SS YYYY`"
        ),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::io;
    use std::sync::Mutex;

    use pij_core::ports::LivenessPort;
    use pij_testkit::block_on;

    use super::{CommandOutput, CommandRunner, ProcLiveness};

    struct ScriptedRunner {
        expected_pid: u32,
        outputs: Mutex<VecDeque<io::Result<CommandOutput>>>,
    }

    impl ScriptedRunner {
        fn one(expected_pid: u32, output: CommandOutput) -> Self {
            Self {
                expected_pid,
                outputs: Mutex::new(VecDeque::from([Ok(output)])),
            }
        }
    }

    impl CommandRunner for ScriptedRunner {
        fn run(&self, pid: u32) -> io::Result<CommandOutput> {
            assert_eq!(
                pid, self.expected_pid,
                "the command seam must receive only the requested pid"
            );
            self.outputs
                .lock()
                .expect("scripted command runner mutex")
                .pop_front()
                .expect("scripted command output")
        }
    }

    fn output(success: bool, stdout: &[u8], stderr: &[u8]) -> CommandOutput {
        CommandOutput {
            success,
            stdout: stdout.to_vec(),
            stderr: stderr.to_vec(),
        }
    }

    #[test]
    fn exact_pid_command_and_macos_parser_are_fixture_backed() {
        let fixture = include_bytes!("../tests/fixtures/ps-macos-lstart.txt");
        let adapter =
            ProcLiveness::with_runner(ScriptedRunner::one(4242, output(true, fixture, b"")));
        assert_eq!(
            block_on(adapter.proc_start(4242)).expect("fixture should parse"),
            Some(20_260_829_091_148)
        );
    }

    #[test]
    fn linux_spacing_is_fixture_backed() {
        let fixture = include_bytes!("../tests/fixtures/ps-linux-lstart.txt");
        let adapter =
            ProcLiveness::with_runner(ScriptedRunner::one(5252, output(true, fixture, b"")));
        assert_eq!(
            block_on(adapter.proc_start(5252)).expect("fixture should parse"),
            Some(20_260_108_002_051)
        );
    }

    #[test]
    fn permission_denied_is_not_dead() {
        let fixture = include_bytes!("../tests/fixtures/ps-permission-denied.txt");
        let adapter =
            ProcLiveness::with_runner(ScriptedRunner::one(6262, output(false, b"", fixture)));
        let error = block_on(adapter.proc_start(6262)).expect_err("inspection refusal is an error");
        assert!(error.to_string().contains("Operation not permitted"));
    }

    #[test]
    fn an_absent_exact_pid_is_none() {
        let adapter = ProcLiveness::with_runner(ScriptedRunner::one(7272, output(false, b"", b"")));
        assert_eq!(
            block_on(adapter.proc_start(7272)).expect("absence is observable"),
            None
        );
    }

    #[test]
    fn malformed_process_output_is_an_adapter_error() {
        let adapter = ProcLiveness::with_runner(ScriptedRunner::one(
            8282,
            output(true, b"not a start time\n", b""),
        ));
        let error =
            block_on(adapter.proc_start(8282)).expect_err("malformed output must not mean dead");
        assert!(error.to_string().contains("could not parse"));
    }
}
