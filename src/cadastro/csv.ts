// Conversão do modelo de planilha (docs/modelo-cadastro/*.csv, uma por
// seção, separador ";") para o JSON do formato "Cadastro do sistema de
// gestão" (docs/formato-cadastro.md). Para quem não tem como exportar JSON
// direto do sistema: exporta (ou monta) as planilhas e converte com
// scripts/cadastro-csv-para-json.mjs.
//
// A conversão só ajusta a escrita de cada célula (vazio vira null, "S" vira
// true, "12,5" vira 12.5, "14/11/2026" vira "2026-11-14", CNPJ com máscara
// fica só com os dígitos). Quem confere é o validador (formato.ts): o
// resultado daqui passa por ele como qualquer outro arquivo.
//
// Lógica pura, sem import em tempo de execução, como formato.ts.

/** As planilhas, na ordem do documento; as duas últimas são opcionais. */
export const PLANILHAS_CADASTRO = [
  'meta',
  'fornecedores',
  'produtos',
  'vinculos',
  'fatores',
  'notas_lancadas',
] as const;

export type PlanilhaCadastro = (typeof PLANILHAS_CADASTRO)[number];

/** Separa o CSV (";", aspas com "" dentro) em linhas de células. */
export function lerCsv(texto: string): string[][] {
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ';') {
      linha.push(campo);
      campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += ch;
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  // Linhas em branco (comuns no fim do arquivo) não são registros.
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

const CAMPOS_BOOLEANOS = new Set(['ativo']);
const CAMPOS_NUMERICOS = new Set(['versao', 'custo', 'preco', 'fator']);
const CAMPOS_DOCUMENTO = new Set(['cnpj_cpf', 'fornecedor']);
const CAMPOS_DATA = new Set(['reaproveitado_em', 'ultima_entrada', 'entrada']);

const SIM = new Set(['s', 'sim', 'true', 'verdadeiro', '1', 'x']);
const NAO = new Set(['n', 'nao', 'não', 'false', 'falso', '0']);

/** "12,5" e "1.234,56" (vírgula decimal) ou "12.5": número; senão o texto. */
function numero(v: string): number | string {
  const t = v.trim();
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return v;
  return Number(normal);
}

/** "14/11/2026" ou "14/11/2026 12:30[:00]": AAAA-MM-DD[THH:MM[:SS]]; senão o texto. */
function data(v: string): string {
  const t = v.trim();
  const m =
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (!m) return t;
  const dia = `${m[3]}-${m[2]}-${m[1]}`;
  if (!m[4]) return dia;
  return `${dia}T${m[4]}:${m[5]}${m[6] ? `:${m[6]}` : ''}`;
}

/** Valor de uma célula já na escrita do JSON. Vazio: null. */
export function converterCelula(campo: string, valor: string): unknown {
  if (valor.trim() === '') return null;
  if (CAMPOS_BOOLEANOS.has(campo)) {
    const t = valor.trim().toLowerCase();
    if (SIM.has(t)) return true;
    if (NAO.has(t)) return false;
    return valor;
  }
  if (CAMPOS_NUMERICOS.has(campo)) return numero(valor);
  if (CAMPOS_DOCUMENTO.has(campo)) {
    const t = valor.trim();
    // Máscara (12.345.678/0001-95) sai; o resto (letras, notação científica
    // de planilha) fica para o validador recusar com a mensagem certa.
    return /^[\d./\-\s]+$/.test(t) ? t.replace(/\D/g, '') : t;
  }
  if (campo === 'chave') return valor.replace(/\s/g, '');
  if (CAMPOS_DATA.has(campo) || campo === 'extraido_em') return data(valor);
  // Códigos e textos: como vieram (o código do fornecedor guarda os espaços
  // e os zeros à esquerda).
  return valor;
}

export interface ResultadoConversao {
  /** O objeto no formato do arquivo JSON, para o validador. */
  dados: Record<string, unknown>;
  /** Problemas da própria planilha (cabeçalho, número de colunas). */
  problemas: string[];
}

/**
 * Monta o objeto do formato a partir do texto de cada planilha. Planilha
 * ausente (undefined): a seção não entra (o validador diz se fazia falta).
 */
export function converterPlanilhas(
  planilhas: Partial<Record<PlanilhaCadastro, string>>,
): ResultadoConversao {
  const dados: Record<string, unknown> = {};
  const problemas: string[] = [];
  for (const nome of PLANILHAS_CADASTRO) {
    const texto = planilhas[nome];
    if (texto === undefined) continue;
    const [cabecalho, ...linhas] = lerCsv(texto);
    if (!cabecalho) {
      problemas.push(`${nome}.csv está vazio (falta o cabeçalho).`);
      continue;
    }
    const campos = cabecalho.map((c) => c.trim());
    const registros = linhas.map((l, i) => {
      if (
        l.length > campos.length &&
        l.slice(campos.length).some((c) => c.trim() !== '')
      )
        problemas.push(
          `${nome}.csv, linha ${i + 2}: ${l.length} colunas, o cabeçalho tem ${campos.length} (sobrou conteúdo; confira o separador ";" e as aspas).`,
        );
      const r: Record<string, unknown> = {};
      campos.forEach((c, j) => {
        if (c === '') return;
        const v = converterCelula(c, l[j] ?? '');
        if (v !== null) r[c] = v;
      });
      return r;
    });
    if (nome === 'meta') {
      if (registros.length !== 1)
        problemas.push(
          `meta.csv deve ter uma linha de valores abaixo do cabeçalho (tem ${registros.length}).`,
        );
      dados.meta = registros[0] ?? {};
    } else dados[nome] = registros;
  }
  return { dados, problemas };
}
