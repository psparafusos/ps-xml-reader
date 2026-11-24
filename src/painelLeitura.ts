// Painel "Leitura" da aba XML, à esquerda (no lugar do rodapé dos esboços):
// Modo de leitura (Documento, Formato original, .XML), Folhas (só no
// Documento) e o Arquivo. O Documento é o documento auxiliar do XML aberto
// (DANFE, DANFE NFC-e, DACTE, DANFSe, Evento), com o nome embaixo do rótulo. Mesmo visual e mesmo jeito de recolher do painel da Conferência
// (classes .conferencia de app.css e bancada.css): recolhido, fica só a seta
// para abrir e, embaixo, o ícone do modo de leitura atual. A tela da nota
// (renderer.ts) decide o que cada botão faz; aqui só se desenha.

import { botao, el, icone, iconeSinal } from './dom';
import { ICONES } from './icones';
import {
  ARRANJOS_FOLHAS,
  ROTULO_FOLHAS,
  type ArranjoFolhas,
} from './nfe/folhasDanfe';
import type { SituacaoDestino } from './nfe/avisos';

export type ModoLeitura = 'documento' | 'formato' | 'xml';

export const MODOS_LEITURA: readonly ModoLeitura[] = [
  'documento',
  'formato',
  'xml',
];

export const ROTULO_MODO: Record<ModoLeitura, string> = {
  documento: 'Documento',
  formato: 'Formato original',
  xml: '.XML',
};

/** O que o painel mostra. */
export interface EstadoLeitura {
  modo: ModoLeitura;
  /** Por que o Documento não está disponível (o botão fica apagado), ou null. */
  semDocumento: string | null;
  /** Nome do documento auxiliar (DANFE, DACTE...), ou null se não há. */
  nomeDocumento: string | null;
  /** O Formato original ainda não pode ser mostrado (botão apagado). */
  semFormato: boolean;
  folhas: ArranjoFolhas;
  /**
   * Arranjos das Folhas que não mudam nada na nota aberta, com o motivo: o
   * botão fica apagado e o clique mostra o motivo num diálogo do app.
   */
  folhasSemEfeito: Partial<Record<ArranjoFolhas, string>>;
  /** Nome (em negrito) e as linhas do cartão Arquivo; null: sem cartão. */
  arquivo: { nome: string; linhas: string[] } | null;
  /**
   * Nota de outra empresa (aviso) ou emitida pela loja (informação): cartão
   * no alto do painel, que abre o detalhe ao clicar. null: sem cartão.
   */
  destino: SituacaoDestino | null;
}

export interface AcoesLeitura {
  escolherModo(modo: ModoLeitura): void;
  escolherFolhas(arranjo: ArranjoFolhas): void;
  /** O painel abriu ou recolheu (a área ao lado muda de largura). */
  mudouLargura(aberto: boolean): void;
}

// Ícones dos botões grandes, no desenho de 40 x 40 do protótipo.
const ICONE_MODO: Record<ModoLeitura, string[]> = {
  documento: [
    'M11 4h18a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'M13 10h14M13 14h9',
    'M13 18h14v5H13z',
    'M13 27h14M13 31h14',
  ],
  formato: [
    'M6.5 6h27a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-27A1.5 1.5 0 0 1 5 11.5v-4A1.5 1.5 0 0 1 6.5 6z',
    'M6.5 16h11a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 32.5v-15A1.5 1.5 0 0 1 6.5 16z',
    'M23.5 16h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-10a1.5 1.5 0 0 1-1.5-1.5v-5a1.5 1.5 0 0 1 1.5-1.5z',
    'M23.5 27h10a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-10a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z',
  ],
  xml: ['M14 12l-8 8 8 8M26 12l8 8-8 8M23 9l-6 22'],
};

const ICONE_FOLHAS: Record<ArranjoFolhas, string[]> = {
  uma: [
    'M13.5 5h13a1.5 1.5 0 0 1 1.5 1.5v19a1.5 1.5 0 0 1-1.5 1.5h-13a1.5 1.5 0 0 1-1.5-1.5v-19A1.5 1.5 0 0 1 13.5 5z',
    'M15 10h10M15 14h10M15 18h7',
    'M14 33h12',
  ],
  lado: [
    'M4.5 8h12a1.5 1.5 0 0 1 1.5 1.5v18a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 3 27.5v-18A1.5 1.5 0 0 1 4.5 8z',
    'M23.5 8h12a1.5 1.5 0 0 1 1.5 1.5v18a1.5 1.5 0 0 1-1.5 1.5h-12a1.5 1.5 0 0 1-1.5-1.5v-18A1.5 1.5 0 0 1 23.5 8z',
    'M6 13h9M6 17h9M25 13h9M25 17h9',
  ],
  largura: [
    'M10.5 6h19a1.5 1.5 0 0 1 1.5 1.5v25a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 9 32.5v-25A1.5 1.5 0 0 1 10.5 6z',
    'M2 20h7M38 20h-7M5 17l-3 3 3 3M35 17l3 3-3 3M13 12h14M13 16h14',
  ],
};

/** Ícone de linhas no desenho de 40 x 40. */
function iconeGrande(
  caminhos: string[],
  classe = 'leitura__icone',
): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of caminhos) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export interface PainelLeitura {
  atualizar(estado: EstadoLeitura): void;
  /** Aberto ou recolhido (a área ao lado começa depois dele). */
  aberto(): boolean;
  /**
   * Cabe ao lado do DANFE (empurra a área) ou não (janela estreita: abre por
   * cima, com sombra, e começa recolhido), como o painel da Conferência.
   */
  ajustarLayout(aoLado: boolean): void;
  /** Documento novo: na janela estreita, volta a começar recolhido. */
  novoDocumento(): void;
}

export function criarPainelLeitura(
  raiz: HTMLElement,
  acoes: AcoesLeitura,
): PainelLeitura {
  let estaAberto = true;
  let aoLado = true;
  let estado: EstadoLeitura | null = null;
  /** O detalhe do cartão de destino está aberto (fecha a cada nota nova). */
  let destinoAberto = false;

  const corpo = el('div', 'conferencia__corpo leitura__corpo');
  corpo.id = 'leitura-corpo';
  const trilho = el('div', 'conferencia__trilho');
  raiz.replaceChildren(trilho, corpo);
  raiz.setAttribute('aria-label', 'Leitura do arquivo');
  raiz.dataset.layout = 'lado';

  function aplicarEstado(focar?: 'corpo' | 'trilho'): void {
    raiz.dataset.layout = aoLado ? 'lado' : 'sobre';
    raiz.dataset.estado = estaAberto ? 'aberto' : 'recolhido';
    corpo.hidden = !estaAberto;
    trilho.hidden = estaAberto;
    document.body.classList.toggle('com-leitura-recolhida', !estaAberto);
    if (focar === 'corpo')
      corpo.querySelector<HTMLElement>('.conferencia__recolher')?.focus();
    if (focar === 'trilho')
      trilho.querySelector<HTMLElement>('.conferencia__expandir')?.focus();
    // Por cima (janela estreita), o painel aberto não empurra a área.
    acoes.mudouLargura(estaAberto && aoLado);
  }

  function abrir(): void {
    estaAberto = true;
    aplicarEstado('corpo');
  }

  function recolher(): void {
    estaAberto = false;
    aplicarEstado('trilho');
  }

  function secao(
    titulo: string,
    ...filhos: (Node | false | null)[]
  ): HTMLElement {
    return el(
      'section',
      'conferencia__secao',
      el('h3', 'conferencia__subtitulo', titulo),
      ...filhos,
    );
  }

  /**
   * Botão grande com ícone e texto (estilo Word), marcado com aria-pressed.
   * `tipo`: segunda linha, menor (o nome do documento montado).
   */
  function ladrilho(
    id: string,
    rotulo: string,
    caminhos: string[],
    marcado: boolean,
    apagado: boolean,
    aoClicar: () => void,
    tipo: string | null = null,
  ): HTMLButtonElement {
    const b = botao(
      'leitura__ladrilho',
      iconeGrande(caminhos),
      el('span', '', rotulo),
      // O espaço some no leiaute (coluna flexível), mas separa o nome lido.
      tipo ? ' ' : null,
      tipo ? el('span', 'leitura__ladrilho-tipo', tipo) : null,
    );
    b.id = id;
    b.setAttribute('aria-pressed', String(marcado));
    if (apagado) b.setAttribute('aria-disabled', 'true');
    b.addEventListener('click', aoClicar);
    return b;
  }

  function desenhar(): void {
    if (!estado) return;
    const e = estado;
    const recolherBtn = botao(
      'conferencia__recolher',
      icone(...ICONES.setaEsquerda),
      el('span', 'conferencia__so-leitor', 'Recolher o painel'),
    );
    recolherBtn.setAttribute('aria-expanded', 'true');
    recolherBtn.setAttribute('aria-controls', corpo.id);
    recolherBtn.addEventListener('click', () => recolher());
    const cabecalho = el(
      'header',
      'conferencia__cabecalho',
      el('h2', 'conferencia__titulo', 'Leitura'),
      recolherBtn,
    );

    const modos = el(
      'div',
      'leitura__ladrilhos leitura__ladrilhos--3',
      ...MODOS_LEITURA.map((m) =>
        ladrilho(
          `btn-modo-${m}`,
          ROTULO_MODO[m],
          ICONE_MODO[m],
          e.modo === m,
          (m === 'documento' && e.semDocumento !== null) ||
            (m === 'formato' && e.semFormato),
          () => acoes.escolherModo(m),
          m === 'documento' && e.semDocumento === null ? e.nomeDocumento : null,
        ),
      ),
    );
    modos.setAttribute('role', 'group');
    modos.setAttribute('aria-label', 'Modo de leitura');
    const aviso =
      e.semDocumento !== null
        ? el('p', 'leitura__aviso', e.semDocumento)
        : null;
    if (aviso) aviso.id = 'leitura-aviso-documento';

    const folhas =
      e.modo === 'documento'
        ? (() => {
            const g = el(
              'div',
              'leitura__ladrilhos leitura__ladrilhos--3',
              ...ARRANJOS_FOLHAS.map((a) =>
                ladrilho(
                  `btn-folhas-${a}`,
                  ROTULO_FOLHAS[a],
                  ICONE_FOLHAS[a],
                  e.folhas === a,
                  e.folhasSemEfeito[a] !== undefined,
                  () => acoes.escolherFolhas(a),
                ),
              ),
            );
            g.setAttribute('role', 'group');
            g.setAttribute('aria-label', 'Folhas');
            return secao('Folhas', g);
          })()
        : null;

    const destino = e.destino ? cartaoDestino(e.destino) : null;

    const arquivo = e.arquivo
      ? secao(
          'Arquivo',
          el(
            'div',
            'leitura__arquivo',
            el('strong', 'leitura__arquivo-nome', e.arquivo.nome),
            ...e.arquivo.linhas.map((l) => el('span', '', l)),
          ),
        )
      : null;

    corpo.replaceChildren(
      cabecalho,
      ...(destino ? [destino] : []),
      secao('Modo de leitura', modos, aviso),
      ...(folhas ? [folhas] : []),
      ...(arquivo ? [arquivo] : []),
    );

    // Recolhido: abrir e, embaixo, o ícone do modo de leitura atual.
    const expandir = botao(
      'conferencia__expandir conferencia__flutuante',
      icone(...ICONES.setaDireita),
      el('span', 'conferencia__so-leitor', 'Abrir o painel Leitura'),
    );
    expandir.setAttribute('aria-expanded', 'false');
    expandir.setAttribute('aria-controls', corpo.id);
    const modo = botao(
      'conferencia__icone-trilho conferencia__flutuante leitura__modo-trilho',
      iconeGrande(ICONE_MODO[e.modo], 'icone'),
    );
    const nome =
      e.modo === 'documento' && e.nomeDocumento ? ` (${e.nomeDocumento})` : '';
    modo.setAttribute(
      'aria-label',
      `Modo de leitura: ${ROTULO_MODO[e.modo]}${nome}`,
    );
    // Recolhido, o aviso de destino fica à vista: o ícone dele abre o painel.
    const sinalDestino = e.destino
      ? botao(
          'conferencia__icone-trilho conferencia__flutuante leitura__destino-trilho',
          iconeSinal(e.destino.tipo === 'outra-empresa' ? 'aviso' : 'info'),
        )
      : null;
    if (sinalDestino && e.destino)
      sinalDestino.setAttribute('aria-label', e.destino.titulo);
    for (const b of [expandir, modo, sinalDestino])
      b?.addEventListener('click', () => abrir());
    trilho.replaceChildren(
      expandir,
      modo,
      ...(sinalDestino ? [sinalDestino] : []),
    );
  }

  /**
   * Cartão de destino: ícone (aviso ou informação) e o texto curto; o clique
   * mostra o detalhe (quem é o destinatário, o CNPJ da loja). Mesmo visual
   * das verificações do painel da Conferência.
   */
  function cartaoDestino(d: SituacaoDestino): HTMLElement {
    const nivel = d.tipo === 'outra-empresa' ? 'leve' : 'info';
    const detalheId = 'leitura-destino-detalhe';
    const sinal = iconeSinal(d.tipo === 'outra-empresa' ? 'aviso' : 'info');
    sinal.classList.add('conferencia__sinal');
    const cabeca = botao(
      'conferencia__linha',
      sinal,
      el('span', 'conferencia__linha-titulo', d.titulo),
      icone(...(destinoAberto ? ICONES.setaCima : ICONES.setaBaixo)),
    );
    cabeca.id = 'leitura-destino';
    cabeca.setAttribute('aria-expanded', String(destinoAberto));
    cabeca.setAttribute('aria-controls', detalheId);
    cabeca.setAttribute(
      'aria-label',
      `${d.titulo}: ${d.tipo === 'outra-empresa' ? 'aviso' : 'informação'}`,
    );
    const detalhe = el(
      'div',
      'conferencia__detalhe',
      el('p', 'leitura__destino-detalhe', d.detalhe),
    );
    detalhe.id = detalheId;
    detalhe.hidden = !destinoAberto;
    cabeca.addEventListener('click', () => {
      destinoAberto = !destinoAberto;
      desenhar();
      corpo.querySelector<HTMLElement>('#leitura-destino')?.focus();
    });
    const cartao = el(
      'div',
      `conferencia__verificacao conferencia__verificacao--${nivel} leitura__destino`,
      cabeca,
      detalhe,
    );
    cartao.dataset.tipo = d.tipo;
    return cartao;
  }

  // Por cima da área: Esc ou um clique fora fecham.
  raiz.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || aoLado || !estaAberto) return;
    e.preventDefault();
    e.stopPropagation();
    recolher();
  });
  document.addEventListener('mousedown', (e) => {
    if (aoLado || !estaAberto || raiz.hidden) return;
    if (!raiz.contains(e.target as Node)) {
      estaAberto = false;
      aplicarEstado();
    }
  });

  aplicarEstado();
  return {
    ajustarLayout(lado: boolean): void {
      if (lado === aoLado) return;
      aoLado = lado;
      // Por cima ele começa recolhido; de volta ao lado, abre de novo.
      estaAberto = lado;
      aplicarEstado();
    },
    novoDocumento(): void {
      destinoAberto = false;
      if (!aoLado) estaAberto = false;
      aplicarEstado();
    },
    atualizar(novo: EstadoLeitura): void {
      estado = novo;
      desenhar();
    },
    aberto: () => estaAberto,
  };
}
