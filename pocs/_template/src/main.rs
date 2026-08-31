//! Spike template.
//!
//! Copy the directory, rename the package, delete this comment, and answer ONE
//! question. A spike that answers two questions answers neither convincingly.
//!
//! This is NOT gated: no clippy, no allow-list, no `cargo test --workspace`. The
//! evidence is what this prints.

fn main() {
    // THE REQUIRED STEP: print an eyeballable table.
    //
    // Not a summary. Not a total you worked out afterwards. The rows — because
    // the error you are about to make is the one you cannot see in an aggregate.
    // fs3's spike reported 58 of something that was actually 22, and a printed
    // table would have shown it at a glance.
    let rows = [("case", "observed", "expected"), ("example", "1", "1")];

    let widths: Vec<usize> = (0..3)
        .map(|column| rows.iter().map(|row| cell(row, column).len()).max().unwrap_or(0))
        .collect();

    for row in &rows {
        let line: Vec<String> = (0..3)
            .map(|column| format!("{:width$}", cell(row, column), width = widths[column]))
            .collect();
        println!("{}", line.join("  "));
    }

    println!("\n{} row(s). Copy anything you cite into the plan's assets/reports/.", rows.len() - 1);
}

fn cell<'a>(row: &'a (&str, &str, &str), column: usize) -> &'a str {
    match column {
        0 => row.0,
        1 => row.1,
        _ => row.2,
    }
}
