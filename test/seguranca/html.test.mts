// Regra da tela: texto vindo da NF-e, do .psxml ou de qualquer arquivo entra
// por textContent ou append, nunca como HTML ou código. Este teste falha se
// aparecer em src/ algum ponto que monta HTML ou executa texto.
// Comentários são ignorados (os de src/dom.ts e src/renderer.ts citam a regra).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const raiz = join(import.meta.dirname, '..', '..');
const src = join(raiz, 'src');

const PROIBIDOS: [string, RegExp][] = [
  ['innerHTML', /\binnerHTML\b/],
  ['outerHTML', /\bouterHTML\b/],
  ['insertAdjacentHTML', /\binsertAdjacentHTML\b/],
  ['document.write', /\bdocument\s*\.\s*write(?:ln)?\b/],
  ['eval', /(?<![\w$.])eval\s*\(/],
  ['new Function', /\bnew\s+Function\s*\(/],
];

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? arquivos(join(pasta, e.name))
      : /\.(ts|mts|js|html)$/.test(e.name)
        ? [join(pasta, e.name)]
        : [],
  );
}

/**
 * Linha sem comentário: linhas de bloco (/* e *) somem, e "//" no começo ou
 * depois de espaço corta o resto. "//" colado (https://) não é comentário.
 */
function semComentario(linha: string): string {
  const t = linha.trim();
  if (t.startsWith('*') || t.startsWith('/*')) return '';
  const m = /(?:^|\s)\/\/(?:\s|$)/.exec(linha);
  return m ? linha.slice(0, m.index) : linha;
}

describe('segurança: nada monta HTML nem executa texto em src/', () => {
  it('nenhum innerHTML, outerHTML, insertAdjacentHTML, document.write, eval ou new Function', () => {
    const achados: string[] = [];
    for (const arquivo of arquivos(src)) {
      readFileSync(arquivo, 'utf8')
        .split(/\r?\n/)
        .forEach((linha, i) => {
          const codigo = semComentario(linha);
          for (const [nome, re] of PROIBIDOS)
            if (re.test(codigo))
              achados.push(`${relative(raiz, arquivo)}:${i + 1} ${nome}`);
        });
    }
    assert.deepEqual(achados, []);
  });

  it('o teste acha cada um quando aparece no código', () => {
    const exemplos = [
      'el.innerHTML = texto;',
      'el.outerHTML = x',
      "el.insertAdjacentHTML('beforeend', x)",
      'document.write(x)',
      'eval(texto)',
      "new Function('return 1')",
    ];
    exemplos.forEach((codigo, i) =>
      assert.ok(PROIBIDOS[i][1].test(semComentario(codigo)), codigo),
    );
    assert.equal(semComentario('// nunca por innerHTML'), '');
    assert.equal(semComentario(' * nunca por innerHTML'), '');
  });
});
