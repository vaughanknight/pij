# CI fix review — exact s041 convergence

## Verdict

**APPROVE**

## Byte identity

The current one-file patch is byte-identical to:

```text
git diff 18a81918d1b002863c4920149e29bbda3277dd2f..s041/inbox-no-tmux -- .pi/extensions/pij/adapters/fs-registry.test.ts
```

- Current diff SHA-256:
  `bdea600881fb5b3a6f736497e6356ef723a48d68df32805a5383461427cc0af1`
- s041 diff SHA-256:
  `bdea600881fb5b3a6f736497e6356ef723a48d68df32805a5383461427cc0af1`
- File SHA-256:
  `244139bdd23cdd40bbf75ea785afb205828d45e67c60fa57583eca1b276c4451`

## Semantic review

The only change is to the named multiprocess Vitest case:

```ts
{
	timeout: 30_000,
}
```

It is supplied as Vitest's options second argument. Test behavior and body are
otherwise unchanged.

## Scope and proof

- `git diff --name-only` contains only
  `.pi/extensions/pij/adapters/fs-registry.test.ts`.
- The three files frozen at review r2 retain their approved hashes.
- Targeted test file: PASS, 31/31.
- `git diff --check`: PASS.
- Final file and diff hashes remained unchanged after the test.

No implementation edit or commit was made by the reviewer.
