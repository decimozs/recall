---
name: recall-roadmap
description: Create and maintain structured learning roadmaps in Notion for the self-contained Recall macOS app from source pages, databases, modules, or user-provided topics. Use when the user wants a study plan with automatically grouped concepts, task tracking, concept notes, table/Kanban views, icons, and Recall quiz coverage.
---

# Recall Roadmap

Turn learning material into a navigable, trackable Notion system that Recall can use for quiz generation.

## Workflow

### 1. Clarify the scope

- Accept a Notion page, database, module, URL, or topic as the source.
- If the source is ambiguous, ask which page/database and workspace should be used before making Notion changes.
- Ask only for decisions that materially change the structure: target audience/level, desired depth, and whether existing roadmap content may be updated.
- Preserve the user's language and naming conventions unless they request Recall naming.

### Naming convention

- Define `scope_title` as the primary workspace, module, source, or topic title being organized. Use the narrowest stable title that matches the requested scope.
- Name the roadmap parent page `{scope_title} Learning`.
- Name the concept container or concepts database `{scope_title} Concepts`.
- Name the learning-task database and task board `{scope_title} Learning Tasks`.
- Name the shared quiz and flashcard attempts database exactly `Recall`. Never create or refer to it as `Recall Quiz Attempts`.
- Reuse an existing artifact when its stable source metadata matches, even if its old title uses the previous naming convention; ask before renaming an existing user-owned artifact.

### 2. Read and analyze the source

- Use the Notion MCP fetch/search tools to read the source and its relevant child content.
- Prefer configured Notion MCP tools. If a required Notion operation is not visible, search available tools for page/database search, fetch, block, and data-source operations before inventing a call.
- Extract concepts, prerequisites, practical outcomes, and concrete review items. Do not skip secondary concepts merely because a popular main topic exists.
- Group related material into a small, meaningful concept set. Prefer concepts such as Fundamentals, CRUD, Queries, Indexing, Data Modeling, Transactions, Scaling, and Security only when supported by the source.
- For every task, retain a short source reference or excerpt so the task remains explainable.

### 3. Create or update the roadmap structure

Create a parent roadmap page, concept note pages, and a task data source. Use stable names and source identifiers to detect existing content before creating anything.

Default structure:

```text
{scope_title} Learning
├── {scope_title} Concepts
│   ├── {Concept}
│   ├── {Concept}
│   └── {Concept}
└── {scope_title} Learning Tasks
```

- Create one concept note page per concept. Include a concise overview, learning outcomes, source-backed notes, and links to its tasks.
- Create one task row per reviewable idea, not one row per paragraph. Include a source excerpt or reference in the Notes property.
- Link tasks to their concept page when the Notion schema supports relations; otherwise use stable concept names and links in the Notes field.
- Never replace existing concept-page content or task notes without explicit permission. Add missing sections or rows instead.
- Keep quiz and flashcard attempt data in the separate `Recall` database; do not add score/retry columns to the learning-task database.

### 4. Add useful views

Create or update views on the task database:

- `All tasks` — table sorted by concept and order.
- `Kanban Board` — board grouped by Status.
- `By concept` — table or board grouped/filtered by concept.
- `Next up` — filtered to Not started/In progress and sorted by order.
- `Calendar` — only when tasks have dates or a schedule was requested.

For the separate `Recall` database, use attempts table, recent attempts, score history, and a board grouped by Status when it exists.

### 5. Assign icons

Use meaningful, restrained icons. Choose deterministically from the concept's meaning so repeated runs do not create visual churn:

- Roadmap: map or compass
- Fundamentals: book
- CRUD: repeat/arrows
- Queries: search
- Indexing: layers or list
- Data modeling: boxes or network
- Transactions: refresh or arrows
- Scaling: chart
- Security: shield

Use a different icon only when the selected icon is already used nearby or the user requests randomization. Do not use decorative icons that obscure navigation.

#### Icon requirement

Every Notion artifact created by this skill must receive an emoji or icon whenever the Notion operation supports it: roadmap pages, concept notes, task databases, task rows, table views, Kanban boards, and related pages. Use a deterministic semantic icon for repeatable runs, preserve existing user-selected icons, and never create an unlabelled artifact when an icon-capable field is available. If a specific view type does not support an icon, keep its parent page or database icon and record that limitation rather than changing the view structure.

### 6. Verify and report

- Fetch the updated databases/pages after mutations.
- Verify concept count, task count, views, icons, and that existing user-authored content was preserved.
- Report what was created, what was updated, and any source concepts that could not be mapped.
- If a Notion operation is only queued/asynchronous, say so and provide the operation that remains pending.

## Idempotency rules

- Identify the source by Notion page/database ID, not title alone.
- Before creating a page or database, search/fetch the intended parent and compare stable names plus source metadata.
- Use concept slug/name and source ID as the logical key for concept pages.
- Use source ID + concept key + task text as the logical key for task rows.
- Re-running the skill should add missing concepts/tasks and update views, not duplicate the roadmap or reset Status/Done values.

## Recall integration

When the roadmap is used by Recall:

- Use the self-contained macOS desktop runtime only. Ensure `/Applications/Recall.app` is running and probe `GET http://127.0.0.1:3000/api/health` before publishing or verifying Recall content.
- Read `~/Library/Application Support/com.decimozs.recall/connection.json` for `api_url` and `agent_key`; send protected requests with its `X-Agent-Key` value. Do not use Docker, `localhost:8080`, the deleted browser runtime, or PostgreSQL for Recall operations.
- Generate quizzes and flashcards from concept pages or the selected source through the protected local Recall API. Use the API for database reads and writes; never edit the desktop `recall.sqlite3` file directly.
- Include a stable `task_key` on every generated question so scores can be aggregated by learning task/concept.
- On quiz or flashcard completion, write one row to the separate `Recall` database and update only general task progress fields such as Status and Done.
- Never write quiz scores, retries, or duration into the learning-task rows.
- If the desktop app or Notion is offline, do not publish partial study material or claim synchronization. Preserve the prepared roadmap and retry the local publish/sync workflow when connectivity returns.

## Safety boundaries

- Notion mutations require edit access and should be limited to the user's selected workspace/source.
- Do not delete pages, columns, rows, or views as part of a normal roadmap run.
- Do not infer a target database from a similarly named page when multiple candidates exist; ask the user.
- Do not claim a roadmap or view was created until a fetch/verification confirms it.

## Reference

Read [notion-schema.md](references/notion-schema.md) when creating or evolving the standard Recall roadmap and quiz-attempt databases.
