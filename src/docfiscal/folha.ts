// Desenho dos documentos auxiliares do modelo comum (./modelo.ts) em folhas
// (A4 retrato, ou a bobina da NFC-e), com a paginação: cada bloco entra na
// folha já desenhada e é medido; o que não cabe vai para a folha seguinte,
// com o cabeçalho repetido, e a tabela continua linha a linha. "FOLHA X/Y" é
// escrito no fim, quando o total é conhecido. Todo texto do XML entra por
// textContent. Os dados são selecionáveis; os rótulos, não (docfiscal.css).

import { barrasCode128C } from '../danfe/code128';
import type { Alinhamento, Bloco, Campo } from './modelo';
import { gerarQrCode, type NivelCorrecao } from './qrcode';

type Filho = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
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

const SVG = 'http://www.w3.org/2000/svg';

/** QR Code em SVG (com a zona de silêncio de 4 módulos), ou null se não cabe. */
export function qrSvg(
  texto: string,
  rotulo: string,
  nivel: NivelCorrecao = 'M',
): SVGSVGElement | null {
  let q: ReturnType<typeof gerarQrCode>;
  try {
    q = gerarQrCode(texto, nivel);
  } catch {
    return null;
  }
  const lado = q.tamanho + 8;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'dx-qr');
  svg.setAttribute('viewBox', `0 0 ${lado} ${lado}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', rotulo);
  const fundo = document.createElementNS(SVG, 'rect');
  fundo.setAttribute('width', String(lado));
  fundo.setAttribute('height', String(lado));
  fundo.setAttribute('fill', '#fff');
  let d = '';
  q.modulos.forEach((linha, y) =>
    linha.forEach((escuro, x) => {
      if (escuro) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    }),
  );
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', '#000');
  svg.append(fundo, p);
  return svg;
}

/** Código de barras CODE-128C da chave em SVG, ou null se a chave não serve. */
export function barrasSvg(chave: string, rotulo: string): SVGSVGElement | null {
  let b: ReturnType<typeof barrasCode128C>;
  try {
    b = barrasCode128C(chave);
  } catch {
    return null;
  }
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'dx-barras');
  svg.setAttribute('viewBox', `0 0 ${b.total} 1`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', rotulo);
  const fundo = document.createElementNS(SVG, 'rect');
  fundo.setAttribute('width', String(b.total));
  fundo.setAttribute('height', '1');
  fundo.setAttribute('fill', '#fff');
  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('fill', '#000');
  for (const { x, largura } of b.barras) {
    const r = document.createElementNS(SVG, 'rect');
    r.setAttribute('x', String(x));
    r.setAttribute('width', String(largura));
    r.setAttribute('height', '1');
    g.append(r);
  }
  svg.append(fundo, g);
  return svg;
}

const classeAlinhar = (a: Alinhamento | undefined) =>
  a === 'dir' ? ' dx-dir' : a === 'centro' ? ' dx-centro' : '';

/** Um campo: rótulo (não selecionável) e valor (selecionável). */
export function desenharCampo(c: Campo): HTMLElement {
  const e = el(
    'div',
    `dx-campo${classeAlinhar(c.alinhar)}${c.destaque ? ' dx-campo--destaque' : ''}`,
    c.rotulo ? el('div', 'dx-campo__rotulo', c.rotulo) : null,
    el('div', 'dx-campo__valor', c.valor),
  );
  e.style.flex = `${c.peso} 1 0`;
  return e;
}

function desenharTabela(t: NonNullable<Bloco['tabela']>): HTMLTableElement {
  const total = t.colunas.reduce((s, c) => s + c.peso, 0);
  const tabela = el('table', 'dx-tabela');
  const grupo = el('colgroup');
  for (const c of t.colunas) {
    const col = el('col');
    col.style.width = `${(c.peso / total) * 100}%`;
    grupo.append(col);
  }
  tabela.append(
    grupo,
    el(
      'thead',
      '',
      el(
        'tr',
        '',
        ...t.colunas.map((c) =>
          el('th', `dx-tabela__rotulo${classeAlinhar(c.alinhar)}`, c.titulo),
        ),
      ),
    ),
  );
  const corpo = el('tbody');
  for (const l of t.linhas) corpo.append(linhaTabela(l, t.colunas));
  tabela.append(corpo);
  return tabela;
}

function linhaTabela(
  l: string[],
  colunas: NonNullable<Bloco['tabela']>['colunas'],
): HTMLTableRowElement {
  return el(
    'tr',
    '',
    ...l.map((v, i) => el('td', classeAlinhar(colunas[i]?.alinhar).trim(), v)),
  );
}

/** Desenha um bloco do modelo. */
export function desenharBloco(b: Bloco): HTMLElement {
  const s = el(
    'section',
    `dx-bloco dx-bloco--${b.chave}`,
    b.titulo ? el('h2', 'dx-bloco__titulo', b.titulo) : null,
  );
  if (b.aviso !== undefined) s.append(el('p', 'dx-aviso', b.aviso));
  for (const l of b.linhas ?? [])
    s.append(el('div', 'dx-linha', ...l.map(desenharCampo)));
  if (b.texto)
    s.append(
      el(
        'div',
        'dx-texto',
        b.texto.rotulo ? el('div', 'dx-campo__rotulo', b.texto.rotulo) : null,
        el('div', 'dx-texto__valor', b.texto.valor),
      ),
    );
  if (b.tabela) s.append(desenharTabela(b.tabela));
  return s;
}

// ---------- folhas ----------

export interface Paginacao {
  /** Classe da folha: folha--<classe>. */
  classe: string;
  /** Cabeçalho de cada folha; `numero` recebe "FOLHA X/Y" no fim. */
  cabecalho(numero: HTMLElement, primeira: boolean): HTMLElement;
  /** Blocos (do modelo ou já desenhados), na ordem. */
  blocos: (Bloco | HTMLElement)[];
  /** No pé da última folha (texto do app, fora do corpo do documento). */
  rodape?: HTMLElement | null;
  /** Marca d'água (homologação), ou null. */
  marca?: string | null;
  /** Uma folha só (DANFSe, NFC-e): sem paginação. */
  umaFolha?: boolean;
}

interface FolhaMontada {
  raiz: HTMLElement;
  corpo: HTMLElement;
  numero: HTMLElement;
}

const FOLGA_PX = 2;

function cabeNoCorpo(corpo: HTMLElement): boolean {
  const limite = corpo.getBoundingClientRect().bottom;
  return Array.from(corpo.children).every(
    (c) => c.getBoundingClientRect().bottom <= limite - FOLGA_PX + 0.5,
  );
}

/**
 * Monta as folhas em `container` (visível, para as medições). Devolve o
 * total de folhas.
 */
export function montarFolhas(container: HTMLElement, p: Paginacao): number {
  container.replaceChildren();
  const folhas: FolhaMontada[] = [];
  const nova = (): FolhaMontada => {
    const numero = el('span', 'dx-folha-numero', 'FOLHA');
    const corpo = el('div', 'dx-corpo');
    corpo.append(p.cabecalho(numero, folhas.length === 0));
    const raiz = el('div', `folha dx-folha folha--${p.classe}`, corpo);
    if (p.marca) raiz.append(el('div', 'dx-marca', p.marca));
    container.append(raiz);
    const fl = { raiz, corpo, numero };
    folhas.push(fl);
    return fl;
  };
  let atual = nova();
  for (const item of p.blocos) {
    const ehBloco = !(item instanceof HTMLElement);
    let elemento = ehBloco ? desenharBloco(item) : item;
    atual.corpo.append(elemento);
    if (p.umaFolha || cabeNoCorpo(atual.corpo)) continue;
    // Tabela: as linhas que couberem ficam; o resto continua na próxima.
    if (ehBloco && item.tabela && item.tabela.linhas.length > 1) {
      let restantes = item.tabela.linhas;
      for (;;) {
        const corpoTabela = elemento.querySelector('tbody');
        const linhas = corpoTabela ? Array.from(corpoTabela.rows) : [];
        let ficam = linhas.length;
        while (ficam > 0 && !cabeNoCorpo(atual.corpo)) {
          linhas[--ficam].remove();
        }
        if (ficam === 0 && atual.corpo.children.length > 2) elemento.remove();
        else if (ficam === 0) ficam = 1; // nem uma linha cabe: fica assim mesmo
        restantes = restantes.slice(ficam === 0 ? 0 : ficam);
        if (restantes.length === 0) break;
        atual = nova();
        elemento = desenharBloco({
          ...item,
          tabela: { ...item.tabela, linhas: restantes },
        });
        atual.corpo.append(elemento);
        if (cabeNoCorpo(atual.corpo)) break;
      }
      continue;
    }
    // Outro bloco: vai inteiro para a folha seguinte (se a atual tem mais
    // que o cabeçalho); sozinho e maior que a folha, fica cortado.
    if (atual.corpo.children.length > 2) {
      elemento.remove();
      atual = nova();
      atual.corpo.append(elemento);
    }
  }
  if (p.rodape) atual.corpo.append(p.rodape);
  const total = folhas.length;
  folhas.forEach((fl, i) => {
    fl.numero.textContent = `FOLHA ${i + 1}/${total}`;
    fl.raiz.dataset.folha = String(i + 1);
  });
  return total;
}
