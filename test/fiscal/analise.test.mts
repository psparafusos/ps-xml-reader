import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { analisarItem, analisarNota } from '../../src/fiscal/analise.ts';
import { lerTabelaST } from '../../src/fiscal/st.ts';
import { lerTipi } from '../../src/fiscal/tipi.ts';
import type { Aba } from '../../src/fiscal/xlsx.ts';
import type { Item } from '../../src/nfe/tipos.ts';

// Planilha de ST no leiaute do Portal ST de Sergipe. Tintas e Autopeças são
// trechos da v0019; "Construcao" e "Alimenticio" são inventados para os
// casos de dois candidatos, descrição que restringe e três jogos de MVA.
const topo = (anexo: string): Aba['linhas'] => [
  ['Versão: 0019'],
  ['Produção de efeitos a partir de 01/07/2023'],
  [anexo],
];
const cab = (...mva: string[]) => [
  'ITEM',
  'CEST',
  'NCM/SH',
  'Descrição',
  ...mva,
  'Alíquota interna',
];

const abas: Aba[] = [
  {
    nome: 'Tintas',
    linhas: [
      ...topo('ANEXO XXIII – SEGMENTO: TINTAS E VERNIZES'),
      cab(
        'MVA-ST Alíquota de 4%',
        'MVA-ST Alíquota de 7%',
        'MVA-ST Alíquota de 12%',
        'MVA-ST Alíquota de 19%',
      ),
      [
        1,
        '24.001.00',
        '3208  3209',
        'Tintas, vernizes',
        0.62,
        0.5694,
        0.485,
        0.35,
        '19% + 1% (FECOEP)',
      ],
    ],
  },
  {
    nome: 'Autopecas',
    linhas: [
      ...topo('ANEXO II – SEGMENTO: AUTOPEÇAS'),
      cab(
        'MVA-ST 1 Alíquota de 4%',
        'MVA-ST 1 Alíquota de 7%',
        'MVA-ST 1 Alíquota de 12%',
        'MVA-ST 1 Alíquota de 19%',
        'MVA-ST 2 Alíquota de 4%',
        'MVA-ST 2 Alíquota de 7%',
        'MVA-ST 2 Alíquota de 12%',
        'MVA-ST 2 Alíquota de 19%',
      ),
      [
        2,
        '01.002.00',
        3917,
        'Tubos e seus acessórios, de plásticos',
        1.0614,
        0.9969,
        0.8896,
        0.7178,
        0.6387,
        0.5875,
        0.5022,
        0.3656,
        '20%',
      ],
      [
        93,
        '01.090.00',
        '3919.10.00',
        'Fitas, tiras, adesivos, de plástico, refletores',
        1.0614,
        0.9969,
        0.8896,
        0.7178,
        0.6387,
        0.5875,
        0.5022,
        0.3656,
        '20%',
      ],
    ],
  },
  {
    nome: 'Construcao',
    linhas: [
      ...topo('ANEXO IX – SEGMENTO: MATERIAIS DE CONSTRUÇÃO'),
      cab(
        'MVA-ST Alíquota de 4%',
        'MVA-ST Alíquota de 7%',
        'MVA-ST Alíquota de 12%',
        'MVA-ST Alíquota de 19%',
      ),
      [10, '10.010.00', 3919, 'Fitas de plástico', 0.5, 0.45, 0.4, 0.3, '20%'],
      [
        11,
        '10.011.00',
        7326,
        'Abraçadeiras de ferro, exceto para uso automotivo',
        0.5,
        0.45,
        0.4,
        0.3,
        '20%',
      ],
    ],
  },
  {
    nome: 'Alimenticio',
    linhas: [
      ...topo('ANEXO XVII – SEGMENTO: PRODUTOS ALIMENTÍCIOS'),
      cab(
        'MVA Estado signatário Alíquota de 4%',
        'MVA Estado signatário Alíquota de 7%',
        'MVA Estado signatário Alíquota de 12%',
        'MVA Estado não signatário Alíquota de 4%',
        'MVA Estado não signatário Alíquota de 7%',
        'MVA Estado não signatário Alíquota de 12%',
        'MVA importação Alíquota de 4%',
      ),
      [
        1,
        '17.001.00',
        '1806.31.10',
        'Chocolate recheado',
        0.6,
        0.55,
        0.5,
        0.4,
        0.35,
        0.3,
        0.7,
        '20%',
      ],
    ],
  },
];

const st = lerTabelaST(abas);
const tipi = lerTipi(
  readFileSync(new URL('./fixtures/tipi-trecho.txt', import.meta.url), 'utf8'),
);
const base = { st, tipi };

describe('analise: casos da contabilidade', () => {
  it('verniz 32081020, orig 0, ICMS 7%, fornecedor SP: ST sim, CFOP 2403', () => {
    const ok = analisarItem(
      {
        nItem: '1',
        NCM: '32081020',
        CEST: '2400100',
        orig: '0',
        CST: '00',
        pICMS: '7.0000',
        CFOP: '6102',
        pIPI: '3.2500',
      },
      'SP',
      base,
    );
    assert.equal(ok.stSergipe, 'sim');
    assert.equal(ok.segmento, 'Tintas');
    assert.equal(ok.cest, '24.001.00');
    assert.deepEqual(ok.origem, { codigo: '0', tipo: 'nacional' });
    assert.equal(ok.colunaMva, '7');
    assert.equal(ok.mva, 0.5694);
    assert.equal(ok.cfopSugerido, '2403');
    assert.equal(ok.candidatos.length, 1);
    assert.deepEqual(ok.pendencias, []);
    assert.ok(ok.motivos.some((m) => /mesmo assim/.test(m)));
    assert.equal(ok.tipi.existe, true);
    assert.equal(ok.tipi.descricao, 'Vernizes');
    assert.equal(ok.tipi.aliquotaTipi, 3.25);
    assert.equal(ok.tipi.confere, true);
  });

  it('verniz sem CEST na nota: avalia pelo segmento e decide', () => {
    const r = analisarItem(
      { NCM: '3208.10.20', orig: '0', pICMS: '7', CFOP: '6403' },
      'SP',
      base,
    );
    assert.equal(r.stSergipe, 'sim');
    assert.equal(r.cestNota, null);
    assert.equal(r.cest, '24.001.00');
    assert.ok(
      r.motivos.some((m) =>
        /sem CEST: avaliado pelo segmento \(Tintas\)/.test(m),
      ),
    );
    assert.ok(r.motivos.some((m) => /CFOP 6403/.test(m)));
  });

  it('parafuso 73181500, fornecedor SC: ST não, CFOP 2102', () => {
    const r = analisarItem(
      { NCM: '73181500', orig: '0', pICMS: '12', CFOP: '6102', pIPI: '6.5' },
      'SC',
      base,
    );
    assert.equal(r.stSergipe, 'nao');
    assert.deepEqual(r.candidatos, []);
    assert.equal(r.cfopSugerido, '2102');
    assert.equal(r.mva, null);
    assert.deepEqual(r.pendencias, []);
    assert.equal(r.tipi.aliquotaTipi, 6.5);
    assert.equal(r.tipi.confere, true);
  });

  it('parafuso de fornecedor de SE: CFOP 1102', () => {
    const r = analisarItem({ NCM: '73181500', orig: '0' }, 'se', base);
    assert.equal(r.cfopSugerido, '1102');
  });

  it('NCM com dois candidatos: confirmar, com os dois listados', () => {
    const r = analisarItem(
      { NCM: '39191000', CEST: '01.090.00', orig: '0', pICMS: '12' },
      'SP',
      base,
    );
    assert.equal(r.stSergipe, 'confirmar');
    assert.deepEqual(
      r.candidatos.map((c) => [c.segmento, c.cest, c.ncmPlanilha]),
      [
        ['Autopecas', '01.090.00', '39191000'],
        ['Construcao', '10.010.00', '3919'],
      ],
    );
    assert.equal(r.segmento, null);
    assert.equal(r.cest, null);
    assert.equal(r.mva, null);
    assert.equal(r.cfopSugerido, null);
    assert.ok(r.motivos.some((m) => /2 linhas da planilha/.test(m)));
    assert.ok(
      r.motivos.some((m) => /aponta para a linha 6 de Autopecas/.test(m)),
    );
  });

  it('Autopeças: MVA-ST 1 é a padrão, MVA-ST 2 fica à parte, sem confirmar', () => {
    const r = analisarItem(
      { NCM: '39173100', CEST: '01.002.00', orig: '0', pICMS: '12' },
      'SP',
      base,
    );
    assert.equal(r.stSergipe, 'sim');
    assert.equal(r.candidatos.length, 1);
    assert.deepEqual(r.candidatos[0].mvas, [
      { rotulo: 'MVA-ST 1', valor: 0.8896 },
      { rotulo: 'MVA-ST 2', valor: 0.5022 },
    ]);
    assert.equal(r.mva, 0.8896);
    assert.equal(r.mvaRotulo, 'MVA-ST 1');
    assert.deepEqual(r.mvaAlternativa, { rotulo: 'MVA-ST 2', valor: 0.5022 });
    assert.ok(!r.pendencias.some((p) => /jogos de MVA/.test(p)));
    assert.ok(r.motivos.some((m) => /fidelização com montadora/.test(m)));
    assert.equal(r.cfopSugerido, '2403');
  });

  it('Alimentício: três jogos de MVA (signatário, não signatário, importação)', () => {
    const r = analisarItem(
      { NCM: '18063110', CEST: '17.001.00', orig: '1', pICMS: '4' },
      'SP',
      base,
    );
    assert.equal(r.stSergipe, 'confirmar');
    assert.deepEqual(
      r.candidatos[0].mvas.map((m) => m.rotulo),
      ['MVA Estado signatário', 'MVA Estado não signatário', 'MVA importação'],
    );
    assert.deepEqual(r.origem, { codigo: '1', tipo: 'importado' });
  });
});

describe('analise: outros motivos para confirmar', () => {
  it('prefixo curto com descrição que restringe', () => {
    const r = analisarItem(
      { NCM: '73269090', CEST: '10.011.00', orig: '0', pICMS: '12' },
      'SP',
      base,
    );
    assert.equal(r.stSergipe, 'confirmar');
    assert.equal(r.cfopSugerido, null);
    assert.ok(
      r.pendencias.some((p) => /prefixo 7326 e a descrição restringe/.test(p)),
    );
  });

  it('CEST da nota diferente do candidato', () => {
    const r = analisarItem(
      { NCM: '32081020', CEST: '24.003.00', orig: '0', pICMS: '7' },
      'SP',
      base,
    );
    assert.equal(r.stSergipe, 'confirmar');
    assert.equal(r.cfopSugerido, null);
    assert.ok(
      r.pendencias.some((p) => /CEST da nota \(24\.003\.00\) não bate/.test(p)),
    );
  });

  it('alíquota da nota fora de 4, 7 e 12', () => {
    const r = analisarItem(
      { NCM: '32081020', CEST: '24.001.00', orig: '0', pICMS: '19' },
      'SE',
      base,
    );
    assert.equal(r.stSergipe, 'confirmar');
    assert.equal(r.colunaMva, null);
    assert.equal(r.mva, null);
    assert.deepEqual(r.candidatos[0].mvas, [{ rotulo: 'MVA-ST', valor: null }]);
    assert.equal(r.cfopSugerido, '1403');
    assert.ok(r.pendencias.some((p) => /\(19%\) não é 4, 7 ou 12/.test(p)));
  });

  it('nota sem alíquota de ICMS', () => {
    const r = analisarItem({ NCM: '32081020', orig: '0' }, 'SP', base);
    assert.equal(r.stSergipe, 'confirmar');
    assert.ok(r.pendencias.some((p) => /sem alíquota de ICMS/.test(p)));
  });

  it('NCM inválido', () => {
    const r = analisarItem({ NCM: '3208', orig: '0' }, 'SP', base);
    assert.equal(r.stSergipe, 'confirmar');
    assert.ok(r.pendencias.some((p) => /não tem 8 dígitos/.test(p)));
  });
});

describe('analise: pendências informativas', () => {
  it('importado com alíquota diferente de 4% interestadual', () => {
    const r = analisarItem(
      { NCM: '73181500', orig: '2', pICMS: '12' },
      'SP',
      base,
    );
    assert.equal(r.stSergipe, 'nao');
    assert.ok(
      r.pendencias.some((p) => /origem 2 \(importado\) pede 4%/.test(p)),
    );
  });

  it('fornecedor usou ST mas o NCM está fora da planilha', () => {
    const r = analisarItem(
      { NCM: '73181500', orig: '0', CST: '10', pICMS: '12', pIPI: '6.5' },
      'SP',
      base,
    );
    assert.equal(r.stSergipe, 'nao');
    assert.ok(
      r.pendencias.some((p) => /fornecedor tratou como ST \(CST 10\)/.test(p)),
    );
  });

  it('IPI diferente da TIPI é informação, não muda a análise', () => {
    const r = analisarItem(
      { NCM: '73181500', orig: '0', pICMS: '12', pIPI: '5' },
      'SP',
      base,
    );
    assert.equal(r.stSergipe, 'nao');
    assert.equal(r.tipi.confere, false);
    assert.equal(
      r.tipi.aviso,
      'IPI da nota (5%) difere da TIPI (6,5%): informação, conferir exceções (Ex)',
    );
  });

  it('NCM fora da TIPI', () => {
    const r = analisarItem(
      { NCM: '32081099', orig: '0', pICMS: '7' },
      'SP',
      base,
    );
    assert.equal(r.tipi.existe, false);
    assert.ok(r.pendencias.includes('NCM não existe na TIPI'));
  });

  it('sem TIPI carregada, a parte de IPI fica em branco', () => {
    const r = analisarItem({ NCM: '73181500', orig: '0' }, 'SP', { st });
    assert.equal(r.tipi.existe, null);
    assert.equal(r.tipi.confere, null);
  });

  it('origem ausente e UF ausente viram pendência', () => {
    const r = analisarItem({ NCM: '73181500' }, '', base);
    assert.equal(r.origem.tipo, null);
    assert.equal(r.cfopSugerido, null);
    assert.ok(r.pendencias.includes('nota sem origem (orig)'));
    assert.ok(r.pendencias.some((p) => /UF do fornecedor ausente/.test(p)));
  });
});

describe('analise: nota inteira', () => {
  it('usa os campos que o parser preenche', () => {
    const item = {
      nItem: '3',
      NCM: '32081020',
      CEST: '24.001.00',
      CFOP: '6102',
      orig: '0',
      CST: '00',
      pICMS: '7.00',
      pIPI: '3.25',
    } as Item;
    const [r] = analisarNota([item], 'SP', base);
    assert.equal(r.nItem, '3');
    assert.equal(r.stSergipe, 'sim');
    assert.equal(r.mva, 0.5694);
  });
});

// Aba inventada com a coluna de estados do Portal ST: o título é a lista de
// UFs e a célula, o acordo com SE.
const stEstados = lerTabelaST([
  {
    nome: 'Ferramentas',
    linhas: [
      ...topo('ANEXO XI – SEGMENTO: FERRAMENTAS'),
      [
        'ITEM',
        'CEST',
        'NCM/SH',
        'Descrição',
        'AL, BA, MG, SP',
        'Legislação interna',
        'MVA-ST Alíquota de 4%',
        'MVA-ST Alíquota de 7%',
        'MVA-ST Alíquota de 12%',
        'MVA-ST Alíquota de 19%',
        'Alíquota interna',
      ],
      [
        1,
        '08.001.00',
        '8205.10.00',
        'Ferramenta A',
        'PT 97/10',
        'Art. 1',
        0.5,
        0.45,
        0.4,
        0.3,
        '25% + 1% (FECOEP)',
      ],
      [
        2,
        '08.002.00',
        '8205.20.00',
        'Ferramenta B',
        undefined,
        'Art. 2',
        0.5,
        0.45,
        0.4,
        0.3,
        '19%',
      ],
      [
        3,
        '08.003.00',
        '8205.30.00',
        'Ferramenta C',
        'CV 118/17',
        'Art. 3',
        0.5,
        0.45,
        0.4,
        0.3,
        'conforme legislação',
      ],
      [4, '08.004.00', '8205.40.00', 'Ferramenta D', 'PT 97/10', 'Art. 4'],
    ],
  },
]);
const baseEstados = { st: stEstados };
const itemFerramenta = (NCM: string, extra = {}) => ({
  NCM,
  orig: '0',
  pICMS: '12',
  ...extra,
});

describe('analise: alíquota interna da linha', () => {
  it('25% + 1% (FECOEP): texto original e números separados', () => {
    const r = analisarItem(itemFerramenta('82051000'), 'SP', baseEstados);
    assert.equal(r.stSergipe, 'sim');
    assert.deepEqual(r.aliquotaInterna, {
      texto: '25% + 1% (FECOEP)',
      aliquota: 25,
      fecoep: 1,
    });
    assert.deepEqual(r.candidatos[0].aliquotaInterna, r.aliquotaInterna);
    assert.ok(!r.pendencias.some((p) => /alíquota interna/.test(p)));
  });

  it('linha sem FECOEP: fecoep 0', () => {
    const r = analisarItem(itemFerramenta('82052000'), 'SP', baseEstados);
    assert.deepEqual(r.aliquotaInterna, {
      texto: '19%',
      aliquota: 19,
      fecoep: 0,
    });
    assert.ok(r.motivos.some((m) => /alíquota interna 19% sem FECOEP/.test(m)));
  });

  it('texto que não dá para interpretar: pendência, texto guardado', () => {
    const r = analisarItem(itemFerramenta('82053000'), 'SP', baseEstados);
    assert.deepEqual(r.aliquotaInterna, {
      texto: 'conforme legislação',
      aliquota: null,
      fecoep: null,
    });
    assert.ok(
      r.pendencias.includes('alíquota interna: confirmar com a contabilidade'),
    );
  });

  it('linha sem a coluna preenchida: pendência', () => {
    const r = analisarItem(itemFerramenta('82054000'), 'SP', baseEstados);
    assert.equal(r.aliquotaInterna, null);
    assert.ok(
      r.pendencias.includes('alíquota interna: confirmar com a contabilidade'),
    );
  });

  it('sem ST não há alíquota interna nem pendência dela', () => {
    const r = analisarItem(itemFerramenta('73181500'), 'SP', base);
    assert.equal(r.aliquotaInterna, null);
    assert.ok(!r.pendencias.some((p) => /alíquota interna/.test(p)));
  });
});

describe('analise: estados e protocolos', () => {
  it('UF com protocolo e nota sem ST retido: observação, ST e CFOP iguais', () => {
    const r = analisarItem(
      itemFerramenta('82051000', { CST: '00' }),
      'BA',
      baseEstados,
    );
    assert.equal(r.stSergipe, 'sim');
    assert.equal(r.cfopSugerido, '2403');
    assert.deepEqual(r.protocolo, {
      acordos: [{ acordo: 'PT 97/10', ufs: ['AL', 'BA', 'MG', 'SP'] }],
      acordo: 'PT 97/10',
      stRetidoNaNota: false,
    });
    assert.deepEqual(r.observacoes, [
      'fornecedor de estado com protocolo (BA, PT 97/10): a nota deveria trazer ST retido; confira',
    ]);
  });

  it('CST 10 sem vST nem vBCST também não conta como retido', () => {
    const r = analisarItem(
      itemFerramenta('82051000', { CST: '10' }),
      'SP',
      baseEstados,
    );
    assert.equal(r.protocolo?.stRetidoNaNota, false);
    assert.equal(r.observacoes.length, 1);
  });

  it('UF com protocolo e ST retido na nota: sem observação', () => {
    const r = analisarItem(
      itemFerramenta('82051000', { CST: '10', vBCST: '150.00', vST: '9.60' }),
      'SP',
      baseEstados,
    );
    assert.equal(r.protocolo?.stRetidoNaNota, true);
    assert.deepEqual(r.observacoes, []);
  });

  it('UF fora da lista: "sem protocolo com SE: a loja recolhe"', () => {
    const r = analisarItem(itemFerramenta('82051000'), 'RS', baseEstados);
    assert.equal(r.stSergipe, 'sim');
    assert.equal(r.cfopSugerido, '2403');
    assert.equal(r.protocolo?.acordo, null);
    assert.deepEqual(r.observacoes, ['sem protocolo com SE: a loja recolhe']);
  });

  it('linha sem acordo na coluna de estados: sem protocolo', () => {
    const r = analisarItem(itemFerramenta('82052000'), 'SP', baseEstados);
    assert.deepEqual(r.protocolo?.acordos, []);
    assert.deepEqual(r.observacoes, ['sem protocolo com SE: a loja recolhe']);
  });

  it('fornecedor de SE ou aba sem coluna de estados: nada a dizer', () => {
    const se = analisarItem(itemFerramenta('82051000'), 'SE', baseEstados);
    assert.equal(se.protocolo, null);
    assert.deepEqual(se.observacoes, []);
    const tintas = analisarItem(
      { NCM: '32081020', orig: '0', pICMS: '7' },
      'SP',
      base,
    );
    assert.equal(tintas.candidatos[0].protocolos, null);
    assert.equal(tintas.protocolo, null);
    assert.deepEqual(tintas.observacoes, []);
  });
});

describe('analise: segmento lido com problemas', () => {
  it('candidato de segmento incompleto vira confirmar', () => {
    const r = analisarItem(itemFerramenta('82051000'), 'SP', {
      ...baseEstados,
      segmentosIncompletos: ['ferramentas'],
    });
    assert.equal(r.stSergipe, 'confirmar');
    assert.equal(r.candidatos[0].segmentoIncompleto, true);
    assert.equal(r.cfopSugerido, null);
    assert.ok(r.pendencias.includes('segmento Ferramentas lido com problemas'));
  });

  it('outro segmento incompleto não afeta', () => {
    const r = analisarItem(itemFerramenta('82051000'), 'SP', {
      ...baseEstados,
      segmentosIncompletos: ['Autopecas'],
    });
    assert.equal(r.stSergipe, 'sim');
    assert.equal(r.candidatos[0].segmentoIncompleto, false);
  });
});
