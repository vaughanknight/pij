use std::env;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::ops::Range;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

const INBOUND_KEY: &str = "crossSessionInbound";
const ACCEPT: &str = "accept";
const HOOKS_KEY: &str = "hooks";
const SESSION_START_KEY: &str = "SessionStart";
const CLAUDE_SESSION_START_SCRIPT: &str =
    include_str!("../../../harness/scripts/claude-session-start-pij.sh");
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// A pure decision about whether and how a Claude settings document must change.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EnsurePlan {
    /// The document already carries the required value.
    NoChange { before: Option<String> },
    /// Persist these bytes after backing up an existing document.
    Write {
        before: Option<String>,
        contents: String,
    },
    /// The document is not safe to edit.
    Refuse { error: String },
}

/// One inspected Claude home and the action taken there.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EnsureReport {
    pub home: PathBuf,
    pub before: Option<String>,
    pub after: String,
    pub changed: bool,
    pub backup: Option<PathBuf>,
    pub error: Option<String>,
}

/// Read-only state of one Claude settings file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClaudeInboundState {
    pub home: PathBuf,
    pub file_exists: bool,
    pub current: Option<String>,
    pub error: Option<String>,
}

/// Read-only state of the pij SessionStart hook in one Claude settings file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClaudeHookState {
    pub home: PathBuf,
    pub file_exists: bool,
    pub installed: bool,
    pub command: Option<String>,
    pub error: Option<String>,
}

/// Discover every Claude configuration home this process can govern.
#[must_use]
pub fn claude_homes() -> Vec<PathBuf> {
    claude_homes_from(env::var_os("CLAUDE_CONFIG_DIR"), env::var_os("HOME"))
}

/// Resolve Claude homes from explicit environment values.
#[must_use]
pub fn claude_homes_from(config_dir: Option<OsString>, home: Option<OsString>) -> Vec<PathBuf> {
    let home = home.filter(|value| !value.is_empty()).map(PathBuf::from);
    let mut homes = Vec::with_capacity(2);
    if let Some(config_dir) = config_dir
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
    {
        homes.push(config_dir);
    } else if let Some(home) = &home {
        homes.push(home.join(".claude"));
    }
    if let Some(alt) = home.map(|home| home.join(".claude-alt"))
        && alt.exists()
        && !homes.contains(&alt)
    {
        homes.push(alt);
    }
    homes
}

/// Plan the minimal safe edit for one Claude settings document.
#[must_use]
pub fn plan_inbound_accept(existing: Option<&str>) -> EnsurePlan {
    let Some(existing) = existing else {
        return EnsurePlan::Write {
            before: None,
            contents: format!("{{\n  \"{INBOUND_KEY}\": \"{ACCEPT}\"\n}}\n"),
        };
    };
    if existing.trim().is_empty() {
        return EnsurePlan::Write {
            before: None,
            contents: format!("{{\n  \"{INBOUND_KEY}\": \"{ACCEPT}\"\n}}\n"),
        };
    }
    let parsed: Value = match serde_json::from_str(existing) {
        Ok(parsed) => parsed,
        Err(error) => {
            return EnsurePlan::Refuse {
                error: format!("malformed settings.json: {error}"),
            };
        }
    };
    let Some(object) = parsed.as_object() else {
        return EnsurePlan::Refuse {
            error: "settings.json root must be a JSON object".to_string(),
        };
    };
    let before = object.get(INBOUND_KEY).map(render_value);
    if object.get(INBOUND_KEY).and_then(Value::as_str) == Some(ACCEPT) {
        return EnsurePlan::NoChange { before };
    }
    let contents = if object.contains_key(INBOUND_KEY) {
        let Some(range) = find_top_level_value(existing, INBOUND_KEY) else {
            return EnsurePlan::Refuse {
                error: "could not locate crossSessionInbound in valid settings.json".to_string(),
            };
        };
        let mut contents = String::with_capacity(existing.len() + ACCEPT.len());
        contents.push_str(&existing[..range.start]);
        contents
            .push_str(&serde_json::to_string(ACCEPT).expect("string serialization is infallible"));
        contents.push_str(&existing[range.end..]);
        contents
    } else {
        insert_top_level_property(existing, object.is_empty())
    };
    EnsurePlan::Write { before, contents }
}

/// Ensure every named Claude home accepts cross-session inbound messages.
#[must_use]
pub fn ensure_claude_inbound_accept(homes: &[PathBuf]) -> Vec<EnsureReport> {
    homes
        .iter()
        .map(|home| ensure_home(home, ACCEPT, plan_inbound_accept))
        .collect()
}

/// Plan the minimal safe edit that installs pij's Claude SessionStart hook.
#[must_use]
pub fn plan_claude_session_start_hook(existing: Option<&str>, command: &str) -> EnsurePlan {
    if command.is_empty() {
        return EnsurePlan::Refuse {
            error: "SessionStart hook command must not be empty".to_string(),
        };
    }
    let entry = serde_json::json!({
        "matcher": "",
        "hooks": [{"type": "command", "command": command}],
    });
    let entry = serde_json::to_string(&entry).expect("hook serialization is infallible");
    let Some(existing) = existing else {
        return EnsurePlan::Write {
            before: None,
            contents: format!(
                "{{\n  \"{HOOKS_KEY}\": {{\n    \"{SESSION_START_KEY}\": [{entry}]\n  }}\n}}\n"
            ),
        };
    };
    if existing.trim().is_empty() {
        return EnsurePlan::Write {
            before: None,
            contents: format!(
                "{{\n  \"{HOOKS_KEY}\": {{\n    \"{SESSION_START_KEY}\": [{entry}]\n  }}\n}}\n"
            ),
        };
    }
    let parsed: Value = match serde_json::from_str(existing) {
        Ok(parsed) => parsed,
        Err(error) => {
            return EnsurePlan::Refuse {
                error: format!("malformed settings.json: {error}"),
            };
        }
    };
    let Some(root) = parsed.as_object() else {
        return EnsurePlan::Refuse {
            error: "settings.json root must be a JSON object".to_string(),
        };
    };
    let Some(hooks) = root.get(HOOKS_KEY) else {
        return EnsurePlan::Write {
            before: None,
            contents: insert_object_property(
                existing,
                root.is_empty(),
                HOOKS_KEY,
                &format!("{{\"{SESSION_START_KEY}\":[{entry}]}}"),
            ),
        };
    };
    let Some(hooks_object) = hooks.as_object() else {
        return EnsurePlan::Refuse {
            error: "settings.json hooks must be a JSON object".to_string(),
        };
    };
    let Some(hooks_range) = find_top_level_value(existing, HOOKS_KEY) else {
        return EnsurePlan::Refuse {
            error: "could not locate hooks in valid settings.json".to_string(),
        };
    };
    let hooks_document = &existing[hooks_range.clone()];
    let Some(session_start) = hooks_object.get(SESSION_START_KEY) else {
        let updated_hooks = insert_object_property(
            hooks_document,
            hooks_object.is_empty(),
            SESSION_START_KEY,
            &format!("[{entry}]"),
        );
        return EnsurePlan::Write {
            before: None,
            contents: replace_range(existing, hooks_range, &updated_hooks),
        };
    };
    let Some(session_start) = session_start.as_array() else {
        return EnsurePlan::Refuse {
            error: "settings.json hooks.SessionStart must be a JSON array".to_string(),
        };
    };
    let Some(session_range) = find_top_level_value(hooks_document, SESSION_START_KEY) else {
        return EnsurePlan::Refuse {
            error: "could not locate hooks.SessionStart in valid settings.json".to_string(),
        };
    };
    if session_start
        .iter()
        .any(|entry| hook_entry_contains(entry, command))
    {
        return EnsurePlan::NoChange {
            before: Some(command.to_string()),
        };
    }
    if let Some(before) = first_managed_hook_command(session_start) {
        let mut updated_session = session_start.clone();
        replace_managed_hook_command(&mut updated_session, command);
        let updated_session =
            serde_json::to_string(&updated_session).expect("hook serialization is infallible");
        let updated_hooks = replace_range(hooks_document, session_range, &updated_session);
        return EnsurePlan::Write {
            before: Some(before),
            contents: replace_range(existing, hooks_range, &updated_hooks),
        };
    }
    let updated_session = append_array_value(
        &hooks_document[session_range.clone()],
        session_start.is_empty(),
        &entry,
    );
    let updated_hooks = replace_range(hooks_document, session_range, &updated_session);
    EnsurePlan::Write {
        before: None,
        contents: replace_range(existing, hooks_range, &updated_hooks),
    }
}
fn first_managed_hook_command(entries: &[Value]) -> Option<String> {
    entries.iter().find_map(|entry| {
        entry.get("hooks")?.as_array()?.iter().find_map(|hook| {
            let command = hook.get("command")?.as_str()?;
            is_managed_hook_command(command).then(|| command.to_string())
        })
    })
}

fn replace_managed_hook_command(entries: &mut [Value], command: &str) {
    for entry in entries {
        let Some(hooks) = entry.get_mut("hooks").and_then(Value::as_array_mut) else {
            continue;
        };
        for hook in hooks {
            let Some(current) = hook.get("command").and_then(Value::as_str) else {
                continue;
            };
            if is_managed_hook_command(current) {
                hook["command"] = Value::String(command.to_string());
                return;
            }
        }
    }
}

fn is_managed_hook_command(command: &str) -> bool {
    command
        .trim_matches('\'')
        .ends_with("/claude-session-start-pij.sh")
}

/// Ensure every named Claude home invokes pij's SessionStart hook.
#[must_use]
pub fn ensure_claude_session_start_hook(
    homes: &[PathBuf],
    script_path: &Path,
) -> Vec<EnsureReport> {
    let command = shell_command(script_path);
    homes
        .iter()
        .map(|home| {
            ensure_home(home, &command, |existing| {
                plan_claude_session_start_hook(existing, &command)
            })
        })
        .collect()
}

/// Inspect the pij SessionStart hook in every named Claude home.
#[must_use]
pub fn inspect_claude_session_start_hook(
    homes: &[PathBuf],
    script_path: &Path,
) -> Vec<ClaudeHookState> {
    let command = shell_command(script_path);
    homes
        .iter()
        .map(|home| {
            let path = home.join("settings.json");
            match fs::read_to_string(&path) {
                Ok(existing) => match plan_claude_session_start_hook(Some(&existing), &command) {
                    EnsurePlan::NoChange { before } => ClaudeHookState {
                        home: home.clone(),
                        file_exists: true,
                        installed: true,
                        command: before,
                        error: None,
                    },
                    EnsurePlan::Write { before, .. } => ClaudeHookState {
                        home: home.clone(),
                        file_exists: true,
                        installed: false,
                        command: before,
                        error: None,
                    },
                    EnsurePlan::Refuse { error } => ClaudeHookState {
                        home: home.clone(),
                        file_exists: true,
                        installed: false,
                        command: None,
                        error: Some(error),
                    },
                },
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => ClaudeHookState {
                    home: home.clone(),
                    file_exists: false,
                    installed: false,
                    command: None,
                    error: None,
                },
                Err(error) => ClaudeHookState {
                    home: home.clone(),
                    file_exists: true,
                    installed: false,
                    command: None,
                    error: Some(format!("could not read {}: {error}", path.display())),
                },
            }
        })
        .collect()
}

/// Materialize the embedded Claude hook at a stable daemon-owned path.
pub fn install_claude_session_start_script(state_dir: &Path) -> std::io::Result<PathBuf> {
    fs::create_dir_all(state_dir)?;
    let path = state_dir.join("claude-session-start-pij.sh");
    if fs::read_to_string(&path).ok().as_deref() != Some(CLAUDE_SESSION_START_SCRIPT) {
        atomic_replace(&path, CLAUDE_SESSION_START_SCRIPT.as_bytes())?;
    }
    make_executable(&path)?;
    Ok(path)
}

/// Inspect every named Claude home without changing any file.
#[must_use]
pub fn inspect_claude_inbound(homes: &[PathBuf]) -> Vec<ClaudeInboundState> {
    homes
        .iter()
        .map(|home| {
            let path = home.join("settings.json");
            match fs::read_to_string(&path) {
                Ok(existing) => match plan_inbound_accept(Some(&existing)) {
                    EnsurePlan::NoChange { before } | EnsurePlan::Write { before, .. } => {
                        ClaudeInboundState {
                            home: home.clone(),
                            file_exists: true,
                            current: before,
                            error: None,
                        }
                    }
                    EnsurePlan::Refuse { error } => ClaudeInboundState {
                        home: home.clone(),
                        file_exists: true,
                        current: None,
                        error: Some(error),
                    },
                },
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => ClaudeInboundState {
                    home: home.clone(),
                    file_exists: false,
                    current: None,
                    error: None,
                },
                Err(error) => ClaudeInboundState {
                    home: home.clone(),
                    file_exists: true,
                    current: None,
                    error: Some(format!("could not read {}: {error}", path.display())),
                },
            }
        })
        .collect()
}

fn ensure_home<F>(home: &Path, after: &str, plan: F) -> EnsureReport
where
    F: FnOnce(Option<&str>) -> EnsurePlan,
{
    let path = home.join("settings.json");
    let existing = match fs::read_to_string(&path) {
        Ok(existing) => Some(existing),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            return report(
                home,
                None,
                after,
                false,
                None,
                Some(format!("could not read {}: {error}", path.display())),
            );
        }
    };
    match plan(existing.as_deref()) {
        EnsurePlan::NoChange { before } => report(home, before, after, false, None, None),
        EnsurePlan::Refuse { error } => report(home, None, after, false, None, Some(error)),
        EnsurePlan::Write { before, contents } => {
            if let Err(error) = fs::create_dir_all(home) {
                return report(
                    home,
                    before,
                    after,
                    false,
                    None,
                    Some(format!("could not create {}: {error}", home.display())),
                );
            }
            let backup = if existing.is_some() {
                let backup = home.join(format!("settings.json.bak-{}", unix_millis()));
                if let Err(error) = fs::copy(&path, &backup) {
                    return report(
                        home,
                        before,
                        after,
                        false,
                        None,
                        Some(format!(
                            "could not back up {} to {}: {error}",
                            path.display(),
                            backup.display()
                        )),
                    );
                }
                Some(backup)
            } else {
                None
            };
            if let Err(error) = atomic_replace(&path, contents.as_bytes()) {
                return report(
                    home,
                    before,
                    after,
                    false,
                    backup,
                    Some(format!(
                        "could not write {} atomically: {error}",
                        path.display()
                    )),
                );
            }
            report(home, before, after, true, backup, None)
        }
    }
}
fn report(
    home: &Path,
    before: Option<String>,
    after: &str,
    changed: bool,
    backup: Option<PathBuf>,
    error: Option<String>,
) -> EnsureReport {
    EnsureReport {
        home: home.to_path_buf(),
        before,
        after: after.to_string(),
        changed,
        backup,
        error,
    }
}
fn insert_top_level_property(document: &str, empty: bool) -> String {
    let value = serde_json::to_string(ACCEPT).expect("string serialization is infallible");
    insert_object_property(document, empty, INBOUND_KEY, &value)
}

fn insert_object_property(document: &str, empty: bool, key: &str, value: &str) -> String {
    let closing = document
        .rfind('}')
        .expect("validated JSON object always has a closing brace");
    let before_closing = &document[..closing];
    let content_end = before_closing.trim_end().len();
    let multiline = before_closing.contains('\n');
    let line_break = if document.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut output = String::with_capacity(document.len() + key.len() + value.len() + 10);
    output.push_str(&document[..content_end]);
    if empty {
        if multiline {
            output.push_str(&format!("{line_break}  \"{key}\": {value}"));
        } else {
            output.push_str(&format!("\"{key}\":{value}"));
        }
    } else if multiline {
        output.push_str(&format!(",{line_break}  \"{key}\": {value}"));
    } else {
        output.push_str(&format!(",\"{key}\":{value}"));
    }
    output.push_str(&document[content_end..]);
    output
}

fn append_array_value(document: &str, empty: bool, value: &str) -> String {
    let closing = document
        .rfind(']')
        .expect("validated JSON array always has a closing bracket");
    let content_end = document[..closing].trim_end().len();
    let multiline = document[..closing].contains('\n');
    let line_break = if document.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut output = String::with_capacity(document.len() + value.len() + 4);
    output.push_str(&document[..content_end]);
    if !empty {
        output.push(',');
    }
    if multiline {
        output.push_str(line_break);
        output.push_str("  ");
    }
    output.push_str(value);
    output.push_str(&document[content_end..]);
    output
}

fn replace_range(document: &str, range: Range<usize>, replacement: &str) -> String {
    let mut output = String::with_capacity(document.len() + replacement.len());
    output.push_str(&document[..range.start]);
    output.push_str(replacement);
    output.push_str(&document[range.end..]);
    output
}

fn hook_entry_contains(entry: &Value, command: &str) -> bool {
    entry
        .get("hooks")
        .and_then(Value::as_array)
        .is_some_and(|hooks| {
            hooks
                .iter()
                .any(|hook| hook.get("command").and_then(Value::as_str) == Some(command))
        })
}

fn shell_command(path: &Path) -> String {
    let path = path.to_string_lossy();
    if path.bytes().all(|byte| {
        byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'_' | b'@' | b'%' | b'+' | b'=' | b':' | b',' | b'.' | b'/' | b'-'
            )
    }) {
        path.into_owned()
    } else {
        format!("'{}'", path.replace('\'', "'\"'\"'"))
    }
}

fn atomic_replace(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");
    let temp = path.with_file_name(format!(".{name}.pij-{}-{sequence}.tmp", std::process::id()));
    let result = (|| {
        let permissions = fs::metadata(path)
            .ok()
            .map(|metadata| metadata.permissions());
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(contents)?;
        file.sync_all()?;
        if let Some(permissions) = permissions {
            fs::set_permissions(&temp, permissions)?;
        }
        drop(file);
        fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[cfg(unix)]
fn make_executable(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(permissions.mode() | 0o700);
    fs::set_permissions(path, permissions)
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

fn render_value(value: &Value) -> String {
    value
        .as_str()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| value.to_string())
}

fn find_top_level_value(document: &str, wanted: &str) -> Option<Range<usize>> {
    let bytes = document.as_bytes();
    let mut cursor = skip_whitespace(bytes, 0);
    if bytes.get(cursor) != Some(&b'{') {
        return None;
    }
    cursor += 1;
    let mut found = None;
    loop {
        cursor = skip_whitespace(bytes, cursor);
        if bytes.get(cursor) == Some(&b'}') {
            return found;
        }
        let key_start = cursor;
        let key_end = string_end(bytes, key_start)?;
        let key: String = serde_json::from_str(&document[key_start..key_end]).ok()?;
        cursor = skip_whitespace(bytes, key_end);
        if bytes.get(cursor) != Some(&b':') {
            return None;
        }
        cursor = skip_whitespace(bytes, cursor + 1);
        let value_start = cursor;
        let mut stream =
            serde_json::Deserializer::from_str(&document[value_start..]).into_iter::<Value>();
        stream.next()?.ok()?;
        let value_end = value_start + stream.byte_offset();
        if key == wanted {
            found = Some(value_start..value_end);
        }
        cursor = skip_whitespace(bytes, value_end);
        match bytes.get(cursor) {
            Some(b',') => cursor += 1,
            Some(b'}') => return found,
            _ => return None,
        }
    }
}

fn skip_whitespace(bytes: &[u8], mut cursor: usize) -> usize {
    while bytes.get(cursor).is_some_and(u8::is_ascii_whitespace) {
        cursor += 1;
    }
    cursor
}

fn string_end(bytes: &[u8], start: usize) -> Option<usize> {
    if bytes.get(start) != Some(&b'"') {
        return None;
    }
    let mut cursor = start + 1;
    while let Some(byte) = bytes.get(cursor) {
        match byte {
            b'\\' => cursor += 2,
            b'"' => return Some(cursor + 1),
            _ => cursor += 1,
        }
    }
    None
}

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let id = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir()
                .join(format!("pij-claude-settings-{}-{id}", std::process::id()));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn absent_file_is_created_with_accept() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        let reports = ensure_claude_inbound_accept(std::slice::from_ref(&home));
        assert_eq!(reports.len(), 1);
        assert!(reports[0].changed);
        assert_eq!(reports[0].before, None);
        assert_eq!(reports[0].after, "accept");
        assert_eq!(reports[0].backup, None);
        assert_eq!(reports[0].error, None);
        let written = fs::read_to_string(home.join("settings.json")).expect("settings created");
        assert_eq!(
            serde_json::from_str::<Value>(&written).expect("valid settings")[INBOUND_KEY],
            ACCEPT
        );
    }

    #[test]
    fn absent_key_is_added_without_rewriting_other_settings() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        fs::create_dir_all(&home).expect("home");
        let original = "{\n  \"theme\": \"dark\",\n  \"nested\": { \"keep\": true }\n}\n";
        fs::write(home.join("settings.json"), original).expect("seed settings");
        let report = ensure_claude_inbound_accept(std::slice::from_ref(&home))
            .into_iter()
            .next()
            .expect("report");
        assert!(report.changed);
        assert_eq!(report.before, None);
        assert_eq!(
            fs::read_to_string(report.backup.expect("backup")).expect("backup readable"),
            original
        );
        let written = fs::read_to_string(home.join("settings.json")).expect("settings readable");
        assert!(written.contains("  \"theme\": \"dark\""));
        assert!(written.contains("  \"nested\": { \"keep\": true }"));
        assert_eq!(
            serde_json::from_str::<Value>(&written).expect("valid settings")[INBOUND_KEY],
            ACCEPT
        );
    }

    #[test]
    fn hold_is_replaced_and_original_is_backed_up() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        fs::create_dir_all(&home).expect("home");
        let original = "{\"before\":1,\"crossSessionInbound\":\"hold\",\"after\":2}";
        fs::write(home.join("settings.json"), original).expect("seed settings");
        let report = ensure_claude_inbound_accept(std::slice::from_ref(&home))
            .into_iter()
            .next()
            .expect("report");
        assert!(report.changed);
        assert_eq!(report.before.as_deref(), Some("hold"));
        assert_eq!(
            fs::read_to_string(report.backup.expect("backup")).expect("backup readable"),
            original
        );
        assert_eq!(
            fs::read_to_string(home.join("settings.json")).expect("settings readable"),
            "{\"before\":1,\"crossSessionInbound\":\"accept\",\"after\":2}"
        );
    }

    #[test]
    fn already_accept_is_a_no_op_without_backup() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        fs::create_dir_all(&home).expect("home");
        let original = "{\"crossSessionInbound\": \"accept\", \"keep\": true}";
        fs::write(home.join("settings.json"), original).expect("seed settings");
        let report = ensure_claude_inbound_accept(std::slice::from_ref(&home))
            .into_iter()
            .next()
            .expect("report");
        assert!(!report.changed);
        assert_eq!(report.before.as_deref(), Some(ACCEPT));
        assert_eq!(report.backup, None);
        assert_eq!(
            fs::read_to_string(home.join("settings.json")).expect("settings readable"),
            original
        );
    }

    #[test]
    fn malformed_json_is_untouched_and_reported() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        fs::create_dir_all(&home).expect("home");
        let original = "{not-json";
        fs::write(home.join("settings.json"), original).expect("seed settings");
        let report = ensure_claude_inbound_accept(std::slice::from_ref(&home))
            .into_iter()
            .next()
            .expect("report");
        assert!(!report.changed);
        assert!(report.error.is_some());
        assert_eq!(report.backup, None);
        assert_eq!(
            fs::read_to_string(home.join("settings.json")).expect("settings readable"),
            original
        );
    }

    #[test]
    fn empty_and_whitespace_files_are_backed_up_then_repaired() {
        let root = TestDir::new();
        for (name, original) in [("empty", ""), ("whitespace", "  \n\t")] {
            let home = root.path().join(name);
            fs::create_dir_all(&home).expect("home");
            fs::write(home.join("settings.json"), original).expect("seed settings");
            let report = ensure_claude_inbound_accept(std::slice::from_ref(&home))
                .into_iter()
                .next()
                .expect("report");
            assert!(report.changed);
            assert_eq!(
                fs::read_to_string(report.backup.expect("backup")).expect("backup readable"),
                original
            );
            let written = fs::read_to_string(home.join("settings.json")).expect("settings");
            assert_eq!(
                serde_json::from_str::<Value>(&written).expect("valid")[INBOUND_KEY],
                ACCEPT
            );
        }
    }

    #[test]
    fn insertion_preserves_crlf_line_endings() {
        let EnsurePlan::Write { contents, .. } =
            plan_inbound_accept(Some("{\r\n  \"keep\": true\r\n}\r\n"))
        else {
            panic!("missing key must change");
        };
        assert!(!contents.replace("\r\n", "").contains('\n'));
        assert_eq!(
            serde_json::from_str::<Value>(&contents).expect("valid")[INBOUND_KEY],
            ACCEPT
        );
    }

    #[test]
    fn duplicate_keys_update_the_effective_last_value() {
        let EnsurePlan::Write { contents, .. } = plan_inbound_accept(Some(
            r#"{"crossSessionInbound":"accept","crossSessionInbound":false}"#,
        )) else {
            panic!("effective false value must change");
        };
        let parsed: Value = serde_json::from_str(&contents).expect("valid settings");
        assert_eq!(parsed[INBOUND_KEY], ACCEPT);
        assert!(contents.ends_with(r#""crossSessionInbound":"accept"}"#));
    }

    #[test]
    fn pure_plan_refuses_non_object_json() {
        assert!(matches!(
            plan_inbound_accept(Some("[]")),
            EnsurePlan::Refuse { .. }
        ));
    }

    #[test]
    fn home_discovery_prefers_config_dir_and_includes_existing_alt() {
        let root = TestDir::new();
        let configured = root.path().join("custom-claude");
        let alt = root.path().join(".claude-alt");
        fs::create_dir_all(&alt).expect("alt home");
        let homes = claude_homes_from(Some(configured.clone().into()), Some(root.path().into()));
        assert_eq!(homes, vec![configured, alt]);
    }

    #[test]
    fn session_start_hook_creates_missing_settings() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        let script = Path::new("/opt/pij/claude-session-start-pij.sh");

        let report = ensure_claude_session_start_hook(std::slice::from_ref(&home), script)
            .into_iter()
            .next()
            .expect("report");

        assert!(report.changed);
        assert_eq!(report.before, None);
        assert_eq!(report.after, script.display().to_string());
        assert_eq!(report.backup, None);
        assert_eq!(report.error, None);
        let written: Value = serde_json::from_str(
            &fs::read_to_string(home.join("settings.json")).expect("settings created"),
        )
        .expect("valid settings");
        assert_eq!(
            written["hooks"]["SessionStart"][0]["hooks"][0]["command"],
            script.display().to_string()
        );
    }

    #[test]
    fn session_start_hook_shell_quotes_spaced_script_paths() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        let script = Path::new("/opt/pij hooks/session-start.sh");

        let _ = ensure_claude_session_start_hook(std::slice::from_ref(&home), script);

        let written: Value = serde_json::from_str(
            &fs::read_to_string(home.join("settings.json")).expect("settings created"),
        )
        .expect("valid settings");
        assert_eq!(
            written["hooks"]["SessionStart"][0]["hooks"][0]["command"],
            "'/opt/pij hooks/session-start.sh'"
        );
    }

    #[test]
    fn session_start_hook_preserves_existing_hooks_byte_for_byte() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        fs::create_dir_all(&home).expect("home");
        let original = concat!(
            "{\n",
            "  \"hooks\": {\n",
            "    \"Notification\": [{\"matcher\":\"before\",\"hooks\":[{\"type\":\"command\",\"command\":\"notify\"}]}],\n",
            "    \"PreToolUse\": [{\"matcher\":\"tool\",\"hooks\":[{\"type\":\"command\",\"command\":\"pre\"}]}],\n",
            "    \"PostToolUse\": [{\"matcher\":\"after\",\"hooks\":[{\"type\":\"command\",\"command\":\"post\"}]}]\n",
            "  },\n",
            "  \"theme\": \"dark\"\n",
            "}\n"
        );
        fs::write(home.join("settings.json"), original).expect("seed settings");
        let script = Path::new("/opt/pij/claude-session-start-pij.sh");

        let report = ensure_claude_session_start_hook(std::slice::from_ref(&home), script)
            .into_iter()
            .next()
            .expect("report");

        assert!(report.changed);
        assert_eq!(
            fs::read_to_string(report.backup.expect("backup")).expect("backup readable"),
            original
        );
        let written = fs::read_to_string(home.join("settings.json")).expect("settings");
        for preserved in [
            r#""Notification": [{"matcher":"before","hooks":[{"type":"command","command":"notify"}]}]"#,
            r#""PreToolUse": [{"matcher":"tool","hooks":[{"type":"command","command":"pre"}]}]"#,
            r#""PostToolUse": [{"matcher":"after","hooks":[{"type":"command","command":"post"}]}]"#,
        ] {
            assert!(
                written.contains(preserved),
                "existing hook changed: {preserved}"
            );
        }
        let parsed: Value = serde_json::from_str(&written).expect("valid settings");
        assert_eq!(parsed["theme"], "dark");
        assert_eq!(
            parsed["hooks"]["SessionStart"][0]["hooks"][0]["command"],
            script.display().to_string()
        );
    }

    #[test]
    fn existing_session_start_hook_is_a_no_op_without_backup() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        fs::create_dir_all(&home).expect("home");
        let script = Path::new("/opt/pij/claude-session-start-pij.sh");
        let original = format!(
            r#"{{"hooks":{{"SessionStart":[{{"matcher":"","hooks":[{{"type":"command","command":{}}}]}}]}}}}"#,
            serde_json::to_string(&script.display().to_string()).expect("path serialization")
        );
        fs::write(home.join("settings.json"), &original).expect("seed settings");

        let report = ensure_claude_session_start_hook(std::slice::from_ref(&home), script)
            .into_iter()
            .next()
            .expect("report");

        assert!(!report.changed);
        assert_eq!(report.before.as_deref(), script.to_str());
        assert_eq!(report.backup, None);
        assert_eq!(
            fs::read_to_string(home.join("settings.json")).expect("settings"),
            original
        );
    }

    #[test]
    fn session_start_hook_appends_without_reordering_existing_entries() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        fs::create_dir_all(&home).expect("home");
        let existing_entry =
            r#"{"matcher":"resume","hooks":[{"type":"command","command":"existing"}]}"#;
        let original = format!(r#"{{"hooks":{{"SessionStart":[{existing_entry}]}}}}"#);
        fs::write(home.join("settings.json"), &original).expect("seed settings");
        let before = inspect_claude_session_start_hook(
            std::slice::from_ref(&home),
            Path::new("/opt/pij/claude-session-start-pij.sh"),
        )
        .into_iter()
        .next()
        .expect("inspection");
        assert!(!before.installed);
        assert_eq!(before.command, None);

        let report = ensure_claude_session_start_hook(
            std::slice::from_ref(&home),
            Path::new("/opt/pij/claude-session-start-pij.sh"),
        )
        .into_iter()
        .next()
        .expect("report");

        assert!(report.changed);
        let written = fs::read_to_string(home.join("settings.json")).expect("settings");
        assert!(written.contains(&format!("[{existing_entry},")));
        let parsed: Value = serde_json::from_str(&written).expect("valid settings");
        assert_eq!(
            parsed["hooks"]["SessionStart"]
                .as_array()
                .expect("array")
                .len(),
            2
        );
        assert_eq!(
            parsed["hooks"]["SessionStart"][0]["hooks"][0]["command"],
            "existing"
        );
    }

    #[test]
    fn stale_managed_hook_is_replaced_in_place() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        fs::create_dir_all(&home).expect("home");
        let original = r#"{"hooks":{"SessionStart":[{"matcher":"","hooks":[{"type":"command","command":"/tmp/old/claude-session-start-pij.sh"}]},{"matcher":"resume","hooks":[{"type":"command","command":"existing"}]}]}}"#;
        fs::write(home.join("settings.json"), original).expect("seed settings");

        let report = ensure_claude_session_start_hook(
            std::slice::from_ref(&home),
            Path::new("/Users/test/.pij-rs/claude-session-start-pij.sh"),
        )
        .into_iter()
        .next()
        .expect("report");

        assert!(report.changed);
        assert_eq!(
            report.before.as_deref(),
            Some("/tmp/old/claude-session-start-pij.sh")
        );
        let written: Value = serde_json::from_str(
            &fs::read_to_string(home.join("settings.json")).expect("settings"),
        )
        .expect("valid settings");
        let entries = written["hooks"]["SessionStart"].as_array().expect("array");
        assert_eq!(entries.len(), 2);
        assert_eq!(
            entries[0]["hooks"][0]["command"],
            "/Users/test/.pij-rs/claude-session-start-pij.sh"
        );
        assert_eq!(entries[1]["hooks"][0]["command"], "existing");
    }

    #[test]
    fn session_start_hook_refuses_malformed_settings_without_touching_them() {
        let root = TestDir::new();
        let home = root.path().join(".claude");
        fs::create_dir_all(&home).expect("home");
        let original = "{not-json";
        fs::write(home.join("settings.json"), original).expect("seed settings");

        let report = ensure_claude_session_start_hook(
            std::slice::from_ref(&home),
            Path::new("/opt/pij/claude-session-start-pij.sh"),
        )
        .into_iter()
        .next()
        .expect("report");

        assert!(!report.changed);
        assert!(report.error.is_some());
        assert_eq!(report.backup, None);
        assert_eq!(
            fs::read_to_string(home.join("settings.json")).expect("settings"),
            original
        );
    }

    #[cfg(unix)]
    #[test]
    fn installed_script_is_executable_and_silent_without_tmux() {
        use std::os::unix::fs::PermissionsExt;

        let root = TestDir::new();
        let state_dir = root.path().join("state");
        let script = install_claude_session_start_script(&state_dir).expect("install script");
        assert_ne!(
            fs::metadata(&script)
                .expect("script metadata")
                .permissions()
                .mode()
                & 0o100,
            0,
            "owner execute bit"
        );

        let output = std::process::Command::new(&script)
            .env("PIJ_RS_STATE_DIR", &state_dir)
            .env_remove("TMUX_PANE")
            .output()
            .expect("run hook");

        assert!(output.status.success());
        assert!(output.stdout.is_empty());
        assert!(output.stderr.is_empty());
        assert_eq!(
            fs::read_to_string(state_dir.join("hook.log")).expect("hook log"),
            "skip:no-tmux\n"
        );
        assert_eq!(
            install_claude_session_start_script(&state_dir).expect("idempotent install"),
            script
        );
    }

    #[cfg(unix)]
    #[test]
    fn successful_script_adopt_emits_only_session_start_json() {
        use std::os::unix::fs::PermissionsExt;

        let root = TestDir::new();
        let state_dir = root.path().join("state");
        let bin_dir = root.path().join("bin");
        fs::create_dir_all(&bin_dir).expect("bin directory");
        let path = bin_dir.join("pij-rs");
        fs::write(
            &path,
            "#!/bin/sh\ncase \"$1\" in ping|adopt) exit 0 ;; *) exit 2 ;; esac\n",
        )
        .expect("fake binary");
        let mut permissions = fs::metadata(&path).expect("metadata").permissions();
        permissions.set_mode(0o700);
        fs::set_permissions(&path, permissions).expect("executable fake");
        let script = install_claude_session_start_script(&state_dir).expect("install script");

        let output = std::process::Command::new(&script)
            .env("PATH", format!("{}:/usr/bin:/bin", bin_dir.display()))
            .env("PIJ_RS_STATE_DIR", &state_dir)
            .env("TMUX_PANE", "%42")
            .output()
            .expect("run hook");

        assert!(output.status.success());
        assert_eq!(
            String::from_utf8(output.stdout).expect("utf-8 stdout"),
            concat!(
                r#"{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"pij automatically adopted this Claude session."}}"#,
                "\n"
            )
        );
        assert!(output.stderr.is_empty());
        assert!(!state_dir.join("hook.log").exists());
    }

    #[cfg(unix)]
    #[test]
    fn refused_script_adopt_logs_one_line_and_stays_silent() {
        use std::os::unix::fs::PermissionsExt;

        let root = TestDir::new();
        let state_dir = root.path().join("state");
        let bin_dir = root.path().join("bin");
        fs::create_dir_all(&bin_dir).expect("bin directory");
        let path = bin_dir.join("pij-rs");
        fs::write(
            &path,
            "#!/bin/sh\nif [ \"$1\" = ping ]; then exit 0; fi\nprintf 'permission denied\\nsecond line\\n' >&2\nexit 2\n",
        )
        .expect("fake binary");
        let mut permissions = fs::metadata(&path).expect("metadata").permissions();
        permissions.set_mode(0o700);
        fs::set_permissions(&path, permissions).expect("executable fake");
        let script = install_claude_session_start_script(&state_dir).expect("install script");

        let output = std::process::Command::new(&script)
            .env("PATH", format!("{}:/usr/bin:/bin", bin_dir.display()))
            .env("PIJ_RS_STATE_DIR", &state_dir)
            .env("TMUX_PANE", "%42")
            .output()
            .expect("run hook");

        assert!(output.status.success());
        assert!(output.stdout.is_empty());
        assert!(output.stderr.is_empty());
        assert_eq!(
            fs::read_to_string(state_dir.join("hook.log")).expect("hook log"),
            "refused:adopt pane=%42 reason=permission denied second line\n"
        );
    }
}
