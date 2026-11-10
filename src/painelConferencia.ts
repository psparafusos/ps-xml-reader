// Painel de conferência, à esquerda da nota (só no modo Conferência, só na
// tela): o resultado no topo, as verificações automáticas (✓ ou !, com o
// detalhe ao clicar), o que precisa da pessoa (Qtd recebida diferente, que
// leva à linha), as ferramentas (seção escondida enquanto não houver
// nenhuma) e, no rodapé, a situação dos documentos de referência ("Base:
// ST ✓ · TIPI ✓"), que abre a área deles. Recolhido, sobram só dois botões
// flutuantes no canto da área da nota: abrir e o selo da situação. Janela
// larga: fica aberto ao lado da nota, sem empurrá-la, e lembra se a pessoa
// recolheu. Janela estreita: começa recolhido e abre por cima da nota.

import { botao, el, icone, iconeSinal } from './dom';
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
  type FerramentaJanela,
  type PreviaFerramenta,
} from './nfe/ferramentas';
import type { ResumoCfop } from './nfe/resumoCfop';
import { ICONES, type SinalEstado } from './icones';

export interface AcoesPainel {
  abrirConferido(c: Conferido): void;
  /** Rola a tabela até o item e destaca a linha por um instante. */
  irParaItem(nItem: string, campo?: 'qtd' | 'cfop'): void;
  /** Nota aberta e anotações, para as ferramentas. */
  contexto(): ContextoFerramenta | null;
  /** Ferramenta aplicou mudanças: a tela redesenha o que mudou. */
  aplicado(): void;
  /** Ferramentas com janela própria, antes das de prévia simples. */
  ferramentasJanela(): readonly FerramentaJanela[];
  /** CFOPs de entrada da nota (coluna "CFOP de entrada"); null sem a coluna. */
  resumoCfop(): ResumoCfop | null;
  /**
   * Ids das ferramentas à mostra, na ordem do perfil (as de janela própria
   * pelo id e "cfops-entrada" para o resumo). Sem a função: todas, na ordem
   * de sempre.
   */
  ordemFerramentas?(): readonly string[];
}

export interface PainelConferencia {
  /** Redesenha com o resumo; null: ainda conferindo (nota recém-aberta). */
  desenhar(resumo: ResumoConferencia | null): void;
  /** Nota nova: na janela estreita, volta a começar recolhido. */
  novaNota(): void;
  /** Redesenha a seção Ferramentas (o resumo de CFOPs muda enquanto a pessoa digita). */
  atualizarFerramentas(): void;
  /** Recalcula se cabe ao lado (tamanho da janela, zoom, tela trocada). */
  ajustarLayout(): void;
  indicador: Indicador;
}

/** Ícone de cada nível (src/icones.ts): check verde, i cinza, triângulo amarelo, x vermelho. */
const SINAL_NIVEL: Record<NivelVerificacao, SinalEstado> = {
  ok: 'ok',
  info: 'info',
  leve: 'aviso',
  forte: 'erro',
};

function sinal(nivel: NivelVerificacao): SVGSVGElement {
  const svg = iconeSinal(SINAL_NIVEL[nivel]);
  svg.classList.add('conferencia__sinal');
  return svg;
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

  // ---------- recolhido: dois botões flutuantes ----------

  function desenharTrilho(r: ResumoConferencia | null): void {
    const pontos = r?.pontos ?? 0;
    const expandir = botao(
      'conferencia__expandir conferencia__flutuante',
      icone(...ICONES.setaDireita),
      el('span', 'conferencia__so-leitor', 'Abrir o painel de conferência'),
    );
    expandir.setAttribute('aria-expanded', 'false');
    expandir.setAttribute('aria-controls', corpo.id);
    // O selo: check verde (tudo certo) ou o número de pontos em vermelho.
    const situacao = botao(
      `conferencia__icone-trilho conferencia__flutuante conferencia__icone-trilho--${r === null ? 'carregando' : pontos === 0 ? 'ok' : 'alerta'}`,
      r === null
        ? el('span', 'conferencia__giro')
        : pontos === 0
          ? iconeSinal('ok')
          : el('span', 'conferencia__contagem', String(pontos)),
    );
    situacao.setAttribute(
      'aria-label',
      r === null ? 'Conferindo a nota' : r.titulo.replace(' · ', ', '),
    );
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
      icone(...(aberta ? ICONES.setaCima : ICONES.setaBaixo)),
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
        icone(...ICONES.externo),
        el('span', '', 'Abrir em nova janela'),
      );
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
      icone(...ICONES.setaEsquerda),
      el('span', 'conferencia__so-leitor', 'Recolher o painel'),
    );
    recolherBtn.setAttribute('aria-expanded', 'true');
    recolherBtn.setAttribute('aria-controls', corpo.id);
    recolherBtn.addEventListener('click', () => recolher());

    const estado = r === null ? 'carregando' : r.pontos === 0 ? 'ok' : 'alerta';
    const resultado = el(
      'div',
      `conferencia__resultado conferencia__resultado--${estado}`,
      r === null
        ? el('span', 'conferencia__giro')
        : iconeSinal(r.pontos === 0 ? 'ok' : 'erro'),
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
                sinal('forte'),
                el(
                  'span',
                  'conferencia__pendencia-textos',
                  el('span', 'conferencia__linha-titulo', p.titulo),
                  el('span', 'conferencia__pendencia-detalhe', p.detalhe),
                ),
              );
              b.addEventListener('click', () => {
                if (!aoLado) recolher(false);
                acoes.irParaItem(p.nItem);
              });
              return el('li', '', b);
            }),
          );

    const ferramentas = blocosFerramentas();
    corpo.replaceChildren(
      cabecalho,
      resultado,
      secao(
        'Verificações automáticas',
        el('ul', 'conferencia__lista', ...r.verificacoes.map(linhaVerificacao)),
      ),
      secao('Precisa de você', pendencias),
      ...(ferramentas.length > 0 ? [secao('Ferramentas', ...ferramentas)] : []),
    );
  }

  /**
   * O conteúdo da seção Ferramentas na ordem do perfil: as linhas seguidas
   * ficam numa lista só; o resumo de CFOPs entra onde o perfil manda.
   */
  function blocosFerramentas(): HTMLElement[] {
    const janela = acoes.ferramentasJanela();
    const ordem = acoes.ordemFerramentas?.() ?? [
      ...janela.map((f) => f.id),
      'cfops-entrada',
    ];
    const blocos: HTMLElement[] = [];
    let lista: HTMLElement | null = null;
    const linha = (li: HTMLLIElement) => {
      if (!lista) blocos.push((lista = el('ul', 'conferencia__lista')));
      lista.append(li);
    };
    for (const id of ordem) {
      const fe = janela.find((f) => f.id === id);
      if (fe) linha(linhaFerramentaJanela(fe));
      else if (id === 'cfops-entrada') {
        const r = resumoCfops();
        if (r) blocos.push(r);
        lista = null;
      }
    }
    for (const fe of FERRAMENTAS) linha(linhaFerramenta(fe));
    return blocos;
  }

  // ---------- resumo dos CFOPs de entrada ----------

  /** Valor com a lista de itens aberta (até trocar de nota). */
  let cfopAberto: string | null = null;

  /**
   * "2102: 194 itens · 2403: 2 itens", da coluna CFOP de entrada. Clicar num
   * valor lista os itens; clicar num item leva à linha (como a divergência
   * de quantidade). Valores com poucos itens ficam em destaque.
   */
  function resumoCfops(): HTMLElement | false {
    const r = acoes.resumoCfop();
    if (!r) return false;
    if (cfopAberto && !r.grupos.some((g) => g.valor === cfopAberto))
      cfopAberto = null;
    const lista = el('ul', 'conferencia__cfops');
    for (const g of r.grupos) {
      const aberto = cfopAberto === g.valor;
      const listaId = `conferencia-cfop-${g.valor.replace(/\W/g, '_')}`;
      const b = botao(
        `conferencia__cfop${g.destaque ? ' conferencia__cfop--destaque' : ''}`,
        el('strong', '', g.valor),
        el(
          'span',
          '',
          `${g.itens.length} ${g.itens.length === 1 ? 'item' : 'itens'}`,
        ),
        g.destaque && el('span', 'conferencia__so-leitor', ', poucos itens'),
        g.manuais > 0 &&
          el(
            'span',
            'conferencia__cfop-manual',
            g.manuais === g.itens.length ? 'manual' : `${g.manuais} manual`,
          ),
        icone(...(aberto ? ICONES.setaCima : ICONES.setaBaixo)),
      );
      b.setAttribute('aria-expanded', String(aberto));
      b.setAttribute('aria-controls', listaId);
      b.dataset.cfop = g.valor;
      b.addEventListener('click', () => {
        cfopAberto = aberto ? null : g.valor;
        desenharCorpo(resumoAtual);
        corpo
          .querySelector<HTMLElement>(`[data-cfop="${CSS.escape(g.valor)}"]`)
          ?.focus();
      });
      const itens = el(
        'ul',
        'conferencia__cfop-itens',
        ...g.itens.map((i) => {
          const item = botao(
            'conferencia__cfop-item',
            el('span', 'conferencia__cfop-num', i.nItem),
            el('span', '', i.xProd),
            i.manual && el('span', 'conferencia__cfop-manual', 'manual'),
          );
          item.addEventListener('click', () => {
            if (!aoLado) recolher(false);
            acoes.irParaItem(i.nItem, 'cfop');
          });
          return el('li', '', item);
        }),
      );
      itens.id = listaId;
      itens.hidden = !aberto;
      lista.append(el('li', '', b, itens));
    }
    return el(
      'div',
      'conferencia__resumo-cfop',
      el('span', 'conferencia__linha-titulo', 'CFOPs de entrada'),
      r.grupos.length === 0
        ? el(
            'p',
            'conferencia__pendencia-detalhe',
            'Nenhum item com CFOP de entrada preenchido.',
          )
        : lista,
      r.grupos.length > 0 &&
        r.vazios > 0 &&
        el(
          'p',
          'conferencia__pendencia-detalhe',
          `${r.vazios} ${r.vazios === 1 ? 'item sem CFOP' : 'itens sem CFOP'} de entrada.`,
        ),
    );
  }

  // ---------- ferramentas (Rodar, prévia e Aplicar) ----------

  /** Ferramenta com janela própria: Rodar mostra o processando (passando de 500 ms) e abre a janela. */
  function linhaFerramentaJanela(fe: FerramentaJanela): HTMLLIElement {
    const rodar = botao(
      'botao botao--ferramenta botao--pequeno',
      el('span', '', 'Rodar'),
    );
    rodar.disabled = !fe.podeRodar();
    rodar.addEventListener('click', () => {
      if (!fe.podeRodar()) return;
      void (async () => {
        if (fe.antesDeRodar && !(await fe.antesDeRodar())) return;
        await indicador.rodar(() => fe.rodar());
      })();
    });
    const aviso = fe.aviso();
    let atalho: HTMLButtonElement | null = null;
    if (aviso?.acao) {
      const acao = aviso.acao;
      atalho = botao(
        'botao botao--claro botao--pequeno',
        el('span', '', acao.rotulo),
      );
      atalho.addEventListener('click', () => acao.executar());
    }
    return el(
      'li',
      'conferencia__ferramenta',
      el('span', 'conferencia__linha-titulo', fe.titulo),
      el('p', 'conferencia__pendencia-detalhe', fe.descricao),
      aviso && el('p', 'conferencia__aviso-ferramenta', aviso.texto),
      el('div', 'conferencia__acoes', rodar, atalho),
    );
  }

  /** Prévia de cada ferramenta já rodada (até aplicar ou trocar de nota). */
  const previas = new Map<string, PreviaFerramenta>();

  function linhaFerramenta(fe: Ferramenta): HTMLLIElement {
    const previa = previas.get(fe.id);
    const rodar = botao(
      'botao botao--ferramenta botao--pequeno',
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
    atualizarFerramentas() {
      desenharCorpo(resumoAtual);
    },
    novaNota() {
      cfopAberto = null;
      sobreposto = false;
      primeiroResumo = true;
      abertas.clear();
      previas.clear();
    },
    ajustarLayout,
    indicador,
  };
}
