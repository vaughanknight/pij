# Workshop: the pij harness

**Type**: Integration Pattern + CLI Flow + Storage Design
**Plan**: 001-pi-extensions
**Spec**: this workshop is the spec until `/plan-1b-specify` runs
**Created**: 2026-05-09
**Status**: Draft

**Related Documents**:
- [Workshop 001 — Loading extensions into pi](001-loading-extensions-into-pi.md) — distribution mechanics
- [Workshop 002 — Dev loop and hot reload](002-dev-loop-and-hot-reload.md) — iteration pattern
- [Workshop 003 — `scratch` extension](003-scratch-extension.md) — canonical T2 design + patterns P1–P10
- [Research dossier](../research-dossier.md)
- pi-mono `AGENTS.md` — house rules we inherit

**Domain Context**:
- **Primary**: future `harness/` domain — this workshop is its founding charter.
- **Related**: future `extensions/` (consumes the harness; every extension is an exercise of it).

---

## Philosophy — the harness is the product

> Pij is **not a collection of pi extensions**. Pij is **the engineering harness that makes building pi extensions fast**. Individual extensions (`scratch`, `pij-mcp`, `pij-supervisor`, …) are exercises that prove the harness works.
>
> The hypothesis: each successive extension we build should be **faster** than the last. If it isn't, the harness has a leak. Every difficulty encountered is a gift — the work is to *encode the fix*, not to *document the workaround*.

This workshop designs the harness. Building extensions comes later, *with* the harness.

## Purpose

Define the complete shape of pij as a harness so that, when implementation begins, almost no design questions remain. By the end of this document we know:

- Every file at the pij root and what's in it
- Every npm script (and what it does)
- The template files that govern the T2 layout
- The generator that turns a name into a working extension scaffold
- The smoke-test runner that validates extensions end-to-end
- The difficulty ledger and velocity log formats
- The agent rules (`AGENTS.md`) and the runbook (`RUNBOOK.md`)
- CI configuration
- The self-check pipeline that proves the harness still works

This workshop is dense and code-heavy on purpose. Keep it open during build.

## Key Questions Addressed

- What is at pij root, and why each file?
- How does `npm run new <name>` work?
- What's in the templates so P1–P10 from workshop 003 are *enforced* not just suggested?
- How does an extension declare its smoke test?
- How does the harness self-validate so a fresh agent session can trust it?
- How do difficulties get tracked and resolved?
- How do we measure velocity?
- What's the minimum CI?
- What changes when we add the second extension? The tenth?

---

## The 5-minute test

The skill asks: "If a brand new agent session started right now with zero context, could it get from zero to working in under 5 minutes using only automated recipes?"

### Today (no harness)

```
agent: reads workshop 001 (552 lines) + 002 (498) + 003 (942) ...... 15 min
agent: figures out toolchain (peerDeps, .js extensions, biome, vitest) ... 20 min
agent: hand-writes the three scratch files ........................ 30 min
agent: hits a `peerDependencies` error, debugs ................... 10 min
agent: finally /reload's pi to see /scratch register .............. 5 min
TOTAL .............................................................. 80 min
```

### After this workshop ships

```
agent: reads RUNBOOK.md (≤50 lines) ............................... 1 min
agent: npm install .................................................. 1 min
agent: npm run new myext ............................................ 5 sec
agent: edits .pi/extensions/myext/{store,index}.ts to taste ........ 3 min
agent: npm test ..................................................... 30 sec
agent: cd pij && pi → /reload ....................................... 30 sec
TOTAL .............................................................. ≤6 min
```

The harness eats ~74 minutes of friction per extension. Three extensions in, the harness has paid for itself many times over.

---

## Goals and non-goals

### Goals

1. **Bootstrap from a fresh checkout in one command** (`npm install`).
2. **Scaffold a new extension in one command** (`npm run new <name>`) producing a passing test from minute one.
3. **Iterate fast** (`pi` from pij root + `/reload` + `npm test -- --watch`).
4. **End-to-end smoke** (`npm run smoke [name]`) that drives pi via tmux.
5. **Self-validate** (`npm run self-check`) — typecheck + lint + tests + smoke. CI runs this.
6. **Encode patterns P1–P10** in templates, not in markdown nudges.
7. **Track every difficulty** in `docs/difficulties.md`; resolve via encoded fixes.
8. **Track velocity** in `docs/velocity.md` to test the compounding hypothesis.
9. **Inherit pi-mono house rules** (no `any`, no inline imports, biome) explicitly in `AGENTS.md`.

### Non-goals

- **Not a re-implementation of pi.** We use pi as installed; we don't fork it.
- **No build step.** Jiti loads `.ts` at runtime; we type-check separately.
- **No publishing pipeline yet.** First we ship a working harness with one extension; npm publishing is a stretch goal once we have ≥3 extensions.
- **No bespoke test framework.** Vitest only.
- **No custom CLI.** npm scripts (with `tsx` for our generators) — keeps the toolchain minimal.
- **No file watcher built in.** Pi has no watcher by design (workshop 002); `npm run watch <name>` (fswatch + tmux send-keys) is a stretch goal.

---

## Architecture — file tree of complete pij

```
pij/
├── package.json                       ← pi-package manifest + scripts + peerDeps
├── tsconfig.json                      ← strict, NodeNext, noEmit
├── biome.json                         ← match pi-mono house style
├── vitest.config.ts                   ← runs *.test.ts under .pi/ and harness/
├── AGENTS.md                          ← inherited rules + pij-specific patterns
├── RUNBOOK.md                         ← agent's first-read; three commands
├── README.md                          ← human-facing landing
│
├── .github/
│   └── workflows/
│       └── ci.yml                     ← typecheck + lint + test on push/PR
│
├── .pi/                               ← pi resources (auto-discovered)
│   ├── extensions/
│   │   └── scratch/                   ← T2 layout (workshop 003)
│   │       ├── index.ts
│   │       ├── store.ts
│   │       ├── store.test.ts
│   │       └── smoke.ts               ← scenario for harness/scripts/smoke.ts
│   ├── skills/                        ← (future)
│   ├── prompts/                       ← (future)
│   └── themes/                        ← (future)
│
├── harness/                           ← the harness itself; the product
│   ├── scripts/
│   │   ├── new-extension.ts           ← npm run new <name>
│   │   └── smoke.ts                   ← npm run smoke [name]
│   ├── templates/
│   │   └── extension/
│   │       ├── index.ts.template
│   │       ├── store.ts.template
│   │       ├── store.test.ts.template
│   │       ├── smoke.ts.template
│   │       └── AGENTS.md.template     ← per-extension acceptance checklist
│   ├── test-utils.ts                  ← shared test helpers (e.g. makeRecorder)
│   └── README.md                      ← harness internals docs
│
├── docs/
│   ├── plans/                         ← already exists from /plan-1a
│   ├── difficulties.md                ← the ledger
│   └── velocity.md                    ← phase-by-phase wall-clock
│
├── .fs2/                              ← already exists; multi-graph configured
├── .gitignore
└── LICENSE
```

---

## Recipe surface — every npm script

| Script | Behaviour | When to run |
|---|---|---|
| `npm install` | Install peer + dev deps | First time / after dep changes |
| `npm run typecheck` | `tsc --noEmit` over `.pi/extensions/**/*.ts` and `harness/**/*.ts` | Before every commit |
| `npm test` | `vitest run` — the store-layer suite | Before every commit; in CI |
| `npm run test:watch` | `vitest` (interactive watch) | During dev, terminal C of the 4-terminal loop |
| `npm run lint` | `biome check .` (errors and warnings) | Before every commit; in CI |
| `npm run format` | `biome check --write .` | When formatting |
| `npm run new -- <name>` | `tsx harness/scripts/new-extension.ts <name>` — scaffolds T2 | New extension |
| `npm run smoke -- [name]` | `tsx harness/scripts/smoke.ts [name]` — drives pi via tmux | Before merging an extension |
| `npm run self-check` | typecheck + lint + test + smoke | CI; pre-release |

> **Why npm scripts and not `just` or `make`**: pi-mono uses npm scripts; matching the toolchain reduces cognitive friction. `just`/`make` add a binary dep (small but real). If one day we want them, they become aliases on top of npm scripts, not replacements.

---

## Templates — where P1–P10 live as code

Templates use `{{name}}` and `{{ClassName}}` placeholders. The generator does plain regex substitution — no templating engine.

### `harness/templates/extension/index.ts.template`

```ts
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { {{ClassName}}Store } from "./store.js";

export default function (pi: ExtensionAPI) {
  const store = new {{ClassName}}Store(
    (customType, data) => pi.appendEntry(customType, data),
  );

  function refreshStatus(ctx: ExtensionContext): void {
    const n = store.count();
    ctx.ui.setStatus(
      "{{name}}",
      n === 0 ? "" : `{{name}}: ${n}`,
    );
  }

  // Pattern P10: one handler for session_start, all reasons.
  pi.on("session_start", async (event, ctx) => {
    store.rehydrate(ctx.sessionManager.entries);
    refreshStatus(ctx);
  });

  pi.registerCommand("{{name}}", {
    description: "TODO: describe {{name}}",
    handler: async (
      args: string,
      ctx: ExtensionCommandContext,
    ): Promise<void> => {
      // TODO: implement /{{name}}
      ctx.ui.notify(`{{name}}: not implemented (got: ${args})`, "info");
    },
  });

  // Optional starter tool — delete or expand.
  pi.registerTool({
    name: "{{name}}_ping",
    label: "{{ClassName}} ping",
    description: "TODO: describe what {{name}}_ping does",
    parameters: Type.Object({
      message: Type.String({ description: "Message to echo" }),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      return {
        content: [{ type: "text", text: `pong: ${params.message}` }],
        details: {},
      };
    },
  });
}
```

Encodes: P3 (constructor injection of `appendEntry`), P5 (constants stay in store), P7 (`./store.js`), P10 (single `session_start` handler).

### `harness/templates/extension/store.ts.template`

```ts
// {{ClassName}}Store — pi-free data layer (Pattern P2).
//
// Imports nothing from @earendil-works/*. Pure logic over plain data.
// Tests run against this in plain Node — no pi runtime, no TUI.

// ─── entry tags ──────────────────────────────────────────────────────────
export const ENTRY_PREFIX = "{{name}}:";
export const ENTRY_ITEM   = `${ENTRY_PREFIX}item`;
export const ENTRY_DELETE = `${ENTRY_PREFIX}delete`;
export const ENTRY_CLEAR  = `${ENTRY_PREFIX}clear`;

// ─── limits (Pattern P5: live with the data they constrain) ──────────────
export const MAX_ITEM_BYTES   = 2048;
export const DEFAULT_LIMIT    = 50;
export const MAX_LIMIT        = 200;

// ─── domain ──────────────────────────────────────────────────────────────
export interface Item {
  id: string;
  // TODO: add fields
  createdAt: number;
}

// Pattern P6: structural entry type at the boundary.
export interface ReplayableEntry {
  readonly type: string;
  readonly customType?: string;
  readonly data?: unknown;
}

// Pattern P3: side effect injected via constructor.
export type AppendFn = (customType: string, data: unknown) => void;

// Pattern P4: tagged-union returns over throws.
type AddResult    = { ok: true; item: Item } | { ok: false; reason: "too_long" };
type DeleteResult = { ok: true; item: Item } | { ok: false; reason: "out_of_range" };

export function newId(
  now: number = Date.now(),
  random: () => number = Math.random,
): string {
  return `${now.toString(36)}-${random().toString(36).slice(2, 8)}`;
}

export class {{ClassName}}Store {
  private items: Item[] = [];

  constructor(private readonly append: AppendFn) {}

  rehydrate(entries: Iterable<ReplayableEntry>): void {
    this.items = [];
    for (const entry of entries) {
      if (entry.type !== "custom") continue;
      switch (entry.customType) {
        case ENTRY_CLEAR:
          this.items = [];
          break;
        case ENTRY_ITEM:
          this.items.push(entry.data as Item);
          break;
        case ENTRY_DELETE: {
          const { id } = entry.data as { id: string };
          this.items = this.items.filter((n) => n.id !== id);
          break;
        }
      }
    }
  }

  count(): number {
    return this.items.length;
  }

  // Pattern P9: persist BEFORE updating memory.
  add(/* TODO: args */): AddResult {
    // TODO
    const item: Item = { id: newId(), createdAt: Date.now() };
    this.append(ENTRY_ITEM, item);
    this.items.push(item);
    return { ok: true, item };
  }
}
```

Encodes: P2 (no `@earendil-works/*` imports), P3 (constructor injection), P4 (tagged unions), P5 (constants), P6 (structural entry types), P9 (persist before mutate).

### `harness/templates/extension/store.test.ts.template`

```ts
import { describe, expect, it } from "vitest";

import {
  ENTRY_ITEM,
  type ReplayableEntry,
  {{ClassName}}Store,
} from "./store.js";

function makeStore() {
  const appended: Array<{ customType: string; data: unknown }> = [];
  const store = new {{ClassName}}Store(
    (customType, data) => appended.push({ customType, data }),
  );
  return { store, appended };
}

describe("{{ClassName}}Store", () => {
  it("starts empty", () => {
    const { store } = makeStore();
    expect(store.count()).toBe(0);
  });

  it("rehydrates items from a session entry log", () => {
    const { store } = makeStore();
    const entries: ReplayableEntry[] = [
      {
        type: "custom",
        customType: ENTRY_ITEM,
        data: { id: "1", createdAt: 1 },
      },
    ];
    store.rehydrate(entries);
    expect(store.count()).toBe(1);
  });

  // TODO: more tests as the store grows
});
```

### `harness/templates/extension/smoke.ts.template`

```ts
// Smoke scenario for {{name}}. Runs via `npm run smoke -- {{name}}`.
//
// Each step sends keystrokes into a tmux session running pi (autoload from
// pij root) and (optionally) checks that captured output matches a regex.

export default {
  name: "{{name}}",
  steps: [
    {
      send: "/{{name}}",
      expect: /not implemented/,
      delay: 1500,
    },
    // TODO: add real steps once /{{name}} is implemented
  ],
};
```

### `harness/templates/extension/AGENTS.md.template`

```md
# {{name}}

(Brief description goes here.)

## Acceptance for v1
- [ ] `npm test` green for `{{name}}/store.test.ts`
- [ ] `npm run typecheck` clean
- [ ] `cd pij && pi` loads without error; `/{{name}}` registered
- [ ] `npm run smoke -- {{name}}` passes
- [ ] One difficulty entry added (or zero, if nothing was friction)

## Notes
(Authoring decisions, gotchas, links to relevant findings.)
```

---

## Generator design — `harness/scripts/new-extension.ts`

```ts
#!/usr/bin/env tsx
// npm run new -- <name>
//
// Scaffolds .pi/extensions/<name>/ from harness/templates/extension/.
// All paths absolute via import.meta.dirname so it works from any cwd.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const TEMPLATE_DIR = join(
  import.meta.dirname,
  "..",
  "templates",
  "extension",
);
const TARGET_ROOT = join(
  import.meta.dirname,
  "..",
  "..",
  ".pi",
  "extensions",
);

function toClassName(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function fillTemplate(
  source: string,
  subs: Record<string, string>,
): string {
  return source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in subs)) throw new Error(`unknown placeholder {{${key}}}`);
    return subs[key];
  });
}

function main(): void {
  const name = process.argv[2];
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    console.error("usage: npm run new -- <name>");
    console.error("  <name> must match /^[a-z][a-z0-9-]*$/");
    process.exit(1);
  }

  const targetDir = join(TARGET_ROOT, name);
  if (existsSync(targetDir)) {
    console.error(`error: ${targetDir} already exists`);
    process.exit(1);
  }

  const subs = {
    name,
    ClassName: toClassName(name),
  };

  mkdirSync(targetDir, { recursive: true });

  for (const tplFile of readdirSync(TEMPLATE_DIR)) {
    if (!tplFile.endsWith(".template")) continue;
    const outFile = tplFile.replace(/\.template$/, "");
    const tpl = readFileSync(join(TEMPLATE_DIR, tplFile), "utf8");
    writeFileSync(join(targetDir, outFile), fillTemplate(tpl, subs));
  }

  console.log(`✓ Created .pi/extensions/${name}/`);
  console.log("");
  console.log("Next:");
  console.log("  npm test                       # verify scaffold compiles");
  console.log("  cd pij && pi                   # auto-loads the extension");
  console.log(`  /${name}                       # in the TUI`);
  console.log(`  npm run smoke -- ${name}        # end-to-end smoke`);
}

main();
```

**Why a TypeScript script and not bash**: Windows compatibility, type safety, easier to extend (e.g., add a `--with-skill` flag later). Cost is the `tsx` dev dep — already a peer of pi.

---

## Smoke runner — `harness/scripts/smoke.ts`

The runner drives pi inside a fresh tmux session, sends keystrokes per the scenario, captures the pane, and asserts regexes. Same pattern as pi-mono's `AGENTS.md` § "Testing pi Interactive Mode with tmux".

```ts
#!/usr/bin/env tsx
// npm run smoke -- [name]
//
// Without a name: runs every smoke.ts scenario found under .pi/extensions/.
// With a name: runs that one only.

import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

interface SmokeStep {
  send: string;
  expect?: string | RegExp;
  delay?: number;
}

interface SmokeScenario {
  name: string;
  bootSeconds?: number;
  steps: SmokeStep[];
}

const PIJ_ROOT = join(import.meta.dirname, "..", "..");
const SESSION = "pij-smoke";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tmux(...args: string[]): string {
  return execSync(["tmux", ...args].join(" "), { encoding: "utf8" });
}

function tmuxSafe(...args: string[]): void {
  try {
    tmux(...args);
  } catch {
    /* swallow */
  }
}

async function runScenario(scenario: SmokeScenario): Promise<void> {
  tmuxSafe("kill-session", "-t", SESSION);
  tmux(
    "new-session",
    "-d",
    "-s",
    SESSION,
    "-x",
    "120",
    "-y",
    "40",
  );
  tmux(
    "send-keys",
    "-t",
    SESSION,
    `"cd ${PIJ_ROOT} && pi"`,
    "Enter",
  );
  await sleep((scenario.bootSeconds ?? 3) * 1000);

  for (const step of scenario.steps) {
    tmux("send-keys", "-t", SESSION, `"${step.send}"`, "Enter");
    await sleep(step.delay ?? 1500);

    if (step.expect != null) {
      const out = tmux("capture-pane", "-t", SESSION, "-p");
      const re =
        step.expect instanceof RegExp ? step.expect : new RegExp(step.expect);
      if (!re.test(out)) {
        tmuxSafe("kill-session", "-t", SESSION);
        const tail = out.slice(-800);
        throw new Error(
          `smoke[${scenario.name}]: step "${step.send}" expected /${re.source}/\n--- pane tail ---\n${tail}`,
        );
      }
    }
  }

  tmuxSafe("kill-session", "-t", SESSION);
}

function findScenarios(filter?: string): string[] {
  const root = join(PIJ_ROOT, ".pi", "extensions");
  const found: string[] = [];
  for (const entry of readdirSync(root)) {
    if (filter && entry !== filter) continue;
    const file = join(root, entry, "smoke.ts");
    try {
      if (statSync(file).isFile()) found.push(file);
    } catch {
      /* none */
    }
  }
  return found;
}

async function main(): Promise<void> {
  const filter = process.argv[2];
  const files = findScenarios(filter);
  if (files.length === 0) {
    console.log(filter ? `no smoke.ts in ${filter}` : "no smoke scenarios");
    process.exit(0);
  }

  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)) as {
      default: SmokeScenario;
    };
    const scenario = mod.default;
    process.stdout.write(`smoke: ${scenario.name} ... `);
    await runScenario(scenario);
    console.log("✓");
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
```

**Caveats**:

- Requires `tmux` and a `pi` binary on PATH — local-only. CI skip is intentional (D-008 wishlist: a non-tmux smoke that drives pi via the SDK).
- Scenarios are imported dynamically; relative imports inside scenarios resolve via `pathToFileURL`.
- Total wall-clock per scenario: ~3 s boot + steps × `delay`. Six steps at default 1500 ms = ~12 s.

---

## Test utilities — `harness/test-utils.ts`

```ts
// Shared test helpers. Keep tiny — extract patterns only after they're
// duplicated across ≥2 test files.

export interface AppendCall<T = unknown> {
  customType: string;
  data: T;
}

export function makeRecorder<T = unknown>() {
  const calls: AppendCall<T>[] = [];
  const append = (customType: string, data: unknown): void => {
    calls.push({ customType, data: data as T });
  };
  return { append, calls };
}

export function lastCustomType(calls: AppendCall[]): string | undefined {
  return calls.at(-1)?.customType;
}
```

That's it for now. As patterns repeat across extensions, more helpers land here.

---

## `package.json` (full draft)

```json
{
  "name": "pij",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Engineering harness for building pi extensions.",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./.pi/extensions"],
    "skills": ["./.pi/skills"],
    "prompts": ["./.pi/prompts"],
    "themes": ["./.pi/themes"]
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check .",
    "format": "biome check --write .",
    "new": "tsx harness/scripts/new-extension.ts",
    "smoke": "tsx harness/scripts/smoke.ts",
    "self-check": "npm run typecheck && npm run lint && npm run test && npm run smoke"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "@earendil-works/pi-ai": "*",
    "typebox": "*"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vitest": "^2.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**Why peer deps for the pi-bundled packages**: pi already bundles `@earendil-works/pi-*` and `typebox`. Listing them in `dependencies` would shadow pi's copies and break (workshop 001 § "Path 5 caveat"). Peer ranges of `"*"` say "use whatever pi has."

---

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": [".pi/extensions/**/*.ts", "harness/**/*.ts"],
  "exclude": ["node_modules", "**/node_modules", ".pi/git", ".pi/npm"]
}
```

Strict + `noUncheckedIndexedAccess` catches `arr[0]` returning `T | undefined`. NodeNext resolution requires `.js` extensions on relative imports (Pattern P7).

---

## `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": {
    "ignore": [
      "node_modules",
      "dist",
      ".pi/git",
      ".pi/npm",
      "**/*.template"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "complexity": { "noForEach": "off" }
    }
  }
}
```

Tabs + double-quotes + 100-col matches pi-mono. `*.template` files are excluded — they intentionally contain `{{name}}` and are not valid TS.

---

## `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [".pi/extensions/**/*.test.ts", "harness/**/*.test.ts"],
    exclude: ["node_modules", ".pi/git", ".pi/npm"],
    testTimeout: 5000,
    reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
  },
});
```

---

## `AGENTS.md` (full draft)

```md
# pij — Agent Rules

> **The harness is the product.** pij is engineering infrastructure for
> building pi extensions. Every extension is an exercise; every difficulty
> is a gift to encode. If a session ends without the harness improving,
> something went wrong.

## Inherited from pi-mono (do not violate without explicit user approval)

- No `any` types unless absolutely necessary.
- No inline imports — never `await import("./foo.js")`, never
  `import("pkg").Type` in type positions, no dynamic imports for types.
  Always top-level standard imports.
- Never hardcode keybindings; use a configurable matching object
  (DEFAULT_*_KEYBINDINGS).
- Biome check (errors and warnings) before commit: `npm run lint`.
- Type-check: `npm run typecheck` (`tsc --noEmit`).
- Tests: `npm test`. Run from the package root.
- Read files in full before wide-ranging changes; do not rely solely on
  search snippets.
- Never use `git add -A` / `git add .`. Use specific file paths.
- Never bypass hooks (`--no-verify`, `--no-gpg-sign`).
- Never `git reset --hard`, `git checkout .`, `git clean -fd`,
  `git stash` without explicit user approval.

## pij-specific (Patterns P1–P10 from workshop 003)

1. **T2 layout by default**: `.pi/extensions/<name>/{index,store,test}.ts`.
   T1 (single file) only for <80 LOC, single-concern extensions.
2. **Pi-free store**: `store.ts` imports nothing from `@earendil-works/*`.
3. **Inject side effects via constructor.** No global mutable state.
4. **Tagged-union returns** (`{ ok, ... }`) over throws.
5. **Constants live in `store.ts`** next to the data they constrain.
6. **Structural entry types** at the boundary (no cast at the call site).
7. **`.js` extension on relative imports** (NodeNext / ESM).
8. **Tests target the store**, not the wiring.
9. **Persist before mutate** (event-sourced consistency).
10. **One handler for `session_start`**, all reasons (`startup`, `reload`,
    `new`, `resume`, `fork`).

## Workflow

1. New extension: **`npm run new -- <name>`** — never hand-roll the T2
   boilerplate.
2. Iterate: `pi` from pij root + `/reload`. Type-check in another tab
   (`npm run typecheck` or watch mode).
3. Test: `npm test` (vitest). Tests target `store.ts`.
4. Smoke: `npm run smoke -- <name>` before merging.
5. Self-check before any release: `npm run self-check`.

## Difficulty ledger

- Every difficulty encountered → `docs/difficulties.md` with severity.
- Every workaround → either an immediate fix (encode it) or a wishlist
  entry (`stretch:` tag).
- Every fix is preferred to be a *generator/template/lint rule* improvement,
  not a markdown paragraph.

## Velocity log

- Every phase end → row in `docs/velocity.md` with start/end and output.
- Goal: each successive extension is faster than the last.

## When something is unclear

- Read workshop 001/002/003/004 in `docs/plans/001-pi-extensions/workshops/`.
- The research dossier at `docs/plans/001-pi-extensions/research-dossier.md`
  has the wider context.
- The pi-mono source at `/Users/jordanknight/pi-hacking/pi-mono/` is the
  source of truth; query it via the FlowSpace `pi-mono` graph.

## Forbidden without explicit user approval

- Modifying the installed pi binary or the pi-mono checkout.
- Skipping any of P1–P10 in a new extension.
- Replacing the toolchain (npm scripts → just/make/pnpm/etc.).
- Publishing to npm.
- Pushing to a public remote.
```

---

## `RUNBOOK.md` (full draft)

```md
# pij Runbook

Three commands.

## Boot

```bash
npm install
npm run self-check     # validates the harness still works end-to-end
```

If `self-check` fails, fix it before doing anything else. **The harness IS
the product.**

## New extension

```bash
npm run new -- <name>
```

Generates `.pi/extensions/<name>/{index,store,test,smoke}.ts +
AGENTS.md` from templates encoding patterns P1–P10.

## Iterate

```bash
cd $(pwd) && pi          # auto-loads .pi/extensions/<name>/
```

In the TUI, after edits: `/reload`. Pi has no file watcher — the reload
is manual on purpose (workshop 002).

Recommended four-terminal layout:

| Terminal | Command |
|---|---|
| A | `pi` (the TUI; type `/reload` after edits) |
| B | your editor |
| C | `npm run typecheck -- --watch` (catches type errors before /reload) |
| D | `npm run test:watch` (store unit tests) |

## Smoke

```bash
npm run smoke -- <name>     # one extension
npm run smoke               # all extensions with a smoke.ts
```

Requires `tmux` and `pi` on PATH.

## When something hurts

1. Open `docs/difficulties.md`, append a row (D-NNN).
2. If the fix is <30 min, **encode it now** (template, lint rule, helper).
   Do not just document it.
3. Otherwise, file a `stretch:` row and link the difficulty.

## Where things are

| What | Where |
|---|---|
| Extensions | `.pi/extensions/<name>/` |
| Skills/prompts/themes | `.pi/<kind>/` (future) |
| Templates | `harness/templates/extension/` |
| Generator | `harness/scripts/new-extension.ts` |
| Smoke runner | `harness/scripts/smoke.ts` |
| Test utils | `harness/test-utils.ts` |
| Workshops | `docs/plans/001-pi-extensions/workshops/` |
| Research dossier | `docs/plans/001-pi-extensions/research-dossier.md` |
| Difficulty ledger | `docs/difficulties.md` |
| Velocity log | `docs/velocity.md` |
| pi source (read-only) | `/Users/jordanknight/pi-hacking/pi-mono/` (FlowSpace graph: `pi-mono`) |

## Authoring help

- **How extensions reach pi** → workshop 001
- **Edit-reload-test loop** → workshop 002
- **Canonical extension shape (P1–P10)** → workshop 003
- **The harness itself** → workshop 004 (this folder's design doc)
```

---

## CI — `.github/workflows/ci.yml`

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      # smoke is local-only for now (requires tmux + pi binary)
      # — see docs/difficulties.md D-008 for the SDK-driven smoke wishlist
```

---

## `docs/difficulties.md` — initial seed

```md
# Difficulties

Friction encountered in pij dev. Each entry has a workaround (immediate)
and an encoded fix (durable). Severity guides priority.

| ID | Date | Severity | Description | Workaround | Encoded fix | Status |
|----|------|----------|-------------|------------|-------------|--------|
| D-001 | 2026-05-09 | low | Subagent returned 18 findings inline instead of writing to disk | manual file write by parent | `/plan-1a-explore` agent prompts assert file-write before reporting count | open |
| D-002 | 2026-05-09 | medium | `await ctx.reload()` runs post-reload code from the *pre-reload* version | always end the handler with `return` after `await ctx.reload()` | template encodes the `return;` pattern; consider biome rule | mitigated |
| D-003 | 2026-05-09 | low | NodeNext requires `.js` on relative TS imports; editors don't auto-add | manual `.js` suffix | tsconfig + biome catch missing extension; templates use `.js` everywhere | encoded |
| D-004 | 2026-05-09 | medium | Pi-bundled deps must be `peerDependencies: "*"` not `dependencies` (else they shadow pi's copies) | manually move them | template `package.json` ships peerDeps already correct | encoded |
| D-005 | 2026-05-09 | high | Unverified: do `customType` entries survive `/compact`? | none yet | smoke scenario adds notes → `/compact` → asserts notes still listable | open |
| D-006 | 2026-05-09 | low | Unverified: does `ctx.ui.setStatus(key, "")` clear, or display empty? | use empty string and observe | smoke scenario inspects status after empty pad | open |
| D-007 | 2026-05-09 | medium | Pi has no file watcher — manual `/reload` after every edit | type `/reload` | optional `npm run watch` (fswatch + tmux send-keys) — stretch | open |
| D-008 | 2026-05-09 | medium | Smoke runner requires tmux + pi binary, so CI can't run it | skip smoke in CI | SDK-driven smoke (no TUI, no tmux) — stretch | open |

## Severity
- **high**: blocks all extension authoring, or risks silent data loss.
- **medium**: slows authoring; common case.
- **low**: rare; one-off fix is fine.

## Status
- **open**: known, no mitigation yet.
- **mitigated**: workaround in place; durable fix pending.
- **encoded**: durable fix landed (template, lint, generator).
- **resolved**: fix verified by passing tests/smoke.
```

---

## `docs/velocity.md` — initial seed

```md
# Velocity log

Wall-clock per phase. **Goal: each successive extension is faster than the
last.** If it's not, the harness has a leak.

| Phase | Date | Duration | Output | Notes |
|-------|------|----------|--------|-------|
| 0 — fs2 multi-graph wiring | 2026-05-09 | 5 min | `pi-mono` graph queryable from pij | one-time |
| 1 — research (8 parallel agents + synthesis) | 2026-05-09 | 60 min | dossier + 8 findings + 2 external | one-time |
| 2 — workshops 001+002 | 2026-05-09 | 30 min | distribution + dev-loop refs | |
| 3 — workshop 003 (T1 → T2) | 2026-05-09 | 50 min | `scratch` design + P1–P10 | |
| 4 — workshop 004 (this) | 2026-05-09 | TBD | harness charter + scaffolds | |
| 5 — build the harness | TBD | TBD | working `npm run new` + smoke | |
| 6 — extension #1 (`scratch`) | TBD | TBD | working /scratch | first ext via harness |
| 7 — extension #2 (TBD) | TBD | TBD | TBD | **target: <30 min** |

## Hypothesis
After phase 5 (harness shipped), extension #2 takes **<30 min** end-to-end
(scaffold + store + index + test + smoke). If it doesn't, file a `D-NNN`
explaining where the time went and encode the fix before extension #3.
```

---

## Self-check pipeline

`npm run self-check` is the harness's regression test. It runs in this order:

```
1. typecheck           tsc --noEmit                       — fast, catches type bugs
2. lint                biome check .                       — fast, catches style/anti-pattern
3. test                vitest run                          — store-layer unit tests
4. smoke               npm run smoke (all scenarios)       — end-to-end via tmux+pi (local only)
```

If any step fails, the harness is broken and must be fixed before any
extension work proceeds. CI runs steps 1–3 (smoke is local until D-008
lands). The order is deliberate: cheap fast checks first; expensive ones
last. Most regressions caught by step 1 or 2.

A future enhancement (stretch): `npm run self-check -- --include-temp` that
scaffolds a temp `__test_ext`, smokes it, and removes it. Catches generator
regressions before they ship.

---

## Open Questions

### Q1 — `just`/`Makefile` alongside npm scripts?

**OPEN — defer.** npm scripts cover everything we need today and match
pi-mono's toolchain. If ergonomics genuinely suffer (long invocations,
multi-step recipes that don't fit `&&`), revisit. Adding `just` later is
trivial; removing it later isn't.

### Q2 — Do we publish pij to npm?

**RESOLVED — defer.** First we ship a working harness with one extension
(`scratch`) and validate the velocity hypothesis with a second extension.
Then publishing is a worthwhile chore. Premature publishing locks names
and versions before we know what's right.

### Q3 — Should the smoke runner spawn tmux *inside* the test, or expect a session pre-running?

**RESOLVED — spawn fresh per scenario.** Reproducibility wins. ~3 s boot
overhead per scenario is acceptable for a tool we run before merge, not
on every save.

### Q4 — Templates as files or as TypeScript string literals in the generator?

**RESOLVED — files.** Files are diffable, syntax-highlighted by editors,
and easier to keep correct as the patterns evolve. Cost: the `.template`
suffix and the biome ignore. Worth it.

### Q5 — Where does the harness's *own* code get tested?

**OPEN — minimal for now.** `harness/test-utils.ts` is exercised
transitively via store tests; the generator and smoke runner are
exercised by `npm run self-check`. If complexity grows (e.g., generator
gains flags), add `harness/scripts/new-extension.test.ts` exercising the
template substitution pure function.

### Q6 — Pi version pinning?

**OPEN.** The peer dep `*` says "any pi". For a hardened harness we'd
pin a tested range. The right time to do this is after extension #2,
when we have evidence of which pi versions actually work. File as
stretch (D-009 candidate).

### Q7 — Does the harness depend on `tsx` at runtime, or can it use Node ESM directly?

**RESOLVED — `tsx`.** Node ESM doesn't load `.ts` natively; we'd need
`--experimental-strip-types` (Node 22+) or compile-on-install. `tsx` is
a single dev dep that "just works" for `npm run new` and `npm run smoke`.

### Q8 — Skills/prompts/themes generators — do we add them now?

**OPEN — defer.** YAGNI until we author the first skill/prompt/theme.
The pi-package manifest already lists the directories; auto-discovery
will pick them up when we add files. A `npm run new-skill <name>` is a
straightforward extension of the existing generator (one more
template-dir + one more script) once the demand is real.

---

## Stretch goals (post-v1)

1. **`npm run watch -- <name>`** — fswatch on `.pi/extensions/<name>/` + tmux send-keys `/reload`. Removes manual reload friction (D-007).
2. **SDK-driven smoke** — `harness/scripts/smoke-sdk.ts` using `createAgentSession` + a faux provider, no TUI. CI-runnable (D-008).
3. **Generator flags** — `npm run new -- <name> --with-skill --with-tool-only` etc. for opinionated subsets.
4. **Per-extension scaffolding for skills/prompts/themes** — `npm run new-skill`, `new-prompt`, `new-theme`.
5. **Pi version pinning + drift check** — `npm run pi-doctor` confirms installed pi matches pij's tested range.
6. **Self-check in CI with temp scaffold** — proves the generator still works.
7. **Workshop 005 — distributing pij as a pi package** — when ≥3 extensions are stable.
8. **`docs/difficulties.md` linter** — verify every "open" entry has either a date <30 days old or a stretch ticket.
9. **Velocity dashboard** — auto-compute trend from `docs/velocity.md` and warn if extension N+1 took longer than N.

---

## Acceptance for v1 (the harness ships when…)

- [ ] `npm install` succeeds from a fresh clone.
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` clean.
- [ ] `npm test` runs (no scenarios required yet — generator template includes one passing test).
- [ ] `npm run new -- demo` produces `.pi/extensions/demo/` with five files; `npm test` still clean; `npm run typecheck` still clean.
- [ ] `cd pij && pi` boots without error and registers `/demo`.
- [ ] `npm run smoke -- demo` runs the scaffold smoke scenario successfully (`/demo` echoes "not implemented").
- [ ] `npm run self-check` passes locally.
- [ ] `AGENTS.md`, `RUNBOOK.md`, `docs/difficulties.md`, `docs/velocity.md` present and populated.
- [ ] CI green on `main` (typecheck + lint + test).
- [ ] `rm -rf .pi/extensions/demo` after; commit nothing speculative.

Once v1 ships, the **next phase** is: `npm run new -- scratch` and implement `scratch` per workshop 003. That run is the real test of the harness.

---

## Quick Reference

```bash
# Boot
npm install
npm run self-check

# Author
npm run new -- <name>
cd pij && pi              # /reload after edits

# Test
npm test
npm run test:watch
npm run typecheck
npm run lint

# Validate
npm run smoke -- <name>
npm run self-check

# Encode
docs/difficulties.md      # append rows; encode fixes; close out
docs/velocity.md          # log phase end times
```

```
TREE (after v1)
pij/
├── package.json · tsconfig.json · biome.json · vitest.config.ts
├── AGENTS.md · RUNBOOK.md · README.md
├── .github/workflows/ci.yml
├── .pi/
│   └── extensions/<name>/{index,store,store.test,smoke}.ts + AGENTS.md
├── harness/
│   ├── scripts/{new-extension,smoke}.ts
│   ├── templates/extension/*.template
│   └── test-utils.ts
└── docs/
    ├── plans/…   ← workshops, dossier, findings (already exists)
    ├── difficulties.md
    └── velocity.md
```

---

## See Also

- Workshop 001 — distribution mechanics (paths the harness leverages)
- Workshop 002 — dev loop (the four-terminal cycle the harness scripts support)
- Workshop 003 — `scratch` extension (the canonical T2 design + P1–P10 the templates encode)
- pi-mono `AGENTS.md` — the rule set we inherit
- pi-mono `packages/coding-agent/docs/extensions.md` — the canonical extension reference
