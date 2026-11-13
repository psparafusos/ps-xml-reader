// Modo .XML da aba XML (o antigo leitor genérico de XML): o arquivo, só
// leitura, em duas vistas (Árvore e Texto), com busca e o Bloco de Notas.
// Monta a própria seção, ao lado do painel Leitura, e só fala com o processo
// principal pela ponte window.psLeitorXml. Quem manda mostrar e esconder é a
// tela da nota (renderer.ts): XML que não é NF-e, NF-e e .psxml (do .psxml,
// o XML original guardado dentro da cópia).
//
// Texto do arquivo nunca vira HTML: cada pedaço entra com textContent.

import { marcarControles } from '../xml/leitor';
import {
  linhaDaPosicao,
  MENSAGEM_LINHAS_CORTADAS,
  MENSAGEM_SEM_INDENTACAO,
  numeroDaLinha,
  pedacosDaLinha,
  totalNumerado,
  type LinhasTexto,
} from '../xml/texto';
import { buscarNoTexto, ocorrencias } from './buscaTexto';
import {
  AVISO_DOCTYPE,
  AVISO_PROFUNDIDADE,
  avisoControles,
  avisoModoLeve,
  COMPLEMENTO_ERRO_ARVORE,
  descreverCodificacao,
  DICA_GRANDE,
  formatarTamanho,
  mensagemErroXml,
  textoContador,
  textoLinhas,
} from './formato';
import {
  linhasDosAchados,
  ModeloArvore,
  noNaPosicao,
  pedacosDoNo,
  type PedacoArvore,
} from './modeloArvore';
import { RolagemVirtual } from './rolagem';
import { NENHUM, nomeDe, TIPOS } from '../xml/arvore';
import type { InfoArquivo, LeituraSemTexto, ResultadoLeitorXml } from './tipos';

/** Altura de cada linha das duas vistas, em pixels (o CSS usa a mesma). */
const ALTURA_LINHA = 22;
/** Recuo de cada nível na Árvore, em pixels. */
const RECUO_ARVORE = 18;
/** Espera depois da última tecla antes de buscar. */
const ESPERA_BUSCA_MS = 200;

type Vista = 'arvore' | 'texto';

const api = window.psLeitorXml;

// ---------- montagem da seção ----------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe: string,
  ...filhos: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  e.append(...filhos);
  return e;
}

function botao(classe: string, texto: string): HTMLButtonElement {
  const b = el('button', classe, texto);
  b.type = 'button';
  return b;
}

const raiz = el('section', 'leitor-xml');
raiz.hidden = true;
raiz.tabIndex = -1;
raiz.setAttribute('aria-label', 'XML do arquivo');

const btnArvore = botao('seletor__opcao', 'Árvore');
const btnTexto = botao('seletor__opcao', 'Texto');
const seletorVista = el(
  'div',
  'seletor leitor-xml__vistas',
  btnArvore,
  btnTexto,
);
seletorVista.setAttribute('role', 'group');
seletorVista.setAttribute('aria-label', 'Vista');
const btnBloco = botao(
  'botao botao--claro leitor-xml__bloco',
  'Abrir no Bloco de Notas',
);

const info = el('div', 'leitor-xml__info');
const avisos = el('div', 'leitor-xml__avisos');
const erroTexto = el('p', 'leitor-xml__erro-texto');
const btnVerErro = botao('botao botao--claro botao--pequeno', 'Ver no texto');
const faixaErro = el('div', 'leitor-xml__erro', erroTexto, btnVerErro);
faixaErro.setAttribute('role', 'alert');

const campoBusca = el('input', 'leitor-xml__campo');
campoBusca.type = 'search';
campoBusca.id = 'leitor-xml-busca';
campoBusca.spellcheck = false;
campoBusca.autocomplete = 'off';
const rotuloBusca = el('label', 'leitor-xml__rotulo', 'Buscar');
rotuloBusca.htmlFor = campoBusca.id;
const contador = el('span', 'leitor-xml__contador');
contador.setAttribute('aria-live', 'polite');
const btnAnterior = botao('botao botao--claro botao--pequeno', 'Anterior');
const btnProximo = botao('botao botao--claro botao--pequeno', 'Próximo');
const faixaBusca = el(
  'div',
  'leitor-xml__busca',
  rotuloBusca,
  campoBusca,
  contador,
  btnAnterior,
  btnProximo,
);

const areaArvore = el('div', 'leitor-xml__vista leitor-xml__vista--arvore');
areaArvore.tabIndex = 0;
areaArvore.setAttribute('role', 'tree');
areaArvore.setAttribute('aria-label', 'Árvore do XML');
const areaTexto = el('div', 'leitor-xml__vista leitor-xml__vista--texto');
areaTexto.tabIndex = 0;
areaTexto.setAttribute('aria-label', 'Texto do XML');
const estado = el('div', 'leitor-xml__estado');
const conteudo = el(
  'div',
  'leitor-xml__conteudo',
  areaArvore,
  areaTexto,
  estado,
);

// Uma linha só: Árvore | Texto, a busca e o Bloco de Notas.
const ferramentas = el(
  'div',
  'leitor-xml__ferramentas',
  seletorVista,
  faixaBusca,
  btnBloco,
);
raiz.append(ferramentas, info, avisos, faixaErro, conteudo);
document.body.append(raiz);

const rolagemArvore = new RolagemVirtual(areaArvore, ALTURA_LINHA, (i) =>
  linhaArvore(i),
);
const rolagemTexto = new RolagemVirtual(areaTexto, ALTURA_LINHA, (i) =>
  linhaTexto(i),
);

// ---------- estado ----------

let leitura: LeituraSemTexto | null = null;
let texto = '';
let linhas: LinhasTexto | null = null;
let modelo: ModeloArvore | null = null;
let vista: Vista = 'texto';
/** Linha selecionada na Árvore (índice em modelo.visiveis). */
let selecionada = 0;
/** Linha do texto com o erro de XML, ou -1. */
let linhaErro = -1;

interface Busca {
  termo: string;
  /** Árvore: nós visíveis com achado. Texto: posições no texto. */
  achados: number[];
  truncado: boolean;
  atual: number;
}
let busca: Busca = { termo: '', achados: [], truncado: false, atual: -1 };
let relogioBusca: ReturnType<typeof setTimeout> | undefined;
/** Arquivo lido (nome e tamanho) e o nome do elemento raiz, ou null. */
let arquivoLido: { arquivo: InfoArquivo; raiz: string | null } | null = null;
/** Avisado a cada leitura terminada (a tela da nota mostra no título). */
let aoLer: (
  dados: { arquivo: InfoArquivo; raiz: string | null } | null,
) => void = () => {};

// ---------- desenho das linhas ----------

/**
 * Põe os pedaços em `destino`, cada um num span com a classe da cor, e
 * destaca as ocorrências do termo (mesmo as que cruzam dois pedaços).
 * `atualEm`: posição, no texto da linha, da ocorrência que é o achado atual.
 */
function desenharPedacos(
  destino: HTMLElement,
  pedacos: PedacoArvore[],
  termo: string,
  atualEm = -1,
): void {
  const inteiro = pedacos.map((p) => p.texto).join('');
  const marcas = termo ? ocorrencias(inteiro, termo) : [];
  let pos = 0;
  let m = 0;
  for (const p of pedacos) {
    const fimPedaco = pos + p.texto.length;
    let a = pos;
    while (a < fimPedaco) {
      while (m < marcas.length && marcas[m][1] <= a) m++;
      const marca = marcas[m];
      let b: number;
      let dentro = false;
      if (!marca || marca[0] >= fimPedaco) b = fimPedaco;
      else if (marca[0] > a) b = marca[0];
      else {
        dentro = true;
        b = Math.min(marca[1], fimPedaco);
      }
      const span = document.createElement('span');
      span.className = `lx-${p.classe}`;
      if (dentro) {
        span.classList.add('lx-achado');
        if (marca[0] === atualEm) span.classList.add('lx-achado--atual');
      }
      span.textContent = p.texto.slice(a - pos, b - pos);
      destino.append(span);
      a = b;
    }
    pos = fimPedaco;
  }
}

function linhaArvore(i: number): HTMLElement {
  const m = modelo as ModeloArvore;
  const no = m.visiveis[i];
  const linha = el('div', 'leitor-xml__no');
  linha.id = `leitor-xml-no-${no}`;
  linha.dataset.linha = String(i);
  linha.setAttribute('role', 'treeitem');
  linha.setAttribute('aria-level', String(m.nivel[no] + 1));
  linha.style.paddingLeft = `${m.nivel[no] * RECUO_ARVORE}px`;
  const seta = el('span', 'leitor-xml__seta');
  seta.setAttribute('aria-hidden', 'true');
  if (m.expansivel(no)) {
    const aberto = m.estaAberto(no);
    linha.setAttribute('aria-expanded', String(aberto));
    seta.textContent = aberto ? '▾' : '▸';
    seta.dataset.alternar = '1';
  }
  const corpo = el('span', 'leitor-xml__corpo');
  desenharPedacos(corpo, pedacosDoNo(m, no), busca.termo);
  linha.append(seta, corpo);
  if (i === selecionada) {
    linha.classList.add('leitor-xml__no--selecionado');
    linha.setAttribute('aria-selected', 'true');
  }
  if (
    vista === 'arvore' &&
    busca.atual >= 0 &&
    busca.achados[busca.atual] === no
  )
    linha.classList.add('leitor-xml__no--achado');
  return linha;
}

function linhaTexto(i: number): HTMLElement {
  const l = linhas as LinhasTexto;
  const linha = el('div', 'leitor-xml__linha');
  const numero = numeroDaLinha(l, i);
  const margem = el('span', 'leitor-xml__numero', numero ? String(numero) : '');
  margem.setAttribute('aria-hidden', 'true');
  const codigo = el('span', 'leitor-xml__codigo');
  const recuo = '  '.repeat(l.nivel[i]);
  if (recuo) codigo.append(el('span', 'lx-recuo', recuo));
  const bruto = texto.slice(l.inicio[i], l.fim[i]);
  const pedacos = pedacosDaLinha(bruto, l.tipo[i]).map((p) => ({
    classe: p.classe,
    texto: marcarControles(p.texto),
  }));
  let atualEm = -1;
  if (vista === 'texto' && busca.atual >= 0) {
    const pos = busca.achados[busca.atual];
    if (pos >= l.inicio[i] && pos < l.fim[i]) {
      linha.classList.add('leitor-xml__linha--achado');
      atualEm = pos - l.inicio[i];
    }
  }
  desenharPedacos(codigo, pedacos, busca.termo, atualEm);
  if (i === linhaErro) linha.classList.add('leitor-xml__linha--erro');
  linha.append(margem, codigo);
  return linha;
}

// ---------- vistas ----------

function mostrarVista(nova: Vista): void {
  vista = nova;
  btnArvore.setAttribute('aria-pressed', String(nova === 'arvore'));
  btnTexto.setAttribute('aria-pressed', String(nova === 'texto'));
  areaArvore.hidden = nova !== 'arvore';
  areaTexto.hidden = nova !== 'texto';
}

/** Posição no texto do que está à vista agora (para trocar de vista no mesmo lugar). */
function posicaoAtual(): number {
  if (vista === 'arvore' && modelo && leitura?.arvore) {
    if (busca.atual >= 0)
      return leitura.arvore.inicio[busca.achados[busca.atual]];
    const no = modelo.visiveis[selecionada];
    return no === undefined ? 0 : leitura.arvore.inicio[no];
  }
  if (vista === 'texto' && linhas && linhas.quantidade > 0) {
    if (busca.atual >= 0) return busca.achados[busca.atual];
    return linhas.inicio[rolagemTexto.primeiraVisivel()];
  }
  return 0;
}

function trocarVista(nova: Vista): void {
  if (nova === vista) return;
  if (nova === 'arvore' && !modelo) return;
  const pos = posicaoAtual();
  mostrarVista(nova);
  if (nova === 'arvore' && modelo && leitura?.arvore) {
    const no = noNaPosicao(leitura.arvore, pos);
    if (no >= 0) {
      const linha = modelo.mostrarNo(no);
      if (linha >= 0) selecionada = linha;
    }
    rolagemArvore.mudarQuantidade(modelo.visiveis.length);
    rolagemArvore.irPara(selecionada);
  } else if (nova === 'texto' && linhas) {
    rolagemTexto.redesenhar();
    rolagemTexto.irPara(linhaDaPosicao(linhas, pos));
  }
  if (busca.termo) executarBusca(pos);
}

// ---------- árvore: seleção e teclado ----------

function selecionar(i: number, modo: 'centro' | 'perto' = 'perto'): void {
  if (!modelo || modelo.visiveis.length === 0) return;
  const anterior = selecionada;
  selecionada = Math.min(Math.max(i, 0), modelo.visiveis.length - 1);
  for (const k of [anterior, selecionada]) {
    const e = rolagemArvore.elementoDa(k);
    if (!e) continue;
    const sim = k === selecionada;
    e.classList.toggle('leitor-xml__no--selecionado', sim);
    if (sim) e.setAttribute('aria-selected', 'true');
    else e.removeAttribute('aria-selected');
  }
  rolagemArvore.irPara(selecionada, modo);
  areaArvore.setAttribute(
    'aria-activedescendant',
    `leitor-xml-no-${modelo.visiveis[selecionada]}`,
  );
}

function alternar(i: number): void {
  if (!modelo) return;
  const no = modelo.visiveis[i];
  if (no === undefined || !modelo.alternar(no)) return;
  rolagemArvore.mudarQuantidade(modelo.visiveis.length);
}

areaArvore.addEventListener('mousedown', (e) => {
  const alvo = e.target as HTMLElement;
  const linha = alvo.closest<HTMLElement>('.leitor-xml__no');
  if (!linha) return;
  const i = Number(linha.dataset.linha);
  if (alvo.dataset.alternar) {
    // A seta não seleciona texto nem tira o foco da árvore.
    e.preventDefault();
    areaArvore.focus();
    selecionar(i);
    alternar(i);
    return;
  }
  selecionar(i);
});

areaArvore.addEventListener('keydown', (e) => {
  if (!modelo || e.ctrlKey || e.altKey || e.metaKey) return;
  const no = modelo.visiveis[selecionada];
  const porTela = rolagemArvore.linhasPorTela();
  switch (e.key) {
    case 'ArrowDown':
      selecionar(selecionada + 1);
      break;
    case 'ArrowUp':
      selecionar(selecionada - 1);
      break;
    case 'PageDown':
      selecionar(selecionada + porTela);
      break;
    case 'PageUp':
      selecionar(selecionada - porTela);
      break;
    case 'Home':
      selecionar(0);
      break;
    case 'End':
      selecionar(modelo.visiveis.length - 1);
      break;
    case 'ArrowRight':
      if (modelo.expansivel(no) && !modelo.estaAberto(no))
        alternar(selecionada);
      else if (modelo.estaAberto(no)) selecionar(selecionada + 1);
      break;
    case 'ArrowLeft': {
      if (modelo.estaAberto(no)) {
        alternar(selecionada);
        break;
      }
      const pai = modelo.arvore.pai[no];
      if (pai >= 0) selecionar(modelo.linhaDoNo(pai));
      break;
    }
    case 'Enter':
    case ' ':
      alternar(selecionada);
      break;
    default:
      return;
  }
  e.preventDefault();
});

// ---------- busca ----------

function atualizarContador(): void {
  const total = busca.achados.length;
  contador.textContent = busca.termo
    ? textoContador(busca.atual, total, busca.truncado)
    : '';
  btnAnterior.disabled = total === 0;
  btnProximo.disabled = total === 0;
}

/** Busca o termo do campo na vista atual; o achado atual é o primeiro a partir de `desde`. */
function executarBusca(desde = posicaoAtual()): void {
  const termo = campoBusca.value;
  busca = { termo, achados: [], truncado: false, atual: -1 };
  if (termo && vista === 'arvore' && modelo && leitura?.arvore) {
    // A mesma busca da vista Texto (nomes, atributos e textos de uma vez),
    // com cada achado levado ao nó da Árvore. A busca do motor (busca.ts)
    // levou 3,3 s num XML de 19 MB e travava a janela; esta, 0,3 s.
    const r = buscarNoTexto(texto, termo);
    const vistos = linhasDosAchados(modelo, r.posicoes);
    busca = { termo, achados: vistos, truncado: r.truncado, atual: -1 };
    const inicio = leitura.arvore.inicio;
    const k = vistos.findIndex((no) => inicio[no] >= desde);
    busca.atual = vistos.length ? Math.max(k, 0) : -1;
  } else if (termo && vista === 'texto') {
    const r = buscarNoTexto(texto, termo);
    const achados = Array.from(r.posicoes);
    busca = { termo, achados, truncado: r.truncado, atual: -1 };
    const k = achados.findIndex((p) => p >= desde);
    busca.atual = achados.length ? Math.max(k, 0) : -1;
  }
  atualizarContador();
  irParaAchado();
}

function irParaAchado(): void {
  if (vista === 'arvore' && modelo) {
    if (busca.atual >= 0) {
      const linha = modelo.mostrarNo(busca.achados[busca.atual]);
      rolagemArvore.mudarQuantidade(modelo.visiveis.length);
      if (linha >= 0) {
        selecionada = linha;
        rolagemArvore.irPara(linha);
      }
    }
    rolagemArvore.redesenhar();
  } else if (vista === 'texto' && linhas) {
    if (busca.atual >= 0)
      rolagemTexto.irPara(linhaDaPosicao(linhas, busca.achados[busca.atual]));
    rolagemTexto.redesenhar();
  }
}

function passo(direcao: 1 | -1): void {
  const total = busca.achados.length;
  if (total === 0) return;
  busca.atual = (busca.atual + direcao + total) % total;
  atualizarContador();
  irParaAchado();
}

campoBusca.addEventListener('input', () => {
  clearTimeout(relogioBusca);
  relogioBusca = setTimeout(() => executarBusca(), ESPERA_BUSCA_MS);
});
campoBusca.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (campoBusca.value !== busca.termo) {
      clearTimeout(relogioBusca);
      executarBusca();
    } else {
      passo(e.shiftKey ? -1 : 1);
    }
  } else if (e.key === 'Escape' && campoBusca.value) {
    e.preventDefault();
    campoBusca.value = '';
    clearTimeout(relogioBusca);
    executarBusca();
  }
});
btnProximo.addEventListener('click', () => passo(1));
btnAnterior.addEventListener('click', () => passo(-1));

// ---------- barra, avisos e erro ----------

function mostrarInfo(partes: string[]): void {
  info.replaceChildren(...partes.map((p) => el('span', 'leitor-xml__dado', p)));
}

function mostrarAvisos(lista: string[]): void {
  avisos.replaceChildren(...lista.map((a) => el('p', 'leitor-xml__aviso', a)));
  avisos.hidden = lista.length === 0;
}

btnArvore.addEventListener('click', () => trocarVista('arvore'));
btnTexto.addEventListener('click', () => trocarVista('texto'));

btnVerErro.addEventListener('click', () => {
  if (linhaErro < 0) return;
  trocarVista('texto');
  rolagemTexto.irPara(linhaErro);
  areaTexto.focus();
});

btnBloco.addEventListener('click', async () => {
  btnBloco.disabled = true;
  try {
    const r = await api.abrirNoBlocoDeNotas();
    if (!r.ok) {
      mostrarAvisos([
        ...[...avisos.children].map((p) => p.textContent ?? ''),
        r.mensagem,
      ]);
    }
  } finally {
    btnBloco.disabled = false;
  }
});

// ---------- abrir e fechar ----------

function limpar(): void {
  leitura = null;
  texto = '';
  linhas = null;
  modelo = null;
  selecionada = 0;
  linhaErro = -1;
  busca = { termo: '', achados: [], truncado: false, atual: -1 };
  campoBusca.value = '';
  contador.textContent = '';
  rolagemArvore.definir(0);
  rolagemTexto.definir(0);
  mostrarInfo([]);
  mostrarAvisos([]);
  faixaErro.hidden = true;
  arquivoLido = null;
}

function mostrarEstado(titulo: string | null, ...linhasEstado: string[]): void {
  estado.replaceChildren(
    ...(titulo ? [el('p', 'leitor-xml__estado-titulo', titulo)] : []),
    ...linhasEstado.map((l) => el('p', 'leitor-xml__estado-texto', l)),
  );
  estado.hidden = false;
  areaArvore.hidden = true;
  areaTexto.hidden = true;
  faixaBusca.hidden = true;
  seletorVista.hidden = true;
}

function mostrarRecusa(
  r: Extract<ResultadoLeitorXml, { status: 'recusado' }>,
): void {
  arquivoLido = { arquivo: r.arquivo, raiz: null };
  aoLer(arquivoLido);
  if (r.arquivo.tamanho !== null)
    mostrarInfo([formatarTamanho(r.arquivo.tamanho)]);
  if (r.motivo === 'cancelado') {
    mostrarEstado('Leitura cancelada', 'Para ver o arquivo, abra de novo.');
    return;
  }
  const extra =
    r.motivo === 'grande'
      ? [DICA_GRANDE]
      : r.motivo === 'binario'
        ? ['Se quiser ver o conteúdo mesmo assim, use o Bloco de Notas.']
        : [];
  mostrarEstado('Não foi possível mostrar este arquivo', r.mensagem, ...extra);
}

function mostrarLeitura(
  r: Extract<ResultadoLeitorXml, { status: 'ok' }>,
  textoLido: string,
): void {
  leitura = r.leitura;
  texto = textoLido;
  linhas = r.leitura.linhas;
  modelo = r.leitura.arvore ? new ModeloArvore(r.leitura.arvore) : null;
  arquivoLido = { arquivo: r.arquivo, raiz: nomeDaRaiz(r.leitura) };
  aoLer(arquivoLido);

  const tamanho = r.arquivo.tamanho ?? textoLido.length;
  mostrarInfo([
    formatarTamanho(tamanho),
    `Codificação: ${descreverCodificacao(r.leitura.codificacao)}`,
    textoLinhas(totalNumerado(linhas)),
  ]);

  const lista: string[] = [];
  if (r.leitura.semArvore === 'tamanho') {
    const aviso = avisoModoLeve(tamanho);
    if (aviso) lista.push(aviso);
  }
  if (r.leitura.semArvore === 'profundidade') lista.push(AVISO_PROFUNDIDADE);
  if (r.leitura.avisoCodificacao) lista.push(r.leitura.avisoCodificacao);
  if (r.leitura.doctype) lista.push(AVISO_DOCTYPE);
  const controles = avisoControles(r.leitura.controles);
  if (controles) lista.push(controles);
  if (!linhas.indentado) lista.push(MENSAGEM_SEM_INDENTACAO);
  if (linhas.cortado) lista.push(MENSAGEM_LINHAS_CORTADAS);
  mostrarAvisos(lista);

  const erro = r.leitura.erro;
  linhaErro = erro ? linhaDaPosicao(linhas, erro.posicao) : -1;
  faixaErro.hidden = !erro;
  if (erro)
    erroTexto.textContent = `${mensagemErroXml(erro)} ${COMPLEMENTO_ERRO_ARVORE}`;

  estado.hidden = true;
  faixaBusca.hidden = false;
  seletorVista.hidden = false;
  btnArvore.disabled = !modelo;
  rolagemTexto.definir(linhas.quantidade);
  if (modelo) {
    modelo.abrirInicial();
    selecionada = 0;
    rolagemArvore.definir(modelo.visiveis.length);
  }
  const margem = String(totalNumerado(linhas)).length + 1;
  areaTexto.style.setProperty('--lx-margem', `${margem}ch`);
  // A vista que abre: Árvore quando existe; Texto no modo leve.
  mostrarVista(modelo ? 'arvore' : 'texto');
  rolagemArvore.redesenhar();
  rolagemTexto.redesenhar();
  (modelo ? areaArvore : areaTexto).focus();
}

/**
 * Cada documento ganha um número. Um documento novo (ou a volta para a tela
 * inicial) descarta o que o anterior ainda estava lendo (o processo
 * principal cancela a leitura no serviço).
 */
let abertura = 0;
/** A leitura do documento atual já foi pedida. */
let pedida = false;

/** Lê o arquivo que o principal guardou para esta janela. */
async function ler(): Promise<void> {
  const esta = ++abertura;
  const atual = () => esta === abertura;
  try {
    limpar();
    mostrarEstado(null, 'Lendo o arquivo…');
    const r = await api.carregar();
    if (!atual()) return;
    if (r.status === 'sem-arquivo') {
      mostrarEstado(
        'Não foi possível mostrar este arquivo',
        'O arquivo não está mais aberto nesta janela.',
      );
      return;
    }
    if (r.status === 'recusado') {
      mostrarRecusa(r);
      return;
    }
    const textoLido = await api.texto();
    if (!atual()) return;
    if (textoLido === null) {
      mostrarEstado(
        'Não foi possível mostrar este arquivo',
        'O arquivo mudou enquanto era lido. Tente de novo.',
      );
      return;
    }
    mostrarLeitura(r, textoLido);
  } catch {
    if (!atual()) return;
    mostrarEstado(
      'Não foi possível mostrar este arquivo',
      'Aconteceu um erro ao ler o arquivo.',
    );
  }
}

/** Nome do elemento raiz da leitura, ou null (sem árvore). */
function nomeDaRaiz(l: LeituraSemTexto): string | null {
  const a = l.arvore;
  if (!a) return null;
  for (let no = a.primeiraRaiz; no !== NENHUM; no = a.proximoIrmao[no])
    if (TIPOS[a.tipo[no]] === 'elemento') return nomeDe(a, no);
  return null;
}

/**
 * Mostra o modo .XML (lê o arquivo na primeira vez de cada documento). As
 * vistas são redesenhadas: escondidas, elas não tinham medida.
 */
export function mostrarXml(): void {
  raiz.hidden = false;
  if (!pedida) {
    pedida = true;
    void ler();
    return;
  }
  rolagemArvore.redesenhar();
  rolagemTexto.redesenhar();
}

/** Esconde o modo .XML (a leitura feita fica guardada). */
export function esconderXml(): void {
  raiz.hidden = true;
}

/**
 * Documento novo na janela, ou a volta para a tela inicial: esquece a
 * leitura e descarta a que estiver em andamento.
 */
export function novoDocumentoXml(): void {
  abertura++;
  pedida = false;
  raiz.hidden = true;
  limpar();
}

/**
 * Pede a leitura sem mostrar (XML que não é NF-e: o título da janela precisa
 * do nome do arquivo e da raiz).
 */
export function lerXml(): void {
  if (pedida) return;
  pedida = true;
  void ler();
}

/** Avisa a cada leitura terminada: o arquivo e a raiz (ou null). */
export function aoLerXml(
  callback: (
    dados: { arquivo: InfoArquivo; raiz: string | null } | null,
  ) => void,
): void {
  aoLer = callback;
}

/** O arquivo da última leitura (nome e tamanho), ou null. */
export function arquivoXml(): {
  arquivo: InfoArquivo;
  raiz: string | null;
} | null {
  return arquivoLido;
}

// ---------- teclado e arrastar ----------

// Atalhos do modo .XML: Ctrl+F vai para a busca e F3 passa pelos achados.
// As outras teclas seguem para os atalhos da tela (Ctrl+O, por exemplo).
raiz.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
  if (
    ctrl &&
    !e.shiftKey &&
    e.key.toLowerCase() === 'f' &&
    !faixaBusca.hidden
  ) {
    e.preventDefault();
    e.stopPropagation();
    campoBusca.focus();
    campoBusca.select();
  } else if (e.key === 'F3' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    passo(e.shiftKey ? -1 : 1);
  }
});
