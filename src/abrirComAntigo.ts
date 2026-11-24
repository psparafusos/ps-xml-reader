// Registros antigos do PS Reader no "Abrir com" do Windows: o que a limpeza
// da instalação e da atualização (src/associacao.ts) apaga. Só a lógica, sem
// Electron e sem tocar no registro, para testar.
//
// Sobram dois tipos de nome de versões antigas:
// - o instalador ("PS Reader-1.2.3 Setup.exe"): escolhido por engano no
//   "Abrir com" de um .xml, ele reinstala a versão antiga por cima;
// - o executável da 1.0.0 ("Leitor NF-e PS.exe"), que não existe mais.
// Eles aparecem como subchave de HKCU\Software\Classes\Applications e como
// valor de uma letra no OpenWithList do FileExts de .xml e .psxml.
// Qualquer outro nome fica: o PS Reader.exe atual, programas do Windows, o
// sistema de gestão da loja, o Setup de outro programa.

/** Onde o Windows guarda os programas que já abriram algum arquivo. */
export const CHAVE_APPLICATIONS = 'HKCU\\Software\\Classes\\Applications';

/** OpenWithList do usuário para cada extensão do PS Reader. */
const FILE_EXTS =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts';
export const CHAVES_OPEN_WITH_LIST = [
  `${FILE_EXTS}\\.xml\\OpenWithList`,
  `${FILE_EXTS}\\.psxml\\OpenWithList`,
];

/**
 * Nomes antigos, inteiros: "PS Reader-*Setup.exe" e "Leitor NF-e PS*.exe",
 * sem diferença de maiúscula. O curinga não aceita barra nem caminho.
 */
const NOMES_ANTIGOS = [
  /^PS Reader-[^\\/:]*Setup\.exe$/i,
  /^Leitor NF-e PS[^\\/:]*\.exe$/i,
];

/** O nome (de subchave ou conteúdo de valor) é de um PS Reader antigo. */
export function ehNomeAntigoDoPsReader(nome: string): boolean {
  const n = nome.trim();
  return NOMES_ANTIGOS.some((re) => re.test(n));
}

/**
 * Nomes das subchaves diretas de `chave` na saída do `reg query <chave>`.
 * O reg.exe escreve a chave completa com HKEY_CURRENT_USER no lugar de HKCU.
 */
export function subchavesNaSaida(saida: string, chave: string): string[] {
  const longa = chave.replace(/^HKCU\\/i, 'HKEY_CURRENT_USER\\');
  const prefixo = `${longa}\\`.toLowerCase();
  const nomes: string[] = [];
  for (const linha of saida.split(/\r?\n/)) {
    const l = linha.trim();
    if (!l.toLowerCase().startsWith(prefixo)) continue;
    const resto = l.slice(prefixo.length);
    if (resto && !resto.includes('\\')) nomes.push(resto);
  }
  return nomes;
}

export interface ValorRegistro {
  nome: string;
  tipo: string;
  dado: string;
}

/** Valores na saída do `reg query <chave>` (linhas "    nome    REG_SZ    dado"). */
export function valoresNaSaida(saida: string): ValorRegistro[] {
  const valores: ValorRegistro[] = [];
  for (const linha of saida.split(/\r?\n/)) {
    const m = /^ {4}(.+?) {4}(REG_[A-Z_]+)(?: {4}(.*))?$/.exec(linha);
    if (m) valores.push({ nome: m[1], tipo: m[2], dado: m[3] ?? '' });
  }
  return valores;
}

export interface PlanoOpenWithList {
  /** Valores de uma letra a apagar, com o conteúdo (para o log). */
  apagar: { letra: string; dado: string }[];
  /** MRUList sem as letras apagadas; null se não muda. */
  mruNovo: string | null;
}

/**
 * O que sai de um OpenWithList: só valores de uma letra (a a z) cujo
 * conteúdo é um nome antigo do PS Reader, e essas letras do MRUList.
 */
export function planoOpenWithList(valores: ValorRegistro[]): PlanoOpenWithList {
  const apagar = valores
    .filter(
      (v) =>
        /^[a-z]$/i.test(v.nome) &&
        v.tipo === 'REG_SZ' &&
        ehNomeAntigoDoPsReader(v.dado),
    )
    .map((v) => ({ letra: v.nome, dado: v.dado }));
  const mru = valores.find(
    (v) => v.nome.toLowerCase() === 'mrulist' && v.tipo === 'REG_SZ',
  );
  let mruNovo: string | null = null;
  if (mru && apagar.length > 0) {
    const filtrado = mruSemLetras(
      mru.dado,
      apagar.map((a) => a.letra),
    );
    if (filtrado !== mru.dado) mruNovo = filtrado;
  }
  return { apagar, mruNovo };
}

/** O MRUList `mru` sem as `letras` (sem diferença de maiúscula). */
export function mruSemLetras(mru: string, letras: Iterable<string>): string {
  const fora = new Set([...letras].map((l) => l.toLowerCase()));
  return [...mru].filter((c) => !fora.has(c.toLowerCase())).join('');
}
