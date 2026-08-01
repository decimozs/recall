# Recall roadmap schema reference

Use the actual fetched Notion schema as authoritative. These are defaults for new structures, not permission to overwrite an existing database.

## Learning-task database

Recommended properties:

| Property | Type | Purpose |
|---|---|---|
| Task | title | One reviewable learning item |
| Concept | select or relation | Fundamentals, CRUD, Queries, etc. |
| Notes | rich text | Source excerpt, explanation, or reference |
| Status | status | Not started, In progress, Done |
| Done | checkbox | Completion mirror for simple filters |
| Order | number | Learning sequence |
| Day | select | Optional schedule grouping |
| Source | URL or rich text | Optional source link |

Do not add quiz score, retry, duration, or quiz-status properties here.

## Concept note page

Each concept page should contain:

1. What this concept covers
2. Learning outcomes
3. Source-backed notes
4. Common pitfalls or distinctions
5. Linked tasks
6. Optional quiz coverage link

Keep notes concise and do not overwrite existing user content.

## Quiz-attempt database

Recommended properties:

| Property | Type | Purpose |
|---|---|---|
| Quiz Name | title | Completed quiz name |
| Workspace | rich text | Recall workspace |
| Source | rich text | Source page or module |
| Attempt Date | date | Completion timestamp |
| Status | select/status | In Progress or Completed |
| Retry Number | number | Attempt count for that quiz |
| Score % | number | Overall percentage |
| Correct Answers | number | Correct answer count |
| Total Questions | number | Total question count |
| Duration | rich text | Readable value, e.g. `6m 11s` or `1h 4m 3s` |

## View defaults

- Attempts board: board grouped by Status.
- Recent attempts: table sorted by Attempt Date descending.
- Score history: table sorted by Score % descending.
- Learning Kanban: board grouped by Status.
- Learning table: table sorted by Concept, then Order.
