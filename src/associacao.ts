// Associação da extensão .psxml (cópia editada) com o app, no registro do
// usuário atual (HKCU\Software\Classes): sem administrador e sem tocar no
// .xml nem em outra extensão. Gravada nos eventos de instalação e de
// atualização do Squirrel e apagada na desinstalação. Na instalação e na
// atualização, apaga também os atalhos "Leitor NF-e PS.lnk" do nome antigo.
//
// O Squirrel instala em %LocalAppData%\PSXmlReader\: cada versão fica em
// app-<versão>\ (que muda a cada atualização) e na raiz fica um executável
// fixo, com o mesmo nome do executável do app, que abre a versão atual. O
// comando de abrir e o ícone apontam para esse executável da raiz.
//
// Tudo síncrono, com o reg.exe e o PowerShell do próprio Windows: o Squirrel
// dá 15 segundos para os eventos de instalação e atualização e 10 para o de
// desinstalação, e o app sai logo depois. Cada execução sobrescreve um log
// curto em %TEMP%\ps-reader-associacao.log.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const EXTENSAO = '.psxml';
const PROGID = 'PSReader.psxml';
const DESCRICAO = 'Cópia editada do PS Reader';

const CLASSES = 'HKCU\\Software\\Classes';
const CHAVE_EXTENSAO = `${CLASSES}\\${EXTENSAO}`;
const CHAVE_PROGID = `${CLASSES}\\${PROGID}`;

/** Tempo máximo de cada chamada ao reg.exe. */
const ESPERA_REG_MS = 2000;
/**
 * Tempo máximo de cada chamada ao PowerShell (aviso ao Explorer e atalhos
 * antigos). Cada uma leva cerca de 1 segundo; com as chamadas ao reg.exe, o
 * normal fica em 2 a 3 segundos, dentro dos 15 da instalação e dos 10 da
 * desinstalação (que só faz o aviso).
 */
const ESPERA_AVISO_MS = 6000;

const ARQUIVO_LOG = path.join(os.tmpdir(), 'ps-reader-associacao.log');
const linhasLog: string[] = [];

function log(linha: string): void {
  linhasLog.push(linha);
}

/** Primeira linha útil da saída de erro de um processo, sem quebras. */
function resumo(texto: unknown): string {
  return String(texto ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** Roda o reg.exe e registra no log o resultado (lança o erro de novo). */
function reg(...args: string[]): string {
  const rotulo = `reg ${args.slice(0, 2).join(' ')}`;
  try {
    const saida = execFileSync('reg', args, {
      timeout: ESPERA_REG_MS,
      windowsHide: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    log(`${rotulo}: ok`);
    return saida;
  } catch (erro) {
    const e = erro as { status?: number; stderr?: unknown; message?: string };
    log(
      `${rotulo}: erro (saída ${e.status ?? '?'}) ${resumo(e.stderr) || resumo(e.message)}`,
    );
    throw erro;
  }
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

/** Texto entre aspas simples do PowerShell (aspas simples dobradas). */
const textoPs = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Roda `script` no PowerShell do Windows, síncrono, e registra no log o
 * resultado com `rotulo`. Devolve a saída padrão, ou null se falhou. Sem
 * dependência. Síncrono de propósito: solto (detached), o PowerShell não
 * chegava ao fim antes de o evento do Squirrel terminar.
 */
function powershell(rotulo: string, script: string): string | null {
  // -EncodedCommand (UTF-16LE em base64): as aspas do script não passam pela
  // linha de comando, onde o PowerShell as perderia. A saída em UTF-8, como o
  // Node lê; sem isso os acentos dos caminhos chegam trocados no log.
  const codificado = Buffer.from(
    "$ProgressPreference = 'SilentlyContinue'; " +
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' +
      script,
    'utf16le',
  ).toString('base64');
  const inicio = Date.now();
  try {
    const saida = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        codificado,
      ],
      {
        timeout: ESPERA_AVISO_MS,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    log(`${rotulo}: saída 0 em ${Date.now() - inicio} ms`);
    return saida;
  } catch (erro) {
    const e = erro as {
      status?: number | null;
      signal?: string | null;
      stderr?: unknown;
      message?: string;
    };
    log(
      `${rotulo}: erro em ${Date.now() - inicio} ms (saída ${e.status ?? e.signal ?? '?'}) ${resumo(e.stderr) || resumo(e.message)}`,
    );
    return null;
  }
}

/**
 * Avisa o Explorer que as associações mudaram, depois de gravar ou apagar o
 * registro: SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST | SHCNF_FLUSH,
 * NULL, NULL), como pede a documentação da Microsoft. Sem aviso, o ícone e o
 * nome do tipo só mudam depois de reiniciar o Explorer.
 */
function avisarExplorer(): void {
  powershell(
    'aviso ao Explorer',
    "Add-Type -Namespace PS -Name Shell -MemberDefinition '" +
      '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, System.IntPtr a, System.IntPtr b);' +
      "'; [PS.Shell]::SHChangeNotify(0x08000000, 0x1000, [System.IntPtr]::Zero, [System.IntPtr]::Zero)",
  );
}

/** Nome dos atalhos da versão antiga do app (produto "Leitor NF-e PS"). */
const ATALHO_ANTIGO = 'Leitor NF-e PS.lnk';
/** Pasta do menu Iniciar onde o Squirrel põe os atalhos (o author do package.json). */
const PASTA_MENU = 'PS Parafusos e Segurança LTDA';
/** Pasta da instalação do Squirrel (name do MakerSquirrel). */
const PASTA_INSTALACAO = 'PSXmlReader';

/**
 * Apaga os atalhos "Leitor NF-e PS.lnk" que sobraram da troca de nome, só no
 * menu Iniciar (na pasta do Squirrel e na raiz de Programas) e na área de
 * trabalho do usuário, e só se o destino do atalho fica dentro da pasta da
 * instalação. Outros atalhos, pastas e a área de trabalho pública não são
 * tocados. Cada caminho olhado vai para o log, com o que foi feito.
 */
function apagarAtalhosAntigos(): void {
  const raiz = path.resolve(path.dirname(process.execPath), '..');
  // Fora da instalação do Squirrel (npm start, pasta out\): não mexe em nada.
  if (path.basename(raiz).toLowerCase() !== PASTA_INSTALACAO.toLowerCase()) {
    log(`atalhos antigos: ignorado, fora da instalação (${raiz})`);
    return;
  }
  const saida = powershell(
    'atalhos antigos',
    [
      `$raiz = ${textoPs(`${raiz}\\`)}`,
      `$nome = ${textoPs(ATALHO_ANTIGO)}`,
      '$programas = [Environment]::GetFolderPath([Environment+SpecialFolder]::Programs)',
      '$mesa = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)',
      `$caminhos = @((Join-Path (Join-Path $programas ${textoPs(PASTA_MENU)}) $nome), (Join-Path $programas $nome), (Join-Path $mesa $nome))`,
      '$shell = New-Object -ComObject WScript.Shell',
      'foreach ($c in $caminhos) {',
      '  if (-not (Test-Path -LiteralPath $c -PathType Leaf)) { "não existe: $c"; continue }',
      '  $alvo = $shell.CreateShortcut($c).TargetPath',
      '  if ($alvo -and $alvo.StartsWith($raiz, [StringComparison]::OrdinalIgnoreCase)) {',
      '    try { Remove-Item -LiteralPath $c -Force -ErrorAction Stop; "apagado: $c (destino $alvo)" }',
      '    catch { "erro ao apagar: $c ($($_.Exception.Message))" }',
      '  } else { "mantido: $c (destino $alvo)" }',
      '}',
    ].join('\n'),
  );
  for (const linha of (saida ?? '').split(/\r?\n/)) {
    if (linha.trim()) log(`  ${linha.trim()}`);
  }
}

/** Grava a associação do .psxml (instalação e atualização). */
export function registrarAssociacao(): void {
  const exe = executavelDaRaiz();
  log(`executável da raiz: ${exe}`);
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

/** Sobrescreve o log desta execução. Falha ao gravar não atrapalha o evento. */
function gravarLog(): void {
  try {
    writeFileSync(ARQUIVO_LOG, `${linhasLog.join('\r\n')}\r\n`, 'utf8');
  } catch {
    // Sem log.
  }
}

/**
 * Trata o evento do Squirrel em `evento` (process.argv[1]). Erro no registro
 * não impede a instalação: o app continua sem a associação.
 */
export function tratarEventoSquirrel(evento: string | undefined): void {
  if (process.platform !== 'win32') return;
  const instalar =
    evento === '--squirrel-install' || evento === '--squirrel-updated';
  const desinstalar = evento === '--squirrel-uninstall';
  if (!instalar && !desinstalar) return;

  const inicio = Date.now();
  log(`${new Date().toLocaleString('pt-BR')} evento ${evento}`);
  try {
    if (instalar) registrarAssociacao();
    else removerAssociacao();
  } catch (erro) {
    log(`interrompido: ${resumo(erro instanceof Error ? erro.message : erro)}`);
  }
  // Independente do registro: um erro lá não impede a limpeza dos atalhos.
  if (instalar) apagarAtalhosAntigos();
  log(`total: ${Date.now() - inicio} ms`);
  gravarLog();
}
