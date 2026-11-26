// O NCM na planilha não basta para o "Sim": o motor pede uma evidência na
// nota (o CEST da linha ou a ST retida pelo fornecedor). Planilha e itens
// inventados; os segmentos e CESTs seguem o leiaute do Portal ST.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { analisarItem, type ItemFiscal } from '../../src/fiscal/analise.ts';
import {
  chaveDecisao,
  lerDecisoes,
  motivoDaEscolha,
  type DecisaoLembrada,
  type EscolhaST,
} from '../../src/fiscal/entrada.ts';
import {
  codigoTributacao,
  mesmoCest,
  stRetidoPeloFornecedor,
  textoTributacao,
  tributacaoSemST,
} from '../../src/fiscal/evidencias.ts';
import { lerTabelaST, linhasDoCest } from '../../src/fiscal/st.ts';
import { lerXlsx } from '../../src/fiscal/xlsx.ts';
import { lerArquivo } from '../../src/nfe/parser.ts';
import {
  detalhesDoQuadro,
  linhasEvidencia,
  textoSugestaoSemST,
} from '../../src/explicacaoST.ts';
import { textoDecisao } from '../../src/filtroDecisoes.ts';
import { decisaoInicial, previaItem } from '../../src/previaST.ts';
import { ligarDomMinimo } from '../apoioDom.mts';
import notas from '../janela/notasFiscais.cjs';
import { xlsx } from './fixtures/xlsx.mts';

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
  'MVA-ST 1 Alíquota de 4%',
  'MVA-ST 1 Alíquota de 7%',
  'MVA-ST 1 Alíquota de 12%',
  'MVA-ST 2 Alíquota de 4%',
  'MVA-ST 2 Alíquota de 7%',
  'MVA-ST 2 Alíquota de 12%',
  'Alíquota interna',
];
const mvas = [1.0614, 0.9969, 0.8896, 0.6387, 0.5875, 0.5022, '20%'];
const st = lerTabelaST([
  ...lerXlsx(
    xlsx('Autopecas', [
      ...topo('I', 'AUTOPEÇAS'),
      cab,
      [
        2,
        '01.002.00',
        '3917',
        'Tubos e seus acessórios, de plásticos',
        ...mvas,
      ],
      [
        7,
        '01.007.00',
        '4016.93.00',
        'Juntas, gaxetas e outros elementos com função semelhante de vedação',
        ...mvas,
      ],
      [43, '01.043.00', '8425.42.00', 'Macacos hidráulicos', ...mvas],
    ]),
  ),
  ...lerXlsx(
    xlsx('Construcao', [
      ...topo('IX', 'MATERIAIS DE CONSTRUÇÃO'),
      [
        'ITEM',
        'CEST',
        'NCM/SH',
        'Descrição',
        'MVA-ST Alíquota de 4%',
        'MVA-ST Alíquota de 7%',
        'MVA-ST Alíquota de 12%',
        'Alíquota interna',
      ],
      [
        6,
        '10.006.00',
        '3922',
        'Banheiras, boxes, pias de plástico',
        0.5,
        0.45,
        0.4,
        '20%',
      ],
    ]),
  ),
]);

// Nota interestadual de distribuidor inventado: tributação normal, sem CEST.
const item = (p: Partial<ItemFiscal>): ItemFiscal => ({
  nItem: '1',
  NCM: '39172300',
  orig: '0',
  CST: '00',
  pICMS: '12',
  CFOP: '6102',
  ...p,
});
const analise = (p: Partial<ItemFiscal>) => analisarItem(item(p), 'SP', { st });
const revenda = { escolha: null, finalidade: 'revenda' as const };

describe('evidências: quando o fornecedor reteve ST', () => {
  it('CST de ST com valor de ST', () => {
    assert.equal(stRetidoPeloFornecedor({ CST: '10', vBCST: '140.00' }), true);
    assert.equal(stRetidoPeloFornecedor({ CST: '70', vST: '3.20' }), true);
    assert.equal(stRetidoPeloFornecedor({ CST: '90', vBCST: '50' }), true);
    assert.equal(stRetidoPeloFornecedor({ CSOSN: '201', vBCST: '50' }), true);
    assert.equal(stRetidoPeloFornecedor({ CSOSN: '900', vBCST: '50' }), true);
  });
  it('retido antes (CST 60, CSOSN 500) com valor', () => {
    assert.equal(stRetidoPeloFornecedor({ CST: '60', vBCSTRet: '120' }), true);
    assert.equal(
      stRetidoPeloFornecedor({ CSOSN: '500', vICMSSTRet: '9.60' }),
      true,
    );
  });
  it('só o código, sem valor, não basta', () => {
    assert.equal(stRetidoPeloFornecedor({ CST: '10' }), false);
    assert.equal(
      stRetidoPeloFornecedor({ CST: '60', vBCSTRet: '0.00' }),
      false,
    );
  });
  it('tributação normal sem valores: não reteve', () =>
    assert.equal(stRetidoPeloFornecedor({ CST: '00' }), false));
  it('tributação sem ST: código presente e fora dos de ST', () => {
    assert.equal(tributacaoSemST({ CST: '00' }), true);
    assert.equal(tributacaoSemST({ CSOSN: '102' }), true);
    assert.equal(tributacaoSemST({ CST: '60' }), false);
    assert.equal(tributacaoSemST({}), false);
  });
  it('textos curtos da tributação', () => {
    assert.equal(codigoTributacao({ CST: '00' }), 'CST 00');
    assert.equal(codigoTributacao({ CST: '', CSOSN: '102' }), 'CSOSN 102');
    assert.equal(textoTributacao({ CST: '00' }), 'CST 00, sem valores de ST');
    assert.equal(
      textoTributacao({ CST: '10', vBCST: '140.00', vST: '13.20' }),
      'CST 10, ICMS-ST R$ 13,20',
    );
    assert.equal(textoTributacao({}), 'sem CST na nota, sem valores de ST');
  });
  it('CEST comparado pelos 7 dígitos, sem pontos', () => {
    assert.equal(mesmoCest('0104300', '01.043.00'), true);
    assert.equal(mesmoCest('0104300', '01.043.01'), false);
    assert.equal(mesmoCest('', ''), false);
  });
  it('linhas da planilha com um CEST, de qualquer segmento', () => {
    assert.deepEqual(
      linhasDoCest(st, '1000600').map((l) => [l.segmento, l.linhaPlanilha]),
      [['Construcao', 5]],
    );
    assert.deepEqual(linhasDoCest(st, '9999999'), []);
  });
});

describe('evidências: o caso da nota de material de construção', () => {
  it('tubo de PVC 3917 sem CEST e com CST 00: Confirmar, sugestão Sem ST', () => {
    const a = analise({ xProd: 'TUBO PVC LIGACAO 40CM' });
    assert.equal(a.stSergipe, 'confirmar');
    assert.equal(a.semEvidencia, true);
    assert.equal(a.sugestaoSemST, true);
    assert.equal(a.cfopSugerido, null);
    const p = previaItem(a, 'SP', revenda);
    assert.equal(p.st, 'confirmar');
    assert.equal(p.precisaDeMim, true);
    assert.equal(p.mvaTexto, '-');
    assert.equal(p.aliquotaTexto, '-');
    assert.equal(p.cfop, null);
    assert.equal(
      p.motivo,
      'sem CEST e sem ST retida na nota: confirmar se é de Autopecas (sugestão: Sem ST)',
    );
    assert.equal(
      textoSugestaoSemST(a),
      'Sugerido: a nota não tem CEST, veio com CST 00 e sem ST retida.',
    );
  });

  it('anel de borracha 4016.93.00 sem CEST e com CST 00: idem', () => {
    const a = analise({ NCM: '40169300', xProd: 'ANEL BORRACHA ESGOTO 100' });
    assert.equal(a.stSergipe, 'confirmar');
    assert.equal(a.sugestaoSemST, true);
    assert.equal(previaItem(a, 'SP', revenda).precisaDeMim, true);
  });

  it('macaco 8425.42.00 com CEST 0104300 e ST retida: Sim, com MVA', () => {
    const a = analise({
      NCM: '84254200',
      CEST: '0104300',
      CST: '10',
      CFOP: '6403',
      vBCST: '320.00',
      vST: '25.60',
    });
    assert.equal(a.stSergipe, 'sim');
    assert.equal(a.semEvidencia, false);
    const p = previaItem(a, 'SP', revenda);
    assert.equal(p.st, 'sim');
    assert.equal(p.cfop, '2403');
    assert.equal(p.mvaTexto, '88,96%');
    assert.equal(p.aliquotaTexto, '20%');
    assert.equal(p.precisaDeMim, false);
  });

  it('CEST da linha e sem ST retida: Sim (o CEST é a evidência)', () => {
    const a = analise({ CEST: '0100200' });
    assert.equal(a.stSergipe, 'sim');
    assert.equal(previaItem(a, 'SP', revenda).cfop, '2403');
  });

  it('sem CEST, mas com ST retida antes (CST 60): Confirmar (CEST obrigatório)', () => {
    const a = analise({ CST: '60', vBCSTRet: '80.00', vICMSSTRet: '6.40' });
    assert.equal(a.stSergipe, 'confirmar');
    assert.equal(a.semCestComRetencao, true);
    assert.equal(a.sugestaoSemST, false);
    assert.match(
      previaItem(a, 'SP', revenda).motivo,
      /^O fornecedor reteve ST, mas não informou o CEST/,
    );
  });

  it('sem CEST, CST 60 sem valor: Confirmar sem sugestão', () => {
    const a = analise({ CST: '60' });
    assert.equal(a.stSergipe, 'confirmar');
    assert.equal(a.semEvidencia, true);
    assert.equal(a.sugestaoSemST, false);
    assert.equal(textoSugestaoSemST(a), null);
    assert.equal(
      previaItem(a, 'SP', revenda).motivo,
      'sem CEST e sem ST retida na nota: confirmar se é de Autopecas',
    );
  });

  it('CEST de outro segmento: Confirmar mostrando os dois, sem sugestão', () => {
    const a = analise({ CEST: '1000600' });
    assert.equal(a.stSergipe, 'confirmar');
    assert.equal(a.sugestaoSemST, false);
    assert.equal(a.semEvidencia, false);
    const motivo = previaItem(a, 'SP', revenda).motivo;
    assert.match(motivo, /CEST da nota \(10\.006\.00\) não bate/);
    assert.match(motivo, /\(01\.002\.00\)/);
    assert.match(
      motivo,
      /indica o segmento Construcao \(Construcao, linha 5\)/,
    );
    const ev = linhasEvidencia(a);
    assert.equal(
      ev[3],
      'CEST da nota: diferente. A nota traz 10.006.00 (é de Construcao, linha 5); a linha tem 01.002.00.',
    );
  });

  it('CEST de outra linha do mesmo segmento: Confirmar', () => {
    const a = analise({ CEST: '0100700' });
    assert.equal(a.stSergipe, 'confirmar');
    assert.match(linhasEvidencia(a)[3], /é de Autopecas, linha 6/);
  });

  it('linhas curtas do quadro', () => {
    assert.deepEqual(linhasEvidencia(analise({})), [
      'NCM 3917.23.00 bate com a linha 5 da planilha (NCM 3917 na linha).',
      'Descrição da linha: Tubos e seus acessórios, de plásticos.',
      'Segmento: Autopecas (AUTOPEÇAS), CEST 01.002.00.',
      'CEST da nota: ausente.',
      'ST retida pelo fornecedor: não (CST 00, sem valores de ST).',
    ]);
    assert.deepEqual(
      linhasEvidencia(
        analise({
          NCM: '84254200',
          CEST: '0104300',
          CST: '10',
          vBCST: '320',
          vST: '25.6',
        }),
      ).slice(3),
      [
        'CEST da nota: igual ao da linha (01.043.00).',
        'ST retida pelo fornecedor: sim (CST 10, ICMS-ST R$ 25,60).',
      ],
    );
  });

  it('quadro de uma linha: sem MVA nem alíquota interna antes de "Tem ST"', () => {
    const p = previaItem(analise({}), 'SP', revenda);
    assert.ok(p.detalhes.some((d) => d.startsWith('MVA ')));
    const quadro = detalhesDoQuadro(p.detalhes);
    assert.ok(
      quadro.every((d) => !/MVA|alíquota interna|^nota sem CEST/.test(d)),
      quadro.join(' | '),
    );
    assert.ok(quadro.includes('linha 5 casa pelo prefixo 3917 (4 dígitos)'));
  });

  it('pendência da alíquota interna só aparece com ST', () => {
    const PEND = 'alíquota interna: confirmar com a contabilidade';
    const com = <T extends { pendencias: string[] }>(a: T) => ({
      ...a,
      pendencias: [...a.pendencias, PEND],
    });
    const tubo = previaItem(com(analise({})), 'SP', revenda);
    assert.ok(!tubo.observacoes.includes(PEND));
    const macaco = previaItem(
      com(
        analise({
          NCM: '84254200',
          CEST: '0104300',
          CST: '10',
          vBCST: '320',
          vST: '25.6',
        }),
      ),
      'SP',
      revenda,
    );
    assert.ok(macaco.observacoes.includes(PEND));
  });

  it('"precisam de você": a nota de 4 itens tem 3', () => {
    const itens = [
      item({ nItem: '1' }),
      item({ nItem: '2', NCM: '40169300' }),
      item({
        nItem: '3',
        NCM: '84254200',
        CEST: '0104300',
        CST: '10',
        vBCST: '320',
        vST: '25.6',
      }),
      item({ nItem: '4', CEST: '1000600' }),
    ];
    const pendentes = itens
      .map((i) => previaItem(analisarItem(i, 'SP', { st }), 'SP', revenda))
      .filter((p) => p.precisaDeMim)
      .map((p) => p.nItem);
    assert.deepEqual(pendentes, ['1', '2', '4']);
  });
});

describe('evidências: ensinar e lembrar', () => {
  const lembrar = (escolha: EscolhaST, cProd: string): DecisaoLembrada => {
    const a = analise({});
    const motivo = motivoDaEscolha(a, escolha);
    return {
      escolha,
      finalidade: 'revenda',
      ...(motivo ? { motivo } : {}),
      raizCnpj: '11222333',
      fornecedor: 'Distribuidora Exemplo',
      cProd,
      xProd: 'TUBO PVC LIGACAO 40CM',
      ncm: a.ncm,
      atualizadaEm: '2026-11-19T10:00:00.000Z',
    };
  };

  it('motivo da escolha: é ou não é do segmento', () => {
    const a = analise({});
    assert.equal(
      motivoDaEscolha(a, { tipo: 'sem-st' }),
      'não é do segmento Autopecas',
    );
    assert.equal(
      motivoDaEscolha(a, {
        tipo: 'candidato',
        segmento: 'Autopecas',
        linhaPlanilha: 5,
        cest: '01.002.00',
      }),
      'é do segmento Autopecas',
    );
    assert.equal(
      motivoDaEscolha(a, {
        tipo: 'manual',
        cfop: '2102',
        mva: null,
        motivo: 'x',
      }),
      undefined,
    );
  });

  it('"não é do segmento" lembrado vale na segunda nota, sem pendência', () => {
    const d = lembrar({ tipo: 'sem-st' }, 'PVC-40');
    // Passa pelo arquivo de decisões (validação) como na gravação real.
    const arquivo = lerDecisoes({
      decisoes: { [chaveDecisao(d.raizCnpj, d.cProd)]: d },
    });
    const lida = arquivo[chaveDecisao('11.222.333/0001-81', 'PVC-40')];
    assert.ok(lida);
    assert.equal(lida.motivo, 'não é do segmento Autopecas');

    const segunda = analise({ nItem: '7' });
    assert.equal(segunda.stSergipe, 'confirmar');
    const ini = decisaoInicial('1', segunda, lida);
    assert.equal(ini.lembrada, true);
    const p = previaItem(segunda, 'SP', ini.decisao, ini.lembrada);
    assert.equal(p.st, 'nao');
    assert.equal(p.cfop, '2102');
    assert.equal(p.lembrado, true);
    assert.equal(p.precisaDeMim, false);
    assert.equal(p.motivo, 'marcado "sem ST": não é do segmento Autopecas');
    assert.equal(
      textoDecisao(lida),
      'Sem ST: não é do segmento Autopecas · Revenda',
    );
  });

  it('"é do segmento" lembrado: Sim com a MVA da linha', () => {
    const d = lembrar(
      {
        tipo: 'candidato',
        segmento: 'Autopecas',
        linhaPlanilha: 5,
        cest: '01.002.00',
      },
      'PVC-41',
    );
    const ini = decisaoInicial('1', analise({}), d);
    const p = previaItem(analise({}), 'SP', ini.decisao, ini.lembrada);
    assert.equal(p.st, 'sim');
    assert.equal(p.mvaTexto, '88,96%');
    assert.equal(p.precisaDeMim, false);
    assert.match(p.motivo, /\(é do segmento Autopecas\)/);
    assert.equal(
      textoDecisao(d),
      'Autopecas, CEST 01.002.00: é do segmento Autopecas · Revenda',
    );
  });

  it('motivo que não é texto: a decisão fica de fora do arquivo', () => {
    const d = { ...lembrar({ tipo: 'sem-st' }, 'PVC-42'), motivo: 3 };
    assert.deepEqual(
      lerDecisoes({ decisoes: { [chaveDecisao(d.raizCnpj, d.cProd)]: d } }),
      {},
    );
  });

  it('decisão antiga, sem motivo, continua valendo', () => {
    const { motivo: _, ...antiga } = lembrar({ tipo: 'sem-st' }, 'PVC-43');
    const ini = decisaoInicial('1', analise({}), antiga);
    assert.equal(
      previaItem(analise({}), 'SP', ini.decisao, true).motivo,
      'marcado "sem ST"',
    );
  });
});

describe('evidências: o parser lê os valores de ST do item', () => {
  before(ligarDomMinimo);
  it('vICMSST do ICMS10 e vBCSTRet/vICMSSTRet do ICMS60', () => {
    const itens = lerArquivo(notas.notaVariada()).nota.itens;
    assert.equal(itens[2].vST, '13.20');
    assert.equal(itens[2].vBCST, '140.00');
    assert.equal(itens[4].vBCSTRet, '120.00');
    assert.equal(itens[4].vICMSSTRet, '9.60');
    assert.equal(stRetidoPeloFornecedor(itens[2]), true);
    assert.equal(stRetidoPeloFornecedor(itens[4]), true);
    assert.equal(stRetidoPeloFornecedor(itens[0]), false);
  });
});
