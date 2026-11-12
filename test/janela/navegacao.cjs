// Casos do test:janela para o leitor de XML na navegação (parte 3, passo 2):
// XML que não é NF-e abre no leitor genérico pelo botão Abrir, pelo arrastar
// e pelo duplo clique, com a regra da abertura direta (nota aberta: janela
// nova; arquivo já aberto: a janela dele vem para a frente); Fechar no meio
// da leitura cancela; NF-e acima de 5 MB é lida no serviço de leitura
// pesada. Arquivos inventados, gerados aqui. Cada caso começa do estado
// limpo de executar.cjs e espera de verdade. Nenhum caso aciona Copiar.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CATALOGO = `<?xml version="1.0" encoding="UTF-8"?>
<catalogo origem="teste">
  <item codigo="P-001"><desc>PARAFUSO INVENTADO</desc></item>
  <item codigo="P-002"><desc>PORCA INVENTADA</desc></item>
</catalogo>
`;

/** XML inventado de `mb` megabytes, para a leitura demorar. */
function gerarLote(alvo, mb) {
  const f = fs.openSync(alvo, 'w');
  fs.writeSync(f, '<?xml version="1.0" encoding="UTF-8"?>\n<lote>\n');
  let total = 0;
  let bloco = [];
  for (let i = 1; total < mb * 1024 * 1024; i++) {
    const d = `  <item n="${i}"><desc>ARRUELA INVENTADA ${i}</desc></item>\n`;
    bloco.push(d);
    total += d.length;
    if (bloco.length >= 5000) {
      fs.writeSync(f, bloco.join(''));
      bloco = [];
    }
  }
  fs.writeSync(f, `${bloco.join('')}</lote>\n`);
  fs.closeSync(f);
  return alvo;
}

/**
 * @param {object} c contexto de executar.cjs: notas, caso, avaliar,
 *   aguardar, confere, espera, rede, abrir, janela (função), primeiro,
 *   visivel, abrirNota, inicio.
 */
async function casosNavegacao(c) {
  const { notas, caso, avaliar, aguardar, confere, espera, rede, visivel } = c;
  const { BrowserWindow, dialog } = require('electron');

  const gravar = (nome, conteudo) => {
    const alvo = path.join(notas, nome);
    fs.writeFileSync(alvo, conteudo);
    return alvo;
  };
  const leitorAberto = `(() => { const s = document.querySelector('.leitor-xml'); return !!s && !s.hidden; })()`;
  const arvoreCom = (trecho) =>
    `(document.querySelector('.leitor-xml__vista--arvore')?.innerText ?? '').includes(${JSON.stringify(trecho)})`;
  const cartaoVisivel = `(() => { const e = document.querySelector('.servico-progresso'); return !!e && !e.hidden; })()`;
  /** Botão Fechar do leitor (nunca um "Copiar"). */
  const fecharLeitor = async () => {
    await avaliar(
      `[...document.querySelectorAll('.leitor-xml button')].find((b) => b.textContent === 'Fechar')?.click(); true`,
    );
    await aguardar(`!${leitorAberto}`, 5000, 'o leitor não fechou');
  };
  /** A janela nova que aparecer depois de `antes`. */
  const janelaNova = async (antes) => {
    const limite = Date.now() + 30000;
    while (Date.now() < limite) {
      const nova = BrowserWindow.getAllWindows().find((w) => !antes.has(w));
      if (nova) return nova;
      await espera(100);
    }
    throw new Error('nenhuma janela nova abriu');
  };
  /** Espera uma condição numa janela que não é a principal. */
  const aguardarEm = async (w, js, descricao) => {
    const limite = Date.now() + 30000;
    while (Date.now() < limite) {
      if (await w.webContents.executeJavaScript(js, true).catch(() => false))
        return;
      await espera(100);
    }
    throw new Error(`não aconteceu na janela nova: ${descricao}`);
  };

  await caso(
    'Navegação: XML que não é NF-e abre no leitor pelo botão Abrir',
    async () => {
      const alvo = gravar('catalogo-abrir.xml', CATALOGO);
      // Só no teste: o diálogo de abrir do Windows devolve o XML inventado.
      const original = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [alvo],
      });
      try {
        await avaliar(`document.getElementById('btn-abrir').click(); true`);
        await aguardar(leitorAberto, 15000, 'o leitor não abriu');
        await aguardar(
          arvoreCom('<desc>PORCA INVENTADA</desc>'),
          15000,
          'a árvore não apareceu',
        );
      } finally {
        dialog.showOpenDialog = original;
      }
      confere(
        !(await avaliar(visivel('mensagem'))),
        'apareceu mensagem (o aviso de "não é NF-e"?)',
      );
      confere(
        !(await avaliar(visivel('faixa-leitura'))),
        'o leitor genérico não tem faixa de leitura protegida',
      );
      await fecharLeitor();
      confere(await avaliar(visivel('vazio')), 'Fechar não voltou ao início');
    },
  );

  await caso(
    'Navegação: XML que não é NF-e abre no leitor ao arrastar para a janela',
    async () => {
      const alvo = gravar('catalogo-arrastado.xml', CATALOGO);
      // Arrastar de verdade, pelo protocolo de depuração da própria janela:
      // o arquivo chega ao renderer como chegaria do Explorer.
      const wc = c.janela().webContents;
      wc.debugger.attach('1.3');
      try {
        const dados = { items: [], files: [alvo], dragOperationsMask: 1 };
        for (const type of ['dragEnter', 'dragOver', 'drop'])
          await wc.debugger.sendCommand('Input.dispatchDragEvent', {
            type,
            x: 300,
            y: 300,
            data: dados,
          });
      } finally {
        wc.debugger.detach();
      }
      await aguardar(leitorAberto, 15000, 'o leitor não abriu ao arrastar');
      await aguardar(
        arvoreCom('<item codigo="P-001">'),
        15000,
        'a árvore não apareceu',
      );
      confere(
        (await avaliar(
          `document.querySelector('.leitor-xml__nome').textContent`,
        )) === 'catalogo-arrastado.xml',
        'nome do arquivo na barra do leitor',
      );
      await fecharLeitor();
    },
  );

  await caso(
    'Navegação: com uma nota aberta, o XML genérico abre numa janela nova; aberto de novo, ela vem para a frente',
    async () => {
      await c.abrirNota(c.primeiro);
      const alvo = gravar('catalogo-janela-nova.xml', CATALOGO);
      // Botão Abrir da barra da nota; só no teste o diálogo devolve o XML.
      const original = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [alvo],
      });
      const abrirPeloBotao = () => avaliar(`window.psApi.abrirArquivo()`);
      const antes = new Set(BrowserWindow.getAllWindows());
      let r;
      try {
        r = await abrirPeloBotao();
      } finally {
        dialog.showOpenDialog = original;
      }
      confere(r.status === 'nova-janela', `resultado: ${JSON.stringify(r)}`);
      const nova = await janelaNova(antes);
      await aguardarEm(nova, leitorAberto, 'o leitor não abriu');
      await aguardarEm(nova, arvoreCom('PARAFUSO INVENTADO'), 'árvore');
      confere(await avaliar(visivel('danfe')), 'a nota desta janela saiu');
      // De novo: nenhuma janela nova, a do leitor vem para a frente.
      const contagem = BrowserWindow.getAllWindows().length;
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [alvo],
      });
      let r2;
      try {
        r2 = await abrirPeloBotao();
      } finally {
        dialog.showOpenDialog = original;
      }
      confere(r2.status === 'outra-janela', `de novo: ${JSON.stringify(r2)}`);
      confere(
        BrowserWindow.getAllWindows().length === contagem,
        'abriu outra janela para o mesmo arquivo',
      );
      nova.destroy();
    },
  );

  await caso(
    'Navegação: Fechar no meio da leitura cancela, e o próximo XML abre',
    async () => {
      const grande = gerarLote(path.join(notas, 'lote-fechar-60mb.xml'), 60);
      try {
        c.abrir(grande);
        await aguardar(cartaoVisivel, 20000, 'a leitura não começou');
        await fecharLeitor();
        await aguardar(
          `!${cartaoVisivel}`,
          10000,
          'o cartão continuou: a leitura não foi cancelada',
        );
        const pequeno = gravar('catalogo-depois.xml', CATALOGO);
        c.abrir(pequeno);
        await aguardar(leitorAberto, 15000, 'o leitor não abriu de novo');
        await aguardar(
          arvoreCom('PORCA INVENTADA'),
          15000,
          'o XML seguinte não abriu depois do Fechar no meio',
        );
        confere(
          (await avaliar(
            `document.querySelector('.leitor-xml__nome').textContent`,
          )) === 'catalogo-depois.xml',
          'a leitura cancelada apareceu por cima da nova',
        );
        await fecharLeitor();
      } finally {
        fs.rmSync(grande, { force: true });
      }
    },
  );

  await caso(
    'Navegação: NF-e acima de 5 MB é lida no serviço; até 5 MB, no principal',
    async () => {
      const base = fs.readFileSync(c.primeiro, 'utf8');
      // NF-e inventada com um comentário grande depois da raiz.
      const comComentario = (mb) =>
        `${base.trimEnd()}\n<!-- ${'enchimento inventado '.repeat(Math.ceil((mb * 1024 * 1024) / 21))} -->\n`;
      const grande = gravar('nfe-grande-6mb.xml', comComentario(6));
      const media = gravar('nfe-media-4mb.xml', comComentario(4));
      // Tempo máximo de 1 ms no serviço: só o que passa por ele estoura.
      process.env.PS_SERVICO_TEMPO_MS = '1';
      try {
        c.abrir(grande);
        await aguardar(
          `${visivel('mensagem')} && document.getElementById('mensagem-texto').textContent.includes('passou de')`,
          30000,
          'a NF-e de 6 MB não passou pelo serviço',
        );
        await avaliar(
          `document.getElementById('mensagem-fechar')?.click(); true`,
        );
        await c.abrirNota(media);
      } finally {
        delete process.env.PS_SERVICO_TEMPO_MS;
      }
      // Sem o tempo curto, a de 6 MB abre normalmente, pelo serviço.
      await c.inicio();
      await c.abrirNota(grande);
      confere(
        (await avaliar(`document.getElementById('danfe').innerText`)).length >
          0,
        'DANFE vazio',
      );
      confere(rede.length === 0, `pedidos de rede: ${rede.join(' ')}`);
    },
  );
}

module.exports = { casosNavegacao };
