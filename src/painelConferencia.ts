// Painel de conferência, à esquerda da nota (só no modo Conferência, só na
// tela): o resultado no topo, as verificações automáticas (✓ ou !, com o
// detalhe ao clicar), o que precisa da pessoa (Qtd recebida diferente, que
// leva à linha) e as ferramentas (seção escondida enquanto não houver
// nenhuma). Recolhe numa barra fina de ícones. Janela larga: fica aberto ao
// lado da nota, sem empurrá-la, e lembra se a pessoa recolheu. Janela
// estreita: começa recolhido e abre por cima da nota.

import { botao, el, icone } from './dom';
import { criarIndicador, type Indicador } from './indicador';
import type { Conferido } from './nfe/avisos';
import {
  painelCabeAoLado,
  type NivelVerificacao,
  type ResumoConferencia,
  type Verificacao,
} from './nfe/conferencia';
import {
  FERRAMENTAS,
  type ContextoFerramenta,
  type Ferramenta,
  type PreviaFerramenta,
} from './nfe/ferramentas';

export interface AcoesPainel {
  abrirConferido(c: Conferido): void;
  /** Rola a tabela até o item e destaca a linha por um instante. */
  irParaItem(nItem: string): void;
  /** Nota aberta e anotações, para as ferramentas. */
  contexto(): ContextoFerramenta | null;
  /** Ferramenta aplicou mudanças: a tela redesenha o que mudou. */
  aplicado(): void;
}

export interface PainelConferencia {
  /** Redesenha com o resumo; null: ainda conferindo (nota recém-aberta). */
  desenhar(resumo: ResumoConferencia | null): void;
  /** Nota nova: na janela estreita, volta a começar recolhido. */
  novaNota(): void;
  /** Recalcula se cabe ao lado (tamanho da janela, zoom, tela trocada). */
  ajustarLayout(): void;
  indicador: Indicador;
}

const ICONE_OK = 'M5 12l5 5 9-10';
const ICONE_ALERTA = ['M12 7v6', 'M12 17h.01'];
const ICONE_INFO = ['M12 11v6', 'M12 7h.01'];

/** Sinal de cada nível: ✓ verde, i cinza, ! amarelo (leve), ! vermelho. */
function sinal(nivel: NivelVerificacao): HTMLElement {
  return el(
    'span',
    `conferencia__sinal conferencia__sinal--${nivel}`,
    nivel === 'ok'
      ? icone(ICONE_OK)
      : nivel === 'info'
        ? icone(...ICONE_INFO)
        : icone(...ICONE_ALERTA),
  );
}

const ROTULO_NIVEL: Record<NivelVerificacao, string> = {
  ok: 'certo',
  info: 'informação',
  leve: 'aviso',
  forte: 'alerta',
};

export function criarPainel(
  raiz: HTMLElement,
  /** O elemento da nota (para medir a sobra ao lado dela). */
  nota: HTMLElement,
  acoes: AcoesPainel,
): PainelConferencia {
  /** Janela larga: o que a pessoa escolheu nesta janela (null: aberto). */
  let escolhaAoLado: 'aberto' | 'recolhido' | null = null;
  /** Janela estreita: aberto por cima da nota agora. */
  let sobreposto = false;
  let aoLado = true;
  let resumoAtual: ResumoConferencia | null = null;
  /** Verificações com o detalhe aberto (ficam abertas ao redesenhar). */
  const abertas = new Set<string>();
  /** A nota aberta ainda não foi desenhada com o resumo. */
  let primeiroResumo = true;

  const corpo = el('div', 'conferencia__corpo');
  corpo.id = 'conferencia-corpo';
  const trilho = el('div', 'conferencia__trilho');
  raiz.replaceChildren(trilho, corpo);
  raiz.setAttribute('aria-label', 'Conferência da nota');

  const processando = () => {
    const p = el(
      'span',
      'conferencia__processando',
      el('span', 'conferencia__giro'),
      el('span', 'conferencia__so-leitor', 'Processando'),
    );
    p.setAttribute('role', 'status');
    return p;
  };
  const indicador = criarIndicador((v) => {
    raiz.dataset.processando = String(v);
  });

  const aberto = () => (aoLado ? escolhaAoLado !== 'recolhido' : sobreposto);

  function aplicarEstado(focar?: 'corpo' | 'trilho'): void {
    raiz.dataset.layout = aoLado ? 'lado' : 'sobre';
    raiz.dataset.estado = aberto() ? 'aberto' : 'recolhido';
    corpo.hidden = !aberto();
    trilho.hidden = aberto();
    if (focar === 'corpo')
      corpo.querySelector<HTMLElement>('.conferencia__recolher')?.focus();
    if (focar === 'trilho')
      trilho.querySelector<HTMLElement>('.conferencia__expandir')?.focus();
  }

  function abrir(): void {
    // Mede de novo: numa janela coberta por outras o Chromium adia o
    // ResizeObserver, e o layout poderia estar com a largura antiga.
    ajustarLayout();
    if (aoLado) escolhaAoLado = 'aberto';
    else sobreposto = true;
    aplicarEstado('corpo');
  }

  function recolher(focar = true): void {
    if (aoLado) escolhaAoLado = 'recolhido';
    else sobreposto = false;
    aplicarEstado(focar ? 'trilho' : undefined);
  }

  // ---------- barra fina (recolhido) ----------

  function desenharTrilho(r: ResumoConferencia | null): void {
    const pontos = r?.pontos ?? 0;
    const expandir = botao(
      'conferencia__expandir',
      icone('M9 6l6 6-6 6'),
      el('span', 'conferencia__so-leitor', 'Abrir o painel de conferência'),
    );
    expandir.title = 'Abrir o painel de conferência';
    expandir.setAttribute('aria-expanded', 'false');
    expandir.setAttribute('aria-controls', corpo.id);
    const situacao = botao(
      `conferencia__icone-trilho conferencia__icone-trilho--${r === null ? 'carregando' : pontos === 0 ? 'ok' : 'alerta'}`,
      r === null
        ? el('span', 'conferencia__giro')
        : pontos === 0
          ? icone(ICONE_OK)
          : el('span', 'conferencia__contagem', String(pontos)),
    );
    situacao.title =
      r === null ? 'Conferindo a nota' : r.titulo.replace(' · ', ', ');
    situacao.setAttribute('aria-label', situacao.title);
    for (const b of [expandir, situacao])
      b.addEventListener('click', () => abrir());
    trilho.replaceChildren(expandir, situacao, processando());
  }

  // ---------- painel aberto ----------

  function linhaVerificacao(v: Verificacao): HTMLLIElement {
    const detalheId = `conferencia-detalhe-${v.id}`;
    const aberta = abertas.has(v.id);
    const cabeca = botao(
      'conferencia__linha',
      sinal(v.nivel),
      el('span', 'conferencia__linha-titulo', v.titulo),
      icone(aberta ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'),
    );
    cabeca.setAttribute('aria-expanded', String(aberta));
    cabeca.setAttribute('aria-controls', detalheId);
    cabeca.setAttribute('aria-label', `${v.titulo}: ${ROTULO_NIVEL[v.nivel]}`);
    const detalhe = el(
      'div',
      'conferencia__detalhe',
      el('p', '', v.detalhe),
      v.linhas &&
        v.linhas.length > 0 &&
        el(
          'ul',
          'conferencia__parcelas',
          ...v.linhas.map((l) =>
            el(
              'li',
              `conferencia__parcela conferencia__parcela--${l.nivel}`,
              sinal(l.nivel),
              el('span', '', l.texto),
            ),
          ),
        ),
    );
    detalhe.id = detalheId;
    detalhe.hidden = !aberta;
    for (const c of v.conferidos ?? []) {
      const b = botao(
        'botao botao--claro botao--pequeno conferencia__abrir',
        icone('M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'),
        el('span', '', 'Abrir em nova janela'),
      );
      b.title = `Abrir ${c.nome} numa janela nova`;
      b.addEventListener('click', () => acoes.abrirConferido(c));
      detalhe.append(b);
    }
    cabeca.addEventListener('click', () => {
      if (aberta) abertas.delete(v.id);
      else abertas.add(v.id);
      desenharCorpo(resumoAtual);
      corpo
        .querySelector<HTMLElement>(`[aria-controls="${detalheId}"]`)
        ?.focus();
    });
    return el(
      'li',
      `conferencia__verificacao conferencia__verificacao--${v.nivel}`,
      cabeca,
      detalhe,
    );
  }

  function secao(titulo: string, ...filhos: (Node | false)[]): HTMLElement {
    return el(
      'section',
      'conferencia__secao',
      el('h3', 'conferencia__subtitulo', titulo),
      ...filhos,
    );
  }

  function desenharCorpo(r: ResumoConferencia | null): void {
    const recolherBtn = botao(
      'conferencia__recolher',
      icone('M15 6l-6 6 6 6'),
      el('span', 'conferencia__so-leitor', 'Recolher o painel'),
    );
    recolherBtn.title = 'Recolher o painel';
    recolherBtn.setAttribute('aria-expanded', 'true');
    recolherBtn.setAttribute('aria-controls', corpo.id);
    recolherBtn.addEventListener('click', () => recolher());

    const estado = r === null ? 'carregando' : r.pontos === 0 ? 'ok' : 'alerta';
    const resultado = el(
      'div',
      `conferencia__resultado conferencia__resultado--${estado}`,
      r === null
        ? el('span', 'conferencia__giro')
        : el(
            'span',
            'conferencia__resultado-sinal',
            r.pontos === 0 ? icone(ICONE_OK) : icone(...ICONE_ALERTA),
          ),
      el(
        'span',
        'conferencia__resultado-texto',
        r === null ? 'Conferindo a nota...' : r.titulo,
      ),
    );
    resultado.setAttribute('role', 'status');

    const cabecalho = el(
      'header',
      'conferencia__cabecalho',
      el('h2', 'conferencia__titulo', 'Conferência'),
      processando(),
      recolherBtn,
    );

    if (r === null) {
      corpo.replaceChildren(cabecalho, resultado);
      return;
    }

    const pendencias =
      r.pendencias.length === 0
        ? el('p', 'conferencia__vazio', 'Nenhuma divergência de Qtd recebida.')
        : el(
            'ul',
            'conferencia__lista',
            ...r.pendencias.map((p) => {
              const b = botao(
                'conferencia__pendencia',
                el(
                  'span',
                  'conferencia__sinal conferencia__sinal--alerta',
                  icone(...ICONE_ALERTA),
                ),
                el(
                  'span',
                  'conferencia__pendencia-textos',
                  el('span', 'conferencia__linha-titulo', p.titulo),
                  el('span', 'conferencia__pendencia-detalhe', p.detalhe),
                ),
              );
              b.title = `Ir para o item ${p.nItem} na tabela`;
              b.addEventListener('click', () => {
                if (!aoLado) recolher(false);
                acoes.irParaItem(p.nItem);
              });
              return el('li', '', b);
            }),
          );

    corpo.replaceChildren(
      cabecalho,
      resultado,
      secao(
        'Verificações automáticas',
        el('ul', 'conferencia__lista', ...r.verificacoes.map(linhaVerificacao)),
      ),
      secao('Precisa de você', pendencias),
      ...(FERRAMENTAS.length > 0
        ? [
            secao(
              'Ferramentas',
              el(
                'ul',
                'conferencia__lista',
                ...FERRAMENTAS.map(linhaFerramenta),
              ),
            ),
          ]
        : []),
    );
  }

  // ---------- ferramentas (Rodar, prévia e Aplicar) ----------

  /** Prévia de cada ferramenta já rodada (até aplicar ou trocar de nota). */
  const previas = new Map<string, PreviaFerramenta>();

  function linhaFerramenta(fe: Ferramenta): HTMLLIElement {
    const previa = previas.get(fe.id);
    const rodar = botao(
      'botao botao--claro botao--pequeno',
      el('span', '', previa ? 'Rodar de novo' : 'Rodar'),
    );
    const aplicar = botao(
      'botao botao--principal botao--pequeno',
      el('span', '', 'Aplicar'),
    );
    aplicar.hidden = !previa;
    aplicar.disabled = !previa?.temMudancas;
    rodar.addEventListener('click', () => {
      const c = acoes.contexto();
      if (!c) return;
      void indicador.rodar(async () => {
        previas.set(fe.id, await fe.rodar(c));
        desenharCorpo(resumoAtual);
      });
    });
    aplicar.addEventListener('click', () => {
      const c = acoes.contexto();
      if (!c || !previa) return;
      void indicador.rodar(async () => {
        await fe.aplicar(c, previa);
        previas.delete(fe.id);
        acoes.aplicado();
      });
    });
    return el(
      'li',
      'conferencia__ferramenta',
      el('span', 'conferencia__linha-titulo', fe.titulo),
      el('p', 'conferencia__pendencia-detalhe', fe.descricao),
      previa &&
        el(
          'div',
          'conferencia__previa',
          el('p', '', previa.resumo),
          previa.linhas.length > 0 &&
            el('ul', '', ...previa.linhas.map((l) => el('li', '', l))),
        ),
      el('div', 'conferencia__acoes', rodar, aplicar),
    );
  }

  // ---------- layout: ao lado ou por cima ----------

  const medida = (nome: string) =>
    parseFloat(getComputedStyle(raiz).getPropertyValue(nome)) || 0;

  function ajustarLayout(): void {
    const janela = document.documentElement.clientWidth;
    const conteudo = nota.getBoundingClientRect().width;
    const folga = medida('--folga-painel-conferencia');
    const antes = aoLado;
    aoLado = painelCabeAoLado(
      janela,
      conteudo,
      medida('--largura-painel-conferencia') + folga,
    );
    if (antes && !aoLado) sobreposto = false;
    // Recolhido, a barra fina também não pode cobrir a nota: sem sobra para
    // ela, a nota ganha um recuo à esquerda.
    document.body.classList.toggle(
      'com-recuo-conferencia',
      !raiz.hidden &&
        !painelCabeAoLado(
          janela,
          conteudo,
          medida('--largura-trilho-conferencia') + folga,
        ),
    );
    aplicarEstado();
  }

  // Por cima da nota: Esc ou clique fora fecham.
  raiz.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || aoLado || !sobreposto) return;
    e.preventDefault();
    e.stopPropagation();
    recolher();
  });
  // Tab para fora do painel (por cima da nota): fecha, para não cobrir o que
  // recebeu o foco.
  raiz.addEventListener('focusout', (e) => {
    const destino = e.relatedTarget as Node | null;
    if (!aoLado && sobreposto && destino && !raiz.contains(destino))
      recolher(false);
  });
  document.addEventListener('mousedown', (e) => {
    if (!aoLado && sobreposto && !raiz.contains(e.target as Node))
      recolher(false);
  });
  // A largura da página muda com a janela e com a barra de rolagem.
  new ResizeObserver(ajustarLayout).observe(document.documentElement);

  return {
    desenhar(r) {
      // Alerta forte (parcela vencida, por exemplo) já vem com o detalhe à
      // mostra; depois, abre e fecha como a pessoa deixar.
      if (r && primeiroResumo) {
        primeiroResumo = false;
        for (const v of r.verificacoes)
          if (v.nivel === 'forte' && v.linhas?.length) abertas.add(v.id);
      }
      resumoAtual = r;
      desenharTrilho(r);
      desenharCorpo(r);
      aplicarEstado();
    },
    novaNota() {
      sobreposto = false;
      primeiroResumo = true;
      abertas.clear();
      previas.clear();
    },
    ajustarLayout,
    indicador,
  };
}
