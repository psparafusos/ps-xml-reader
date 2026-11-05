import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  RESSALVA_APENDICE_XIV,
} from '../../src/fiscal/entrada.ts';
import { lerTabelaST } from '../../src/fiscal/st.ts';
import { lerXlsx } from '../../src/fiscal/xlsx.ts';
import { xlsxAbas, type CelulaTeste } from './fixtures/xlsx.mts';

// Planilha de combustíveis inventada, no formato do CONFAZ: uma aba só (de
// nome qualquer), o cabeçalho e os apêndices empilhados. O Apêndice XIV tem
// os dois grupos mesclados, "Internas"/"Interestaduais", as alíquotas das
// interestaduais divididas e a linha dos valores. Valores fictícios.
const linhas: CelulaTeste[][] = [
  ['ANEXO ÚNICO'], // 1
  [],
  ['(ATO COTEPE/ICMS 61/19, de 20 de novembro de 2019)'], // 3
  [],
  ['UF DESTINATÁRIA/DECLARANTE: SERGIPE'], // 5
  [],
  ['VERSÃO: 007'], // 7
  [],
  ['PRODUÇÃO DE EFEITOS A PARTIR DE: 01/02/2026'], // 9
  [],
  [],
  ['APÊNDICE I - OPERAÇÕES DE TESTE COM GASOLINA'], // 12
  ['Gasolina teste', null, 'Óleo teste'], // 13
  ['Internas', 'Interestaduais', 'Internas', 'Interestaduais'], // 14
  [0.11, 0.22, 0.33, 0.44], // 15
  [],
  ['APÊNDICE XIV - OPERAÇÕES DE TESTE COM LUBRIFICANTES'], // 17
  [
    'Lubrificantes Derivados de Petróleo',
    null,
    'Lubrificantes Não Derivados de Petróleo',
  ], // 18
  ['Internas', 'Interestaduais', 'Internas', 'Interestaduais'], // 19
  [null, null, null, 0.07, 0.12, 'Importação 4%'], // 20
  [0.5, 0.9, 0.55, 0.8, 0.7, '85%'], // 21
];
const mesclas = [
  'A17:F17',
  'A18:B18',
  'C18:F18',
  'A19:A20',
  'B19:B20',
  'C19:C20',
  'D19:F19',
];
const planilha = xlsxAbas([{ nome: 'Planilha2', linhas, mesclas }]);

describe('combustíveis: leitor do Apêndice XIV', () => {
  it('lê o cabeçalho e as MVAs dos dois grupos pelos títulos e mesclas', () => {
    const t = lerCombustiveis(lerXlsx(planilha));
    assert.deepEqual(t.cabecalho, {
      versao: '007',
      uf: 'SERGIPE',
      vigencia: '01/02/2026',
    });
    assert.equal(t.derivado.titulo, 'Lubrificantes Derivados de Petróleo');
    assert.equal(t.derivado.interna, 0.5);
    assert.equal(t.derivado.interestadual, 0.9);
    assert.equal(t.derivado.porAliquota, null);
    assert.equal(t.naoDerivado.interna, 0.55);
    assert.equal(t.naoDerivado.interestadual, null);
    // "85%" em texto vira fração.
    assert.deepEqual(t.naoDerivado.porAliquota, {
      '4': 0.85,
      '7': 0.8,
      '12': 0.7,
    });
    assert.deepEqual(t.naoDerivado.celulas, {
      interna: 'C21',
      '7': 'D21',
      '12': 'E21',
      '4': 'F21',
    });
    assert.equal(t.relatorio.aba, 'Planilha2');
    assert.equal(t.relatorio.linhaApendice, 17);
    assert.equal(t.relatorio.linhaValores, 21);
    assert.deepEqual(t.relatorio.outrosApendices, ['Apêndice I']);
    assert.deepEqual(t.relatorio.problemas, []);
    assert.deepEqual(t.relatorio.notas, []);
    assert.deepEqual(t.relatorio.lido, [
      'UF destinatária: SERGIPE',
      'Derivados de petróleo: interna 50% (A21), interestadual 90% (B21)',
      'Não derivados de petróleo: interna 55% (C21), interestadual 7% 80% (D21), interestadual 12% 70% (E21), importação 4% 85% (F21)',
    ]);
  });

  it('sem mesclas: cada título vale até o próximo da mesma linha', () => {
    const t = lerCombustiveis(
      lerXlsx(xlsxAbas([{ nome: 'Qualquer', linhas }])),
    );
    assert.equal(t.derivado.interestadual, 0.9);
    assert.deepEqual(t.naoDerivado.porAliquota, {
      '4': 0.85,
      '7': 0.8,
      '12': 0.7,
    });
  });

  it('acha o apêndice por título, não por posição (colunas trocadas)', () => {
    const trocado: CelulaTeste[][] = [
      ...linhas.slice(0, 16),
      ['APÊNDICE XIV - LUBRIFICANTES'],
      [
        'Lubrificantes Não Derivados de Petróleo',
        null,
        null,
        null,
        'Lubrificantes Derivados de Petróleo',
      ],
      ['Interestaduais', null, null, 'Internas', 'Interestaduais', 'Internas'],
      ['Importação 4%', 0.12, 0.07],
      [0.85, 0.7, 0.8, 0.55, 0.9, 0.5],
    ];
    const t = lerCombustiveis(
      lerXlsx(
        xlsxAbas([
          {
            nome: 'X',
            linhas: trocado,
            mesclas: ['A18:D18', 'E18:F18', 'A19:C19'],
          },
        ]),
      ),
    );
    assert.equal(t.derivado.interna, 0.5);
    assert.equal(t.derivado.interestadual, 0.9);
    assert.equal(t.naoDerivado.interna, 0.55);
    assert.deepEqual(t.naoDerivado.porAliquota, {
      '4': 0.85,
      '7': 0.8,
      '12': 0.7,
    });
  });

  it('sem "APÊNDICE XIV": recusa com "não parece a planilha de combustíveis"', () => {
    const sem = xlsxAbas([{ nome: 'Planilha2', linhas: linhas.slice(0, 16) }]);
    assert.throws(
      () => lerCombustiveis(lerXlsx(sem)),
      (e: unknown) =>
        e instanceof ErroFormato &&
        e.message === MENSAGEM_SEM_APENDICE &&
        /não parece a planilha de combustíveis/.test(e.message),
    );
    // "APÊNDICE XV" e "XIV-A" não confundem; título no meio do texto também não.
    for (const titulo of [
      'APÊNDICE XV - LUBRIFICANTES',
      'APÊNDICE XIVA',
      'VER APÊNDICE XIV',
    ]) {
      const outro = linhas.map((l, i) => (i === 16 ? [titulo] : l));
      assert.throws(
        () =>
          lerCombustiveis(lerXlsx(xlsxAbas([{ nome: 'P', linhas: outro }]))),
        ErroFormato,
        titulo,
      );
    }
  });

  it('UF que não é Sergipe (ou sem UF): recusa', () => {
    const bahia = linhas.map((l, i) =>
      i === 4 ? ['UF DESTINATÁRIA/DECLARANTE: BAHIA'] : l,
    );
    assert.throws(
      () => lerCombustiveis(lerXlsx(xlsxAbas([{ nome: 'P', linhas: bahia }]))),
      (e: unknown) =>
        e instanceof ErroFormato &&
        e.message ===
          'Esta planilha de combustíveis é da UF destinatária BAHIA, não de Sergipe.',
    );
    const semUf = linhas.map((l, i) => (i === 4 ? [] : l));
    assert.throws(
      () => lerCombustiveis(lerXlsx(xlsxAbas([{ nome: 'P', linhas: semUf }]))),
      /não diz a UF destinatária/,
    );
  });

  it('versão e vigência que faltam viram nota, não recusa', () => {
    const sem = linhas.map((l, i) => (i === 6 || i === 8 ? [] : l));
    const t = lerCombustiveis(lerXlsx(xlsxAbas([{ nome: 'P', linhas: sem }])));
    assert.equal(t.cabecalho.versao, '');
    assert.deepEqual(t.relatorio.notas, [
      'cabeçalho sem a versão',
      'cabeçalho sem a data de produção de efeitos',
    ]);
  });

  it('valor ilegível vira problema com a célula; "-" é vazio', () => {
    const ruim = linhas.map((l, i) =>
      i === 20 ? [0.5, 'abc', '-', 0.8, 0.7, 0.85] : l,
    );
    const t = lerCombustiveis(
      lerXlsx(xlsxAbas([{ nome: 'P', linhas: ruim, mesclas }])),
    );
    assert.equal(t.derivado.interestadual, null);
    assert.equal(t.naoDerivado.interna, null);
    assert.deepEqual(
      t.relatorio.problemas.map((p) => [p.celula, p.motivo]),
      [['B21', 'MVA não é número nem percentual']],
    );
  });
});

const pasta = mkdtempSync(join(tmpdir(), 'ps-combustiveis-'));
after(() => rmSync(pasta, { recursive: true, force: true }));

describe('combustíveis: importação na pasta de dados', () => {
  it('grava combustiveis.json com versão e vigência e carrega na base', () => {
    const info = importarDocumento(
      'combustiveis',
      planilha,
      'combustiveis-teste.xlsx',
      pasta,
      new Date('2026-11-04T12:00:00Z'),
    );
    assert.equal(info.tipo, 'combustiveis');
    assert.equal(info.versao, '007');
    assert.equal(info.vigencia, '01/02/2026');
    assert.deepEqual(info.quantidades, [
      { rotulo: 'MVAs do Apêndice XIV', valor: 6 },
    ]);
    assert.ok(info.observacoes.includes('UF destinatária: SERGIPE.'));
    assert.ok(existsSync(join(pasta, 'combustiveis.json')));
    const base = carregarBaseFiscal(pasta);
    assert.equal(base.combustiveis?.derivado.interestadual, 0.9);
    assert.equal(base.combustiveis?.cabecalho.uf, 'SERGIPE');
    assert.equal(base.info.combustiveis?.arquivo, 'combustiveis-teste.xlsx');
  });

  it('arquivo errado não troca o que estava', () => {
    assert.throws(
      () =>
        importarDocumento(
          'combustiveis',
          xlsxAbas([{ nome: 'Outra', linhas: [['a', 'b']] }]),
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
const revenda = 'revenda' as const;
const sim = (lubrificante: 'derivado' | 'nao-derivado') => ({
  escolha: { tipo: 'apendice-xiv' as const, lubrificante },
  finalidade: revenda,
});

describe('motor: lubrificante do Apêndice XIV', () => {
  it('2710 sem a planilha de combustíveis: segue sem ST (nada muda)', () => {
    const r = analisarItem(oleo, 'SP', { st });
    assert.equal(r.stSergipe, 'nao');
    assert.equal(r.cfopSugerido, '2102');
    assert.equal(r.apendiceXIV, null);
  });

  it('2710 com a planilha: confirmar, com derivado e não derivado', () => {
    const r = analisarItem(oleo, 'SP', { st, combustiveis });
    assert.equal(r.stSergipe, 'confirmar');
    assert.equal(r.cfopSugerido, null);
    assert.ok(r.motivos.includes(MOTIVO_APENDICE_XIV));
    assert.deepEqual(
      r.apendiceXIV?.map((c) => [
        c.lubrificante,
        c.descricao,
        c.mvas[0].valor,
        c.colunaApendice,
      ]),
      [
        ['derivado', 'Derivado de petróleo', 0.9, 'interestadual'],
        ['nao-derivado', 'Não derivado de petróleo', 0.8, 'interestadual 7%'],
      ],
    );
    const sem = resolverItem(r, 'SP', { escolha: null, finalidade: revenda });
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

  it('fornecedor de fora: derivado na coluna única; não derivado pela alíquota', () => {
    const r = analisarItem(oleo, 'SP', { st, combustiveis });
    const d = resolverItem(r, 'SP', sim('derivado'));
    assert.equal(d.st, 'sim');
    assert.equal(d.cfop, '2403');
    assert.equal(d.mva, 0.9);
    assert.equal(
      d.motivo,
      `Apêndice XIV, derivado de petróleo, MVA 90% (interestadual). ${RESSALVA_APENDICE_XIV}`,
    );
    assert.equal(
      RESSALVA_APENDICE_XIV,
      'Apêndice XIV trata de operações de distribuidoras; confirmar com a contabilidade',
    );
    const n7 = resolverItem(r, 'SP', sim('nao-derivado'));
    assert.equal(n7.mva, 0.8);
    assert.equal(
      n7.motivo,
      `Apêndice XIV, não derivado de petróleo, MVA 80% (interestadual 7%). ${RESSALVA_APENDICE_XIV}`,
    );
    const r12 = analisarItem({ ...oleo, pICMS: '12' }, 'MG', {
      st,
      combustiveis,
    });
    assert.equal(resolverItem(r12, 'MG', sim('nao-derivado')).mva, 0.7);
    assert.equal(resolverItem(r12, 'MG', sim('derivado')).mva, 0.9);
  });

  it('importado: coluna "Importação 4%"; alíquota fora de 4, 7, 12: confirmar', () => {
    const imp = analisarItem({ ...oleo, orig: '1', pICMS: '4' }, 'SP', {
      st,
      combustiveis,
    });
    const r = resolverItem(imp, 'SP', sim('nao-derivado'));
    assert.equal(r.mva, 0.85);
    assert.match(r.motivo, /MVA 85% \(importação 4%\)/);
    const estranha = analisarItem({ ...oleo, pICMS: '18' }, 'SP', {
      st,
      combustiveis,
    });
    const e = resolverItem(estranha, 'SP', sim('nao-derivado'));
    assert.equal(e.mva, null);
    assert.equal(e.precisaDeMim, true);
    assert.match(
      e.motivo,
      /^Apêndice XIV, não derivado de petróleo, MVA a confirmar/,
    );
    // O derivado tem uma coluna só: a alíquota da nota não importa.
    assert.equal(resolverItem(estranha, 'SP', sim('derivado')).mva, 0.9);
  });

  it('fornecedor de SE: coluna Internas, CFOP 1403', () => {
    const r = analisarItem({ ...oleo, pICMS: '19' }, 'SE', {
      st,
      combustiveis,
    });
    const d = resolverItem(r, 'SE', sim('derivado'));
    assert.equal(d.cfop, '1403');
    assert.equal(d.mva, 0.5);
    assert.match(d.motivo, /MVA 50% \(interna\)/);
    assert.equal(resolverItem(r, 'SE', sim('nao-derivado')).mva, 0.55);
  });

  it('Não é sem ST; outra finalidade não calcula MVA', () => {
    const r = analisarItem(oleo, 'SP', { st, combustiveis });
    const nao = resolverItem(r, 'SP', {
      escolha: { tipo: 'sem-st' },
      finalidade: revenda,
    });
    assert.equal(nao.st, 'nao');
    assert.equal(nao.cfop, '2102');
    assert.equal(nao.mva, null);
    const uso = resolverItem(r, 'SP', {
      ...sim('derivado'),
      finalidade: 'uso-consumo',
    });
    assert.equal(uso.cfop, '2407');
    assert.equal(uso.mva, null);
  });

  it('decisão lembrada por raiz do CNPJ + código do produto', () => {
    const r = analisarItem(oleo, 'SP', { st, combustiveis });
    const d = {
      ...sim('nao-derivado'),
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
    // Decisão do formato antigo (linha do apêndice): não vale mais.
    assert.equal(
      decisaoValida({
        ...d,
        escolha: { tipo: 'apendice-xiv', linhaPlanilha: 4, descricao: 'Óleo' },
      }),
      false,
    );
    // Sem o apêndice carregado, a decisão não acha a opção.
    assert.equal(decisaoAplicavel(analisarItem(oleo, 'SP', { st }), d), false);
  });
});

// Com o arquivo real do CONFAZ em samples\fiscal (fora do git).
const real = new URL(
  '../../samples/fiscal/combustiveis-se-v002.xlsx',
  import.meta.url,
);
describe('combustíveis: arquivo real do CONFAZ', () => {
  it(
    'combustiveis-se-v002.xlsx: Sergipe, versão 002 e as MVAs do Apêndice XIV',
    { skip: !existsSync(real) },
    () => {
      const t = lerCombustiveis(lerXlsx(new Uint8Array(readFileSync(real))));
      assert.equal(t.cabecalho.uf, 'SERGIPE');
      assert.equal(t.cabecalho.versao, '002');
      assert.ok(t.cabecalho.vigencia);
      assert.equal(t.derivado.interna, 0.6534);
      assert.equal(t.derivado.interestadual, 1.0667);
      assert.equal(t.derivado.porAliquota, null);
      assert.equal(t.naoDerivado.interna, 0.6534);
      assert.deepEqual(t.naoDerivado.porAliquota, {
        '7': 0.9221,
        '12': 0.8187,
        '4': 0.9841,
      });
      assert.deepEqual(t.relatorio.problemas, []);
      assert.ok(t.relatorio.outrosApendices.includes('Apêndice XIII'));
    },
  );
});
