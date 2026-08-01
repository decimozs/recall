# Recall agent instructions

@/Users/decimozs/.codex/RTK.md

- Preserve existing Recall data and IDs during migrations.
- This repository is desktop-only. Do not reintroduce browser, Docker, or PostgreSQL runtime implementations.
- Keep `backend/migrate` only as an offline, one-time data import utility.
- Do not commit `.env`, credentials, database files, build artifacts, or sidecar binaries.
- Apple signing and notarization are intentionally deferred.
- The `docs/` directory is ignored for this repository; keep essential setup and architecture notes in `README.md`.
