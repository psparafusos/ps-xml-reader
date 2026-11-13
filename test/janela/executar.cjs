// npm run test:janela: testes que precisam do Chromium de verdade (DOMParser,
// a tela da Conferência e do DANFE). Roda o próprio app, do build que o
// Forge acabou de gerar em .vite/, numa janela que nunca aparece, com uma
// pasta de dados temporária (verificação online desligada, que é o padrão) e
// cópias temporárias dos arquivos de teste. Confere a tela por
// executeJavaScript, sem porta de depuração. Nenhum teste aciona Copiar.
//
// Casos (test/janela/fixtures, NF-e inventadas): a tela pelo app://, a
// abertura direta (parte 2A: sem a tela de escolha), a nota sem leitura
// protegida e o "NF-e abre em" por perfil, T6, T8 (gerado aqui), T9, T10,
// T11 e T12 do plano
// de segurança; a tela do leitor genérico de XML (leitorXml.cjs) e o serviço
// de leitura pesada (servico.cjs), com XML inventado gerado no teste; as
// janelas por cima (X e Esc das Configurações, rolagem travada atrás da
// ferramenta ST) e os dois avisos novos da ferramenta ST (t13, com a
// planilha inventada de planilhaST.mts).
'use strict';

const { app, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { casosLeitorXml, limparLeitorXml } = require('./leitorXml.cjs');
const { casosNavegacao } = require('./navegacao.cjs');
const { casosServico } = require('./servico.cjs');

const RAIZ = path.resolve(__dirname, '..', '..');
const MAIN = path.join(RAIZ, '.vite', 'build', 'main.cjs');
const FIXTURES = path.join(__dirname, 'fixtures');

if (!fs.existsSync(MAIN)) {
  console.error('Falta o build do app em .vite/. Rode: npm run test:janela');
  process.exit(1);
}

// Pasta temporária: a de rodar.cjs (npm run test:janela), que a apaga
// depois que o Electron sai; rodando este arquivo direto, uma nova.
const tmp =
  process.env.PS_JANELA_TMP ||
  fs.mkdtempSync(path.join(os.tmpdir(), 'ps-janela-'));
const dados = path.join(tmp, 'dados');
const notas = path.join(tmp, 'notas');
const destino = path.join(tmp, 'destino');
for (const p of [dados, notas, destino]) fs.mkdirSync(p, { recursive: true });
// Pasta de destino própria: o Salvar do T12 grava aqui, nunca nos fixtures.
fs.writeFileSync(
  path.join(dados, 'config.json'),
  JSON.stringify({ pastaDestino: destino }, null, 2),
);
app.setPath('userData', dados);

/** Cópia temporária de um fixture (o app pode gravar ao lado do .psxml). */
function copia(nome) {
  const alvo = path.join(notas, nome);
  fs.copyFileSync(path.join(FIXTURES, nome), alvo);
  return alvo;
}

// T8: 100 mil níveis de aninhamento, gerado aqui (nada grande no repositório).
// Raiz qualquer (vai para o leitor genérico) e raiz de NF-e (fluxo da nota,
// DOMParser).
const profundo = path.join(notas, 't08-profundo.xml');
fs.writeFileSync(
  profundo,
  `<?xml version="1.0" encoding="UTF-8"?>${'<a>'.repeat(100000)}${'</a>'.repeat(100000)}`,
);
const profundoNfe = path.join(notas, 't08-profundo-nfe.xml');
fs.writeFileSync(
  profundoNfe,
  `<?xml version="1.0" encoding="UTF-8"?><nfeProc>${'<a>'.repeat(100000)}${'</a>'.repeat(100000)}</nfeProc>`,
);

// Janela oculta: o app chama show/maximize/focus; aqui eles não fazem nada.
app.on('browser-window-created', (_e, w) => {
  for (const m of ['show', 'showInactive', 'maximize', 'focus', 'restore'])
    w[m] = () => undefined;
});

/** Pedidos de rede feitos pela página (o app é offline: deve ficar vazio). */
const rede = [];
/** Avisos de ouvintes demais (MaxListenersExceededWarning) no suite inteiro. */
const avisosOuvintes = [];
process.on('warning', (w) => {
  if (w.name === 'MaxListenersExceededWarning')
    avisosOuvintes.push(String(w.message));
});
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
    if (!/^(app|file|data|devtools|chrome-extension):/.test(d.url))
      rede.push(d.url);
    cb({});
  });
});

// O primeiro arquivo vai pela linha de comando, como num duplo clique.
const primeiro = copia('t06-xml-stylesheet.xml');
process.argv.push(primeiro);
require(MAIN);

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];
let janela = null;

async function avaliar(js) {
  return janela.webContents.executeJavaScript(js, true);
}

async function aguardar(js, prazo = 30000, descricao = js) {
  const limite = Date.now() + prazo;
  while (Date.now() < limite) {
    if (await avaliar(js).catch(() => false)) return;
    await espera(100);
  }
  throw new Error(`não aconteceu em ${prazo} ms: ${descricao}`);
}

const visivel = (id) =>
  `(() => { const e = document.getElementById('${id}'); return !!e && !e.hidden; })()`;

/** Abre um arquivo como num duplo clique com o app aberto. */
function abrir(caminho) {
  app.emit('second-instance', {}, [], RAIZ, { arquivos: [caminho] });
}

/**
 * Abre as Configurações pelo menu do perfil (o único caminho desde que a
 * engrenagem saiu da barra).
 */
async function abrirConfiguracoes() {
  await avaliar(`document.getElementById('btn-perfil').click()`);
  await aguardar(
    `!!document.querySelector('#menu-perfil:not([hidden]) .perfil-rapido__opcao--config')`,
    15000,
    'o menu do perfil não abriu',
  );
  await avaliar(
    `document.querySelector('#menu-perfil .perfil-rapido__opcao--config').click()`,
  );
}

/**
 * Troca a resposta do diálogo de pasta do processo principal por `pasta`
 * enquanto `fn` roda (nenhum diálogo de verdade abre no teste).
 */
async function comPastaEscolhida(pasta, fn) {
  const { dialog } = require('electron');
  const original = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [pasta] });
  try {
    await fn();
  } finally {
    dialog.showOpenDialog = original;
  }
}

/** Volta para a tela inicial (a janela fica vazia para o próximo arquivo). */
async function inicio() {
  await avaliar(`document.getElementById('btn-inicio').click()`);
  await aguardar(visivel('vazio'));
  await espera(300);
}

/**
 * Fecha os diálogos abertos como o Esc (o que não fechar com o Esc, fecha
 * direto). Devolve quantos fechou.
 */
function fecharDialogos() {
  return avaliar(`(() => {
    let n = 0;
    for (const d of document.querySelectorAll('dialog[open]')) {
      d.dispatchEvent(new Event('cancel', { cancelable: true }));
      if (d.open) d.close();
      n++;
    }
    return n;
  })()`).catch(() => 0);
}

/**
 * Espera os avisos de abertura da nota terminarem (o ícone do painel sai de
 * "Conferindo a nota") e fecha os pop-ups que eles abrem (outra empresa, nota
 * já conferida) até passar 600 ms sem diálogo novo. Sem tempo fixo: na
 * máquina lenta, o aviso chega depois.
 */
async function fecharAvisosDaNota() {
  await aguardar(
    `!!document.querySelector('.conferencia__icone-trilho') && !document.querySelector('.conferencia__icone-trilho--carregando')`,
    30000,
    'os avisos de abertura da nota não terminaram',
  );
  let quieto = 0;
  while (quieto < 600) {
    quieto = (await fecharDialogos()) > 0 ? 0 : quieto + 100;
    await espera(100);
  }
}

/**
 * Abre o arquivo (como num duplo clique), espera a tela `tela` e os avisos
 * de abertura. Supõe a janela na tela inicial (estadoLimpo).
 */
async function abrirNota(caminho, tela = 'danfe') {
  abrir(caminho);
  await aguardar(visivel(tela), 30000, `a nota não abriu em ${tela}`);
  await fecharAvisosDaNota();
}

/** Passa para a Conferência pela aba PSXML. */
async function irParaConferencia() {
  await avaliar(`document.getElementById('btn-aba-psxml').click()`);
  await aguardar(visivel('nota'), 30000, 'a Conferência não apareceu');
  await fecharAvisosDaNota();
}

/**
 * Estado de partida de cada caso: só a janela principal, nenhum diálogo,
 * nenhuma mensagem e a tela inicial. Se a volta perguntar sobre anotação não
 * salva, descarta. Uma falha não derruba os casos seguintes.
 */
async function estadoLimpo() {
  const { BrowserWindow } = require('electron');
  for (const w of BrowserWindow.getAllWindows()) if (w !== janela) w.destroy();
  // Leitor de XML (parte 1) fechado e nenhuma leitura no serviço (parte 2).
  await limparLeitorXml(avaliar, espera);
  await fecharDialogos();
  const limite = Date.now() + 30000;
  let ultimoClique = 0;
  while (
    Date.now() < limite &&
    !(await avaliar(visivel('vazio')).catch(() => false))
  ) {
    const descartou = await avaliar(`(() => {
      const b = [...document.querySelectorAll('dialog[open] button')]
        .find((x) => x.textContent.trim() === 'Descartar');
      if (!b) return false;
      b.click();
      return true;
    })()`).catch(() => false);
    // Início de novo a cada segundo (um Salvar em andamento bloqueia o botão).
    if (!descartou && Date.now() - ultimoClique > 1000) {
      await avaliar(
        `!document.querySelector('dialog[open]') && document.getElementById('btn-inicio')?.click(); true`,
      ).catch(() => {});
      ultimoClique = Date.now();
    }
    await espera(200);
  }
  await aguardar(visivel('vazio'), 1000, 'não voltou para a tela inicial');
  await avaliar(
    `document.getElementById('mensagem-fechar')?.click(); true`,
  ).catch(() => {});
  await fecharDialogos();
}

/** Páginas e tamanho da primeira página de um PDF gravado pelo app. */
function paginasDoPdf(arquivo) {
  const s = fs.readFileSync(arquivo, 'latin1');
  const m =
    /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(s);
  return {
    paginas: (s.match(/\/Type\s*\/Page(?!s)/g) || []).length,
    largura: m ? Number(m[3]) - Number(m[1]) : 0,
    altura: m ? Number(m[4]) - Number(m[2]) : 0,
  };
}

// Onde o Salvar PDF grava: a pasta de destino, ou a pasta da sessão (a do
// .psxml aberto por duplo clique).
const pastasDoPdf = [destino, notas];
const pdfsGravados = () =>
  pastasDoPdf.flatMap((d) =>
    fs
      .readdirSync(d)
      .filter((n) => n.toLowerCase().endsWith('.pdf'))
      .map((n) => path.join(d, n)),
  );
const apagarPdfs = () => {
  for (const p of pdfsGravados()) fs.rmSync(p);
};

/**
 * Espera o PDF existir e terminar de ser gravado (o tamanho para de mudar)
 * e o Salvar voltar a ficar livre. Sem tempo fixo; prazo com folga.
 */
async function pdfNoDestino(sufixo, prazo = 60000) {
  const limite = Date.now() + prazo;
  while (Date.now() < limite) {
    const p = pdfsGravados().find((x) => x.endsWith(sufixo));
    if (p) {
      const t1 = fs.statSync(p).size;
      await espera(400);
      const livre = await avaliar(
        `!document.getElementById('btn-salvar').disabled`,
      ).catch(() => false);
      if (t1 > 0 && fs.statSync(p).size === t1 && livre) return p;
    }
    await espera(200);
  }
  const tela = await avaliar(
    `({ mensagem: document.getElementById('mensagem-texto')?.textContent, dialogos: [...document.querySelectorAll('dialog[open]')].map((d) => d.innerText.slice(0, 200)), salvar: document.getElementById('btn-salvar').disabled })`,
  ).catch(() => null);
  throw new Error(
    `o PDF ${sufixo} não foi gravado em ${prazo} ms; gravados: ${pdfsGravados().join(', ')}; tela: ${JSON.stringify(tela)}`,
  );
}

/** Estado da página que nenhum texto de arquivo pode mudar. */
const SONDA = `(() => ({
  scripts: document.querySelectorAll('script').length,
  imgX: document.querySelectorAll('img[src="x"], img[onerror]').length,
  links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
  negrito: document.querySelectorAll('#nota b, #danfe b, #nota i, #danfe i').length,
  alertas: window.__alertas ?? 0,
}))()`;

/**
 * Roda um caso. Antes, o estado limpo (`limpar: false` só para os casos que
 * usam a nota aberta pela linha de comando ao iniciar). Depois de uma falha,
 * volta ao estado limpo, para o caso seguinte não falhar junto.
 */
async function caso(nome, fn, { limpar = true } = {}) {
  const inicioMs = Date.now();
  try {
    if (limpar) await estadoLimpo();
    await fn();
    resultados.push({ nome, ok: true, ms: Date.now() - inicioMs });
    console.log(`ok   ${nome} (${Date.now() - inicioMs} ms)`);
  } catch (erro) {
    resultados.push({ nome, ok: false, erro: String(erro && erro.stack) });
    console.log(`FALHA ${nome}\n  ${String(erro && erro.message)}`);
    await estadoLimpo().catch((e) =>
      console.log(`  (estado limpo falhou: ${String(e && e.message)})`),
    );
  }
}

function confere(cond, msg) {
  if (!cond) throw new Error(msg);
}

/**
 * O XML abre direto no DANFE: confere o DANFE, passa para a Conferência pelo
 * botão da barra e devolve as sondas dos dois.
 */
async function verDanfeEConferencia() {
  await aguardar(visivel('danfe'));
  await fecharAvisosDaNota();
  const danfe = await avaliar(SONDA);
  const textoDanfe = await avaliar(
    `document.getElementById('danfe').innerText`,
  );
  await irParaConferencia();
  const conferencia = await avaliar(SONDA);
  const textoConferencia = await avaliar(
    `document.getElementById('nota').innerText`,
  );
  return { danfe, conferencia, textoDanfe, textoConferencia };
}

/** Nada de script novo, imagem do ataque, link, negrito/itálico vindo do texto, alerta. */
function semInjecao(s, base, onde) {
  confere(s.scripts === base.scripts, `${onde}: script novo na página`);
  confere(s.imgX === 0, `${onde}: imagem do ataque criada`);
  confere(s.links.length === 0, `${onde}: link criado: ${s.links.join(' ')}`);
  confere(s.negrito === 0, `${onde}: <b>/<i> do texto virou elemento`);
  confere(s.alertas === 0, `${onde}: alert chamado`);
}

async function principal() {
  const limite = Date.now() + 30000;
  while (!janela && Date.now() < limite) {
    janela = require('electron').BrowserWindow.getAllWindows()[0] ?? null;
    await espera(100);
  }
  if (!janela) throw new Error('a janela do app não foi criada');
  await aguardar(`document.readyState === 'complete'`, 30000);
  const preparar = `window.__alertas = 0; window.alert = () => { window.__alertas++; }; true`;
  await avaliar(preparar);
  const base = await avaliar(SONDA);

  await caso(
    'app://: a tela vem do protocolo próprio e nada sai da pasta',
    async () => {
      const tela = await avaliar(`(() => {
      const logo = document.querySelector('.titulo-janela__logo');
      return {
        url: location.href,
        scripts: [...document.querySelectorAll('script[src]')].map((s) => s.src),
        estilos: [...document.styleSheets].map((s) => ({
          href: s.href,
          regras: s.cssRules.length,
        })),
        logo: logo ? { src: logo.src, largura: logo.naturalWidth } : null,
      };
    })()`);
      confere(tela.url === 'app://ps/index.html', `página em ${tela.url}`);
      confere(
        tela.scripts.length > 0 &&
          tela.scripts.every((s) => s.startsWith('app://ps/assets/')),
        `scripts: ${tela.scripts.join(' ')}`,
      );
      confere(
        tela.estilos.some(
          (s) =>
            s.href && s.href.startsWith('app://ps/assets/') && s.regras > 0,
        ),
        `estilos: ${JSON.stringify(tela.estilos)}`,
      );
      confere(
        tela.logo &&
          tela.logo.src.startsWith('app://ps/') &&
          tela.logo.largura > 0,
        `logo: ${JSON.stringify(tela.logo)}`,
      );
      // Pedidos de dentro da página: só a tela é servida, com o tipo certo;
      // fuga e pasta dão 404, sem corpo.
      const respostas = await avaliar(`(async () => {
      const pedir = async (u) => {
        try {
          const r = await fetch(u);
          return { u, status: r.status, tipo: r.headers.get('content-type'), corpo: (await r.text()).length };
        } catch (e) {
          return { u, erro: String(e) };
        }
      };
      return Promise.all([
        'app://ps/index.html',
        'app://ps/assets/..%2f..%2fbuild%2fmain.cjs',
        'app://ps/..%5c..%5cbuild%5cmain.cjs',
        'app://ps/C%3A%5CWindows%5Cwin.ini',
        'app://ps/%5C%5Cexemplo.invalid%5Cx.js',
        'app://ps/assets/',
        'app://ps/../../build/main.cjs',
        'app://ps/nao-existe.js',
      ].map(pedir));
    })()`);
      const [pagina, ...fugas] = respostas;
      confere(
        pagina.status === 200 && pagina.tipo === 'text/html; charset=utf-8',
        `index.html: ${JSON.stringify(pagina)}`,
      );
      for (const f of fugas)
        confere(
          f.status === 404 && f.corpo === 0,
          `deveria dar 404: ${JSON.stringify(f)}`,
        );
      confere(rede.length === 0, `pedidos de rede: ${rede.join(' ')}`);
    },
    { limpar: false },
  );

  await caso(
    'T6: xml-stylesheet é ignorado e nada vai para a rede',
    async () => {
      const v = await verDanfeEConferencia();
      confere(
        v.textoConferencia.includes('PARAFUSO INVENTADO T6'),
        'a nota não abriu',
      );
      semInjecao(v.danfe, base, 'DANFE');
      semInjecao(v.conferencia, base, 'Conferência');
      confere(rede.length === 0, `pedidos de rede: ${rede.join(' ')}`);
      await inicio();
    },
    { limpar: false },
  );

  // Parte 2A: a tela "Como deseja abrir a nota?" não existe mais.
  const outra = path.join(notas, 't2a-outra-nota.xml');
  // Nota de várias folhas no DANFE: o item da primeira repetido 60 vezes,
  // com outra chave de acesso.
  const variasFolhas = path.join(notas, 't4-varias-folhas.xml');
  {
    const base = fs
      .readFileSync(primeiro, 'utf8')
      .replaceAll(
        '35261100000000000000550010000000011000000010',
        '35261100000000000000550010000000031000000030',
      );
    const det = /<det nItem="1">[\s\S]*?<\/det>/.exec(base)[0];
    const itens = Array.from({ length: 60 }, (_, i) =>
      det.replace('nItem="1"', `nItem="${i + 1}"`),
    ).join('');
    fs.writeFileSync(variasFolhas, base.replace(det, itens));
  }
  // Outra chave de acesso: a lista de recentes guarda uma entrada por chave.
  fs.writeFileSync(
    outra,
    fs
      .readFileSync(primeiro, 'utf8')
      .replaceAll(
        '35261100000000000000550010000000011000000010',
        '35261100000000000000550010000000021000000020',
      ),
  );

  await caso(
    '2A: o XML abre direto no DANFE, sem a tela de escolha',
    async () => {
      abrir(outra);
      await aguardar(visivel('danfe'));
      confere(
        !(await avaliar(`!!document.getElementById('modo')`)),
        'a tela de escolha ainda existe na página',
      );
      confere(
        !(await avaliar(
          `document.body.innerText.includes('Como deseja abrir')`,
        )),
        'o texto da tela de escolha aparece',
      );
      confere(
        await avaliar(`document.body.dataset.modo === 'danfe'`),
        'não abriu no modo DANFE',
      );
      // Entra nas notas recentes (o próximo caso abre por elas).
      await aguardar(
        `window.psApi.recentes().then((l) => l.some((r) => r.caminho === ${JSON.stringify(outra)}))`,
        15000,
        'a nota não entrou nas recentes',
      );
      await inicio();
    },
  );

  await caso(
    '2A: com uma nota aberta, outro arquivo abre numa janela nova',
    async () => {
      const { BrowserWindow } = require('electron');
      abrir(primeiro);
      await aguardar(visivel('danfe'));
      const antes = new Set(BrowserWindow.getAllWindows());
      // Nota recente clicada: o mesmo caminho do botão Abrir no processo
      // principal (decidirAbertura).
      const r = await avaliar(
        `window.psApi.abrirRecente(${JSON.stringify(outra)})`,
      );
      confere(r.status === 'nova-janela', `resultado: ${JSON.stringify(r)}`);
      let nova = null;
      const limite = Date.now() + 30000;
      while (!nova && Date.now() < limite) {
        nova = BrowserWindow.getAllWindows().find((w) => !antes.has(w)) ?? null;
        await espera(100);
      }
      confere(nova, 'nenhuma janela nova abriu');
      const naNova = (js) => nova.webContents.executeJavaScript(js, true);
      const limiteNova = Date.now() + 30000;
      let danfeNaNova = false;
      while (!danfeNaNova && Date.now() < limiteNova) {
        danfeNaNova = await naNova(visivel('danfe')).catch(() => false);
        await espera(100);
      }
      confere(danfeNaNova, 'a janela nova não abriu no DANFE');
      // A nota desta janela continua aberta, como estava.
      confere(await avaliar(visivel('danfe')), 'a nota desta janela saiu');
      nova.destroy();
      await inicio();
    },
  );

  await caso(
    '2A: nota sem DANFE (contingência) abre na Conferência com o motivo',
    async () => {
      const contingencia = path.join(notas, 't2a-contingencia.xml');
      fs.writeFileSync(
        contingencia,
        fs
          .readFileSync(primeiro, 'utf8')
          .replace('<tpEmis>1</tpEmis>', '<tpEmis>5</tpEmis>'),
      );
      abrir(contingencia);
      await aguardar(visivel('nota'));
      await aguardar(
        `${visivel('mensagem')} && document.getElementById('mensagem-texto').textContent.includes('Mostrando a Conferência')`,
      );
      const msg = await avaliar(
        `document.getElementById('mensagem-texto').textContent`,
      );
      confere(/contingência/.test(msg), `mensagem: ${msg}`);
      await avaliar(
        `document.getElementById('mensagem-fechar')?.click(); true`,
      );
      await inicio();
    },
  );

  // Sem leitura protegida: o XML abre no DANFE e a Conferência fica livre
  // para anotar; "NF-e abre em" por perfil; a marca de baixado da internet
  // não muda nada.
  const clicarNoDialogo = (rotulo) =>
    avaliar(`(() => {
      const b = [...document.querySelectorAll('dialog[open] button')]
        .find((x) => x.textContent.trim() === ${JSON.stringify(rotulo)});
      if (!b) return false;
      b.click();
      return true;
    })()`);
  const psxmlNoDestino = () =>
    fs.readdirSync(destino).filter((n) => n.toLowerCase().endsWith('.psxml'));
  /** Os elementos da leitura protegida que saíram da página. */
  const restosDaLeitura = `['faixa-leitura', 'btn-usar-conferencia', 'faixa-folhas', 'seletor-orientacao-leitura'].filter((id) => document.getElementById(id))`;

  await caso(
    'Sem leitura protegida: XML no DANFE sem faixa; na Conferência anota, edita colunas e grava o .psxml',
    async () => {
      await abrirNota(outra);
      const restos = await avaliar(restosDaLeitura);
      confere(restos.length === 0, `restos da leitura protegida: ${restos}`);
      confere(
        (await avaliar(
          `document.getElementById('btn-salvar-texto').textContent`,
        )) === 'Salvar',
        'o Salvar não diz Salvar',
      );
      await irParaConferencia();
      confere(
        await avaliar(
          `(() => { const c = [...document.querySelectorAll('input.anotacao__campo')]; return c.length > 0 && c.every((x) => !x.readOnly); })()`,
        ),
        'anotações travadas',
      );
      // Editar colunas abre direto, sem aviso.
      await avaliar(`document.getElementById('btn-editar-colunas').click()`);
      await aguardar(
        `!!document.getElementById('painel-colunas-titulo')?.closest('dialog[open]')`,
        15000,
        'o Editar colunas não abriu',
      );
      await avaliar(`(() => {
        const d = document.getElementById('painel-colunas-titulo').closest('dialog[open]');
        d.dispatchEvent(new Event('cancel', { cancelable: true }));
        return true;
      })()`);
      await espera(500);
      await fecharAvisosDaNota();
      // O processo principal grava o .psxml desta janela sem pedir nada.
      const antes = psxmlNoDestino().length;
      const r = await avaliar(`window.psApi.salvar('<x/>', null)`);
      confere(r.status === 'salvo', `resposta: ${JSON.stringify(r)}`);
      confere(psxmlNoDestino().length === antes + 1, 'o .psxml não apareceu');
      await inicio();
    },
  );

  /** "NF-e abre em" do perfil ativo, lido do processo principal. */
  const abrirEmAtivo = () =>
    avaliar(`window.psApi.ferramentasPerfis().then((e) =>
      e.lista.find((p) => p.id === e.ativo).ferramentas.abrirEm)`);
  /** Grava o "NF-e abre em" do perfil ativo, pelo canal das Configurações. */
  const gravarAbrirEm = async (valor) => {
    await avaliar(`window.psApi.ferramentasPerfis().then((e) => {
      const f = e.lista.find((p) => p.id === e.ativo).ferramentas;
      return window.psApi.gravarFerramentasPerfil(e.ativo, { ...f, abrirEm: ${JSON.stringify(valor)} });
    })`);
    confere(
      (await abrirEmAtivo()) === valor,
      `"NF-e abre em" não ficou ${valor}`,
    );
  };

  await caso(
    'A aba Ferramentas das Configurações mostra e grava "NF-e abre em"',
    async () => {
      confere((await abrirEmAtivo()) === 'xml', 'o padrão não é o XML');
      try {
        await abrirConfiguracoes();
        await aguardar(`!!document.getElementById('config-titulo')`);
        await avaliar(`[...document.querySelectorAll('dialog[open] button')]
        .find((b) => b.textContent.trim() === 'Ferramentas').click()`);
        await aguardar(`!!document.getElementById('config-abrir-em-xml')`);
        const textos = await avaliar(`(() => {
          const d = document.querySelector('dialog[open]');
          return {
            titulos: [...d.querySelectorAll('.config__opcao .config__ferramenta-titulo')].map((e) => e.textContent),
            cartao: d.textContent.includes('NF-e abre em'),
            marcado: document.getElementById('config-abrir-em-xml').checked,
          };
        })()`);
        confere(
          textos.titulos.join() === 'XML (DANFE),PSXML',
          `opções: ${textos.titulos.join(', ')}`,
        );
        confere(textos.cartao, 'sem o cartão "NF-e abre em"');
        confere(textos.marcado, 'XML (DANFE) não vem marcado');
        await avaliar(
          `document.getElementById('config-abrir-em-psxml').click()`,
        );
        const limite = Date.now() + 30000;
        while ((await abrirEmAtivo()) !== 'psxml' && Date.now() < limite)
          await espera(200);
        confere(
          (await abrirEmAtivo()) === 'psxml',
          'a opção PSXML não foi gravada',
        );
        await fecharDialogos();
      } finally {
        await gravarAbrirEm('xml');
      }
    },
  );

  await caso(
    'Perfil com "NF-e abre em: PSXML" abre o XML direto na Conferência',
    async () => {
      await gravarAbrirEm('psxml');
      try {
        await abrirNota(outra, 'nota');
        confere(
          await avaliar(
            `[...document.querySelectorAll('input.anotacao__campo')].every((x) => !x.readOnly)`,
          ),
          'as anotações estão travadas',
        );
        await inicio();
      } finally {
        // Volta o perfil ao padrão mesmo se o caso falhar.
        await gravarAbrirEm('xml');
      }
    },
  );

  await caso(
    'Perfil gravado por uma versão anterior: "conferencia" vira PSXML e abre na Conferência',
    async () => {
      // config.json como a versão 1.2.6 deixava: abrirEm "conferencia".
      await gravarAbrirEm('xml');
      const arquivo = path.join(dados, 'config.json');
      const config = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      const ativo = await avaliar(
        `window.psApi.ferramentasPerfis().then((e) => e.ativo)`,
      );
      config.ferramentasPerfis[ativo].abrirEm = 'conferencia';
      fs.writeFileSync(arquivo, JSON.stringify(config, null, 2));
      try {
        confere(
          (await abrirEmAtivo()) === 'psxml',
          `lido como: ${await abrirEmAtivo()}`,
        );
        await abrirNota(outra, 'nota');
        await inicio();
      } finally {
        await gravarAbrirEm('xml');
      }
    },
  );

  await caso(
    '.psxml com a marca de baixado da internet abre na Conferência e grava',
    async () => {
      const baixado = path.join(notas, 't2c-baixado.psxml');
      fs.copyFileSync(path.join(FIXTURES, 't12-anotacao-html.psxml'), baixado);
      // A marca que o Windows e os navegadores gravam (fluxo do NTFS).
      fs.writeFileSync(
        `${baixado}:Zone.Identifier`,
        '[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=https://exemplo.invalid/\r\n',
      );
      abrir(baixado);
      await aguardar(visivel('nota'));
      await fecharAvisosDaNota();
      confere(
        !(await avaliar(
          `${visivel('mensagem')} && /internet/.test(document.getElementById('mensagem-texto').textContent)`,
        )),
        'apareceu aviso de arquivo da internet',
      );
      confere(
        await avaliar(
          `[...document.querySelectorAll('input.anotacao__campo')].every((x) => !x.readOnly)`,
        ),
        'as anotações estão travadas',
      );
      const r = await avaliar(`window.psApi.salvar('<x/>', null)`);
      confere(r.status === 'salvo', `não gravou: ${JSON.stringify(r)}`);
      await inicio();
    },
  );

  // Regra da seleção de texto, as dicas e o PDF do DANFE.
  /** Elementos com title (dica nativa) na página, fora da ferramenta ST. */
  const comTitle = `[...document.querySelectorAll('[title]')].filter((e) => !e.closest('.st')).map((e) => e.id || e.className || e.tagName)`;

  await caso(
    'DANFE: uma folha embaixo da outra na tela e uma folha A4 retrato por página no PDF',
    async () => {
      apagarPdfs();
      await abrirNota(outra);
      const tela = await avaliar(`(() => {
        const d = document.getElementById('danfe');
        return { dir: getComputedStyle(d).flexDirection, folhas: d.querySelectorAll('.folha').length };
      })()`);
      confere(tela.dir === 'column', `DANFE na tela: ${JSON.stringify(tela)}`);
      await avaliar(`document.getElementById('btn-salvar').click()`);
      const pdf = paginasDoPdf(await pdfNoDestino('_DANFE.pdf'));
      confere(
        pdf.paginas === tela.folhas,
        `PDF com ${pdf.paginas} páginas para ${tela.folhas} folhas`,
      );
      confere(pdf.altura > pdf.largura, `PDF do DANFE: ${JSON.stringify(pdf)}`);
      await inicio();
    },
  );

  // Desenho de 13/11: barra de título própria, barra preta só com as ações
  // e o perfil, menus do Salvar e do perfil, Salvando em na tela inicial.
  const textoTitulo = `[...document.querySelectorAll('#titulo-janela-textos > :not(.titulo-janela__sep)')].map((e) => e.textContent)`;

  await caso(
    'Barra de título própria: PS Reader na tela inicial; emitente, número e arquivo na nota',
    async () => {
      const inicial = await avaliar(textoTitulo);
      confere(
        inicial.join('|') === 'PS Reader|Conferência de notas fiscais',
        `tela inicial: ${inicial.join(' | ')}`,
      );
      const barraTitulo = await avaliar(`(() => {
        const t = document.getElementById('titulo-janela');
        const s = getComputedStyle(t);
        return { altura: Math.round(t.getBoundingClientRect().height), arrasta: s.getPropertyValue('app-region') || s.getPropertyValue('-webkit-app-region'), fundo: s.backgroundColor };
      })()`);
      confere(barraTitulo.altura === 36, `altura: ${barraTitulo.altura}`);
      confere(
        barraTitulo.arrasta === 'drag',
        `app-region: ${barraTitulo.arrasta}`,
      );
      confere(
        await avaliar(
          `!document.querySelector('.inicio__titulo, .inicio__subtitulo')`,
        ),
        'o título repetido ficou na tela inicial',
      );
      await abrirNota(outra);
      const nota = await avaliar(textoTitulo);
      confere(
        nota[0] === 'Fornecedor Inventado de Teste' &&
          /^NF-e nº \d+ série \d+$/.test(nota[1]) &&
          nota[2] === path.basename(outra),
        `nota: ${nota.join(' | ')}`,
      );
      const barra = await avaliar(`(() => ({
        documentos: document.querySelectorAll('#barra .pastilha--documento').length,
        engrenagem: !!document.querySelector('#barra .config-engrenagem, #btn-config-barra'),
        pasta: !!document.querySelector('#barra .pasta-rapida'),
        titulo: !!document.querySelector('#barra-fornecedor, #barra-nota'),
        botoes: [...document.querySelectorAll('#barra .barra__acoes > button, #barra .salvar-grupo > button:first-child')].map((b) => b.textContent.trim()),
      }))()`);
      confere(barra.documentos === 0, 'ST e TIPI continuam na barra');
      confere(!barra.engrenagem, 'a engrenagem continua na barra');
      confere(!barra.pasta, 'o Salvando em continua na barra');
      confere(!barra.titulo, 'o título repetido continua na barra');
      confere(
        barra.botoes.join('|') === 'Início|Abrir outro XML|Imprimir|Salvar',
        `botões: ${barra.botoes.join(', ')}`,
      );
      await inicio();
      const deVolta = await avaliar(textoTitulo);
      confere(deVolta[0] === 'PS Reader', `de volta: ${deVolta.join(' | ')}`);
    },
  );

  await caso(
    'Menu do Salvar: Salvar, Salvar PDF, Salvar cópia e Salvando em com a pasta de destino',
    async () => {
      apagarPdfs();
      await abrirNota(outra);
      await avaliar(`document.getElementById('btn-salvar-mais').click()`);
      await aguardar(
        visivel('menu-salvar'),
        15000,
        'o menu do Salvar não abriu',
      );
      const menu = await avaliar(`(() => {
        const m = document.getElementById('menu-salvar');
        return {
          itens: [...m.querySelectorAll('button')].map((b) => b.querySelector('.menu-app__rotulo').textContent.trim()),
          ajuda: document.getElementById('menu-salvar-ajuda').textContent,
          titulo: m.querySelector('.menu-app__titulo').textContent,
          caminho: document.getElementById('menu-pasta-caminho').textContent,
          caminhoSeleciona: getComputedStyle(document.getElementById('menu-pasta-caminho')).userSelect,
          foco: document.activeElement?.id,
        };
      })()`);
      confere(
        menu.itens.join('|') ===
          'Salvar|Salvar PDF|Salvar cópia...|Trocar pasta de destino...|Abrir pasta no Explorer',
        `itens: ${menu.itens.join(', ')}`,
      );
      confere(menu.titulo === 'Salvando em', `título: ${menu.titulo}`);
      const efetiva = (await avaliar(`window.psApi.pastaDestino()`)).caminho;
      confere(
        menu.caminho === efetiva,
        `caminho: ${menu.caminho}, esperado ${efetiva}`,
      );
      confere(menu.caminhoSeleciona === 'text', 'o caminho não seleciona');
      confere(
        menu.ajuda === 'PDF do DANFE na pasta de destino',
        `ajuda no DANFE: ${menu.ajuda}`,
      );
      confere(menu.foco === 'btn-menu-salvar', `foco: ${menu.foco}`);
      // Salvar do menu: o mesmo do botão (no DANFE, o PDF).
      await avaliar(`document.getElementById('btn-menu-salvar').click()`);
      await pdfNoDestino('_DANFE.pdf');
      confere(!(await avaliar(visivel('menu-salvar'))), 'o menu não fechou');
      await irParaConferencia();
      await avaliar(`document.getElementById('btn-salvar-mais').click()`);
      await aguardar(visivel('menu-salvar'));
      const naConferencia = await avaliar(
        `document.getElementById('menu-salvar-ajuda').textContent`,
      );
      confere(
        naConferencia === 'Cópia editada (.psxml) na pasta de destino',
        `ajuda na Conferência: ${naConferencia}`,
      );
      teclaEsc();
      await aguardar(
        `document.getElementById('menu-salvar').hidden`,
        15000,
        'o Esc não fechou o menu',
      );
      await inicio();
    },
  );

  await caso(
    'Menu do perfil: Perfil, a lista com a marca no atual, Gerenciar perfis e Configurações',
    async () => {
      const botao = await avaliar(`(() => {
        const b = document.getElementById('btn-perfil');
        return { texto: b.textContent.replace(/\\s+/g, ' ').trim(), fundo: getComputedStyle(b).backgroundColor, naInicial: !!b.closest('#inicio-perfil') };
      })()`);
      confere(
        botao.naInicial,
        'o botão de perfil não está na barra da tela inicial',
      );
      confere(botao.fundo === 'rgb(255, 255, 255)', `fundo: ${botao.fundo}`);
      await avaliar(`document.getElementById('btn-perfil').click()`);
      await aguardar(
        `!!document.querySelector('#menu-perfil:not([hidden]) .perfil-rapido__opcao--config')`,
        15000,
        'o menu do perfil não abriu',
      );
      const menu = await avaliar(`(() => {
        const m = document.getElementById('menu-perfil');
        const perfis = [...m.querySelectorAll('[role="menuitemradio"]')];
        return {
          titulo: m.querySelector('.menu-app__titulo')?.textContent,
          perfis: perfis.length,
          marcados: perfis.filter((p) => p.getAttribute('aria-checked') === 'true').length,
          marcaNoAtivo: !!m.querySelector('[aria-checked="true"] svg:last-child:not(:first-child)'),
          outros: [...m.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent.trim()),
          nome: document.getElementById('perfil-nome').textContent,
        };
      })()`);
      confere(menu.titulo === 'Perfil', `título: ${menu.titulo}`);
      confere(
        menu.perfis >= 1 && menu.marcados === 1,
        `perfis: ${JSON.stringify(menu)}`,
      );
      confere(menu.marcaNoAtivo, 'sem a marca no perfil atual');
      confere(
        menu.outros.join('|') === 'Gerenciar perfis...|Configurações',
        `itens: ${menu.outros.join(', ')}`,
      );
      await avaliar(
        `document.querySelector('#menu-perfil .perfil-rapido__opcao--config').click()`,
      );
      await aguardar(
        configAberta,
        15000,
        'Configurações não abriu pelo menu do perfil',
      );
      teclaEsc();
      await aguardar(
        `!${configNaPagina}`,
        15000,
        'o Esc não fechou as Configurações',
      );
    },
  );

  await caso(
    'Tela inicial: Salvando em com o caminho completo e Trocar dentro da área de anexar',
    async () => {
      const antes = await avaliar(`(() => {
        const d = document.getElementById('inicio-destino');
        return {
          dentro: !!d.closest('#area-soltar'),
          rotulo: document.getElementById('inicio-destino-rotulo').textContent,
          caminho: document.getElementById('inicio-destino-caminho').textContent,
          botao: document.getElementById('btn-trocar-destino').textContent.trim(),
        };
      })()`);
      confere(antes.dentro, 'o Salvando em não está na área de anexar');
      confere(antes.rotulo === 'Salvando em', `rótulo: ${antes.rotulo}`);
      const efetiva = (await avaliar(`window.psApi.pastaDestino()`)).caminho;
      confere(
        antes.caminho === efetiva,
        `caminho: ${antes.caminho}, esperado ${efetiva}`,
      );
      confere(antes.botao === 'Trocar', `botão: ${antes.botao}`);
      const outraPasta = path.join(tmp, 'destino-2');
      fs.mkdirSync(outraPasta, { recursive: true });
      try {
        await comPastaEscolhida(outraPasta, async () => {
          await avaliar(
            `document.getElementById('btn-trocar-destino').click()`,
          );
          await aguardar(
            `document.getElementById('inicio-destino-caminho').textContent === ${JSON.stringify(outraPasta)}`,
            15000,
            'o Trocar não mudou o caminho',
          );
        });
        confere(
          (await avaliar(
            `document.getElementById('menu-pasta-caminho').textContent`,
          )) === outraPasta,
          'o menu do Salvar não acompanhou a pasta nova',
        );
      } finally {
        await comPastaEscolhida(destino, async () => {
          await avaliar(
            `document.getElementById('btn-trocar-destino').click()`,
          );
          await aguardar(
            `document.getElementById('inicio-destino-caminho').textContent === ${JSON.stringify(destino)}`,
            15000,
            'a pasta de destino não voltou',
          );
        });
      }
    },
  );

  await caso(
    'Cartão da ferramenta ST: pastilhas da Planilha de ST e da TIPI, que abrem os Documentos de referência',
    async () => {
      await abrirNota(outra);
      await irParaConferencia();
      await avaliar(
        `document.querySelector('.conferencia__expandir, [aria-label="Expandir o painel"]')?.click(); true`,
      );
      await aguardar(
        `!!document.querySelector('.conferencia__ferramenta .conferencia__documentos .pastilha')`,
        15000,
        'sem pastilhas no cartão da ferramenta ST',
      );
      const pastilhas = await avaliar(
        `[...document.querySelectorAll('.conferencia__ferramenta .conferencia__documentos .pastilha')].map((p) => ({ texto: p.textContent.trim(), classe: p.className }))`,
      );
      confere(
        pastilhas.map((p) => p.texto).join('|') === 'Planilha de ST|TIPI',
        `pastilhas: ${JSON.stringify(pastilhas)}`,
      );
      confere(
        pastilhas.every((p) => /pastilha--(ok|faltando|aviso)/.test(p.classe)),
        `estado: ${JSON.stringify(pastilhas)}`,
      );
      await avaliar(
        `document.querySelector('.conferencia__documentos .pastilha').click()`,
      );
      await aguardar(
        configAberta,
        15000,
        'a pastilha não abriu os Documentos de referência',
      );
      teclaEsc();
      await aguardar(`!${configNaPagina}`, 15000, 'o Esc não fechou');
      await fecharAvisosDaNota();
      await inicio();
    },
  );

  // Parte 4: abas PSXML e XML, painel Leitura (DANFE, Formato original,
  // .XML, Folhas, Arquivo), .XML dentro da aba, "Ao imprimir e no PDF".
  const leitura = (js) =>
    avaliar(
      `(() => { const p = document.getElementById('painel-leitura'); ${js} })()`,
    );

  await caso(
    'Abas PSXML e XML: o XML abre na aba XML (DANFE); PSXML é a Conferência; miniaturas dos ícones',
    async () => {
      await abrirNota(outra);
      const abas =
        await avaliar(`(() => [...document.querySelectorAll('#barra .aba')].map((b) => ({
        id: b.id, texto: b.textContent.trim(), selecionada: b.getAttribute('aria-selected'),
        icone: b.querySelector('img')?.getAttribute('src') ?? '', carregou: (b.querySelector('img')?.naturalWidth ?? 0) > 0,
      })))()`);
      confere(
        abas.map((a) => `${a.texto}:${a.selecionada}`).join('|') ===
          'PSXML:false|XML:true',
        `abas: ${JSON.stringify(abas)}`,
      );
      confere(
        /icone-psxml.*\.svg$/.test(abas[0].icone) &&
          /icone-xml.*\.svg$/.test(abas[1].icone) &&
          abas.every((a) => a.carregou),
        `ícones: ${JSON.stringify(abas)}`,
      );
      confere(
        await avaliar(visivel('painel-leitura')),
        'sem o painel Leitura na aba XML',
      );
      await irParaConferencia();
      confere(
        (await avaliar(
          `document.getElementById('btn-aba-psxml').getAttribute('aria-selected')`,
        )) === 'true',
        'a aba PSXML não ficou selecionada',
      );
      confere(
        !(await avaliar(visivel('painel-leitura'))),
        'o painel Leitura ficou na Conferência',
      );
      await avaliar(`document.getElementById('btn-aba-xml').click()`);
      await aguardar(visivel('danfe'), 15000, 'a aba XML não voltou ao DANFE');
      await inicio();
    },
  );

  await caso(
    'Painel Leitura: DANFE, Formato original e .XML; Folhas só no DANFE; Arquivo; recolhe e expande',
    async () => {
      await abrirNota(outra);
      const p1 = await leitura(`return {
        modos: [...p.querySelectorAll('[aria-label="Modo de leitura"] button')].map((b) => b.textContent.trim() + ':' + b.getAttribute('aria-pressed')),
        folhas: [...p.querySelectorAll('[aria-label="Folhas"] button')].map((b) => b.textContent.trim()),
        orientacao: p.textContent.includes('Orientação'),
        arquivo: p.querySelector('.leitura__arquivo')?.innerText ?? '',
        titulo: p.querySelector('.conferencia__titulo')?.textContent,
      };`);
      confere(
        p1.modos.join('|') === 'DANFE:true|Formato original:false|.XML:false',
        `modos: ${p1.modos.join(', ')}`,
      );
      confere(
        p1.folhas.join('|') === 'Uma de cada vez|Lado a lado|Ajustar à largura',
        `folhas: ${p1.folhas.join(', ')}`,
      );
      confere(!p1.orientacao, 'a Orientação apareceu no painel Leitura');
      confere(p1.titulo === 'Leitura', `título: ${p1.titulo}`);
      confere(
        p1.arquivo.includes(path.basename(outra)) &&
          /NF-e versão 4\.00/.test(p1.arquivo) &&
          /Emitida em \d\d\/\d\d\/\d{4}/.test(p1.arquivo) &&
          /1 folha/.test(p1.arquivo),
        `arquivo: ${p1.arquivo}`,
      );
      // .XML: o leitor dentro da aba; Folhas somem; Imprimir e Salvar apagados.
      await avaliar(`document.getElementById('btn-modo-xml').click()`);
      await aguardar(
        `(() => { const l = document.querySelector('.leitor-xml'); return !!l && !l.hidden && /nfeProc|<NFe/.test(l.querySelector('.leitor-xml__vista--arvore')?.innerText ?? ''); })()`,
        30000,
        'o .XML não abriu na aba',
      );
      const p2 = await leitura(`return {
        folhas: !!p.querySelector('[aria-label="Folhas"]'),
        xml: document.getElementById('btn-modo-xml').getAttribute('aria-pressed'),
        arvore: document.querySelector('.leitor-xml__vista--arvore').innerText.includes('nfeProc'),
        saida: ['btn-imprimir', 'btn-salvar', 'btn-salvar-mais'].map((id) => document.getElementById(id).disabled),
        danfe: !document.getElementById('danfe').hidden,
      };`);
      confere(!p2.folhas, 'as Folhas ficaram no .XML');
      confere(p2.xml === 'true', '.XML não ficou marcado');
      confere(p2.arvore, 'a árvore do .XML não mostra a NF-e');
      confere(
        p2.saida.every(Boolean),
        `Imprimir e Salvar no .XML: ${p2.saida}`,
      );
      confere(!p2.danfe, 'o DANFE continuou à mostra');
      // Recolhe: a seta para abrir e o ícone do modo atual.
      await avaliar(
        `document.querySelector('#painel-leitura .conferencia__recolher').click()`,
      );
      const rec = await leitura(`return {
        estado: p.dataset.estado,
        botoes: [...p.querySelectorAll('.conferencia__trilho button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
        corpo: !p.querySelector('.conferencia__corpo').hidden,
      };`);
      confere(
        rec.estado === 'recolhido' && !rec.corpo,
        `recolhido: ${JSON.stringify(rec)}`,
      );
      confere(
        rec.botoes.length === 2 && rec.botoes[1] === 'Modo de leitura: .XML',
        `trilho: ${JSON.stringify(rec.botoes)}`,
      );
      await avaliar(
        `document.querySelector('#painel-leitura .conferencia__expandir').click()`,
      );
      confere(
        (await leitura(`return p.dataset.estado;`)) === 'aberto',
        'o painel não abriu de novo',
      );
      await avaliar(`document.getElementById('btn-modo-danfe').click()`);
      await aguardar(visivel('danfe'), 15000, 'o DANFE não voltou');
      confere(
        await avaliar(
          `['btn-imprimir', 'btn-salvar'].every((id) => !document.getElementById(id).disabled)`,
        ),
        'Imprimir e Salvar continuam apagados no DANFE',
      );
      await inicio();
    },
  );

  await caso(
    'Folhas do DANFE: Lado a lado e Ajustar à largura só na tela; zoom à mão volta para Uma',
    async () => {
      apagarPdfs();
      await abrirNota(variasFolhas);
      await avaliar(`document.getElementById('btn-folhas-lado').click()`);
      await espera(300);
      const lado = await avaliar(`(() => {
        const d = document.getElementById('danfe');
        const s = getComputedStyle(d);
        return { dir: s.flexDirection, wrap: s.flexWrap, folhas: d.dataset.folhas, marcado: document.getElementById('btn-folhas-lado').getAttribute('aria-pressed') };
      })()`);
      confere(
        lado.dir === 'row' &&
          lado.wrap === 'wrap' &&
          lado.folhas === 'lado' &&
          lado.marcado === 'true',
        `lado a lado: ${JSON.stringify(lado)}`,
      );
      // O PDF não segue o arranjo da tela: uma folha A4 retrato por página.
      const folhas = await avaliar(
        `document.querySelectorAll('#danfe .folha').length`,
      );
      await avaliar(`document.getElementById('btn-salvar').click()`);
      const pdf = paginasDoPdf(await pdfNoDestino('_DANFE.pdf'));
      confere(
        folhas > 1 && pdf.paginas === folhas,
        `PDF com ${pdf.paginas} páginas para ${folhas} folhas`,
      );
      confere(pdf.altura > pdf.largura, `PDF do DANFE: ${JSON.stringify(pdf)}`);
      await avaliar(`document.getElementById('btn-folhas-largura').click()`);
      await espera(400);
      const aj = await avaliar(`(() => {
        const d = document.getElementById('danfe');
        const f = d.querySelector('.folha').getBoundingClientRect();
        const p = document.getElementById('painel-leitura').getBoundingClientRect();
        return { folha: f.width, area: document.documentElement.clientWidth - p.right, zoom: d.style.zoom };
      })()`);
      confere(
        aj.folha <= aj.area + 1 && aj.folha >= aj.area * 0.8,
        `a folha não ocupa a largura da área: ${JSON.stringify(aj)}`,
      );
      await avaliar(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true })); true`,
      );
      await espera(300);
      confere(
        (await avaliar(
          `document.getElementById('btn-folhas-uma').getAttribute('aria-pressed')`,
        )) === 'true',
        'o zoom à mão não voltou para Uma de cada vez',
      );
      await avaliar(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true })); true`,
      );
      await inicio();
    },
  );

  await caso(
    'Folhas do DANFE: com uma folha só, Lado a lado fica apagado e o clique mostra o motivo',
    async () => {
      // Lado a lado escolhido numa nota de várias folhas...
      await abrirNota(variasFolhas);
      await avaliar(`document.getElementById('btn-folhas-lado').click()`);
      await aguardar(
        `document.getElementById('btn-folhas-lado').getAttribute('aria-pressed') === 'true'`,
        5000,
        'Lado a lado não ficou marcado na nota de várias folhas',
      );
      await inicio();
      // ...e a nota seguinte tem uma folha: a tela volta para Uma.
      await abrirNota(outra);
      const antes = await avaliar(`(() => {
        const b = document.getElementById('btn-folhas-lado');
        return {
          folhas: document.querySelectorAll('#danfe .folha').length,
          apagado: b.getAttribute('aria-disabled'),
          title: b.hasAttribute('title'),
          descrito: b.getAttribute('aria-describedby'),
          uma: document.getElementById('btn-folhas-uma').getAttribute('aria-pressed'),
          arranjo: document.getElementById('danfe').dataset.folhas,
          outros: ['uma', 'largura'].map((a) => document.getElementById('btn-folhas-' + a).getAttribute('aria-disabled')),
        };
      })()`);
      confere(
        antes.folhas === 1 &&
          antes.apagado === 'true' &&
          !antes.title &&
          antes.descrito === null &&
          antes.uma === 'true' &&
          antes.arranjo === 'uma' &&
          antes.outros.every((x) => x === null),
        `nota de uma folha: ${JSON.stringify(antes)}`,
      );
      await avaliar(`document.getElementById('btn-folhas-lado').click()`);
      await aguardar(
        `!!document.querySelector('dialog[open]')`,
        15000,
        'clicar em Lado a lado não abriu o diálogo',
      );
      const d = await avaliar(`(() => {
        const d = document.querySelector('dialog[open]');
        return { titulo: d.querySelector('.caixa-dialogo__titulo')?.textContent, texto: d.innerText, botoes: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()) };
      })()`);
      confere(
        d.titulo === 'Lado a lado indisponível' &&
          d.texto.includes('A nota tem só uma folha.') &&
          d.botoes.join() === 'OK',
        `diálogo: ${JSON.stringify(d)}`,
      );
      await fecharDialogos();
      confere(
        (await avaliar(`document.getElementById('danfe').dataset.folhas`)) ===
          'uma',
        'o clique em Lado a lado apagado mudou o arranjo',
      );
      await inicio();
    },
  );

  await caso(
    'XML que não é NF-e: aba XML no Formato original, PSXML apagada com o motivo, DANFE apagado com o aviso',
    async () => {
      const xml = path.join(notas, 'pedido-abas.xml');
      fs.writeFileSync(
        xml,
        '<?xml version="1.0" encoding="UTF-8"?>\n<pedidoCompra numero="PED-1"><item><codigo>A-1</codigo></item></pedidoCompra>\n',
      );
      abrir(xml);
      await aguardar(
        `document.querySelector('#titulo-janela-textos .titulo-janela__forte')?.textContent === 'pedido-abas.xml'`,
        30000,
        'o XML não abriu na aba XML',
      );
      const g = await avaliar(`(() => ({
        titulo: [...document.querySelectorAll('#titulo-janela-textos > :not(.titulo-janela__sep)')].map((e) => e.textContent),
        psxml: document.getElementById('btn-aba-psxml').getAttribute('aria-disabled'),
        xml: document.getElementById('btn-aba-xml').getAttribute('aria-selected'),
        danfe: document.getElementById('btn-modo-danfe').getAttribute('aria-disabled'),
        aviso: document.getElementById('leitura-aviso-danfe')?.textContent,
        modo: document.getElementById('btn-modo-formato').getAttribute('aria-pressed'),
      }))()`);
      confere(
        g.titulo.join('|') ===
          'pedido-abas.xml|XML que não é NF-e (raiz pedidoCompra)',
        `título: ${g.titulo.join(' | ')}`,
      );
      confere(
        g.psxml === 'true' && g.xml === 'true' && g.modo === 'true',
        `abas: ${JSON.stringify(g)}`,
      );
      confere(
        g.danfe === 'true' &&
          g.aviso === 'XML incompatível com a visualização em DANFE',
        `DANFE: ${JSON.stringify(g)}`,
      );
      await avaliar(`document.getElementById('btn-aba-psxml').click()`);
      await aguardar(
        `!!document.querySelector('dialog[open]')`,
        15000,
        'a aba PSXML apagada não explicou',
      );
      const d = await avaliar(`(() => {
        const d = document.querySelector('dialog[open]');
        return { titulo: d.querySelector('.caixa-dialogo__titulo')?.textContent, botoes: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()) };
      })()`);
      confere(
        d.titulo === 'PSXML indisponível' && d.botoes.join() === 'OK',
        `diálogo: ${JSON.stringify(d)}`,
      );
      await fecharDialogos();
      confere(
        !(await avaliar(visivel('nota'))),
        'a Conferência abriu para um XML que não é nota',
      );
      await inicio();
    },
  );

  await caso(
    '.psxml: a aba XML mostra o XML original guardado na cópia, com o DANFE indisponível',
    async () => {
      const copiaEditada = path.join(notas, 't4-copia-original.psxml');
      fs.copyFileSync(
        path.join(FIXTURES, 't12-anotacao-html.psxml'),
        copiaEditada,
      );
      await abrirNota(copiaEditada, 'nota');
      await avaliar(`document.getElementById('btn-aba-xml').click()`);
      await aguardar(
        `(() => { const f = document.getElementById('formato-original'); return !!f && !f.hidden && f.innerText.includes('Itens'); })()`,
        30000,
        'a aba XML do .psxml não abriu no Formato original',
      );
      await avaliar(`document.getElementById('btn-modo-xml').click()`);
      await aguardar(
        `(() => { const l = document.querySelector('.leitor-xml'); return !!l && !l.hidden && /nfeProc|<NFe/.test(l.querySelector('.leitor-xml__vista--arvore')?.innerText ?? ''); })()`,
        30000,
        'o .XML do .psxml não abriu',
      );
      const v = await avaliar(`(() => ({
        texto: document.querySelector('.leitor-xml__vista--arvore').innerText,
        danfe: document.getElementById('btn-modo-danfe').getAttribute('aria-disabled'),
        aviso: document.getElementById('leitura-aviso-danfe')?.textContent,
      }))()`);
      confere(/nfeProc|<NFe/.test(v.texto), 'o original não aparece');
      confere(
        !v.texto.includes('psCopiaEditada'),
        'apareceu a cópia inteira, e não o original',
      );
      confere(
        v.danfe === 'true' &&
          v.aviso === 'O DANFE só é gerado a partir do XML original da nota.',
        `DANFE: ${JSON.stringify(v)}`,
      );
      await inicio();
    },
  );

  await caso(
    'Arrastar na aba XML (modo .XML) e na PSXML: o arquivo abre numa janela nova',
    async () => {
      const { BrowserWindow } = require('electron');
      const solto = path.join(notas, 'catalogo-solto-abas.xml');
      fs.writeFileSync(
        solto,
        '<?xml version="1.0" encoding="UTF-8"?>\n<catalogo><item>INVENTADO</item></catalogo>\n',
      );
      /** Arrasta `arquivo` para a janela, como do Explorer. */
      const arrastar = async (arquivo) => {
        const wc = janela.webContents;
        wc.debugger.attach('1.3');
        try {
          const dados = { items: [], files: [arquivo], dragOperationsMask: 1 };
          for (const type of ['dragEnter', 'dragOver', 'drop'])
            await wc.debugger.sendCommand('Input.dispatchDragEvent', {
              type,
              x: 700,
              y: 400,
              data: dados,
            });
        } finally {
          wc.debugger.detach();
        }
      };
      /** A janela nova que aparecer depois de `antes`, já fechada. */
      const novaJanela = async (antes) => {
        const limite = Date.now() + 30000;
        while (Date.now() < limite) {
          const nova = BrowserWindow.getAllWindows().find((w) => !antes.has(w));
          if (nova) {
            nova.destroy();
            return true;
          }
          await espera(100);
        }
        return false;
      };
      await abrirNota(outra);
      await avaliar(`document.getElementById('btn-modo-xml').click()`);
      await aguardar(
        `(() => { const l = document.querySelector('.leitor-xml'); return !!l && !l.hidden; })()`,
        15000,
        'o .XML não abriu',
      );
      let antes = new Set(BrowserWindow.getAllWindows());
      await arrastar(solto);
      confere(
        await novaJanela(antes),
        'arrastar no .XML não abriu janela nova',
      );
      await irParaConferencia();
      antes = new Set(BrowserWindow.getAllWindows());
      await arrastar(solto);
      confere(
        await novaJanela(antes),
        'arrastar na PSXML não abriu janela nova',
      );
      confere(await avaliar(visivel('nota')), 'a nota desta janela saiu');
      await inicio();
    },
  );

  await caso(
    'Ao imprimir e no PDF (Conferência): miniatura da folha, e Retrato ou Paisagem vale para o PDF e a impressão, sem gravar no perfil',
    async () => {
      await abrirNota(outra);
      await irParaConferencia();
      await avaliar(
        `document.querySelector('#painel-conferencia .conferencia__expandir')?.click(); true`,
      );
      await aguardar(
        `!!document.getElementById('btn-folha-paisagem')`,
        15000,
        'sem a seção Ao imprimir e no PDF no painel',
      );
      const titulos = await avaliar(
        `[...document.querySelectorAll('#painel-conferencia .conferencia__subtitulo')].map((e) => e.textContent)`,
      );
      confere(
        titulos[titulos.length - 1] === 'Ao imprimir e no PDF',
        `seções: ${titulos.join(', ')}`,
      );
      const perfisAntes = JSON.stringify(
        await avaliar(`window.psApi.perfis()`),
      );
      for (const [id, deitada] of [
        ['btn-folha-paisagem', true],
        ['btn-folha-retrato', false],
      ]) {
        await avaliar(`document.getElementById('${id}').click()`);
        await aguardar(
          `document.getElementById('${id}')?.getAttribute('aria-pressed') === 'true'`,
          5000,
          `${id} não ficou marcado`,
        );
        const mini = await avaliar(`(() => {
          const m = document.getElementById('miniatura-folha-pdf');
          const caixa = m?.getBoundingClientRect();
          const painel = document.querySelector('#painel-conferencia .conferencia__corpo')?.getBoundingClientRect();
          return {
            orientacao: m?.dataset.orientacao,
            legenda: m?.querySelector('.miniatura__legenda')?.textContent,
            colunas: m ? m.querySelectorAll('.miniatura__tabela thead th').length : 0,
            cabe: !!caixa && !!painel && caixa.right <= painel.right + 0.5,
          };
        })()`);
        const nome = deitada ? 'paisagem' : 'retrato';
        confere(
          mini.orientacao === nome &&
            mini.legenda?.includes(`Folha A4 em ${nome}`) &&
            mini.colunas > 0 &&
            mini.cabe,
          `miniatura com ${id}: ${JSON.stringify(mini)}`,
        );
        apagarPdfs();
        await avaliar(`document.getElementById('btn-salvar-mais').click()`);
        await aguardar(visivel('menu-salvar'));
        await avaliar(`document.getElementById('btn-salvar-pdf').click()`);
        const pdf = paginasDoPdf(await pdfNoDestino('_Conferencia.pdf'));
        confere(
          deitada ? pdf.largura > pdf.altura : pdf.altura > pdf.largura,
          `PDF com ${id}: ${JSON.stringify(pdf)}`,
        );
        // Imprimir: o diálogo do Windows não dá para conduzir; o teste fica
        // no lugar dele e gera o PDF da página que iria para a impressora,
        // com as opções que o app pediu (e o aviso de impressora de cupom,
        // se a padrão for uma, respondido com Continuar).
        const { dialog } = require('electron');
        const proto = Object.getPrototypeOf(janela.webContents);
        const printOriginal = proto.print;
        const avisoOriginal = dialog.showMessageBox;
        const arquivo = path.join(tmp, `impressao-${nome}.pdf`);
        let impressao = null;
        dialog.showMessageBox = async () => ({
          response: 0,
          checkboxChecked: false,
        });
        proto.print = function (opcoes, fim) {
          impressao = (async () => {
            const pagina = await this.executeJavaScript(
              `[...document.querySelectorAll('style')].map((s) => s.textContent).filter((t) => t.includes('@page')).join(' ')`,
            );
            fs.writeFileSync(
              arquivo,
              await this.printToPDF({
                landscape: opcoes.landscape === true,
                printBackground: true,
                preferCSSPageSize: true,
              }),
            );
            fim(true, '');
            return {
              landscape: opcoes.landscape === true,
              pagina,
              pdf: paginasDoPdf(arquivo),
            };
          })();
        };
        try {
          await avaliar(`document.getElementById('btn-imprimir').click()`);
          const limite = Date.now() + 30000;
          while (!impressao && Date.now() < limite) await espera(100);
          confere(impressao, `Imprimir com ${id} não chegou à impressão`);
          const r = await impressao;
          await aguardar(
            `!document.getElementById('btn-imprimir').disabled`,
            10000,
            'Imprimir não voltou',
          );
          confere(
            r.landscape === deitada &&
              r.pagina.includes(deitada ? 'landscape' : 'portrait') &&
              (deitada
                ? r.pdf.largura > r.pdf.altura
                : r.pdf.altura > r.pdf.largura),
            `impressão com ${id}: ${JSON.stringify(r)}`,
          );
        } finally {
          proto.print = printOriginal;
          dialog.showMessageBox = avisoOriginal;
        }
      }
      confere(
        JSON.stringify(await avaliar(`window.psApi.perfis()`)) === perfisAntes,
        'a orientação de Ao imprimir e no PDF foi gravada no perfil',
      );
      await fecharAvisosDaNota();
      await inicio();
    },
  );

  // Parte 5: modo Formato original (montado do próprio XML).
  const formatoVisivel = `(() => { const f = document.getElementById('formato-original'); return !!f && !f.hidden && !!f.querySelector('.formato-original__secao'); })()`;

  await caso(
    'Formato original da NF-e: seções com rótulo e tag, valores formatados, códigos, itens com impostos, recolher e busca',
    async () => {
      await abrirNota(outra);
      await avaliar(`document.getElementById('btn-modo-formato').click()`);
      await aguardar(formatoVisivel, 30000, 'o Formato original não abriu');
      const f = await avaliar(`(() => {
        const r = document.getElementById('formato-original');
        const campo = (tag) => [...r.querySelectorAll('.formato-original__campo-par')].find((c) => c.querySelector('.formato-original__tag')?.textContent === tag);
        const dh = campo('dhEmi'), tp = campo('tpNF');
        return {
          secoes: [...r.querySelectorAll('.formato-original__secao > .formato-original__cabecalho .formato-original__titulo')].map((t) => t.textContent),
          dhRotulo: dh?.querySelector('.formato-original__rotulo-texto')?.textContent,
          dhValor: dh?.querySelector('.formato-original__valor')?.firstChild?.textContent,
          tpSentido: tp?.querySelector('.formato-original__sentido')?.textContent,
          itens: r.querySelectorAll('[data-tag="det"] tbody tr.formato-original__linha').length,
          seleciona: { valor: getComputedStyle(dh.querySelector('.formato-original__valor')).userSelect, rotulo: getComputedStyle(dh.querySelector('.formato-original__rotulo-campo')).userSelect },
          saida: ['btn-imprimir', 'btn-salvar'].map((id) => document.getElementById(id).disabled),
          formatoMarcado: document.getElementById('btn-modo-formato').getAttribute('aria-pressed'),
        };
      })()`);
      for (const t of ['Identificação', 'Emitente', 'Itens'])
        confere(
          f.secoes.includes(t),
          `sem a seção ${t}: ${f.secoes.join(', ')}`,
        );
      confere(f.dhRotulo === 'Data e hora de emissão', `rótulo: ${f.dhRotulo}`);
      confere(
        /^\d\d\/\d\d\/\d{4} \d\d:\d\d$/.test(f.dhValor ?? ''),
        `data: ${f.dhValor}`,
      );
      confere(f.tpSentido === 'Saída', `tpNF: ${f.tpSentido}`);
      confere(f.itens >= 1, 'sem as linhas dos itens');
      confere(
        f.seleciona.valor === 'text' && f.seleciona.rotulo === 'none',
        `seleção: ${JSON.stringify(f.seleciona)}`,
      );
      confere(f.saida.every(Boolean), 'Imprimir e Salvar no Formato original');
      confere(
        f.formatoMarcado === 'true',
        'o Formato original não ficou marcado',
      );
      // Detalhe do item: os impostos.
      await avaliar(
        `document.querySelector('#formato-original [data-tag="det"] .formato-original__abrir').click()`,
      );
      confere(
        await avaliar(
          `(() => { const d = document.querySelector('#formato-original [data-tag="det"] tr.formato-original__detalhe'); return !d.hidden && d.innerText.includes('Impostos do item'); })()`,
        ),
        'o detalhe do item não mostrou os impostos',
      );
      // Recolher tudo e Expandir tudo.
      await avaliar(
        `[...document.querySelectorAll('#formato-original button')].find((b) => b.textContent === 'Recolher tudo').click()`,
      );
      confere(
        await avaliar(
          `[...document.querySelectorAll('#formato-original .formato-original__corpo')].every((c) => c.hidden)`,
        ),
        'Recolher tudo deixou seção aberta',
      );
      await avaliar(
        `[...document.querySelectorAll('#formato-original button')].find((b) => b.textContent === 'Expandir tudo').click()`,
      );
      confere(
        await avaliar(
          `[...document.querySelectorAll('#formato-original .formato-original__corpo')].every((c) => !c.hidden)`,
        ),
        'Expandir tudo deixou seção fechada',
      );
      // Busca: acha, conta e abre o que estiver recolhido.
      await avaliar(
        `[...document.querySelectorAll('#formato-original button')].find((b) => b.textContent === 'Recolher tudo').click()`,
      );
      await avaliar(
        `(() => { const c = document.getElementById('formato-busca'); c.value = 'Venda de teste'; c.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
      );
      await aguardar(
        `/^1 de \\d+$/.test(document.querySelector('.formato-original__contador').textContent)`,
        5000,
        'a busca não achou',
      );
      confere(
        await avaliar(
          `(() => { const a = document.querySelector('.formato-original__achado--atual'); return !!a && !a.closest('.formato-original__corpo[hidden]'); })()`,
        ),
        'o achado ficou dentro de uma seção recolhida',
      );
      confere(rede.length === 0, `pedidos de rede: ${rede.join(' ')}`);
      await inicio();
    },
  );

  await caso(
    'Formato original de um XML que não é nota: tags como título, atributos e repetidos em tabela',
    async () => {
      const xml = path.join(notas, 'pedido-formato.xml');
      fs.writeFileSync(
        xml,
        '<?xml version="1.0" encoding="UTF-8"?>\n<pedidoCompra numero="PED-7781"><cabecalho><emissao>2026-11-05</emissao></cabecalho><itens><item linha="1"><codigo>A-1</codigo><quantidade>20</quantidade><precoUnitario>18.5</precoUnitario></item><item linha="2"><codigo>A-2</codigo><quantidade>10</quantidade><precoUnitario>6.20</precoUnitario></item></itens></pedidoCompra>\n',
      );
      abrir(xml);
      await aguardar(formatoVisivel, 30000, 'o Formato original não abriu');
      const f = await avaliar(`(() => {
        const r = document.getElementById('formato-original');
        const tabela = r.querySelector('[data-tag="itens"] table');
        return {
          raiz: r.querySelector('.formato-original__titulo--tag')?.textContent,
          atributo: r.querySelector('.formato-original__atributo')?.textContent,
          emissao: [...r.querySelectorAll('.formato-original__campo-par')].find((c) => c.querySelector('.formato-original__tag')?.textContent === 'emissao')?.querySelector('.formato-original__valor')?.textContent,
          cabecalhos: tabela ? [...tabela.querySelectorAll('th .formato-original__tag')].map((t) => t.textContent) : [],
          linha: tabela ? [...tabela.querySelectorAll('tbody tr')][0]?.innerText.split('\t').map((x) => x.trim()) : [],
        };
      })()`);
      confere(f.raiz === 'pedidoCompra', `raiz: ${f.raiz}`);
      confere(f.atributo === 'numero = PED-7781', `atributo: ${f.atributo}`);
      confere(f.emissao === '05/11/2026', `emissão: ${f.emissao}`);
      confere(
        f.cabecalhos.join('|') === '@linha|codigo|quantidade|precoUnitario',
        `cabeçalhos: ${f.cabecalhos.join(', ')}`,
      );
      confere(
        f.linha.join('|') === '1|A-1|20|18,50',
        `linha: ${f.linha.join(' | ')}`,
      );
      await inicio();
    },
  );

  await caso(
    'Busca do Formato original acha nas linhas além das 300 mostradas e desenha até o achado',
    async () => {
      const xml = path.join(notas, 'pedido-longo-formato.xml');
      const linhas = [];
      for (let i = 1; i <= 1000; i++)
        linhas.push(
          `<item linha="${i}"><codigo>${i === 420 ? 'ALVO-INVENTADO' : `A-${i}`}</codigo><quantidade>${i}</quantidade></item>`,
        );
      fs.writeFileSync(
        xml,
        `<?xml version="1.0" encoding="UTF-8"?>\n<pedidoCompra><itens>${linhas.join('')}</itens></pedidoCompra>\n`,
      );
      abrir(xml);
      await aguardar(formatoVisivel, 30000, 'o Formato original não abriu');
      const antes = await avaliar(
        `document.querySelectorAll('#formato-original .formato-original__rolagem-tabela tbody tr').length`,
      );
      confere(antes === 300, `linhas desenhadas antes da busca: ${antes}`);
      await avaliar(`(() => {
        const c = document.getElementById('formato-busca');
        c.value = 'alvo-inventado';
        c.dispatchEvent(new Event('input'));
        return true;
      })()`);
      await aguardar(
        `/de/.test(document.querySelector('.formato-original__contador').textContent)`,
        5000,
        'a busca não respondeu',
      );
      const r = await avaliar(`(() => {
        const t = document.querySelector('#formato-original .formato-original__rolagem-tabela');
        const atual = document.querySelector('.formato-original__achado--atual');
        const caixa = atual?.getBoundingClientRect();
        const area = document.getElementById('formato-original').getBoundingClientRect();
        return {
          contador: document.querySelector('.formato-original__contador').textContent,
          achado: atual?.textContent,
          linhaDoAchado: atual?.closest('tr')?.firstElementChild?.textContent,
          desenhadas: t.querySelectorAll('tbody tr').length,
          mais: t.querySelector('.formato-original__mais')?.hidden === false,
          visivel: !!caixa && caixa.top >= area.top && caixa.bottom <= area.bottom,
        };
      })()`);
      confere(r.contador === '1 de 1', `contador: ${r.contador}`);
      confere(r.achado === 'ALVO-INVENTADO', `achado: ${r.achado}`);
      confere(r.linhaDoAchado === '420', `linha do achado: ${r.linhaDoAchado}`);
      confere(
        r.desenhadas >= 420 && r.desenhadas < 1000 && r.mais,
        `linhas desenhadas: ${r.desenhadas}, Mostrar mais: ${r.mais}`,
      );
      confere(r.visivel, 'o achado não ficou à vista');
      await inicio();
    },
  );

  await caso(
    'Formato original acima do limite do modo leve: aviso e Ver no .XML',
    async () => {
      const grande = path.join(notas, 'lote-grande-formato.xml');
      const pedaco =
        '<item><codigo>ITEM-INVENTADO</codigo><descricao>PECA INVENTADA PARA O TESTE DE TAMANHO</descricao></item>\n';
      const vezes = Math.ceil((21 * 1024 * 1024) / pedaco.length);
      fs.writeFileSync(
        grande,
        `<?xml version="1.0" encoding="UTF-8"?>\n<lote>\n${pedaco.repeat(vezes)}</lote>\n`,
      );
      try {
        abrir(grande);
        await aguardar(
          `!!document.getElementById('btn-formato-ver-xml')`,
          120000,
          'o Formato original não avisou o arquivo grande',
        );
        const aviso = await avaliar(
          `document.querySelector('.formato-original__estado').innerText`,
        );
        confere(
          /Arquivo grande/.test(aviso) && /\.XML/.test(aviso),
          `aviso: ${aviso}`,
        );
        await avaliar(`document.getElementById('btn-formato-ver-xml').click()`);
        await aguardar(
          `(() => { const l = document.querySelector('.leitor-xml'); return !!l && !l.hidden; })()`,
          15000,
          'o Ver no .XML não mudou de modo',
        );
        confere(
          (await avaliar(
            `document.getElementById('btn-modo-xml').getAttribute('aria-pressed')`,
          )) === 'true',
          '.XML não ficou marcado',
        );
        await inicio();
      } finally {
        fs.rmSync(grande, { force: true });
      }
    },
  );

  await caso(
    'Ícones dos arquivos no pacote: icone-xml.ico e icone-psxml.ico em resources, iguais aos de assets',
    async () => {
      const saida = path.join(RAIZ, 'out');
      const pacotes = fs.existsSync(saida)
        ? fs
            .readdirSync(saida)
            .map((d) => path.join(saida, d, 'resources'))
            .filter((d) => fs.existsSync(d))
        : [];
      confere(pacotes.length > 0, `sem o pacote em ${saida}`);
      for (const nome of ['icone-xml.ico', 'icone-psxml.ico']) {
        const noPacote = path.join(pacotes[0], nome);
        confere(fs.existsSync(noPacote), `${nome} não está no pacote`);
        confere(
          fs
            .readFileSync(noPacote)
            .equals(fs.readFileSync(path.join(RAIZ, 'assets', nome))),
          `${nome} do pacote difere do de assets`,
        );
      }
    },
  );

  // Borda direita: nada passa da largura visível (sem contar o que rola
  // dentro de uma área própria, como a tabela de itens), em 1366 e 1920 e na
  // área de um 1366 a 125% (1093 px), na tela inicial, no DANFE, na
  // Conferência, no Formato original e no .XML. A página não reserva o
  // corredor da barra de rolagem (a barra é só o polegar, por cima).
  const FORA_DA_LARGURA = `(() => {
    const d = document.documentElement;
    const largura = d.clientWidth + 0.5;
    const cortado = (e) => {
      for (let p = e.parentElement; p && p !== d; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== 'visible' && p.getBoundingClientRect().right <= largura) return true;
      }
      return false;
    };
    const fora = [...document.querySelectorAll('body *')].filter((e) => {
      if (!e.getClientRects().length || e.closest('[hidden], dialog:not([open])')) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > largura && !cortado(e);
    }).slice(0, 5).map((e) => (e.id || String(e.className) || e.tagName).slice(0, 40) + ':' + Math.round(e.getBoundingClientRect().right));
    return { fora, rolaDeLado: d.scrollWidth > d.clientWidth, largura: d.clientWidth, corredor: innerWidth - d.clientWidth };
  })()`;

  await caso(
    'Borda direita: nenhum elemento passa da largura visível (1366, 1920 e 1366 a 125%)',
    async () => {
      const [largura, altura] = janela.getContentSize();
      try {
        for (const [w, h] of [
          [1366, 728],
          [1093, 614],
          [1920, 1040],
        ]) {
          janela.setContentSize(w, h);
          await avaliar(DOIS_QUADROS);
          const conferir = async (tela) => {
            await espera(300);
            await avaliar(DOIS_QUADROS);
            const m = await avaliar(FORA_DA_LARGURA);
            confere(
              m.fora.length === 0 && !m.rolaDeLado && m.corredor === 0,
              `${w}px, ${tela}: ${JSON.stringify(m)}`,
            );
          };
          await conferir('tela inicial');
          await abrirNota(outra);
          await conferir('DANFE');
          await irParaConferencia();
          await conferir('Conferência');
          await avaliar(`document.getElementById('btn-aba-xml').click()`);
          await avaliar(`document.getElementById('btn-modo-formato').click()`);
          await aguardar(
            `(() => { const f = document.getElementById('formato-original'); return !!f && !f.hidden && !!f.querySelector('.formato-original__secao'); })()`,
            30000,
            'o Formato original não abriu',
          );
          await conferir('Formato original');
          await avaliar(`document.getElementById('btn-modo-xml').click()`);
          await conferir('.XML');
          await avaliar(`document.getElementById('btn-modo-danfe').click()`);
          await inicio();
        }
        // Janela estreita: o painel Leitura abre por cima do DANFE e começa
        // recolhido; na larga, fica ao lado.
        janela.setContentSize(1093, 614);
        await abrirNota(outra);
        const estreita = await avaliar(
          `(() => { const p = document.getElementById('painel-leitura'); return p.dataset.layout + '/' + p.dataset.estado; })()`,
        );
        confere(
          estreita === 'sobre/recolhido',
          `painel Leitura na janela estreita: ${estreita}`,
        );
        await inicio();
        janela.setContentSize(1920, 1040);
        await abrirNota(outra);
        const larga = await avaliar(
          `(() => { const p = document.getElementById('painel-leitura'); return p.dataset.layout + '/' + p.dataset.estado; })()`,
        );
        confere(
          larga === 'lado/aberto',
          `painel Leitura na janela larga: ${larga}`,
        );
        await inicio();
      } finally {
        janela.setContentSize(largura, altura);
      }
    },
  );

  await caso(
    'Abas PSXML e XML: a ativa inclinada não corta nem cobre a barra (1366 e 1920), entrada uma vez, teclado e sem movimento com animações desligadas',
    async () => {
      const MEDIR_ABAS = `(() => {
        const r = (e) => e.getBoundingClientRect();
        const barra = r(document.getElementById('barra'));
        const titulo = r(document.getElementById('titulo-janela'));
        const acoes = [...document.querySelectorAll('.barra__acoes > *')].filter((e) => e.getClientRects().length).map(r);
        const abas = [...document.querySelectorAll('.aba')].map((a) => {
          const c = r(a), i = r(a.querySelector('.aba__icone'));
          const cruza = (b) => !(c.right <= b.left || b.right <= c.left || c.bottom <= b.top || b.bottom <= c.top);
          return {
            id: a.id,
            ativa: a.getAttribute('aria-selected'),
            esquerda: Math.round(c.left), topo: Math.round(Math.min(c.top, i.top)), baixo: Math.round(c.bottom),
            sobreAcoes: acoes.some(cruza),
            icone: getComputedStyle(a.querySelector('.aba__icone')).width,
            altura: getComputedStyle(a).height,
          };
        });
        return { abas, barra: { topo: barra.top, baixo: barra.bottom }, tituloBaixo: titulo.bottom, cortada: getComputedStyle(document.getElementById('barra')).overflow };
      })()`;
      const [largura, altura] = janela.getContentSize();
      try {
        for (const [w, h] of [
          [1366, 728],
          [1920, 1040],
        ]) {
          janela.setContentSize(w, h);
          await abrirNota(outra);
          for (const id of ['btn-aba-xml', 'btn-aba-psxml']) {
            if (id === 'btn-aba-psxml') await irParaConferencia();
            await espera(900);
            const m = await avaliar(MEDIR_ABAS);
            for (const a of m.abas)
              confere(
                a.icone === '36px' &&
                  a.altura === '48px' &&
                  a.esquerda >= 0 &&
                  a.topo >= m.tituloBaixo &&
                  a.baixo <= m.barra.baixo + 0.5 &&
                  !a.sobreAcoes &&
                  m.cortada === 'visible',
                `${w}px, ${id}: ${JSON.stringify(m)}`,
              );
            const ativa = await avaliar(
              `(() => { const a = document.querySelector('.aba[aria-selected="true"]'); return { id: a?.id, transformada: getComputedStyle(a).transform !== 'none', entrando: a.classList.contains('aba--entrando') }; })()`,
            );
            confere(
              ativa.id === id && ativa.transformada && !ativa.entrando,
              `aba ativa ${w}px: ${JSON.stringify(ativa)}`,
            );
          }
          await fecharAvisosDaNota();
          await inicio();
        }
        // A troca toca a entrada (popA) uma vez.
        await abrirNota(outra);
        await avaliar(`document.getElementById('btn-aba-psxml').click()`);
        const entrada = await avaliar(
          `(() => { const a = document.getElementById('btn-aba-psxml'); return { classe: a.classList.contains('aba--entrando'), animacao: getComputedStyle(a).animationName }; })()`,
        );
        confere(
          entrada.classe && entrada.animacao === 'popA',
          `entrada: ${JSON.stringify(entrada)}`,
        );
        await espera(900);
        await fecharAvisosDaNota();
        // Teclado: Tab chega na aba XML, com o foco visível, e Enter troca.
        await avaliar(`document.getElementById('btn-aba-psxml').focus(); true`);
        janela.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
        janela.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
        await espera(200);
        const foco = await avaliar(
          `(() => { const a = document.activeElement; return { id: a?.id, visivel: a?.matches(':focus-visible'), contorno: getComputedStyle(a).outlineStyle }; })()`,
        );
        confere(
          foco.id === 'btn-aba-xml' && foco.visivel && foco.contorno !== 'none',
          `foco: ${JSON.stringify(foco)}`,
        );
        janela.webContents.sendInputEvent({
          type: 'keyDown',
          keyCode: 'Enter',
        });
        janela.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
        janela.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
        await aguardar(
          `document.getElementById('btn-aba-xml').getAttribute('aria-selected') === 'true'`,
          5000,
          'Enter na aba XML não trocou de aba',
        );
        // Animações desligadas (prefers-reduced-motion): sem movimento.
        const wc = janela.webContents;
        wc.debugger.attach('1.3');
        try {
          await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
          });
          await avaliar(`document.getElementById('btn-aba-psxml').click()`);
          const parada = await avaliar(
            `(() => { const a = document.getElementById('btn-aba-psxml'); const s = getComputedStyle(a), i = getComputedStyle(a.querySelector('.aba__icone')); return { animacao: s.animationName, transicao: s.transitionDuration, icone: i.transitionDuration, ativa: a.getAttribute('aria-selected') }; })()`,
          );
          confere(
            parada.animacao === 'none' &&
              /^0s(, 0s)*$/.test(parada.transicao) &&
              /^0s(, 0s)*$/.test(parada.icone) &&
              parada.ativa === 'true',
            `animações desligadas: ${JSON.stringify(parada)}`,
          );
          await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
            features: [],
          });
        } finally {
          wc.debugger.detach();
        }
        await fecharAvisosDaNota();
        await inicio();
      } finally {
        janela.setContentSize(largura, altura);
      }
    },
  );

  await caso(
    'Sem dica nativa (title) fora da ferramenta ST; seleção só nos dados',
    async () => {
      const semDica = async (onde) => {
        const lista = await avaliar(comTitle);
        confere(lista.length === 0, `title em ${onde}: ${lista}`);
      };
      await semDica('a tela inicial');
      await abrirNota(outra);
      await semDica('o DANFE');
      await irParaConferencia();
      await semDica('a Conferência');
      const selecao = await avaliar(`(() => {
        const us = (css) => {
          const e = document.querySelector(css);
          return e ? getComputedStyle(e).userSelect : 'sem ' + css;
        };
        return {
          interface: {
            salvar: us('#btn-salvar'),
            modo: us('#btn-modo-danfe'),
            cabecalho: us('#nota th'),
          },
          dados: {
            celula: us('#nota td'),
            danfe: us('#danfe .folha'),
          },
        };
      })()`);
      for (const [k, v] of Object.entries(selecao.interface))
        confere(v === 'none', `interface selecionável (${k}): ${v}`);
      for (const [k, v] of Object.entries(selecao.dados))
        confere(
          v !== 'none' && !v.startsWith('sem '),
          `dado sem seleção (${k}): ${v}`,
        );
      await inicio();
      // Configurações, aba por aba.
      await abrirConfiguracoes();
      await aguardar(`!!document.getElementById('config-titulo')`);
      const abas = await avaliar(
        `[...document.querySelectorAll('dialog[open] .config__aba')].map((b) => b.textContent.trim())`,
      );
      confere(abas.length > 0, 'as Configurações não têm abas');
      for (const aba of abas) {
        await avaliar(`[...document.querySelectorAll('dialog[open] .config__aba')]
          .find((b) => b.textContent.trim() === ${JSON.stringify(aba)}).click()`);
        await espera(400);
        await semDica(`Configurações, aba ${aba}`);
      }
      await fecharDialogos();
    },
  );

  await caso(
    'DANFE com .psxml aberto mostra o diálogo do app, só com OK, e não há caixa preta',
    async () => {
      const copiaEditada = path.join(notas, 't2d-copia-editada.psxml');
      fs.copyFileSync(
        path.join(FIXTURES, 't12-anotacao-html.psxml'),
        copiaEditada,
      );
      await abrirNota(copiaEditada, 'nota');
      const antes = await avaliar(`(() => {
        const b = document.getElementById('btn-modo-danfe');
        return {
          caixa: !!document.getElementById('dica-danfe') || !!document.querySelector('.dica, [role="tooltip"]'),
          indisponivel: b.getAttribute('aria-disabled'),
          descrito: b.getAttribute('aria-describedby'),
        };
      })()`);
      confere(!antes.caixa, 'a caixa preta do DANFE continua na página');
      confere(antes.indisponivel === 'true', 'o DANFE não está indisponível');
      confere(antes.descrito === null, `aria-describedby: ${antes.descrito}`);
      await avaliar(`document.getElementById('btn-modo-danfe').click()`);
      await aguardar(
        `!!document.querySelector('dialog[open]')`,
        15000,
        'clicar no DANFE não abriu o diálogo',
      );
      const d = await avaliar(`(() => {
        const d = document.querySelector('dialog[open]');
        return {
          titulo: d.querySelector('.caixa-dialogo__titulo')?.textContent,
          texto: d.querySelector('.caixa-dialogo__texto')?.textContent,
          botoes: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()),
          foco: document.activeElement?.textContent?.trim(),
        };
      })()`);
      confere(d.titulo === 'DANFE indisponível', `título: ${d.titulo}`);
      confere(
        d.texto === 'O DANFE só é gerado a partir do XML original da nota.',
        `texto: ${d.texto}`,
      );
      confere(
        d.botoes.length === 1 && d.botoes[0] === 'OK',
        `botões: ${d.botoes.join(', ')}`,
      );
      confere(d.foco === 'OK', `foco em: ${d.foco}`);
      const semTitulo = await avaliar(comTitle);
      confere(semTitulo.length === 0, `title com o diálogo: ${semTitulo}`);
      confere(await clicarNoDialogo('OK'), 'sem OK');
      await aguardar(
        `!document.querySelector('dialog[open]')`,
        15000,
        'o diálogo não fechou',
      );
      confere(
        (await avaliar(visivel('nota'))) && !(await avaliar(visivel('danfe'))),
        'saiu da Conferência',
      );
      await inicio();
    },
  );

  await caso('T8: 100 mil níveis de aninhamento (DOMParser)', async () => {
    // Com raiz de NF-e: fluxo da nota, recusado sem travar.
    let t0 = Date.now();
    abrir(profundoNfe);
    await aguardar(
      `${visivel('mensagem')} && document.getElementById('mensagem-texto').textContent.length > 0`,
      30000,
    );
    const msg = await avaliar(
      `document.getElementById('mensagem-texto').textContent`,
    );
    confere(Date.now() - t0 < 5000, `demorou ${Date.now() - t0} ms`);
    confere(await avaliar(visivel('vazio')), `saiu da tela inicial: ${msg}`);
    await avaliar(`document.getElementById('mensagem-fechar')?.click(); true`);
    // Raiz qualquer: o leitor genérico (parte 3) abre sem travar, com a
    // Árvore desligada pela profundidade e o texto completo.
    t0 = Date.now();
    abrir(profundo);
    await aguardar(
      `(() => { const f = document.getElementById('formato-original'); if (f && !f.hidden) document.getElementById('btn-modo-xml')?.click(); return (document.querySelector('.leitor-xml__avisos')?.innerText ?? '').includes('mais de 1.000 níveis'); })()`,
      30000,
      'o leitor não avisou a profundidade',
    );
    confere(Date.now() - t0 < 5000, `leitor demorou ${Date.now() - t0} ms`);
    await avaliar(`document.getElementById('btn-inicio').click(); true`);
  });

  await caso('T9: HTML e javascript: em xProd ficam literais', async () => {
    abrir(copia('t09-xprod-html.xml'));
    await avaliar(preparar);
    const v = await verDanfeEConferencia();
    semInjecao(v.danfe, base, 'DANFE');
    semInjecao(v.conferencia, base, 'Conferência');
    for (const literal of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      'javascript:alert(1)',
    ]) {
      confere(
        v.textoConferencia.includes(literal),
        `Conferência sem: ${literal}`,
      );
      confere(v.textoDanfe.includes(literal), `DANFE sem: ${literal}`);
    }
    // Elemento <script> de verdade dentro de xProd: só o texto dele aparece.
    confere(v.textoConferencia.includes('PARAFUSOalert(1)'), 'item T9D');
    confere(rede.length === 0, `pedidos de rede: ${rede.join(' ')}`);
    await inicio();
  });

  await caso(
    'T10a: caractere de controle proibido é recusado sem travar',
    async () => {
      abrir(copia('t10-controle-invalido.xml'));
      await aguardar(
        `${visivel('mensagem')} && document.getElementById('mensagem-texto').textContent.length > 0`,
        30000,
      );
      const msg = await avaliar(
        `document.getElementById('mensagem-texto').textContent`,
      );
      confere(msg === 'Este arquivo não é uma NF-e.', `mensagem: ${msg}`);
      await avaliar(
        `document.getElementById('mensagem-fechar')?.click(); true`,
      );
    },
  );

  await caso('T10b: inversão de direção fica isolada na célula', async () => {
    abrir(copia('t10-bidi.xml'));
    const v = await verDanfeEConferencia();
    confere(v.textoConferencia.includes('‮abc FIM'), 'texto U+202E');
    confere(v.textoConferencia.includes('PORCA​INVISIVEL'), 'texto U+200B');
    // A célula que tem o U+202E isola a direção: não inverte a linha vizinha.
    const isolada = await avaliar(`(() => {
      const celulas = [...document.querySelectorAll('#nota td, #danfe td, #nota th')]
        .filter((c) => c.textContent.includes('\\u202E'));
      return celulas.length > 0 && celulas.every((c) => {
        const u = getComputedStyle(c).unicodeBidi;
        return u === 'isolate' || u === 'isolate-override' || u === 'plaintext';
      });
    })()`);
    confere(isolada, 'célula com U+202E sem unicode-bidi: isolate');
    await inicio();
  });

  await caso('T11: HTML em infCpl e obsCont fica literal', async () => {
    abrir(copia('t11-infcpl-html.xml'));
    await avaliar(preparar);
    const v = await verDanfeEConferencia();
    semInjecao(v.danfe, base, 'DANFE');
    semInjecao(v.conferencia, base, 'Conferência');
    confere(
      v.textoDanfe.includes('<script>alert(1)</script>'),
      'infCpl literal no DANFE',
    );
    confere(
      v.textoDanfe.includes('<img src=x onerror=alert(1)>'),
      'CDATA literal no DANFE',
    );
    confere(rede.length === 0, `pedidos de rede: ${rede.join(' ')}`);
    await inicio();
  });

  await caso(
    'T12: .psxml com anotação em HTML; salvar de novo mantém o texto',
    async () => {
      abrir(copia('t12-anotacao-html.psxml'));
      await avaliar(preparar);
      await aguardar(visivel('nota'));
      await fecharAvisosDaNota();
      const s = await avaliar(SONDA);
      semInjecao(s, base, 'Conferência do .psxml');
      const valores = await avaliar(
        `[...document.querySelectorAll('#nota textarea, #nota input')].map((c) => c.value)`,
      );
      const literal = '<img src=x onerror=alert(1)> javascript:alert(1)';
      confere(
        valores.includes(literal),
        `anotação: ${JSON.stringify(valores)}`,
      );
      const texto = await avaliar(`document.getElementById('nota').innerText`);
      confere(
        !texto.includes('não deve aparecer'),
        'coluna com id estranho apareceu',
      );
      // .psxml é a cópia de trabalho: abre com as anotações livres.
      confere(
        await avaliar(
          `[...document.querySelectorAll('input.anotacao__campo')].every((c) => !c.readOnly)`,
        ),
        'as anotações do .psxml estão travadas',
      );
      // .psxml aberto por duplo clique: a pasta dele é a pasta de destino desta
      // janela, e Salvar regrava a própria cópia (a temporária, nunca o fixture).
      const aberto = path.join(notas, 't12-anotacao-html.psxml');
      const antes = fs.readFileSync(aberto, 'utf8');
      await avaliar(`document.getElementById('btn-salvar').click()`);
      const limiteSalvar = Date.now() + 60000;
      let gravado = antes;
      while (gravado === antes && Date.now() < limiteSalvar) {
        await espera(200);
        gravado = fs.readFileSync(aberto, 'utf8');
      }
      // Terminou de gravar: o texto para de mudar.
      for (
        let anterior = '';
        anterior !== gravado && Date.now() < limiteSalvar;
      ) {
        anterior = gravado;
        await espera(300);
        gravado = fs.readFileSync(aberto, 'utf8');
      }
      confere(gravado !== antes, 'o .psxml não foi salvo');
      confere(
        gravado.includes(
          '&lt;img src=x onerror=alert(1)&gt; javascript:alert(1)',
        ),
        'a anotação não saiu escapada igual',
      );
      confere(
        !/<img/i.test(gravado),
        'apareceu <img> de verdade no arquivo salvo',
      );
      confere(!/<!DOCTYPE/i.test(gravado), 'DOCTYPE no arquivo salvo');
    },
  );

  // Tela do leitor genérico de XML (parte 1), aberta como num duplo clique,
  // lendo pelo serviço de leitura pesada (parte 2, filho em
  // servicoPesado.cjs), e o leitor na navegação (parte 3).
  const contexto = {
    app,
    notas,
    caso,
    avaliar,
    aguardar,
    confere,
    espera,
    rede,
    sonda: SONDA,
    abrir,
    janela: () => janela,
    primeiro,
    visivel,
    abrirNota,
    inicio,
  };
  await casosLeitorXml(contexto);
  await casosNavegacao(contexto);
  await casosServico(contexto);

  // Janelas por cima da nota (Configurações, ferramenta ST) e a rolagem.
  await casosJanelasPorCima();
}

// ---------- janelas por cima: X, Esc e rolagem travada ----------

/** O diálogo das Configurações aberto (e ainda na página). */
const configAberta = `!!document.querySelector('dialog.painel--config[open]')`;
const configNaPagina = `!!document.querySelector('dialog.painel--config')`;

/** Espera dois quadros desenhados (a mudança chega à rolagem da janela). */
const DOIS_QUADROS = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`;

/**
 * Largura do conteúdo da página: muda se a página pular de lado. Pelo body,
 * não pelo clientWidth da raiz: com overflow hidden, o Chromium conta a
 * calha da barra de rolagem no clientWidth, mesmo com ela reservada.
 */
const LARGURA_UTIL = `Math.round(document.body.getBoundingClientRect().width)`;

/** Esc de verdade, pelo teclado da janela (não um evento montado na página). */
function teclaEsc() {
  janela.webContents.focus();
  janela.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  janela.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
}

/**
 * Roda do mouse no ponto (x, y) da janela. Devolve quando a página recebeu o
 * evento wheel e passaram três quadros: a rolagem, se fosse acontecer, já
 * teria começado.
 */
async function rodaDoMouse(x, y, deltaY = -360) {
  await avaliar(`(() => {
    window.__rodas ??= 0;
    if (!window.__contaRodas) {
      window.__contaRodas = true;
      addEventListener('wheel', () => window.__rodas++, { capture: true, passive: true });
    }
    return true;
  })()`);
  const antes = await avaliar('window.__rodas');
  janela.webContents.sendInputEvent({
    type: 'mouseWheel',
    x,
    y,
    deltaX: 0,
    deltaY,
    canScroll: true,
  });
  await aguardar(
    `window.__rodas > ${antes}`,
    10000,
    'a roda do mouse não chegou',
  );
  await avaliar(
    `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))`,
  );
}

/** Gera a planilha de ST inventada e carrega pelo Carregar dos Documentos. */
async function carregarPlanilhaST() {
  const { dialog } = require('electron');
  const { execFileSync } = require('node:child_process');
  const planilha = path.join(tmp, 'st-inventada.xlsx');
  execFileSync(
    process.execPath,
    [
      '--import',
      require('node:url').pathToFileURL(
        path.join(RAIZ, 'test', 'registrar-hook.mjs'),
      ).href,
      path.join(__dirname, 'planilhaST.mts'),
      planilha,
    ],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
  );
  const original = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [planilha],
  });
  try {
    const r = await avaliar(`window.psApi.importarDocumento('st')`);
    confere(r.status === 'ok', `a planilha não carregou: ${JSON.stringify(r)}`);
  } finally {
    dialog.showOpenDialog = original;
  }
}

async function casosJanelasPorCima() {
  await caso(
    'Configurações: X no cabeçalho (só ícone, aria-label Fechar) e Esc fecham; sem Fechar no rodapé',
    async () => {
      await abrirConfiguracoes();
      await aguardar(configAberta, 15000, 'as Configurações não abriram');
      const x = await avaliar(`(() => {
        const d = document.querySelector('dialog.painel--config[open]');
        const b = d.querySelector('.painel__cabecalho > button[aria-label="Fechar"]');
        const cab = d.querySelector('.painel__cabecalho').getBoundingClientRect();
        const r = b?.getBoundingClientRect();
        return {
          existe: !!b,
          texto: b?.textContent.trim(),
          title: b?.hasAttribute('title'),
          noCanto: !!r && cab.right - r.right < 24 && r.top - cab.top < 24,
          rodape: [...d.querySelectorAll('.painel__rodape button')].map((x) => x.textContent.trim()),
        };
      })()`);
      confere(x.existe, 'sem o X no cabeçalho');
      confere(
        x.texto === '' && !x.title,
        `o X tem texto ou title: ${JSON.stringify(x)}`,
      );
      confere(x.noCanto, 'o X não está no canto superior direito');
      confere(
        !x.rodape.includes('Fechar'),
        `o Fechar continua no rodapé: ${x.rodape.join(', ')}`,
      );
      await avaliar(
        `document.querySelector('dialog.painel--config .painel__cabecalho > button[aria-label="Fechar"]').click()`,
      );
      await aguardar(`!${configNaPagina}`, 15000, 'o X não fechou');
      // De novo, agora pelo Esc.
      await abrirConfiguracoes();
      await aguardar(
        configAberta,
        15000,
        'as Configurações não abriram de novo',
      );
      teclaEsc();
      await aguardar(`!${configNaPagina}`, 15000, 'o Esc não fechou');
    },
  );

  await caso(
    'Rolagem: atrás da ferramenta ST a página não rola; ao fechar, volta a rolar da mesma posição',
    async () => {
      await carregarPlanilhaST();
      const [largura, altura] = janela.getContentSize();
      try {
        // Sem barra de rolagem (tela inicial numa janela alta): abrir uma
        // janela não faz a página andar para o lado.
        janela.setContentSize(1366, 1000);
        await avaliar(DOIS_QUADROS);
        confere(
          (await avaliar(
            `document.documentElement.scrollHeight - document.documentElement.clientHeight`,
          )) <= 0,
          'a tela inicial rola numa janela de 1000 px',
        );
        const semBarra = await avaliar(LARGURA_UTIL);
        await abrirConfiguracoes();
        await aguardar(configAberta, 15000, 'as Configurações não abriram');
        await avaliar(DOIS_QUADROS);
        const semBarraAberta = await avaliar(LARGURA_UTIL);
        confere(
          semBarraAberta === semBarra,
          `sem barra, a página andou: ${semBarra} px, com a janela ${semBarraAberta} px`,
        );
        await avaliar(
          `document.querySelector('dialog.painel--config .painel__fechar').click()`,
        );
        await aguardar(`!${configNaPagina}`, 15000, 'o X não fechou');
        janela.setContentSize(1100, 600);
        await abrirNota(copia('t09-xprod-html.xml'));
        await irParaConferencia();
        // Página mais alta que a janela, rolada um pouco para baixo.
        const sobra = await avaliar(
          `document.documentElement.scrollHeight - document.documentElement.clientHeight`,
        );
        confere(sobra > 150, `a página não rola (sobra ${sobra} px)`);
        await avaliar(`window.scrollTo(0, 100); true`);
        await aguardar(`window.scrollY === 100`);
        const comBarra = await avaliar(LARGURA_UTIL);
        // Rodar a ferramenta ST pelo painel.
        await avaliar(`[...document.querySelectorAll('.conferencia__ferramenta')]
          .find((li) => li.textContent.includes(${JSON.stringify('ST, MVA e CFOP')}))
          .querySelector('.botao--ferramenta:not(:disabled)').click()`);
        await aguardar(
          `!!document.querySelector('dialog.painel--st[open]')`,
          30000,
          'a ferramenta ST não abriu',
        );
        confere(
          (await avaliar(
            `getComputedStyle(document.documentElement).overflowY`,
          )) === 'hidden',
          'a página continua rolável com a ferramenta aberta',
        );
        // A trava vale a partir do quadro desenhado com a janela aberta.
        await avaliar(DOIS_QUADROS);
        // Com barra de rolagem: a página também não anda para o lado.
        const comBarraAberta = await avaliar(LARGURA_UTIL);
        confere(
          comBarraAberta === comBarra,
          `com barra, a página andou: ${comBarra} px, com a janela ${comBarraAberta} px`,
        );
        // Roda do mouse sobre a janela e sobre o fundo escurecido.
        const pontos = await avaliar(`(() => {
          const r = document.querySelector('dialog.painel--st').getBoundingClientRect();
          return [
            [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)],
            [Math.max(2, Math.round(r.left / 2)), Math.round(r.top + r.height / 2)],
          ];
        })()`);
        for (const [x, y] of pontos) {
          await rodaDoMouse(x, y);
          const y2 = await avaliar('window.scrollY');
          confere(
            y2 === 100,
            `a página rolou atrás da ferramenta (${x}, ${y}): ${y2}`,
          );
        }
        // Fecha pelo X: a página fica onde estava e volta a rolar.
        await avaliar(
          `document.querySelector('dialog.painel--st .painel__cabecalho > button[aria-label="Fechar"]').click()`,
        );
        await aguardar(
          `!document.querySelector('dialog.painel--st')`,
          15000,
          'o X não fechou a ferramenta',
        );
        confere(
          (await avaliar('window.scrollY')) === 100,
          'a posição da página mudou ao fechar',
        );
        await avaliar(DOIS_QUADROS);
        const [lx, ly] = await avaliar(
          `[Math.round(innerWidth / 2), Math.round(innerHeight / 2)]`,
        );
        await rodaDoMouse(lx, ly);
        await aguardar(
          `window.scrollY > 100`,
          10000,
          'a página não voltou a rolar depois de fechar',
        );
      } finally {
        janela.setContentSize(largura, altura);
      }
    },
  );

  // Modo .XML da aba XML: com rolagem própria, ao lado do painel Leitura,
  // até a borda da janela; a página de baixo não rola.
  await caso(
    '.XML na aba XML: ao lado do painel Leitura, até a borda, e a página não rola',
    async () => {
      const xml = path.join(notas, 'catalogo-largura.xml');
      fs.writeFileSync(
        xml,
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<catalogo origem="inventado"><item>ARRUELA INVENTADA</item></catalogo>',
          '',
        ].join('\n'),
      );
      abrir(xml);
      await aguardar(
        `(() => { const f = document.getElementById('formato-original'); if (f && !f.hidden) document.getElementById('btn-modo-xml')?.click(); const l = document.querySelector('.leitor-xml'); return !!l && !l.hidden; })()`,
        30000,
        'o .XML não abriu',
      );
      await avaliar(DOIS_QUADROS);
      const m = await avaliar(`(() => {
        const l = document.querySelector('.leitor-xml').getBoundingClientRect();
        const p = document.getElementById('painel-leitura').getBoundingClientRect();
        const b = document.getElementById('barra').getBoundingClientRect();
        const h = document.documentElement;
        return {
          esquerda: Math.round(l.left), direita: Math.round(l.right), topo: Math.round(l.top),
          painel: Math.round(p.right), barra: Math.round(b.bottom), janela: innerWidth,
          rola: getComputedStyle(h).overflowY !== 'hidden' && h.scrollHeight > h.clientHeight,
        };
      })()`);
      confere(
        m.esquerda >= m.painel && m.direita === m.janela && m.topo === m.barra,
        `o .XML não ocupa a área ao lado do painel: ${JSON.stringify(m)}`,
      );
      confere(!m.rola, 'a página de baixo rola');
      await avaliar(`document.getElementById('btn-inicio').click(); true`);
      await aguardar(
        `document.querySelector('.leitor-xml').hidden`,
        15000,
        'o Início não tirou o XML',
      );
    },
  );

  // Ouvintes de "destroyed": cada abrir e Fechar do leitor na mesma janela
  // não pode deixar um ouvinte para trás (passando de 10, o Node avisa
  // MaxListenersExceededWarning). Doze leituras seguidas, pelo serviço.
  await caso(
    'Leitor de XML: doze leituras seguidas não acumulam ouvintes de "destroyed"',
    async () => {
      const xml = path.join(notas, 'catalogo-ouvintes.xml');
      fs.writeFileSync(
        xml,
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<catalogo origem="inventado"><item>PORCA INVENTADA</item></catalogo>',
          '',
        ].join('\n'),
      );
      const wc = janela.webContents;
      const inicial = wc.listenerCount('destroyed');
      for (let i = 1; i <= 12; i++) {
        abrir(xml);
        await aguardar(
          `(() => { const f = document.getElementById('formato-original'); if (f && !f.hidden) document.getElementById('btn-modo-xml')?.click(); const l = document.querySelector('.leitor-xml'); return !!l && !l.hidden && document.querySelector('#titulo-janela-textos .titulo-janela__forte')?.textContent === 'catalogo-ouvintes.xml' && !!l.querySelector('.leitor-xml__vista--arvore')?.childElementCount; })()`,
          30000,
          `a leitura ${i} não terminou`,
        );
        await avaliar(`document.getElementById('btn-inicio').click(); true`);
        await aguardar(
          `document.querySelector('.leitor-xml').hidden && ${visivel('vazio')}`,
          15000,
          `o Fechar ${i} não voltou ao início`,
        );
      }
      const final = wc.listenerCount('destroyed');
      confere(
        final === inicial,
        `ouvintes de "destroyed": ${inicial} antes, ${final} depois de 12 leituras`,
      );
      confere(
        avisosOuvintes.length === 0,
        `aviso de ouvintes demais: ${avisosOuvintes.join(' | ')}`,
      );
    },
  );

  // Parte 3: o quadro de escolha diz quantas outras linhas da planilha citam
  // o mesmo começo de NCM; a frase "não é da linha automotiva" da nota
  // aparece nos itens com candidato em Autopeças, só como informação.
  await caso(
    'Ferramenta ST: outras linhas do mesmo começo de NCM e a frase da nota fora da linha automotiva',
    async () => {
      await carregarPlanilhaST();
      await abrirNota(copia('t13-st-autopecas.xml'));
      await irParaConferencia();
      await avaliar(`[...document.querySelectorAll('.conferencia__ferramenta')]
        .find((li) => li.textContent.includes(${JSON.stringify('ST, MVA e CFOP')}))
        .querySelector('.botao--ferramenta:not(:disabled)').click()`);
      await aguardar(
        `!!document.querySelector('dialog.painel--st[open]')`,
        30000,
        'a ferramenta ST não abriu',
      );
      /** Linha da tabela da ferramenta pelo número do item. */
      const linha = (n) =>
        `[...document.querySelectorAll('dialog.painel--st tr.st__linha')].find((tr) => tr.querySelector('td.num')?.textContent.trim() === '${n}')`;
      const frase = 'NAO ENQUADRADO NA LINHA AUTOMOTIVA';
      // Item 2 (Autopeças): a frase como informação, e a decisão é a de antes.
      const item2 = await avaliar(`(() => {
        const tr = ${linha(2)};
        const info = tr.querySelector('.st__motivo .st__nota-info');
        return {
          info: info?.textContent,
          selecionavel: info ? getComputedStyle(info).userSelect : null,
          st: tr.querySelector('.st__situacao').textContent.trim(),
        };
      })()`);
      confere(
        item2.info === `Na nota: "${frase}"`,
        `item 2 sem a frase da nota: ${JSON.stringify(item2)}`,
      );
      confere(item2.selecionavel === 'text', 'a frase da nota não seleciona');
      confere(item2.st === 'Sim', `a decisão do item 2 mudou: ${item2.st}`);
      // Item 1 (pneu): sem candidato em Autopeças, sem a frase.
      confere(
        !(await avaliar(`!!${linha(1)}.querySelector('.st__nota-info')`)),
        'a frase da nota apareceu no item sem Autopeças',
      );
      // Quadro de escolha do item 1: a linha das outras linhas da planilha.
      await avaliar(`${linha(1)}.querySelector('.st__confirmar').click()`);
      await aguardar(
        `!!document.querySelector('dialog.painel--st .st__escolha')`,
        15000,
        'o quadro de escolha não abriu',
      );
      const outras = await avaliar(`(() => {
        const q = document.querySelector('dialog.painel--st .st__escolha');
        return {
          texto: q.querySelector('.st__outras-linhas')?.textContent,
          opcoes: q.querySelectorAll('.st__opcao').length,
          frase: !!q.querySelector('.st__nota-info'),
        };
      })()`);
      confere(
        outras.texto ===
          'Outras 3 linhas da planilha citam 4011, mas para NCMs diferentes deste item (4011.10.00, 4011.40.00, 4011.50.00).',
        `linha das outras linhas: ${JSON.stringify(outras)}`,
      );
      // Duas linhas candidatas, Sem ST e Outro: as outras linhas não viram opção.
      confere(outras.opcoes === 4, `opções no quadro: ${outras.opcoes}`);
      confere(!outras.frase, 'a frase da nota apareceu no quadro do pneu');
      await avaliar(
        `document.querySelector('dialog.painel--st .painel__fechar').click()`,
      );
      await aguardar(
        `!document.querySelector('dialog.painel--st')`,
        15000,
        'o X não fechou a ferramenta',
      );
    },
  );
}

app.whenReady().then(async () => {
  let codigo = 0;
  try {
    await principal();
  } catch (erro) {
    console.error(erro);
    codigo = 1;
  }
  const falhas = resultados.filter((r) => !r.ok);
  if (falhas.length > 0) codigo = 1;
  console.log(
    `\ntest:janela: ${resultados.length - falhas.length} de ${resultados.length} passaram`,
  );
  for (const f of falhas) console.log(`\n${f.nome}\n${f.erro}`);
  // Rodando por rodar.cjs, ele apaga a pasta depois que o Electron sair.
  if (!process.env.PS_JANELA_TMP) {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // Arquivo ainda preso pelo app: use npm run test:janela, que apaga.
    }
  }
  app.exit(codigo);
});
