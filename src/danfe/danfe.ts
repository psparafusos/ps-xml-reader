// Monta o DANFE (A4 retrato, folhas soltas) a partir de DadosDanfe e divide os
// itens entre as folhas. Todo texto vindo do XML entra no DOM por textContent.
//
// Regras do MOC (DANFE e Código de Barras): nenhuma informação fora do XML no
// corpo do DANFE; campo sem valor fica em branco com o quadro presente; os
// únicos textos fixos são os rótulos do modelo.
//
// Paginação: cada folha é um bloco de 210 x 297 mm. Os itens são colocados um
// a um na folha já renderizada e a altura real é medida; o item que não cabe
// inteiro vai para a folha seguinte. O total de folhas é conhecido antes de
// imprimir, e só então "FOLHA X/Y" é escrito.

import { barrasCode128C } from './code128';
import type { DadosDanfe, EnderecoDanfe, ItemDanfe } from './dados';
import * as f from '../nfe/formato';

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

function juntar(partes: string[], sep: string): string {
  return partes.filter((p) => p !== '').join(sep);
}

/** Campo do modelo: rótulo e valor. Sem valor, o quadro fica, em branco. */
function campo(rotulo: string, valor: string, classe = ''): HTMLElement {
  return el(
    'div',
    `dc ${classe}`.trim(),
    el('div', 'dc__rotulo', rotulo),
    el('div', 'dc__valor', valor),
  );
}

// ---------- grade ----------
//
// Cada faixa do DANFE é uma grade única: a grade desenha a borda de cima e a
// da esquerda, e cada célula só a da direita e a de baixo, com a espessura do
// token --danfe-traco. Assim cada linha é desenhada uma vez só, quadros
// vizinhos compartilham a borda e células da mesma linha da grade fecham na
// mesma altura.

/** Largura do corpo do DANFE em mm (A4 menos as margens). */
const LARGURA = 200;

/** Célula de uma faixa: colunas de x0 a x1 (mm) e linhas da grade r0 a r1. */
interface Celula {
  x0: number;
  x1: number;
  r0: number;
  r1: number;
  el: HTMLElement;
}

const mm = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Uma linha da grade (`r`) com larguras proporcionais (somam LARGURA depois
 * de normalizadas). `altura` > 1 faz as células ocuparem mais linhas.
 */
function linha(
  r: number,
  larguras: number[],
  campos: HTMLElement[],
  altura = 1,
): Celula[] {
  const total = larguras.reduce((a, b) => a + b, 0);
  let x = 0;
  return campos.map((c, i) => {
    const x0 = mm(x);
    x += (larguras[i] / total) * LARGURA;
    return { x0, x1: mm(x), r0: r, r1: r + altura, el: c };
  });
}

/**
 * Monta a faixa: as colunas da grade são todas as bordas verticais usadas por
 * alguma célula, então bordas que coincidem são a mesma linha.
 */
function faixa(
  classe: string,
  celulas: Celula[],
  linhas?: string,
): HTMLElement {
  const xs = [...new Set(celulas.flatMap((c) => [c.x0, c.x1]))].sort(
    (a, b) => a - b,
  );
  const g = el(
    'div',
    `df ${classe}`.trim(),
    ...celulas.map((c) => {
      c.el.style.gridColumn = `${xs.indexOf(c.x0) + 1} / ${xs.indexOf(c.x1) + 1}`;
      c.el.style.gridRow = `${c.r0} / ${c.r1}`;
      return c.el;
    }),
  );
  g.style.gridTemplateColumns = xs
    .slice(1)
    .map((x, i) => `${mm(x - xs[i])}fr`)
    .join(' ');
  if (linhas) g.style.gridTemplateRows = linhas;
  return g;
}

/** Célula vazia, para cobrir a grade onde não há campo. */
function vazia(): HTMLElement {
  return el('div', 'dc dc--vazia');
}

function quadro(titulo: string, classe: string, ...conteudo: Filho[]) {
  return el(
    'section',
    `dq ${classe}`,
    el('h2', 'dq__titulo', titulo),
    ...conteudo,
  );
}

// ---------- formatação ----------

/** "2234292" -> "002.234.292" (máscara do modelo: 000.000.000). */
function numeroNota(nNF: string): string {
  if (!/^\d{1,9}$/.test(nNF)) return nNF;
  return nNF.padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');
}

/** "2026-02-03T15:02:35-03:00" -> "03/02/2026 15:02:35" (hora do XML). */
function dataHoraSegundos(bruto: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/.exec(bruto);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : f.data(bruto);
}

/** "2026-02-03T15:04:00-03:00" -> "15:04:00" */
function hora(bruto: string): string {
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(bruto);
  return m ? m[1] : '';
}

function documento(CNPJ: string, CPF: string): string {
  return CNPJ ? f.cnpj(CNPJ) : f.cpf(CPF);
}

function logradouro(e: EnderecoDanfe): string {
  return juntar([e.xLgr, e.nro, e.xCpl], ', ');
}

// Modalidade do frete no formato "código - descrição" (MOC, item 2.1.10).
const MOD_FRETE: Record<string, string> = {
  '0': 'Remetente',
  '1': 'Destinatário',
  '2': 'Terceiros',
  '3': 'Próprio Remetente',
  '4': 'Próprio Destinatário',
  '9': 'Sem Transporte',
};

function modalidadeFrete(codigo: string): string {
  if (!codigo) return '';
  const desc = MOD_FRETE[codigo];
  return desc ? `${codigo} - ${desc}` : codigo;
}

// ---------- quadros ----------

function canhoto(d: DadosDanfe): HTMLElement {
  const recebemos = `RECEBEMOS DE ${d.emit.xNome} OS PRODUTOS CONSTANTES DA NOTA FISCAL AO LADO`;
  const nota = el(
    'div',
    'dc canhoto__nota',
    el('div', 'canhoto__nfe', 'NF-e'),
    el('div', 'canhoto__numero', `Nº ${numeroNota(d.ide.nNF)}`),
    el('div', 'canhoto__numero', `SÉRIE ${d.ide.serie}`),
  );
  return el(
    'section',
    'canhoto',
    faixa('', [
      {
        x0: 0,
        x1: 160,
        r0: 1,
        r1: 2,
        el: el('div', 'dc canhoto__texto', el('div', 'dc__rotulo', recebemos)),
      },
      { x0: 0, x1: 40, r0: 2, r1: 3, el: campo('DATA DE RECEBIMENTO', '') },
      {
        x0: 40,
        x1: 160,
        r0: 2,
        r1: 3,
        el: campo('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', ''),
      },
      { x0: 160, x1: 200, r0: 1, r1: 3, el: nota },
    ]),
    // Linha de corte: tracejada, na largura toda do corpo.
    el('div', 'canhoto__corte'),
  );
}

function codigoBarras(chave: string): SVGSVGElement | null {
  let b: ReturnType<typeof barrasCode128C>;
  try {
    b = barrasCode128C(chave);
  } catch {
    // Chave fora do formato: o campo fica em branco.
    return null;
  }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'barras');
  svg.setAttribute('viewBox', `0 0 ${b.total} 1`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Código de barras da chave de acesso');
  const fundo = document.createElementNS(ns, 'rect');
  fundo.setAttribute('x', '0');
  fundo.setAttribute('y', '0');
  fundo.setAttribute('width', String(b.total));
  fundo.setAttribute('height', '1');
  fundo.setAttribute('fill', '#fff');
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('fill', '#000');
  for (const { x, largura } of b.barras) {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', String(x));
    r.setAttribute('y', '0');
    r.setAttribute('width', String(largura));
    r.setAttribute('height', '1');
    g.append(r);
  }
  svg.append(fundo, g);
  return svg;
}

/**
 * Cabeçalho repetido em todas as folhas, na mesma disposição: emitente, bloco
 * DANFE (com folha), código de barras, chave, protocolo, natureza e inscrições.
 */
function cabecalho(d: DadosDanfe, folha: HTMLElement): HTMLElement {
  const e = d.emit.endereco;
  // Sem logo e sem área para logo: os dados ficam centralizados no quadro.
  const emitente = el(
    'div',
    'dc cab__emitente',
    el('div', 'dc__rotulo', 'IDENTIFICAÇÃO DO EMITENTE'),
    el(
      'div',
      'cab__emitente-dados',
      el('div', 'cab__razao', d.emit.xNome),
      el('div', 'cab__endereco', logradouro(e)),
      el('div', 'cab__endereco', juntar([e.xBairro, f.cep(e.CEP)], ' - ')),
      el('div', 'cab__endereco', juntar([e.xMun, e.UF], ' - ')),
      el('div', 'cab__endereco', e.fone ? `FONE: ${f.fone(e.fone)}` : ''),
    ),
  );

  const blocoDanfe = el(
    'div',
    'dc cab__danfe',
    el('div', 'cab__titulo', 'DANFE'),
    el('div', 'cab__subtitulo', 'DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA'),
    el(
      'div',
      'cab__operacao',
      el(
        'div',
        'cab__tipos',
        el('div', '', '0 - ENTRADA'),
        el('div', '', '1 - SAÍDA'),
      ),
      el('div', 'cab__tpnf', d.ide.tpNF),
    ),
    el('div', 'cab__numero', `Nº ${numeroNota(d.ide.nNF)}`),
    el('div', 'cab__numero', `SÉRIE ${d.ide.serie}`),
    el('div', 'cab__numero', folha),
  );

  const p = d.protocolo;
  const protocolo = p.nProt
    ? juntar([p.nProt, dataHoraSegundos(p.dhRecbto)], ' - ')
    : '';

  // Grade: emitente e bloco DANFE ocupam as linhas 1 a 3; à direita, barras,
  // chave e consulta. Linhas 4 e 5: natureza/protocolo e inscrições.
  return el(
    'header',
    'dq cab',
    faixa(
      'cab__grade',
      [
        { x0: 0, x1: 80, r0: 1, r1: 4, el: emitente },
        { x0: 80, x1: 114, r0: 1, r1: 4, el: blocoDanfe },
        {
          x0: 114,
          x1: 200,
          r0: 1,
          r1: 2,
          el: el('div', 'dc cab__barras', codigoBarras(d.chave)),
        },
        {
          x0: 114,
          x1: 200,
          r0: 2,
          r1: 3,
          el: campo(
            'CHAVE DE ACESSO',
            f.chaveAcesso(d.chave),
            'cab__chave-valor',
          ),
        },
        {
          x0: 114,
          x1: 200,
          r0: 3,
          r1: 4,
          el: el(
            'div',
            'dc cab__consulta',
            'Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizada',
          ),
        },
        ...linha(
          4,
          [114, 86],
          [
            campo('NATUREZA DA OPERAÇÃO', d.ide.natOp),
            campo('PROTOCOLO DE AUTORIZAÇÃO DE USO', protocolo),
          ],
        ),
        ...linha(
          5,
          [1, 1, 1],
          [
            campo('INSCRIÇÃO ESTADUAL', d.emit.IE),
            campo('INSCRIÇÃO ESTADUAL DO SUBST. TRIB.', d.emit.IEST),
            campo('CNPJ / CPF', documento(d.emit.CNPJ, d.emit.CPF)),
          ],
        ),
      ],
      'var(--danfe-cab-barras) var(--danfe-cab-chave) var(--danfe-cab-consulta) auto auto',
    ),
  );
}

function destinatario(d: DadosDanfe): HTMLElement {
  const t = d.dest;
  const e = t.endereco;
  return quadro(
    'DESTINATÁRIO / REMETENTE',
    'dq--destinatario',
    faixa('', [
      ...linha(
        1,
        [118, 50, 32],
        [
          campo('NOME / RAZÃO SOCIAL', t.xNome),
          campo(
            'CNPJ / CPF',
            t.CNPJ || t.CPF ? documento(t.CNPJ, t.CPF) : t.idEstrangeiro,
          ),
          campo('DATA DA EMISSÃO', f.data(d.ide.dhEmi)),
        ],
      ),
      ...linha(
        2,
        [90, 50, 28, 32],
        [
          campo('ENDEREÇO', logradouro(e)),
          campo('BAIRRO / DISTRITO', e.xBairro),
          campo('CEP', f.cep(e.CEP)),
          campo('DATA DA SAÍDA/ENTRADA', f.data(d.ide.dhSaiEnt)),
        ],
      ),
      ...linha(
        3,
        [70, 40, 12, 46, 32],
        [
          campo('MUNICÍPIO', e.xMun),
          campo('FONE / FAX', f.fone(e.fone)),
          campo('UF', e.UF),
          campo('INSCRIÇÃO ESTADUAL', t.IE),
          campo('HORA DA SAÍDA/ENTRADA', hora(d.ide.dhSaiEnt)),
        ],
      ),
    ]),
  );
}

/** Quadro Fatura/Duplicatas. null sem cobr: a altura volta aos produtos. */
function fatura(d: DadosDanfe): HTMLElement | null {
  const c = d.cobranca;
  if (!c) return null;
  const celulas: Celula[] = [];
  let r = 1;
  if ([c.nFat, c.vOrig, c.vDesc, c.vLiq].some((v) => v !== '')) {
    celulas.push(
      ...linha(
        r++,
        [1, 1, 1, 1],
        [
          campo('NÚMERO DA FATURA', c.nFat),
          campo('VALOR ORIGINAL', f.valor(c.vOrig), 'dc--num'),
          campo('VALOR DO DESCONTO', f.valor(c.vDesc), 'dc--num'),
          campo('VALOR LÍQUIDO', f.valor(c.vLiq), 'dc--num'),
        ],
      ),
    );
  }
  // Duplicatas em linhas de seis; o resto da última linha é uma célula vazia
  // só, para a grade não ter buraco nem divisórias soltas no vazio.
  const POR_LINHA = 6;
  const dups: HTMLElement[] = c.duplicatas.map((dup) =>
    el(
      'div',
      'dc fat__dup',
      el('span', 'dc__rotulo', 'NÚMERO'),
      el('span', 'fat__valor', dup.nDup),
      el('span', 'dc__rotulo', 'VENC.'),
      el('span', 'fat__valor', f.data(dup.dVenc)),
      el('span', 'dc__rotulo', 'VALOR'),
      el('span', 'fat__valor', f.valor(dup.vDup)),
    ),
  );
  for (let i = 0; i < dups.length; i += POR_LINHA) {
    const grupo = dups.slice(i, i + POR_LINHA);
    const larguras: number[] = grupo.map(() => 1);
    if (grupo.length < POR_LINHA) {
      larguras.push(POR_LINHA - grupo.length);
      grupo.push(vazia());
    }
    celulas.push(...linha(r++, larguras, grupo));
  }
  if (celulas.length === 0) return null;
  return quadro('FATURA / DUPLICATAS', 'dq--fatura', faixa('', celulas));
}

function calculoImposto(d: DadosDanfe): HTMLElement {
  const t = d.totais;
  const v = (rotulo: string, bruto: string) =>
    campo(rotulo, f.valor(bruto), 'dc--num');
  return quadro(
    'CÁLCULO DO IMPOSTO',
    'dq--imposto',
    faixa('', [
      ...linha(
        1,
        [1, 1, 1, 1, 1],
        [
          v('BASE DE CÁLCULO DO ICMS', t.vBC),
          v('VALOR DO ICMS', t.vICMS),
          v('BASE DE CÁLCULO DO ICMS ST', t.vBCST),
          v('VALOR DO ICMS ST', t.vST),
          v('VALOR TOTAL DOS PRODUTOS', t.vProd),
        ],
      ),
      ...linha(
        2,
        [1, 1, 1, 1, 1, 1],
        [
          v('VALOR DO FRETE', t.vFrete),
          v('VALOR DO SEGURO', t.vSeg),
          v('DESCONTO', t.vDesc),
          v('OUTRAS DESPESAS ACESSÓRIAS', t.vOutro),
          v('VALOR TOTAL DO IPI', t.vIPI),
          v('VALOR TOTAL DA NOTA', t.vNF),
        ],
      ),
    ]),
  );
}

function transportador(d: DadosDanfe): HTMLElement {
  const t = d.transp;
  // Sem vol no XML, a linha de volumes fica com os campos em branco.
  const volumes =
    t.volumes.length > 0
      ? t.volumes
      : [{ qVol: '', esp: '', marca: '', nVol: '', pesoB: '', pesoL: '' }];
  return quadro(
    'TRANSPORTADOR / VOLUMES TRANSPORTADOS',
    'dq--transporte',
    faixa('', [
      ...linha(
        1,
        [62, 30, 22, 22, 10, 54],
        [
          campo('NOME / RAZÃO SOCIAL', t.xNome),
          campo('FRETE POR CONTA', modalidadeFrete(t.modFrete)),
          campo('CÓDIGO ANTT', t.RNTC),
          campo('PLACA DO VEÍCULO', t.placa),
          campo('UF', t.ufVeiculo),
          campo('CNPJ / CPF', documento(t.CNPJ, t.CPF)),
        ],
      ),
      ...linha(
        2,
        [92, 54, 10, 44],
        [
          campo('ENDEREÇO', t.xEnder),
          campo('MUNICÍPIO', t.xMun),
          campo('UF', t.UF),
          campo('INSCRIÇÃO ESTADUAL', t.IE),
        ],
      ),
      ...volumes.flatMap((v, i) =>
        linha(
          3 + i,
          [24, 36, 36, 36, 34, 34],
          [
            campo('QUANTIDADE', v.qVol, 'dc--num'),
            campo('ESPÉCIE', v.esp),
            campo('MARCA', v.marca),
            campo('NUMERAÇÃO', v.nVol),
            campo('PESO BRUTO', f.quantidade(v.pesoB), 'dc--num'),
            campo('PESO LÍQUIDO', f.quantidade(v.pesoL), 'dc--num'),
          ],
        ),
      ),
    ]),
  );
}

/** Quadro Cálculo do ISSQN. null sem ISSQN no XML. */
function calculoIssqn(d: DadosDanfe): HTMLElement | null {
  const i = d.issqn;
  if (!i) return null;
  return quadro(
    'CÁLCULO DO ISSQN',
    'dq--issqn',
    faixa(
      '',
      linha(
        1,
        [1, 1, 1, 1],
        [
          campo('INSCRIÇÃO MUNICIPAL', d.emit.IM),
          campo('VALOR TOTAL DOS SERVIÇOS', f.valor(i.vServ), 'dc--num'),
          campo('BASE DE CÁLCULO DO ISSQN', f.valor(i.vBC), 'dc--num'),
          campo('VALOR DO ISSQN', f.valor(i.vISS), 'dc--num'),
        ],
      ),
    ),
  );
}

// ---------- dados dos produtos ----------

interface Coluna {
  rotulo: string;
  /** Largura em mm; a descrição fica com o restante. */
  largura?: number;
  num?: boolean;
  valor: (i: ItemDanfe) => string;
}

function colunas(d: DadosDanfe): Coluna[] {
  return [
    { rotulo: 'CÓDIGO PRODUTO', largura: 22.5, valor: (i) => i.cProd },
    { rotulo: 'DESCRIÇÃO DO PRODUTO / SERVIÇO', valor: (i) => i.xProd },
    { rotulo: 'NCM/SH', largura: 11, valor: (i) => i.NCM },
    {
      rotulo: d.emit.CRT === '1' ? 'CSOSN' : 'CST',
      largura: 5.5,
      valor: (i) => i.cst,
    },
    { rotulo: 'CFOP', largura: 7, valor: (i) => i.CFOP },
    { rotulo: 'UN', largura: 5.5, valor: (i) => i.uCom },
    {
      rotulo: 'QUANT.',
      largura: 9,
      num: true,
      valor: (i) => f.quantidade(i.qCom),
    },
    {
      rotulo: 'VALOR UNIT.',
      largura: 11.5,
      num: true,
      valor: (i) => f.valorUnitario(i.vUnCom),
    },
    {
      rotulo: 'VALOR TOTAL',
      largura: 11.5,
      num: true,
      valor: (i) => f.valor(i.vProd),
    },
    {
      rotulo: 'B.CÁLC. ICMS',
      largura: 11.5,
      num: true,
      valor: (i) => f.valor(i.vBC),
    },
    {
      rotulo: 'VALOR ICMS',
      largura: 9.5,
      num: true,
      valor: (i) => f.valor(i.vICMS),
    },
    {
      rotulo: 'VALOR IPI',
      largura: 9,
      num: true,
      valor: (i) => f.valor(i.vIPI),
    },
    {
      rotulo: 'ALÍQ. ICMS',
      largura: 7,
      num: true,
      valor: (i) => f.valor(i.pICMS),
    },
    {
      rotulo: 'ALÍQ. IPI',
      largura: 7,
      num: true,
      valor: (i) => f.valor(i.pIPI),
    },
    {
      rotulo: 'B.CÁLC. ICMS ST',
      largura: 9.5,
      num: true,
      valor: (i) => f.valor(i.vBCST),
    },
    {
      rotulo: 'VALOR ICMS ST',
      largura: 9,
      num: true,
      valor: (i) => f.valor(i.vICMSST),
    },
  ];
}

function tabelaProdutos(cols: Coluna[]): HTMLTableElement {
  const colgroup = el(
    'colgroup',
    '',
    ...cols.map((c) => {
      const col = el('col');
      if (c.largura) col.style.width = `${c.largura}mm`;
      return col;
    }),
  );
  const thead = el(
    'thead',
    '',
    el('tr', '', ...cols.map((c) => el('th', c.num ? 'num' : '', c.rotulo))),
  );
  return el('table', 'prod', colgroup, thead);
}

/**
 * Linha vazia no fim da tabela com a altura que sobra no quadro: as linhas das
 * colunas descem até a borda de baixo, sem parar no último item. Fica um
 * pouco maior que o espaço (o quadro corta o excesso), para a linha nunca
 * parar antes da borda por arredondamento na impressão.
 */
function preencherColunas(
  p: NonNullable<Folha['produtos']>,
  cols: Coluna[],
): void {
  const sobra =
    p.area.getBoundingClientRect().bottom -
    p.tabela.getBoundingClientRect().bottom;
  if (sobra <= 0) return;
  const tr = el('tr', '', ...cols.map(() => el('td')));
  tr.style.height = `${sobra + 4}px`;
  p.tabela.append(el('tbody', 'prod__preenchimento', tr));
}

/**
 * Um item: a linha dos campos; infAdProd logo abaixo da descrição, na mesma
 * célula (as linhas das colunas seguem sem interrupção e não cortam o texto).
 */
function corpoItem(i: ItemDanfe, cols: Coluna[]): HTMLTableSectionElement {
  const tbody = el(
    'tbody',
    'prod__item',
    el(
      'tr',
      '',
      ...cols.map((c, idx) => {
        if (idx !== 1) return el('td', c.num ? 'num' : '', c.valor(i));
        return el(
          'td',
          'prod__desc',
          el('div', '', i.xProd),
          i.nFCI ? el('div', 'prod__extra', `FCI: ${i.nFCI}`) : null,
          i.infAdProd ? el('div', 'prod__infad', i.infAdProd) : null,
        );
      }),
    ),
  );
  tbody.dataset.nItem = i.nItem;
  tbody.dataset.vProd = i.vProd;
  return tbody;
}

// ---------- informações complementares ----------

/** Palavras das informações complementares, com o parágrafo de cada uma. */
interface Palavra {
  par: number;
  texto: string;
}

function palavrasComplementares(d: DadosDanfe): Palavra[] {
  const paragrafos = [
    d.infAdFisco,
    d.infCpl,
    ...d.obsCont.map((o) => juntar([o.xCampo, o.xTexto], ': ')),
  ].filter((p) => p.trim() !== '');
  return paragrafos.flatMap((p, par) =>
    p
      .split(/\s+/)
      .filter((t) => t !== '')
      .map((texto) => ({ par, texto })),
  );
}

function escreverPalavras(alvo: HTMLElement, palavras: Palavra[]): void {
  const pars: HTMLElement[] = [];
  let atual = -1;
  let buffer: string[] = [];
  const fechar = () => {
    if (buffer.length > 0) pars.push(el('p', 'ad__par', buffer.join(' ')));
    buffer = [];
  };
  for (const p of palavras) {
    if (p.par !== atual) {
      fechar();
      atual = p.par;
    }
    buffer.push(p.texto);
  }
  fechar();
  alvo.replaceChildren(...pars);
}

/** Folga em px nas medições (diferenças mínimas entre tela e impressão). */
const FOLGA = 2;

/** true se o conteúdo de `area` cabe nela, com folga. */
function cabe(area: HTMLElement, conteudo: HTMLElement): boolean {
  const a = area.getBoundingClientRect();
  const c = conteudo.getBoundingClientRect();
  return c.bottom <= a.bottom - FOLGA;
}

/**
 * Escreve em `area` o maior prefixo de `palavras` que cabe (busca binária
 * sobre a altura renderizada). Devolve quantas palavras couberam.
 */
function preencher(area: HTMLElement, palavras: Palavra[]): number {
  const texto = area.querySelector<HTMLElement>('.ad__texto');
  if (!texto) return 0;
  escreverPalavras(texto, palavras);
  if (cabe(area, texto)) return palavras.length;
  let lo = 0;
  let hi = palavras.length - 1;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    escreverPalavras(texto, palavras.slice(0, meio));
    if (cabe(area, texto)) lo = meio;
    else hi = meio - 1;
  }
  escreverPalavras(texto, palavras.slice(0, lo));
  return lo;
}

function areaComplementares(): HTMLElement {
  return el(
    'div',
    'dc ad__area',
    el('div', 'dc__rotulo', 'INFORMAÇÕES COMPLEMENTARES'),
    el('div', 'ad__texto'),
  );
}

// ---------- folhas ----------

interface Folha {
  raiz: HTMLElement;
  corpo: HTMLElement;
  numero: HTMLElement;
  produtos: {
    quadro: HTMLElement;
    area: HTMLElement;
    tabela: HTMLTableElement;
  } | null;
}

function novaFolha(
  d: DadosDanfe,
  cols: Coluna[],
  opcoes: { primeira: boolean; produtos: boolean },
): Folha {
  // O texto final ("FOLHA X/Y") só é escrito no fim, quando o total é conhecido.
  const numero = el('span', 'cab__folha', 'FOLHA');
  const corpo = el('div', 'folha__corpo');
  if (opcoes.primeira) corpo.append(canhoto(d));
  corpo.append(cabecalho(d, numero));
  if (opcoes.primeira) {
    corpo.append(
      ...[
        destinatario(d),
        fatura(d),
        calculoImposto(d),
        transportador(d),
      ].filter((q): q is HTMLElement => q !== null),
    );
  }

  let produtos: Folha['produtos'] = null;
  if (opcoes.produtos) {
    const tabela = tabelaProdutos(cols);
    const area = el('div', 'prod__area', tabela);
    const q = quadro('DADOS DOS PRODUTOS / SERVIÇOS', 'dq--produtos', area);
    corpo.append(q);
    produtos = { quadro: q, area, tabela };
  }

  const raiz = el('div', 'folha', corpo);
  if (d.tpAmb === '2')
    raiz.append(el('div', 'folha__marca', 'SEM VALOR FISCAL'));
  return { raiz, corpo, numero, produtos };
}

function adicionaisPrimeira(): { quadro: HTMLElement; area: HTMLElement } {
  const area = areaComplementares();
  const q = quadro(
    'DADOS ADICIONAIS',
    'dq--adicionais',
    faixa(
      'ad__linha',
      linha(
        1,
        [130, 70],
        [
          area,
          el(
            'div',
            'dc ad__fisco',
            el('div', 'dc__rotulo', 'RESERVADO AO FISCO'),
          ),
        ],
      ),
    ),
  );
  return { quadro: q, area };
}

/** Continuação das informações complementares em uma folha adicional. */
function adicionaisContinuacao(): { quadro: HTMLElement; area: HTMLElement } {
  const area = areaComplementares();
  const q = quadro(
    'DADOS ADICIONAIS',
    'dq--adicionais dq--continuacao',
    faixa('ad__continuacao', linha(1, [1], [area])),
  );
  return { quadro: q, area };
}

/** true se o último item da tabela ainda cabe inteiro na área de produtos. */
function tabelaCabe(p: NonNullable<Folha['produtos']>): boolean {
  return cabe(p.area, p.tabela);
}

/** true se nenhum quadro passa do fim do corpo da folha. */
function corpoCabe(fl: Folha): boolean {
  const limite = fl.corpo.getBoundingClientRect().bottom;
  return Array.from(fl.corpo.children).every(
    (q) => q.getBoundingClientRect().bottom <= limite + 0.5,
  );
}

/**
 * Monta o DANFE em `container` (que precisa estar visível, para as medições).
 * Devolve o total de folhas.
 */
export function montarDanfe(container: HTMLElement, d: DadosDanfe): number {
  container.replaceChildren();
  const cols = colunas(d);
  const folhas: Folha[] = [];
  const adicionar = (fl: Folha) => {
    container.append(fl.raiz);
    folhas.push(fl);
    return fl;
  };

  // Folha 1: o quadro de dados adicionais tem altura fixa; o que não couber
  // das informações complementares continua nas folhas seguintes.
  const primeira = adicionar(
    novaFolha(d, cols, { primeira: true, produtos: true }),
  );
  const issqn = calculoIssqn(d);
  if (issqn) primeira.corpo.append(issqn);
  const ad = adicionaisPrimeira();
  primeira.corpo.append(ad.quadro);
  let restantes = palavrasComplementares(d);
  restantes = restantes.slice(preencher(ad.area, restantes));

  // Itens: cada um entra na folha atual e é medido já renderizado.
  let atual = primeira;
  for (const item of d.itens) {
    const corpo = corpoItem(item, cols);
    let p = atual.produtos!;
    p.tabela.append(corpo);
    if (tabelaCabe(p)) continue;
    const vazia = p.tabela.tBodies.length === 1;
    if (vazia) continue; // não cabe nem sozinho: fica (não há como dividir)
    corpo.remove();
    atual = adicionar(novaFolha(d, cols, { primeira: false, produtos: true }));
    p = atual.produtos!;
    p.tabela.append(corpo);
  }

  // Continuação das informações complementares: primeiro no espaço que sobra
  // na última folha de itens, depois em folhas só com o cabeçalho.
  if (restantes.length > 0 && atual !== primeira && atual.produtos) {
    atual.produtos.quadro.classList.add('dq--produtos-ajustado');
    const cont = adicionaisContinuacao();
    atual.corpo.append(cont.quadro);
    // O quadro de produtos passa a ter a altura dos itens e a continuação fica
    // com o resto da folha: basta ver se alguma palavra coube e se o corpo da
    // folha não transbordou.
    const n = preencher(cont.area, restantes);
    if (n > 0 && corpoCabe(atual)) {
      restantes = restantes.slice(n);
    } else {
      cont.quadro.remove();
      atual.produtos.quadro.classList.remove('dq--produtos-ajustado');
    }
  }
  while (restantes.length > 0) {
    const fl = adicionar(
      novaFolha(d, cols, { primeira: false, produtos: false }),
    );
    const cont = adicionaisContinuacao();
    fl.corpo.append(cont.quadro);
    const n = preencher(cont.area, restantes);
    if (n === 0) break; // palavra maior que uma folha inteira: não há como seguir
    restantes = restantes.slice(n);
  }

  // Com a divisão pronta, as linhas das colunas descem até o fim de cada quadro
  // de produtos (na folha ajustada o quadro já tem a altura dos itens).
  for (const fl of folhas) {
    if (
      fl.produtos &&
      !fl.produtos.quadro.classList.contains('dq--produtos-ajustado')
    ) {
      preencherColunas(fl.produtos, cols);
    }
  }

  const total = folhas.length;
  folhas.forEach((fl, i) => {
    fl.numero.textContent = `FOLHA ${i + 1}/${total}`;
    fl.raiz.dataset.folha = String(i + 1);
  });
  return total;
}
