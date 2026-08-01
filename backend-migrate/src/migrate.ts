import postgres from 'postgres';
import { DatabaseBridge } from '../../backend-bun/src/db-client.js';

const dryRun = process.argv.includes('--dry-run');
const replace = process.argv.includes('--replace');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (replace && !process.env.RECALL_ALLOW_REPLACE) {
  throw new Error('Refusing --replace without RECALL_ALLOW_REPLACE=1');
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const db = new DatabaseBridge({
  dbPath: process.env.RECALL_DB_PATH || './.data/recall.sqlite3',
  bridgePath: process.env.RECALL_DB_BRIDGE || undefined
});

const tables = [
  'workspaces', 'sources', 'quizzes', 'questions', 'attempts', 'attempt_answers',
  'flashcard_sets', 'flashcards', 'flashcard_review_answers', 'attempt_task_results',
  'notion_sync_requests', 'generation_requests'
] as const;

const columns: Record<(typeof tables)[number], string[]> = {
  workspaces: ['id', 'notion_workspace_id', 'name', 'icon', 'created_at'],
  sources: ['id', 'workspace_id', 'notion_page_id', 'title', 'last_synced_at'],
  quizzes: ['id', 'source_id', 'title', 'question_count', 'created_at'],
  questions: ['id', 'quiz_id', 'position', 'type', 'prompt', 'choices', 'correct_answer', 'explanation', 'source_excerpt', 'task_key'],
  attempts: ['id', 'quiz_id', 'flashcard_set_id', 'started_at', 'completed_at', 'score', 'total_questions', 'mode', 'content_mode'],
  attempt_answers: ['id', 'attempt_id', 'question_id', 'given_answer', 'is_correct', 'answered_at'],
  flashcard_sets: ['id', 'source_id', 'title', 'card_count', 'created_at'],
  flashcards: ['id', 'set_id', 'position', 'front', 'back', 'hint', 'source_excerpt', 'task_key'],
  flashcard_review_answers: ['id', 'review_id', 'card_id', 'is_known', 'answered_at'],
  attempt_task_results: ['id', 'attempt_id', 'task_key', 'correct_count', 'total_questions', 'score'],
  notion_sync_requests: ['id', 'attempt_id', 'status', 'created_at', 'completed_at'],
  generation_requests: ['id', 'workspace_id', 'prompt', 'status', 'created_at']
};

function normalize(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  if (field.endsWith('_at')) return new Date(String(value)).toISOString();
  if (field === 'choices' && typeof value !== 'string') return JSON.stringify(value);
  return value;
}

async function count(table: string) {
  const result = await db.query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(result[0]?.count || 0);
}

async function run() {
  await db.start();
  const sourceCounts = Object.fromEntries(await Promise.all(tables.map(async (table) => [table, (await sql`SELECT COUNT(*)::int AS count FROM ${sql(table)}`)[0].count])));
  const targetCounts = Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await count(table)])));

  console.log(JSON.stringify({ dryRun, replace, sourceCounts, targetCounts }, null, 2));
  if (dryRun) return;

  if (replace) {
    for (const table of [...tables].reverse()) await db.exec(`DELETE FROM ${table}`, []);
  }

  for (const table of tables) {
    const rows = await sql.unsafe(`SELECT ${columns[table].join(', ')} FROM ${table}`);
    for (const row of rows) {
      const values = columns[table].map((column) => normalize(row[column], column));
      const placeholders = columns[table].map(() => '?').join(', ');
      const updates = columns[table].filter((column) => column !== 'id').map((column) => `${column}=excluded.${column}`).join(', ');
      await db.exec(`INSERT INTO ${table} (${columns[table].join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`, values);
    }
    console.log(`migrated ${table}: ${rows.length} rows`);
  }
}

try {
  await run();
} finally {
  await db.close();
  await sql.end({ timeout: 2 });
}
