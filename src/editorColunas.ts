// Painel "Editar colunas" da conferência: marcar, desmarcar e arrastar as
// colunas da tabela de itens, criar e remover anotações extras, com a prévia
// da tabela ao lado. Tudo é um rascunho até Aplicar; Cancelar (ou Esc) volta
// ao estado anterior. Exportar, Importar e Restaurar padrão agem direto na
// configuração salva e recarregam o painel com o resultado.

import { classeColuna, colunasDaConfig, type ColunaItem } from './nfe/colunas';
import {
  ANOTACOES_PRONTAS,
  idDaAnotacao,
  LARGURAS_ANOTACAO,
  ROTULO_LARGURA,
  type LarguraAnotacao,
  problemaTitulo,
  LIMITE_TITULO,
  type ConfigConferencia,
} from './nfe/config';
import type { Item } from './nfe/tipos';
import {
  descreverPlano,
  ORIENTACOES_CONFIG,
  ROTULO_ORIENTACAO,
  type OrientacaoConfig,
  type PlanoFolha,
} from './nfe/folha';
import { botao, comSetasDeRolagem, el, icone } from './dom';

export interface AcoesEditor {
  /** Salva e aplica na tabela. Devolve a mensagem de erro, ou null. */
  aplicar(config: ConfigConferencia): Promise<string | null>;
  exportar(): Promise<ResultadoExportarConfig>;
  importar(): Promise<ResultadoConfig | { status: 'cancelado' }>;
  restaurar(): Promise<ResultadoConfig | { status: 'cancelado' }>;
  /**
   * Como a tabela da nota aberta iria para a folha com esta configuração
   * (para o indicador); null sem nota ou sem itens.
   */
  plano(config: ConfigConferencia): PlanoFolha | null;
}

/** Itens fictícios da prévia (nunca vêm de uma nota). */
const ITENS_PREVIA: Item[] = [
  [
    '1',
    'PAR-0830',
    '7890000000017',
    'PARAFUSO SEXTAVADO M8 X 30 ZINCADO',
    '73181500',
    '5102',
    'PC',
    '100',
    '0.42',
    '42.00',
    '0',
    '5.04',
  ],
  [
    '2',
    'POR-0800',
    '7890000000024',
    'PORCA SEXTAVADA M8 ZINCADA',
    '73181600',
    '5102',
    'PC',
    '250',
    '0.09',
    '22.50',
    '0',
    '2.70',
  ],
  [
    '3',
    'ARR-0800',
    '',
    'ARRUELA LISA M8 ZINCADA',
    '73182200',
    '5102',
    'PC',
    '250',
    '0.05',
    '12.50',
    '0',
    '1.50',
  ],
  [
    '4',
    'BRO-0600',
    '7890000000048',
    'BROCA ACO RAPIDO 6 MM',
    '82075011',
    '5102',
    'UN',
    '10',
    '7.90',
    '79.00',
    '3.95',
    '9.48',
  ],
].map(
  ([
    nItem,
    cProd,
    cEAN,
    xProd,
    NCM,
    CFOP,
    uCom,
    qCom,
    vUnCom,
    vProd,
    vIPI,
    vICMS,
  ]) => ({
    nItem,
    cProd,
    cEAN,
    xProd,
    NCM,
    CEST: '',
    CFOP,
    uCom,
    qCom,
    vUnCom,
    vProd,
    vDesc: '',
    infAdProd: '',
    vIPI,
    vICMS,
    cstIcms: '',
  }),
);

/** Texto fictício nas anotações da prévia, só na primeira linha. */
const TEXTO_PREVIA_ANOTACAO = 'Conferido';

let dialogo: HTMLDialogElement | null = null;

/** true enquanto o painel está aberto. */
export function editorAberto(): boolean {
  return dialogo?.open === true;
}

export function abrirEditorColunas(
  config: ConfigConferencia,
  acoes: AcoesEditor,
): void {
  if (editorAberto()) return;
  let rascunho: ConfigConferencia = structuredClone(config);
  let ocupado = false;

  const lista = el('ol', 'colunas-lista');
  lista.setAttribute('aria-label', 'Colunas');
  const prontas = el('div', 'painel__prontas');
  const campoTitulo = el('input', 'painel__campo');
  campoTitulo.type = 'text';
  campoTitulo.maxLength = LIMITE_TITULO;
  campoTitulo.placeholder = 'Título da nova anotação';
  campoTitulo.setAttribute('aria-label', 'Título da nova anotação');
  const erroTitulo = el('p', 'painel__erro-campo');
  erroTitulo.id = 'erro-titulo-anotacao';
  erroTitulo.hidden = true;
  campoTitulo.setAttribute('aria-describedby', erroTitulo.id);
  const btnCriar = botao(
    'botao botao--claro botao--pequeno',
    icone('M12 5v14', 'M5 12h14'),
    el('span', '', 'Criar'),
  );
  const previa = el('div', 'previa');
  // Orientação da Conferência no PDF e na impressão, e se a tabela da nota
  // aberta cabe numa folha com o rascunho.
  const orientacao = el(
    'select',
    'painel__orientacao',
    ...ORIENTACOES_CONFIG.map((o) => {
      const op = el('option', '', ROTULO_ORIENTACAO[o]);
      op.value = o;
      return op;
    }),
  );
  orientacao.addEventListener('change', () => {
    rascunho.orientacao = orientacao.value as OrientacaoConfig;
    desenharIndicador();
  });
  const indicador = el('p', 'painel__indicador');
  indicador.setAttribute('role', 'status');
  const status = el('p', 'painel__status');
  status.setAttribute('role', 'status');
  const erro = el('p', 'painel__erro');
  erro.setAttribute('role', 'alert');
  erro.hidden = true;

  const btnExportar = botao(
    'botao botao--claro botao--pequeno',
    icone('M12 15V4', 'M7 9l5-5 5 5', 'M5 20h14'),
    el('span', '', 'Exportar'),
  );
  btnExportar.title = 'Exporta a configuração aplicada para um arquivo .json';
  const btnImportar = botao(
    'botao botao--claro botao--pequeno',
    icone('M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'),
    el('span', '', 'Importar'),
  );
  btnImportar.title = 'Lê um arquivo .json exportado e aplica';
  const btnRestaurar = botao(
    'botao botao--claro botao--pequeno',
    icone('M4 12a8 8 0 1 0 3-6.2', 'M4 4v5h5'),
    el('span', '', 'Restaurar padrão'),
  );
  const btnCancelar = botao('botao botao--claro', el('span', '', 'Cancelar'));
  const btnAplicar = botao('botao botao--principal', el('span', '', 'Aplicar'));

  const titulo = el('h2', 'painel__titulo', 'Colunas da tabela de itens');
  titulo.id = 'painel-colunas-titulo';
  const d = el(
    'dialog',
    'painel',
    el(
      'header',
      'painel__cabecalho',
      titulo,
      el(
        'p',
        'painel__dica',
        'Marque as colunas que aparecem e arraste para mudar a ordem. Vale para todas as notas, na tela, na impressão e no PDF.',
      ),
    ),
    el(
      'div',
      'painel__corpo',
      el(
        'div',
        'painel__lado',
        lista,
        el(
          'section',
          'painel__anotacoes',
          el('h3', 'painel__subtitulo', 'Anotações extras'),
          el(
            'p',
            'painel__dica',
            'Cada anotação vira uma coluna com uma caixa de texto por item.',
          ),
          prontas,
          el('div', 'painel__criar', campoTitulo, btnCriar),
          erroTitulo,
        ),
      ),
      el(
        'section',
        'painel__previa',
        el('h3', 'painel__subtitulo', 'Prévia'),
        el(
          'div',
          'painel__folha',
          el(
            'label',
            'painel__folha-rotulo',
            'Orientação da folha',
            orientacao,
          ),
          indicador,
        ),
        comSetasDeRolagem(previa),
      ),
    ),
    erro,
    el(
      'footer',
      'painel__rodape',
      el(
        'div',
        'painel__grupo',
        btnExportar,
        btnImportar,
        btnRestaurar,
        status,
      ),
      el('div', 'painel__grupo', btnCancelar, btnAplicar),
    ),
  );
  d.setAttribute('aria-labelledby', titulo.id);
  dialogo = d;

  const colunas = () => colunasDaConfig(rascunho);

  function mostrarErro(texto: string | null): void {
    erro.textContent = texto ?? '';
    erro.hidden = !texto;
  }

  // ---------- lista de colunas ----------

  function linha(c: ColunaItem): HTMLLIElement {
    const marca = el('input', 'colunas-lista__marca');
    marca.type = 'checkbox';
    marca.checked = c.visivel;
    marca.id = `coluna-${c.id}`;
    marca.addEventListener('change', () => {
      const cfg = rascunho.colunas.find((x) => x.id === c.id);
      if (cfg) cfg.visivel = marca.checked;
      mostrarErro(null);
      desenharPrevia();
    });
    const rotulo = el('label', 'colunas-lista__rotulo', c.rotulo);
    rotulo.htmlFor = marca.id;

    const alca = botao(
      'colunas-lista__alca',
      icone(
        'M9 6h.01',
        'M15 6h.01',
        'M9 12h.01',
        'M15 12h.01',
        'M9 18h.01',
        'M15 18h.01',
      ),
    );
    alca.setAttribute(
      'aria-label',
      `Mover ${c.rotulo}. Use as setas para cima e para baixo.`,
    );
    alca.title = 'Arraste para mudar a ordem';

    const li = el(
      'li',
      'colunas-lista__item',
      alca,
      marca,
      rotulo,
      c.anotacao && seletorLargura(c),
    );
    li.dataset.id = c.id;

    const extra = rascunho.anotacoes.find((a) => a.id === c.id);
    if (extra) {
      const remover = botao(
        'colunas-lista__remover',
        icone('M6 6l12 12', 'M18 6L6 18'),
      );
      remover.setAttribute('aria-label', `Remover a anotação ${c.rotulo}`);
      remover.title = 'Remover esta anotação';
      remover.addEventListener('click', () => {
        rascunho.anotacoes = rascunho.anotacoes.filter((a) => a.id !== c.id);
        rascunho.colunas = rascunho.colunas.filter((x) => x.id !== c.id);
        desenhar();
        lista.querySelector<HTMLElement>('.colunas-lista__alca')?.focus();
      });
      li.append(remover);
    }

    alca.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const i = rascunho.colunas.findIndex((x) => x.id === c.id);
      const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= rascunho.colunas.length) return;
      const [movida] = rascunho.colunas.splice(i, 1);
      rascunho.colunas.splice(j, 0, movida);
      desenhar();
      lista
        .querySelector<HTMLElement>(
          `[data-id="${CSS.escape(c.id)}"] .colunas-lista__alca`,
        )
        ?.focus();
    });
    alca.addEventListener('pointerdown', (e) => arrastar(e, li));
    return li;
  }

  /**
   * Largura da caixa de uma coluna de anotação: Estreita, Média ou Larga.
   * Fica no lugar da marca "anotação" (só as colunas de anotação têm).
   */
  function seletorLargura(c: ColunaItem): HTMLSelectElement {
    const s = el(
      'select',
      'colunas-lista__largura',
      ...LARGURAS_ANOTACAO.map((l) => {
        const o = el('option', '', ROTULO_LARGURA[l]);
        o.value = l;
        return o;
      }),
    );
    s.value = c.largura ?? 'automatica';
    s.setAttribute('aria-label', `Largura da coluna ${c.rotulo}`);
    s.title = 'Largura da caixa de anotação, na tela e na folha';
    s.addEventListener('change', () => {
      const cfg = rascunho.colunas.find((x) => x.id === c.id);
      if (cfg) cfg.largura = s.value as LarguraAnotacao;
      desenharPrevia();
    });
    return s;
  }

  /**
   * Arrastar pela alça: a linha segue o ponteiro na vertical e troca de lugar
   * com a vizinha ao passar do meio dela. Ao soltar, a ordem da lista vira a
   * do rascunho. Feito com eventos de ponteiro (o arrastar e soltar nativo é
   * o de abrir arquivos na janela).
   */
  function arrastar(e: PointerEvent, li: HTMLLIElement): void {
    if (e.button !== 0) return;
    e.preventDefault();
    // A captura fica na lista, que não se move: trocar a linha de lugar no
    // DOM soltaria a captura se ela estivesse na alça.
    lista.setPointerCapture(e.pointerId);
    li.classList.add('colunas-lista__item--arrastando');
    let inicioY = e.clientY;

    // A troca de lugar no DOM desloca a linha; inicioY compensa o
    // deslocamento para ela continuar exatamente sob o ponteiro.
    const r = (x: Element) => x.getBoundingClientRect();
    const meio = (x: Element) => r(x).top + r(x).height / 2;
    const mover = (ev: PointerEvent) => {
      li.style.transform = `translateY(${ev.clientY - inicioY}px)`;
      // Movimento rápido pode passar por várias linhas de uma vez.
      for (;;) {
        const anterior = li.previousElementSibling;
        const proxima = li.nextElementSibling;
        const antes = r(li).top;
        if (anterior && meio(li) < meio(anterior))
          lista.insertBefore(li, anterior);
        else if (proxima && meio(li) > meio(proxima))
          lista.insertBefore(proxima, li);
        else return;
        inicioY += r(li).top - antes;
        li.style.transform = `translateY(${ev.clientY - inicioY}px)`;
      }
    };
    const soltar = () => {
      lista.removeEventListener('pointermove', mover);
      lista.removeEventListener('pointerup', soltar);
      lista.removeEventListener('pointercancel', soltar);
      li.style.transform = '';
      li.classList.remove('colunas-lista__item--arrastando');
      const ordem = [...lista.children].map(
        (x) => (x as HTMLElement).dataset.id,
      );
      rascunho.colunas.sort(
        (a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id),
      );
      desenharPrevia();
    };
    lista.addEventListener('pointermove', mover);
    lista.addEventListener('pointerup', soltar);
    lista.addEventListener('pointercancel', soltar);
  }

  // ---------- anotações extras ----------

  function criarAnotacao(tituloNovo: string): boolean {
    const problema = problemaTitulo(tituloNovo, rascunho.anotacoes);
    if (problema) {
      erroTitulo.textContent = problema;
      erroTitulo.hidden = false;
      campoTitulo.setAttribute('aria-invalid', 'true');
      return false;
    }
    const t = tituloNovo.trim();
    const id = idDaAnotacao(t);
    rascunho.anotacoes.push({ id, titulo: t });
    rascunho.colunas.push({ id, visivel: true });
    erroTitulo.hidden = true;
    campoTitulo.removeAttribute('aria-invalid');
    desenhar();
    return true;
  }

  function desenharProntas(): void {
    prontas.replaceChildren(
      ...ANOTACOES_PRONTAS.map((t) => {
        const b = botao(
          'botao botao--claro botao--pequeno',
          icone('M12 5v14', 'M5 12h14'),
          el('span', '', t),
        );
        b.disabled = rascunho.anotacoes.some((a) => a.id === idDaAnotacao(t));
        b.title = b.disabled ? 'Já está na lista' : `Adicionar a coluna ${t}`;
        b.addEventListener('click', () => criarAnotacao(t));
        return b;
      }),
    );
  }

  btnCriar.addEventListener('click', () => {
    if (criarAnotacao(campoTitulo.value)) campoTitulo.value = '';
    campoTitulo.focus();
  });
  campoTitulo.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    btnCriar.click();
  });
  campoTitulo.addEventListener('input', () => {
    erroTitulo.hidden = true;
    campoTitulo.removeAttribute('aria-invalid');
  });

  // ---------- prévia ----------

  function desenharPrevia(): void {
    const visiveis = colunas().filter((c) => c.visivel);
    const classe = classeColuna;
    const tabela = el(
      'table',
      'tabela tabela--itens previa__tabela',
      el(
        'thead',
        '',
        el('tr', '', ...visiveis.map((c) => el('th', classe(c), c.rotulo))),
      ),
      ...ITENS_PREVIA.map((i, n) =>
        el(
          'tbody',
          'item',
          el(
            'tr',
            'item__linha',
            ...visiveis.map((c) =>
              c.anotacao
                ? el(
                    'td',
                    classe(c),
                    el(
                      'span',
                      'previa__anotacao',
                      n === 0 && c.id === visiveis.find((v) => v.anotacao)?.id
                        ? TEXTO_PREVIA_ANOTACAO
                        : '',
                    ),
                  )
                : el('td', classe(c), c.valor(i)),
            ),
          ),
        ),
      ),
    );
    // O fade fica no conteúdo, não na área que rola: a barra de rolagem
    // continua inteira.
    previa.replaceChildren(
      visiveis.length > 0
        ? el('div', 'previa__conteudo', tabela)
        : el('p', 'previa__vazia', 'Nenhuma coluna marcada.'),
    );
    desenharIndicador();
  }

  /**
   * "Cabe em retrato", "Cabe em paisagem" ou "Não cabe numa folha", medido
   * com os itens da nota aberta e o rascunho (colunas, larguras, orientação).
   */
  function desenharIndicador(): void {
    orientacao.value = rascunho.orientacao;
    let plano: PlanoFolha | null = null;
    try {
      plano = rascunho.colunas.some((c) => c.visivel)
        ? acoes.plano(rascunho)
        : null;
    } catch (e) {
      console.error(e);
    }
    indicador.hidden = plano === null;
    if (!plano) return;
    const texto = descreverPlano(plano);
    indicador.textContent = texto;
    indicador.dataset.cabe = String(plano.partes.length === 1);
    indicador.title =
      plano.partes.length > 1
        ? `Mesmo com a fonte em 7 pt, a tabela sai dividida em ${plano.partes.length} partes, cada uma numa folha.`
        : `Fonte da tabela na folha: ${String(plano.fontePt).replace('.', ',')} pt.`;
  }

  function desenhar(): void {
    lista.replaceChildren(...colunas().map(linha));
    desenharProntas();
    desenharPrevia();
  }

  // ---------- ações ----------

  function fechar(): void {
    d.close();
    d.remove();
    if (dialogo === d) dialogo = null;
  }

  /** Bloqueia os botões durante uma ação (diálogos do Windows, gravação). */
  async function comBloqueio(acao: () => Promise<void>): Promise<void> {
    if (ocupado) return;
    ocupado = true;
    const botoes = [
      btnExportar,
      btnImportar,
      btnRestaurar,
      btnCancelar,
      btnAplicar,
    ];
    for (const b of botoes) b.disabled = true;
    status.textContent = '';
    try {
      await acao();
    } catch (e) {
      mostrarErro('Não foi possível concluir a ação.');
      console.error(e);
    } finally {
      for (const b of botoes) b.disabled = false;
      ocupado = false;
    }
  }

  /** Configuração nova (importada ou padrão): recarrega o painel com ela. */
  function recarregar(nova: ConfigConferencia, aviso: string): void {
    rascunho = structuredClone(nova);
    mostrarErro(null);
    status.textContent = aviso;
    desenhar();
  }

  btnAplicar.addEventListener('click', () => {
    void comBloqueio(async () => {
      if (!rascunho.colunas.some((c) => c.visivel)) {
        mostrarErro('Deixe pelo menos uma coluna marcada.');
        return;
      }
      const problema = await acoes.aplicar(rascunho);
      if (problema) mostrarErro(problema);
      else fechar();
    });
  });
  btnCancelar.addEventListener('click', () => {
    if (!ocupado) fechar();
  });
  // Esc: o mesmo que Cancelar.
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (!ocupado) fechar();
  });
  btnExportar.addEventListener('click', () => {
    void comBloqueio(async () => {
      mostrarErro(null);
      const r = await acoes.exportar();
      if (r.status === 'exportado')
        status.textContent = `Exportada em ${r.caminho}`;
      else if (r.status === 'erro') mostrarErro(r.mensagem);
    });
  });
  btnImportar.addEventListener('click', () => {
    void comBloqueio(async () => {
      mostrarErro(null);
      const r = await acoes.importar();
      if (r.status === 'ok')
        recarregar(r.config, 'Configuração importada e aplicada.');
      else if (r.status === 'erro') mostrarErro(r.mensagem);
    });
  });
  btnRestaurar.addEventListener('click', () => {
    void comBloqueio(async () => {
      mostrarErro(null);
      const r = await acoes.restaurar();
      if (r.status === 'ok') recarregar(r.config, 'Padrão restaurado.');
      else if (r.status === 'erro') mostrarErro(r.mensagem);
    });
  });

  desenhar();
  document.body.append(d);
  d.showModal();
  lista.querySelector<HTMLElement>('.colunas-lista__marca')?.focus();
}
