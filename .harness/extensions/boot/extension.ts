import type { HarnessVerb, VerbContext, VerbResult } from '@ai-substrate/engineering-harness/contract';

/** Tail the last N lines of a command's output for a compact failure report. */
function tail(text: string, n = 20): string {
  const lines = text.trimEnd().split('\n');
  return lines.slice(-n).join('\n');
}

const ORIENTATION =
  'pij is a pi-extension workshop. The agent harness (the-flow, minih packs, retros) ' +
  'sits on top of the engineering harness (just recipes, harness/ driver SDK, smoke). ' +
  'Canonical gate before declaring done: `just self-check`. New extension: `just new <name>`.';

const boot: HarnessVerb = {
  name: 'boot',
  summary: 'Prove pij is ready: typecheck + vitest, then re-orient the agent.',
  description:
    'Readiness proof for pij. Runs `just typecheck` then `just test` (no shell, sequenced), ' +
    'returns a ready/error verdict the calling agent can branch on, and prints orientation.',
  async run(ctx: VerbContext): Promise<VerbResult> {
    const stages: Array<{ name: string; cmd: string; ok: boolean; code: number }> = [];

    // Stage 1 — typecheck (the whole TS surface compiles).
    const tc = await ctx.exec('just', ['typecheck']);
    stages.push({ name: 'typecheck', cmd: 'just typecheck', ok: tc.ok, code: tc.code });
    if (!tc.ok) {
      return ctx.error('boot-typecheck-failed', '`just typecheck` failed — the TypeScript surface does not compile.', {
        details: { stages, output: tail(tc.stderr || tc.stdout) },
        next_action: 'Fix the type errors above, then re-run `harness boot`.',
      });
    }

    // Stage 2 — test (the vitest suite passes).
    const test = await ctx.exec('just', ['test']);
    stages.push({ name: 'test', cmd: 'just test', ok: test.ok, code: test.code });
    if (!test.ok) {
      return ctx.error('boot-test-failed', '`just test` failed — the vitest suite is red.', {
        details: { stages, output: tail(test.stderr || test.stdout) },
        next_action: 'Fix the failing tests above, then re-run `harness boot`.',
      });
    }

    return ctx.ok(
      { ready: true, stages, orientation: ORIENTATION },
      {
        next_action:
          'pij is ready (typecheck + tests green). Proceed with the-flow / your task. ' +
          'Before declaring done, run `just self-check`.',
      },
    );
  },
};

export default boot;
