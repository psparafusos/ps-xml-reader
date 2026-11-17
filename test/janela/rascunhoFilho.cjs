// Processo do app para os casos de rascunho do test:janela (rascunhos.cjs).
// Roda o próprio app, do build em .vite/, como um processo à parte, com a
// pasta de dados de PS_RASCUNHO_DADOS: assim o caso pode encerrar o processo
// à força (sem passar pelo fechamento normal) e abrir de novo com a mesma
// pasta. Cada roteiro faz a sua parte e grava o resultado em
// PS_RASCUNHO_SAIDA (JSON). O roteiro "anotar" não sai: espera ser
// encerrado. Os outros saem com app.exit (sem a pergunta de fechar).
// PS_RASCUNHO_ARQUIVO: arquivo aberto na linha de comando, como num duplo
// clique. Nenhum roteiro aciona Copiar nem usa a área de transferência.
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const MAIN = path.join(RAIZ, '.vite', 'build', 'main.cjs');
const dados = process.env.PS_RASCUNHO_DADOS;
const roteiro = process.env.PS_RASCUNHO_ROTEIRO;
const saida = process.env.PS_RASCUNHO_SAIDA;
const arquivo = process.env.PS_RASCUNHO_ARQUIVO || '';
const capturas = process.env.PS_JANELA_CAPTURAS || '';
const prefixoCaptura = process.env.PS_RASCUNHO_CAPTURA || '';

app.setPath('userData', dados);
// Janela oculta: o app chama show/maximize/focus; aqui eles não fazem nada.
app.on('browser-window-created', (_e, w) => {
  for (const m of ['show', 'showInactive', 'maximize', 'focus', 'restore'])
    w[m] = () => undefined;
});
if (arquivo) process.argv.push(arquivo);
if (process.env.PS_RASCUNHO_EXTRA)
  process.argv.push(process.env.PS_RASCUNHO_EXTRA);
require(MAIN);

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let janela = null;

const avaliar = (js, w = janela) => w.webContents.executeJavaScript(js, true);

async function aguardar(js, prazo = 30000, descricao = js, w = janela) {
  const limite = Date.now() + prazo;
  while (Date.now() < limite) {
    if (await avaliar(js, w).catch(() => false)) return;
    await espera(100);
  }
  throw new Error(`não aconteceu em ${prazo} ms: ${descricao}`);
}

function confere(cond, msg) {
  if (!cond) throw new Error(msg);
}

const visivel = (id) =>
  `(() => { const e = document.getElementById('${id}'); return !!e && !e.hidden; })()`;

const pastaRascunhos = path.join(dados, 'rascunhos');
const rascunhosNoDisco = () => {
  try {
    return fs.readdirSync(pastaRascunhos).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
};

/** Caixa aberta com este título (o diálogo do visual do app). */
const caixaAberta = (titulo) =>
  `[...document.querySelectorAll('dialog[open] .caixa-dialogo__titulo')].some((t) => t.textContent === ${JSON.stringify(titulo)})`;

/** Clica no botão com este texto na caixa aberta de cima. */
async function clicarNaCaixa(rotulo, w = janela) {
  const ok = await avaliar(
    `(() => {
      const caixas = [...document.querySelectorAll('dialog[open]')];
      const d = caixas[caixas.length - 1];
      const b = d && [...d.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(rotulo)});
      if (!b) return false;
      b.click();
      return true;
    })()`,
    w,
  );
  confere(ok, `botão ${rotulo} não achado na caixa aberta`);
}

/** Espera os avisos de abertura da nota e fecha os pop-ups deles. */
async function fecharAvisosDaNota(w = janela) {
  await aguardar(
    `!!document.querySelector('.conferencia__icone-trilho') && !document.querySelector('.conferencia__icone-trilho--carregando')`,
    30000,
    'os avisos de abertura da nota não terminaram',
    w,
  );
  let quieto = 0;
  while (quieto < 600) {
    const n = await avaliar(
      `(() => { let n = 0; for (const d of document.querySelectorAll('dialog[open]')) { d.dispatchEvent(new Event('cancel', { cancelable: true })); if (d.open) d.close(); n++; } return n; })()`,
      w,
    ).catch(() => 0);
    quieto = n > 0 ? 0 : quieto + 100;
    await espera(100);
  }
}

/** Abre a Conferência (aba PSXML) se a nota abriu no DANFE. */
async function irParaConferencia() {
  await aguardar(
    `${visivel('nota')} || ${visivel('danfe')}`,
    30000,
    'a nota não abriu',
  );
  if (!(await avaliar(visivel('nota')))) {
    await avaliar(`document.getElementById('btn-aba-psxml').click(); true`);
    await aguardar(visivel('nota'), 30000, 'a Conferência não apareceu');
  }
  await fecharAvisosDaNota();
}

/** Valores das caixas de Anotação dos itens, por nItem. */
const valoresAnotacao = () =>
  avaliar(`(() => {
    const r = {};
    for (const c of document.querySelectorAll('input.anotacao__campo')) {
      const m = /^Anotação do item (\\d+)$/.exec(c.getAttribute('aria-label') || '');
      if (m) r[m[1]] = c.value;
    }
    return r;
  })()`);

/** Digita no campo de Anotação do item, uma letra por vez (evento input). */
async function digitar(nItem, texto) {
  for (let i = 1; i <= texto.length; i++) {
    const ok = await avaliar(`(() => {
      const c = [...document.querySelectorAll('input.anotacao__campo')]
        .find((x) => x.getAttribute('aria-label') === 'Anotação do item ${nItem}');
      if (!c) return false;
      c.value = ${JSON.stringify(texto.slice(0, i))};
      c.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    confere(ok, `campo de Anotação do item ${nItem} não achado`);
    await espera(120);
  }
}

/** Grava a janela em PNG em cada largura (com PS_JANELA_CAPTURAS). */
async function capturarLarguras(nome) {
  if (!capturas || !prefixoCaptura) return [];
  const feitas = [];
  const [largura, altura] = janela.getSize();
  for (const [w, h] of [
    [680, 720],
    [1366, 768],
    [1920, 1040],
  ]) {
    janela.setSize(w, h);
    await espera(400);
    await avaliar(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`,
    );
    // Na largura da captura a página não rola de lado.
    const lado = await avaliar(
      `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
    );
    confere(lado, `rolagem de lado em ${w}`);
    janela.webContents.invalidate();
    await espera(300);
    const img = await janela.webContents.capturePage(undefined, {
      stayHidden: true,
    });
    const arquivoPng = `${prefixoCaptura}-${nome}-${w}.png`;
    fs.writeFileSync(path.join(capturas, arquivoPng), img.toPNG());
    feitas.push(arquivoPng);
  }
  janela.setSize(largura, altura);
  return feitas;
}

const TITULO_AVISO = 'Recuperar anotações';
const TITULO_PERGUNTA = 'Recuperar anotações desta nota';

/** Linhas do aviso: o texto de cada uma e a seleção dos dados. */
const linhasDoAviso = () =>
  avaliar(`(() => {
    const d = [...document.querySelectorAll('dialog[open]')].find((x) => x.querySelector('.caixa-dialogo__titulo')?.textContent === ${JSON.stringify(TITULO_AVISO)});
    if (!d) return null;
    return {
      texto: d.querySelector('.caixa-dialogo__texto').textContent,
      linhas: [...d.querySelectorAll('.rascunhos__linha')].map((li) => ({
        id: li.dataset.rascunho,
        dados: li.querySelector('.rascunhos__nota').innerText.replace(/\\s+/g, ' ').trim(),
        botoes: [...li.querySelectorAll('button')].map((b) => b.textContent.trim()),
      })),
      rodape: [...d.querySelectorAll('footer button')].map((b) => b.textContent.trim()),
      selecaoDados: getComputedStyle(d.querySelector('.rascunhos__nota')).userSelect,
      selecaoTitulo: getComputedStyle(d.querySelector('.caixa-dialogo__titulo')).userSelect,
    };
  })()`);

/** Pede o fechamento da janela e diz se apareceu a pergunta de sair. */
async function perguntaDeSair() {
  janela.close();
  try {
    await aguardar(
      caixaAberta('Anotações não salvas'),
      5000,
      'a pergunta de sair não apareceu',
    );
    return true;
  } catch {
    return false;
  }
}

const roteiros = {
  /** (a) Abre a nota, anota dois itens e espera o rascunho; não sai. */
  async anotar() {
    await irParaConferencia();
    await digitar('1', 'COD-A1');
    // Durante a digitação (menos de 2 s depois da última tecla): nada gravado.
    const durante = rascunhosNoDisco().length;
    await digitar('2', 'COD-B2');
    const limite = Date.now() + 15000;
    let lido = null;
    while (Date.now() < limite) {
      const [nome] = rascunhosNoDisco();
      if (nome) {
        const r = JSON.parse(
          fs.readFileSync(path.join(pastaRascunhos, nome), 'utf8'),
        );
        if (r.psxml.includes('COD-A1') && r.psxml.includes('COD-B2')) {
          lido = { nome, ...r };
          break;
        }
      }
      await espera(200);
    }
    confere(lido, 'o rascunho com as duas anotações não foi gravado');
    return { durante, rascunho: lido };
  },

  /** (a) Depois do fechamento à força: o aviso, Recuperar e a nota. */
  async recuperar() {
    await aguardar(caixaAberta(TITULO_AVISO), 30000, 'o aviso não apareceu');
    const aviso = await linhasDoAviso();
    const capturadas = await capturarLarguras('aviso-1-nota');
    await clicarNaCaixa('Recuperar');
    await aguardar(visivel('nota'), 30000, 'a nota recuperada não abriu');
    await aguardar(
      `!document.querySelector('dialog[open] .rascunhos__lista')`,
      5000,
      'o aviso não fechou depois de recuperar a única nota',
    );
    await fecharAvisosDaNota();
    const valores = await valoresAnotacao();
    const naConferencia = await avaliar(visivel('nota'));
    const mensagem = await avaliar(
      `document.getElementById('mensagem-texto')?.textContent ?? ''`,
    );
    const naoSalva = await perguntaDeSair();
    if (naoSalva) await clicarNaCaixa('Cancelar');
    return { aviso, valores, naConferencia, mensagem, naoSalva, capturadas };
  },

  /** (b) Anota, espera o rascunho e salva: o rascunho some. */
  async salvar() {
    await irParaConferencia();
    await digitar('1', 'SALVO-1');
    await digitar('2', 'SALVO-2');
    const limite = Date.now() + 15000;
    while (rascunhosNoDisco().length === 0 && Date.now() < limite)
      await espera(200);
    const antes = rascunhosNoDisco().length;
    await avaliar(`document.getElementById('btn-salvar').click(); true`);
    const limite2 = Date.now() + 30000;
    while (rascunhosNoDisco().length > 0 && Date.now() < limite2)
      await espera(200);
    return { antes, depois: rascunhosNoDisco().length };
  },

  /** (c) Anota, espera o rascunho e fecha escolhendo Descartar. */
  async descartar() {
    await irParaConferencia();
    await digitar('1', 'DESC-1');
    await digitar('2', 'DESC-2');
    const limite = Date.now() + 15000;
    while (rascunhosNoDisco().length === 0 && Date.now() < limite)
      await espera(200);
    const antes = rascunhosNoDisco().length;
    confere(await perguntaDeSair(), 'a pergunta de sair não apareceu');
    // A janela fecha e o app sai sozinho; o resultado vai antes.
    fs.writeFileSync(saida, JSON.stringify({ ok: true, dados: { antes } }));
    await clicarNaCaixa('Descartar');
    return null;
  },

  /** Abertura sem arquivo: diz se o aviso apareceu em 5 s. */
  async semArquivo() {
    try {
      await aguardar(caixaAberta(TITULO_AVISO), 5000);
    } catch {
      return { aviso: null };
    }
    return { aviso: await linhasDoAviso() };
  },

  /** (d) Aviso aberto: Decidir depois fecha e mantém os rascunhos. */
  async adiar() {
    await aguardar(caixaAberta(TITULO_AVISO), 30000, 'o aviso não apareceu');
    const aviso = await linhasDoAviso();
    const capturadas = await capturarLarguras('aviso-3-notas');
    await clicarNaCaixa('Decidir depois');
    await aguardar(
      `!(${caixaAberta(TITULO_AVISO)})`,
      5000,
      'Decidir depois não fechou o aviso',
    );
    return { aviso, rascunhos: rascunhosNoDisco().length, capturadas };
  },

  /** (e) Nota com rascunho aberta por duplo clique: a pergunta só dela. */
  async duploClique() {
    await aguardar(
      caixaAberta(TITULO_PERGUNTA),
      30000,
      'a pergunta da nota não apareceu',
    );
    const pergunta = await avaliar(`(() => {
      const d = [...document.querySelectorAll('dialog[open]')];
      return {
        caixas: d.map((x) => x.querySelector('.caixa-dialogo__titulo')?.textContent),
        texto: d[d.length - 1].querySelector('.caixa-dialogo__texto').textContent,
        dados: d[d.length - 1].querySelector('.rascunhos__nota').innerText.replace(/\\s+/g, ' ').trim(),
        botoes: [...d[d.length - 1].querySelectorAll('button')].map((b) => b.textContent.trim()),
        notaVisivel: !document.getElementById('nota').hidden || !document.getElementById('danfe').hidden,
      };
    })()`);
    const capturadas = await capturarLarguras('pergunta-nota');
    // Abrir sem elas pede confirmação; Voltar volta para a pergunta.
    await clicarNaCaixa('Abrir sem elas');
    await aguardar(
      caixaAberta('Abrir sem as anotações?'),
      5000,
      'a confirmação de Abrir sem elas não apareceu',
    );
    await clicarNaCaixa('Voltar');
    await aguardar(
      caixaAberta(TITULO_PERGUNTA),
      5000,
      'Voltar não trouxe a pergunta de volta',
    );
    await clicarNaCaixa('Recuperar as anotações');
    await aguardar(visivel('nota'), 30000, 'a nota recuperada não abriu');
    await fecharAvisosDaNota();
    const valores = await valoresAnotacao();
    // Esperou mais de 5 s: o aviso da abertura não apareceu (a nota estava na
    // janela).
    await espera(1500);
    const aviso = await avaliar(caixaAberta(TITULO_AVISO));
    return { pergunta, valores, aviso, capturadas };
  },
};

async function principal() {
  const limite = Date.now() + 30000;
  while (!janela && Date.now() < limite) {
    janela = BrowserWindow.getAllWindows()[0] ?? null;
    await espera(100);
  }
  confere(janela, 'a janela do app não foi criada');
  await aguardar(`document.readyState === 'complete'`, 30000);
  const fn = roteiros[roteiro];
  confere(fn, `roteiro desconhecido: ${roteiro}`);
  return fn();
}

app.whenReady().then(async () => {
  let resultado;
  try {
    const d = await principal();
    if (d === null) return;
    resultado = { ok: true, dados: d };
  } catch (erro) {
    resultado = { ok: false, erro: String(erro && erro.stack) };
  }
  fs.writeFileSync(saida, JSON.stringify(resultado));
  // "anotar" espera ser encerrado à força; os outros saem.
  if (roteiro !== 'anotar' || !resultado.ok) app.exit(0);
});
