# Recall Track sync contract

Use the live API response and fetched Notion schemas as authoritative. These defaults describe the current Recall project.

## Desktop Recall endpoint

```text
GET http://127.0.0.1:3000/api/internal/attempts/:id/notion-sync
X-Agent-Key: <agent_key from connection.json>
```

Before using the endpoint, ensure `/Applications/Recall.app` is running and read `~/Library/Application Support/com.decimozs.recall/connection.json` for the API URL and agent key. The desktop app's local SQLite database is the source of truth; use this API rather than opening or modifying `recall.sqlite3` directly. Do not substitute Docker, `localhost:8080`, or a PostgreSQL runtime.

The response contains:

- `attempt`: quiz title, workspace/source, score, total questions, completion time, retry number, duration seconds, and `duration_display`.
- `tasks`: `task_key`, task title, correct count, total count, and task score.
- `notion_target`: the current attempts and learning-task data source URLs plus field rules.

## Current data sources

- Recall: `collection://97de6d14-0113-4aec-b645-00a3941e05bb`
- MongoDB Learning Tasks: `collection://05c7e4bd-6f95-4b84-a26d-61973028b007`

These IDs belong to the current workspace configuration. Fetch them before use and do not assume they exist in another workspace.

## Default mappings

| Recall value | Notion destination |
|---|---|
| quiz title | Quiz Name |
| workspace name | Workspace |
| source title | Source |
| completed timestamp | Attempt Date |
| completed | Status |
| retry number | Retry Number |
| overall score | Score % |
| correct count | Correct Answers |
| total questions | Total Questions |
| duration_display | Duration |
| completed task result | Task Status = Done, Done = checked |

Scores and attempt metadata belong only in Recall. Roadmap task rows receive progress state only.
