---
name: recall-roadmap
description: Create and maintain structured learning roadmaps in Notion from source pages, databases, modules, or user-provided topics. Use when the user wants a study plan with automatically grouped concepts, task tracking, concept notes, table/Kanban views, icons, and Recall quiz coverage.
---

# Recall Roadmap

Turn learning material into a navigable, trackable Notion system that Recall can use for quiz generation.

## Workflow

### 1. Clarify the scope

- Accept a Notion page, database, module, URL, or topic as the source.
- If the source is ambiguous, ask which page/database and workspace should be used before making Notion changes.
- Ask only for decisions that materially change the structure: target audience/level, desired depth, and whether existing roadmap content may be updated.
- Preserve the user's language and naming conventions unless they request Recall naming.

### 2. Read and analyze the source

- Use the Notion MCP fetch/search tools to read the source and its relevant child content.
- Extract concepts, prerequisites, practical outcomes, and concrete review items. Do not skip secondary concepts merely because a popular main topic exists.
- Group related material into a small, meaningful concept set. Prefer concepts such as Fundamentals, CRUD, Queries, Indexing, Data Modeling, Transactions, Scaling, and Security only when supported by the source.
- For every task, retain a short source reference or excerpt so the task remains explainable.

### 3. Create or update the roadmap structure

Create a parent roadmap page, concept note pages, and a task data source. Use stable names and source identifiers to detect existing content before creating anything.

Default structure:

```text
[Topic] Learning Roadmap
├── [Topic] Fundamentals
├── [Topic] [Concept]
├── [Topic] [Concept]
└── [Topic] Learning Tasks
```

- Create one concept note page per concept. Include a concise overview, learning outcomes, source-backed notes, and links to its tasks.
- Create one task row per reviewable idea, not one row per paragraph. Include a source excerpt or reference in the Notes property.
- Link tasks to their concept page when the Notion schema supports relations; otherwise use stable concept names and links in the Notes field.
- Never replace existing concept-page content or task notes without explicit permission. Add missing sections or rows instead.
- Keep quiz attempt data in a separate Recall Quiz Attempts database; do not add score/retry columns to the learning-task database.

### 4. Add useful views

Create or update views on the task database:

- `All tasks` — table sorted by concept and order.
- `Kanban Board` — board grouped by Status.
- `By concept` — table or board grouped/filtered by concept.
- `Next up` — filtered to Not started/In progress and sorted by order.
- `Calendar` — only when tasks have dates or a schedule was requested.

For the separate quiz-attempt database, use attempts table, recent attempts, score history, and a board grouped by Status when it exists.

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

- Generate quizzes from concept pages or the selected source through the protected Recall internal quiz endpoint.
- Include a stable `task_key` on every generated question so scores can be aggregated by learning task/concept.
- On quiz completion, write one row to the separate quiz-attempt database and update only general task progress fields such as Status and Done.
- Never write quiz scores, retries, or duration into the learning-task rows.

## Safety boundaries

- Notion mutations require edit access and should be limited to the user's selected workspace/source.
- Do not delete pages, columns, rows, or views as part of a normal roadmap run.
- Do not infer a target database from a similarly named page when multiple candidates exist; ask the user.
- Do not claim a roadmap or view was created until a fetch/verification confirms it.

## Reference

Read [notion-schema.md](references/notion-schema.md) when creating or evolving the standard Recall roadmap and quiz-attempt databases.
