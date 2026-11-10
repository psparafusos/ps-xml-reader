// npm run test:janela: testes que precisam do Chromium de verdade (DOMParser,
// a tela da Conferência e do DANFE). Roda o próprio app, do build que o
// Forge acabou de gerar em .vite/, numa janela que nunca aparece, com uma
// pasta de dados temporária (verificação online desligada, que é o padrão) e
// cópias temporárias dos arquivos de teste. Confere a tela por
// executeJavaScript, sem porta de depuração. Nenhum teste aciona Copiar.
//
// Casos (test/janela/fixtures, NF-e inventadas): a tela pelo app://, a
// abertura direta (parte 2A: sem a tela de escolha), a leitura protegida
// (partes 2B, 2C e 2D), e T6, T8 (gerado aqui),
// T9, T10, T11 e T12 do plano de segurança.
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
    // Volta ao estado de partida, para o caso seguinte não falhar junto:
    // fecha as janelas que sobraram e leva esta para a tela inicial.
    const { BrowserWindow } = require('electron');
    for (const w of BrowserWindow.getAllWindows())
      if (w !== janela) w.destroy();
    await avaliar(`document.getElementById('btn-inicio')?.click(); true`).catch(
      () => {},
    );
    await espera(800);
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
      const limite = Date.now() + 15000;
      while (!nova && Date.now() < limite) {
        nova = BrowserWindow.getAllWindows().find((w) => !antes.has(w)) ?? null;
        await espera(100);
      }
      confere(nova, 'nenhuma janela nova abriu');
      const naNova = (js) => nova.webContents.executeJavaScript(js, true);
      const limiteNova = Date.now() + 15000;
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

  // Parte 2B: leitura protegida.
  // O aviso da leitura pelo título; os avisos de abertura da nota (nota de
  // outra empresa, já conferida) são outros diálogos e são fechados antes.
  const dialogoAberto = `[...document.querySelectorAll('dialog[open] .caixa-dialogo__titulo')].some((t) => t.textContent === 'Sair da leitura protegida?')`;
  const fecharAvisosDaNota = async () => {
    await espera(800);
    await avaliar(`(() => {
      for (const d of document.querySelectorAll('dialog[open]'))
        if (d.querySelector('.caixa-dialogo__titulo')?.textContent !== 'Sair da leitura protegida?')
          d.dispatchEvent(new Event('cancel', { cancelable: true }));
      return true;
    })()`);
    await espera(300);
  };
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

  await caso(
    '2B: XML abre em leitura protegida: faixa, anotações travadas, só ver',
    async () => {
      abrir(outra);
      await aguardar(visivel('danfe'));
      await fecharAvisosDaNota();
      confere(await avaliar(visivel('faixa-leitura')), 'sem a faixa');
      confere(
        (await avaliar(
          `document.getElementById('faixa-leitura-texto').textContent`,
        )) === 'Leitura protegida: só visualização.',
        'texto da faixa',
      );
      confere(
        (await avaliar(
          `document.getElementById('btn-usar-conferencia').textContent`,
        )) === 'Usar a Conferência',
        'botão da faixa',
      );
      confere(
        (await avaliar(
          `document.getElementById('btn-salvar-texto').textContent`,
        )) === 'Salvar PDF',
        'o Salvar não virou Salvar PDF',
      );
      // Trocar para a Conferência é só ver: sem aviso, anotações travadas.
      await avaliar(`document.getElementById('btn-modo-conferencia').click()`);
      await aguardar(visivel('nota'));
      await espera(300);
      confere(!(await avaliar(dialogoAberto)), 'trocar de modo pediu aviso');
      await fecharAvisosDaNota();
      confere(
        await avaliar(
          `(() => { const c = [...document.querySelectorAll('input.anotacao__campo')]; return c.length > 0 && c.every((x) => x.readOnly); })()`,
        ),
        'anotações não estão travadas',
      );
      confere(
        await avaliar(visivel('painel-conferencia')),
        'o painel de avisos sumiu na leitura',
      );
    },
  );

  await caso(
    '2B: o processo principal recusa gravar o .psxml numa janela protegida',
    async () => {
      const antes = psxmlNoDestino().length;
      const r1 = await avaliar(`window.psApi.salvar('<x/>', null)`);
      const r2 = await avaliar(`window.psApi.salvarCopia('<x/>', 'teste-2b')`);
      for (const r of [r1, r2])
        confere(
          r.status === 'erro' && /leitura protegida/.test(r.mensagem),
          `resposta: ${JSON.stringify(r)}`,
        );
      confere(psxmlNoDestino().length === antes, 'um .psxml foi gravado');
    },
  );

  await caso(
    '2B: na leitura, Salvar grava o PDF na pasta de destino, sem .psxml',
    async () => {
      const antes = psxmlNoDestino().length;
      await avaliar(`document.getElementById('btn-salvar').click()`);
      const limite = Date.now() + 20000;
      let pdf = null;
      while (!pdf && Date.now() < limite) {
        pdf =
          fs.readdirSync(destino).find((n) => n.endsWith('_Conferencia.pdf')) ??
          null;
        await espera(200);
      }
      confere(pdf, 'o PDF da Conferência não foi gravado');
      confere(psxmlNoDestino().length === antes, 'o Salvar gravou .psxml');
      await espera(800);
    },
  );

  await caso(
    '2B: ação que edita pede o aviso; "Ficar na leitura" vem com o foco e mantém a leitura',
    async () => {
      // Editar colunas.
      await avaliar(`document.getElementById('btn-editar-colunas').click()`);
      await aguardar(dialogoAberto, 5000, 'o aviso não abriu');
      const aviso = await avaliar(`(() => {
        const d = document.querySelector('dialog[open]');
        return {
          titulo: d.querySelector('.caixa-dialogo__titulo')?.textContent,
          texto: d.querySelector('.caixa-dialogo__texto')?.textContent,
          foco: document.activeElement?.textContent?.trim(),
          botoes: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()),
        };
      })()`);
      confere(
        aviso.texto ===
          'Você vai sair da leitura protegida e começar a editar. O XML original não muda; o que você fizer fica numa cópia (.psxml).',
        `texto: ${aviso.texto}`,
      );
      confere(aviso.foco === 'Ficar na leitura', `foco em: ${aviso.foco}`);
      confere(
        aviso.botoes.includes('Continuar'),
        `botões: ${aviso.botoes.join(', ')}`,
      );
      confere(
        await clicarNoDialogo('Ficar na leitura'),
        'sem Ficar na leitura',
      );
      await espera(300);
      confere(await avaliar(visivel('faixa-leitura')), 'saiu da leitura');
      confere(
        !(await avaliar(
          `!!document.getElementById('painel-colunas-titulo')?.closest('dialog[open]')`,
        )),
        'o editor de colunas abriu mesmo assim',
      );
      // Clicar numa anotação.
      await avaliar(`(() => {
        const c = document.querySelector('input.anotacao__campo');
        c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        return true;
      })()`);
      await aguardar(dialogoAberto, 5000, 'clicar na anotação não pediu aviso');
      await clicarNoDialogo('Ficar na leitura');
      await espera(300);
      confere(
        await avaliar(
          `[...document.querySelectorAll('input.anotacao__campo')].every((x) => x.readOnly)`,
        ),
        'a anotação destravou sem Continuar',
      );
      // Ferramenta ST (com a planilha faltando, Rodar fica desabilitado; a
      // regra da ferramenta é testada em test/leituraProtegida.test.mts).
    },
  );

  await caso(
    '2B: "Usar a Conferência" e Continuar saem da leitura para editar',
    async () => {
      await avaliar(`document.getElementById('btn-usar-conferencia').click()`);
      await aguardar(dialogoAberto, 5000, 'o aviso não abriu');
      confere(await clicarNoDialogo('Continuar'), 'sem Continuar');
      await aguardar(`!${visivel('faixa-leitura')}`, 5000, 'a faixa não sumiu');
      confere(await avaliar(visivel('nota')), 'não ficou na Conferência');
      confere(
        await avaliar(
          `[...document.querySelectorAll('input.anotacao__campo')].every((x) => !x.readOnly)`,
        ),
        'as anotações continuam travadas',
      );
      confere(
        (await avaliar(
          `document.getElementById('btn-salvar-texto').textContent`,
        )) === 'Salvar',
        'o Salvar continua como Salvar PDF',
      );
      // Agora o processo principal aceita gravar o .psxml desta janela.
      const r = await avaliar(`window.psApi.salvar('<x/>', null)`);
      confere(r.status === 'salvo', `resposta: ${JSON.stringify(r)}`);
      await inicio();
    },
  );

  // Parte 2C: seletor de perfil livre, "Abrir notas em" por perfil e .psxml
  // vindo da internet.
  await caso(
    '2C: na leitura, o seletor de perfil abre sem aviso; Gerenciar perfis pede o aviso',
    async () => {
      abrir(outra);
      await aguardar(visivel('danfe'));
      await fecharAvisosDaNota();
      confere(await avaliar(visivel('faixa-leitura')), 'não abriu em leitura');
      await avaliar(`document.getElementById('btn-perfil').click()`);
      await aguardar(
        visivel('menu-perfil'),
        5000,
        'o menu de perfil não abriu',
      );
      confere(
        !(await avaliar(dialogoAberto)),
        'o seletor de perfil pediu aviso',
      );
      // Gerenciar perfis abre o Editar colunas: pede o aviso.
      await avaliar(`[...document.querySelectorAll('#menu-perfil button')]
        .find((b) => b.textContent.includes('Gerenciar perfis')).click()`);
      await aguardar(dialogoAberto, 5000, 'Gerenciar perfis não pediu aviso');
      await clicarNoDialogo('Ficar na leitura');
      await espera(300);
      confere(await avaliar(visivel('faixa-leitura')), 'saiu da leitura');
      await inicio();
    },
  );

  /** "Abrir notas em" do perfil ativo, lido do processo principal. */
  const abrirEmAtivo = () =>
    avaliar(`window.psApi.ferramentasPerfis().then((e) =>
      e.lista.find((p) => p.id === e.ativo).ferramentas.abrirEm)`);

  await caso(
    '2C: a aba Ferramentas das Configurações mostra e grava "Abrir notas em"',
    async () => {
      confere((await abrirEmAtivo()) === 'leitura', 'o padrão não é a leitura');
      await avaliar(`document.getElementById('btn-config-inicio').click()`);
      await aguardar(`!!document.getElementById('config-titulo')`);
      await avaliar(`[...document.querySelectorAll('dialog[open] button')]
        .find((b) => b.textContent.trim() === 'Ferramentas').click()`);
      await aguardar(`!!document.getElementById('config-abrir-em-leitura')`);
      confere(
        await avaliar(
          `document.getElementById('config-abrir-em-leitura').checked`,
        ),
        'Leitura protegida não vem marcada',
      );
      await avaliar(
        `document.getElementById('config-abrir-em-conferencia').click()`,
      );
      const limite = Date.now() + 10000;
      while ((await abrirEmAtivo()) !== 'conferencia' && Date.now() < limite)
        await espera(200);
      confere(
        (await abrirEmAtivo()) === 'conferencia',
        'a opção Conferência não foi gravada',
      );
      await avaliar(`document.querySelector('dialog[open]').close(); true`);
      await espera(500);
    },
  );

  await caso(
    '2C: perfil em "Conferência" abre o XML direto na Conferência, em edição',
    async () => {
      abrir(outra);
      await aguardar(visivel('nota'));
      await fecharAvisosDaNota();
      confere(!(await avaliar(visivel('faixa-leitura'))), 'abriu em leitura');
      confere(
        await avaliar(
          `[...document.querySelectorAll('input.anotacao__campo')].every((x) => !x.readOnly)`,
        ),
        'as anotações estão travadas',
      );
      await inicio();
      // Volta o perfil ao padrão, pelo mesmo canal das Configurações.
      await avaliar(`window.psApi.ferramentasPerfis().then((e) => {
        const f = e.lista.find((p) => p.id === e.ativo).ferramentas;
        return window.psApi.gravarFerramentasPerfil(e.ativo, { ...f, abrirEm: 'leitura' });
      })`);
      confere(
        (await abrirEmAtivo()) === 'leitura',
        'não voltou para a leitura',
      );
    },
  );

  await caso(
    '2C: .psxml baixado da internet abre em leitura protegida, com aviso',
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
      await espera(500);
      confere(await avaliar(visivel('faixa-leitura')), 'abriu em edição');
      const msg = await avaliar(
        `document.getElementById('mensagem-texto').textContent`,
      );
      confere(/veio da internet/.test(msg), `mensagem: ${msg}`);
      const r = await avaliar(`window.psApi.salvar('<x/>', null)`);
      confere(
        r.status === 'erro' && /leitura protegida/.test(r.mensagem),
        `o .psxml da internet pôde ser gravado: ${JSON.stringify(r)}`,
      );
      await inicio();
    },
  );

  // Parte 2D: folhas do DANFE e orientação da Conferência na leitura (só a
  // tela e o PDF que sai dela), regra da seleção de texto e as dicas.
  /** Páginas e tamanho da primeira página de um PDF gravado pelo app. */
  const paginasDoPdf = (arquivo) => {
    const s = fs.readFileSync(arquivo, 'latin1');
    const m =
      /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(
        s,
      );
    return {
      paginas: (s.match(/\/Type\s*\/Page(?!s)/g) || []).length,
      largura: m ? Number(m[3]) - Number(m[1]) : 0,
      altura: m ? Number(m[4]) - Number(m[2]) : 0,
    };
  };
  // Onde o Salvar PDF grava: a pasta de destino, ou a pasta da sessão
  // (a do .psxml aberto por duplo clique no caso 2C).
  const pastasDoPdf = [destino, notas];
  const pdfsGravados = () =>
    pastasDoPdf.flatMap((d) =>
      fs
        .readdirSync(d)
        .filter((n) => n.toLowerCase().endsWith('.pdf'))
        .map((n) => path.join(d, n)),
    );
  /** Espera o PDF terminar de ser gravado. */
  const pdfNoDestino = async (sufixo) => {
    const limite = Date.now() + 20000;
    while (Date.now() < limite) {
      const p = pdfsGravados().find((x) => x.endsWith(sufixo));
      if (p) {
        const t1 = fs.statSync(p).size;
        await espera(400);
        if (t1 > 0 && fs.statSync(p).size === t1) return p;
      }
      await espera(200);
    }
    const tela = await avaliar(
      `({ mensagem: document.getElementById('mensagem-texto')?.textContent, dialogos: [...document.querySelectorAll('dialog[open]')].map((d) => d.innerText.slice(0, 200)), salvar: document.getElementById('btn-salvar').disabled })`,
    );
    throw new Error(
      `o PDF ${sufixo} não foi gravado; gravados: ${pdfsGravados().join(', ')}; tela: ${JSON.stringify(tela)}`,
    );
  };
  const apagarPdfs = () => {
    for (const p of pdfsGravados()) fs.rmSync(p);
  };
  const marcados = (grupo) =>
    avaliar(
      `[...document.querySelectorAll('#${grupo} [aria-pressed="true"]')].map((b) => b.textContent.trim()).join()`,
    );
  const clicarOpcao = (grupo, rotulo) =>
    avaliar(`(() => {
      const b = [...document.querySelectorAll('#${grupo} button')]
        .find((x) => x.textContent.trim() === ${JSON.stringify(rotulo)});
      if (!b) return false;
      b.click();
      return true;
    })()`);
  const atalhoZoom = (key) =>
    avaliar(
      `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, ctrlKey: true })); true`,
    );
  /** Elementos com title (dica nativa) na página, fora da ferramenta ST. */
  const comTitle = `[...document.querySelectorAll('[title]')].filter((e) => !e.closest('.st')).map((e) => e.id || e.className || e.tagName)`;

  await caso(
    '2D: no DANFE da leitura, Folhas: Uma, Lado a lado e Ajustar à largura (só a tela)',
    async () => {
      apagarPdfs();
      abrir(outra);
      await aguardar(visivel('danfe'));
      await fecharAvisosDaNota();
      confere(await avaliar(visivel('faixa-folhas')), 'sem Folhas no DANFE');
      confere(
        !(await avaliar(visivel('faixa-orientacao'))),
        'a orientação apareceu no DANFE',
      );
      confere(
        (await marcados('seletor-folhas')) === 'Uma',
        'Uma não vem marcada',
      );
      confere(
        await clicarOpcao('seletor-folhas', 'Lado a lado'),
        'sem Lado a lado',
      );
      await espera(300);
      confere(!(await avaliar(dialogoAberto)), 'Folhas pediu o aviso');
      const lado = await avaliar(`(() => {
        const d = document.getElementById('danfe');
        const s = getComputedStyle(d);
        return { dir: s.flexDirection, wrap: s.flexWrap, folhas: d.dataset.folhas };
      })()`);
      confere(
        lado.dir === 'row' && lado.wrap === 'wrap' && lado.folhas === 'lado',
        `lado a lado: ${JSON.stringify(lado)}`,
      );
      confere(
        (await marcados('seletor-folhas')) === 'Lado a lado',
        'Lado a lado não ficou marcado',
      );
      // O PDF não segue o arranjo da tela: uma folha A4 retrato por página.
      const folhas = await avaliar(
        `document.querySelectorAll('#danfe .folha').length`,
      );
      await avaliar(`document.getElementById('btn-salvar').click()`);
      const pdf = paginasDoPdf(await pdfNoDestino('_DANFE.pdf'));
      confere(
        pdf.paginas === folhas,
        `PDF com ${pdf.paginas} páginas para ${folhas} folhas`,
      );
      confere(pdf.altura > pdf.largura, `PDF do DANFE: ${JSON.stringify(pdf)}`);
      await espera(800);
      // Ajustar à largura: uma folha ocupando a largura da janela.
      confere(
        await clicarOpcao('seletor-folhas', 'Ajustar à largura'),
        'sem Ajustar à largura',
      );
      await espera(400);
      const aj = await avaliar(`(() => {
        const d = document.getElementById('danfe');
        const f = d.querySelector('.folha').getBoundingClientRect();
        return {
          folha: f.width,
          janela: document.documentElement.clientWidth,
          zoom: d.style.zoom,
          dir: getComputedStyle(d).flexDirection,
        };
      })()`);
      confere(aj.dir === 'column', `ajustar: ${JSON.stringify(aj)}`);
      confere(
        aj.folha <= aj.janela + 1 && aj.folha >= aj.janela * 0.85,
        `a folha não ocupa a largura: ${JSON.stringify(aj)}`,
      );
      // Zoom à mão sai do Ajustar à largura e volta para Uma.
      await atalhoZoom('=');
      await espera(300);
      confere(
        (await marcados('seletor-folhas')) === 'Uma',
        'o zoom à mão não voltou para Uma',
      );
      await atalhoZoom('0');
      await espera(300);
      confere(
        (await avaliar(`document.getElementById('danfe').style.zoom`)) === '1',
        'Ctrl+0 não voltou a 100%',
      );
      // Fica em Lado a lado para o caso seguinte conferir a saída da leitura.
      await clicarOpcao('seletor-folhas', 'Lado a lado');
      await espera(300);
    },
  );

  await caso(
    '2D: na Conferência da leitura, Retrato ou Paisagem vale para o PDF e não grava no perfil',
    async () => {
      // Sozinho também: sem a nota do caso anterior, abre de novo.
      if (!(await avaliar(visivel('danfe')))) {
        abrir(outra);
        await aguardar(visivel('danfe'));
        await fecharAvisosDaNota();
      }
      const perfisAntes = JSON.stringify(
        await avaliar(`window.psApi.perfis()`),
      );
      await avaliar(`document.getElementById('btn-modo-conferencia').click()`);
      await aguardar(visivel('nota'));
      await fecharAvisosDaNota();
      confere(
        await avaliar(visivel('faixa-orientacao')),
        'sem a orientação na Conferência',
      );
      confere(
        !(await avaliar(visivel('faixa-folhas'))),
        'Folhas apareceu na Conferência',
      );
      const inicial = await marcados('seletor-orientacao-leitura');
      confere(
        inicial === 'Retrato' || inicial === 'Paisagem',
        `orientação marcada: "${inicial}"`,
      );
      for (const [rotulo, deitada] of [
        ['Paisagem', true],
        ['Retrato', false],
      ]) {
        confere(
          await clicarOpcao('seletor-orientacao-leitura', rotulo),
          `sem ${rotulo}`,
        );
        await espera(200);
        confere(!(await avaliar(dialogoAberto)), `${rotulo} pediu o aviso`);
        confere(
          (await marcados('seletor-orientacao-leitura')) === rotulo,
          `${rotulo} não ficou marcada`,
        );
        apagarPdfs();
        await avaliar(`document.getElementById('btn-salvar').click()`);
        const pdf = paginasDoPdf(await pdfNoDestino('_Conferencia.pdf'));
        confere(
          deitada ? pdf.largura > pdf.altura : pdf.altura > pdf.largura,
          `PDF em ${rotulo}: ${JSON.stringify(pdf)}`,
        );
        await espera(800);
      }
      confere(
        JSON.stringify(await avaliar(`window.psApi.perfis()`)) === perfisAntes,
        'a orientação foi gravada no perfil',
      );
      // Sair da leitura: a faixa some e o DANFE volta a uma folha embaixo
      // da outra.
      await avaliar(`document.getElementById('btn-usar-conferencia').click()`);
      await aguardar(dialogoAberto, 5000, 'o aviso não abriu');
      await clicarNoDialogo('Continuar');
      await aguardar(`!${visivel('faixa-leitura')}`, 5000, 'a faixa não sumiu');
      confere(
        (await avaliar(`document.getElementById('danfe').dataset.folhas`)) ===
          'uma',
        'o DANFE continuou lado a lado fora da leitura',
      );
      // Editar colunas (só em edição): sem dica nativa.
      await avaliar(`document.getElementById('btn-editar-colunas').click()`);
      await aguardar(
        `!!document.getElementById('painel-colunas-titulo')?.closest('dialog[open]')`,
        5000,
        'o Editar colunas não abriu',
      );
      await espera(300);
      const noEditor = await avaliar(comTitle);
      confere(noEditor.length === 0, `title no Editar colunas: ${noEditor}`);
      await avaliar(`(() => {
        const d = document.getElementById('painel-colunas-titulo').closest('dialog[open]');
        d.dispatchEvent(new Event('cancel', { cancelable: true }));
        return true;
      })()`);
      await espera(500);
      await fecharAvisosDaNota();
      await inicio();
    },
  );

  await caso(
    '2D: sem dica nativa (title) fora da ferramenta ST; seleção só nos dados',
    async () => {
      const semDica = async (onde) => {
        const lista = await avaliar(comTitle);
        confere(lista.length === 0, `title em ${onde}: ${lista}`);
      };
      await semDica('a tela inicial');
      abrir(outra);
      await aguardar(visivel('danfe'));
      await fecharAvisosDaNota();
      await semDica('o DANFE');
      await avaliar(`document.getElementById('btn-modo-conferencia').click()`);
      await aguardar(visivel('nota'));
      await fecharAvisosDaNota();
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
            faixa: us('#faixa-leitura-texto'),
            orientacao: us('#seletor-orientacao-leitura button'),
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
      await avaliar(`document.getElementById('btn-config-inicio').click()`);
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
      await avaliar(`document.querySelector('dialog[open]').close(); true`);
      await espera(500);
    },
  );

  await caso(
    '2D: DANFE com .psxml aberto mostra o diálogo do app, só com OK, e não há caixa preta',
    async () => {
      const copiaEditada = path.join(notas, 't2d-copia-editada.psxml');
      fs.copyFileSync(
        path.join(FIXTURES, 't12-anotacao-html.psxml'),
        copiaEditada,
      );
      abrir(copiaEditada);
      await aguardar(visivel('nota'));
      await fecharAvisosDaNota();
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
        5000,
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
      await espera(300);
      confere(
        !(await avaliar(`!!document.querySelector('dialog[open]')`)),
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
      // .psxml é a cópia de trabalho: abre em edição, sem a faixa da leitura.
      confere(
        !(await avaliar(visivel('faixa-leitura'))),
        'o .psxml abriu em leitura protegida',
      );
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
