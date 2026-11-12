// Preparo para a tela do leitor genérico (src/xml/preparar.ts): modo árvore,
// modo leve, profundidade, recusas, DOCTYPE e controles. Dados inventados.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LIMITE_ARVORE_BYTES } from '../../src/xml/limites.ts';
import { prepararLeitura } from '../../src/xml/preparar.ts';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('prepararLeitura', () => {
  it('XML pequeno: árvore, linhas e codificação declarada', () => {
    const r = prepararLeitura(
      bytes('<?xml version="1.0" encoding="UTF-8"?><a x="1"><b>Olá</b></a>'),
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.modo, 'arvore');
    assert.equal(r.semArvore, null);
    assert.equal(r.codificacao.codificacao, 'utf-8');
    assert.equal(r.codificacao.origem, 'declaracao');
    assert.equal(r.erro, null);
    assert.equal(r.doctype, false);
    assert.ok(r.arvore && r.arvore.quantidade >= 3);
    assert.equal(r.linhas.quantidade, 4);
    assert.ok(r.texto.startsWith('<?xml'));
  });

  it('malformado: erro com linha e coluna, árvore até onde deu', () => {
    const r = prepararLeitura(bytes('<a>\n  <b>\n</a>'));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.erro);
    assert.equal(r.erro.linha, 3);
    assert.equal(r.erro.coluna, 1);
    assert.match(r.erro.motivo, /não corresponde/);
    assert.ok(r.arvore && r.arvore.quantidade === 2);
  });

  it('DOCTYPE fica como texto e é avisado', () => {
    const r = prepararLeitura(
      bytes('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///c:/x">]><a>&x;</a>'),
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.doctype, true);
    assert.equal(r.erro, null);
  });

  it('mais de 1.000 níveis: sem árvore, só texto', () => {
    const r = prepararLeitura(
      bytes(`${'<a>'.repeat(1001)}${'</a>'.repeat(1001)}`),
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.modo, 'texto');
    assert.equal(r.semArvore, 'profundidade');
    assert.equal(r.arvore, null);
    assert.equal(r.erro, null);
    // O <a></a> do meio fica numa linha só.
    assert.equal(r.linhas.quantidade, 2001);
  });

  it('acima de 20 MB: modo leve, sem montar a árvore', () => {
    const linha = '<item codigo="1">PARAFUSO INVENTADO</item>\n';
    const vezes = Math.ceil((LIMITE_ARVORE_BYTES + 10) / linha.length);
    const r = prepararLeitura(
      bytes(`<!DOCTYPE lista><lista>\n${linha.repeat(vezes)}</lista>`),
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.modo, 'texto');
    assert.equal(r.semArvore, 'tamanho');
    assert.equal(r.arvore, null);
    assert.equal(r.doctype, true);
    assert.equal(r.linhas.quantidade, vezes + 3);
  });

  it('recusa binário e vazio com a mensagem do motor', () => {
    const binario = prepararLeitura(new Uint8Array([0x3c, 0x61, 0, 1, 2]));
    assert.deepEqual(binario.ok ? null : [binario.motivo, binario.mensagem], [
      'binario',
      'Este arquivo não parece um XML (tem bytes de arquivo binário).',
    ]);
    const vazio = prepararLeitura(bytes('  \r\n'));
    assert.deepEqual(vazio.ok ? null : vazio.motivo, 'vazio');
  });

  it('conta os caracteres de controle', () => {
    const r = prepararLeitura(bytes('<a>x\u0001y&#x2;</a>'));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.controles, 2);
  });
});
