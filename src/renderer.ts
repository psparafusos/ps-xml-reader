// Monta a tela a partir do objeto Nota. Todo texto vindo do XML entra no DOM
// por textContent, nunca por innerHTML.

import './styles/tokens.css';
import './styles/app.css';
import './styles/print.css';

import { lerNota, NaoEhNfeError } from './nfe/parser';
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

interface Coluna {
  titulo: string;
  /** num: alinhado à direita. sem-quebra: texto curto em uma linha. */
  classe: 'num' | 'sem-quebra' | 'col-descricao';
  valor: (i: Item) => string;
}

const COLUNAS_ITENS: Coluna[] = [
  { titulo: 'Nº', classe: 'num', valor: (i) => i.nItem },
  { titulo: 'Código', classe: 'sem-quebra', valor: (i) => i.cProd },
  { titulo: 'EAN', classe: 'sem-quebra', valor: (i) => i.cEAN },
  { titulo: 'Descrição', classe: 'col-descricao', valor: (i) => i.xProd },
  { titulo: 'NCM', classe: 'sem-quebra', valor: (i) => i.NCM },
  { titulo: 'CFOP', classe: 'sem-quebra', valor: (i) => i.CFOP },
  { titulo: 'Un', classe: 'sem-quebra', valor: (i) => i.uCom },
  { titulo: 'Qtd', classe: 'num', valor: (i) => f.quantidade(i.qCom) },
  { titulo: 'V. Unit', classe: 'num', valor: (i) => f.valorUnitario(i.vUnCom) },
  { titulo: 'V. Total', classe: 'num', valor: (i) => f.valor(i.vProd) },
  { titulo: 'IPI', classe: 'num', valor: (i) => f.valor(i.vIPI) },
  { titulo: 'ICMS', classe: 'num', valor: (i) => f.valor(i.vICMS) },
];

function tabelaItens(n: Nota): HTMLElement | null {
  if (n.itens.length === 0) return null;

  const thead = el(
    'thead',
    '',
    el('tr', '', ...COLUNAS_ITENS.map((c) => el('th', c.classe, c.titulo))),
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
        ...COLUNAS_ITENS.map((c) => el('td', c.classe, c.valor(i))),
      ),
    );
    if (i.infAdProd) {
      const td = el('td', 'item__adicional', i.infAdProd);
      td.colSpan = COLUNAS_ITENS.length;
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
const barra = $('barra');
const barraFornecedor = $('barra-fornecedor');
const barraNota = $('barra-nota');
const notaEl = $('nota');
const mensagem = $('mensagem');
const mensagemTexto = $('mensagem-texto');
const rodapeGerado = $('rodape-gerado');
const btnAbrir = $('btn-abrir') as HTMLButtonElement;
const btnAbrirOutro = $('btn-abrir-outro') as HTMLButtonElement;
const btnSalvar = $('btn-salvar') as HTMLButtonElement;

let notaAtual: Nota | null = null;

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

function exibirNota(n: Nota): void {
  notaAtual = n;
  barraFornecedor.textContent = n.emitente.xNome;
  barraNota.textContent = textoNumeroSerie(n);
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

  vazio.hidden = true;
  barra.hidden = false;
  notaEl.hidden = false;
  window.scrollTo(0, 0);
}

function carregarTexto(xml: string): void {
  try {
    const nota = lerNota(xml);
    esconderMensagem();
    exibirNota(nota);
  } catch (erro) {
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
    const texto = await window.psApi.abrirXml();
    if (texto !== null) carregarTexto(texto);
  } catch (erro) {
    mostrarMensagem('Não foi possível ler o arquivo.', 'erro');
    console.error(erro);
  }
}

function nomeSugerido(n: Nota): string {
  const partes = [
    'NFe',
    f.nomeArquivoSeguro(n.ide.nNF),
    f.nomeArquivoSeguro(n.emitente.xNome),
  ];
  return `${juntar(partes, '-')}.pdf`;
}

async function salvar(): Promise<void> {
  if (!notaAtual) return;
  esconderMensagem();
  rodapeGerado.textContent = `Gerado em ${f.agora()}`;
  btnSalvar.disabled = true;
  try {
    const r = await window.psApi.salvarPdf(nomeSugerido(notaAtual));
    if (r.status === 'salvo')
      mostrarMensagem(`PDF salvo em ${r.caminho}`, 'info');
    else if (r.status === 'erro') mostrarMensagem(r.mensagem, 'erro');
  } catch (erro) {
    mostrarMensagem('Não foi possível salvar o PDF.', 'erro');
    console.error(erro);
  } finally {
    btnSalvar.disabled = false;
  }
}

// ---------- eventos ----------

btnAbrir.addEventListener('click', () => void abrir());
btnAbrirOutro.addEventListener('click', () => void abrir());
btnSalvar.addEventListener('click', () => void salvar());
$('mensagem-fechar').addEventListener('click', esconderMensagem);

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
  if (!arquivo.name.toLowerCase().endsWith('.xml')) {
    mostrarMensagem('Selecione um arquivo .xml.', 'erro');
    return;
  }
  arquivo
    .text()
    .then(carregarTexto)
    .catch((erro: unknown) => {
      mostrarMensagem('Não foi possível ler o arquivo.', 'erro');
      console.error(erro);
    });
});
