// TIPI (Tabela de Incidência do IPI), a partir do texto extraído do PDF
// oficial. Lógica pura: recebe o texto e devolve um registro por NCM de 8
// dígitos com a descrição, a hierarquia (posição, subposições, item) e a
// alíquota de IPI, mais um relatório das linhas que ficaram de fora.
//
// Como o texto vem do PDF:
//   32.08 Tintas e vernizes, ...              posição (pode quebrar linha)
//   3208.10 - À base de poliésteres           subposição de 1º nível
//   2936.22 -- Vitamina B1 e seus derivados   subposição de 2º nível
//   3208.20.1 Tintas                          item (7 dígitos)
//   3208.10.20 Vernizes 3,25                  NCM e alíquota no fim da linha
//   Ex 01 - Miudezas ... NT                   exceção tarifária (ignorada)
// A descrição de um NCM pode continuar nas linhas seguintes, com a alíquota
// só na última, e atravessar a quebra de página ("NCM DESCRIÇÃO ALÍQUOTA").
// As notas de cada capítulo (e as Notas Complementares, que têm tabelas com
// códigos) ficam entre "Capítulo N" e a primeira posição desse capítulo.

export type AliquotaIpi = number | 'NT';

export interface NivelTipi {
  /** Código como está na TIPI ("32.08", "3208.10", "3208.20.1"). */
  codigo: string;
  descricao: string;
}

export interface NcmTipi {
  /** 8 dígitos, sem pontos. */
  ncm: string;
  /** Código formatado como na TIPI ("3208.10.20"). */
  codigo: string;
  /** Descrição do próprio código. */
  descricao: string;
  /** Posição, subposições e item acima do NCM, do mais geral ao mais específico. */
  hierarquia: NivelTipi[];
  /** Hierarquia e descrição juntas, para dar contexto ("Tintas e vernizes... > À base de poliésteres > Vernizes"). */
  descricaoCompleta: string;
  /** Percentual (3,25 = 3.25) ou "NT" (não tributado); null quando não foi achada. */
  aliquotaIpi: AliquotaIpi | null;
  /** Linha do texto onde o código aparece (base 1). */
  linhaTexto: number;
}

export interface LinhaIgnorada {
  linha: number;
  texto: string;
}

export interface GrupoIgnorado {
  motivo: string;
  total: number;
  exemplos: LinhaIgnorada[];
}

export interface RelatorioTipi {
  totalNcm: number;
  totalLinhas: number;
  /** NCMs sem alíquota no fim da descrição. */
  semAliquota: string[];
  ignoradas: GrupoIgnorado[];
}

export interface TabelaTipi {
  porNcm: Map<string, NcmTipi>;
  relatorio: RelatorioTipi;
}

const EXEMPLOS_POR_GRUPO = 8;

const RE_POSICAO = /^(\d{2}\.\d{2})(?:\s+(.*))?$/;
/** O PDF às vezes cola o traço no código: "6006.90.00- Outros0". */
const RE_CODIGO = /^(\d{4}\.\d{1,2}(?:\.\d{1,2})?)(?:\s+(.*)|(-.*))?$/;
/** Alíquota no fim da descrição; o PDF às vezes cola no texto ("Estampados0"). */
const RE_ALIQUOTA = /(?:^|\s|(?<=[a-zà-ÿ]))(NT|\d+(?:,\d+)?)$/;
const RE_SECAO = /^(SEÇÃO|Seção)\s+[IVXL]+(\s+[A-ZÀ-Ý]{2,}|\s*$)/;
const RE_SUBCAPITULO = /^[IVXL]+\.-\s/;
const RE_SO_MAIUSCULAS = /^[A-ZÀ-Ý][A-ZÀ-Ý\s,;()-]*$/;
const RE_CAPITULO = /^Cap[íi]tulo\s+(\d{1,2})\s*$/;
/** Títulos de bloco de notas (a linha inteira); "Nota 4 do presente Capítulo." é descrição. */
const RE_INICIO_NOTAS =
  /^(Notas?(\s+de\s+(Seção|subposiç(ão|ões))|\s+Complementar(es)?(\s*\(NC\)\s*da\s+TIPI)?)?\.?\s*$|SEÇÃO\s+[IVXL]+\s*$|NC\s*\(\d)/;
const RE_MAIUSCULA = /^[A-ZÀ-Ý"“(]/;
/**
 * Linha que termina pedindo complemento: o código da linha seguinte é
 * citação. "posições" fica de fora ("noutras posições" fecha descrição), e
 * só minúscula conta ("1.600 A" é ampère).
 */
const RE_PEDE_CONTINUACAO =
  /(?:,|(?<!\p{L})(?:ou|e|a|de|do|da|dos|das|no|na|nos|nas|em|item|itens|código|códigos|subposição|subposições))$/u;
const RE_CABECALHO_PAGINA = /^(NCM DESCRIÇÃO ALÍQUOTA|\(%\)$|_{5,}$)/;

interface Registro {
  codigo: string;
  /** Só os dígitos do código (4 a 8). */
  digitos: string;
  linhas: string[];
  linhaTexto: number;
}

export function lerTipi(texto: string): TabelaTipi {
  const linhas = texto.split(/\r?\n/);
  const porNcm = new Map<string, NcmTipi>();
  const niveis = new Map<string, NivelTipi>();
  const ignoradas = new Map<string, GrupoIgnorado>();
  const semAliquota: string[] = [];
  const ignorar = (motivo: string, linha: number, t: string): void => {
    const g = ignoradas.get(motivo) ?? { motivo, total: 0, exemplos: [] };
    ignoradas.set(motivo, g);
    g.total++;
    if (g.exemplos.length < EXEMPLOS_POR_GRUPO) g.exemplos.push({ linha, texto: t });
  };

  // Antes do Capítulo 1 só há capa, sumário e regras gerais.
  let emNotas = true;
  let capitulo = '';
  let emEx = false;
  let atual: Registro | null = null;
  let ultimo = '';
  let aposCabecalho = false;

  const fechar = (): void => {
    if (!atual) return;
    const r = atual;
    atual = null;
    let desc = r.linhas.join(' ').replace(/\s+/g, ' ').trim();
    let aliquota: AliquotaIpi | null = null;
    if (r.digitos.length === 8) {
      const m = RE_ALIQUOTA.exec(desc);
      if (m) {
        aliquota = m[1] === 'NT' ? 'NT' : Number(m[1].replace(',', '.'));
        desc = desc.slice(0, m.index).trim();
      }
    }
    desc = desc.replace(/^-+\s*/, '');
    if (r.digitos.length < 8) {
      niveis.set(r.digitos, { codigo: r.codigo, descricao: desc });
      return;
    }
    const hierarquia: NivelTipi[] = [];
    for (let n = 4; n < 8; n++) {
      const nivel = niveis.get(r.digitos.slice(0, n));
      if (nivel) hierarquia.push(nivel);
    }
    if (aliquota === null) semAliquota.push(r.codigo);
    porNcm.set(r.digitos, {
      ncm: r.digitos,
      codigo: r.codigo,
      descricao: desc,
      hierarquia,
      descricaoCompleta: [...hierarquia.map((h) => h.descricao), desc].filter(Boolean).join(' > '),
      aliquotaIpi: aliquota,
      linhaTexto: r.linhaTexto,
    });
  };

  const ultimaLinha = (): string => (atual ? atual.linhas[atual.linhas.length - 1] : '');

  for (let i = 0; i < linhas.length; i++) {
    const n = i + 1;
    const t = linhas[i].trim();
    if (!t) continue;

    // "Capítulo 15" também aparece como fim de descrição ("...Nota de
    // subposições 2 do presente\nCapítulo 15", com 15 de alíquota). Capítulo
    // de verdade é sempre maior que o atual.
    const cap = RE_CAPITULO.exec(t);
    if (cap && Number(cap[1]) > Number(capitulo || 0) && !/presente$/i.test(ultimaLinha())) {
      fechar();
      emNotas = true;
      emEx = false;
      capitulo = cap[1].padStart(2, '0');
      ignorar('título e notas de capítulo ou seção', n, t);
      continue;
    }
    if (RE_CABECALHO_PAGINA.test(t)) {
      // Quebra de página: não fecha o registro, a descrição pode continuar.
      ignorar('cabeçalho ou rodapé de página', n, t);
      aposCabecalho = true;
      continue;
    }
    const inicioDePagina = aposCabecalho;
    // Título de subcapítulo no alto da página ("I.- ELEMENTOS QUÍMICOS", às
    // vezes em duas linhas) ainda conta como início da página.
    aposCabecalho = inicioDePagina && (RE_SUBCAPITULO.test(t) || RE_SO_MAIUSCULAS.test(t));

    const cod = lerCodigo(t);
    if (emNotas) {
      // Sai das notas na primeira entrada do capítulo atual ("32.01 Extratos",
      // "1101.00 Farinhas", "0501.00.00 Cabelo"), que sempre abre página
      // nova. As tabelas das Notas Complementares também têm códigos.
      if (inicioDePagina && cod?.abreCapitulo && cod.digitos.startsWith(capitulo)) {
        emNotas = false;
      } else {
        ignorar('título e notas de capítulo ou seção', n, t);
        continue;
      }
    }

    if (/^Ex\s+\d+/.test(t)) {
      fechar();
      emEx = true;
      ignorar('exceção tarifária (Ex) e sua continuação', n, t);
      continue;
    }
    const continua = RE_PEDE_CONTINUACAO.test(ultimaLinha());
    if (RE_INICIO_NOTAS.test(t) || (RE_SECAO.test(t) && !continua)) {
      fechar();
      emNotas = true;
      ignorar('título e notas de capítulo ou seção', n, t);
      continue;
    }
    if (RE_SUBCAPITULO.test(t)) {
      fechar();
      ignorar('título de subcapítulo', n, t);
      continue;
    }

    if (cod) {
      // A TIPI é crescente. Código fora de ordem é citação dentro de uma
      // descrição que quebrou a linha ("exceto os do item\n9503.00.40\n6,5");
      // em ordem, também é citação se a linha anterior pede continuação
      // ("cartuchos dos itens 9306.21.10, 9306.21.20 ou\n9306.21.30 55").
      if (cod.entrada && !continua && ordem(cod.digitos) >= ordem(ultimo)) {
        fechar();
        emEx = false;
        if (porNcm.has(cod.digitos) || niveis.has(cod.digitos)) {
          ignorar('código repetido', n, t);
          continue;
        }
        atual = { codigo: cod.codigo, digitos: cod.digitos, linhas: [cod.resto], linhaTexto: n };
        ultimo = cod.digitos;
        continue;
      }
      if (atual) {
        atual.linhas.push(t);
      } else if (emEx) {
        ignorar('exceção tarifária (Ex) e sua continuação', n, t);
      } else {
        ignorar('código fora de ordem fora de uma descrição', n, t);
      }
      continue;
    }

    if (atual) {
      atual.linhas.push(t);
    } else if (emEx) {
      ignorar('exceção tarifária (Ex) e sua continuação', n, t);
    } else {
      ignorar('texto solto fora de um código', n, t);
    }
  }
  fechar();

  return {
    porNcm,
    relatorio: {
      totalNcm: porNcm.size,
      totalLinhas: linhas.length,
      semAliquota,
      ignoradas: [...ignoradas.values()],
    },
  };
}

interface LinhaCodigo {
  codigo: string;
  digitos: string;
  resto: string;
  /**
   * Pode ser entrada da tabela. Posição exige descrição com maiúscula:
   * "82.15 classificam-se..." é nota ou descrição quebrada. Os demais
   * códigos podem começar com minúscula ("2902.90.40 alfa-Metilestireno").
   */
  entrada: boolean;
  /** Descrição começa com maiúscula ou traço: serve para sair das notas. */
  abreCapitulo: boolean;
}

function lerCodigo(t: string): LinhaCodigo | null {
  const pos = RE_POSICAO.exec(t);
  if (pos) {
    const resto = pos[2] ?? '';
    const maiuscula = RE_MAIUSCULA.test(resto);
    return { codigo: pos[1], digitos: pos[1].replace('.', ''), resto, entrada: maiuscula, abreCapitulo: maiuscula };
  }
  const cod = RE_CODIGO.exec(t);
  if (!cod) return null;
  const resto = (cod[2] ?? cod[3] ?? '').trim();
  return {
    codigo: cod[1],
    digitos: cod[1].replace(/\./g, ''),
    resto,
    // "6907.30 e 6907.40:" é citação que quebrou a linha.
    entrada: !/^(e|ou|a)\s/.test(resto),
    abreCapitulo: /^-/.test(resto) || RE_MAIUSCULA.test(resto),
  };
}

/** Chave para comparar códigos de tamanhos diferentes: "3208" < "320810" < "32081010". */
function ordem(digitos: string): string {
  return digitos.padEnd(8, '0') + String(digitos.length);
}

export interface ConsultaTipi {
  ncm: string;
  existe: boolean;
  descricao: string | null;
  descricaoCompleta: string | null;
  aliquotaIpi: AliquotaIpi | null;
}

/** Diz se o NCM existe na TIPI, com a descrição oficial e a alíquota de IPI. Aceita pontos. */
export function consultarTipi(tabela: TabelaTipi, ncm: string): ConsultaTipi {
  const digitos = ncm.replace(/\D/g, '');
  const r = tabela.porNcm.get(digitos);
  return {
    ncm: digitos,
    existe: r !== undefined,
    descricao: r?.descricao ?? null,
    descricaoCompleta: r?.descricaoCompleta ?? null,
    aliquotaIpi: r?.aliquotaIpi ?? null,
  };
}
