//! Long-lived tmux pane observation feeding the interaction safety gate.

use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use pij_core::error::{PijError, Result};
use pij_core::model::Pane;
use pij_core::ports::{Registry, SeatFilter, TmuxPort};
use pij_harnesses::InteractionGate;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio::time::{Instant, MissedTickBehavior};

const CAPTURE_LINES: u32 = u32::MAX;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ComposerKnowledge {
    Unknown,
    Blank,
    NonBlank,
    /// Text was observed, then a redraw produced a blank capture whose cursor
    /// coordinates may be stale. The gate remains closed until a quiet blank
    /// corroborates that the text actually left.
    PendingClear,
}

#[derive(Debug)]
struct PaneState {
    knowledge: ComposerKnowledge,
}

/// Polls attached tmux pane taps and turns only positively recognised composer
/// states into interaction-gate evidence.
///
/// # Composition recipe
///
/// In `crates/daemon/src/lib.rs`, construct
/// `PaneObserver::new(Arc::clone(&services.registry),
/// Arc::clone(&services.tmux), Arc::clone(&interaction),
/// state_dir.join("pane-signals"),
/// Duration::from_millis(config.pane_observer_interval_ms))?` before publishing
/// the boot key. After publish, call `observer.start()` and store the returned
/// [`PaneObserverLoop`] on `Daemon`. During shutdown, await
/// `pane_observer.shutdown()` after stopping HTTP and delivery; it joins the loop
/// and detaches every tap it owns.
pub struct PaneObserver {
    registry: Arc<dyn Registry>,
    tmux: Arc<dyn TmuxPort>,
    gate: Arc<InteractionGate>,
    sink_dir: PathBuf,
    interval: Duration,
    panes: Mutex<BTreeMap<String, PaneState>>,
}

impl PaneObserver {
    /// Construct an observer without starting it.
    ///
    /// # Errors
    /// Returns [`PijError::Adapter`] when `interval` is zero.
    pub fn new(
        registry: Arc<dyn Registry>,
        tmux: Arc<dyn TmuxPort>,
        gate: Arc<InteractionGate>,
        sink_dir: PathBuf,
        interval: Duration,
    ) -> Result<Self> {
        if interval.is_zero() {
            return Err(observer_error(
                "pane_observer_interval_ms must be greater than zero",
            ));
        }
        Ok(Self {
            registry,
            tmux,
            gate,
            sink_dir,
            interval,
            panes: Mutex::new(BTreeMap::new()),
        })
    }

    /// Start the long-lived observation loop. The first observation waits one
    /// configured interval, matching the daemon's other periodic workers.
    pub fn start(self: &Arc<Self>) -> PaneObserverLoop {
        let (stop, mut stop_rx) = oneshot::channel();
        let observer = Arc::clone(self);
        let interval = self.interval;
        let joined = tokio::spawn(async move {
            let mut schedule = tokio::time::interval_at(Instant::now() + interval, interval);
            schedule.set_missed_tick_behavior(MissedTickBehavior::Delay);
            loop {
                tokio::select! {
                    _ = &mut stop_rx => break,
                    _ = schedule.tick() => {
                        if let Err(error) = observer.observe_once().await {
                            eprintln!("pij-rs pane observer: {error}");
                        }
                    }
                }
            }
        });
        PaneObserverLoop {
            stop,
            joined,
            observer: Arc::clone(self),
        }
    }

    async fn observe_once(&self) -> Result<()> {
        let seats = match self.registry.list(SeatFilter::default()).await {
            Ok(seats) => seats,
            Err(error) => {
                for pane in self.tracked_panes() {
                    self.gate.record_unknown(&pane);
                }
                return Err(error);
            }
        };
        let wanted: BTreeSet<String> = seats.into_iter().filter_map(|seat| seat.pane).collect();
        let panes = match self.tmux.list_panes().await {
            Ok(panes) => panes
                .into_iter()
                .filter(|pane| wanted.contains(&pane.id))
                .collect::<Vec<_>>(),
            Err(error) => {
                for pane in self.tracked_panes() {
                    self.gate.record_unknown(&pane);
                }
                return Err(error);
            }
        };
        let live: BTreeSet<&str> = panes.iter().map(|pane| pane.id.as_str()).collect();
        let retired: Vec<String> = self
            .tracked_panes()
            .into_iter()
            .filter(|pane| !live.contains(pane.as_str()))
            .collect();
        let mut first_error = None;

        for pane in &retired {
            match self.tmux.detach_pane_tap(pane).await {
                Ok(()) => {
                    self.panes.lock().expect("pane observer mutex").remove(pane);
                }
                Err(error) => {
                    first_error.get_or_insert(error);
                }
            }
            self.gate.record_unknown(pane);
        }

        for pane in panes {
            let tracked = self.is_tracked(&pane.id);
            let sink = self.sink_path(&pane.id);
            match self.tmux.attach_pane_tap(&pane.id, &sink).await {
                Ok(()) if !tracked => {
                    self.panes.lock().expect("pane observer mutex").insert(
                        pane.id.clone(),
                        PaneState {
                            knowledge: ComposerKnowledge::Unknown,
                        },
                    );
                }
                Ok(()) => {}
                Err(error) => {
                    self.gate.record_unknown(&pane.id);
                    first_error.get_or_insert(error);
                    continue;
                }
            }

            let bytes = match self.tmux.drain_pane_tap(&pane.id).await {
                Ok(bytes) => bytes,
                Err(error) => {
                    self.set_unknown(&pane.id);
                    first_error.get_or_insert(error);
                    continue;
                }
            };
            let capture = match self.tmux.capture(&pane.id, CAPTURE_LINES).await {
                Ok(capture) => capture,
                Err(error) => {
                    self.set_unknown(&pane.id);
                    first_error.get_or_insert(error);
                    continue;
                }
            };
            let trailing_bytes = match self.tmux.drain_pane_tap(&pane.id).await {
                Ok(bytes) => bytes,
                Err(error) => {
                    self.set_unknown(&pane.id);
                    first_error.get_or_insert(error);
                    continue;
                }
            };
            let tap_active = !bytes.is_empty() || !trailing_bytes.is_empty();
            let Some(composer) = rendered_composer(&capture, &pane) else {
                self.set_unknown(&pane.id);
                continue;
            };

            let blank = composer.chars().all(char::is_whitespace);
            let previous = self.knowledge(&pane.id);
            if blank && tap_active {
                // A redraw makes the current blank inconclusive, so close the
                // gate. Preserve prior composer knowledge independently: the next
                // quiet blank can corroborate either a pending nonblank→blank
                // transition or a previously known-clear composer.
                if previous != ComposerKnowledge::Unknown {
                    self.set_knowledge(&pane.id, ComposerKnowledge::PendingClear);
                    self.gate.record_unknown(&pane.id);
                } else {
                    self.set_unknown(&pane.id);
                }
                continue;
            }
            if blank {
                if matches!(
                    previous,
                    ComposerKnowledge::NonBlank | ComposerKnowledge::PendingClear
                ) {
                    // The ONLY thing that clears: an observed nonblank -> blank
                    // TRANSITION. We watched something leave.
                    self.gate.record_composer_cleared(&pane.id);
                } else {
                    // A blank composer on FIRST SIGHT is not evidence of anything.
                    // It is what a quiet pane and an unparsed pane look like alike,
                    // and permitting on it inverts the unit's whole premise —
                    // review found the port was MORE permissive here than the TS
                    // 60-second rule we declined to inherit for being too eager.
                    //
                    // One heuristic misread of an arbitrary program's dashed rules
                    // around an empty row would otherwise flip a pane to permission
                    // with zero transition evidence.
                    self.set_unknown(&pane.id);
                    self.set_knowledge(&pane.id, ComposerKnowledge::Blank);
                    continue;
                }
                self.set_knowledge(&pane.id, ComposerKnowledge::Blank);
            } else {
                if tap_active {
                    self.gate.record_tap(&pane.id);
                }
                self.gate.observe_composer(&pane.id, &composer);
                self.set_knowledge(&pane.id, ComposerKnowledge::NonBlank);
            }
        }

        match first_error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    async fn detach_all(&self) -> Result<()> {
        let panes = self.tracked_panes();
        let mut first_error = None;
        for pane in panes {
            if let Err(error) = self.tmux.detach_pane_tap(&pane).await {
                first_error.get_or_insert(error);
            }
            self.panes
                .lock()
                .expect("pane observer mutex")
                .remove(&pane);
            self.gate.record_unknown(&pane);
        }
        match first_error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    fn tracked_panes(&self) -> Vec<String> {
        self.panes
            .lock()
            .expect("pane observer mutex")
            .keys()
            .cloned()
            .collect()
    }

    fn is_tracked(&self, pane: &str) -> bool {
        self.panes
            .lock()
            .expect("pane observer mutex")
            .contains_key(pane)
    }

    fn knowledge(&self, pane: &str) -> ComposerKnowledge {
        self.panes
            .lock()
            .expect("pane observer mutex")
            .get(pane)
            .map_or(ComposerKnowledge::Unknown, |state| state.knowledge)
    }

    fn set_knowledge(&self, pane: &str, knowledge: ComposerKnowledge) {
        if let Some(state) = self
            .panes
            .lock()
            .expect("pane observer mutex")
            .get_mut(pane)
        {
            state.knowledge = knowledge;
        }
    }

    fn set_unknown(&self, pane: &str) {
        self.set_knowledge(pane, ComposerKnowledge::Unknown);
        self.gate.record_unknown(pane);
    }

    fn sink_path(&self, pane: &str) -> PathBuf {
        let safe: String = pane
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                    ch
                } else {
                    '_'
                }
            })
            .collect();
        self.sink_dir.join(format!("{safe}.raw"))
    }
}

/// Owned handle for the observer task and every tap it attached.
pub struct PaneObserverLoop {
    stop: oneshot::Sender<()>,
    joined: JoinHandle<()>,
    observer: Arc<PaneObserver>,
}

impl PaneObserverLoop {
    /// Stop future observations, join an in-flight observation, then detach every
    /// tap created by this observer.
    ///
    /// # Errors
    /// Returns [`PijError::Adapter`] if the task panicked or a tap could not be
    /// detached.
    pub async fn shutdown(self) -> Result<()> {
        let _ = self.stop.send(());
        self.joined.await.map_err(|error| {
            observer_error(format!("pane observer task did not stop cleanly: {error}"))
        })?;
        self.observer.detach_all().await
    }
}

fn rendered_composer(capture: &str, pane: &Pane) -> Option<String> {
    let (cursor_x, cursor_y) = pane.cursor_x.zip(pane.cursor_y)?;
    let lines: Vec<&str> = capture.lines().collect();

    for (row, line) in lines.iter().enumerate().rev() {
        let trimmed = line.trim();
        if let Some(inner) = trimmed
            .strip_prefix('╰')
            .and_then(|inner| inner.strip_suffix('╯'))
        {
            let leading = line.chars().position(|ch| ch == '╰')?;
            let left_rules = inner.chars().take_while(|ch| *ch == '─').count();
            let after_rules: String = inner.chars().skip(left_rules).collect();
            let spacing = after_rules
                .chars()
                .take_while(|ch| ch.is_whitespace())
                .count();
            let payload: String = after_rules
                .chars()
                .skip(spacing)
                .collect::<String>()
                .trim_end_matches('─')
                .trim_end()
                .to_string();
            if payload.is_empty() && usize::try_from(cursor_y).ok()? == row {
                return Some(String::new());
            }
            let first_column = leading + 1 + left_rules + spacing;
            return clip_payload(&payload, row, first_column, cursor_x, cursor_y);
        }
    }

    let rules: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter_map(|(row, line)| is_plain_rule(line).then_some(row))
        .collect();
    for pair in (1..rules.len()).rev() {
        let lower = rules[pair - 1];
        let upper = rules[pair];
        let interior = &lines[lower + 1..upper];
        if interior
            .first()
            .is_some_and(|line| line.trim_start().starts_with('❯'))
        {
            return clip_multiline(interior, lower + 1, cursor_x, cursor_y);
        }
        if pair == rules.len() - 1 && interior.iter().all(|line| line.trim().is_empty()) {
            return clip_multiline(interior, lower + 1, cursor_x, cursor_y);
        }
    }

    let prompt = lines
        .iter()
        .enumerate()
        .rev()
        .find(|(_, line)| line.trim_start().starts_with('❯'))?;
    let trailing = &lines[prompt.0 + 1..];
    if !trailing.iter().any(|line| is_copilot_footer(line)) {
        return None;
    }
    let composer_end = trailing
        .iter()
        .position(|line| is_copilot_footer(line))
        .map_or(lines.len(), |offset| prompt.0 + 1 + offset);
    clip_multiline(&lines[prompt.0..composer_end], prompt.0, cursor_x, cursor_y)
}

fn clip_multiline(
    lines: &[&str],
    start_row: usize,
    cursor_x: u32,
    cursor_y: u32,
) -> Option<String> {
    let active = usize::try_from(cursor_y).ok()?.checked_sub(start_row)?;
    if active >= lines.len() {
        return None;
    }
    let mut clipped: Vec<String> = lines.iter().map(|line| (*line).to_string()).collect();
    clipped[active] = take_chars(&clipped[active], usize::try_from(cursor_x).ok()?);
    if let Some(first) = clipped.first_mut() {
        *first = strip_prompt(first);
    }
    Some(clipped.join("\n"))
}

fn clip_payload(
    payload: &str,
    row: usize,
    first_column: usize,
    cursor_x: u32,
    cursor_y: u32,
) -> Option<String> {
    if usize::try_from(cursor_y).ok()? != row {
        return None;
    }
    let column = usize::try_from(cursor_x).ok()?.checked_sub(first_column)?;
    Some(take_chars(payload, column))
}

fn take_chars(text: &str, count: usize) -> String {
    text.chars().take(count).collect()
}

fn strip_prompt(line: &str) -> String {
    let trimmed = line.trim_start();
    trimmed
        .strip_prefix('❯')
        .map_or_else(|| line.to_string(), |rest| rest.trim_start().to_string())
}

fn is_plain_rule(line: &str) -> bool {
    const BOX: [char; 20] = [
        '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '╭', '╮', '╰', '╯', '╠', '╣', '╦', '╩', '╬',
        '│', '║',
    ];
    !line.chars().any(|ch| BOX.contains(&ch))
        && line
            .split(|ch| ch != '─')
            .any(|run| run.chars().count() >= 8)
}

fn is_copilot_footer(line: &str) -> bool {
    let lower = line.trim().to_lowercase();
    lower.starts_with("/ commands") || lower.contains("esc interrupt") || lower.contains("context")
}

fn observer_error(message: impl Into<String>) -> PijError {
    PijError::Adapter {
        adapter: "daemon/pane-observer".to_string(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use pij_core::model::{Harness, SeatDescriptor};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    use pij_testkit::fakes::{FakeRegistry, FakeTmux};
    use pij_tmux::TmuxAdapter;

    use super::*;

    fn pane(id: &str, x: u32, y: u32) -> Pane {
        Pane {
            id: id.to_string(),
            session: "pij".to_string(),
            window: "agent".to_string(),
            title: String::new(),
            cursor_x: Some(x),
            cursor_y: Some(y),
        }
    }

    fn framed(composer: &str) -> String {
        format!("transcript\n────────────\n❯ {composer}\n────────────")
    }

    async fn registry(panes: &[&str]) -> Arc<FakeRegistry> {
        let registry = Arc::new(FakeRegistry::new());
        for (index, pane) in panes.iter().enumerate() {
            let mut seat = SeatDescriptor::new(
                format!("pij-observed-{index}"),
                Harness::Pi,
                "/tmp/pij-observer",
            );
            seat.pane = Some((*pane).to_string());
            registry.put(seat).await.expect("register observed pane");
        }
        registry
    }

    #[test]
    fn cursor_clips_suggestion_text_to_the_right() {
        let pane = pane("%1", 7, 2);
        assert_eq!(
            rendered_composer(&framed("hello suggested-text"), &pane),
            Some("hello".to_string())
        );
    }

    #[test]
    fn omp_inline_composer_is_clipped_at_the_measured_cursor() {
        assert_eq!(
            rendered_composer("╰─ hello suggested-text ─╯", &pane("%1", 8, 0)),
            Some("hello".to_string())
        );
        assert_eq!(
            rendered_composer("╰─     ─╯", &pane("%1", 3, 0)),
            Some(String::new())
        );
    }

    #[test]
    fn missing_cursor_pair_or_unknown_layout_is_unknown() {
        let mut missing = pane("%1", 0, 0);
        missing.cursor_x = None;
        assert_eq!(rendered_composer(&framed("hello"), &missing), None);
        assert_eq!(
            rendered_composer("ordinary shell output", &pane("%2", 1, 0)),
            None
        );
    }

    #[tokio::test]
    async fn decision_table_keeps_unknown_and_stale_nonblank_blocked_until_clear() {
        let tmux = Arc::new(
            FakeTmux::new()
                .with_pane(pane("%1", 7, 2))
                .script_tap(b"typed".to_vec())
                .script_tap(Vec::new())
                .script_tap(Vec::new())
                .script_capture(framed("hello"))
                .script_capture(framed("hello"))
                .script_capture(framed("")),
        );
        let registry = registry(&["%1"]).await;
        let gate = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        let observer = PaneObserver::new(
            Arc::clone(&registry) as Arc<dyn Registry>,
            Arc::clone(&tmux) as Arc<dyn TmuxPort>,
            Arc::clone(&gate),
            PathBuf::from("/tmp/pij-observer-decision"),
            Duration::from_millis(1),
        )
        .expect("observer");

        assert!(!gate.permits_injection("%never").await.expect("unknown"));
        observer.observe_once().await.expect("typing observation");
        assert!(!gate.permits_injection("%1").await.expect("typing blocks"));
        observer.observe_once().await.expect("stale observation");
        assert!(
            !gate
                .permits_injection("%1")
                .await
                .expect("stale draft blocks")
        );
        observer.observe_once().await.expect("clear observation");
        assert!(gate.permits_injection("%1").await.expect("clear permits"));
        observer.detach_all().await.expect("detach");
    }

    #[tokio::test]
    async fn redraw_blank_preserves_pending_clear_until_a_quiet_pass_corroborates_it() {
        let tmux = Arc::new(
            FakeTmux::new()
                .with_pane(pane("%108", 7, 2))
                // Each observation drains once before and once after capture.
                .script_tap(Vec::new())
                .script_tap(Vec::new())
                .script_tap(b"clear redraw".to_vec())
                .script_tap(Vec::new())
                .script_tap(Vec::new())
                .script_tap(Vec::new())
                .script_tap(b"idle redraw".to_vec())
                .script_tap(Vec::new())
                .script_tap(Vec::new())
                .script_tap(Vec::new())
                .script_capture(framed("draft"))
                .script_capture(framed(""))
                .script_capture(framed(""))
                .script_capture(framed(""))
                .script_capture(framed("")),
        );
        let registry = registry(&["%108"]).await;
        let gate = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        let observer = PaneObserver::new(
            Arc::clone(&registry) as Arc<dyn Registry>,
            Arc::clone(&tmux) as Arc<dyn TmuxPort>,
            Arc::clone(&gate),
            PathBuf::from("/tmp/pij-observer-redraw-clear"),
            Duration::from_millis(1),
        )
        .expect("observer");

        observer.observe_once().await.expect("nonblank observation");
        assert!(!gate.permits_injection("%108").await.expect("draft blocks"));

        observer
            .observe_once()
            .await
            .expect("clear redraw observation");
        assert!(
            !gate
                .permits_injection("%108")
                .await
                .expect("redraw blank stays closed"),
            "an active redraw is not permission"
        );
        observer.observe_once().await.expect("clear corroboration");
        assert!(
            gate.permits_injection("%108")
                .await
                .expect("corroborated clear"),
            "a quiet blank after the pending transition must authorize injection"
        );

        observer
            .observe_once()
            .await
            .expect("idle redraw observation");
        assert!(
            !gate
                .permits_injection("%108")
                .await
                .expect("idle redraw stays closed"),
            "a redraw temporarily revokes even prior clear evidence"
        );
        observer
            .observe_once()
            .await
            .expect("idle redraw corroboration");
        assert!(
            gate.permits_injection("%108")
                .await
                .expect("re-corroborated clear"),
            "a quiet blank restores previously established clear evidence"
        );
        observer.detach_all().await.expect("detach");
    }

    struct LiveTmuxSession {
        name: String,
    }

    impl LiveTmuxSession {
        fn start() -> Option<Self> {
            if !Command::new("tmux")
                .arg("-V")
                .output()
                .ok()?
                .status
                .success()
            {
                return None;
            }
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let name = format!("pij-rs-observer-{}-{nonce}", std::process::id());
            let output = Command::new("tmux")
                .args([
                    "new-session",
                    "-d",
                    "-s",
                    &name,
                    "-x",
                    "80",
                    "-y",
                    "24",
                    "cat",
                ])
                .output()
                .expect("tmux was found by the version probe");
            assert!(
                output.status.success(),
                "tmux new-session failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            Some(Self { name })
        }
    }

    impl Drop for LiveTmuxSession {
        fn drop(&mut self) {
            let _ = Command::new("tmux")
                .args(["kill-session", "-t", &self.name])
                .status();
        }
    }

    #[tokio::test]
    async fn real_tmux_pane_observation_blocks_on_a_visible_composer() {
        let Some(session) = LiveTmuxSession::start() else {
            eprintln!("SKIP real pane observer test: tmux unavailable");
            return;
        };
        let tmux = Arc::new(TmuxAdapter::for_session(&session.name));
        let pane = tmux
            .list_panes()
            .await
            .expect("list isolated pane")
            .into_iter()
            .next()
            .expect("isolated pane");
        let registry = registry(&[pane.id.as_str()]).await;
        let gate = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        let observer = PaneObserver::new(
            Arc::clone(&registry) as Arc<dyn Registry>,
            Arc::clone(&tmux) as Arc<dyn TmuxPort>,
            Arc::clone(&gate),
            std::env::temp_dir().join(format!("{}-signals", session.name)),
            Duration::from_millis(1),
        )
        .expect("observer");

        observer.observe_once().await.expect("attach real tap");
        tmux.send_keys(&pane.id, "╰─ hello ─╯")
            .await
            .expect("draw composer in real pane");
        tokio::time::sleep(Duration::from_millis(100)).await;
        observer.observe_once().await.expect("observe real pane");

        assert!(
            !gate.permits_injection(&pane.id).await.expect("typing gate"),
            "visible real-pane composer must block injection"
        );
        observer.detach_all().await.expect("detach real tap");
    }

    #[tokio::test]
    async fn second_observer_pass_repairs_a_vanished_os_pipe_and_keeps_growing() {
        let Some(session) = LiveTmuxSession::start() else {
            eprintln!("SKIP real pane observer test: tmux unavailable");
            return;
        };
        let tmux = Arc::new(TmuxAdapter::for_session(&session.name));
        let pane = tmux
            .list_panes()
            .await
            .expect("list isolated pane")
            .into_iter()
            .next()
            .expect("isolated pane");
        let registry = registry(&[pane.id.as_str()]).await;
        let gate = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        let observer = PaneObserver::new(
            Arc::clone(&registry) as Arc<dyn Registry>,
            Arc::clone(&tmux) as Arc<dyn TmuxPort>,
            gate,
            std::env::temp_dir().join(format!("{}-signals", session.name)),
            Duration::from_millis(1),
        )
        .expect("observer");

        observer.observe_once().await.expect("first observer pass");
        tmux.send_keys(&pane.id, "first-pass")
            .await
            .expect("first output");
        tokio::time::sleep(Duration::from_millis(100)).await;
        let sink = observer.sink_path(&pane.id);
        let first = std::fs::read(&sink).expect("first tap bytes");
        assert!(String::from_utf8_lossy(&first).contains("first-pass"));

        // Reproduce the dogfood state: our offset record survives while tmux's
        // output pipe has vanished. The next daemon pass must repair, not trust,
        // that stale in-memory ownership claim.
        assert!(
            Command::new("tmux")
                .args(["pipe-pane", "-t", &pane.id])
                .status()
                .expect("close OS pipe")
                .success()
        );
        observer.observe_once().await.expect("second observer pass");
        tmux.send_keys(&pane.id, "second-pass")
            .await
            .expect("second output");
        tokio::time::sleep(Duration::from_millis(100)).await;
        let second = std::fs::read(&sink).expect("second tap bytes");
        assert!(second.len() > first.len(), "tap must grow after pass two");
        assert!(String::from_utf8_lossy(&second).contains("second-pass"));

        observer.detach_all().await.expect("detach real tap");
    }

    #[tokio::test(start_paused = true)]
    async fn observer_loop_survives_one_tmux_error_and_processes_the_next_pane() {
        let tmux = Arc::new(
            FakeTmux::new()
                .with_pane(pane("%1", 7, 2))
                .with_pane(pane("%2", 2, 2))
                .script_tap_error("transient tap read")
                .script_tap(Vec::new())
                .script_capture(framed("")),
        );
        let registry = registry(&["%1", "%2"]).await;
        let gate = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        let observer = Arc::new(
            PaneObserver::new(
                Arc::clone(&registry) as Arc<dyn Registry>,
                Arc::clone(&tmux) as Arc<dyn TmuxPort>,
                Arc::clone(&gate),
                PathBuf::from("/tmp/pij-observer-loop"),
                Duration::from_millis(1),
            )
            .expect("observer"),
        );
        let loop_ = observer.start();
        tokio::task::yield_now().await;

        tokio::time::advance(Duration::from_millis(1)).await;
        tokio::task::yield_now().await;

        // The second pane is OBSERVED after the first pane's drain error — that is
        // the loop property. It is NOT permitted, because a first-sight blank
        // composer is not evidence of anything (review F2): only a watched
        // nonblank -> blank transition clears. The loop test asserts the loop kept
        // going, not that the observation reached a particular verdict.
        assert!(
            !gate
                .permits_injection("%2")
                .await
                .expect("second pane observed"),
            "the second pane must be OBSERVED after the first drain error, and a \
             first-sight blank must still block"
        );
        let calls = tmux.calls();
        assert!(calls.iter().any(|call| call == "drain_pane_tap:%1"));
        assert!(calls.iter().any(|call| call == "drain_pane_tap:%2"));
        loop_.shutdown().await.expect("shutdown");
    }

    /// Review F2 — a BLANK composer on first sight is not evidence of anything.
    ///
    /// It is what a quiet pane and an unparsed pane look like alike, so permitting
    /// on it inverted the unit's premise: the port was MORE permissive here than
    /// the TS 60-second rule we declined to inherit for being too eager. One
    /// heuristic misread of an arbitrary program's dashed rules around an empty
    /// row would flip a pane to permission with zero transition evidence.
    ///
    /// Mutation witness: restore the `observe_composer` call in the first-sight
    /// branch and this test fails.
    #[tokio::test]
    async fn a_first_sight_blank_composer_does_not_permit_injection() {
        let tmux = Arc::new(
            FakeTmux::new()
                // Cursor on the COMPOSER row (y=2), as the working decision-table
                // fixture uses. y=1 is the rule line, and a cursor there makes
                // rendered_composer return None — the pass then takes the
                // unknown-layout branch and the test proves nothing.
                .with_pane(pane("%9", 3, 2))
                // TWO empty taps: the observer drains before and after the
                // capture, and a fixture supplying one leaves the second drain
                // unscripted — which sends the pass down the unknown-layout path
                // and makes this test pass without ever reaching the branch it
                // claims to defend. Found by running the mutation, not by reading.
                .script_tap(Vec::new())
                .script_tap(Vec::new())
                .script_capture(framed("")),
        );
        let registry = registry(&["%9"]).await;
        let gate = Arc::new(InteractionGate::new(Arc::clone(&tmux) as Arc<dyn TmuxPort>));
        let observer = PaneObserver::new(
            Arc::clone(&registry) as Arc<dyn Registry>,
            Arc::clone(&tmux) as Arc<dyn TmuxPort>,
            Arc::clone(&gate),
            PathBuf::from("/tmp/pij-observer-first-sight"),
            Duration::from_millis(1),
        )
        .expect("observer");

        observer.observe_once().await.expect("first observation");

        assert!(
            !gate
                .permits_injection("%9")
                .await
                .expect("the pane was observed"),
            "a blank composer we have never seen anything leave is UNKNOWN, not clear"
        );
    }
}
