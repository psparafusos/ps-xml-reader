// Ferramenta "ST, MVA e CFOP", quadro de escolha do item: a linha das outras
// linhas da planilha com o mesmo começo de NCM, e a frase "não é da linha
// automotiva" das informações complementares da nota (só informação).
// Planilha e textos inventados.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analisarItem, type ItemFiscal } from '../src/fiscal/analise.ts';
import { lerTabelaST, outrasLinhasDoComeco } from '../src/fiscal/st.ts';
import { lerXlsx } from '../src/fiscal/xlsx.ts';
import {
  frasesForaLinhaAutomotiva,
  temCandidatoAutopecas,
  textoForaLinhaAutomotiva,
  textoOutrasLinhas,
} from '../src/explicacaoST.ts';
import { xlsx } from './fiscal/fixtures/xlsx.mts';

const topo = (anexo: string, seg: string) => [
  ['Versão: 0099'],
  ['Produção de efeitos a partir de 01/02/2026'],
  [`ANEXO ${anexo} – SEGMENTO: ${seg}`],
];
const cab = [
  'ITEM',
  'CEST',
  'NCM/SH',
  'Descrição',
  'MVA-ST Alíquota de 4%',
  'MVA-ST Alíquota de 7%',
  'MVA-ST Alíquota de 12%',
  'Alíquota interna',
];
const mvas = [0.5, 0.45, 0.4, '19%'];

// Pneus: o item 4011.20.90 tem uma linha só dele; outras três linhas citam
// 4011 para outros NCMs (uma delas com dois NCMs na mesma célula).
// Autopeças: o 7318 (parafusos).
const st = lerTabelaST([
  ...lerXlsx(
    xlsx('Pneus', [
      ...topo('XVI', 'PNEUMÁTICOS'),
      cab,
      [1, '16.001.00', '4011.10.00', 'Pneus de automóveis', ...mvas],
      [2, '16.002.00', '4011.20.90', 'Pneus de ônibus', ...mvas],
      [
        3,
        '16.003.00',
        '4011.40.00  4011.50.00',
        'Pneus de motos e bicicletas',
        ...mvas,
      ],
      [4, '16.004.00', '4011.40.00', 'Pneus de motos, outros', ...mvas],
      [5, '16.005.00', '4013', 'Câmaras de ar', ...mvas],
    ]),
  ),
  ...lerXlsx(
    xlsx('Autopecas', [
      ...topo('II', 'AUTOPEÇAS'),
      cab,
      [1, '01.019.00', '7318', 'Parafusos, porcas, arruelas', ...mvas],
    ]),
  ),
]);

const item: ItemFiscal = {
  nItem: '1',
  xProd: 'PNEU INVENTADO 275/80',
  NCM: '40112090',
  CEST: '',
  orig: '0',
  CST: '00',
  pICMS: '12',
  CFOP: '6102',
};

describe('outras linhas da planilha com o mesmo começo de NCM', () => {
  it('conta as linhas (uma célula com dois NCMs conta uma) e lista os NCMs', () => {
    assert.deepEqual(outrasLinhasDoComeco(st, '4011.20.90'), {
      comeco: '4011',
      linhas: 3,
      ncms: ['40111000', '40114000', '40115000'],
    });
  });

  it('não conta as linhas que servem para o item nem outro começo', () => {
    // 4013 é outro começo; 4011.20.90 é a linha do item.
    const o = outrasLinhasDoComeco(st, '40112090');
    assert.ok(o && !o.ncms.includes('40112090') && !o.ncms.includes('4013'));
  });

  it('sem outras linhas, ou NCM sem 8 dígitos: null', () => {
    assert.equal(outrasLinhasDoComeco(st, '73181500'), null);
    assert.equal(outrasLinhasDoComeco(st, '4011'), null);
  });

  it('a análise do item leva as outras linhas, sem mudar os candidatos', () => {
    const a = analisarItem(item, 'SP', { st });
    assert.equal(a.candidatos.length, 1);
    assert.equal(a.candidatos[0].ncmPlanilha, '40112090');
    assert.equal(a.outrasLinhas?.linhas, 3);
    // Item sem candidato: sem a linha.
    const fora = analisarItem({ ...item, NCM: '40169990' }, 'SP', { st });
    assert.equal(fora.outrasLinhas ?? null, null);
  });

  it('texto no plural, como no pedido', () => {
    assert.equal(
      textoOutrasLinhas({
        comeco: '4011',
        linhas: 3,
        ncms: ['40111000', '40114000', '40115000'],
      }),
      'Outras 3 linhas da planilha citam 4011, mas para NCMs diferentes deste item (4011.10.00, 4011.40.00, 4011.50.00).',
    );
  });

  it('texto no singular e com NCM de 6 dígitos', () => {
    assert.equal(
      textoOutrasLinhas({ comeco: '4011', linhas: 1, ncms: ['401110'] }),
      'Outra linha da planilha cita 4011, mas para um NCM diferente deste item (4011.10).',
    );
  });

  it('muitos NCMs: mostra oito e resume o resto', () => {
    const ncms = Array.from({ length: 11 }, (_, i) => `40119${i}00`);
    const t = textoOutrasLinhas({ comeco: '4011', linhas: 11, ncms });
    assert.match(t, /4011\.97\.00 e mais 3\)\.$/);
    assert.ok(!t.includes('4011.98.00'));
  });
});

describe('"não é da linha automotiva" nas informações da nota', () => {
  it('acha as frases do pedido, como estão na nota', () => {
    assert.deepEqual(
      frasesForaLinhaAutomotiva(
        'PEDIDO 123; NAO ENQUADRADO NA LINHA AUTOMOTIVA; VENDEDOR: FULANO',
      ),
      ['NAO ENQUADRADO NA LINHA AUTOMOTIVA'],
    );
    assert.deepEqual(
      frasesForaLinhaAutomotiva('NAO FAZ PARTE DO PROTOCOLO 41/2008'),
      ['NAO FAZ PARTE DO PROTOCOLO 41/2008'],
    );
  });

  it('com acento, minúsculas, abreviação e número curto', () => {
    assert.deepEqual(
      frasesForaLinhaAutomotiva(
        'Pedido inventado 77. Produto não faz parte do Prot. ICMS 41/08. Obrigado pela preferência.',
      ),
      ['Produto não faz parte do Prot. ICMS 41/08'],
    );
    assert.deepEqual(
      frasesForaLinhaAutomotiva(
        'Mercadoria não enquadrada na linha automotiva',
      ),
      ['Mercadoria não enquadrada na linha automotiva'],
    );
  });

  it('texto sem a negação não conta', () => {
    assert.deepEqual(
      frasesForaLinhaAutomotiva(
        'PRODUTO DA LINHA AUTOMOTIVA, PROTOCOLO 41/2008. ST RETIDA',
      ),
      [],
    );
    assert.deepEqual(frasesForaLinhaAutomotiva(''), []);
  });

  it('a mesma frase repetida aparece uma vez', () => {
    assert.equal(
      frasesForaLinhaAutomotiva(
        'NAO ENQUADRADO NA LINHA AUTOMOTIVA | NAO ENQUADRADO NA LINHA AUTOMOTIVA',
      ).length,
      1,
    );
  });

  it('só os itens com candidato em Autopeças mostram a frase', () => {
    const parafuso = analisarItem({ ...item, NCM: '73181500' }, 'SP', { st });
    const pneu = analisarItem(item, 'SP', { st });
    assert.equal(temCandidatoAutopecas(parafuso), true);
    assert.equal(temCandidatoAutopecas(pneu), false);
  });

  it('texto do quadro: a frase entre aspas, como informação', () => {
    assert.equal(
      textoForaLinhaAutomotiva('NAO ENQUADRADO NA LINHA AUTOMOTIVA'),
      'Informações complementares da nota: "NAO ENQUADRADO NA LINHA AUTOMOTIVA". Só informação: a decisão e a sugestão não mudam.',
    );
  });
});
