// npm run test:janela: depois do Forge empacotar, roda executar.cjs no
// Electron e, quando ele termina, apaga o que o teste criou no %TEMP%. A
// pasta temporária é criada aqui e passada por PS_JANELA_TMP: enquanto o app
// está aberto, o Chromium prende arquivos dela (cookies, cache da GPU), então
// só dá para apagar depois que o processo do Electron sai.
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-janela-'));

/** Apaga a pasta do teste e a electron-packager que o Forge deixa vazia. */
function limpar() {
  try {
    fs.rmSync(tmp, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 500,
    });
    console.log(`Pasta temporária apagada: ${tmp}`);
  } catch (erro) {
    console.log(`Não foi possível apagar ${tmp}: ${String(erro)}`);
  }
  try {
    // Só se estiver vazia (outro empacotamento pode estar usando).
    fs.rmdirSync(path.join(os.tmpdir(), 'electron-packager'));
  } catch {
    // Não existe ou não está vazia: fica.
  }
}

const filho = spawn(electron, [path.join(__dirname, 'executar.cjs')], {
  stdio: 'inherit',
  env: { ...process.env, PS_JANELA_TMP: tmp },
});
filho.on('exit', (codigo, sinal) => {
  limpar();
  process.exit(codigo ?? (sinal ? 1 : 0));
});
filho.on('error', (erro) => {
  console.error(erro);
  limpar();
  process.exit(1);
});
