import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { analisarItem, MOTIVO_APENDICE_XIV } from '../../src/fiscal/analise.ts';
import {
  carregarBaseFiscal,
  importarDocumento,
} from '../../src/fiscal/base.ts';
import { lerCombustiveis } from '../../src/fiscal/combustiveis.ts';
import {
  ErroFormato,
  MENSAGEM_SEM_APENDICE,
} from '../../src/fiscal/documentos.ts';
import {
  chaveDecisao,
  decisaoAplicavel,
  decisaoValida,
  resolverItem,
} from '../../src/fiscal/entrada.ts';
import { lerTabelaST } from '../../src/fiscal/st.ts';
import { lerXlsx } from '../../src/fiscal/xlsx.ts';
import { xlsx, xlsxAbas } from './fixtures/xlsx.mts';

// Planilha de combustíveis inventada: uma aba de outro apêndice (que não
// pode ser lida) e a aba do Apêndice XIV, com coluna de UF, MVA por
// alíquota interestadual e alíquota interna. Valores fictícios.
const apendiceXIV = [
  ['ATO COTEPE/ICMS 61/19'],
  ['APÊNDICE XIV - LUBRIFICANTES DERIVADOS DE PETRÓLEO'],
  [
    'UF',
    'Descrição',
    'MVA 4%',
    'MVA 7%',
    'MVA 12%',
    'MVA interna',
    'Alíquota interna',
  ],
  ['SE', 'Óleo lubrificante teste A', 0.611, 0.55, 0.49, 0.4, '18%'],
  ['SE', 'Graxa teste B', '70,5%', '64%', '57,1%', '45%', 0.18],
  ['BA', 'Óleo lubrificante teste A', 0.9, 0.9, 0.9, 0.9, '20%'],
  [null, null, null],
  ['SE', null, 0.1],
];
const planilha = xlsxAbas([
  {
    nome: 'Apendice I',
    linhas: [
      ['APÊNDICE I - GASOLINA'],
      ['UF', 'Descrição', 'MVA'],
      ['SE', 'Gasolina teste', 0.3],
    ],
  },
  { nome: 'Apendice XIV', linhas: apendiceXIV },
]);

describe('combustíveis: leitor do Apêndice XIV', () => {
  it('lê só a aba do Apêndice XIV, só as linhas de SE', () => {
    const t = lerCombustiveis(lerXlsx(planilha));
    assert.equal(t.relatorio.aba, 'Apendice XIV');
    assert.deepEqual(t.relatorio.abasIgnoradas, ['Apendice I']);
    assert.equal(t.relatorio.linhaCabecalho, 3);
    assert.equal(t.relatorio.outrasUf, 1);
    assert.deepEqual(
      t.linhas.map((l) => l.descricao),
      ['Óleo lubrificante teste A', 'Graxa teste B'],
    );
    const [a, b] = t.linhas;
    assert.deepEqual(a.mvaPorAliquota, {
      '4': 0.611,
      '7': 0.55,
      '12': 0.49,
      '19': 0.4,
    });
    assert.equal(a.aliquotaTexto, '18%');
    assert.equal(a.aliquota, 18);
    assert.equal(a.linhaPlanilha, 4);
    // Percentual em texto vira fração; 0,18 vira 18%.
    assert.deepEqual(b.mvaPorAliquota, {
      '4': 0.705,
      '7': 0.64,
      '12': 0.571,
      '19': 0.45,
    });
    assert.equal(b.aliquota, 18);
    // Linha sem descrição: problema, não entra.
    assert.equal(t.relatorio.problemas.length, 1);
    assert.equal(t.relatorio.problemas[0].motivo, 'linha sem descrição');
  });

  it('acha a aba pelo título quando o nome não diz', () => {
    const t = lerCombustiveis(lerXlsx(xlsx('Plan3', apendiceXIV)));
    assert.equal(t.linhas.length, 2);
  });

  it('MVA única (sem alíquota no título) vale para todas as colunas', () => {
    const t = lerCombustiveis(
      lerXlsx(
        xlsx('Apêndice XIV', [
          ['Descrição', 'MVA', 'Alíquota'],
          ['Óleo teste', 0.5, '19%'],
        ]),
      ),
    );
    assert.deepEqual(t.linhas[0].mvaPorAliquota, {
      '4': 0.5,
      '7': 0.5,
      '12': 0.5,
      '19': 0.5,
    });
  });

  it('arquivo sem a aba: recusa com "não parece a planilha de combustíveis"', () => {
    const outra = xlsx('Tintas', [
      ['ITEM', 'CEST', 'NCM', 'Descrição'],
      [1, '24.001.00', '3208', 'Tinta'],
    ]);
    assert.throws(
      () => lerCombustiveis(lerXlsx(outra)),
      (e: unknown) =>
        e instanceof ErroFormato &&
        e.message === MENSAGEM_SEM_APENDICE &&
        /não parece a planilha de combustíveis/.test(e.message),
    );
    // "Apêndice XIV-A" ou "XV" não confundem.
    assert.throws(
      () => lerCombustiveis(lerXlsx(xlsx('Apendice XV', apendiceXIV.slice(2)))),
      ErroFormato,
    );
  });
});

const pasta = mkdtempSync(join(tmpdir(), 'ps-combustiveis-'));
after(() => rmSync(pasta, { recursive: true, force: true }));

describe('combustíveis: importação na pasta de dados', () => {
  it('grava combustiveis.json e carrega na base', () => {
    const info = importarDocumento(
      'combustiveis',
      planilha,
      'combustiveis-teste.xlsx',
      pasta,
      new Date('2026-11-04T12:00:00Z'),
    );
    assert.equal(info.tipo, 'combustiveis');
    assert.deepEqual(info.quantidades, [
      { rotulo: 'linhas do Apêndice XIV', valor: 2 },
    ]);
    assert.ok(existsSync(join(pasta, 'combustiveis.json')));
    const base = carregarBaseFiscal(pasta);
    assert.equal(base.combustiveis?.linhas.length, 2);
    assert.equal(base.info.combustiveis?.arquivo, 'combustiveis-teste.xlsx');
  });

  it('arquivo errado não troca o que estava', () => {
    assert.throws(
      () =>
        importarDocumento(
          'combustiveis',
          xlsx('Outra', [['a', 'b']]),
          'errado.xlsx',
          pasta,
        ),
      ErroFormato,
    );
    assert.equal(
      carregarBaseFiscal(pasta).info.combustiveis?.arquivo,
      'combustiveis-teste.xlsx',
    );
  });
});

// Motor: planilha de ST mínima (só Tintas) e o Apêndice XIV acima.
const st = lerTabelaST([
  {
    nome: 'Tintas',
    linhas: [
      ['Versão: 0019'],
      ['ANEXO XXIII – SEGMENTO: TINTAS E VERNIZES'],
      ['ITEM', 'CEST', 'NCM/SH', 'Descrição', 'MVA-ST Alíquota de 7%'],
      [1, '24.001.00', '3208', 'Tintas', 0.5694],
    ],
  },
]);
const combustiveis = lerCombustiveis(lerXlsx(planilha));
const oleo = { nItem: '1', NCM: '27101932', orig: '0', pICMS: '7' };

describe('motor: lubrificante do Apêndice XIV', () => {
  it('2710 sem a planilha de combustíveis: segue sem ST (nada muda)', () => {
    const r = analisarItem(oleo, 'SP', { st });
    assert.equal(r.stSergipe, 'nao');
    assert.equal(r.cfopSugerido, '2102');
    assert.equal(r.apendiceXIV, null);
  });

  it('2710 com a planilha carregada e fora da ST: confirmar, com as linhas', () => {
    const r = analisarItem(oleo, 'SP', { st, combustiveis });
    assert.equal(r.stSergipe, 'confirmar');
    assert.equal(r.cfopSugerido, null);
    assert.ok(r.motivos.includes(MOTIVO_APENDICE_XIV));
    assert.equal(
      MOTIVO_APENDICE_XIV,
      'Pode ser lubrificante do Apêndice XIV (sem NCM na planilha); confirme',
    );
    assert.deepEqual(
      r.apendiceXIV?.map((c) => [c.descricao, c.mvas[0].valor]),
      [
        ['Óleo lubrificante teste A', 0.55],
        ['Graxa teste B', 0.64],
      ],
    );
    const sem = resolverItem(r, 'SP', {
      escolha: null,
      finalidade: 'revenda',
    });
    assert.equal(sem.st, 'confirmar');
    assert.equal(sem.motivo, MOTIVO_APENDICE_XIV);
    assert.equal(sem.precisaDeMim, true);
  });

  it('3403 também; outro NCM fora da planilha continua sem ST', () => {
    assert.equal(
      analisarItem({ ...oleo, NCM: '34031900' }, 'SP', { st, combustiveis })
        .stSergipe,
      'confirmar',
    );
    assert.equal(
      analisarItem({ ...oleo, NCM: '73181500' }, 'SP', { st, combustiveis })
        .stSergipe,
      'nao',
    );
  });

  it('2710 que está na planilha de ST: vale a planilha, não o apêndice', () => {
    const comLinha = lerTabelaST([
      {
        nome: 'Lubrificantes',
        linhas: [
          ['ANEXO X – SEGMENTO: LUBRIFICANTES'],
          ['ITEM', 'CEST', 'NCM/SH', 'Descrição', 'MVA-ST Alíquota de 7%'],
          [1, '06.006.00', '2710', 'Óleo', 0.3],
        ],
      },
    ]);
    const r = analisarItem(oleo, 'SP', { st: comLinha, combustiveis });
    assert.equal(r.apendiceXIV, null);
    assert.equal(r.candidatos.length, 1);
  });

  it('Sim usa a MVA e a alíquota da linha; Não é sem ST', () => {
    const r = analisarItem(oleo, 'SP', { st, combustiveis });
    const sim = resolverItem(r, 'SP', {
      escolha: {
        tipo: 'apendice-xiv',
        linhaPlanilha: 5,
        descricao: 'Graxa teste B',
      },
      finalidade: 'revenda',
    });
    assert.equal(sim.st, 'sim');
    assert.equal(sim.cfop, '2403');
    assert.equal(sim.mva, 0.64);
    assert.equal(sim.candidato?.aliquotaInterna?.aliquota, 18);
    assert.equal(sim.motivo, 'lubrificante do Apêndice XIV: Graxa teste B');
    const nao = resolverItem(r, 'SP', {
      escolha: { tipo: 'sem-st' },
      finalidade: 'revenda',
    });
    assert.equal(nao.st, 'nao');
    assert.equal(nao.cfop, '2102');
    assert.equal(nao.mva, null);
  });

  it('decisão lembrada por raiz do CNPJ + código do produto', () => {
    const r = analisarItem(oleo, 'SP', { st, combustiveis });
    const d = {
      escolha: {
        tipo: 'apendice-xiv' as const,
        linhaPlanilha: 4,
        descricao: 'Óleo lubrificante teste A',
      },
      finalidade: 'revenda' as const,
      raizCnpj: '12345678',
      fornecedor: 'Fornecedor Teste',
      cProd: 'OL-1',
      xProd: 'Óleo teste',
      ncm: '27101932',
      atualizadaEm: '2026-11-04T12:00:00.000Z',
    };
    assert.equal(decisaoValida(d), true);
    assert.equal(chaveDecisao('12.345.678/0001-90', 'OL-1'), '12345678|OL-1');
    assert.equal(decisaoAplicavel(r, d), true);
    // Linha que sumiu do apêndice: a decisão não vale mais.
    assert.equal(
      decisaoAplicavel(r, {
        ...d,
        escolha: { ...d.escolha, descricao: 'Outra' },
      }),
      false,
    );
    // Sem o apêndice carregado, a decisão não acha a linha.
    assert.equal(decisaoAplicavel(analisarItem(oleo, 'SP', { st }), d), false);
  });
});
