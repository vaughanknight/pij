#!/usr/bin/env python3
"""Send one body to many pij seats — refusing the misattribution that a bare loop invites.

    pij-broadcast.py --to a,b,c --body-file msg.txt [--allow-second-person]
    pij-broadcast.py --to a,b,c --body "text"

THE DEFECT THIS EXISTS TO PREVENT, twice in one day by the seat that wrote it:
a message composed as a REPLY to one peer ("you withdrew your 0", "your grep") is then
looped over several recipients. Every recipient but the addressee receives another seat's
actions attributed to them in the second person. The harm is not credit — it is that a
peer's evidence set gains an independent instrument that never existed, and peers reason
from it. `pij-massive-meadowlark` caught it both times and proposed exactly this lint:

    if a send has more than one recipient, second-person attribution in the body is a defect.

It was agreed as a RULE the first time, by a careful operator who meant it, and recurred
the next day. That is the argument for a mechanism rather than a resolution: this file
refuses the send instead of remembering not to make it.

Exit 2 = refused (nothing sent). Exit 1 = a send failed. Exit 0 = all sent.
"""
import argparse
import re
import subprocess
import sys

# Second-person attribution. `your` matters as much as `you` — "your grep", "your 0".
SECOND_PERSON = re.compile(r"\b(you|your|yours|you're|youve|you've)\b", re.I)


def offending_lines(body: str) -> list[tuple[int, str]]:
    hits = []
    for n, line in enumerate(body.splitlines(), 1):
        if SECOND_PERSON.search(line):
            flat = " ".join(line.split())
            hits.append((n, flat[:140]))
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--to", required=True, help="comma-separated pij ids")
    ap.add_argument("--body")
    ap.add_argument("--body-file")
    ap.add_argument(
        "--allow-second-person",
        action="store_true",
        help="the body is genuinely addressed to every recipient (a shared instruction, "
        "not a reply). Says so explicitly rather than by omission.",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if bool(args.body) == bool(args.body_file):
        return err("give exactly one of --body / --body-file")
    body = args.body if args.body else open(args.body_file, encoding="utf-8").read()
    targets = [t.strip() for t in args.to.split(",") if t.strip()]
    if not targets:
        return err("--to resolved to zero recipients")

    # One recipient is a reply; second person is correct and unremarkable.
    if len(targets) > 1 and not args.allow_second_person:
        hits = offending_lines(body)
        if hits:
            print(
                f"REFUSED: {len(targets)} recipients and second-person attribution in the body.\n"
                f"  Every recipient but the addressee reads these as claims about THEMSELVES:",
                file=sys.stderr,
            )
            for n, line in hits[:6]:
                print(f"    line {n}: {line}", file=sys.stderr)
            if len(hits) > 6:
                print(f"    … and {len(hits) - 6} more", file=sys.stderr)
            print(
                "  Fix by re-addressing per recipient, naming the seat instead of 'you',\n"
                "  or pass --allow-second-person if it genuinely addresses all of them.",
                file=sys.stderr,
            )
            return 2

    failed = []
    for t in targets:
        if args.dry_run:
            print(f"[dry-run] would send to {t} ({len(body)} bytes)")
            continue
        r = subprocess.run(["pij", "send", t, body], capture_output=True, text=True)
        status = "ok" if r.returncode == 0 else f"FAILED rc={r.returncode}"
        print(f"  {t}: {status}")
        if r.returncode != 0:
            failed.append(t)
            sys.stderr.write(r.stderr)
    # Report the population either way — never let a silent run mean success.
    print(f"sent {len(targets) - len(failed)}/{len(targets)}")
    return 1 if failed else 0


def err(msg: str) -> int:
    print(f"E-ARG: {msg}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
