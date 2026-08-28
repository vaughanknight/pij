use pij_core::error::{PijError, Result};
use pij_core::model::Pane;

pub(crate) const FIELD_SEPARATOR: char = '|';
pub(crate) const LIST_FORMAT: &str = "#{pane_id}|#{session_name}|#{window_name}|#{pane_title}";

pub(crate) fn parse_panes(output: &str) -> Result<Vec<Pane>> {
    output
        .lines()
        .enumerate()
        .filter(|(_, line)| !line.is_empty())
        .map(|(index, line)| parse_pane(line, index + 1))
        .collect()
}

pub(crate) fn parse_one_pane(output: &str, operation: &str) -> Result<Pane> {
    let panes = parse_panes(output)?;
    match panes.as_slice() {
        [pane] => Ok(pane.clone()),
        _ => Err(adapter_error(format!(
            "{operation} returned {} pane rows, expected exactly one — run `tmux list-panes -a` to inspect the target",
            panes.len()
        ))),
    }
}

fn parse_pane(line: &str, line_number: usize) -> Result<Pane> {
    // The title is deliberately last and splitn stops after the three structural
    // separators. Pane titles are user-controlled and may contain our separator.
    let mut fields = line.splitn(4, FIELD_SEPARATOR);
    let id = required(&mut fields, "pane id", line_number)?;
    let session = required(&mut fields, "session", line_number)?;
    let window = required(&mut fields, "window", line_number)?;
    let Some(title) = fields.next() else {
        return Err(adapter_error(format!(
            "list-panes row {line_number} has no title field — update pij-tmux for this tmux wire shape"
        )));
    };

    if !id.starts_with('%') {
        return Err(adapter_error(format!(
            "list-panes row {line_number} has invalid pane id {id:?} — run `tmux list-panes -a` to inspect the source"
        )));
    }

    Ok(Pane {
        id: id.to_string(),
        session: session.to_string(),
        window: window.to_string(),
        title: title.to_string(),
    })
}

fn required<'a>(
    fields: &mut impl Iterator<Item = &'a str>,
    name: &str,
    line_number: usize,
) -> Result<&'a str> {
    match fields.next() {
        Some(value) if !value.is_empty() => Ok(value),
        _ => Err(adapter_error(format!(
            "list-panes row {line_number} has no {name} — update pij-tmux for this tmux wire shape"
        ))),
    }
}

fn adapter_error(message: String) -> PijError {
    PijError::Adapter {
        adapter: "tmux".to_string(),
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::parse_panes;

    const EMPTY_TITLE: &str =
        include_str!("../../testkit/fixtures/tmux/list-panes-empty-title.txt");
    const HOSTILE_TITLE: &str =
        include_str!("../../testkit/fixtures/tmux/list-panes-hostile-title.txt");

    #[test]
    fn captured_empty_title_is_present_not_missing() {
        let panes = parse_panes(EMPTY_TITLE).expect("captured tmux output");
        assert_eq!(panes.len(), 1);
        assert_eq!(panes[0].id, "%320");
        assert_eq!(panes[0].session, "pij-w1-fixture-c84a1");
        assert_eq!(panes[0].window, "normal");
        assert_eq!(panes[0].title, "");
    }

    #[test]
    fn title_keeps_the_field_separator_because_the_final_field_is_unsplit() {
        let panes = parse_panes(HOSTILE_TITLE).expect("captured hostile tmux output");
        assert_eq!(panes.len(), 1);
        assert_eq!(panes[0].id, "%320");
        assert_eq!(panes[0].title, "human · title | nested");
    }
}
