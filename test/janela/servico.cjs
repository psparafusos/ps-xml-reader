// Casos do test:janela para o serviço de leitura pesada (parte 2), com o
// utilityProcess de verdade. Enquanto a entrada do Vite não está no
// forge.config.mts, prepararServico() monta o servicoPesado.cjs ao lado do
// main.cjs com o Vite do projeto (o mesmo que o Forge vai fazer). Arquivos
// inventados, gerados aqui e apagados no fim. Nenhum caso aciona Copiar.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const NOME_SERVICO = 'PS Reader: leitura pesada';

/** Monta o filho em .vite/build/servicoPesado.cjs. */
async function prepararServico(raiz) {
  const { build } = await import('vite');
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      ssr: path.join(raiz, 'src', 'servico', 'servicoPesado.ts'),
      outDir: path.join(raiz, '.vite', 'build'),
      emptyOutDir: false,
      minify: false,
      target: 'node22',
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: 'servicoPesado.cjs' },
      },
    },
  });
}

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
      let filho = null;
      const limite = Date.now() + 20000;
      while (!filho && Date.now() < limite) {
        if (await avaliar(cartaoVisivel)) filho = filhoDoServico();
        await espera(50);
      }
      confere(filho, 'o filho não apareceu durante a leitura');
      process.kill(filho.pid);
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

module.exports = { prepararServico, casosServico };
