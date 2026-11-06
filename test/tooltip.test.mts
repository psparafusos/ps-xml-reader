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

// Caixa falsa que sabe de quem é a dica aberta (como a do app).
function caixaComDono() {
  const vista: { dono: EventTarget | null; texto: string | null } = {
    dono: null,
    texto: null,
  };
  const caixa: CaixaDica = {
    mostrar: (alvo, texto) => {
      vista.dono = alvo;
      vista.texto = texto;
    },
    esconder: (alvo) => {
      if (alvo !== vista.dono) return;
      vista.dono = null;
      vista.texto = null;
    },
  };
  return { vista, caixa };
}

describe('dica: foco do teclado vale mais que o mouse', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
  afterEach(() => mock.timers.reset());

  function montar() {
    const { vista, caixa } = caixaComDono();
    const mva = new EventTarget();
    const st = new EventTarget();
    ligarDica(mva, 'Dica da MVA', caixa);
    ligarDica(st, 'Dica de ST em SE', caixa);
    return { vista, mva, st };
  }

  it('foco num cabeçalho e mouse em outro: fica a dica do foco', () => {
    const { vista, mva, st } = montar();
    mva.dispatchEvent(new Event('focusin'));
    mock.timers.tick(ATRASO_DICA);
    st.dispatchEvent(new Event('mouseenter'));
    mock.timers.tick(ATRASO_DICA);
    assert.equal(vista.texto, 'Dica da MVA');
    assert.equal(vista.dono, mva);
    st.dispatchEvent(new Event('mouseleave'));
    assert.equal(vista.texto, 'Dica da MVA');
  });

  it('mouse em cima e o foco chega em outro: a do foco toma o lugar', () => {
    const { vista, mva, st } = montar();
    st.dispatchEvent(new Event('mouseenter'));
    mock.timers.tick(ATRASO_DICA);
    assert.equal(vista.texto, 'Dica de ST em SE');
    mva.dispatchEvent(new Event('focusin'));
    mock.timers.tick(ATRASO_DICA);
    assert.equal(vista.texto, 'Dica da MVA');
    st.dispatchEvent(new Event('mouseleave'));
    assert.equal(vista.texto, 'Dica da MVA');
  });

  it('o foco sai: abre a do cabeçalho que está sob o mouse', () => {
    const { vista, mva, st } = montar();
    mva.dispatchEvent(new Event('focusin'));
    mock.timers.tick(ATRASO_DICA);
    st.dispatchEvent(new Event('mouseenter'));
    mock.timers.tick(ATRASO_DICA);
    mva.dispatchEvent(new Event('focusout'));
    assert.equal(vista.texto, null);
    mock.timers.tick(ATRASO_DICA);
    assert.equal(vista.texto, 'Dica de ST em SE');
    assert.equal(vista.dono, st);
  });
});
