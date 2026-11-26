// Casos do test:janela para a coluna "Código da casa" da Conferência, com o
// cadastro e as NF-e inventados de test/fixtures/cadastro: a coluna apagada
// no editor sem cadastro (com o motivo), a pergunta do primeiro cadastro
// (a coluna entra depois da Descrição), as células (alta, média, sem
// sugestão), o contador do painel e o clique que leva ao próximo pendente,
// o quadro de escolha (busca, fator editado, "nenhum", confirmar a
// sugestão), o .psxml salvo e reaberto com as escolhas, a escolha lembrada
// na nota seguinte, as decisões nas Configurações, a folha do PDF só com
// texto e as capturas em 1366 e 1920 (com PS_JANELA_CAPTURAS). No fim, o
// cadastro, as decisões e o perfil voltam como estavam.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'cadastro');
const ID = 'codigoCasa';
const MOTIVO =
  'Carregue o cadastro do sistema de gestão em Documentos de referência';

async function casosCodigoCasa(ctx) {
  const {
    caso,
    avaliar,
    aguardar,
    confere,
    espera,
    janela,
    abrir,
    abrirNota,
    irParaConferencia,
    inicio,
    capturar,
    notas,
    destino,
    pdfNoDestino,
    apagarPdfs,
    visivel,
  } = ctx;
  const { dialog } = require('electron');

  const nota1 = path.join(notas, 'casa-nfe-1-alfa-matriz.xml');
  fs.copyFileSync(path.join(FIXTURES, 'nfe-1-alfa-matriz.xml'), nota1);

  const configAberta = `!!document.querySelector('dialog.painel--config[open]')`;
  const quadro = `document.querySelector('dialog.casa-quadro[open]')`;
  let configAntes = null;

  async function conferencia(caminho) {
    await abrirNota(caminho);
    await irParaConferencia();
    await aguardar(
      `!!document.querySelector('#nota td.col-${ID}')`,
      15000,
      'a coluna Código da casa não apareceu',
    );
    // O motor responde depois de a tabela aparecer.
    await aguardar(
      `!!document.querySelector('#nota td.col-${ID} .codigo-casa__codigo')`,
      15000,
      'o motor não respondeu',
    );
  }

  /** Texto da célula do Código da casa (na tela) do item. */
  const celula = (nItem) =>
    avaliar(
      `document.querySelector('#nota tbody[data-n-item="${nItem}"] td.col-${ID} .codigo-casa__tela')?.innerText.replace(/\\s+/g, ' ').trim() ?? null`,
    );
  const painelCasa = () =>
    avaliar(
      `document.querySelector('.conferencia__casa')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''`,
    );

  /**
   * Espera o painel do Código da casa ter todos os `trechos`. O painel
   * chega depois da tabela (o motor e o contador respondem à parte): com a
   * máquina ocupada, conferir na hora pegava o contador antigo.
   */
  async function aguardarPainel(...trechos) {
    await aguardar(
      `(() => { const p = document.querySelector('.conferencia__casa')?.innerText.replace(/\\s+/g, ' ') ?? ''; return ${JSON.stringify(trechos)}.every((t) => p.includes(t)); })()`,
      15000,
      `painel com ${trechos.join(' e ')}`,
    ).catch(async (e) => {
      throw new Error(`${e.message}; painel: ${await painelCasa()}`);
    });
  }

  async function abrirQuadro(nItem) {
    await avaliar(
      `document.querySelector('[aria-label="Escolher o produto da casa do item ${nItem}"]').click()`,
    );
    await aguardar(`!!${quadro}`, 10000, 'o quadro de escolha não abriu');
  }

  /** Marca a opção do quadro cujo texto começa com `inicio`. */
  const marcar = (inicio) =>
    avaliar(`(() => {
      const op = [...${quadro}.querySelectorAll('.casa-opcao')].find((l) => l.innerText.trim().startsWith(${JSON.stringify(inicio)}));
      if (!op) return false;
      const r = op.querySelector('input');
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

  const usar = () =>
    avaliar(`(() => {
      const b = [...${quadro}.querySelectorAll('footer button')].find((x) => x.textContent.trim() === 'Usar');
      b.click();
      return true;
    })()`);

  async function capturas(nome) {
    const [largura, altura] = janela().getContentSize();
    try {
      for (const [w, h] of [
        [1366, 768],
        [1920, 1040],
      ]) {
        janela().setContentSize(w, h);
        await espera(400);
        const passa = await avaliar(
          `document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`,
        );
        confere(!passa, `a página rola de lado em ${w}`);
        await capturar(`${nome}-${w}.png`);
      }
    } finally {
      janela().setContentSize(largura, altura);
      await espera(200);
    }
  }

  await caso(
    'Código da casa: sem cadastro, a coluna fica apagada no editor com o motivo',
    async () => {
      configAntes = (await avaliar('window.psApi.perfis()')).config;
      await abrirNota(nota1);
      await irParaConferencia();
      confere(
        !(await avaliar(`!!document.querySelector('#nota td.col-${ID}')`)),
        'a coluna apareceu sem cadastro',
      );
      await avaliar(`document.getElementById('btn-editar-colunas').click()`);
      await aguardar(
        `!!document.getElementById('campos-busca')`,
        15000,
        'o Editar colunas não abriu',
      );
      await avaliar(`(() => {
        const b = document.getElementById('campos-busca');
        b.value = 'Código da casa';
        b.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      await espera(200);
      const info = await avaliar(`(() => {
        const m = document.getElementById('campo-${ID}');
        const li = m?.closest('li');
        return m && {
          apagada: li.classList.contains('campos__campo--ausente'),
          rotulo: m.getAttribute('aria-label'),
          grupo: li.closest('.campos__grupo')?.querySelector('.campos__grupo-nome')?.textContent,
          texto: li.innerText,
        };
      })()`);
      confere(info, 'a coluna não está no editor');
      confere(info.apagada, 'a coluna não está apagada');
      confere(info.grupo === 'Cadastro', `grupo: ${info.grupo}`);
      confere(
        info.rotulo.includes(MOTIVO) && info.texto.includes(MOTIVO),
        `sem o motivo: ${JSON.stringify(info)}`,
      );
      await avaliar(`(() => {
        const d = document.getElementById('painel-colunas-titulo').closest('dialog[open]');
        d.dispatchEvent(new Event('cancel', { cancelable: true }));
        return true;
      })()`);
      await espera(300);
      await inicio();
    },
  );

  await caso(
    'Código da casa: o primeiro cadastro pergunta uma vez; Mostrar a coluna põe depois da Descrição',
    async () => {
      await avaliar(`document.getElementById('btn-documentos').click()`);
      await aguardar(configAberta, 15000, 'as Configurações não abriram');
      await aguardar(
        `!!document.querySelector('[data-foco="atualizar-cadastro"]')`,
        15000,
        'sem o Carregar do cadastro',
      );
      const original = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [path.join(FIXTURES, 'cadastro.json')],
      });
      try {
        await avaliar(
          `document.querySelector('[data-foco="atualizar-cadastro"]').click()`,
        );
        await aguardar(
          `[...document.querySelectorAll('dialog[open] .caixa-dialogo__titulo')].some((t) => t.textContent === 'Coluna Código da casa')`,
          30000,
          'a pergunta da coluna não apareceu',
        );
      } finally {
        dialog.showOpenDialog = original;
      }
      const antes = await avaliar('window.psApi.perfis()');
      confere(
        JSON.stringify(antes.config.colunas) ===
          JSON.stringify(configAntes.colunas),
        'o perfil mudou antes da resposta',
      );
      await avaliar(`(() => {
        const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent.trim() === 'Mostrar a coluna');
        b.click();
        return true;
      })()`);
      await aguardar(
        `window.psApi.perfis().then((e) => e.config.colunas.some((c) => c.id === '${ID}' && c.visivel))`,
        10000,
        'a coluna não entrou no perfil',
      );
      const e = await avaliar('window.psApi.perfis()');
      const ids = e.config.colunas.map((c) => c.id);
      confere(
        ids.indexOf(ID) === ids.indexOf('descricao') + 1,
        `ordem: ${ids.join(', ')}`,
      );
      const prefs = (await avaliar('window.psApi.documentos()')).preferencias;
      confere(prefs.colunaCodigoCasaPerguntada === true, 'não marcou');
      // Carregar de novo não pergunta outra vez.
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [path.join(FIXTURES, 'cadastro.json')],
      });
      try {
        await avaliar(
          `document.querySelector('[data-foco="atualizar-cadastro"]').click()`,
        );
        await espera(1500);
      } finally {
        dialog.showOpenDialog = original;
      }
      confere(
        !(await avaliar(
          `[...document.querySelectorAll('dialog[open] .caixa-dialogo__titulo')].some((t) => t.textContent === 'Coluna Código da casa')`,
        )),
        'perguntou de novo',
      );
    },
  );

  await caso(
    'Código da casa: células (alta, média, sem sugestão), contador do painel e o próximo pendente',
    async () => {
      await conferencia(nota1);
      const c1 = await celula(1);
      confere(
        c1.includes('100') &&
          c1.includes('PARAFUSO SEXTAVADO') &&
          c1.includes('100 UN por CX') &&
          c1.includes('Confiança alta'),
        `item 1: ${c1}`,
      );
      confere((await celula(3)).includes('Confiança média'), 'item 3');
      confere(
        await avaliar(
          `document.querySelector('#nota tbody[data-n-item="5"] td.col-${ID} button')?.textContent.trim() === 'Escolher'`,
        ),
        'item 5 sem o Escolher',
      );
      // Ícones do mesmo tamanho dos ícones de estado.
      const tamanhos = await avaliar(
        `[...new Set([...document.querySelectorAll('#nota .codigo-casa__sinal')].map((s) => Math.round(s.getBoundingClientRect().width)))]`,
      );
      confere(tamanhos.length === 1, `tamanhos dos ícones: ${tamanhos}`);
      await aguardarPainel(
        'Código da casa: 2 de 5 itens definidos',
        '3 precisam de você',
      );
      const foco = async () => {
        await avaliar(
          `document.querySelector('button.conferencia__casa').click()`,
        );
        await espera(300);
        return avaliar(`document.activeElement?.dataset.codigoCasa ?? null`);
      };
      confere((await foco()) === '3', 'o primeiro clique não foi ao item 3');
      confere((await foco()) === '4', 'o segundo clique não foi ao item 4');
      await capturas('codigo-casa-tabela');
    },
  );

  await caso(
    'Código da casa: quadro de escolha com a busca, fator editado, "nenhum" e confirmar a sugestão',
    async () => {
      await abrirQuadro(5);
      const texto = await avaliar(`${quadro}.textContent`);
      confere(
        texto.includes('ZZ-99') && texto.includes('Item da nota'),
        'sem o item da nota',
      );
      await avaliar(`(() => {
        const b = ${quadro}.querySelector('.casa-quadro__busca');
        b.value = 'bucha nylon';
        b.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      await aguardar(
        `${quadro}.querySelector('.casa-quadro__status').textContent.includes('achado')`,
        5000,
        'a busca não respondeu',
      );
      confere(await marcar('102'), 'sem o 102 na busca');
      await espera(300);
      await avaliar(`(() => {
        const f = ${quadro}.querySelector('.casa-quadro__fator');
        f.value = '12';
        f.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      await capturas('codigo-casa-quadro');
      await usar();
      await aguardar(`!${quadro}`, 5000, 'o quadro não fechou');
      const c5 = await celula(5);
      confere(
        c5.includes('102') && c5.includes('12 UN por PCT'),
        `item 5: ${c5}`,
      );
      // Média: "nenhum".
      await abrirQuadro(3);
      const motivo = await avaliar(`${quadro}.textContent`);
      confere(
        motivo.includes('outra filial') && motivo.includes('Confiança média'),
        'sem o motivo do candidato',
      );
      confere(await marcar('Nenhum'), 'sem o Nenhum');
      await usar();
      await aguardar(`!${quadro}`, 5000, 'o quadro não fechou');
      confere((await celula(3)).includes('Nenhum'), 'item 3 sem o Nenhum');
      // Média: confirmar a sugestão (já marcada).
      await abrirQuadro(4);
      await usar();
      await aguardar(`!${quadro}`, 5000, 'o quadro não fechou');
      confere((await celula(4)).includes('Sua escolha'), 'item 4');
      await aguardarPainel('Código da casa: 5 de 5 itens definidos');
      // A gravação da decisão não espera pela tela: aguarda as três.
      await aguardar(
        `window.psApi.documentos().then((e) => e.codigosCasa.length === 3)`,
        10000,
        'as três escolhas não ficaram lembradas',
      );
      const lembradas = (await avaliar('window.psApi.documentos()'))
        .codigosCasa;
      confere(
        lembradas.some((d) => d.cProd === 'ZZ-99' && d.fator === 12) &&
          lembradas.some((d) => d.cProd === 'BN-8' && d.codigo === null),
        `lembradas: ${JSON.stringify(lembradas)}`,
      );
    },
    { limpar: false },
  );

  /**
   * Clica no Salvar da Conferência e espera o .psxml novo e o Salvar
   * terminar (o botão volta a "Salvar"). O arquivo vai para a pasta que a
   * janela usa (a de destino, ou a da sessão se um .psxml foi aberto por
   * duplo clique nela); sem pasta, o app abre o seletor, que aqui responde
   * `escolhida` (o diálogo do Windows nunca aparece). Conta as aberturas do
   * seletor. Se o app perguntar (arquivo com o mesmo nome),
   * substitui. Sem o arquivo, a falha diz o que a tela e o app mostravam.
   */
  async function salvarPsxml(escolhida = destino) {
    const desde = Date.now() - 1000;
    const original = dialog.showOpenDialog;
    let seletor = 0;
    dialog.showOpenDialog = async () => {
      seletor++;
      return { canceled: false, filePaths: [escolhida] };
    };
    const pastaAntes = {
      principal: await avaliar('window.psApi.pastaDestino()'),
      tela: await avaliar(
        `document.getElementById('menu-pasta-caminho').textContent`,
      ),
    };
    const pasta = pastaAntes.principal.caminho ?? escolhida;
    let gravado = null;
    try {
      confere(
        !(await avaliar(`document.getElementById('btn-salvar').disabled`)),
        'o Salvar está desabilitado',
      );
      await avaliar(`document.getElementById('btn-salvar').click()`);
      const limite = Date.now() + 15000;
      while (Date.now() < limite) {
        const livre = await avaliar(`(() => {
          const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent.trim() === 'Substituir');
          if (b) b.click();
          const s = document.getElementById('btn-salvar');
          return !s.disabled && document.getElementById('btn-salvar-texto').textContent === 'Salvar';
        })()`);
        gravado =
          fs
            .readdirSync(pasta)
            .filter((n) => n.endsWith('.psxml'))
            .map((n) => path.join(pasta, n))
            .find((p) => fs.statSync(p).mtimeMs >= desde) ?? null;
        if (gravado && livre) break;
        await espera(200);
      }
    } finally {
      dialog.showOpenDialog = original;
    }
    if (!gravado)
      throw new Error(
        `o .psxml não foi gravado em ${pasta} (seletor de pasta aberto ${seletor} vez(es); pasta antes do Salvar: ${JSON.stringify(pastaAntes)}); tela: ${JSON.stringify(
          await avaliar(
            `({ mensagem: document.getElementById('mensagem-texto')?.textContent, dialogos: [...document.querySelectorAll('dialog[open]')].map((d) => d.innerText.slice(0, 300)) })`,
          ),
        )}; arquivos: ${[...fs.readdirSync(destino), ...fs.readdirSync(notas)].join(', ')}`,
      );
    return { psxml: gravado, seletor };
  }

  let psxml = null;
  await caso(
    'Código da casa: o .psxml grava as escolhas e reabre com elas',
    async () => {
      // A pasta de destino do teste está no config.json desde o começo: o
      // Salvar grava sem abrir o seletor de pasta.
      const r = await salvarPsxml();
      psxml = r.psxml;
      confere(
        r.seletor === 0,
        `com a pasta de destino definida, o Salvar abriu o seletor de pasta ${r.seletor} vez(es)`,
      );
      const t = fs.readFileSync(psxml, 'utf8');
      confere(t.includes('<codigosCasa>'), 'sem codigosCasa');
      confere(
        /<item nItem="1" codigo="100" origem="motor" confianca="alta" fator="100"/.test(
          t,
        ),
        'item 1',
      );
      confere(
        /<item nItem="5" codigo="102" origem="pessoa" fator="12"/.test(t),
        'item 5',
      );
      confere(
        /<item nItem="3" nenhum="true" origem="pessoa"/.test(t),
        'item 3',
      );
      await inicio();
      abrir(psxml);
      await aguardar(
        `${visivel('nota')} || ${visivel('danfe')}`,
        30000,
        'o .psxml não abriu',
      );
      if (!(await avaliar(visivel('nota')))) await irParaConferencia();
      await aguardar(
        `!!document.querySelector('#nota td.col-${ID} .codigo-casa__codigo')`,
        15000,
        'sem a coluna',
      );
      confere((await celula(5)).includes('12 UN por PCT'), 'item 5 reaberto');
      confere((await celula(3)).includes('Nenhum'), 'item 3 reaberto');
      // Contador do .psxml reaberto.
      await aguardarPainel('5 de 5');
    },
    { limpar: false },
  );

  await caso(
    'Código da casa: a escolha lembrada vale na nota seguinte; Configurações lista e apaga',
    async () => {
      await conferencia(nota1);
      const c5 = await celula(5);
      confere(
        c5.includes('102') && c5.includes('Decisão lembrada'),
        `item 5: ${c5}`,
      );
      confere((await celula(3)).includes('Nenhum'), 'nenhum lembrado');
      await inicio();
      // Configurações, Decisões lembradas: o filtro do tipo e o Apagar.
      await avaliar(`document.getElementById('btn-documentos').click()`);
      await aguardar(configAberta, 15000, 'as Configurações não abriram');
      await avaliar(
        `[...document.querySelectorAll('dialog.painel--config [role="tab"]')].find((b) => b.textContent.includes('Decisões')).click()`,
      );
      await aguardar(
        `!!document.querySelector('[data-foco="filtro-codigo-casa"]')`,
        10000,
        'sem o filtro Código da casa',
      );
      const chip = await avaliar(
        `document.querySelector('[data-foco="filtro-codigo-casa"]').innerText.replace(/\\s+/g, ' ')`,
      );
      confere(chip.includes('Código da casa') && chip.includes('3'), chip);
      await avaliar(
        `document.querySelector('[data-foco="filtro-codigo-casa"]').click()`,
      );
      await espera(200);
      await avaliar(
        `document.querySelector('[aria-label="Apagar a decisão de ZZ-99"]').click()`,
      );
      await aguardar(
        `window.psApi.documentos().then((e) => e.codigosCasa.length === 2)`,
        10000,
        'não apagou',
      );
    },
  );

  await caso('Código da casa: no PDF a coluna sai só como texto', async () => {
    apagarPdfs();
    await conferencia(nota1);
    const proto = Object.getPrototypeOf(janela().webContents);
    const original = proto.printToPDF;
    let folha = null;
    proto.printToPDF = async function (opcoes) {
      folha = await this.executeJavaScript(`(() => {
          const t = document.querySelector('.tabela-impressao table');
          const i = [...t.querySelectorAll('thead th')].findIndex((th) => th.dataset.coluna === '${ID}');
          const tr = t.querySelector('tbody[data-n-item="1"] tr.item__linha');
          const td = tr.children[i];
          return {
            texto: td.innerText.trim(),
            icones: t.querySelectorAll('td.col-${ID} svg').length,
            botoes: t.querySelectorAll('td.col-${ID} button').length,
          };
        })()`);
      return original.call(this, opcoes);
    };
    try {
      await avaliar(`document.getElementById('btn-salvar-mais').click()`);
      await aguardar(`!document.getElementById('menu-salvar').hidden`);
      await avaliar(`document.getElementById('btn-salvar-pdf').click()`);
      await pdfNoDestino('_Conferencia.pdf');
    } finally {
      proto.printToPDF = original;
    }
    confere(folha, 'a folha não foi montada');
    confere(
      folha.icones === 0 && folha.botoes === 0,
      `ícones ou botões na folha: ${JSON.stringify(folha)}`,
    );
    confere(
      folha.texto ===
        '100 · PARAFUSO SEXTAVADO 1/4 X 2 ZINCADO · 100 UN por CX',
      `texto: ${folha.texto}`,
    );
  });

  // XML de importação pela tela, com a nota e o cadastro inventados de
  // test/fixtures/importacao: a opção apagada sem cadastro, o resumo, a
  // cópia gravada ao lado do .psxml (o original intacto), a pergunta de
  // substituir com o foco em Cancelar e a cópia aberta com o aviso, sem
  // DANFE e sem a opção. Independente dos casos de antes: carrega o próprio
  // cadastro.
  await caso('Código da casa: Gerar XML de importação pela tela', async () => {
    const FIX_IMP = path.join(__dirname, '..', 'fixtures', 'importacao');
    const notaImp = path.join(notas, 'imp-nfe-importacao.xml');
    fs.copyFileSync(path.join(FIX_IMP, 'nfe-importacao.xml'), notaImp);
    const bytesAntes = fs.readFileSync(notaImp);
    // A pasta que a janela usa (a de destino, ou a da sessão se um .psxml
    // foi aberto por duplo clique nela).
    const pasta =
      (await avaliar('window.psApi.pastaDestino()')).caminho ?? destino;
    const copias = () =>
      fs.readdirSync(pasta).filter((n) => n.endsWith(' - importacao.xml'));
    for (const n of copias()) fs.rmSync(path.join(pasta, n));
    const abrirMenu = async () => {
      await avaliar(`document.getElementById('btn-salvar-mais').click()`);
      await aguardar(`!document.getElementById('menu-salvar').hidden`);
    };
    const opcao = () =>
      avaliar(`(() => {
        const b = document.getElementById('btn-gerar-importacao');
        return { apagada: b.disabled, ajuda: document.getElementById('menu-importacao-ajuda').textContent };
      })()`);
    const fecharMenu = () =>
      avaliar(
        `document.getElementById('menu-salvar').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
      );
    const titulos = () =>
      avaliar(
        `[...document.querySelectorAll('dialog[open] .caixa-dialogo__titulo')].map((t) => t.textContent)`,
      );

    // Sem cadastro: apagada, com o motivo.
    await avaliar('window.psApi.removerCadastro()');
    await abrirNota(notaImp);
    await irParaConferencia();
    await abrirMenu();
    const sem = await opcao();
    confere(
      sem.apagada && sem.ajuda.startsWith('Carregue o cadastro'),
      `sem cadastro: ${JSON.stringify(sem)}`,
    );
    await fecharMenu();

    // Com o cadastro inventado: o motor define os itens 1, 4, 5 e 6.
    const original = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path.join(FIX_IMP, 'cadastro.json')],
    });
    try {
      const r = await avaliar('window.psApi.importarCadastro()');
      confere(r.status === 'ok', `cadastro: ${r.status}`);
    } finally {
      dialog.showOpenDialog = original;
    }
    // O motor responde à parte: abre o menu até a opção acender.
    let com = null;
    for (let i = 0; i < 60; i++) {
      await abrirMenu();
      com = await opcao();
      if (!com.apagada) break;
      await fecharMenu();
      await espera(250);
    }
    confere(!com.apagada, `com cadastro: ${JSON.stringify(com)}`);
    await avaliar(`document.getElementById('btn-gerar-importacao').click()`);
    await aguardar(
      `!!document.querySelector('dialog.caixa-importacao[open]')`,
      15000,
      'o resumo não abriu',
    );
    const resumo = await avaliar(`(() => {
      const d = document.querySelector('dialog.caixa-importacao[open]');
      return {
        contagem: [...d.querySelectorAll('.importacao__contagem li')].map((l) => l.textContent),
        situacoes: [...d.querySelectorAll('tbody tr')].map((t) => t.dataset.situacao),
        foco: document.activeElement?.textContent.trim(),
      };
    })()`);
    confere(
      JSON.stringify(resumo.situacoes) ===
        JSON.stringify([
          'vinculado',
          'sem-produto',
          'sem-produto',
          'sem-codigo-barras',
          'convertido',
          'sem-fator',
          'sem-produto',
        ]),
      `situações: ${resumo.situacoes}`,
    );
    confere(
      resumo.contagem[0].startsWith('2 itens vão vinculados') &&
        resumo.contagem[1].startsWith('1 item convertido') &&
        resumo.contagem[2].startsWith('5 itens ficam como vieram'),
      `contagem: ${resumo.contagem.join(' | ')}`,
    );
    confere(resumo.foco === 'Gerar', `foco no resumo: ${resumo.foco}`);
    await capturar('importacao-resumo.png');
    await avaliar(`(() => {
      const b = [...document.querySelectorAll('dialog.caixa-importacao[open] footer button')].find((x) => x.textContent.trim() === 'Gerar');
      b.click();
      return true;
    })()`);
    let nomes = [];
    for (let i = 0; i < 150 && nomes.length === 0; i++) {
      await espera(100);
      nomes = copias();
    }
    if (nomes.length !== 1)
      throw new Error(
        `cópias em ${pasta}: ${nomes}; tela: ${JSON.stringify(
          await avaliar(
            `({ mensagem: document.getElementById('mensagem')?.hidden ? '' : document.getElementById('mensagem-texto')?.textContent, aviso: document.getElementById('aviso')?.innerText, dialogos: [...document.querySelectorAll('dialog[open]')].map((d) => d.innerText.slice(0, 300)) })`,
          ),
        )}; arquivos: ${fs.readdirSync(pasta).join(', ')}`,
      );
    const caminhoCopia = path.join(pasta, nomes[0]);
    const texto = fs.readFileSync(caminhoCopia, 'utf8');
    confere(
      texto.includes('<?ps-reader copia="importacao"') &&
        !texto.includes('Signature') &&
        texto.includes('<cEAN>7890000020016</cEAN>') &&
        texto.includes('<qCom>36.0000</qCom>') &&
        texto.includes('<vNF>215.00</vNF>'),
      'conteúdo da cópia',
    );
    confere(
      Buffer.compare(fs.readFileSync(notaImp), bytesAntes) === 0,
      'o XML original mudou',
    );

    // De novo: pergunta antes de substituir, com o foco em Cancelar.
    const antesDeSubstituir = fs.statSync(caminhoCopia).mtimeMs;
    await abrirMenu();
    await avaliar(`document.getElementById('btn-gerar-importacao').click()`);
    await aguardar(
      `!!document.querySelector('dialog.caixa-importacao[open]')`,
      15000,
      'o resumo não abriu de novo',
    );
    await avaliar(
      `[...document.querySelectorAll('dialog.caixa-importacao[open] footer button')].find((x) => x.textContent.trim() === 'Gerar').click()`,
    );
    await aguardar(
      `[...document.querySelectorAll('dialog[open] .caixa-dialogo__titulo')].some((t) => t.textContent === 'Arquivo já existe')`,
      15000,
      'não perguntou antes de substituir',
    );
    const foco = await avaliar(`document.activeElement?.textContent.trim()`);
    confere(foco === 'Cancelar', `foco na pergunta: ${foco}`);
    await avaliar(`document.activeElement.click()`);
    await espera(500);
    confere(
      fs.statSync(caminhoCopia).mtimeMs === antesDeSubstituir,
      'substituiu depois do Cancelar',
    );
    confere((await titulos()).length === 0, 'ficou diálogo aberto');

    // A cópia aberta: aviso, sem DANFE e sem a opção.
    await inicio();
    await abrirNota(caminhoCopia, 'nota');
    const aviso = await avaliar(
      `document.getElementById('mensagem').hidden ? '' : document.getElementById('mensagem-texto').textContent`,
    );
    confere(
      aviso.includes('cópia gerada pelo PS Reader para importar') &&
        aviso.includes('não a nota original'),
      `aviso: ${aviso}`,
    );
    const titulo = await avaliar(
      `document.getElementById('titulo-janela-textos').textContent`,
    );
    confere(
      titulo.includes('Cópia para importação, não é a nota original'),
      `título: ${titulo}`,
    );
    const leitura = await avaliar(
      `document.getElementById('painel-leitura')?.textContent ?? ''`,
    );
    confere(
      leitura.includes('O DANFE só é gerado a partir do XML original da nota.'),
      'o painel Leitura não diz que a cópia não gera DANFE',
    );
    await abrirMenu();
    const naCopia = await opcao();
    confere(
      naCopia.apagada && naCopia.ajuda.includes('já é uma cópia de importação'),
      `na cópia: ${JSON.stringify(naCopia)}`,
    );
    await fecharMenu();
    fs.rmSync(caminhoCopia, { force: true });
  });

  // Volta o cadastro, as decisões e o perfil como estavam (os casos
  // seguintes começam sem cadastro).
  await caso('Código da casa: limpeza', async () => {
    const e = await avaliar('window.psApi.documentos()');
    for (const d of e.codigosCasa)
      await avaliar(
        `window.psApi.esquecerCodigoCasa(${JSON.stringify(`${d.raizCnpj}|${d.cProd}`)})`,
      );
    await avaliar('window.psApi.removerCadastro()');
    if (configAntes)
      await avaliar(
        `window.psApi.gravarConfigConferencia(${JSON.stringify(configAntes)})`,
      );
    if (psxml) fs.rmSync(psxml, { force: true });
    apagarPdfs();
  });
}

module.exports = { casosCodigoCasa };
