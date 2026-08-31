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
        return parse_process_start(row).map(Some);
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

/// Parse Claude's C-locale `procStart` using the same identity encoding as [`ProcLiveness`].
///
/// # Errors
/// Returns an adapter error when the row is not `Www Mmm DD HH:MM:SS YYYY`.
pub fn parse_process_start(row: &str) -> Result<u64> {
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

/// Read the host's current UTC offset in minutes from the platform clock.
///
/// Spawn binding uses this only for a fresh process, so the current offset is
/// the offset at process start; no historical timezone lookup is required.
///
/// # Errors
/// Returns an adapter error when `date +%z` fails or emits an invalid offset.
pub fn local_utc_offset_minutes() -> Result<i32> {
    let output = Command::new("date")
        .arg("+%z")
        .env("LC_ALL", "C")
        .output()
        .map_err(|error| PijError::Adapter {
            adapter: ADAPTER.to_string(),
            message: format!("could not read local UTC offset: {error}"),
        })?;
    if !output.status.success() {
        return Err(PijError::Adapter {
            adapter: ADAPTER.to_string(),
            message: "date +%z failed while reading local UTC offset".to_string(),
        });
    }
    let value = std::str::from_utf8(&output.stdout)
        .map_err(|error| PijError::Adapter {
            adapter: ADAPTER.to_string(),
            message: format!("local UTC offset was not UTF-8: {error}"),
        })?
        .trim();
    parse_utc_offset(value).ok_or_else(|| PijError::Adapter {
        adapter: ADAPTER.to_string(),
        message: format!("invalid date +%z offset {value:?}; expected +HHMM or -HHMM"),
    })
}

/// Compare Claude's UTC `procStart` row with the local-wall-time identity from [`ProcLiveness`].
///
/// # Errors
/// Returns an adapter error when either timestamp is malformed.
pub fn process_start_matches_utc_record(
    record_utc: &str,
    observed_local: u64,
    utc_offset_minutes: i32,
) -> Result<bool> {
    let record = parse_process_start(record_utc)?;
    let record_seconds = packed_naive_seconds(record)?;
    let observed_seconds = packed_naive_seconds(observed_local)?;
    Ok(observed_seconds - record_seconds == i64::from(utc_offset_minutes) * 60)
}

fn parse_utc_offset(value: &str) -> Option<i32> {
    if value.len() != 5 {
        return None;
    }
    let sign = match value.as_bytes()[0] {
        b'+' => 1,
        b'-' => -1,
        _ => return None,
    };
    let hour = value[1..3].parse::<i32>().ok()?;
    let minute = value[3..5].parse::<i32>().ok()?;
    (hour <= 23 && minute <= 59).then_some(sign * (hour * 60 + minute))
}

fn packed_naive_seconds(value: u64) -> Result<i64> {
    let year = u32::try_from(value / 10_000_000_000).unwrap_or(u32::MAX);
    let month = u32::try_from(value / 100_000_000 % 100).unwrap_or(u32::MAX);
    let day = u32::try_from(value / 1_000_000 % 100).unwrap_or(u32::MAX);
    let hour = u32::try_from(value / 10_000 % 100).unwrap_or(u32::MAX);
    let minute = u32::try_from(value / 100 % 100).unwrap_or(u32::MAX);
    let second = u32::try_from(value % 100).unwrap_or(u32::MAX);
    if !(1970..=9999).contains(&year)
        || month == 0
        || month > 12
        || day == 0
        || day > days_in_month(year, month)
        || hour > 23
        || minute > 59
        || second > 59
    {
        return Err(parse_error(&value.to_string()));
    }

    let years = i64::from(year - 1970);
    let mut days = years * 365 + leap_days_before(year) - leap_days_before(1970);
    for prior_month in 1..month {
        days += i64::from(days_in_month(year, prior_month));
    }
    days += i64::from(day - 1);
    Ok(days * 86_400 + i64::from(hour) * 3_600 + i64::from(minute) * 60 + i64::from(second))
}

const fn leap_days_before(year: u32) -> i64 {
    let prior = year - 1;
    (prior / 4 - prior / 100 + prior / 400) as i64
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

    use super::{CommandOutput, CommandRunner, ProcLiveness, process_start_matches_utc_record};

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
    fn utc_record_matches_the_same_local_start_and_rejects_recycled_pid_time() {
        assert!(
            process_start_matches_utc_record("Mon Aug 31 10:02:54 2026", 20_260_831_200_254, 600,)
                .unwrap()
        );
        assert!(
            !process_start_matches_utc_record("Mon Aug 31 10:02:53 2026", 20_260_831_200_254, 600,)
                .unwrap()
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
