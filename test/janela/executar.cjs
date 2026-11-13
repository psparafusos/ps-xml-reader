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

/** Passa para a Conferência pelo botão da barra. */
async function irParaConferencia() {
  await avaliar(`document.getElementById('btn-modo-conferencia').click()`);
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
        return { texto: b.textContent.replace(/\s+/g, ' ').trim(), fundo: getComputedStyle(b).backgroundColor, naInicial: !!b.closest('#inicio-perfil') };
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
      `(document.querySelector('.leitor-xml__avisos')?.innerText ?? '').includes('mais de 1.000 níveis')`,
      30000,
      'o leitor não avisou a profundidade',
    );
    confere(Date.now() - t0 < 5000, `leitor demorou ${Date.now() - t0} ms`);
    await avaliar(
      `[...document.querySelectorAll('.leitor-xml button')].find((b) => b.textContent === 'Fechar')?.click(); true`,
    );
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

  // Leitor de XML genérico: camada fixa sobre a janela, com rolagem própria.
  // Ocupa a largura toda (sem o espaço reservado da barra) e a página de baixo
  // não rola enquanto ele está aberto.
  await caso(
    'Leitor de XML: ocupa a janela toda e a página de baixo não rola',
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
        `(() => { const l = document.querySelector('.leitor-xml'); return !!l && !l.hidden; })()`,
        30000,
        'o leitor não abriu',
      );
      await avaliar(DOIS_QUADROS);
      const m = await avaliar(`(() => ({
        leitor: Math.round(document.querySelector('.leitor-xml').getBoundingClientRect().width),
        janela: innerWidth,
        rolagem: getComputedStyle(document.documentElement).overflowY,
      }))()`);
      confere(
        m.leitor === m.janela,
        `o leitor não ocupa a janela toda: ${JSON.stringify(m)}`,
      );
      confere(m.rolagem === 'hidden', 'a página de baixo continua rolável');
      await avaliar(`[...document.querySelectorAll('.leitor-xml button')]
        .find((b) => b.textContent.trim() === 'Fechar').click()`);
      await aguardar(
        `document.querySelector('.leitor-xml').hidden`,
        15000,
        'o Fechar não fechou o leitor',
      );
      confere(
        (await avaliar(
          `getComputedStyle(document.documentElement).overflowY`,
        )) !== 'hidden',
        'a página não voltou a rolar depois de fechar o leitor',
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
          `(() => { const l = document.querySelector('.leitor-xml'); return !!l && !l.hidden && l.querySelector('.leitor-xml__nome')?.textContent === 'catalogo-ouvintes.xml' && !!l.querySelector('.leitor-xml__vista--arvore')?.childElementCount; })()`,
          30000,
          `a leitura ${i} não terminou`,
        );
        await avaliar(`[...document.querySelectorAll('.leitor-xml button')]
          .find((b) => b.textContent.trim() === 'Fechar').click()`);
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
