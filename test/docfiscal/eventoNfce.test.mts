// Eventos da NF-e (src/docfiscal/evento.ts) e DANFE NFC-e
// (src/docfiscal/nfce.ts), com os XML inventados de test/janela/fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DOMParserMinimo } from '../apoioDom.mts';
import { lerEvento, modeloEvento } from '../../src/docfiscal/evento.ts';
import {
  CONTINGENCIA_NFCE,
  HOMOLOGACAO_NFCE,
  lerNfce,
  modeloNfce,
  TITULO_NFCE,
} from '../../src/docfiscal/nfce.ts';
import {
  identificar,
  tipoPeloComeco,
  type ElementoXml,
} from '../../src/docfiscal/tipo.ts';

const fixture = (nome: string) =>
  readFileSync(new URL(`../janela/fixtures/${nome}`, import.meta.url), 'utf8');
const raiz = (xml: string) =>
  new DOMParserMinimo().parseFromString(xml).documentElement as ElementoXml;

describe('evento da NF-e', () => {
  it('carta de correção: tipo, chave, protocolo, correção e condição de uso', () => {
    const d = lerEvento(raiz(fixture('d04-evento-cce.xml')));
    assert.equal(d.tipo, 'Carta de Correção');
    assert.equal(d.codigo, '110110');
    assert.equal(d.chave, '28261187654321000198550010000012341123456789');
    assert.equal(d.autor, '87.654.321/0001-98');
    assert.equal(d.orgao, '28 - SE');
    assert.equal(d.dhEvento, '06/11/2026 10:15:00');
    assert.equal(d.protocolo, '128260000012345');
    assert.equal(d.dhRegistro, '06/11/2026 10:15:30');
    assert.equal(d.situacao, '135 - Evento registrado e vinculado a NF-e');
    assert.deepEqual(d.detalhes, [
      {
        rotulo: 'Correção',
        valor:
          'Onde se le volumes 10, leia-se volumes 12. Correcao inventada para teste.',
      },
    ]);
    assert.match(d.condicaoUso, /^A Carta de Correcao e disciplinada/);
    const m = modeloEvento(d);
    assert.equal(m.titulo, 'CARTA DE CORREÇÃO');
    assert.equal(m.marca, null);
    assert.match(m.rodape, /montada pelo PS Reader a partir do XML/);
    const nota = m.blocos.find((b) => b.chave === 'nota');
    assert.deepEqual(
      nota?.linhas?.[1].map((c) => c.valor),
      ['87.654.321/0001-98', '55', '1', '1234'],
    );
    assert.ok(m.blocos.some((b) => b.titulo === 'CONDIÇÃO DE USO'));
  });

  it('cancelamento: protocolo da nota e justificativa; homologação', () => {
    const d = lerEvento(raiz(fixture('d05-evento-cancelamento.xml')));
    assert.equal(d.tipo, 'Cancelamento');
    assert.deepEqual(
      d.detalhes.map((x) => x.rotulo),
      ['Protocolo de Autorização da NF-e', 'Justificativa'],
    );
    assert.equal(
      modeloEvento(d).marca,
      'AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL',
    );
  });

  it('cancelamento no leiaute antigo (procCancNFe)', () => {
    const xml = fixture('d06-cancelamento-antigo.xml');
    assert.equal(tipoPeloComeco('procCancNFe', xml), 'evento-nfe');
    assert.equal(identificar(raiz(xml)).tipo, 'evento-nfe');
    const d = lerEvento(raiz(xml));
    assert.equal(d.leiauteAntigo, true);
    assert.equal(d.tipo, 'Cancelamento');
    assert.equal(d.protocolo, '128100000000222');
    assert.equal(d.situacao, '101 - Cancelamento de NF-e homologado');
    assert.equal(
      d.detalhes[1].valor,
      'Cancelamento inventado para teste do leiaute antigo.',
    );
  });
});

describe('DANFE NFC-e', () => {
  const xml = fixture('d07-nfce.xml');
  const d = lerNfce(raiz(xml));

  it('identifica como NFC-e pelo modelo 65', () => {
    assert.equal(identificar(raiz(xml)).tipo, 'nfce');
  });

  it('leitura: emitente, itens, totais, pagamento, consulta e QR Code', () => {
    assert.equal(d.emitente.documento, '65.432.100/0001-32');
    assert.equal(d.itens.length, 2);
    assert.deepEqual(d.itens[0], {
      codigo: '7001',
      descricao: 'BROCA DE ACO RAPIDO 8MM INVENTADA',
      quantidade: '2',
      unidade: 'UN',
      unitario: '18,50',
      total: '37,00',
    });
    assert.equal(d.totais.produtos, '46,90');
    assert.equal(d.totais.desconto, '1,90');
    assert.equal(d.totais.pagar, '45,00');
    assert.ok(d.totais.temAjuste);
    assert.deepEqual(d.pagamentos, [{ forma: 'Dinheiro', valor: '50,00' }]);
    assert.equal(d.troco, '5,00');
    assert.equal(d.urlChave, 'www.nfce.fazenda.uf.test/consulta');
    assert.match(
      d.qrCode,
      /\?p=28261165432100000132650010000004561123456781\|2\|2\|1\|/,
    );
    assert.equal(d.protocolo, '228260000004567');
  });

  it('modelo: as divisões do manual, com a mensagem de homologação', () => {
    const m = modeloNfce(d);
    assert.equal(
      m.cabecalho[0],
      'CNPJ: 65.432.100/0001-32 Mercado Inventado de Ferragens Ltda',
    );
    assert.equal(m.cabecalho[2], TITULO_NFCE);
    assert.deepEqual(m.colunas, [
      'Código',
      'Descrição',
      'Qtde',
      'Un',
      'Vl Unit',
      'Vl Total',
    ]);
    assert.deepEqual(
      m.totais.map((t) => t[0]),
      [
        'Qtde. total de itens',
        'Valor total R$',
        'Acréscimos (frete, seguro e outras despesas) R$',
        'Desconto R$',
        'Valor a Pagar R$',
      ],
    );
    assert.deepEqual(m.pagamentos, [
      ['Dinheiro', '50,00'],
      ['Troco R$', '5,00'],
    ]);
    assert.equal(
      m.consulta.chave,
      '2826 1165 4321 0000 0132 6500 1000 0004 5611 2345 6781',
    );
    assert.deepEqual(m.consumidor, [
      'CONSUMIDOR CNPJ: 12.345.678/0001-95',
      'Loja Inventada de Parafusos Ltda',
    ]);
    assert.deepEqual(m.identificacao, [
      'NFC-e nº 456 Série 1 08/11/2026 16:45:10',
      'Protocolo de autorização: 228260000004567',
      'Data de autorização: 08/11/2026 16:45:12',
    ]);
    assert.deepEqual(m.mensagemFiscal, [HOMOLOGACAO_NFCE]);
    assert.equal(m.contribuinte, 'Venda inventada para teste. Volte sempre.');
    assert.equal(m.contingencia, null);
  });

  it('sem consumidor e em contingência: textos do manual, sem protocolo', () => {
    const outro = xml
      .replace(/<dest>[\s\S]*?<\/dest>/, '')
      .replace('<tpEmis>1</tpEmis>', '<tpEmis>9</tpEmis>')
      .replace('<vDesc>1.90</vDesc>', '<vDesc>0.00</vDesc>');
    const m = modeloNfce(lerNfce(raiz(outro)));
    assert.deepEqual(m.consumidor, ['CONSUMIDOR NÃO IDENTIFICADO']);
    assert.deepEqual(m.contingencia, CONTINGENCIA_NFCE);
    assert.equal(m.identificacao.length, 1);
    assert.equal(m.totais.length, 2);
  });
});
