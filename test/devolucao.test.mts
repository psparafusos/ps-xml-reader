// Devolução de cliente: a leitura de finNFe e NFref/refNFe, a finalidade
// com que a ferramenta ST abre e a decisão que não é lembrada. Dados
// inventados.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { analisarItem, type ItemFiscal } from '../src/fiscal/analise.ts';
import {
  decisaoValida,
  finalidadeInicial,
  finalidadeLembravel,
  lerDecisoes,
  chaveDecisao,
  type DecisaoLembrada,
  type EscolhaST,
} from '../src/fiscal/entrada.ts';
import { lerTabelaST } from '../src/fiscal/st.ts';
import { lerXlsx } from '../src/fiscal/xlsx.ts';
import { sugestaoHistorico } from '../src/historicoST.ts';
import { lerArquivo } from '../src/nfe/parser.ts';
import { decisaoDaLembrada, decisaoInicial } from '../src/previaST.ts';
import { ligarDomMinimo } from './apoioDom.mts';
import { xlsx } from './fiscal/fixtures/xlsx.mts';

// Chaves inventadas (44 dígitos): NF 1234 série 2 e NF 77 série 1.
const REF_1 = `282610${'0'.repeat(14)}550020000012341000012345`;
const REF_2 = `282609${'0'.repeat(14)}550010000000771000000771`;

const nfe = (ide: string) => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe28261100000000000000550010000000501000000500" versao="4.00">
      <ide><cUF>28</cUF><natOp>Devolucao de teste</natOp><mod>55</mod><serie>1</serie><nNF>50</nNF><dhEmi>2026-11-10T10:00:00-03:00</dhEmi><tpNF>1</tpNF>${ide}</ide>
      <emit><CNPJ>00000000000000</CNPJ><xNome>Cliente Inventado</xNome><enderEmit><UF>SE</UF></enderEmit></emit>
      <det nItem="1"><prod><cProd>D1</cProd><xProd>PARAFUSO INVENTADO</xProd><NCM>73181500</NCM><CFOP>5202</CFOP></prod></det>
    </infNFe>
  </NFe>
</nfeProc>`;

describe('leitura da finalidade e das notas referenciadas', () => {
  before(ligarDomMinimo);

  it('finNFe 4 com duas NFref/refNFe, na ordem da nota', () => {
    const { nota } = lerArquivo(
      nfe(
        `<finNFe>4</finNFe><NFref><refNFe>${REF_1}</refNFe></NFref><NFref><refNFe>${REF_2}</refNFe></NFref>`,
      ),
    );
    assert.equal(nota.ide.finNFe, '4');
    assert.deepEqual(nota.ide.refNFe, [REF_1, REF_2]);
  });

  it('NFref de outro tipo (refNF, modelo 1) não entra na lista', () => {
    const { nota } = lerArquivo(
      nfe(
        `<finNFe>4</finNFe><NFref><refNF><cUF>28</cUF><AAMM>2610</AAMM><CNPJ>00000000000000</CNPJ><mod>01</mod><serie>1</serie><nNF>9</nNF></refNF></NFref>`,
      ),
    );
    assert.equal(nota.ide.finNFe, '4');
    assert.deepEqual(nota.ide.refNFe, []);
  });

  it('nota normal: finNFe 1 e nenhuma referenciada; sem as tags, vazio', () => {
    assert.equal(lerArquivo(nfe('<finNFe>1</finNFe>')).nota.ide.finNFe, '1');
    const sem = lerArquivo(nfe('')).nota;
    assert.equal(sem.ide.finNFe, '');
    assert.deepEqual(sem.ide.refNFe, []);
  });

  it('cópia editada (.psxml) antiga abre e lê a finalidade da nota de dentro', () => {
    const copia = `<?xml version="1.0" encoding="UTF-8"?>
<psCopiaEditada xmlns="urn:psparafusos:ps-xml-reader" versao="1">
  <original>${nfe(`<finNFe>4</finNFe><NFref><refNFe>${REF_1}</refNFe></NFref>`).replace(/^<\?xml[^>]*>\s*/, '')}</original>
  <anotacoes><anotacao nItem="1">conferido</anotacao></anotacoes>
</psCopiaEditada>`;
    const lido = lerArquivo(copia);
    assert.equal(lido.copiaEditada, true);
    assert.equal(lido.nota.ide.finNFe, '4');
    assert.deepEqual(lido.nota.ide.refNFe, [REF_1]);
  });
});

// Planilha de ST inventada: verniz 3208 com ST.
const st = lerTabelaST(
  lerXlsx(
    xlsx('Tintas', [
      ['Versão: 0019'],
      ['Produção de efeitos a partir de 01/07/2023'],
      ['ANEXO XXIII - SEGMENTO: TINTAS E VERNIZES'],
      [
        'ITEM',
        'CEST',
        'NCM/SH',
        'Descrição',
        'MVA-ST Alíquota de 4%',
        'MVA-ST Alíquota de 7%',
        'MVA-ST Alíquota de 12%',
        'MVA-ST Alíquota de 19%',
      ],
      [1, '24.001.00', '3208', 'Tintas, vernizes', 0.62, 0.5694, 0.485, 0.35],
    ]),
  ),
);
const item = (p: Partial<ItemFiscal> = {}): ItemFiscal => ({
  nItem: '1',
  NCM: '73181500',
  orig: '0',
  CST: '00',
  pICMS: '7',
  CFOP: '5202',
  ...p,
});
const analise = analisarItem(item(), 'SE', { st });

const SEM_ST: EscolhaST = { tipo: 'sem-st' };
const lembrada = (p: Partial<DecisaoLembrada> = {}): DecisaoLembrada => ({
  escolha: SEM_ST,
  finalidade: 'revenda',
  raizCnpj: '11222333',
  fornecedor: 'Fornecedor Inventado',
  cProd: 'D1',
  xProd: 'PARAFUSO INVENTADO',
  ncm: '73181500',
  atualizadaEm: '2026-11-01T10:00:00.000Z',
  ...p,
});

describe('pré-seleção da finalidade na ferramenta ST', () => {
  it('finNFe 4: abre em Devolução de cliente; as outras, em Revenda', () => {
    assert.equal(finalidadeInicial('4'), 'devolucao');
    assert.equal(finalidadeInicial(' 4 '), 'devolucao');
    for (const f of ['1', '2', '3', '', undefined])
      assert.equal(finalidadeInicial(f), 'revenda');
  });

  it('nota de devolução: todos os itens em devolução, sem decisão lembrada', () => {
    assert.deepEqual(decisaoInicial('4', analise, null), {
      decisao: { escolha: null, finalidade: 'devolucao' },
      lembrada: false,
    });
    // Mesmo com uma decisão do mesmo código no arquivo, abre em devolução.
    assert.deepEqual(decisaoInicial('4', analise, lembrada()), {
      decisao: { escolha: null, finalidade: 'devolucao' },
      lembrada: false,
    });
  });

  it('nota normal: a lembrada que serve, como antes', () => {
    assert.deepEqual(decisaoInicial('1', analise, lembrada()), {
      decisao: { escolha: SEM_ST, finalidade: 'revenda' },
      lembrada: true,
    });
    // De outro NCM, não serve: automático.
    assert.deepEqual(
      decisaoInicial('1', analise, lembrada({ ncm: '32081020' })),
      {
        decisao: { escolha: null, finalidade: 'revenda' },
        lembrada: false,
      },
    );
  });
});

describe('devolução de cliente não é lembrada', () => {
  it('finalidade não lembrável e decisão recusada na gravação', () => {
    assert.equal(finalidadeLembravel('devolucao'), false);
    assert.equal(finalidadeLembravel('revenda'), true);
    assert.equal(decisaoValida(lembrada({ finalidade: 'devolucao' })), false);
    assert.equal(decisaoValida(lembrada()), true);
  });

  it('no arquivo, fica de fora; as outras continuam abrindo', () => {
    const boa = lembrada();
    const devolucao = lembrada({ cProd: 'D2', finalidade: 'devolucao' });
    const lidas = lerDecisoes({
      decisoes: {
        [chaveDecisao(boa.raizCnpj, boa.cProd)]: boa,
        [chaveDecisao(devolucao.raizCnpj, devolucao.cProd)]: devolucao,
      },
    });
    assert.deepEqual(Object.keys(lidas), ['11222333|D1']);
    assert.equal(decisaoDaLembrada(devolucao), null);
  });

  it('o histórico não sugere a partir de decisão de devolução', () => {
    const h = [
      lembrada({ cProd: 'A', finalidade: 'devolucao' }),
      lembrada({ cProd: 'B', finalidade: 'devolucao' }),
    ];
    assert.equal(sugestaoHistorico(analise, h, '99888777|NOVO'), null);
    // As mesmas, em revenda, sugerem.
    const r = [lembrada({ cProd: 'A' }), lembrada({ cProd: 'B' })];
    assert.equal(
      sugestaoHistorico(analise, r, '99888777|NOVO')?.tipo,
      'sugere',
    );
  });
});
