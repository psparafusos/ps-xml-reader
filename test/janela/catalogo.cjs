// Só com PS_JANELA_CATALOGO (uma pasta): catálogo visual do app. Grava cada
// peça da interface (botões, campos, menus, janelas por cima, avisos,
// tabelas, painel, barras de rolagem, zoom) em cada estado (normal, mouse em
// cima, foco pelo teclado, pressionado, desabilitado, aberto), em 1366 e em
// 1920, mais a janela inteira de cada tela e a barra nas faixas de largura
// (1280, 1000, 900, 720 e 680). Serve para documentar o visual; não confere
// nada além de as peças existirem. Com a variável, o executar.cjs roda só
// este passo, com o app aberto vazio e os perfis inventados de
// imagensReadme.cjs; sem ela, nada daqui roda. Dados inventados: a nota de
// ferragens do README, os fixtures de teste e o CNPJ inventado da loja.
// Nenhum passo aciona Copiar.
//
// Os estados de mouse e de foco são os do próprio CSS, ligados pelo
// protocolo de depuração do Chromium (CSS.forcePseudoState), sem mexer no
// DOM. Onde o app não tem o estado num lugar fácil de alcançar (desabilitado
// num botão sempre ativo, linha piscando, processando), o passo põe o
// atributo ou a classe que o app poria e o nome do arquivo diz "forcado".
//
// Uso: PS_JANELA_CATALOGO=<pasta> npm run test:janela
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { notaReadme, pngOtimizado } = require('./imagensReadme.cjs');

const TAMANHOS = [
  [1366, 768],
  [1920, 1080],
];
/** Larguras da barra (as faixas de janela.css e a largura mínima). */
const FAIXAS = [1280, 1000, 900, 720, 680];
/** Folga em volta da peça recortada, em pixels. */
const FOLGA = 16;

async function casosCatalogo(ctx) {
  const pasta = process.env.PS_JANELA_CATALOGO;
  if (!pasta) return;
  const {
    caso,
    avaliar,
    aguardar,
    espera,
    janela,
    abrirNota,
    irParaConferencia,
    inicio,
    tmp,
    estadoLimpo,
    abrir,
    copia,
    profundoNfe,
    fecharDialogos,
  } = ctx;
  fs.mkdirSync(pasta, { recursive: true });
  const arquivoNota = path.join(tmp, 'Ferragens-Modelo-NF48213.xml');
  fs.writeFileSync(arquivoNota, notaReadme(), 'utf8');
  const gravados = [];

  const quadros = () =>
    avaliar(
      `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`,
    );

  /** Grava a janela inteira, ou o retângulo `r`, em <pasta>/<nome>.png. */
  async function gravar(nome, r) {
    await quadros();
    janela().webContents.invalidate();
    await espera(250);
    let img;
    try {
      img = await janela().webContents.capturePage(r, { stayHidden: true });
    } catch (erro) {
      // Uma captura que falha não para o catálogo: fica no log.
      console.log(
        `  (captura falhou: ${nome}: ${String(erro && erro.message)})`,
      );
      return;
    }
    const { width, height } = img.getSize();
    if (!width || !height) {
      console.log(`  (captura vazia: ${nome})`);
      return;
    }
    fs.writeFileSync(
      path.join(pasta, `${nome}.png`),
      pngOtimizado(img.toBitmap(), width, height),
    );
    gravados.push(nome);
  }

  /** Retângulo da peça (com folga), dentro da janela; null se não existe. */
  async function retangulo(seletor, folga = FOLGA) {
    return avaliar(`(() => {
      const e = document.querySelector(${JSON.stringify(seletor)});
      if (!e) return null;
      // Fora da vista (painel ou área que rola): traz para dentro.
      e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      if (r.bottom <= 0 || r.top >= innerHeight) return null;
      const x = Math.max(0, Math.floor(r.left - ${folga}));
      const y = Math.max(0, Math.floor(r.top - ${folga}));
      const w = Math.min(innerWidth, Math.ceil(r.right + ${folga})) - x;
      const h = Math.min(innerHeight, Math.ceil(r.bottom + ${folga})) - y;
      return { x, y, width: w, height: h };
    })()`);
  }

  /** Grava só a peça; avisa (sem falhar) se ela não está na tela. */
  async function recorte(nome, seletor, folga) {
    const r = await retangulo(seletor, folga);
    if (!r) {
      console.log(`  (sem ${seletor}: ${nome} não gravada)`);
      return false;
    }
    await gravar(nome, r);
    return true;
  }

  // ---------- estados pelo protocolo de depuração ----------

  const dbg = janela().webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  await dbg.sendCommand('DOM.enable');
  await dbg.sendCommand('CSS.enable');
  /** Nós com estado forçado, para soltar depois. */
  let forcados = [];

  async function soltar() {
    for (const nodeId of forcados)
      await dbg
        .sendCommand('CSS.forcePseudoState', {
          nodeId,
          forcedPseudoClasses: [],
        })
        .catch(() => null);
    forcados = [];
  }

  /** Liga as pseudo-classes `estados` na primeira peça de `seletor`. */
  async function forcar(seletor, estados) {
    const { root } = await dbg.sendCommand('DOM.getDocument', { depth: 0 });
    const { nodeId } = await dbg.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: seletor,
    });
    if (!nodeId) return false;
    await dbg.sendCommand('CSS.forcePseudoState', {
      nodeId,
      forcedPseudoClasses: estados,
    });
    forcados.push(nodeId);
    return true;
  }

  const PSEUDO = {
    hover: ['hover'],
    foco: ['focus', 'focus-visible', 'focus-within'],
    pressionado: ['hover', 'active'],
  };

  /**
   * Grava a peça `seletor` em cada estado de `estados` (normal, hover, foco,
   * pressionado, desabilitado). `area`: o que recortar (padrão: a própria
   * peça). Desabilitado põe o atributo disabled e tira depois.
   */
  async function estados(nome, seletor, lista, area = seletor, folga) {
    await avaliar(`document.activeElement?.blur(); true`);
    for (const e of lista) {
      await soltar();
      let desfazer = null;
      if (e === 'desabilitado') {
        if (
          !(await avaliar(
            `!!document.querySelector(${JSON.stringify(seletor)})`,
          ))
        ) {
          console.log(`  (sem ${seletor}: ${nome}-${e} não gravada)`);
          continue;
        }
        const ja = await avaliar(
          `!!document.querySelector(${JSON.stringify(seletor)})?.disabled`,
        );
        if (!ja) {
          await avaliar(
            `document.querySelector(${JSON.stringify(seletor)}).disabled = true; true`,
          );
          desfazer = `document.querySelector(${JSON.stringify(seletor)}).disabled = false; true`;
        }
      } else if (PSEUDO[e]) {
        if (!(await forcar(seletor, PSEUDO[e]))) {
          console.log(`  (sem ${seletor}: ${nome}-${e} não gravada)`);
          continue;
        }
      }
      const sufixo =
        e === 'desabilitado' && desfazer ? 'desabilitado-forcado' : e;
      await recorte(`${nome}-${sufixo}`, area, folga);
      if (desfazer) await avaliar(desfazer);
    }
    await soltar();
  }

  const TODOS = ['normal', 'hover', 'foco', 'pressionado', 'desabilitado'];

  async function tamanho(w, h) {
    janela().setContentSize(w, h);
    await espera(500);
    await quadros();
  }

  /** Roda `fn(sufixo)` em 1366 e em 1920. */
  async function emCadaTamanho(fn) {
    for (const [w, h] of TAMANHOS) {
      await tamanho(w, h);
      await fn(String(w));
    }
  }

  /** Abre a nota inventada e espera o Documento. */
  async function abrirNotaInventada() {
    await abrirNota(arquivoNota);
    await avaliar(`document.activeElement?.blur(); true`);
  }

  /** Clica no seletor e espera `pronto`. */
  async function clicar(seletor, pronto, prazo = 15000) {
    await avaliar(
      `document.querySelector(${JSON.stringify(seletor)}).click(); true`,
    );
    if (pronto)
      await aguardar(pronto, prazo, `nada depois de clicar ${seletor}`);
    await espera(250);
  }

  async function abrirConfiguracoes() {
    await clicar(
      '#btn-perfil',
      `!!document.querySelector('#menu-perfil:not([hidden]) .perfil-rapido__opcao--config')`,
    );
    await clicar(
      '#menu-perfil .perfil-rapido__opcao--config',
      `!!document.querySelector('dialog.painel--config[open]')`,
    );
  }

  /** Fecha o diálogo de cima como o Esc. */
  async function esc() {
    await avaliar(`(() => {
      const ds = [...document.querySelectorAll('dialog[open]')];
      const d = ds[ds.length - 1];
      if (d) d.dispatchEvent(new Event('cancel', { cancelable: true }));
      return true;
    })()`);
    await espera(300);
  }

  async function teclaCtrl(tecla) {
    const w = janela();
    w.webContents.focus();
    w.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: tecla,
      modifiers: ['control'],
    });
    w.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: tecla,
      modifiers: ['control'],
    });
    await espera(300);
  }

  /** Põe o mouse no meio da peça (dicas e efeitos feitos em script). */
  async function mouseSobre(seletor) {
    const c = await avaliar(`(() => {
      const r = document.querySelector(${JSON.stringify(seletor)})?.getBoundingClientRect();
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    })()`);
    if (!c) return false;
    janela().webContents.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y });
    return true;
  }

  async function mouseFora() {
    janela().webContents.sendInputEvent({ type: 'mouseLeave', x: 0, y: 0 });
    await espera(100);
  }

  const [larguraOriginal, alturaOriginal] = janela().getContentSize();

  // ---------- 1. tela inicial ----------

  await caso(
    'Catálogo: tela inicial (vazia), botão grande, link, lista e perfil',
    async () => {
      await emCadaTamanho(async (t) => {
        await gravar(`tela-inicial-vazia-${t}`);
        await recorte(`janela-barra-titulo-${t}`, '.titulo-janela', 0);
        await recorte(`estado-vazio-recentes-${t}`, '.inicio__recentes', 0);
        await recorte(`cartao-documentos-${t}`, '.inicio__docs', 0);
        await estados(`botao-grande-${t}`, '#btn-abrir', [
          'normal',
          'hover',
          'foco',
          'pressionado',
        ]);
        await estados(`link-${t}`, '#btn-trocar-destino', [
          'normal',
          'hover',
          'foco',
          'desabilitado',
        ]);
        await estados(`lista-linha-${t}`, '.docs-linha__abrir', [
          'normal',
          'hover',
          'foco',
        ]);
        await estados(
          `perfil-botao-${t}`,
          '#inicio-perfil .perfil-rapido__botao',
          ['normal', 'hover', 'foco'],
        );
        // Arquivo arrastado sobre a janela: a classe que o app põe no dragenter.
        await avaliar(
          `document.getElementById('area-soltar').classList.add('inicio__soltar--ativa'); true`,
        );
        await recorte(`zona-soltar-arrastando-forcado-${t}`, '#area-soltar', 0);
        await avaliar(
          `document.getElementById('area-soltar').classList.remove('inicio__soltar--ativa'); true`,
        );
      });
    },
  );

  // ---------- 2. documento e barra preta ----------

  await caso(
    'Catálogo: barra preta (abas, botões, Salvar com seta, perfil), menus e zoom',
    async () => {
      await abrirNotaInventada();
      await emCadaTamanho(async (t) => {
        await gravar(`tela-documento-${t}`);
        await recorte(`janela-barra-preta-${t}`, '#barra', 0);
        await estados(
          `aba-psxml-${t}`,
          '#btn-aba-psxml',
          ['normal', 'hover', 'foco'],
          '.barra__vistas',
        );
        await estados(
          `aba-xml-${t}`,
          '#btn-aba-xml',
          ['normal', 'hover', 'foco'],
          '.barra__vistas',
        );
        await estados(`botao-barra-${t}`, '#btn-inicio', TODOS);
        await estados(
          `botao-principal-seta-${t}`,
          '#btn-salvar',
          TODOS,
          '.salvar-grupo',
        );
        await estados(
          `botao-seta-menu-${t}`,
          '#btn-salvar-mais',
          ['normal', 'hover', 'foco', 'pressionado'],
          '.salvar-grupo',
        );
        await estados(`perfil-botao-barra-${t}`, '#btn-perfil', [
          'normal',
          'hover',
          'foco',
        ]);

        // Menu do Salvar.
        await clicar(
          '#btn-salvar-mais',
          `!!document.querySelector('#menu-salvar:not([hidden])')`,
        );
        await gravar(`menu-salvar-aberto-${t}`);
        await recorte(`menu-salvar-${t}`, '#menu-salvar', 8);
        await estados(
          `menu-item-${t}`,
          '#btn-salvar-pdf',
          ['normal', 'hover', 'foco'],
          '#menu-salvar',
          8,
        );
        await clicar(
          '#btn-salvar-mais',
          `!!document.querySelector('#menu-salvar[hidden]')`,
        );

        // Menu do perfil.
        await clicar(
          '#btn-perfil',
          `!!document.querySelector('#menu-perfil:not([hidden])')`,
        );
        await recorte(`menu-perfil-${t}`, '#menu-perfil', 8);
        await estados(
          `menu-perfil-item-${t}`,
          '#menu-perfil .perfil-rapido__opcao',
          ['normal', 'hover', 'foco'],
          '#menu-perfil',
          8,
        );
        await estados(
          `perfil-botao-aberto-${t}`,
          '#btn-perfil',
          ['normal'],
          '.barra__acoes',
          4,
        );
        await clicar(
          '#btn-perfil',
          `!!document.querySelector('#menu-perfil[hidden]')`,
        );

        // Zoom fora de 100%: o botão no canto.
        await teclaCtrl('=');
        await teclaCtrl('=');
        await aguardar(
          `!document.getElementById('btn-zoom').hidden`,
          5000,
          'o botão do zoom não apareceu',
        );
        await gravar(`zoom-documento-${t}`);
        await estados(`zoom-botao-${t}`, '#btn-zoom', [
          'normal',
          'hover',
          'foco',
        ]);
        await teclaCtrl('0');
      });
    },
  );

  // ---------- 3. Conferência: painel, tabela, campos ----------

  await caso(
    'Catálogo: Conferência (painel, tabela, ordenação, anotação, rolagem)',
    async () => {
      await abrirNotaInventada();
      await irParaConferencia();
      // Qtd recebida: a do item 3 diferente da nota (linha divergente).
      for (let i = 1; i <= 8; i++) {
        const rotulo = `Qtd recebida do item ${i}`;
        const ok = await avaliar(`(() => {
        const c = document.querySelector('input[aria-label="${rotulo}"]');
        if (!c) return false;
        c.value = '${i === 3 ? 450 : 1}';
        c.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
        if (!ok) break;
        await espera(120);
      }
      await avaliar('document.activeElement?.blur(); true');
      await espera(400);
      await emCadaTamanho(async (t) => {
        // Em 1366 o painel abre recolhido (não cabe ao lado da nota).
        if (
          await avaliar(
            `document.getElementById('painel-conferencia').dataset.estado === 'recolhido'`,
          )
        )
          await clicar(
            '.conferencia__expandir',
            `document.getElementById('painel-conferencia').dataset.estado !== 'recolhido'`,
          );
        await avaliar('document.activeElement?.blur(); true');
        await gravar(`tela-conferencia-${t}`);
        await recorte(`painel-lateral-${t}`, '#painel-conferencia', 0);
        await recorte(`painel-resultado-${t}`, '.conferencia__resultado', 8);
        await estados(`painel-linha-${t}`, '.conferencia__linha', [
          'normal',
          'hover',
          'foco',
        ]);
        await recorte(`painel-pendencia-${t}`, '.conferencia__pendencia', 8);
        await recorte(`painel-ferramenta-${t}`, '.conferencia__ferramenta', 8);
        await estados(
          `botao-ferramenta-${t}`,
          '.conferencia__ferramenta .botao--ferramenta',
          TODOS,
        );
        await estados(`botao-so-icone-${t}`, '.conferencia__recolher', [
          'normal',
          'hover',
          'foco',
        ]);

        // Tabela de itens: cabeçalho, zebra, linha divergente.
        await avaliar(`(() => {
        const t = document.querySelector('#nota table.tabela--itens');
        t.scrollIntoView({ block: 'start' });
        const a = document.getElementById('area-documento');
        a.scrollTop = Math.max(0, a.scrollTop - 120);
        return true;
      })()`);
        await quadros();
        await gravar(`tela-conferencia-tabela-${t}`);
        await recorte(`tabela-itens-${t}`, '#nota .tabela-rolagem', 0);
        await estados(
          `tabela-cabecalho-ordenavel-${t}`,
          '#nota table.tabela--itens th[data-ordenavel]',
          ['normal', 'hover', 'foco'],
          '#nota table.tabela--itens thead',
          0,
        );
        await recorte(
          `tabela-linha-divergente-${t}`,
          '#nota tbody.item--divergente',
          4,
        );
        await estados(
          `anotacao-campo-${t}`,
          'input[aria-label="Qtd recebida do item 1"]',
          ['normal', 'hover', 'foco'],
          'input[aria-label="Qtd recebida do item 1"]',
          12,
        );
        // Linha que pisca ao ser escolhida no painel (classe do app, no meio da animação).
        await avaliar(`(() => {
        const b = document.querySelectorAll('#nota tbody.item')[1];
        b.classList.remove('item--destaque'); void b.offsetWidth; b.classList.add('item--destaque');
        return true;
      })()`);
        await espera(150);
        await recorte(
          `tabela-linha-destacada-forcado-${t}`,
          '#nota tbody.item:nth-of-type(2)',
          4,
        );
        await avaliar(
          `document.querySelectorAll('#nota tbody.item')[1].classList.remove('item--destaque'); true`,
        );

        // Ordenar: barra, menu e o cabeçalho ordenado.
        await estados(
          `ordenar-botao-${t}`,
          '.ordenar__botao',
          ['normal', 'hover', 'foco'],
          '.ordenar',
          4,
        );
        await clicar(
          '.ordenar__botao',
          `!!document.querySelector('.ordenar__menu:not([hidden])')`,
        );
        await recorte(`menu-ordenar-${t}`, '.ordenar__menu', 8);
        await estados(
          `menu-ordenar-item-${t}`,
          '.ordenar__opcao',
          ['normal', 'hover', 'foco'],
          '.ordenar__menu',
          8,
        );
        await clicar('.ordenar__botao', null);
        await clicar(
          '#nota table.tabela--itens th[data-ordenavel]:nth-child(3)',
          null,
        );
        await recorte(
          `tabela-cabecalho-ordenado-${t}`,
          '#nota table.tabela--itens thead',
          0,
        );
        await recorte(`ordenar-ativo-${t}`, '.ordenar', 4);
        await estados(
          `ordenar-limpar-${t}`,
          '.ordenar__limpar',
          ['normal', 'hover', 'foco'],
          '.ordenar',
          4,
        );
        await clicar('.ordenar__limpar', null);

        // Barras de rolagem próprias da área do documento.
        await estados(
          `rolagem-area-vertical-${t}`,
          '.rolagem-area--v:not([hidden])',
          ['normal', 'hover'],
        );

        // Processando (passa de 500 ms): o atributo que o app põe.
        await avaliar(
          `document.getElementById('painel-conferencia').dataset.processando = 'true'; true`,
        );
        await recorte(
          `painel-processando-forcado-${t}`,
          '.conferencia__cabecalho',
          8,
        );

        // Painel recolhido: o trilho e os botões flutuantes.
        await clicar(
          '.conferencia__recolher',
          `document.getElementById('painel-conferencia').dataset.estado === 'recolhido'`,
        );
        await gravar(`tela-conferencia-painel-recolhido-${t}`);
        await recorte(
          `painel-trilho-processando-forcado-${t}`,
          '.conferencia__trilho',
          8,
        );
        await avaliar(
          `delete document.getElementById('painel-conferencia').dataset.processando; true`,
        );
        await recorte(`painel-trilho-${t}`, '.conferencia__trilho', 8);
        await estados(
          `botao-flutuante-${t}`,
          '.conferencia__expandir',
          ['normal', 'hover', 'foco'],
          '.conferencia__trilho',
          8,
        );
        await clicar(
          '.conferencia__expandir',
          `document.getElementById('painel-conferencia').dataset.estado !== 'recolhido'`,
        );
        await avaliar(
          `document.getElementById('area-documento').scrollTop = 0; true`,
        );
      });
    },
  );

  // ---------- 4. Salvar: aviso de sucesso e caixa de texto ----------

  await caso(
    'Catálogo: aviso de sucesso (Salvo) e caixa Salvar cópia (campo, erro, desabilitado)',
    async () => {
      await abrirNotaInventada();
      await irParaConferencia();
      await emCadaTamanho(async (t) => {
        await avaliar(`document.getElementById('btn-salvar').click(); true`);
        await aguardar(
          `!document.getElementById('aviso').hidden || !!document.querySelector('dialog[open]') || !document.getElementById('mensagem').hidden`,
          15000,
          'o Salvar não respondeu',
        );
        // Pergunta de substituir (o arquivo já existe): grava e substitui.
        if (
          await avaliar(
            `!!document.querySelector('dialog.caixa-dialogo[open] .botao--perigo')`,
          )
        ) {
          await gravar(`dialogo-arquivo-existe-${t}`);
          await avaliar(
            `document.querySelector('dialog.caixa-dialogo[open] .botao--perigo').click(); true`,
          );
        } else if (
          await avaliar(
            `!!document.querySelector('dialog[open]') || !document.getElementById('mensagem').hidden`,
          )
        ) {
          await gravar(`salvar-diagnostico-${t}`);
          const txt = await avaliar(
            `(document.querySelector('dialog[open]')?.innerText || document.getElementById('mensagem-texto').textContent).slice(0, 300)`,
          );
          throw new Error(`o Salvar mostrou outra coisa: ${txt}`);
        }
        await aguardar(
          `!document.getElementById('aviso').hidden`,
          15000,
          'o aviso Salvo não apareceu',
        );
        await espera(350);
        await gravar(`aviso-sucesso-${t}`);
        await recorte(`aviso-sucesso-recorte-${t}`, '#aviso', 8);
        await espera(1600);

        await clicar(
          '#btn-salvar-mais',
          `!!document.querySelector('#menu-salvar:not([hidden])')`,
        );
        await clicar(
          '#btn-salvar-copia',
          `!!document.querySelector('dialog.caixa-dialogo[open] .caixa-dialogo__campo')`,
        );
        await gravar(`dialogo-texto-${t}`);
        await recorte(
          `dialogo-texto-recorte-${t}`,
          'dialog.caixa-dialogo[open]',
          8,
        );
        await recorte(
          `campo-texto-foco-${t}`,
          'dialog.caixa-dialogo[open] .caixa-dialogo__linha',
          8,
        );
        await estados(
          `dialogo-botao-secundario-${t}`,
          'dialog.caixa-dialogo[open] .botao--claro',
          ['normal', 'hover', 'foco', 'pressionado'],
          'dialog.caixa-dialogo[open] .caixa-dialogo__botoes',
          4,
        );
        await estados(
          `dialogo-botao-principal-${t}`,
          'dialog.caixa-dialogo[open] .botao--principal',
          ['normal', 'hover', 'foco', 'pressionado'],
          'dialog.caixa-dialogo[open] .caixa-dialogo__botoes',
          4,
        );
        // Nome vazio: o erro embaixo e o Salvar desabilitado (do próprio app).
        await avaliar(`(() => {
        const c = document.querySelector('dialog.caixa-dialogo[open] .caixa-dialogo__campo');
        c.value = '';
        c.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
        await espera(200);
        await recorte(
          `dialogo-texto-erro-${t}`,
          'dialog.caixa-dialogo[open]',
          8,
        );
        await recorte(
          `botao-principal-desabilitado-${t}`,
          'dialog.caixa-dialogo[open] .caixa-dialogo__botoes',
          4,
        );
        await esc();
      });
    },
  );

  // ---------- 5. Editar colunas: janela grande, caixa de marcar, dica ----------

  await caso(
    'Catálogo: Editar colunas (janela, X, seletor, caixa de marcar, dica do motivo)',
    async () => {
      await abrirNotaInventada();
      await irParaConferencia();
      await emCadaTamanho(async (t) => {
        await clicar(
          '#btn-editar-colunas',
          `!!document.getElementById('painel-colunas-titulo')?.closest('dialog[open]')`,
        );
        await avaliar('document.activeElement?.blur(); true');
        await gravar(`janela-editar-colunas-${t}`);
        const d = 'dialog.painel[open]';
        await recorte(`janela-cabecalho-${t}`, `${d} .painel__cabecalho`, 0);
        await estados(
          `botao-fechar-x-${t}`,
          `${d} .painel__fechar`,
          ['normal', 'hover', 'foco'],
          `${d} .painel__cabecalho`,
          0,
        );
        await recorte(`janela-rodape-${t}`, `${d} .painel__rodape`, 0);
        await estados(
          `botao-secundario-${t}`,
          `${d} .painel__rodape .botao--claro`,
          TODOS,
        );
        await estados(
          `botao-principal-${t}`,
          `${d} .painel__rodape .botao--principal`,
          TODOS,
        );
        await estados(
          `seletor-opcao-${t}`,
          `${d} .painel__orientacao .seletor__opcao:not([aria-pressed='true'])`,
          ['normal', 'hover', 'foco', 'pressionado'],
          `${d} .painel__orientacao`,
          6,
        );
        await estados(
          `caixa-marcar-${t}`,
          `${d} .colunas-lista__marca`,
          ['normal', 'hover', 'foco'],
          `${d} .colunas-lista__item`,
          2,
        );
        await estados(
          `botao-alca-${t}`,
          `${d} .colunas-lista__alca`,
          ['normal', 'hover', 'foco'],
          `${d} .colunas-lista__item`,
          2,
        );
        // Coluna ligada sem efeito nesta nota: apagada, com o motivo na dica.
        const ausente = `${d} .colunas-lista__item--ausente`;
        if (
          await avaliar(`!!document.querySelector(${JSON.stringify(ausente)})`)
        ) {
          await avaliar(
            `document.querySelector(${JSON.stringify(ausente)}).scrollIntoView({ block: 'center' }); true`,
          );
          await quadros();
          await recorte(`opcao-apagada-${t}`, ausente, 4);
          await mouseSobre(ausente);
          await aguardar(
            `!!document.querySelector('#dica-app:popover-open')`,
            5000,
            'a dica não abriu',
          );
          await espera(150);
          await gravar(`dica-${t}`);
          const r = await avaliar(`(() => {
          const a = document.querySelector(${JSON.stringify(ausente)}).getBoundingClientRect();
          const b = document.getElementById('dica-app').getBoundingClientRect();
          const x = Math.max(0, Math.floor(Math.min(a.left, b.left) - 12));
          const y = Math.max(0, Math.floor(Math.min(a.top, b.top) - 12));
          return { x, y, width: Math.min(innerWidth, Math.ceil(Math.max(a.right, b.right) + 12)) - x, height: Math.min(innerHeight, Math.ceil(Math.max(a.bottom, b.bottom) + 12)) - y };
        })()`);
          await gravar(`dica-recorte-${t}`, r);
          await mouseFora();
        }
        // Seletor de largura da anotação (menu por cima).
        const largura = `${d} .colunas-lista__item .seletor-menu, ${d} .colunas-lista__item [aria-haspopup]`;
        if (
          await avaliar(`!!document.querySelector(${JSON.stringify(largura)})`)
        ) {
          await avaliar(
            `document.querySelector(${JSON.stringify(largura)}).scrollIntoView({ block: 'center' }); true`,
          );
          await estados(
            `seletor-largura-${t}`,
            largura,
            ['normal', 'hover', 'foco'],
            largura,
            8,
          );
        }
        await esc();
      });
    },
  );

  // ---------- 6. Configurações: abas, campos, rádio, seletor, tabela ----------

  await caso(
    'Catálogo: Configurações (abas, campos de texto e número, rádio, seletor, vazio)',
    async () => {
      await emCadaTamanho(async (t) => {
        await abrirConfiguracoes();
        const d = 'dialog.painel--config[open]';
        await avaliar('document.activeElement?.blur(); true');
        await gravar(`janela-configuracoes-geral-${t}`);
        await estados(
          `aba-lateral-${t}`,
          `${d} .config__aba:not([aria-selected='true'])`,
          ['normal', 'hover', 'foco'],
          `${d} .config__abas`,
          0,
        );
        await estados(
          `aba-lateral-ativa-${t}`,
          `${d} .config__aba[aria-selected='true']`,
          ['normal', 'foco'],
          `${d} .config__abas`,
          0,
        );
        await recorte(`cartao-${t}`, `${d} .config__cartao`, 4);
        await estados(
          `campo-numero-${t}`,
          `${d} input[type='number']`,
          ['normal', 'hover', 'foco', 'desabilitado'],
          `${d} input[type='number']`,
          12,
        );
        for (const aba of [
          'perfis',
          'ferramentas',
          'documentos',
          'decisoes',
          'dados',
        ]) {
          await avaliar(
            `[...document.querySelectorAll('${d} .config__aba')][${['geral', 'perfis', 'ferramentas', 'documentos', 'decisoes', 'dados'].indexOf(aba)}].click(); true`,
          );
          await espera(500);
          await avaliar('document.activeElement?.blur(); true');
          await gravar(`janela-configuracoes-${aba}-${t}`);
          if (aba === 'perfis')
            await recorte(`selo-${t}`, `${d} .config__selo`, 8);
          if (aba === 'decisoes')
            await estados(
              `campo-texto-${t}`,
              `${d} .config__busca`,
              ['normal', 'hover', 'foco'],
              `${d} .config__busca`,
              12,
            );
          if (aba === 'ferramentas') {
            await estados(
              `caixa-marcar-config-${t}`,
              `${d} input[type='checkbox']`,
              ['normal', 'foco'],
              `${d} .colunas-lista__item`,
              2,
            );
            await estados(
              `campo-opcao-radio-${t}`,
              `${d} .config__radio`,
              ['normal', 'foco'],
              `${d} .config__opcoes`,
              4,
            );
            const sel = `${d} .seletor-menu`;
            await estados(`seletor-menu-${t}`, sel, [
              'normal',
              'hover',
              'foco',
              'desabilitado',
            ]);
            if (
              await avaliar(`!!document.querySelector(${JSON.stringify(sel)})`)
            ) {
              await clicar(
                sel,
                `!!document.querySelector('.menu-escolha:popover-open')`,
                5000,
              ).catch(() => null);
              await gravar(`menu-escolha-aberto-${t}`);
              await recorte(
                `menu-escolha-${t}`,
                '.menu-escolha:popover-open',
                8,
              );
              await estados(
                `menu-escolha-item-${t}`,
                '.menu-escolha:popover-open [role^="menuitem"]',
                ['normal', 'hover', 'foco'],
                '.menu-escolha:popover-open',
                8,
              );
              await clicar(sel, null);
            }
          }
          if (aba === 'dados')
            await recorte(`tabela-simples-${t}`, `${d} .config__tabela`, 4);
        }
        await esc();
      });
    },
  );

  // ---------- 7. Pergunta com botão perigoso ----------

  await caso(
    'Catálogo: pergunta com botão de perigo (Excluir perfil, cancelada)',
    async () => {
      await abrirNotaInventada();
      await irParaConferencia();
      await emCadaTamanho(async (t) => {
        await clicar(
          '#btn-editar-colunas',
          `!!document.getElementById('painel-colunas-titulo')?.closest('dialog[open]')`,
        );
        const lixeira = `button[aria-label^="Excluir o perfil"]:not(:disabled)`;
        if (
          !(await avaliar(
            `!!document.querySelector(${JSON.stringify(lixeira)})`,
          ))
        ) {
          console.log('  (sem a lixeira do perfil: pergunta não gravada)');
          await esc();
          return;
        }
        await avaliar(
          `document.querySelector(${JSON.stringify(lixeira)}).click(); true`,
        );
        await aguardar(
          `!!document.querySelector('dialog.caixa-dialogo[open] .botao--perigo')`,
          5000,
          'a pergunta não abriu',
        );
        await espera(200);
        await gravar(`dialogo-pergunta-perigo-${t}`);
        await recorte(
          `dialogo-pergunta-perigo-recorte-${t}`,
          'dialog.caixa-dialogo[open]',
          8,
        );
        await estados(
          `botao-perigo-${t}`,
          'dialog.caixa-dialogo[open] .botao--perigo',
          TODOS,
          'dialog.caixa-dialogo[open] .caixa-dialogo__botoes',
          4,
        );
        await esc();
        await esc();
      });
    },
  );

  // ---------- 8. Avisos de erro e de informação ----------

  await caso(
    'Catálogo: aviso de erro e de informação (rodapé da janela)',
    async () => {
      await emCadaTamanho(async (t) => {
        await estadoLimpo();
        abrir(profundoNfe);
        await aguardar(
          `!document.getElementById('mensagem').hidden`,
          30000,
          'o aviso de erro não apareceu',
        );
        await espera(300);
        await gravar(`aviso-erro-${t}`);
        await estados(
          `aviso-erro-recorte-${t}`,
          '#mensagem-fechar',
          ['normal', 'hover', 'foco'],
          '#mensagem',
          8,
        );
        await avaliar(
          `document.getElementById('mensagem-fechar').click(); true`,
        );
      });
      // Informação: NF-e inventada em contingência (abre na Conferência).
      const contingencia = path.join(tmp, 'catalogo-contingencia.xml');
      fs.writeFileSync(
        contingencia,
        notaReadme().replace('<tpEmis>1</tpEmis>', '<tpEmis>9</tpEmis>'),
        'utf8',
      );
      await emCadaTamanho(async (t) => {
        await estadoLimpo();
        abrir(contingencia);
        await aguardar(
          `!document.getElementById('mensagem').hidden`,
          30000,
          'o aviso de informação não apareceu',
        );
        await espera(300);
        await gravar(`aviso-informacao-${t}`);
        await recorte(`aviso-informacao-recorte-${t}`, '#mensagem', 8);
        await avaliar(
          `document.getElementById('mensagem-fechar').click(); true`,
        );
        await fecharDialogos();
      });
    },
  );

  // ---------- 9. Cartão de aviso no painel ----------

  await caso(
    'Catálogo: cartão de aviso no painel Leitura (nota de outra empresa, inventada)',
    async () => {
      await emCadaTamanho(async (t) => {
        await estadoLimpo();
        abrir(copia('t22-outra-empresa.xml'));
        await aguardar(
          `!!document.querySelector('#painel-leitura .leitura__destino')`,
          30000,
          'o cartão de destino não apareceu',
        );
        await espera(500);
        await fecharDialogos();
        await avaliar('document.activeElement?.blur(); true');
        await gravar(`tela-painel-leitura-aviso-${t}`);
        await recorte(
          `painel-cartao-aviso-${t}`,
          '#painel-leitura .leitura__destino',
          8,
        );
        await estados(
          `painel-cartao-aviso-botao-${t}`,
          '#leitura-destino',
          ['normal', 'hover', 'foco'],
          '#painel-leitura .leitura__destino',
          8,
        );
      });
    },
  );

  // ---------- 10. Faixas de largura da barra ----------

  await caso(
    'Catálogo: barra nas faixas de largura (1280, 1000, 900, 720, 680)',
    async () => {
      await abrirNotaInventada();
      await irParaConferencia();
      for (const w of FAIXAS) {
        await tamanho(w, 768);
        await gravar(`janela-largura-${w}`);
        await recorte(`janela-barra-largura-${w}`, '#barra', 0);
        if (w === 720) {
          // Janela estreita: a tabela não cabe e aparecem a seta lateral e a
          // barra horizontal da área.
          await avaliar(
            `document.querySelector('#nota table.tabela--itens').scrollIntoView({ block: 'center' }); true`,
          );
          await quadros();
          await gravar('tela-tabela-estreita-720');
          await estados(
            'seta-rolagem-lateral-720',
            '.rolagem__seta--direita:not([hidden])',
            ['normal', 'hover'],
            '.rolagem__seta--direita:not([hidden])',
            24,
          );
          await estados(
            'rolagem-area-horizontal-720',
            '.rolagem-area--h:not([hidden])',
            ['normal', 'hover'],
          );
        }
      }
    },
  );

  // ---------- 11. Rolagem da página (janela baixa) ----------

  await caso(
    'Catálogo: polegar da rolagem da página (janela baixa)',
    async () => {
      await tamanho(680, 560);
      await espera(300);
      const sel = '.rolagem-pagina:not([hidden]) .rolagem-pagina__polegar';
      if (await avaliar(`!!document.querySelector(${JSON.stringify(sel)})`)) {
        await gravar('rolagem-pagina-680x560');
        await estados(
          'rolagem-pagina-polegar-680x560',
          sel,
          ['normal', 'hover'],
          '.rolagem-pagina',
          6,
        );
      } else console.log('  (a tela inicial coube: sem o polegar da página)');
    },
  );

  await soltar().catch(() => null);
  if (dbg.isAttached()) dbg.detach();
  janela().setContentSize(larguraOriginal, alturaOriginal);
  await inicio().catch(() => null);
  fs.writeFileSync(
    path.join(pasta, 'lista.txt'),
    `${gravados.join('\n')}\n`,
    'utf8',
  );
  console.log(`Catálogo: ${gravados.length} capturas em ${pasta}`);
}

module.exports = { casosCatalogo };
