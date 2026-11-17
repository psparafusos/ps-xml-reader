// CNPJ da loja: conferência do número digitado (14 dígitos, com ou sem
// máscara, com os dois dígitos verificadores), leitura do CNPJ do
// destinatário no texto de uma NF-e ou .psxml e a sugestão a partir das
// notas recentes. Lógica pura, sem DOM e sem Electron.

const soDigitos = (s: string) => s.replace(/\D/g, '');

/** Dígito verificador do CNPJ para os `base` dígitos com os pesos dados. */
function digito(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, ...PESOS_1];

/**
 * true se `digitos` (só dígitos) é um CNPJ válido: 14 dígitos, não todos
 * iguais, com os dois dígitos verificadores certos.
 */
export function cnpjValido(digitos: string): boolean {
  if (!/^\d{14}$/.test(digitos) || /^(\d)\1{13}$/.test(digitos)) return false;
  const d1 = digito(digitos, PESOS_1);
  const d2 = digito(digitos.slice(0, 12) + String(d1), PESOS_2);
  return digitos.endsWith(`${d1}${d2}`);
}

/**
 * Problema com o CNPJ digitado, ou null se pode gravar. Aceita com ou sem
 * máscara (pontos, barra e hífen).
 */
export function problemaCnpj(texto: string): string | null {
  const t = texto.trim();
  if (!t) return 'Digite o CNPJ da loja.';
  if (/[^\d./\s-]/.test(t))
    return 'Use só números, pontos, barra e hífen no CNPJ.';
  const d = soDigitos(t);
  if (d.length !== 14) return 'O CNPJ precisa ter 14 dígitos.';
  if (!cnpjValido(d)) return 'CNPJ inválido: confira os dígitos.';
  return null;
}

/** CNPJ válido para a configuração, só dígitos; senão null. */
export function cnpjDaConfig(v: unknown): string | null {
  if (typeof v !== 'string' || problemaCnpj(v)) return null;
  return soDigitos(v);
}

/** "11222333000181" -> "11.222.333/0001-81" (outro tamanho fica como está). */
export const mascaraCnpj = (d: string) =>
  d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : d;

/**
 * CNPJ do destinatário no texto de uma NF-e ou .psxml, sem montar o DOM; null
 * se não tem (destinatário com CPF, ou sem o grupo dest).
 */
export function cnpjDestinatarioDoTexto(texto: string): string | null {
  const m =
    /<(?:[\w.-]+:)?dest\b[^>]*>\s*<(?:[\w.-]+:)?CNPJ>\s*(\d{14})\s*<\/(?:[\w.-]+:)?CNPJ>/.exec(
      texto,
    );
  return m && cnpjValido(m[1]) ? m[1] : null;
}

/**
 * O CNPJ que mais aparece na lista (as notas recentes, da mais recente para
 * a mais antiga); no empate, o que aparece primeiro. null com a lista vazia.
 */
export function cnpjMaisFrequente(lista: (string | null)[]): string | null {
  const contagem = new Map<string, number>();
  for (const c of lista) if (c) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  let melhor: string | null = null;
  for (const [c, n] of contagem)
    if (melhor === null || n > contagem.get(melhor)!) melhor = c;
  return melhor;
}
