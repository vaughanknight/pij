#!/usr/bin/env python3
"""Rank TypeScript pij command leaves by observed machine usage.

All telemetry inputs are opened read-only. Counts stay separated by source because
these stores overlap and have different retention/scoping contracts.
"""

from __future__ import annotations

import argparse
import collections
import dataclasses
import datetime as dt
import glob
import json
import os
from pathlib import Path
import re
import shlex
import sqlite3
import sys
from typing import Iterable, Iterator

UTC = dt.timezone.utc
SOURCE_ORDER = ("ledger", "bash", "metrics", "omp")
SOURCE_SHORT = {"ledger": "L", "bash": "B", "metrics": "M", "omp": "O"}
HEADLINE_LIMIT = 15

# Source-derived snapshot. TS references:
#   .pi/extensions/pij/core/cli.ts (FAMILY_SUBCOMMANDS, ALLOWED_FLAGS)
#   .pi/extensions/pij/cli.ts (USAGE and bin-intercepted verbs)
# Cross-check: scratch/pij-rs-verb-parity.md in the canonical checkout.
TS_SIMPLE = {
    "spawn",
    "adopt",
    "close",
    "revive",
    "attest",
    "compact-self",
    "send",
    "tail",
    "list",
    "sessions",
    "whoami",
    "state",
    "tree",
    "link",
    "path",
    "phonehome",
    "models",
    "watch",
    "unwatch",
    "bg-deliver",
    "dispatch",
    "ack",
    "canary",
    "anomalies",
}
TS_FAMILIES: dict[str, tuple[str, ...]] = {
    "identity": ("release",),
    "focus": ("save", "list", "launch"),
    "inbox": ("check", "register"),
    "watchdog": (
        "status",
        "pause",
        "resume",
        "exempt",
        "reset",
        "interval",
        "watch",
        "unwatch",
        "list",
        "disable-all",
        "enable-all",
    ),
    "daemon": ("start", "status", "stop", "kill"),
    "telegram": ("init", "start", "stop"),
    "bg": ("create", "list", "tail", "kill"),
    "chore": ("add", "update", "run", "list", "ack", "remove"),
    "agent": ("list", "run", "show", "new", "check", "eject", "spawn", "report"),
    "orchestration": (
        "baton define",
        "baton list",
        "baton show",
        "baton request",
        "baton grant",
        "baton return",
        "baton reclaim",
        "prime set",
        "prime unset",
        "role set",
        "role unset",
    ),
    "project": ("create", "list", "show", "set"),
    "stream": ("create", "close"),
    "fence": ("set", "show"),
    "spine": ("append", "events", "render"),
    "task": ("set", "close"),
    "report": ("now", "question", "blocked", "state", "clear", "verify"),
    "node": ("show",),
}
TS_LEAVES = frozenset(
    TS_SIMPLE
    | {
        f"{family} {suffix}"
        for family, suffixes in TS_FAMILIES.items()
        for suffix in suffixes
    }
)
if len(TS_LEAVES) != 97:
    raise RuntimeError(f"TS inventory drift in scanner: expected 97 leaves, got {len(TS_LEAVES)}")

# Current semantic correspondences where the Rust spelling is not the full TS
# leaf spelling. Deliberately excludes reduced/false equivalents such as
# register→adopt and sidecar telegram→telegram lifecycle.
RS_TS_EQUIVALENTS = {
    "inbox check": "inbox",
    "bg create": "sidecar bg-start",
    "bg kill": "sidecar bg-cancel",
    "chore add": "sidecar chore-add",
    "chore run": "sidecar chore-run",
    "chore ack": "sidecar chore-ack",
}
FALSE_FRIENDS = {"tail": "same spelling, different object (daemon events vs peer transcript)"}

COMMAND_SEPARATORS = {";", "&&", "||", "|", "&", "(", ")"}
HELP_TOKENS = {"--help", "-h", "help"}
PIJ_TOOL_RE = re.compile(r"^pij[_-](.+)$")
HEREDOC_RE = re.compile(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_-]*)['\"]?")
CAMEL_BOUNDARY_RE = re.compile(r"(?<!^)(?=[A-Z])")
ASSIGNMENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
DURATION_RE = re.compile(r"^\d+(?:\.\d+)?(?:ms|s|m|h|d)?$")


@dataclasses.dataclass(frozen=True)
class Invocation:
    timestamp: dt.datetime
    seat: str
    cwd: str | None
    leaf: str
    binary: str


@dataclasses.dataclass
class SourceStats:
    name: str
    available: bool = False
    gap: str | None = None
    files: int = 0
    rows: int = 0
    malformed: int = 0
    help_filtered: int = 0
    unresolved: collections.Counter[str] = dataclasses.field(default_factory=collections.Counter)
    counts: collections.Counter[str] = dataclasses.field(default_factory=collections.Counter)
    counts_30d: collections.Counter[str] = dataclasses.field(default_factory=collections.Counter)
    seats: dict[str, set[str]] = dataclasses.field(
        default_factory=lambda: collections.defaultdict(set)
    )
    fleet_counts: collections.Counter[str] = dataclasses.field(default_factory=collections.Counter)
    fleet_counts_30d: collections.Counter[str] = dataclasses.field(default_factory=collections.Counter)
    fleet_seats: dict[str, set[str]] = dataclasses.field(
        default_factory=lambda: collections.defaultdict(set)
    )
    rs_counts: collections.Counter[str] = dataclasses.field(default_factory=collections.Counter)
    rs_counts_30d: collections.Counter[str] = dataclasses.field(default_factory=collections.Counter)
    unknown_scope: int = 0
    first_at: dt.datetime | None = None
    last_at: dt.datetime | None = None

    def record(self, invocation: Invocation, cutoff: dt.datetime, fleet_prefix: str) -> None:
        self.first_at = min(filter(None, (self.first_at, invocation.timestamp)), default=None)
        self.last_at = max(filter(None, (self.last_at, invocation.timestamp)), default=None)
        is_recent = invocation.timestamp >= cutoff
        if invocation.binary == "pij-rs":
            self.rs_counts[invocation.leaf] += 1
            if is_recent:
                self.rs_counts_30d[invocation.leaf] += 1
            return
        if invocation.leaf not in TS_LEAVES:
            self.unresolved[invocation.leaf] += 1
            return
        self.counts[invocation.leaf] += 1
        self.seats[invocation.leaf].add(invocation.seat)
        if is_recent:
            self.counts_30d[invocation.leaf] += 1
        if invocation.cwd is None:
            self.unknown_scope += 1
            return
        if invocation.cwd.startswith(fleet_prefix):
            self.fleet_counts[invocation.leaf] += 1
            self.fleet_seats[invocation.leaf].add(invocation.seat)
            if is_recent:
                self.fleet_counts_30d[invocation.leaf] += 1


@dataclasses.dataclass
class SeatIndex:
    folder_by_seat: dict[str, str]
    seat_by_session: dict[str, str]

    def seat_for_session(self, session_id: str | None) -> str:
        if session_id and session_id in self.seat_by_session:
            return self.seat_by_session[session_id]
        return session_id or "unknown-session"

    def folder_for_session(self, session_id: str | None) -> str | None:
        return self.folder_by_seat.get(self.seat_for_session(session_id))


def parse_timestamp(value: object, fallback_epoch: object = None) -> dt.datetime:
    if isinstance(value, str) and value:
        try:
            return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
        except ValueError:
            pass
    if isinstance(fallback_epoch, (int, float)):
        return dt.datetime.fromtimestamp(fallback_epoch, UTC)
    return dt.datetime.fromtimestamp(0, UTC)


def read_json_object(path: Path) -> dict[str, object] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def build_seat_index(pij_home: Path) -> SeatIndex:
    folder_by_seat: dict[str, str] = {}
    seat_by_session: dict[str, str] = {}
    patterns = ("*.json", "archive/*.json", "archived/*.json")
    for pattern in patterns:
        for path in pij_home.glob(pattern):
            row = read_json_object(path)
            if not row:
                continue
            seat = row.get("id")
            if not isinstance(seat, str) or not seat.startswith("pij-"):
                continue
            folder = row.get("folder")
            if isinstance(folder, str):
                folder_by_seat[seat] = folder
            session = row.get("harnessSessionId")
            if isinstance(session, str) and session:
                seat_by_session[session] = seat
    return SeatIndex(folder_by_seat, seat_by_session)


def strip_heredocs(command: str) -> str:
    kept: list[str] = []
    delimiter: str | None = None
    for line in command.splitlines():
        if delimiter is not None:
            if line.strip() == delimiter:
                delimiter = None
            continue
        kept.append(line)
        match = HEREDOC_RE.search(line)
        if match:
            delimiter = match.group(1)
    return "\n".join(kept)


def mark_command_newlines(command: str) -> str:
    """Turn unquoted newlines into shell boundaries before shlex tokenization."""
    result: list[str] = []
    quote: str | None = None
    escaped = False
    for character in command:
        if escaped:
            result.append(character)
            escaped = False
            continue
        if character == "\\" and quote != "'":
            result.append(character)
            escaped = True
            continue
        if character in {"'", '"'}:
            if quote is None:
                quote = character
            elif quote == character:
                quote = None
            result.append(character)
            continue
        if character == "\n" and quote is None:
            result.append(" ; ")
        else:
            result.append(character)
    return "".join(result)



def shell_tokens(command: str) -> list[str]:
    lexer = shlex.shlex(mark_command_newlines(strip_heredocs(command)), posix=True, punctuation_chars=";&|()<>")
    lexer.whitespace_split = True
    lexer.commenters = ""
    try:
        return list(lexer)
    except ValueError:
        return []


def is_command_separator(token: str) -> bool:
    return token in COMMAND_SEPARATORS or (
        bool(token)
        and set(token) <= set(";&|()")
        and "<" not in token
        and ">" not in token
    )


def shell_command_chunks(tokens: list[str]) -> Iterator[list[str]]:
    chunk: list[str] = []
    for token in tokens:
        if is_command_separator(token):
            if chunk:
                yield chunk
                chunk = []
        else:
            chunk.append(token)
    if chunk:
        yield chunk


def executable_index(chunk: list[str]) -> int | None:
    index = 0
    while index < len(chunk) and ASSIGNMENT_RE.match(chunk[index]):
        index += 1
    while index < len(chunk):
        executable = chunk[index].rsplit("/", 1)[-1]
        if executable == "env":
            index += 1
            while index < len(chunk) and (chunk[index].startswith("-") or ASSIGNMENT_RE.match(chunk[index])):
                index += 1
            continue
        if executable == "timeout":
            index += 1
            while index < len(chunk) and not DURATION_RE.match(chunk[index]):
                index += 1
            index += 1
            continue
        if executable in {"command", "exec", "nohup", "sudo", "time", "!"}:
            index += 1
            while index < len(chunk) and chunk[index].startswith("-"):
                index += 1
            continue
        return index
    return None


def command_segments(command: str) -> Iterator[tuple[str, list[str]]]:
    for chunk in shell_command_chunks(shell_tokens(command)):
        index = executable_index(chunk)
        if index is None:
            continue
        binary = chunk[index].rsplit("/", 1)[-1]
        if binary not in {"pij", "pij-rs"}:
            continue
        segment: list[str] = []
        remaining = chunk[index + 1 :]
        for offset, following in enumerate(remaining):
            if following.startswith(("<", ">")):
                break
            next_token = remaining[offset + 1] if offset + 1 < len(remaining) else None
            if following.isdigit() and next_token is not None and next_token.startswith(("<", ">")):
                break
            segment.append(following)
        yield binary, segment


def first_positionals(args: Iterable[str]) -> list[str]:
    result: list[str] = []
    for token in args:
        if token.startswith("-"):
            break
        result.append(token)
    return result


def normalize_pij(args: list[str]) -> str:
    if not args:
        return "<missing>"
    top = args[0]
    if top == "agents":
        return "agent list"
    if top == "spawn" and any(token == "--agent" or token.startswith("--agent=") for token in args[1:]):
        return "agent spawn"
    if top == "adopt" and args[1:2] == ["--current"]:
        return "inbox register"
    if top in TS_SIMPLE:
        return top
    family = TS_FAMILIES.get(top)
    if family is None:
        return top
    positionals = first_positionals(args[1:])
    if top == "inbox" and not positionals:
        return "inbox check"
    if top == "bg" and not positionals:
        return "bg create"
    for suffix in sorted(family, key=lambda item: len(item.split()), reverse=True):
        words = suffix.split()
        if positionals[: len(words)] == words:
            return f"{top} {suffix}"
    return f"{top} <missing-or-unknown>"


def normalize_rs(args: list[str]) -> str:
    if not args:
        return "<missing>"
    index = 0
    while index < len(args) and args[index].startswith("-"):
        flag = args[index].split("=", 1)[0]
        index += 1
        if "=" not in args[index - 1] and flag in {"--addr", "--state-dir"}:
            index += 1
    if index >= len(args):
        return "<missing>"
    top = args[index]
    positionals = first_positionals(args[index + 1 :])
    if top in {"daemon", "sidecar"} and positionals:
        return f"{top} {positionals[0]}"
    return top


def invocations_from_shell(
    command: str,
    timestamp: dt.datetime,
    seat: str,
    cwd: str | None,
    stats: SourceStats,
) -> Iterator[Invocation]:
    for binary, args in command_segments(command):
        if HELP_TOKENS.intersection(args):
            stats.help_filtered += 1
            continue
        leaf = normalize_pij(args) if binary == "pij" else normalize_rs(args)
        yield Invocation(timestamp, seat, cwd, leaf, binary)


def decode_args(value: object) -> dict[str, object]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return decoded if isinstance(decoded, dict) else {}
    return {}


def direct_pij_tool(tool_name: object, args: dict[str, object]) -> tuple[str, list[str]] | None:
    if not isinstance(tool_name, str):
        return None
    path = args.get("path")
    if tool_name == "write" and isinstance(path, str) and path.startswith("xd://pij_"):
        tool_name = path.removeprefix("xd://")
    match = PIJ_TOOL_RE.match(tool_name)
    if not match:
        return None
    top = match.group(1).replace("_", "-")
    return "pij", [top]


def invocations_from_tool(
    tool_name: object,
    raw_args: object,
    timestamp: dt.datetime,
    seat: str,
    cwd: str | None,
    stats: SourceStats,
) -> Iterator[Invocation]:
    args = decode_args(raw_args)
    direct = direct_pij_tool(tool_name, args)
    if direct:
        binary, tokens = direct
        yield Invocation(timestamp, seat, cwd, normalize_pij(tokens), binary)
    command = args.get("command") or args.get("cmd")
    if isinstance(command, str):
        yield from invocations_from_shell(command, timestamp, seat, cwd, stats)


def readonly_connection(path: Path) -> sqlite3.Connection:
    uri = f"{path.resolve().as_uri()}?mode=ro"
    connection = sqlite3.connect(uri, uri=True)
    connection.execute("PRAGMA query_only = ON")
    return connection


def scan_ledger(
    pij_home: Path, index: SeatIndex, cutoff: dt.datetime, fleet_prefix: str
) -> SourceStats:
    stats = SourceStats("ledger")
    if not pij_home.is_dir():
        stats.gap = f"missing directory: {pij_home}"
        return stats
    files = sorted(pij_home.glob("*/events.ndjson"))
    if not files:
        stats.gap = f"no */events.ndjson files under {pij_home}"
        return stats
    stats.available = True
    stats.files = len(files)
    for path in files:
        seat = path.parent.name
        cwd = index.folder_by_seat.get(seat)
        seen_calls: set[str] = set()
        try:
            handle = path.open(encoding="utf-8", errors="replace")
        except OSError:
            stats.malformed += 1
            continue
        with handle:
            for line in handle:
                stats.rows += 1
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    stats.malformed += 1
                    continue
                if event.get("type") != "tool_call":
                    continue
                data = event.get("data")
                if not isinstance(data, dict):
                    continue
                call_id = data.get("toolCallId")
                if isinstance(call_id, str):
                    if call_id in seen_calls:
                        continue
                    seen_calls.add(call_id)
                timestamp = parse_timestamp(event.get("timestamp"))
                for invocation in invocations_from_tool(
                    data.get("toolName"), data.get("input"), timestamp, seat, cwd, stats
                ):
                    stats.record(invocation, cutoff, fleet_prefix)
    return stats


def scan_bash_db(
    path: Path, index: SeatIndex, cutoff: dt.datetime, fleet_prefix: str
) -> SourceStats:
    stats = SourceStats("bash")
    if not path.is_file():
        stats.gap = f"missing database: {path}"
        return stats
    try:
        db = readonly_connection(path)
        rows = db.execute(
            """
            SELECT original_cwd, repo_work_dir, session_id, start_time_ns, command
            FROM bash_checkpoint_calls
            WHERE command LIKE '%pij %' OR command LIKE '%pij-rs %'
            ORDER BY start_time_ns, id
            """
        )
        stats.available = True
        stats.files = 1
        for original_cwd, repo_work_dir, session_id, start_ns, command in rows:
            stats.rows += 1
            if not isinstance(command, str):
                continue
            timestamp = parse_timestamp(None, start_ns / 1_000_000_000)
            seat = index.seat_for_session(session_id)
            cwd = repo_work_dir or original_cwd or index.folder_for_session(session_id)
            for invocation in invocations_from_shell(command, timestamp, seat, cwd, stats):
                stats.record(invocation, cutoff, fleet_prefix)
        db.close()
    except (OSError, sqlite3.Error) as error:
        stats.available = False
        stats.gap = f"read failed: {error}"
    return stats


def metrics_tools(record: dict[str, object]) -> Iterator[tuple[object, object, str | None]]:
    record_type = record.get("type")
    if record_type == "assistant":
        message = record.get("message")
        if not isinstance(message, dict):
            return
        content = message.get("content")
        if not isinstance(content, list):
            return
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                yield block.get("name"), block.get("input"), block.get("id") if isinstance(block.get("id"), str) else None
        return
    event_name = record.get("type") or record.get("name")
    if event_name != "tool.execution_start":
        return
    data = record.get("data")
    if not isinstance(data, dict):
        return
    call_id = data.get("toolCallId") or data.get("callId")
    yield data.get("toolName") or data.get("name"), data.get("arguments"), call_id if isinstance(call_id, str) else None


def scan_metrics_db(
    path: Path, index: SeatIndex, cutoff: dt.datetime, fleet_prefix: str
) -> SourceStats:
    stats = SourceStats("metrics")
    if not path.is_file():
        stats.gap = f"missing database: {path}"
        return stats
    seen_calls: set[tuple[str, str]] = set()
    try:
        db = readonly_connection(path)
        # event_ts + event_kind uses the partial metrics_event_ts_kind index. LIKE
        # narrows transfer after SQLite's read-only scan; JSON is parsed in Python.
        rows = db.execute(
            """
            SELECT id, event_ts, external_session_id, event_json
            FROM metrics INDEXED BY metrics_event_ts_kind
            WHERE event_ts IS NOT NULL AND event_kind = 5 AND event_ts >= 0
              AND event_json LIKE '%pij%'
            ORDER BY event_ts, id
            """
        )
        stats.available = True
        stats.files = 1
        for _row_id, event_ts, session_id, event_json in rows:
            stats.rows += 1
            try:
                envelope = json.loads(event_json)
                record = envelope["v"]["0"]
            except (json.JSONDecodeError, KeyError, TypeError):
                stats.malformed += 1
                continue
            if not isinstance(record, dict):
                continue
            timestamp = parse_timestamp(record.get("timestamp"), event_ts)
            session = session_id if isinstance(session_id, str) else None
            seat = index.seat_for_session(session)
            cwd_value = record.get("cwd")
            data = record.get("data")
            if not isinstance(cwd_value, str) and isinstance(data, dict):
                cwd_value = data.get("cwd")
            cwd = cwd_value if isinstance(cwd_value, str) else index.folder_for_session(session)
            for tool_name, raw_args, call_id in metrics_tools(record):
                if call_id:
                    dedupe_key = (session or "unknown", call_id)
                    if dedupe_key in seen_calls:
                        continue
                    seen_calls.add(dedupe_key)
                for invocation in invocations_from_tool(
                    tool_name, raw_args, timestamp, seat, cwd, stats
                ):
                    stats.record(invocation, cutoff, fleet_prefix)
        db.close()
    except (OSError, sqlite3.Error) as error:
        stats.available = False
        stats.gap = f"read failed: {error}"
    return stats


def scan_omp(
    sessions_root: Path, index: SeatIndex, cutoff: dt.datetime, fleet_prefix: str
) -> SourceStats:
    stats = SourceStats("omp")
    if not sessions_root.is_dir():
        stats.gap = f"missing directory: {sessions_root}"
        return stats
    files = sorted(Path(path) for path in glob.iglob(str(sessions_root / "**/*.jsonl"), recursive=True))
    if not files:
        stats.gap = f"no JSONL transcripts under {sessions_root}"
        return stats
    stats.available = True
    stats.files = len(files)
    for path in files:
        session_id: str | None = None
        cwd: str | None = None
        title: str | None = None
        seen_calls: set[str] = set()
        try:
            handle = path.open(encoding="utf-8", errors="replace")
        except OSError:
            stats.malformed += 1
            continue
        with handle:
            for line in handle:
                stats.rows += 1
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    stats.malformed += 1
                    continue
                record_type = record.get("type")
                if record_type == "session":
                    session_id = record.get("id") if isinstance(record.get("id"), str) else session_id
                    cwd = record.get("cwd") if isinstance(record.get("cwd"), str) else cwd
                    title = record.get("title") if isinstance(record.get("title"), str) else title
                    continue
                if record_type == "title":
                    title = record.get("title") if isinstance(record.get("title"), str) else title
                    continue
                if record_type != "message":
                    continue
                message = record.get("message")
                if not isinstance(message, dict) or message.get("role") != "assistant":
                    continue
                content = message.get("content")
                if not isinstance(content, list):
                    continue
                timestamp = parse_timestamp(record.get("timestamp"))
                seat = index.seat_for_session(session_id)
                if seat == (session_id or "unknown-session") and title and title.startswith("pij-"):
                    seat = title
                for block in content:
                    if not isinstance(block, dict) or block.get("type") != "toolCall":
                        continue
                    call_id = block.get("id")
                    if isinstance(call_id, str):
                        if call_id in seen_calls:
                            continue
                        seen_calls.add(call_id)
                    for invocation in invocations_from_tool(
                        block.get("name"), block.get("arguments"), timestamp, seat, cwd, stats
                    ):
                        stats.record(invocation, cutoff, fleet_prefix)
    return stats


def rust_variants(source: str, enum_name: str) -> set[str]:
    marker = f"enum {enum_name} {{"
    start = source.find(marker)
    if start < 0:
        return set()
    body_start = source.find("{", start) + 1
    depth = 1
    end = body_start
    while end < len(source) and depth:
        if source[end] == "{":
            depth += 1
        elif source[end] == "}":
            depth -= 1
        end += 1
    body = source[body_start : end - 1]
    variants: set[str] = set()
    for line in body.splitlines():
        match = re.match(r"^    ([A-Z][A-Za-z0-9]*)(?:\s*\{|,)$", line)
        if match:
            variants.add(CAMEL_BOUNDARY_RE.sub("-", match.group(1)).lower())
    return variants


def derive_rs_inventory(repo_root: Path) -> tuple[set[str], set[str], list[str]]:
    path = repo_root / "crates/cli/src/main.rs"
    warnings: list[str] = []
    try:
        source = path.read_text(encoding="utf-8")
    except OSError as error:
        return set(), set(), [f"could not read {path}: {error}"]
    top = rust_variants(source, "Command")
    daemon = {f"daemon {name}" for name in rust_variants(source, "DaemonAction")}
    sidecar = {f"sidecar {name}" for name in rust_variants(source, "SidecarAction")}
    paths = top | daemon | sidecar
    rs_ts = set(TS_LEAVES.intersection(top))
    for ts_leaf, rs_leaf in RS_TS_EQUIVALENTS.items():
        if rs_leaf in paths:
            rs_ts.add(ts_leaf)
    if "tail" in rs_ts:
        rs_ts.remove("tail")
        warnings.append(f"tail: {FALSE_FRIENDS['tail']}; classified not implemented")
    return paths, rs_ts, warnings


def count_for(stats: SourceStats, leaf: str, scope: str, recent: bool) -> int:
    if scope == "fleet":
        counter = stats.fleet_counts_30d if recent else stats.fleet_counts
    else:
        counter = stats.counts_30d if recent else stats.counts
    return counter[leaf]


def seats_for(stats: SourceStats, leaf: str, scope: str) -> int:
    mapping = stats.fleet_seats if scope == "fleet" else stats.seats
    return len(mapping[leaf])


def format_counts(stats_by_source: dict[str, SourceStats], leaf: str, scope: str, recent: bool) -> str:
    parts: list[str] = []
    for source in SOURCE_ORDER:
        stats = stats_by_source[source]
        label = SOURCE_SHORT[source]
        if not stats.available:
            parts.append(f"{label} gap")
            continue
        value = count_for(stats, leaf, scope, recent)
        suffix = "*" if source == "bash" and not recent else ""
        parts.append(f"{label} {value}{suffix}")
    return " · ".join(parts)


def format_seats(stats_by_source: dict[str, SourceStats], leaf: str, scope: str) -> str:
    parts: list[str] = []
    for source in SOURCE_ORDER:
        stats = stats_by_source[source]
        label = SOURCE_SHORT[source]
        parts.append(f"{label} {'gap' if not stats.available else seats_for(stats, leaf, scope)}")
    return " · ".join(parts)


def ranking_key(stats_by_source: dict[str, SourceStats], leaf: str, scope: str) -> tuple[object, ...]:
    # Source priority from the commissioned method: ledger, metrics deep history,
    # OMP native transcripts, then the 30-day bash cross-check.
    priority = ("ledger", "metrics", "omp", "bash")
    return tuple(-count_for(stats_by_source[source], leaf, scope, False) for source in priority) + (leaf,)


def observed_leaves(stats_by_source: dict[str, SourceStats], scope: str) -> set[str]:
    result: set[str] = set()
    for stats in stats_by_source.values():
        counter = stats.fleet_counts if scope == "fleet" else stats.counts
        result.update(leaf for leaf, count in counter.items() if count)
    return result


def table_for(
    stats_by_source: dict[str, SourceStats],
    rs_ts: set[str],
    scope: str,
    missing_only: bool,
    limit: int | None,
) -> tuple[list[str], list[str]]:
    leaves = observed_leaves(stats_by_source, scope)
    if missing_only:
        leaves -= rs_ts
    ranked = sorted(leaves, key=lambda leaf: ranking_key(stats_by_source, leaf, scope))
    omitted = ranked[limit:] if limit is not None else []
    shown = ranked[:limit] if limit is not None else ranked
    lines = [
        "| verb/leaf | total uses | uses last 30d | distinct seats | in rs today? | rank |",
        "|---|---:|---:|---:|:---:|---:|",
    ]
    for rank, leaf in enumerate(shown, 1):
        lines.append(
            f"| `{leaf}` | {format_counts(stats_by_source, leaf, scope, False)} | "
            f"{format_counts(stats_by_source, leaf, scope, True)} | "
            f"{format_seats(stats_by_source, leaf, scope)} | "
            f"{'yes' if leaf in rs_ts else 'no'} | {rank} |"
        )
    if not shown:
        lines.append("| _No observed matching invocations_ | — | — | — | — | — |")
    return lines, omitted


def source_summary(stats: SourceStats) -> str:
    if not stats.available:
        return f"**GAP** — {stats.gap}"
    window = "no parsed invocations"
    if stats.first_at and stats.last_at:
        window = f"{stats.first_at.date().isoformat()}..{stats.last_at.date().isoformat()}"
    details = f"{stats.files} file(s), {stats.rows:,} candidate row(s), parsed window {window}"
    if stats.malformed:
        details += f", {stats.malformed:,} malformed/unreadable row(s) skipped"
    if stats.help_filtered:
        details += f", {stats.help_filtered:,} explicit help invocation(s) filtered"
    if stats.unknown_scope:
        details += f", {stats.unknown_scope:,} parsed TS invocation(s) lacked cwd mapping"
    return details


def generate_report(
    stats_by_source: dict[str, SourceStats],
    rs_paths: set[str],
    rs_ts: set[str],
    inventory_warnings: list[str],
    now: dt.datetime,
    fleet_prefix: str,
) -> str:
    machine_table, machine_omitted = table_for(
        stats_by_source, rs_ts, "machine", True, HEADLINE_LIMIT
    )
    fleet_table, fleet_omitted = table_for(
        stats_by_source, rs_ts, "fleet", True, HEADLINE_LIMIT
    )
    full_table, _ = table_for(stats_by_source, rs_ts, "machine", False, None)
    missing_zero = sorted((TS_LEAVES - rs_ts) - observed_leaves(stats_by_source, "machine"))
    unresolved_leaves = {
        leaf for stats in stats_by_source.values() for leaf in stats.unresolved
    }

    rs_observed = sorted(
        {
            leaf
            for stats in stats_by_source.values()
            for leaf in stats.rs_counts
            if leaf in rs_paths
        },
        key=lambda leaf: (
            -stats_by_source["metrics"].rs_counts[leaf],
            -stats_by_source["ledger"].rs_counts[leaf],
            leaf,
        ),
    )
    rs_lines = ["| pij-rs command | L | B (30d store) | M | O |", "|---|---:|---:|---:|---:|"]
    for leaf in rs_observed:
        rs_lines.append(
            f"| `{leaf}` | {stats_by_source['ledger'].rs_counts[leaf]} | "
            f"{stats_by_source['bash'].rs_counts[leaf]} | {stats_by_source['metrics'].rs_counts[leaf]} | "
            f"{stats_by_source['omp'].rs_counts[leaf]} |"
        )
    if not rs_observed:
        rs_lines.append("| _None observed_ | 0 | 0 | 0 | 0 |")

    lines = [
        "# pij verb usage ranking",
        "",
        f"Generated by `python3 tools/verb-usage/scan.py` at {now.isoformat(timespec='seconds')}. ",
        "Counts are invocations, not successes. Stores overlap, so values are **never summed or averaged**.",
        "",
        "**Legend:** L = `~/.pij/*/events.ndjson`; B = bash checkpoints (30-day retention); "
        "M = metrics-db; O = OMP native transcripts. `B *` in a total cell is still only the retained 30-day window.",
        "",
        "## Implement next — machine-wide, missing from pij-rs",
        "",
        "Rank is lexicographic by commissioned source priority: L lifetime, then M lifetime, O lifetime, B retained window. "
        "This preserves disagreement instead of manufacturing one blended score.",
        "",
        *machine_table,
    ]
    if machine_omitted:
        lines.extend(["", f"Next observed rows: {', '.join(f'`{leaf}`' for leaf in machine_omitted)}."])
    lines.extend(
        [
            "",
            "## pij fleet view — missing from pij-rs",
            "",
            f"Cwd prefix: `{fleet_prefix}`. Ledger rows without a surviving seat descriptor cannot enter this filtered view.",
            "",
            *fleet_table,
        ]
    )
    if fleet_omitted:
        lines.extend(["", f"Next observed rows: {', '.join(f'`{leaf}`' for leaf in fleet_omitted)}."])

    lines.extend(["", "## Full observed TypeScript comparison", "", *full_table])
    lines.extend(
        [
            "",
            "## pij-rs invocations observed separately",
            "",
            "These calls show traffic already absorbed by the Rust binary; they are not added to TS counts.",
            "",
            *rs_lines,
            "",
            "## Method and receipts",
            "",
            f"- TypeScript inventory: {len(TS_LEAVES)} source-derived leaves from "
            "`.pi/extensions/pij/core/cli.ts` and `.pi/extensions/pij/cli.ts`.",
            f"- Current Rust inventory: {len(rs_paths)} paths parsed from `crates/cli/src/main.rs`: "
            f"{', '.join(f'`{leaf}`' for leaf in sorted(rs_paths))}.",
            f"- Implemented TS overlap used by the comparison: {', '.join(f'`{leaf}`' for leaf in sorted(rs_ts)) or 'none'}.",
            "- Shell parsing uses stdlib `shlex`, strips heredoc bodies, recognizes compound commands/wrappers, and filters explicit `help`/`--help`/`-h` segments.",
            "- Claude metrics calls dedupe on `(external_session_id, tool-call id)` first occurrence. Copilot accepts both the current `type=tool.execution_start` and older `name` dialect.",
            "- OMP `write` calls whose path starts `xd://pij_` are remapped to the real pij verb; direct `pij_*` tools are handled in OMP and the pij ledger.",
            "- Every SQLite connection uses a URI ending `?mode=ro` plus `PRAGMA query_only=ON`.",
            "- Prior art cribbed: Flowspace3 `scratch/reconstruct/scripts/reconvo.py` store shapes/dedupe/remap and `tool-costs.py` tool-call extraction. The scanner removes their hardcoded seat maps and keeps source counts separate.",
            "",
            "### Store coverage",
            "",
        ]
    )
    for source in SOURCE_ORDER:
        lines.append(f"- **{SOURCE_SHORT[source]} / {source}:** {source_summary(stats_by_source[source])}")
    if inventory_warnings:
        lines.extend(["", "### Inventory warnings", ""])
        lines.extend(f"- {warning}" for warning in inventory_warnings)
    lines.extend(
        [
            "",
            "## Caveats",
            "",
            "- A call can appear in multiple stores. Compare store columns; do not add them.",
            "- Counts are call attempts. Except explicit help syntax, success/failure is not consistently available beside every call and therefore is not used as a filter.",
            "- B has rolling 30-day retention. M and O cover retained native history; L covers only seats whose event ledger still exists.",
            "- Distinct-seat values use pij descriptor joins when present and native session IDs otherwise; missing/archived descriptors can overstate people/seats and leave L cwd unknown.",
            "- Fleet filtering is a string-prefix test over observed cwd. Unknown cwd is excluded, never treated as non-pij evidence.",
            "- Shell aliases, commands assembled entirely through variable expansion, and pij strings executed inside opaque scripts are not recoverable from these records.",
            "- The source-derived TS inventory is intentionally explicit. Refresh it when the TS CLI surface changes; the Rust inventory is parsed from the current worktree on every run.",
        ]
    )
    if missing_zero:
        lines.extend(
            [
                "",
                "## Missing-in-rs leaves with zero observed calls",
                "",
                ", ".join(f"`{leaf}`" for leaf in missing_zero) + ".",
            ]
        )
    if unresolved_leaves:
        lines.extend(
            [
                "",
                "## Parsed but unresolved command shapes",
                "",
                "These are labeled rather than silently assigned to an inventory leaf. Source counts stay separate:",
                "",
                "| shape | L | B | M | O |",
                "|---|---:|---:|---:|---:|",
            ]
        )
        ordered_unresolved = sorted(
            unresolved_leaves,
            key=lambda leaf: tuple(
                -stats_by_source[source].unresolved[leaf] for source in SOURCE_ORDER
            ) + (leaf,),
        )
        for leaf in ordered_unresolved:
            lines.append(
                f"| `{leaf}` | {stats_by_source['ledger'].unresolved[leaf]} | "
                f"{stats_by_source['bash'].unresolved[leaf]} | "
                f"{stats_by_source['metrics'].unresolved[leaf]} | "
                f"{stats_by_source['omp'].unresolved[leaf]} |"
            )
    lines.append("")
    return "\n".join(lines)


def parse_now(value: str | None) -> dt.datetime:
    if value is None:
        return dt.datetime.now(UTC)
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path, help="Markdown report path")
    parser.add_argument("--home", type=Path, default=Path.home(), help="home containing telemetry stores")
    parser.add_argument("--now", help="ISO timestamp override for reproducible 30-day windows")
    args = parser.parse_args(argv)

    home = args.home.expanduser().resolve()
    now = parse_now(args.now)
    cutoff = now - dt.timedelta(days=30)
    repo_root = Path(__file__).resolve().parents[2]
    pij_home = home / ".pij"
    fleet_prefix = str(home / "pi-hacking/pij")
    seat_index = build_seat_index(pij_home)

    stats_by_source = {
        "ledger": scan_ledger(pij_home, seat_index, cutoff, fleet_prefix),
        "bash": scan_bash_db(
            home / ".git-ai/internal/bash-checkpoints-db", seat_index, cutoff, fleet_prefix
        ),
        "metrics": scan_metrics_db(
            home / ".git-ai/internal/metrics-db", seat_index, cutoff, fleet_prefix
        ),
        "omp": scan_omp(home / ".omp/agent/sessions", seat_index, cutoff, fleet_prefix),
    }
    rs_paths, rs_ts, warnings = derive_rs_inventory(repo_root)
    report = generate_report(stats_by_source, rs_paths, rs_ts, warnings, now, fleet_prefix)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(report, encoding="utf-8")

    print(f"wrote {args.out} ({len(TS_LEAVES)} TS leaves; {len(rs_paths)} current rs paths)")
    for source in SOURCE_ORDER:
        print(f"{SOURCE_SHORT[source]} {source}: {source_summary(stats_by_source[source])}")
    return 0 if any(stats.available for stats in stats_by_source.values()) else 2


if __name__ == "__main__":
    sys.exit(main())
