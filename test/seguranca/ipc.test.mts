// S11: todo canal entre a janela e o processo principal passa pelo
// envoltório de src/ipcSeguro.ts, que confere o remetente. Este teste falha
// se algum arquivo de src/ usar ipcMain direto (um canal novo sem a
// conferência).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const raiz = join(import.meta.dirname, '..', '..');
const src = join(raiz, 'src');

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? arquivos(join(pasta, e.name))
      : e.name.endsWith('.ts')
        ? [join(pasta, e.name)]
        : [],
  );
}

describe('segurança: canais só pelo envoltório (S11)', () => {
  it('ipcMain só aparece em src/ipcSeguro.ts', () => {
    const fora = arquivos(src)
      .filter((a) => !a.endsWith('ipcSeguro.ts'))
      .flatMap((a) =>
        readFileSync(a, 'utf8')
          .split(/\r?\n/)
          .map((linha, i) => ({ linha, i }))
          .filter(
            ({ linha }) =>
              /\bipcMain\b/.test(linha) && !/^\s*(\/\/|\*)/.test(linha),
          )
          .map(({ i }) => `${relative(raiz, a)}:${i + 1}`),
      );
    assert.deepEqual(fora, []);
  });

  it('o envoltório confere o quadro principal e a página do app', () => {
    const texto = readFileSync(join(src, 'ipcSeguro.ts'), 'utf8');
    assert.match(texto, /quadro === event\.sender\.mainFrame/);
    assert.match(texto, /remetenteValido\(/);
  });
});
