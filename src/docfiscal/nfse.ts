// Leitura da NFS-e para o DANFSe: o XML da NFS-e Nacional (raiz NFSe,
// leiaute do Sistema Nacional NFS-e) e o XML municipal no padrão ABRASF
// (versões 2.0x: CompNfse/Nfse/InfNfse com a DeclaracaoPrestacaoServico;
// a 1.0, com o Servico direto no InfNfse, também é lida). Os dois viram o
// mesmo objeto, já com os textos do DANFSe (descrições dos códigos pelas
// opções do leiaute). Campo ausente fica ''. Puro, sem DOM.
//
// O nome do município não vem nos endereços: só o código IBGE. O DANFSe
// mostra o nome quando o código é um dos municípios com nome no próprio XML
// (emissão, prestação, incidência); senão, "IBGE nnnnnnn" e a UF (pelos dois
// primeiros dígitos do código).

import {
  filhoXml,
  primeiroXml,
  textoXml,
  todosXml,
  type ElementoXml,
} from './tipo';
import { descrever, documento, f, juntar } from './modelo';

export interface PessoaNfse {
  documento: string;
  inscricaoMunicipal: string;
  telefone: string;
  nome: string;
  /** "Aracaju / SE" ou "IBGE 2800308 / SE". */
  municipio: string;
  /** "2800308 / 49075-030". */
  codigoCep: string;
  endereco: string;
  email: string;
}

export interface DadosNfse {
  origem: 'nacional' | 'abrasf';
  versao: string;
  /** Chave de acesso (50 dígitos), ou ''. */
  chave: string;
  numero: string;
  /** dd/mm/aaaa ou mm/aaaa, já formatada. */
  competencia: string;
  /** Data e hora da NFS-e, como no XML. */
  dhNfse: string;
  numeroDps: string;
  serieDps: string;
  dhDps: string;
  emitente: string;
  situacao: string;
  finalidade: string;
  codigoVerificacao: string;
  /** "Município: Aracaju / SE". */
  municipioEmissor: string;
  ambienteGerador: string;
  tipoAmbiente: string;
  /** 2: homologação (marca "SEM VALIDADE JURÍDICA"). */
  tpAmb: string;
  prestador: PessoaNfse & { simples: string; regimeSN: string };
  tomador: PessoaNfse | null;
  /** 'tomador': o destinatário é o próprio tomador. */
  destinatario: PessoaNfse | 'tomador' | null;
  intermediario: PessoaNfse | null;
  servico: {
    codigo: string;
    nbs: string;
    local: string;
    descricaoCodigo: string;
    descricao: string;
  };
  /** null: operação não sujeita ao ISSQN (bloco suprimido). */
  issqn: {
    tributacao: string;
    incidencia: string;
    regimeEspecial: string;
    imunidade: string;
    suspensao: string;
    processo: string;
    beneficio: string;
    calculoBM: string;
    deducoes: string;
    descontoIncondicionado: string;
    base: string;
    aliquota: string;
    retencao: string;
    valor: string;
  } | null;
  federal: {
    irrf: string;
    cp: string;
    contribuicoesRetidas: string;
    pis: string;
    cofins: string;
    descricaoRetidas: string;
  };
  /** null: a NFS-e não tem o grupo do IBS/CBS. */
  ibscbs: {
    cst: string;
    incidencia: string;
    base: string;
    aliquotaIbsUf: string;
    aliquotaIbsMun: string;
    efetivaIbsUf: string;
    efetivaIbsMun: string;
    valorIbsUf: string;
    valorIbsMun: string;
    totalIbs: string;
    aliquotaCbs: string;
    efetivaCbs: string;
    totalCbs: string;
  } | null;
  total: {
    servico: string;
    descontoIncondicionado: string;
    descontoCondicionado: string;
    retencoes: string;
    liquido: string;
    ibscbs: string;
    liquidoMaisIbscbs: string;
  };
  complementares: string;
}

// ---------- tabelas do leiaute ----------

const UF_IBGE: Record<string, string> = {
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
};

const AMBIENTE_GERADOR: Record<string, string> = {
  '1': 'Ambiente gerador: Prefeitura',
  '2': 'Ambiente gerador: Sistema Nacional NFS-e',
};
const TIPO_AMBIENTE: Record<string, string> = {
  '1': 'Produção',
  '2': 'Homologação (produção restrita)',
};
const EMITENTE: Record<string, string> = {
  '1': 'Prestador',
  '2': 'Tomador',
  '3': 'Intermediário',
};
const SITUACAO: Record<string, string> = {
  '100': 'NFS-e Gerada',
  '101': 'NFS-e de Substituição Gerada',
  '102': 'NFS-e de Decisão Judicial',
  '103': 'NFS-e Avulsa',
};
const FINALIDADE: Record<string, string> = { '0': 'NFS-e regular' };
const OP_SIMPLES: Record<string, string> = {
  '1': 'Não Optante',
  '2': 'Optante - Microempreendedor Individual (MEI)',
  '3': 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
};
const REGIME_SN: Record<string, string> = {
  '1': 'Regime de apuração dos tributos federais e municipal pelo Simples Nacional',
  '2': 'Regime de apuração dos tributos federais pelo SN e o ISSQN pela NFS-e conforme legislação municipal',
  '3': 'Regime de apuração dos tributos federais e municipal pela NFS-e conforme as legislações de cada tributo',
};
const REGIME_ESPECIAL: Record<string, string> = {
  '0': 'Nenhum',
  '1': 'Ato Cooperado (Cooperativa)',
  '2': 'Estimativa',
  '3': 'Microempresa Municipal',
  '4': 'Notário ou Registrador',
  '5': 'Profissional Autônomo',
  '6': 'Sociedade de Profissionais',
};
const TRIB_ISSQN: Record<string, string> = {
  '1': 'Operação Tributável',
  '2': 'Imunidade',
  '3': 'Exportação de Serviço',
  '4': 'Não Incidência',
};
const RET_ISSQN: Record<string, string> = {
  '1': 'Não Retido',
  '2': 'Retido pelo Tomador',
  '3': 'Retido pelo Intermediário',
};
const IMUNIDADE: Record<string, string> = {
  '0': 'Imunidade (tipo não informado na nota)',
  '1': 'Patrimônio, renda ou serviços, uns dos outros (CF88, Art 150, VI, a)',
  '2': 'Templos de qualquer culto (CF88, Art 150, VI, b)',
  '3': 'Patrimônio, renda ou serviços dos partidos políticos, das entidades sindicais dos trabalhadores, das instituições de educação e de assistência social (CF88, Art 150, VI, c)',
  '4': 'Livros, jornais, periódicos e o papel destinado a sua impressão (CF88, Art 150, VI, d)',
  '5': 'Fonogramas e videofonogramas musicais produzidos no Brasil (CF88, Art 150, VI, e)',
};
const SUSPENSAO: Record<string, string> = {
  '1': 'Exigibilidade Suspensa por Decisão Judicial',
  '2': 'Exigibilidade Suspensa por Processo Administrativo',
};
const TIPO_BM: Record<string, string> = {
  '1': 'Alíquota Diferenciada',
  '2': 'Redução da BC',
  '3': 'Isenção',
};

// ABRASF
const EXIGIBILIDADE_ABRASF: Record<string, string> = {
  '1': 'Exigível',
  '2': 'Não Incidência',
  '3': 'Isenção',
  '4': 'Exportação',
  '5': 'Imunidade',
  '6': 'Exigibilidade Suspensa por Decisão Judicial',
  '7': 'Exigibilidade Suspensa por Processo Administrativo',
};
const REGIME_ESPECIAL_ABRASF: Record<string, string> = {
  '1': 'Microempresa Municipal',
  '2': 'Estimativa',
  '3': 'Sociedade de Profissionais',
  '4': 'Cooperativa',
  '5': 'Microempreendedor Individual (MEI)',
  '6': 'Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
};

// ---------- formatação ----------

/** "010701" -> "01.07.01" (código de tributação nacional). */
export function codigoTributacao(c: string): string {
  return /^\d{6}$/.test(c) ? c.replace(/(\d{2})(\d{2})(\d{2})/, '$1.$2.$3') : c;
}

/** "123456789" -> "1.2345.67.89" (código da NBS). */
export function codigoNbs(c: string): string {
  return /^\d{9}$/.test(c)
    ? c.replace(/(\d)(\d{4})(\d{2})(\d{2})/, '$1.$2.$3.$4')
    : c;
}

/** Soma de valores do XML ('' se nenhum veio). */
function somar(...brutos: string[]): string {
  const n = brutos.filter((b) => b !== '' && Number.isFinite(Number(b)));
  if (n.length === 0) return '';
  return (Math.round(n.reduce((s, b) => s + Number(b), 0) * 100) / 100).toFixed(
    2,
  );
}

const positivo = (b: string) => b !== '' && Number(b) > 0;

/** Município pelo código IBGE, com o nome se o XML trouxe esse código com nome. */
function municipio(cMun: string, nomes: Map<string, string>, uf = ''): string {
  if (!cMun) return uf;
  const sigla = uf || UF_IBGE[cMun.slice(0, 2)] || '';
  const nome = nomes.get(cMun);
  return juntar([nome ?? `IBGE ${cMun}`, sigla], ' / ');
}

// ---------- NFS-e Nacional ----------

function pessoaNacional(
  p: ElementoXml | null,
  nomes: Map<string, string>,
): PessoaNfse | null {
  if (!p) return null;
  const end = filhoXml(p, 'end');
  const nac = filhoXml(end, 'endNac');
  const ext = filhoXml(end, 'endExt');
  const cMun = textoXml(nac, 'cMun');
  return {
    documento: documento(
      textoXml(p, 'CNPJ'),
      textoXml(p, 'CPF'),
      textoXml(p, 'NIF'),
    ),
    inscricaoMunicipal: textoXml(p, 'IM'),
    telefone: f.fone(textoXml(p, 'fone')),
    nome: textoXml(p, 'xNome'),
    municipio: ext
      ? juntar([textoXml(ext, 'xCidade'), textoXml(ext, 'cPais')], ' / ')
      : municipio(cMun, nomes),
    codigoCep: ext
      ? textoXml(ext, 'cEndPost')
      : juntar([cMun, f.cep(textoXml(nac, 'CEP'))], ' / '),
    endereco: juntar(
      [
        textoXml(end, 'xLgr'),
        textoXml(end, 'nro'),
        textoXml(end, 'xCpl'),
        textoXml(end, 'xBairro'),
      ],
      ', ',
    ),
    email: textoXml(p, 'email'),
  };
}

function lerNacional(raiz: ElementoXml): DadosNfse {
  const inf = primeiroXml(raiz, 'infNFSe');
  const emit = filhoXml(inf, 'emit');
  const valNfse = filhoXml(inf, 'valores');
  const dps = primeiroXml(inf, 'infDPS');
  const prest = filhoXml(dps, 'prest');
  const regTrib = filhoXml(prest, 'regTrib');
  const serv = filhoXml(dps, 'serv');
  const cServ = filhoXml(serv, 'cServ');
  const locPrest = filhoXml(serv, 'locPrest');
  const valDps = filhoXml(dps, 'valores');
  const trib = filhoXml(valDps, 'trib');
  const tribMun = filhoXml(trib, 'tribMun');
  const tribFed = filhoXml(trib, 'tribFed');
  const piscofins = filhoXml(tribFed, 'piscofins');
  const descontos = filhoXml(valDps, 'vDescCondIncond');
  const ibsDps = filhoXml(dps, 'IBSCBS');
  const ibsNfse = filhoXml(inf, 'IBSCBS');
  const enderEmit = filhoXml(emit, 'enderNac');

  // Nomes de municípios que o próprio XML traz.
  const nomes = new Map<string, string>();
  const nomear = (c: string, n: string) => {
    if (c && n) nomes.set(c, n);
  };
  nomear(textoXml(dps, 'cLocEmi'), textoXml(inf, 'xLocEmi'));
  nomear(textoXml(locPrest, 'cLocPrestacao'), textoXml(inf, 'xLocPrestacao'));
  nomear(textoXml(inf, 'cLocIncid'), textoXml(inf, 'xLocIncid'));

  const prestador = pessoaNacional(prest, nomes) ?? pessoaVazia();
  // O prestador emitente vem completo em emit (nome e endereço da NFS-e).
  if (emit) {
    const e = pessoaNacional(emit, nomes);
    if (e) {
      prestador.nome ||= e.nome;
      prestador.telefone ||= e.telefone;
      prestador.email ||= e.email;
      if (!prestador.endereco) {
        const cMun = textoXml(enderEmit, 'cMun');
        prestador.endereco = juntar(
          [
            textoXml(enderEmit, 'xLgr'),
            textoXml(enderEmit, 'nro'),
            textoXml(enderEmit, 'xCpl'),
            textoXml(enderEmit, 'xBairro'),
          ],
          ', ',
        );
        prestador.municipio = municipio(cMun, nomes, textoXml(enderEmit, 'UF'));
        prestador.codigoCep = juntar(
          [cMun, f.cep(textoXml(enderEmit, 'CEP'))],
          ' / ',
        );
      }
    }
  }

  const tomador = pessoaNacional(filhoXml(dps, 'toma'), nomes);
  const dest = pessoaNacional(filhoXml(ibsDps, 'dest'), nomes);
  const destinatario: DadosNfse['destinatario'] = dest
    ? dest
    : tomador && textoXml(ibsDps, 'indDest') === '0'
      ? 'tomador'
      : null;

  const tribISSQN = textoXml(tribMun, 'tribISSQN');
  const exig = filhoXml(tribMun, 'exigSusp');
  const bm = filhoXml(tribMun, 'BM');
  const tpRetPisCofins = textoXml(piscofins, 'tpRetPisCofins');
  const pisCofinsRetido = tpRetPisCofins === '1';
  const vPis = textoXml(piscofins, 'vPis');
  const vCofins = textoXml(piscofins, 'vCofins');
  const vCsll = textoXml(tribFed, 'vRetCSLL');
  const retidas = pisCofinsRetido ? somar(vPis, vCofins, vCsll) : vCsll;
  const nomesRetidas = [
    ...(pisCofinsRetido && positivo(vPis) ? ['PIS'] : []),
    ...(pisCofinsRetido && positivo(vCofins) ? ['COFINS'] : []),
    ...(positivo(vCsll) ? ['CSLL'] : []),
  ];

  const issqnSujeito = tribMun !== null && tribISSQN !== '4';
  const totTrib = filhoXml(trib, 'totTrib');
  const vTotTrib = filhoXml(totTrib, 'vTotTrib');
  const pTotTrib = filhoXml(totTrib, 'pTotTrib');
  const aproximados = vTotTrib
    ? `Totais aproximados dos tributos: Federais R$ ${f.valor(textoXml(vTotTrib, 'vTotTribFed'))}, Estaduais R$ ${f.valor(textoXml(vTotTrib, 'vTotTribEst'))}, Municipais R$ ${f.valor(textoXml(vTotTrib, 'vTotTribMun'))}`
    : pTotTrib
      ? `Totais aproximados dos tributos: Federais ${f.valor(textoXml(pTotTrib, 'pTotTribFed'))}%, Estaduais ${f.valor(textoXml(pTotTrib, 'pTotTribEst'))}%, Municipais ${f.valor(textoXml(pTotTrib, 'pTotTribMun'))}%`
      : textoXml(totTrib, 'pTotTribSN')
        ? `Totais aproximados dos tributos (Simples Nacional): ${f.valor(textoXml(totTrib, 'pTotTribSN'))}%`
        : '';

  const ibscbs = lerIbsCbs(ibsNfse, ibsDps);
  const vLiq = textoXml(valNfse, 'vLiq');
  const totalIbsCbs = ibscbs ? somar(ibscbs.totalIbs, ibscbs.totalCbs) : '';

  return {
    origem: 'nacional',
    versao: raiz.getAttribute('versao')?.trim() ?? '',
    chave: (inf?.getAttribute('Id')?.trim() ?? '').replace(/^NFS/, ''),
    numero: textoXml(inf, 'nNFSe'),
    competencia: f.data(textoXml(dps, 'dCompet')),
    dhNfse: textoXml(inf, 'dhProc'),
    numeroDps: textoXml(dps, 'nDPS'),
    serieDps: textoXml(dps, 'serie'),
    dhDps: textoXml(dps, 'dhEmi'),
    emitente: descrever(textoXml(dps, 'tpEmit'), EMITENTE, false),
    situacao: descrever(textoXml(inf, 'cStat'), SITUACAO, false),
    finalidade: descrever(textoXml(ibsDps, 'finNFSe'), FINALIDADE, false),
    codigoVerificacao: '',
    municipioEmissor: textoXml(inf, 'xLocEmi')
      ? `Município: ${juntar([textoXml(inf, 'xLocEmi'), textoXml(enderEmit, 'UF')], ' / ')}`
      : '',
    ambienteGerador: descrever(
      textoXml(inf, 'ambGer'),
      AMBIENTE_GERADOR,
      false,
    ),
    tipoAmbiente: descrever(textoXml(dps, 'tpAmb'), TIPO_AMBIENTE, false),
    tpAmb: textoXml(dps, 'tpAmb'),
    prestador: {
      ...prestador,
      simples: descrever(textoXml(regTrib, 'opSimpNac'), OP_SIMPLES, false),
      regimeSN: descrever(textoXml(regTrib, 'regApTribSN'), REGIME_SN, false),
    },
    tomador,
    destinatario,
    intermediario: pessoaNacional(filhoXml(dps, 'interm'), nomes),
    servico: {
      codigo: juntar(
        [
          codigoTributacao(textoXml(cServ, 'cTribNac')),
          textoXml(cServ, 'cTribMun'),
        ],
        ' / ',
      ),
      nbs: codigoNbs(textoXml(cServ, 'cNBS')),
      local: textoXml(locPrest, 'cPaisPrestacao')
        ? juntar(
            [
              textoXml(inf, 'xLocPrestacao'),
              textoXml(locPrest, 'cPaisPrestacao'),
            ],
            ' / ',
          )
        : juntar(
            [municipio(textoXml(locPrest, 'cLocPrestacao'), nomes), 'BR'],
            ' / ',
          ),
      descricaoCodigo: textoXml(inf, 'xTribMun') || textoXml(inf, 'xTribNac'),
      descricao: textoXml(cServ, 'xDescServ'),
    },
    issqn: issqnSujeito
      ? {
          tributacao: descrever(tribISSQN, TRIB_ISSQN, false),
          incidencia: juntar(
            [
              municipio(textoXml(inf, 'cLocIncid'), nomes),
              textoXml(tribMun, 'cPaisResult') || 'BR',
            ],
            ' / ',
          ),
          regimeEspecial: descrever(
            textoXml(regTrib, 'regEspTrib'),
            REGIME_ESPECIAL,
            false,
          ),
          imunidade: descrever(
            textoXml(tribMun, 'tpImunidade'),
            IMUNIDADE,
            false,
          ),
          suspensao: descrever(textoXml(exig, 'tpSusp'), SUSPENSAO, false),
          processo: textoXml(exig, 'nProcesso'),
          beneficio: juntar(
            [
              textoXml(bm, 'nBM'),
              descrever(textoXml(bm, 'tpBM'), TIPO_BM, false),
            ],
            ' - ',
          ),
          calculoBM: f.valor(textoXml(valNfse, 'vCalcBM')),
          deducoes: f.valor(
            textoXml(valNfse, 'vCalcDR') ||
              textoXml(filhoXml(valDps, 'vDedRed'), 'vDR'),
          ),
          descontoIncondicionado: f.valor(textoXml(descontos, 'vDescIncond')),
          base: f.valor(textoXml(valNfse, 'vBC')),
          aliquota: textoXml(valNfse, 'pAliqAplic')
            ? `${f.valor(textoXml(valNfse, 'pAliqAplic'))}%`
            : '',
          retencao: descrever(
            textoXml(tribMun, 'tpRetISSQN'),
            RET_ISSQN,
            false,
          ),
          valor: f.valor(textoXml(valNfse, 'vISSQN')),
        }
      : null,
    federal: {
      irrf: f.valor(textoXml(tribFed, 'vRetIRRF')),
      cp: f.valor(textoXml(tribFed, 'vRetCP')),
      contribuicoesRetidas: f.valor(retidas),
      pis: pisCofinsRetido ? '' : f.valor(vPis),
      cofins: pisCofinsRetido ? '' : f.valor(vCofins),
      descricaoRetidas: nomesRetidas.join(', '),
    },
    ibscbs,
    total: {
      servico: f.valor(textoXml(filhoXml(valDps, 'vServPrest'), 'vServ')),
      descontoIncondicionado: f.valor(textoXml(descontos, 'vDescIncond')),
      descontoCondicionado: f.valor(textoXml(descontos, 'vDescCond')),
      retencoes: f.valor(textoXml(valNfse, 'vTotalRet')),
      liquido: f.valor(vLiq),
      ibscbs: f.valor(totalIbsCbs),
      liquidoMaisIbscbs: f.valor(totalIbsCbs ? somar(vLiq, totalIbsCbs) : vLiq),
    },
    complementares: juntar(
      [
        textoXml(filhoXml(serv, 'infoCompl'), 'xInfComp'),
        textoXml(inf, 'xOutInf'),
        aproximados,
      ],
      '\n',
    ),
  };
}

/** Grupo IBSCBS da NFS-e (valores apurados) e da DPS (CST, classificação). */
function lerIbsCbs(
  nfse: ElementoXml | null,
  dps: ElementoXml | null,
): DadosNfse['ibscbs'] {
  if (!nfse) return null;
  const valores = filhoXml(nfse, 'valores');
  const uf = filhoXml(valores, 'uf');
  const mun = filhoXml(valores, 'mun');
  const fed = filhoXml(valores, 'fed');
  const tot = filhoXml(nfse, 'totCIBS');
  const gIbs = filhoXml(tot, 'gIBS');
  const gCbs = filhoXml(tot, 'gCBS');
  const pct = (b: string) => (b ? `${f.valor(b)}%` : '');
  const gTrib = primeiroXml(dps, 'gIBSCBS');
  return {
    cst: juntar([textoXml(gTrib, 'CST'), textoXml(gTrib, 'cClassTrib')], ' / '),
    incidencia: juntar(
      [textoXml(nfse, 'xLocalidadeIncid'), textoXml(nfse, 'cLocalidadeIncid')],
      ' / ',
    ),
    base: f.valor(textoXml(valores, 'vBC')),
    aliquotaIbsUf: pct(textoXml(uf, 'pIBSUF')),
    aliquotaIbsMun: pct(textoXml(mun, 'pIBSMun')),
    efetivaIbsUf: pct(textoXml(uf, 'pAliqEfetUF')),
    efetivaIbsMun: pct(textoXml(mun, 'pAliqEfetMun')),
    valorIbsUf: f.valor(textoXml(filhoXml(gIbs, 'gIBSUFTot'), 'vIBSUF')),
    valorIbsMun: f.valor(textoXml(filhoXml(gIbs, 'gIBSMunTot'), 'vIBSMun')),
    totalIbs: textoXml(gIbs, 'vIBSTot'),
    aliquotaCbs: pct(textoXml(fed, 'pCBS')),
    efetivaCbs: pct(textoXml(fed, 'pAliqEfetCBS')),
    totalCbs: textoXml(gCbs, 'vCBS'),
  };
}

function pessoaVazia(): PessoaNfse {
  return {
    documento: '',
    inscricaoMunicipal: '',
    telefone: '',
    nome: '',
    municipio: '',
    codigoCep: '',
    endereco: '',
    email: '',
  };
}

// ---------- ABRASF ----------

function cpfCnpj(e: ElementoXml | null): string {
  const c = primeiroXml(e, 'CpfCnpj');
  return documento(textoXml(c, 'Cnpj'), textoXml(c, 'Cpf'));
}

function pessoaAbrasf(
  p: ElementoXml | null,
  identificacao: string,
): PessoaNfse | null {
  if (!p) return null;
  const id = filhoXml(p, identificacao) ?? p;
  const end = filhoXml(p, 'Endereco');
  const exterior = filhoXml(p, 'EnderecoExterior');
  const contato = filhoXml(p, 'Contato');
  const cMun = textoXml(end, 'CodigoMunicipio');
  const pessoa: PessoaNfse = {
    documento: cpfCnpj(id) || textoXml(p, 'NifTomador'),
    inscricaoMunicipal: textoXml(id, 'InscricaoMunicipal'),
    telefone: f.fone(textoXml(contato, 'Telefone')),
    nome: textoXml(p, 'RazaoSocial'),
    municipio: exterior
      ? juntar([textoXml(exterior, 'CodigoPais')], ' / ')
      : municipio(cMun, new Map(), textoXml(end, 'Uf')),
    codigoCep: juntar([cMun, f.cep(textoXml(end, 'Cep'))], ' / '),
    endereco: exterior
      ? textoXml(exterior, 'EnderecoCompletoExterior')
      : juntar(
          [
            textoXml(end, 'Endereco'),
            textoXml(end, 'Numero'),
            textoXml(end, 'Complemento'),
            textoXml(end, 'Bairro'),
          ],
          ', ',
        ),
    email: textoXml(contato, 'Email'),
  };
  return Object.values(pessoa).some((v) => v !== '') ? pessoa : null;
}

function lerAbrasf(comp: ElementoXml): DadosNfse {
  const nfse = primeiroXml(comp, 'Nfse');
  const inf = primeiroXml(nfse, 'InfNfse');
  const valNfse = filhoXml(inf, 'ValoresNfse');
  // 2.0x: a declaração do prestador fica dentro da NFS-e; 1.0: direto no InfNfse.
  const decl = primeiroXml(inf, 'InfDeclaracaoPrestacaoServico') ?? inf;
  const rps = filhoXml(decl, 'Rps');
  const idRps = primeiroXml(rps ?? inf, 'IdentificacaoRps');
  const serv = filhoXml(decl, 'Servico');
  const val = filhoXml(serv, 'Valores');
  const prestServico = filhoXml(inf, 'PrestadorServico');
  const tomadorEl =
    filhoXml(decl, 'Tomador') ??
    filhoXml(decl, 'TomadorServico') ??
    filhoXml(inf, 'TomadorServico');
  const intermEl =
    filhoXml(decl, 'Intermediario') ??
    filhoXml(decl, 'IntermediarioServico') ??
    filhoXml(inf, 'IntermediarioServico');
  const orgao = filhoXml(inf, 'OrgaoGerador');
  const ibsNfse = filhoXml(inf, 'IBSCBS');

  const v = (tag: string) => textoXml(val, tag) || textoXml(valNfse, tag);
  const issRetido = textoXml(serv, 'IssRetido') || textoXml(decl, 'IssRetido');
  const exig = textoXml(serv, 'ExigibilidadeISS');
  const vPis = v('ValorPis');
  const vCofins = v('ValorCofins');
  const vCsll = v('ValorCsll');
  const retidasNomes = [
    ...(positivo(vPis) ? ['PIS'] : []),
    ...(positivo(vCofins) ? ['COFINS'] : []),
    ...(positivo(vCsll) ? ['CSLL'] : []),
    ...(positivo(v('OutrasRetencoes')) ? ['Outras retenções'] : []),
  ];
  const vIss = v('ValorIss');
  const retencoes = somar(
    v('ValorPis'),
    v('ValorCofins'),
    v('ValorInss'),
    v('ValorIr'),
    v('ValorCsll'),
    v('OutrasRetencoes'),
    issRetido === '1' ? vIss : '',
  );
  const ibscbs = lerIbsCbs(ibsNfse, null);
  const totalIbsCbs = ibscbs ? somar(ibscbs.totalIbs, ibscbs.totalCbs) : '';
  const vLiq = textoXml(valNfse, 'ValorLiquidoNfse') || v('ValorLiquidoNfse');
  const uf = textoXml(orgao, 'Uf');
  const cancelada = filhoXml(comp, 'NfseCancelamento') !== null;
  const substituida = filhoXml(comp, 'NfseSubstituicao') !== null;
  const prestador =
    pessoaAbrasf(prestServico, 'IdentificacaoPrestador') ?? pessoaVazia();
  const aliquota = v('Aliquota');

  return {
    origem: 'abrasf',
    versao: nfse?.getAttribute('versao')?.trim() ?? '',
    chave: textoXml(inf, 'ChaveAcesso'),
    numero: textoXml(inf, 'Numero'),
    competencia: f.data(
      textoXml(decl, 'Competencia') || textoXml(inf, 'Competencia'),
    ),
    dhNfse: textoXml(inf, 'DataEmissao'),
    numeroDps: textoXml(idRps, 'Numero'),
    serieDps: textoXml(idRps, 'Serie'),
    dhDps: textoXml(rps, 'DataEmissao') || textoXml(inf, 'DataEmissaoRps'),
    emitente: '',
    situacao: cancelada ? 'Cancelada' : substituida ? 'Substituída' : '',
    finalidade: '',
    codigoVerificacao: textoXml(inf, 'CodigoVerificacao'),
    municipioEmissor: textoXml(orgao, 'CodigoMunicipio')
      ? `Município: ${municipio(textoXml(orgao, 'CodigoMunicipio'), new Map(), uf)}`
      : '',
    ambienteGerador: 'Ambiente gerador: Prefeitura',
    tipoAmbiente: '',
    tpAmb: '',
    prestador: {
      ...prestador,
      simples: descrever(
        textoXml(decl, 'OptanteSimplesNacional'),
        { '1': 'Optante', '2': 'Não Optante' },
        false,
      ),
      regimeSN: '',
    },
    tomador: pessoaAbrasf(tomadorEl, 'IdentificacaoTomador'),
    destinatario: null,
    intermediario: pessoaAbrasf(intermEl, 'IdentificacaoIntermediario'),
    servico: {
      codigo: juntar(
        [
          textoXml(serv, 'ItemListaServico'),
          textoXml(serv, 'CodigoTributacaoMunicipio'),
        ],
        ' / ',
      ),
      nbs: codigoNbs(textoXml(serv, 'CodigoNbs')),
      local: juntar(
        [
          municipio(textoXml(serv, 'CodigoMunicipio'), new Map()),
          textoXml(serv, 'CodigoPais') ? textoXml(serv, 'CodigoPais') : '',
        ],
        ' / ',
      ),
      descricaoCodigo: textoXml(serv, 'CodigoCnae')
        ? `CNAE ${textoXml(serv, 'CodigoCnae')}`
        : '',
      descricao: textoXml(serv, 'Discriminacao'),
    },
    issqn:
      exig === '2'
        ? null
        : {
            tributacao: descrever(exig, EXIGIBILIDADE_ABRASF, false),
            incidencia: municipio(
              textoXml(serv, 'MunicipioIncidencia'),
              new Map(),
            ),
            regimeEspecial: descrever(
              textoXml(decl, 'RegimeEspecialTributacao'),
              REGIME_ESPECIAL_ABRASF,
              false,
            ),
            imunidade: '',
            suspensao:
              exig === '6' || exig === '7'
                ? descrever(exig, EXIGIBILIDADE_ABRASF, false)
                : '',
            processo: textoXml(serv, 'NumeroProcesso'),
            beneficio: descrever(
              textoXml(decl, 'IncentivoFiscal'),
              { '1': 'Incentivo fiscal: Sim', '2': 'Incentivo fiscal: Não' },
              false,
            ),
            calculoBM: '',
            deducoes: f.valor(v('ValorDeducoes')),
            descontoIncondicionado: f.valor(v('DescontoIncondicionado')),
            base: f.valor(v('BaseCalculo')),
            aliquota: aliquota ? `${f.valor(aliquota)}%` : '',
            retencao:
              issRetido === '1'
                ? 'Retido'
                : issRetido === '2'
                  ? 'Não Retido'
                  : '',
            valor: f.valor(vIss),
          },
    federal: {
      irrf: f.valor(v('ValorIr')),
      cp: f.valor(v('ValorInss')),
      contribuicoesRetidas: f.valor(
        somar(vPis, vCofins, vCsll, v('OutrasRetencoes')),
      ),
      pis: '',
      cofins: '',
      descricaoRetidas: retidasNomes.join(', '),
    },
    ibscbs,
    total: {
      servico: f.valor(v('ValorServicos')),
      descontoIncondicionado: f.valor(v('DescontoIncondicionado')),
      descontoCondicionado: f.valor(v('DescontoCondicionado')),
      retencoes: f.valor(retencoes),
      liquido: f.valor(vLiq),
      ibscbs: f.valor(totalIbsCbs),
      liquidoMaisIbscbs: f.valor(totalIbsCbs ? somar(vLiq, totalIbsCbs) : vLiq),
    },
    complementares: juntar(
      [
        textoXml(decl, 'InformacoesComplementares'),
        textoXml(inf, 'OutrasInformacoes'),
      ],
      '\n',
    ),
  };
}

/** Lê a NFS-e Nacional (raiz NFSe). */
export function lerNfseNacional(raiz: ElementoXml): DadosNfse {
  return lerNacional(raiz);
}

/** Lê uma NFS-e ABRASF (o elemento CompNfse, ou Nfse). */
export function lerNfseAbrasf(comp: ElementoXml): DadosNfse {
  return lerAbrasf(comp);
}

/** Todas as NFS-e ABRASF de um elemento (lista ou resposta de consulta). */
export function nfsesAbrasf(raiz: ElementoXml): ElementoXml[] {
  return raiz.localName === 'CompNfse' || raiz.localName === 'Nfse'
    ? [raiz]
    : todosXml(raiz, 'CompNfse');
}
