// Integração da fonte do Hermes: um ~/.hermes de mentira (state.db sintético com o schema do Hermes 0.21), o
// AccountsService e o Office de verdade. Nada aqui lê o banco do usuário.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Activity, AgentInfo } from '../../../shared/types';
import { AccountsService } from '../../accounts/service';
import { setQuiet } from '../../log';
import { NameStore } from '../../model/names';
import { Office } from '../../model/office';
import { openHermesDb } from './db';
import { PRESENCE_MS, ROOM_WAIT_MS, WAIT_MIN_MS, HermesSource } from './source';

setQuiet(true);

const REPO = '/Users/ana/dev/app';
const SESSION = 'sess-1';
const AGENT = `hermes:${SESSION}`;

interface Fixture {
  dir: string;
  connect(): Promise<DbHandle>;
  cleanup(): void;
}

interface DbHandle {
  exec(sql: string, ...params: Array<string | number | null>): void;
  query<T = Record<string, unknown>>(sql: string, ...params: Array<string | number | null>): T[];
  close(): void;
}

/** Cria uma pasta de dados do Hermes com o schema mínimo que a fonte usa (colunas do Hermes 0.21). */
function hermesHome(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'habblaud-hermes-'));
  const SCHEMA = [
    `CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, session_key TEXT, parent_session_id TEXT,
       title TEXT, display_name TEXT, chat_id TEXT, model TEXT, started_at REAL NOT NULL, ended_at REAL,
       last_activity_at REAL, tool_call_count INTEGER, input_tokens INTEGER, output_tokens INTEGER,
       estimated_cost_usd REAL)`,
    `CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL,
       content TEXT, tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL NOT NULL,
       active INTEGER NOT NULL DEFAULT 1)`,
    `CREATE TABLE session_turn_leases (conversation_id TEXT PRIMARY KEY, holder TEXT NOT NULL,
       acquired_at REAL NOT NULL, expires_at REAL NOT NULL)`,
  ];
  return {
    dir,
    async connect() {
      const mod = (await import('node:sqlite')) as unknown as {
        DatabaseSync: new (path: string) => {
          exec(sql: string): void;
          prepare(sql: string): { all(...p: Array<string | number | null>): unknown[]; run(...p: Array<string | number | null>): void };
          close(): void;
        };
      };
      const db = new mod.DatabaseSync(join(dir, 'state.db'));
      for (const sql of SCHEMA) db.exec(sql);
      return {
        exec: (sql, ...params) => db.prepare(sql).run(...params),
        query: <T,>(sql: string, ...params: Array<string | number | null>) => db.prepare(sql).all(...params) as T[],
        close: () => db.close(),
      };
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

let cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups) c();
  cleanups = [];
});

interface SessionSeed {
  id?: string;
  source?: string;
  parent?: string;
  title?: string;
  display?: string;
  startedAt: number;
  endedAt?: number;
  lastActivityAt?: number;
  toolCalls?: number;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
}

async function setup(seed: (db: DbHandle, now: number) => void, opts: { now?: number } = {}) {
  const home = hermesHome();
  cleanups.push(home.cleanup);
  const db = await home.connect();
  cleanups.push(() => db.close());
  let clock = opts.now ?? Date.now();
  const now = () => clock;
  const late: { office?: Office } = {};
  const accounts = new AccountsService({ dirs: [], home: home.dir, env: {}, now, onChange: () => late.office?.markDirty() });
  const office = new Office({
    names: new NameStore(null),
    version: 'teste',
    startedAt: clock,
    accounts: (s) => accounts.list(s),
    sources: () => [],
    accountName: (id) => accounts.find(id)?.detected.name,
    now,
  });
  late.office = office;
  seed(db, clock);
  const source = new HermesSource({
    accounts,
    office,
    home: home.dir,
    now,
    pollMs: 3600_000,
    hasGitFile: (dir) => dir === REPO,
  });
  cleanups.unshift(() => source.stop());
  await source.start();
  return {
    db,
    office,
    accounts,
    source,
    home,
    advance(ms: number) {
      clock += ms;
    },
    refresh() {
      source.refresh();
    },
  };
}

const sec = (ms: number) => ms / 1000;

function addSession(db: DbHandle, s: SessionSeed): void {
  db.exec(
    'INSERT INTO sessions (id, source, session_key, parent_session_id, title, display_name, started_at, ended_at, last_activity_at, tool_call_count, input_tokens, output_tokens, estimated_cost_usd) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    s.id ?? SESSION,
    s.source ?? 'discord',
    `agent:main:discord:thread:${s.id ?? SESSION}`,
    s.parent ?? null,
    s.title ?? null,
    s.display ?? 'Jira-bot / #hieunm-xplat / thread',
    sec(s.startedAt),
    s.endedAt === undefined ? null : sec(s.endedAt),
    sec(s.lastActivityAt ?? s.startedAt),
    s.toolCalls ?? 0,
    s.tokensIn ?? 0,
    s.tokensOut ?? 0,
    s.cost ?? 0,
  );
}

function addToolCall(db: DbHandle, at: number, name: string, input: Record<string, unknown>, callId = `call-${Math.random().toString(16).slice(2)}`): void {
  db.exec(
    'INSERT INTO messages (session_id, role, tool_calls, timestamp) VALUES (?,?,?,?)',
    SESSION,
    'assistant',
    JSON.stringify([{ id: callId, type: 'function', function: { name, arguments: JSON.stringify(input) } }]),
    sec(at),
  );
}

function addToolResult(db: DbHandle, at: number, callId: string): void {
  db.exec('INSERT INTO messages (session_id, role, tool_name, tool_call_id, content, timestamp) VALUES (?,?,?,?,?,?)', SESSION, 'tool', 'terminal', callId, '{}', sec(at));
}

function lease(db: DbHandle, sessionId: string, expiresAt: number): void {
  db.exec('INSERT INTO session_turn_leases (conversation_id, holder, acquired_at, expires_at) VALUES (?,?,?,?)', sessionId, 'teste', sec(Date.now()) - 1, sec(expiresAt));
}

function agentOf(office: Office): AgentInfo {
  const a = office.get(AGENT);
  expect(a, 'agente do Hermes no escritório').toBeTruthy();
  return a!;
}

describe('HermesSource: presença e status', () => {
  it('turno aberto (lease) = working, sala do repositório tocado e atividade do comando', async () => {
    const t = await setup((db, now) => {
      addSession(db, { startedAt: now - 60_000, lastActivityAt: now - 1_000 });
      addToolCall(db, now - 30_000, 'terminal', { command: `cd ${REPO} && pytest -q` }, 'c1');
      addToolResult(db, now - 29_000, 'c1');
      lease(db, SESSION, now + 60_000);
    });
    const a = agentOf(t.office);
    expect(a).toMatchObject({ kind: 'main', provider: 'hermes', status: 'working', account: 'hermes' });
    expect(t.office.roomPath(a.roomId)).toBe(REPO);
    const detail = t.office.detail(AGENT)!;
    const acts = detail.history.map((x: Activity) => x.kind);
    expect(acts).toContain('test');
  });

  it('sem lease e com atividade recente = idle (sessão ainda aberta)', async () => {
    const t = await setup((db, now) => {
      addSession(db, { startedAt: now - 120_000, lastActivityAt: now - 1_000 });
    });
    expect(agentOf(t.office).status).toBe('idle');
  });

  it('passada a janela de presença, o personagem sai (offline)', async () => {
    const t = await setup((db, now) => {
      addSession(db, { startedAt: now - 60_000, lastActivityAt: now - 1_000 });
    });
    expect(agentOf(t.office).status).toBe('idle');
    t.advance(PRESENCE_MS + 60_000);
    t.refresh();
    t.advance(10_000);
    t.refresh();
    expect(t.office.get(AGENT)?.status).toBe('offline');
  });

  it('sessão encerrada (ended_at) não entra no escritório', async () => {
    const t = await setup((db, now) => {
      addSession(db, { startedAt: now - 60_000, endedAt: now - 30_000, lastActivityAt: now - 1_000 });
    });
    expect(t.office.get(AGENT)).toBeUndefined();
  });

  it('sem projeto conhecido, espera antes de cair na sala do canal', async () => {
    // Nada no banco no boot: a sessão nova aparece depois, já com o servidor rodando.
    const t = await setup(() => undefined);
    addSession(t.db, { startedAt: t.source.lastPoll, lastActivityAt: t.source.lastPoll, display: 'Jira-bot / #hieunm-xplat / tal' });
    t.refresh();
    // Sessão recém-criada, nenhum caminho tocado: ainda não entra.
    expect(t.office.get(AGENT)).toBeUndefined();
    t.advance(ROOM_WAIT_MS + 1_000);
    t.db.exec('UPDATE sessions SET last_activity_at = ? WHERE id = ?', sec(t.source.lastPoll), SESSION);
    t.refresh();
    const a = agentOf(t.office);
    expect(t.office.roomPath(a.roomId)).toBe(join(t.home.dir, 'hermes-rooms', 'hieunm-xplat'));
  });

  it('números da sessão viram stats do agente', async () => {
    const t = await setup((db, now) => {
      addSession(db, { startedAt: now - 60_000, lastActivityAt: now - 1_000, toolCalls: 12, tokensIn: 3400, tokensOut: 900, cost: 0.42, title: 'Arrumar o build' });
    });
    const a = agentOf(t.office);
    expect(a.stats).toMatchObject({ toolCalls: 12, tokensIn: 3400, tokensOut: 900, costUSD: 0.42 });
    expect(a.title).toBe('Arrumar o build');
  });
});

describe('HermesSource: espera por você', () => {
  it('pergunta (clarify) sem resposta vira waiting depois do tempo mínimo', async () => {
    const t = await setup((db, now) => {
      addSession(db, { startedAt: now - 60_000, lastActivityAt: now - 1_000 });
      addToolCall(db, now - 1_000, 'clarify', { question: 'qual repo?' }, 'q1');
      lease(db, SESSION, now + 60_000);
    });
    // Menos de WAIT_MIN_MS desde a chamada: ainda aparece trabalhando.
    expect(agentOf(t.office).status).toBe('working');
    t.advance(WAIT_MIN_MS + 1_000);
    t.refresh();
    expect(agentOf(t.office).status).toBe('waiting');
  });

  it('resposta da ferramenta tira o waiting', async () => {
    const t = await setup((db, now) => {
      addSession(db, { startedAt: now - 60_000, lastActivityAt: now - 1_000 });
      addToolCall(db, now - 30_000, 'clarify', { question: 'qual repo?' }, 'q2');
      lease(db, SESSION, now + 60_000);
    });
    t.advance(WAIT_MIN_MS + 1_000);
    t.refresh();
    expect(agentOf(t.office).status).toBe('waiting');
    addToolResult(t.db, t.source.lastPoll, 'q2');
    t.refresh();
    expect(agentOf(t.office).status).toBe('working');
  });
});

describe('HermesSource: subagentes', () => {
  it('subagente em andamento entra na sala do pai; ao terminar, entrega e sai', async () => {
    const t = await setup((db, now) => {
      addSession(db, { startedAt: now - 120_000, lastActivityAt: now - 1_000 });
      addSession(db, { id: 'sub-1', source: 'subagent', parent: SESSION, startedAt: now - 60_000, lastActivityAt: now - 1_000 });
      db.exec('INSERT INTO messages (session_id, role, content, timestamp) VALUES (?,?,?,?)', 'sub-1', 'user', 'Arrumar os testes do handler', sec(now - 59_000));
      lease(db, SESSION, now + 60_000);
    });
    const sub = t.office.get('hermes:sub-1');
    expect(sub, 'subagente no escritório').toBeTruthy();
    expect(sub!).toMatchObject({ kind: 'sub', parentId: AGENT, status: 'working', title: 'Arrumar os testes do handler' });
    // O pai reconhece o filho nas stats.
    expect(agentOf(t.office).stats.subagents).toBe(1);
    // Concluiu: status done (e o Office o retira depois da graça).
    t.db.exec('UPDATE sessions SET ended_at = ? WHERE id = ?', sec(t.source.lastPoll), 'sub-1');
    t.refresh();
    expect(t.office.get('hermes:sub-1')?.status).toBe('done');
  });

  it('subagente sem o pai no escritório não entra', async () => {
    const t = await setup((db, now) => {
      addSession(db, { id: 'sub-2', source: 'subagent', parent: 'sess-inexistente', startedAt: now - 60_000, lastActivityAt: now - 1_000 });
    });
    expect(t.office.get('hermes:sub-2')).toBeUndefined();
  });
});

describe('openHermesDb', () => {
  it('banco sem as colunas do Hermes devolve erro legível (não estoura)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'habblaud-hermes-bad-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const mod = (await import('node:sqlite')) as unknown as { DatabaseSync: new (p: string) => { exec(s: string): void; close(): void } };
    const raw = new mod.DatabaseSync(join(dir, 'state.db'));
    raw.exec('CREATE TABLE outra (x INTEGER)');
    raw.close();
    const res = await openHermesDb(join(dir, 'state.db'));
    expect(res.db).toBeUndefined();
    expect(res.error).toMatch(/sessions/);
  });

  it('arquivo inexistente devolve erro em vez de lançar', async () => {
    const res = await openHermesDb('/nao/existe/state.db');
    expect(res.db).toBeUndefined();
    expect(res.error).toBeTruthy();
  });
});
