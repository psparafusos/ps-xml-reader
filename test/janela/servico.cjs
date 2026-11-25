// Casos do test:janela para o serviço de leitura pesada (parte 2), com o
// utilityProcess de verdade: o servicoPesado.cjs que o Forge monta ao lado
// do main.cjs. Arquivos inventados, gerados aqui e apagados no fim. Cada caso
// começa do estado limpo de executar.cjs (tela inicial, sem diálogo, leitor
// fechado, nenhuma leitura no serviço) e espera de verdade, sem tempo fixo.
// Nenhum caso aciona Copiar.
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

/**
 * Apaga um arquivo do teste. Depois de um filho encerrado ou morto no meio
 * da leitura, o processo pode levar segundos para sair e ainda prende o
 * arquivo (EPERM no Windows): tenta de novo e, se continuar preso, deixa
 * para a limpeza da pasta da rodada (rodar.cjs). Um erro aqui derrubaria
 * todos os casos seguintes.
 */
function apagarTolerante(arquivo) {
  try {
    fs.rmSync(arquivo, { force: true, maxRetries: 20, retryDelay: 250 });
  } catch {
    // Fica para o fim da rodada.
  }
}

async function casosServico(c) {
  const { notas, caso, avaliar, aguardar, confere, espera, rede } = c;
  const { app: electronApp } = require('electron');

  // XML que não é nota abre no Formato original: passa para o .XML.
  const leitorAberto = `(() => { const f = document.getElementById('formato-original'); if (f && !f.hidden) document.getElementById('btn-modo-xml')?.click(); const s = document.querySelector('.leitor-xml'); return !!s && !s.hidden; })()`;
  const estado = () =>
    avaliar(
      `(() => { const e = document.querySelector('.leitor-xml__estado'); return e && !e.hidden ? e.innerText : ''; })()`,
    );
  const cartaoVisivel = `(() => { const e = document.querySelector('.servico-progresso'); return !!e && !e.hidden; })()`;
  const filhoDoServico = () =>
    electronApp
      .getAppMetrics()
      .find((m) => m.type === 'Utility' && m.name === NOME_SERVICO);
  // Como num duplo clique (XML que não é NF-e vai para o leitor).
  const abrir = (caminho) => c.abrir(caminho);
  const fechar = async () => {
    await avaliar(`document.getElementById('btn-inicio').click(); true`);
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
          // Começa da tela inicial, sem diálogo aberto (estadoLimpo).
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
          // A importação terminou (cancelada): a área sai de ocupada.
          await aguardar(
            `(() => { const b = document.querySelector('[data-foco="atualizar-tipi"]'); return !!b && !b.disabled && !b.closest('[aria-busy="true"]'); })()`,
            10000,
            'a área de Documentos continuou ocupada',
          );
          const agora = fs.existsSync(infoTipi)
            ? fs.readFileSync(infoTipi, 'utf8')
            : null;
          confere(agora === tinhaAntes, 'a TIPI mudou depois de cancelar');
          await avaliar(
            `document.querySelector('dialog[open] .painel__cabecalho > button[aria-label="Fechar"]')?.click(); true`,
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
          apagarTolerante(tipi);
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
      // O filho que está lendo é o que o app criou por último e não mandou
      // encerrar. Não serve procurar pelo pid no app.getAppMetrics(): os
      // filhos que o app encerrou nos casos anteriores ainda aparecem lá por
      // até 1,5 s com a máquina ocupada (o kill() já foi chamado, o processo
      // ainda não saiu), e matar um deles deixava a leitura de verdade
      // terminar normalmente.
      const lendo = () =>
        c.filhosServico
          .filter(
            (r) => !r.saiu && r.encerrar.length === 0 && r.pid !== undefined,
          )
          .at(-1) ?? null;
      let alvo = null;
      const limite = Date.now() + 20000;
      while (!alvo && Date.now() < limite) {
        if (await avaliar(cartaoVisivel)) alvo = lendo();
        if (!alvo) await espera(50);
      }
      const filhos = () =>
        JSON.stringify(
          c.filhosServico.map((r) => ({
            pid: r.pid,
            encerrado: r.encerrar.length > 0,
            saiu: r.saiu,
          })),
        );
      confere(alvo, `o filho não apareceu durante a leitura: ${filhos()}`);
      // Como uma queda: o processo some sem passar pelo app. O pid é do
      // filho vivo (o app ainda não recebeu a saída dele).
      const morto = Date.now();
      process.kill(alvo.pid);
      // O app só fica sabendo quando o processo sai de fato. Um processo no
      // meio da leitura do arquivo só termina quando essa leitura do disco
      // volta; com outras rodadas gravando e lendo arquivos grandes ao mesmo
      // tempo, isso levou mais de 15 s. O prazo da mensagem conta da saída.
      const limiteSaida = Date.now() + 60000;
      while (!alvo.saiu && Date.now() < limiteSaida) await espera(50);
      confere(
        alvo.saiu,
        `o processo ${alvo.pid} não terminou em 60 s depois do kill; filhos: ${filhos()}`,
      );
      const t = await aguardarEstado('parou no meio', 15000).catch((e) => {
        throw new Error(
          `${e.message}; filho morto: ${alvo.pid} (saiu ${Date.now() - morto} ms depois do kill); filhos: ${filhos()}`,
        );
      });
      confere(t.includes('A leitura parou no meio. Tente de novo.'), t);
      await fechar();
      await pequenoFunciona();
      confere(rede.length === 0, `pedidos de rede: ${rede.join(' ')}`);
    });
  } finally {
    for (const f of [xml40, xml90]) apagarTolerante(f);
  }
}

module.exports = { casosServico };
