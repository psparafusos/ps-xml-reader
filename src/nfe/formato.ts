// Formatação pt-BR. Toda função recebe o texto bruto do XML e devolve string
// vazia quando a entrada é vazia ou inválida. Nunca devolve texto padrão.

const fmtMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtValor = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// vUnCom pode ter até 10 casas no XML. Mostra no mínimo 2 e mantém as casas
// significativas, para não arredondar um preço unitário real.
const fmtValorUnitario = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 10,
});

const fmtQuantidade = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

function numero(bruto: string): number | null {
  if (bruto === '') return null;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : null;
}

/** "1234.5" -> "R$ 1.234,50" */
export function moeda(bruto: string): string {
  const n = numero(bruto);
  return n === null ? '' : fmtMoeda.format(n);
}

/** "1234.5" -> "1.234,50" (sem símbolo, para colunas de tabela) */
export function valor(bruto: string): string {
  const n = numero(bruto);
  return n === null ? '' : fmtValor.format(n);
}

/** "77.1833000000" -> "77,1833"; "25.6200000000" -> "25,62" */
export function valorUnitario(bruto: string): string {
  const n = numero(bruto);
  return n === null ? '' : fmtValorUnitario.format(n);
}

/** "20.0000" -> "20"; "1.2500" -> "1,25" */
export function quantidade(bruto: string): string {
  const n = numero(bruto);
  return n === null ? '' : fmtQuantidade.format(n);
}

/**
 * "2026-02-03T15:02:28-03:00" -> "03/02/2026 15:02".
 * Usa a hora escrita no XML, sem converter fuso.
 */
export function dataHora(bruto: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(bruto);
  if (!m) return data(bruto);
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

/** "2026-03-05" -> "05/03/2026" */
export function data(bruto: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(bruto);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Data e hora locais atuais, dd/mm/aaaa hh:mm. */
export function agora(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function digitos(bruto: string): string {
  return bruto.replace(/\D/g, '');
}

/** "12345678000195" -> "12.345.678/0001-95". Se não tiver 14 dígitos, devolve como veio. */
export function cnpj(bruto: string): string {
  const d = digitos(bruto);
  if (d.length !== 14) return bruto;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** "12345678901" -> "123.456.789-01". Se não tiver 11 dígitos, devolve como veio. */
export function cpf(bruto: string): string {
  const d = digitos(bruto);
  if (d.length !== 11) return bruto;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** "88000000" -> "88000-000" */
export function cep(bruto: string): string {
  const d = digitos(bruto);
  if (d.length !== 8) return bruto;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** "4733334444" -> "(47) 3333-4444"; "47999998888" -> "(47) 99999-8888" */
export function fone(bruto: string): string {
  const d = digitos(bruto);
  if (d.length === 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11)
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return bruto;
}

/** Chave de acesso em grupos de 4 dígitos. */
export function chaveAcesso(bruto: string): string {
  const d = digitos(bruto);
  return d.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Remove caracteres inválidos em nome de arquivo do Windows. */
export function nomeArquivoSeguro(bruto: string): string {
  return (
    bruto
      // oxlint-disable-next-line no-control-regex -- caracteres de controle são proibidos em nome de arquivo
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '')
  );
}
