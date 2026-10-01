# Agent guide

How to work in this repository when several agents (or people) are active at
the same time: every task gets its own git worktree, and `main` is never
checked out anywhere except in the primary, pull-only worktree.

## Layout

| Directory | Role |
| --- | --- |
| `G:\Terra\Terra-Tools` | Primary worktree, hosts `main`. **Pull-only**: no commits, no feature branches here (enforced by a `pre-commit` hook). |
| `G:\Terra\Terra-Tools-<topic>` | One linked worktree per task, on branch `feat/<topic>`. |

Branches are shared by all worktrees (same `.git`), so a branch checked out in
one worktree is safe from interference in the others.

## Starting a task

```sh
scripts/new-worktree.sh <topic>
```

The helper

1. fast-forwards `main` in the primary worktree (`git pull --ff-only`),
2. derives `feat/<topic>` from the freshly pulled `origin/main`,
3. creates the sibling worktree `G:\Terra\Terra-Tools-<topic>`,
4. copies the untracked `.env` into it (only the primary worktree has one).

Then work inside the new directory:

- A fresh worktree is a fresh checkout: run `npm install` in `frontend/`.
- Give parallel docker-compose stacks their own ports — the defaults are
  `5001` (API), `8080` (frontend), `5015` — shift them per worktree.

## Finishing a task

```sh
git push -u origin feat/<topic>
gh pr create --base main
```

PRs merge into `main`; the primary worktree only ever receives them via
`git pull`.

## Cleaning up after a merged PR

```sh
git worktree remove ../Terra-Tools-<topic>
git branch -d feat/<topic>
```

## One-time setup per clone

The pull-only guard ships at `scripts/hooks/pre-commit`; install it with:

```sh
cp scripts/hooks/pre-commit .git/hooks/pre-commit
```
