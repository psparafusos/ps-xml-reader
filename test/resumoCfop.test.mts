import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resumoCfops, textoResumoCfop } from '../src/nfe/resumoCfop.ts';
import type { Item } from '../src/nfe/tipos.ts';

const COLUNA = 'anotacao-cfop-de-entrada';
const itens = (n: number): Item[] =>
  Array.from(
    { length: n },
    (_, k) =>
      ({ nItem: String(k + 1), xProd: `PRODUTO INVENTADO ${k + 1}` }) as Item,
  );

describe('resumo de CFOPs de entrada', () => {
  it('conta por valor, do mais usado ao menos usado', () => {
    const valores = new Map<string, string>();
    for (let k = 1; k <= 196; k++)
      valores.set(String(k), k === 7 || k === 150 ? '2403' : '2102');
    const r = resumoCfops(itens(196), new Map([[COLUNA, valores]]), COLUNA);
    assert.equal(textoResumoCfop(r), '2102: 194 itens · 2403: 2 itens');
    assert.deepEqual(
      r.grupos.map((g) => [g.valor, g.destaque]),
      [
        ['2102', false],
        ['2403', true],
      ],
    );
    assert.deepEqual(
      r.grupos[1].itens.map((i) => i.nItem),
      ['7', '150'],
    );
  });

  it('conta o que foi digitado, ignora vazio e espaços', () => {
    const r = resumoCfops(
      itens(4),
      new Map([
        [
          COLUNA,
          new Map([
            ['1', ' 1102 '],
            ['2', '1102'],
            ['3', '   '],
          ]),
        ],
      ]),
      COLUNA,
    );
    assert.equal(textoResumoCfop(r), '1102: 2 itens');
    assert.equal(r.preenchidos, 2);
    assert.equal(r.vazios, 2);
    assert.equal(r.grupos[0].destaque, false, 'um valor só não é destaque');
  });

  it('nota pequena: o valor de um item só fica em destaque', () => {
    const r = resumoCfops(
      itens(4),
      new Map([
        [
          COLUNA,
          new Map([
            ['1', '2102'],
            ['2', '2102'],
            ['3', '2102'],
            ['4', '2407'],
          ]),
        ],
      ]),
      COLUNA,
    );
    assert.deepEqual(
      r.grupos.map((g) => [g.valor, g.destaque]),
      [
        ['2102', false],
        ['2407', true],
      ],
    );
  });

  it('sem a coluna: nada preenchido', () => {
    const r = resumoCfops(itens(3), new Map(), COLUNA);
    assert.deepEqual(r.grupos, []);
    assert.equal(r.vazios, 3);
  });
});
