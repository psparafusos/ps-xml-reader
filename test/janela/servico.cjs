// Casos do test:janela para o serviço de leitura pesada (parte 2), com o
// utilityProcess de verdade: o servicoPesado.cjs que o Forge monta ao lado
// do main.cjs. Arquivos inventados, gerados aqui e apagados no fim. Nenhum
// caso aciona Copiar.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NOME_SERVICO = 'PS Reader: leitura pesada';
const FILHO = path.resolve(
  __dirname,
  '..',
  '..',
  '.vite',
  'build',
  'servicoPesado.cjs',
);

/** XML inventado de `mb` megabytes, escrito em blocos. */
function gerarXml(alvo, mb) {
  const f = fs.openSync(alvo, 'w');
  fs.writeSync(f, '<?xml version="1.0" encoding="UTF-8"?>\n<lote>\n');
  let total = 0;
  let bloco = [];
  for (let i = 1; total < mb * 1024 * 1024; i++) {
    const d = `  <item n="${i}"><desc>PARAFUSO INVENTADO ${i}</desc><qtd>${i % 97}</qtd></item>\n`;
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

async function casosServico(c) {
  const { app, notas, caso, avaliar, aguardar, confere, espera, rede } = c;
  const { app: electronApp } = require('electron');

  const leitorAberto = `(() => { const s = document.querySelector('.leitor-xml'); return !!s && !s.hidden; })()`;
  const estado = () =>
    avaliar(
      `(() => { const e = document.querySelector('.leitor-xml__estado'); return e && !e.hidden ? e.innerText : ''; })()`,
    );
  const cartaoVisivel = `(() => { const e = document.querySelector('.servico-progresso'); return !!e && !e.hidden; })()`;
  const filhoDoServico = () =>
    electronApp
      .getAppMetrics()
      .find((m) => m.type === 'Utility' && m.name === NOME_SERVICO);
  const filhosDoServico = () =>
    electronApp
      .getAppMetrics()
      .filter((m) => m.type === 'Utility' && m.name === NOME_SERVICO);
  const abrir = (caminho) => app.emit('leitor-xml-rota-interna', caminho);
  const fechar = async () => {
    await avaliar(
      `[...document.querySelectorAll('.leitor-xml button')].find((b) => b.textContent === 'Fechar')?.click(); true`,
    );
    await aguardar(`!${leitorAberto}`, 5000, 'o leitor não fechou');
  };
  const aguardarEstado = async (trecho, prazo = 60000) => {
    const limite = Date.now() + prazo;
    while (Date.now() < limite) {
      const t = await estado();
      if (t.includes(trecho)) return t;
      await espera(100);
    }
    throw new Error(`estado sem "${trecho}": ${await estado()}`);
  };
  /** Abre um XML pequeno e confere que a árvore aparece (o serviço voltou). */
  const pequenoFunciona = async () => {
    const alvo = path.join(notas, 'pequeno-servico.xml');
    fs.writeFileSync(alvo, '<pedido><item>1</item></pedido>');
    abrir(alvo);
    await aguardar(
      `document.querySelectorAll('.leitor-xml__no').length > 0`,
      20000,
      'XML pequeno depois do serviço',
    );
    await fechar();
  };

  const xml40 = gerarXml(path.join(notas, 'lote-40mb.xml'), 40);
  const xml90 = gerarXml(path.join(notas, 'lote-90mb.xml'), 90);

  try {
    await caso(
      'Serviço: o Forge montou o filho ao lado do main.cjs',
      async () => {
        confere(fs.existsSync(FILHO), `não achei ${FILHO}`);
      },
    );

    await caso(
      'Serviço: XML grande inventado lido no utilityProcess, com andamento',
      async () => {
        abrir(xml40);
        await aguardar(leitorAberto, 10000, 'o leitor não abriu');
        let viuFilho = false;
        let viuCartao = false;
        const limite = Date.now() + 60000;
        while (Date.now() < limite) {
          viuFilho ||= !!filhoDoServico();
          viuCartao ||= await avaliar(cartaoVisivel);
          if (
            await avaliar(
              `document.querySelectorAll('.leitor-xml__linha').length > 0`,
            )
          )
            break;
          await espera(50);
        }
        confere(
          viuFilho,
          `nenhum processo "${NOME_SERVICO}" no app.getAppMetrics()`,
        );
        confere(viuCartao, 'o cartão de andamento não apareceu');
        confere(
          (
            await avaliar(
              `document.querySelector('.leitor-xml__avisos').innerText`,
            )
          ).includes('Modo leve'),
          'aviso do modo leve',
        );
        await aguardar(`!${cartaoVisivel}`, 5000, 'o cartão não sumiu no fim');
        await fechar();
      },
    );

    await caso('Serviço: arquivo que estoura o teto de memória', async () => {
      process.env.PS_SERVICO_LIMITE_MB = '120';
      try {
        abrir(xml40);
        const t = await aguardarEstado('memória');
        confere(
          t.includes(
            'A leitura precisou de mais memória do que o PS Reader permite (120 MB)',
          ),
          t,
        );
      } finally {
        delete process.env.PS_SERVICO_LIMITE_MB;
      }
      await fechar();
      await pequenoFunciona();
    });

    await caso('Serviço: tempo máximo por tarefa', async () => {
      process.env.PS_SERVICO_TEMPO_MS = '400';
      try {
        abrir(xml90);
        const t = await aguardarEstado('passou de');
        confere(
          t.includes('A leitura passou de 1 segundo e foi interrompida.'),
          t,
        );
      } finally {
        delete process.env.PS_SERVICO_TEMPO_MS;
      }
      await fechar();
      await pequenoFunciona();
    });

    await caso(
      'Serviço: importação com Configurações aberta: cartão por cima e Cancelar mantém o anterior',
      async () => {
        // TIPI inventada grande (texto), para a leitura passar de 0,3 s.
        const base = fs.readFileSync(
          path.join(__dirname, '..', 'fiscal', 'fixtures', 'tipi-trecho.txt'),
          'utf8',
        );
        const extra = [];
        for (let i = 0; i < 250000; i++) {
          const pos = 3210 + Math.floor(i / 10000);
          extra.push(
            `${pos}.${String(Math.floor(i / 100) % 100).padStart(2, '0')}.${String(i % 100).padStart(2, '0')} Produto inventado ${i + 1} 3,25`,
          );
        }
        const tipi = path.join(notas, 'tipi-inventada.txt');
        fs.writeFileSync(tipi, `${base}\n${extra.join('\n')}\n`);
        // Só no teste: o diálogo de abrir do Windows devolve a TIPI inventada.
        const { dialog } = require('electron');
        const original = dialog.showOpenDialog;
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [tipi],
        });
        const infoTipi = path.join(
          electronApp.getPath('userData'),
          'documentos',
          'tipi-info.json',
        );
        const tinhaAntes = fs.existsSync(infoTipi)
          ? fs.readFileSync(infoTipi, 'utf8')
          : null;
        try {
          await avaliar(`document.getElementById('btn-inicio')?.click(); true`);
          await aguardar(
            `!!document.getElementById('btn-documentos') && !document.getElementById('vazio').hidden`,
            10000,
            'tela inicial',
          );
          // Os casos de NF-e deixam avisos "Nota de outra empresa" abertos.
          await avaliar(
            `[...document.querySelectorAll('dialog[open] button')].filter((b) => b.textContent.trim() === 'Entendi').forEach((b) => b.click()); true`,
          );
          await avaliar(
            `document.getElementById('btn-documentos').click(); true`,
          );
          await aguardar(
            `!!document.querySelector('dialog[open] [data-foco="atualizar-tipi"]')`,
            10000,
            'Configurações aberta',
          );
          await avaliar(
            `document.querySelector('[data-foco="atualizar-tipi"]').click(); true`,
          );
          await aguardar(
            cartaoVisivel,
            20000,
            'o cartão de andamento não apareceu',
          );
          const toque = await avaliar(`(() => {
          const c = document.querySelector('.servico-progresso');
          const b = c.querySelector('button');
          const r = b.getBoundingClientRect();
          const alvo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { dentroDoModal: !!c.closest('dialog:modal'), noBotao: alvo === b || b.contains(alvo) };
        })()`);
          confere(toque.dentroDoModal, 'o cartão não foi para dentro do modal');
          confere(
            toque.noBotao,
            'o Cancelar está coberto (teste de toque não chega nele)',
          );
          await avaliar(
            `document.querySelector('.servico-progresso button').click(); true`,
          );
          await aguardar(`!${cartaoVisivel}`, 10000, 'o cartão não sumiu');
          await espera(500);
          const agora = fs.existsSync(infoTipi)
            ? fs.readFileSync(infoTipi, 'utf8')
            : null;
          confere(agora === tinhaAntes, 'a TIPI mudou depois de cancelar');
          await avaliar(
            `[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Fechar')?.click(); true`,
          );
          await aguardar(
            `!document.querySelector('dialog[open] [data-foco="atualizar-tipi"]')`,
            5000,
            'fechar Configurações',
          );
          confere(
            await avaliar(
              `document.querySelector('.servico-progresso').parentElement === document.body`,
            ),
            'o cartão não voltou para o body depois de fechar o modal',
          );
        } finally {
          dialog.showOpenDialog = original;
          fs.rmSync(tipi, { force: true });
        }
      },
    );

    await caso('Serviço: Cancelar no cartão de andamento', async () => {
      abrir(xml90);
      await aguardar(
        cartaoVisivel,
        20000,
        'o cartão de andamento não apareceu',
      );
      const ok = await avaliar(`(() => {
        const b = document.querySelector('.servico-progresso button');
        if (!b || b.textContent !== 'Cancelar') return false;
        b.click();
        return true;
      })()`);
      confere(ok, 'botão Cancelar do cartão');
      const t = await aguardarEstado('Leitura cancelada', 10000);
      confere(t.startsWith('Leitura cancelada'), t);
      await aguardar(`!${cartaoVisivel}`, 5000, 'o cartão não sumiu');
      await fechar();
      await pequenoFunciona();
    });

    await caso('Serviço: filho morto no meio da leitura', async () => {
      abrir(xml90);
      // O app.getAppMetrics() ainda pode listar o filho encerrado no caso
      // anterior: tenta cada processo do serviço até achar o vivo.
      let morto = false;
      const limite = Date.now() + 20000;
      while (!morto && Date.now() < limite) {
        if (await avaliar(cartaoVisivel)) {
          for (const m of filhosDoServico()) {
            try {
              process.kill(m.pid);
              morto = true;
              break;
            } catch {
              // Já tinha saído: tenta o próximo.
            }
          }
        }
        if (!morto) await espera(50);
      }
      confere(morto, 'o filho não apareceu durante a leitura');
      const t = await aguardarEstado('parou no meio', 15000);
      confere(t.includes('A leitura parou no meio. Tente de novo.'), t);
      await fechar();
      await pequenoFunciona();
      confere(rede.length === 0, `pedidos de rede: ${rede.join(' ')}`);
    });
  } finally {
    for (const f of [xml40, xml90]) fs.rmSync(f, { force: true });
  }
}

module.exports = { casosServico };
