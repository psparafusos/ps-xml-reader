import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { ATRASO_DICA, ligarDica, type CaixaDica } from '../src/tooltip.ts';

// Sem DOM: o alvo é um EventTarget e a caixa, uma falsa que anota o que viu.
function caixaFalsa() {
  const vista: { aberta: string | null } = { aberta: null };
  const caixa: CaixaDica = {
    mostrar: (_alvo, texto) => {
      vista.aberta = texto;
    },
    esconder: () => {
      vista.aberta = null;
    },
  };
  return { vista, caixa };
}

const tecla = (key: string) =>
  Object.assign(new Event('keydown', { cancelable: true }), { key });

describe('dica (tooltip)', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  it('abre no foco depois do atraso', () => {
    const alvo = new EventTarget();
    const { vista, caixa } = caixaFalsa();
    ligarDica(alvo, 'Texto da dica', caixa);
    alvo.dispatchEvent(new Event('focusin'));
    mock.timers.tick(ATRASO_DICA - 1);
    assert.equal(vista.aberta, null);
    mock.timers.tick(1);
    assert.equal(vista.aberta, 'Texto da dica');
  });

  it('fecha com Esc, e o Esc não segue adiante', () => {
    const alvo = new EventTarget();
    const { vista, caixa } = caixaFalsa();
    ligarDica(alvo, 'Texto', caixa);
    alvo.dispatchEvent(new Event('focusin'));
    mock.timers.tick(ATRASO_DICA);
    assert.equal(vista.aberta, 'Texto');
    const esc = tecla('Escape');
    alvo.dispatchEvent(esc);
    assert.equal(vista.aberta, null);
    assert.equal(esc.defaultPrevented, true);
  });

  it('Esc com a dica fechada não é segurado', () => {
    const alvo = new EventTarget();
    const { caixa } = caixaFalsa();
    ligarDica(alvo, 'Texto', caixa);
    const esc = tecla('Escape');
    alvo.dispatchEvent(esc);
    assert.equal(esc.defaultPrevented, false);
  });

  it('sair antes do atraso: não abre', () => {
    const alvo = new EventTarget();
    const { vista, caixa } = caixaFalsa();
    ligarDica(alvo, 'Texto', caixa);
    alvo.dispatchEvent(new Event('mouseenter'));
    mock.timers.tick(200);
    alvo.dispatchEvent(new Event('mouseleave'));
    mock.timers.tick(ATRASO_DICA);
    assert.equal(vista.aberta, null);
  });

  it('perder o foco fecha', () => {
    const alvo = new EventTarget();
    const { vista, caixa } = caixaFalsa();
    ligarDica(alvo, 'Texto', caixa);
    alvo.dispatchEvent(new Event('focusin'));
    mock.timers.tick(ATRASO_DICA);
    alvo.dispatchEvent(new Event('focusout'));
    assert.equal(vista.aberta, null);
  });
});
