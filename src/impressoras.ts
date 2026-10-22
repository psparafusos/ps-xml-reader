// Impressoras de cupom (térmicas). É a única lista do app: para incluir outra
// marca ou modelo, acrescente aqui. Sem DOM e sem Electron, para poder ser
// testada fora do app.
//
// O nome da impressora é comparado sem acentos e sem diferenciar maiúsculas.
// Cada padrão é uma expressão regular sobre esse nome:
//   elgin       marca (ELGIN i9, ELGIN i8...)
//   termica     "Térmica" ou "Termica" em qualquer parte do nome
//   80mm, 58mm  largura do papel de cupom
//   pos         só como palavra inteira: não pode ter letra antes nem depois
//               ("POS-80", "POS58" e "Impressora POS" casam; "Positivo" e
//               "Compositor" não)
//   tm-t + dígitos  linha de cupom da Epson (TM-T20X-II, TM-T88V...)

export const PADROES_IMPRESSORA_CUPOM: readonly RegExp[] = [
  /elgin/,
  /termica/,
  /80mm/,
  /58mm/,
  /(?<![a-z])pos(?![a-z])/,
  /tm-t\d/,
];

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function ehImpressoraCupom(nome: string): boolean {
  const n = semAcento(nome);
  return PADROES_IMPRESSORA_CUPOM.some((p) => p.test(n));
}
