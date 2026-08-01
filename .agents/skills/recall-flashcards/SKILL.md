---
name: recall-flashcards
description: Generate, validate, publish, and track source-grounded Recall flashcards from selected Notion notes, concepts, roadmaps, or task modules. Use when the user wants flashcards, card review, flip-card study, known/needs-review tracking, or Flashcards-mode attempt rows in the Recall attempts table.
---

# Recall Flashcards

Generate flashcards from an explicitly selected Notion source and publish them to the local Recall app. Keep flashcards separate from quizzes: flashcards use a front/back recall interaction, while quizzes use multiple choice or true/false questions.

## Source boundary

- Read the selected Notion page, concept note, roadmap module, or task database through Notion MCP before generating cards.
- Treat an explicitly selected source or concept as a strict boundary. Do not pull neighboring concepts or parent pages unless requested.
- Cover the source's important definitions, distinctions, workflows, examples, trade-offs, failure modes, and practical applications.
- Include the source excerpt or rationale for every card so the card can be reviewed against the note.

## Generate cards

Each card must contain:

- `front`: one clear recall prompt, term, scenario, or question.
- `back`: a concise source-grounded answer or explanation.
- `hint`: optional memory cue without giving away the full answer.
- `source_excerpt`: supporting note context.
- `task_key`: the matching concept or learning-task key when available.

Prefer one idea per card. Avoid duplicate prompts, unsupported facts, vague answers, and cards that require knowledge outside the selected source. Create enough cards to cover all selected concepts; do not impose a hard maximum unless the user requests one.

## Publish to Recall

Use the protected internal endpoint:

```text
POST /api/internal/flashcard-sets
X-Agent-Key: <AGENT_API_KEY>
```

Payload shape:

```json
{
  "workspace": {"notion_workspace_id": "...", "name": "...", "icon": "..."},
  "source": {"notion_page_id": "...", "title": "..."},
  "set": {
    "title": "MongoDB Fundamentals",
    "cards": [{"front":"...","back":"...","hint":"...","source_excerpt":"...","task_key":"..."}]
  }
}
```

The browser must never call Notion directly. Codex reads Notion, validates the cards, and publishes them to Recall.

## Review experience

- Treat `POST /api/flashcard-sets/:id/reviews` as the review-start endpoint. The UI must show the “Before you begin” warning first and call this endpoint only after confirmation.
- The warning must explain independent recall/no outside help and the hidden timer. Canceling must create no attempt.
- After confirmation, enter Zen mode: hide the sidebar and navbar, center the flashcard view, and keep only the focused review controls visible.
- Randomize card order for each review. Save one `is_known` result per card through `PATCH /api/flashcard-reviews/:id/card`.
- Complete with `POST /api/flashcard-reviews/:id/complete`. This calculates the score, queues the Notion sync, exits Zen mode, and shows the review summary.
- Recent completed attempts with `content_mode = flashcards` must open through `GET /api/flashcard-reviews/:id`, never the quiz-only `/api/attempts/:id` route.

## Track review attempts

After a review is completed, process the protected endpoint:

```text
GET /api/internal/attempts/:id/notion-sync
X-Agent-Key: <AGENT_API_KEY>
```

Do not create a Notion attempt row for a review that is only started or still in progress. The app stores those locally until completion; the completion response queues the sync request.

Create or update exactly one row in the existing `Recall Quiz Attempts` data source for each completed flashcard review. Set:

- `Mode` = `Flashcards`
- `Status` = `Completed`
- `Quiz Name` = the flashcard set title
- `Score %` = known cards divided by total cards
- `Correct Answers` = known cards
- `Total Questions` = total cards
- `Retry Number` = the review number for that set
- `Duration` = readable duration such as `45s` or `6m 11s`
- `Attempt Date`, `Workspace`, and `Source` from the sync payload

Use Recall attempt ID as the internal idempotency key. Preserve every completed retry as its own Notion row and assign the existing meaningful emoji policy (for example, 🧠) to newly created rows. Do not write flashcard metrics into the learning-task database.

## Validate before reporting success

- Every card has a non-empty front and back.
- Every card belongs to the selected source.
- There are no duplicate fronts.
- Every selected concept has coverage.
- The Recall set has the expected card count.
- The Notion attempt row has `Mode = Flashcards` and is unique for the completed review.
