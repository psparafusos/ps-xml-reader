// Casos do test:janela para a área do documento (Conferência e Documento):
// só ela rola, em qualquer zoom (a barra de título, a barra preta, as abas e
// os painéis ficam parados e a página não rola de lado); o Ctrl + roda (e a
// pinça do touchpad, que chega como roda com Ctrl) deixa o ponto do
// documento embaixo do cursor; Ctrl + mais e Ctrl + menos mantêm o centro da
// parte visível; as barras de rolagem próprias aparecem, o polegar arrasta e
// o clique no trilho rola uma página; o fundo preenche a área em 50%. E o
// aviso de destino: a nota de outra empresa (t22) abre sem janela e com o
// cartão de aviso no painel Leitura; a nota emitida pela loja (t23) mostra o
// cartão de informação. NF-e e documentos inventados (fixtures). Com
// PS_JANELA_CAPTURAS, capturas em 1366 e 1920. Nenhum caso aciona Copiar.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIXTURES = path.join(__dirname, 'fixtures');
const AREA = `document.getElementById('area-documento')`;
const DOIS_QUADROS = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`;
/** Tolerância do ponto parado no zoom, em pixels. */
const TOLERANCIA = 4;

async function casosZoomRolagem(c) {
  const {
    caso,
    avaliar,
    aguardar,
    confere,
    espera,
    abrir,
    notas,
    visivel,
    irParaConferencia,
    capturar,
  } = c;
  const janela = () => c.janela();

  function copia(nome) {
    const alvo = path.join(notas, nome);
    fs.copyFileSync(path.join(FIXTURES, nome), alvo);
    return alvo;
  }

  const quadros = () => avaliar(DOIS_QUADROS);

  /** Tecla de verdade com Ctrl ('=', '-' ou '0'), pelo teclado da janela. */
  async function teclaZoom(tecla) {
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
    await quadros();
  }

  /** Zoom que se vê na área (o da Conferência ou o do Documento). */
  const zoomVisto = () =>
    avaliar(`(() => {
      const n = document.getElementById('nota');
      const d = document.getElementById('danfe');
      const e = !n.hidden ? n : d;
      return Number(e.style.zoom || 1);
    })()`);

  /** Leva o zoom a `alvo` (um dos níveis) pelo teclado, a partir de 100%. */
  async function zoomEm(alvo) {
    await teclaZoom('0');
    for (let i = 0; i < 12; i++) {
      const z = await zoomVisto();
      if (Math.abs(z - alvo) < 1e-6) return;
      await teclaZoom(z < alvo ? '=' : '-');
    }
    throw new Error(`o zoom não chegou a ${alvo}: ${await zoomVisto()}`);
  }

  /** Roda do mouse com Ctrl em (x, y): deltaY positivo aproxima. */
  async function rodaComCtrl(x, y, deltaY) {
    await avaliar(`(() => {
      window.__rodasCtrl ??= 0;
      if (!window.__contaRodasCtrl) {
        window.__contaRodasCtrl = true;
        addEventListener('wheel', (e) => { if (e.ctrlKey) window.__rodasCtrl++; }, { capture: true, passive: true });
      }
      return true;
    })()`);
    const antes = await avaliar('window.__rodasCtrl');
    janela().webContents.sendInputEvent({
      type: 'mouseWheel',
      x,
      y,
      deltaX: 0,
      deltaY,
      canScroll: true,
      modifiers: ['control'],
    });
    await aguardar(
      `window.__rodasCtrl > ${antes}`,
      10000,
      'a roda com Ctrl não chegou',
    );
    await quadros();
  }

  /**
   * O ponto (x, y) visto numa folha: a folha embaixo dele (índice) e a
   * posição dentro dela, em fração.
   */
  const pontoNaFolha = (x, y) =>
    avaliar(`(() => {
      const el = document.elementFromPoint(${x}, ${y});
      const folha = el && el.closest('#danfe .folha');
      if (!folha) return null;
      const r = folha.getBoundingClientRect();
      return {
        i: [...document.querySelectorAll('#danfe .folha')].indexOf(folha),
        fx: (${x} - r.left) / r.width,
        fy: (${y} - r.top) / r.height,
      };
    })()`);

  /** Onde está agora, na janela, o ponto `p` (de pontoNaFolha). */
  const ondeEsta = (p) =>
    avaliar(`(() => {
      const r = document.querySelectorAll('#danfe .folha')[${p.i}].getBoundingClientRect();
      return { x: r.left + ${p.fx} * r.width, y: r.top + ${p.fy} * r.height };
    })()`);

  /** Centro da parte visível da área (fora do painel aberto ao lado). */
  const centroVisivel = () =>
    avaliar(`(() => {
      const a = ${AREA};
      const r = a.getBoundingClientRect();
      let esq = r.left;
      for (const id of ['painel-conferencia', 'painel-leitura']) {
        const p = document.getElementById(id);
        if (p.hidden || p.dataset.estado !== 'aberto' || p.dataset.layout === 'sobre') continue;
        esq = Math.max(esq, p.getBoundingClientRect().right);
      }
      return { x: (esq + r.left + a.clientWidth) / 2, y: r.top + a.clientHeight / 2 };
    })()`);

  /** Rola a área para o meio (o ponto do zoom não bate na borda). */
  const rolarParaOMeio = () =>
    avaliar(`(() => {
      const a = ${AREA};
      a.scrollLeft = (a.scrollWidth - a.clientWidth) / 2;
      a.scrollTop = (a.scrollHeight - a.clientHeight) / 2;
      return true;
    })()`);

  /** Posição das barras do alto e o estado da rolagem da página e da área. */
  const medirTela = () =>
    avaliar(`(() => {
      const caixa = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
      };
      const d = document.documentElement;
      const a = ${AREA};
      return {
        titulo: caixa('#titulo-janela'),
        barra: caixa('#barra'),
        abaPsxml: caixa('#btn-aba-psxml'),
        abaXml: caixa('#btn-aba-xml'),
        painel: caixa('#painel-leitura:not([hidden])') || caixa('#painel-conferencia:not([hidden])'),
        paginaLado: d.scrollWidth > d.clientWidth,
        paginaAlto: d.scrollHeight > d.clientHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        areaLado: a.scrollWidth > a.clientWidth + 1,
        areaAlto: a.scrollHeight > a.clientHeight + 1,
        largura: innerWidth,
      };
    })()`);

  /**
   * Em `zoom`, rola a área até o fim na horizontal e na vertical e confere
   * que as barras do alto e o painel não saíram do lugar e que a página não
   * rola (nem de lado). `lado`: a área precisa rolar de lado.
   */
  async function confereSoAreaRola(rotulo, zoom, lado) {
    await zoomEm(1);
    await avaliar(`${AREA}.scrollTo(0, 0); true`);
    await quadros();
    const antes = await medirTela();
    await zoomEm(zoom);
    await avaliar(
      `(() => { const a = ${AREA}; a.scrollLeft = a.scrollWidth; a.scrollTop = a.scrollHeight / 2; window.scrollTo(99999, 99999); return true; })()`,
    );
    await quadros();
    const depois = await medirTela();
    for (const k of ['titulo', 'barra', 'abaPsxml', 'abaXml', 'painel'])
      confere(
        JSON.stringify(antes[k]) === JSON.stringify(depois[k]),
        `${rotulo}: ${k} saiu do lugar em ${zoom * 100}%: ${JSON.stringify(antes[k])} -> ${JSON.stringify(depois[k])}`,
      );
    confere(
      !depois.paginaLado && !depois.paginaAlto,
      `${rotulo}: a página rola em ${zoom * 100}% (${JSON.stringify(depois)})`,
    );
    confere(
      depois.scrollX === 0 && depois.scrollY === 0,
      `${rotulo}: a página andou (${depois.scrollX}, ${depois.scrollY})`,
    );
    confere(depois.areaAlto, `${rotulo}: a área não rola na vertical`);
    if (lado) confere(depois.areaLado, `${rotulo}: a área não rola de lado`);
    const rolou = await avaliar(`${AREA}.scrollLeft`);
    if (lado) confere(rolou > 0, `${rotulo}: a área não rolou de lado`);
  }

  /** Espera a nota abrir e os avisos de abertura terminarem, sem fechar janelas. */
  async function abrirSemFecharJanelas(caminho, tela = 'danfe') {
    abrir(caminho);
    try {
      await aguardar(visivel(tela), 30000, `a nota não abriu em ${tela}`);
    } catch (erro) {
      const onde = await avaliar(`JSON.stringify({
        telas: ['vazio', 'nota', 'danfe', 'barra'].filter((id) => !document.getElementById(id).hidden),
        mensagem: document.getElementById('mensagem').hidden ? null : document.getElementById('mensagem-texto').textContent,
        dialogos: [...document.querySelectorAll('dialog[open]')].map((d) => d.textContent.slice(0, 200)),
      })`).catch(() => '?');
      throw new Error(`${erro.message}: ${onde}`);
    }
    await aguardar(
      `!!document.querySelector('#painel-conferencia .conferencia__icone-trilho') && !document.querySelector('.conferencia__icone-trilho--carregando')`,
      30000,
      'os avisos de abertura da nota não terminaram',
    );
    // Folga para um pop-up atrasado aparecer, se fosse aparecer.
    await espera(1200);
    await quadros();
  }

  const comTamanho = async (w, h, fn) => {
    const [largura, altura] = janela().getContentSize();
    try {
      janela().setContentSize(w, h);
      await espera(300);
      await quadros();
      await fn();
    } finally {
      // O zoom de cada modo vale até fechar o app: volta a 100% para os
      // casos seguintes, mesmo com falha no meio.
      await avaliar(
        `document.getElementById('teste-sem-transicao')?.remove(); true`,
      ).catch(() => {});
      if (!(await avaliar(`${AREA}.hidden`).catch(() => true)))
        await teclaZoom('0').catch(() => {});
      janela().setContentSize(largura, altura);
      await espera(200);
    }
  };

  await caso(
    'Área do documento em 200%: barra de título, barra preta, abas e painel parados; a página não rola, só a área',
    async () => {
      await comTamanho(1366, 768, async () => {
        await abrirSemFecharJanelas(copia('t22-outra-empresa.xml'));
        await confereSoAreaRola('Documento (DANFE)', 2, true);
        await capturar('zoom-200-danfe-1366.png');
        janela().setContentSize(1920, 1040);
        await espera(300);
        await quadros();
        await capturar('zoom-200-danfe-1920.png');
        janela().setContentSize(1366, 768);
        await espera(300);
        await irParaConferencia();
        await confereSoAreaRola('Conferência', 2, false);
        await capturar('zoom-200-conferencia-1366.png');
        janela().setContentSize(1920, 1040);
        await espera(300);
        await quadros();
        await capturar('zoom-200-conferencia-1920.png');
        await teclaZoom('0');
        // Formato original: sem zoom; Ctrl + mais não muda nada e a página
        // não rola.
        janela().setContentSize(1366, 768);
        await espera(300);
        await avaliar(`document.getElementById('btn-aba-xml').click()`);
        await aguardar(visivel('danfe'));
        await teclaZoom('0');
        await avaliar(`document.getElementById('btn-modo-formato').click()`);
        await aguardar(
          `!!document.querySelector('.formato-original') && !document.querySelector('.formato-original').hidden`,
          15000,
          'o Formato original não apareceu',
        );
        const antes = await medirTela();
        await teclaZoom('=');
        await teclaZoom('=');
        const depois = await medirTela();
        confere(
          JSON.stringify(antes.barra) === JSON.stringify(depois.barra) &&
            !depois.paginaLado &&
            depois.scrollX === 0,
          `Formato original: a tela mudou com Ctrl + mais (${JSON.stringify({ antes, depois })})`,
        );
        confere(
          (await avaliar(`${AREA}.hidden`)) === true,
          'a área do documento aparece no Formato original',
        );
      });
    },
  );

  await caso(
    'Área do documento em 200%: cada tipo do modo Documento (DANFSe, DACTE, Evento, DANFE NFC-e)',
    async () => {
      await comTamanho(1366, 768, async () => {
        const tipos = [
          'd01-nfse-abrasf.xml',
          'd02-nfse-nacional.xml',
          'd03-cte.xml',
          'd04-evento-cce.xml',
          'd05-evento-cancelamento.xml',
          'd07-nfce.xml',
        ];
        for (const nome of tipos) {
          await c.inicio().catch(() => {});
          abrir(copia(nome));
          await aguardar(
            `!!document.querySelector('#danfe:not([hidden]) .folha')`,
            30000,
            `${nome}: o documento não apareceu`,
          );
          await espera(600);
          // Fecha um pop-up de abertura da NFC-e, se houver.
          await avaliar(
            `(() => { for (const d of document.querySelectorAll('dialog[open]')) { d.dispatchEvent(new Event('cancel', { cancelable: true })); if (d.open) d.close(); } return true; })()`,
          );
          // A bobina da NFC-e é estreita: em 200% não passa da largura.
          await confereSoAreaRola(nome, 2, !nome.includes('nfce'));
          await teclaZoom('0');
        }
      });
    },
  );

  await caso(
    'Ctrl + roda (e pinça) deixa o ponto do documento embaixo do cursor; o zoom da janela não muda',
    async () => {
      await comTamanho(1366, 768, async () => {
        await abrirSemFecharJanelas(copia('t22-outra-empresa.xml'));
        await zoomEm(1.5);
        await rolarParaOMeio();
        await quadros();
        for (const [x, y] of [
          [900, 450],
          [640, 300],
        ]) {
          const p = await pontoNaFolha(x, y);
          confere(p, `nenhuma folha embaixo de (${x}, ${y})`);
          const z0 = await zoomVisto();
          await rodaComCtrl(x, y, 120);
          const z1 = await zoomVisto();
          confere(z1 > z0, `o Ctrl + roda não aproximou: ${z0} -> ${z1}`);
          const agora = await ondeEsta(p);
          confere(
            Math.abs(agora.x - x) <= TOLERANCIA &&
              Math.abs(agora.y - y) <= TOLERANCIA,
            `o ponto saiu de baixo do cursor em ${z1 * 100}%: (${x}, ${y}) -> (${agora.x.toFixed(1)}, ${agora.y.toFixed(1)})`,
          );
          // Afastar também deixa o ponto parado.
          const p2 = await pontoNaFolha(x, y);
          await rodaComCtrl(x, y, -120);
          const volta = await ondeEsta(p2);
          confere(
            Math.abs(volta.x - x) <= TOLERANCIA &&
              Math.abs(volta.y - y) <= TOLERANCIA,
            `o ponto saiu de baixo do cursor ao afastar: (${x}, ${y}) -> (${volta.x.toFixed(1)}, ${volta.y.toFixed(1)})`,
          );
        }
        // Pinça do touchpad: vários eventos pequenos de roda com Ctrl, que
        // somados dão um nível.
        const [x, y] = [820, 420];
        const p = await pontoNaFolha(x, y);
        const z0 = await zoomVisto();
        for (let i = 0; i < 4; i++) await rodaComCtrl(x, y, 18);
        const z1 = await zoomVisto();
        confere(z1 > z0, `a pinça não aproximou: ${z0} -> ${z1}`);
        const agora = await ondeEsta(p);
        confere(
          Math.abs(agora.x - x) <= TOLERANCIA &&
            Math.abs(agora.y - y) <= TOLERANCIA,
          `a pinça tirou o ponto de baixo do cursor: (${x}, ${y}) -> (${agora.x.toFixed(1)}, ${agora.y.toFixed(1)})`,
        );
        // O Ctrl + roda nunca muda o zoom da interface do Electron.
        confere(
          janela().webContents.getZoomFactor() === 1,
          `o zoom da janela mudou: ${janela().webContents.getZoomFactor()}`,
        );
        const barra = await avaliar(
          `Math.round(document.getElementById('barra').getBoundingClientRect().height)`,
        );
        await rodaComCtrl(683, 60, 120);
        confere(
          janela().webContents.getZoomFactor() === 1 &&
            (await avaliar(
              `Math.round(document.getElementById('barra').getBoundingClientRect().height)`,
            )) === barra,
          'Ctrl + roda sobre a barra mudou o zoom da interface',
        );
        await teclaZoom('0');
      });
    },
  );

  await caso(
    'Ctrl + mais e Ctrl + menos mantêm o centro da parte visível do documento',
    async () => {
      await comTamanho(1366, 768, async () => {
        await abrirSemFecharJanelas(copia('t22-outra-empresa.xml'));
        await zoomEm(1.5);
        await rolarParaOMeio();
        await quadros();
        for (const tecla of ['=', '=', '-', '-']) {
          const centro = await centroVisivel();
          const p = await pontoNaFolha(centro.x, centro.y);
          confere(p, 'nenhuma folha no centro da área');
          const z0 = await zoomVisto();
          await teclaZoom(tecla);
          const z1 = await zoomVisto();
          confere(z1 !== z0, `Ctrl ${tecla} não mudou o zoom (${z0})`);
          const agora = await ondeEsta(p);
          confere(
            Math.abs(agora.x - centro.x) <= TOLERANCIA &&
              Math.abs(agora.y - centro.y) <= TOLERANCIA,
            `Ctrl ${tecla} (${z0 * 100}% -> ${z1 * 100}%) tirou o centro do lugar: (${centro.x.toFixed(1)}, ${centro.y.toFixed(1)}) -> (${agora.x.toFixed(1)}, ${agora.y.toFixed(1)})`,
          );
        }
        await teclaZoom('0');
      });
    },
  );

  await caso(
    'Barras de rolagem da área: finas em repouso, grossas com o mouse em cima, polegar arrasta, trilho rola uma página, horizontal só quando precisa',
    async () => {
      await comTamanho(1366, 768, async () => {
        await abrirSemFecharJanelas(copia('t22-outra-empresa.xml'));
        await zoomEm(1);
        await avaliar(`${AREA}.scrollTo(0, 0); true`);
        await quadros();
        const barras = () =>
          avaliar(`(() => {
            const b = (eixo) => {
              const t = document.querySelector('.rolagem-area--' + eixo);
              const p = t.querySelector('.rolagem-area__polegar');
              const r = p.getBoundingClientRect();
              return {
                visivel: !t.hidden,
                x: r.left + r.width / 2,
                y: r.top + r.height / 2,
                largura: r.width,
                altura: r.height,
                trilho: t.getBoundingClientRect().toJSON(),
              };
            };
            return { v: b('v'), h: b('h'), areaLargura: ${AREA}.clientWidth, janela: innerWidth };
          })()`);
        // Em 100% a folha cabe na largura: só a vertical.
        let b = await barras();
        confere(b.v.visivel, 'a barra vertical não aparece');
        confere(!b.h.visivel, 'a barra horizontal aparece sem precisar');
        confere(
          b.areaLargura === b.janela,
          `a barra ocupa largura: área ${b.areaLargura}, janela ${b.janela}`,
        );
        // A janela oculta do teste não anda as transições: desligadas só
        // nesta medida, a largura é a final de cada estado.
        await avaliar(`(() => {
          const e = document.createElement('style');
          e.id = 'teste-sem-transicao';
          e.textContent = '.rolagem-area, .rolagem-area__polegar { transition: none !important; }';
          document.head.append(e);
          return true;
        })()`);
        // Em repouso: fina. Rolando: mais grossa e escura, e volta a ficar
        // fina sozinha.
        janela().webContents.sendInputEvent({
          type: 'mouseEnter',
          x: 700,
          y: 400,
        });
        janela().webContents.sendInputEvent({
          type: 'mouseMove',
          x: 700,
          y: 400,
        });
        await espera(1300);
        b = await barras();
        const fina = b.v.largura;
        await avaliar(`${AREA}.scrollBy(0, 40); true`);
        // O evento de rolagem chega no próximo quadro (lento na janela
        // oculta): espera o estado, sem tempo fixo.
        const ATIVA = `document.querySelector('.rolagem-area--v').classList.contains('rolagem-area--ativa')`;
        await aguardar(ATIVA, 10000, 'a barra não ficou ativa ao rolar');
        const rolando = (await barras()).v.largura;
        await aguardar(`!${ATIVA}`, 10000, 'a barra não voltou ao repouso');
        const repouso = (await barras()).v.largura;
        confere(
          fina <= 6 && rolando >= 9 && repouso <= 6,
          `a barra não muda ao rolar: repouso ${fina}, rolando ${rolando}, depois ${repouso}`,
        );
        // Com o mouse em cima: mais grossa. Na janela oculta do teste o
        // hover só chega se o Chromium entregar o movimento; sem ele, vale a
        // conferência da rolagem acima (registrado no log).
        b = await barras();
        janela().webContents.sendInputEvent({
          type: 'mouseMove',
          x: Math.round(b.v.x),
          y: Math.round(b.v.y),
        });
        await espera(400);
        const sobre = await avaliar(
          `document.querySelector('.rolagem-area--v').matches(':hover')`,
        );
        b = await barras();
        if (sobre)
          confere(
            b.v.largura >= 9,
            `a barra não engrossou com o mouse em cima: ${fina} -> ${b.v.largura}`,
          );
        else
          console.log(
            '  (hover não chegou na janela oculta: conferido só rolando)',
          );
        // Arrastar o polegar rola a área.
        const topo0 = await avaliar(`${AREA}.scrollTop`);
        const [px, py] = [Math.round(b.v.x), Math.round(b.v.y)];
        const w = janela().webContents;
        w.sendInputEvent({
          type: 'mouseDown',
          x: px,
          y: py,
          button: 'left',
          clickCount: 1,
        });
        for (let i = 1; i <= 5; i++) {
          w.sendInputEvent({
            type: 'mouseMove',
            x: px,
            y: py + i * 20,
            button: 'left',
          });
          await espera(30);
        }
        w.sendInputEvent({
          type: 'mouseUp',
          x: px,
          y: py + 100,
          button: 'left',
          clickCount: 1,
        });
        await quadros();
        const topo1 = await avaliar(`${AREA}.scrollTop`);
        confere(
          topo1 > topo0 + 50,
          `o polegar não arrastou: ${topo0} -> ${topo1}`,
        );
        // Clique no trilho, abaixo do polegar: uma página.
        b = await barras();
        const altura = await avaliar(`${AREA}.clientHeight`);
        const yTrilho = Math.round(b.v.trilho.bottom - 6);
        if (yTrilho > b.v.y + b.v.altura / 2 + 4) {
          w.sendInputEvent({
            type: 'mouseDown',
            x: px,
            y: yTrilho,
            button: 'left',
            clickCount: 1,
          });
          w.sendInputEvent({
            type: 'mouseUp',
            x: px,
            y: yTrilho,
            button: 'left',
            clickCount: 1,
          });
          await quadros();
          const topo2 = await avaliar(`${AREA}.scrollTop`);
          const max = await avaliar(
            `${AREA}.scrollHeight - ${AREA}.clientHeight`,
          );
          confere(
            topo2 > topo1 && (topo2 - topo1 >= altura - 60 || topo2 >= max - 1),
            `o clique no trilho não rolou uma página: ${topo1} -> ${topo2} (página ${altura})`,
          );
        }
        // Em 175% a folha passa da largura: as duas barras; a horizontal
        // começa depois do painel Leitura aberto e arrasta de lado.
        await zoomEm(1.75);
        await avaliar(`${AREA}.scrollTo(0, 0); true`);
        await quadros();
        b = await barras();
        confere(
          b.h.visivel,
          'a barra horizontal não aparece com a folha mais larga',
        );
        const painel = await avaliar(
          `document.getElementById('painel-leitura').getBoundingClientRect().right`,
        );
        confere(
          b.h.trilho.left >= painel - 1,
          `a barra horizontal começa atrás do painel: ${b.h.trilho.left} < ${painel}`,
        );
        const [hx, hy] = [Math.round(b.h.x), Math.round(b.h.y)];
        w.sendInputEvent({ type: 'mouseMove', x: hx, y: hy });
        await espera(200);
        w.sendInputEvent({
          type: 'mouseDown',
          x: hx,
          y: hy,
          button: 'left',
          clickCount: 1,
        });
        for (let i = 1; i <= 5; i++) {
          w.sendInputEvent({
            type: 'mouseMove',
            x: hx + i * 20,
            y: hy,
            button: 'left',
          });
          await espera(30);
        }
        w.sendInputEvent({
          type: 'mouseUp',
          x: hx + 100,
          y: hy,
          button: 'left',
          clickCount: 1,
        });
        await quadros();
        confere(
          (await avaliar(`${AREA}.scrollLeft`)) > 20,
          'o polegar horizontal não arrastou',
        );
        await avaliar(
          `document.getElementById('teste-sem-transicao')?.remove(); true`,
        );
        await capturar('rolagem-barras-175-1366.png');
        janela().setContentSize(1920, 1040);
        await espera(300);
        await quadros();
        await capturar('rolagem-barras-175-1920.png');
        // Na janela larga, em 100% a folha cabe: sem a horizontal.
        await zoomEm(1);
        await quadros();
        b = await barras();
        confere(!b.h.visivel, 'em 1920 e 100%, a barra horizontal aparece');
      });
    },
  );

  await caso(
    'Fundo em 50%: o cinza da área do documento preenche a área inteira',
    async () => {
      for (const [w, h] of [
        [1366, 768],
        [1920, 1040],
      ]) {
        await comTamanho(w, h, async () => {
          // A segunda largura abre a mesma nota: volta ao Início antes.
          if (await avaliar(visivel('barra'))) await c.inicio();
          await abrirSemFecharJanelas(copia('t22-outra-empresa.xml'));
          await zoomEm(0.5);
          await quadros();
          const r = await avaliar(`(() => {
            const a = ${AREA};
            const ra = a.getBoundingClientRect();
            return {
              area: [Math.round(ra.right), Math.round(ra.bottom)],
              janela: [innerWidth, innerHeight],
              fundo: getComputedStyle(a).backgroundColor,
              danfeAltura: document.getElementById('danfe').getBoundingClientRect().bottom,
            };
          })()`);
          confere(
            r.area[0] === r.janela[0] && r.area[1] === r.janela[1],
            `a área não vai até a borda: ${JSON.stringify(r)}`,
          );
          // O documento em 50% termina antes do pé da janela, mas o pixel
          // embaixo dele, perto do pé (fora do botão de zoom), é o cinza da
          // área.
          const nums = (r.fundo.match(/[\d.]+/g) || []).map(Number);
          // rgb(r, g, b) ou color(srgb r g b), de 0 a 1.
          const cor = r.fundo.startsWith('color(')
            ? nums.slice(0, 3).map((v) => Math.round(v * 255))
            : nums.slice(0, 3);
          janela().webContents.invalidate();
          await espera(300);
          const img = await janela().webContents.capturePage(
            { x: Math.round(w * 0.7), y: h - 10, width: 1, height: 1 },
            { stayHidden: true },
          );
          const bmp = img.toBitmap();
          const tamanho = img.getSize();
          // toBitmap: BGRA; com escala da tela, o primeiro pixel serve.
          const px = [bmp[2], bmp[1], bmp[0]];
          confere(
            tamanho.width >= 1 && px.every((v, i) => Math.abs(v - cor[i]) <= 3),
            `o canto da área não tem o fundo cinza em 50%: ${px} (esperado ${cor}, documento até ${r.danfeAltura})`,
          );
          await capturar(`zoom-50-danfe-${w}.png`);
          await teclaZoom('0');
        });
      }
    },
  );

  await caso(
    'Nota de outra empresa: abre sem janela, com o cartão de aviso no painel Leitura; o detalhe abre ao clicar; nada no documento',
    async () => {
      for (const [w, h] of [
        [1366, 768],
        [1920, 1040],
      ]) {
        await comTamanho(w, h, async () => {
          // A segunda largura abre a mesma nota: volta ao Início antes.
          if (await avaliar(visivel('barra'))) await c.inicio();
          await abrirSemFecharJanelas(copia('t22-outra-empresa.xml'));
          confere(
            (await avaliar(
              `document.querySelectorAll('dialog[open]').length`,
            )) === 0,
            'abriu uma janela ao abrir a nota de outra empresa',
          );
          const cartao = await avaliar(`(() => {
            const c = document.querySelector('#painel-leitura .leitura__destino');
            if (!c) return null;
            const b = c.querySelector('#leitura-destino');
            const d = c.querySelector('.conferencia__detalhe');
            return {
              tipo: c.dataset.tipo,
              titulo: b.textContent.trim(),
              aviso: !!b.querySelector('.icone-estado--aviso, svg'),
              rotulo: b.getAttribute('aria-label'),
              expandido: b.getAttribute('aria-expanded'),
              detalheVisivel: !d.hidden,
              selecionaBotao: getComputedStyle(b).userSelect,
            };
          })()`);
          confere(cartao, 'o cartão de destino não apareceu no painel Leitura');
          confere(
            cartao.tipo === 'outra-empresa' &&
              cartao.titulo === 'Nota de outra empresa' &&
              /aviso/.test(cartao.rotulo) &&
              cartao.expandido === 'false' &&
              !cartao.detalheVisivel &&
              cartao.selecionaBotao === 'none',
            `cartão errado: ${JSON.stringify(cartao)}`,
          );
          await capturar(`aviso-outra-empresa-${w}.png`);
          await avaliar(`document.getElementById('leitura-destino').click()`);
          await quadros();
          const aberto = await avaliar(`(() => {
            const c = document.querySelector('#painel-leitura .leitura__destino');
            const p = c.querySelector('.leitura__destino-detalhe');
            return {
              expandido: c.querySelector('#leitura-destino').getAttribute('aria-expanded'),
              texto: p.textContent,
              visivel: !c.querySelector('.conferencia__detalhe').hidden,
              seleciona: getComputedStyle(p).userSelect,
            };
          })()`);
          confere(
            aberto.expandido === 'true' &&
              aberto.visivel &&
              aberto.texto.includes('Outra Empresa Inventada Ltda') &&
              aberto.texto.includes('11.222.333/0001-81') &&
              aberto.texto.includes('12.345.678/0001-95') &&
              aberto.seleciona === 'text',
            `detalhe errado: ${JSON.stringify(aberto)}`,
          );
          await capturar(`aviso-outra-empresa-detalhe-${w}.png`);
          // Só no painel (que não vai para o PDF nem para a impressão).
          const noDocumento = await avaliar(
            `/Nota de outra empresa|Nota emitida pela loja/.test(document.getElementById('danfe').textContent)`,
          );
          confere(!noDocumento, 'o aviso apareceu dentro do documento');
          confere(
            await avaliar(
              `document.getElementById('painel-leitura').classList.contains('conferencia')`,
            ),
            'o painel Leitura perdeu a classe que o esconde no papel',
          );
          // Na Conferência, a linha do painel continua.
          await irParaConferencia();
          const linha = await avaliar(
            `[...document.querySelectorAll('#painel-conferencia .conferencia__linha-titulo')].map((e) => e.textContent).find((t) => /outra empresa/.test(t)) || null`,
          );
          confere(
            linha && /^Destinatário é outra empresa/.test(linha),
            `a linha da Conferência sumiu: ${linha}`,
          );
          confere(
            (await avaliar(
              `document.querySelectorAll('dialog[open]').length`,
            )) === 0,
            'abriu uma janela ao passar para a Conferência',
          );
          // Recolhido, o ícone do aviso fica no trilho e abre o painel.
          await avaliar(`document.getElementById('btn-aba-xml').click()`);
          await aguardar(visivel('danfe'));
          await avaliar(
            `document.querySelector('#painel-leitura .conferencia__recolher').click()`,
          );
          await quadros();
          const trilho = await avaliar(
            `document.querySelector('#painel-leitura .leitura__destino-trilho')?.getAttribute('aria-label') ?? null`,
          );
          confere(
            trilho === 'Nota de outra empresa',
            `o ícone no painel recolhido: ${trilho}`,
          );
          await avaliar(
            `document.querySelector('#painel-leitura .leitura__destino-trilho').click()`,
          );
          await quadros();
          confere(
            await avaliar(
              `document.getElementById('painel-leitura').dataset.estado === 'aberto'`,
            ),
            'o ícone do aviso não abriu o painel',
          );
        });
      }
    },
  );

  await caso(
    'Nota emitida pela loja: cartão de informação, sem aviso nem janela',
    async () => {
      for (const [w, h] of [
        [1366, 768],
        [1920, 1040],
      ]) {
        await comTamanho(w, h, async () => {
          // A segunda largura abre a mesma nota: volta ao Início antes.
          if (await avaliar(visivel('barra'))) await c.inicio();
          await abrirSemFecharJanelas(copia('t23-emitida-pela-loja.xml'));
          confere(
            (await avaliar(
              `document.querySelectorAll('dialog[open]').length`,
            )) === 0,
            'abriu uma janela ao abrir a nota emitida pela loja',
          );
          const cartao = await avaliar(`(() => {
            const c = document.querySelector('#painel-leitura .leitura__destino');
            if (!c) return null;
            const b = c.querySelector('#leitura-destino');
            return {
              tipo: c.dataset.tipo,
              classe: c.className,
              titulo: b.textContent.trim(),
              rotulo: b.getAttribute('aria-label'),
            };
          })()`);
          confere(
            cartao &&
              cartao.tipo === 'emitida-loja' &&
              cartao.titulo === 'Nota emitida pela loja' &&
              /informação/.test(cartao.rotulo) &&
              /conferencia__verificacao--info/.test(cartao.classe),
            `cartão errado: ${JSON.stringify(cartao)}`,
          );
          await avaliar(`document.getElementById('leitura-destino').click()`);
          await quadros();
          const texto = await avaliar(
            `document.querySelector('.leitura__destino-detalhe').textContent`,
          );
          confere(
            /emitente é a própria loja/.test(texto) &&
              texto.includes('Cliente Inventado Ltda'),
            `detalhe errado: ${texto}`,
          );
          await capturar(`aviso-emitida-loja-${w}.png`);
          await irParaConferencia();
          const linhas = await avaliar(
            `[...document.querySelectorAll('#painel-conferencia .conferencia__linha-titulo')].map((e) => e.textContent)`,
          );
          confere(
            linhas.includes('Nota emitida pela loja') &&
              !linhas.some((t) => /outra empresa/.test(t)),
            `linhas da Conferência: ${JSON.stringify(linhas)}`,
          );
        });
      }
    },
  );
}

module.exports = { casosZoomRolagem };
