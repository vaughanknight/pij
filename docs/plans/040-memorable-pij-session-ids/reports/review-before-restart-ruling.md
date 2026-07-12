# s040 review-before-restart ruling
**From**: pij-3vetx8 (o-prime) · **Date**: 2026-07-12

## Ruling

The queued daemon-restart request remains held until reviewed code has a verdict on disk.
Restarting machine-wide infrastructure onto unreviewed registry/allocation code would
invert the review-before-live gate used by prior streams.

## Sequence

1. Spawn a cold reviewer with a classic opaque id under the current daemon.
2. Complete review and persist the verdict.
3. On approval, o-prime grants queued request
   `request-265381bb-4cd4-4d28-9be7-6f4357042217`.
4. Restart and run full T009 live proof, including inbound delivery to
   `pij-gigantic-goat`.

## Rollout observation

Memorable-id descriptors created by the new CLI while the daemon still runs pre-change
code can bind and send outward but cannot receive inward until the daemon restarts.
