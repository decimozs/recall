# Recall quiz and attempt schema

Use the actual fetched Notion schema as authoritative. These defaults apply only when creating missing structures.

## Recall question payload

```json
{
  "type": "multiple_choice",
  "prompt": "A source-grounded question",
  "choices": ["Option A", "Option B", "Option C", "Option D"],
  "correct_answer": "Option C",
  "explanation": "Why the answer is correct.",
  "source_excerpt": "Short supporting excerpt or rationale.",
  "task_key": "concept-key"
}
```

Rules:

- `correct_answer` must equal exactly one member of `choices`.
- `true_false` questions use `choices: ["True", "False"]`.
- Do not use an array for `correct_answer`; Recall quizzes have one correct answer.
- `task_key` should be stable across quiz generations so task-level results can be aggregated.

## Recall Quiz Attempts database

Recommended properties:

| Property | Type | Purpose |
|---|---|---|
| Quiz Name | title | Completed quiz name |
| Workspace | rich text | Recall workspace |
| Source | rich text | Notion source title |
| Attempt Date | date | Completion timestamp |
| Status | select/status | In Progress or Completed |
| Retry Number | number | Attempt count for this quiz |
| Score % | number | Overall score |
| Correct Answers | number | Correct answer count |
| Total Questions | number | Total question count |
| Duration | rich text | Readable duration such as `6m 11s` |

Do not add Mode or Recall Attempt ID unless the user explicitly requests them.
