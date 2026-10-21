// Monta a tela a partir do objeto Nota. Todo texto vindo do XML entra no DOM
// por textContent, nunca por innerHTML.

import './styles/tokens.css';
import './styles/app.css';
import './styles/print.css';

import { COLUNAS_ITENS, ID_ANOTACAO, type ColunaItem } from './nfe/colunas';
import { montarCopia } from './nfe/copia';
import { lerArquivo, NaoEhNfeError, type ArquivoLido } from './nfe/parser';
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

function blocoDadosNota(n: Nota): HTMLElement | null {
  const p = n.protocolo;
  const situacao = juntar([p.cStat, p.xMotivo], ' ');
  const conteudo = campos(
    campo('Número', n.ide.nNF),
    campo('Série', n.ide.serie),
    campo('Data de emissão', f.dataHora(n.ide.dhEmi)),
    campo('Tipo', codigoDescrito(n.ide.tpNF, TP_NF)),
    campo('Natureza da operação', n.ide.natOp, 'campo--largo'),
    campo(
      'Chave de acesso',
      f.chaveAcesso(n.chave),
      'campo--largo campo--chave',
    ),
    campo('Protocolo de autorização', p.nProt),
    campo('Data de autorização', f.dataHora(p.dhRecbto)),
    campo('Situação', situacao, 'campo--largo'),
  );
  return secao('Dados da NF-e', 'secao--dados', conteudo);
}

/** Anotações digitadas na tela, por nItem. Texto vazio não fica guardado. */
const anotacoes = new Map<string, string>();

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
  });

  return el('td', classe, campoTexto, espelho);
}

function tabelaItens(n: Nota): HTMLElement | null {
  if (n.itens.length === 0) return null;

  const colunas = COLUNAS_ITENS.filter((c) => c.visivel);
  const classe = (c: ColunaItem) =>
    `col-${c.id}${c.alinhamento === 'direita' ? ' num' : ''}`;

  const thead = el(
    'thead',
    '',
    el('tr', '', ...colunas.map((c) => el('th', classe(c), c.rotulo))),
  );

  // Cada item em seu próprio tbody: a linha de infAdProd fica junto do item
  // (zebra e quebra de página tratam os dois como um bloco).
  const corpos = n.itens.map((i) => {
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
    return tbody;
  });

  const tabela = el('table', 'tabela tabela--itens', thead, ...corpos);
  const titulo = `Itens (${n.itens.length})`;
  return secao(titulo, 'secao--itens', el('div', 'tabela-rolagem', tabela));
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
const barra = $('barra');
const barraFornecedor = $('barra-fornecedor');
const barraNota = $('barra-nota');
const barraCopia = $('barra-copia');
const notaEl = $('nota');
const mensagem = $('mensagem');
const mensagemTexto = $('mensagem-texto');
const rodapeGerado = $('rodape-gerado');
const rodapeCopia = $('rodape-copia');
const btnAbrir = $('btn-abrir') as HTMLButtonElement;
const btnAbrirOutro = $('btn-abrir-outro') as HTMLButtonElement;
const btnConferencia = $('btn-conferencia') as HTMLButtonElement;
const btnImprimir = $('btn-imprimir') as HTMLButtonElement;
const btnSalvar = $('btn-salvar') as HTMLButtonElement;
const botoesPasta = [
  $('btn-pasta') as HTMLButtonElement,
  $('btn-pasta-barra') as HTMLButtonElement,
];

/** Arquivo aberto: o texto fica guardado para montar a cópia editada. */
let aberto: { nome: string; texto: string; lido: ArquivoLido } | null = null;
let pastaDestino: string | null = null;

function mostrarMensagem(texto: string, tipo: 'info' | 'erro'): void {
  mensagemTexto.textContent = texto;
  mensagem.dataset.tipo = tipo;
  mensagem.hidden = false;
}

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

/** Mostra só uma das telas: inicial, escolha de modo ou nota. */
function mostrarTela(tela: 'vazio' | 'modo' | 'nota'): void {
  vazio.hidden = tela !== 'vazio';
  modo.hidden = tela !== 'modo';
  barra.hidden = tela !== 'nota';
  notaEl.hidden = tela !== 'nota';
  window.scrollTo(0, 0);
}

function exibirNota(): void {
  if (!aberto) return;
  const n = aberto.lido.nota;
  barraFornecedor.textContent = n.emitente.xNome;
  barraNota.textContent = textoNumeroSerie(n);
  barraCopia.hidden = !aberto.lido.copiaEditada;
  rodapeCopia.hidden = !aberto.lido.copiaEditada;
  document.title = juntar([textoNumeroSerie(n), n.emitente.xNome], ' | ');

  const cabecalho = el(
    'div',
    'cabecalho',
    el('h1', 'cabecalho__titulo', textoNumeroSerie(n)),
    el('div', 'cabecalho__partes', blocoEmitente(n), blocoDestinatario(n)),
    blocoDadosNota(n),
  );

  notaEl.replaceChildren(
    cabecalho,
    ...[
      tabelaItens(n),
      blocoTotais(n),
      blocoTransporte(n),
      blocoDuplicatas(n),
      blocoDadosAdicionais(n),
    ].filter((s): s is HTMLElement => s !== null),
  );

  mostrarTela('nota');
}

/** Lê o arquivo e vai para a escolha de modo. */
function carregar(arquivo: ArquivoAberto): void {
  try {
    const lido = lerArquivo(arquivo.texto);
    esconderMensagem();
    aberto = { nome: arquivo.nome, texto: arquivo.texto, lido };
    anotacoes.clear();
    for (const [nItem, texto] of lido.anotacoes) anotacoes.set(nItem, texto);
    modoArquivo.textContent = arquivo.nome;
    document.title = 'Leitor NF-e PS';
    mostrarTela('modo');
  } catch (erro) {
    // O processo principal já trocou o arquivo aberto: a nota anterior não
    // pode mais ser salva, então volta para a tela inicial.
    aberto = null;
    anotacoes.clear();
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

function bloquearAcoes(bloquear: boolean): void {
  btnSalvar.disabled = bloquear;
  btnImprimir.disabled = bloquear;
}

async function salvar(): Promise<void> {
  if (!aberto) return;
  esconderMensagem();
  if (!pastaDestino && !(await escolherPasta())) return;

  let copia: string;
  try {
    copia = montarCopia(aberto.texto, anotacoes);
  } catch (erro) {
    mostrarMensagem('Não foi possível montar a cópia editada.', 'erro');
    console.error(erro);
    return;
  }

  marcarGeradoEm();
  bloquearAcoes(true);
  try {
    const r = await window.psApi.salvar(copia);
    if (r.status === 'salvo')
      mostrarMensagem(`Salvo em ${r.pdf} e ${r.copia}`, 'info');
    else if (r.status === 'erro') mostrarMensagem(r.mensagem, 'erro');
  } catch (erro) {
    mostrarMensagem('Não foi possível salvar.', 'erro');
    console.error(erro);
  } finally {
    bloquearAcoes(false);
  }
}

async function imprimir(): Promise<void> {
  if (!aberto) return;
  esconderMensagem();
  marcarGeradoEm();
  bloquearAcoes(true);
  try {
    const r = await window.psApi.imprimir();
    if (r.status === 'erro') mostrarMensagem(r.mensagem, 'erro');
  } catch (erro) {
    mostrarMensagem('Não foi possível imprimir.', 'erro');
    console.error(erro);
  } finally {
    bloquearAcoes(false);
  }
}

// ---------- eventos ----------

btnAbrir.addEventListener('click', () => void abrir());
btnAbrirOutro.addEventListener('click', () => void abrir());
btnConferencia.addEventListener('click', exibirNota);
btnImprimir.addEventListener('click', () => void imprimir());
btnSalvar.addEventListener('click', () => void salvar());
for (const b of botoesPasta) {
  b.addEventListener('click', () => void escolherPasta());
}
$('mensagem-fechar').addEventListener('click', esconderMensagem);

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
  window.psApi
    .abrirSolto(arquivo)
    .then(carregar)
    .catch((erro: unknown) => {
      mostrarMensagem('Não foi possível ler o arquivo.', 'erro');
      console.error(erro);
    });
});
