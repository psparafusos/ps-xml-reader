// Faixa de avisos da Conferência, logo abaixo da barra amarela: "Nada a
// apontar nesta nota" quando está tudo certo, ou "N avisos", que abre a
// lista. A faixa é só da tela: não sai no PDF nem na impressão (print.css).

import { botao, el, icone } from './dom';
import { textoAviso, type Aviso, type Conferido } from './nfe/avisos';

/**
 * Desenha a faixa com `avisos`. A lista aberta continua aberta ao redesenhar
 * (por exemplo, a cada quantidade digitada). `abrir`: abre um .psxml da
 * lista de nota já conferida numa janela nova.
 */
export function desenharFaixa(
  faixa: HTMLElement,
  avisos: Aviso[],
  abrir: (c: Conferido) => void,
): void {
  const aberta = faixa.dataset.aberta === 'true' && avisos.length > 0;
  faixa.dataset.estado = avisos.length > 0 ? 'avisos' : 'ok';
  if (avisos.length === 0) {
    faixa.dataset.aberta = 'false';
    faixa.replaceChildren(
      el(
        'p',
        'faixa-avisos__ok',
        el('span', 'faixa-avisos__marca', '✓'),
        'Nada a apontar nesta nota',
      ),
    );
    return;
  }

  const lista = el(
    'ul',
    'faixa-avisos__lista',
    ...avisos.map((a) => {
      const { titulo, detalhe } = textoAviso(a);
      const li = el(
        'li',
        `faixa-avisos__item faixa-avisos__item--${a.tipo}`,
        el('strong', 'faixa-avisos__titulo', titulo),
        el('span', 'faixa-avisos__detalhe', detalhe),
      );
      if (a.tipo === 'conferido') {
        const b = botao(
          'botao botao--claro botao--pequeno faixa-avisos__abrir',
          icone('M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'),
          el('span', '', 'Abrir em nova janela'),
        );
        b.title = `Abrir ${a.arquivo.nome} numa janela nova`;
        b.addEventListener('click', () => abrir(a.arquivo));
        li.append(b);
      }
      return li;
    }),
  );
  lista.id = 'faixa-avisos-lista';
  lista.hidden = !aberta;

  const n = avisos.length;
  const contador = botao(
    'faixa-avisos__contador',
    el('span', 'faixa-avisos__icone', '!'),
    el('span', '', n === 1 ? '1 aviso' : `${n} avisos`),
    icone(aberta ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'),
  );
  contador.setAttribute('aria-expanded', String(aberta));
  contador.setAttribute('aria-controls', lista.id);
  contador.title = aberta ? 'Esconder os avisos' : 'Ver os avisos';
  contador.addEventListener('click', () => {
    faixa.dataset.aberta = String(!aberta);
    desenharFaixa(faixa, avisos, abrir);
    faixa.querySelector<HTMLElement>('.faixa-avisos__contador')?.focus();
  });
  faixa.replaceChildren(contador, lista);
}
