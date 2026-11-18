// Evento da NF-e (carta de correção, cancelamento, manifestação do
// destinatário e outros): não há modelo oficial de impressão (o MOC 7.0 da
// NF-e descreve só o XML: cancelamento no item 5.9, carta de correção no
// 5.10, manifestação no 5.11). O PS Reader mostra uma folha A4 simples com o
// tipo do evento, a chave da nota (com o código de barras), data,
// protocolo, justificativa ou o texto da correção, e diz no pé que montou a
// visualização a partir do XML. Lê também o cancelamento no leiaute antigo
// (procCancNFe, de antes dos eventos).
//
// lerEvento e modeloEvento são puros; montarEvento desenha.

import { registrarMontador } from './documento';
import { barrasSvg, el, montarFolhas } from './folha';
import {
  campo,
  dataHoraSegundos,
  descrever,
  documento,
  f,
  juntar,
  type Bloco,
} from './modelo';
import { filhoXml, primeiroXml, textoXml, type ElementoXml } from './tipo';

export interface DadosEvento {
  tipo: string;
  codigo: string;
  descricao: string;
  chave: string;
  autor: string;
  orgao: string;
  ambiente: string;
  tpAmb: string;
  dhEvento: string;
  sequencia: string;
  versao: string;
  protocolo: string;
  dhRegistro: string;
  situacao: string;
  /** Campos próprios do evento (correção, justificativa, protocolo da nota...). */
  detalhes: { rotulo: string; valor: string }[];
  condicaoUso: string;
  leiauteAntigo: boolean;
}

const TIPO_EVENTO: Record<string, string> = {
  '110110': 'Carta de Correção',
  '110111': 'Cancelamento',
  '110112': 'Cancelamento por Substituição',
  '110140': 'EPEC',
  '210200': 'Confirmação da Operação',
  '210210': 'Ciência da Operação',
  '210220': 'Desconhecimento da Operação',
  '210240': 'Operação não Realizada',
};

const UF: Record<string, string> = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
  '91': 'Ambiente Nacional (AN)',
};

const AMBIENTE: Record<string, string> = {
  '1': 'Produção',
  '2': 'Homologação',
};

/** Rótulo dos campos conhecidos do detEvento. */
const ROTULOS: Record<string, string> = {
  xCorrecao: 'Correção',
  nProt: 'Protocolo de Autorização da NF-e',
  xJust: 'Justificativa',
  chNFeRef: 'Chave da NF-e Substituta',
  cOrgaoAutor: 'Órgão do Autor',
  tpAutor: 'Tipo do Autor',
  verAplic: 'Versão do Aplicativo',
};

/** Lê o evento (procEventoNFe ou evento) ou o cancelamento antigo (procCancNFe). */
export function lerEvento(raiz: ElementoXml): DadosEvento {
  if (raiz.localName === 'procCancNFe' || raiz.localName === 'cancNFe')
    return lerCancelamentoAntigo(raiz);
  const ev = primeiroXml(raiz, 'evento');
  const inf = primeiroXml(ev ?? raiz, 'infEvento');
  const det = filhoXml(inf, 'detEvento');
  const ret = primeiroXml(primeiroXml(raiz, 'retEvento'), 'infEvento');
  const codigo = textoXml(inf, 'tpEvento');
  const descricao = textoXml(det, 'descEvento');
  const detalhes: DadosEvento['detalhes'] = [];
  for (const c of Array.from(det?.children ?? [])) {
    const nome = c.localName;
    if (nome === 'descEvento' || nome === 'xCondUso') continue;
    if (c.children.length > 0) continue;
    const v = c.textContent?.trim() ?? '';
    if (!v) continue;
    detalhes.push({ rotulo: ROTULOS[nome] ?? nome, valor: v });
  }
  return {
    tipo: TIPO_EVENTO[codigo] ?? descricao,
    codigo,
    descricao,
    chave: textoXml(inf, 'chNFe'),
    autor: documento(textoXml(inf, 'CNPJ'), textoXml(inf, 'CPF')),
    orgao: descrever(textoXml(inf, 'cOrgao'), UF),
    ambiente: descrever(textoXml(inf, 'tpAmb'), AMBIENTE),
    tpAmb: textoXml(inf, 'tpAmb'),
    dhEvento: dataHoraSegundos(textoXml(inf, 'dhEvento')),
    sequencia: textoXml(inf, 'nSeqEvento'),
    versao:
      ev?.getAttribute('versao')?.trim() ??
      raiz.getAttribute('versao')?.trim() ??
      '',
    protocolo: textoXml(ret, 'nProt'),
    dhRegistro: dataHoraSegundos(textoXml(ret, 'dhRegEvento')),
    situacao: juntar([textoXml(ret, 'cStat'), textoXml(ret, 'xMotivo')], ' - '),
    detalhes,
    condicaoUso: textoXml(det, 'xCondUso'),
    leiauteAntigo: false,
  };
}

function lerCancelamentoAntigo(raiz: ElementoXml): DadosEvento {
  const inf = primeiroXml(primeiroXml(raiz, 'cancNFe') ?? raiz, 'infCanc');
  const ret = primeiroXml(primeiroXml(raiz, 'retCancNFe'), 'infCanc');
  return {
    tipo: 'Cancelamento',
    codigo: '',
    descricao: 'Cancelamento',
    chave: textoXml(inf, 'chNFe'),
    autor: '',
    orgao: descrever(textoXml(ret, 'cUF'), UF),
    ambiente: descrever(textoXml(inf, 'tpAmb'), AMBIENTE),
    tpAmb: textoXml(inf, 'tpAmb'),
    dhEvento: '',
    sequencia: '',
    versao: raiz.getAttribute('versao')?.trim() ?? '',
    protocolo: textoXml(ret, 'nProt'),
    dhRegistro: dataHoraSegundos(textoXml(ret, 'dhRecbto')),
    situacao: juntar([textoXml(ret, 'cStat'), textoXml(ret, 'xMotivo')], ' - '),
    detalhes: [
      {
        rotulo: 'Protocolo de Autorização da NF-e',
        valor: textoXml(inf, 'nProt'),
      },
      { rotulo: 'Justificativa', valor: textoXml(inf, 'xJust') },
    ].filter((d) => d.valor !== ''),
    condicaoUso: '',
    leiauteAntigo: true,
  };
}

export interface ModeloEvento {
  titulo: string;
  subtitulo: string;
  chave: string;
  blocos: Bloco[];
  rodape: string;
  marca: string | null;
}

export function modeloEvento(d: DadosEvento): ModeloEvento {
  const chave = d.chave.replace(/\D/g, '');
  const nota =
    chave.length === 44
      ? {
          emitente: f.cnpj(chave.slice(6, 20)),
          modelo: chave.slice(20, 22),
          serie: String(Number(chave.slice(22, 25))),
          numero: String(Number(chave.slice(25, 34))),
        }
      : null;
  const blocos: Bloco[] = [
    {
      chave: 'nota',
      titulo: 'NF-E DO EVENTO',
      linhas: [
        [
          campo('Chave de Acesso', f.chaveAcesso(d.chave), 1, {
            destaque: true,
          }),
        ],
        [
          campo('CNPJ do Emitente da NF-e', nota?.emitente ?? ''),
          campo('Modelo', nota?.modelo ?? ''),
          campo('Série', nota?.serie ?? ''),
          campo('Número', nota?.numero ?? ''),
        ],
      ],
    },
    {
      chave: 'evento',
      titulo: 'EVENTO',
      linhas: [
        [
          campo('Tipo do Evento', juntar([d.codigo, d.tipo], ' - '), 2),
          campo('Data e Hora do Evento', d.dhEvento),
          campo('Sequência', d.sequencia),
        ],
        [
          campo('Autor (CNPJ / CPF)', d.autor),
          campo('Órgão', d.orgao),
          campo('Ambiente', d.ambiente),
          campo('Versão', d.versao),
        ],
      ],
    },
    {
      chave: 'registro',
      titulo: 'REGISTRO DO EVENTO',
      linhas: [
        [
          campo('Protocolo', d.protocolo),
          campo('Data e Hora do Registro', d.dhRegistro),
          campo('Situação', d.situacao, 2),
        ],
      ],
    },
    ...d.detalhes.map((x): Bloco => ({
      chave: 'detalhe',
      titulo: x.rotulo.toUpperCase(),
      texto: { rotulo: null, valor: x.valor },
    })),
  ];
  if (d.condicaoUso)
    blocos.push({
      chave: 'condicao',
      titulo: 'CONDIÇÃO DE USO',
      texto: { rotulo: null, valor: d.condicaoUso },
    });
  return {
    titulo: d.tipo ? d.tipo.toUpperCase() : 'EVENTO DA NF-E',
    subtitulo: d.leiauteAntigo
      ? 'Cancelamento da NF-e (leiaute anterior aos eventos)'
      : 'Evento da Nota Fiscal Eletrônica',
    chave,
    blocos,
    rodape:
      'Visualização montada pelo PS Reader a partir do XML do evento. Não há modelo oficial de impressão para eventos da NF-e: o arquivo do evento faz parte da NF-e e vale como está.',
    marca:
      d.tpAmb === '2' ? 'AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL' : null,
  };
}

export function montarEvento(container: HTMLElement, d: DadosEvento): number {
  const m = modeloEvento(d);
  return montarFolhas(container, {
    classe: 'evento',
    umaFolha: true,
    marca: m.marca,
    cabecalho: () =>
      el(
        'header',
        'dx-bloco dx-evento__cab',
        el(
          'div',
          'dx-evento__titulos',
          el('div', 'dx-evento__titulo', m.titulo),
          el('div', 'dx-evento__sub', m.subtitulo),
        ),
        el(
          'div',
          'dx-evento__barras',
          barrasSvg(m.chave, 'Código de barras da chave de acesso da NF-e'),
        ),
      ),
    blocos: m.blocos,
    rodape: el('div', 'dx-rodape', m.rodape),
  });
}

registrarMontador('evento-nfe', (elementos: ElementoXml[]) => {
  const d = lerEvento(elementos[0]);
  return {
    resumo: {
      emitente: d.tipo || 'Evento da NF-e',
      titulo:
        d.chave.length === 44
          ? `NF-e nº ${Number(d.chave.slice(25, 34))} série ${Number(d.chave.slice(22, 25))}`
          : 'Evento da NF-e',
      emissao: '',
      versao: d.versao,
    },
    montar: (c) => montarEvento(c, d),
  };
});
