// A palavra final é da pessoa: qualquer item pode ser mudado, mesmo quando
// o app decidiu sozinho (Sim ou Não). A troca é lembrada com o motivo
// "decisão da pessoa" e o CFOP gravado no Aplicar segue a escolha dela.
// Planilha e itens inventados.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analisarItem, type ItemFiscal } from '../../src/fiscal/analise.ts';
import {
  chaveDecisao,
  lerDecisoes,
  lerCfopManual,
  motivoDaEscolha,
  planoAplicar,
  type Decisao,
  type DecisaoLembrada,
  type EscolhaST,
} from '../../src/fiscal/entrada.ts';
import { lerTabelaST } from '../../src/fiscal/st.ts';
import { lerXlsx } from '../../src/fiscal/xlsx.ts';
import { textoDecisao } from '../../src/filtroDecisoes.ts';
import {
  decisaoDoApp,
  decisaoInicial,
  pessoaMudouOApp,
  previaItem,
  textoDecisaoApp,
} from '../../src/previaST.ts';
import { xlsx } from './fixtures/xlsx.mts';

const st = lerTabelaST(
  lerXlsx(
    xlsx('Autopecas', [
      ['Versão: 0020'],
      ['Produção de efeitos a partir de 01/02/2026'],
      ['ANEXO I – SEGMENTO: AUTOPEÇAS'],
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
      [43, '01.043.00', '8425.42.00', 'Macacos', 0.62, 0.5694, 0.485, '20%'],
    ]),
  ),
);

const UF = 'SP';
const CNPJ = '11222333000181';
// Macaco com o CEST da linha e ST retida: o app diz Sim, CFOP 2403.
const macaco: ItemFiscal = {
  nItem: '1',
  NCM: '84254200',
  CEST: '0104300',
  orig: '0',
  CST: '10',
  pICMS: '12',
  CFOP: '6403',
  vBCST: '148.50',
  vST: '16.22',
};
// Caneta fora da planilha: o app diz Não, CFOP 2102.
const caneta: ItemFiscal = {
  nItem: '2',
  NCM: '96081000',
  orig: '0',
  CST: '00',
  pICMS: '12',
  CFOP: '6102',
};
const revenda = { escolha: null, finalidade: 'revenda' as const };

/** A troca como a ferramenta faz: motivo com "decisão da pessoa". */
function trocar(item: ItemFiscal, escolha: EscolhaST): Decisao {
  const a = analisarItem(item, UF, { st });
  const appDecidiu = decisaoDoApp(a, UF, 'revenda').st !== 'confirmar';
  const motivo = motivoDaEscolha(a, escolha, appDecidiu);
  return { escolha, finalidade: 'revenda', ...(motivo ? { motivo } : {}) };
}

const lembrar = (
  item: ItemFiscal,
  cProd: string,
  d: Decisao,
): DecisaoLembrada => ({
  ...d,
  raizCnpj: CNPJ.slice(0, 8),
  fornecedor: 'Distribuidora Exemplo',
  cProd,
  xProd: 'PRODUTO INVENTADO',
  ncm: item.NCM,
  atualizadaEm: '2026-11-19T10:00:00.000Z',
});

/** Passa pelo arquivo de decisões, como na gravação real. */
const peloArquivo = (d: DecisaoLembrada) =>
  lerDecisoes({ decisoes: { [chaveDecisao(d.raizCnpj, d.cProd)]: d } })[
    chaveDecisao(CNPJ, d.cProd)
  ];

describe('mudar decisão: um "Sim" do app vira "Sem ST"', () => {
  const a = analisarItem(macaco, UF, { st });
  const app = decisaoDoApp(a, UF, 'revenda');
  const d = trocar(macaco, { tipo: 'sem-st' });

  it('o app decidiu Sim, CFOP 2403', () => {
    assert.equal(app.st, 'sim');
    assert.equal(app.cfop, '2403');
    assert.equal(textoDecisaoApp(app), 'Sim, CFOP 2403, MVA 48,5%');
  });

  it('a escolha da pessoa vale: Não, CFOP 2102, sem pendência', () => {
    assert.equal(d.motivo, 'decisão da pessoa; não é do segmento Autopecas');
    const p = previaItem(a, UF, d);
    assert.equal(p.st, 'nao');
    assert.equal(p.cfop, '2102');
    assert.equal(p.precisaDeMim, false);
    assert.equal(
      p.motivo,
      'marcado "sem ST": decisão da pessoa; não é do segmento Autopecas',
    );
    assert.equal(pessoaMudouOApp(app, p), true);
  });

  it('o Aplicar grava o CFOP da pessoa', () => {
    const p = previaItem(a, UF, d);
    const plano = planoAplicar([p], new Map(), 'cfop', 'mva');
    assert.deepEqual(
      plano.gravacoes.map((g) => [g.coluna, g.valor]),
      [['cfop', '2102']],
    );
  });

  it('na segunda nota vem lembrada, com a decisão dela', () => {
    const lida = peloArquivo(lembrar(macaco, 'MAC-1', d));
    assert.ok(lida);
    const segunda = analisarItem({ ...macaco, nItem: '9' }, UF, { st });
    const ini = decisaoInicial('1', segunda, lida);
    assert.equal(ini.lembrada, true);
    const p = previaItem(segunda, UF, ini.decisao, ini.lembrada);
    assert.equal(p.st, 'nao');
    assert.equal(p.cfop, '2102');
    assert.equal(p.lembrado, true);
    assert.equal(
      textoDecisao(lida),
      'Sem ST: decisão da pessoa; não é do segmento Autopecas · Revenda',
    );
  });

  it('desfazer (apagar a decisão) volta ao app', () => {
    const segunda = analisarItem(macaco, UF, { st });
    const ini = decisaoInicial('1', segunda, null);
    assert.equal(ini.lembrada, false);
    const p = previaItem(segunda, UF, ini.decisao);
    assert.equal(p.st, 'sim');
    assert.equal(p.cfop, '2403');
  });

  it('escolher o mesmo que o app não marca como mudança', () => {
    const tem = trocar(macaco, {
      tipo: 'candidato',
      segmento: 'Autopecas',
      linhaPlanilha: 5,
      cest: '01.043.00',
    });
    assert.equal(tem.motivo, 'decisão da pessoa; é do segmento Autopecas');
    assert.equal(pessoaMudouOApp(app, previaItem(a, UF, tem)), false);
  });
});

describe('mudar decisão: um "Não" (NCM fora da planilha) vira "Outro"', () => {
  const a = analisarItem(caneta, UF, { st });
  const app = decisaoDoApp(a, UF, 'revenda');

  it('sem linha da planilha: não há "Tem ST" para oferecer', () => {
    assert.equal(a.candidatos.length, 0);
    assert.equal(app.st, 'nao');
    assert.equal(textoDecisaoApp(app), 'Não, CFOP 2102');
  });

  it('CFOP manual 2403: vale o da pessoa, lembrado com o motivo', () => {
    const lido = lerCfopManual({
      cfop: '2.403',
      mva: '',
      motivo: 'contabilidade mandou',
    });
    assert.ok(lido.ok);
    const d = trocar(caneta, lido.escolha);
    assert.equal(d.motivo, 'decisão da pessoa');
    const p = previaItem(a, UF, d);
    assert.equal(p.st, 'sim');
    assert.equal(p.cfop, '2403');
    assert.equal(p.manual, true);
    assert.equal(p.precisaDeMim, false);
    assert.equal(
      p.motivo,
      'CFOP manual: contabilidade mandou (decisão da pessoa)',
    );
    assert.equal(pessoaMudouOApp(app, p), true);
    const lida = peloArquivo(lembrar(caneta, 'CAN-1', d));
    assert.ok(lida);
    assert.equal(
      textoDecisao(lida),
      'CFOP manual 2403: contabilidade mandou (decisão da pessoa) · Revenda',
    );
    assert.deepEqual(
      planoAplicar([p], new Map(), 'cfop', null).gravacoes.map((g) => g.valor),
      ['2403'],
    );
  });
});

describe('mudar decisão: "precisam de você" segue a pessoa', () => {
  it('nota com um Sim, um Não e um sem evidência: só o último pende', () => {
    const tubo: ItemFiscal = {
      ...macaco,
      nItem: '3',
      CEST: '',
      CST: '00',
      vBCST: '',
      vST: '',
    };
    const itens = [macaco, caneta, tubo].map((i) =>
      analisarItem(i, UF, { st }),
    );
    const pendentes = (ds: Decisao[]) =>
      itens
        .map((a, k) => previaItem(a, UF, ds[k]))
        .filter((p) => p.precisaDeMim).length;
    assert.equal(pendentes([revenda, revenda, revenda]), 1);
    // A pessoa decide o terceiro e muda o primeiro: nada pende.
    assert.equal(
      pendentes([
        trocar(macaco, { tipo: 'sem-st' }),
        revenda,
        trocar(tubo, { tipo: 'sem-st' }),
      ]),
      0,
    );
  });

  it('item em "Confirmar" decidido pela pessoa não é "decisão da pessoa" no motivo', () => {
    const tubo: ItemFiscal = {
      ...macaco,
      CEST: '',
      CST: '00',
      vBCST: '',
      vST: '',
    };
    const d = trocar(tubo, { tipo: 'sem-st' });
    assert.equal(d.motivo, 'não é do segmento Autopecas');
  });
});
