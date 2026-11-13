// Folhas do DANFE (painel Leitura) e orientação da Folha do PDF
// (src/nfe/folhasDanfe.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARRANJOS_FOLHAS,
  ROTULO_FOLHAS,
  ZOOM_LARGURA_MAX,
  ZOOM_LARGURA_MIN,
  orientacaoDaFolha,
  zoomParaLargura,
} from '../src/nfe/folhasDanfe.ts';

describe('folhas do DANFE (só a tela)', () => {
  it('os três arranjos, com os rótulos do painel Leitura', () => {
    assert.deepEqual(ARRANJOS_FOLHAS, ['uma', 'lado', 'largura']);
    assert.deepEqual(
      ARRANJOS_FOLHAS.map((a) => ROTULO_FOLHAS[a]),
      ['Uma de cada vez', 'Lado a lado', 'Ajustar à largura'],
    );
  });

  it('ajustar à largura: a folha e o recuo cabem na área', () => {
    // Folha de 794 px com 48 px de recuo numa área de 1684 px: 2x.
    assert.equal(zoomParaLargura(1684, 794, 48), 2);
    // Arredonda para baixo: nunca passa da largura.
    const z = zoomParaLargura(1000, 794, 48);
    assert.equal(z, 1.18);
    assert.ok(z * (794 + 48) <= 1000);
  });

  it('ajustar à largura: preso entre os limites', () => {
    assert.equal(zoomParaLargura(50, 794, 48), ZOOM_LARGURA_MIN);
    assert.equal(zoomParaLargura(100000, 794, 48), ZOOM_LARGURA_MAX);
  });

  it('ajustar à largura: sem medida, fica em 100%', () => {
    assert.equal(zoomParaLargura(0, 794, 48), 1);
    assert.equal(zoomParaLargura(Number.NaN, 794, 48), 1);
    assert.equal(zoomParaLargura(1000, 0, 0), 1);
    // Recuo negativo não conta.
    assert.equal(zoomParaLargura(1588, 794, -10), 2);
  });
});

describe('Folha do PDF da Conferência', () => {
  it('a escolhida vale mais que a do perfil', () => {
    assert.equal(orientacaoDaFolha('paisagem', 'retrato'), 'paisagem');
    assert.equal(orientacaoDaFolha('retrato', 'automatica'), 'retrato');
  });

  it('sem escolha, a do perfil (Automática inclusive)', () => {
    assert.equal(orientacaoDaFolha(null, 'automatica'), 'automatica');
    assert.equal(orientacaoDaFolha(null, 'paisagem'), 'paisagem');
  });
});
