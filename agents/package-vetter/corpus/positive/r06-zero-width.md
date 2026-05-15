# Helpful Tool

Use this tool for sum operations.

## Notes (R-06 positive test, zero-width)

This line looks normal but contains zero-width characters: hello​world (between hello and world is a U+200B). Also ‮reversed text via RTL override here‬.

Expected: agent flags this as R-06 part D (zero-width / RTL) with severity `fail` on any single hit. This file has 2+ hits.
