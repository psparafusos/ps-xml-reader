// Associação da extensão .psxml (cópia editada) com o app, no registro do
// usuário atual (HKCU\Software\Classes): sem administrador e sem tocar no
// .xml nem em outra extensão. Gravada nos eventos de instalação e de
// atualização do Squirrel e apagada na desinstalação.
//
// O Squirrel instala em %LocalAppData%\PSXmlReader\: cada versão fica em
// app-<versão>\ (que muda a cada atualização) e na raiz fica um executável
// fixo, com o mesmo nome do executável do app, que abre a versão atual. O
// comando de abrir e o ícone apontam para esse executável da raiz.
//
// Escrita com o reg.exe do próprio Windows, de forma síncrona: o Squirrel dá
// 15 segundos para os eventos de instalação e atualização e 10 para o de
// desinstalação, e o app sai logo depois.

import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

export const EXTENSAO = '.psxml';
const PROGID = 'PSReader.psxml';
const DESCRICAO = 'Cópia editada do PS Reader';

const CLASSES = 'HKCU\\Software\\Classes';
const CHAVE_EXTENSAO = `${CLASSES}\\${EXTENSAO}`;
const CHAVE_PROGID = `${CLASSES}\\${PROGID}`;

/** Tempo máximo de cada chamada ao reg.exe. */
const ESPERA_REG_MS = 3000;

function reg(...args: string[]): string {
  return execFileSync('reg', args, {
    timeout: ESPERA_REG_MS,
    windowsHide: true,
    encoding: 'utf8',
  });
}

/** Grava o valor padrão (/ve) de `chave`. */
function gravarPadrao(chave: string, valor: string): void {
  reg('add', chave, '/ve', '/t', 'REG_SZ', '/d', valor, '/f');
}

/**
 * Executável fixo da raiz da instalação (%LocalAppData%\PSXmlReader\<nome>.exe):
 * o app roda de app-<versão>\, uma pasta abaixo.
 */
function executavelDaRaiz(): string {
  const raiz = path.resolve(path.dirname(process.execPath), '..');
  return path.join(raiz, path.basename(process.execPath));
}

/**
 * Avisa o Explorer que as associações mudaram (SHChangeNotify com
 * SHCNE_ASSOCCHANGED), para o ícone do .psxml aparecer sem reiniciar o
 * Explorer. Sem dependência: usa o PowerShell do Windows, solto, para não
 * segurar o evento do Squirrel. Se falhar, o ícone aparece depois de
 * reiniciar o Explorer ou de sair e entrar no Windows.
 */
function avisarExplorer(): void {
  const script =
    "Add-Type -Namespace PS -Name Shell -MemberDefinition '" +
    '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, System.IntPtr a, System.IntPtr b);' +
    "'; [PS.Shell]::SHChangeNotify(0x08000000, 0x1000, [System.IntPtr]::Zero, [System.IntPtr]::Zero)";
  // -EncodedCommand (UTF-16LE em base64): as aspas do script não passam pela
  // linha de comando, onde o PowerShell as perderia.
  const codificado = Buffer.from(script, 'utf16le').toString('base64');
  try {
    spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        codificado,
      ],
      { detached: true, stdio: 'ignore', windowsHide: true },
    ).unref();
  } catch {
    // Sem aviso: o ícone só aparece depois.
  }
}

/** Grava a associação do .psxml (instalação e atualização). */
export function registrarAssociacao(): void {
  const exe = executavelDaRaiz();
  gravarPadrao(CHAVE_EXTENSAO, PROGID);
  gravarPadrao(CHAVE_PROGID, DESCRICAO);
  // O executável da raiz leva o ícone do app (o da PS) e não muda entre versões.
  // Sem aspas: o Explorer separa o índice pela última vírgula.
  gravarPadrao(`${CHAVE_PROGID}\\DefaultIcon`, `${exe},0`);
  gravarPadrao(`${CHAVE_PROGID}\\shell\\open\\command`, `"${exe}" "%1"`);
  avisarExplorer();
}

/**
 * Apaga o que registrarAssociacao gravou (desinstalação). A chave .psxml só
 * sai se ainda aponta para o PS Reader.
 */
export function removerAssociacao(): void {
  try {
    reg('delete', CHAVE_PROGID, '/f');
  } catch {
    // Chave já não existia.
  }
  let padrao = '';
  try {
    padrao = reg('query', CHAVE_EXTENSAO, '/ve');
  } catch {
    // Chave já não existia.
  }
  if (padrao.includes(PROGID)) reg('delete', CHAVE_EXTENSAO, '/f');
  avisarExplorer();
}

/**
 * Trata o evento do Squirrel em `evento` (process.argv[1]). Erro no registro
 * não impede a instalação: o app continua sem a associação.
 */
export function tratarEventoSquirrel(evento: string | undefined): void {
  if (process.platform !== 'win32') return;
  try {
    if (evento === '--squirrel-install' || evento === '--squirrel-updated') {
      registrarAssociacao();
    } else if (evento === '--squirrel-uninstall') {
      removerAssociacao();
    }
  } catch {
    // Segue sem a associação.
  }
}
