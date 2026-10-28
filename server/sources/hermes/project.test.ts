// Sala do Hermes a partir dos caminhos tocados: só `.git` define projeto; o resto vira a sala fictícia do canal.
import { describe, expect, it } from 'vitest';
import { absolutePathsIn, fallbackRoom, projectRootOf } from './project';

const HOME = '/Users/ana';
const HERMES = '/Users/ana/.hermes';

describe('absolutePathsIn', () => {
  it('acha caminhos em comando de shell, em campos e em listas', () => {
    expect(absolutePathsIn({ command: 'cd /repo/x && npm test' })).toEqual(['/repo/x']);
    expect(absolutePathsIn({ path: '/repo/x/a.ts', pattern: 'foo' })).toEqual(['/repo/x/a.ts']);
    expect(absolutePathsIn({ tasks: [{ goal: 'ler /repo/y/b.md' }] })).toEqual(['/repo/y/b.md']);
  });

  it('ignora relativo, URL e texto sem barra', () => {
    expect(absolutePathsIn({ path: 'src/a.ts', url: 'https://x/y', note: 'oi' })).toEqual([]);
  });

  it('para no limite de caminhos guardados', () => {
    const long = { command: Array.from({ length: 200 }, (_, i) => `/p/${i}`).join(' ') };
    expect(absolutePathsIn(long).length).toBeLessThanOrEqual(80);
  });
});

describe('projectRootOf', () => {
  it('sobe até a pasta com .git e escolhe a mais frequente', () => {
    const o = { home: HOME, hermesHome: HERMES, hasGit: (d: string) => d === '/Users/ana/dev/app' };
    const paths = ['/Users/ana/dev/app/src/a.ts', '/Users/ana/dev/app/tests/b.ts', '/Users/ana/outro/c.ts'];
    expect(projectRootOf(paths, o)).toBe('/Users/ana/dev/app');
  });

  it('sem repositório nos caminhos, não inventa sala', () => {
    const o = { home: HOME, hermesHome: HERMES, hasGit: () => false };
    expect(projectRootOf(['/Users/ana/tmp/a.txt'], o)).toBeUndefined();
  });

  it('o banco e a pasta do Hermes nunca são projeto (nem a home, nem /tmp)', () => {
    const o = { home: HOME, hermesHome: HERMES, hasGit: () => true };
    expect(projectRootOf([`${HERMES}/state.db`], o)).toBeUndefined();
    expect(projectRootOf([`${HOME}/.hermes/hermes-rooms/x/y`], o)).toBeUndefined();
    expect(projectRootOf([`${HOME}/a.txt`], o)).toBeUndefined();
    expect(projectRootOf(['/tmp/x/a.txt'], o)).toBeUndefined();
  });

  it('caminho de arquivo dentro do repo também acha a raiz (sobe a partir da pasta)', () => {
    const o = { home: HOME, hermesHome: HERMES, hasGit: (d: string) => d === '/Users/ana/dev/app' };
    expect(projectRootOf(['/Users/ana/dev/app/README.md'], o)).toBe('/Users/ana/dev/app');
  });
});

describe('fallbackRoom', () => {
  it('usa o canal do Discord quando o nome da sessão tem um', () => {
    const room = fallbackRoom(HERMES, 'discord', 'Jira-bot / #hieunm-xplat / thread tal');
    expect(room).toBe(`${HERMES}/hermes-rooms/hieunm-xplat`);
  });

  it('sem canal, usa a plataforma', () => {
    expect(fallbackRoom(HERMES, 'tui', null)).toBe(`${HERMES}/hermes-rooms/tui`);
    expect(fallbackRoom(HERMES, 'discord', 'sem canal aqui')).toBe(`${HERMES}/hermes-rooms/discord`);
  });
});
