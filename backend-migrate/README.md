# PostgreSQL to local SQLite migration

This one-shot Bun utility copies Recall’s existing PostgreSQL rows into the local SQLite database used by the desktop app. It preserves primary keys, relationships, timestamps, question choices, attempts, answer history, flashcard reviews, task results, sync requests, and queued generation requests.

Run a non-mutating count check first:

```sh
DATABASE_URL=postgres://... \
bun run migrate --dry-run
```

Then run the import against an empty/new SQLite database:

```sh
DATABASE_URL=postgres://... \
bun run migrate
```

The importer upserts by the original IDs, so retrying is safe. It never deletes existing local data unless `--replace` is supplied together with `RECALL_ALLOW_REPLACE=1`.

Optional variables:

- `RECALL_DB_PATH` — local SQLite path; defaults to `./.data/recall.sqlite3`.
- `RECALL_DB_BRIDGE` — compiled `recall-native-db` bridge path; otherwise the debug bridge is used.
