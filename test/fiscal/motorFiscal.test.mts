// Motor fiscal com notas inteiras em XML: alíquota interestadual esperada,
// coluna de MVA do fornecedor do Simples Nacional, MVA retida contra a da
// planilha e NCMs que não têm ST em Sergipe. Fornecedores, produtos,
// valores e a planilha são inventados; o destino é sempre SE.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import {
  aliquotaInterestadualEsperada,
  avisoAliquotaIcms,
} from '../../src/fiscal/aliquotaInterestadual.ts';
import { analisarNota, type AnaliseItem } from '../../src/fiscal/analise.ts';
import { lerTabelaST } from '../../src/fiscal/st.ts';
import type { Aba } from '../../src/fiscal/xlsx.ts';
import { verificacaoAliquotaIcms } from '../../src/nfe/conferencia.ts';
import { lerArquivo } from '../../src/nfe/parser.ts';
import type { Nota } from '../../src/nfe/tipos.ts';
import { previaComMvaRetida, type DecisaoST } from '../../src/previaST.ts';
import { ligarDomMinimo } from '../apoioDom.mts';

// ---------- planilha inventada, no leiaute do Portal ST ----------

const topo = (anexo: string): Aba['linhas'] => [
  ['Versão: 0099'],
  ['Produção de efeitos a partir de 01/01/2026'],
  [anexo],
];

const abas: Aba[] = [
  {
    nome: 'Tintas',
    linhas: [
      ...topo('ANEXO XXIII - SEGMENTO: TINTAS E VERNIZES'),
      [
        'ITEM',
        'CEST',
        'NCM/SH',
        'Descrição',
        'MVA-ST Alíquota de 4%',
        'MVA-ST Alíquota de 7%',
        'MVA-ST Alíquota de 12%',
        'MVA-ST Alíquota de 19%',
        'Alíquota interna',
      ],
      [
        1,
        '24.001.00',
        '3208',
        'Tintas inventadas',
        0.6,
        0.55,
        0.48,
        0.35,
        '19% + 1% (FECOEP)',
      ],
    ],
  },
  {
    nome: 'Autopecas',
    linhas: [
      ...topo('ANEXO II - SEGMENTO: AUTOPEÇAS'),
      [
        'ITEM',
        'CEST',
        'NCM/SH',
        'Descrição',
        'MVA-ST 1 Alíquota de 4%',
        'MVA-ST 1 Alíquota de 7%',
        'MVA-ST 1 Alíquota de 12%',
        'MVA-ST 1 Alíquota de 19%',
        'MVA-ST 2 Alíquota de 4%',
        'MVA-ST 2 Alíquota de 7%',
        'MVA-ST 2 Alíquota de 12%',
        'MVA-ST 2 Alíquota de 19%',
        'Alíquota interna',
      ],
      [
        90,
        '01.090.00',
        '3919.10.00',
        'Fitas, tiras, adesivos, de plástico, refletores',
        1.0,
        0.95,
        0.88,
        0.7,
        0.6,
        0.55,
        0.5,
        0.35,
        '20%',
      ],
    ],
  },
];
const base = { st: lerTabelaST(abas) };

// ---------- notas inventadas ----------

interface ItemXml {
  ncm: string;
  xProd: string;
  cest?: string;
  /** Grupo do ICMS, como <ICMS00>...</ICMS00>. */
  icms: string;
}

function nfe(ufEmit: string, itens: ItemXml[], ufDest = 'SE'): Nota {
  const dets = itens
    .map(
      (i, n) =>
        `<det nItem="${n + 1}"><prod><cProd>P${n + 1}</cProd><xProd>${i.xProd}</xProd><NCM>${i.ncm}</NCM>${i.cest ? `<CEST>${i.cest}</CEST>` : ''}<CFOP>6102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>100.00</vUnCom><vProd>100.00</vProd></prod><imposto><ICMS>${i.icms}</ICMS></imposto></det>`,
    )
    .join('');
  return lerArquivo(`<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35261100000000000000550010000000991000000999" versao="4.00">
      <ide><cUF>35</cUF><natOp>Venda de teste</natOp><mod>55</mod><serie>1</serie><nNF>99</nNF><dhEmi>2026-11-20T10:00:00-03:00</dhEmi><tpNF>1</tpNF><finNFe>1</finNFe></ide>
      <emit><CNPJ>00000000000000</CNPJ><xNome>FORNECEDOR INVENTADO LTDA</xNome><enderEmit><UF>${ufEmit}</UF></enderEmit></emit>
      <dest><CNPJ>00000000000000</CNPJ><xNome>LOJA INVENTADA</xNome><enderDest><UF>${ufDest}</UF></enderDest></dest>
      ${dets}
      <total><ICMSTot><vProd>${(100 * itens.length).toFixed(2)}</vProd><vNF>${(100 * itens.length).toFixed(2)}</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
</nfeProc>`).nota;
}

const icms00 = (orig: string, p: string) =>
  `<ICMS00><orig>${orig}</orig><CST>00</CST><modBC>3</modBC><vBC>100.00</vBC><pICMS>${p}</pICMS><vICMS>${p}</vICMS></ICMS00>`;
const icms10 = (orig: string, p: string, pMVAST: string) =>
  `<ICMS10><orig>${orig}</orig><CST>10</CST><modBC>3</modBC><vBC>100.00</vBC><pICMS>${p}</pICMS><vICMS>${p}</vICMS><modBCST>4</modBCST><pMVAST>${pMVAST}</pMVAST><vBCST>150.00</vBCST><pICMSST>20.0000</pICMSST><vICMSST>8.00</vICMSST></ICMS10>`;
const csosn101 = (orig: string) =>
  `<ICMSSN101><orig>${orig}</orig><CSOSN>101</CSOSN><pCredSN>2.0000</pCredSN><vCredICMSSN>2.00</vCredICMSSN></ICMSSN101>`;
const csosn201 = (orig: string, pMVAST: string) =>
  `<ICMSSN201><orig>${orig}</orig><CSOSN>201</CSOSN><modBCST>4</modBCST><pMVAST>${pMVAST}</pMVAST><vBCST>150.00</vBCST><pICMSST>20.0000</pICMSST><vICMSST>8.00</vICMSST></ICMSSN201>`;
const icms60 = (orig: string) =>
  `<ICMS60><orig>${orig}</orig><CST>60</CST><vBCSTRet>150.00</vBCSTRet><vICMSSTRet>8.00</vICMSSTRet></ICMS60>`;

/** Nota de um item, analisada como a ferramenta faz (UF do emitente e do destinatário). */
function analisar(ufEmit: string, i: ItemXml, ufDest = 'SE') {
  const nota = nfe(ufEmit, [i], ufDest);
  const [a] = analisarNota(nota.itens, ufEmit, base, ufDest);
  return { nota, item: nota.itens[0], a };
}

const AUTOMATICO: DecisaoST = { escolha: null, finalidade: 'revenda' };

before(ligarDomMinimo);

// ---------- 1. alíquota interestadual esperada ----------

describe('alíquota interestadual esperada', () => {
  const casos: [string, string, string, number | 'interna' | null][] = [
    ['SC', 'SE', '0', 7],
    ['PE', 'SE', '0', 12],
    ['SP', 'SE', '1', 4],
    ['SP', 'SE', '0', 7],
    ['SP', 'ES', '0', 7],
    ['SE', 'SE', '0', 'interna'],
    ['SP', 'SE', '6', 7],
    ['SP', 'SE', '7', 7],
    ['PE', 'SE', '2', 4],
    ['RS', 'SE', '3', 4],
    ['MG', 'SE', '8', 4],
    ['BA', 'SP', '0', 12],
    ['ES', 'SE', '0', 12],
    ['SP', 'RJ', '0', 12],
    ['SP', 'SE', '', null],
    ['SP', 'SE', '9', null],
    ['EX', 'SE', '1', null],
    ['', 'SE', '0', null],
  ];
  for (const [de, para, orig, esperado] of casos) {
    it(`${de || '(sem UF)'} para ${para}, origem ${orig || '(vazia)'}: ${esperado ?? 'não dá para saber'}`, () => {
      const r = aliquotaInterestadualEsperada(de, para, orig);
      if (esperado === null) assert.equal(r, null);
      else if (esperado === 'interna')
        assert.deepEqual(r, { operacao: 'interna' });
      else {
        assert.equal(r?.operacao, 'interestadual');
        assert.equal(r?.operacao === 'interestadual' && r.aliquota, esperado);
      }
    });
  }
});

describe('aviso de alíquota de ICMS no item (nota em XML)', () => {
  const tinta = (icms: string): ItemXml => ({
    ncm: '32081010',
    xProd: 'TINTA ACRILICA INVENTADA 18L',
    cest: '2400100',
    icms,
  });

  it('SC para SE com 12%: aviso (esperado 7%)', () => {
    const { a } = analisar('SC', tinta(icms00('0', '12.0000')));
    assert.equal(
      a.avisoAliquota,
      'Alíquota de ICMS diferente da esperada: a nota traz 12%, o esperado para esta origem é 7%.',
    );
    // Só avisa: a ST e o CFOP seguem a planilha.
    assert.equal(a.stSergipe, 'sim');
    assert.equal(a.cfopSugerido, '2403');
  });

  it('PE para SE com 12%: sem aviso', () => {
    assert.equal(
      analisar('PE', tinta(icms00('0', '12.0000'))).a.avisoAliquota,
      null,
    );
  });

  it('SP para SE, origem 1, com 4%: sem aviso', () => {
    assert.equal(
      analisar('SP', tinta(icms00('1', '4.0000'))).a.avisoAliquota,
      null,
    );
  });

  it('SP para SE, origem 0, com 4%: aviso, e diz que a origem é nacional', () => {
    assert.equal(
      analisar('SP', tinta(icms00('0', '4.0000'))).a.avisoAliquota,
      'Alíquota de ICMS diferente da esperada: a nota traz 4%, o esperado para esta origem é 7%. A origem 0 é nacional: os 4% valem só para as origens 1, 2, 3 e 8.',
    );
  });

  it('SP para SE, origem 6, com 4%: aviso (origem 6 fora dos 4%, esperado 7%)', () => {
    assert.equal(
      analisar('SP', tinta(icms00('6', '4.0000'))).a.avisoAliquota,
      'Alíquota de ICMS diferente da esperada: a nota traz 4%, o esperado para esta origem é 7%. A origem 6 é de importado sem similar nacional, que não entra nos 4%.',
    );
  });

  it('SP para SE, origem 6, com 7%: sem aviso', () => {
    assert.equal(
      analisar('SP', tinta(icms00('6', '7.0000'))).a.avisoAliquota,
      null,
    );
  });

  it('SP para o ES com 7%: sem aviso; com 12%: aviso', () => {
    assert.equal(
      analisar('SP', tinta(icms00('0', '7.0000')), 'ES').a.avisoAliquota,
      null,
    );
    assert.match(
      analisar('SP', tinta(icms00('0', '12.0000')), 'ES').a.avisoAliquota ?? '',
      /a nota traz 12%, o esperado para esta origem é 7%/,
    );
  });

  it('SE para SE: operação interna, não se aplica', () => {
    const { a } = analisar('SE', tinta(icms00('0', '19.0000')));
    assert.deepEqual(a.aliquotaEsperada, { operacao: 'interna' });
    assert.equal(a.avisoAliquota, null);
  });

  it('sem ICMS destacado (Simples Nacional, ST já retido): sem aviso', () => {
    assert.equal(analisar('SC', tinta(csosn101('0'))).a.avisoAliquota, null);
    assert.equal(analisar('SC', tinta(icms60('0'))).a.avisoAliquota, null);
    assert.equal(
      avisoAliquotaIcms(
        { orig: '0', CSOSN: '900', pICMS: '12' },
        aliquotaInterestadualEsperada('SC', 'SE', '0'),
      ),
      null,
    );
    assert.equal(
      avisoAliquotaIcms(
        { orig: '0', pICMS: '0.0000' },
        aliquotaInterestadualEsperada('SC', 'SE', '0'),
      ),
      null,
    );
  });

  it('o aviso aparece na prévia do item', () => {
    const { a } = analisar('SC', tinta(icms00('0', '12.0000')));
    const p = previaComMvaRetida(a, 'SC', AUTOMATICO, false, undefined);
    assert.deepEqual(p.avisos, [
      {
        nivel: 'aviso',
        texto:
          'Alíquota de ICMS diferente da esperada: a nota traz 12%, o esperado para esta origem é 7%.',
      },
    ]);
  });
});

describe('aviso de alíquota de ICMS na Conferência', () => {
  it('uma linha leve com os itens divergentes; sem divergência, nada', () => {
    const nota = nfe('SC', [
      {
        ncm: '32081010',
        xProd: 'TINTA INVENTADA',
        icms: icms00('0', '12.0000'),
      },
      {
        ncm: '32081010',
        xProd: 'TINTA INVENTADA 2',
        icms: icms00('0', '7.0000'),
      },
      {
        ncm: '73181500',
        xProd: 'PARAFUSO INVENTADO',
        icms: icms00('1', '4.0000'),
      },
      { ncm: '32081010', xProd: 'TINTA INVENTADA 3', icms: csosn101('0') },
    ]);
    const v = verificacaoAliquotaIcms(nota);
    assert.equal(v?.nivel, 'leve');
    assert.equal(v?.ok, false);
    assert.equal(v?.titulo, 'Item 1: alíquota de ICMS diferente da esperada');
    assert.deepEqual(v?.linhas, [
      {
        texto:
          'Item 1: Alíquota de ICMS diferente da esperada: a nota traz 12%, o esperado para esta origem é 7%.',
        nivel: 'leve',
      },
    ]);

    const certa = nfe('PE', [
      {
        ncm: '32081010',
        xProd: 'TINTA INVENTADA',
        icms: icms00('0', '12.0000'),
      },
    ]);
    assert.equal(verificacaoAliquotaIcms(certa), null);
  });

  it('dois itens: o título conta os itens', () => {
    const nota = nfe('SP', [
      {
        ncm: '32081010',
        xProd: 'TINTA INVENTADA',
        icms: icms00('0', '12.0000'),
      },
      {
        ncm: '32081010',
        xProd: 'TINTA INVENTADA 2',
        icms: icms00('0', '4.0000'),
      },
    ]);
    assert.equal(
      verificacaoAliquotaIcms(nota)?.titulo,
      '2 itens com alíquota de ICMS diferente da esperada',
    );
  });
});

// ---------- 2. Simples Nacional: coluna de MVA da alíquota esperada ----------

describe('fornecedor do Simples Nacional com ST: coluna da alíquota esperada', () => {
  const tintaSimples: ItemXml = {
    ncm: '32081010',
    xProd: 'TINTA ESMALTE INVENTADA 3,6L',
    cest: '2400100',
    icms: csosn101('0'),
  };

  const casos: [string, string, string, number][] = [
    ['PE', '0', '12', 0.48],
    ['SC', '0', '7', 0.55],
    ['SP', '1', '4', 0.6],
  ];
  for (const [uf, orig, coluna, mva] of casos) {
    it(`${uf}, origem ${orig}: coluna de ${coluna}%`, () => {
      const { a } = analisar(uf, { ...tintaSimples, icms: csosn101(orig) });
      assert.equal(a.stSergipe, 'sim');
      assert.equal(a.colunaMva, coluna);
      assert.equal(a.colunaMvaOrigem, 'esperada');
      assert.equal(
        a.textoColunaMva,
        `coluna de ${coluna}%, pela origem e pelo estado do fornecedor`,
      );
      assert.equal(a.mva, mva);
      const p = previaComMvaRetida(a, uf, AUTOMATICO, false, undefined);
      assert.equal(p.mva, mva);
      assert.equal(
        p.colunaMvaTexto,
        `coluna de ${coluna}%, pela origem e pelo estado do fornecedor`,
      );
    });
  }

  it('fornecedor de SE no Simples: não há alíquota interestadual, continua a confirmar', () => {
    const { a } = analisar('SE', tintaSimples);
    assert.equal(a.colunaMva, null);
    assert.equal(a.stSergipe, 'confirmar');
  });

  it('nota com pICMS: a coluna continua sendo a da nota', () => {
    const { a } = analisar('SC', {
      ...tintaSimples,
      icms: icms00('0', '12.0000'),
    });
    assert.equal(a.colunaMva, '12');
    assert.equal(a.colunaMvaOrigem, 'nota');
    assert.equal(a.textoColunaMva, null);
  });
});

// ---------- 3. MVA retida contra a planilha ----------

describe('MVA retida (pMVAST) contra a planilha na coluna esperada', () => {
  // SC para SE, origem 0: coluna esperada de 7%, MVA 55%. A nota destaca
  // 12% (o aviso da alíquota também aparece); a comparação usa a de 7%.
  const tinta = (pMVAST: string): ItemXml => ({
    ncm: '32081010',
    xProd: 'TINTA ACRILICA INVENTADA 18L',
    cest: '2400100',
    icms: icms10('0', '12.0000', pMVAST),
  });
  const avisosMva = (pMVAST: string) => {
    const { a, item } = analisar('SC', tinta(pMVAST));
    return previaComMvaRetida(
      a,
      'SC',
      AUTOMATICO,
      false,
      item.pMVAST,
    ).avisos.filter((x) => /MVA/.test(x.texto));
  };

  it('menor: aviso', () => {
    assert.deepEqual(avisosMva('40.0000'), [
      {
        nivel: 'aviso',
        texto:
          'O fornecedor reteve com MVA menor que a da planilha (40% contra 55%). Lance com a MVA da planilha; a diferença é complementada na apuração. Avise o fornecedor para acertar as próximas notas.',
      },
    ]);
  });

  it('igual (2 casas): nada', () => {
    assert.deepEqual(avisosMva('55.0000'), []);
    assert.deepEqual(avisosMva('55.0040'), []);
  });

  it('maior: alerta', () => {
    assert.deepEqual(avisosMva('60.5000'), [
      {
        nivel: 'alerta',
        texto:
          'O fornecedor reteve com MVA maior que a da planilha (60,5% contra 55%). Fale com o contador antes de lançar: a orientação é recusar ou devolver a mercadoria e pedir uma nota nova.',
      },
    ]);
  });

  it('Simples Nacional com ST retida (CSOSN 201): compara na coluna esperada', () => {
    const { a, item } = analisar('PE', {
      ncm: '32081010',
      xProd: 'TINTA INVENTADA',
      cest: '2400100',
      icms: csosn201('0', '40.0000'),
    });
    const p = previaComMvaRetida(a, 'PE', AUTOMATICO, false, item.pMVAST);
    assert.match(p.avisos[0]?.texto ?? '', /\(40% contra 48%\)/);
  });

  it('Autopeças: compara com a MVA-ST 1', () => {
    const { a, item } = analisar('PE', {
      ncm: '39191000',
      xProd: 'FITA REFLETIVA INVENTADA',
      cest: '0109000',
      icms: icms10('0', '12.0000', '50.0000'),
    });
    assert.equal(a.stSergipe, 'sim');
    const p = previaComMvaRetida(a, 'PE', AUTOMATICO, false, item.pMVAST);
    assert.deepEqual(
      p.avisos.map((x) => x.nivel),
      ['aviso'],
    );
    assert.match(p.avisos[0].texto, /\(50% contra 88%\)/);
  });

  it('linha não certa (motor em "confirmar"): não compara até a pessoa confirmar', () => {
    // Fita sem CEST e com ST retida, de um fornecedor com a linha da
    // planilha em dúvida: o CEST da nota é de outra linha.
    const { a, item } = analisar('PE', {
      ncm: '39191000',
      xProd: 'FITA INVENTADA',
      cest: '2400100',
      icms: icms10('0', '12.0000', '50.0000'),
    });
    assert.equal(a.stSergipe, 'confirmar');
    const antes = previaComMvaRetida(a, 'PE', AUTOMATICO, false, item.pMVAST);
    assert.equal(antes.st, 'confirmar');
    assert.deepEqual(antes.avisos, []);
    const linha = a.candidatos[0];
    const depois = previaComMvaRetida(
      a,
      'PE',
      {
        escolha: {
          tipo: 'candidato',
          segmento: linha.segmento,
          linhaPlanilha: linha.linhaPlanilha,
          cest: linha.cest,
        },
        finalidade: 'revenda',
      },
      false,
      item.pMVAST,
    );
    assert.equal(depois.st, 'sim');
    assert.match(
      depois.avisos[0]?.texto ?? '',
      /MVA menor que a da planilha \(50% contra 88%\)/,
    );
  });
});

// ---------- 4. NCMs sem ST em Sergipe ----------

describe('NCMs sem ST em SE (fornecedor de outro estado)', () => {
  const sem = (ncm: string, xProd: string) => {
    const { a } = analisar('SP', { ncm, xProd, icms: icms00('0', '7.0000') });
    return a;
  };
  const semST = (a: AnaliseItem) => {
    assert.equal(a.stSergipe, 'nao');
    assert.equal(a.cfopSugerido, '2102');
    assert.deepEqual(a.candidatos, []);
  };

  it('7318.15.00 (parafuso): sem ST', () =>
    semST(sem('73181500', 'PARAFUSO SEXTAVADO INVENTADO M8')));
  it('3808.94.19 (desinfetante): sem ST em SE', () =>
    semST(sem('38089419', 'DESINFETANTE INVENTADO 5L')));
  it('8427.90.00 (empilhadeira manual): sem ST em SE', () =>
    semST(sem('84279000', 'EMPILHADEIRA MANUAL INVENTADA 1T')));

  it('3919.10.00, fita dupla face comum, sem CEST e sem ST retida: nunca "Sim" sozinho', () => {
    const { a } = analisar('SP', {
      ncm: '39191000',
      xProd: 'FITA DUPLA FACE INVENTADA 19MM',
      icms: icms00('0', '7.0000'),
    });
    assert.notEqual(a.stSergipe, 'sim');
    assert.equal(a.stSergipe, 'confirmar');
    assert.equal(a.cfopSugerido, null);
    // A linha de Autopeças (CEST 01.090.00) é de fita refletiva.
    assert.deepEqual(
      a.candidatos.map((c) => c.cest),
      ['01.090.00'],
    );
  });

  it('3919.10.00, fita dupla face comum, sem CEST e com ST retida: Confirmar, pelo CEST obrigatório', () => {
    const { a } = analisar('SP', {
      ncm: '39191000',
      xProd: 'FITA DUPLA FACE INVENTADA 19MM',
      icms: icms10('0', '7.0000', '95.0000'),
    });
    assert.equal(a.stSergipe, 'confirmar');
    assert.equal(a.cfopSugerido, null);
    assert.equal(a.semCestComRetencao, true);
    assert.equal(a.sugestaoSemST, false);
    const p = previaComMvaRetida(a, 'SP', AUTOMATICO, false, '95.0000');
    assert.equal(p.st, 'confirmar');
    assert.equal(p.precisaDeMim, true);
    assert.equal(
      p.motivo,
      'O fornecedor reteve ST, mas não informou o CEST, que é obrigatório para produto desta lista (Convênio ICMS 142/2018, cláusula vigésima, I). Confirme se o produto é deste segmento.',
    );
    // Sem a linha certa, a MVA retida não é comparada.
    assert.deepEqual(p.avisos, []);
  });

  it('3919.10.00 com o CEST da linha (01.090.00) e ST retida: Sim', () => {
    const { a } = analisar('SP', {
      ncm: '39191000',
      xProd: 'FITA REFLETIVA INVENTADA 50MM',
      cest: '0109000',
      icms: icms10('0', '7.0000', '95.0000'),
    });
    assert.equal(a.stSergipe, 'sim');
    assert.equal(a.cfopSugerido, '2403');
    assert.equal(a.semCestComRetencao, false);
  });

  it('3919.10.00 com CEST de outro segmento (tintas): Confirmar, dizendo o segmento do CEST', () => {
    const { a } = analisar('SP', {
      ncm: '39191000',
      xProd: 'FITA INVENTADA',
      cest: '2400100',
      icms: icms10('0', '7.0000', '95.0000'),
    });
    assert.equal(a.stSergipe, 'confirmar');
    const p = previaComMvaRetida(a, 'SP', AUTOMATICO, false, '95.0000');
    assert.equal(
      p.motivo,
      'CEST da nota (24.001.00) não bate com a planilha (01.090.00); o CEST da nota indica o segmento Tintas (Tintas, linha 5)',
    );
  });
});
