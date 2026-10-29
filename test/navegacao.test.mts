import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { destinoAnotacao } from '../src/nfe/navegacao.ts';

// Três linhas, duas colunas de anotação cada.
const GRADE = [2, 2, 2];

describe('destinoAnotacao', () => {
  it('Enter vai para a mesma coluna da linha de baixo', () => {
    assert.deepEqual(destinoAnotacao(GRADE, 0, 1, 'enter'), {
      linha: 1,
      coluna: 1,
    });
  });

  it('Shift+Enter vai para a mesma coluna da linha de cima', () => {
    assert.deepEqual(destinoAnotacao(GRADE, 2, 0, 'shift-enter'), {
      linha: 1,
      coluna: 0,
    });
  });

  it('Enter na última linha e Shift+Enter na primeira ficam no campo', () => {
    assert.equal(destinoAnotacao(GRADE, 2, 0, 'enter'), 'ficar');
    assert.equal(destinoAnotacao(GRADE, 0, 1, 'shift-enter'), 'ficar');
  });

  it('Tab vai para a próxima coluna da mesma linha', () => {
    assert.deepEqual(destinoAnotacao(GRADE, 1, 0, 'tab'), {
      linha: 1,
      coluna: 1,
    });
  });

  it('Tab na última coluna vai para a primeira da linha de baixo', () => {
    assert.deepEqual(destinoAnotacao(GRADE, 0, 1, 'tab'), {
      linha: 1,
      coluna: 0,
    });
  });

  it('Shift+Tab faz o inverso', () => {
    assert.deepEqual(destinoAnotacao(GRADE, 1, 1, 'shift-tab'), {
      linha: 1,
      coluna: 0,
    });
    assert.deepEqual(destinoAnotacao(GRADE, 1, 0, 'shift-tab'), {
      linha: 0,
      coluna: 1,
    });
  });

  it('Tab na última caixa e Shift+Tab na primeira deixam o navegador agir', () => {
    assert.equal(destinoAnotacao(GRADE, 2, 1, 'tab'), 'sair');
    assert.equal(destinoAnotacao(GRADE, 0, 0, 'shift-tab'), 'sair');
  });

  it('com uma coluna só, Tab desce e Shift+Tab sobe', () => {
    const uma = [1, 1, 1];
    assert.deepEqual(destinoAnotacao(uma, 0, 0, 'tab'), {
      linha: 1,
      coluna: 0,
    });
    assert.deepEqual(destinoAnotacao(uma, 2, 0, 'shift-tab'), {
      linha: 1,
      coluna: 0,
    });
  });

  it('com uma linha só, Enter fica e Tab percorre as colunas', () => {
    assert.equal(destinoAnotacao([3], 0, 1, 'enter'), 'ficar');
    assert.deepEqual(destinoAnotacao([3], 0, 1, 'tab'), {
      linha: 0,
      coluna: 2,
    });
    assert.equal(destinoAnotacao([3], 0, 2, 'tab'), 'sair');
  });
});
