import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  avisosMiniatura,
  FONTE_MINIMA_PT,
  FONTE_TABELA_PT,
  larguraUtilMm,
  miniaturaDoPlano,
  planejarFolha,
  type LargurasColunas,
} from '../src/nfe/folha.ts';

/** Colunas que encolhem com a fonte, como na medida de verdade. */
function medidor(base: LargurasColunas) {
  return (fontePt: number): LargurasColunas =>
    base.map((c) => ({ id: c.id, mm: (c.mm * fontePt) / FONTE_TABELA_PT }));
}

const ESTREITA: LargurasColunas = [
  { id: 'nItem', mm: 8 },
  { id: 'codigo', mm: 20 },
  { id: 'descricao', mm: 60 },
  { id: 'qtd', mm: 15 },
  { id: 'valor', mm: 20 },
];

describe('planejarFolha', () => {
  it('devolve as larguras na fonte escolhida', () => {
    const p = planejarFolha('retrato', medidor(ESTREITA));
    assert.equal(p.fontePt, FONTE_TABELA_PT);
    assert.deepEqual(p.larguras, ESTREITA);
  });

  it('com a fonte mínima, as larguras são as medidas em 7 pt', () => {
    const larga = [...ESTREITA, { id: 'obs', mm: 400 }];
    const p = planejarFolha('paisagem', medidor(larga));
    assert.equal(p.fontePt, FONTE_MINIMA_PT);
    assert.equal(p.larguras.find((c) => c.id === 'obs')?.mm, (400 * 7) / 7.5);
  });
});

describe('miniaturaDoPlano', () => {
  it('retrato que cabe: a descrição estica até a largura útil', () => {
    const m = miniaturaDoPlano(planejarFolha('retrato', medidor(ESTREITA)));
    assert.equal(m.orientacao, 'retrato');
    assert.deepEqual(m.folha, { largura: 210, altura: 297 });
    assert.equal(m.folhas, 1);
    assert.equal(m.fonteReduzida, null);
    const fim = m.colunas.at(-1);
    assert.ok(fim);
    assert.ok(Math.abs(fim.x + fim.mm - larguraUtilMm('retrato')) < 1e-9);
    assert.equal(m.colunas.find((c) => c.id === 'descricao')?.mm, 60 + 67);
    assert.ok(m.colunas.every((c) => c.naFolha));
  });

  it('automática que só cabe em paisagem: folha deitada', () => {
    const base = [...ESTREITA, { id: 'extra', mm: 90 }];
    const m = miniaturaDoPlano(planejarFolha('automatica', medidor(base)));
    assert.equal(m.orientacao, 'paisagem');
    assert.deepEqual(m.folha, { largura: 297, altura: 210 });
    assert.equal(m.folhas, 1);
  });

  it('fonte reduzida aparece no aviso', () => {
    // 195 mm em 7,5 pt: só cabe nos 190 mm do retrato com a fonte menor.
    const base: LargurasColunas = [
      { id: 'nItem', mm: 10 },
      { id: 'descricao', mm: 185 },
    ];
    const m = miniaturaDoPlano(planejarFolha('retrato', medidor(base)));
    assert.equal(m.folhas, 1);
    assert.equal(m.fonteReduzida, 7.25);
    assert.deepEqual(avisosMiniatura(m), {
      fonte: 'letra reduzida para 7,25 pt',
      divisao: null,
    });
  });

  it('não cabe: as colunas da folha 2 vêm depois, fora da folha', () => {
    const base: LargurasColunas = [
      { id: 'a', mm: 80 },
      { id: 'nItem', mm: 8 },
      { id: 'descricao', mm: 60 },
      { id: 'b', mm: 80 },
      { id: 'c', mm: 30 },
    ];
    const p = planejarFolha('retrato', medidor(base));
    assert.equal(p.partes.length, 2);
    const m = miniaturaDoPlano(p);
    assert.deepEqual(
      m.colunas.map((c) => [c.id, c.naFolha]),
      [
        ['a', true],
        ['nItem', true],
        ['descricao', true],
        ['b', false],
        ['c', false],
      ],
    );
    // Sem esticar a descrição: ela fica na medida de 7 pt.
    assert.equal(m.colunas[2].mm, (60 * 7) / 7.5);
    const ultimaNaFolha = m.colunas[2];
    assert.ok(ultimaNaFolha.x + ultimaNaFolha.mm <= m.util);
    assert.ok(m.colunas[4].x + m.colunas[4].mm > m.util);
    assert.deepEqual(avisosMiniatura(m), {
      fonte: 'letra reduzida para 7 pt',
      divisao: 'daqui em diante vai para a folha 2',
    });
  });

  it('em três folhas, o aviso diz até qual', () => {
    const base: LargurasColunas = [
      { id: 'nItem', mm: 8 },
      { id: 'a', mm: 150 },
      { id: 'b', mm: 150 },
      { id: 'c', mm: 150 },
    ];
    const m = miniaturaDoPlano(planejarFolha('retrato', medidor(base)));
    assert.equal(m.folhas, 3);
    assert.equal(
      avisosMiniatura(m).divisao,
      'daqui em diante vai para as folhas 2 e 3',
    );
  });
});
