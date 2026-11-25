// Tela do modo Formato original da aba XML (montagem em ./montar.ts): seções
// recolhíveis, pares rótulo e valor, tabelas com o detalhe de cada linha,
// busca e Expandir/Recolher tudo. Fica ao lado do painel Leitura, com
// rolagem própria. Usa a leitura do modo .XML (o mesmo arquivo, lido uma vez
// no serviço de leitura pesada). Texto do arquivo nunca vira HTML: tudo entra
// com textContent.

import { carregarXml, leituraXml } from '../leitorXml/tela';
import { AVISO_PROFUNDIDADE } from '../leitorXml/formato';
import { MENSAGEM_ARVORE_DESLIGADA } from '../xml/limites';
import {
  montarFormato,
  type Bloco,
  type Campo,
  type Coluna,
  type Linha,
} from './montar';

/** Linhas de tabela desenhadas de cada vez ("Mostrar mais"). */
const LINHAS_POR_VEZ = 300;
/** Valor mais longo que isto ocupa a linha inteira. */
const VALOR_LARGO = 60;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe: string,
  ...filhos: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  for (const f of filhos) if (f !== null && f !== false) e.append(f);
  return e;
}

function botao(
  classe: string,
  ...filhos: (Node | string)[]
): HTMLButtonElement {
  const b = el('button', classe, ...filhos);
  b.type = 'button';
  return b;
}

// ---------- montagem da seção ----------

const raiz = el('section', 'formato-original');
raiz.id = 'formato-original';
raiz.hidden = true;
raiz.setAttribute('aria-label', 'Formato original do XML');

const campoBusca = el('input', 'formato-original__campo');
campoBusca.type = 'search';
campoBusca.id = 'formato-busca';
campoBusca.spellcheck = false;
campoBusca.autocomplete = 'off';
const rotuloBusca = el('label', 'formato-original__rotulo', 'Buscar');
rotuloBusca.htmlFor = campoBusca.id;
const contador = el('span', 'formato-original__contador');
contador.setAttribute('aria-live', 'polite');
const btnAnterior = botao('botao botao--claro botao--pequeno', 'Anterior');
const btnProximo = botao('botao botao--claro botao--pequeno', 'Próximo');
const btnExpandir = botao('botao botao--claro botao--pequeno', 'Expandir tudo');
const btnRecolher = botao('botao botao--claro botao--pequeno', 'Recolher tudo');
const ferramentas = el(
  'div',
  'formato-original__ferramentas',
  rotuloBusca,
  campoBusca,
  contador,
  btnAnterior,
  btnProximo,
  el('span', 'formato-original__espaco'),
  btnExpandir,
  btnRecolher,
);
const conteudo = el('div', 'formato-original__conteudo');
conteudo.tabIndex = -1;
raiz.append(ferramentas, conteudo);
document.body.append(raiz);

// ---------- estado ----------

let documento = 0;
let montado = false;
let aoVerXml: () => void = () => {};
let achados: HTMLElement[] = [];
/**
 * As tabelas desenhadas: a busca olha os dados de todas as linhas e desenha
 * até a última linha com achado (as tabelas mostram 300 linhas por vez).
 */
let tabelas: {
  linhas: Linha[];
  desenhadas: () => number;
  desenharAte: (n: number) => void;
}[] = [];
let atual = -1;
let relogioBusca: ReturnType<typeof setTimeout> | undefined;

// ---------- desenho ----------

function tag(texto: string, atributo = false): HTMLElement {
  return el('span', 'formato-original__tag', atributo ? `@${texto}` : texto);
}

function campoEl(c: Campo): HTMLElement {
  const rotulo = el(
    'span',
    'formato-original__rotulo-campo',
    c.rotulo ? el('span', 'formato-original__rotulo-texto', c.rotulo) : null,
    tag(c.tag, c.atributo),
  );
  const valor = el(
    'div',
    'formato-original__valor',
    c.valor,
    c.sentido ? el('span', 'formato-original__sentido', c.sentido) : null,
  );
  const e = el('div', 'formato-original__campo-par', rotulo, valor);
  if (c.valor.length > VALOR_LARGO)
    e.classList.add('formato-original__campo-par--largo');
  return e;
}

function camposEl(campos: Campo[]): HTMLElement {
  return el('div', 'formato-original__campos', ...campos.map(campoEl));
}

/** Cabeçalho recolhível: seta, título, tag, atributos e a quantidade. */
function cabecalho(
  tags: string[],
  titulo: string | null,
  atributos: Campo[],
  quantidade: string | null,
  corpo: HTMLElement,
): HTMLButtonElement {
  const cab = botao(
    'formato-original__cabecalho',
    el('span', 'formato-original__seta', '▾'),
    titulo
      ? el('span', 'formato-original__titulo', titulo)
      : el(
          'span',
          'formato-original__titulo formato-original__titulo--tag',
          tags.join(' / '),
        ),
  );
  if (titulo) cab.append(tag(tags.join(' / ')));
  for (const a of atributos) {
    const chip = el(
      'span',
      'formato-original__atributo',
      `${a.tag} = `,
      el('b', '', a.valor),
    );
    cab.append(chip);
  }
  if (quantidade)
    cab.append(el('span', 'formato-original__quantidade', quantidade));
  cab.setAttribute('aria-expanded', 'true');
  cab.addEventListener('click', () => alternar(cab, corpo));
  return cab;
}

function alternar(cab: HTMLElement, corpo: HTMLElement, abrir?: boolean): void {
  const aberto = abrir ?? corpo.hidden === true;
  corpo.hidden = !aberto;
  cab.setAttribute('aria-expanded', String(aberto));
  const seta = cab.querySelector('.formato-original__seta');
  if (seta) seta.textContent = aberto ? '▾' : '▸';
}

function blocosEl(blocos: Bloco[], nivel: number, lado = false): HTMLElement[] {
  const saida: HTMLElement[] = [];
  let grupo: HTMLElement | null = null;
  for (const b of blocos) {
    const e = blocoEl(b, nivel);
    // Seções lado a lado (impostos do item): numa grade.
    if (lado && b.tipo === 'secao') {
      if (!grupo) {
        grupo = el('div', 'formato-original__lado');
        saida.push(grupo);
      }
      grupo.append(e);
      continue;
    }
    grupo = null;
    saida.push(e);
  }
  return saida;
}

function blocoEl(b: Bloco, nivel: number): HTMLElement {
  if (b.tipo === 'campos') {
    const c = camposEl(b.campos);
    return nivel === 0
      ? el(
          'section',
          'formato-original__secao formato-original__secao--solta',
          c,
        )
      : c;
  }
  const corpo = el('div', 'formato-original__corpo');
  const secao = el(
    'section',
    nivel === 0 ? 'formato-original__secao' : 'formato-original__sub',
  );
  secao.dataset.tag = b.tags[0];
  if (b.tipo === 'tabela') {
    corpo.append(tabelaEl(b.colunas, b.linhas, nivel));
    secao.append(cabecalho(b.tags, b.titulo, [], b.quantidade, corpo), corpo);
    return secao;
  }
  corpo.append(...blocosEl(b.blocos, nivel + 1, b.lado));
  secao.append(cabecalho(b.tags, b.titulo, b.atributos, null, corpo), corpo);
  return secao;
}

function tabelaEl(
  colunas: Coluna[],
  linhas: Linha[],
  nivel: number,
): HTMLElement {
  const temDetalhe = linhas.some((l) => l.detalhe.length > 0);
  const tabela = el('table', 'formato-original__tabela');
  const cabeca = el('tr', '');
  if (temDetalhe) cabeca.append(el('th', 'formato-original__abrir-col'));
  for (const c of colunas)
    cabeca.append(
      el(
        'th',
        c.numerica ? 'num' : '',
        c.rotulo
          ? el('span', 'formato-original__rotulo-texto', c.rotulo)
          : null,
        tag(c.tag, c.atributo),
      ),
    );
  const corpo = el('tbody', '');
  tabela.append(el('thead', '', cabeca), corpo);
  let feitas = 0;
  const mais = botao(
    'botao botao--claro botao--pequeno formato-original__mais',
    '',
  );
  /** Desenha as linhas até `limite` (ou mais uma página, sem limite). */
  const desenharMais = (limite?: number) => {
    const ate = Math.min(
      linhas.length,
      Math.max(limite ?? 0, feitas + LINHAS_POR_VEZ),
    );
    for (; feitas < ate; feitas++) {
      const l = linhas[feitas];
      const tr = el('tr', 'formato-original__linha');
      let detalhe: HTMLTableRowElement | null = null;
      if (temDetalhe) {
        const td = el('td', 'formato-original__abrir-col');
        if (l.detalhe.length) {
          const b = botao('formato-original__abrir', '▸');
          b.setAttribute('aria-expanded', 'false');
          b.setAttribute('aria-label', `Detalhe da linha ${feitas + 1}`);
          td.append(b);
          detalhe = el('tr', 'formato-original__detalhe');
          detalhe.hidden = true;
          const cel = el('td', '');
          cel.colSpan = colunas.length + 1;
          cel.append(...blocosEl(l.detalhe, nivel + 1));
          detalhe.append(cel);
          const d = detalhe;
          b.addEventListener('click', () =>
            abrirDetalhe(b, d, d.hidden === true),
          );
        }
        tr.append(td);
      }
      l.celulas.forEach((v, i) =>
        tr.append(el('td', colunas[i]?.numerica ? 'num' : '', v)),
      );
      corpo.append(tr);
      if (detalhe) corpo.append(detalhe);
    }
    mais.hidden = feitas >= linhas.length;
    const faltam = linhas.length - feitas;
    mais.textContent =
      faltam === 1
        ? 'Mostrar mais 1 linha'
        : `Mostrar mais ${Math.min(faltam, LINHAS_POR_VEZ)} de ${faltam} linhas`;
  };
  mais.addEventListener('click', () => {
    desenharMais();
    if (campoBusca.value) buscar();
  });
  desenharMais();
  // A busca procura nos dados de todas as linhas, desenhadas ou não.
  tabelas.push({
    linhas,
    desenhadas: () => feitas,
    desenharAte: (n) => desenharMais(n),
  });
  return el('div', 'formato-original__rolagem-tabela', tabela, mais);
}

function abrirDetalhe(
  b: HTMLElement,
  detalhe: HTMLElement,
  abrir: boolean,
): void {
  detalhe.hidden = !abrir;
  b.textContent = abrir ? '▾' : '▸';
  b.setAttribute('aria-expanded', String(abrir));
}

function mostrarEstado(texto: string, comBotao: boolean): void {
  const p = el('div', 'formato-original__estado', el('p', '', texto));
  if (comBotao) {
    const b = botao('botao botao--claro', 'Ver no .XML');
    b.id = 'btn-formato-ver-xml';
    b.addEventListener('click', () => aoVerXml());
    p.append(b);
  }
  conteudo.replaceChildren(p);
  ferramentas.hidden = true;
}

async function montar(): Promise<void> {
  const este = documento;
  mostrarEstado('Lendo o arquivo…', false);
  await carregarXml();
  if (este !== documento) return;
  const { leitura, falha } = leituraXml();
  if (!leitura) {
    mostrarEstado(falha ?? 'Não foi possível mostrar este arquivo.', true);
    return;
  }
  if (!leitura.arvore) {
    const motivo =
      leitura.semArvore === 'profundidade'
        ? AVISO_PROFUNDIDADE
        : MENSAGEM_ARVORE_DESLIGADA;
    mostrarEstado(
      `${motivo} O Formato original precisa da árvore do arquivo; veja o arquivo no modo .XML.`,
      true,
    );
    return;
  }
  const f = montarFormato(leitura.arvore);
  if (f.status === 'grande') {
    mostrarEstado(f.mensagem, true);
    return;
  }
  if (f.status === 'vazio') {
    mostrarEstado('O arquivo não tem elementos para mostrar.', true);
    return;
  }
  const resumo = el(
    'p',
    'formato-original__resumo',
    f.nfe
      ? `NF-e (${f.raiz}${f.versao ? `, versão ${f.versao}` : ''}). Campos com rótulo em português e a tag ao lado; datas, números e códigos formatados para leitura. O valor exato fica no modo .XML.`
      : `XML (raiz ${f.raiz}). Os campos aparecem com o nome da tag; datas e números formatados para leitura. O valor exato fica no modo .XML.`,
  );
  tabelas = [];
  conteudo.replaceChildren(resumo, ...blocosEl(f.blocos, 0));
  ferramentas.hidden = false;
  montado = true;
  if (campoBusca.value) buscar();
}

// ---------- busca ----------

const normalizar = (t: string) =>
  t.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');

function limparAchados(): void {
  for (const e of achados)
    e.classList.remove(
      'formato-original__achado',
      'formato-original__achado--atual',
    );
  achados = [];
  atual = -1;
}

/** Todo o texto de uma linha de tabela: as células e o detalhe dela. */
function textoDosBlocos(blocos: Bloco[]): string {
  const partes: string[] = [];
  const campos = (cs: Campo[]) => {
    for (const c of cs)
      partes.push(c.rotulo ?? '', c.tag, c.valor, c.sentido ?? '');
  };
  for (const b of blocos) {
    if (b.tipo === 'campos') campos(b.campos);
    else if (b.tipo === 'secao') {
      partes.push(b.titulo ?? '', ...b.tags);
      campos(b.atributos);
      partes.push(textoDosBlocos(b.blocos));
    } else {
      partes.push(b.titulo ?? '', ...b.tags);
      for (const c of b.colunas) partes.push(c.rotulo ?? '', c.tag);
      for (const l of b.linhas) partes.push(textoDaLinha(l));
    }
  }
  return partes.join('\n');
}

const textoDaLinha = (l: Linha) =>
  `${l.celulas.join('\n')}\n${textoDosBlocos(l.detalhe)}`;

/**
 * Desenha as linhas que faltam até a última com o termo, em cada tabela
 * (as de dentro do detalhe também entram, quando o detalhe é desenhado).
 */
function desenharAteOsAchados(termo: string): void {
  for (let i = 0; i < tabelas.length; i++) {
    const t = tabelas[i];
    for (let n = t.linhas.length - 1; n >= t.desenhadas(); n--) {
      if (normalizar(textoDaLinha(t.linhas[n])).includes(termo)) {
        t.desenharAte(n + 1);
        break;
      }
    }
  }
}

function buscar(): void {
  limparAchados();
  const termo = normalizar(campoBusca.value.trim());
  if (!termo) {
    contador.textContent = '';
    return;
  }
  desenharAteOsAchados(termo);
  for (const e of conteudo.querySelectorAll<HTMLElement>(
    '.formato-original__valor, .formato-original__rotulo-texto, .formato-original__tag, .formato-original__titulo, td:not(.formato-original__abrir-col)',
  ))
    if (normalizar(e.textContent ?? '').includes(termo)) achados.push(e);
  for (const e of achados) e.classList.add('formato-original__achado');
  contador.textContent =
    achados.length === 0 ? 'Nenhum resultado' : `1 de ${achados.length}`;
  if (achados.length) irPara(0);
}

/** Mostra o achado `i`: abre as seções e o detalhe em volta e rola até ele. */
function irPara(i: number): void {
  if (!achados.length) return;
  achados[atual]?.classList.remove('formato-original__achado--atual');
  atual = (i + achados.length) % achados.length;
  const e = achados[atual];
  e.classList.add('formato-original__achado--atual');
  for (let p = e.parentElement; p && p !== conteudo; p = p.parentElement) {
    if (p.classList.contains('formato-original__corpo') && p.hidden) {
      const cab = p.previousElementSibling as HTMLElement | null;
      if (cab) alternar(cab, p, true);
    }
    if (p.classList.contains('formato-original__detalhe') && p.hidden) {
      const b = p.previousElementSibling?.querySelector<HTMLElement>(
        '.formato-original__abrir',
      );
      if (b) abrirDetalhe(b, p, true);
    }
  }
  contador.textContent = `${atual + 1} de ${achados.length}`;
  e.scrollIntoView({ block: 'center' });
}

campoBusca.addEventListener('input', () => {
  clearTimeout(relogioBusca);
  relogioBusca = setTimeout(buscar, 200);
});
campoBusca.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    irPara(atual + (e.shiftKey ? -1 : 1));
  } else if (e.key === 'Escape' && campoBusca.value) {
    e.preventDefault();
    campoBusca.value = '';
    buscar();
  }
});
btnProximo.addEventListener('click', () => irPara(atual + 1));
btnAnterior.addEventListener('click', () => irPara(atual - 1));

function todas(abrir: boolean): void {
  for (const cab of conteudo.querySelectorAll<HTMLElement>(
    '.formato-original__cabecalho',
  )) {
    const corpo = cab.nextElementSibling as HTMLElement | null;
    if (corpo) alternar(cab, corpo, abrir);
  }
  for (const b of conteudo.querySelectorAll<HTMLElement>(
    '.formato-original__abrir',
  )) {
    const d = b.closest('tr')?.nextElementSibling as HTMLElement | null;
    if (d) abrirDetalhe(b, d, abrir);
  }
}
btnExpandir.addEventListener('click', () => todas(true));
btnRecolher.addEventListener('click', () => todas(false));

// Ctrl+F vai para a busca; F3 passa pelos achados.
raiz.addEventListener('keydown', (e) => {
  if (
    e.ctrlKey &&
    !e.altKey &&
    !e.metaKey &&
    !e.shiftKey &&
    e.key.toLowerCase() === 'f'
  ) {
    e.preventDefault();
    e.stopPropagation();
    campoBusca.focus();
    campoBusca.select();
  } else if (e.key === 'F3' && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    e.stopPropagation();
    irPara(atual + (e.shiftKey ? -1 : 1));
  }
});

// ---------- o que a tela da nota usa ----------

/**
 * Mostra o Formato original (monta na primeira vez de cada documento).
 * `verXml`: o "Ver no .XML" do aviso de arquivo grande.
 */
export function mostrarFormato(verXml: () => void): void {
  aoVerXml = verXml;
  raiz.hidden = false;
  if (!montado) void montar();
}

export function esconderFormato(): void {
  raiz.hidden = true;
}

/** Documento novo (ou a tela inicial): desmonta e limpa a busca. */
export function novoDocumentoFormato(): void {
  documento++;
  montado = false;
  raiz.hidden = true;
  limparAchados();
  campoBusca.value = '';
  contador.textContent = '';
  conteudo.replaceChildren();
  tabelas = [];
}
