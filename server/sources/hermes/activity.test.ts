// Chamadas de ferramenta do Hermes → atividades do escritório (o formato OpenAI de `tool_calls` inclusive).
import { describe, expect, it } from 'vitest';
import { describeHermesTool, parseToolCalls, promptActivity, responseActivity, toActivity, userText } from './activity';

describe('parseToolCalls', () => {
  it('lê o formato do Hermes (argumentos em JSON string)', () => {
    const raw = JSON.stringify([
      { id: 'c1', type: 'function', function: { name: 'terminal', arguments: '{"command":"npm test"}' } },
    ]);
    expect(parseToolCalls(raw)).toEqual([{ id: 'c1', name: 'terminal', input: { command: 'npm test' } }]);
  });

  it('aceita argumentos já em objeto e o campo call_id', () => {
    const raw = JSON.stringify([{ call_id: 'c2', function: { name: 'read_file', arguments: { path: '/a/b.ts' } } }]);
    expect(parseToolCalls(raw)).toEqual([{ id: 'c2', name: 'read_file', input: { path: '/a/b.ts' } }]);
  });

  it('JSON inválido ou sem nome de função não vira chamada', () => {
    expect(parseToolCalls('não é json')).toEqual([]);
    expect(parseToolCalls(JSON.stringify([{ id: 'x' }]))).toEqual([]);
    expect(parseToolCalls(null)).toEqual([]);
  });
});

describe('describeHermesTool', () => {
  it('comando de terminal usa a heurística do escritório (teste, git, run)', () => {
    expect(describeHermesTool('terminal', { command: 'pytest -q' }).kind).toBe('test');
    expect(describeHermesTool('terminal', { command: 'git status' }).kind).toBe('git');
    expect(describeHermesTool('terminal', { command: 'npm run build' }).kind).toBe('run');
  });

  it('arquivos: leitura, edição e escrita com o nome do arquivo', () => {
    expect(describeHermesTool('read_file', { path: '/x/App.tsx' })).toMatchObject({ kind: 'read', text: expect.stringContaining('App.tsx') });
    expect(describeHermesTool('patch', { path: '/x/App.tsx' })).toMatchObject({ kind: 'edit', text: expect.stringContaining('App.tsx') });
    expect(describeHermesTool('write_file', { path: '/x/novo.md' })).toMatchObject({ kind: 'write', text: expect.stringContaining('novo.md') });
  });

  it('execução de código, delegação, pergunta e memória', () => {
    expect(describeHermesTool('execute_code', { code: 'import os\nprint(1)' }).kind).toBe('run');
    expect(describeHermesTool('delegate_task', { tasks: [{ goal: 'a' }, { goal: 'b' }] })).toMatchObject({ kind: 'delegate' });
    expect(describeHermesTool('clarify', { question: 'qual repo?' })).toMatchObject({ kind: 'ask' });
    expect(describeHermesTool('memory', {})).toMatchObject({ kind: 'other' });
  });

  it('ferramenta desconhecida não derruba a descrição', () => {
    const d = describeHermesTool('alguma_coisa_nova', { x: 1 });
    expect(d.text.length).toBeGreaterThan(0);
  });
});

describe('userText', () => {
  it('texto puro passa (cortado)', () => {
    expect(userText('  oi  ')).toBe('oi');
    expect(userText(null)).toBeUndefined();
  });

  it('lista de blocos: junta só os textos', () => {
    const blocks = JSON.stringify([{ type: 'text', text: 'primeira' }, { type: 'image', url: 'x' }, { type: 'text', text: 'segunda' }]);
    expect(userText(blocks)).toBe('primeira segunda');
  });

  it('conteúdo que começa com [ mas não é JSON volta como veio', () => {
    expect(userText('[ver log] erro no build')).toBe('[ver log] erro no build');
  });
});

describe('atividades montadas', () => {
  it('prompt e resposta viram atividades com kind próprio', () => {
    expect(promptActivity('arruma o bug do login')).toMatchObject({ kind: 'prompt', icon: '🗣️' });
    expect(responseActivity('pronto, corrigi')).toMatchObject({ kind: 'respond' });
  });

  it('toActivity leva id, instante e nome da ferramenta', () => {
    const a = toActivity('hermes:s1#7', 1_000, describeHermesTool('terminal', { command: 'ls' }), 'terminal');
    expect(a).toMatchObject({ id: 'hermes:s1#7', at: 1_000, tool: 'terminal' });
  });
});
