// DACTE: o documento auxiliar do CT-e (modelo 57), pelo MOC CT-e Anexo II,
// versão 4.00 (regras gerais nas pp. 7 a 19; correlação quadro x tag nas
// pp. 20 a 24; modelo rodoviário nas pp. 27 a 30). A4 retrato, com o
// cabeçalho (emitente, modal, modelo, série, número, folha, emissão,
// código de barras CODE-128C e chave, protocolo e QR Code do
// infCTeSupl/qrCodCTe) repetido em cada folha; a tabela dos documentos
// originários continua nas folhas seguintes. O quadro específico do modal
// só sai no rodoviário (RNTRC); nos outros modais ele fica de fora.
//
// lerCte e modeloDacte são puros (testados fora do app); montarDacte desenha.

import { registrarMontador } from './documento';
import { saidaDacte } from './nomeArquivo';
import { barrasSvg, el, montarFolhas, qrSvg } from './folha';
import {
  campo,
  dataHoraSegundos,
  descrever,
  documento,
  f,
  juntar,
  type Bloco,
  type Campo,
} from './modelo';
import {
  filhoXml,
  primeiroXml,
  textoXml,
  todosXml,
  type ElementoXml,
} from './tipo';

export interface ParteCte {
  nome: string;
  endereco: string;
  municipio: string;
  uf: string;
  cep: string;
  documento: string;
  ie: string;
  pais: string;
  fone: string;
}

export interface DocumentoOriginario {
  tipo: string;
  emitente: string;
  /** Chave da NF-e formatada, ou o número do documento. */
  documento: string;
  serieNumero: string;
}

export interface DadosCte {
  versao: string;
  chave: string;
  tpAmb: string;
  modal: string;
  modelo: string;
  serie: string;
  numero: string;
  emissao: string;
  suframa: string;
  protocolo: string;
  qrCode: string;
  tipoCte: string;
  tipoServico: string;
  tomadorPapel: string;
  globalizado: string;
  cfop: string;
  inicio: string;
  termino: string;
  emitente: ParteCte;
  remetente: ParteCte | null;
  destinatario: ParteCte | null;
  expedidor: ParteCte | null;
  recebedor: ParteCte | null;
  tomador: ParteCte | null;
  carga: {
    produto: string;
    outras: string;
    valor: string;
    pesoBruto: string;
    pesoBase: string;
    pesoAferido: string;
    cubagem: string;
    volumes: string;
  };
  componentes: { nome: string; valor: string }[];
  totalPrestacao: string;
  valorReceber: string;
  imposto: {
    situacao: string;
    base: string;
    aliquota: string;
    valor: string;
    reducao: string;
    st: string;
  };
  documentos: DocumentoOriginario[];
  observacoes: string;
  usoEmissor: string;
  reservadoFisco: string;
  rntrc: string;
  rodoviario: boolean;
}

const MODAL: Record<string, string> = {
  '01': 'Rodoviário',
  '02': 'Aéreo',
  '03': 'Aquaviário',
  '04': 'Ferroviário',
  '05': 'Dutoviário',
  '06': 'Multimodal',
};
const TIPO_CTE: Record<string, string> = {
  '0': 'Normal',
  '1': 'Complemento de Valores',
  '2': 'Anulação',
  '3': 'Substituto',
};
const TIPO_SERVICO: Record<string, string> = {
  '0': 'Normal',
  '1': 'Subcontratação',
  '2': 'Redespacho',
  '3': 'Redespacho Intermediário',
  '4': 'Serviço Vinculado a Multimodal',
};
const TOMADOR: Record<string, string> = {
  '0': 'Remetente',
  '1': 'Expedidor',
  '2': 'Recebedor',
  '3': 'Destinatário',
  '4': 'Outros',
};
const CST_ICMS: Record<string, string> = {
  '00': 'Tributação normal do ICMS',
  '20': 'Tributação com BC reduzida do ICMS',
  '40': 'ICMS isenção',
  '41': 'ICMS não tributado',
  '51': 'ICMS diferido',
  '60': 'ICMS cobrado anteriormente por substituição tributária',
  '90': 'ICMS outros',
};
const MOD_DOC: Record<string, string> = {
  '01': 'NF',
  '1B': 'NF Avulsa',
  '04': 'NF Produtor',
  '55': 'NF-e',
};

const papel = (d: string) => descrever(d, TOMADOR, false);

function parte(e: ElementoXml | null, enderTag: string): ParteCte | null {
  if (!e) return null;
  const end = filhoXml(e, enderTag);
  return {
    nome: textoXml(e, 'xNome') || textoXml(e, 'xFant'),
    endereco: juntar(
      [
        juntar([textoXml(end, 'xLgr'), textoXml(end, 'nro')], ', '),
        textoXml(end, 'xCpl'),
        textoXml(end, 'xBairro'),
      ],
      ' - ',
    ),
    municipio: textoXml(end, 'xMun'),
    uf: textoXml(end, 'UF'),
    cep: f.cep(textoXml(end, 'CEP')),
    documento: documento(textoXml(e, 'CNPJ'), textoXml(e, 'CPF')),
    ie: textoXml(e, 'IE'),
    pais: textoXml(end, 'xPais'),
    fone: f.fone(textoXml(e, 'fone') || textoXml(end, 'fone')),
  };
}

/** Peso em kg a partir de qCarga e da unidade (01 kg, 02 tonelada). */
function emKg(q: string, unidade: string): string {
  if (!q) return '';
  const n = Number(q) * (unidade === '02' ? 1000 : 1);
  return Number.isFinite(n) ? f.quantidade(String(n)) : q;
}

function lerCarga(inf: ElementoXml | null): DadosCte['carga'] {
  const carga = primeiroXml(inf, 'infCarga');
  const r: DadosCte['carga'] = {
    produto: textoXml(carga, 'proPred'),
    outras: textoXml(carga, 'xOutCat'),
    valor: f.valor(textoXml(carga, 'vCarga')),
    pesoBruto: '',
    pesoBase: '',
    pesoAferido: '',
    cubagem: '',
    volumes: '',
  };
  for (const q of todosXml(carga, 'infQ')) {
    const unidade = textoXml(q, 'cUnid');
    const medida = textoXml(q, 'tpMed').toUpperCase();
    const qtd = textoXml(q, 'qCarga');
    if (unidade === '00') r.cubagem ||= f.quantidade(qtd);
    else if (unidade === '03') r.volumes ||= f.quantidade(qtd);
    else if (unidade === '01' || unidade === '02') {
      const kg = emKg(qtd, unidade);
      if (/AFERIDO/.test(medida)) r.pesoAferido ||= kg;
      else if (/BASE/.test(medida)) r.pesoBase ||= kg;
      else r.pesoBruto ||= kg;
    }
  }
  return r;
}

/** O grupo do ICMS (ICMS00, ICMS20, ..., ICMSOutraUF, ICMSSN). */
function lerImposto(inf: ElementoXml | null): DadosCte['imposto'] {
  const icms = filhoXml(filhoXml(inf, 'imp'), 'ICMS');
  const g = icms ? (Array.from(icms.children)[0] ?? null) : null;
  const t = (...tags: string[]) =>
    tags.map((x) => textoXml(g, x)).find((v) => v !== '') ?? '';
  const cst = t('CST');
  const sn = g?.localName === 'ICMSSN';
  return {
    situacao: sn
      ? `${cst ? `${cst} - ` : ''}Simples Nacional`
      : descrever(cst, CST_ICMS),
    base: f.valor(t('vBC', 'vBCOutraUF', 'vBCSTRet')),
    aliquota: f.valor(t('pICMS', 'pICMSOutraUF', 'pICMSSTRet')),
    valor: f.valor(t('vICMS', 'vICMSOutraUF', 'vICMSSTRet')),
    reducao: f.valor(t('pRedBC', 'pRedBCOutraUF')),
    st: f.valor(t('vICMSSTRet')),
  };
}

function lerDocumentos(inf: ElementoXml | null): DocumentoOriginario[] {
  const infDoc = primeiroXml(inf, 'infDoc');
  const r: DocumentoOriginario[] = [];
  for (const n of todosXml(infDoc, 'infNFe')) {
    const chave = textoXml(n, 'chave').replace(/\D/g, '');
    r.push({
      tipo: 'NF-e',
      emitente: chave.length === 44 ? f.cnpj(chave.slice(6, 20)) : '',
      documento: f.chaveAcesso(chave),
      serieNumero:
        chave.length === 44
          ? `${Number(chave.slice(22, 25))} / ${Number(chave.slice(25, 34))}`
          : '',
    });
  }
  for (const n of todosXml(infDoc, 'infNF')) {
    r.push({
      tipo: descrever(textoXml(n, 'mod'), MOD_DOC, false),
      emitente: '',
      documento: textoXml(n, 'nDoc'),
      serieNumero: juntar([textoXml(n, 'serie'), textoXml(n, 'nDoc')], ' / '),
    });
  }
  for (const n of todosXml(infDoc, 'infOutros')) {
    r.push({
      tipo: textoXml(n, 'descOutros') || 'Outros',
      emitente: '',
      documento: textoXml(n, 'nDoc'),
      serieNumero: textoXml(n, 'nDoc'),
    });
  }
  return r;
}

/** Lê o CT-e (raiz cteProc ou CTe). */
export function lerCte(raiz: ElementoXml): DadosCte {
  const inf = primeiroXml(raiz, 'infCte');
  const ide = filhoXml(inf, 'ide');
  const compl = filhoXml(inf, 'compl');
  const infProt = primeiroXml(raiz, 'infProt');
  const vPrest = filhoXml(inf, 'vPrest');
  const toma3 = filhoXml(ide, 'toma3') ?? filhoXml(ide, 'toma03');
  const toma4 = filhoXml(ide, 'toma4') ?? filhoXml(ide, 'toma04');
  const codTomador = textoXml(toma3, 'toma') || textoXml(toma4, 'toma');

  const remetente = parte(filhoXml(inf, 'rem'), 'enderReme');
  const destinatario = parte(filhoXml(inf, 'dest'), 'enderDest');
  const expedidor = parte(filhoXml(inf, 'exped'), 'enderExped');
  const recebedor = parte(filhoXml(inf, 'receb'), 'enderReceb');
  const porPapel: Record<string, ParteCte | null> = {
    '0': remetente,
    '1': expedidor,
    '2': recebedor,
    '3': destinatario,
  };
  const tomador = toma4
    ? parte(toma4, 'enderToma')
    : (porPapel[codTomador] ?? null);

  const modal = textoXml(ide, 'modal');
  const rodo = primeiroXml(filhoXml(inf, 'infCTeNorm'), 'rodo');
  const obsCont = todosXml(compl, 'ObsCont').map((o) =>
    juntar(
      [o.getAttribute('xCampo')?.trim() ?? '', textoXml(o, 'xTexto')],
      ': ',
    ),
  );
  const obsFisco = todosXml(compl, 'ObsFisco').map((o) =>
    juntar(
      [o.getAttribute('xCampo')?.trim() ?? '', textoXml(o, 'xTexto')],
      ': ',
    ),
  );
  const cStat = textoXml(infProt, 'cStat');

  return {
    versao: inf?.getAttribute('versao')?.trim() ?? '',
    chave: (inf?.getAttribute('Id')?.trim() ?? '').replace(/^CTe/, ''),
    tpAmb: textoXml(ide, 'tpAmb'),
    modal: descrever(modal, MODAL, false),
    modelo: textoXml(ide, 'mod'),
    serie: textoXml(ide, 'serie'),
    numero: textoXml(ide, 'nCT'),
    emissao: dataHoraSegundos(textoXml(ide, 'dhEmi')),
    suframa: textoXml(filhoXml(inf, 'dest'), 'ISUF'),
    protocolo:
      cStat === '100' || (cStat === '' && textoXml(infProt, 'nProt'))
        ? juntar(
            [
              textoXml(infProt, 'nProt'),
              dataHoraSegundos(textoXml(infProt, 'dhRecbto')),
            ],
            ' - ',
          )
        : '',
    qrCode: textoXml(primeiroXml(raiz, 'infCTeSupl'), 'qrCodCTe'),
    tipoCte: descrever(textoXml(ide, 'tpCTe'), TIPO_CTE, false),
    tipoServico: descrever(textoXml(ide, 'tpServ'), TIPO_SERVICO, false),
    tomadorPapel: papel(codTomador),
    globalizado: textoXml(ide, 'indGlobalizado') === '1' ? 'Sim' : '',
    cfop: juntar([textoXml(ide, 'CFOP'), textoXml(ide, 'natOp')], ' - '),
    inicio: juntar([textoXml(ide, 'xMunIni'), textoXml(ide, 'UFIni')], ' - '),
    termino: juntar([textoXml(ide, 'xMunFim'), textoXml(ide, 'UFFim')], ' - '),
    emitente: parte(filhoXml(inf, 'emit'), 'enderEmit') ?? {
      nome: '',
      endereco: '',
      municipio: '',
      uf: '',
      cep: '',
      documento: '',
      ie: '',
      pais: '',
      fone: '',
    },
    remetente,
    destinatario,
    expedidor,
    recebedor,
    tomador,
    carga: lerCarga(inf),
    componentes: todosXml(vPrest, 'Comp').map((c) => ({
      nome: textoXml(c, 'xNome'),
      valor: f.valor(textoXml(c, 'vComp')),
    })),
    totalPrestacao: f.valor(textoXml(vPrest, 'vTPrest')),
    valorReceber: f.valor(textoXml(vPrest, 'vRec')),
    imposto: lerImposto(inf),
    documentos: lerDocumentos(inf),
    observacoes: textoXml(compl, 'xObs'),
    usoEmissor: obsCont.join('\n'),
    reservadoFisco: obsFisco.join('\n'),
    rntrc: textoXml(rodo, 'RNTRC'),
    rodoviario: modal === '01',
  };
}

// ---------- modelo ----------

function camposParte(p: ParteCte | null): Campo[][] {
  const v = p ?? {
    nome: '',
    endereco: '',
    municipio: '',
    uf: '',
    cep: '',
    documento: '',
    ie: '',
    pais: '',
    fone: '',
  };
  return [
    [campo('Nome / Razão Social', v.nome)],
    [campo('Endereço', v.endereco)],
    [
      campo('Município', v.municipio, 3),
      campo('UF', v.uf, 1),
      campo('CEP', v.cep, 2),
    ],
    [campo('CNPJ / CPF', v.documento, 3), campo('Inscrição Estadual', v.ie, 3)],
    [campo('País', v.pais, 3), campo('Fone', v.fone, 3)],
  ];
}

/** Dois quadros lado a lado (remetente e destinatário, expedidor e recebedor). */
export interface ParLado {
  esquerda: { titulo: string; linhas: Campo[][] };
  direita: { titulo: string; linhas: Campo[][] };
}

export interface ModeloDacte {
  cabecalho: {
    emitente: ParteCte;
    titulo: string;
    subtitulo: string;
    modal: string;
    identificacao: Campo[];
    chave: string;
    protocolo: string;
    qrCode: string;
    consulta: string;
    tipos: Campo[];
    cfop: string;
    prestacao: Campo[];
  };
  partes: ParLado[];
  blocos: Bloco[];
  marca: string | null;
}

export const CONSULTA_CTE =
  'Consulta de autenticidade no portal nacional do CT-e, no site da Sefaz Autorizadora, ou em http://www.cte.fazenda.gov.br/portal';

export function modeloDacte(d: DadosCte): ModeloDacte {
  const partes: ParLado[] = [
    {
      esquerda: { titulo: 'REMETENTE', linhas: camposParte(d.remetente) },
      direita: { titulo: 'DESTINATÁRIO', linhas: camposParte(d.destinatario) },
    },
  ];
  // Expedidor e Recebedor podem ser omitidos sem dados (MOC, item 2.7).
  if (d.expedidor || d.recebedor)
    partes.push({
      esquerda: { titulo: 'EXPEDIDOR', linhas: camposParte(d.expedidor) },
      direita: { titulo: 'RECEBEDOR', linhas: camposParte(d.recebedor) },
    });

  const t = d.tomador;
  const comp = d.componentes;
  // Componentes em três pares de colunas (nome e valor).
  const linhasComp: string[][] = [];
  for (let i = 0; i < comp.length; i += 3) {
    const l: string[] = [];
    for (let j = 0; j < 3; j++)
      l.push(comp[i + j]?.nome ?? '', comp[i + j]?.valor ?? '');
    linhasComp.push(l);
  }

  const blocos: Bloco[] = [
    {
      chave: 'tomador',
      titulo: 'TOMADOR DO SERVIÇO',
      linhas: [
        [
          campo('Nome / Razão Social', t?.nome ?? '', 4, { destaque: true }),
          campo('Tomador é o', d.tomadorPapel, 1, { destaque: true }),
        ],
        [
          campo('Endereço', t?.endereco ?? '', 3),
          campo('Município', t?.municipio ?? '', 2),
        ],
        [
          campo('UF', t?.uf ?? '', 1),
          campo('CEP', t?.cep ?? '', 1),
          campo('CNPJ / CPF', t?.documento ?? '', 2),
          campo('Inscrição Estadual', t?.ie ?? '', 2),
          campo('País', t?.pais ?? '', 1),
          campo('Fone', t?.fone ?? '', 2),
        ],
      ],
    },
    {
      chave: 'carga',
      titulo: 'INFORMAÇÕES DA CARGA',
      linhas: [
        [
          campo('Produto Predominante', d.carga.produto, 3),
          campo('Outras Características da Carga', d.carga.outras, 3),
          campo('Valor Total da Carga', d.carga.valor, 2, { alinhar: 'dir' }),
        ],
        [
          campo('Peso Bruto (kg)', d.carga.pesoBruto, 1, { alinhar: 'dir' }),
          campo('Peso Base Cálculo (kg)', d.carga.pesoBase, 1, {
            alinhar: 'dir',
          }),
          campo('Peso Aferido (kg)', d.carga.pesoAferido, 1, {
            alinhar: 'dir',
          }),
          campo('Cubagem (m³)', d.carga.cubagem, 1, { alinhar: 'dir' }),
          campo('Qtde. Volumes (unid.)', d.carga.volumes, 1, {
            alinhar: 'dir',
          }),
        ],
      ],
    },
    {
      chave: 'componentes',
      titulo: 'COMPONENTES DO VALOR DA PRESTAÇÃO DO SERVIÇO',
      tabela: {
        colunas: [
          { titulo: 'Nome', peso: 3 },
          { titulo: 'Valor', peso: 2, alinhar: 'dir' },
          { titulo: 'Nome', peso: 3 },
          { titulo: 'Valor', peso: 2, alinhar: 'dir' },
          { titulo: 'Nome', peso: 3 },
          { titulo: 'Valor', peso: 2, alinhar: 'dir' },
        ],
        linhas: linhasComp,
      },
    },
    {
      chave: 'prestacao',
      titulo: null,
      linhas: [
        [
          campo('Valor Total do Serviço', d.totalPrestacao, 1, {
            alinhar: 'dir',
            destaque: true,
          }),
          campo('Valor a Receber', d.valorReceber, 1, {
            alinhar: 'dir',
            destaque: true,
          }),
        ],
      ],
    },
    {
      chave: 'imposto',
      titulo: 'INFORMAÇÕES RELATIVAS AO IMPOSTO',
      linhas: [
        [
          campo('Situação Tributária', d.imposto.situacao, 4),
          campo('Base de Cálculo', d.imposto.base, 2, { alinhar: 'dir' }),
          campo('Alíq. ICMS', d.imposto.aliquota, 1, { alinhar: 'dir' }),
          campo('Valor ICMS', d.imposto.valor, 2, { alinhar: 'dir' }),
          campo('% Red. BC Calc.', d.imposto.reducao, 1, { alinhar: 'dir' }),
          campo('ICMS ST', d.imposto.st, 2, { alinhar: 'dir' }),
        ],
      ],
    },
    {
      chave: 'documentos',
      titulo: 'DOCUMENTOS ORIGINÁRIOS',
      tabela: {
        colunas: [
          { titulo: 'Tp. Doc.', peso: 1 },
          { titulo: 'CNPJ / CPF Emitente', peso: 2 },
          { titulo: 'Chave de Acesso / Documento', peso: 5 },
          { titulo: 'Série / Nº Documento', peso: 2 },
        ],
        linhas: d.documentos.map((x) => [
          x.tipo,
          x.emitente,
          x.documento,
          x.serieNumero,
        ]),
      },
    },
    {
      chave: 'observacoes',
      titulo: 'OBSERVAÇÕES',
      texto: { rotulo: null, valor: d.observacoes },
    },
  ];
  if (d.rodoviario)
    blocos.push({
      chave: 'modal',
      titulo: 'INFORMAÇÕES ESPECÍFICAS DO MODAL RODOVIÁRIO',
      linhas: [[campo('RNTRC da Empresa', d.rntrc)]],
    });
  blocos.push({
    chave: 'fisco',
    titulo: null,
    linhas: [
      [
        campo('Uso Exclusivo do Emissor do CT-e', d.usoEmissor, 1),
        campo('Reservado ao Fisco', d.reservadoFisco, 1),
      ],
    ],
  });

  return {
    cabecalho: {
      emitente: d.emitente,
      titulo: 'DACTE',
      subtitulo: 'Documento Auxiliar do Conhecimento de Transporte Eletrônico',
      modal: d.modal ? `MODAL ${d.modal.toUpperCase()}` : '',
      identificacao: [
        campo('Modelo', d.modelo, 1, { alinhar: 'centro' }),
        campo('Série', d.serie, 1, { alinhar: 'centro' }),
        campo('Número', d.numero, 2, { alinhar: 'centro' }),
        campo('Data e Hora de Emissão', d.emissao, 3, { alinhar: 'centro' }),
        campo('Insc. Suframa do Dest.', d.suframa, 2, { alinhar: 'centro' }),
      ],
      chave: f.chaveAcesso(d.chave),
      protocolo: d.protocolo,
      qrCode: d.qrCode,
      consulta: CONSULTA_CTE,
      tipos: [
        campo('Tipo do CT-e', d.tipoCte),
        campo('Tipo do Serviço', d.tipoServico),
        campo('Tomador do Serviço', d.tomadorPapel),
        ...(d.globalizado ? [campo('CT-e Globalizado', d.globalizado)] : []),
      ],
      cfop: d.cfop,
      prestacao: [
        campo('Início da Prestação', d.inicio),
        campo('Término da Prestação', d.termino),
      ],
    },
    partes,
    blocos,
    marca:
      d.tpAmb === '2'
        ? 'EMITIDO EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL'
        : null,
  };
}

// ---------- desenho ----------

function linhaCampos(campos: Campo[]): HTMLElement {
  return el(
    'div',
    'dx-linha',
    ...campos.map((c) => {
      const e = el(
        'div',
        `dx-campo${c.alinhar === 'dir' ? ' dx-dir' : c.alinhar === 'centro' ? ' dx-centro' : ''}${c.destaque ? ' dx-campo--destaque' : ''}`,
        c.rotulo ? el('div', 'dx-campo__rotulo', c.rotulo) : null,
        el('div', 'dx-campo__valor', c.valor),
      );
      e.style.flex = `${c.peso} 1 0`;
      return e;
    }),
  );
}

function cabecalho(
  m: ModeloDacte,
  chaveCrua: string,
  numero: HTMLElement,
): HTMLElement {
  const c = m.cabecalho;
  const e = c.emitente;
  const emitente = el(
    'div',
    'dx-dacte__emitente',
    el('div', 'dx-dacte__razao', e.nome),
    el('div', '', e.endereco),
    el('div', '', juntar([e.municipio, e.uf], ' - ')),
    el(
      'div',
      '',
      juntar(
        [e.cep ? `CEP ${e.cep}` : '', e.fone ? `Fone ${e.fone}` : ''],
        ' · ',
      ),
    ),
    el(
      'div',
      '',
      juntar(
        [
          e.documento ? `CNPJ/CPF ${e.documento}` : '',
          e.ie ? `IE ${e.ie}` : '',
        ],
        ' · ',
      ),
    ),
  );
  const titulo = el(
    'div',
    'dx-dacte__titulo',
    el('div', 'dx-dacte__nome', c.titulo),
    el('div', 'dx-dacte__sub', c.subtitulo),
    el('div', 'dx-dacte__modal', c.modal),
    el('div', 'dx-dacte__folha', numero),
  );
  const fisco = el(
    'div',
    'dx-dacte__fisco',
    el('div', 'dx-campo__rotulo', 'Controle do Fisco'),
    el(
      'div',
      'dx-dacte__barras',
      barrasSvg(chaveCrua, 'Código de barras da chave de acesso do CT-e'),
    ),
    el('div', 'dx-campo__rotulo', 'Chave de Acesso'),
    el('div', 'dx-dacte__chave', c.chave),
    el('div', 'dx-dacte__consulta', c.consulta),
  );
  const qr = c.qrCode
    ? el('div', 'dx-dacte__qr', qrSvg(c.qrCode, 'QR Code de consulta do CT-e'))
    : null;
  return el(
    'header',
    'dx-bloco dx-dacte__cab',
    el('div', 'dx-dacte__topo', emitente, titulo, fisco, qr),
    linhaCampos(c.identificacao),
    linhaCampos([
      ...c.tipos,
      {
        rotulo: 'Protocolo de Autorização de Uso',
        valor: c.protocolo,
        peso: 2,
      },
    ]),
    linhaCampos([
      { rotulo: 'CFOP - Natureza da Prestação', valor: c.cfop, peso: 1 },
    ]),
    linhaCampos(c.prestacao),
  );
}

function blocoParte(t: string, linhas: Campo[][]): HTMLElement {
  return el(
    'div',
    'dx-dacte__parte',
    el('h2', 'dx-bloco__titulo', t),
    ...linhas.map(linhaCampos),
  );
}

export function montarDacte(container: HTMLElement, d: DadosCte): number {
  const m = modeloDacte(d);
  const partes = m.partes.map((p) =>
    el(
      'section',
      'dx-bloco dx-dacte__lado',
      blocoParte(p.esquerda.titulo, p.esquerda.linhas),
      blocoParte(p.direita.titulo, p.direita.linhas),
    ),
  );
  return montarFolhas(container, {
    classe: 'dacte',
    cabecalho: (numero) => cabecalho(m, d.chave, numero),
    blocos: [...partes, ...m.blocos],
    marca: m.marca,
  });
}

registrarMontador('cte', (elementos: ElementoXml[]) => {
  const d = lerCte(elementos[0]);
  const emit = filhoXml(primeiroXml(elementos[0], 'infCte'), 'emit');
  return {
    arquivo: saidaDacte(
      textoXml(emit, 'xFant'),
      textoXml(emit, 'xNome'),
      d.numero,
      d.serie,
    ),
    resumo: {
      emitente: d.emitente.nome,
      titulo: juntar(
        [`CT-e nº ${d.numero}`, d.serie ? `série ${d.serie}` : ''],
        ' ',
      ),
      emissao: d.emissao
        ? d.emissao.replace(/^(\d{2})\/(\d{2})\/(\d{4}).*/, '$3-$2-$1')
        : '',
      versao: d.versao,
    },
    montar: (c) => montarDacte(c, d),
  };
});
