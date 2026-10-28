// Monta a tela a partir do objeto Nota. Todo texto vindo do XML entra no DOM
// por textContent, nunca por innerHTML.

// Os estilos são carregados por <link> em index.html, não por import aqui.

import {
  classeColuna,
  colunasDaConfig,
  ID_ANOTACAO,
  type ColunaItem,
} from './nfe/colunas';
import { configPadrao } from './nfe/config';
import { montarCopia } from './nfe/copia';
import { nomeBaseArquivo, problemaNomeArquivo } from './nfe/nome';
import {
  ROTULO_ORIENTACAO,
  type Orientacao,
  type PlanoFolha,
} from './nfe/folha';
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
import type { Anotacoes, Endereco, Item, Nota } from './nfe/tipos';
import * as f from './nfe/formato';
import {
  abrirEditorColunas,
  atualizarEditor,
  editorAberto,
} from './editorColunas';
import { comSetasDeRolagem, el, icone, type Filho } from './dom';
import { perguntar, pedirNomeCopia } from './dialogos';
import { desmontarFolha, montarFolha, planoDaTabela } from './folhaTabela';

// ---------- utilitários de DOM ----------

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

// ---------- personalização (colunas e anotações extras) ----------

/**
 * Personalização da conferência em uso (src/nfe/config.ts). Começa na padrão
 * e é trocada pela salva logo na abertura do app.
 */
let configAtual: ConfigConferencia = configPadrao();

/** Todas as colunas da tabela de itens, na ordem e visibilidade da configuração. */
const colunasAtuais = (): ColunaItem[] => colunasDaConfig(configAtual);

/**
 * Passa a usar `nova`: a ordem que dependia de uma coluna escondida volta à
 * ordem da nota, e a conferência aberta é montada de novo (as anotações
 * digitadas ficam, inclusive as de colunas escondidas ou removidas).
 */
function aplicarConfig(nova: ConfigConferencia): void {
  configAtual = nova;
  if (!criterioValido(ordemAtual.criterio, colunasAtuais()))
    ordemAtual = ORDEM_NOTA;
  if (!aberto || !conferenciaMontada || notaEl.hidden) {
    conferenciaMontada = false;
    return;
  }
  const y = window.scrollY;
  notaEl.replaceChildren(...conteudoNota(aberto.lido.nota));
  aplicarOrdem();
  window.scrollTo(window.scrollX, y);
}

/** Abre o painel Editar colunas; Aplicar salva e remonta a tabela. */
/**
 * Perfis de configuração (src/nfe/perfis.ts): a lista, o ativo e a
 * configuração dele. Trocam em todas as janelas ao mesmo tempo.
 */
let perfisAtual: EstadoPerfis | null = null;

/** Passa a usar estes perfis: a configuração do ativo vale na tela na hora. */
function aplicarPerfis(estado: EstadoPerfis): void {
  perfisAtual = estado;
  aplicarConfig(estado.config);
}

/** Aplica os perfis de um resultado que deu certo e o devolve. */
function aoGravar<R extends { status: string }>(r: R): R {
  if (r.status === 'ok')
    aplicarPerfis((r as unknown as { estado: EstadoPerfis }).estado);
  return r;
}

/**
 * Importar perfil: lê e valida o arquivo; se o nome já existe, pergunta se
 * substitui o perfil com esse nome ou mantém os dois ("<nome> (2)").
 */
async function importarPerfil(): Promise<
  | { status: 'ok'; estado: EstadoPerfis; nome: string }
  | { status: 'cancelado' }
  | { status: 'erro'; mensagem: string }
> {
  const lido = await window.psApi.importarPerfil();
  if (lido.status !== 'lido') return lido;
  let modo: 'substituir' | 'manter' = 'manter';
  if (lido.existe) {
    const r = await perguntar({
      titulo: 'Perfil com o mesmo nome',
      texto: `Já existe um perfil ${lido.perfil.nome}. Substituir o conteúdo dele pelo do arquivo, ou manter os dois (o importado fica com um número no nome)?`,
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar' },
        { rotulo: 'Manter os dois', valor: 'manter' },
        { rotulo: 'Substituir', valor: 'substituir', principal: true },
      ],
      cancelar: 'cancelar',
    });
    if (r === 'cancelar') return { status: 'cancelado' };
    modo = r;
  }
  const antes = new Set(perfisAtual?.lista.map((p) => p.id));
  const r = aoGravar(await window.psApi.adicionarPerfil(lido.perfil, modo));
  if (r.status === 'erro') return r;
  // O nome com que ficou: o do perfil novo, ou o substituído.
  const novo = r.estado.lista.find((p) => !antes.has(p.id));
  return {
    status: 'ok',
    estado: r.estado,
    nome: novo?.nome ?? lido.perfil.nome,
  };
}

/**
 * Abre o painel Editar colunas com os perfis. Aplicar grava no perfil ativo
 * e avisa "Alterações salvas no perfil <nome>".
 */
async function editarColunas(): Promise<void> {
  const estado = perfisAtual ?? (await window.psApi.perfis());
  abrirEditorColunas(estado, {
    aplicar: async (nova) => {
      const r = aoGravar(await window.psApi.gravarConfigConferencia(nova));
      if (r.status === 'ok')
        mostrarSucesso(`Alterações salvas no perfil ${r.estado.nomeAtivo}`);
      return r;
    },
    ativar: async (id) => aoGravar(await window.psApi.ativarPerfil(id)),
    criar: async (nome) => aoGravar(await window.psApi.criarPerfil(nome)),
    renomear: async (id, nome) =>
      aoGravar(await window.psApi.renomearPerfil(id, nome)),
    excluir: async (id) => aoGravar(await window.psApi.excluirPerfil(id)),
    exportar: () => window.psApi.exportarPerfil(),
    importar: importarPerfil,
    restaurar: async () => aoGravar(await window.psApi.restaurarConfig()),
    plano: planoComConfig,
  });
}

/**
 * Anotações digitadas na tela, por coluna e nItem. Texto vazio não fica
 * guardado. Guarda também as de colunas escondidas ou removidas da
 * configuração: vão de novo para o .psxml e voltam se a coluna voltar.
 */
const anotacoes: Anotacoes = new Map();
/** Anotações como estavam no último abrir ou salvar. */
const anotacoesGravadas: Anotacoes = new Map();
/**
 * Título de cada coluna de anotação lido do .psxml aberto: regrava com o
 * mesmo título uma coluna que não está mais na configuração.
 */
const titulosLidos = new Map<string, string>();
let pendentesInformado = false;

function copiarAnotacoes(origem: Anotacoes, destino: Anotacoes): void {
  destino.clear();
  for (const [id, m] of origem) destino.set(id, new Map(m));
}

/** true se alguma anotação mudou desde o último abrir ou salvar. */
function haAlteracoes(): boolean {
  const ids = new Set([...anotacoes.keys(), ...anotacoesGravadas.keys()]);
  for (const id of ids) {
    const atual = anotacoes.get(id) ?? new Map<string, string>();
    const gravada = anotacoesGravadas.get(id) ?? new Map<string, string>();
    if (atual.size !== gravada.size) return true;
    for (const [nItem, texto] of atual) {
      if (gravada.get(nItem) !== texto) return true;
    }
  }
  return false;
}

/**
 * Título de cada coluna com anotação, para a cópia editada: Anotação
 * primeiro, depois as extras na ordem da configuração e por fim as que só
 * existem no arquivo aberto (com o título lido dele).
 */
function titulosParaCopia(): Map<string, string> {
  const titulos = new Map<string, string>();
  for (const c of colunasAtuais()) if (c.anotacao) titulos.set(c.id, c.rotulo);
  for (const id of anotacoes.keys())
    if (!titulos.has(id)) titulos.set(id, titulosLidos.get(id) ?? id);
  const original = titulos.get(ID_ANOTACAO) ?? 'Anotação';
  titulos.delete(ID_ANOTACAO);
  return new Map([[ID_ANOTACAO, original], ...titulos]);
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
  copiarAnotacoes(anotacoes, anotacoesGravadas);
  atualizarPendentes();
}

/**
 * Célula de anotação (a coluna Anotação ou uma extra): na tela é um campo de
 * texto; na impressão o campo some e sai o espelho em texto (campos de
 * formulário nem sempre são impressos).
 */
function celulaAnotacao(
  i: Item,
  coluna: ColunaItem,
  td: HTMLTableCellElement,
  fonte: Anotacoes = anotacoes,
): HTMLElement {
  const campoTexto = el('input', 'anotacao__campo');
  campoTexto.type = 'text';
  campoTexto.value = fonte.get(coluna.id)?.get(i.nItem) ?? '';
  campoTexto.setAttribute('aria-label', `${coluna.rotulo} do item ${i.nItem}`);
  const espelho = el('div', 'anotacao__impressao', campoTexto.value);

  // Só a tabela da tela grava o que é digitado (as cópias são só para ver).
  if (fonte !== anotacoes) {
    td.append(campoTexto, espelho);
    return td;
  }
  campoTexto.addEventListener('input', () => {
    let daColuna = anotacoes.get(coluna.id);
    if (!daColuna) anotacoes.set(coluna.id, (daColuna = new Map()));
    if (campoTexto.value.trim()) daColuna.set(i.nItem, campoTexto.value);
    else daColuna.delete(i.nItem);
    if (daColuna.size === 0) anotacoes.delete(coluna.id);
    espelho.textContent = campoTexto.value;
    atualizarPendentes();
  });

  td.append(campoTexto, espelho);
  return td;
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
  for (const c of colunasOrdenaveis(colunasAtuais())) {
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
  const ordenados = ordenarItens(
    aberto.lido.nota.itens,
    ordemAtual,
    anotacoes,
    colunasAtuais(),
  );
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
  ordem: Ordem = ordemAtual,
): void {
  const foraDaNota = ordem.criterio !== 'nota';
  const atual = botao.querySelector('.ordenar__atual');
  if (atual) {
    atual.textContent = descreverOrdem(ordem, colunasAtuais());
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
  if (miniatura) {
    mostrarOrdemAtual(botao, limpar, ORDEM_NOTA);
    return el('div', 'ordenar', botao, limpar);
  }
  mostrarOrdemAtual(botao, limpar);
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
  // Na mesma barra, à direita: o painel de colunas.
  const editar = el(
    'button',
    'botao botao--claro botao--pequeno ordenar__editar',
    icone('M4 5h16v14H4z', 'M10 5v14', 'M16 5v14'),
    el('span', '', 'Editar colunas'),
  );
  editar.type = 'button';
  editar.id = 'btn-editar-colunas';
  editar.setAttribute('aria-haspopup', 'dialog');
  editar.addEventListener('click', () => void editarColunas());
  return el('div', 'ordenar', botaoOrdenar, limpar, menuOrdenar, editar);
}

/** Itens montados na miniatura: bastam os que enchem a primeira página. */
const ITENS_MINIATURA = 40;

/**
 * Elemento da tabela de itens com estas colunas e itens. `guardar`: é a
 * tabela da tela (guarda os tbody para reordenar e a própria tabela); sem
 * ele, é uma cópia (miniatura ou medida da folha) que não mexe no estado.
 */
function montarTabelaItens(
  colunasConfig: ColunaItem[],
  itens: Item[],
  guardar: boolean,
  fonte: Anotacoes = anotacoes,
): HTMLTableElement {
  const colunas = colunasConfig.filter((c) => c.visivel);
  const celula = <K extends 'th' | 'td'>(
    tag: K,
    c: ColunaItem,
    ...filhos: Filho[]
  ) => el(tag, classeColuna(c), ...filhos);

  // Título clicável (e por teclado): alterna crescente, decrescente e ordem
  // da nota. aria-sort mostra o estado, e o CSS desenha a seta.
  const thead = el(
    'thead',
    '',
    el(
      'tr',
      '',
      ...colunas.map((c) => {
        const th = celula('th', c, c.rotulo);
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
  if (guardar) corposItens.clear();
  const corpos = itens.map((i) => {
    const tbody = el(
      'tbody',
      'item',
      el(
        'tr',
        'item__linha',
        ...colunas.map((c) =>
          c.anotacao
            ? celulaAnotacao(i, c, celula('td', c), fonte)
            : celula('td', c, c.valor(i)),
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
    if (guardar) corposItens.set(i.nItem, tbody);
    return tbody;
  });

  const tabela = el('table', 'tabela tabela--itens', thead, ...corpos);
  if (guardar) tabelaItensEl = tabela;
  return tabela;
}

/**
 * Como a conferência é montada: a da tela (guarda o estado), a miniatura da
 * escolha (só os primeiros itens) ou a cópia completa para o PDF da escolha.
 * Miniatura e cópia não mexem no estado da tela: anotações vazias e ordem da
 * nota (a escolha é sempre de um XML recém-aberto).
 */
type ModoConteudo = 'tela' | 'miniatura' | 'copia';

/** Seção de itens no modo `modoConteudo`. */
function tabelaItens(
  n: Nota,
  modoConteudo: ModoConteudo = 'tela',
): HTMLElement | null {
  if (n.itens.length === 0) return null;
  const tela = modoConteudo === 'tela';
  const miniatura = !tela;
  const tabela = montarTabelaItens(
    colunasAtuais(),
    modoConteudo === 'miniatura' ? n.itens.slice(0, ITENS_MINIATURA) : n.itens,
    tela,
    tela ? anotacoes : new Map(),
  );
  const titulo = `Itens (${n.itens.length})`;
  return secao(
    titulo,
    'secao--itens',
    controleOrdenar(miniatura),
    // A tabela rola dentro do quadro; setas nas laterais avisam o que ficou
    // escondido (a miniatura é só desenho, sem setas).
    miniatura
      ? el('div', 'tabela-rolagem', tabela)
      : comSetasDeRolagem(el('div', 'tabela-rolagem', tabela)),
  );
}

/**
 * Plano da folha (orientação, fonte, partes) da nota aberta com a
 * configuração `config`: mede uma tabela montada com todos os itens, na
 * ordem atual. null sem nota ou sem itens.
 */
function planoComConfig(config: ConfigConferencia): PlanoFolha | null {
  if (!aberto || aberto.lido.nota.itens.length === 0) return null;
  const tabela = montarTabelaItens(
    colunasDaConfig(config),
    aberto.lido.nota.itens,
    false,
  );
  return planoDaTabela(tabela, config.orientacao);
}

/**
 * Antes de salvar o PDF ou imprimir a Conferência: monta a tabela da folha
 * conforme o plano e, se ela precisar ser dividida em partes, pergunta antes.
 * Devolve a orientação a usar, ou null se a pessoa cancelou. Depois de
 * gravar ou imprimir, chamar desmontarFolha.
 */
async function prepararFolha(
  raiz: HTMLElement = notaEl,
): Promise<Orientacao | null> {
  const secaoItens = raiz.querySelector<HTMLElement>('.secao--itens');
  const tabela = secaoItens?.querySelector<HTMLTableElement>(
    'table.tabela--itens',
  );
  if (!secaoItens || !tabela) return 'retrato';
  const plano = planoDaTabela(tabela, configAtual.orientacao);
  if (plano.partes.length > 1) {
    const nome = ROTULO_ORIENTACAO[plano.orientacao].toLowerCase();
    const r = await perguntar({
      titulo: 'A tabela não cabe numa folha',
      texto: `A tabela de itens não cabe na largura da folha em ${nome}, nem com a fonte em 7 pt. Ela vai sair dividida em ${plano.partes.length} partes, cada uma numa folha, repetindo Nº, Código e Descrição.`,
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar' },
        { rotulo: 'Continuar', valor: 'continuar', principal: true },
      ],
      cancelar: 'cancelar',
    });
    if (r !== 'continuar') return null;
  }
  montarFolha(secaoItens, tabela, plano);
  return plano.orientacao;
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
/** Documento do "Salvar PDF" da tela de escolha (fora da tela). */
const previaEl = $('pdf-previa');
const btnFecharEscolha = $('btn-fechar-escolha') as HTMLButtonElement;
/** Botões Abrir aqui e Nova janela das prévias (escolha por cima da nota). */
const acoesEscolha = [
  ...document.querySelectorAll<HTMLButtonElement>('.modo__acao'),
];
const acoesDanfe = acoesEscolha.filter((b) => b.dataset.modo === 'danfe');
const danfeEl = $('danfe');
const mensagem = $('mensagem');
const mensagemTexto = $('mensagem-texto');
const rodapeGerado = $('rodape-gerado');
const rodapeCopia = $('rodape-copia');
const btnAbrir = $('btn-abrir') as HTMLButtonElement;
const btnAbrirOutro = $('btn-abrir-outro') as HTMLButtonElement;
const btnConferencia = $('btn-conferencia') as HTMLButtonElement;
const btnDanfe = $('btn-danfe') as HTMLButtonElement;
const btnSalvarPreviaConferencia = $(
  'btn-salvar-previa-conferencia',
) as HTMLButtonElement;
const btnSalvarPreviaDanfe = $('btn-salvar-previa-danfe') as HTMLButtonElement;
const btnInicio = $('btn-inicio') as HTMLButtonElement;
const btnModoConferencia = $('btn-modo-conferencia') as HTMLButtonElement;
const btnModoDanfe = $('btn-modo-danfe') as HTMLButtonElement;
const btnImprimir = $('btn-imprimir') as HTMLButtonElement;
const btnSalvar = $('btn-salvar') as HTMLButtonElement;
const btnSalvarTexto = $('btn-salvar-texto');
const btnSalvarMais = $('btn-salvar-mais') as HTMLButtonElement;
const menuSalvar = $('menu-salvar');
const btnSalvarPdf = $('btn-salvar-pdf') as HTMLButtonElement;
const btnSalvarCopia = $('btn-salvar-copia') as HTMLButtonElement;
const aviso = $('aviso');
const avisoTexto = $('aviso-texto');
const avisoArquivo = $('aviso-arquivo');
const avisoNome = $('aviso-nome');
const avisoTipos = $('aviso-tipos');
const avisoPasta = $('aviso-pasta');
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

/**
 * Aviso fixo na janela, que fica até a pessoa fechar: erro em vermelho,
 * informação (por exemplo a pasta desta sessão) em escuro.
 */
function mostrarMensagem(texto: string, tipo: 'erro' | 'info'): void {
  mensagemTexto.textContent = texto;
  mensagem.dataset.tipo = tipo;
  mensagem.hidden = false;
}

let temporizadorAviso: number | undefined;

/**
 * Duração dos avisos de sucesso: cópia, e salvo (que tem o nome e a pasta
 * para ler).
 */
const DURACAO_AVISO_MS = 1500;
const DURACAO_AVISO_SALVO_MS = 3500;

/**
 * Sucesso: aviso pequeno no centro da janela ("Salvo", "Copiado"...), que some
 * sozinho. Fica numa região aria-live, então o leitor de tela anuncia o texto.
 * Não pega cliques (pointer-events: none no CSS). `arquivo`: nome do arquivo
 * salvo, numa linha acima, e em letra menor os tipos gravados e a pasta.
 */
function mostrarSucesso(
  texto: string,
  arquivo?: { nome: string; tipos?: string; pasta?: string },
): void {
  window.clearTimeout(temporizadorAviso);
  aviso.hidden = true;
  avisoTexto.textContent = texto;
  avisoArquivo.hidden = !arquivo;
  avisoNome.textContent = arquivo ? encurtarNoMeio(arquivo.nome) : '';
  avisoNome.title = arquivo?.nome ?? '';
  avisoTipos.textContent = arquivo?.tipos ?? '';
  avisoTipos.hidden = !arquivo?.tipos;
  avisoPasta.textContent = arquivo?.pasta
    ? `em ${abreviarCaminho(arquivo.pasta)}`
    : '';
  avisoPasta.title = arquivo?.pasta ?? '';
  avisoPasta.hidden = !arquivo?.pasta;
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

/** Pasta de um caminho do Windows (tudo antes do último trecho). */
const pastaDoCaminho = (caminho: string) =>
  caminho.replace(/[\\/][^\\/]*$/, '');

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
    if (!areaZoom() || editorAberto()) return;
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
  // O nome do arquivo vem primeiro: depois do Salvar cópia, é o da cópia.
  document.title = juntar(
    [aberto?.nome ?? '', textoNumeroSerie(n), n.emitente.xNome],
    ' | ',
  );
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
 * Conteúdo da conferência: cabeçalho e seções (ver ModoConteudo).
 */
function conteudoNota(
  n: Nota,
  modoConteudo: ModoConteudo = 'tela',
): HTMLElement[] {
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
      tabelaItens(n, modoConteudo),
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
  pagina.append(...conteudoNota(n, 'miniatura'));
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
 * Arquivo mostrado na tela de escolha. `sobreposta`: é um XML aberto com uma
 * nota já na janela; a escolha aparece por cima dela e cada prévia oferece
 * Abrir aqui e Nova janela (o arquivo só passa a ser desta janela no Abrir
 * aqui).
 */
let escolha: {
  arquivo: ArquivoAberto;
  lido: ArquivoLido;
  sobreposta: boolean;
} | null = null;

/**
 * Preenche a tela de escolha com os dados da nota e a mostra. As miniaturas
 * vêm depois do primeiro desenho, uma por tarefa, para a tela aparecer logo.
 */
function mostrarEscolha(
  arquivo: ArquivoAberto,
  lido: ArquivoLido,
  sobreposta = false,
): void {
  escolha = { arquivo, lido, sobreposta };
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
  btnSalvarPreviaDanfe.disabled = dados === null;
  for (const b of acoesDanfe) b.disabled = dados === null;
  miniDanfe.hidden = dados === null;
  danfeDescricao.textContent = motivo ?? 'Documento auxiliar, A4 retrato';

  // Em destaque: Abrir aqui na janela vazia; Nova janela por cima de uma
  // nota (o caminho que não mexe na nota aberta).
  for (const b of acoesEscolha) {
    const destaque = (b.dataset.destino === 'aqui') !== sobreposta;
    b.classList.toggle('botao--principal', destaque);
    b.classList.toggle('botao--claro', !destaque);
  }

  if (sobreposta) {
    // Por cima da nota: a nota, a barra e o estado da janela ficam como estão.
    modo.classList.add('modo--sobreposta');
    modo.hidden = false;
    btnFecharEscolha.focus();
  } else {
    modo.classList.remove('modo--sobreposta');
    mostrarTela('modo');
  }

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

/** Tira a escolha de cima da nota (sem abrir o arquivo). */
function fecharSobreposicao(): void {
  if (!escolha?.sobreposta) return;
  escolha = null;
  ++geracaoMiniaturas;
  modo.hidden = true;
  modo.classList.remove('modo--sobreposta');
  miniConferencia.replaceChildren();
  miniDanfe.replaceChildren();
}

/** Fechar (ou Esc) na escolha por cima da nota: fica na nota. */
function cancelarSobreposicao(): void {
  if (!escolha?.sobreposta || acoesBloqueadas) return;
  fecharSobreposicao();
  window.psApi
    .confirmarAbertura('cancelar', null)
    .catch((erro: unknown) => console.error(erro));
}

/**
 * Abrir aqui ou Nova janela, na prévia de `destinoModo`, na escolha por cima
 * da nota. Abrir aqui pergunta antes se há anotações não salvas.
 */
async function abrirDaEscolha(
  destino: 'aqui' | 'nova',
  destinoModo: ModoImpressao,
): Promise<void> {
  if (!escolha || acoesBloqueadas) return;
  if (destinoModo === 'danfe' && btnDanfe.disabled) return;
  if (!escolha.sobreposta) {
    // Janela vazia: Abrir aqui é o mesmo que clicar na prévia; Nova janela
    // leva o arquivo para outra janela e esta volta para a tela inicial.
    if (destino === 'aqui') {
      if (destinoModo === 'danfe') mostrarDanfe();
      else mostrarConferencia();
      return;
    }
    try {
      await window.psApi.confirmarAbertura('nova', destinoModo);
      limparNota();
    } catch (erro) {
      mostrarMensagem('Não foi possível abrir o arquivo.', 'erro');
      console.error(erro);
    }
    return;
  }
  if (destino === 'aqui' && !(await podeSair())) return;
  const arquivo = escolha.arquivo;
  try {
    const r = await window.psApi.confirmarAbertura(destino, destinoModo);
    fecharSobreposicao();
    if (destino === 'aqui') carregar(r ?? arquivo, destinoModo);
  } catch (erro) {
    mostrarMensagem('Não foi possível abrir o arquivo.', 'erro');
    console.error(erro);
  }
}

/**
 * O que fazer com o resultado de abrir um arquivo nesta janela (botão,
 * Ctrl+O ou arrastar). As regras de onde abrir são do processo principal.
 */
function tratarAbertura(r: ResultadoAbrir): void {
  if (r.status === 'aqui') {
    carregar(r.arquivo);
    return;
  }
  if (r.status === 'ja-aberto') {
    mostrarMensagem('Este arquivo já está aberto nesta janela.', 'info');
    return;
  }
  if (r.status !== 'escolher') return;
  // Na tela de escolha de outro XML (ainda sem modo), o novo toma o lugar.
  if (!modo.hidden && !escolha?.sobreposta) {
    void window.psApi
      .confirmarAbertura('aqui', null)
      .then((a) => carregar(a ?? r.arquivo));
    return;
  }
  try {
    const lido = lerArquivo(r.arquivo.texto);
    esconderMensagem();
    mostrarEscolha(r.arquivo, lido, true);
  } catch (erro) {
    void window.psApi.confirmarAbertura('cancelar', null);
    mostrarMensagem(
      erro instanceof NaoEhNfeError
        ? erro.message
        : 'Não foi possível ler o arquivo.',
      'erro',
    );
    if (!(erro instanceof NaoEhNfeError)) console.error(erro);
  }
}

/**
 * Lê o arquivo. XML da NF-e: vai para a escolha de modo, ou direto para
 * `modoInicial` (Abrir aqui e Nova janela pela escolha). Cópia editada
 * (.psxml): vai direto para a conferência (o DANFE só sai do XML original).
 */
function carregar(
  arquivo: ArquivoAberto,
  modoInicial: ModoImpressao | null = null,
): void {
  try {
    const lido = lerArquivo(arquivo.texto);
    esconderMensagem();
    aberto = { nome: arquivo.nome, texto: arquivo.texto, lido };
    conferenciaMontada = false;
    danfeMontado = false;
    danfeEl.replaceChildren();
    copiarAnotacoes(lido.anotacoes, anotacoes);
    titulosLidos.clear();
    for (const [id, t] of lido.titulosAnotacoes) titulosLidos.set(id, t);
    marcarGravadas();
    // Ordem gravada na cópia editada; cópia antiga (sem <ordem>) ou critério
    // desconhecido (por exemplo, coluna escondida): ordem da nota.
    ordemAtual =
      lido.ordem && criterioValido(lido.ordem.criterio, colunasAtuais())
        ? lido.ordem
        : ORDEM_NOTA;
    document.title = 'PS Reader';
    if (lido.copiaEditada || modoInicial === 'conferencia')
      mostrarConferencia();
    else if (modoInicial === 'danfe') {
      mostrarDanfe();
      // DANFE que não deu para montar: fica na escolha, com o motivo.
      if (!danfeMontado && notaEl.hidden) mostrarEscolha(arquivo, lido);
    } else mostrarEscolha(arquivo, lido);
  } catch (erro) {
    // O processo principal já trocou o arquivo aberto: a nota anterior não
    // pode mais ser salva, então volta para a tela inicial.
    window.psApi.informarSemNota();
    aberto = null;
    conferenciaMontada = false;
    danfeMontado = false;
    danfeEl.replaceChildren();
    anotacoes.clear();
    titulosLidos.clear();
    marcarGravadas();
    notaEl.replaceChildren();
    document.title = 'PS Reader';
    mostrarTela('vazio');
    if (erro instanceof NaoEhNfeError) {
      mostrarMensagem(erro.message, 'erro');
    } else {
      mostrarMensagem('Não foi possível ler o arquivo.', 'erro');
      console.error(erro);
    }
  }
}

/**
 * Abrir arquivo (botão ou Ctrl+O). Com nota aberta, o arquivo vai para uma
 * janela nova ou para a escolha por cima da nota: nada aqui se perde, então
 * não há pergunta antes (só no Abrir aqui).
 */
async function abrir(): Promise<void> {
  try {
    tratarAbertura(await window.psApi.abrirArquivo());
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

/**
 * Mostra no botão a pasta onde o Salvar grava. `sessao`: é a pasta de um
 * .psxml aberto por duplo clique nesta janela, só até fechá-la; o botão leva
 * a marca "só nesta janela".
 */
function atualizarPasta(caminho: string | null, sessao = false): void {
  pastaDestino = caminho;
  for (const b of botoesPasta) {
    const rotulo = b.querySelector('.botao__caminho');
    if (rotulo) {
      rotulo.textContent = caminho
        ? abreviarCaminho(caminho)
        : 'Nenhuma pasta escolhida';
    }
    const marca = b.querySelector<HTMLElement>('.botao__sessao');
    if (marca) marca.hidden = !(caminho && sessao);
    b.title =
      caminho && sessao
        ? `${caminho}\nSó nesta janela: a pasta do arquivo aberto. A pasta salva volta quando você fechar esta janela.`
        : (caminho ?? '');
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
    if (pasta !== null) {
      // A escolha vira a pasta salva: a desta sessão (e o aviso dela) acabou.
      atualizarPasta(pasta);
      if (mensagem.dataset.tipo === 'info') esconderMensagem();
    }
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
  acoesBloqueadas = bloquear;
  for (const b of [
    btnSalvar,
    btnSalvarMais,
    btnImprimir,
    btnModoConferencia,
    btnModoDanfe,
    btnInicio,
    btnAbrirOutro,
  ]) {
    b.disabled = bloquear;
  }
  btnSalvarTexto.textContent = bloquear && salvando ? 'Salvando...' : 'Salvar';
  if (!bloquear) retomarExterno();
}

/**
 * Salvar (Ctrl+S): na Conferência grava só o .psxml; no DANFE, só o PDF.
 * O PDF da Conferência e a cópia ficam no menu da seta ao lado do botão.
 */
function salvar(): Promise<boolean> {
  return modoAtual === 'danfe' ? salvarDanfe() : salvarConferencia();
}

/** "Salvar PDF" do menu: o PDF do modo em que a tela está. */
function salvarPdf(): Promise<boolean> {
  return modoAtual === 'danfe' ? salvarDanfe() : salvarPdfConferencia();
}

// ---------- gravar com a pergunta de substituir ----------

/** Texto do pedido de nome do Salvar cópia, por tipo. */
const TEXTO_COPIA: Record<TipoCopia, string> = {
  psxml:
    'A cópia é um .psxml novo com as anotações de agora. O arquivo aberto não muda, e a janela passa a trabalhar na cópia.',
  conferencia:
    'O PDF vai com outro nome. O PDF que já existe com o nome padrão não muda.',
  danfe:
    'O PDF vai com outro nome. O PDF que já existe com o nome padrão não muda.',
};

/**
 * Salvar cópia: pede o nome (sugestão <base>..._copiaN, na pasta de destino
 * em uso) e grava com `gravar`. Nome que já existe: pergunta Substituir ou
 * Cancelar (que volta ao pedido de nome). Devolve o resultado, ou cancelado.
 */
async function gravarCopia<R extends { status: string }>(
  tipo: TipoCopia,
  daEscolha: boolean,
  gravar: (
    opcoes: OpcoesSalvar & { nome: string },
  ) => Promise<R | ArquivoExistente>,
): Promise<R | { status: 'cancelado' } | { status: 'erro'; mensagem: string }> {
  const base =
    escolha && daEscolha
      ? nomeBaseArquivo(escolha.lido.nota)
      : aberto
        ? nomeBaseArquivo(aberto.lido.nota)
        : null;
  for (;;) {
    const sugestao = await window.psApi.sugerirCopia(base, tipo, daEscolha);
    if (sugestao.status === 'erro') return sugestao;
    const nome = await pedirNomeCopia({
      sugestao: sugestao.nome,
      extensao: tipo === 'psxml' ? '.psxml' : '.pdf',
      pasta: sugestao.pasta,
      texto: TEXTO_COPIA[tipo],
      problema: problemaNomeArquivo,
    });
    if (nome === null) return { status: 'cancelado' };
    const r = await gravar({ nome });
    if (r.status !== 'existe') return r as R;
    const existente = r as ArquivoExistente;
    const resposta = await perguntar({
      titulo: 'Arquivo já existe',
      texto: `O arquivo ${existente.nome} já existe em ${abreviarCaminho(existente.pasta)}. Deseja substituir?`,
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar' },
        { rotulo: 'Substituir', valor: 'substituir', principal: true },
      ],
      cancelar: 'cancelar',
    });
    if (resposta === 'substituir')
      return (await gravar({ nome, substituir: true })) as R;
    // Cancelar: volta ao pedido de nome, com uma sugestão nova.
  }
}

/**
 * Grava com `gravar`. Se o arquivo já existe, pergunta no visual do app:
 * Substituir, Salvar cópia (pede outro nome, ver gravarCopia) ou Cancelar.
 * `copiou`: true quando gravou como cópia.
 */
async function gravarComPergunta<R extends { status: string }>(
  tipo: TipoCopia,
  daEscolha: boolean,
  gravar: (opcoes: OpcoesSalvar) => Promise<R | ArquivoExistente>,
): Promise<{
  r: R | { status: 'cancelado' } | { status: 'erro'; mensagem: string };
  copiou: boolean;
}> {
  const r = await gravar({});
  if (r.status !== 'existe') return { r: r as R, copiou: false };
  const existente = r as ArquivoExistente;
  const resposta = await perguntar({
    titulo: 'Arquivo já existe',
    texto: `O arquivo ${existente.nome} já existe em ${abreviarCaminho(existente.pasta)}. O que fazer?`,
    botoes: [
      { rotulo: 'Cancelar', valor: 'cancelar' },
      { rotulo: 'Salvar cópia...', valor: 'copia' },
      { rotulo: 'Substituir', valor: 'substituir', principal: true },
    ],
    cancelar: 'cancelar',
  });
  if (resposta === 'cancelar')
    return { r: { status: 'cancelado' }, copiou: false };
  if (resposta === 'substituir')
    return { r: (await gravar({ substituir: true })) as R, copiou: false };
  return { r: await gravarCopia(tipo, daEscolha, gravar), copiou: true };
}

/** Aviso de PDF salvo, ou a mensagem de erro. true se gravou. */
function avisarPdf(
  r:
    | ResultadoSalvarDanfe
    | { status: 'cancelado' }
    | { status: 'erro'; mensagem: string },
): boolean {
  if (r.status === 'salvo') {
    mostrarSucesso('Salvo', {
      nome: nomeDoCaminho(r.pdf),
      pasta: pastaDoCaminho(r.pdf),
    });
    return true;
  }
  if (r.status === 'erro') mostrarMensagem(r.mensagem, 'erro');
  return false;
}

/** Salva só o PDF do DANFE (<base>_DANFE.pdf). true se gravou. */
async function salvarDanfe(): Promise<boolean> {
  if (!aberto) return false;
  esconderMensagem();
  if (!pastaDestino && !(await escolherPasta())) return false;
  const base = nomeBaseArquivo(aberto.lido.nota);
  bloquearAcoes(true, true);
  try {
    const { r } = await gravarComPergunta('danfe', false, (o) =>
      window.psApi.salvarDanfe(base, false, o),
    );
    return avisarPdf(r);
  } catch (erro) {
    mostrarMensagem('Não foi possível salvar.', 'erro');
    console.error(erro);
    return false;
  } finally {
    bloquearAcoes(false);
  }
}

/**
 * Texto do .psxml com as anotações de agora, e a cópia delas que vai ser
 * marcada como salva (não o que for digitado durante a gravação). null se
 * não deu para montar (a mensagem já foi mostrada).
 */
function montarTextoCopia(): { texto: string; gravadas: Anotacoes } | null {
  if (!aberto) return null;
  try {
    const texto = montarCopia(
      aberto.texto,
      anotacoes,
      titulosParaCopia(),
      ordemAtual,
    );
    const gravadas: Anotacoes = new Map();
    copiarAnotacoes(anotacoes, gravadas);
    return { texto, gravadas };
  } catch (erro) {
    mostrarMensagem('Não foi possível montar a cópia editada.', 'erro');
    console.error(erro);
    return null;
  }
}

/**
 * Depois de gravar o .psxml: as anotações gravadas passam a ser as salvas e,
 * se foi uma cópia, a janela trabalha nela (nome e título). true se gravou.
 */
function concluirPsxml(
  r:
    | ResultadoSalvar
    | { status: 'cancelado' }
    | { status: 'erro'; mensagem: string },
  gravadas: Anotacoes,
  copia: boolean,
): boolean {
  if (r.status === 'salvo') {
    copiarAnotacoes(gravadas, anotacoesGravadas);
    atualizarPendentes();
    if (copia && aberto) {
      aberto.nome = nomeDoCaminho(r.copia);
      preencherBarra(aberto.lido.nota);
    }
    mostrarSucesso(copia ? 'Cópia salva' : 'Salvo', {
      nome: nomeDoCaminho(r.copia),
      pasta: pastaDoCaminho(r.copia),
    });
    return true;
  }
  if (r.status === 'erro') mostrarMensagem(r.mensagem, 'erro');
  return false;
}

/**
 * Salvar da Conferência: grava só o .psxml na pasta de destino do botão.
 * true se gravou. O .psxml aberto nessa mesma pasta é regravado sem
 * pergunta; em outra pasta, ou de uma NF-e original, grava
 * <base>_Conferencia.psxml e, se ele já existe, pergunta Substituir, Salvar
 * cópia ou Cancelar.
 */
async function salvarConferencia(): Promise<boolean> {
  if (!aberto) return false;
  esconderMensagem();
  if (!pastaDestino && !(await escolherPasta())) return false;
  const montada = montarTextoCopia();
  if (!montada) return false;
  const base = nomeBaseArquivo(aberto.lido.nota);
  bloquearAcoes(true, true);
  try {
    const { r, copiou } = await gravarComPergunta('psxml', false, (o) =>
      o.nome
        ? window.psApi.salvarCopia(montada.texto, o.nome, o)
        : window.psApi.salvar(montada.texto, base, o),
    );
    return concluirPsxml(r, montada.gravadas, copiou);
  } catch (erro) {
    mostrarMensagem('Não foi possível salvar.', 'erro');
    console.error(erro);
    return false;
  } finally {
    bloquearAcoes(false);
  }
}

/**
 * "Salvar PDF" na Conferência: monta a tabela da folha (orientação, fonte e,
 * se preciso, partes, com a pergunta antes) e grava <base>_Conferencia.pdf
 * (se já existe: Substituir, Salvar cópia ou Cancelar).
 */
async function salvarPdfConferencia(): Promise<boolean> {
  if (!aberto) return false;
  esconderMensagem();
  if (!pastaDestino && !(await escolherPasta())) return false;
  const orientacao = await prepararFolha();
  if (!orientacao) return false;
  const base = nomeBaseArquivo(aberto.lido.nota);
  marcarGeradoEm();
  bloquearAcoes(true, true);
  try {
    const { r } = await gravarComPergunta('conferencia', false, (o) =>
      window.psApi.salvarPdfConferencia(
        base,
        orientacao === 'paisagem',
        false,
        o,
      ),
    );
    return avisarPdf(r);
  } catch (erro) {
    mostrarMensagem('Não foi possível salvar.', 'erro');
    console.error(erro);
    return false;
  } finally {
    desmontarFolha();
    bloquearAcoes(false);
  }
}

/**
 * "Salvar cópia...": pede o nome (sugestão <base>_Conferencia_copiaN, na
 * pasta de destino em uso) e grava um .psxml novo. O arquivo aberto não
 * muda; a partir daí a janela trabalha na cópia (título e próximos Salvar).
 * true se gravou.
 */
async function salvarCopia(): Promise<boolean> {
  if (!aberto) return false;
  esconderMensagem();
  if (!pastaDestino && !(await escolherPasta())) return false;
  const montada = montarTextoCopia();
  if (!montada) return false;
  bloquearAcoes(true, true);
  try {
    const r = await gravarCopia('psxml', false, (o) =>
      window.psApi.salvarCopia(montada.texto, o.nome, o),
    );
    return concluirPsxml(r, montada.gravadas, true);
  } catch (erro) {
    mostrarMensagem('Não foi possível salvar a cópia.', 'erro');
    console.error(erro);
    return false;
  } finally {
    bloquearAcoes(false);
  }
}

// ---------- menu da seta do Salvar ----------

function fecharMenuSalvar(focarSeta = false): void {
  if (menuSalvar.hidden) return;
  menuSalvar.hidden = true;
  btnSalvarMais.setAttribute('aria-expanded', 'false');
  if (focarSeta) btnSalvarMais.focus();
}

function abrirMenuSalvar(): void {
  menuSalvar.hidden = false;
  btnSalvarMais.setAttribute('aria-expanded', 'true');
  btnSalvarPdf.focus();
}

/**
 * "Salvar PDF" da tela de escolha: grava só o PDF do modo, sem entrar nele.
 * O documento é montado em #pdf-previa, que o CSS da classe pdf-previa deixa
 * fora da área visível na tela e, na mídia print, põe no lugar da nota (que
 * pode estar aberta por baixo, na escolha por cima da nota). É o mesmo
 * código, o mesmo CSS e as mesmas opções de PDF de quando se entra no modo e
 * salva, e a tela não pisca. Termina desmontando o documento.
 */
async function salvarPrevia(destino: ModoImpressao): Promise<void> {
  if (!escolha || escolha.lido.copiaEditada || modo.hidden) return;
  const { arquivo, lido, sobreposta } = escolha;
  const n = lido.nota;
  let dadosDanfe: DadosDanfe | null = null;
  if (destino === 'danfe') {
    const r = lerDadosDanfe(arquivo.texto);
    if (!r.dados) {
      mostrarMensagem(r.motivo, 'erro');
      return;
    }
    dadosDanfe = r.dados;
  }
  esconderMensagem();
  if (!pastaDestino && !(await escolherPasta())) return;

  const modoAnterior = document.body.dataset.modo;
  const botoes = [
    btnConferencia,
    btnDanfe,
    btnSalvarPreviaConferencia,
    btnSalvarPreviaDanfe,
    ...acoesEscolha,
  ];
  const desabilitadosAntes = botoes.map((b) => b.disabled);
  for (const b of botoes) b.disabled = true;
  acoesBloqueadas = true;
  const textoBotao =
    destino === 'danfe'
      ? btnSalvarPreviaDanfe.querySelector('.modo__salvar-texto')
      : btnSalvarPreviaConferencia.querySelector('.modo__salvar-texto');
  const textoAntes = textoBotao?.textContent ?? '';
  if (textoBotao) textoBotao.textContent = 'Salvando...';
  const copiaAntes = rodapeCopia.hidden;

  try {
    document.body.classList.add('pdf-previa');
    document.body.dataset.modo = destino;
    marcarGeradoEm();
    rodapeCopia.hidden = true;
    previaEl.className = destino === 'danfe' ? 'danfe' : 'nota';
    previaEl.hidden = false;
    if (destino === 'danfe' && dadosDanfe) {
      montarDanfe(previaEl, dadosDanfe);
    } else {
      previaEl.replaceChildren(...conteudoNota(n, 'copia'));
    }
    const nome = nomeBaseArquivo(n);
    let paisagem = false;
    if (destino === 'conferencia') {
      const orientacao = await prepararFolha(previaEl);
      if (!orientacao) return;
      paisagem = orientacao === 'paisagem';
    }
    const { r } = await gravarComPergunta(destino, sobreposta, (o) =>
      destino === 'danfe'
        ? window.psApi.salvarDanfe(nome, sobreposta, o)
        : window.psApi.salvarPdfConferencia(nome, paisagem, sobreposta, o),
    );
    avisarPdf(r);
  } catch (erro) {
    mostrarMensagem('Não foi possível salvar.', 'erro');
    console.error(erro);
  } finally {
    desmontarFolha();
    previaEl.hidden = true;
    previaEl.replaceChildren();
    rodapeCopia.hidden = copiaAntes;
    document.body.classList.remove('pdf-previa');
    if (modoAnterior === undefined) delete document.body.dataset.modo;
    else document.body.dataset.modo = modoAnterior;
    marcarGeradoEm();
    botoes.forEach((b, i) => {
      b.disabled = desabilitadosAntes[i];
    });
    if (textoBotao) textoBotao.textContent = textoAntes;
    acoesBloqueadas = false;
    retomarExterno();
  }
}

// ---------- arquivo vindo de fora (duplo clique num .psxml) ----------

/** true enquanto salva ou imprime: o arquivo de fora espera terminar. */
let acoesBloqueadas = false;
/** Pergunta de anotações (ou leitura) em andamento para um arquivo de fora. */
let abrindoExterno = false;
/** Chegou arquivo de fora enquanto as ações estavam bloqueadas ou abrindo. */
let externoAguardando = false;

/**
 * Abre o arquivo pedido de fora no fluxo normal (carregar: .psxml vai direto
 * para a conferência). Com anotação não salva, faz a pergunta de sempre;
 * Cancelar deixa a nota como está. O processo principal guarda só o último
 * pedido.
 */
async function abrirExterno(): Promise<void> {
  if (acoesBloqueadas || abrindoExterno) {
    externoAguardando = true;
    return;
  }
  abrindoExterno = true;
  try {
    if (!(await podeSair())) return;
    const arquivo = await window.psApi.abrirExterno();
    if (arquivo === null) return;
    fecharSobreposicao();
    carregar(arquivo, arquivo.modo);
    // .psxml por duplo clique: a pasta dele vale como pasta de destino só nesta
    // janela, até fechá-la. O botão mostra a marca e o aviso explica (depois de
    // carregar, que esconde as mensagens).
    if (arquivo.pastaSessao) {
      atualizarPasta(arquivo.pastaSessao, true);
      if (aberto)
        mostrarMensagem(
          `Nesta janela os arquivos serão salvos em ${arquivo.pastaSessao}, a pasta do arquivo aberto. Sua pasta salva volta quando você fechar esta janela.`,
          'info',
        );
    }
  } catch (erro) {
    mostrarMensagem('Não foi possível ler o arquivo.', 'erro');
    console.error(erro);
  } finally {
    abrindoExterno = false;
    retomarExterno();
  }
}

/** Abre o arquivo de fora que chegou enquanto não dava. */
function retomarExterno(): void {
  if (!externoAguardando || acoesBloqueadas || abrindoExterno) return;
  externoAguardando = false;
  void abrirExterno();
}

/**
 * Antes de sair da nota (abrir outro arquivo ou fechar a janela): com
 * anotações alteradas, pergunta Salvar, Descartar ou Cancelar. true = pode
 * seguir; false = fica onde está, com as anotações intactas.
 */
async function podeSair(): Promise<boolean> {
  if (!haAlteracoes()) return true;
  const resposta = await perguntar<RespostaAlteracoes>({
    titulo: 'Anotações não salvas',
    texto:
      'Há anotações não salvas nesta nota. O que fazer antes de continuar?',
    botoes: [
      { rotulo: 'Cancelar', valor: 'cancelar' },
      { rotulo: 'Descartar', valor: 'descartar' },
      { rotulo: 'Salvar cópia...', valor: 'copia' },
      { rotulo: 'Salvar', valor: 'salvar', principal: true },
    ],
    cancelar: 'cancelar',
  });
  if (resposta === 'descartar') return true;
  // Salvar grava só o .psxml (não depende da tela), então vale também no
  // DANFE. Salvar cópia abre o pedido de nome; concluída, a ação segue.
  if (resposta === 'salvar') return salvarConferencia();
  if (resposta === 'copia') return salvarCopia();
  return false;
}

async function imprimir(): Promise<void> {
  if (!aberto) return;
  esconderMensagem();
  // Na Conferência, a tabela da folha (orientação, fonte, partes) antes.
  let paisagem = false;
  if (modoAtual === 'conferencia') {
    const orientacao = await prepararFolha();
    if (!orientacao) return;
    paisagem = orientacao === 'paisagem';
  }
  marcarGeradoEm();
  bloquearAcoes(true);
  try {
    const r = await window.psApi.imprimir(modoAtual, paisagem);
    if (r.status === 'erro') mostrarMensagem(r.mensagem, 'erro');
  } catch (erro) {
    mostrarMensagem('Não foi possível imprimir.', 'erro');
    console.error(erro);
  } finally {
    desmontarFolha();
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
  window.psApi.informarSemNota();
  limparNota();
}

/** Tira a nota desta janela e volta para a tela inicial (sem perguntar). */
function limparNota(): void {
  fecharSobreposicao();
  escolha = null;
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
  titulosLidos.clear();
  marcarGravadas();
  esconderMensagem();
  document.title = 'PS Reader';
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
    const idColuna = (titulos[celula.cellIndex] as HTMLElement | undefined)
      ?.dataset.coluna;
    const rotulo = idColuna
      ? (colunasAtuais().find((c) => c.id === idColuna)?.rotulo ?? '')
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
  // Com o painel de colunas aberto, os atalhos da nota não valem.
  if (!e.ctrlKey || e.altKey || e.metaKey || editorAberto()) return;
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
// Na escolha por cima da nota, a prévia em si não abre: os botões Abrir aqui
// e Nova janela, que aparecem sobre ela, é que abrem.
btnConferencia.addEventListener('click', () => {
  if (escolha?.sobreposta) acoesEscolha[0]?.focus();
  else mostrarConferencia();
});
btnDanfe.addEventListener('click', () => {
  if (escolha?.sobreposta) acoesDanfe[0]?.focus();
  else mostrarDanfe();
});
for (const b of acoesEscolha) {
  b.addEventListener(
    'click',
    () =>
      void abrirDaEscolha(
        b.dataset.destino === 'nova' ? 'nova' : 'aqui',
        b.dataset.modo === 'danfe' ? 'danfe' : 'conferencia',
      ),
  );
}
btnFecharEscolha.addEventListener('click', cancelarSobreposicao);
modo.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !escolha?.sobreposta) return;
  e.preventDefault();
  cancelarSobreposicao();
});
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
  if (!menuSalvar.contains(alvo) && !btnSalvarMais.contains(alvo))
    fecharMenuSalvar();
});
window.addEventListener('contextmenu', (e) => void menuContexto(e));
btnImprimir.addEventListener('click', () => void imprimir());
btnSalvar.addEventListener('click', () => void salvar());
btnSalvarMais.addEventListener('click', () => {
  if (menuSalvar.hidden) abrirMenuSalvar();
  else fecharMenuSalvar();
});
btnSalvarPdf.addEventListener('click', () => {
  fecharMenuSalvar();
  void salvarPdf();
});
btnSalvarCopia.addEventListener('click', () => {
  fecharMenuSalvar();
  void salvarCopia();
});
menuSalvar.addEventListener('keydown', (e) => {
  const ops = [btnSalvarPdf, btnSalvarCopia];
  const i = ops.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === 'Escape') fecharMenuSalvar(true);
  else if (e.key === 'ArrowDown') ops[(i + 1) % ops.length].focus();
  else if (e.key === 'ArrowUp') ops[(i + ops.length - 1) % ops.length].focus();
  else return;
  e.preventDefault();
});
btnSalvarPreviaConferencia.addEventListener(
  'click',
  () => void salvarPrevia('conferencia'),
);
btnSalvarPreviaDanfe.addEventListener(
  'click',
  () => void salvarPrevia('danfe'),
);
// Fechar a janela com anotações não salvas: a pergunta de sempre; a
// resposta volta ao processo principal, que fecha ou não.
window.psApi.aoPedirFechar(() => {
  fecharSobreposicao();
  podeSair()
    .catch((erro: unknown) => {
      console.error(erro);
      return false;
    })
    .then((pode) => window.psApi.responderFechar(pode));
});
// Configuração mudada em outra janela: aplica aqui também, na hora.
// Perfis mudados em outra janela (outro ativo, colunas aplicadas, perfil
// importado...): aplica aqui também, na hora, e atualiza o painel aberto.
window.psApi.aoMudarPerfis((estado) => {
  aplicarPerfis(estado);
  atualizarEditor(estado);
});
// Pasta de destino salva mudada em outra janela: o botão mostra a nova (ou
// continua com a pasta só desta janela, se houver).
window.psApi.aoMudarPasta(() => {
  window.psApi
    .pastaDestino()
    .then((p) => atualizarPasta(p.caminho, p.sessao))
    .catch((erro: unknown) => console.error(erro));
});
// Uma página recarregada começa sem pendências.
window.psApi.informarPendentes(false);
// Duplo clique num .psxml: com o app fechado, o arquivo vem na abertura; com
// ele aberto, chega o aviso e a janela existente abre o arquivo.
window.psApi.aoArquivoExterno(() => void abrirExterno());
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

// A personalização salva da conferência; falha: fica a padrão.
const configCarregada = window.psApi
  .perfis()
  .then((estado) => {
    perfisAtual = estado;
    configAtual = estado.config;
  })
  .catch((erro: unknown) => console.error(erro));

// Primeiro a pasta salva e a personalização, depois o arquivo da linha de
// comando: assim a pasta desta sessão (se o arquivo for um .psxml) não é
// sobrescrita pela salva, e a nota já abre com as colunas do usuário.
window.psApi
  .pastaDestino()
  .then((p) => atualizarPasta(p.caminho, p.sessao))
  .catch((erro: unknown) => {
    atualizarPasta(null);
    console.error(erro);
  })
  .then(() => configCarregada)
  .finally(() => void abrirExterno());

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
  if (!arquivo || editorAberto()) return;
  const nome = arquivo.name.toLowerCase();
  if (!nome.endsWith('.xml') && !nome.endsWith('.psxml')) {
    mostrarMensagem('Selecione um arquivo .xml ou .psxml.', 'erro');
    return;
  }
  window.psApi
    .abrirSolto(arquivo)
    .then(tratarAbertura)
    .catch((erro: unknown) => {
      mostrarMensagem('Não foi possível ler o arquivo.', 'erro');
      console.error(erro);
    });
});
