// npm run test:janela: empacota com o Forge, roda executar.cjs no Electron
// e, quando ele termina, apaga o que a rodada criou no %TEMP%.
//
// Tudo o que a rodada usa no %TEMP% fica numa pasta só dela (ps-janela-
// com sufixo aleatório):
// - empacotar/: a pasta temporária do empacotador (PS_EMPACOTAR_TMP, lida
//   no forge.config.mts). Sem isso ele usaria %TEMP%\electron-packager, que
//   ele mesmo apaga inteira ao começar: duas worktrees empacotando ao mesmo
//   tempo apagavam a pasta uma da outra.
// - janela/: dados, notas e destino do app no teste (PS_JANELA_TMP). Enquanto
//   o app está aberto, o Chromium prende arquivos dela (cookies, cache da
//   GPU), então só dá para apagar depois que o processo do Electron sai.
// Assim duas rodadas em paralelo não mexem uma na pasta da outra, e a
// limpeza apaga só a pasta desta rodada.
//
// Com PS_JANELA_SEM_EMPACOTAR=1, pula o empacotamento e usa o build que já
// está em .vite/ (para repetir casos isolados com PS_JANELA_CASOS).
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const RAIZ = path.resolve(__dirname, '..', '..');
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-janela-'));
const empacotar = path.join(raiz, 'empacotar');
const janela = path.join(raiz, 'janela');
fs.mkdirSync(empacotar);
fs.mkdirSync(janela);
console.log(`Pasta temporária desta rodada: ${raiz}`);

/** Apaga a pasta desta rodada (e só ela). */
function limpar() {
  try {
    fs.rmSync(raiz, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500,
    });
    console.log(`Pasta temporária apagada: ${raiz}`);
  } catch (erro) {
    console.log(`Não foi possível apagar ${raiz}: ${String(erro)}`);
  }
}

function sair(codigo) {
  limpar();
  process.exit(codigo);
}

/** Roda um processo e devolve o código de saída (1 se não subiu). */
function rodar(comando, args, env) {
  return new Promise((resolve) => {
    const filho = spawn(comando, args, { stdio: 'inherit', env, cwd: RAIZ });
    filho.on('exit', (codigo, sinal) => resolve(codigo ?? (sinal ? 1 : 0)));
    filho.on('error', (erro) => {
      console.error(erro);
      resolve(1);
    });
  });
}

// Ctrl+C: o filho recebe o mesmo sinal; a pasta é apagada quando ele sai.
process.on('SIGINT', () => undefined);

(async () => {
  if (process.env.PS_JANELA_SEM_EMPACOTAR !== '1') {
    const forge = require.resolve('@electron-forge/cli/dist/electron-forge.js');
    const codigo = await rodar(process.execPath, [forge, 'package'], {
      ...process.env,
      PS_EMPACOTAR_TMP: empacotar,
    });
    if (codigo !== 0) {
      console.error(`O empacotamento falhou (código ${codigo}).`);
      sair(codigo);
      return;
    }
  }
  const codigo = await rodar(electron, [path.join(__dirname, 'executar.cjs')], {
    ...process.env,
    PS_JANELA_TMP: janela,
  });
  sair(codigo);
})();
