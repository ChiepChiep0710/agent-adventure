// Fonte de agentes do Hermes Agent (AgentSource 'hermes', ver sources/source.ts).
//
// O Hermes grava tudo em ~/.hermes/state.db (SQLite em WAL): `sessions` (com `parent_session_id` para subagentes),
// `messages` (cada chamada de ferramenta) e `session_turn_leases` (turno aberto agora). Esta fonte lê o banco SÓ para
// leitura e alimenta o Office — nada é escrito no Hermes, nada sai da máquina.
//
// Presença (o Hermes não tem um registro de sessões abertas como o do Claude Code):
// - `session_turn_leases` com `expires_at` no futuro = turno rodando agora → 'working';
// - sem turno aberto, a sessão continua no escritório enquanto `last_activity_at` for recente
//   (PRESENCE_MS, 15 min por padrão): é o que o gateway/CLI deixou de "sessão aberta" — passado isso, o personagem
//   vai embora e volta na próxima mensagem;
// - `ended_at` preenchido = sessão encerrada → sai;
// - subagentes (`source = 'subagent'`): entram enquanto `ended_at` é nulo e entregam ao terminar.
//
// Sala: `sessions.cwd` só existe nas sessões de CLI (o gateway não grava), então o projeto sai dos caminhos que o
// agente tocou (ver project.ts) e, sem nenhum, de uma sala fictícia por canal (`~/.hermes/hermes-rooms/<canal>`).
//
// Atividade: as mensagens novas de cada sessão (cursor pelo id) viram atividades do escritório (activity.ts). Leitura
// incremental: nunca varre a tabela `messages` inteira (o banco do usuário passa fácil de 1 GB).
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Activity, AgentStats, AgentStatus, SourceInfo } from '../../../shared/types';
import type { AccountEntry, AccountsService } from '../../accounts/service';
import { errMsg, log } from '../../log';
import type { Office, TranscriptSummary } from '../../model/office';
import type { AgentSource } from '../source';
import { describeHermesTool, parseToolCalls, promptActivity, responseActivity, toActivity, userText } from './activity';
import { hermesDbPath, openHermesDb, type HermesDb, type HermesMessageRow, type HermesSessionRow } from './db';
import { absolutePathsIn, fallbackRoom, projectRootOf } from './project';
import { tr } from '../../../shared/i18n';

/** Sem turno aberto, quanto tempo a sessão ainda conta como aberta (15 min). */
export const PRESENCE_MS = 15 * 60_000;
/** Tempo que uma sessão precisa ficar fora para o personagem ir embora (evita piscar no fim de cada turno). */
export const CLOSE_AFTER_MISSING_MS = 5_000;
/** Janela de sessões lidas do banco (nada mais antigo que isto aparece). */
export const SCAN_WINDOW_MS = 12 * 3600_000;
/** Sessão sem projeto conhecido espera este tempo antes de entrar na sala fictícia (dá tempo de tocar um repo). */
export const ROOM_WAIT_MS = 20_000;
/** Atividades lidas ao abrir uma sessão (histórico, sem feed). */
const SEED_MESSAGES = 8;
/** Mensagens relidas no boot só para achar o projeto (a sala precisa do repositório, não das últimas falas). */
const SEED_SCAN_MESSAGES = 60;
/** Pendência de ferramenta sem resultado por mais que isto vira 'waiting' quando é uma pergunta ao usuário. */
export const WAIT_MIN_MS = 8_000;
/** Caminhos guardados por agente para achar o projeto (os primeiros que aparecerem). */
const MAX_PATHS = 80;
/** Atividades guardadas antes de o agente entrar no escritório. */
const BACKLOG_MAX = 120;

const ACCOUNT_ID = 'hermes';
const MAIN_ROLE = tr('Agente principal (Hermes)');
const SUB_ROLE = tr('Subagente (Hermes)');
const WAITING_ANSWER = tr('responder a uma pergunta');

export interface HermesSourceOptions {
  accounts: AccountsService;
  office: Office;
  /** Pasta de dados do Hermes (~/.hermes): onde ficam state.db e hermes-rooms/. */
  home: string;
  /**
   * Arquivo de nomes (JSON: `{ "<session-id>": "Nome" }`, até 24 caracteres), lido a cada ciclo quando muda. Sem
   * ele, os nomes são sorteados pelo escritório.
   */
  namesFile?: string;
  now?: () => number;
  pollMs?: number;
  /** Janela de presença sem turno aberto (padrão PRESENCE_MS). */
  presenceMs?: number;
  windowMs?: number;
  /** Injetável nos testes (fs real por padrão). */
  hasGitFile?: (dir: string) => boolean;
}

interface PendingTool {
  name: string;
  at: number;
}

interface MainAgent {
  id: string;
  sessionId: string;
  sessionKey: string | null;
  source: string;
  displayName: string | null;
  startedAt: number;
  cursor: number;
  inOffice: boolean;
  status: AgentStatus;
  waitingFor?: string;
  /** Ferramentas sem resultado, por id da chamada (para saber se está esperando você). */
  pending: Map<string, PendingTool>;
  roomId?: string;
  paths: string[];
  /** Último instante em que a sessão esteve "aberta" (turno ou atividade recente). */
  lastSeenAt: number;
  missingSince?: number;
  /** Atividades lidas antes de o agente entrar no escritório (viram histórico, sem feed). */
  backlog: Activity[];
  title?: string;
  model?: string;
  stats: AgentStats;
  subagents: number;
}

interface SubAgent {
  id: string;
  sessionId: string;
  parentId: string;
  cursor: number;
  inOffice: boolean;
  startedAt: number;
  title?: string;
  /** Atividades lidas antes de entrar no escritório (histórico, sem feed). */
  backlog: Activity[];
}

function statsOf(row: HermesSessionRow, subagents: number): AgentStats {
  const stats: AgentStats = {
    toolCalls: row.tool_call_count ?? 0,
    tokensIn: row.input_tokens ?? 0,
    tokensOut: row.output_tokens ?? 0,
    subagents,
  };
  if (row.estimated_cost_usd && row.estimated_cost_usd > 0) stats.costUSD = row.estimated_cost_usd;
  return stats;
}

function sameStats(a: AgentStats, b: AgentStats): boolean {
  return a.toolCalls === b.toolCalls && a.tokensIn === b.tokensIn && a.tokensOut === b.tokensOut && a.costUSD === b.costUSD && a.subagents === b.subagents;
}

/** Distingue principal de subagente (o principal guarda as pendências de ferramenta). */
function isMainAgent(a: MainAgent | SubAgent): a is MainAgent {
  return 'pending' in a;
}

/** Conta fictícia do Hermes: uma só, com a letra H (o Hermes não tem contas por config dir). */
function hermesAccount(home: string) {
  return {
    dir: home,
    detected: {
      id: ACCOUNT_ID,
      configDir: home,
      short: 'H',
      name: 'Hermes',
      color: '#5cc97b',
    },
  };
}

export class HermesSource implements AgentSource {
  readonly provider = 'hermes' as const;
  private db: HermesDb | undefined;
  private error: string | undefined;
  private mains = new Map<string, MainAgent>();
  private subs = new Map<string, SubAgent>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPollAt = 0;
  private stopped = false;
  /** Nomes do arquivo (opcional), recarregados quando o mtime muda. */
  private names: { mtimeMs: number; map: Map<string, string> } = { mtimeMs: -1, map: new Map() };
  private readonly now: () => number;
  private readonly presenceMs: number;
  private readonly windowMs: number;

  constructor(private readonly opts: HermesSourceOptions) {
    this.now = opts.now ?? Date.now;
    this.presenceMs = opts.presenceMs ?? PRESENCE_MS;
    this.windowMs = opts.windowMs ?? SCAN_WINDOW_MS;
    // Registra a conta antes de qualquer snapshot (o escritório mostra o chip "Hermes").
    this.opts.accounts.setProviderAccounts('hermes', [hermesAccount(opts.home)]);
  }

  /** Id da conta do Hermes no AccountsService. */
  get accountId(): string {
    return ACCOUNT_ID;
  }

  /** Conta do Hermes registrada (para o histórico/uso, quando houver). */
  accountEntries(): readonly AccountEntry[] {
    return this.opts.accounts.entriesOf('hermes');
  }

  async start(): Promise<void> {
    const path = hermesDbPath(this.opts.home);
    const opened = await openHermesDb(path);
    if (!opened.db) {
      this.error = opened.error ?? tr('não foi possível abrir {0}', [path]);
      log.warnOnce(`hermes-open:${this.error}`, tr('Hermes: escritório sem as sessões do Hermes ({0}).', [this.error]));
      return;
    }
    this.db = opened.db;
    this.boot();
    this.timer = setInterval(() => this.safePoll(), this.opts.pollMs ?? 1_000);
    this.timer.unref?.();
  }

  /** Reconstrói as sessões abertas sem gerar avisos (boot curto: poucas consultas indexadas). */
  boot(): void {
    if (!this.db) return;
    this.opts.office.beginBoot();
    try {
      this.poll(true);
    } catch (err) {
      log.warnOnce(`hermes-boot:${errMsg(err)}`, tr('Hermes: falha ao abrir as sessões: {0}', [errMsg(err)]));
    } finally {
      this.opts.office.endBoot();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.db?.close();
    this.db = undefined;
  }

  sources(): SourceInfo[] {
    let sessions = 0;
    for (const a of this.mains.values()) if (a.inOffice) sessions++;
    const info: SourceInfo = {
      label: ACCOUNT_ID,
      provider: 'hermes',
      path: this.opts.home,
      sessions,
      ok: !this.error,
    };
    if (this.error) info.error = this.error;
    return [info];
  }

  /** O Hermes não grava transcript em arquivo: o terminal do escritório não abre para estes agentes. */
  transcriptPathOf(): string | undefined {
    return undefined;
  }

  // ---------------------------------------------------------------- polling

  private safePoll(): void {
    try {
      this.poll(false);
    } catch (err) {
      log.warnOnce(`hermes-poll:${errMsg(err)}`, tr('Hermes: falha no ciclo de leitura: {0}', [errMsg(err)]));
    }
  }

  /**
   * Lê `namesFile` (opcional) quando ele muda no disco: `{ "<session-id ou id do agente>": "Nome" }`. Aceita também
   * `{ "…id…": { "name": "Nome" } }`, no mesmo formato do names.json do escritório. Arquivo ausente ou inválido só
   * deixa a lista vazia (o escritório sorteia os nomes) — nunca derruba a fonte.
   */
  private loadNames(): void {
    const file = this.opts.namesFile;
    if (!file) return;
    let mtimeMs: number;
    try {
      mtimeMs = statSync(file).mtimeMs;
    } catch {
      if (this.names.map.size) this.names = { mtimeMs: -1, map: new Map() };
      return;
    }
    if (mtimeMs === this.names.mtimeMs) return;
    const map = new Map<string, string>();
    try {
      const j = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        for (const [key, v] of Object.entries(j as Record<string, unknown>)) {
          const name = typeof v === 'string' ? v : (v as { name?: unknown } | null)?.name;
          if (typeof name === 'string' && name.trim()) map.set(key, name.trim());
        }
      }
    } catch (err) {
      log.warnOnce(`hermes-names:${errMsg(err)}`, tr('Hermes: nomes.json ilegível ({0}); nomes sorteados.', [errMsg(err)]));
    }
    this.names = { mtimeMs, map };
  }

  /** Nome pedido para o agente: tenta as chaves na ordem (id do agente, id da sessão). */
  private nameOf(...keys: string[]): string | undefined {
    for (const k of keys) {
      const n = this.names.map.get(k);
      if (n) return n;
    }
    return undefined;
  }

  private poll(boot = false): void {
    const db = this.db;
    if (!db || this.stopped) return;
    this.loadNames();
    const now = (this.lastPollAt = this.now());
    const nowSec = now / 1000;
    let leases: Map<string, number>;
    let rows: HermesSessionRow[];
    try {
      leases = db.leases();
      rows = db.sessionsSince(nowSec - this.windowMs / 1000, 300);
    } catch (err) {
      log.warnOnce(`hermes-query:${errMsg(err)}`, tr('Hermes: falha ao ler o banco: {0}', [errMsg(err)]));
      return;
    }

    const seenMains = new Set<string>();
    const seenSubs = new Set<string>();
    // Quantos subagentes cada principal tem agora (vem das linhas, não do mapa: o pai é lido antes do filho).
    const subCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.source !== 'subagent' || !row.parent_session_id) continue;
      subCounts.set(row.parent_session_id, (subCounts.get(row.parent_session_id) ?? 0) + 1);
    }
    // Principais primeiro: um subagente só entra se o pai está no escritório.
    for (const row of rows) {
      if (row.source === 'subagent') continue;
      const id = this.agentId(row.id);
      try {
        if (this.syncMain(row, leases, now, nowSec, boot, subCounts)) seenMains.add(id);
      } catch (err) {
        log.warnOnce(`hermes-main:${id}:${errMsg(err)}`, tr('Hermes: sessão {0}: {1}', [row.id, errMsg(err)]));
      }
    }
    for (const row of rows) {
      if (row.source !== 'subagent' || !row.parent_session_id) continue;
      const id = this.agentId(row.id);
      seenSubs.add(id);
      try {
        this.syncSub(row, now);
      } catch (err) {
        log.warnOnce(`hermes-sub:${id}:${errMsg(err)}`, tr('Hermes: subagente {0}: {1}', [row.id, errMsg(err)]));
      }
    }
    // Quem não aparece mais no banco (ou já passou da janela de presença): dá a folga e depois vai embora.
    for (const [id, a] of [...this.mains]) {
      if (seenMains.has(id)) {
        delete a.missingSince;
        continue;
      }
      a.missingSince ??= now;
      if (boot || now - a.missingSince < CLOSE_AFTER_MISSING_MS) continue;
      if (a.inOffice) this.opts.office.closeMain(id);
      this.mains.delete(id);
    }
    for (const id of [...this.subs.keys()]) if (!seenSubs.has(id)) this.subs.delete(id);
  }

  private agentId(sessionId: string): string {
    return `${ACCOUNT_ID}:${sessionId}`;
  }

  // ---------------------------------------------------------------- principais

  /** Um ciclo de uma sessão principal. Devolve false quando ela não está mais aberta (o poll fecha depois). */
  private syncMain(
    row: HermesSessionRow,
    leases: Map<string, number>,
    now: number,
    nowSec: number,
    boot: boolean,
    subCounts: ReadonlyMap<string, number>,
  ): boolean {
    const id = this.agentId(row.id);
    const busy = (leases.get(row.id) ?? 0) > nowSec;
    const lastActive = (row.last_activity_at ?? row.started_at ?? 0) * 1000;
    const present = row.ended_at === null && (busy || now - lastActive <= this.presenceMs);
    let a = this.mains.get(id);
    if (!a) {
      if (!present) return false;
      a = {
        id,
        sessionId: row.id,
        sessionKey: row.session_key,
        source: row.source,
        displayName: row.display_name,
        startedAt: (row.started_at ?? 0) * 1000,
        cursor: 0,
        inOffice: false,
        status: 'idle',
        pending: new Map(),
        paths: [],
        lastSeenAt: lastActive,
        backlog: [],
        stats: statsOf(row, 0),
        subagents: 0,
      };
      this.mains.set(id, a);
      this.seed(a);
    }
    if (!present) return false;
    a.lastSeenAt = Math.max(a.lastSeenAt, lastActive);
    a.subagents = subCounts.get(row.id) ?? 0;
    this.pump(a);

    const status = this.statusOf(a, busy, now);
    const waitingFor = status === 'waiting' ? WAITING_ANSWER : undefined;
    const room = this.roomOf(a, now, boot);
    if (!room) return true; // sessão nova sem projeto: entra daqui a pouco, com sala melhor
    if (!a.inOffice) {
      this.opts.office.addMain({
        id,
        provider: 'hermes',
        account: ACCOUNT_ID,
        sessionId: row.id,
        cwd: room,
        role: MAIN_ROLE,
        startedAt: a.startedAt,
        status,
        waitingFor,
        name: this.nameOf(id, row.id),
      });
      a.inOffice = this.opts.office.has(id);
      if (!a.inOffice) return true;
      this.flush(a);
    }
    this.opts.office.setStatus(id, status, waitingFor);
    a.status = status;
    if (waitingFor) a.waitingFor = waitingFor;
    else delete a.waitingFor;
    this.applySummary(a, row);
    if (status === 'working') this.opts.office.fillWorkingActivity(id);
    return true;
  }

  /** 'waiting' só para o que realmente trava o turno à espera de você (pergunta da ferramenta clarify). */
  private statusOf(a: MainAgent, busy: boolean, now: number): AgentStatus {
    for (const p of a.pending.values()) {
      if (p.name === 'clarify' && now - p.at >= WAIT_MIN_MS) return 'waiting';
    }
    return busy ? 'working' : 'idle';
  }

  /** Sala da sessão: projeto achado nos caminhos tocados; sem ele, a sala fictícia do canal. */
  private roomOf(a: MainAgent, now: number, boot: boolean): string | undefined {
    if (!a.roomId) {
      const root = projectRootOf(a.paths, {
        home: process.env.HOME || '',
        hermesHome: this.opts.home,
        ...(this.opts.hasGitFile ? { hasGit: this.opts.hasGitFile } : {}),
      });
      if (root) a.roomId = root;
      else if (boot || now - a.startedAt >= ROOM_WAIT_MS) a.roomId = fallbackRoom(this.opts.home, a.source, a.displayName);
      else return undefined;
    }
    return a.roomId;
  }

  /** Título, modelo e números da sessão (o Office compara e só marca sujo quando muda). */
  private applySummary(a: MainAgent, row: HermesSessionRow): void {
    const stats = statsOf(row, a.subagents);
    const title = row.title ?? undefined;
    const model = row.model ?? undefined;
    if (a.title === title && a.model === model && sameStats(a.stats, stats)) return;
    a.title = title;
    a.model = model;
    a.stats = stats;
    const summary: TranscriptSummary = { tasks: [], stats: { ...stats } };
    if (title) summary.title = title;
    if (model) summary.model = model;
    this.opts.office.applyTranscript(a.id, summary);
  }

  /**
   * Registra a atividade. Antes de o agente entrar no escritório (leituras iniciais), fica num backlog: o Office
   * ignora atividades de quem ainda não está na sala, e essas voltam como histórico quando ele entra.
   */
  private emit(a: MainAgent | SubAgent, act: Activity, live: boolean): void {
    if (!a.inOffice) {
      a.backlog.push(act);
      if (a.backlog.length > BACKLOG_MAX) a.backlog.splice(0, a.backlog.length - BACKLOG_MAX);
      return;
    }
    this.opts.office.addActivity(a.id, act, true, { feed: live });
  }

  /** Despeja o backlog como histórico (sem feed): só o que aconteceu antes de o personagem entrar. */
  private flush(a: MainAgent | SubAgent): void {
    const list = a.backlog;
    a.backlog = [];
    list.forEach((act, i) => this.opts.office.addActivity(a.id, act, i === list.length - 1, { feed: false }));
  }

  // ---------------------------------------------------------------- subagentes

  private syncSub(row: HermesSessionRow, now: number): void {
    const parentId = this.agentId(row.parent_session_id!);
    const parent = this.mains.get(parentId);
    if (!parent || !parent.inOffice) return;
    const id = this.agentId(row.id);
    const done = row.ended_at !== null;
    let s = this.subs.get(id);
    if (!s) {
      if (done) return; // nasceu e morreu entre dois ciclos: não vale uma entrada
      s = {
        id,
        sessionId: row.id,
        parentId,
        cursor: 0,
        inOffice: false,
        startedAt: (row.started_at ?? 0) * 1000,
        title: this.titleOf(row),
        backlog: [],
      };
      this.subs.set(id, s);
      this.seed(s);
    }
    if (done) {
      this.pump(s);
      if (s.inOffice) this.opts.office.completeSub(id);
      this.subs.delete(id);
      return;
    }
    this.pump(s);
    if (!s.inOffice) {
      const added = this.opts.office.addSub({
        id,
        parentId,
        sessionId: row.id,
        role: SUB_ROLE,
        ...(s.title ? { title: s.title } : {}),
        background: false,
        startedAt: s.startedAt,
        name: this.nameOf(id, row.id),
      });
      s.inOffice = added;
      if (!added) return;
      this.flush(s);
    }
    this.opts.office.setStatus(id, 'working');
    this.opts.office.fillWorkingActivity(id);
    // A sala do subagente é a do pai: o Office já cuida disso no addSub.
  }

  /** Título de um subagente = o pedido que o pai fez (primeira mensagem do usuário), curto. */
  private titleOf(row: HermesSessionRow): string | undefined {
    if (row.title) return row.title;
    const raw = this.db?.firstUserMessage(row.id);
    const text = userText(raw);
    if (!text) return undefined;
    const one = text.replace(/\s+/g, ' ').trim();
    return one.length > 72 ? `${one.slice(0, 71).trimEnd()}…` : one;
  }

  // ---------------------------------------------------------------- mensagens

  /** Histórico inicial: últimas mensagens como histórico (sem feed) e cursor no fim. */
  private seed(a: MainAgent | SubAgent): void {
    const rows = this.db?.lastMessages(a.sessionId, SEED_SCAN_MESSAGES) ?? [];
    const tail = Math.max(0, rows.length - SEED_MESSAGES);
    rows.forEach((m, i) => {
      a.cursor = Math.max(a.cursor, m.id);
      // As antigas servem só para achar a sala (o projeto está no começo da conversa, não nas últimas falas).
      if (i >= tail) this.applyMessage(a, m, false);
      else if (isMainAgent(a)) this.collectPaths(a, m);
    });
  }

  /** Guarda os caminhos absolutos tocados na mensagem (para achar o projeto da sala). */
  private collectPaths(a: MainAgent, m: HermesMessageRow): void {
    if (a.paths.length >= MAX_PATHS) return;
    for (const call of parseToolCalls(m.tool_calls)) {
      for (const p of absolutePathsIn(call.input)) {
        if (a.paths.length >= MAX_PATHS) return;
        if (!a.paths.includes(p)) a.paths.push(p);
      }
    }
  }

  /** Mensagens novas desde o cursor (leitura incremental, LIMIT no banco). */
  private pump(a: MainAgent | SubAgent): void {
    const rows = this.db?.messagesAfter(a.sessionId, a.cursor, 200) ?? [];
    for (const m of rows) {
      a.cursor = Math.max(a.cursor, m.id);
      this.applyMessage(a, m, true);
      if (isMainAgent(a) && m.role === 'assistant') a.lastSeenAt = Math.max(a.lastSeenAt, m.timestamp * 1000);
    }
  }

  private applyMessage(a: MainAgent | SubAgent, m: HermesMessageRow, live: boolean): void {
    const at = m.timestamp * 1000;
    const main = isMainAgent(a) ? a : undefined;
    if (m.role === 'assistant') {
      const calls = parseToolCalls(m.tool_calls);
      if (calls.length) {
        calls.forEach((call, i) => {
          const desc = describeHermesTool(call.name, call.input);
          const act: Activity = toActivity(`${a.id}#${m.id}:${i}`, at, desc, call.name);
          this.emit(a, act, live);
          if (main && call.id) main.pending.set(call.id, { name: call.name, at });
          if (main) this.collectPaths(a as MainAgent, m);
        });
        return;
      }
      const text = userText(m.content);
      if (text) this.emit(a, toActivity(`${a.id}#${m.id}`, at, responseActivity(text)), live);
      return;
    }
    if (m.role === 'tool') {
      if (main && m.tool_call_id) main.pending.delete(m.tool_call_id);
      return;
    }
    if (m.role === 'user') {
      // Uma instrução nova zera as pendências: o turno anterior acabou.
      if (main) main.pending.clear();
      const text = userText(m.content);
      if (!text) return;
      this.emit(a, toActivity(`${a.id}#${m.id}`, at, promptActivity(text), 'prompt'), live);
    }
  }

  // ---------------------------------------------------------------- uso (opcional)

  /** Caminho do banco lido (diagnóstico/testes). */
  get dbPath(): string {
    return this.db?.path ?? hermesDbPath(this.opts.home);
  }

  /** Último ciclo (testes). */
  get lastPoll(): number {
    return this.lastPollAt;
  }

  /** Um ciclo de leitura agora, fora do intervalo (testes). */
  refresh(): void {
    this.poll(false);
  }

  /** Verificação de que o banco existe na pasta informada. */
  static available(home: string): boolean {
    try {
      return statSync(join(home, 'state.db')).isFile();
    } catch {
      return false;
    }
  }
}
