---
name: recall-quiz
description: Generate, validate, and publish Recall quizzes from Notion roadmaps, concept pages, task databases, or source notes. Use when the user wants randomized single-answer multiple-choice or true/false questions, balanced answer positions, explanations, broad concept coverage, and Recall app quiz records.
---

# Recall Quiz

Create source-grounded quizzes that refresh knowledge through recognition, application, problem solving, and logical reasoning.

## Workflow

### 1. Select and read the source

- Accept a Notion page, concept page, learning-task database, roadmap, or explicit topic.
- If multiple sources or workspaces match, ask the user to choose before mutating data.
- Fetch the source and relevant child pages/rows through Notion MCP. Use the fetched content as the authority; do not invent unsupported facts.
- Identify every concept that should be covered. Include secondary concepts and distinctions, not only headline topics.
- Treat an explicitly selected concept as a strict quiz boundary. If the user requests `Fundamentals`, cite only the Fundamentals note/page and its directly linked Fundamentals tasks; do not pull from CRUD, Queries, Indexing, or sibling concepts.
- If the user selects multiple concepts, use only those selected concepts and report the exact scope in the generated quiz metadata.
- If the user says “this note” or provides a concept-page URL, do not broaden the source to its parent roadmap or neighboring pages unless they explicitly ask for a broader quiz.

### 2. Plan question coverage

Unless the user specifies a different mix, target:

- 30% concept understanding
- 25% practical application
- 20% problem solving or debugging
- 15% logical reasoning, comparison, or trade-off analysis
- 10% true/false quick checks

Create at least one question for every selected concept. Do not impose a hard maximum question count when the goal is a full refresher; generate enough questions to cover the source adequately.

### 3. Generate questions

Allowed types:

- `multiple_choice` with one correct answer and three or four plausible distractors.
- `true_false` with exactly two choices: `True` and `False`.

Hard rule: every question has exactly one correct answer. Never generate multiple-correct-answer questions or ambiguous options.

Prefer questions that ask the learner to:

- Choose an action in a realistic scenario.
- Diagnose a bug or incorrect assumption.
- Predict an outcome from given conditions.
- Compare alternatives and justify a trade-off.
- Apply a concept to a new example.
- Connect multiple concepts without requiring information outside the source.

Each question must include:

- A clear prompt.
- `choices` as an array of answer strings.
- One `correct_answer` string that exactly matches one choice.
- A concise explanation.
- A source excerpt or source-backed rationale.
- A stable `task_key` matching its learning task or concept.
- A source reference that belongs to the selected scope. Reject any draft question whose evidence comes from outside that scope.

### 4. Randomize and balance answers

Before publishing:

- Shuffle the question order.
- Shuffle the choices for every multiple-choice question.
- Recalculate `correct_answer` after choice shuffling.
- Balance correct-answer positions across A, B, C, and D as evenly as possible.
- Avoid repeated answer-position runs and obvious patterns.
- Keep true/false questions as two-option checks; do not force them into A/B balancing.

Randomness must be validated. If a quiz has enough multiple-choice questions, no position should contain more than 40% of the correct answers unless mathematically unavoidable.

### 5. Publish to Recall

Post the normalized quiz through Recall's protected internal endpoint:

```text
POST /api/internal/quizzes
X-Agent-Key: <AGENT_API_KEY>
```

Payload requirements:

- Workspace: Notion workspace ID and name.
- Source: Notion page/database ID and title.
- Quiz title, usually `[Source or concept]` without temporary suffixes.
- All generated questions, including `task_key`.

The browser must not call Notion directly. Codex is the orchestration boundary between Notion MCP and Recall.

### 6. Record quiz activity in Notion

Use the existing `Recall Quiz Attempts` database when available. If it does not exist, create it with the schema in [quiz-schema.md](references/quiz-schema.md). Do not put score, retry, or duration columns into the learning-task database.

The attempt record is created after submission, not when the quiz is generated. Generation metadata may be recorded separately only if the user requests a quiz catalog.

#### Notion artifact icons

When this skill creates a Notion page, quiz catalog, database, table, or other icon-capable artifact, assign a meaningful emoji/icon. Use a consistent quiz icon for quiz-attempt rows (for example, 🧠), preserve existing icons when updating rows, and do not add emoji characters into authored titles unless requested. Every completed attempt remains its own row and its own icon-bearing page; never collapse retries into one aggregate row.

### 7. Verify quality

Before reporting success, check:

- Every question has exactly one correct answer.
- The correct answer exactly matches one choice.
- There are no duplicate prompts.
- Every question has an explanation and source support.
- Every selected concept has coverage.
- Correct-answer positions are balanced.
- Distractors are plausible but definitively wrong under the source.
- True/false statements are unambiguous.
- The published Recall quiz has the expected question count and title.

## Idempotency and safety

- Identify sources by Notion IDs, not titles alone.
- Check for an existing quiz with the same source ID, title, and generation context before creating another one. Ask before replacing an existing quiz.
- Never delete or reset attempts as part of normal generation.
- Do not expose answer keys in user-facing Notion notes unless the user asks for an answer key.
- Preserve user-edited roadmap pages and task statuses.

## Output report

Report:

- Quiz title and Recall quiz ID.
- Source and workspace.
- Total questions and type breakdown.
- Concepts covered.
- Correct-answer position distribution.
- Any concepts or source sections that could not be turned into fair questions.
