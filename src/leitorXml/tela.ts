// Tela do leitor genérico de XML (parte 1): um XML qualquer, só leitura, em
// duas vistas (Árvore e Texto), com busca, a barra do arquivo e o Bloco de
// Notas. Módulo separado: monta a própria seção por cima do app e só fala com
// o processo principal pela ponte window.psLeitorXml.
//
// Abre quando o principal manda mostrar: XML que não é NF-e pelo botão
// Abrir, pelo arrastar, pela nota recente, pelo duplo clique ou pelo "Abrir
// com" (src/leitorXml/destino.ts e decidirAbertura em main.ts).
//
// Texto do arquivo nunca vira HTML: cada pedaço entra com textContent.

import logoUrl from '../../assets/ps-logo.svg?url';
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
import type { LeituraSemTexto, ResultadoLeitorXml } from './tipos';

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
raiz.setAttribute('aria-label', 'Leitor de XML');

const logo = el('img', 'leitor-xml__logo');
logo.src = logoUrl;
logo.alt = '';
const nomeArquivo = el('strong', 'leitor-xml__nome');
const caminhoArquivo = el('span', 'leitor-xml__caminho');
const titulo = el('div', 'leitor-xml__titulo', nomeArquivo, caminhoArquivo);

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
const btnBloco = botao('botao botao--claro', 'Abrir no Bloco de Notas');
const btnFechar = botao('botao botao--claro', 'Fechar');
const acoes = el('div', 'leitor-xml__acoes', seletorVista, btnBloco, btnFechar);
const barra = el('header', 'leitor-xml__barra', logo, titulo, acoes);

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

raiz.append(barra, info, avisos, faixaErro, faixaBusca, conteudo);
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
/** Elementos que ficaram inertes enquanto a tela está aberta. */
let inertes: Element[] = [];

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

btnFechar.addEventListener('click', () => void fechar());

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
  nomeArquivo.textContent = '';
  caminhoArquivo.textContent = '';
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

function travarResto(sim: boolean): void {
  if (sim) {
    // O cartão de andamento do serviço (com o Cancelar) fica de fora.
    inertes = [...document.body.children].filter(
      (e) =>
        e !== raiz &&
        !(e as HTMLElement).inert &&
        !(e as HTMLElement).hasAttribute('data-fora-do-leitor'),
    );
    for (const e of inertes) (e as HTMLElement).inert = true;
  } else {
    for (const e of inertes) (e as HTMLElement).inert = false;
    inertes = [];
  }
}

function mostrarRecusa(
  r: Extract<ResultadoLeitorXml, { status: 'recusado' }>,
): void {
  nomeArquivo.textContent = r.arquivo.nome;
  caminhoArquivo.textContent = r.arquivo.caminho;
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
  nomeArquivo.textContent = r.arquivo.nome;
  caminhoArquivo.textContent = r.arquivo.caminho;

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
 * Cada abertura ganha um número. Fechar, ou uma abertura nova, descarta o
 * que a anterior ainda estava lendo (o Fechar também cancela a leitura no
 * serviço, no principal).
 */
let abertura = 0;

/** Mostra a tela e lê o arquivo que o principal guardou para esta janela. */
async function mostrar(): Promise<void> {
  const esta = ++abertura;
  const atual = () => esta === abertura;
  try {
    limpar();
    if (raiz.hidden) travarResto(true);
    raiz.hidden = false;
    raiz.focus();
    mostrarEstado(null, 'Lendo o arquivo…');
    const r = await api.carregar();
    if (!atual()) return;
    if (r.status === 'sem-arquivo') {
      await fechar();
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

async function fechar(): Promise<void> {
  abertura++;
  raiz.hidden = true;
  travarResto(false);
  limpar();
  await api.fechar();
}

// ---------- teclado e arrastar ----------

// Atalhos do leitor. As teclas apertadas aqui dentro não chegam aos atalhos
// da tela da nota (Ctrl+O, Ctrl+S, Ctrl+P, zoom).
raiz.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
  if (
    ctrl &&
    !e.shiftKey &&
    e.key.toLowerCase() === 'f' &&
    !faixaBusca.hidden
  ) {
    e.preventDefault();
    campoBusca.focus();
    campoBusca.select();
  } else if (e.key === 'F3' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    passo(e.shiftKey ? -1 : 1);
  }
  e.stopPropagation();
});

// Arquivo solto por cima do leitor não abre por baixo, na tela da nota.
for (const tipo of ['dragover', 'drop'] as const) {
  raiz.addEventListener(tipo, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  });
}

api.aoMostrar(() => void mostrar());
