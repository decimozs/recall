import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

type BridgeResponse = { id?: string; ok: boolean; result?: unknown; error?: string };

export class DatabaseBridge {
  private readonly bridgePath: string;
  private readonly dbPath: string;
  private process: ReturnType<typeof Bun.spawn> | null = null;
  private nextId = 1;
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readerTask: Promise<void> | null = null;

  constructor(options: { bridgePath?: string; dbPath?: string } = {}) {
    this.bridgePath = options.bridgePath || process.env.RECALL_DB_BRIDGE || '../native/target/debug/recall-native-db';
    this.dbPath = options.dbPath || process.env.RECALL_DB_PATH || './.data/recall.sqlite3';
  }

  async start() {
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.process = Bun.spawn([this.bridgePath], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'inherit',
      env: { ...process.env, RECALL_DB_PATH: this.dbPath }
    });
    this.readerTask = this.readResponses();
    await this.call('unlock');
  }

  private async readResponses() {
    if (!this.process?.stdout) return;
    const reader = this.process.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const response = JSON.parse(line) as BridgeResponse;
        const pending = response.id ? this.pending.get(response.id) : undefined;
        if (!pending) continue;
        this.pending.delete(response.id);
        if (response.ok) pending.resolve(response.result);
        else pending.reject(new Error(response.error || 'Database bridge request failed'));
      }
    }
  }

  async call(op: string, payload: Record<string, unknown> = {}) {
    if (!this.process?.stdin) throw new Error('Database bridge is not running');
    const id = String(this.nextId++);
    const request = JSON.stringify({ id, op, ...payload }) + '\n';
    const result = new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.process.stdin.write(request);
    await this.process.stdin.flush();
    return result;
  }

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return this.call('query', { sql, params }) as Promise<T[]>;
  }

  exec(sql: string, params: unknown[] = []) {
    return this.call('exec', { sql, params }) as Promise<{ changes: number; last_insert_rowid: number }>;
  }

  async close() {
    if (!this.process) return;
    await this.call('close');
    this.process.stdin?.end();
    this.process = null;
  }
}
