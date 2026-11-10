// npm run test:janela: testes que precisam do Chromium de verdade (DOMParser,
// a tela da Conferência e do DANFE). Roda o próprio app, do build que o
// Forge acabou de gerar em .vite/, numa janela que nunca aparece, com uma
// pasta de dados temporária (verificação online desligada, que é o padrão) e
// cópias temporárias dos arquivos de teste. Confere a tela por
// executeJavaScript, sem porta de depuração. Nenhum teste aciona Copiar.
//
// Casos (test/janela/fixtures, NF-e inventadas): a tela pelo app://, e T6, T8
// (gerado aqui), T9, T10, T11 e T12 do plano de segurança.
'use strict';

const { app, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const MAIN = path.join(RAIZ, '.vite', 'build', 'main.cjs');
const FIXTURES = path.join(__dirname, 'fixtures');

if (!fs.existsSync(MAIN)) {
  console.error('Falta o build do app em .vite/. Rode: npm run test:janela');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-janela-'));
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
const profundo = path.join(notas, 't08-profundo.xml');
fs.writeFileSync(
  profundo,
  `<?xml version="1.0" encoding="UTF-8"?>${'<a>'.repeat(100000)}${'</a>'.repeat(100000)}`,
);

// Janela oculta: o app chama show/maximize/focus; aqui eles não fazem nada.
app.on('browser-window-created', (_e, w) => {
  for (const m of ['show', 'showInactive', 'maximize', 'focus', 'restore'])
    w[m] = () => undefined;
});

/** Pedidos de rede feitos pela página (o app é offline: deve ficar vazio). */
const rede = [];
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

async function aguardar(js, prazo = 15000, descricao = js) {
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

/** Volta para a tela inicial (a janela fica vazia para o próximo arquivo). */
async function inicio() {
  await avaliar(`document.getElementById('btn-inicio').click()`);
  await aguardar(visivel('vazio'));
  await espera(300);
}

/** Estado da página que nenhum texto de arquivo pode mudar. */
const SONDA = `(() => ({
  scripts: document.querySelectorAll('script').length,
  imgX: document.querySelectorAll('img[src="x"], img[onerror]').length,
  links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
  negrito: document.querySelectorAll('#nota b, #danfe b, #nota i, #danfe i').length,
  alertas: window.__alertas ?? 0,
}))()`;

async function caso(nome, fn) {
  const inicioMs = Date.now();
  try {
    await fn();
    resultados.push({ nome, ok: true, ms: Date.now() - inicioMs });
    console.log(`ok   ${nome} (${Date.now() - inicioMs} ms)`);
  } catch (erro) {
    resultados.push({ nome, ok: false, erro: String(erro && erro.stack) });
    console.log(`FALHA ${nome}\n  ${String(erro && erro.message)}`);
  }
}

function confere(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Abre DANFE e Conferência a partir da tela de escolha e devolve as sondas. */
async function verDanfeEConferencia() {
  await aguardar(visivel('modo'));
  await avaliar(`document.getElementById('btn-danfe').click()`);
  await aguardar(visivel('danfe'));
  await espera(500);
  const danfe = await avaliar(SONDA);
  const textoDanfe = await avaliar(
    `document.getElementById('danfe').innerText`,
  );
  await avaliar(`document.getElementById('btn-modo-conferencia').click()`);
  await aguardar(visivel('nota'));
  await espera(500);
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
      const logo = document.querySelector('.inicio__logo, .barra__logo');
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
  );

  await caso('T8: 100 mil níveis de aninhamento (DOMParser)', async () => {
    const t0 = Date.now();
    abrir(profundo);
    await aguardar(
      `${visivel('mensagem')} && document.getElementById('mensagem-texto').textContent.length > 0`,
      10000,
    );
    const msg = await avaliar(
      `document.getElementById('mensagem-texto').textContent`,
    );
    confere(msg === 'Este arquivo não é uma NF-e.', `mensagem: ${msg}`);
    confere(Date.now() - t0 < 5000, `demorou ${Date.now() - t0} ms`);
    confere(await avaliar(visivel('vazio')), 'saiu da tela inicial');
    await avaliar(`document.getElementById('mensagem-fechar')?.click(); true`);
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
        10000,
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
      await espera(500);
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
      // .psxml aberto por duplo clique: a pasta dele é a pasta de destino desta
      // janela, e Salvar regrava a própria cópia (a temporária, nunca o fixture).
      const aberto = path.join(notas, 't12-anotacao-html.psxml');
      const antes = fs.readFileSync(aberto, 'utf8');
      await avaliar(`document.getElementById('btn-salvar').click()`);
      const limiteSalvar = Date.now() + 15000;
      let gravado = antes;
      while (gravado === antes && Date.now() < limiteSalvar) {
        await espera(200);
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
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    // Arquivo ainda preso pelo app: o Windows limpa a pasta temporária.
  }
  app.exit(codigo);
});
