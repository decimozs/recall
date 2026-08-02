<img width="2850" height="1011" alt="github-banner" src="https://github.com/user-attachments/assets/97f62ffb-0259-4ac6-8589-7e1f493b1eac" />

# Recall

Recall is a self-contained macOS learning desktop app with an agent-skill workflow for turning selected Notion notes into quizzes and flashcards, studying them offline, and tracking progress over time. An agent harness such as Claude Code, Codex, OpenCode, or another compatible runner reads selected Notion sources through Notion MCP, publishes study material to the local Recall app, and synchronizes completed attempts and roadmap progress back to Notion.

Recall is desktop-only for now. There is no browser runtime, Docker runtime, or PostgreSQL runtime in this project.

> **Platform warning:** Recall currently supports macOS only. Linux and Windows support are planned for a future update and are not available yet.

## Features

- Source-grounded quizzes with single-answer multiple choice and true/false questions.
- Randomized question and choice order with broad concept coverage and explanations.
- Source-grounded flashcard sets with front/back review and known or needs-review tracking.
- Zen mode for quizzes and flashcards with progress navigation, warning dialogs, submit confirmation, and summaries.
- Per-attempt score, answers, retries, duration, and recent activity tracking.
- Offline study for quizzes and flashcards already stored locally.
- Online agent-harness and Notion MCP generation and synchronization when connectivity is available.
- Local SQLite storage in the macOS application data directory.

## Agent skills

- `recall-roadmap` creates structured learning areas, concept notes, learning tasks, views, and icons from a source.
- `recall-quiz` generates validated quizzes with strict source boundaries, concept coverage, explanations, and randomized choices.
- `recall-flashcards` generates and publishes source-grounded flashcard sets and tracks reviews.
- `recall-track` synchronizes Recall attempts, task progress, and queued repairs with Notion.

## Agent-harness compatibility

The Recall skills are designed to be shared across agent harnesses. Each skill is defined by a `SKILL.md` file under `.agents/skills/`, so a harness can discover, copy, or link these skills according to its own global-skill convention.

The workflow is compatible with Claude Code, Codex, OpenCode, and other harnesses that can:

- Read Markdown-based agent skills.
- Access the Notion MCP server for source retrieval and synchronization.
- Send authenticated HTTP requests to the local Recall API.
- Keep secrets in the harness environment rather than in the repository.

The optional `agents/openai.yaml` files provide metadata for OpenAI-compatible tooling; other harnesses can use the `SKILL.md` instructions without them. Recall does not require a specific agent vendor, and the desktop app does not run an agent by itself.

## macOS setup

Apple signing and notarization are intentionally deferred. Local builds are unsigned.

From the project folder:

```bash
bun install --cwd desktop/ui
bun install --cwd desktop
bun install --cwd backend/migrate
bun run --cwd desktop build:sidecars
bun run --cwd desktop build
```

The unsigned DMG is produced at:

```text
desktop/src-tauri/target/release/bundle/dmg/
```

For local development:

```bash
bun run --cwd desktop dev
```

The packaged app starts its local API and SQLite adapter automatically. It stores the database and a protected `connection.json` manifest in the macOS application data directory. The configured agent harness uses that manifest for authenticated publish and synchronization calls.

### Agent runtime

Recall skills operate against the running desktop app rather than a separate web or Docker service:

- Local API: `http://127.0.0.1:3000`
- Connection manifest: `~/Library/Application Support/com.decimozs.recall/connection.json`
- Database source of truth: the app-managed SQLite database, accessed through the local API
- Authentication: the per-install `agent_key` from the connection manifest, sent as `X-Agent-Key`

Skills never edit the SQLite file directly. If the app or Notion is offline, saved quizzes and flashcards remain available for study; generation and Notion synchronization stay queued until connectivity returns.

## Preserving existing PostgreSQL data

`backend/migrate` is retained only as a one-time offline import utility. It copies workspaces, sources, quizzes, questions, attempts, answers, flashcards, review history, task results, sync requests, and queued generation requests into the local SQLite database while preserving IDs and timestamps.

Run a non-mutating check first:

```bash
DATABASE_URL=postgres://... \
bun run --cwd backend/migrate migrate --dry-run
```

Then import into the local SQLite database:

```bash
DATABASE_URL=postgres://... \
bun run --cwd backend/migrate migrate
```

The importer is upsert-based and does not delete local data by default. `--replace` requires the additional explicit environment variable `RECALL_ALLOW_REPLACE=1`.

## Architecture

```mermaid
flowchart LR
  User[User] --> Desktop[Recall macOS app]
  Desktop --> UI[Desktop UI]
  Desktop --> API[Local Bun API sidecar]
  API --> SQLite[Local SQLite database]
  Agent[Agent harness] -->|Notion MCP| Notion[Notion workspace]
  Agent -->|publish and sync| API
```

Generation and Notion synchronization require an online agent-harness and Notion MCP connection. Offline mode is intentionally read-only for generation: users can study saved quizzes and flashcards and retain local progress until connectivity returns.

## Contributing

See [CONTRIBUTIONS.md](CONTRIBUTIONS.md) for development checks, agent-skill changes, and repository safety guidelines.

## License

Recall is available under the [MIT License](LICENSE).

`/docs/` is intentionally ignored and is not part of the repository. Do not commit `.env`, credentials, database files, build artifacts, or sidecar binaries.
