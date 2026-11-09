// Protótipo da etapa 3: o leitor de XML roda num utilityProcess do Electron
// com tempo limite? Não faz parte do app nem dos testes automáticos.
//
// Como rodar (na raiz do projeto):
//   npx electron test/xml/prototipo/principal.mjs [saida.json]
//
// O que faz, sem abrir janela:
// 1. Empacota filho.ts e motor.ts com o Vite numa pasta de os.tmpdir().
// 2. Gera XML inventados de 1, 20 e 100 MB na mesma pasta.
// 3. Para cada um, mede no processo principal: stat, leitura do Buffer e
//    decodificação; depois manda o texto ao utilityProcess, que roda o
//    leitor e devolve o resumo (e a árvore, até 20 MB). Três rodadas.
// 4. Prova o tempo limite (filho em laço sem fim, morto pelo principal) e o
//    limite de memória: --max-old-space-size=128 no execArgv (ignorado) e o
//    principal vigiando o filho com o teto LIMITE_MEMORIA_FILHO_MB (1 GB).
// 5. Escreve os resultados em JSON e apaga a pasta temporária.

import { app, utilityProcess } from 'electron';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const MB = 1024 * 1024;
const TEMPO_LIMITE_MS = 30_000;
const RODADAS = 3;

/** XML inventado de itens repetidos, com pelo menos `bytes` bytes. */
function xmlGrande(bytes) {
  const item = (n) =>
    `  <det nItem="${n}"><prod><cProd>P${n}</cProd><xProd>PARAFUSO SEXTAVADO AÇO M8 x ${n} mm</xProd><vProd>${(n % 997) + 0.5}</vProd></prod></det>\n`;
  const partes = ['<?xml version="1.0" encoding="UTF-8"?>\n<lote>\n'];
  let total = partes[0].length;
  for (let n = 1; total < bytes; n++) {
    const p = item(n);
    partes.push(p);
    total += Buffer.byteLength(p);
  }
  partes.push('</lote>\n');
  return partes.join('');
}

async function empacotar(saida) {
  const { build } = await import('vite');
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      ssr: true,
      outDir: saida,
      emptyOutDir: false,
      minify: false,
      target: 'node22',
      rollupOptions: {
        input: { filho: join(aqui, 'filho.ts'), motor: join(aqui, 'motor.ts') },
        output: { format: 'es', entryFileNames: '[name].mjs' },
      },
    },
  });
}

/** Cria o filho e espera ele subir. */
function criarFilho(caminho, execArgv = []) {
  const inicio = performance.now();
  const filho = utilityProcess.fork(caminho, [], {
    serviceName: 'Leitor de XML (protótipo)',
    stdio: 'inherit',
    execArgv,
  });
  return new Promise((resolve) =>
    filho.once('spawn', () =>
      resolve({ filho, subidaMs: performance.now() - inicio }),
    ),
  );
}

/**
 * Vigia a memória do filho pelo app.getAppMetrics() (a cada 100 ms) e mata
 * o filho se o conjunto de trabalho passar de `limiteMB`. Devolve o pico.
 */
function vigiarMemoria(filho, limiteMB) {
  const estado = { picoMB: 0, mortoPorMemoria: false };
  const relogio = setInterval(() => {
    const metrica = app.getAppMetrics().find((m) => m.pid === filho.pid);
    if (!metrica) return;
    const mb = Math.round(metrica.memory.workingSetSize / 1024);
    estado.picoMB = Math.max(estado.picoMB, mb);
    if (limiteMB && mb > limiteMB && !estado.mortoPorMemoria) {
      estado.mortoPorMemoria = true;
      filho.kill();
    }
  }, 100);
  return { estado, parar: () => clearInterval(relogio) };
}

/**
 * Manda um pedido e espera a resposta, a saída do filho ou o tempo limite
 * (que mata o filho). Nunca rejeita.
 */
function pedir(filho, pedido, limiteMs) {
  const inicio = performance.now();
  return new Promise((resolve) => {
    let acabou = false;
    let mortePorTempo = null;
    const terminar = (resultado) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(relogio);
      resolve({ ...resultado, totalMs: performance.now() - inicio });
    };
    const relogio = setTimeout(() => {
      mortePorTempo = performance.now();
      filho.kill();
    }, limiteMs);
    filho.once('message', (resposta) =>
      terminar({
        estado: 'ok',
        resposta,
        chegadaMs: Date.now() - resposta.enviadoEm,
      }),
    );
    filho.once('exit', (codigo) =>
      terminar(
        mortePorTempo === null
          ? { estado: 'saiu', codigo }
          : {
              estado: 'tempo-esgotado',
              codigo,
              morteMs: performance.now() - mortePorTempo,
            },
      ),
    );
    filho.postMessage(pedido);
  });
}

const mediana = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
const arred = (x) => Math.round(x * 10) / 10;

async function principal() {
  const pasta = mkdtempSync(join(tmpdir(), 'ps-reader-prototipo-'));
  const resultados = {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    tamanhos: [],
    tempoLimite: null,
    memoriaExecArgv: null,
    memoriaVigiada: null,
  };
  try {
    await empacotar(pasta);
    const motor = await import(pathToFileURL(join(pasta, 'motor.mjs')).href);
    const caminhoFilho = join(pasta, 'filho.mjs');

    for (const megas of [1, 20, 100]) {
      const arquivo = join(pasta, `lote-${megas}.xml`);
      writeFileSync(arquivo, xmlGrande(megas * MB - 64 * 1024));
      const rodadas = [];
      for (let r = 0; r < RODADAS; r++) {
        let t = performance.now();
        const tamanho = statSync(arquivo).size;
        const avaliacao = motor.avaliarTamanho(tamanho);
        const statMs = performance.now() - t;

        t = performance.now();
        const bytes = readFileSync(arquivo);
        const lerMs = performance.now() - t;

        t = performance.now();
        const dec = motor.decodificarXml(bytes);
        const decodificarMs = performance.now() - t;
        if (!dec.ok) throw new Error(dec.mensagem);

        const { filho, subidaMs } = await criarFilho(caminhoFilho);
        const devolverArvore = avaliacao.modo === 'arvore';
        const pedido = await pedir(
          filho,
          { modo: 'ler', texto: dec.texto, devolverArvore },
          TEMPO_LIMITE_MS,
        );
        filho.kill();
        if (pedido.estado !== 'ok') throw new Error(`filho: ${pedido.estado}`);
        rodadas.push({
          tamanho,
          modo: avaliacao.modo,
          statMs,
          lerMs,
          decodificarMs,
          subidaMs,
          leituraMs: pedido.resposta.leituraMs,
          idaEVoltaMs: pedido.totalMs,
          chegadaMs: pedido.chegadaMs,
          nos: pedido.resposta.nos,
          erro: pedido.resposta.erro,
          heapFilhoMB: pedido.resposta.heapMB,
          rssFilhoMB: pedido.resposta.rssMB,
          arvoreDevolvida: devolverArvore,
        });
      }
      const m = (campo) => arred(mediana(rodadas.map((x) => x[campo])));
      resultados.tamanhos.push({
        megas,
        bytes: rodadas[0].tamanho,
        modo: rodadas[0].modo,
        nos: rodadas[0].nos,
        erro: rodadas[0].erro,
        arvoreDevolvida: rodadas[0].arvoreDevolvida,
        medianaMs: {
          stat: m('statMs'),
          lerBuffer: m('lerMs'),
          decodificar: m('decodificarMs'),
          subirFilho: m('subidaMs'),
          leitorNoFilho: m('leituraMs'),
          idaEVolta: m('idaEVoltaMs'),
          chegadaDaResposta: m('chegadaMs'),
        },
        heapFilhoMB: mediana(rodadas.map((x) => x.heapFilhoMB)),
        rssFilhoMB: mediana(rodadas.map((x) => x.rssFilhoMB)),
      });
      rmSync(arquivo, { force: true });
    }

    // Tempo limite: o filho entra em laço sem fim e o principal o mata.
    {
      const { filho } = await criarFilho(caminhoFilho);
      const r = await pedir(filho, { modo: 'travar' }, 2000);
      resultados.tempoLimite = {
        limiteMs: 2000,
        estado: r.estado,
        codigo: r.codigo,
        totalMs: arred(r.totalMs),
        morteMs: arred(r.morteMs ?? -1),
      };
    }

    // Memória, jeito 1: --max-old-space-size=128 no execArgv do filho.
    {
      const { filho } = await criarFilho(caminhoFilho, [
        '--max-old-space-size=128',
      ]);
      const vigia = vigiarMemoria(filho, 0);
      const r = await pedir(filho, { modo: 'memoria' }, 60_000);
      vigia.parar();
      resultados.memoriaExecArgv = {
        execArgv: '--max-old-space-size=128',
        estado: r.estado,
        codigo: r.codigo,
        totalMs: arred(r.totalMs),
        picoMB: vigia.estado.picoMB,
      };
    }

    // Memória, jeito 2: o principal vigia o filho e mata acima do teto
    // (LIMITE_MEMORIA_FILHO_MB, 1 GB).
    {
      const { filho } = await criarFilho(caminhoFilho);
      const vigia = vigiarMemoria(filho, motor.LIMITE_MEMORIA_FILHO_MB);
      const r = await pedir(filho, { modo: 'memoria' }, 60_000);
      vigia.parar();
      resultados.memoriaVigiada = {
        limiteMB: motor.LIMITE_MEMORIA_FILHO_MB,
        estado: r.estado,
        codigo: r.codigo,
        totalMs: arred(r.totalMs),
        picoMB: vigia.estado.picoMB,
        mortoPorMemoria: vigia.estado.mortoPorMemoria,
      };
    }
    resultados.principalVivo = true;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
    resultados.pastaApagada = pasta;
  }
  return resultados;
}

app.whenReady().then(async () => {
  let codigo = 0;
  try {
    const resultados = await principal();
    const json = JSON.stringify(resultados, null, 2);
    console.log(json);
    if (process.argv.at(-1)?.endsWith('.json'))
      writeFileSync(process.argv.at(-1), json);
  } catch (erro) {
    console.error(erro);
    codigo = 1;
  }
  app.exit(codigo);
});
