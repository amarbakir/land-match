# AGENTS.md

Rules for Claude sessions running autonomously (background agents, worktree agents, headless sessions). Interactive sessions should also follow these but may use judgment on escalation.

## Autonomy policy

**Can do without asking:**

- Read any file, explore codebase, run tests/lint
- Write and edit code in worktrees
- Create commits with conventional commit messages
- Create draft PRs from worktree branches
- Run `pnpm install` after dependency changes
- Generate Drizzle migrations from schema changes

**Must ask before:**

- Merging or closing PRs
- Force-pushing or rebasing shared branches
- Adding/removing/upgrading dependencies
- Modifying database schema (adding tables, columns, changing types)
- Changing CI/CD, infra, or deployment config
- Any action that affects production or shared environments
- Deleting branches, files outside your worktree, or stashing others' work

**Never do:**

- Work directly on `main` — always use a worktree or feature branch
- Modify protected files: `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.env*`, `pnpm-lock.yaml`
- Commit secrets, credentials, or API keys
- Run destructive commands (`rm -rf`, `git reset --hard`, `git clean -f`)
- Push to `main` or `master`
- Skip git hooks (`--no-verify`)
- Install global packages

## Worktree workflow

Background agents **must** use git worktrees for isolation:

1. Create worktree: `git worktree add .claude/worktrees/<branch-name> -b <branch-name>`
2. Work entirely within the worktree directory
3. Commit with conventional format: `type(scope): description`
4. Push branch and create draft PR when work is complete
5. Worktree cleanup happens after merge

Branch naming: `agent/<type>/<short-description>` (e.g., `agent/feat/add-auth`, `agent/fix/query-bug`)

## Quality gates

Before claiming work is complete or creating a PR:

1. **Lint passes**: `pnpm --filter <affected-packages> lint`
2. **Tests pass**: `pnpm --filter <affected-packages> test:run`
3. **Build succeeds**: `pnpm --filter <affected-packages> build` (for server/api/db)
4. **No type errors**: verified by the lint step (includes `tsc --noEmit`)

If any gate fails, fix the issue. Do not create PRs with known failures.

## Commit conventions

Format: `type(scope): short description`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
Scopes: `frontend`, `server`, `enrichment`, `scoring`, `api`, `db`, `config`

Examples:

- `feat(server): add user registration endpoint`
- `fix(frontend): prevent double-tap on submit`
- `test(server): add integration tests for auth flow`

Do not include Co-Authored-By lines in commit messages.

## Escalation rules

Message the human when:

- A quality gate fails after 2 fix attempts
- The task requires a decision not covered by existing plans/specs
- You discover a security vulnerability
- A dependency conflict or breaking change blocks progress
- The scope of work significantly exceeds the original task description
- You need to modify a protected file

Do **not** message for:

- Routine progress updates (use PR descriptions instead)
- Questions answerable from docs/plans/code
- Minor lint/test failures you can fix yourself

## Scope boundaries

- Stay within the task described in your prompt or the referenced plan
- Do not refactor adjacent code, add "nice to have" features, or clean up unrelated files
- If you find a bug or tech debt outside your scope, note it in your PR description under a "Discovered issues" section — do not fix it
- Consult `docs/plans/` for existing designs before creating your own approach

## Context loading

At session start:

1. Read `CLAUDE.md` for project orientation
2. Read this file (`AGENTS.md`) for behavioral rules
3. Read the specific plan or task description you were given
4. Explore relevant code only after understanding the above

## PR template

When creating PRs, use this structure:

```
## Summary
- What was done and why (1-3 bullets)

## Changes
- File-by-file or module-level summary

## Testing
- What was tested and how
- Test commands run and results

## Discovered issues (if any)
- Unrelated problems found during this work
```

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Quick Start

```bash
bd ready --json                          # Check for ready work
bd create "title" -d "description" -t bug|feature|task -p 0-4 --json  # Create issue
bd update <id> --claim --json            # Claim work
bd close <id> --reason "Completed"       # Complete work
```

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow

1. `bd ready` — check for unblocked issues
2. `bd update <id> --claim` — claim atomically
3. Work, test, commit
4. `bd close <id> --reason "Done"` — close after commit

## Landing the Plane (Session Completion)

**When ending a work session**, complete ALL steps:

1. **File issues for remaining work** via `bd create`
2. **Run quality gates** (if code changed)
3. **Update issue status** — close finished work
4. **PUSH TO REMOTE**:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Verify** — all changes committed AND pushed
