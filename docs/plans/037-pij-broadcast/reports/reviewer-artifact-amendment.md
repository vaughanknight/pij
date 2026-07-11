# Reviewer artifact amendment - lossless patch archive

The raw `reviews/coder-diff.patch` contains literal diff whitespace that causes `git diff --check` to reject the review artifact itself.

It was losslessly archived as:

- `docs/plans/037-pij-broadcast/reviews/coder-diff.patch.gz`
- compressed sha256: `d46a1eb8467af83b856b7bab74b5ba047159b4f692a3951693a535212656f426`
- decompressed raw patch sha256: `f3f03d3b5695bccdf3548be1108b801d2981f605a4dcac7fb97a9f86947818ff` (unchanged from review)

Reviewer action:

1. Update `reviews/review-packet.md` to point at `coder-diff.patch.gz` and state that its decompressed sha256 is the reviewed `f3f03d3…18ff`.
2. Update `reviews/reviewer-verdict.md` evidence line 9 equivalently.
3. Do not change the verdict or re-review the product diff.
4. Send the verdict pointer again after the artifact references are corrected.

Only those two review artifacts may be edited.
