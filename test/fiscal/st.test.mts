import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buscarST, lerTabelaST, ncmsDaCelula } from '../../src/fiscal/st.ts';
import type { Aba } from '../../src/fiscal/xlsx.ts';

// Trechos da planilha do Portal ST de Sergipe (portal-st-se-v0019.xlsx,
// CONFAZ), linha a linha como saem do leitor de .xlsx. A coluna A vazia e o
// cabeçalho em linhas diferentes por aba são como na planilha.
const topo = (anexo: string): Aba['linhas'] => [
  [undefined, 'Versão: 0019'],
  [undefined, 'Unidade Federada Destinatária / Declarante: SE'],
  [undefined, 'Produção de efeitos a partir de 01/07/2023'],
  [undefined, anexo],
];
const LEG_AUTO = 'Art. 681, XVI, e Anexo IX, Tabela VI do RICMS/02';
const MVA_AUTO = [1.0614, 0.9969, 0.8896, 0.7178, 0.6387, 0.5875, 0.5022, 0.3656];

const abas: Aba[] = [
  {
    nome: 'Leiaute',
    linhas: [
      [undefined, 'Versão: XXX (1)'],
      [undefined, 'Item', 'CEST', 'Descrição (5)', 'Op. Interna (6)', 'UF 1(7)', 'Especificação MVA-ST (8)', 'MVA-ST  (9)'],
      [undefined, 1],
    ],
  },
  {
    nome: 'Autopecas',
    linhas: [
      ...topo('ANEXO II – SEGMENTO: AUTOPEÇAS'),
      [undefined, 'Observações:', undefined, undefined, undefined, undefined, undefined, undefined, 'Regra Geral'],
      [
        undefined, 'ITEM', 'CEST', 'NCM/SH', 'Descrição', 'Op. Interna', 'AC, AL, AM, BA', 'Legislação interna',
        'MVA-ST 1 Alíquota de 4%', 'MVA-ST 1 Alíquota de 7%', 'MVA-ST 1 Alíquota de 12%', 'MVA-ST 1 Alíquota de 19%',
        'MVA-ST 2 Alíquota de 4%', 'MVA-ST 2 Alíquota de 7%', 'MVA-ST 2 Alíquota de 12%', 'MVA-ST 2  Alíquota de 19%',
        'Alíq. Interna ',
      ],
      [undefined, 2, '01.002.00', 3917, 'Tubos e seus acessórios (por exemplo, juntas, cotovelos, flanges, uniões), de plásticos', 'S', 'PT 97/10', LEG_AUTO, ...MVA_AUTO, '19% + 1% (FECOEP)'],
      [undefined, 93, '01.090.00', '3919.10.00 3919.90.00 8708.29.99', 'Fitas, tiras, adesivos, autocolantes, de plástico, refletores, mesmo em rolos', 'S', 'PT 97/10', LEG_AUTO, ...MVA_AUTO, '19% + 1% (FECOEP)'],
      [undefined, 132, '01.999.00', undefined, 'Outras peças, partes e acessórios para veículos automotores não relacionados nos demais itens deste anexo', 'S', 'PT 97/10', LEG_AUTO, ...MVA_AUTO, '19% + 1% (FECOEP)'],
    ],
  },
  {
    nome: 'Lampadas',
    linhas: [
      ...topo('ANEXO X – SEGMENTO: LÂMPADAS, REATORES E “STARTER”'),
      [undefined, 'ITEM', 'CEST', 'NCM/SH', 'Descrição', 'Op. Interna', 'AC, AL, AM', 'Legislação interna', 'MVA-ST Alíquota de 4%', 'MVA-ST Alíquota de 7%', 'MVA-ST Alíquota de 12%', 'MVA-ST Alíquota de 19%', 'Alíquota interna'],
      [undefined, 1, '09.001.00', 8539, 'Lâmpadas elétricas', 'S', 'PT 17/85', 'Art. 681, XI', '92,36%', 0.8635, '76,33%', 0.6003, '19% + 1% (FECOEP)'],
    ],
  },
  {
    nome: 'Medicamento',
    linhas: [
      ...topo('ANEXO XIV – SEGMENTO: MEDICAMENTOS DE USO HUMANO'),
      [undefined, 'Observação: I. Para os medicamentos...'],
      [undefined, 'ITEM', 'CEST', 'NCM/SH', 'Descrição', 'Op. Interna', 'AC, AL, AP', 'Legislação interna', 'MVA - ST AJUSTADA À ALÍQUOTA'],
      [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 0.04, 0.07, 0.12, 0.19],
      [undefined, 1, '13.001.00', '3003        3004', 'Medicamentos de referência – positiva, exceto para uso veterinário', 'S', 'CV 234/17', 'Art. 681, VI', 0.6589, 0.607, 0.5206, 0.3824],
    ],
  },
  {
    nome: 'Bebidas Quentes',
    linhas: [
      ...topo('ANEXO III – SEGMENTO: BEBIDAS ALCOÓLICAS, EXCETO CERVEJA E CHOPE'),
      [undefined, 'Observações:'],
      [undefined, 'ITEM', 'CEST', 'NCM/SH', 'Descrição', 'Op. Interna', 'AL, AP', 'Legislação interna', 'MVA-ST  Alíquota de 4%', 'MVA-ST  Alíquota de 7%', 'MVA-ST  Alíquota de 12%', 'MVA-ST  Alíquota de 18 a 27%', 'Alíq. Interna'],
      [undefined, 1, '02.001.00', '2205    2208.90.00', 'Aperitivos, amargos, bitter e similares', 'S', 'PT13/06', 'Art. 681, XVIII', 69.7, 64.39, 55.56, 0.2904, '25% + 2% (FECOEP)'],
    ],
  },
  {
    nome: 'HPPC',
    linhas: [
      ...topo('ANEXO XIX – SEGMENTO: PRODUTOS DE PERFUMARIA E DE HIGIENE PESSOAL E COSMÉTICOS'),
      [undefined, 'ITEM', 'CEST', undefined, 'Descrição', 'Op. Interna', 'AC, AL', 'AC, AL, AP', 'Legislação interna', 'Alíquota de 4%', 'Alíquota de 7%', 'Alíquota de 12%', 'Alíquota de 19% + 1 (FECOEP)'],
      [undefined, '23.0', '20.023.00', '3306.10.00', 'Dentifrícios', 'S', undefined, 'PT 58/18', 'Art. 681, XXVII', 0.6966, 0.6435, 0.5552, 0.4138],
    ],
  },
  {
    nome: 'Tintas',
    linhas: [
      ...topo('ANEXO XXIII – SEGMENTO: TINTAS E VERNIZES'),
      [undefined, 'ITEM', 'CEST', 'NCM/SH', 'Descrição', 'Op. Interna', 'AC, AL, AM', 'Data Início de validade', 'Legislação interna', 'MVA-ST Alíquota de 4%', 'MVA-ST Alíquota de 7%', 'MVA-ST Alíquota de 12%', 'MVA-ST Alíquota de 19%', 'Alíquota interna'],
      [undefined, 1, '24.001.00', '3208        3209      3210.00', 'Tintas, vernizes', 'S', 'CV 118/17', '01.01.2018', 'Art. 681, V', 0.62, 0.5694, 0.485, 0.35, '19% + 1% (FECOEP)'],
      [undefined, 3, '24.003.00', '3204      3205.00.00   3206       3212', 'Corantes para aplicação em bases, tintas e vernizes', 'S', 'CV 118/17', '01.01.2018', 'Art. 681, V', 0.8, 0.7438, 0.65, 0.5, '19% + 1% (FECOEP)'],
    ],
  },
  {
    nome: 'Água mineral',
    linhas: [
      ['Versão: 0019'],
      ['Unidade Federada Destinatária / Declarante: SE'],
      ['Produção de efeitos a partir de 01/07/2023'],
      ['ANEXO IV – SEGMENTO:  ÁGUAS '],
      ['Observações:'],
      ['ITEM', 'CEST', 'Descrição', 'Op. Interna', 'AC, AL', 'Legislação interna', 'Alíq. Interna', 'Especificação Alíq.  Interna', 'PFC \r\n(R$)', 'Especificação PFC'],
      [3, '03.003.00', 'San Pellegrino', 'S', 'PT 11/91', 'Art. 681, I', '19% + 2% (FECOEP)', 'Regra Geral', 5.91, 'Água com gás em garrafa de vidro de 250 ml'],
    ],
  },
];

const tabela = lerTabelaST(abas);

describe('st: busca', () => {
  it('NCM 32081020 encontra Tintas, CEST 24.001.00, MVA 7% = 0,5694', () => {
    const r = buscarST(tabela, '32081020');
    assert.equal(r.candidatos.length, 1);
    const l = r.unico!;
    assert.equal(l.segmento, 'Tintas');
    assert.equal(l.segmentoOficial, 'TINTAS E VERNIZES');
    assert.equal(l.anexo, 'XXIII');
    assert.equal(l.cest, '24.001.00');
    assert.equal(l.ncm, '3208');
    assert.equal(l.mvaPorAliquota['7'], 0.5694);
    assert.deepEqual(l.aliquotaInterna, { texto: '19% + 1% (FECOEP)', numero: 20 });
    assert.equal(l.versao, '0019');
    assert.equal(l.vigencia, '01/07/2023');
    assert.equal(l.inicioValidade, '01.01.2018');
  });

  it('NCM 73181500 (parafuso) não encontra nada', () => {
    const r = buscarST(tabela, '73181500');
    assert.deepEqual(r.candidatos, []);
    assert.equal(r.unico, null);
  });

  it('NCM 3919.10.00 encontra o CEST 01.090.00 em Autopeças, com os dois jogos de MVA', () => {
    const r = buscarST(tabela, '3919.10.00');
    assert.equal(r.candidatos.length, 1);
    const l = r.unico!;
    assert.equal(l.segmento, 'Autopecas');
    assert.equal(l.cest, '01.090.00');
    assert.equal(l.ncm, '39191000');
    assert.deepEqual(
      l.jogosMva.map((j) => j.rotulo),
      ['MVA-ST 1', 'MVA-ST 2'],
    );
    assert.deepEqual(l.jogosMva[1].porAliquota, { '4': 0.6387, '7': 0.5875, '12': 0.5022, '19': 0.3656 });
    assert.deepEqual(l.mvaPorAliquota, l.jogosMva[0].porAliquota);
  });

  it('com mais de um candidato não escolhe: devolve todos, prefixo mais longo primeiro', () => {
    const linhas = [
      ...tabela.linhas,
      { ...tabela.linhas.find((l) => l.ncm === '3208')!, ncm: '320810', cest: '99.999.99', linhaPlanilha: 99 },
    ];
    const r = buscarST(linhas, '32081020');
    assert.equal(r.unico, null);
    assert.deepEqual(
      r.candidatos.map((c) => [c.linha.ncm, c.digitos]),
      [['320810', 6], ['3208', 4]],
    );
  });

  it('o CEST informado põe o candidato que confere na frente, sem descartar os outros', () => {
    const linhas = [
      ...tabela.linhas,
      { ...tabela.linhas.find((l) => l.ncm === '3208')!, ncm: '320810', cest: '99.999.99', linhaPlanilha: 99 },
    ];
    const r = buscarST(linhas, '32081020', '24.001.00');
    assert.deepEqual(
      r.candidatos.map((c) => [c.linha.cest, c.cestConfere]),
      [['24.001.00', true], ['99.999.99', false]],
    );
  });

  it('NCM que não tem 8 dígitos é erro', () => {
    assert.throws(() => buscarST(tabela, '3208'), /8 dígitos/);
  });
});

describe('st: normalização', () => {
  it('ignora a aba Leiaute', () => {
    assert.ok(!tabela.relatorio.abas.some((a) => a.aba === 'Leiaute'));
  });

  it('célula com vários NCMs vira várias linhas, só dígitos', () => {
    assert.deepEqual(
      tabela.linhas.filter((l) => l.cest === '24.003.00').map((l) => l.ncm),
      ['3204', '32050000', '3206', '3212'],
    );
    assert.deepEqual(ncmsDaCelula('3815.12.10    3815.12.90'), ['38151210', '38151290']);
    assert.deepEqual(ncmsDaCelula(3917), ['3917']);
  });

  it('MVA em texto com vírgula e % vira fração', () => {
    const l = tabela.linhas.find((x) => x.segmento === 'Lampadas')!;
    assert.deepEqual(l.mvaPorAliquota, { '4': 0.9236, '7': 0.8635, '12': 0.7633, '19': 0.6003 });
  });

  it('MVA gravada como percentual (69,7) vira fração e entra no relatório', () => {
    const l = tabela.linhas.find((x) => x.segmento === 'Bebidas Quentes')!;
    assert.deepEqual(l.mvaPorAliquota, { '4': 0.697, '7': 0.6439, '12': 0.5556, '19': 0.2904 });
    assert.ok(tabela.relatorio.problemas.some((p) => p.aba === 'Bebidas Quentes' && p.celula === 'I7' && /percentual/.test(p.motivo)));
  });

  it('cabeçalho em duas linhas (Medicamento) pega as alíquotas da linha de baixo', () => {
    const l = tabela.linhas.find((x) => x.segmento === 'Medicamento')!;
    assert.deepEqual(l.mvaPorAliquota, { '4': 0.6589, '7': 0.607, '12': 0.5206, '19': 0.3824 });
  });

  it('coluna de NCM sem título (HPPC) é deduzida e anotada', () => {
    const l = tabela.linhas.find((x) => x.segmento === 'HPPC')!;
    assert.equal(l.ncm, '33061000');
    assert.equal(l.mvaPorAliquota['19'], 0.4138);
    const aba = tabela.relatorio.abas.find((a) => a.aba === 'HPPC')!;
    assert.ok(aba.notas.some((n) => /sem título tratada como NCM/.test(n)));
  });

  it('alíquota interna numérica (0,19) vira texto e número em percentual', () => {
    const outra = lerTabelaST([
      {
        nome: 'Alimenticio',
        linhas: [
          ...topo('ANEXO XVII – SEGMENTO: PRODUTOS ALIMENTÍCIOS'),
          [undefined, 'ITEM', 'CEST', 'NCM/SH', 'Descrição', 'MVA-ST Estado signatário 4%', 'Alíq. Interna'],
          [undefined, 1, '17.031.01', '1905.90.90', 'Salgadinhos diversos', 0.3, 0.19],
        ],
      },
    ]);
    assert.deepEqual(outra.linhas[0].aliquotaInterna, { texto: '19%', numero: 19 });
  });
});

describe('st: relatório', () => {
  it('conta linhas por aba', () => {
    const porAba = Object.fromEntries(tabela.relatorio.abas.map((a) => [a.aba, [a.linhasProduto, a.linhasNcm, a.linhasSemNcm]]));
    assert.deepEqual(porAba, {
      Autopecas: [3, 4, 1],
      Lampadas: [1, 1, 0],
      Medicamento: [1, 2, 0],
      'Bebidas Quentes': [1, 2, 0],
      HPPC: [1, 1, 0],
      Tintas: [2, 7, 0],
      'Água mineral': [1, 0, 1],
    });
    assert.equal(tabela.relatorio.totalLinhas, 17);
    assert.equal(tabela.relatorio.versao, '0019');
  });

  it('aponta a linha sem NCM e a aba sem coluna NCM', () => {
    const p = tabela.relatorio.problemas.find((x) => x.aba === 'Autopecas');
    assert.deepEqual(p, { aba: 'Autopecas', celula: 'D9', valor: '', motivo: 'NCM vazio' });
    const agua = tabela.relatorio.abas.find((a) => a.aba === 'Água mineral')!;
    assert.ok(agua.notas.some((n) => /sem coluna NCM/.test(n)));
  });

  it('linha sem CEST e trecho que não é NCM entram como problema, com a célula', () => {
    const r = lerTabelaST([
      {
        nome: 'Teste',
        linhas: [
          ...topo('ANEXO I – SEGMENTO: TESTE'),
          [undefined, 'ITEM', 'CEST', 'NCM/SH', 'Descrição', 'MVA-ST Alíquota de 4%'],
          [undefined, '10.12', undefined, '2202', 'Combo sem CEST', 0.5],
          [undefined, 1, '01.001.00', '3208 Ex 01', 'Com exceção', 'abc'],
        ],
      },
    ]);
    assert.deepEqual(
      r.relatorio.problemas.map((p) => [p.celula, p.motivo]),
      [
        ['C6', 'linha sem CEST'],
        ['F7', 'MVA não é número nem percentual'],
        ['D7', 'trecho "Ex" não é um NCM (4 a 8 dígitos)'],
        ['D7', 'trecho "01" não é um NCM (4 a 8 dígitos)'],
      ],
    );
    assert.deepEqual(r.linhas.map((l) => l.ncm), ['3208']);
  });
});
