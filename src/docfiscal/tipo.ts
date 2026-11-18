// Que documento fiscal é um XML e qual documento auxiliar o PS Reader monta
// para ele (o modo Documento da aba XML). Duas leituras:
// - pelo começo do arquivo (processo principal, ao abrir: só o elemento raiz
//   e o que vem logo depois, sem ler o arquivo inteiro);
// - pela árvore já lida (tela, antes de montar), que acha o elemento certo
//   mesmo dentro de uma resposta de consulta.
// Puro: a árvore é a do DOMParser (ou a mínima dos testes), só por
// localName, children e getAttribute.

export type TipoDocumento =
  | 'nfe'
  | 'nfce'
  | 'cte'
  | 'nfse-nacional'
  | 'nfse-abrasf'
  | 'evento-nfe';

/** Nome do documento auxiliar montado (rótulo do painel Leitura). */
export const NOME_AUXILIAR: Record<TipoDocumento, string> = {
  nfe: 'DANFE',
  nfce: 'DANFE NFC-e',
  cte: 'DACTE',
  'nfse-nacional': 'DANFSe',
  'nfse-abrasf': 'DANFSe',
  'evento-nfe': 'Evento',
};

/** Nome do documento fiscal (título da janela, cartão Arquivo, avisos). */
export const NOME_FISCAL: Record<TipoDocumento, string> = {
  nfe: 'NF-e',
  nfce: 'NFC-e',
  cte: 'CT-e',
  'nfse-nacional': 'NFS-e Nacional',
  'nfse-abrasf': 'NFS-e (padrão ABRASF)',
  'evento-nfe': 'Evento da NF-e',
};

/** "uma NFS-e", "um CT-e": o artigo de cada documento, para os avisos. */
export const COM_ARTIGO: Record<TipoDocumento, string> = {
  nfe: 'uma NF-e',
  nfce: 'uma NFC-e',
  cte: 'um CT-e',
  'nfse-nacional': 'uma NFS-e Nacional',
  'nfse-abrasf': 'uma NFS-e (padrão ABRASF)',
  'evento-nfe': 'um evento da NF-e',
};

export const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';
export const NS_CTE = 'http://www.portalfiscal.inf.br/cte';
export const NS_NFSE_NACIONAL = 'http://www.sped.fazenda.gov.br/nfse';

/** Raízes da NF-e e da NFC-e (as duas abrem pela tela da nota). */
export const RAIZES_NFE = ['nfeProc', 'NFe'];
const RAIZES_CTE = ['cteProc', 'CTe'];
const RAIZES_EVENTO_NFE = ['procEventoNFe', 'evento'];

/**
 * Documentos fiscais conhecidos para os quais o PS Reader não monta documento
 * auxiliar: a raiz e o nome que aparece no motivo.
 */
const SEM_AUXILIAR: Record<string, string> = {
  cteOSProc: 'CT-e OS',
  CTeOS: 'CT-e OS',
  procEventoCTe: 'evento do CT-e',
  eventoCTe: 'evento do CT-e',
  mdfeProc: 'MDF-e',
  MDFe: 'MDF-e',
  procEventoMDFe: 'evento do MDF-e',
  GTVe: 'GTV-e',
  nf3eProc: 'NF3e',
  NF3e: 'NF3e',
  bpeProc: 'BP-e',
  BPe: 'BP-e',
  nfcomProc: 'NFCom',
  NFCom: 'NFCom',
  CFe: 'CF-e SAT',
};

/** Raiz de uma lista ou resposta ABRASF que pode trazer notas dentro. */
const ehRespostaAbrasf = (raiz: string) =>
  raiz === 'ListaNfse' ||
  /Nfse.*Resposta$|Resposta.*Nfse/.test(raiz) ||
  /^(Gerar|Consultar|Enviar|Recepcionar).*Resposta$/.test(raiz);

/** O atributo xmlns da tag de abertura da raiz, ou null. */
function namespaceDaRaiz(comeco: string, raiz: string): string | null {
  const i = comeco.search(new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${raiz}\\b`));
  if (i < 0) return null;
  const fim = comeco.indexOf('>', i);
  const tag = comeco.slice(i, fim < 0 ? undefined : fim);
  const m = /\sxmlns(?::[\w.-]+)?\s*=\s*["']([^"']*)["']/.exec(tag);
  return m ? m[1] : null;
}

/**
 * Tipo pelo começo do arquivo: a raiz (nome local, sem prefixo) e o texto do
 * começo. 'nfe' vale para NF-e e NFC-e (o modelo só aparece depois). null:
 * não é um documento fiscal que o PS Reader reconheça.
 */
export function tipoPeloComeco(
  raiz: string,
  comeco: string,
): TipoDocumento | null {
  if (RAIZES_NFE.includes(raiz)) return 'nfe';
  if (RAIZES_CTE.includes(raiz)) return 'cte';
  if (raiz === 'NFSe') return 'nfse-nacional';
  if (raiz === 'CompNfse' || raiz === 'Nfse') return 'nfse-abrasf';
  if (
    ehRespostaAbrasf(raiz) &&
    /<(?:[A-Za-z_][\w.-]*:)?CompNfse\b/.test(comeco)
  )
    return 'nfse-abrasf';
  if (raiz === 'procEventoNFe') return 'evento-nfe';
  if (raiz === 'evento' && namespaceDaRaiz(comeco, raiz) === NS_NFE)
    return 'evento-nfe';
  return null;
}

// ---------- pela árvore ----------

/** O mínimo de Element que a identificação usa. */
export interface ElementoXml {
  readonly localName: string;
  readonly children: ArrayLike<ElementoXml>;
  getAttribute(nome: string): string | null;
  readonly textContent: string | null;
}

const filhosDe = (e: ElementoXml) => Array.from(e.children);

/** Primeiro filho direto com o nome local `nome`. */
export function filhoXml(
  e: ElementoXml | null,
  nome: string,
): ElementoXml | null {
  if (!e) return null;
  return filhosDe(e).find((f) => f.localName === nome) ?? null;
}

/** Todos os descendentes (qualquer profundidade) com o nome local `nome`, em ordem. */
export function todosXml(e: ElementoXml | null, nome: string): ElementoXml[] {
  if (!e) return [];
  const r: ElementoXml[] = [];
  const pilha = filhosDe(e).reverse();
  while (pilha.length > 0) {
    const x = pilha.pop() as ElementoXml;
    if (x.localName === nome) r.push(x);
    pilha.push(...filhosDe(x).reverse());
  }
  return r;
}

/** Primeiro descendente com o nome local `nome` (ou o próprio `e`). */
export function primeiroXml(
  e: ElementoXml | null,
  nome: string,
): ElementoXml | null {
  if (!e) return null;
  if (e.localName === nome) return e;
  return todosXml(e, nome)[0] ?? null;
}

/** Texto do filho direto `nome`, sem espaços nas pontas ('' se não há). */
export function textoXml(e: ElementoXml | null, nome: string): string {
  return filhoXml(e, nome)?.textContent?.trim() ?? '';
}

export type Identificacao =
  | {
      tipo: TipoDocumento;
      /**
       * O elemento de onde o documento auxiliar lê: NFe/nfeProc, CTe/cteProc,
       * NFSe, cada CompNfse (ou Nfse) do ABRASF, o evento ou procEventoNFe.
       */
      elementos: ElementoXml[];
    }
  | { tipo: null; motivo: string };

export const MOTIVO_DESCONHECIDO =
  'Este XML não é um documento fiscal que o PS Reader saiba mostrar (NF-e, NFC-e, CT-e, NFS-e ou evento da NF-e).';

/** Motivo de um documento fiscal conhecido sem documento auxiliar no PS Reader. */
export function motivoSemAuxiliar(nome: string): string {
  return `O PS Reader não monta o documento auxiliar de ${nome}. Veja o arquivo no Formato original.`;
}

/** Identifica pela árvore lida (a raiz do documento). */
export function identificar(raiz: ElementoXml): Identificacao {
  const nome = raiz.localName;
  if (RAIZES_NFE.includes(nome)) {
    const inf = primeiroXml(raiz, 'infNFe');
    if (!inf) return { tipo: null, motivo: MOTIVO_DESCONHECIDO };
    const mod = textoXml(filhoXml(inf, 'ide'), 'mod');
    return { tipo: mod === '65' ? 'nfce' : 'nfe', elementos: [raiz] };
  }
  if (RAIZES_CTE.includes(nome)) {
    return primeiroXml(raiz, 'infCte')
      ? { tipo: 'cte', elementos: [raiz] }
      : { tipo: null, motivo: MOTIVO_DESCONHECIDO };
  }
  if (nome === 'NFSe') {
    return primeiroXml(raiz, 'infNFSe')
      ? { tipo: 'nfse-nacional', elementos: [raiz] }
      : { tipo: null, motivo: MOTIVO_DESCONHECIDO };
  }
  if (nome === 'CompNfse' || nome === 'Nfse' || ehRespostaAbrasf(nome)) {
    const comp =
      nome === 'Nfse'
        ? [raiz]
        : nome === 'CompNfse'
          ? [raiz]
          : todosXml(raiz, 'CompNfse');
    const comInf = comp.filter((c) => primeiroXml(c, 'InfNfse') !== null);
    if (comInf.length > 0) return { tipo: 'nfse-abrasf', elementos: comInf };
  }
  if (RAIZES_EVENTO_NFE.includes(nome)) {
    const inf = primeiroXml(raiz, 'infEvento');
    if (inf && textoXml(inf, 'chNFe'))
      return { tipo: 'evento-nfe', elementos: [raiz] };
  }
  const conhecido = SEM_AUXILIAR[nome];
  if (conhecido) return { tipo: null, motivo: motivoSemAuxiliar(conhecido) };
  return { tipo: null, motivo: MOTIVO_DESCONHECIDO };
}
