// Lê do XML da NF-e os campos que o DANFE imprime. Fica separado de
// nfe/parser.ts para que o modo Conferência não mude: o objeto Nota continua
// igual, e o DANFE tem o seu próprio objeto com os campos do modelo.
//
// Mesma regra do parser: campo ausente vira string vazia.

import { descendente, filho, filhos, texto } from '../nfe/parser';

export interface EnderecoDanfe {
  xLgr: string;
  nro: string;
  xCpl: string;
  xBairro: string;
  xMun: string;
  UF: string;
  CEP: string;
  fone: string;
}

export interface ItemDanfe {
  nItem: string;
  cProd: string;
  xProd: string;
  nFCI: string;
  infAdProd: string;
  NCM: string;
  /** Origem + CST (ou CSOSN), como no campo CST do modelo. */
  cst: string;
  CFOP: string;
  uCom: string;
  qCom: string;
  vUnCom: string;
  vProd: string;
  vBC: string;
  vICMS: string;
  pICMS: string;
  vBCST: string;
  vICMSST: string;
  vIPI: string;
  pIPI: string;
}

export interface VolumeDanfe {
  qVol: string;
  esp: string;
  marca: string;
  nVol: string;
  pesoB: string;
  pesoL: string;
}

export interface DadosDanfe {
  chave: string;
  mod: string;
  tpEmis: string;
  tpAmb: string;
  ide: {
    nNF: string;
    serie: string;
    natOp: string;
    tpNF: string;
    dhEmi: string;
    dhSaiEnt: string;
  };
  emit: {
    xNome: string;
    CNPJ: string;
    CPF: string;
    IE: string;
    IEST: string;
    IM: string;
    CRT: string;
    endereco: EnderecoDanfe;
  };
  dest: {
    xNome: string;
    CNPJ: string;
    CPF: string;
    idEstrangeiro: string;
    IE: string;
    endereco: EnderecoDanfe;
  };
  protocolo: { nProt: string; dhRecbto: string };
  /** null quando não há cobr no XML. */
  cobranca: {
    nFat: string;
    vOrig: string;
    vDesc: string;
    vLiq: string;
    duplicatas: { nDup: string; dVenc: string; vDup: string }[];
  } | null;
  totais: {
    vBC: string;
    vICMS: string;
    vBCST: string;
    vST: string;
    vProd: string;
    vFrete: string;
    vSeg: string;
    vDesc: string;
    vOutro: string;
    vIPI: string;
    vNF: string;
  };
  /** null quando não há ISSQN no XML. */
  issqn: { vServ: string; vBC: string; vISS: string } | null;
  transp: {
    modFrete: string;
    xNome: string;
    CNPJ: string;
    CPF: string;
    IE: string;
    xEnder: string;
    xMun: string;
    UF: string;
    placa: string;
    ufVeiculo: string;
    RNTC: string;
    volumes: VolumeDanfe[];
  };
  itens: ItemDanfe[];
  infAdFisco: string;
  infCpl: string;
  obsCont: { xCampo: string; xTexto: string }[];
}

function lerEndereco(el: Element | null): EnderecoDanfe {
  return {
    xLgr: texto(el, 'xLgr'),
    nro: texto(el, 'nro'),
    xCpl: texto(el, 'xCpl'),
    xBairro: texto(el, 'xBairro'),
    xMun: texto(el, 'xMun'),
    UF: texto(el, 'UF'),
    CEP: texto(el, 'CEP'),
    fone: texto(el, 'fone'),
  };
}

/** Primeiro filho elemento (o grupo ICMS00, ICMS10, ICMSSN101...). */
function primeiroFilho(el: Element | null): Element | null {
  return el?.firstElementChild ?? null;
}

function lerItem(det: Element): ItemDanfe {
  const prod = filho(det, 'prod');
  const imposto = filho(det, 'imposto');
  const icms = primeiroFilho(filho(imposto, 'ICMS'));
  const ipiTrib = filho(filho(imposto, 'IPI'), 'IPITrib');
  const cst = texto(icms, 'CST') || texto(icms, 'CSOSN');
  return {
    nItem: det.getAttribute('nItem')?.trim() ?? '',
    cProd: texto(prod, 'cProd'),
    xProd: texto(prod, 'xProd'),
    nFCI: texto(prod, 'nFCI'),
    infAdProd: texto(det, 'infAdProd'),
    NCM: texto(prod, 'NCM'),
    cst: cst ? `${texto(icms, 'orig')}${cst}` : '',
    CFOP: texto(prod, 'CFOP'),
    uCom: texto(prod, 'uCom'),
    qCom: texto(prod, 'qCom'),
    vUnCom: texto(prod, 'vUnCom'),
    vProd: texto(prod, 'vProd'),
    vBC: texto(icms, 'vBC'),
    vICMS: texto(icms, 'vICMS'),
    pICMS: texto(icms, 'pICMS'),
    vBCST: texto(icms, 'vBCST'),
    vICMSST: texto(icms, 'vICMSST'),
    vIPI: texto(ipiTrib, 'vIPI'),
    pIPI: texto(ipiTrib, 'pIPI'),
  };
}

/** Lê o DANFE a partir do elemento raiz da NF-e (nfeProc ou NFe). */
export function lerDanfe(raiz: Element): DadosDanfe {
  const infNFe = descendente(raiz, 'infNFe');
  if (!infNFe) throw new Error('Sem infNFe');
  const ide = filho(infNFe, 'ide');
  const emit = filho(infNFe, 'emit');
  const dest = filho(infNFe, 'dest');
  const total = filho(infNFe, 'total');
  const icmsTot = filho(total, 'ICMSTot');
  const issqnTot = filho(total, 'ISSQNtot');
  const transp = filho(infNFe, 'transp');
  const transporta = filho(transp, 'transporta');
  const veic = filho(transp, 'veicTransp');
  const cobr = filho(infNFe, 'cobr');
  const fat = filho(cobr, 'fat');
  const infAdic = filho(infNFe, 'infAdic');
  const infProt = descendente(raiz, 'infProt');
  const dets = filhos(infNFe, 'det');

  const temIssqn =
    issqnTot !== null ||
    dets.some((d) => filho(filho(d, 'imposto'), 'ISSQN') !== null);

  return {
    chave: (infNFe.getAttribute('Id')?.trim() ?? '').replace(/^NFe/, ''),
    mod: texto(ide, 'mod'),
    tpEmis: texto(ide, 'tpEmis'),
    tpAmb: texto(ide, 'tpAmb'),
    ide: {
      nNF: texto(ide, 'nNF'),
      serie: texto(ide, 'serie'),
      natOp: texto(ide, 'natOp'),
      tpNF: texto(ide, 'tpNF'),
      dhEmi: texto(ide, 'dhEmi'),
      dhSaiEnt: texto(ide, 'dhSaiEnt'),
    },
    emit: {
      xNome: texto(emit, 'xNome'),
      CNPJ: texto(emit, 'CNPJ'),
      CPF: texto(emit, 'CPF'),
      IE: texto(emit, 'IE'),
      IEST: texto(emit, 'IEST'),
      IM: texto(emit, 'IM'),
      CRT: texto(emit, 'CRT'),
      endereco: lerEndereco(filho(emit, 'enderEmit')),
    },
    dest: {
      xNome: texto(dest, 'xNome'),
      CNPJ: texto(dest, 'CNPJ'),
      CPF: texto(dest, 'CPF'),
      idEstrangeiro: texto(dest, 'idEstrangeiro'),
      IE: texto(dest, 'IE'),
      endereco: lerEndereco(filho(dest, 'enderDest')),
    },
    protocolo: {
      nProt: texto(infProt, 'nProt'),
      dhRecbto: texto(infProt, 'dhRecbto'),
    },
    cobranca: cobr
      ? {
          nFat: texto(fat, 'nFat'),
          vOrig: texto(fat, 'vOrig'),
          vDesc: texto(fat, 'vDesc'),
          vLiq: texto(fat, 'vLiq'),
          duplicatas: filhos(cobr, 'dup').map((d) => ({
            nDup: texto(d, 'nDup'),
            dVenc: texto(d, 'dVenc'),
            vDup: texto(d, 'vDup'),
          })),
        }
      : null,
    totais: {
      vBC: texto(icmsTot, 'vBC'),
      vICMS: texto(icmsTot, 'vICMS'),
      vBCST: texto(icmsTot, 'vBCST'),
      vST: texto(icmsTot, 'vST'),
      vProd: texto(icmsTot, 'vProd'),
      vFrete: texto(icmsTot, 'vFrete'),
      vSeg: texto(icmsTot, 'vSeg'),
      vDesc: texto(icmsTot, 'vDesc'),
      vOutro: texto(icmsTot, 'vOutro'),
      vIPI: texto(icmsTot, 'vIPI'),
      vNF: texto(icmsTot, 'vNF'),
    },
    issqn: temIssqn
      ? {
          vServ: texto(issqnTot, 'vServ'),
          vBC: texto(issqnTot, 'vBC'),
          vISS: texto(issqnTot, 'vISS'),
        }
      : null,
    transp: {
      modFrete: texto(transp, 'modFrete'),
      xNome: texto(transporta, 'xNome'),
      CNPJ: texto(transporta, 'CNPJ'),
      CPF: texto(transporta, 'CPF'),
      IE: texto(transporta, 'IE'),
      xEnder: texto(transporta, 'xEnder'),
      xMun: texto(transporta, 'xMun'),
      UF: texto(transporta, 'UF'),
      placa: texto(veic, 'placa'),
      ufVeiculo: texto(veic, 'UF'),
      RNTC: texto(veic, 'RNTC'),
      volumes: filhos(transp, 'vol').map((v) => ({
        qVol: texto(v, 'qVol'),
        esp: texto(v, 'esp'),
        marca: texto(v, 'marca'),
        nVol: texto(v, 'nVol'),
        pesoB: texto(v, 'pesoB'),
        pesoL: texto(v, 'pesoL'),
      })),
    },
    itens: dets.map(lerItem).sort((a, b) => Number(a.nItem) - Number(b.nItem)),
    infAdFisco: texto(infAdic, 'infAdFisco'),
    infCpl: texto(infAdic, 'infCpl'),
    obsCont: filhos(infAdic, 'obsCont').map((o) => ({
      xCampo: o.getAttribute('xCampo')?.trim() ?? '',
      xTexto: texto(o, 'xTexto'),
    })),
  };
}

/** Motivo para não gerar o DANFE, ou null se esta versão suporta a nota. */
export function motivoNaoSuportado(d: DadosDanfe): string | null {
  const emissaoSuportada = ['1', '6', '7'].includes(d.tpEmis);
  if (d.mod !== '55' || !emissaoSuportada) {
    return 'DANFE em contingência ou de outro modelo não é suportado nesta versão.';
  }
  return null;
}
