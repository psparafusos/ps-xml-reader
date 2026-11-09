// Limites do leitor genérico (src/xml/limites.ts): árvore até 20 MB, só
// texto até 100 MB, acima recusa sem ler. Os arquivos grandes são gerados em
// os.tmpdir() e apagados no fim; o de 150 MB é criado com ftruncate (só o
// tamanho importa: o conteúdo nunca é lido).
import assert from 'node:assert/strict';
import {
  closeSync,
  ftruncateSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { decodificarXml } from '../../src/xml/decodificar.ts';
import {
  avaliarTamanho,
  LIMITE_ARVORE_BYTES,
  LIMITE_TEXTO_BYTES,
  MENSAGEM_ARVORE_DESLIGADA,
} from '../../src/xml/limites.ts';
import { lerXml } from '../../src/xml/leitor.ts';

const MB = 1024 * 1024;

/** XML inventado de itens repetidos, com pelo menos `bytes` bytes. */
function xmlGrande(bytes: number): string {
  const item = (n: number) =>
    `  <det nItem="${n}"><prod><cProd>P${n}</cProd><xProd>PARAFUSO SEXTAVADO AÇO M8 x ${n} mm</xProd><vProd>${(n % 997) + 0.5}</vProd></prod></det>\n`;
  const partes = ['<?xml version="1.0" encoding="UTF-8"?>\n<lote>\n'];
  let total = partes[0].length;
  for (let n = 1; total < bytes; n++) {
    const p = item(n);
    partes.push(p);
    total += p.length;
  }
  partes.push('</lote>\n');
  return partes.join('');
}

describe('avaliarTamanho (só o stat)', () => {
  it('até 20 MB: árvore', () => {
    assert.deepEqual(avaliarTamanho(0), { modo: 'arvore', mensagem: null });
    assert.deepEqual(avaliarTamanho(LIMITE_ARVORE_BYTES), {
      modo: 'arvore',
      mensagem: null,
    });
  });

  it('de 20 MB a 100 MB: só texto, com aviso', () => {
    assert.deepEqual(avaliarTamanho(LIMITE_ARVORE_BYTES + 1), {
      modo: 'texto',
      mensagem: MENSAGEM_ARVORE_DESLIGADA,
    });
    assert.equal(avaliarTamanho(LIMITE_TEXTO_BYTES).modo, 'texto');
    assert.equal(
      MENSAGEM_ARVORE_DESLIGADA,
      'Arquivo grande: a árvore fica desligada.',
    );
  });

  it('acima de 100 MB: recusa com o tamanho', () => {
    assert.deepEqual(avaliarTamanho(240 * MB), {
      modo: 'recusado',
      mensagem: 'Este arquivo tem 240 MB, grande demais para o PS Reader.',
    });
    assert.equal(avaliarTamanho(LIMITE_TEXTO_BYTES + 1).modo, 'recusado');
  });
});

describe('Arquivos grandes de verdade em os.tmpdir()', () => {
  let pasta = '';
  before(() => {
    pasta = mkdtempSync(join(tmpdir(), 'ps-reader-xml-'));
  });
  after(() => {
    rmSync(pasta, { recursive: true, force: true });
  });

  it('1 MB: árvore, decodifica e lê sem erro', () => {
    const caminho = join(pasta, 'um-mega.xml');
    writeFileSync(caminho, xmlGrande(1 * MB));
    assert.equal(avaliarTamanho(statSync(caminho).size).modo, 'arvore');
    const dec = decodificarXml(readFileSync(caminho));
    assert.ok(dec.ok);
    const r = lerXml(dec.texto);
    assert.equal(r.erro, null);
    assert.ok(r.quantidade > 10000);
  });

  it('21 MB: só texto pelo stat; o leitor ainda aguenta sem erro', () => {
    const caminho = join(pasta, 'vinte-e-um.xml');
    writeFileSync(caminho, xmlGrande(21 * MB));
    const tamanho = statSync(caminho).size;
    assert.ok(tamanho > LIMITE_ARVORE_BYTES);
    assert.equal(avaliarTamanho(tamanho).modo, 'texto');
    const dec = decodificarXml(readFileSync(caminho));
    assert.ok(dec.ok);
    assert.equal(dec.codificacao, 'utf-8');
    assert.equal(lerXml(dec.texto).erro, null);
  });

  it('150 MB: recusado pelo stat, sem ler o conteúdo', () => {
    const caminho = join(pasta, 'cento-e-cinquenta.xml');
    const fd = openSync(caminho, 'w');
    try {
      ftruncateSync(fd, 150 * MB);
    } finally {
      closeSync(fd);
    }
    const tamanho = statSync(caminho).size;
    assert.equal(tamanho, 150 * MB);
    assert.deepEqual(avaliarTamanho(tamanho), {
      modo: 'recusado',
      mensagem: 'Este arquivo tem 150 MB, grande demais para o PS Reader.',
    });
  });
});
