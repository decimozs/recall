---
name: recall-track
description: Synchronize Recall quiz activity and roadmap progress with Notion. Use when processing queued Recall sync requests, updating task and concept status, creating quiz-attempt records, repairing failed syncs, or verifying that Notion tables and Kanban views reflect Recall changes.
---

# Recall Track

Synchronize Recall's PostgreSQL state with the user's Notion learning system without duplicating records or overwriting authored notes.

## Responsibilities

- Update roadmap task progress from completed Recall quiz results.
- Create one Notion row per completed quiz attempt.
- Keep quiz scores, retries, duration, and attempt status in the separate quiz-attempt database.
- Verify that shared Notion data sources drive their table, board, and other views correctly.
- Process manual repair requests and report failures clearly.

## Source of truth

- Recall PostgreSQL is authoritative for quiz attempts, answer correctness, scores, retry counts, durations, and sync queue state.
- Notion is authoritative for roadmap structure, concept notes, task content, and manually authored learning material.
- This skill is the synchronization layer; it must not invent or rewrite either system's primary content.

## Standard workflow

### 1. Read the sync request

- Poll the protected Recall endpoint `GET /api/internal/attempts/:id/notion-sync` with `X-Agent-Key`.
- Process only completed attempts with a valid task result set.
- Read the returned `notion_target` values and fetched Notion schemas before mutation. Never hardcode a property name when the live schema differs.
- If the request is already completed, do not create another attempt row.

### 2. Claim and deduplicate

- Treat the Recall attempt ID as the idempotency key, even if it is not displayed as a Notion property.
- Search the quiz-attempt data source for an existing row matching the quiz, attempt timestamp, score, and other returned metadata.
- If an existing matching row is found, update it rather than creating a duplicate.
- If queue-state mutation endpoints are available, mark the request `processing` before Notion writes, then `completed` only after verification. On failure, mark it `failed` with a useful error message or leave it retryable according to the queue contract.

### 3. Update roadmap tasks

- Match each returned task result to the learning-task row using stable page IDs, task keys, or an exact task-title match scoped to the selected source. Never match by an unscoped title across the whole workspace.
- Update only general progress fields, normally `Status` and `Done`.
- A task with a completed result can be marked `Done`/checked when the roadmap policy allows it. Preserve manually chosen statuses when the user has configured manual control.
- Do not write score, percentage, retries, duration, mode, or quiz-status fields to learning-task rows.
- If a task cannot be matched confidently, skip it and report it; do not create a guessed task.

### 4. Create or update the quiz-attempt row

Use the existing `Recall Quiz Attempts` data source when present. A completed row should include:

- Quiz Name
- Workspace
- Source
- Attempt Date
- Status = Completed
- Retry Number
- Score %
- Correct Answers
- Total Questions
- Duration as a readable string such as `45s`, `6m 11s`, or `1h 4m 3s`

Do not add Mode or Recall Attempt ID unless the user explicitly requests them. Keep the attempt ID in the sync process as an internal deduplication key.

### 5. Verify the changes

- Fetch or query the updated task rows and attempt row.
- Confirm task status/check values match the intended update.
- Confirm the attempt row exists once and has the expected score, count, retry, duration, and status.
- Confirm the relevant table and Kanban views use the same data source and therefore reflect the changes.
- Only after verification report the sync as completed.

## Manual commands

Support requests such as:

- “Sync the latest Recall attempt.”
- “Sync all queued Recall attempts.”
- “Repair failed Recall syncs.”
- “Show me what Recall and Notion disagree on.”

For bulk sync, process oldest queued requests first, keep each attempt isolated, and provide a summary of completed, skipped, and failed requests.

## Conflict policy

- Never delete Notion pages, rows, columns, or views during synchronization.
- Never overwrite concept-note content or task Notes.
- If Notion and Recall disagree about a score or answer result, Recall wins for the quiz-attempt record.
- If Notion has a manual task status that conflicts with an automatic completion update, preserve the manual status and report the conflict unless the user explicitly asks for automatic overwrites.
- If a schema/property is missing, stop that individual update and report the exact missing field rather than silently adding unrelated columns.

## Failure handling

Classify failures as:

- `not_found`: source, page, task, or database cannot be located.
- `schema_mismatch`: expected property or type is absent.
- `ambiguous_match`: more than one Notion row could match.
- `permission`: Notion edit access is unavailable.
- `transient`: network, MCP, or temporary service failure.

Retry transient failures. Ask the user before resolving ambiguous matches or changing schemas. Include the attempt ID, affected target, and next action in every failure report.

## Reference

Read [sync-contract.md](references/sync-contract.md) for the Recall endpoint contract and default Notion field mapping.
