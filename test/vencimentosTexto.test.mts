import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dividirEmParcelas,
  vencimentosDoTexto,
} from '../src/nfe/vencimentosTexto.ts';

/** Emissão dos testes: 10 de novembro de 2026. */
const EMISSAO = '2026-11-10T10:00:00-03:00';
const ler = (texto: string, vNF = '5902.40', dhEmi = EMISSAO) =>
  vencimentosDoTexto(texto, dhEmi, vNF);
const datas = (texto: string, vNF?: string, dhEmi?: string) => {
  const r = ler(texto, vNF, dhEmi);
  assert.equal(r?.tipo, 'datas', `${texto}: ${JSON.stringify(r)}`);
  return r;
};

describe('dividirEmParcelas', () => {
  it('como o Saef: as primeiras para cima, a última com a diferença', () => {
    assert.deepEqual(dividirEmParcelas(590240, 3), [196747, 196747, 196746]);
    assert.deepEqual(dividirEmParcelas(10000, 3), [3334, 3334, 3332]);
    assert.deepEqual(dividirEmParcelas(30000, 3), [10000, 10000, 10000]);
    assert.deepEqual(dividirEmParcelas(12345, 1), [12345]);
  });
  it('a soma sempre fecha com o total', () => {
    for (const [total, n] of [
      [590240, 3],
      [100, 7],
      [999999, 4],
      [2, 3],
    ])
      assert.equal(
        dividirEmParcelas(total, n).reduce((a, b) => a + b, 0),
        total,
      );
  });
  it('total menor que o número de parcelas: nenhuma parcela negativa', () => {
    assert.deepEqual(dividirEmParcelas(2, 3), [1, 1, 0]);
  });
});

describe('vencimentosDoTexto', () => {
  it('"SEUS VCTOS SERAO: 04/12 11/12 18/12": três parcelas de 5.902,40', () => {
    const r = datas('PEDIDO 4512. SEUS VCTOS SERAO: 04/12 11/12 18/12');
    assert.deepEqual(r, {
      tipo: 'datas',
      trecho: 'VCTOS SERAO: 04/12 11/12 18/12',
      parcelas: [
        { dVenc: '2026-12-04', vDup: '1967.47' },
        { dVenc: '2026-12-11', vDup: '1967.47' },
        { dVenc: '2026-12-18', vDup: '1967.46' },
      ],
    });
  });

  it('as cinco palavras, sem diferenciar maiúsculas e acentos', () => {
    for (const t of [
      'Vcto 04/12',
      'vctos: 04/12',
      'Vencimento: 04/12',
      'VENCIMENTOS 04/12',
      'Venc. 04/12',
      'VENC: 04/12',
      'Vençimento 04/12',
    ])
      assert.deepEqual(
        datas(t, '100.00').parcelas,
        [{ dVenc: '2026-12-04', vDup: '100.00' }],
        t,
      );
  });

  it('o trecho sai como está na nota (acento e minúsculas)', () => {
    assert.equal(
      datas('Obs: vencimentos em 04/12, 11/12 e 18/12. Obrigado').trecho,
      'vencimentos em 04/12, 11/12 e 18/12',
    );
  });

  it('separadores: espaço, vírgula, hífen e "e"', () => {
    for (const t of [
      'VCTOS 04/12 11/12',
      'VCTOS 04/12,11/12',
      'VCTOS 04/12 - 11/12',
      'VCTOS 04/12 e 11/12',
    ])
      assert.deepEqual(
        datas(t, '10.00').parcelas.map((p) => p.dVenc),
        ['2026-12-04', '2026-12-11'],
        t,
      );
  });

  it('dd/mm/aaaa usa o ano escrito; dd/mm/aa também', () => {
    assert.deepEqual(
      datas('VENCIMENTOS: 04/12/2026 04/01/2027').parcelas.map((p) => p.dVenc),
      ['2026-12-04', '2027-01-04'],
    );
    assert.deepEqual(
      datas('VENCIMENTO 15/01/27').parcelas.map((p) => p.dVenc),
      ['2027-01-15'],
    );
  });

  it('data sem ano: a primeira vez a partir da emissão (vira o ano)', () => {
    assert.deepEqual(
      datas('VCTOS: 28/12 04/01 11/02').parcelas.map((p) => p.dVenc),
      ['2026-12-28', '2027-01-04', '2027-02-11'],
    );
    // O próprio dia da emissão conta como a partir dela.
    assert.deepEqual(
      datas('VCTO 10/11').parcelas.map((p) => p.dVenc),
      ['2026-11-10'],
    );
    // Dia antes da emissão, no mesmo mês: ano seguinte.
    assert.deepEqual(
      datas('VCTO 09/11').parcelas.map((p) => p.dVenc),
      ['2027-11-09'],
    );
  });

  it('não casa sem a palavra de vencimento', () => {
    for (const t of [
      'DATA DE EMISSAO 04/12/2026',
      'Data de emissão: 04/12',
      'DATA DE VALIDADE 04/12/2027',
      'Validade da proposta 04/12',
      'PEDIDO 04/12',
      'Pedido de compra 04/12 11/12',
      'ENTREGA PREVISTA 04/12',
      '',
    ])
      assert.equal(ler(t), null, t);
  });

  it('palavra parecida não conta (VENCIDO, PROVENCAL)', () => {
    assert.equal(ler('PRODUTO VENCIDO 04/12'), null);
    assert.equal(ler('RUA PROVENCAL 04/12'), null);
  });

  it('palavra de vencimento sem número logo depois: nada', () => {
    assert.equal(ler('VENCIMENTO CONFORME PEDIDO 4512'), null);
    assert.equal(ler('VENCIMENTO. NF REF 1234'), null);
    // A data de outra coisa entre a palavra e o número.
    assert.equal(ler('VENCIMENTO E DATA DE EMISSAO 04/12'), null);
  });

  it('sem segurança para ler todas as datas: o trecho, sem inventar', () => {
    const casos: [string, string][] = [
      ['VENCIMENTOS: 30/60/90 DIAS', 'VENCIMENTOS: 30/60/90 DIAS'],
      ['VCTO 28 DDL. PEDIDO 1', 'VCTO 28 DDL'],
      ['VCTOS 04/12 E 30 DIAS', 'VCTOS 04/12 E 30 DIAS'],
      ['VCTOS: 31/11 15/12', 'VCTOS: 31/11 15/12'],
      ['VENC 04.12 11.12; OBRIGADO', 'VENC 04.12 11.12'],
      ['VCTOS 04/12 11/12 100,00', 'VCTOS 04/12 11/12 100,00'],
    ];
    for (const [t, trecho] of casos)
      assert.deepEqual(ler(t), { tipo: 'ilegivel', trecho }, t);
  });

  it('data sem ano e sem data de emissão: ilegível', () => {
    assert.deepEqual(ler('VCTO 04/12', '10.00', ''), {
      tipo: 'ilegivel',
      trecho: 'VCTO 04/12',
    });
    // Com o ano escrito, não precisa da emissão.
    assert.equal(ler('VCTO 04/12/2026', '10.00', '')?.tipo, 'datas');
  });

  it('o primeiro trecho com número decide', () => {
    assert.deepEqual(
      datas('VENCIMENTO CONFORME ABAIXO. VCTOS: 04/12 11/12', '20.00').parcelas,
      [
        { dVenc: '2026-12-04', vDup: '10.00' },
        { dVenc: '2026-12-11', vDup: '10.00' },
      ],
    );
  });
});
