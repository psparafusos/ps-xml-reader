// Processo do app para os casos da tela de boas-vindas do test:janela
// (boasVindas.cjs). Roda o próprio app, do build em .vite/, com a pasta de
// dados de PS_BV_DADOS e a pasta Documentos trocada por PS_BV_DOCUMENTOS
// (a pasta de destino sugerida nunca cai nos Documentos de quem roda o
// teste). Cada roteiro grava o resultado em PS_BV_SAIDA (JSON) e sai.
// PS_BV_ARQUIVO: arquivo aberto na linha de comando, como num duplo clique;
// PS_BV_EXTRA: uma opção a mais (--squirrel-firstrun). Nenhum roteiro usa a
// área de transferência.
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..', '..');
const MAIN = path.join(RAIZ, '.vite', 'build', 'main.cjs');
const dados = process.env.PS_BV_DADOS;
const roteiro = process.env.PS_BV_ROTEIRO;
const saida = process.env.PS_BV_SAIDA;
const arquivo = process.env.PS_BV_ARQUIVO || '';
const capturas = process.env.PS_JANELA_CAPTURAS || '';
const prefixoCaptura = process.env.PS_BV_CAPTURA || '';

app.setPath('userData', dados);
app.setPath('documents', process.env.PS_BV_DOCUMENTOS);
// Janela oculta: o app chama show/maximize/focus; aqui eles não fazem nada.
app.on('browser-window-created', (_e, w) => {
  for (const m of ['show', 'showInactive', 'maximize', 'focus', 'restore'])
    w[m] = () => undefined;
});
if (arquivo) process.argv.push(arquivo);
if (process.env.PS_BV_EXTRA) process.argv.push(process.env.PS_BV_EXTRA);
require(MAIN);

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let janela = null;

const avaliar = (js) => janela.webContents.executeJavaScript(js, true);

async function aguardar(js, prazo = 30000, descricao = js) {
  const limite = Date.now() + prazo;
  while (Date.now() < limite) {
    if (await avaliar(js).catch(() => false)) return;
    await espera(100);
  }
  throw new Error(`não aconteceu em ${prazo} ms: ${descricao}`);
}

function confere(cond, msg) {
  if (!cond) throw new Error(msg);
}

const visivel = (id) =>
  `(() => { const e = document.getElementById('${id}'); return !!e && !e.hidden; })()`;

const TELA = `!!document.querySelector('dialog.boas-vindas[open]')`;

const lerConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dados, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
};

/** O que a tela mostra: textos, campos, botões e a seleção de texto. */
const lerTela = () =>
  avaliar(`(() => {
    const d = document.querySelector('dialog.boas-vindas[open]');
    if (!d) return null;
    const q = (s) => d.querySelector(s);
    const sel = (s) => (q(s) ? getComputedStyle(q(s)).userSelect : null);
    return {
      titulo: q('.boas-vindas__titulo')?.textContent ?? '',
      textos: [...d.querySelectorAll('p, label, h2')].map((x) => x.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean),
      cnpj: q('#boas-vindas-cnpj')?.value ?? null,
      perfil: q('#boas-vindas-perfil')?.value ?? null,
      pasta: q('.boas-vindas__caminho')?.textContent ?? null,
      sugestao: q('.boas-vindas__sugestao-cnpj')?.textContent ?? null,
      erro: [...d.querySelectorAll('.boas-vindas__erro')].filter((e) => !e.hidden).map((e) => e.textContent),
      invalido: q('#boas-vindas-cnpj')?.getAttribute('aria-invalid') ?? null,
      botoes: [...d.querySelectorAll('button')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim()),
      semNome: [...d.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length,
      selecaoTitulo: sel('.boas-vindas__titulo'),
      selecaoRotulo: sel('label'),
      selecaoBotao: sel('button'),
      selecaoTexto: sel('.boas-vindas__texto'),
      selecaoCampo: sel('#boas-vindas-cnpj'),
      selecaoCaminho: sel('.boas-vindas__caminho'),
      selecaoSugestao: sel('.boas-vindas__sugestao-cnpj'),
      notaAberta: !document.getElementById('nota').hidden || !document.getElementById('danfe').hidden,
    };
  })()`);

/** Escreve no campo do CNPJ (evento input), como a pessoa digitando. */
const digitarCnpj = (texto) =>
  avaliar(`(() => {
    const c = document.getElementById('boas-vindas-cnpj');
    c.value = ${JSON.stringify(texto)};
    c.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);

const clicar = (rotulo) =>
  avaliar(`(() => {
    const b = [...document.querySelectorAll('dialog.boas-vindas[open] button')].find((x) => x.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(rotulo)});
    if (!b) return false;
    b.click();
    return true;
  })()`).then((ok) => confere(ok, `botão ${rotulo} não achado na tela`));

/** Espera a resposta do Começar (erro na tela ou a tela fechada). */
async function comecar() {
  await clicar('Começar');
  await aguardar(
    `!document.querySelector('dialog.boas-vindas[open]') || [...document.querySelectorAll('.boas-vindas__erro')].some((e) => !e.hidden) || !document.querySelector('dialog.boas-vindas[open] .boas-vindas__comecar').disabled`,
    15000,
    'o Começar não respondeu',
  );
  await espera(300);
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

/** Em cada largura, a tela cabe sem rolar de lado e o Começar fica à mostra. */
async function medirLarguras() {
  const medidas = [];
  const [largura, altura] = janela.getSize();
  for (const [w, h] of [
    [680, 720],
    [1366, 768],
    [1920, 1040],
  ]) {
    janela.setSize(w, h);
    await espera(400);
    medidas.push(
      await avaliar(`(() => {
        const d = document.querySelector('dialog.boas-vindas[open]');
        const b = d.querySelector('.boas-vindas__comecar');
        b.scrollIntoView({ block: 'nearest' });
        const r = b.getBoundingClientRect();
        return {
          largura: ${w},
          janela: window.innerWidth,
          ladoPagina: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ladoTela: d.scrollWidth <= d.clientWidth,
          botaoNaTela: r.right <= window.innerWidth && r.bottom <= window.innerHeight && r.top >= 0,
        };
      })()`),
    );
  }
  janela.setSize(largura, altura);
  return medidas;
}

const roteiros = {
  /**
   * Primeira abertura sem configuração: a tela, o Esc que não fecha, o CNPJ
   * vazio e o inválido que não passam e o válido que grava e mostra a tela
   * inicial.
   */
  async primeira() {
    await aguardar(TELA, 30000, 'a tela de boas-vindas não apareceu');
    const tela = await lerTela();
    const medidas = await medirLarguras();
    // Esc (o cancel do <dialog>) não fecha a tela.
    await avaliar(
      `document.querySelector('dialog.boas-vindas').dispatchEvent(new Event('cancel', { cancelable: true })); true`,
    );
    await espera(300);
    const depoisEsc = await avaliar(TELA);
    // Ctrl+O com a tela aberta não abre o diálogo de arquivo.
    const { dialog } = require('electron');
    let dialogos = 0;
    const original = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => {
      dialogos++;
      return { canceled: true, filePaths: [] };
    };
    await avaliar(
      `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true })); true`,
    );
    await espera(500);
    dialog.showOpenDialog = original;

    await digitarCnpj('');
    await comecar();
    const vazio = await lerTela();
    await digitarCnpj('12.345.678/0001-94');
    await comecar();
    const invalido = await lerTela();
    const capturadas = await capturarLarguras('cnpj-invalido');
    const configInvalido = lerConfig();
    await digitarCnpj('12.345.678/0001-95');
    await comecar();
    await aguardar(`!(${TELA})`, 15000, 'a tela não fechou com CNPJ válido');
    await aguardar(visivel('vazio'), 5000, 'a tela inicial não apareceu');
    const config = lerConfig();
    const perfis = await avaliar('window.psApi.perfis()');
    const avisos = await avaliar('window.psApi.configAvisos()');
    return {
      tela,
      medidas,
      depoisEsc,
      dialogos,
      vazio,
      invalido,
      configInvalido,
      config,
      perfis,
      avisos,
      capturadas,
    };
  },

  /**
   * Atualização de uma versão anterior (perfis, pasta e notas recentes, sem
   * CNPJ): a sugestão das notas, nada gravado sozinho, e Começar com a
   * sugestão mantém perfis e pasta.
   */
  async atualizacao() {
    await aguardar(TELA, 30000, 'a tela de boas-vindas não apareceu');
    await aguardar(
      `!!document.querySelector('dialog.boas-vindas[open] .boas-vindas__sugestao-cnpj')`,
      15000,
      'a sugestão do CNPJ não apareceu',
    );
    const tela = await lerTela();
    const capturadas = await capturarLarguras('sugestao');
    // Esperou: a sugestão não foi gravada sozinha.
    await espera(1000);
    const configAntes = lerConfig();
    await clicar('Usar este CNPJ');
    const depoisUsar = await lerTela();
    await comecar();
    await aguardar(`!(${TELA})`, 15000, 'a tela não fechou');
    await aguardar(visivel('vazio'), 5000, 'a tela inicial não apareceu');
    return { tela, configAntes, depoisUsar, config: lerConfig(), capturadas };
  },

  /** Com CNPJ gravado: a tela não aparece em 5 s. */
  async comCnpj() {
    await aguardar(visivel('vazio'), 30000, 'a tela inicial não apareceu');
    try {
      await aguardar(TELA, 5000);
    } catch {
      return { tela: false };
    }
    return { tela: true };
  },

  /**
   * Arquivo pela linha de comando com a tela aberta: a nota espera a tela e
   * abre depois do Começar.
   */
  async comArquivo() {
    await aguardar(TELA, 30000, 'a tela de boas-vindas não apareceu');
    await espera(2000);
    const antes = await lerTela();
    await digitarCnpj('12345678000195');
    await comecar();
    await aguardar(`!(${TELA})`, 15000, 'a tela não fechou');
    await aguardar(
      `${visivel('nota')} || ${visivel('danfe')}`,
      30000,
      'a nota guardada não abriu depois da tela',
    );
    return { antes, config: lerConfig() };
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
    resultado = { ok: true, dados: await principal() };
  } catch (erro) {
    resultado = { ok: false, erro: String(erro && erro.stack) };
  }
  fs.writeFileSync(saida, JSON.stringify(resultado));
  app.exit(0);
});
