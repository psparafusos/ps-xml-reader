// O medidor (scripts/medir-cadastro.mjs) contra as 6 NF-e inventadas de
// test/fixtures/cadastro, numa pasta temporária apagada no fim.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = join(raiz, 'test', 'fixtures', 'cadastro');
let pasta = '';
let medicao = '';
let naoCasados: string[][] = [];

before(() => {
  pasta = mkdtempSync(join(tmpdir(), 'ps-medidor-'));
  execFileSync(
    process.execPath,
    [
      join(raiz, 'scripts', 'medir-cadastro.mjs'),
      fixtures,
      join(fixtures, 'cadastro.json'),
      join(fixtures, 'gabarito.csv'),
    ],
    { cwd: pasta, stdio: 'pipe' },
  );
  medicao = readFileSync(join(pasta, 'medicao.md'), 'utf8');
  naoCasados = readFileSync(join(pasta, 'nao-casados.csv'), 'utf8')
    .replace(/^﻿/, '')
    .trim()
    .split('\r\n')
    .map((l) => l.split(';'));
});

after(() => rmSync(pasta, { recursive: true, force: true }));

const celula = (rotulo: string) => {
  const l = medicao.split('\n').find((x) => x.startsWith(`| ${rotulo} |`));
  assert.ok(l, `sem a linha "${rotulo}"`);
  return l
    .split('|')
    .slice(2, -1)
    .map((c) => c.trim());
};

describe('medidor nas NF-e inventadas', () => {
  it('visão geral', () => {
    assert.deepEqual(celula('Notas'), ['6']);
    assert.deepEqual(celula('Itens'), ['24']);
    assert.deepEqual(celula('Notas de devolução (finNFe 4)'), ['1']);
    assert.deepEqual(celula('Notas já lançadas (chave em notas_lancadas)'), [
      '1',
    ]);
    assert.deepEqual(
      celula('Notas de emitente sem cadastro (nem o CNPJ nem a raiz)'),
      ['1'],
    );
  });

  it('todos os caminhos aparecem, e os sem sugestão', () => {
    assert.deepEqual(celula('a) vínculo exato do emitente')[0], '9');
    assert.deepEqual(
      celula('b) vínculo exato de outro CNPJ da mesma raiz (filial)')[0],
      '3',
    );
    assert.deepEqual(
      celula('c) código sem espaços e sem zeros à esquerda, no emitente')[0],
      '3',
    );
    assert.deepEqual(
      celula('c) código sem espaços e sem zeros à esquerda, na raiz')[0],
      '1',
    );
    assert.deepEqual(
      celula('d) cEAN da nota contra os vínculos do emitente')[0],
      '0',
    );
    assert.deepEqual(
      celula('f) cEAN da nota contra os vínculos da raiz (filial)')[0],
      '0',
    );
    assert.deepEqual(
      celula('e) cEAN da nota contra o código de barras')[0],
      '4',
    );
    assert.deepEqual(
      celula('g) cProd com cara de EAN contra o código de barras')[0],
      '1',
    );
    assert.deepEqual(celula('sem sugestão')[0], '3');
    assert.match(
      medicao,
      /Ambíguos \(mais de um produto no caminho que decidiu\): 3 /,
    );
  });

  it('contra o gabarito: o erro do código reaproveitado vem com aviso', () => {
    assert.deepEqual(celula('Itens comparados'), ['22']);
    assert.deepEqual(celula('Acertos'), ['17 (77,3%)']);
    assert.deepEqual(celula('Erros (sugeriu outro produto)'), ['1 (4,5%)']);
    assert.deepEqual(celula('Erros que vieram com aviso'), ['1']);
    assert.deepEqual(celula('Ambíguos com o certo entre os candidatos'), ['3']);
    assert.match(medicao, /fator sugerido 1 \(UN\), lançado 10 \(nota em CX\)/);
  });

  it('nao-casados.csv: sem sugestão, ambíguos e o erro, com o lançado', () => {
    const [cab, ...linhas] = naoCasados;
    assert.equal(linhas.length, 7);
    const i = (c: string) => cab.indexOf(c);
    const erro = linhas.find((l) => l[i('situacao')] === 'erro');
    assert.ok(erro);
    assert.equal(erro[i('cProd')], 'D-600');
    assert.equal(erro[i('sugerido')], '600');
    assert.equal(erro[i('lancado')], '610');
    assert.match(erro[i('avisos')], /reaproveitado/);
    const devolucao = linhas.find(
      (l) => l[i('arquivo')] === 'nfe-6-devolucao.xml',
    );
    assert.equal(devolucao?.[i('situacao')], 'sem sugestão');
  });
});
