use std::env;
use std::io::{self, BufRead, Write};
use std::path::PathBuf;

use rusqlite::types::{Value, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::Deserialize;
use serde_json::{json, Map, Value as JsonValue};

#[derive(Debug, Deserialize)]
struct Request {
    id: Option<String>,
    op: String,
    sql: Option<String>,
    params: Option<Vec<JsonValue>>,
}

fn response(id: Option<&str>, result: JsonValue) -> JsonValue {
    json!({ "id": id, "ok": true, "result": result })
}

fn error_response(id: Option<&str>, error: impl ToString) -> JsonValue {
    json!({ "id": id, "ok": false, "error": error.to_string() })
}

fn write_response(stdout: &mut impl Write, payload: JsonValue) -> io::Result<()> {
    serde_json::to_writer(&mut *stdout, &payload)?;
    stdout.write_all(b"\n")?;
    stdout.flush()
}

fn to_sql_value(value: JsonValue) -> Value {
    match value {
        JsonValue::Null => Value::Null,
        JsonValue::Bool(value) => Value::Integer(i64::from(value)),
        JsonValue::Number(value) => value
            .as_i64()
            .map(Value::Integer)
            .or_else(|| value.as_f64().map(Value::Real))
            .unwrap_or(Value::Null),
        JsonValue::String(value) => Value::Text(value),
        JsonValue::Array(value) => Value::Text(JsonValue::Array(value).to_string()),
        JsonValue::Object(value) => Value::Text(JsonValue::Object(value).to_string()),
    }
}

fn from_sql_value(value: ValueRef<'_>) -> JsonValue {
    match value {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(value) => json!(value),
        ValueRef::Real(value) => json!(value),
        ValueRef::Text(value) => json!(String::from_utf8_lossy(value)),
        ValueRef::Blob(value) => json!(value),
    }
}

fn initialize_schema(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS workspaces (
          id INTEGER PRIMARY KEY,
          notion_workspace_id TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          icon TEXT DEFAULT '◈',
          pinned INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS sources (
          id INTEGER PRIMARY KEY,
          workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          notion_page_id TEXT NOT NULL,
          title TEXT NOT NULL,
          last_synced_at TEXT,
          UNIQUE(workspace_id, notion_page_id)
        );
        CREATE TABLE IF NOT EXISTS quizzes (
          id INTEGER PRIMARY KEY,
          source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          question_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY,
          quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('multiple_choice','true_false','short_answer')),
          prompt TEXT NOT NULL,
          choices TEXT NOT NULL DEFAULT '[]',
          correct_answer TEXT NOT NULL,
          explanation TEXT NOT NULL DEFAULT '',
          source_excerpt TEXT NOT NULL DEFAULT '',
          task_key TEXT
        );
        CREATE TABLE IF NOT EXISTS attempts (
          id INTEGER PRIMARY KEY,
          quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
          flashcard_set_id INTEGER,
          started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          completed_at TEXT,
          score INTEGER,
          total_questions INTEGER NOT NULL,
          mode TEXT NOT NULL DEFAULT 'normal',
          content_mode TEXT NOT NULL DEFAULT 'quiz'
        );
        CREATE TABLE IF NOT EXISTS attempt_answers (
          id INTEGER PRIMARY KEY,
          attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
          question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
          given_answer TEXT NOT NULL,
          is_correct INTEGER NOT NULL,
          answered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE(attempt_id, question_id)
        );
        CREATE TABLE IF NOT EXISTS flashcard_sets (
          id INTEGER PRIMARY KEY,
          source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          card_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE TABLE IF NOT EXISTS flashcards (
          id INTEGER PRIMARY KEY,
          set_id INTEGER NOT NULL REFERENCES flashcard_sets(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          front TEXT NOT NULL,
          back TEXT NOT NULL,
          hint TEXT NOT NULL DEFAULT '',
          source_excerpt TEXT NOT NULL DEFAULT '',
          task_key TEXT,
          UNIQUE(set_id, position)
        );
        CREATE TABLE IF NOT EXISTS flashcard_review_answers (
          id INTEGER PRIMARY KEY,
          review_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
          card_id INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
          is_known INTEGER NOT NULL,
          answered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE(review_id, card_id)
        );
        CREATE TABLE IF NOT EXISTS attempt_task_results (
          id INTEGER PRIMARY KEY,
          attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
          task_key TEXT NOT NULL,
          correct_count INTEGER NOT NULL,
          total_questions INTEGER NOT NULL,
          score INTEGER NOT NULL,
          UNIQUE(attempt_id, task_key)
        );
        CREATE TABLE IF NOT EXISTS notion_sync_requests (
          id INTEGER PRIMARY KEY,
          attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'queued',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          completed_at TEXT,
          UNIQUE(attempt_id)
        );
        CREATE TABLE IF NOT EXISTS generation_requests (
          id INTEGER PRIMARY KEY,
          workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
          prompt TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
        CREATE INDEX IF NOT EXISTS idx_sources_workspace ON sources(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_quizzes_source_created ON quizzes(source_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON attempts(quiz_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_flashcard_sets_source ON flashcard_sets(source_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_set ON attempts(flashcard_set_id, started_at DESC);
        "#,
    )?;
    connection.execute(
        "INSERT OR IGNORE INTO schema_migrations(version) VALUES (1)",
        [],
    )?;
    let workspace_columns = {
        let mut statement = connection.prepare("PRAGMA table_info(workspaces)")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    if !workspace_columns.iter().any(|column| column == "pinned") {
        connection.execute(
            "ALTER TABLE workspaces ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    Ok(())
}

fn query(connection: &Connection, sql: &str, params: Vec<JsonValue>) -> rusqlite::Result<JsonValue> {
    let values: Vec<Value> = params.into_iter().map(to_sql_value).collect();
    let mut statement = connection.prepare(sql)?;
    let columns: Vec<String> = statement.column_names().iter().map(|name| name.to_string()).collect();
    let mut rows = statement.query(params_from_iter(values))?;
    let mut output = Vec::new();
    while let Some(row) = rows.next()? {
        let mut object = Map::new();
        for (index, column) in columns.iter().enumerate() {
            object.insert(column.clone(), from_sql_value(row.get_ref(index)?));
        }
        output.push(JsonValue::Object(object));
    }
    Ok(JsonValue::Array(output))
}

fn execute(connection: &Connection, sql: &str, params: Vec<JsonValue>) -> rusqlite::Result<JsonValue> {
    let values: Vec<Value> = params.into_iter().map(to_sql_value).collect();
    let changed = connection.execute(sql, params_from_iter(values))?;
    Ok(json!({ "changes": changed, "last_insert_rowid": connection.last_insert_rowid() }))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = env::var("RECALL_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("recall.sqlite3"));
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();
    let mut stdout = io::BufWriter::new(io::stdout());

    let unlock_line = lines.next().ok_or("missing unlock request")??;
    let unlock: Request = serde_json::from_str(&unlock_line)?;
    if unlock.op != "unlock" {
        write_response(&mut stdout, error_response(unlock.id.as_deref(), "first request must unlock"))?;
        return Ok(());
    }
    let connection = Connection::open(path)?;
    initialize_schema(&connection)?;
    write_response(&mut stdout, response(unlock.id.as_deref(), json!({ "status": "ready" })))?;

    for line in lines {
        let line = line?;
        if line.trim().is_empty() { continue; }
        let request: Request = serde_json::from_str(&line)?;
        let id = request.id.clone();
        let result = match request.op.as_str() {
            "health" => Ok(json!({ "status": "ready" })),
            "query" => query(&connection, request.sql.as_deref().ok_or("missing sql")?, request.params.unwrap_or_default()),
            "exec" => execute(&connection, request.sql.as_deref().ok_or("missing sql")?, request.params.unwrap_or_default()),
            "close" => break,
            _ => Err(rusqlite::Error::InvalidParameterName("unknown operation".to_string())),
        };
        match result {
            Ok(value) => write_response(&mut stdout, response(id.as_deref(), value))?,
            Err(error) => write_response(&mut stdout, error_response(id.as_deref(), error))?,
        }
    }
    Ok(())
}
