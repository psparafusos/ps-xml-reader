// Converte o texto de um XML de NF-e (layout 4.00) no objeto Nota.
// Não depende de Electron: usa apenas DOMParser.
//
// Regra: campo ausente vira string vazia. O parser só lança erro quando o
// arquivo não tem infNFe, ou seja, quando não é uma NF-e.

import type {
  Destinatario,
  Duplicata,
  Emitente,
  Endereco,
  Ide,
  InfAdic,
  Item,
  Nota,
  Protocolo,
  Totais,
  Transporte,
  Volume,
} from './tipos';

export const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';

export class NaoEhNfeError extends Error {
  constructor() {
    super('Este arquivo não é uma NF-e.');
    this.name = 'NaoEhNfeError';
  }
}

/** Primeiro filho direto de `el` com o nome local `tag`, ou null. */
function filho(el: Element | null, tag: string): Element | null {
  if (!el) return null;
  for (const c of Array.from(el.children)) {
    if (c.localName === tag) return c;
  }
  return null;
}

/** Todos os filhos diretos de `el` com o nome local `tag`. */
function filhos(el: Element | null, tag: string): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter((c) => c.localName === tag);
}

/** Texto do filho direto `tag` de `el`. String vazia se não existir. */
function texto(el: Element | null, tag: string): string {
  return filho(el, tag)?.textContent?.trim() ?? '';
}

/** Primeiro descendente (qualquer profundidade) com o nome local `tag`. */
function descendente(el: Element | null, tag: string): Element | null {
  if (!el) return null;
  const porNs = el.getElementsByTagNameNS(NS_NFE, tag);
  if (porNs.length > 0) return porNs[0];
  const semNs = el.getElementsByTagName(tag);
  return semNs.length > 0 ? semNs[0] : null;
}

function lerEndereco(el: Element | null): Endereco {
  return {
    xLgr: texto(el, 'xLgr'),
    nro: texto(el, 'nro'),
    xBairro: texto(el, 'xBairro'),
    xMun: texto(el, 'xMun'),
    UF: texto(el, 'UF'),
    CEP: texto(el, 'CEP'),
    fone: texto(el, 'fone'),
  };
}

function lerIde(el: Element | null): Ide {
  return {
    nNF: texto(el, 'nNF'),
    serie: texto(el, 'serie'),
    dhEmi: texto(el, 'dhEmi'),
    natOp: texto(el, 'natOp'),
    tpNF: texto(el, 'tpNF'),
  };
}

function lerEmitente(el: Element | null): Emitente {
  return {
    CNPJ: texto(el, 'CNPJ'),
    xNome: texto(el, 'xNome'),
    xFant: texto(el, 'xFant'),
    IE: texto(el, 'IE'),
    endereco: lerEndereco(filho(el, 'enderEmit')),
  };
}

function lerDestinatario(el: Element | null): Destinatario {
  return {
    CNPJ: texto(el, 'CNPJ'),
    CPF: texto(el, 'CPF'),
    xNome: texto(el, 'xNome'),
    IE: texto(el, 'IE'),
    endereco: lerEndereco(filho(el, 'enderDest')),
  };
}

function lerItem(det: Element): Item {
  const prod = filho(det, 'prod');
  const imposto = filho(det, 'imposto');
  // IPI: vIPI fica em IPITrib. ICMS: vICMS fica em um dos filhos (ICMS00,
  // ICMS10, ICMSSN101...). Em ambos os casos basta procurar o descendente.
  const vIPI =
    descendente(filho(imposto, 'IPI'), 'vIPI')?.textContent?.trim() ?? '';
  const vICMS =
    descendente(filho(imposto, 'ICMS'), 'vICMS')?.textContent?.trim() ?? '';
  return {
    nItem: det.getAttribute('nItem')?.trim() ?? '',
    cProd: texto(prod, 'cProd'),
    cEAN: texto(prod, 'cEAN'),
    xProd: texto(prod, 'xProd'),
    NCM: texto(prod, 'NCM'),
    CEST: texto(prod, 'CEST'),
    CFOP: texto(prod, 'CFOP'),
    uCom: texto(prod, 'uCom'),
    qCom: texto(prod, 'qCom'),
    vUnCom: texto(prod, 'vUnCom'),
    vProd: texto(prod, 'vProd'),
    vDesc: texto(prod, 'vDesc'),
    infAdProd: texto(det, 'infAdProd'),
    vIPI,
    vICMS,
  };
}

function lerTotais(total: Element | null): Totais {
  const t = filho(total, 'ICMSTot');
  return {
    vProd: texto(t, 'vProd'),
    vDesc: texto(t, 'vDesc'),
    vFrete: texto(t, 'vFrete'),
    vSeg: texto(t, 'vSeg'),
    vOutro: texto(t, 'vOutro'),
    vIPI: texto(t, 'vIPI'),
    vICMS: texto(t, 'vICMS'),
    vST: texto(t, 'vST'),
    vNF: texto(t, 'vNF'),
  };
}

function lerTransporte(el: Element | null): Transporte {
  const transporta = filho(el, 'transporta');
  const volumes: Volume[] = filhos(el, 'vol').map((v) => ({
    qVol: texto(v, 'qVol'),
    esp: texto(v, 'esp'),
    pesoB: texto(v, 'pesoB'),
    pesoL: texto(v, 'pesoL'),
  }));
  return {
    modFrete: texto(el, 'modFrete'),
    transportadoraNome: texto(transporta, 'xNome'),
    transportadoraCNPJ: texto(transporta, 'CNPJ'),
    volumes,
  };
}

function lerDuplicatas(cobr: Element | null): Duplicata[] {
  return filhos(cobr, 'dup').map((d) => ({
    nDup: texto(d, 'nDup'),
    dVenc: texto(d, 'dVenc'),
    vDup: texto(d, 'vDup'),
  }));
}

function lerInfAdic(el: Element | null): InfAdic {
  return {
    infCpl: texto(el, 'infCpl'),
    obsCont: filhos(el, 'obsCont').map((o) => ({
      xCampo: o.getAttribute('xCampo')?.trim() ?? '',
      xTexto: texto(o, 'xTexto'),
    })),
  };
}

function lerProtocolo(infProt: Element | null): Protocolo {
  return {
    chNFe: texto(infProt, 'chNFe'),
    nProt: texto(infProt, 'nProt'),
    dhRecbto: texto(infProt, 'dhRecbto'),
    cStat: texto(infProt, 'cStat'),
    xMotivo: texto(infProt, 'xMotivo'),
  };
}

/**
 * Lê uma NF-e com raiz nfeProc (com protNFe) ou raiz NFe direta.
 * Lança NaoEhNfeError se não houver infNFe.
 */
export function lerNota(xml: string): Nota {
  const doc = new DOMParser().parseFromString(
    xml.replace(/^﻿/, ''),
    'application/xml',
  );
  const raiz = doc.documentElement;
  if (
    !raiz ||
    raiz.localName === 'parsererror' ||
    doc.getElementsByTagName('parsererror').length > 0
  ) {
    throw new NaoEhNfeError();
  }

  const infNFe = descendente(raiz, 'infNFe');
  if (!infNFe) throw new NaoEhNfeError();

  const itens = filhos(infNFe, 'det')
    .map(lerItem)
    .sort((a, b) => Number(a.nItem) - Number(b.nItem));

  const id = infNFe.getAttribute('Id')?.trim() ?? '';
  const infProt = descendente(raiz, 'infProt');

  return {
    chave: id.replace(/^NFe/, ''),
    ide: lerIde(filho(infNFe, 'ide')),
    emitente: lerEmitente(filho(infNFe, 'emit')),
    destinatario: lerDestinatario(filho(infNFe, 'dest')),
    itens,
    totais: lerTotais(filho(infNFe, 'total')),
    transporte: lerTransporte(filho(infNFe, 'transp')),
    duplicatas: lerDuplicatas(filho(infNFe, 'cobr')),
    infAdic: lerInfAdic(filho(infNFe, 'infAdic')),
    protocolo: lerProtocolo(infProt),
  };
}
