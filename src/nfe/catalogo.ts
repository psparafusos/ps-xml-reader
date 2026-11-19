// Catálogo dos campos simples do item da NF-e (grupo det, modelo 55, leiaute
// 4.00), para as colunas da Conferência. Lógica pura (sem Electron, sem DOM
// de verdade): o parser usa para guardar os campos do item, o processo
// principal para validar o perfil e o renderer para a tabela e o editor.
//
// Fontes (ver o relatório da frente 2026-11-19-colunas-fiscais):
//   - MOC 7.0, Anexo I (Leiaute e Regras de Validação da NF-e e da NFC-e),
//     grupos H (det), I (prod, com DI, adi, detExport, rastro), J (veicProd),
//     K (med), L (arma), LA (comb), M (imposto), N (ICMS), NA (ICMSUFDest),
//     O (IPI), P (II), Q e R (PIS e PIS ST), S e T (COFINS e COFINS ST),
//     U (ISSQN), UA (impostoDevol) e V (infAdProd), com as notas técnicas
//     que mexeram nesses grupos depois dele (FCP, ICMS efetivo, crédito
//     presumido gCred, ICMS monofásico dos combustíveis, obsItem e afins).
//   - NT 2025.002-RTC versão 1.53 (outubro de 2026), item 6: campos I05k e
//     I17c do grupo I (pág. 18), grupo UB (IS e IBSCBS, págs. 18 a 29),
//     VB (vItem) e VC (DFeReferenciado), pág. 29.
//
// Nada é calculado: a coluna mostra só o que está no XML, formatado.
//
// Caminho de um campo: as tags de det até ele, separadas por "/". O nível
// da variante (ICMS00, ICMSSN101, IPITrib, PISAliq, COFINSOutr...) sai do
// caminho: pICMS de qualquer CST é "imposto/ICMS/pICMS". Atributo: "@nome"
// no fim ("obsItem/obsCont/@xCampo").

import * as f from './formato';

export const GRUPOS = [
  'produto',
  'importacao',
  'especificos',
  'icms',
  'fcp',
  'icmsst',
  'ipi',
  'ii',
  'piscofins',
  'issqn',
  'ibscbsis',
  'informacoes',
  'anotacoes',
  'outros',
] as const;
export type IdGrupo = (typeof GRUPOS)[number];

export const ROTULO_GRUPO: Record<IdGrupo, string> = {
  produto: 'Produto',
  importacao: 'Importação e exportação',
  especificos: 'Rastro e produtos específicos',
  icms: 'ICMS',
  fcp: 'FCP',
  icmsst: 'ICMS ST',
  ipi: 'IPI',
  ii: 'II',
  piscofins: 'PIS e COFINS',
  issqn: 'ISSQN',
  ibscbsis: 'IBS, CBS e IS',
  informacoes: 'Informações do item',
  anotacoes: 'Anotações',
  outros: 'Outros campos do XML',
};

export type TipoCampo =
  | 'texto'
  | 'numero'
  | 'dinheiro'
  | 'porcentagem'
  | 'data';

export interface CampoCatalogo {
  /** Id da coluna: o das colunas antigas (icms, ipi...) ou "xml:" + caminho. */
  id: string;
  /** Caminhos no item; com mais de um, vale o primeiro que existir. */
  caminhos: string[];
  /** Nome amigável, no editor de colunas. */
  nome: string;
  /** Rótulo curto, no título da coluna. */
  rotulo: string;
  /** Nome técnico (a tag, ou as tags). */
  tecnico: string;
  /** Onde a tag fica, curto ("ICMS", "prod/DI"). */
  local: string;
  grupo: IdGrupo;
  tipo: TipoCampo;
  /** Significado curto dos códigos, mostrado ao lado do valor. */
  significados?: Readonly<Record<string, string>>;
}

/** Prefixo do id das colunas de campos do XML (no catálogo ou não). */
export const PREFIXO_XML = 'xml:';

// ---------- definição ----------

type T = 't' | 'n' | 'd' | 'p' | 'dt';
/** [tag, nome, tipo, rótulo curto, grupo (se diferente do da seção)] */
type Linha = [string, string, T?, string?, IdGrupo?];
interface Secao {
  /** Caminho do grupo da tag, a partir de det ('' = o próprio det). */
  em: string;
  grupo: IdGrupo;
  campos: Linha[];
}

const TIPO: Record<T, TipoCampo> = {
  t: 'texto',
  n: 'numero',
  d: 'dinheiro',
  p: 'porcentagem',
  dt: 'data',
};

const ORIGEM: Record<string, string> = {
  '0': 'Nacional',
  '1': 'Estrangeira, importação direta',
  '2': 'Estrangeira, mercado interno',
  '3': 'Nacional, mais de 40% importado',
  '4': 'Nacional, processo produtivo básico',
  '5': 'Nacional, até 40% importado',
  '6': 'Estrangeira direta, sem similar',
  '7': 'Estrangeira interna, sem similar',
  '8': 'Nacional, mais de 70% importado',
};

const MOD_BC: Record<string, string> = {
  '0': 'Margem de valor agregado',
  '1': 'Pauta',
  '2': 'Preço tabelado máximo',
  '3': 'Valor da operação',
};

const MOD_BC_ST: Record<string, string> = {
  '0': 'Preço tabelado ou máximo sugerido',
  '1': 'Lista negativa',
  '2': 'Lista positiva',
  '3': 'Lista neutra',
  '4': 'Margem de valor agregado',
  '5': 'Pauta',
  '6': 'Valor da operação',
};

const SIM_NAO: Record<string, string> = { '0': 'Não', '1': 'Sim' };

const SIGNIFICADOS: Record<string, Record<string, string>> = {
  'imposto/ICMS/orig': ORIGEM,
  'imposto/ICMS/modBC': MOD_BC,
  'imposto/ICMS/modBCST': MOD_BC_ST,
  'prod/indTot': SIM_NAO,
  'prod/indEscala': { S: 'Relevante', N: 'Não relevante' },
};

const ICMS = 'imposto/ICMS';
const IBSCBS = 'imposto/IBSCBS';
const G = `${IBSCBS}/gIBSCBS`;
const MONO = `${IBSCBS}/gIBSCBSMono`;

/** Campos de diferimento, devolução e redução de IBS UF, IBS Mun ou CBS. */
function camposDaParcela(em: string, de: string): Secao[] {
  return [
    {
      em: `${em}/gDif`,
      grupo: 'ibscbsis',
      campos: [
        ['pDif', `% de diferimento ${de}`, 'p'],
        ['vDif', `Valor do diferimento ${de}`, 'd'],
      ],
    },
    {
      em: `${em}/gDevTrib`,
      grupo: 'ibscbsis',
      campos: [
        ['pDevTrib', `% de devolução ${de}`, 'p'],
        ['vDevTrib', `Valor devolvido ${de}`, 'd'],
      ],
    },
    {
      em: `${em}/gRed`,
      grupo: 'ibscbsis',
      campos: [
        ['pRedAliq', `% de redução da alíquota ${de}`, 'p'],
        ['pAliqEfet', `Alíquota efetiva ${de}`, 'p'],
      ],
    },
  ];
}

/** Os quatro grupos da tributação monofásica do IBS ou da CBS. */
function camposMonofasicos(
  em: string,
  tributo: 'IBS' | 'CBS',
  adRem: boolean,
): Secao[] {
  const qual = adRem ? 'ad rem' : 'ad valorem';
  const de = `${tributo === 'IBS' ? 'do IBS' : 'da CBS'} monofásic${tributo === 'IBS' ? 'o' : 'a'} ${qual}`;
  const padrao: Linha[] = adRem
    ? [
        ['qBCMono', `Quantidade tributada ${de}`, 'n'],
        [`adRem${tributo}`, `Alíquota por unidade ${de}`, 'd'],
        [`v${tributo}Mono`, `Valor ${de}`, 'd'],
      ]
    : tributo === 'IBS'
      ? [
          ['vBCMono', `Base de cálculo ${de}`, 'd'],
          ['pAliqMonoUF', `Alíquota da UF ${de}`, 'p'],
          ['vIBSMonoUF', `Valor da UF ${de}`, 'd'],
          ['pAliqMonoMun', `Alíquota do município ${de}`, 'p'],
          ['vIBSMonoMun', `Valor do município ${de}`, 'd'],
          ['vIBSMono', `Valor ${de}`, 'd'],
        ]
      : [
          ['vBCMono', `Base de cálculo ${de}`, 'd'],
          ['pAliqMonoCBS', `Alíquota ${de}`, 'p'],
          ['vCBSMono', `Valor ${de}`, 'd'],
        ];
  const reten: Linha[] = adRem
    ? [
        ['qBCMonoReten', `Quantidade sujeita a retenção ${de}`, 'n'],
        [
          `adRem${tributo}Reten`,
          `Alíquota por unidade sujeita a retenção ${de}`,
          'd',
        ],
        [`v${tributo}MonoReten`, `Valor sujeito a retenção ${de}`, 'd'],
      ]
    : [
        ['vBCMonoReten', `Base sujeita a retenção ${de}`, 'd'],
        ['pAliqMonoReten', `Alíquota sujeita a retenção ${de}`, 'p'],
        [`v${tributo}MonoReten`, `Valor sujeito a retenção ${de}`, 'd'],
      ];
  return [
    { em: `${em}/gMonoPadrao`, grupo: 'ibscbsis', campos: padrao },
    { em: `${em}/gMonoReten`, grupo: 'ibscbsis', campos: reten },
    {
      em: `${em}/gMonoRet`,
      grupo: 'ibscbsis',
      campos: [[`v${tributo}MonoRet`, `Valor retido anteriormente ${de}`, 'd']],
    },
    {
      em: `${em}/gpBioDiferenca`,
      grupo: 'ibscbsis',
      campos: [
        ['qBCBioComb', `Quantidade de biocombustível ${de}`, 'n'],
        [
          `v${tributo}Diferenca`,
          `Valor da diferença do biocombustível ${de}`,
          'd',
        ],
      ],
    },
  ];
}

const SECOES: Secao[] = [
  // ---- prod (grupo I) ----
  {
    em: 'prod',
    grupo: 'produto',
    campos: [
      ['cProd', 'Código do produto', 't', 'Código'],
      ['cEAN', 'GTIN (código de barras)', 't', 'EAN'],
      ['cBarra', 'Código de barras próprio'],
      ['xProd', 'Descrição do produto', 't', 'Descrição'],
      ['NCM', 'NCM', 't', 'NCM'],
      ['NVE', 'Nomenclatura de valor aduaneiro (NVE)', 't', 'NVE'],
      ['CEST', 'CEST', 't', 'CEST'],
      ['indEscala', 'Escala relevante', 't', 'Escala'],
      ['CNPJFab', 'CNPJ do fabricante'],
      ['cBenef', 'Código de benefício fiscal', 't', 'cBenef'],
      ['EXTIPI', 'Exceção da TIPI', 't', 'EX TIPI'],
      ['CFOP', 'CFOP', 't', 'CFOP'],
      ['uCom', 'Unidade comercial', 't', 'Un'],
      ['qCom', 'Quantidade comercial', 'n', 'Qtd'],
      ['vUnCom', 'Valor unitário comercial', 'd', 'V. Unit'],
      ['vProd', 'Valor total do produto', 'd', 'V. Total'],
      ['cEANTrib', 'GTIN da unidade tributável'],
      ['cBarraTrib', 'Código de barras próprio da unidade tributável'],
      ['uTrib', 'Unidade tributável', 't', 'Un. trib.'],
      ['qTrib', 'Quantidade tributável', 'n', 'Qtd. trib.'],
      ['vUnTrib', 'Valor unitário tributável', 'd', 'V. Unit trib.'],
      ['vFrete', 'Frete', 'd', 'Frete'],
      ['vSeg', 'Seguro', 'd', 'Seguro'],
      ['vDesc', 'Desconto', 'd', 'Desconto'],
      ['vOutro', 'Outras despesas', 'd', 'Outras desp.'],
      ['indTot', 'Compõe o total da nota', 't', 'Compõe total'],
      ['xPed', 'Número do pedido de compra', 't', 'Pedido'],
      ['nItemPed', 'Item do pedido de compra', 't', 'Item ped.'],
      ['nFCI', 'Número de controle da FCI', 't', 'FCI'],
      ['tpCredPresIBSZFM', 'Classificação do crédito presumido do IBS na ZFM'],
      ['indBemMovelUsado', 'Fornecimento de bem móvel usado'],
    ],
  },
  {
    em: 'prod/gCred',
    grupo: 'produto',
    campos: [
      ['cCredPresumido', 'Código do crédito presumido'],
      ['pCredPresumido', '% do crédito presumido', 'p'],
      ['vCredPresumido', 'Valor do crédito presumido', 'd'],
    ],
  },
  // DI, adições e exportação
  {
    em: 'prod/DI',
    grupo: 'importacao',
    campos: [
      ['nDI', 'Número da DI ou DUIMP', 't', 'Nº DI'],
      ['dDI', 'Data de registro da DI', 'dt'],
      ['xLocDesemb', 'Local do desembaraço aduaneiro'],
      ['UFDesemb', 'UF do desembaraço aduaneiro'],
      ['dDesemb', 'Data do desembaraço aduaneiro', 'dt'],
      ['tpViaTransp', 'Via de transporte internacional'],
      ['vAFRMM', 'Valor do AFRMM', 'd'],
      ['tpIntermedio', 'Forma de importação quanto à intermediação'],
      ['CNPJ', 'CNPJ do adquirente ou encomendante'],
      ['CPF', 'CPF do adquirente ou encomendante'],
      ['UFTerceiro', 'UF do adquirente ou encomendante'],
      ['cExportador', 'Código do exportador'],
    ],
  },
  {
    em: 'prod/DI/adi',
    grupo: 'importacao',
    campos: [
      ['nAdicao', 'Número da adição'],
      ['nSeqAdic', 'Sequência do item na adição'],
      ['cFabricante', 'Código do fabricante estrangeiro'],
      ['vDescDI', 'Desconto do item na DI', 'd'],
      ['nDraw', 'Ato concessório de drawback (adição)'],
    ],
  },
  {
    em: 'prod/detExport',
    grupo: 'importacao',
    campos: [['nDraw', 'Ato concessório de drawback (exportação)']],
  },
  {
    em: 'prod/detExport/exportInd',
    grupo: 'importacao',
    campos: [
      ['nRE', 'Registro de exportação'],
      ['chNFe', 'Chave da NF-e recebida para exportação'],
      ['qExport', 'Quantidade exportada', 'n'],
    ],
  },
  // rastro e produtos específicos
  {
    em: 'prod/rastro',
    grupo: 'especificos',
    campos: [
      ['nLote', 'Número do lote', 't', 'Lote'],
      ['qLote', 'Quantidade do lote', 'n', 'Qtd. lote'],
      ['dFab', 'Data de fabricação', 'dt', 'Fabricação'],
      ['dVal', 'Data de validade', 'dt', 'Validade'],
      ['cAgreg', 'Código de agregação'],
    ],
  },
  {
    em: 'prod/infProdNFF',
    grupo: 'especificos',
    campos: [
      ['cProdFisco', 'Código fiscal do produto (NFF)'],
      ['cOperNFF', 'Código da operação (NFF)'],
    ],
  },
  {
    em: 'prod/infProdEmb',
    grupo: 'especificos',
    campos: [
      ['xEmb', 'Embalagem do produto'],
      ['qVolEmb', 'Volume do produto na embalagem', 'n'],
      ['uEmb', 'Unidade de medida da embalagem'],
    ],
  },
  {
    em: 'prod/veicProd',
    grupo: 'especificos',
    campos: [
      ['tpOp', 'Veículo: tipo da operação'],
      ['chassi', 'Veículo: chassi'],
      ['cCor', 'Veículo: código da cor'],
      ['xCor', 'Veículo: cor'],
      ['pot', 'Veículo: potência do motor'],
      ['cilin', 'Veículo: cilindradas'],
      ['pesoL', 'Veículo: peso líquido'],
      ['pesoB', 'Veículo: peso bruto'],
      ['nSerie', 'Veículo: número de série'],
      ['tpComb', 'Veículo: tipo de combustível'],
      ['nMotor', 'Veículo: número do motor'],
      ['CMT', 'Veículo: capacidade máxima de tração'],
      ['dist', 'Veículo: distância entre eixos'],
      ['anoMod', 'Veículo: ano do modelo'],
      ['anoFab', 'Veículo: ano de fabricação'],
      ['tpPint', 'Veículo: tipo de pintura'],
      ['tpVeic', 'Veículo: tipo'],
      ['espVeic', 'Veículo: espécie'],
      ['VIN', 'Veículo: VIN (chassi remarcado)'],
      ['condVeic', 'Veículo: condição'],
      ['cMod', 'Veículo: código do modelo'],
      ['cCorDENATRAN', 'Veículo: cor DENATRAN'],
      ['lota', 'Veículo: lotação'],
      ['tpRest', 'Veículo: restrição'],
    ],
  },
  {
    em: 'prod/med',
    grupo: 'especificos',
    campos: [
      ['cProdANVISA', 'Medicamento: código ANVISA'],
      ['xMotivoIsencao', 'Medicamento: motivo da isenção da ANVISA'],
      ['vPMC', 'Medicamento: preço máximo ao consumidor', 'd'],
    ],
  },
  {
    em: 'prod/arma',
    grupo: 'especificos',
    campos: [
      ['tpArma', 'Arma: tipo'],
      ['nSerie', 'Arma: número de série'],
      ['nCano', 'Arma: número de série do cano'],
      ['descr', 'Arma: descrição'],
    ],
  },
  {
    em: 'prod/comb',
    grupo: 'especificos',
    campos: [
      ['cProdANP', 'Combustível: código ANP'],
      ['descANP', 'Combustível: descrição ANP'],
      ['pGLP', 'Combustível: % de GLP', 'p'],
      ['pGNn', 'Combustível: % de gás natural nacional', 'p'],
      ['pGNi', 'Combustível: % de gás natural importado', 'p'],
      ['vPart', 'Combustível: valor de partida', 'd'],
      ['CODIF', 'Combustível: CODIF'],
      ['qTemp', 'Combustível: quantidade à temperatura ambiente', 'n'],
      ['UFCons', 'Combustível: UF de consumo'],
      ['pBio', 'Combustível: % de biocombustível', 'p'],
    ],
  },
  {
    em: 'prod/comb/CIDE',
    grupo: 'especificos',
    campos: [
      ['qBCProd', 'CIDE: quantidade da base de cálculo', 'n'],
      ['vAliqProd', 'CIDE: alíquota em reais', 'd'],
      ['vCIDE', 'CIDE: valor', 'd'],
    ],
  },
  {
    em: 'prod/comb/encerrante',
    grupo: 'especificos',
    campos: [
      ['nBico', 'Encerrante: bico'],
      ['nBomba', 'Encerrante: bomba'],
      ['nTanque', 'Encerrante: tanque'],
      ['vEncIni', 'Encerrante: valor inicial', 'n'],
      ['vEncFin', 'Encerrante: valor final', 'n'],
    ],
  },
  {
    em: 'prod/comb/origComb',
    grupo: 'especificos',
    campos: [
      ['indImport', 'Origem do combustível: importado'],
      ['cUFOrig', 'Origem do combustível: UF'],
      ['pOrig', 'Origem do combustível: % originário da UF', 'p'],
    ],
  },
  {
    em: 'prod',
    grupo: 'especificos',
    campos: [['nRECOPI', 'Número do RECOPI']],
  },

  // ---- ICMS (grupo N, todas as variantes e CSOSN, ICMSPart e ICMSST) ----
  {
    em: ICMS,
    grupo: 'icms',
    campos: [
      ['orig', 'Origem da mercadoria', 't', 'Origem'],
      ['CST', 'CST do ICMS', 't', 'CST'],
      ['CSOSN', 'CSOSN (Simples Nacional)', 't', 'CSOSN'],
      ['modBC', 'Modalidade da base de cálculo do ICMS', 't', 'Mod. BC'],
      ['vBC', 'Base de cálculo do ICMS', 'd', 'BC ICMS'],
      ['pRedBC', '% de redução da base de cálculo do ICMS', 'p', '% Red. BC'],
      ['cBenefRBC', 'Benefício fiscal da redução da base'],
      ['pICMS', 'Alíquota do ICMS', 'p', 'Alíq. ICMS'],
      ['vICMSOp', 'Valor do ICMS da operação', 'd'],
      ['pDif', '% do diferimento do ICMS', 'p'],
      ['vICMSDif', 'Valor do ICMS diferido', 'd'],
      ['vICMS', 'Valor do ICMS', 'd', 'ICMS'],
      ['vICMSDeson', 'Valor do ICMS desonerado', 'd', 'ICMS deson.'],
      ['motDesICMS', 'Motivo da desoneração do ICMS'],
      ['indDeduzDeson', 'ICMS desonerado deduzido do valor do item'],
      ['pBCOp', '% da base da operação própria (partilha)', 'p'],
      ['pCredSN', 'Alíquota de crédito do Simples Nacional', 'p'],
      ['vCredICMSSN', 'Crédito de ICMS do Simples Nacional', 'd'],
      ['pRedBCEfet', '% de redução da base efetiva', 'p'],
      ['vBCEfet', 'Base de cálculo efetiva', 'd'],
      ['pICMSEfet', 'Alíquota do ICMS efetiva', 'p'],
      ['vICMSEfet', 'Valor do ICMS efetivo', 'd'],
      // ICMS monofásico dos combustíveis (CST 02, 15, 53 e 61)
      ['qBCMono', 'ICMS monofásico: quantidade tributada', 'n'],
      ['adRemICMS', 'ICMS monofásico: alíquota por unidade', 'd'],
      ['vICMSMono', 'ICMS monofásico: valor próprio', 'd'],
      ['qBCMonoReten', 'ICMS monofásico: quantidade com retenção', 'n'],
      ['adRemICMSReten', 'ICMS monofásico: alíquota com retenção', 'd'],
      ['vICMSMonoReten', 'ICMS monofásico: valor com retenção', 'd'],
      ['pRedAdRem', 'ICMS monofásico: % de redução da alíquota', 'p'],
      ['motRedAdRem', 'ICMS monofásico: motivo da redução'],
      ['vICMSMonoOp', 'ICMS monofásico: valor da operação', 'd'],
      ['vICMSMonoDif', 'ICMS monofásico: valor diferido', 'd'],
      ['qBCMonoRet', 'ICMS monofásico: quantidade retida anteriormente', 'n'],
      ['adRemICMSRet', 'ICMS monofásico: alíquota retida anteriormente', 'd'],
      ['vICMSMonoRet', 'ICMS monofásico: valor retido anteriormente', 'd'],
      // FCP
      ['vBCFCP', 'Base de cálculo do FCP', 'd', 'BC FCP', 'fcp'],
      ['pFCP', '% do FCP', 'p', '% FCP', 'fcp'],
      ['vFCP', 'Valor do FCP', 'd', 'FCP', 'fcp'],
      ['pFCPDif', '% do diferimento do FCP', 'p', undefined, 'fcp'],
      ['vFCPDif', 'Valor do FCP diferido', 'd', undefined, 'fcp'],
      ['vFCPEfet', 'Valor efetivo do FCP', 'd', undefined, 'fcp'],
      ['vBCFCPST', 'Base de cálculo do FCP ST', 'd', 'BC FCP ST', 'fcp'],
      ['pFCPST', '% do FCP ST', 'p', '% FCP ST', 'fcp'],
      ['vFCPST', 'Valor do FCP ST', 'd', 'FCP ST', 'fcp'],
      [
        'vBCFCPSTRet',
        'Base do FCP ST retido anteriormente',
        'd',
        undefined,
        'fcp',
      ],
      ['pFCPSTRet', '% do FCP ST retido anteriormente', 'p', undefined, 'fcp'],
      [
        'vFCPSTRet',
        'Valor do FCP ST retido anteriormente',
        'd',
        undefined,
        'fcp',
      ],
      // ICMS ST
      [
        'modBCST',
        'Modalidade da base de cálculo do ICMS ST',
        't',
        'Mod. BC ST',
        'icmsst',
      ],
      ['pMVAST', '% MVA do ICMS ST', 'p', '% MVA', 'icmsst'],
      [
        'pRedBCST',
        '% de redução da base do ICMS ST',
        'p',
        '% Red. BC ST',
        'icmsst',
      ],
      ['vBCST', 'Base de cálculo do ICMS ST', 'd', 'BC ST', 'icmsst'],
      ['pICMSST', 'Alíquota do ICMS ST', 'p', 'Alíq. ST', 'icmsst'],
      ['vICMSST', 'Valor do ICMS ST', 'd', 'ICMS ST', 'icmsst'],
      ['vICMSSTDeson', 'Valor do ICMS ST desonerado', 'd', undefined, 'icmsst'],
      [
        'motDesICMSST',
        'Motivo da desoneração do ICMS ST',
        't',
        undefined,
        'icmsst',
      ],
      [
        'vBCSTRet',
        'Base do ICMS ST retido anteriormente',
        'd',
        'BC ST ret.',
        'icmsst',
      ],
      [
        'pST',
        'Alíquota suportada pelo consumidor final',
        'p',
        undefined,
        'icmsst',
      ],
      [
        'vICMSSubstituto',
        'ICMS próprio do substituto',
        'd',
        undefined,
        'icmsst',
      ],
      [
        'vICMSSTRet',
        'Valor do ICMS ST retido anteriormente',
        'd',
        'ICMS ST ret.',
        'icmsst',
      ],
      [
        'vBCSTDest',
        'Base do ICMS ST da UF de destino',
        'd',
        undefined,
        'icmsst',
      ],
      [
        'vICMSSTDest',
        'Valor do ICMS ST da UF de destino',
        'd',
        undefined,
        'icmsst',
      ],
      ['UFST', 'UF do ICMS ST devido (partilha)', 't', undefined, 'icmsst'],
    ],
  },
  // ICMS para a UF de destino (grupo NA)
  {
    em: 'imposto/ICMSUFDest',
    grupo: 'icms',
    campos: [
      ['vBCUFDest', 'Base de cálculo do ICMS na UF de destino', 'd'],
      ['pICMSUFDest', 'Alíquota interna da UF de destino', 'p'],
      ['pICMSInter', 'Alíquota interestadual', 'p', 'Alíq. inter.'],
      ['pICMSInterPart', '% de partilha para a UF de destino', 'p'],
      ['vICMSUFDest', 'ICMS para a UF de destino (DIFAL)', 'd', 'DIFAL'],
      ['vICMSUFRemet', 'ICMS para a UF do remetente', 'd'],
      ['vBCFCPUFDest', 'Base do FCP na UF de destino', 'd', undefined, 'fcp'],
      ['pFCPUFDest', '% do FCP na UF de destino', 'p', undefined, 'fcp'],
      ['vFCPUFDest', 'Valor do FCP na UF de destino', 'd', undefined, 'fcp'],
    ],
  },
  // ---- IPI (grupo O) ----
  {
    em: 'imposto/IPI',
    grupo: 'ipi',
    campos: [
      ['CNPJProd', 'CNPJ do produtor (IPI)'],
      ['cSelo', 'Código do selo de controle do IPI'],
      ['qSelo', 'Quantidade de selos do IPI', 'n'],
      ['cEnq', 'Código de enquadramento do IPI', 't', 'Enq. IPI'],
      ['CST', 'CST do IPI', 't', 'CST IPI'],
      ['vBC', 'Base de cálculo do IPI', 'd', 'BC IPI'],
      ['pIPI', 'Alíquota do IPI', 'p', 'Alíq. IPI'],
      ['qUnid', 'Quantidade na unidade padrão do IPI', 'n'],
      ['vUnid', 'Valor por unidade do IPI', 'd'],
      ['vIPI', 'Valor do IPI', 'd', 'IPI'],
    ],
  },
  // ---- II (grupo P) ----
  {
    em: 'imposto/II',
    grupo: 'ii',
    campos: [
      ['vBC', 'Base de cálculo do II', 'd', 'BC II'],
      ['vDespAdu', 'Despesas aduaneiras', 'd'],
      ['vII', 'Valor do II', 'd', 'II'],
      ['vIOF', 'Valor do IOF', 'd', 'IOF'],
    ],
  },
  // ---- PIS, PIS ST, COFINS e COFINS ST (grupos Q, R, S e T) ----
  {
    em: 'imposto/PIS',
    grupo: 'piscofins',
    campos: [
      ['CST', 'CST do PIS', 't', 'CST PIS'],
      ['vBC', 'Base de cálculo do PIS', 'd', 'BC PIS'],
      ['pPIS', 'Alíquota do PIS', 'p', 'Alíq. PIS'],
      ['qBCProd', 'Quantidade da base do PIS', 'n'],
      ['vAliqProd', 'Alíquota do PIS em reais', 'd'],
      ['vPIS', 'Valor do PIS', 'd', 'PIS'],
    ],
  },
  {
    em: 'imposto/PISST',
    grupo: 'piscofins',
    campos: [
      ['vBC', 'Base de cálculo do PIS ST', 'd'],
      ['pPIS', 'Alíquota do PIS ST', 'p'],
      ['qBCProd', 'Quantidade da base do PIS ST', 'n'],
      ['vAliqProd', 'Alíquota do PIS ST em reais', 'd'],
      ['vPIS', 'Valor do PIS ST', 'd', 'PIS ST'],
      ['indSomaPISST', 'PIS ST compõe o total da nota'],
    ],
  },
  {
    em: 'imposto/COFINS',
    grupo: 'piscofins',
    campos: [
      ['CST', 'CST da COFINS', 't', 'CST COFINS'],
      ['vBC', 'Base de cálculo da COFINS', 'd', 'BC COFINS'],
      ['pCOFINS', 'Alíquota da COFINS', 'p', 'Alíq. COFINS'],
      ['qBCProd', 'Quantidade da base da COFINS', 'n'],
      ['vAliqProd', 'Alíquota da COFINS em reais', 'd'],
      ['vCOFINS', 'Valor da COFINS', 'd', 'COFINS'],
    ],
  },
  {
    em: 'imposto/COFINSST',
    grupo: 'piscofins',
    campos: [
      ['vBC', 'Base de cálculo da COFINS ST', 'd'],
      ['pCOFINS', 'Alíquota da COFINS ST', 'p'],
      ['qBCProd', 'Quantidade da base da COFINS ST', 'n'],
      ['vAliqProd', 'Alíquota da COFINS ST em reais', 'd'],
      ['vCOFINS', 'Valor da COFINS ST', 'd', 'COFINS ST'],
      ['indSomaCOFINSST', 'COFINS ST compõe o total da nota'],
    ],
  },
  // ---- ISSQN (grupo U) ----
  {
    em: 'imposto/ISSQN',
    grupo: 'issqn',
    campos: [
      ['vBC', 'Base de cálculo do ISSQN', 'd'],
      ['vAliq', 'Alíquota do ISSQN', 'p', 'Alíq. ISS'],
      ['vISSQN', 'Valor do ISSQN', 'd', 'ISSQN'],
      ['cMunFG', 'Município do fato gerador do ISSQN'],
      ['cListServ', 'Item da lista de serviços'],
      ['vDeducao', 'Dedução da base do ISSQN', 'd'],
      ['vOutro', 'Outras retenções do ISSQN', 'd'],
      ['vDescIncond', 'Desconto incondicionado (ISSQN)', 'd'],
      ['vDescCond', 'Desconto condicionado (ISSQN)', 'd'],
      ['vISSRet', 'ISSQN retido', 'd'],
      ['indISS', 'Exigibilidade do ISS'],
      ['cServico', 'Código do serviço no município'],
      ['cMun', 'Município de incidência do ISSQN'],
      ['cPais', 'País de incidência do ISSQN'],
      ['nProcesso', 'Processo de suspensão do ISSQN'],
      ['indIncentivo', 'Incentivo fiscal do ISSQN'],
    ],
  },
  // ---- IS e IBS/CBS (NT 2025.002-RTC, grupo UB) ----
  {
    em: 'imposto/IS',
    grupo: 'ibscbsis',
    campos: [
      ['CSTIS', 'CST do Imposto Seletivo', 't', 'CST IS'],
      ['cClassTribIS', 'Classificação tributária do Imposto Seletivo'],
      ['vBCIS', 'Base de cálculo do Imposto Seletivo', 'd'],
      ['pIS', 'Alíquota do Imposto Seletivo', 'p', 'Alíq. IS'],
      ['adRemIS', 'Alíquota por unidade do Imposto Seletivo', 'd'],
      ['uTrib', 'Unidade tributável do Imposto Seletivo'],
      ['qTrib', 'Quantidade tributável do Imposto Seletivo', 'n'],
      ['vIS', 'Valor do Imposto Seletivo', 'd', 'IS'],
    ],
  },
  {
    em: IBSCBS,
    grupo: 'ibscbsis',
    campos: [
      ['CST', 'CST do IBS e da CBS', 't', 'CST IBS/CBS'],
      ['cClassTrib', 'Classificação tributária do IBS e da CBS', 't'],
      ['indDoacao', 'Operação de doação (IBS e CBS)'],
    ],
  },
  {
    em: G,
    grupo: 'ibscbsis',
    campos: [
      ['vBC', 'Base de cálculo do IBS e da CBS', 'd', 'BC IBS/CBS'],
      ['vIBS', 'Valor do IBS', 'd', 'IBS'],
    ],
  },
  {
    em: `${G}/gIBSUF`,
    grupo: 'ibscbsis',
    campos: [
      ['pIBSUF', 'Alíquota do IBS da UF', 'p', 'Alíq. IBS UF'],
      ['vIBSUF', 'Valor do IBS da UF', 'd', 'IBS UF'],
    ],
  },
  ...camposDaParcela(`${G}/gIBSUF`, 'do IBS da UF'),
  {
    em: `${G}/gIBSMun`,
    grupo: 'ibscbsis',
    campos: [
      ['pIBSMun', 'Alíquota do IBS do município', 'p', 'Alíq. IBS Mun'],
      ['vIBSMun', 'Valor do IBS do município', 'd', 'IBS Mun'],
    ],
  },
  ...camposDaParcela(`${G}/gIBSMun`, 'do IBS do município'),
  {
    em: `${G}/gCBS`,
    grupo: 'ibscbsis',
    campos: [
      ['pCBS', 'Alíquota da CBS', 'p', 'Alíq. CBS'],
      ['vCBS', 'Valor da CBS', 'd', 'CBS'],
    ],
  },
  ...camposDaParcela(`${G}/gCBS`, 'da CBS'),
  {
    em: `${G}/gCBS/gALCZFMCBS`,
    grupo: 'ibscbsis',
    campos: [
      ['tpALCZFMCBS', 'Alíquota zero da CBS em área incentivada: tipo'],
      ['nProcSuframa', 'Processo na Suframa (CBS)'],
      ['pAliqEfetRegCBS', 'Alíquota da CBS sem a redução (ZFM/ALC)', 'p'],
      ['vTribRegCBS', 'Valor da CBS sem a redução (ZFM/ALC)', 'd'],
    ],
  },
  {
    em: `${G}/gTribRegular`,
    grupo: 'ibscbsis',
    campos: [
      ['CSTReg', 'Tributação regular: CST'],
      ['cClassTribReg', 'Tributação regular: classificação tributária'],
      ['pAliqEfetRegIBSUF', 'Tributação regular: alíquota do IBS UF', 'p'],
      ['vTribRegIBSUF', 'Tributação regular: valor do IBS UF', 'd'],
      ['pAliqEfetRegIBSMun', 'Tributação regular: alíquota do IBS Mun', 'p'],
      ['vTribRegIBSMun', 'Tributação regular: valor do IBS Mun', 'd'],
      ['pAliqEfetRegCBS', 'Tributação regular: alíquota da CBS', 'p'],
      ['vTribRegCBS', 'Tributação regular: valor da CBS', 'd'],
    ],
  },
  {
    em: `${G}/gTribCompraGov`,
    grupo: 'ibscbsis',
    campos: [
      ['pAliqIBSUF', 'Compra governamental: alíquota do IBS UF', 'p'],
      ['vTribIBSUF', 'Compra governamental: valor do IBS UF', 'd'],
      ['pAliqIBSMun', 'Compra governamental: alíquota do IBS Mun', 'p'],
      ['vTribIBSMun', 'Compra governamental: valor do IBS Mun', 'd'],
      ['pAliqCBS', 'Compra governamental: alíquota da CBS', 'p'],
      ['vTribCBS', 'Compra governamental: valor da CBS', 'd'],
    ],
  },
  {
    em: MONO,
    grupo: 'ibscbsis',
    campos: [
      ['vTotIBSMonoItem', 'Total do IBS monofásico do item', 'd'],
      ['vTotCBSMonoItem', 'Total da CBS monofásica do item', 'd'],
    ],
  },
  ...camposMonofasicos(`${MONO}/gIBSMonoAdRem`, 'IBS', true),
  ...camposMonofasicos(`${MONO}/gIBSMonoAdValorem`, 'IBS', false),
  ...camposMonofasicos(`${MONO}/gCBSMonoAdRem`, 'CBS', true),
  ...camposMonofasicos(`${MONO}/gCBSMonoAdValorem`, 'CBS', false),
  {
    em: `${IBSCBS}/gTransfCred`,
    grupo: 'ibscbsis',
    campos: [
      ['vIBS', 'Transferência de crédito: IBS', 'd'],
      ['vCBS', 'Transferência de crédito: CBS', 'd'],
    ],
  },
  {
    em: `${IBSCBS}/gAjusteCompet`,
    grupo: 'ibscbsis',
    campos: [
      ['competApur', 'Ajuste de competência: período de apuração'],
      ['vIBS', 'Ajuste de competência: IBS', 'd'],
      ['vCBS', 'Ajuste de competência: CBS', 'd'],
    ],
  },
  {
    em: `${IBSCBS}/gEstornoCred`,
    grupo: 'ibscbsis',
    campos: [
      ['vIBSEstCred', 'Estorno de crédito: IBS', 'd'],
      ['vCBSEstCred', 'Estorno de crédito: CBS', 'd'],
    ],
  },
  {
    em: `${IBSCBS}/gCredPresOper`,
    grupo: 'ibscbsis',
    campos: [
      ['vBCCredPres', 'Crédito presumido: base de cálculo', 'd'],
      ['cCredPres', 'Crédito presumido: código'],
    ],
  },
  {
    em: `${IBSCBS}/gCredPresOper/gIBSCredPres`,
    grupo: 'ibscbsis',
    campos: [
      ['pCredPres', 'Crédito presumido do IBS: %', 'p'],
      ['vCredPres', 'Crédito presumido do IBS: valor', 'd'],
      ['vCredPresCondSus', 'Crédito presumido do IBS suspenso', 'd'],
    ],
  },
  {
    em: `${IBSCBS}/gCredPresOper/gCBSCredPres`,
    grupo: 'ibscbsis',
    campos: [
      ['pCredPres', 'Crédito presumido da CBS: %', 'p'],
      ['vCredPres', 'Crédito presumido da CBS: valor', 'd'],
      ['vCredPresCondSus', 'Crédito presumido da CBS suspenso', 'd'],
    ],
  },
  {
    em: `${IBSCBS}/gCredPresIBSZFM`,
    grupo: 'ibscbsis',
    campos: [
      ['competApur', 'Crédito presumido do IBS na ZFM: período'],
      ['tpCredPresIBSZFM', 'Crédito presumido do IBS na ZFM: tipo'],
      ['vCredPresIBSZFM', 'Crédito presumido do IBS na ZFM: valor', 'd'],
    ],
  },
  // ---- informações do item (M01, UA, V, VA, VB e VC) ----
  {
    em: 'imposto',
    grupo: 'informacoes',
    campos: [['vTotTrib', 'Valor aproximado dos tributos', 'd', 'Tributos']],
  },
  {
    em: 'impostoDevol',
    grupo: 'informacoes',
    campos: [['pDevol', 'Devolução: % da mercadoria devolvida', 'p']],
  },
  {
    em: 'impostoDevol/IPI',
    grupo: 'informacoes',
    campos: [['vIPIDevol', 'Devolução: valor do IPI devolvido', 'd']],
  },
  {
    em: '',
    grupo: 'informacoes',
    campos: [
      ['infAdProd', 'Informação adicional do item', 't', 'Inf. adicional'],
      ['vItem', 'Valor total do item (reforma tributária)', 'd', 'V. Item'],
    ],
  },
  {
    em: 'DFeReferenciado',
    grupo: 'informacoes',
    campos: [
      ['chaveAcesso', 'Chave do documento referenciado no item'],
      ['nItem', 'Item do documento referenciado'],
    ],
  },
  {
    em: 'obsItem/obsCont',
    grupo: 'informacoes',
    campos: [
      ['@xCampo', 'Observação do contribuinte (campo)'],
      ['xTexto', 'Observação do contribuinte (texto)'],
    ],
  },
  {
    em: 'obsItem/obsFisco',
    grupo: 'informacoes',
    campos: [
      ['@xCampo', 'Observação do fisco (campo)'],
      ['xTexto', 'Observação do fisco (texto)'],
    ],
  },
];

/**
 * Colunas que já existiam antes do catálogo: o campo do XML que cada uma
 * mostra. Elas continuam com o id antigo (perfis gravados) e com a célula de
 * sempre (nfe/colunas.ts).
 */
export const ID_ANTIGO_POR_CAMINHO: Readonly<Record<string, string>> = {
  'prod/cProd': 'codigo',
  'prod/xProd': 'descricao',
  'prod/NCM': 'ncm',
  'prod/CFOP': 'cfop',
  'prod/uCom': 'un',
  'prod/qCom': 'qtd',
  'prod/vUnCom': 'vUnit',
  'prod/vProd': 'vTotal',
  'imposto/IPI/vIPI': 'ipi',
  'imposto/ICMS/vICMS': 'icms',
  'prod/cEAN': 'ean',
  'prod/xPed': 'pedido',
  'imposto/IBSCBS/gIBSCBS/vIBS': 'ibs',
  'imposto/IBSCBS/gIBSCBS/gCBS/vCBS': 'cbs',
};

/** Onde a tag fica, curto: o caminho do grupo sem "imposto/". */
function localDe(em: string): string {
  if (em === '') return 'det';
  return em.replace(/^imposto\//, '');
}

function montarCatalogo(): CampoCatalogo[] {
  const campos: CampoCatalogo[] = [];
  // Primeiro a coluna "CST ou CSOSN", a de uso mais comum do ICMS.
  campos.push({
    id: `${PREFIXO_XML}${ICMS}/CST+CSOSN`,
    caminhos: [`${ICMS}/CST`, `${ICMS}/CSOSN`],
    nome: 'CST ou CSOSN do ICMS',
    rotulo: 'CST/CSOSN',
    tecnico: 'CST / CSOSN',
    local: 'ICMS',
    grupo: 'icms',
    tipo: 'texto',
  });
  for (const s of SECOES) {
    for (const [tag, nome, t = 't', rotulo, grupo] of s.campos) {
      const caminho = s.em ? `${s.em}/${tag}` : tag;
      const significados = SIGNIFICADOS[caminho];
      campos.push({
        id: ID_ANTIGO_POR_CAMINHO[caminho] ?? `${PREFIXO_XML}${caminho}`,
        caminhos: [caminho],
        nome,
        rotulo: rotulo ?? nome,
        tecnico: tag,
        local: localDe(s.em),
        grupo: grupo ?? s.grupo,
        tipo: TIPO[t],
        ...(significados ? { significados } : {}),
      });
    }
  }
  return campos;
}

/** Todos os campos do catálogo, na ordem do leiaute dentro de cada grupo. */
export const CATALOGO: readonly CampoCatalogo[] = montarCatalogo();

const PORID = new Map(CATALOGO.map((c) => [c.id, c]));
const CAMINHOS = new Set(CATALOGO.flatMap((c) => c.caminhos));

/** O campo do catálogo com este id, ou undefined. */
export function campoDoCatalogo(id: string): CampoCatalogo | undefined {
  return PORID.get(id);
}

/** true se o caminho é de um campo do catálogo. */
export function caminhoNoCatalogo(caminho: string): boolean {
  return CAMINHOS.has(caminho);
}

// ---------- leitura dos campos do item ----------

/** Variante de grupo que sai do caminho (ICMS00 em ICMS, IPITrib em IPI...). */
const COM_VARIANTE = new Set(['ICMS', 'IPI', 'PIS', 'COFINS']);

/** Os campos de um item, por caminho; um valor por ocorrência. */
export type CamposItem = Record<string, string[]>;

interface ElementoXml {
  readonly localName: string;
  readonly children: ArrayLike<ElementoXml> | Iterable<ElementoXml>;
  readonly textContent: string | null;
  getAttribute(nome: string): string | null;
  getAttributeNames(): string[];
}

/**
 * Todos os campos simples de um det: cada tag sem filhos e cada atributo
 * (menos o nItem do próprio det e as declarações xmlns), pelo caminho
 * normalizado. Valor vazio não entra.
 */
export function lerCamposItem(det: ElementoXml): CamposItem {
  const campos: CamposItem = {};
  const guardar = (caminho: string, valor: string | null) => {
    const v = valor?.trim() ?? '';
    if (!v) return;
    (campos[caminho] ??= []).push(v);
  };
  const visitar = (el: ElementoXml, caminho: string, pai: string) => {
    const tag = el.localName;
    const variante =
      COM_VARIANTE.has(pai) && tag !== pai && tag.startsWith(pai);
    const aqui = variante ? caminho : caminho ? `${caminho}/${tag}` : tag;
    for (const a of el.getAttributeNames())
      if (a !== 'xmlns' && !a.startsWith('xmlns:'))
        guardar(`${aqui}/@${a.replace(/^.*:/, '')}`, el.getAttribute(a));
    const filhos = Array.from(el.children as ArrayLike<ElementoXml>);
    if (filhos.length === 0) {
      if (!variante) guardar(aqui, el.textContent);
      return;
    }
    // Na variante, o "pai" dos filhos continua o grupo (ICMS), para o
    // ICMSST dentro de ICMS não virar outra variante.
    for (const c of filhos) visitar(c, aqui, variante ? pai : tag);
  };
  for (const c of Array.from(det.children as ArrayLike<ElementoXml>))
    visitar(c, '', '');
  return campos;
}

// ---------- campos fora do catálogo ----------

export interface CampoFora {
  /** "xml:" + caminho. */
  id: string;
  caminho: string;
  /** "qTrib (prod)": a tag (ou o atributo) e onde fica. */
  rotulo: string;
}

/** Rótulo de um campo pelo caminho: "nomeDoCachorro (prod)". */
export function rotuloDoCaminho(caminho: string): string {
  const partes = caminho.split('/');
  const tag = partes.pop() ?? caminho;
  return partes.length ? `${tag} (${localDe(partes.join('/'))})` : tag;
}

/**
 * Campos dos itens que não estão no catálogo, na ordem em que aparecem.
 * Vão para o grupo "Outros campos do XML" do editor.
 */
export function camposForaDoCatalogo(
  itens: readonly { campos?: CamposItem }[],
): CampoFora[] {
  const vistos = new Set<string>();
  const fora: CampoFora[] = [];
  for (const i of itens)
    for (const caminho of Object.keys(i.campos ?? {})) {
      if (vistos.has(caminho) || CAMINHOS.has(caminho)) continue;
      vistos.add(caminho);
      fora.push({
        id: `${PREFIXO_XML}${caminho}`,
        caminho,
        rotulo: rotuloDoCaminho(caminho),
      });
    }
  return fora;
}

/**
 * Caminhos presentes em pelo menos um item. null quando os itens não
 * trazem os campos (itens de exemplo, montados à mão).
 */
export function caminhosPresentes(
  itens: readonly { campos?: CamposItem }[],
): Set<string> | null {
  if (itens.length === 0 || itens.some((i) => !i.campos)) return null;
  const s = new Set<string>();
  for (const i of itens) for (const k of Object.keys(i.campos ?? {})) s.add(k);
  return s;
}

// ---------- formatação ----------

const fmtPorcentagem = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const fmtNumero = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 10,
});

const NUMERO_XML = /^-?\d+(\.\d+)?$/;
const DATA_XML = /^\d{4}-\d{2}-\d{2}/;

/** Um valor do XML no formato do tipo. Valor que não confere: como veio. */
export function formatarValor(
  bruto: string,
  tipo: TipoCampo | 'auto',
  significados?: Readonly<Record<string, string>>,
): string {
  switch (tipo) {
    case 'dinheiro':
      return f.valorUnitario(bruto) || bruto;
    case 'porcentagem':
      return NUMERO_XML.test(bruto)
        ? `${fmtPorcentagem.format(Number(bruto))}%`
        : bruto;
    case 'numero':
      return NUMERO_XML.test(bruto) ? fmtNumero.format(Number(bruto)) : bruto;
    case 'data':
      return f.dataHora(bruto) || bruto;
    case 'auto':
      // Campo fora do catálogo: data e número decimal no formato brasileiro;
      // número inteiro fica como veio (pode ser código com zero à esquerda).
      if (DATA_XML.test(bruto)) return f.dataHora(bruto) || bruto;
      if (/^-?\d+\.\d+$/.test(bruto)) return bruto.replace('.', ',');
      return bruto;
    default: {
      const s = significados?.[bruto];
      return s ? `${bruto} - ${s}` : bruto;
    }
  }
}

/** Valores do campo no item (do primeiro caminho que existir). */
export function valoresDoCampo(
  campos: CamposItem | undefined,
  caminhos: readonly string[],
): string[] {
  for (const c of caminhos) {
    const v = campos?.[c];
    if (v?.length) return v;
  }
  return [];
}

/** Separador entre as ocorrências de um campo que se repete (DI, rastro...). */
export const SEPARADOR_OCORRENCIAS = '; ';

// ---------- busca no editor ----------

/** Minúsculas, sem acento. */
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Siglas comuns, achadas pelo nome por extenso (e o contrário). */
const SIGLAS: [string, string][] = [
  ['base de calculo', 'bc'],
  ['aliquota', 'aliq'],
  ['margem de valor agregado', 'mva'],
  ['mva', 'margem de valor agregado'],
  ['icms st', 'substituicao tributaria'],
  ['cst', 'situacao tributaria'],
  ['fcp', 'fundo de combate a pobreza'],
  ['reducao', 'red'],
  ['quantidade', 'qtd'],
  ['unidade', 'un'],
  ['difal', 'diferencial de aliquota'],
];

/** Texto em que a busca procura: nome, rótulo, tag, lugar, grupo e siglas. */
export function textoDeBusca(c: {
  nome: string;
  rotulo: string;
  tecnico: string;
  local: string;
  grupo: IdGrupo;
}): string {
  const base = normalizarBusca(
    `${c.nome} ${c.rotulo} ${c.tecnico} ${c.local} ${ROTULO_GRUPO[c.grupo]}`,
  );
  const extras = SIGLAS.filter(([longo]) => base.includes(longo)).map(
    ([, curto]) => curto,
  );
  return `${base} ${extras.join(' ')}`;
}

/**
 * true se o campo combina com a busca: cada palavra digitada começa uma
 * palavra do texto (nome, rótulo, siglas) ou, com 3 letras ou mais, aparece
 * dentro do nome técnico ("icmsst" acha pICMSST).
 */
export function combinaBusca(
  texto: string,
  tecnico: string,
  busca: string,
): boolean {
  const termos = normalizarBusca(busca)
    .split(/[^a-z0-9%]+/)
    .filter(Boolean);
  if (termos.length === 0) return true;
  const palavras = texto.split(/[^a-z0-9%]+/).filter(Boolean);
  const tec = normalizarBusca(tecnico);
  return termos.every(
    (t) =>
      palavras.some((p) => p.startsWith(t)) ||
      (t.length >= 3 && tec.includes(t)),
  );
}
