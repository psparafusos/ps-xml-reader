// Painel "Editar colunas" da conferência: marcar, desmarcar e arrastar as
// colunas da tabela de itens, criar e remover anotações extras, com a prévia
// da tabela ao lado. Tudo é um rascunho até Aplicar, que grava no perfil
// ativo; Cancelar (ou Esc) volta ao estado anterior. No topo, o bloco
// "Perfil ativo" com o botão Trocar perfil, que abre a lista dos perfis
// (trocar com um clique, renomear e excluir na linha, Novo perfil, Importar,
// Exportar perfil ativo). Essas ações e o Restaurar padrão agem direto nos
// perfis salvos e recarregam o painel com o resultado.

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
import type { Anotacoes, Item } from './nfe/tipos';
import {
  descreverPlano,
  ORIENTACOES_CONFIG,
  ROTULO_ORIENTACAO,
  type PlanoFolha,
} from './nfe/folha';
import { botao, comSetasDeRolagem, el, icone, navegarMenu } from './dom';
import { desenharMiniatura } from './miniaturaFolha';
import { perguntar, pedirTexto } from './dialogos';
import { nomeLivre, problemaNomePerfil } from './nfe/perfis';
import { ICONES } from './icones';

/**
 * O que o painel pede ao resto da tela. Cada ação grava nos perfis salvos e,
 * se deu certo, a tela já aplicou o resultado; o painel recarrega com ele.
 */
export interface AcoesEditor {
  /** Grava o rascunho no perfil ativo. */
  aplicar(config: ConfigConferencia): Promise<ResultadoPerfis>;
  ativar(id: string): Promise<ResultadoPerfis>;
  /** Perfil novo, cópia do ativo, que passa a ser o ativo. */
  criar(nome: string): Promise<ResultadoPerfis>;
  renomear(id: string, nome: string): Promise<ResultadoPerfis>;
  excluir(id: string): Promise<ResultadoPerfis>;
  /** Exporta o perfil ativo. */
  exportar(): Promise<ResultadoExportarConfig>;
  /** Importa um perfil (pergunta se o nome já existe); devolve o nome dado. */
  importar(): Promise<
    | { status: 'ok'; estado: EstadoPerfis; nome: string }
    | { status: 'cancelado' }
    | { status: 'erro'; mensagem: string }
  >;
  restaurar(): Promise<ResultadoPerfis | { status: 'cancelado' }>;
  /**
   * Como a tabela iria para a folha com esta configuração (indicador e
   * miniatura), pela mesma régua do PDF: medida com os itens da nota aberta
   * ou, sem nota, com os itens e anotações de exemplo.
   */
  plano(
    config: ConfigConferencia,
    exemplo: Item[],
    anotacoesExemplo: Anotacoes,
  ): { plano: PlanoFolha; daNota: boolean };
  /** Cópia da tabela para a folha com estes itens e anotações. */
  tabelaFolha(
    config: ConfigConferencia,
    itens: Item[],
    anotacoes: Anotacoes,
  ): HTMLTableElement;
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
  [
    '5',
    'PAR-0616',
    '7890000000055',
    'PARAFUSO ALLEN M6 X 16 INOX',
    '73181500',
    '5102',
    'PC',
    '200',
    '0.31',
    '62.00',
    '0',
    '7.44',
  ],
  [
    '6',
    'BUC-0800',
    '7890000000062',
    'BUCHA DE NYLON 8 MM',
    '39269090',
    '5102',
    'PC',
    '500',
    '0.04',
    '20.00',
    '0',
    '2.40',
  ],
  [
    '7',
    'ABR-0350',
    '',
    'ABRACADEIRA NYLON 3,5 X 150 MM',
    '39269090',
    '5102',
    'PC',
    '1000',
    '0.03',
    '30.00',
    '0',
    '3.60',
  ],
  [
    '8',
    'DIS-1150',
    '7890000000086',
    'DISCO DE CORTE 115 X 1,0 MM',
    '68042211',
    '5102',
    'UN',
    '25',
    '3.20',
    '80.00',
    '4.00',
    '9.60',
  ],
  [
    '9',
    'FIT-1950',
    '7890000000093',
    'FITA ISOLANTE 19 MM X 20 M',
    '39191010',
    '5102',
    'UN',
    '12',
    '4.50',
    '54.00',
    '0',
    '6.48',
  ],
  [
    '10',
    'LUV-0009',
    '7890000000109',
    'LUVA DE PROTECAO TAMANHO 9',
    '61161000',
    '5102',
    'PR',
    '30',
    '6.80',
    '204.00',
    '0',
    '24.48',
  ],
  [
    '11',
    'OCU-0001',
    '7890000000116',
    'OCULOS DE SEGURANCA INCOLOR',
    '90049020',
    '5102',
    'UN',
    '20',
    '9.90',
    '198.00',
    '0',
    '23.76',
  ],
  [
    '12',
    'PAR-1040',
    '7890000000123',
    'PARAFUSO SEXTAVADO M10 X 40 ZINCADO',
    '73181500',
    '5102',
    'PC',
    '100',
    '0.68',
    '68.00',
    '0',
    '8.16',
  ],
  [
    '13',
    'POR-1000',
    '7890000000130',
    'PORCA SEXTAVADA M10 ZINCADA',
    '73181600',
    '5102',
    'PC',
    '100',
    '0.14',
    '14.00',
    '0',
    '1.68',
  ],
  [
    '14',
    'TRV-0024',
    '7890000000147',
    'TRAVA ROSCA MEDIA 10 G',
    '35069190',
    '5102',
    'UN',
    '6',
    '18.90',
    '113.40',
    '5.67',
    '13.61',
  ],
  [
    '15',
    'ROD-0606',
    '',
    'RODA DE NYLON 6 POL',
    '87168000',
    '5102',
    'UN',
    '4',
    '27.50',
    '110.00',
    '0',
    '13.20',
  ],
  [
    '16',
    'BRO-1000',
    '7890000000161',
    'BROCA ACO RAPIDO 10 MM',
    '82075011',
    '5102',
    'UN',
    '5',
    '14.30',
    '71.50',
    '3.58',
    '8.58',
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
    xPed: `PED-${4500 + Number(nItem)}`,
    vIBS: '',
    vCBS: '',
  }),
);

/** Itens da prévia de cima; a miniatura da folha usa todos. */
const ITENS_TOPO = 8;

/** Texto fictício nas anotações da prévia, só na primeira linha. */
const TEXTO_PREVIA_ANOTACAO = 'Conferido';

/** Anotações de exemplo: o texto fictício na primeira anotação marcada. */
function anotacoesExemplo(c: ColunaItem[]): Anotacoes {
  const primeira = c.find((x) => x.visivel && x.anotacao);
  return new Map(
    primeira
      ? [
          [
            primeira.id,
            new Map([[ITENS_PREVIA[0].nItem, TEXTO_PREVIA_ANOTACAO]]),
          ],
        ]
      : [],
  );
}

let dialogo: HTMLDialogElement | null = null;
/** Atualiza o painel aberto com perfis que mudaram em outra janela. */
let atualizarAberto: ((estado: EstadoPerfis) => void) | null = null;

/** true enquanto o painel está aberto. */
export function editorAberto(): boolean {
  return dialogo?.open === true;
}

/**
 * Perfis mudaram em outra janela: o painel aberto mostra a lista nova; se o
 * rascunho não tinha mudanças, passa a mostrar a configuração nova também.
 */
export function atualizarEditor(estado: EstadoPerfis): void {
  atualizarAberto?.(estado);
}

export function abrirEditorColunas(
  estadoInicial: EstadoPerfis,
  acoes: AcoesEditor,
  /** Abre já com a lista de perfis (Trocar perfil) à mostra. */
  nosPerfis = false,
): void {
  if (editorAberto()) return;
  let estado = estadoInicial;
  let rascunho: ConfigConferencia = structuredClone(estado.config);
  let ocupado = false;
  /** O rascunho tem mudanças ainda não aplicadas no perfil ativo. */
  const mudou = () =>
    JSON.stringify(rascunho) !== JSON.stringify(estado.config);

  // ---------- perfis: bloco "Perfil ativo" e a lista do Trocar perfil ----------
  const perfilAtivoEl = el('strong', 'perfil-ativo__nome');
  const btnTrocar = botao(
    'botao botao--claro perfil-ativo__trocar',
    icone('M7 7h12l-3-3', 'M17 17H5l3 3'),
    el('span', '', 'Trocar perfil'),
    icone(...ICONES.setaBaixo),
  );
  btnTrocar.setAttribute('aria-haspopup', 'true');
  btnTrocar.setAttribute('aria-expanded', 'false');
  btnTrocar.setAttribute('aria-controls', 'menu-perfis');
  const listaPerfis = el('ul', 'perfis-menu__lista');
  listaPerfis.setAttribute('aria-label', 'Perfis');
  const btnNovoPerfil = botao(
    'perfis-menu__acao',
    icone(...ICONES.mais),
    el('span', '', 'Novo perfil'),
  );
  const btnImportar = botao(
    'perfis-menu__acao',
    icone(...ICONES.salvar),
    el('span', '', 'Importar'),
  );
  const btnExportar = botao(
    'perfis-menu__acao',
    icone(...ICONES.enviar),
    el('span', '', 'Exportar perfil ativo'),
  );
  const menuPerfis = el(
    'div',
    'perfis-menu',
    listaPerfis,
    el('div', 'perfis-menu__acoes', btnNovoPerfil, btnImportar, btnExportar),
  );
  menuPerfis.id = 'menu-perfis';
  menuPerfis.hidden = true;
  /** Aviso curto dentro do painel ("Perfil <nome> ativo"), que some sozinho. */
  const avisoPainel = el('div', 'painel__aviso');
  avisoPainel.setAttribute('role', 'status');
  avisoPainel.hidden = true;

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
    icone(...ICONES.mais),
    el('span', '', 'Criar'),
  );
  const previa = el('div', 'previa');
  const miniatura = el('div', 'painel__miniatura');
  // Orientação da Conferência no PDF e na impressão (botões lado a lado, como
  // o seletor Conferência | DANFE), e se a tabela cabe numa folha.
  const rotuloOrientacao = el(
    'span',
    'painel__folha-rotulo',
    'Orientação da folha',
  );
  rotuloOrientacao.id = 'rotulo-orientacao';
  const botoesOrientacao = ORIENTACOES_CONFIG.map((o) => {
    const b = botao('seletor__opcao', ROTULO_ORIENTACAO[o]);
    b.dataset.orientacao = o;
    b.addEventListener('click', () => {
      if (rascunho.orientacao === o) return;
      rascunho.orientacao = o;
      desenharIndicador();
    });
    return b;
  });
  const orientacao = el(
    'div',
    'seletor painel__orientacao',
    ...botoesOrientacao,
  );
  orientacao.setAttribute('role', 'group');
  orientacao.setAttribute('aria-labelledby', rotuloOrientacao.id);
  // Menu da largura das anotações: um só, aberto junto do botão da coluna.
  // Fica na camada de cima (popover) para a rolagem da lista não cortar.
  const menuLargura = el('div', 'menu-largura');
  menuLargura.id = 'menu-largura';
  menuLargura.popover = 'manual';
  menuLargura.setAttribute('role', 'menu');
  let donoMenuLargura: HTMLButtonElement | null = null;
  const indicador = el('p', 'painel__indicador');
  indicador.setAttribute('role', 'status');
  const status = el('p', 'painel__status');
  status.setAttribute('role', 'status');
  const erro = el('p', 'painel__erro');
  erro.setAttribute('role', 'alert');
  erro.hidden = true;

  const btnRestaurar = botao(
    'botao botao--claro botao--pequeno',
    icone(...ICONES.desfazer),
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
      el(
        'div',
        'perfil-ativo',
        el(
          'div',
          'perfil-ativo__textos',
          el('span', 'perfil-ativo__rotulo', 'Perfil ativo'),
          perfilAtivoEl,
        ),
        el('div', 'perfil-ativo__troca', btnTrocar, menuPerfis),
      ),
      titulo,
      el(
        'p',
        'painel__dica',
        'Marque as colunas que aparecem e arraste para mudar a ordem. Vale para todas as notas, na tela, na impressão e no PDF, e fica salvo no perfil ativo.',
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
        el('div', 'painel__folha', rotuloOrientacao, orientacao, indicador),
        // Prévia das colunas e folha lado a lado; com o painel estreito, uma
        // embaixo da outra (app.css, container query).
        el('div', 'painel__visoes', comSetasDeRolagem(previa), miniatura),
      ),
    ),
    erro,
    el(
      'footer',
      'painel__rodape',
      el('div', 'painel__grupo', btnRestaurar, status),
      el('div', 'painel__grupo', btnCancelar, btnAplicar),
    ),
    avisoPainel,
    menuLargura,
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
      const remover = botao('colunas-lista__remover', icone(...ICONES.fechar));
      remover.setAttribute('aria-label', `Remover a anotação ${c.rotulo}`);
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
   * Largura da caixa de uma coluna de anotação: Automática, Estreita, Média
   * ou Larga. Botão que abre o menu de opções (só as colunas de anotação têm).
   */
  function seletorLargura(c: ColunaItem): HTMLButtonElement {
    const atual = c.largura ?? 'automatica';
    const b = botao(
      'colunas-lista__largura',
      el('span', '', ROTULO_LARGURA[atual]),
      icone(...ICONES.setaBaixo),
    );
    b.setAttribute('aria-haspopup', 'menu');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', menuLargura.id);
    b.setAttribute(
      'aria-label',
      `Largura da coluna ${c.rotulo}: ${ROTULO_LARGURA[atual]}`,
    );
    b.addEventListener('click', () => {
      if (donoMenuLargura === b) fecharMenuLargura();
      else abrirMenuLargura(b, c);
    });
    return b;
  }

  /** Abre o menu de largura embaixo do botão `b`, com o foco na marcada. */
  function abrirMenuLargura(b: HTMLButtonElement, c: ColunaItem): void {
    fecharMenuLargura();
    const cfg = rascunho.colunas.find((x) => x.id === c.id);
    const atual = cfg?.largura ?? 'automatica';
    menuLargura.setAttribute('aria-label', `Largura da coluna ${c.rotulo}`);
    menuLargura.replaceChildren(
      ...LARGURAS_ANOTACAO.map((l) => {
        const o = botao(
          'perfil-rapido__opcao',
          el('span', 'perfil-rapido__marca', l === atual ? '✓' : ''),
          el('span', 'perfil-rapido__texto', ROTULO_LARGURA[l]),
        );
        o.setAttribute('role', 'menuitemradio');
        o.setAttribute('aria-checked', String(l === atual));
        o.addEventListener('click', () => escolherLargura(b, c, l));
        return o;
      }),
    );
    donoMenuLargura = b;
    b.setAttribute('aria-expanded', 'true');
    menuLargura.showPopover();
    // Embaixo do botão, alinhado pela direita dele.
    const r = b.getBoundingClientRect();
    menuLargura.style.top = `${r.bottom}px`;
    menuLargura.style.left = `${Math.max(0, r.right - menuLargura.offsetWidth)}px`;
    (
      menuLargura.querySelector<HTMLElement>('[aria-checked="true"]') ??
      menuLargura.querySelector<HTMLElement>('button')
    )?.focus();
  }

  function escolherLargura(
    b: HTMLButtonElement,
    c: ColunaItem,
    l: LarguraAnotacao,
  ): void {
    const cfg = rascunho.colunas.find((x) => x.id === c.id);
    if (cfg) cfg.largura = l;
    fecharMenuLargura();
    // Só o botão é trocado (com o nome novo), para o foco voltar a ele.
    const novo = seletorLargura({ ...c, largura: l });
    b.replaceWith(novo);
    novo.focus();
    desenharPrevia();
  }

  function fecharMenuLargura(focarBotao = false): void {
    const dono = donoMenuLargura;
    if (!dono) return;
    donoMenuLargura = null;
    dono.setAttribute('aria-expanded', 'false');
    menuLargura.hidePopover();
    if (focarBotao) dono.focus();
  }

  // O menu fica no fim do painel: ao fechar (Esc ou Tab) o foco volta ao
  // botão, e o Tab segue dali.
  menuLargura.addEventListener('keydown', (e) =>
    navegarMenu(
      e,
      [...menuLargura.querySelectorAll<HTMLElement>('button')],
      () => fecharMenuLargura(true),
    ),
  );

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
          icone(...ICONES.mais),
          el('span', '', t),
        );
        b.disabled = rascunho.anotacoes.some((a) => a.id === idDaAnotacao(t));
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
      ...ITENS_PREVIA.slice(0, ITENS_TOPO).map((i, n) =>
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
   * "Cabe em retrato", "Cabe em paisagem" ou "Não cabe numa folha", e a
   * miniatura da folha, medidos com o rascunho (colunas, larguras,
   * orientação) e os itens da nota aberta (ou os de exemplo).
   */
  function desenharIndicador(): void {
    for (const b of botoesOrientacao)
      b.setAttribute(
        'aria-pressed',
        String(b.dataset.orientacao === rascunho.orientacao),
      );
    let medida: { plano: PlanoFolha; daNota: boolean } | null = null;
    let tabelaFolha: HTMLTableElement | null = null;
    const exemplo = anotacoesExemplo(colunas());
    try {
      if (rascunho.colunas.some((c) => c.visivel)) {
        medida = acoes.plano(rascunho, ITENS_PREVIA, exemplo);
        tabelaFolha = acoes.tabelaFolha(rascunho, ITENS_PREVIA, exemplo);
      }
    } catch (e) {
      console.error(e);
    }
    indicador.hidden = medida === null;
    if (!medida || !tabelaFolha) {
      miniatura.replaceChildren();
      return;
    }
    const { plano, daNota } = medida;
    indicador.textContent = descreverPlano(plano);
    indicador.dataset.cabe = String(plano.partes.length === 1);
    miniatura.replaceChildren(desenharMiniatura(tabelaFolha, plano, daNota));
  }

  function desenharPerfis(): void {
    perfilAtivoEl.textContent = estado.nomeAtivo;
    listaPerfis.replaceChildren(...estado.lista.map(linhaPerfil));
  }

  /**
   * Uma linha da lista: o nome (o ativo marcado e em destaque; clicar noutro
   * ativa), o lápis para renomear na própria linha e a lixeira para excluir.
   */
  function linhaPerfil(p: { id: string; nome: string }): HTMLLIElement {
    const ativo = p.id === estado.ativo;
    const nome = botao(
      'perfis-menu__nome',
      el('span', 'perfis-menu__marca', ativo ? '\u2713' : ''),
      el('span', 'perfis-menu__texto', p.nome),
    );
    if (ativo) nome.setAttribute('aria-current', 'true');
    nome.addEventListener('click', () => {
      if (ativo) return;
      fecharMenu();
      void trocarPara(() => acoes.ativar(p.id));
    });
    const lapis = botao(
      'perfis-menu__icone',
      icone('M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'),
    );
    lapis.setAttribute('aria-label', `Renomear o perfil ${p.nome}`);
    const ultimo = estado.lista.length <= 1;
    const lixeira = botao(
      'perfis-menu__icone',
      icone(
        'M5 7h14',
        'M10 11v6',
        'M14 11v6',
        'M7 7l1 13h8l1-13',
        'M9 7V4h6v3',
      ),
    );
    lixeira.setAttribute('aria-label', `Excluir o perfil ${p.nome}`);
    lixeira.disabled = ultimo;
    const li = el(
      'li',
      `perfis-menu__linha${ativo ? ' perfis-menu__linha--ativo' : ''}`,
      nome,
      lapis,
      lixeira,
    );
    lapis.addEventListener('click', () => editarNome(li, p));
    lixeira.addEventListener('click', () => void excluirPerfil(p));
    return li;
  }

  /**
   * Renomear na própria linha: Enter salva, Esc (ou sair do campo) cancela.
   * Nome vazio ou repetido não vale e mostra o motivo embaixo.
   */
  function editarNome(
    li: HTMLLIElement,
    p: { id: string; nome: string },
  ): void {
    if (ocupado) return;
    const campo = el('input', 'perfis-menu__campo');
    campo.type = 'text';
    campo.value = p.nome;
    campo.spellcheck = false;
    campo.setAttribute('aria-label', `Novo nome do perfil ${p.nome}`);
    const erroNome = el('p', 'perfis-menu__erro');
    erroNome.id = `erro-perfil-${p.id}`;
    erroNome.hidden = true;
    campo.setAttribute('aria-describedby', erroNome.id);
    const conferir = (): boolean => {
      const problema = problemaNomePerfil(campo.value, estado.lista, p.id);
      erroNome.textContent = problema ?? '';
      erroNome.hidden = !problema;
      campo.setAttribute('aria-invalid', String(Boolean(problema)));
      return !problema;
    };
    let salvando = false;
    const cancelar = () => {
      if (salvando) return;
      desenharPerfis();
      listaPerfis
        .querySelector<HTMLElement>(
          `[aria-label="Renomear o perfil ${CSS.escape(p.nome)}"]`,
        )
        ?.focus();
    };
    campo.addEventListener('input', conferir);
    campo.addEventListener('blur', cancelar);
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Só cancela a edição: o menu e o painel ficam abertos.
        e.preventDefault();
        e.stopPropagation();
        cancelar();
        return;
      }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!conferir()) return;
      const novo = campo.value.trim();
      if (novo === p.nome) return cancelar();
      salvando = true;
      void comBloqueio(async () => {
        const r = await acoes.renomear(p.id, novo);
        if (r.status === 'erro') return mostrarErro(r.mensagem);
        // O rascunho fica: renomear não muda colunas nem anotações.
        estado = { ...r.estado, config: estado.config };
        status.textContent = `Perfil renomeado para ${novo}.`;
      });
    });
    li.classList.add('perfis-menu__linha--editando');
    li.replaceChildren(campo, erroNome);
    campo.focus();
    campo.select();
  }

  /** Lixeira: confirma e exclui. Excluir o ativo ativa o primeiro da lista. */
  async function excluirPerfil(p: { id: string; nome: string }): Promise<void> {
    if (ocupado || estado.lista.length <= 1) return;
    const ativo = p.id === estado.ativo;
    const r = await perguntar({
      titulo: 'Excluir perfil',
      texto: `Excluir o perfil ${p.nome}? As colunas, anotações extras e orientação dele se perdem; o texto já salvo nos arquivos .psxml não.`,
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar' },
        { rotulo: 'Excluir', valor: 'excluir', principal: true, perigo: true },
      ],
      cancelar: 'cancelar',
    });
    if (r !== 'excluir') return;
    await comBloqueio(async () => {
      const x = await acoes.excluir(p.id);
      if (x.status === 'erro') return mostrarErro(x.mensagem);
      if (ativo) {
        recarregar(x.estado, `Perfil "${p.nome}" excluído.`);
        mostrarAviso(`Perfil ${x.estado.nomeAtivo} ativo`);
      } else {
        estado = { ...x.estado, config: estado.config };
        status.textContent = `Perfil "${p.nome}" excluído.`;
      }
    });
  }

  function abrirMenu(): void {
    desenharPerfis();
    menuPerfis.hidden = false;
    btnTrocar.setAttribute('aria-expanded', 'true');
    // O foco começa no perfil ativo (as setas e o Tab seguem daí).
    (
      listaPerfis.querySelector<HTMLElement>(
        '.perfis-menu__linha--ativo .perfis-menu__nome',
      ) ?? listaPerfis.querySelector<HTMLElement>('.perfis-menu__nome')
    )?.focus();
  }

  function fecharMenu(focarBotao = false): void {
    if (menuPerfis.hidden) return;
    menuPerfis.hidden = true;
    btnTrocar.setAttribute('aria-expanded', 'false');
    if (focarBotao) btnTrocar.focus();
  }

  let temporizadorAviso: number | undefined;
  /** Aviso curto no meio do painel, que some sozinho. */
  function mostrarAviso(texto: string): void {
    window.clearTimeout(temporizadorAviso);
    avisoPainel.textContent = texto;
    avisoPainel.hidden = false;
    temporizadorAviso = window.setTimeout(() => {
      avisoPainel.hidden = true;
    }, 2500);
  }

  function desenhar(): void {
    fecharMenuLargura();
    desenharPerfis();
    lista.replaceChildren(...colunas().map(linha));
    desenharProntas();
    desenharPrevia();
  }

  // ---------- ações ----------

  function fechar(): void {
    fecharMenuLargura();
    d.close();
    d.remove();
    if (dialogo === d) {
      dialogo = null;
      atualizarAberto = null;
    }
  }

  /** Bloqueia os botões durante uma ação (diálogos do Windows, gravação). */
  async function comBloqueio(acao: () => Promise<void>): Promise<void> {
    if (ocupado) return;
    ocupado = true;
    const botoes = [
      btnRestaurar,
      btnCancelar,
      btnAplicar,
      btnTrocar,
      ...menuPerfis.querySelectorAll('button'),
    ];
    const antes = botoes.map((b) => b.disabled);
    for (const b of botoes) b.disabled = true;
    status.textContent = '';
    try {
      await acao();
    } catch (e) {
      mostrarErro('Não foi possível concluir a ação.');
      console.error(e);
    } finally {
      botoes.forEach((b, i) => {
        if (b.isConnected) b.disabled = antes[i];
      });
      desenharPerfis();
      ocupado = false;
    }
  }

  /** Perfis novos (outro ativo, importado, padrão): recarrega o painel. */
  function recarregar(novo: EstadoPerfis, aviso: string): void {
    estado = novo;
    rascunho = structuredClone(novo.config);
    mostrarErro(null);
    status.textContent = aviso;
    desenhar();
  }

  /**
   * Antes de trocar o perfil ativo (outro perfil, perfil novo, excluir o
   * ativo): com mudanças não aplicadas no painel, pergunta se aplica no
   * perfil atual, descarta ou cancela. true = pode trocar.
   */
  async function podeTrocar(): Promise<boolean> {
    if (!mudou()) return true;
    const r = await perguntar({
      titulo: 'Mudanças não aplicadas',
      texto: `As mudanças deste painel ainda não foram aplicadas no perfil ${estado.nomeAtivo}.`,
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar' },
        { rotulo: 'Descartar e trocar', valor: 'descartar' },
        { rotulo: 'Aplicar e trocar', valor: 'aplicar', principal: true },
      ],
      cancelar: 'cancelar',
    });
    if (r === 'cancelar') return false;
    if (r === 'descartar') return true;
    if (!rascunho.colunas.some((c) => c.visivel)) {
      mostrarErro('Deixe pelo menos uma coluna marcada.');
      return false;
    }
    const a = await acoes.aplicar(rascunho);
    if (a.status === 'erro') {
      mostrarErro(a.mensagem);
      return false;
    }
    estado = a.estado;
    return true;
  }

  /** Troca o perfil ativo com `acao` (depois de podeTrocar). */
  async function trocarPara(
    acao: () => Promise<ResultadoPerfis>,
  ): Promise<void> {
    await comBloqueio(async () => {
      mostrarErro(null);
      if (!(await podeTrocar())) return;
      const r = await acao();
      if (r.status === 'ok') {
        recarregar(r.estado, '');
        mostrarAviso(`Perfil ${r.estado.nomeAtivo} ativo`);
      } else mostrarErro(r.mensagem);
    });
  }

  btnTrocar.addEventListener('click', () => {
    if (menuPerfis.hidden) abrirMenu();
    else fecharMenu();
  });
  // Esc no menu fecha só o menu; clicar fora dele também.
  menuPerfis.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    fecharMenu(true);
  });
  d.addEventListener('mousedown', (e) => {
    const alvo = e.target as Node;
    if (!menuPerfis.contains(alvo) && !btnTrocar.contains(alvo)) fecharMenu();
    if (!menuLargura.contains(alvo) && !donoMenuLargura?.contains(alvo))
      fecharMenuLargura();
  });

  btnNovoPerfil.addEventListener('click', () => {
    fecharMenu();
    void (async () => {
      if (ocupado) return;
      const nome = await pedirTexto({
        titulo: 'Novo perfil',
        texto: `O perfil novo começa igual ao perfil ${estado.nomeAtivo} e passa a ser o ativo.`,
        valor: nomeLivre(`${estado.nomeAtivo} (cópia)`, estado.lista),
        rotulo: 'Nome do perfil',
        confirmar: 'Criar',
        problema: (n) => problemaNomePerfil(n, estado.lista),
      });
      if (nome !== null) await trocarPara(() => acoes.criar(nome));
    })();
  });
  atualizarAberto = (novo) => {
    if (ocupado) return;
    if (mudou()) {
      // Mantém o rascunho; só a lista e o nome do ativo mudam.
      estado = { ...novo, config: estado.config };
      desenharPerfis();
    } else recarregar(novo, 'Os perfis foram alterados em outra janela.');
  };

  btnAplicar.addEventListener('click', () => {
    void comBloqueio(async () => {
      if (!rascunho.colunas.some((c) => c.visivel)) {
        mostrarErro('Deixe pelo menos uma coluna marcada.');
        return;
      }
      const r = await acoes.aplicar(rascunho);
      if (r.status === 'erro') mostrarErro(r.mensagem);
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
    fecharMenu();
    void comBloqueio(async () => {
      mostrarErro(null);
      const r = await acoes.exportar();
      if (r.status === 'exportado')
        status.textContent = `Perfil ${estado.nomeAtivo} exportado em ${r.caminho}`;
      else if (r.status === 'erro') mostrarErro(r.mensagem);
    });
  });
  btnImportar.addEventListener('click', () => {
    fecharMenu();
    void comBloqueio(async () => {
      mostrarErro(null);
      const r = await acoes.importar();
      if (r.status === 'ok') {
        // O perfil importado entra na lista; o ativo continua o mesmo (se
        // foi ele o substituído, o painel mostra o conteúdo novo).
        if (
          mudou() &&
          r.estado.ativo === estado.ativo &&
          JSON.stringify(r.estado.config) === JSON.stringify(estado.config)
        ) {
          estado = { ...r.estado, config: estado.config };
          desenharPerfis();
          status.textContent = `Importado como perfil "${r.nome}".`;
        } else recarregar(r.estado, `Importado como perfil "${r.nome}".`);
      } else if (r.status === 'erro') mostrarErro(r.mensagem);
    });
  });
  btnRestaurar.addEventListener('click', () => {
    void comBloqueio(async () => {
      mostrarErro(null);
      const r = await acoes.restaurar();
      if (r.status === 'ok')
        recarregar(
          r.estado,
          `Perfil "${r.estado.nomeAtivo}" voltou ao padrão.`,
        );
      else if (r.status === 'erro') mostrarErro(r.mensagem);
    });
  });

  desenhar();
  document.body.append(d);
  d.showModal();
  if (nosPerfis) abrirMenu();
  else lista.querySelector<HTMLElement>('.colunas-lista__marca')?.focus();
}
