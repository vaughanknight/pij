# Finding: Skills, Prompt Templates, Themes, and Pi Packages

**Domain:** pi Extension Surfaces  
**Scope:** Four alternative extension surfaces beyond TypeScript extensions  
**Report Date:** May 9, 2026

---

## Overview

Pi implements four complementary extension surfaces for distributing capability, workflows, prompts, and UI customization. Each surface has distinct authoring patterns, loading mechanisms, discovery paths, and distribution vectors.

### Surface Summary Table

| Surface | Type | Format | Loading | Distribution | Precedence |
|---------|------|--------|---------|--------------|-----------|
| **Skills** | Capability packages | SKILL.md (markdown) | On-demand per task | npm, git, local | Auto-discovered or explicit |
| **Prompt Templates** | Workflow snippets | .md (markdown) | Invoked via `/name` syntax | npm, git, local | Non-recursive per directory |
| **Themes** | Color palettes | .json (JSON schema) | At startup | npm, git, local, built-in | First-wins collision |
| **Pi Packages** | Bundled resources | package.json manifest | Via package manager | npm, git, local | Project overrides user |

---

## 1. Skills

**Implementation:** `/packages/coding-agent/src/core/skills.ts` (505 lines)  
**Docs:** `/packages/coding-agent/docs/skills.md`

### SP-01: Skills Discovery and Loading Mechanism

**Finding:** Skills are discovered via three parallel mechanisms: (1) SKILL.md files in directories (hierarchical search, stops at first found), (2) direct .md files in designated root directories, (3) configured skill paths.

**Discovery Rules:**
- **Hierarchical:** Any directory containing `SKILL.md` (regardless of nesting) is treated as a skill root; recursion stops at first SKILL.md found
- **Root-level:** In `~/.pi/agent/skills/` and `.pi/skills/`, direct `.md` files are individual skills
- **Root-level (legacy):** In `~/.agents/skills/` and `.agents/skills/`, direct `.md` files are **ignored**; only SKILL.md subdirectories load

**Search Paths (precedence order):**
1. Project-local: `.pi/skills/`, `.agents/skills/` (up to git repo root or filesystem root)
2. Global user: `~/.pi/agent/skills/`, `~/.agents/skills/`
3. Packages: `skills/` directories in installed packages
4. Settings array: `skills` key in `.pi/settings.json` or `~/.pi/agent/settings.json`
5. CLI: `--skill <path>` (repeatable, additive even with `--no-skills`)

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/skills.ts:173
function loadSkillsFromDirInternal(
  dir: string,
  source: string,
  includeRootFiles: boolean,
  ignoreMatcher?: IgnoreMatcher,
  rootDir?: string,
): LoadSkillsResult {
  // First, check if dir contains SKILL.md → return immediately, do not recurse
  // Second, recurse into subdirectories or load root .md files
```

### SP-02: Skill Frontmatter Contract

**Finding:** Skills use YAML frontmatter in SKILL.md with seven standardized fields per Agent Skills specification. Only `name` and `description` are validated; unknown fields are silently ignored.

**Required Fields:**
- `name` (string, 1–64 chars, lowercase a–z, 0–9, hyphens; must match parent directory)
- `description` (string, 1–1024 chars; determines when agent loads skill)

**Optional Fields:**
- `disable-model-invocation` (boolean): when true, skill hidden from system prompt, invokable only via `/skill:name`
- `license`, `compatibility`, `metadata`, `allowed-tools` (reserved for future use or spec extension)

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/skills.ts:68–82
export interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
  [key: string]: unknown;
}

// /packages/coding-agent/src/core/skills.ts:310–312
if (!frontmatter.description || frontmatter.description.trim() === "") {
  return { skill: null, diagnostics };
}
```

### SP-03: Skill System Prompt Integration

**Finding:** Skills are formatted as XML and injected into the system prompt in a progressive-disclosure pattern: only names and descriptions are always in context; full SKILL.md loads on-demand via `/skill:name` command or agent's `read` tool.

**XML Format (per Agent Skills standard):**
```xml
<available_skills>
  <skill>
    <name>pdf-processing</name>
    <description>Extracts text and tables from PDF files…</description>
    <location>/path/to/SKILL.md</location>
  </skill>
</available_skills>
```

**Invocation:**
- Automatic: Agent reads SKILL.md via `read` tool when task matches description
- Explicit: `/skill:pdf-processing [args...]` registers as command; args appended as "User: <args>"
- Hidden: `disable-model-invocation: true` prevents prompt inclusion; only explicit `/skill:name` works

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/skills.ts:340–366
export function formatSkillsForPrompt(skills: Skill[]): string {
  const visibleSkills = skills.filter((s) => !s.disableModelInvocation);
  // Build XML structure with <available_skills>, <skill>, <name>, <description>, <location>
}
```

### SP-04: Skill Structure and Asset Resolution

**Finding:** A skill is a directory with SKILL.md and arbitrary supporting files (scripts, docs, assets). The agent resolves relative paths against the skill directory (parent of SKILL.md or `dirname(SKILL.md)`).

**Minimal Structure:**
```
my-skill/
├── SKILL.md                    # Required: frontmatter + instructions
├── scripts/
│   └── process.sh              # Referenced as ./scripts/process.sh in SKILL.md
└── references/
    └── api-reference.md        # Referenced as references/api-reference.md
```

**Path Resolution Rule (documented in code comment):**
> When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/skills.ts:318–320
skill: {
  name,
  filePath,
  baseDir: skillDir,  // ← Used for relative path resolution
  …
}
```

### SP-05: Skill Name Collision Resolution

**Finding:** When multiple skill files have the same name, the first discovered skill wins; collisions generate a diagnostic with collision details (winner path, loser path, resource type).

**Collision Detection:**
- Collision map: `skillMap.get(skill.name)` checks for existing entry
- If exists: emit collision diagnostic with `type: "collision"`; skip new skill
- Otherwise: add skill to map, track canonical path via `canonicalizePath(skill.filePath)`

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/skills.ts:427–444
const existing = skillMap.get(skill.name);
if (existing) {
  collisionDiagnostics.push({
    type: "collision",
    message: `name "${skill.name}" collision`,
    path: skill.filePath,
    collision: {
      resourceType: "skill",
      name: skill.name,
      winnerPath: existing.filePath,
      loserPath: skill.filePath,
    },
  });
}
```

---

## 2. Prompt Templates

**Implementation:** `/packages/coding-agent/src/core/prompt-templates.ts` (297 lines)  
**Docs:** `/packages/coding-agent/docs/prompt-templates.md`  
**Examples:** `/.pi/prompts/{cl,is,pr,wr}.md`

### SP-06: Prompt Template Discovery and File Lookup

**Finding:** Prompt templates are discovered non-recursively from designated `.md` files. Filename (without `.md`) becomes the command name; `/review` invokes `review.md`.

**Search Paths (precedence):**
1. Global user: `~/.pi/agent/prompts/*.md`
2. Project: `.pi/prompts/*.md`
3. Packages: `prompts/` directories in installed packages (non-recursive scan)
4. Settings array: `prompts` key in settings
5. CLI: `--prompt-template <path>` (repeatable)

**Non-Recursive Rule:** Templates in subdirectories are **not** auto-discovered; must be explicitly added via settings or package manifest.

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/prompt-templates.ts:138–175
function loadTemplatesFromDir(dir: string, getSourceInfo: (filePath: string) => SourceInfo): PromptTemplate[] {
  // Reads dir with readdirSync → filters for .md files (non-recursive)
  // Does NOT descend into subdirectories
}
```

### SP-07: Prompt Template Frontmatter and Argument Hints

**Finding:** Templates use optional YAML frontmatter with `description` and `argument-hint`. If `description` is missing, the first non-empty line of the body becomes the description (truncated to 60 chars).

**Frontmatter Schema:**
```markdown
---
description: Review PRs from URLs with structured issue and code analysis
argument-hint: "<PR-URL>"
---
[Template body]
```

**Argument Hint Format:**
- `<angle brackets>` = required argument
- `[square brackets]` = optional argument
- Displayed in autocomplete dropdown, e.g., `→ pr <PR-URL> — Review PRs…`

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/prompt-templates.ts:104–133
export interface PromptTemplate {
  name: string;
  description: string;
  argumentHint?: string;  // Displayed in UI
  content: string;
  sourceInfo: SourceInfo;
  filePath: string;
}

// Lines 112–119: auto-derive description from first non-empty line
if (!description) {
  const firstLine = body.split("\n").find((line) => line.trim());
  if (firstLine) {
    description = firstLine.slice(0, 60);
    if (firstLine.length > 60) description += "...";
  }
}
```

### SP-08: Prompt Template Argument Substitution

**Finding:** Templates support seven argument substitution patterns: `$1`, `$2` (positional); `$@` and `$ARGUMENTS` (all args joined); `${@:N}` and `${@:N:L}` (bash-style slicing).

**Substitution Grammar:**
- `$1`, `$2`, … → positional args (1-indexed)
- `$@` or `$ARGUMENTS` → all args joined with spaces
- `${@:N}` → args from position N to end (1-indexed)
- `${@:N:L}` → L args starting at position N

**Execution:**
1. Parse `/template arg1 "arg 2" arg3` into tokens
2. Substitute `$1` → `arg1`, `$2` → `arg 2`, etc.
3. Expand template content with substituted args

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/prompt-templates.ts:68–102
export function substituteArgs(content: string, args: string[]): string {
  // $1, $2, ... first (before wildcards)
  result = result.replace(/\$(\d+)/g, (_, num) => {
    const index = parseInt(num, 10) - 1;
    return args[index] ?? "";
  });
  // ${@:start:length} (bash-style slicing)
  result = result.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_, startStr, lengthStr) => {
    let start = parseInt(startStr, 10) - 1;
    if (start < 0) start = 0;
    if (lengthStr) {
      const length = parseInt(lengthStr, 10);
      return args.slice(start, start + length).join(" ");
    }
    return args.slice(start).join(" ");
  });
  // $ARGUMENTS and $@
  const allArgs = args.join(" ");
  result = result.replace(/\$ARGUMENTS/g, allArgs);
  result = result.replace(/\$@/g, allArgs);
  return result;
}
```

### SP-09: Prompt Template Invocation in Interactive Mode

**Finding:** Templates are expanded at prompt-entry time by matching `/name` prefix and substituting arguments. Expansion happens before sending to the model; failure to match returns original text.

**Invocation Syntax:**
```
/review                    # Expands review.md content
/component Button          # Expands with $1 = "Button"
/pr "https://…" "params"   # Expands with $1 = "https://…", $2 = "params"
```

**Expansion Logic:**
- Check if text starts with `/`
- Extract template name (space-delimited prefix)
- Extract args string (space-delimited suffix)
- Parse args respecting quoted strings (bash-style)
- Look up template by name in loaded templates
- Substitute args in template content
- Return expanded content (or original if no match)

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/prompt-templates.ts:282–296
export function expandPromptTemplate(text: string, templates: PromptTemplate[]): string {
  if (!text.startsWith("/")) return text;
  const spaceIndex = text.indexOf(" ");
  const templateName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
  const argsString = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);
  const template = templates.find((t) => t.name === templateName);
  if (template) {
    const args = parseCommandArgs(argsString);
    return substituteArgs(template.content, args);
  }
  return text;
}
```

---

## 3. Themes

**Implementation:** `/packages/coding-agent/src/modes/interactive/theme/theme.ts` (1142 lines)  
**Schema:** `theme-schema.json`  
**Docs:** `/packages/coding-agent/docs/themes.md`  
**Built-in:** `dark.json`, `light.json`

### SP-10: Theme Discovery and Built-in Defaults

**Finding:** Themes are discovered from `.json` files in designated directories. Two built-in themes (`dark`, `light`) are always available; pi auto-detects terminal background on first run.

**Built-in Themes:**
- `dark` → Dark theme (loaded from `src/modes/interactive/theme/dark.json`)
- `light` → Light theme (loaded from `src/modes/interactive/theme/light.json`)

**Search Paths:**
1. Built-in: `dark`, `light` (hardcoded, always available)
2. Global user: `~/.pi/agent/themes/*.json`
3. Project: `.pi/themes/*.json`
4. Packages: `themes/` directories (non-recursive scan)
5. Settings array: `themes` key
6. CLI: `--theme <path>` (repeatable)

**Auto-Detection:**
- First run: pi detects terminal background (light vs. dark) via terminal color query
- Falls back to `dark` if detection fails

**Code Evidence:**
```typescript
// /packages/coding-agent/src/modes/interactive/theme/theme.ts:161–186
function detectColorMode(): ColorMode {
  const colorterm = process.env.COLORTERM;
  if (colorterm === "truecolor" || colorterm === "24bit") {
    return "truecolor";
  }
  if (process.env.WT_SESSION) return "truecolor";  // Windows Terminal
  // ... fallback logic ...
}
```

### SP-11: Theme JSON Schema and Color Tokens

**Finding:** Themes are JSON documents with strict schema: all 51 color tokens must be defined. Colors use four formats: hex (`#rrggbb`), 256-color palette index (0–255), variable references (strings referencing `vars` entries), or empty string (terminal default).

**Color Token Categories (51 total):**
- **Core UI (11):** accent, border, borderAccent, borderMuted, success, error, warning, muted, dim, text, thinkingText
- **Backgrounds & Content (11):** selectedBg, userMessageBg, userMessageText, customMessageBg, customMessageText, customMessageLabel, toolPendingBg, toolSuccessBg, toolErrorBg, toolTitle, toolOutput
- **Markdown (10):** mdHeading, mdLink, mdLinkUrl, mdCode, mdCodeBlock, mdCodeBlockBorder, mdQuote, mdQuoteBorder, mdHr, mdListBullet
- **Tool Diffs (3):** toolDiffAdded, toolDiffRemoved, toolDiffContext
- **Syntax Highlighting (9):** syntaxComment, syntaxKeyword, syntaxFunction, syntaxVariable, syntaxString, syntaxNumber, syntaxType, syntaxOperator, syntaxPunctuation
- **Thinking Level Borders (6):** thinkingOff, thinkingMinimal, thinkingLow, thinkingMedium, thinkingHigh, thinkingXhigh
- **Bash Mode (1):** bashMode

**Color Value Formats:**
```json
{
  "accent": "#00aaff",           // Hex RGB
  "border": 242,                 // 256-color palette index
  "borderAccent": "primary",     // Variable reference (from vars)
  "text": ""                     // Terminal default
}
```

**Schema Evidence:**
```typescript
// /packages/coding-agent/src/modes/interactive/theme/theme.ts:16–94
const ColorValueSchema = Type.Union([
  Type.String(),  // hex "#ff0000", var ref "primary", or empty ""
  Type.Integer({ minimum: 0, maximum: 255 }),  // 256-color index
]);

const ThemeJsonSchema = Type.Object({
  $schema: Type.Optional(Type.String()),
  name: Type.String(),
  vars: Type.Optional(Type.Record(Type.String(), ColorValueSchema)),
  colors: Type.Object({
    accent: ColorValueSchema,
    border: ColorValueSchema,
    // ... 49 more colors ...
  }),
  export: Type.Optional(Type.Object({
    pageBg: Type.Optional(ColorValueSchema),
    cardBg: Type.Optional(ColorValueSchema),
    infoBg: Type.Optional(ColorValueSchema),
  })),
});
```

### SP-12: Theme Hot-Reload and Color Mode Detection

**Finding:** Themes support hot-reload when the active theme file is edited. Pi detects color capability (truecolor vs. 256-color) at startup and converts hex colors to nearest 256-color index when needed.

**Color Mode Detection (priority order):**
1. Truecolor if `COLORTERM=truecolor` or `COLORTERM=24bit`
2. Truecolor if `WT_SESSION` (Windows Terminal)
3. Truecolor for most modern terminals (iTerm2, Kitty, WezTerm, VS Code)
4. 256-color for limited terminals: dumb, linux, Apple_Terminal, GNU screen
5. Default: assume truecolor

**Hex to 256-color Conversion:**
- Convert hex → RGB
- Find nearest color in 6×6×6 RGB cube (16–231) using Euclidean distance
- Find nearest grayscale (232–255) using perceived luminance
- Return minimum distance color

**Hot-Reload Mechanism:**
- When theme file changes on disk, reload color tokens
- Only if file is currently active theme
- No UI restart required

**Code Evidence:**
```typescript
// /packages/coding-agent/src/modes/interactive/theme/theme.ts:242–273
function rgbTo256(r: number, g: number, b: number): number {
  // Find closest color in the 6x6x6 cube
  const rIdx = findClosestCubeIndex(r);
  const gIdx = findClosestCubeIndex(g);
  const bIdx = findClosestCubeIndex(b);
  const cubeIndex = 16 + 36 * rIdx + 6 * gIdx + bIdx;
  
  // Find closest grayscale
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const grayIdx = findClosestGrayIndex(gray);
  const grayIndex = 232 + grayIdx;
  
  // Return minimum distance
  return grayDist < cubeDist ? grayIndex : cubeIndex;
}
```

---

## 4. Pi Packages

**Implementation:** `/packages/coding-agent/src/core/package-manager.ts` (2429 lines)  
**CLI:** `/packages/coding-agent/src/package-manager-cli.ts`  
**Resource Loader:** `/packages/coding-agent/src/core/resource-loader.ts`  
**Docs:** `/packages/coding-agent/docs/packages.md`

### SP-13: Package Source Types and Resolution

**Finding:** Pi packages are installed from three source types: npm (versioned, global or `.pi/npm/`), git (ref-pinned, cloned to `.pi/git/<host>/<path>`), and local paths (no copying, resolved against settings file directory).

**Source Format Examples:**
```bash
npm:@scope/pkg@1.2.3              # npm (versioned → pinned)
npm:pkg                            # npm (unpinned)
git:github.com/user/repo@v1        # git shorthand (ref → pinned)
https://github.com/user/repo       # HTTPS URL
ssh://git@github.com/user/repo     # SSH URL
git:git@github.com:user/repo@v1    # SSH shorthand
/absolute/path/to/package          # Local absolute path
./relative/path/to/package         # Local relative path
```

**Install Destination:**
- **npm global:** `npm install -g npm:@scope/pkg`
- **npm project:** `.pi/npm/@scope/pkg/` (via `npm install --prefix .pi/npm`)
- **git global:** `~/.pi/agent/git/<host>/<path>/`
- **git project:** `.pi/git/<host>/<path>/`
- **local:** Resolved path, no copying

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/package-manager.ts:1370–1393
private parseSource(source: string): ParsedSource {
  if (source.startsWith("npm:")) {
    const spec = source.slice("npm:".length).trim();
    const { name, version } = this.parseNpmSpec(spec);
    return {
      type: "npm",
      spec,
      name,
      pinned: Boolean(version),
    };
  }
  if (isLocalPath(source)) {
    return { type: "local", path: source };
  }
  const gitParsed = parseGitUrl(source);
  if (gitParsed) {
    return gitParsed;
  }
  return { type: "local", path: source };
}
```

### SP-14: Package Manifest Format and Resource Declarations

**Finding:** Packages declare resources in `package.json` under the `pi` key. Manifest entries are arrays of glob patterns with support for exclusions (`!pattern`) and overrides (`+path` force-include, `-path` force-exclude). Conventional directories (`extensions/`, `skills/`, `prompts/`, `themes/`) are auto-discovered if no manifest exists.

**Manifest Schema:**
```json
{
  "name": "my-package",
  "pi": {
    "extensions": ["./extensions", "!extensions/legacy.ts"],
    "skills": ["./skills"],
    "prompts": ["./prompts/review.md"],
    "themes": ["+themes/legacy.json", "-themes/deprecated.json"]
  }
}
```

**Convention Directories (auto-discovery when no `pi` manifest):**
- `extensions/` → loads `.ts` and `.js` files (smart discovery: looks for `index.ts/js` in subdirs)
- `skills/` → loads `SKILL.md` directories and top-level `.md` files
- `prompts/` → loads `.md` files (non-recursive)
- `themes/` → loads `.json` files (non-recursive)

**Pattern Syntax:**
- Plain pattern → include matching (glob or fixed path)
- `!pattern` → exclude matching
- `+path` → force-include exact path (overrides exclusions)
- `-path` → force-exclude exact path (even if force-included)

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/package-manager.ts:147–152
interface PiManifest {
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
}

// /packages/coding-agent/src/core/package-manager.ts:517–525
function readPiManifestFile(packageJsonPath: string): PiManifest | null {
  try {
    const content = readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content) as { pi?: PiManifest };
    return pkg.pi ?? null;
  } catch {
    return null;
  }
}
```

### SP-15: Package Installation and Persistence Flow

**Finding:** `pi install <source>` clones/downloads the package, runs `npm install` if `package.json` exists, and does NOT persist to settings. `pi installAndPersist` (or `pi install && pi config`) adds the source to settings, enabling auto-load on startup.

**Installation Flow:**
1. Parse source (npm/git/local)
2. If npm: `npm install -g npm:pkg` (user) or `npm install --prefix .pi/npm pkg` (project)
3. If git: `git clone <url> .pi/git/<host>/<path>/` (user) or `.pi/git/` (project)
4. If git with `package.json`: run `npm install` in cloned directory
5. Return (do not persist to settings)

**Persistence (manual or via CLI):**
```bash
pi install npm:@foo/bar        # Install only
pi install npm:@foo/bar && pi config add-source npm:@foo/bar  # Install + persist
# OR
pi installAndPersist npm:@foo/bar  # One-liner (if exposed in API)
```

**Settings Persistence:**
- User scope: `~/.pi/agent/settings.json` (default)
- Project scope: `.pi/settings.json` (with `-l` or `--local`)

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/package-manager.ts:944–970
async install(source: string, options?: { local?: boolean }): Promise<void> {
  const parsed = this.parseSource(source);
  const scope: SourceScope = options?.local ? "project" : "user";
  await this.withProgress("install", source, `Installing ${source}...`, async () => {
    if (parsed.type === "npm") {
      await this.installNpm(parsed, scope, false);
      return;
    }
    if (parsed.type === "git") {
      await this.installGit(parsed, scope);
      return;
    }
    // ... local path handling ...
  });
}

async installAndPersist(source: string, options?: { local?: boolean }): Promise<void> {
  await this.install(source, options);
  this.addSourceToSettings(source, options);
}
```

### SP-16: Package Update Mechanism and Version Pinning

**Finding:** `pi update` checks all non-pinned packages for newer versions and updates them. Pinned packages (npm specs with version, git URLs with ref) are skipped. Update runs concurrently up to 4 at a time; offline mode (`PI_OFFLINE=1`) disables all network operations.

**Pinning Rules:**
- **npm:** `npm:pkg@1.2.3` is pinned; `npm:pkg` is unpinned
- **git:** Any URL with `@ref` is pinned; URLs without ref are unpinned
- **local:** Always pinned (never checked for updates)

**Update Logic:**
1. Iterate packages from settings (project + user, deduped)
2. For each unpinned npm package: compare installed version with `npm view <pkg> version --json`
3. For each unpinned git package: compare local HEAD with remote HEAD (`git ls-remote`)
4. Batch unpinned npm updates per scope (user or project)
5. Run `npm install <pkg>@latest --prefix` in batch
6. Pull git packages individually: `git fetch && git checkout <remoteHead>`

**Concurrency:**
- `UPDATE_CHECK_CONCURRENCY = 4`: Check up to 4 packages in parallel
- `GIT_UPDATE_CONCURRENCY = 4`: Pull up to 4 git packages in parallel

**Offline Mode:**
- `PI_OFFLINE=1` or `PI_OFFLINE=true`: Skip all network operations, return immediately

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/package-manager.ts:1086–1100
private async shouldUpdateNpmSource(source: NpmSource, scope: InstalledSourceScope): Promise<boolean> {
  const installedPath = this.getNpmInstallPath(source, scope);
  const installedVersion = existsSync(installedPath) ? this.getInstalledNpmVersion(installedPath) : undefined;
  if (!installedVersion) {
    return true;
  }
  try {
    const latestVersion = await this.getLatestNpmVersion(source.name);
    return latestVersion !== installedVersion;
  } catch {
    return true;
  }
}
```

### SP-17: Package Filtering and Resource Enabling/Disabling

**Finding:** Packages support granular resource filtering via `settings.json` object form. Filters apply patterns (glob, exclusions, force-includes/excludes) to narrow what loads from a package. Enabled/disabled state is tracked per-resource per-package.

**Filtering Syntax in Settings:**
```json
{
  "packages": [
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"],
      "themes": ["+themes/legacy.json", "-themes/deprecated.json"]
    }
  ]
}
```

**Filter Semantics:**
- Omit key → load all of that resource type from package
- `[]` → load none of that resource type
- Plain pattern → include matching
- `!pattern` → exclude matching
- `+path` → force-include exact path (overrides exclusions)
- `-path` → force-exclude exact path (even if matched by force-include)

**Enable/Disable State:**
- Resolved at startup: package manager loads enabled resources
- `pi config` command: toggle enable/disable per-resource (expected API, needs verification)

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/package-manager.ts:709–755
function applyPatterns(allPaths: string[], patterns: string[], baseDir: string): Set<string> {
  // Step 1: Apply includes (or all if no includes)
  let result: string[];
  if (includes.length === 0) {
    result = [...allPaths];
  } else {
    result = allPaths.filter((filePath) => matchesAnyPattern(filePath, includes, baseDir));
  }
  
  // Step 2: Apply excludes
  if (excludes.length > 0) {
    result = result.filter((filePath) => !matchesAnyPattern(filePath, excludes, baseDir));
  }
  
  // Step 3: Force-include (add back from allPaths, overriding exclusions)
  if (forceIncludes.length > 0) {
    for (const filePath of allPaths) {
      if (!result.includes(filePath) && matchesAnyExactPattern(filePath, forceIncludes, baseDir)) {
        result.push(filePath);
      }
    }
  }
  
  // Step 4: Force-exclude (remove even if included or force-included)
  if (forceExcludes.length > 0) {
    result = result.filter((filePath) => !matchesAnyExactPattern(filePath, forceExcludes, baseDir));
  }
  
  return new Set(result);
}
```

### SP-18: Package Deduplication and Scope Precedence

**Finding:** When the same package appears in both project and global settings, project scope wins. Package identity is determined by normalized key: npm by name, git by normalized host/path (SSH and HTTPS treated as identical), local by absolute path.

**Deduplication Rules:**
- **Identity Key:**
  - npm: `npm:<name>` (e.g., `npm:@scope/pkg`)
  - git: `git:<host>/<path>` (normalized, e.g., `git:github.com/user/repo`)
  - local: `local:<absolute-path>`
- **Precedence:** Project wins over user when identity matches
- **Symlinks:** Canonical path used to avoid duplicate loads

**Example:**
```json
// global settings
{ "packages": ["npm:@foo/bar@1.0.0"] }

// project settings
{ "packages": ["npm:@foo/bar"] }

// Result: project @foo/bar (unpinned) is used; global pinned version is ignored
```

**Code Evidence:**
```typescript
// /packages/coding-agent/src/core/package-manager.ts:1606–1620
private getPackageIdentity(source: string, scope?: SourceScope): string {
  const parsed = this.parseSource(source);
  if (parsed.type === "npm") {
    return `npm:${parsed.name}`;
  }
  if (parsed.type === "git") {
    // Use host/path for identity to normalize SSH and HTTPS
    return `git:${parsed.host}/${parsed.path}`;
  }
  if (scope) {
    const baseDir = this.getBaseDirForScope(scope);
    return `local:${this.resolvePathFromBase(parsed.path, baseDir)}`;
  }
  return `local:${this.resolvePath(parsed.path)}`;
}
```

---

## Comparison: When to Author Each Surface

| Surface | Ideal For | Example Use Case |
|---------|-----------|------------------|
| **Skills** | Reusable workflows, setup instructions, reference docs | PDF processing, web search, code review checklist |
| **Prompt Templates** | Workflow snippets, parameterized prompts | PR review template with URL param, component generator |
| **Themes** | Team-wide color standards, accessibility tuning | Nord-based dark theme, high-contrast light theme |
| **Pi Packages** | Bundling all of the above + extensions for distribution | Anthropic skills + themes + Claude Code extensions as one npm package |

**Decision Tree:**
1. Single reusable prompt? → Prompt template (`.md`)
2. Multi-file capability with instructions? → Skill (SKILL.md + scripts)
3. Color palette? → Theme (`.json`)
4. Need to distribute all of above + code extensions? → Pi package (`package.json` manifest)

---

## Summary

Pi's four extension surfaces provide graduated complexity and distribution vectors:

1. **Skills** are capability packages with instruction discovery; the agent decides to load them based on description.
2. **Prompt templates** are invocation-driven workflow snippets that expand at prompt-entry time.
3. **Themes** are color palettes with hot-reload and automatic terminal capability detection.
4. **Pi packages** bundle all three (and TypeScript extensions) for npm/git distribution, with granular filtering and deduplication.

All surfaces support local, user-global, and project-local scopes. Project settings override user settings. Packages dedupe by identity, with project precedence. Resources can be filtered per-package, and versioning (npm) or refs (git) control update eligibility.

---

## Finding Count

Total: **18 findings** (SP-01 through SP-18)
- Skills: 5 findings (SP-01–SP-05)
- Prompt Templates: 4 findings (SP-06–SP-09)
- Themes: 3 findings (SP-10–SP-12)
- Pi Packages: 6 findings (SP-13–SP-18)

