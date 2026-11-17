import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALTURA_MINIMA,
  LARGURA_MINIMA,
  estadoSalvo,
  posicaoVisivel,
} from '../src/tamanhoJanela.ts';

// Área de trabalho de um 1366 x 768 a 100% (barra de tarefas de 48).
const AREA_1366 = { x: 0, y: 0, width: 1366, height: 720 };

describe('Tamanho e posição salvos da janela', () => {
  it('o mínimo é a metade de uma tela de 1366 (683), com folga', () => {
    assert.equal(LARGURA_MINIMA, 680);
    assert.ok(LARGURA_MINIMA <= 1366 / 2);
    assert.equal(ALTURA_MINIMA, 560);
  });

  it('aceita a janela encaixada na metade da tela, na largura mínima', () => {
    const salvo = { x: 683, y: 0, width: 680, height: 720, maximizada: false };
    assert.deepEqual(estadoSalvo(salvo), salvo);
    assert.ok(posicaoVisivel(salvo, [AREA_1366]));
  });

  it('aceita os tamanhos salvos pelas versões de mínimo 1024', () => {
    const salvo = { x: 40, y: 30, width: 1280, height: 860, maximizada: true };
    assert.deepEqual(estadoSalvo(salvo), salvo);
  });

  it('largura ou altura abaixo do mínimo sobem para o mínimo e a posição fica', () => {
    assert.deepEqual(
      estadoSalvo({
        x: 700,
        y: 10,
        width: 500,
        height: 300,
        maximizada: false,
      }),
      { x: 700, y: 10, width: 680, height: 560, maximizada: false },
    );
  });

  it('número quebrado vira inteiro', () => {
    assert.deepEqual(
      estadoSalvo({
        x: 10.4,
        y: 0.6,
        width: 700.5,
        height: 600.2,
        maximizada: false,
      }),
      { x: 10, y: 1, width: 701, height: 600, maximizada: false },
    );
  });

  it('recusa o que não é um tamanho salvo', () => {
    for (const ruim of [
      undefined,
      null,
      'janela',
      {},
      { x: 0, y: 0, width: 800, height: 600 },
      { x: 0, y: 0, width: '800', height: 600, maximizada: false },
      { x: 0, y: Number.NaN, width: 800, height: 600, maximizada: false },
      { x: 0, y: 0, width: Infinity, height: 600, maximizada: false },
      { x: 0, y: 0, width: 800, height: 600, maximizada: 'sim' },
    ])
      assert.equal(estadoSalvo(ruim), null, JSON.stringify(ruim));
  });

  it('a posição vale se a barra de título cai num monitor', () => {
    const j = (x: number, y: number) => ({
      x,
      y,
      width: 680,
      height: 600,
      maximizada: false,
    });
    // Encostada na borda direita, com 120 px da barra à mostra: vale.
    assert.ok(posicaoVisivel(j(1366 - 120, 0), [AREA_1366]));
    // Menos de 120 px à mostra, ou a barra acima da tela: não vale.
    assert.ok(!posicaoVisivel(j(1366 - 119, 0), [AREA_1366]));
    assert.ok(!posicaoVisivel(j(100, -20), [AREA_1366]));
    // Num segundo monitor à direita: vale.
    assert.ok(
      posicaoVisivel(j(1500, 100), [
        AREA_1366,
        { x: 1366, y: 0, width: 1920, height: 1040 },
      ]),
    );
  });
});
