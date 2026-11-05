import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { analisarItem, type ItemFiscal } from '../src/fiscal/analise.ts';
import {
  chaveDecisao,
  decisaoAplicavel,
  decisaoValida,
  executarPlano,
  lerCfopManual,
  lerDecisoes,
  planoAplicar,
  type DecisaoLembrada,
} from '../src/fiscal/entrada.ts';
import { lerTabelaST } from '../src/fiscal/st.ts';
import { lerTipi } from '../src/fiscal/tipi.ts';
import { lerXlsx } from '../src/fiscal/xlsx.ts';
import {
  explicacaoItem,
  palavrasSignificativas,
  stRetidoNaNota,
  sugerirSemST,
} from '../src/explicacaoST.ts';
import { itensCfopManual, resumoCfops } from '../src/nfe/resumoCfop.ts';
import type { Item } from '../src/nfe/tipos.ts';
import { previaItem, type DecisaoST } from '../src/previaST.ts';
import { xlsx } from './fiscal/fixtures/xlsx.mts';

// Planilha de ST inventada: o NCM 3924 com duas linhas de artigos para bebê
// (mamadeira e chupeta) e o 3208 com duas linhas de tintas.
const topo = (anexo: string, seg: string) => [
  ['Versão: 0020'],
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
const st = lerTabelaST([
  ...lerXlsx(
    xlsx('Bebes', [
      ...topo('XXX', 'ARTIGOS PARA BEBÊS'),
      cab,
      [1, '30.001.00', '3924', 'Mamadeiras', 0.6, 0.55, 0.45, '19% + 1%'],
      [
        2,
        '30.002.00',
        '3924',
        'Chupetas e bicos para mamadeiras',
        0.6,
        0.55,
        0.45,
        '19% + 1%',
      ],
    ]),
  ),
  ...lerXlsx(
    xlsx('Tintas', [
      ...topo('XXIII', 'TINTAS E VERNIZES'),
      cab,
      [
        1,
        '24.001.00',
        '3208',
        'Tintas à base de poliésteres',
        0.62,
        0.57,
        0.48,
        '19% + 1%',
      ],
      [
        2,
        '24.002.00',
        '3208',
        'Tintas de acabamento automotivo',
        0.62,
        0.57,
        0.48,
        '19% + 1%',
      ],
    ]),
  ),
]);

// TIPI: o capítulo 39 inventado no formato do texto da TIPI; o 32 é o
// trecho real dos testes da TIPI.
const tipi39 = lerTipi(`Capítulo 39
Plástico e suas obras
__________________

NCM DESCRIÇÃO ALÍQUOTA
(%)
39.24 Serviços de mesa, artigos de cozinha, outros artigos de uso doméstico e artigos de higiene ou de toucador, de plástico.
3924.10.00 - Serviços de mesa e outros utensílios de mesa ou de cozinha 9,75
3924.90.00 - Outros 9,75
`);
const tipi32 = lerTipi(
  readFileSync(
    new URL('./fiscal/fixtures/tipi-trecho.txt', import.meta.url),
    'utf8',
  ),
);

// Regador de plástico: NCM 3924.90.00, sem CEST, CST 00, 12%, fornecedor de PE.
const regador: ItemFiscal = {
  nItem: '1',
  xProd: 'REGADOR PLASTICO 5L',
  NCM: '39249000',
  CEST: '',
  orig: '0',
  CST: '00',
  pICMS: '12',
  vBCST: '',
  vST: '',
  CFOP: '6102',
};
const verniz: ItemFiscal = { ...regador, xProd: 'VERNIZ', NCM: '32081020' };

describe('explicação da caixa de escolha', () => {
  it('com TIPI e sem CEST: a descrição da TIPI, a planilha e a nota', () => {
    const a = analisarItem(regador, 'PE', { st, tipi: tipi39 });
    const e = explicacaoItem(a, stRetidoNaNota(regador));
    assert.equal(
      e.linhaTipi,
      'NCM 3924.90.00 na TIPI: Serviços de mesa, artigos de cozinha, outros artigos de uso doméstico e artigos de higiene ou de toucador, de plástico. > Outros',
    );
    assert.equal(
      e.texto,
      'O NCM 3924.90.00 é amplo: Serviços de mesa, artigos de cozinha, outros artigos de uso doméstico e artigos de higiene ou de toucador, de plástico. > Outros. ' +
        'Na planilha de Sergipe ele aparece no segmento Bebes, em 2 linhas: Mamadeiras; Chupetas e bicos para mamadeiras. ' +
        'Um produto só tem ST se for um desses. ' +
        'O fornecedor não informou CEST e não reteve ST.',
    );
  });

  it('sem TIPI: sem a primeira linha, o texto começa pela planilha', () => {
    const a = analisarItem(regador, 'PE', { st });
    const e = explicacaoItem(a, false);
    assert.equal(e.linhaTipi, null);
    assert.ok(
      e.texto.startsWith(
        'Na planilha de Sergipe o NCM 3924.90.00 aparece no segmento Bebes, em 2 linhas: Mamadeiras;',
      ),
    );
    assert.ok(!e.texto.includes('amplo'));
  });

  it('com CEST e ST retido: "informou CEST" e "reteve"', () => {
    const item = {
      ...regador,
      CEST: '3000100',
      CST: '10',
      vBCST: '100.00',
      vST: '7.00',
    };
    const a = analisarItem(item, 'PE', { st, tipi: tipi39 });
    const e = explicacaoItem(a, stRetidoNaNota(item));
    assert.ok(
      e.texto.endsWith('O fornecedor informou CEST (30.001.00) e reteve ST.'),
      e.texto,
    );
  });

  it('descrição longa da linha fica curta, cortada numa palavra', () => {
    const a = analisarItem(regador, 'PE', { st, tipi: tipi39 });
    a.candidatos[0].descricao =
      'Mamadeiras de plástico ou de vidro, com ou sem bico, em qualquer capacidade, inclusive as térmicas e as de treinamento';
    const { texto } = explicacaoItem(a, false);
    assert.match(
      texto,
      /2 linhas: Mamadeiras de plástico ou de vidro, com ou sem bico, em qualquer\.\.\.; /,
    );
  });
});

describe('ST retido na nota', () => {
  it('CST 00 sem valores: não reteve', () =>
    assert.equal(stRetidoNaNota({ CST: '00', vST: '', vBCST: '' }), false));
  it('valor de ST: reteve', () =>
    assert.equal(stRetidoNaNota({ CST: '00', vST: '3,50' }), true));
  it('CST 60 (ST cobrada antes): reteve', () =>
    assert.equal(stRetidoNaNota({ CST: '60' }), true));
  it('CSOSN 202: reteve', () =>
    assert.equal(stRetidoNaNota({ CST: '', CSOSN: '202' }), true));
});

describe('sugestão de "Sem ST"', () => {
  it('regador 39249000 contra mamadeira e chupeta: sugere', () => {
    const a = analisarItem(regador, 'PE', { st, tipi: tipi39 });
    assert.equal(a.candidatos.length, 2);
    assert.equal(sugerirSemST(a, stRetidoNaNota(regador)), true);
  });

  it('verniz 32081020 contra tintas: não sugere ("tintas" está na TIPI)', () => {
    const a = analisarItem(verniz, 'PE', { st, tipi: tipi32 });
    assert.equal(a.candidatos.length, 2);
    assert.equal(sugerirSemST(a, false), false);
  });

  it('com CEST na nota: não sugere', () => {
    const item = { ...regador, CEST: '3000100' };
    const a = analisarItem(item, 'PE', { st, tipi: tipi39 });
    assert.equal(sugerirSemST(a, false), false);
  });

  it('com ST retido: não sugere', () => {
    const item = { ...regador, CST: '10', vST: '7.00', vBCST: '100.00' };
    const a = analisarItem(item, 'PE', { st, tipi: tipi39 });
    assert.equal(sugerirSemST(a, stRetidoNaNota(item)), false);
  });

  it('sem TIPI: não há o que comparar, não sugere', () => {
    const a = analisarItem(regador, 'PE', { st });
    assert.equal(sugerirSemST(a, false), false);
  });

  it('palavras: ignora preposições, "outros" e o plural simples', () => {
    assert.deepEqual(
      [
        ...palavrasSignificativas(
          'Outros vernizes de tintas, para uso doméstico',
        ),
      ],
      ['verniz', 'tinta', 'domestico'],
    );
  });
});

describe('CFOP manual ("Outro")', () => {
  it('valida o CFOP: 4 dígitos, primeiro 1, 2 ou 3', () => {
    const ok = (cfop: string) =>
      lerCfopManual({ cfop, mva: '', motivo: 'brinde do fornecedor' }).ok;
    assert.equal(ok('2102'), true);
    assert.equal(ok('1.403'), true);
    assert.equal(ok('3102'), true);
    assert.equal(ok('5102'), false);
    assert.equal(ok('6102'), false);
    assert.equal(ok('210'), false);
    assert.equal(ok('21020'), false);
    assert.equal(ok('21a2'), false);
    const r = lerCfopManual({ cfop: '5102', mva: '', motivo: 'x' });
    assert.deepEqual(r, {
      ok: false,
      campo: 'cfop',
      erro: 'CFOP de entrada começa com 1, 2 ou 3.',
    });
  });

  it('MVA opcional em percentual; motivo obrigatório', () => {
    assert.deepEqual(
      lerCfopManual({
        cfop: '2403',
        mva: '56,94%',
        motivo: '  combinado com a contabilidade ',
      }),
      {
        ok: true,
        escolha: {
          tipo: 'manual',
          cfop: '2403',
          mva: 0.5694,
          motivo: 'combinado com a contabilidade',
        },
      },
    );
    assert.equal(
      lerCfopManual({ cfop: '2102', mva: '', motivo: 'x' }).ok &&
        (
          lerCfopManual({ cfop: '2102', mva: '', motivo: 'x' }) as {
            escolha: { mva: number | null };
          }
        ).escolha.mva,
      null,
    );
    const semMotivo = lerCfopManual({ cfop: '2102', mva: '', motivo: '   ' });
    assert.equal(semMotivo.ok, false);
    assert.equal(!semMotivo.ok && semMotivo.campo, 'motivo');
    const mvaRuim = lerCfopManual({ cfop: '2102', mva: 'abc', motivo: 'x' });
    assert.equal(!mvaRuim.ok && mvaRuim.campo, 'mva');
  });

  const escolha = {
    tipo: 'manual' as const,
    cfop: '2949',
    mva: 0.4,
    motivo: 'amostra grátis',
  };
  const lembrada: DecisaoLembrada = {
    escolha,
    finalidade: 'revenda',
    raizCnpj: '12345678',
    fornecedor: 'FORNECEDOR INVENTADO LTDA',
    cProd: 'REG-5L',
    xProd: 'REGADOR PLASTICO 5L',
    ncm: '39249000',
    atualizadaEm: '2026-11-05T12:00:00.000Z',
  };

  it('vira decisão lembrada por raiz do CNPJ + código, com o motivo', () => {
    assert.equal(decisaoValida(lembrada), true);
    const lidas = lerDecisoes({
      versao: 1,
      decisoes: { [chaveDecisao('12.345.678/0001-90', 'REG-5L')]: lembrada },
    });
    assert.deepEqual(lidas['12345678|REG-5L'].escolha, escolha);
    // Sem motivo ou com CFOP de saída, o arquivo não aceita.
    assert.equal(
      decisaoValida({ ...lembrada, escolha: { ...escolha, motivo: ' ' } }),
      false,
    );
    assert.equal(
      decisaoValida({ ...lembrada, escolha: { ...escolha, cfop: '5102' } }),
      false,
    );
    assert.equal(
      decisaoValida({ ...lembrada, escolha: { ...escolha, mva: 'x' } }),
      false,
    );
    const a = analisarItem(regador, 'PE', { st, tipi: tipi39 });
    assert.equal(decisaoAplicavel(a, lembrada), true);
    assert.equal(decisaoAplicavel(a, { ...lembrada, ncm: '39241000' }), false);
  });

  it('na prévia: o CFOP e a MVA informados, motivo "CFOP manual: ..."', () => {
    const a = analisarItem(regador, 'PE', { st, tipi: tipi39 });
    const d: DecisaoST = { escolha, finalidade: 'revenda' };
    const l = previaItem(a, 'PE', d, true);
    assert.equal(l.cfop, '2949');
    assert.equal(l.mva, 0.4);
    assert.equal(l.mvaTexto, '40%');
    assert.equal(l.motivo, 'CFOP manual: amostra grátis');
    assert.equal(l.st, 'nao');
    assert.equal(l.precisaDeMim, false);
    assert.equal(l.aliquotaTexto, '-');
    assert.equal(l.lembrado, true);
    // CFOP do grupo x.400 é entrada com ST.
    const comST = previaItem(a, 'PE', {
      escolha: { ...escolha, cfop: '2403', mva: null },
      finalidade: 'revenda',
    });
    assert.equal(comST.st, 'sim');
    assert.equal(comST.precisaDeMim, false);
    assert.equal(comST.aliquotaConfirmar, false);
  });

  it('Aplicar grava o CFOP e a MVA informados', () => {
    const a = analisarItem(regador, 'PE', { st, tipi: tipi39 });
    const l = previaItem(a, 'PE', { escolha, finalidade: 'revenda' });
    const anotacoes = new Map<string, Map<string, string>>();
    const plano = planoAplicar([l], anotacoes, 'cfop', 'mva');
    assert.equal(executarPlano(plano, anotacoes, false), 2);
    assert.equal(anotacoes.get('cfop')?.get('1'), '2949');
    assert.equal(anotacoes.get('mva')?.get('1'), '40%');
  });

  it('resumo do painel: item com o CFOP manual ganha marca', () => {
    const itens = [
      { nItem: '1', cProd: 'REG-5L', xProd: 'REGADOR', NCM: '39249000' },
      { nItem: '2', cProd: 'OUTRO', xProd: 'OUTRO', NCM: '39249000' },
      { nItem: '3', cProd: 'REG-5L', xProd: 'REGADOR', NCM: '39249000' },
    ] as Item[];
    const anotacoes = new Map([
      [
        'cfop',
        new Map([
          ['1', '2949'],
          ['2', '2102'],
          // Mesmo produto, mas a pessoa trocou o valor à mão: não é manual.
          ['3', '2102'],
        ]),
      ],
    ]);
    const manuais = itensCfopManual(
      itens,
      '12.345.678/0001-90',
      [lembrada],
      anotacoes,
      'cfop',
    );
    assert.deepEqual([...manuais], ['1']);
    const r = resumoCfops(itens, anotacoes, 'cfop', manuais);
    const g2949 = r.grupos.find((g) => g.valor === '2949')!;
    assert.equal(g2949.manuais, 1);
    assert.equal(g2949.itens[0].manual, true);
    assert.equal(r.grupos.find((g) => g.valor === '2102')!.manuais, 0);
  });
});
