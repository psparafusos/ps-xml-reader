// Monta a tela a partir do objeto Nota. Todo texto vindo do XML entra no DOM
// por textContent, nunca por innerHTML.

// Os estilos são carregados por <link> em index.html, não por import aqui.

import { COLUNAS_ITENS, ID_ANOTACAO, type ColunaItem } from './nfe/colunas';
import { montarCopia } from './nfe/copia';
import { nomeBaseArquivo } from './nfe/nome';
import {
  lerArquivo,
  lerDocumento,
  localizarOriginal,
  NaoEhNfeError,
  type ArquivoLido,
} from './nfe/parser';
import {
  colunasOrdenaveis,
  criterioValido,
  descreverOrdem,
  ORDEM_NOTA,
  ordenarItens,
  type Ordem,
} from './nfe/ordem';
import { lerDanfe, motivoNaoSuportado, type DadosDanfe } from './danfe/dados';
import { montarDanfe } from './danfe/danfe';
import type { Endereco, Item, Nota } from './nfe/tipos';
import * as f from './nfe/formato';

// ---------- utilitários de DOM ----------

type Filho = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe?: string,
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  for (const c of filhos) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c);
  }
  return e;
}

function $(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Elemento #${id} não encontrado`);
  return e;
}

/** Par rótulo/valor. Some (null) quando o valor está vazio. */
function campo(rotulo: string, valor: string, classe = ''): HTMLElement | null {
  if (!valor) return null;
  return el(
    'div',
    `campo ${classe}`.trim(),
    el('dt', 'campo__rotulo', rotulo),
    el('dd', 'campo__valor', valor),
  );
}

/** Lista de campos. Some quando todos estão vazios. */
function campos(...itens: (HTMLElement | null)[]): HTMLElement | null {
  const validos = itens.filter((i): i is HTMLElement => i !== null);
  if (validos.length === 0) return null;
  return el('dl', 'campos', ...validos);
}

/** Seção com título. Some quando não tem conteúdo. */
function secao(
  titulo: string,
  classe: string,
  ...conteudo: Filho[]
): HTMLElement | null {
  const validos = conteudo.filter(
    (c) => c !== null && c !== undefined && c !== false,
  );
  if (validos.length === 0) return null;
  return el(
    'section',
    `secao ${classe}`,
    el('h2', 'secao__titulo', titulo),
    ...validos,
  );
}

function juntar(partes: string[], sep: string): string {
  return partes.filter((p) => p !== '').join(sep);
}

// ---------- descrição de códigos do XML ----------

const MOD_FRETE: Record<string, string> = {
  '0': 'Por conta do remetente (CIF)',
  '1': 'Por conta do destinatário (FOB)',
  '2': 'Por conta de terceiros',
  '3': 'Transporte próprio por conta do remetente',
  '4': 'Transporte próprio por conta do destinatário',
  '9': 'Sem ocorrência de transporte',
};

const TP_NF: Record<string, string> = {
  '0': 'Entrada',
  '1': 'Saída',
};

function codigoDescrito(
  codigo: string,
  tabela: Record<string, string>,
): string {
  if (!codigo) return '';
  const desc = tabela[codigo];
  return desc ? `${codigo}: ${desc}` : codigo;
}

// ---------- seções ----------

function textoEndereco(e: Endereco): string {
  const municipio = juntar([e.xMun, e.UF], '/');
  return juntar(
    [
      juntar([e.xLgr, e.nro], ', '),
      e.xBairro,
      municipio,
      e.CEP ? `CEP ${f.cep(e.CEP)}` : '',
    ],
    ', ',
  );
}

function blocoEmitente(n: Nota): HTMLElement | null {
  const e = n.emitente;
  const conteudo = campos(
    campo('Razão social', e.xNome, 'campo--destaque'),
    campo('Nome fantasia', e.xFant),
    campo('CNPJ', f.cnpj(e.CNPJ)),
    campo('Inscrição estadual', e.IE),
    campo('Endereço', textoEndereco(e.endereco), 'campo--largo'),
    campo('Fone', f.fone(e.endereco.fone)),
  );
  return secao('Emitente', 'secao--parte', conteudo);
}

function blocoDestinatario(n: Nota): HTMLElement | null {
  const d = n.destinatario;
  const conteudo = campos(
    campo('Razão social', d.xNome, 'campo--destaque'),
    campo('CNPJ', f.cnpj(d.CNPJ)),
    campo('CPF', f.cpf(d.CPF)),
    campo('Inscrição estadual', d.IE),
    campo('Endereço', textoEndereco(d.endereco), 'campo--largo'),
    campo('Fone', f.fone(d.endereco.fone)),
  );
  return secao('Destinatário', 'secao--parte', conteudo);
}

/** Ícone de linhas (caminhos SVG), no mesmo traço dos ícones da barra. */
function icone(...caminhos: string[]): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icone');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of caminhos) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/** Ícone de copiar (dois retângulos). */
const iconeCopiar = () => icone('M9 9h11v11H9z', 'M5 15H4V4h11v1');

/** Chave de acesso só com os 44 dígitos, sem espaço. */
function chaveSemEspaco(): string {
  return (aberto?.lido.nota.chave ?? '').replace(/\D/g, '');
}

async function copiar(texto: string, avisoSucesso: AvisoCopia): Promise<void> {
  try {
    const r = await window.psApi.areaTransferencia({
      tipo: 'copiar',
      texto,
      aviso: avisoSucesso,
    });
    if (r.status === 'copiado') mostrarSucesso(r.aviso);
  } catch (erro) {
    mostrarMensagem('Não foi possível copiar.', 'erro');
    console.error(erro);
  }
}

function blocoDadosNota(n: Nota): HTMLElement | null {
  const p = n.protocolo;
  const situacao = juntar([p.cStat, p.xMotivo], ' ');
  const chave = campo(
    'Chave de acesso',
    f.chaveAcesso(n.chave),
    'campo--largo campo--chave',
  );
  // Botão Copiar ao lado da chave: copia os 44 dígitos; a chave continua na
  // tela em blocos de quatro. Some na impressão.
  if (chave) {
    const botao = el(
      'button',
      'botao botao--claro botao--pequeno copiar-chave',
      iconeCopiar(),
      el('span', '', 'Copiar'),
    );
    botao.type = 'button';
    botao.setAttribute('aria-label', 'Copiar chave de acesso');
    botao.addEventListener(
      'click',
      () => void copiar(chaveSemEspaco(), 'Chave copiada'),
    );
    chave.querySelector('.campo__valor')?.append(botao);
  }
  const conteudo = campos(
    campo('Número', n.ide.nNF),
    campo('Série', n.ide.serie),
    campo('Data de emissão', f.dataHora(n.ide.dhEmi)),
    campo('Tipo', codigoDescrito(n.ide.tpNF, TP_NF)),
    campo('Natureza da operação', n.ide.natOp, 'campo--largo'),
    chave,
    campo('Protocolo de autorização', p.nProt),
    campo('Data de autorização', f.dataHora(p.dhRecbto)),
    campo('Situação', situacao, 'campo--largo'),
  );
  return secao('Dados da NF-e', 'secao--dados', conteudo);
}

/** Anotações digitadas na tela, por nItem. Texto vazio não fica guardado. */
const anotacoes = new Map<string, string>();
/** Anotações como estavam no último abrir ou salvar. */
const anotacoesGravadas = new Map<string, string>();
let pendentesInformado = false;

/** true se alguma anotação mudou desde o último abrir ou salvar. */
function haAlteracoes(): boolean {
  if (anotacoes.size !== anotacoesGravadas.size) return true;
  for (const [nItem, texto] of anotacoes) {
    if (anotacoesGravadas.get(nItem) !== texto) return true;
  }
  return false;
}

/** Repassa ao processo principal (que barra o fechamento) só quando muda. */
function atualizarPendentes(): void {
  const pendentes = haAlteracoes();
  if (pendentes === pendentesInformado) return;
  pendentesInformado = pendentes;
  window.psApi.informarPendentes(pendentes);
}

/** O estado atual passa a ser o gravado (depois de abrir ou salvar). */
function marcarGravadas(): void {
  anotacoesGravadas.clear();
  for (const [nItem, texto] of anotacoes) anotacoesGravadas.set(nItem, texto);
  atualizarPendentes();
}

/**
 * Célula de anotação: na tela é um campo de texto; na impressão o campo some
 * e sai o espelho em texto (campos de formulário nem sempre são impressos).
 */
function celulaAnotacao(i: Item, classe: string): HTMLElement {
  const campoTexto = el('input', 'anotacao__campo');
  campoTexto.type = 'text';
  campoTexto.value = anotacoes.get(i.nItem) ?? '';
  campoTexto.setAttribute('aria-label', `Anotação do item ${i.nItem}`);
  const espelho = el('div', 'anotacao__impressao', campoTexto.value);

  campoTexto.addEventListener('input', () => {
    if (campoTexto.value.trim()) anotacoes.set(i.nItem, campoTexto.value);
    else anotacoes.delete(i.nItem);
    espelho.textContent = campoTexto.value;
    atualizarPendentes();
  });

  return el('td', classe, campoTexto, espelho);
}

// ---------- ordem dos itens (modo Conferência) ----------

/** Ordem atual da tabela; vale para a tela, a impressão e o PDF. */
let ordemAtual: Ordem = ORDEM_NOTA;
/** Corpo (tbody) de cada item, por nItem: reordenar só move os nós. */
const corposItens = new Map<string, HTMLTableSectionElement>();
let tabelaItensEl: HTMLTableElement | null = null;
let botaoOrdenar: HTMLButtonElement | null = null;
let menuOrdenar: HTMLElement | null = null;
/** Botão × da barra de ordenação: volta à ordem da nota. */
let limparOrdem: HTMLButtonElement | null = null;

/** Critério do clique no título: a coluna Código ordena como texto. */
function criterioDaColuna(id: string): string {
  return id === 'codigo' ? 'codigo-texto' : id;
}

/** Opções do botão Ordenar, na ordem do menu. */
function opcoesOrdenar(): { rotulo: string; ordem: Ordem }[] {
  const opcoes = [
    { rotulo: 'Ordem da nota', ordem: ORDEM_NOTA },
    {
      rotulo: 'Agrupar por CST',
      ordem: { criterio: 'cst', direcao: 'asc' } as Ordem,
    },
  ];
  for (const c of colunasOrdenaveis()) {
    const variantes =
      c.id === 'codigo'
        ? [
            { criterio: 'codigo-texto', nome: 'Código (como texto)' },
            { criterio: 'codigo-numero', nome: 'Código (como número)' },
          ]
        : [{ criterio: c.id, nome: c.rotulo }];
    for (const v of variantes) {
      opcoes.push({
        rotulo: `${v.nome} crescente`,
        ordem: { criterio: v.criterio, direcao: 'asc' },
      });
      opcoes.push({
        rotulo: `${v.nome} decrescente`,
        ordem: { criterio: v.criterio, direcao: 'desc' },
      });
    }
  }
  return opcoes;
}

const mesmaOrdem = (a: Ordem, b: Ordem) =>
  a.criterio === b.criterio &&
  (a.criterio === 'nota' || a.criterio === 'cst' || a.direcao === b.direcao);

/** Aplica `ordemAtual`: move os tbody, atualiza setas, botão e menu. */
function aplicarOrdem(): void {
  if (!aberto || !tabelaItensEl) return;
  const ordenados = ordenarItens(aberto.lido.nota.itens, ordemAtual, anotacoes);
  for (const i of ordenados) {
    const corpo = corposItens.get(i.nItem);
    if (corpo) tabelaItensEl.append(corpo);
  }
  for (const th of tabelaItensEl.querySelectorAll<HTMLElement>(
    'th[data-ordenavel]',
  )) {
    const ativo =
      criterioDaColuna(th.dataset.coluna ?? '') === ordemAtual.criterio;
    th.setAttribute(
      'aria-sort',
      ativo
        ? ordemAtual.direcao === 'asc'
          ? 'ascending'
          : 'descending'
        : 'none',
    );
  }
  if (botaoOrdenar) mostrarOrdemAtual(botaoOrdenar, limparOrdem);
  for (const op of menuOrdenar?.querySelectorAll<HTMLElement>(
    '[role="menuitemradio"]',
  ) ?? []) {
    const o: Ordem = {
      criterio: op.dataset.criterio ?? '',
      direcao: op.dataset.direcao === 'desc' ? 'desc' : 'asc',
    };
    op.setAttribute('aria-checked', String(mesmaOrdem(o, ordemAtual)));
  }
}

/** Clique no título: crescente, decrescente, ordem da nota. */
function ordenarPelaColuna(id: string): void {
  const criterio = criterioDaColuna(id);
  if (ordemAtual.criterio !== criterio)
    ordemAtual = { criterio, direcao: 'asc' };
  else if (ordemAtual.direcao === 'asc')
    ordemAtual = { criterio, direcao: 'desc' };
  else ordemAtual = ORDEM_NOTA;
  aplicarOrdem();
}

function fecharMenuOrdenar(focarBotao = false): void {
  if (!menuOrdenar || menuOrdenar.hidden) return;
  menuOrdenar.hidden = true;
  botaoOrdenar?.setAttribute('aria-expanded', 'false');
  if (focarBotao) botaoOrdenar?.focus();
}

function abrirMenuOrdenar(): void {
  if (!menuOrdenar) return;
  menuOrdenar.hidden = false;
  botaoOrdenar?.setAttribute('aria-expanded', 'true');
  menuOrdenar.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
}

/**
 * Escolha atual no botão da barra. Fora da ordem da nota ela fica em destaque
 * (fundo amarelo) e aparece o ×, que volta à ordem da nota.
 */
function mostrarOrdemAtual(
  botao: HTMLElement,
  limpar: HTMLButtonElement | null,
): void {
  const foraDaNota = ordemAtual.criterio !== 'nota';
  const atual = botao.querySelector('.ordenar__atual');
  if (atual) {
    atual.textContent = descreverOrdem(ordemAtual);
    atual.classList.toggle('ordenar__atual--destaque', foraDaNota);
  }
  if (limpar) limpar.hidden = !foraDaNota;
}

/**
 * Barra de ordenação acima da tabela, alinhada à esquerda: ícone, "Ordenar
 * por" e a escolha atual, que abre o menu de opções; fora da ordem da nota,
 * o × ao lado. Na miniatura sai só o desenho, sem menu e sem ações.
 */
function controleOrdenar(miniatura = false): HTMLElement {
  const botao = el(
    'button',
    'ordenar__botao',
    icone('M7 4v16', 'M4 7l3-3 3 3', 'M17 20V4', 'M14 17l3 3 3-3'),
    el('span', 'ordenar__rotulo', 'Ordenar por'),
    el('span', 'ordenar__atual'),
    icone('M6 9l6 6 6-6'),
  );
  botao.type = 'button';
  const limpar = el(
    'button',
    'ordenar__limpar',
    icone('M6 6l12 12', 'M18 6L6 18'),
  );
  limpar.type = 'button';
  limpar.setAttribute('aria-label', 'Voltar à ordem da nota');
  limpar.title = 'Voltar à ordem da nota';
  mostrarOrdemAtual(botao, limpar);
  if (miniatura) return el('div', 'ordenar', botao, limpar);
  limparOrdem = limpar;
  limpar.addEventListener('click', () => {
    ordemAtual = ORDEM_NOTA;
    aplicarOrdem();
    // O × some: o foco vai para a escolha, que continua ali.
    botaoOrdenar?.focus();
  });
  botaoOrdenar = botao;
  botaoOrdenar.id = 'btn-ordenar';
  botaoOrdenar.setAttribute('aria-haspopup', 'menu');
  botaoOrdenar.setAttribute('aria-expanded', 'false');
  botaoOrdenar.addEventListener('click', () => {
    if (menuOrdenar?.hidden) abrirMenuOrdenar();
    else fecharMenuOrdenar();
  });

  const itens: HTMLElement[] = [];
  opcoesOrdenar().forEach((op, idx) => {
    if (idx === 2) itens.push(el('hr', 'ordenar__separador'));
    const b = el('button', 'ordenar__opcao', op.rotulo);
    b.type = 'button';
    b.setAttribute('role', 'menuitemradio');
    b.dataset.criterio = op.ordem.criterio;
    b.dataset.direcao = op.ordem.direcao;
    b.addEventListener('click', () => {
      ordemAtual = op.ordem;
      aplicarOrdem();
      fecharMenuOrdenar(true);
    });
    itens.push(b);
  });
  menuOrdenar = el('div', 'ordenar__menu', ...itens);
  menuOrdenar.id = 'menu-ordenar';
  menuOrdenar.setAttribute('role', 'menu');
  menuOrdenar.setAttribute('aria-label', 'Ordenar itens');
  menuOrdenar.hidden = true;
  menuOrdenar.addEventListener('keydown', (e) => {
    const ops = [
      ...(menuOrdenar?.querySelectorAll<HTMLElement>(
        '[role="menuitemradio"]',
      ) ?? []),
    ];
    const i = ops.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') fecharMenuOrdenar(true);
    else if (e.key === 'ArrowDown') ops[(i + 1) % ops.length]?.focus();
    else if (e.key === 'ArrowUp')
      ops[(i - 1 + ops.length) % ops.length]?.focus();
    else return;
    e.preventDefault();
  });
  return el('div', 'ordenar', botaoOrdenar, limpar, menuOrdenar);
}

/** Itens montados na miniatura: bastam os que enchem a primeira página. */
const ITENS_MINIATURA = 40;

/**
 * Tabela de itens. `miniatura`: só os primeiros itens, sem guardar a tabela no
 * estado da tela (a miniatura é uma cópia inerte).
 */
function tabelaItens(n: Nota, miniatura = false): HTMLElement | null {
  if (n.itens.length === 0) return null;

  const colunas = COLUNAS_ITENS.filter((c) => c.visivel);
  const classe = (c: ColunaItem) =>
    `col-${c.id}${c.alinhamento === 'direita' ? ' num' : ''}`;

  // Título clicável (e por teclado): alterna crescente, decrescente e ordem
  // da nota. aria-sort mostra o estado, e o CSS desenha a seta.
  const thead = el(
    'thead',
    '',
    el(
      'tr',
      '',
      ...colunas.map((c) => {
        const th = el('th', classe(c), c.rotulo);
        th.dataset.ordenavel = '';
        th.dataset.coluna = c.id;
        th.tabIndex = 0;
        th.setAttribute('aria-sort', 'none');
        th.title = 'Ordenar por esta coluna';
        th.addEventListener('click', () => ordenarPelaColuna(c.id));
        th.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            ordenarPelaColuna(c.id);
          }
        });
        return th;
      }),
    ),
  );

  // Cada item em seu próprio tbody: a linha de infAdProd fica junto do item
  // (zebra e quebra de página tratam os dois como um bloco).
  if (!miniatura) corposItens.clear();
  const itens = miniatura ? n.itens.slice(0, ITENS_MINIATURA) : n.itens;
  const corpos = itens.map((i) => {
    const tbody = el(
      'tbody',
      'item',
      el(
        'tr',
        'item__linha',
        ...colunas.map((c) =>
          c.id === ID_ANOTACAO
            ? celulaAnotacao(i, classe(c))
            : el('td', classe(c), c.valor(i)),
        ),
      ),
    );
    if (i.infAdProd) {
      const td = el('td', 'item__adicional', i.infAdProd);
      td.colSpan = colunas.length;
      tbody.append(el('tr', 'item__linha-adicional', td));
    }
    // A anotação está dentro do tbody: ao reordenar ela vai junto (nItem).
    tbody.dataset.nItem = i.nItem;
    if (!miniatura) corposItens.set(i.nItem, tbody);
    return tbody;
  });

  const tabela = el('table', 'tabela tabela--itens', thead, ...corpos);
  if (!miniatura) tabelaItensEl = tabela;
  const titulo = `Itens (${n.itens.length})`;
  return secao(
    titulo,
    'secao--itens',
    controleOrdenar(miniatura),
    el('div', 'tabela-rolagem', tabela),
  );
}

const TOTAIS: { rotulo: string; chave: keyof Nota['totais'] }[] = [
  { rotulo: 'Valor dos produtos', chave: 'vProd' },
  { rotulo: 'Desconto', chave: 'vDesc' },
  { rotulo: 'Frete', chave: 'vFrete' },
  { rotulo: 'Seguro', chave: 'vSeg' },
  { rotulo: 'Outras despesas', chave: 'vOutro' },
  { rotulo: 'IPI', chave: 'vIPI' },
  { rotulo: 'ICMS', chave: 'vICMS' },
  { rotulo: 'ICMS ST', chave: 'vST' },
  { rotulo: 'Valor total da nota', chave: 'vNF' },
];

function blocoTotais(n: Nota): HTMLElement | null {
  const itens = TOTAIS.map(({ rotulo, chave }) =>
    campo(
      rotulo,
      f.moeda(n.totais[chave]),
      chave === 'vNF' ? 'campo--total' : 'num',
    ),
  );
  const conteudo = itens.some((i) => i !== null)
    ? el('dl', 'totais', ...itens)
    : null;
  return secao('Totais', 'secao--totais', conteudo);
}

function tabelaSimples(
  cabecalho: { titulo: string; num?: boolean }[],
  linhas: string[][],
): HTMLElement {
  return el(
    'table',
    'tabela',
    el(
      'thead',
      '',
      el(
        'tr',
        '',
        ...cabecalho.map((c) => el('th', c.num ? 'num' : '', c.titulo)),
      ),
    ),
    el(
      'tbody',
      '',
      ...linhas.map((l) =>
        el(
          'tr',
          '',
          ...l.map((v, idx) => el('td', cabecalho[idx].num ? 'num' : '', v)),
        ),
      ),
    ),
  );
}

function blocoTransporte(n: Nota): HTMLElement | null {
  const t = n.transporte;
  const dados = campos(
    campo(
      'Modalidade do frete',
      codigoDescrito(t.modFrete, MOD_FRETE),
      'campo--largo',
    ),
    campo('Transportadora', t.transportadoraNome, 'campo--largo'),
    campo('CNPJ da transportadora', f.cnpj(t.transportadoraCNPJ)),
  );

  const volumes = t.volumes
    .map((v) => [
      f.quantidade(v.qVol),
      v.esp,
      f.quantidade(v.pesoB),
      f.quantidade(v.pesoL),
    ])
    .filter((l) => l.some((c) => c !== ''));
  const tabela =
    volumes.length > 0
      ? tabelaSimples(
          [
            { titulo: 'Volumes', num: true },
            { titulo: 'Espécie' },
            { titulo: 'Peso bruto (kg)', num: true },
            { titulo: 'Peso líquido (kg)', num: true },
          ],
          volumes,
        )
      : null;

  return secao('Transporte', 'secao--transporte', dados, tabela);
}

function blocoDuplicatas(n: Nota): HTMLElement | null {
  const linhas = n.duplicatas
    .map((d) => [d.nDup, f.data(d.dVenc), f.moeda(d.vDup)])
    .filter((l) => l.some((c) => c !== ''));
  if (linhas.length === 0) return null;
  return secao(
    'Duplicatas',
    'secao--duplicatas',
    tabelaSimples(
      [
        { titulo: 'Número' },
        { titulo: 'Vencimento' },
        { titulo: 'Valor', num: true },
      ],
      linhas,
    ),
  );
}

function blocoDadosAdicionais(n: Nota): HTMLElement | null {
  const partes = n.infAdic.infCpl
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  const lista =
    partes.length > 0
      ? el('ul', 'lista-adicional', ...partes.map((p) => el('li', '', p)))
      : null;

  const obs = n.infAdic.obsCont
    .map((o) => [o.xCampo, o.xTexto])
    .filter((l) => l.some((c) => c !== ''));
  const tabela =
    obs.length > 0
      ? tabelaSimples([{ titulo: 'Campo' }, { titulo: 'Texto' }], obs)
      : null;

  return secao('Dados adicionais', 'secao--adicionais', lista, tabela);
}

// ---------- estado da tela ----------

const vazio = $('vazio');
const areaSoltar = $('area-soltar');
const modo = $('modo');
const modoArquivo = $('modo-arquivo');
const modoFornecedor = $('modo-fornecedor');
const modoNumero = $('modo-numero');
const modoResumo = $('modo-resumo');
const miniConferencia = $('mini-conferencia');
const miniDanfe = $('mini-danfe');
const danfeDescricao = $('danfe-descricao');
const barra = $('barra');
const barraFornecedor = $('barra-fornecedor');
const barraNota = $('barra-nota');
const barraCopia = $('barra-copia');
const notaEl = $('nota');
const danfeEl = $('danfe');
const mensagem = $('mensagem');
const mensagemTexto = $('mensagem-texto');
const rodapeGerado = $('rodape-gerado');
const rodapeCopia = $('rodape-copia');
const btnAbrir = $('btn-abrir') as HTMLButtonElement;
const btnAbrirOutro = $('btn-abrir-outro') as HTMLButtonElement;
const btnConferencia = $('btn-conferencia') as HTMLButtonElement;
const btnDanfe = $('btn-danfe') as HTMLButtonElement;
const btnInicio = $('btn-inicio') as HTMLButtonElement;
const btnModoConferencia = $('btn-modo-conferencia') as HTMLButtonElement;
const btnModoDanfe = $('btn-modo-danfe') as HTMLButtonElement;
const btnImprimir = $('btn-imprimir') as HTMLButtonElement;
const btnSalvar = $('btn-salvar') as HTMLButtonElement;
const btnSalvarTexto = $('btn-salvar-texto');
const aviso = $('aviso');
const avisoTexto = $('aviso-texto');
const avisoArquivo = $('aviso-arquivo');
const avisoNome = $('aviso-nome');
const avisoTipos = $('aviso-tipos');
const btnZoom = $('btn-zoom') as HTMLButtonElement;
const btnZoomValor = $('btn-zoom-valor');
const botoesPasta = [
  $('btn-pasta') as HTMLButtonElement,
  $('btn-pasta-barra') as HTMLButtonElement,
];
const botoesAbrirPasta = [
  $('btn-abrir-pasta') as HTMLButtonElement,
  $('btn-abrir-pasta-barra') as HTMLButtonElement,
];

/** Arquivo aberto: o texto fica guardado para montar a cópia editada. */
let aberto: { nome: string; texto: string; lido: ArquivoLido } | null = null;
let pastaDestino: string | null = null;

/** Erro: aviso vermelho fixo na janela, que fica até a pessoa fechar. */
function mostrarMensagem(texto: string, tipo: 'erro'): void {
  mensagemTexto.textContent = texto;
  mensagem.dataset.tipo = tipo;
  mensagem.hidden = false;
}

let temporizadorAviso: number | undefined;

/** Duração dos avisos de sucesso: cópia, e salvo (que tem o nome para ler). */
const DURACAO_AVISO_MS = 1500;
const DURACAO_AVISO_SALVO_MS = 2500;

/**
 * Sucesso: aviso pequeno no centro da janela ("Salvo", "Copiado"...), que some
 * sozinho. Fica numa região aria-live, então o leitor de tela anuncia o texto.
 * Não pega cliques (pointer-events: none no CSS). `arquivo`: nome do arquivo
 * salvo, numa linha acima, e os tipos gravados em letra menor.
 */
function mostrarSucesso(
  texto: string,
  arquivo?: { nome: string; tipos?: string },
): void {
  window.clearTimeout(temporizadorAviso);
  aviso.hidden = true;
  avisoTexto.textContent = texto;
  avisoArquivo.hidden = !arquivo;
  avisoNome.textContent = arquivo ? encurtarNoMeio(arquivo.nome) : '';
  avisoNome.title = arquivo?.nome ?? '';
  avisoTipos.textContent = arquivo?.tipos ?? '';
  avisoTipos.hidden = !arquivo?.tipos;
  const duracao = arquivo ? DURACAO_AVISO_SALVO_MS : DURACAO_AVISO_MS;
  aviso.style.setProperty('--aviso-duracao', `${duracao}ms`);
  // Reinicia a animação mesmo com dois avisos seguidos.
  void aviso.offsetWidth;
  aviso.hidden = false;
  temporizadorAviso = window.setTimeout(() => {
    aviso.hidden = true;
  }, duracao);
}

/** Nome maior que isto é encurtado no meio, com reticências. */
const LIMITE_NOME_AVISO = 40;

/** "CISER_NF2330596_Conferencia.pdf" fica inteiro; nome longo vira "início…fim". */
function encurtarNoMeio(nome: string): string {
  if (nome.length <= LIMITE_NOME_AVISO) return nome;
  const fim = Math.floor((LIMITE_NOME_AVISO - 1) / 2);
  const inicio = LIMITE_NOME_AVISO - 1 - fim;
  return `${nome.slice(0, inicio)}…${nome.slice(-fim)}`;
}

/** Último trecho de um caminho do Windows. */
const nomeDoCaminho = (caminho: string) => caminho.split(/[\\/]/).pop() ?? '';

function esconderMensagem(): void {
  mensagem.hidden = true;
  mensagemTexto.textContent = '';
}

function textoNumeroSerie(n: Nota): string {
  const partes = ['NF-e'];
  if (n.ide.nNF) partes.push(`nº ${n.ide.nNF}`);
  if (n.ide.serie) partes.push(`série ${n.ide.serie}`);
  return partes.join(' ');
}

/** Modo da tela da nota. Salvar e imprimir seguem o modo. */
let modoAtual: ModoImpressao = 'conferencia';
/** A conferência já foi montada para o arquivo aberto. */
let conferenciaMontada = false;
/** O DANFE já foi montado para o arquivo aberto. */
let danfeMontado = false;

/** Mostra só uma das telas: inicial, escolha de modo, conferência ou DANFE. */
function mostrarTela(tela: 'vazio' | 'modo' | 'nota' | 'danfe'): void {
  vazio.hidden = tela !== 'vazio';
  modo.hidden = tela !== 'modo';
  barra.hidden = tela !== 'nota' && tela !== 'danfe';
  notaEl.hidden = tela !== 'nota';
  danfeEl.hidden = tela !== 'danfe';
  if (tela === 'nota' || tela === 'danfe') {
    modoAtual = tela === 'danfe' ? 'danfe' : 'conferencia';
    document.body.dataset.modo = modoAtual;
    // Seletor de duas posições: aria-pressed marca a opção ativa.
    btnModoConferencia.setAttribute(
      'aria-pressed',
      String(modoAtual === 'conferencia'),
    );
    btnModoDanfe.setAttribute('aria-pressed', String(modoAtual === 'danfe'));
  }
  window.scrollTo(0, 0);
  aplicarZoom();
}

// ---------- zoom da área de visualização ----------

/**
 * Zoom só da área do documento (Conferência e DANFE), por CSS zoom: a barra,
 * a tela inicial e a de escolha não mudam. Os níveis são os do navegador.
 * Cada modo guarda o seu zoom enquanto o app está aberto. Na impressão e no
 * PDF o zoom não vale (print.css), e o DANFE é sempre paginado em 100%.
 */
const NIVEIS_ZOOM = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const zoomPorModo: Record<ModoImpressao, number> = {
  conferencia: 1,
  danfe: 1,
};

/** A área de visualização na tela, ou null (tela inicial ou de escolha). */
function areaZoom(): HTMLElement | null {
  if (!notaEl.hidden) return notaEl;
  if (!danfeEl.hidden) return danfeEl;
  return null;
}

/** Aplica o zoom de cada modo e mostra o botão de restaurar fora de 100%. */
function aplicarZoom(): void {
  notaEl.style.zoom = String(zoomPorModo.conferencia);
  danfeEl.style.zoom = String(zoomPorModo.danfe);
  const z = zoomPorModo[modoAtual];
  btnZoom.hidden = areaZoom() === null || z === 1;
  const pct = `${Math.round(z * 100)}%`;
  btnZoomValor.textContent = pct;
  btnZoom.setAttribute('aria-label', `Zoom em ${pct}. Restaurar 100%`);
  btnZoom.title = 'Restaurar o tamanho normal (Ctrl+0)';
}

/** passo 1: próximo nível; -1: anterior; 0: volta a 100%. */
function mudarZoom(passo: -1 | 0 | 1): void {
  if (!areaZoom()) return;
  const atual = zoomPorModo[modoAtual];
  let novo = 1;
  if (passo === 1) novo = NIVEIS_ZOOM.find((n) => n > atual + 1e-9) ?? atual;
  else if (passo === -1)
    novo = [...NIVEIS_ZOOM].reverse().find((n) => n < atual - 1e-9) ?? atual;
  if (novo === atual) return;
  // Mantém mais ou menos o mesmo trecho do documento no alto da tela.
  const y = window.scrollY;
  zoomPorModo[modoAtual] = novo;
  aplicarZoom();
  window.scrollTo(window.scrollX, (y * novo) / atual);
}

/** Roda do mouse (e pinça do touchpad) com Ctrl: um nível a cada "dente". */
const DELTA_POR_NIVEL = 50;
let deltaAcumulado = 0;

window.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (!areaZoom()) return;
    deltaAcumulado += e.deltaY;
    if (Math.abs(deltaAcumulado) < DELTA_POR_NIVEL) return;
    mudarZoom(deltaAcumulado < 0 ? 1 : -1);
    deltaAcumulado = 0;
  },
  { passive: false },
);

/** Mostra a conferência; monta a tela só na primeira vez (guarda o digitado). */
function mostrarConferencia(): void {
  if (!conferenciaMontada) exibirNota();
  else mostrarTela('nota');
}

/** Preenche a barra com os dados da nota (iguais nos dois modos). */
function preencherBarra(n: Nota): void {
  barraFornecedor.textContent = n.emitente.xNome;
  barraNota.textContent = textoNumeroSerie(n);
  // O aviso de cópia editada fica só na barra, nunca no corpo do DANFE.
  barraCopia.hidden = !aberto?.lido.copiaEditada;
  document.title = juntar([textoNumeroSerie(n), n.emitente.xNome], ' | ');
  atualizarSeletorDanfe();
}

/**
 * Cópia editada: o DANFE só sai do XML original. A opção continua visível e
 * focável (aria-disabled, não disabled), com a explicação no texto de ajuda
 * (#dica-danfe), que aparece ao passar o mouse ou com o foco e é a descrição
 * para o leitor de tela.
 */
function atualizarSeletorDanfe(): void {
  if (aberto?.lido.copiaEditada) {
    btnModoDanfe.setAttribute('aria-disabled', 'true');
    btnModoDanfe.setAttribute('aria-describedby', 'dica-danfe');
  } else {
    btnModoDanfe.removeAttribute('aria-disabled');
    btnModoDanfe.removeAttribute('aria-describedby');
  }
}

/**
 * Mostra o DANFE. Usa a nota do XML original. Cópia editada não gera DANFE.
 * Contingência ou modelo diferente de 55: não gera, mostra o motivo e fica
 * onde estava.
 */
function mostrarDanfe(): void {
  if (!aberto || aberto.lido.copiaEditada) return;
  if (danfeMontado) {
    mostrarTela('danfe');
    return;
  }
  const { dados, motivo } = lerDadosDanfe(aberto.texto);
  if (!dados) {
    mostrarMensagem(motivo, 'erro');
    return;
  }
  esconderMensagem();
  preencherBarra(aberto.lido.nota);
  // A montagem mede a altura dos itens já renderizados: a área precisa estar
  // visível antes.
  mostrarTela('danfe');
  try {
    // Paginado sempre em 100%: as medidas não dependem do zoom da tela.
    danfeEl.style.zoom = '1';
    montarDanfe(danfeEl, dados);
    aplicarZoom();
    danfeMontado = true;
  } catch (erro) {
    danfeEl.replaceChildren();
    mostrarMensagem('Não foi possível montar o DANFE.', 'erro');
    console.error(erro);
    mostrarConferencia();
  }
}

/** Dados do DANFE do arquivo aberto, ou o motivo de não gerar. */
function lerDadosDanfe(
  texto: string,
): { dados: DadosDanfe; motivo: null } | { dados: null; motivo: string } {
  try {
    const { original } = localizarOriginal(lerDocumento(texto));
    const dados = lerDanfe(original);
    const motivo = motivoNaoSuportado(dados);
    return motivo ? { dados: null, motivo } : { dados, motivo: null };
  } catch (erro) {
    console.error(erro);
    return { dados: null, motivo: 'Não foi possível montar o DANFE.' };
  }
}

/**
 * Conteúdo da conferência: cabeçalho e seções. `miniatura`: só os primeiros
 * itens, sem mexer no estado da tela.
 */
function conteudoNota(n: Nota, miniatura = false): HTMLElement[] {
  const cabecalho = el(
    'div',
    'cabecalho',
    el('h1', 'cabecalho__titulo', textoNumeroSerie(n)),
    el('div', 'cabecalho__partes', blocoEmitente(n), blocoDestinatario(n)),
    blocoDadosNota(n),
  );
  return [
    cabecalho,
    ...[
      tabelaItens(n, miniatura),
      blocoTotais(n),
      blocoTransporte(n),
      blocoDuplicatas(n),
      blocoDadosAdicionais(n),
    ].filter((s): s is HTMLElement => s !== null),
  ];
}

function exibirNota(): void {
  if (!aberto) return;
  const n = aberto.lido.nota;
  preencherBarra(n);
  rodapeCopia.hidden = !aberto.lido.copiaEditada;

  notaEl.replaceChildren(...conteudoNota(n));

  conferenciaMontada = true;
  aplicarOrdem();
  mostrarTela('nota');
}

// ---------- tela de escolha de modo ----------

/** Largura da página da miniatura da conferência: a da tela (--largura-conteudo). */
const LARGURA_PAGINA_CONFERENCIA = 1200;
/** Folha do DANFE: 210 mm a 96 pixels por polegada. */
const LARGURA_FOLHA_DANFE = (210 / 25.4) * 96;
/** Proporção do A4 (altura sobre largura). */
const PROPORCAO_A4 = 297 / 210;

/**
 * Coloca `pagina` (com largura real `largura`, em pixels) na moldura da
 * miniatura, reduzida para caber na largura dela. A escala acompanha o tamanho
 * da moldura (que muda com a altura da janela).
 */
function encaixarMiniatura(
  moldura: HTMLElement,
  escala: HTMLElement,
  largura: number,
): void {
  moldura.dataset.largura = String(largura);
  ajustarEscala(moldura);
  escala.classList.remove('miniatura__escala--medindo');
}

function ajustarEscala(moldura: HTMLElement): void {
  const largura = Number(moldura.dataset.largura);
  if (largura > 0)
    moldura.style.setProperty(
      '--escala',
      String(moldura.clientWidth / largura),
    );
}

const observadorMiniaturas = new ResizeObserver((entradas) => {
  for (const e of entradas) ajustarEscala(e.target as HTMLElement);
});
observadorMiniaturas.observe(miniConferencia);
observadorMiniaturas.observe(miniDanfe);

/**
 * Nova moldura vazia: o conteúdo é montado em tamanho real (sem escala, para
 * as medições do DANFE valerem) e só depois é reduzido, na mesma tarefa, então
 * nunca aparece grande na tela.
 */
function novaEscala(moldura: HTMLElement, ...classes: string[]): HTMLElement {
  const escala = el(
    'div',
    ['miniatura__escala', 'miniatura__escala--medindo', ...classes].join(' '),
  );
  // Cópia só para ver: sem foco, sem clique, fora do leitor de tela.
  escala.inert = true;
  moldura.replaceChildren(escala);
  return escala;
}

function miniaturaConferencia(n: Nota): void {
  const pagina = novaEscala(miniConferencia, 'nota');
  pagina.style.width = `${LARGURA_PAGINA_CONFERENCIA}px`;
  pagina.style.height = `${LARGURA_PAGINA_CONFERENCIA * PROPORCAO_A4}px`;
  pagina.append(...conteudoNota(n, true));
  encaixarMiniatura(miniConferencia, pagina, LARGURA_PAGINA_CONFERENCIA);
}

function miniaturaDanfe(dados: DadosDanfe): void {
  const pagina = novaEscala(miniDanfe, 'danfe', 'danfe--miniatura');
  pagina.style.width = `${LARGURA_FOLHA_DANFE}px`;
  pagina.style.height = `${LARGURA_FOLHA_DANFE * PROPORCAO_A4}px`;
  try {
    montarDanfe(pagina, dados, { soPrimeiraFolha: true });
  } catch (erro) {
    miniDanfe.replaceChildren();
    console.error(erro);
    return;
  }
  encaixarMiniatura(miniDanfe, pagina, LARGURA_FOLHA_DANFE);
}

/** Cada abertura invalida as miniaturas ainda não geradas da anterior. */
let geracaoMiniaturas = 0;

/**
 * Preenche a tela de escolha com os dados da nota e a mostra. As miniaturas
 * vêm depois do primeiro desenho, uma por tarefa, para a tela aparecer logo.
 */
function mostrarEscolha(arquivo: ArquivoAberto, lido: ArquivoLido): void {
  const n = lido.nota;
  modoFornecedor.textContent = n.emitente.xFant || n.emitente.xNome;
  modoNumero.textContent = textoNumeroSerie(n);
  const qtd = n.itens.length;
  const resumo: [string, string][] = [
    ['Emissão', f.data(n.ide.dhEmi)],
    ['Valor total', f.moeda(n.totais.vNF)],
    ['Itens', `${qtd} ${qtd === 1 ? 'item' : 'itens'}`],
  ];
  modoResumo.replaceChildren(
    ...resumo
      .filter(([, valor]) => valor !== '')
      .map(([rotulo, valor]) =>
        el(
          'span',
          'modo__dado',
          el('span', 'modo__rotulo', rotulo),
          el('strong', 'modo__valor', valor),
        ),
      ),
  );
  modoArquivo.textContent = arquivo.nome;

  miniConferencia.replaceChildren();
  miniDanfe.replaceChildren();
  delete miniConferencia.dataset.largura;
  delete miniDanfe.dataset.largura;
  const { dados, motivo } = lerDadosDanfe(arquivo.texto);
  btnDanfe.disabled = dados === null;
  miniDanfe.hidden = dados === null;
  danfeDescricao.textContent = motivo ?? 'Documento auxiliar, A4 retrato';

  mostrarTela('modo');

  const vez = ++geracaoMiniaturas;
  const valendo = () => vez === geracaoMiniaturas && !modo.hidden;
  requestAnimationFrame(() =>
    setTimeout(() => {
      if (!valendo()) return;
      miniaturaConferencia(n);
      if (!dados) return;
      setTimeout(() => {
        if (valendo()) miniaturaDanfe(dados);
      }, 0);
    }, 0),
  );
}

/**
 * Lê o arquivo. XML da NF-e: vai para a escolha de modo. Cópia editada
 * (.psxml): vai direto para a conferência (o DANFE só sai do XML original).
 */
function carregar(arquivo: ArquivoAberto): void {
  try {
    const lido = lerArquivo(arquivo.texto);
    esconderMensagem();
    aberto = { nome: arquivo.nome, texto: arquivo.texto, lido };
    conferenciaMontada = false;
    danfeMontado = false;
    danfeEl.replaceChildren();
    anotacoes.clear();
    for (const [nItem, texto] of lido.anotacoes) anotacoes.set(nItem, texto);
    marcarGravadas();
    // Ordem gravada na cópia editada; cópia antiga (sem <ordem>) ou critério
    // desconhecido: ordem da nota.
    ordemAtual =
      lido.ordem && criterioValido(lido.ordem.criterio)
        ? lido.ordem
        : ORDEM_NOTA;
    document.title = 'Leitor NF-e PS';
    if (lido.copiaEditada) mostrarConferencia();
    else mostrarEscolha(arquivo, lido);
  } catch (erro) {
    // O processo principal já trocou o arquivo aberto: a nota anterior não
    // pode mais ser salva, então volta para a tela inicial.
    aberto = null;
    conferenciaMontada = false;
    danfeMontado = false;
    danfeEl.replaceChildren();
    anotacoes.clear();
    marcarGravadas();
    notaEl.replaceChildren();
    document.title = 'Leitor NF-e PS';
    mostrarTela('vazio');
    if (erro instanceof NaoEhNfeError) {
      mostrarMensagem(erro.message, 'erro');
    } else {
      mostrarMensagem('Não foi possível ler o arquivo.', 'erro');
      console.error(erro);
    }
  }
}

async function abrir(): Promise<void> {
  if (!(await podeSair())) return;
  try {
    const arquivo = await window.psApi.abrirArquivo();
    if (arquivo !== null) carregar(arquivo);
  } catch (erro) {
    mostrarMensagem('Não foi possível ler o arquivo.', 'erro');
    console.error(erro);
  }
}

// ---------- pasta de destino ----------

const LIMITE_CAMINHO = 40;

/** "C:\Users\fulano\Documents\Notas\2026" -> "C:\…\Notas\2026" */
function abreviarCaminho(caminho: string): string {
  if (caminho.length <= LIMITE_CAMINHO) return caminho;
  const partes = caminho.split('\\').filter((p) => p !== '');
  if (partes.length > 3) {
    const curto = `${partes[0]}\\…\\${partes.slice(-2).join('\\')}`;
    if (curto.length <= LIMITE_CAMINHO) return curto;
  }
  return `…${caminho.slice(-(LIMITE_CAMINHO - 1))}`;
}

function atualizarPasta(caminho: string | null): void {
  pastaDestino = caminho;
  for (const b of botoesPasta) {
    const rotulo = b.querySelector('.botao__caminho');
    if (rotulo) {
      rotulo.textContent = caminho
        ? abreviarCaminho(caminho)
        : 'Nenhuma pasta escolhida';
    }
    b.title = caminho ?? '';
  }
  for (const b of botoesAbrirPasta) {
    b.disabled = !caminho;
    b.title = caminho
      ? 'Abrir a pasta de destino no Explorer'
      : 'Escolha a pasta de destino primeiro';
  }
}

/** Abre a pasta de destino no Explorer; pasta que sumiu mostra o erro. */
async function abrirPastaDestino(): Promise<void> {
  esconderMensagem();
  try {
    const r = await window.psApi.abrirPastaDestino();
    if (r.status === 'erro') mostrarMensagem(r.mensagem, 'erro');
  } catch (erro) {
    mostrarMensagem('Não foi possível abrir a pasta.', 'erro');
    console.error(erro);
  }
}

async function escolherPasta(): Promise<string | null> {
  try {
    const pasta = await window.psApi.escolherPasta();
    if (pasta !== null) atualizarPasta(pasta);
    return pasta;
  } catch (erro) {
    mostrarMensagem('Não foi possível salvar a pasta de destino.', 'erro');
    console.error(erro);
    return null;
  }
}

// ---------- salvar e imprimir ----------

function marcarGeradoEm(): void {
  rodapeGerado.textContent = `Gerado em ${f.agora()}`;
}

/**
 * Durante salvar ou imprimir, ficam indisponíveis as ações que mudariam a tela
 * que vira PDF ou o arquivo aberto: salvar, imprimir, trocar de modo, Início e
 * abrir outro XML. Ao terminar (sucesso, erro ou cancelamento), tudo volta.
 * O Salvar mostra "Salvando..." enquanto grava.
 */
function bloquearAcoes(bloquear: boolean, salvando = false): void {
  for (const b of [
    btnSalvar,
    btnImprimir,
    btnModoConferencia,
    btnModoDanfe,
    btnInicio,
    btnAbrirOutro,
  ]) {
    b.disabled = bloquear;
  }
  btnSalvarTexto.textContent = bloquear && salvando ? 'Salvando...' : 'Salvar';
}

/** Salva conforme o modo: conferência (PDF e cópia) ou DANFE (só o PDF). */
function salvar(): Promise<boolean> {
  return modoAtual === 'danfe' ? salvarDanfe() : salvarConferencia();
}

/** Salva só o PDF do DANFE (<base>_DANFE.pdf). true se gravou. */
async function salvarDanfe(): Promise<boolean> {
  if (!aberto) return false;
  esconderMensagem();
  if (!pastaDestino && !(await escolherPasta())) return false;
  bloquearAcoes(true, true);
  try {
    const r = await window.psApi.salvarDanfe(nomeBaseArquivo(aberto.lido.nota));
    if (r.status === 'salvo') {
      mostrarSucesso('Salvo', { nome: nomeDoCaminho(r.pdf) });
      return true;
    }
    if (r.status === 'erro') mostrarMensagem(r.mensagem, 'erro');
    return false;
  } catch (erro) {
    mostrarMensagem('Não foi possível salvar.', 'erro');
    console.error(erro);
    return false;
  } finally {
    bloquearAcoes(false);
  }
}

/** Salva PDF e cópia editada. true se gravou. */
async function salvarConferencia(): Promise<boolean> {
  if (!aberto) return false;
  esconderMensagem();
  if (!pastaDestino && !(await escolherPasta())) return false;

  let copia: string;
  try {
    copia = montarCopia(aberto.texto, anotacoes, ordemAtual);
  } catch (erro) {
    mostrarMensagem('Não foi possível montar a cópia editada.', 'erro');
    console.error(erro);
    return false;
  }
  const gravadas = new Map(anotacoes);

  marcarGeradoEm();
  bloquearAcoes(true, true);
  try {
    const r = await window.psApi.salvar(
      copia,
      nomeBaseArquivo(aberto.lido.nota),
    );
    if (r.status === 'salvo') {
      // Grava como salvo o que foi para o arquivo, não o que foi digitado
      // enquanto o salvamento acontecia.
      anotacoesGravadas.clear();
      for (const [nItem, texto] of gravadas)
        anotacoesGravadas.set(nItem, texto);
      atualizarPendentes();
      // PDF e cópia têm o mesmo nome base: mostra o nome uma vez só.
      mostrarSucesso('Salvo', {
        nome: nomeDoCaminho(r.pdf).replace(/\.pdf$/i, ''),
        tipos: 'PDF e PSXML',
      });
      return true;
    }
    if (r.status === 'erro') mostrarMensagem(r.mensagem, 'erro');
    return false;
  } catch (erro) {
    mostrarMensagem('Não foi possível salvar.', 'erro');
    console.error(erro);
    return false;
  } finally {
    bloquearAcoes(false);
  }
}

/**
 * Antes de sair da nota (abrir outro arquivo ou fechar a janela): com
 * anotações alteradas, pergunta Salvar, Descartar ou Cancelar. true = pode
 * seguir; false = fica onde está, com as anotações intactas.
 */
async function podeSair(): Promise<boolean> {
  if (!haAlteracoes()) return true;
  let resposta: RespostaAlteracoes;
  try {
    resposta = await window.psApi.perguntarAlteracoes();
  } catch (erro) {
    console.error(erro);
    return false;
  }
  if (resposta === 'descartar') return true;
  if (resposta === 'salvar') {
    // As anotações vão para a cópia editada e o PDF da conferência, que sai
    // da tela: no DANFE, volta para a conferência antes de salvar.
    if (modoAtual === 'danfe') mostrarConferencia();
    return salvarConferencia();
  }
  return false;
}

async function imprimir(): Promise<void> {
  if (!aberto) return;
  esconderMensagem();
  marcarGeradoEm();
  bloquearAcoes(true);
  try {
    const r = await window.psApi.imprimir(modoAtual);
    if (r.status === 'erro') mostrarMensagem(r.mensagem, 'erro');
  } catch (erro) {
    mostrarMensagem('Não foi possível imprimir.', 'erro');
    console.error(erro);
  } finally {
    bloquearAcoes(false);
  }
}

// ---------- início ----------

/**
 * Volta para a tela inicial. Com anotação não salva, faz a mesma pergunta
 * Salvar / Descartar / Cancelar de abrir outro arquivo.
 */
async function irParaInicio(): Promise<void> {
  if (!(await podeSair())) return;
  aberto = null;
  conferenciaMontada = false;
  danfeMontado = false;
  danfeEl.replaceChildren();
  notaEl.replaceChildren();
  miniConferencia.replaceChildren();
  miniDanfe.replaceChildren();
  tabelaItensEl = null;
  corposItens.clear();
  ordemAtual = ORDEM_NOTA;
  anotacoes.clear();
  marcarGravadas();
  esconderMensagem();
  document.title = 'Leitor NF-e PS';
  mostrarTela('vazio');
}

// ---------- menu do botão direito ----------

/**
 * Monta o pedido de menu conforme o lugar do clique e pede ao processo
 * principal para mostrar (ele escreve na área de transferência):
 * - caixa de texto: Recortar, Copiar, Colar, Selecionar tudo;
 * - texto selecionado: Copiar;
 * - célula da tabela de itens: "Copiar <coluna>" e "Copiar linha";
 * - chave de acesso (conferência e DANFE): "Copiar chave".
 */
async function menuContexto(e: MouseEvent): Promise<void> {
  e.preventDefault();
  const alvo = e.target instanceof Element ? e.target : null;
  if (!alvo) return;

  const campoTexto = alvo.closest('input, textarea') as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;
  const editavel =
    campoTexto !== null && !campoTexto.readOnly && !campoTexto.disabled;
  const selecao = campoTexto
    ? campoTexto.value.slice(
        campoTexto.selectionStart ?? 0,
        campoTexto.selectionEnd ?? 0,
      )
    : (window.getSelection()?.toString() ?? '');

  const itens: ItemMenuCopia[] = [];
  if (aberto && alvo.closest('.campo--chave, .cab__chave-valor')) {
    itens.push({
      rotulo: 'Copiar chave',
      texto: chaveSemEspaco(),
      aviso: 'Chave copiada',
    });
  }
  const linha = alvo.closest('#nota .tabela--itens tr.item__linha');
  const celula = alvo.closest(
    '#nota .tabela--itens tr.item__linha > td',
  ) as HTMLTableCellElement | null;
  if (linha && celula && tabelaItensEl) {
    const titulos = [...tabelaItensEl.querySelectorAll('thead th')];
    // O valor como aparece na tela; na anotação, o texto digitado.
    const valor = (td: Element) =>
      td.querySelector<HTMLInputElement>('input.anotacao__campo')?.value ??
      td.textContent?.trim() ??
      '';
    const rotulo = (titulos[celula.cellIndex] as HTMLElement | undefined)
      ?.dataset.coluna
      ? (COLUNAS_ITENS.find(
          (c) =>
            c.id === (titulos[celula.cellIndex] as HTMLElement).dataset.coluna,
        )?.rotulo ?? '')
      : '';
    itens.push({
      rotulo: `Copiar ${rotulo}`,
      texto: valor(celula),
      aviso: 'Copiado',
    });
    itens.push({
      rotulo: 'Copiar linha',
      // Separado por tabulação: no Excel, cada campo vai para uma coluna.
      texto: [...linha.children]
        .map((td) => valor(td).replace(/[\t\r\n]+/g, ' '))
        .join('\t'),
      aviso: 'Copiado',
    });
  }
  if (!editavel && !selecao && itens.length === 0) return;

  try {
    const r = await window.psApi.areaTransferencia({
      tipo: 'menu',
      editavel,
      selecao,
      itens,
    });
    if (r.status === 'copiado') mostrarSucesso(r.aviso);
  } catch (erro) {
    mostrarMensagem('Não foi possível copiar.', 'erro');
    console.error(erro);
  }
}

// ---------- atalhos de teclado ----------

/** Botão na tela (sem ancestral escondido) e habilitado. */
const disponivel = (b: HTMLButtonElement) =>
  !b.disabled && b.offsetParent !== null;

/**
 * Ctrl+O abre arquivo, Ctrl+S salva e Ctrl+P imprime: o mesmo que clicar no
 * botão (com as mesmas perguntas e o aviso de impressora de cupom). Botão fora
 * da tela ou desabilitado: o atalho não faz nada. Ctrl+C, Ctrl+V e Ctrl+X
 * não passam por aqui e seguem normais na anotação.
 */
const ATALHOS: Record<string, () => HTMLButtonElement[]> = {
  o: () => [btnAbrir, btnAbrirOutro],
  s: () => [btnSalvar],
  p: () => [btnImprimir],
};

/** Zoom: Ctrl com +, = ou - (também do teclado numérico) e Ctrl+0. */
function passoZoom(e: KeyboardEvent): -1 | 0 | 1 | null {
  if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') return 1;
  if (e.key === '-' || e.code === 'NumpadSubtract') return -1;
  if (e.key === '0' || e.code === 'Numpad0') return 0;
  return null;
}

window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || e.altKey || e.metaKey) return;
  const passo = passoZoom(e);
  if (passo !== null) {
    e.preventDefault();
    mudarZoom(passo);
    return;
  }
  const botoes = !e.shiftKey ? ATALHOS[e.key.toLowerCase()] : undefined;
  if (!botoes) return;
  e.preventDefault();
  if (e.repeat) return;
  botoes().find(disponivel)?.click();
});

// ---------- eventos ----------

btnAbrir.addEventListener('click', () => void abrir());
btnAbrirOutro.addEventListener('click', () => void abrir());
btnConferencia.addEventListener('click', mostrarConferencia);
btnDanfe.addEventListener('click', mostrarDanfe);
btnModoConferencia.addEventListener('click', () => {
  if (modoAtual !== 'conferencia') mostrarConferencia();
});
btnModoDanfe.addEventListener('click', () => {
  if (btnModoDanfe.getAttribute('aria-disabled') === 'true') return;
  if (modoAtual !== 'danfe') mostrarDanfe();
});
btnInicio.addEventListener('click', () => void irParaInicio());
// Menu Ordenar: fecha ao clicar fora dele.
document.addEventListener('mousedown', (e) => {
  const alvo = e.target as Node;
  if (
    menuOrdenar &&
    !menuOrdenar.contains(alvo) &&
    !botaoOrdenar?.contains(alvo)
  )
    fecharMenuOrdenar();
});
window.addEventListener('contextmenu', (e) => void menuContexto(e));
btnImprimir.addEventListener('click', () => void imprimir());
btnSalvar.addEventListener('click', () => void salvar());
window.psApi.aoPedirFechar(() => {
  void podeSair().then((pode) => {
    if (pode) return window.psApi.fecharJanela();
  });
});
// Uma página recarregada começa sem pendências.
window.psApi.informarPendentes(false);
for (const b of botoesPasta) {
  b.addEventListener('click', () => void escolherPasta());
}
for (const b of botoesAbrirPasta) {
  b.addEventListener('click', () => void abrirPastaDestino());
}
$('mensagem-fechar').addEventListener('click', esconderMensagem);
btnZoom.addEventListener('click', () => mudarZoom(0));

window.psApi
  .versao()
  .then((v) => {
    $('versao').textContent = `versão ${v}`;
  })
  .catch((erro: unknown) => console.error(erro));

window.psApi
  .pastaDestino()
  .then(atualizarPasta)
  .catch((erro: unknown) => {
    atualizarPasta(null);
    console.error(erro);
  });

// Arrastar e soltar: aceito na janela toda. Sem preventDefault o Electron
// tentaria abrir o arquivo como página.
let contadorArraste = 0;

window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  contadorArraste++;
  areaSoltar.classList.add('vazio__caixa--ativa');
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('dragleave', () => {
  contadorArraste = Math.max(0, contadorArraste - 1);
  if (contadorArraste === 0) areaSoltar.classList.remove('vazio__caixa--ativa');
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  contadorArraste = 0;
  areaSoltar.classList.remove('vazio__caixa--ativa');
  const arquivo = e.dataTransfer?.files[0];
  if (!arquivo) return;
  const nome = arquivo.name.toLowerCase();
  if (!nome.endsWith('.xml') && !nome.endsWith('.psxml')) {
    mostrarMensagem('Selecione um arquivo .xml ou .psxml.', 'erro');
    return;
  }
  podeSair()
    .then((pode) => (pode ? window.psApi.abrirSolto(arquivo) : null))
    .then((solto) => {
      if (solto) carregar(solto);
    })
    .catch((erro: unknown) => {
      mostrarMensagem('Não foi possível ler o arquivo.', 'erro');
      console.error(erro);
    });
});
