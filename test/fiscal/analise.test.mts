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

  it('Autopeças: confirmar, com MVA-ST 1 e 2', () => {
    const r = analisarItem(
      { NCM: '39173100', CEST: '01.002.00', orig: '0', pICMS: '12' },
      'SP',
      base,
    );
    assert.equal(r.stSergipe, 'confirmar');
    assert.equal(r.candidatos.length, 1);
    assert.deepEqual(r.candidatos[0].mvas, [
      { rotulo: 'MVA-ST 1', valor: 0.8896 },
      { rotulo: 'MVA-ST 2', valor: 0.5022 },
    ]);
    assert.equal(r.mva, null);
    assert.ok(
      r.pendencias.some((p) => /MVA-ST 1 = 0,8896; MVA-ST 2 = 0,5022/.test(p)),
    );
    // A linha é uma só: a ST é certa, só a MVA fica para confirmar.
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
