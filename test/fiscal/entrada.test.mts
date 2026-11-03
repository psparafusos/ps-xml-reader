import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analisarItem, type ItemFiscal } from '../../src/fiscal/analise.ts';
import {
  cfopEntrada,
  chaveDecisao,
  decisaoAplicavel,
  executarPlano,
  FINALIDADES,
  lerDecisoes,
  planoAplicar,
  resolverItem,
  type DecisaoLembrada,
  type Finalidade,
} from '../../src/fiscal/entrada.ts';
import { lerTabelaST } from '../../src/fiscal/st.ts';
import { lerXlsx } from '../../src/fiscal/xlsx.ts';
import { xlsx } from './fixtures/xlsx.mts';

// Planilha de ST inventada: verniz (3208) com MVA de 56,94% na coluna de 7%;
// massas 3214 e vedações 3214.10 servem as duas para 3214.10.10.
const st = lerTabelaST(
  lerXlsx(
    xlsx('Tintas', [
      ['Versão: 0019'],
      ['Produção de efeitos a partir de 01/07/2023'],
      ['ANEXO XXIII – SEGMENTO: TINTAS E VERNIZES'],
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
      [2, '24.005.00', '3214', 'Massas', 0.6, 0.55, 0.47, 0.34],
      [3, '24.006.00', '3214.10', 'Vedações', 0.5, 0.45, 0.4, 0.3],
    ]),
  ),
);

const item = (p: Partial<ItemFiscal>): ItemFiscal => ({
  nItem: '1',
  NCM: '32081020',
  orig: '0',
  CST: '00',
  pICMS: '7',
  CFOP: '6102',
  ...p,
});
const analise = (p: Partial<ItemFiscal>, uf = 'SP') =>
  analisarItem(item(p), uf, { st });
const revenda = { escolha: null, finalidade: 'revenda' as Finalidade };

describe('entrada: CFOP pela tabela da loja', () => {
  it('finalidade, origem e ST', () => {
    const tabela = FINALIDADES.map((f) => [
      f,
      cfopEntrada(f, true, false),
      cfopEntrada(f, true, true),
      cfopEntrada(f, false, false),
      cfopEntrada(f, false, true),
    ]);
    assert.deepEqual(tabela, [
      ['revenda', '1102', '1403', '2102', '2403'],
      ['uso-consumo', '1556', '1407', '2556', '2407'],
      ['bonificacao', '1910', '1910', '2910', '2910'],
      ['ativo', '1551', '1551', '2551', '2551'],
      ['outras', '1949', '1949', '2949', '2949'],
    ]);
  });
});

describe('entrada: item a item', () => {
  it('verniz 3208.10.20 a 7%: ST, MVA 56,94%, CFOP 2403', () => {
    const r = resolverItem(analise({}), 'SP', revenda);
    assert.equal(r.st, 'sim');
    assert.equal(r.mva, 0.5694);
    assert.equal(r.mvaTexto, '56,94%');
    assert.equal(r.cfop, '2403');
    assert.equal(r.cest, '24.001.00');
    assert.equal(r.precisaDeMim, false);
  });

  it('parafuso 7318: sem ST, 2102; de Sergipe, 1102', () => {
    const r = resolverItem(analise({ NCM: '73181500' }), 'SP', revenda);
    assert.equal(r.st, 'nao');
    assert.equal(r.cfop, '2102');
    assert.equal(r.mvaTexto, '-');
    assert.equal(
      resolverItem(analise({ NCM: '73181500' }, 'SE'), 'SE', revenda).cfop,
      '1102',
    );
  });

  it('dois candidatos: confirmar, sem CFOP, até a pessoa escolher', () => {
    const a = analise({ NCM: '32141010' });
    const r = resolverItem(a, 'SP', revenda);
    assert.equal(r.st, 'confirmar');
    assert.equal(r.cfop, null);
    assert.equal(r.precisaDeMim, true);
    assert.match(r.motivo, /2 linhas/);

    const escolhida = resolverItem(a, 'SP', {
      finalidade: 'revenda',
      escolha: {
        tipo: 'candidato',
        segmento: 'Tintas',
        linhaPlanilha: 7,
        cest: '24.006.00',
      },
    });
    assert.equal(escolhida.st, 'sim');
    assert.equal(escolhida.mva, 0.45);
    assert.equal(escolhida.cfop, '2403');
    assert.equal(escolhida.precisaDeMim, false);

    const semSt = resolverItem(a, 'SP', {
      finalidade: 'revenda',
      escolha: { tipo: 'sem-st' },
    });
    assert.equal(semSt.st, 'nao');
    assert.equal(semSt.cfop, '2102');
  });

  it('outra finalidade com ST: CFOP da finalidade e MVA para a contabilidade', () => {
    const r = resolverItem(analise({}), 'SP', {
      escolha: null,
      finalidade: 'uso-consumo',
    });
    assert.equal(r.cfop, '2407');
    assert.equal(r.mva, null);
    assert.equal(r.mvaTexto, 'confirmar com a contabilidade');
    assert.equal(
      resolverItem(analise({}), 'SP', {
        escolha: null,
        finalidade: 'bonificacao',
      }).cfop,
      '2910',
    );
  });

  it('TIPI é observação, não pendência', () => {
    const tipi = {
      porNcm: new Map(),
      relatorio: {
        totalNcm: 0,
        totalLinhas: 0,
        semAliquota: [],
        ignoradas: [],
      },
    };
    const a = analisarItem(item({ NCM: '73181500' }), 'SP', { st, tipi });
    const r = resolverItem(a, 'SP', revenda);
    assert.deepEqual(r.observacoesTipi, ['NCM não existe na TIPI']);
    assert.equal(r.precisaDeMim, false);
    assert.ok(!r.detalhes.some((d) => /TIPI/.test(d)));
  });
});

describe('entrada: decisões lembradas', () => {
  const d: DecisaoLembrada = {
    raizCnpj: '12345678',
    fornecedor: 'FORNECEDOR INVENTADO',
    cProd: 'VD-01',
    xProd: 'VEDAÇÃO',
    ncm: '32141010',
    escolha: {
      tipo: 'candidato',
      segmento: 'Tintas',
      linhaPlanilha: 7,
      cest: '24.006.00',
    },
    finalidade: 'revenda',
    atualizadaEm: '2026-11-03T12:00:00.000Z',
  };

  it('chave pela raiz do CNPJ e código do produto', () => {
    assert.equal(
      chaveDecisao('12.345.678/0001-95', ' VD-01 '),
      '12345678|VD-01',
    );
    assert.equal(chaveDecisao('12345678000276', 'VD-01'), '12345678|VD-01');
  });

  it('vale só para o mesmo NCM e com a linha ainda na planilha', () => {
    assert.equal(decisaoAplicavel(analise({ NCM: '32141010' }), d), true);
    assert.equal(decisaoAplicavel(analise({ NCM: '32141020' }), d), false);
    assert.equal(
      decisaoAplicavel(analise({ NCM: '32141010' }), {
        ...d,
        escolha: { ...d.escolha!, linhaPlanilha: 99 } as never,
      }),
      false,
    );
  });

  it('o arquivo é validado: entrada estranha fica de fora', () => {
    const lidas = lerDecisoes({
      versao: 1,
      decisoes: {
        '12345678|VD-01': d,
        '12345678|X': { ...d, cProd: 'X', finalidade: 'doacao' },
        'outra|VD-01': d,
      },
    });
    assert.deepEqual(Object.keys(lidas), ['12345678|VD-01']);
    assert.deepEqual(lerDecisoes(null), {});
  });
});

describe('entrada: aplicar nas anotações', () => {
  const itens = [
    resolverItem({ ...analise({}), nItem: '1' }, 'SP', revenda),
    resolverItem(
      { ...analise({ NCM: '73181500' }), nItem: '2' },
      'SP',
      revenda,
    ),
    resolverItem(
      { ...analise({ NCM: '32141010' }), nItem: '3' },
      'SP',
      revenda,
    ),
  ];

  it('grava CFOP e MVA; item sem CFOP fica de fora', () => {
    const anotacoes = new Map([
      ['anotacao-cfop-de-entrada', new Map([['2', '2102']])],
    ]);
    const plano = planoAplicar(
      itens,
      anotacoes,
      'anotacao-cfop-de-entrada',
      'anotacao-mva',
    );
    assert.deepEqual(plano.semCfop, ['3']);
    assert.deepEqual(
      plano.gravacoes.map((g) => [g.coluna, g.nItem, g.valor]),
      [
        ['anotacao-cfop-de-entrada', '1', '2403'],
        ['anotacao-mva', '1', '56,94%'],
      ],
    );
  });

  it('valor já preenchido: só substitui se pedir', () => {
    const anotacoes = new Map([['anotacao', new Map([['1', '1102']])]]);
    const plano = planoAplicar(itens, anotacoes, 'anotacao', null);
    assert.equal(plano.gravacoes.filter((g) => g.atual).length, 1);
    assert.equal(executarPlano(plano, anotacoes, false), 1);
    assert.equal(anotacoes.get('anotacao')?.get('1'), '1102');
    assert.equal(anotacoes.get('anotacao')?.get('2'), '2102');
    executarPlano(
      planoAplicar(itens, anotacoes, 'anotacao', null),
      anotacoes,
      true,
    );
    assert.equal(anotacoes.get('anotacao')?.get('1'), '2403');
  });
});
