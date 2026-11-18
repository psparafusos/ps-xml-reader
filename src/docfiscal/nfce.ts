// DANFE NFC-e (modelo 65), pelo "Manual de Padrões Técnicos do DANFE NFC-e
// e QR Code", versão 6.0 (divisões I a IX no item 3.1, pp. 7 a 14; QR Code
// no capítulo 4: ISO/IEC 18004, nível M, texto do infNFeSupl/qrCode). Na
// largura de uma bobina de 80 mm (o manual pede no mínimo 56 mm), em uma
// tira só, como sai da impressora térmica; versão completa, com os itens.
//
// lerNfce e modeloNfce são puros; montarDanfeNfce desenha.

import { el, qrSvg } from './folha';
import { dataHoraSegundos, descrever, documento, f, juntar } from './modelo';
import {
  filhoXml,
  primeiroXml,
  textoXml,
  todosXml,
  type ElementoXml,
} from './tipo';

export interface ItemNfce {
  codigo: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  unitario: string;
  total: string;
}

export interface DadosNfce {
  chave: string;
  tpAmb: string;
  contingencia: boolean;
  emitente: { documento: string; nome: string; endereco: string };
  itens: ItemNfce[];
  totais: {
    quantidade: string;
    produtos: string;
    acrescimos: string;
    desconto: string;
    pagar: string;
    temAjuste: boolean;
  };
  pagamentos: { forma: string; valor: string }[];
  troco: string;
  urlChave: string;
  qrCode: string;
  consumidor: { identificacao: string; nome: string; endereco: string } | null;
  numero: string;
  serie: string;
  emissao: string;
  protocolo: string;
  autorizacao: string;
  infAdFisco: string;
  infCpl: string;
}

/** Meios de pagamento (tPag) do leiaute da NF-e. */
const MEIO_PAGAMENTO: Record<string, string> = {
  '01': 'Dinheiro',
  '02': 'Cheque',
  '03': 'Cartão de Crédito',
  '04': 'Cartão de Débito',
  '05': 'Crédito Loja',
  '10': 'Vale Alimentação',
  '11': 'Vale Refeição',
  '12': 'Vale Presente',
  '13': 'Vale Combustível',
  '15': 'Boleto Bancário',
  '16': 'Depósito Bancário',
  '17': 'Pagamento Instantâneo (PIX)',
  '18': 'Transferência Bancária, Carteira Digital',
  '19': 'Programa de Fidelidade, Cashback, Crédito Virtual',
  '20': 'Pagamento Instantâneo (PIX) Estático',
  '21': 'Crédito em Loja',
  '22': 'Pagamento Eletrônico não Informado',
  '90': 'Sem Pagamento',
  '99': 'Outros',
};

const soma = (...b: string[]) =>
  b.reduce((s, x) => s + (Number.isFinite(Number(x)) ? Number(x) : 0), 0);

/** Lê a NFC-e a partir da raiz da nota (nfeProc ou NFe). */
export function lerNfce(raiz: ElementoXml): DadosNfce {
  const inf = primeiroXml(raiz, 'infNFe');
  const ide = filhoXml(inf, 'ide');
  const emit = filhoXml(inf, 'emit');
  const end = filhoXml(emit, 'enderEmit');
  const dest = filhoXml(inf, 'dest');
  const endDest = filhoXml(dest, 'enderDest');
  const tot = filhoXml(filhoXml(inf, 'total'), 'ICMSTot');
  const pag = filhoXml(inf, 'pag');
  const supl = primeiroXml(raiz, 'infNFeSupl');
  const infProt = primeiroXml(raiz, 'infProt');
  const infAdic = filhoXml(inf, 'infAdic');
  const t = (x: string) => textoXml(tot, x);
  const acrescimos = soma(t('vFrete'), t('vSeg'), t('vOutro'));
  const desconto = soma(t('vDesc'));
  const itens = todosXml(inf, 'det').map((det) => {
    const p = filhoXml(det, 'prod');
    return {
      codigo: textoXml(p, 'cProd'),
      descricao: textoXml(p, 'xProd'),
      quantidade: f.quantidade(textoXml(p, 'qCom')),
      unidade: textoXml(p, 'uCom'),
      unitario: f.valorUnitario(textoXml(p, 'vUnCom')),
      total: f.valor(textoXml(p, 'vProd')),
    };
  });
  const idDest =
    textoXml(dest, 'CNPJ') ||
    textoXml(dest, 'CPF') ||
    textoXml(dest, 'idEstrangeiro');
  const consumidor = dest
    ? {
        identificacao: textoXml(dest, 'CNPJ')
          ? `CONSUMIDOR CNPJ: ${f.cnpj(textoXml(dest, 'CNPJ'))}`
          : textoXml(dest, 'CPF')
            ? `CONSUMIDOR CPF: ${f.cpf(textoXml(dest, 'CPF'))}`
            : idDest
              ? `CONSUMIDOR Id. Estrangeiro: ${idDest}`
              : 'CONSUMIDOR NÃO IDENTIFICADO',
        nome: textoXml(dest, 'xNome'),
        endereco: juntar(
          [
            textoXml(endDest, 'xLgr'),
            textoXml(endDest, 'nro'),
            textoXml(endDest, 'xCpl'),
            textoXml(endDest, 'xBairro'),
            juntar([textoXml(endDest, 'xMun'), textoXml(endDest, 'UF')], ' - '),
          ],
          ', ',
        ),
      }
    : null;
  return {
    chave: (inf?.getAttribute('Id')?.trim() ?? '').replace(/^NFe/, ''),
    tpAmb: textoXml(ide, 'tpAmb'),
    contingencia: textoXml(ide, 'tpEmis') === '9',
    emitente: {
      documento: documento(textoXml(emit, 'CNPJ'), textoXml(emit, 'CPF')),
      nome: textoXml(emit, 'xNome'),
      endereco: juntar(
        [
          textoXml(end, 'xLgr'),
          textoXml(end, 'nro'),
          textoXml(end, 'xCpl'),
          textoXml(end, 'xBairro'),
          juntar([textoXml(end, 'xMun'), textoXml(end, 'UF')], ' - '),
        ],
        ', ',
      ),
    },
    itens,
    totais: {
      quantidade: String(itens.length),
      produtos: f.valor(t('vProd')),
      acrescimos: f.valor(acrescimos.toFixed(2)),
      desconto: f.valor(desconto.toFixed(2)),
      pagar: f.valor(t('vNF')),
      temAjuste: acrescimos > 0 || desconto > 0,
    },
    pagamentos: todosXml(pag, 'detPag').map((d) => ({
      forma:
        textoXml(d, 'tPag') === '99' && textoXml(d, 'xPag')
          ? textoXml(d, 'xPag')
          : descrever(textoXml(d, 'tPag'), MEIO_PAGAMENTO, false),
      valor: f.valor(textoXml(d, 'vPag')),
    })),
    troco: f.valor(textoXml(pag, 'vTroco')),
    urlChave: textoXml(supl, 'urlChave'),
    qrCode: textoXml(supl, 'qrCode'),
    consumidor,
    numero: textoXml(ide, 'nNF'),
    serie: textoXml(ide, 'serie'),
    emissao: dataHoraSegundos(textoXml(ide, 'dhEmi')),
    protocolo: textoXml(infProt, 'nProt'),
    autorizacao: dataHoraSegundos(textoXml(infProt, 'dhRecbto')),
    infAdFisco: textoXml(infAdic, 'infAdFisco'),
    infCpl: textoXml(infAdic, 'infCpl'),
  };
}

export const TITULO_NFCE =
  'Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica';
export const HOMOLOGACAO_NFCE =
  'EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL';
export const CONTINGENCIA_NFCE = [
  'EMITIDA EM CONTINGÊNCIA',
  'Pendente de autorização',
];

/** As divisões do DANFE NFC-e, na ordem do manual (I a IX). */
export interface ModeloNfce {
  cabecalho: string[];
  contingencia: string[] | null;
  colunas: string[];
  itens: string[][];
  totais: [string, string][];
  pagamentos: [string, string][];
  consulta: { texto: string; url: string; chave: string };
  qrCode: string;
  consumidor: string[];
  identificacao: string[];
  mensagemFiscal: string[];
  contribuinte: string;
}

export function modeloNfce(d: DadosNfce): ModeloNfce {
  const totais: [string, string][] = [
    ['Qtde. total de itens', d.totais.quantidade],
    ['Valor total R$', d.totais.produtos],
  ];
  if (d.totais.temAjuste) {
    totais.push(
      ['Acréscimos (frete, seguro e outras despesas) R$', d.totais.acrescimos],
      ['Desconto R$', d.totais.desconto],
      ['Valor a Pagar R$', d.totais.pagar],
    );
  }
  const pagamentos: [string, string][] = d.pagamentos.map((p) => [
    p.forma,
    p.valor,
  ]);
  if (d.troco) pagamentos.push(['Troco R$', d.troco]);
  return {
    cabecalho: [
      juntar(
        [
          d.emitente.documento ? `CNPJ: ${d.emitente.documento}` : '',
          d.emitente.nome,
        ],
        ' ',
      ),
      d.emitente.endereco,
      TITULO_NFCE,
    ].filter(Boolean),
    contingencia: d.contingencia ? CONTINGENCIA_NFCE : null,
    colunas: ['Código', 'Descrição', 'Qtde', 'Un', 'Vl Unit', 'Vl Total'],
    itens: d.itens.map((i) => [
      i.codigo,
      i.descricao,
      i.quantidade,
      i.unidade,
      i.unitario,
      i.total,
    ]),
    totais,
    pagamentos,
    consulta: {
      texto: 'Consulte pela Chave de Acesso em',
      url: d.urlChave,
      chave: f.chaveAcesso(d.chave),
    },
    qrCode: d.qrCode,
    consumidor: d.consumidor
      ? [
          d.consumidor.identificacao,
          d.consumidor.nome,
          d.consumidor.endereco,
        ].filter(Boolean)
      : ['CONSUMIDOR NÃO IDENTIFICADO'],
    identificacao: [
      juntar(
        [
          d.numero ? `NFC-e nº ${d.numero}` : '',
          d.serie ? `Série ${d.serie}` : '',
          d.emissao,
        ],
        ' ',
      ),
      ...(d.contingencia
        ? []
        : [
            d.protocolo ? `Protocolo de autorização: ${d.protocolo}` : '',
            d.autorizacao ? `Data de autorização: ${d.autorizacao}` : '',
          ].filter(Boolean)),
    ],
    mensagemFiscal: [
      ...(d.tpAmb === '2' ? [HOMOLOGACAO_NFCE] : []),
      ...(d.infAdFisco ? [d.infAdFisco] : []),
    ],
    contribuinte: d.infCpl,
  };
}

// ---------- desenho ----------

function divisao(
  classe: string,
  ...filhos: (Node | string | null)[]
): HTMLElement {
  return el('section', `dx-nfce__div dx-nfce__div--${classe}`, ...filhos);
}

function linhas(textos: string[], classe = ''): HTMLElement[] {
  return textos.map((t) => el('div', classe, t));
}

/** Monta o DANFE NFC-e em `container` (uma tira só). Devolve 1. */
export function montarDanfeNfce(container: HTMLElement, d: DadosNfce): number {
  const m = modeloNfce(d);
  container.replaceChildren();
  const contingencia = () =>
    m.contingencia
      ? divisao('contingencia', ...linhas(m.contingencia, 'dx-nfce__forte'))
      : null;
  const tabela = el(
    'table',
    'dx-nfce__itens',
    el('thead', '', el('tr', '', ...m.colunas.map((c) => el('th', '', c)))),
    el(
      'tbody',
      '',
      ...m.itens.map((l) => el('tr', '', ...l.map((v) => el('td', '', v)))),
    ),
  );
  const pares = (lista: [string, string][], classe: string) =>
    lista.map(([a, b]) =>
      el(
        'div',
        `dx-nfce__par ${classe}`,
        el('span', '', a),
        el('span', 'dx-nfce__valor', b),
      ),
    );
  const corpo = el(
    'div',
    'dx-nfce',
    divisao('cabecalho', ...linhas(m.cabecalho)),
    contingencia(),
    divisao('itens', tabela),
    divisao(
      'totais',
      ...pares(m.totais, ''),
      el(
        'div',
        'dx-nfce__par dx-nfce__cab-pag',
        el('span', '', 'FORMA DE PAGAMENTO'),
        el('span', '', 'VALOR PAGO R$'),
      ),
      ...pares(m.pagamentos, ''),
    ),
    divisao(
      'consulta',
      el('div', 'dx-nfce__forte', m.consulta.texto),
      el('div', '', m.consulta.url),
      el('div', 'dx-nfce__chave', m.consulta.chave),
    ),
    el(
      'div',
      'dx-nfce__qr-consumidor',
      divisao(
        'qr',
        m.qrCode ? qrSvg(m.qrCode, 'QR Code de consulta da NFC-e') : null,
      ),
      el(
        'div',
        'dx-nfce__lado',
        divisao('consumidor', ...linhas(m.consumidor)),
        divisao('identificacao', ...linhas(m.identificacao)),
        contingencia(),
      ),
    ),
    m.mensagemFiscal.length > 0
      ? divisao('fisco', ...linhas(m.mensagemFiscal, 'dx-nfce__forte'))
      : null,
    m.contribuinte
      ? divisao('contribuinte', el('div', '', m.contribuinte))
      : null,
  );
  container.append(el('div', 'folha dx-folha folha--nfce', corpo));
  return 1;
}
