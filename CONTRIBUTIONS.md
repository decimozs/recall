# Contributing to Recall

Recall is currently a macOS-only desktop application. Contributions should preserve the desktop workflow, offline study behavior, local SQLite data, and agent-harness compatibility.

## Before opening a change

- Keep secrets in local environment files; never commit `.env`, credentials, Notion tokens, or database files.
- Keep `/docs/` out of the repository.
- Use the local Recall app API and connection manifest for agent integrations. Do not edit the SQLite database directly.
- Update the README and relevant `SKILL.md` files when behavior, paths, or agent-harness requirements change.

## Validation

Run the checks relevant to the change:

```bash
bun run --cwd desktop/ui build
bun run --cwd desktop build:sidecars
```

For migration changes, use the non-mutating dry-run first:

```bash
bun run --cwd backend/migrate migrate --dry-run
```

Keep commits focused and describe user-visible or architectural changes clearly.
