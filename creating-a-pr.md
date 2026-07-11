# Creating a PR on ViBe

A short, runnable guide. Your local setup is already done — this is only
the pull-request mechanics. Written specifically for the way we work:
multi-session features, dirty working trees, and selective staging.

---

## Before you start — preflight

Run this and read the output:

```
git status
```

You will likely see three categories:

| Category | What it means |
|---|---|
| **Untracked files** (`??`) | New work — files you (or a prior session) created |
| **Modified tracked files** (` M` / `M `) | Files that were already in git and have local changes |
| **Deleted tracked files** (` D`) | Files removed locally but still in git |

On ViBe, it is **normal** to see files from previous sessions sitting in
the tree. Don't panic. Don't blanket-add them.

> **Mental model:** your working tree is a workshop, not a clean room.
> Your job in step 3 is to pick up *only* the tools that belong to the
> PR you're about to open, and leave the rest where they are.

---

## The 5 commands

### 1. Branch from `main` (don't switch from current branch carelessly)

```
git checkout main
git pull origin main
git checkout -b fix/<feature>-<YYYY-MM-DD>
```

Branch name conventions (Conventional Commits style):

| Prefix | Use when |
|---|---|
| `feat/<feature>` | New functionality |
| `fix/<feature>` | Bug fix or regression |
| `chore/<feature>` | Cleanup, docs, non-functional |
| `refactor/<feature>` | Restructure with no behaviour change |

> **If `git checkout main` fails** because the working tree has
> uncommitted changes — **stop.** Don't force. See the rollback table at
> the bottom.

### 2. Build your exact file list

In a scratch buffer (or just a comment block in the terminal), write
down the full paths of every file this PR should include. **Only files
related to this feature.** Example for the spaced-repetition work:

```
frontend/src/app/pages/student/ReviewSession.tsx
frontend/src/app/pages/student/RetentionDashboard.tsx
frontend/src/app/pages/student/spaced-repetition-api.ts
frontend/src/app/pages/student/spaced-repetition-hooks.ts
frontend/src/app/pages/student/spaced-repetition.types.ts
spaced-repetition.md
feature-context.md
scripts/.trash/tsc-after-cleanup.txt
scripts/.trash/tsc-after-empty-state.txt
```

### 3. Stage one file at a time — never blanket-add

```
git add path/to/file1
git add path/to/file2
git add path/to/file3
# ... and so on, one per file
```

**Never** `git add .` or `git add -A`. On this project those commands
will pull in unrelated work from prior sessions.

### 4. Verify what you're about to commit

```
git diff --cached --stat
```

This prints one line per staged file with a line-count summary. Read it.

- ✅ **Good:** every line is a file from your list.
- ❌ **Bad:** an unrelated file snuck in. Fix it:

```
git restore --staged <unrelated-file>
```

…then re-run `git diff --cached --stat` until the list is clean.

### 5. Commit, push, open the PR

```
git commit -m "fix(<feature>): <one-line summary of what and why>"
git push -u origin <branch-name>
```

Then open the PR — either via the GitHub web UI (paste the title + body
into the form) or via `gh` CLI:

```
gh pr create --base main --title "<title>" --body-file pr-body.md
```

(`--body-file` reads the body from a file, which is cleaner for long
PR descriptions than `--body "..."`.)

---

## PR title conventions

Conventional Commits style. Match the branch prefix:

- `feat(spaced-repetition): add retention dashboard`
- `fix(spaced-repetition): empty-state polish for new students`
- `chore(docs): add mentor-facing spaced-repetition summary`
- `fix(spaced-repetition): tsc-cleanup + empty-state branching`

Keep it under ~70 chars so it renders in full in the PR list.

---

## PR body — the sections a traditional PR has

1. **Summary** — 2–3 sentences. What changed, and why.
2. **Changes** — table of files, grouped (frontend / backend / docs /
   tests).
3. **Verification** — exact commands you ran + their result. Include the
   filter string if you used one (`grep -E 'foo|bar'` etc.).
4. **Out of scope** — what is intentionally **not** in this PR.
5. **Risk** — low / medium / high + one-line justification.
6. **References** — issue link, internal docs.

For a worked example of a real PR body, see the spaced-repetition PR
opened 2026-07-08 — copy its structure and trim.

> **Mentors read 5 PRs a week.** Respect their time: tight body, clear
> verification, honest "out of scope."

---

## Common pitfalls (from real ViBe sessions)

| Pitfall | What happens | Fix |
|---|---|---|
| Dirty tree from prior session | `git status` shows files you don't recognise | **Don't stage them.** Branch from `main` and start clean. |
| `git add .` | Pulls in unrelated work | Use explicit file paths instead. Always. |
| Wrong base branch | PR shows commits you didn't write | `git log main..HEAD` to verify before pushing. If wrong, edit base on GitHub side after PR creation. |
| Forgot to pull main | Branch based on stale main, conflicts on merge | Always `git pull origin main` between step 1 and `git checkout -b`. |
| `.trash/` archives missing | `git status` doesn't list them | They're not untracked — they're already in the tree; explicit `git add` brings them in. |
| PR title too long | Wraps awkwardly in PR list | Aim ≤70 chars. |

---

## If something goes wrong

| Problem | Recovery |
|---|---|
| "I staged the wrong files" | `git restore --staged <file>` then re-verify with `git diff --cached --stat` |
| "I committed the wrong files" (not pushed) | `git restore --staged <file>` → `git commit --amend` |
| "I pushed and it's wrong" | Open the PR as a draft, fix in a follow-up commit. **Don't force-push.** |
| "Branch based on wrong base" | Edit base on GitHub side (`gh pr edit --base main <num>` or via the web UI) |
| "Working tree is corrupted" | Stop. Run `git status > safety-net.txt` then come to team chat. `git reflog` retains ~30 days of state — almost everything is recoverable. |

---

## Related

- `spaced-repetition.md` — example of a mentor-ready feature doc
- `feature-context.md` — example of an implementation-log style