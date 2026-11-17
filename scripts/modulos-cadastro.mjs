// Carrega os módulos puros de src/cadastro (formato, csv, casamento) para
// os scripts do Node, sem passo de build: cada .ts é convertido para .mjs
// pelo TypeScript do próprio repositório (devDependency) e guardado em
// node_modules/.cache/ps-reader-cadastro. A conversão só se repete quando o
// .ts muda (o resumo do fonte vai na primeira linha do .mjs).
//
// Os três arquivos só se importam com `import type`, que some na conversão:
// cada .mjs roda sozinho. Node 20 ou mais novo.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(RAIZ, 'node_modules', '.cache', 'ps-reader-cadastro');

let ts = null;
function typescript() {
  if (ts) return ts;
  try {
    ts = createRequire(join(RAIZ, 'package.json'))('typescript');
  } catch {
    throw new Error(
      'Falta o TypeScript do repositório para preparar o motor. Rode "npm ci" na pasta do PS Reader.',
    );
  }
  return ts;
}

/** Um dos módulos de src/cadastro ("formato", "csv", "casamento"). */
export async function moduloCadastro(nome) {
  const fonte = join(RAIZ, 'src', 'cadastro', `${nome}.ts`);
  const texto = readFileSync(fonte, 'utf8');
  const resumo = createHash('sha256').update(texto).digest('hex');
  const destino = join(CACHE, `${nome}.mjs`);
  const marca = `// fonte ${resumo}\n`;
  const atual = existsSync(destino) ? readFileSync(destino, 'utf8') : '';
  if (!atual.startsWith(marca)) {
    const t = typescript();
    const saida = t.transpileModule(texto, {
      fileName: fonte,
      compilerOptions: {
        module: t.ModuleKind.ESNext,
        target: t.ScriptTarget.ES2022,
      },
    }).outputText;
    if (/^\s*import\s[^'"]*['"]\./m.test(saida))
      throw new Error(
        `src/cadastro/${nome}.ts importa outro arquivo em tempo de execução; use só import type.`,
      );
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(destino, marca + saida, 'utf8');
  }
  return import(pathToFileURL(destino).href);
}
