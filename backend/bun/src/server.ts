import { DatabaseBridge } from './db-client.js';

const db = new DatabaseBridge();
const agentKey = process.env.AGENT_API_KEY || 'dev-agent-key';
const port = Number(process.env.PORT || 3000);

await db.start();

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Agent-Key',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
};
const json = (body: unknown, status = 200, headers: HeadersInit = {}) => Response.json(body, { status, headers: { ...corsHeaders, ...headers } });
type EventClient = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  heartbeat: ReturnType<typeof setInterval>;
};
const eventEncoder = new TextEncoder();
const eventClients = new Set<EventClient>();
const page = (request: Request) => {
  const url = new URL(request.url);
  return { limit: Math.min(Number(url.searchParams.get('limit') || 20), 100), offset: Math.max(Number(url.searchParams.get('offset') || 0), 0) };
};
const body = (request: Request) => request.json().catch(() => ({}));
const authAgent = (request: Request) => request.headers.get('x-agent-key') === agentKey;
const now = () => new Date().toISOString();
const sse = (event: string, data: unknown) => eventEncoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const removeEventClient = (client: EventClient) => {
  clearInterval(client.heartbeat);
  eventClients.delete(client);
};
const broadcast = (event: string, data: Record<string, unknown> = {}) => {
  const message = sse(event, { ...data, at: now() });
  for (const client of eventClients) {
    try {
      client.controller.enqueue(message);
    } catch {
      removeEventClient(client);
    }
  }
};
function events() {
  let client: EventClient | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const heartbeat = setInterval(() => {
        if (!client) return;
        try {
          client.controller.enqueue(eventEncoder.encode(': keep-alive\n\n'));
        } catch {
          removeEventClient(client);
        }
      }, 25000);
      client = { controller, heartbeat };
      eventClients.add(client);
      controller.enqueue(sse('ready', { at: now() }));
    },
    cancel() {
      if (client) removeEventClient(client);
    }
  });
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive'
    }
  });
}

async function workspaces(request: Request) {
  const { limit, offset } = page(request);
  const rows = await db.query(`
    SELECT w.*, COUNT(DISTINCT q.id) AS quiz_count,
      COALESCE(ROUND(AVG(a.score)), 0) AS average_score
    FROM workspaces w
    LEFT JOIN sources s ON s.workspace_id = w.id
    LEFT JOIN quizzes q ON q.source_id = s.id
    LEFT JOIN attempts a ON a.quiz_id = q.id AND a.completed_at IS NOT NULL
    GROUP BY w.id ORDER BY w.pinned DESC, w.created_at LIMIT ? OFFSET ?`, [limit, offset]);
  return json({ data: rows, pagination: { limit, offset } });
}

async function workspaceQuizzes(request: Request) {
  const { limit, offset } = page(request);
  const rows = await db.query(`
    SELECT q.*, s.title AS source_title,
      COALESCE(MAX(a.score), 0) AS best_score, COUNT(a.id) AS attempt_count
    FROM quizzes q JOIN sources s ON s.id = q.source_id
    LEFT JOIN attempts a ON a.quiz_id = q.id AND a.completed_at IS NOT NULL
    WHERE s.workspace_id = ? GROUP BY q.id, s.title
    ORDER BY q.created_at DESC LIMIT ? OFFSET ?`, [request.params.id, limit, offset]);
  return json({ data: rows, pagination: { limit, offset } });
}

async function quiz(request: Request) {
  const rows = await db.query(`
    SELECT q.*, s.title AS source_title, w.name AS workspace_name
    FROM quizzes q JOIN sources s ON s.id = q.source_id JOIN workspaces w ON w.id = s.workspace_id
    WHERE q.id = ?`, [request.params.id]);
  if (!rows.length) return json({ error: 'Quiz not found' }, 404);
  const questions = await db.query(`SELECT id, position, type, prompt, choices, explanation, source_excerpt, task_key FROM questions WHERE quiz_id = ? ORDER BY position`, [request.params.id]);
  return json({ ...rows[0], questions: questions.map((question) => ({ ...question, choices: JSON.parse(String(question.choices || '[]')) })) });
}

async function startAttempt(request: Request) {
  const rows = await db.query<{ question_count: number }>('SELECT question_count FROM quizzes WHERE id = ?', [request.params.id]);
  if (!rows.length) return json({ error: 'Quiz not found' }, 404);
  const result = await db.exec('INSERT INTO attempts (quiz_id, total_questions, started_at) VALUES (?, ?, ?)', [request.params.id, rows[0].question_count, now()]);
  const attempt = await db.query('SELECT * FROM attempts WHERE id = ?', [result.last_insert_rowid]);
  return json(attempt[0]);
}

async function answer(request: Request) {
  const payload = await body(request) as { question_id?: number; given_answer?: string };
  if (!payload.question_id || payload.given_answer === undefined) return json({ error: 'question_id and given_answer are required' }, 400);
  const questions = await db.query<{ correct_answer: string; explanation: string; source_excerpt: string }>('SELECT correct_answer, explanation, source_excerpt FROM questions WHERE id = ?', [payload.question_id]);
  if (!questions.length) return json({ error: 'Question not found' }, 404);
  const correct = String(payload.given_answer).trim().toLowerCase() === String(questions[0].correct_answer).trim().toLowerCase();
  await db.exec(`
    INSERT INTO attempt_answers (attempt_id, question_id, given_answer, is_correct, answered_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(attempt_id, question_id) DO UPDATE SET given_answer = excluded.given_answer, is_correct = excluded.is_correct, answered_at = excluded.answered_at`,
    [request.params.id, payload.question_id, payload.given_answer, correct ? 1 : 0, now()]);
  return json({ is_correct: correct, correct_answer: questions[0].correct_answer, explanation: questions[0].explanation, source_excerpt: questions[0].source_excerpt });
}

type AttemptTaskResult = {
  task_key: string;
  correct_count: number;
  total_questions: number;
  score: number;
};

async function rebuildAttemptTaskResults(attemptId: number) {
  const attempts = await db.query<{ quiz_id: number | null; flashcard_set_id: number | null; content_mode: string | null; completed_at: string | null }>(
    'SELECT quiz_id, flashcard_set_id, content_mode, completed_at FROM attempts WHERE id = ?',
    [attemptId]
  );
  if (!attempts.length) throw new Error('Attempt not found');
  if (!attempts[0].completed_at) throw new Error('Attempt is not complete');

  const rows = attempts[0].content_mode === 'flashcards'
    ? await db.query<{ task_key: string; correct_count: number; total_questions: number }>(`
        SELECT NULLIF(TRIM(f.task_key), '') AS task_key,
          COALESCE(SUM(CASE WHEN fra.is_known = 1 THEN 1 ELSE 0 END), 0) AS correct_count,
          COUNT(*) AS total_questions
        FROM flashcards f
        LEFT JOIN flashcard_review_answers fra
          ON fra.card_id = f.id AND fra.review_id = ?
        WHERE f.set_id = ? AND NULLIF(TRIM(f.task_key), '') IS NOT NULL
        GROUP BY NULLIF(TRIM(f.task_key), '')
        ORDER BY task_key`, [attemptId, attempts[0].flashcard_set_id])
    : await db.query<{ task_key: string; correct_count: number; total_questions: number }>(`
        SELECT NULLIF(TRIM(q.task_key), '') AS task_key,
          COALESCE(SUM(CASE WHEN aa.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_count,
          COUNT(*) AS total_questions
        FROM questions q
        LEFT JOIN attempt_answers aa
          ON aa.question_id = q.id AND aa.attempt_id = ?
        WHERE q.quiz_id = ? AND NULLIF(TRIM(q.task_key), '') IS NOT NULL
        GROUP BY NULLIF(TRIM(q.task_key), '')
        ORDER BY task_key`, [attemptId, attempts[0].quiz_id]);

  await db.exec('DELETE FROM attempt_task_results WHERE attempt_id = ?', [attemptId]);
  const results: AttemptTaskResult[] = rows.map((row) => {
    const correctCount = Number(row.correct_count || 0);
    const totalQuestions = Number(row.total_questions || 0);
    return {
      task_key: String(row.task_key),
      correct_count: correctCount,
      total_questions: totalQuestions,
      score: totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0
    };
  });
  for (const result of results) {
    await db.exec(
      'INSERT INTO attempt_task_results (attempt_id, task_key, correct_count, total_questions, score) VALUES (?, ?, ?, ?, ?)',
      [attemptId, result.task_key, result.correct_count, result.total_questions, result.score]
    );
  }
  return results;
}

async function complete(request: Request) {
  const payload = await body(request) as { mode?: string };
  const completedAt = now();
  const rows = await db.query<{ total_questions: number; started_at: string }>('SELECT total_questions, started_at FROM attempts WHERE id = ?', [request.params.id]);
  if (!rows.length) return json({ error: 'Attempt not found' }, 404);
  const answered = await db.query<{ correct_count: number }>('SELECT COALESCE(SUM(is_correct), 0) AS correct_count FROM attempt_answers WHERE attempt_id = ?', [request.params.id]);
  const score = rows[0].total_questions ? Math.round((Number(answered[0]?.correct_count || 0) / rows[0].total_questions) * 100) : 0;
  await db.exec('UPDATE attempts SET completed_at = ?, mode = ?, score = ? WHERE id = ?', [completedAt, payload.mode === 'zen' ? 'zen' : 'normal', score, request.params.id]);
  const taskResults = await rebuildAttemptTaskResults(Number(request.params.id));
  await db.exec('INSERT OR IGNORE INTO notion_sync_requests (attempt_id) VALUES (?)', [request.params.id]);
  const attempt = await db.query('SELECT *, CAST((julianday(completed_at) - julianday(started_at)) * 86400 AS INTEGER) AS duration_seconds FROM attempts WHERE id = ?', [request.params.id]);
  broadcast('content.updated', { kind: 'attempt', id: Number(request.params.id) });
  return json({ ...attempt[0], duration_display: formatDuration(attempt[0].duration_seconds), correct_count: Number(answered[0]?.correct_count || 0), task_results: taskResults, notion_sync: { status: 'queued', endpoint: `/api/internal/attempts/${request.params.id}/notion-sync` } });
}

async function stats() {
  const rows = await db.query(`SELECT
    (SELECT COUNT(*) FROM quizzes) AS total_quizzes,
    (SELECT COUNT(*) FROM attempts WHERE completed_at IS NOT NULL) AS total_attempts,
    (SELECT COALESCE(ROUND(AVG(score)), 0) FROM attempts WHERE completed_at IS NOT NULL) AS accuracy`);
  return json(rows[0]);
}

async function createWorkspace(request: Request) {
  const payload = await body(request) as { name?: string; notion_workspace_id?: string };
  if (!payload.name?.trim()) return json({ error: 'A workspace name is required' }, 400);
  const externalId = payload.notion_workspace_id?.trim() || `recall-${Date.now()}`;
  const result = await db.exec('INSERT INTO workspaces (notion_workspace_id, name, icon) VALUES (?, ?, ?)', [externalId, payload.name.trim(), '◌']);
  const rows = await db.query('SELECT * FROM workspaces WHERE id = ?', [result.last_insert_rowid]);
  broadcast('content.updated', { kind: 'workspace', id: Number(result.last_insert_rowid) });
  return json(rows[0], 201);
}

async function updateWorkspace(request: Request) {
  const payload = await body(request) as { name?: string; icon?: string; pinned?: boolean };
  const existing = await db.query<{ id: number }>('SELECT id FROM workspaces WHERE id = ?', [request.params.id]);
  if (!existing.length) return json({ error: 'Workspace not found' }, 404);

  const updates: string[] = [];
  const values: (string | number)[] = [];
  if (payload.name !== undefined) {
    const name = payload.name.trim();
    if (!name) return json({ error: 'A workspace name is required' }, 400);
    updates.push('name = ?');
    values.push(name);
  }
  if (payload.icon !== undefined) {
    const icon = payload.icon.trim();
    if (!icon) return json({ error: 'Choose an emoji for the workspace' }, 400);
    updates.push('icon = ?');
    values.push(icon);
  }
  if (payload.pinned !== undefined) {
    updates.push('pinned = ?');
    values.push(payload.pinned ? 1 : 0);
  }
  if (!updates.length) return json({ error: 'No workspace changes provided' }, 400);

  values.push(Number(request.params.id));
  await db.exec(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`, values);
  const rows = await db.query('SELECT * FROM workspaces WHERE id = ?', [request.params.id]);
  broadcast('content.updated', { kind: 'workspace', id: Number(request.params.id) });
  return json(rows[0]);
}

async function deleteWorkspace(request: Request) {
  const existing = await db.query<{ id: number }>('SELECT id FROM workspaces WHERE id = ?', [request.params.id]);
  if (!existing.length) return json({ error: 'Workspace not found' }, 404);
  await db.exec(`DELETE FROM attempts
    WHERE quiz_id IN (SELECT q.id FROM quizzes q JOIN sources s ON s.id = q.source_id WHERE s.workspace_id = ?)
      OR flashcard_set_id IN (SELECT fs.id FROM flashcard_sets fs JOIN sources s ON s.id = fs.source_id WHERE s.workspace_id = ?)`, [request.params.id, request.params.id]);
  await db.exec('DELETE FROM workspaces WHERE id = ?', [request.params.id]);
  broadcast('content.updated', { kind: 'workspace', id: Number(request.params.id), deleted: true });
  return json({ deleted: true, id: Number(request.params.id) });
}

async function generationRequest(request: Request) {
  const payload = await body(request) as { workspace_id?: number; prompt?: string };
  if (!payload.prompt?.trim()) return json({ error: 'A quiz prompt is required' }, 400);
  const result = await db.exec('INSERT INTO generation_requests (workspace_id, prompt) VALUES (?, ?)', [payload.workspace_id || null, payload.prompt.trim()]);
  const rows = await db.query('SELECT id, status, created_at FROM generation_requests WHERE id = ?', [result.last_insert_rowid]);
  return json({ message: 'Quiz request queued for Codex.', request: rows[0] }, 202);
}

async function queuedGeneration(request: Request) {
  if (!authAgent(request)) return json({ error: 'Agent authentication required' }, 401);
  const rows = await db.query(`SELECT gr.*, w.name AS workspace_name FROM generation_requests gr LEFT JOIN workspaces w ON w.id = gr.workspace_id WHERE gr.status = 'queued' ORDER BY gr.created_at`);
  return json({ data: rows });
}

const formatDuration = (seconds: unknown) => {
  const total = Math.max(Number(seconds) || 0, 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}h ${minutes}m ${secs}s` : minutes ? `${minutes}m ${secs}s` : `${secs}s`;
};

async function attempt(request: Request) {
  const rows = await db.query(`
    SELECT a.*, q.title AS quiz_title, fs.title AS flashcard_title, s.title AS source_title,
      CAST((julianday(a.completed_at) - julianday(a.started_at)) * 86400 AS INTEGER) AS duration_seconds
    FROM attempts a
    LEFT JOIN quizzes q ON q.id = a.quiz_id
    LEFT JOIN flashcard_sets fs ON fs.id = a.flashcard_set_id
    JOIN sources s ON s.id = COALESCE(q.source_id, fs.source_id)
    WHERE a.id = ?`, [request.params.id]);
  if (!rows.length) return json({ error: 'Attempt not found' }, 404);
  const answers = await db.query(`
    SELECT aa.*, qu.position, qu.prompt, qu.correct_answer, qu.explanation
    FROM attempt_answers aa JOIN questions qu ON qu.id = aa.question_id
    WHERE aa.attempt_id = ? ORDER BY qu.position`, [request.params.id]);
  const flashcardAnswers = await db.query(`
    SELECT fra.*, f.position, f.front, f.back, f.hint
    FROM flashcard_review_answers fra JOIN flashcards f ON f.id = fra.card_id
    WHERE fra.review_id = ? ORDER BY f.position`, [request.params.id]);
  return json({ ...rows[0], duration_display: formatDuration(rows[0].duration_seconds), answers, flashcard_answers: flashcardAnswers });
}

async function activity(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 365), 28), 730);
  const rows = await db.query(`
    WITH RECURSIVE calendar(day) AS (
      SELECT date('now', ?) UNION ALL SELECT date(day, '+1 day') FROM calendar WHERE day < date('now')
    )
    SELECT calendar.day AS activity_day, COUNT(a.id) AS quiz_count, COALESCE(SUM(a.total_questions), 0) AS question_count
    FROM calendar LEFT JOIN attempts a ON a.completed_at IS NOT NULL AND date(a.completed_at) = calendar.day
    GROUP BY calendar.day ORDER BY calendar.day`, [`-${days - 1} days`]);
  return json({ days: rows.map((row) => ({ day: row.activity_day, quiz_count: Number(row.quiz_count), question_count: Number(row.question_count) })) });
}

async function recentAttempts(request: Request) {
  const { limit, offset } = page(request);
  const rows = await db.query(`
    SELECT a.id AS attempt_id, a.quiz_id, a.flashcard_set_id,
      COALESCE(q.title, fs.title) AS quiz_title, s.title AS source_title,
      a.content_mode, a.score, a.total_questions, a.completed_at,
      CAST((julianday(a.completed_at) - julianday(a.started_at)) * 86400 AS INTEGER) AS duration_seconds,
      (SELECT COUNT(*) FROM attempts prior WHERE prior.completed_at IS NOT NULL
        AND prior.content_mode = a.content_mode
        AND ((a.content_mode = 'quiz' AND prior.quiz_id = a.quiz_id) OR (a.content_mode = 'flashcards' AND prior.flashcard_set_id = a.flashcard_set_id))
        AND prior.id <= a.id) AS retry_number
    FROM attempts a LEFT JOIN quizzes q ON q.id = a.quiz_id LEFT JOIN flashcard_sets fs ON fs.id = a.flashcard_set_id
    JOIN sources s ON s.id = COALESCE(q.source_id, fs.source_id)
    WHERE a.completed_at IS NOT NULL ORDER BY a.completed_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
  return json({ data: rows.map((row) => ({ ...row, duration_display: formatDuration(row.duration_seconds) })), pagination: { limit, offset } });
}

async function quizAnalytics(request: Request) {
  const rows = await db.query(`
    SELECT q.id, q.title, q.question_count, s.title AS source_title, w.name AS workspace_name,
      COALESCE(MAX(a.score), 0) AS best_score, COALESCE(ROUND(AVG(a.score)), 0) AS average_score,
      COALESCE(ROUND(AVG(CASE WHEN a.score >= 80 THEN 100 ELSE 0 END)), 0) AS pass_rate, MAX(a.completed_at) AS last_attempt_at
    FROM quizzes q JOIN sources s ON s.id = q.source_id JOIN workspaces w ON w.id = s.workspace_id
    LEFT JOIN attempts a ON a.quiz_id = q.id AND a.completed_at IS NOT NULL WHERE q.id = ?
    GROUP BY q.id, s.title, w.name`, [request.params.id]);
  if (!rows.length) return json({ error: 'Quiz not found' }, 404);
  const attempts = await db.query(`
    SELECT a.id, a.score, a.total_questions, a.completed_at,
      CAST((julianday(a.completed_at) - julianday(a.started_at)) * 86400 AS INTEGER) AS duration_seconds,
      (SELECT COUNT(*) FROM attempts prior WHERE prior.quiz_id = a.quiz_id AND prior.completed_at IS NOT NULL
        AND (prior.completed_at < a.completed_at OR (prior.completed_at = a.completed_at AND prior.id <= a.id))) AS retry_number
    FROM attempts a WHERE a.quiz_id = ? AND a.completed_at IS NOT NULL ORDER BY a.completed_at`, [request.params.id]);
  const latest = attempts.at(-1);
  const answers = latest ? await db.query(`
    SELECT qu.id AS question_id, qu.position, qu.prompt, aa.given_answer, aa.is_correct, qu.correct_answer, qu.explanation
    FROM attempt_answers aa JOIN questions qu ON qu.id = aa.question_id WHERE aa.attempt_id = ? ORDER BY qu.position`, [latest.id]) : [];
  return json({ ...rows[0], latest_attempt: latest ? { ...latest, duration_display: formatDuration(latest.duration_seconds) } : null, attempts: attempts.map((item) => ({ ...item, duration_display: formatDuration(item.duration_seconds) })), answers });
}

async function notionSync(request: Request) {
  if (!authAgent(request)) return json({ error: 'Agent authentication required' }, 401);
  const rows = await db.query(`
    SELECT a.id, a.score, a.total_questions, a.completed_at, a.started_at, a.mode, a.content_mode,
      CAST((julianday(a.completed_at) - julianday(a.started_at)) * 86400 AS INTEGER) AS duration_seconds,
      (SELECT COUNT(*) FROM attempts prior WHERE prior.completed_at IS NOT NULL AND prior.content_mode = a.content_mode
        AND ((a.content_mode = 'quiz' AND prior.quiz_id = a.quiz_id) OR (a.content_mode = 'flashcards' AND prior.flashcard_set_id = a.flashcard_set_id))
        AND prior.id <= a.id) AS retry_number,
      COALESCE(q.title, fs.title) AS quiz_title, s.notion_page_id, s.title AS source_title,
      w.notion_workspace_id, w.name AS workspace_name
    FROM attempts a LEFT JOIN quizzes q ON q.id = a.quiz_id LEFT JOIN flashcard_sets fs ON fs.id = a.flashcard_set_id
    JOIN sources s ON s.id = COALESCE(q.source_id, fs.source_id) JOIN workspaces w ON w.id = s.workspace_id
    WHERE a.id = ?`, [request.params.id]);
  if (!rows.length) return json({ error: 'Attempt not found' }, 404);
  let tasks: AttemptTaskResult[] = await db.query<AttemptTaskResult>('SELECT task_key, correct_count, total_questions, score FROM attempt_task_results WHERE attempt_id = ? ORDER BY task_key', [request.params.id]);
  if (!tasks.length && attemptRow.completed_at) tasks = await rebuildAttemptTaskResults(Number(request.params.id));
  const attemptRow = rows[0];
  return json({
    attempt: { ...attemptRow, mode: attemptRow.content_mode === 'flashcards' ? 'Flashcards' : 'Quiz', duration_display: formatDuration(attemptRow.duration_seconds) },
    tasks,
    notion_target: {
      attempts_database_name: 'Recall',
      task_database_name: `${attemptRow.workspace_name} Learning Tasks`,
      scope_title: attemptRow.workspace_name,
      notion_workspace_id: attemptRow.notion_workspace_id,
      source_notion_page_id: attemptRow.notion_page_id,
      required_views: {
        attempts: ['All Attempts', 'Recent Attempts', 'Score History'],
        tasks: ['All tasks', 'Kanban Board', 'By concept', 'Next up']
      },
      rules: ['Create one row in Recall for this completed attempt.', 'Update every matching learning-task row using task_key; only change Status and Done.', 'Verify every linked view uses the same underlying data source.', 'Do not write score, retry, duration, or quiz-status fields to learning-task rows.']
    }
  });
}

async function rebuildAttemptTaskResultsEndpoint(request: Request) {
  if (!authAgent(request)) return json({ error: 'Agent authentication required' }, 401);
  const attemptId = Number(request.params.id);
  try {
    const tasks = await rebuildAttemptTaskResults(attemptId);
    return json({ attempt_id: attemptId, tasks, status: 'rebuilt' });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not rebuild task results' }, 400);
  }
}

async function rebuildAllAttemptTaskResults(request: Request) {
  if (!authAgent(request)) return json({ error: 'Agent authentication required' }, 401);
  const attempts = await db.query<{ id: number }>('SELECT id FROM attempts WHERE completed_at IS NOT NULL ORDER BY completed_at, id');
  const rebuilt = [];
  for (const item of attempts) rebuilt.push({ attempt_id: Number(item.id), tasks: await rebuildAttemptTaskResults(Number(item.id)) });
  return json({ status: 'rebuilt', attempts: rebuilt, count: rebuilt.length });
}

async function publishQuiz(request: Request) {
  if (!authAgent(request)) return json({ error: 'Agent authentication required' }, 401);
  const payload = await body(request) as { workspace?: { notion_workspace_id?: string; name?: string; icon?: string }; source?: { notion_page_id?: string; title?: string }; quiz?: { title?: string; questions?: Array<Record<string, unknown>> } };
  if (!payload.workspace?.notion_workspace_id || !payload.source?.notion_page_id || !payload.quiz?.title || !Array.isArray(payload.quiz.questions)) return json({ error: 'workspace, source and quiz.questions are required' }, 400);
  await db.exec(`INSERT INTO workspaces (notion_workspace_id, name, icon) VALUES (?, ?, ?) ON CONFLICT(notion_workspace_id) DO UPDATE SET name = excluded.name, icon = excluded.icon`, [payload.workspace.notion_workspace_id, payload.workspace.name || 'Workspace', payload.workspace.icon || '◈']);
  const workspace = await db.query<{ id: number }>('SELECT id FROM workspaces WHERE notion_workspace_id = ?', [payload.workspace.notion_workspace_id]);
  await db.exec(`INSERT INTO sources (workspace_id, notion_page_id, title, last_synced_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, notion_page_id) DO UPDATE SET title = excluded.title, last_synced_at = excluded.last_synced_at`, [workspace[0].id, payload.source.notion_page_id, payload.source.title || 'Source', now()]);
  const source = await db.query<{ id: number }>('SELECT id FROM sources WHERE workspace_id = ? AND notion_page_id = ?', [workspace[0].id, payload.source.notion_page_id]);
  const quizResult = await db.exec('INSERT INTO quizzes (source_id, title, question_count) VALUES (?, ?, ?)', [source[0].id, payload.quiz.title, payload.quiz.questions.length]);
  for (const [index, question] of payload.quiz.questions.entries()) {
    await db.exec(`INSERT INTO questions (quiz_id, position, type, prompt, choices, correct_answer, explanation, source_excerpt, task_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [quizResult.last_insert_rowid, index + 1, question.type || 'multiple_choice', question.prompt, JSON.stringify(question.choices || []), question.correct_answer, question.explanation || '', question.source_excerpt || '', question.task_key || null]);
  }
  broadcast('content.updated', { kind: 'quiz', id: Number(quizResult.last_insert_rowid), workspace_id: Number(workspace[0].id) });
  return json({ id: quizResult.last_insert_rowid }, 201);
}

async function workspaceFlashcards(request: Request) {
  const { limit, offset } = page(request);
  const rows = await db.query(`
    SELECT fs.id, fs.source_id, fs.title, fs.created_at, s.title AS source_title, COUNT(DISTINCT f.id) AS card_count,
      COALESCE(MAX(a.score), 0) AS best_score, COUNT(DISTINCT a.id) AS review_count
    FROM flashcard_sets fs JOIN sources s ON s.id = fs.source_id LEFT JOIN flashcards f ON f.set_id = fs.id
    LEFT JOIN attempts a ON a.flashcard_set_id = fs.id AND a.content_mode = 'flashcards' AND a.completed_at IS NOT NULL
    WHERE s.workspace_id = ? GROUP BY fs.id, s.title ORDER BY fs.created_at DESC LIMIT ? OFFSET ?`, [request.params.id, limit, offset]);
  return json({ data: rows, pagination: { limit, offset } });
}

async function flashcardSet(request: Request) {
  const rows = await db.query(`SELECT fs.*, s.title AS source_title, w.name AS workspace_name FROM flashcard_sets fs JOIN sources s ON s.id = fs.source_id JOIN workspaces w ON w.id = s.workspace_id WHERE fs.id = ?`, [request.params.id]);
  if (!rows.length) return json({ error: 'Flashcard set not found' }, 404);
  const cards = await db.query('SELECT id, position, front, back, hint, source_excerpt, task_key FROM flashcards WHERE set_id = ? ORDER BY position', [request.params.id]);
  return json({ ...rows[0], card_count: cards.length, cards });
}

async function startFlashcardReview(request: Request) {
  const rows = await db.query<{ id: number; card_count: number }>('SELECT fs.id, COUNT(f.id) AS card_count FROM flashcard_sets fs JOIN flashcards f ON f.set_id = fs.id WHERE fs.id = ? GROUP BY fs.id', [request.params.id]);
  if (!rows.length) return json({ error: 'Flashcard set not found' }, 404);
  const result = await db.exec(`INSERT INTO attempts (quiz_id, flashcard_set_id, content_mode, mode, total_questions, started_at) VALUES (NULL, ?, 'flashcards', 'zen', ?, ?)`, [request.params.id, rows[0].card_count, now()]);
  return json((await db.query('SELECT * FROM attempts WHERE id = ?', [result.last_insert_rowid]))[0]);
}

async function reviewCard(request: Request) {
  const payload = await body(request) as { card_id?: number; is_known?: boolean; known?: boolean };
  const known = payload.is_known === undefined ? payload.known : payload.is_known;
  if (!payload.card_id || typeof known !== 'boolean') return json({ error: 'card_id and is_known are required' }, 400);
  const review = await db.query<{ flashcard_set_id: number; completed_at: string | null }>(`SELECT flashcard_set_id, completed_at FROM attempts WHERE id = ? AND content_mode = 'flashcards'`, [request.params.id]);
  if (!review.length) return json({ error: 'Flashcard review not found' }, 404);
  if (review[0].completed_at) return json({ error: 'Flashcard review is already complete' }, 409);
  const cards = await db.query('SELECT id FROM flashcards WHERE id = ? AND set_id = ?', [payload.card_id, review[0].flashcard_set_id]);
  if (!cards.length) return json({ error: 'Flashcard not found' }, 404);
  await db.exec(`INSERT INTO flashcard_review_answers (review_id, card_id, is_known, answered_at) VALUES (?, ?, ?, ?) ON CONFLICT(review_id, card_id) DO UPDATE SET is_known = excluded.is_known, answered_at = excluded.answered_at`, [request.params.id, payload.card_id, known ? 1 : 0, now()]);
  return json({ card_id: Number(payload.card_id), is_known: known });
}

async function completeFlashcardReview(request: Request) {
  const review = await db.query<{ id: number; total_questions: number; completed_at: string | null }>(`SELECT id, total_questions, completed_at FROM attempts WHERE id = ? AND content_mode = 'flashcards'`, [request.params.id]);
  if (!review.length) return json({ error: 'Flashcard review not found' }, 404);
  if (review[0].completed_at) return json({ error: 'Flashcard review is already complete' }, 409);
  const known = await db.query<{ count: number }>('SELECT COUNT(*) AS count FROM flashcard_review_answers WHERE review_id = ? AND is_known = 1', [request.params.id]);
  const score = review[0].total_questions ? Math.round((Number(known[0].count) / review[0].total_questions) * 100) : 0;
  await db.exec('UPDATE attempts SET completed_at = ?, score = ? WHERE id = ?', [now(), score, request.params.id]);
  const taskResults = await rebuildAttemptTaskResults(Number(request.params.id));
  await db.exec('INSERT OR IGNORE INTO notion_sync_requests (attempt_id) VALUES (?)', [request.params.id]);
  const attempt = await db.query('SELECT *, CAST((julianday(completed_at) - julianday(started_at)) * 86400 AS INTEGER) AS duration_seconds FROM attempts WHERE id = ?', [request.params.id]);
  broadcast('content.updated', { kind: 'attempt', id: Number(request.params.id) });
  return json({ ...attempt[0], duration_display: formatDuration(attempt[0].duration_seconds), known_cards: Number(known[0].count), task_results: taskResults, notion_sync: { status: 'queued', endpoint: `/api/internal/attempts/${request.params.id}/notion-sync` } });
}

async function flashcardReview(request: Request) {
  const rows = await db.query(`SELECT a.id, a.flashcard_set_id, a.score, a.total_questions, a.completed_at, CAST((julianday(a.completed_at) - julianday(a.started_at)) * 86400 AS INTEGER) AS duration_seconds, fs.title AS set_title, s.title AS source_title FROM attempts a JOIN flashcard_sets fs ON fs.id = a.flashcard_set_id JOIN sources s ON s.id = fs.source_id WHERE a.id = ? AND a.content_mode = 'flashcards'`, [request.params.id]);
  if (!rows.length) return json({ error: 'Flashcard review not found' }, 404);
  const cards = await db.query(`SELECT f.id AS card_id, f.set_id, f.position, f.front, f.back, f.task_key, fra.is_known FROM flashcards f LEFT JOIN flashcard_review_answers fra ON fra.card_id = f.id AND fra.review_id = ? WHERE f.set_id = (SELECT flashcard_set_id FROM attempts WHERE id = ?) ORDER BY f.position`, [request.params.id, request.params.id]);
  return json({ ...rows[0], duration_display: formatDuration(rows[0].duration_seconds), cards });
}

async function publishFlashcards(request: Request) {
  if (!authAgent(request)) return json({ error: 'Agent authentication required' }, 401);
  const payload = await body(request) as { workspace?: { notion_workspace_id?: string; name?: string; icon?: string }; source?: { notion_page_id?: string; title?: string }; set?: { title?: string; cards?: Array<Record<string, unknown>> } };
  if (!payload.workspace?.notion_workspace_id || !payload.source?.notion_page_id || !payload.set?.title || !Array.isArray(payload.set.cards) || !payload.set.cards.length) return json({ error: 'workspace, source and set.cards are required' }, 400);
  await db.exec(`INSERT INTO workspaces (notion_workspace_id, name, icon) VALUES (?, ?, ?) ON CONFLICT(notion_workspace_id) DO UPDATE SET name = excluded.name, icon = excluded.icon`, [payload.workspace.notion_workspace_id, payload.workspace.name || 'Workspace', payload.workspace.icon || '▣']);
  const workspace = await db.query<{ id: number }>('SELECT id FROM workspaces WHERE notion_workspace_id = ?', [payload.workspace.notion_workspace_id]);
  await db.exec(`INSERT INTO sources (workspace_id, notion_page_id, title, last_synced_at) VALUES (?, ?, ?, ?) ON CONFLICT(workspace_id, notion_page_id) DO UPDATE SET title = excluded.title, last_synced_at = excluded.last_synced_at`, [workspace[0].id, payload.source.notion_page_id, payload.source.title || 'Source', now()]);
  const source = await db.query<{ id: number }>('SELECT id FROM sources WHERE workspace_id = ? AND notion_page_id = ?', [workspace[0].id, payload.source.notion_page_id]);
  const existing = await db.query<{ id: number }>('SELECT id FROM flashcard_sets WHERE source_id = ? AND title = ?', [source[0].id, payload.set.title]);
  const setId = existing.length ? existing[0].id : (await db.exec('INSERT INTO flashcard_sets (source_id, title, card_count, created_at) VALUES (?, ?, ?, ?)', [source[0].id, payload.set.title, payload.set.cards.length, now()])).last_insert_rowid;
  if (existing.length) {
    await db.exec('DELETE FROM flashcards WHERE set_id = ?', [setId]);
    await db.exec('UPDATE flashcard_sets SET card_count = ? WHERE id = ?', [payload.set.cards.length, setId]);
  }
  for (const [index, card] of payload.set.cards.entries()) await db.exec('INSERT INTO flashcards (set_id, position, front, back, hint, source_excerpt, task_key) VALUES (?, ?, ?, ?, ?, ?, ?)', [setId, index + 1, card.front, card.back, card.hint || '', card.source_excerpt || '', card.task_key || null]);
  broadcast('content.updated', { kind: 'flashcards', id: Number(setId), workspace_id: Number(workspace[0].id) });
  return json({ id: setId, card_count: payload.set.cards.length }, 201);
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  idleTimeout: 0,
  routes: {
    '/api/health': () => json({ ok: true, database: 'sqlite' }),
    '/api/events': { GET: events },
    '/api/workspaces': { GET: workspaces, POST: createWorkspace },
    '/api/workspaces/:id': { PATCH: updateWorkspace, DELETE: deleteWorkspace },
    '/api/workspaces/:id/quizzes': { GET: workspaceQuizzes },
    '/api/quizzes/:id': { GET: quiz },
    '/api/quizzes/:id/attempts': { POST: startAttempt },
    '/api/attempts/:id/answer': { PATCH: answer },
    '/api/attempts/:id/complete': { POST: complete },
    '/api/attempts/:id': { GET: attempt },
    '/api/stats': { GET: stats },
    '/api/activity': { GET: activity },
    '/api/recent-attempts': { GET: recentAttempts },
    '/api/quizzes/:id/analytics': { GET: quizAnalytics },
    '/api/generation-requests': { POST: generationRequest },
    '/api/internal/generation-requests': { GET: queuedGeneration },
    '/api/internal/quizzes': { POST: publishQuiz },
    '/api/internal/attempts/:id/notion-sync': { GET: notionSync },
    '/api/internal/attempts/:id/rebuild-task-results': { POST: rebuildAttemptTaskResultsEndpoint },
    '/api/internal/task-results/rebuild': { POST: rebuildAllAttemptTaskResults },
    '/api/workspaces/:id/flashcard-sets': { GET: workspaceFlashcards },
    '/api/flashcard-sets/:id': { GET: flashcardSet },
    '/api/flashcard-sets/:id/reviews': { POST: startFlashcardReview },
    '/api/flashcard-reviews/:id/card': { PATCH: reviewCard },
    '/api/flashcard-reviews/:id/complete': { POST: completeFlashcardReview },
    '/api/flashcard-reviews/:id': { GET: flashcardReview },
    '/api/internal/flashcard-sets': { POST: publishFlashcards }
  },
  fetch: (request) => request.method === 'OPTIONS' ? new Response(null, { status: 204, headers: corsHeaders }) : json({ error: 'Not found' }, 404)
});

console.log(`Recall Bun API listening at ${server.url}`);
