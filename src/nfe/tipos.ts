// Todos os campos guardam o texto bruto do XML. String vazia significa que o
// campo não existe no arquivo. A formatação acontece só na hora de exibir.

export interface Endereco {
  xLgr: string;
  nro: string;
  xBairro: string;
  xMun: string;
  UF: string;
  CEP: string;
  fone: string;
}

export interface Emitente {
  CNPJ: string;
  xNome: string;
  xFant: string;
  IE: string;
  endereco: Endereco;
}

export interface Destinatario {
  CNPJ: string;
  CPF: string;
  xNome: string;
  IE: string;
  endereco: Endereco;
}

export interface Ide {
  nNF: string;
  serie: string;
  dhEmi: string;
  natOp: string;
  tpNF: string;
}

export interface Item {
  nItem: string;
  cProd: string;
  cEAN: string;
  xProd: string;
  NCM: string;
  CEST: string;
  CFOP: string;
  uCom: string;
  qCom: string;
  vUnCom: string;
  vProd: string;
  vDesc: string;
  infAdProd: string;
  vIPI: string;
  vICMS: string;
}

export interface Totais {
  vProd: string;
  vDesc: string;
  vFrete: string;
  vSeg: string;
  vOutro: string;
  vIPI: string;
  vICMS: string;
  vST: string;
  vNF: string;
}

export interface Volume {
  qVol: string;
  esp: string;
  pesoB: string;
  pesoL: string;
}

export interface Transporte {
  modFrete: string;
  transportadoraNome: string;
  transportadoraCNPJ: string;
  volumes: Volume[];
}

export interface Duplicata {
  nDup: string;
  dVenc: string;
  vDup: string;
}

export interface ObsCont {
  xCampo: string;
  xTexto: string;
}

export interface InfAdic {
  infCpl: string;
  obsCont: ObsCont[];
}

export interface Protocolo {
  chNFe: string;
  nProt: string;
  dhRecbto: string;
  cStat: string;
  xMotivo: string;
}

export interface Nota {
  chave: string;
  ide: Ide;
  emitente: Emitente;
  destinatario: Destinatario;
  itens: Item[];
  totais: Totais;
  transporte: Transporte;
  duplicatas: Duplicata[];
  infAdic: InfAdic;
  protocolo: Protocolo;
}
