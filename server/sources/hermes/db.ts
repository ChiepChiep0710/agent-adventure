// Banco do Hermes Agent (~/.hermes/state.db), só para LEITURA.
//
// O Hermes grava tudo o que o escritório precisa num SQLite em WAL: `sessions` (uma linha por sessão, com
// `parent_session_id` para os subagentes), `messages` (cada chamada de ferramenta com `tool_name`/`tool_calls`) e
// `session_turn_leases` (quem está com um turno aberto agora). Nada aqui escreve: o banco é aberto com readOnly e o
// Hermes nem percebe que está sendo lido.
//
// O schema é do Hermes, não nosso: `openHermesDb` confere as colunas de que dependemos e devolve um erro legível em
// vez de estourar no meio de um ciclo de polling quando uma versão nova mudar alguma coisa.
import { join } from 'node:path';

/** Colunas de `sessions` que usamos (todas opcionais menos id/source/started_at). */
export interface HermesSessionRow {
  id: string;
  source: string;
  session_key: string | null;
  parent_session_id: string | null;
  title: string | null;
  display_name: string | null;
  chat_id: string | null;
  model: string | null;
  started_at: number;
  ended_at: number | null;
  last_activity_at: number | null;
  tool_call_count: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
}

export interface HermesMessageRow {
  id: number;
  role: string;
  tool_name: string | null;
  tool_call_id: string | null;
  tool_calls: string | null;
  content: string | null;
  timestamp: number;
}

export interface HermesDb {
  readonly path: string;
  /** Sessões com início OU última atividade depois de `sinceSec` (epoch em segundos), as mais novas primeiro. */
  sessionsSince(sinceSec: number, limit?: number): HermesSessionRow[];
  /** Sessão pelo id, mesmo que antiga (usada para o pai de um subagente). */
  sessionById(id: string): HermesSessionRow | undefined;
  /** conversation_id -> expires_at (epoch segundos) dos turnos abertos agora. */
  leases(): Map<string, number>;
  /** Mensagens da sessão com id > afterId, na ordem. */
  messagesAfter(sessionId: string, afterId: number, limit?: number): HermesMessageRow[];
  /** As últimas n mensagens da sessão (para abrir o histórico sem replay). */
  lastMessages(sessionId: string, n: number): HermesMessageRow[];
  /** Maior id de mensagem da sessão (0 se não houver). */
  maxMessageId(sessionId: string): number;
  /** Primeira mensagem do usuário (nos subagentes, é o pedido que o pai fez). */
  firstUserMessage(sessionId: string): string | undefined;
  close(): void;
}

/** API mínima do `node:sqlite` que usamos (evita depender dos tipos experimentais do Node). */
interface SqliteStatement {
  all(...params: Array<string | number | null>): unknown[];
  get(...params: Array<string | number | null>): unknown;
}
interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}
interface SqliteModule {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase;
}

const SQLITE_SPEC = 'node:sqlite';
/** Colunas de `sessions` que o escritório lê. Sem elas não há como montar a sala. */
const REQUIRED_SESSION_COLUMNS = ['id', 'source', 'started_at'] as const;

const SESSION_COLUMNS = [
  'id',
  'source',
  'session_key',
  'parent_session_id',
  'title',
  'display_name',
  'chat_id',
  'model',
  'started_at',
  'ended_at',
  'last_activity_at',
  'tool_call_count',
  'input_tokens',
  'output_tokens',
  'estimated_cost_usd',
];

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asSession(raw: unknown): HermesSessionRow | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const id = text(r.id);
  if (!id) return undefined;
  const row: HermesSessionRow = {
    id,
    source: text(r.source) ?? '',
    session_key: text(r.session_key) ?? null,
    parent_session_id: text(r.parent_session_id) ?? null,
    title: text(r.title) ?? null,
    display_name: text(r.display_name) ?? null,
    chat_id: text(r.chat_id) ?? null,
    model: text(r.model) ?? null,
    started_at: num(r.started_at) ?? 0,
    ended_at: num(r.ended_at) ?? null,
    last_activity_at: num(r.last_activity_at) ?? null,
    tool_call_count: num(r.tool_call_count) ?? null,
    input_tokens: num(r.input_tokens) ?? null,
    output_tokens: num(r.output_tokens) ?? null,
    estimated_cost_usd: num(r.estimated_cost_usd) ?? null,
  };
  return row;
}

function asMessage(raw: unknown): HermesMessageRow | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const id = num(r.id);
  if (id === undefined) return undefined;
  return {
    id,
    role: text(r.role) ?? '',
    tool_name: text(r.tool_name) ?? null,
    tool_call_id: text(r.tool_call_id) ?? null,
    tool_calls: text(r.tool_calls) ?? null,
    content: text(r.content) ?? null,
    timestamp: num(r.timestamp) ?? 0,
  };
}

/** Caminho do banco do Hermes para uma pasta de dados (`~/.hermes`). */
export function hermesDbPath(home: string): string {
  return join(home, 'state.db');
}

/**
 * Abre o banco do Hermes só para leitura. Nunca lança: devolve `error` quando o arquivo não existe, o módulo
 * `node:sqlite` não está disponível (Node < 22.5) ou o schema não tem o que precisamos.
 */
export async function openHermesDb(path: string): Promise<{ db?: HermesDb; error?: string }> {
  let mod: SqliteModule;
  try {
    mod = (await import(SQLITE_SPEC)) as unknown as SqliteModule;
  } catch {
    return { error: 'node:sqlite indisponível (requer Node 22.5+)' };
  }
  if (typeof mod.DatabaseSync !== 'function') return { error: 'node:sqlite sem DatabaseSync' };
  let raw: SqliteDatabase;
  try {
    raw = new mod.DatabaseSync(path, { readOnly: true });
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err).slice(0, 200) };
  }

  try {
    const cols = new Set(
      (raw.prepare("SELECT name FROM pragma_table_info('sessions')").all() as Array<Record<string, unknown>>).map(
        (c) => String(c.name ?? ''),
      ),
    );
    const missing = REQUIRED_SESSION_COLUMNS.filter((c) => !cols.has(c));
    if (missing.length) {
      raw.close();
      return { error: `schema sem ${missing.join(', ')} em sessions` };
    }
    // Colunas que podem faltar em versões antigas viram NULL em vez de derrubar a consulta.
    const select = SESSION_COLUMNS.map((c) => (cols.has(c) ? c : `NULL AS ${c}`)).join(', ');
    // O WAL pode ter páginas ainda não copiadas: um busy_timeout curto evita "database is locked" num checkpoint.
    try {
      raw.prepare('PRAGMA busy_timeout = 500').get();
    } catch {
      /* readOnly em alguns builds recusa pragma de escrita; seguir sem ele. */
    }

    const stmtSessionsSince = raw.prepare(
      `SELECT ${select} FROM sessions WHERE started_at >= ? OR (last_activity_at IS NOT NULL AND last_activity_at >= ?)
       ORDER BY COALESCE(last_activity_at, started_at) DESC LIMIT ?`,
    );
    const stmtSessionById = raw.prepare(`SELECT ${select} FROM sessions WHERE id = ? LIMIT 1`);
    const stmtLeases = raw.prepare('SELECT conversation_id, expires_at FROM session_turn_leases');
    const msg = 'id, role, tool_name, tool_call_id, tool_calls, content, timestamp';
    const stmtAfter = raw.prepare(
      `SELECT ${msg} FROM messages WHERE session_id = ? AND id > ? AND active = 1 ORDER BY id LIMIT ?`,
    );
    const stmtLast = raw.prepare(
      `SELECT ${msg} FROM messages WHERE session_id = ? AND active = 1 ORDER BY id DESC LIMIT ?`,
    );
    const stmtMaxId = raw.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM messages WHERE session_id = ?');
    const stmtFirstUser = raw.prepare(
      "SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY id LIMIT 1",
    );

    const db: HermesDb = {
      path,
      sessionsSince(sinceSec, limit = 200) {
        return stmtSessionsSince
          .all(sinceSec, sinceSec, limit)
          .map(asSession)
          .filter((r): r is HermesSessionRow => !!r);
      },
      sessionById(id) {
        return asSession(stmtSessionById.get(id));
      },
      leases() {
        const out = new Map<string, number>();
        for (const row of stmtLeases.all() as Array<Record<string, unknown>>) {
          const id = text(row.conversation_id);
          const exp = num(row.expires_at);
          if (id && exp !== undefined) out.set(id, exp);
        }
        return out;
      },
      messagesAfter(sessionId, afterId, limit = 200) {
        return stmtAfter
          .all(sessionId, afterId, limit)
          .map(asMessage)
          .filter((r): r is HermesMessageRow => !!r);
      },
      lastMessages(sessionId, n) {
        return stmtLast
          .all(sessionId, n)
          .map(asMessage)
          .filter((r): r is HermesMessageRow => !!r)
          .reverse();
      },
      maxMessageId(sessionId) {
        const row = stmtMaxId.get(sessionId) as Record<string, unknown> | undefined;
        return num(row?.n) ?? 0;
      },
      firstUserMessage(sessionId) {
        const row = stmtFirstUser.get(sessionId) as Record<string, unknown> | undefined;
        return text(row?.content) ?? undefined;
      },
      close() {
        try {
          raw.close();
        } catch {
          /* já fechado */
        }
      },
    };
    return { db };
  } catch (err) {
    try {
      raw.close();
    } catch {
      /* ignore */
    }
    return { error: String(err instanceof Error ? err.message : err).slice(0, 200) };
  }
}
