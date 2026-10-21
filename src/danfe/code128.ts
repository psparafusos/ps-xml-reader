// Código de barras CODE-128, subconjunto C, da chave de acesso (MOC, DANFE e
// Código de Barras, item 1). Sem biblioteca: a tabela de padrões segue a
// especificação CODE-128 (ISO/IEC 15417), não a tabela do manual, que tem
// erros de digitação (por exemplo os valores 89 a 99).
//
// Cada padrão lista as larguras, em módulos, de barra, espaço, barra, espaço,
// barra, espaço (o STOP tem uma barra a mais). Este arquivo não usa DOM, para
// poder ser testado fora do app; o SVG é montado em danfe.ts.

/** Padrões dos valores 0 a 106. 0 a 99 são os pares de dígitos no subconjunto C. */
export const PADROES: readonly string[] = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

export const START_C = 105;
export const STOP = 106;
/** Zona de silêncio mínima de cada lado, em módulos (manual: 10 módulos). */
export const ZONA_SILENCIO = 10;

/** Dígito verificador: (START + soma de valor x posição, desde 1) módulo 103. */
export function digitoVerificador(valores: readonly number[]): number {
  let soma = START_C;
  valores.forEach((v, i) => {
    soma += v * (i + 1);
  });
  return soma % 103;
}

/**
 * Valores dos símbolos: START C, um por par de dígitos, DV e STOP.
 * Lança erro se a entrada não for um número par de dígitos.
 */
export function valoresCode128C(digitos: string): number[] {
  if (!/^(\d\d)+$/.test(digitos)) {
    throw new Error('CODE-128C exige um número par de dígitos.');
  }
  const pares: number[] = [];
  for (let i = 0; i < digitos.length; i += 2) {
    pares.push(Number(digitos.slice(i, i + 2)));
  }
  return [START_C, ...pares, digitoVerificador(pares), STOP];
}

/** Larguras alternadas (barra, espaço, barra...) de todos os símbolos, em módulos. */
export function modulosCode128C(digitos: string): number[] {
  return valoresCode128C(digitos).flatMap((v) =>
    [...PADROES[v]].map((c) => Number(c)),
  );
}

export interface Barras {
  /** Largura total em módulos, com as duas zonas de silêncio. */
  total: number;
  /** Barras pretas: início e largura em módulos, contados da borda esquerda. */
  barras: { x: number; largura: number }[];
}

/** Posição de cada barra preta, já com a zona de silêncio à esquerda. */
export function barrasCode128C(digitos: string): Barras {
  const larguras = modulosCode128C(digitos);
  const barras: Barras['barras'] = [];
  let x = ZONA_SILENCIO;
  larguras.forEach((largura, i) => {
    if (i % 2 === 0) barras.push({ x, largura });
    x += largura;
  });
  return { total: x + ZONA_SILENCIO, barras };
}
