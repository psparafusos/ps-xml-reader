// Barreiras antes de ler NF-e e .psxml (src/seguranca): DOCTYPE e ENTITY
// recusados antes de qualquer parser (T1 a T5 do plano de segurança) e
// tamanho conferido antes de ler (T7). Arquivos de ataque inventados, em
// test/seguranca/fixtures; nada aqui chega a um parser de XML nem à rede.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { lerDocumento } from '../../src/nfe/parser.ts';
import { lerXmlSeguro, type Disco } from '../../src/seguranca/arquivo.ts';
import {
  ArquivoRecusadoError,
  LIMITE_NFE_BYTES,
  MENSAGEM_DOCTYPE,
  problemaTamanhoNfe,
  verificarXmlSeguro,
} from '../../src/seguranca/xml.ts';

const pasta = join(import.meta.dirname, 'fixtures');
const ataque = (nome: string) => readFileSync(join(pasta, nome), 'utf8');

const ATAQUES = [
  ['T1, arquivo do PC (file:///C:/Windows/win.ini)', 'xxe-arquivo.xml'],
  ['T2, rede por http (exemplo.invalid)', 'xxe-http.xml'],
  ['T3, compartilhamento UNC (\\\\exemplo.invalid)', 'xxe-unc.xml'],
  ['T4, bomba de entidades', 'bomba-entidades.xml'],
  ['T5, entidades recursivas e de parâmetro', 'entidade-recursiva.xml'],
] as const;

// NF-e mínima inventada, sem DTD.
const NFE_LIMPA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe>
<infNFe Id="NFe35261100000000000000550010000000011000000010" versao="4.00">
<det nItem="1"><prod><xProd>PARAFUSO &amp; PORCA &lt;M8&gt;</xProd></prod></det>
<infAdic><infCpl><![CDATA[Texto com DOCTYPE escrito por extenso]]></infCpl></infAdic>
</infNFe></NFe></nfeProc>`;

const MB = 1024 * 1024;

/** Disco falso: o tamanho e o conteúdo dados; anota se leu. */
function disco(tamanho: number, conteudo?: Uint8Array) {
  const visto = { leu: false };
  const d: Disco = {
    tamanho: async () => tamanho,
    ler: async () => {
      visto.leu = true;
      if (!conteudo) assert.fail('não deveria ler o arquivo');
      return conteudo;
    },
  };
  return { d, visto };
}

describe('segurança: DOCTYPE e ENTITY recusados antes do parser', () => {
  for (const [titulo, arquivo] of ATAQUES) {
    it(`${titulo}: recusa com a mensagem`, () => {
      assert.equal(verificarXmlSeguro(ataque(arquivo)), MENSAGEM_DOCTYPE);
    });

    it(`${titulo}: lerDocumento (janela) recusa antes do DOMParser`, () => {
      // No Node não existe DOMParser: se a barreira falhasse, o erro seria
      // outro (ReferenceError) e o teste falharia.
      assert.throws(
        () => lerDocumento(ataque(arquivo)),
        (e: unknown) =>
          e instanceof ArquivoRecusadoError && e.message === MENSAGEM_DOCTYPE,
      );
    });

    it(`${titulo}: lerXmlSeguro (processo principal) recusa`, async () => {
      const bytes = readFileSync(join(pasta, arquivo));
      const { d } = disco(bytes.length, bytes);
      await assert.rejects(
        lerXmlSeguro('C:\\teste\\ataque.xml', d),
        (e: unknown) =>
          e instanceof ArquivoRecusadoError && e.message === MENSAGEM_DOCTYPE,
      );
    });
  }

  it('a mensagem é a combinada', () => {
    assert.equal(
      MENSAGEM_DOCTYPE,
      'Este arquivo tem uma declaração DOCTYPE, que NF-e não usa. Por segurança ele não foi aberto.',
    );
  });

  it('sem diferenciar maiúsculas, e ENTITY sozinho também', () => {
    for (const t of [
      '<!doctype nfeProc><nfeProc/>',
      '<!DocType x>',
      '<nfeProc><!entity x "y"></nfeProc>',
      '<!Entity % p "q">',
    ])
      assert.equal(verificarXmlSeguro(t), MENSAGEM_DOCTYPE, t);
  });

  it('NF-e sem DTD passa, mesmo com &amp;, &lt; e a palavra DOCTYPE no texto', () => {
    assert.equal(verificarXmlSeguro(NFE_LIMPA), null);
  });

  it('a recusa é imediata (sem expandir nada)', () => {
    const inicio = performance.now();
    verificarXmlSeguro(ataque('bomba-entidades.xml'));
    assert.ok(performance.now() - inicio < 100);
  });
});

describe('segurança: tamanho antes de ler (T7)', () => {
  it('200 MB: recusa sem ler o arquivo, com a mensagem do plano', async () => {
    const { d, visto } = disco(200 * MB);
    await assert.rejects(
      lerXmlSeguro('C:\\teste\\grande.xml', d),
      (e: unknown) =>
        e instanceof ArquivoRecusadoError &&
        e.message ===
          'Este arquivo tem 200 MB, grande demais para uma NF-e (limite de 50 MB).',
    );
    assert.equal(visto.leu, false);
  });

  it('o limite é 50 MB: exatamente 50 passa, um byte a mais não', () => {
    assert.equal(LIMITE_NFE_BYTES, 50 * MB);
    assert.equal(problemaTamanhoNfe(50 * MB), null);
    assert.equal(
      problemaTamanhoNfe(50 * MB + 1),
      'Este arquivo tem 51 MB, grande demais para uma NF-e (limite de 50 MB).',
    );
  });

  it('arquivo que cresceu entre o stat e a leitura também é recusado', async () => {
    // Só o tamanho importa: a recusa vem antes de decodificar.
    const crescido = { byteLength: 60 * MB } as Uint8Array;
    const { d } = disco(1000, crescido);
    await assert.rejects(
      lerXmlSeguro('C:\\teste\\cresceu.xml', d),
      ArquivoRecusadoError,
    );
  });

  it('NF-e normal: devolve o texto decodificado como UTF-8, igual a antes', async () => {
    // Com BOM: o texto sai com ele, como o readFile(..., 'utf8') de antes.
    const texto = `﻿${NFE_LIMPA.replace('PARAFUSO', 'PARAFUSO SEXTAVADO AÇO Nº 8')}`;
    const bytes = Buffer.from(texto, 'utf8');
    const { d } = disco(bytes.length, bytes);
    assert.equal(await lerXmlSeguro('C:\\teste\\nota.xml', d), texto);
  });
});
