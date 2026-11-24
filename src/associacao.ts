// Associação da extensão .psxml (cópia editada) com o app, no registro do
// usuário atual (HKCU\Software\Classes): sem administrador. Gravada nos
// eventos de instalação e de atualização do Squirrel e apagada na
// desinstalação. Na instalação e na atualização, apaga também os atalhos
// "Leitor NF-e PS.lnk" do nome antigo.
//
// O .xml ganha só uma entrada no "Abrir com" (OpenWithProgids, ProgID
// PSReader.xml): o programa padrão do .xml nunca muda (nem o valor padrão de
// .xml, nem o UserChoice do Explorer). Na desinstalação sai só o que é do PS
// Reader: o valor PSReader.xml em OpenWithProgids e a chave PSReader.xml.
//
// Na instalação e na atualização, antes do aviso ao Explorer, sai também do
// "Abrir com" o que sobrou de versões antigas: o instalador ("PS
// Reader-1.2.3 Setup.exe", que, escolhido por engano, reinstalava a versão
// antiga) e o executável da 1.0.0 ("Leitor NF-e PS.exe"). Ver
// limparAbrirComAntigo e src/abrirComAntigo.ts.
//
// O Squirrel instala em %LocalAppData%\PSXmlReader\: cada versão fica em
// app-<versão>\ (que muda a cada atualização) e na raiz fica um executável
// fixo, com o mesmo nome do executável do app, que abre a versão atual. O
// comando de abrir aponta para esse executável da raiz.
//
// Ícones dos arquivos: o .xml (no "Abrir com", ProgID PSReader.xml) usa
// icone-xml.ico e o .psxml usa icone-psxml.ico. Os dois vêm no pacote
// (resources\, extraResource do forge.config.mts) e, a cada instalação e
// atualização, são copiados para a raiz (PSXmlReader\icones\), que não muda
// entre versões; o DefaultIcon aponta para lá. Se a cópia falhar, o ícone
// fica o do app (o executável da raiz), como antes.
//
// Tudo síncrono, com o reg.exe e o PowerShell do próprio Windows: o Squirrel
// dá 15 segundos para os eventos de instalação e atualização e 10 para o de
// desinstalação, e o app sai logo depois. Cada execução sobrescreve um log
// curto em %TEMP%\ps-reader-associacao.log.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CHAVE_APPLICATIONS,
  CHAVES_OPEN_WITH_LIST,
  ehNomeAntigoDoPsReader,
  mruSemLetras,
  planoOpenWithList,
  subchavesNaSaida,
  valoresNaSaida,
} from './abrirComAntigo';

export const EXTENSAO = '.psxml';
const PROGID = 'PSReader.psxml';
const DESCRICAO = 'Cópia editada do PS Reader';

const CLASSES = 'HKCU\\Software\\Classes';
const CHAVE_EXTENSAO = `${CLASSES}\\${EXTENSAO}`;
const CHAVE_PROGID = `${CLASSES}\\${PROGID}`;

/** ProgID do .xml, só para o "Abrir com". */
export const PROGID_XML = 'PSReader.xml';
const DESCRICAO_XML = 'Documento XML (PS Reader)';
/** Onde o Explorer procura os programas do "Abrir com" do .xml. */
export const CHAVE_ABRIR_COM_XML = `${CLASSES}\\.xml\\OpenWithProgids`;
export const CHAVE_PROGID_XML = `${CLASSES}\\${PROGID_XML}`;

/** Ícones dos arquivos, instalados junto do app. */
export const ICONE_XML = 'icone-xml.ico';
export const ICONE_PSXML = 'icone-psxml.ico';
/** Pasta dos ícones na raiz da instalação (não muda entre versões). */
export const PASTA_ICONES = 'icones';

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

/**
 * Onde ficam os ícones na raiz da instalação `raiz` (a pasta do executável
 * fixo). Puro, para testar.
 */
export function caminhosDosIcones(raiz: string): {
  xml: string;
  psxml: string;
} {
  return {
    xml: path.join(raiz, PASTA_ICONES, ICONE_XML),
    psxml: path.join(raiz, PASTA_ICONES, ICONE_PSXML),
  };
}

/**
 * Copia os ícones do pacote (`recursos`, a pasta resources\ da versão) para a
 * raiz da instalação. Devolve os caminhos copiados, ou null se não deu (o
 * DefaultIcon fica o do app). Cada passo vai para o log.
 */
function instalarIcones(
  recursos: string,
  raiz: string,
): { xml: string; psxml: string } | null {
  const destino = caminhosDosIcones(raiz);
  try {
    mkdirSync(path.join(raiz, PASTA_ICONES), { recursive: true });
    copyFileSync(path.join(recursos, ICONE_XML), destino.xml);
    copyFileSync(path.join(recursos, ICONE_PSXML), destino.psxml);
    log(`ícones copiados para ${path.join(raiz, PASTA_ICONES)}`);
    return destino;
  } catch (erro) {
    log(
      `ícones: não copiados (${resumo(erro instanceof Error ? erro.message : erro)}); fica o ícone do app`,
    );
    return null;
  }
}

/** Apaga a pasta dos ícones da raiz (desinstalação). */
function removerIcones(raiz: string): void {
  try {
    rmSync(path.join(raiz, PASTA_ICONES), { recursive: true, force: true });
    log('ícones apagados');
  } catch (erro) {
    log(
      `ícones: não apagados (${resumo(erro instanceof Error ? erro.message : erro)})`,
    );
  }
}

/** Valor do DefaultIcon: o caminho e o índice 0 (sem aspas, como o Explorer lê). */
const valorIcone = (arquivo: string) => `${arquivo},0`;

/**
 * Comandos do reg.exe que põem o PS Reader no "Abrir com" do .xml, com o
 * executável da raiz `exe` e o ícone `icone` (icone-xml.ico; sem ele, o do
 * app). Puro, para testar. Nenhum toca no valor padrão de .xml nem no
 * UserChoice: o programa padrão do .xml continua o mesmo.
 * O "--" antes do "%1": nada depois dele é lido como opção (pelo Chromium e
 * por src/seguranca/argumentos.ts), mesmo que o caminho pareça uma.
 */
export function comandosAbrirComXml(
  exe: string,
  icone: string = exe,
): string[][] {
  return [
    // Valor vazio do tipo REG_NONE, como a Microsoft documenta.
    ['add', CHAVE_ABRIR_COM_XML, '/v', PROGID_XML, '/t', 'REG_NONE', '/f'],
    ['add', CHAVE_PROGID_XML, '/ve', '/t', 'REG_SZ', '/d', DESCRICAO_XML, '/f'],
    // Ícone do .xml; sem aspas, o Explorer separa o índice pela última vírgula.
    [
      'add',
      `${CHAVE_PROGID_XML}\\DefaultIcon`,
      '/ve',
      '/t',
      'REG_SZ',
      '/d',
      valorIcone(icone),
      '/f',
    ],
    [
      'add',
      `${CHAVE_PROGID_XML}\\shell\\open\\command`,
      '/ve',
      '/t',
      'REG_SZ',
      '/d',
      `"${exe}" -- "%1"`,
      '/f',
    ],
  ];
}

/**
 * Comandos do reg.exe que tiram o PS Reader do "Abrir com" do .xml: só o
 * valor PSReader.xml (a chave OpenWithProgids e a .xml ficam) e a chave do
 * ProgID PSReader.xml. Puro, para testar.
 */
export function comandosRemoverAbrirComXml(): string[][] {
  return [
    ['delete', CHAVE_ABRIR_COM_XML, '/v', PROGID_XML, '/f'],
    ['delete', CHAVE_PROGID_XML, '/f'],
  ];
}

/** Põe o PS Reader no "Abrir com" do .xml (instalação e atualização). */
function registrarAbrirComXml(exe: string, icone: string): void {
  for (const args of comandosAbrirComXml(exe, icone)) reg(...args);
}

/**
 * Comandos do reg.exe da associação do .psxml: a extensão, o ProgID com a
 * descrição, o ícone `icone` (icone-psxml.ico; sem ele, o do app) e o
 * comando de abrir. Puro, para testar.
 */
export function comandosAssociacaoPsxml(
  exe: string,
  icone: string = exe,
): string[][] {
  const padrao = (chave: string, valor: string) => [
    'add',
    chave,
    '/ve',
    '/t',
    'REG_SZ',
    '/d',
    valor,
    '/f',
  ];
  return [
    padrao(CHAVE_EXTENSAO, PROGID),
    padrao(CHAVE_PROGID, DESCRICAO),
    padrao(`${CHAVE_PROGID}\\DefaultIcon`, valorIcone(icone)),
    padrao(`${CHAVE_PROGID}\\shell\\open\\command`, `"${exe}" "%1"`),
  ];
}

/** Tira o PS Reader do "Abrir com" do .xml; parte que já não existia, segue. */
function removerAbrirComXml(): void {
  for (const args of comandosRemoverAbrirComXml()) {
    try {
      reg(...args);
    } catch {
      // Valor ou chave já não existia.
    }
  }
}

/**
 * Tempo máximo da limpeza do "Abrir com": passou disso, as próximas chamadas
 * ficam para a próxima atualização. O normal é bem menos (cada reg.exe leva
 * dezenas de milissegundos), e o evento inteiro fica dentro dos 10 s.
 */
const LIMITE_LIMPEZA_MS = 3000;

/**
 * Apaga os registros de PS Reader antigo do "Abrir com" (src/abrirComAntigo.ts):
 * as subchaves de HKCU\Software\Classes\Applications com o nome do
 * instalador antigo ou do executável da 1.0.0, e os valores de uma letra com
 * esses nomes no OpenWithList do .xml e do .psxml (e a letra no MRUList).
 * Mais nada: UserChoice, MuiCache e entradas de outros programas ficam. Cada
 * remoção vai para o log; um erro registra e segue para o próximo passo.
 */
function limparAbrirComAntigo(): void {
  const inicio = Date.now();
  const noPrazo = () => {
    if (Date.now() - inicio <= LIMITE_LIMPEZA_MS) return true;
    log('limpeza do abrir com: prazo esgotado, o resto fica para depois');
    return false;
  };

  let subchaves: string[] = [];
  try {
    subchaves = subchavesNaSaida(
      reg('query', CHAVE_APPLICATIONS),
      CHAVE_APPLICATIONS,
    );
  } catch {
    // Sem a chave Applications: nada a apagar ali.
  }
  for (const nome of subchaves.filter(ehNomeAntigoDoPsReader)) {
    if (!noPrazo()) break;
    try {
      reg('delete', `${CHAVE_APPLICATIONS}\\${nome}`, '/f');
      log(`  apagada a chave Applications\\${nome}`);
    } catch {
      log(`  não apagada a chave Applications\\${nome}`);
    }
  }

  for (const chave of CHAVES_OPEN_WITH_LIST) {
    if (!noPrazo()) break;
    let saida = '';
    try {
      saida = reg('query', chave);
    } catch {
      continue; // Extensão sem OpenWithList.
    }
    const plano = planoOpenWithList(valoresNaSaida(saida));
    const apagadas: string[] = [];
    for (const { letra, dado } of plano.apagar) {
      if (!noPrazo()) break;
      try {
        reg('delete', chave, '/v', letra, '/f');
        apagadas.push(letra);
        log(`  apagado o valor ${letra} (${dado}) de ${chave}`);
      } catch {
        log(`  não apagado o valor ${letra} (${dado}) de ${chave}`);
      }
    }
    // O MRUList perde só as letras que de fato saíram.
    const mru = valoresNaSaida(saida).find(
      (v) => v.nome.toLowerCase() === 'mrulist',
    );
    if (!mru || apagadas.length === 0) continue;
    const novo = mruSemLetras(mru.dado, apagadas);
    if (novo === mru.dado || !noPrazo()) continue;
    try {
      reg('add', chave, '/v', 'MRUList', '/t', 'REG_SZ', '/d', novo, '/f');
      log(`  MRUList de ${chave}: ${mru.dado} -> ${novo}`);
    } catch {
      log(`  MRUList de ${chave} não atualizado (${mru.dado})`);
    }
  }
  log(`limpeza do abrir com: ${Date.now() - inicio} ms`);
}

/** Grava a associação do .psxml (instalação e atualização). */
export function registrarAssociacao(): void {
  const exe = executavelDaRaiz();
  log(`executável da raiz: ${exe}`);
  // Os ícones vão para a raiz (não muda entre versões); sem eles, o do app.
  const icones = instalarIcones(process.resourcesPath, path.dirname(exe));
  // Cada parte segue mesmo se a anterior falhar.
  try {
    for (const args of comandosAssociacaoPsxml(exe, icones?.psxml ?? exe))
      reg(...args);
  } catch {
    log('associação do .psxml: interrompida');
  }
  // O .xml no "Abrir com": um erro aqui não desfaz o .psxml já gravado.
  try {
    registrarAbrirComXml(exe, icones?.xml ?? exe);
  } catch {
    log('abrir com do .xml: interrompido');
  }
  try {
    limparAbrirComAntigo();
  } catch (erro) {
    log(
      `limpeza do abrir com: interrompida (${resumo(erro instanceof Error ? erro.message : erro)})`,
    );
  }
  avisarExplorer();
}

/**
 * Apaga o que registrarAssociacao gravou (desinstalação). A chave .psxml só
 * sai se ainda aponta para o PS Reader.
 */
export function removerAssociacao(): void {
  // Primeiro o "Abrir com" do .xml (cada parte segue mesmo se falhar).
  removerAbrirComXml();
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
  removerIcones(path.dirname(executavelDaRaiz()));
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
