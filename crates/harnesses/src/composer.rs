/// The composer portion recognized in a rendered terminal capture.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ComposerRegion {
    Recognized(String),
    Unrecognized,
}

/// Extract composer text up to the caret from a rendered terminal capture.
#[must_use]
pub fn composer_region(capture: &str, cursor_x: u32, cursor_y: u32) -> ComposerRegion {
    rendered_composer(capture, cursor_x, cursor_y)
        .map_or(ComposerRegion::Unrecognized, ComposerRegion::Recognized)
}

fn rendered_composer(capture: &str, cursor_x: u32, cursor_y: u32) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn adapter_capture(recorded: &str) -> String {
        recorded.lines().collect::<Vec<_>>().join("\n")
    }

    fn framed(composer: &str) -> String {
        format!("transcript\n────────────\n❯ {composer}\n────────────")
    }

    #[test]
    fn live_recorded_layouts_match_pre_move_parser_byte_for_byte() {
        let fixtures = [
            (
                "OMP recorded 2026-08-31 from pane %1985",
                include_str!("../tests/fixtures/2026-08-31-omp-pane-1985.txt"),
                2,
                43,
                ComposerRegion::Unrecognized,
            ),
            (
                "Claude recorded 2026-08-31 from pane %1973",
                include_str!("../tests/fixtures/2026-08-31-claude-pane-1973.txt"),
                2,
                42,
                ComposerRegion::Recognized(String::new()),
            ),
            (
                "Copilot recorded 2026-08-31 from pane %1962",
                include_str!("../tests/fixtures/2026-08-31-copilot-pane-1962.txt"),
                2,
                42,
                ComposerRegion::Unrecognized,
            ),
        ];
        for (provenance, capture, cursor_x, cursor_y, expected) in fixtures {
            assert_eq!(
                composer_region(&adapter_capture(capture), cursor_x, cursor_y),
                expected,
                "{provenance}"
            );
        }
    }

    #[test]
    fn garbage_layout_is_unrecognized() {
        assert_eq!(
            composer_region("ordinary shell output", 1, 0),
            ComposerRegion::Unrecognized
        );
    }

    #[test]
    fn cursor_clips_suggestion_text_to_the_right() {
        assert_eq!(
            composer_region(&framed("hello suggested-text"), 7, 2),
            ComposerRegion::Recognized("hello".to_string())
        );
    }

    #[test]
    fn cursor_outside_recognized_region_is_unrecognized() {
        assert_eq!(
            composer_region(&framed("hello"), 0, 0),
            ComposerRegion::Unrecognized
        );
    }

    #[test]
    fn omp_inline_composer_is_clipped_at_the_measured_cursor() {
        assert_eq!(
            composer_region("╰─ hello suggested-text ─╯", 8, 0),
            ComposerRegion::Recognized("hello".to_string())
        );
        assert_eq!(
            composer_region("╰─     ─╯", 3, 0),
            ComposerRegion::Recognized(String::new())
        );
    }

    #[test]
    fn markdown_table_borders_are_not_composer_rules() {
        let capture = [
            "transcript",
            "┌────────────┬────────────┐",
            "│ table data │ more data │",
            "└────────────┴────────────┘",
            "────────────",
            "❯ hello",
            "────────────",
        ]
        .join("\n");
        assert_eq!(
            composer_region(&capture, 7, 5),
            ComposerRegion::Recognized("hello".to_string())
        );
    }

    #[test]
    fn copilot_footer_is_excluded_from_composer_text() {
        let capture = "❯ keepmeposted\n/ commands · context";
        assert_eq!(
            composer_region(capture, 14, 0),
            ComposerRegion::Recognized("keepmeposted".to_string())
        );
    }
}
