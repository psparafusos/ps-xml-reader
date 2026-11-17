// Casos do test:janela para o cadastro do sistema de gestão na aba
// Documentos de referência: o cartão opcional, carregar o cadastro
// inventado (test/fixtures/cadastro/cadastro.json), o relatório da leitura,
// arquivo inválido que não substitui o carregado, arquivo acima do limite
// recusado antes de ler, cadastro com ponto de atenção e remover. O diálogo
// de arquivo do Windows é trocado por respostas fixas. Com
// PS_JANELA_CAPTURAS, grava a captura do cartão em 1366.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIXTURE = path.join(
  __dirname,
  '..',
  'fixtures',
  'cadastro',
  'cadastro.json',
);

async function casosCadastro(ctx) {
  const {
    caso,
    avaliar,
    aguardar,
    confere,
    espera,
    janela,
    dados,
    tmp,
    capturar,
  } = ctx;
  const { dialog } = require('electron');
  const pastaDocs = path.join(dados, 'documentos');
  const arqCadastro = path.join(pastaDocs, 'cadastro.json');
  const arqInfo = path.join(pastaDocs, 'cadastro-info.json');
  const arquivos = path.join(tmp, 'cadastro-arquivos');
  fs.mkdirSync(arquivos, { recursive: true });

  const configAberta = `!!document.querySelector('dialog.painel--config[open]')`;
  const cartao = `document.getElementById('documento-cadastro')?.closest('article')`;
  const selo = () =>
    avaliar(
      `${cartao}?.querySelector('.documento__selo')?.textContent.trim() ?? ''`,
    );

  /** Grava um cadastro de teste (a partir do inventado) e devolve o caminho. */
  function arquivo(nome, mudar) {
    const c = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    if (mudar) mudar(c);
    const alvo = path.join(arquivos, nome);
    fs.writeFileSync(alvo, JSON.stringify(c), 'utf8');
    return alvo;
  }

  async function abrirDocumentos() {
    await avaliar(`document.getElementById('btn-documentos').click()`);
    await aguardar(configAberta, 15000, 'as Configurações não abriram');
    await aguardar(`!!${cartao}`, 15000, 'sem o cartão do cadastro');
  }

  /** Clica no Carregar (ou Trocar arquivo) com o diálogo respondendo `caminho`. */
  async function carregar(caminho) {
    const original = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [caminho],
    });
    try {
      await avaliar(
        `document.querySelector('[data-foco="atualizar-cadastro"]').click()`,
      );
      await aguardar(
        `!document.querySelector('.documentos__conteudo')?.closest('[aria-busy="true"]') && !document.querySelector('[aria-busy="true"]')`,
        30000,
        'a importação não terminou',
      );
      await espera(200);
    } finally {
      dialog.showOpenDialog = original;
    }
  }

  const textoCartao = () => avaliar(`${cartao}?.innerText ?? ''`);

  /**
   * Janela em 1366 x 728, o cartão no alto: confere que nada passa da
   * largura e grava a captura (com PS_JANELA_CAPTURAS). Volta ao tamanho.
   */
  async function em1366(nome) {
    const [largura, altura] = janela().getContentSize();
    try {
      janela().setContentSize(1366, 728);
      await espera(300);
      await avaliar(`${cartao}.scrollIntoView({ block: 'start' }); true`);
      const passa = await avaliar(
        `(() => { const r = ${cartao}.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 1; })()`,
      );
      confere(!passa, 'o cartão passa da largura da janela em 1366');
      await capturar(nome);
    } finally {
      janela().setContentSize(largura, altura);
    }
  }

  await caso(
    'Cadastro do sistema de gestão: cartão opcional; carregar mostra origem, extração, quantidades e o relatório; captura em 1366',
    async () => {
      await abrirDocumentos();
      confere(
        (await selo()) === 'Opcional, não carregado',
        `selo: ${await selo()}`,
      );
      confere(
        (await avaliar(
          `document.querySelector('[data-foco="atualizar-cadastro"]').textContent.trim()`,
        )) === 'Carregar',
        'sem o botão Carregar',
      );
      await carregar(arquivo('cadastro-inventado.json'));
      confere(
        (await selo()) === 'Carregado',
        `selo depois de carregar: ${await selo()}`,
      );
      const emUso = await avaliar(
        `${cartao}?.querySelector('.documento__arquivo strong')?.textContent ?? ''`,
      );
      confere(
        emUso === 'cadastro-inventado.json',
        `arquivo em uso: "${emUso}"`,
      );
      const texto = await textoCartao();
      for (const esperado of [
        'Cadastro inventado para os testes do PS Reader',
        '14/11/2026 às 12:30',
        '20 produtos (19 ativos) · 7 fornecedores · 16 vínculos · 10 fatores · 2 notas lançadas',
      ])
        confere(
          texto.includes(esperado),
          `falta "${esperado}" no cartão: ${texto}`,
        );
      confere(
        fs.existsSync(arqCadastro) && fs.existsSync(arqInfo),
        'o cadastro não foi gravado na pasta de dados',
      );
      confere(
        fs.readFileSync(arqCadastro, 'utf8') ===
          fs.readFileSync(
            path.join(arquivos, 'cadastro-inventado.json'),
            'utf8',
          ),
        'o arquivo gravado não é o importado',
      );
      await avaliar(
        `document.querySelector('[data-foco="relatorio-cadastro"]').click()`,
      );
      await aguardar(
        `!!${cartao}?.querySelector('.documento__relatorio')`,
        5000,
        'o relatório não abriu',
      );
      confere(
        (
          await avaliar(
            `${cartao}?.querySelector('.documento__relatorio')?.textContent ?? ''`,
          )
        ).includes('Pontos de atenção: nenhum'),
        'relatório sem a linha dos pontos de atenção',
      );
      await em1366('documentos-cadastro-1366.png');
    },
  );

  await caso(
    'Cadastro: arquivo inválido é recusado com a lista do que falhou e não substitui o carregado',
    async () => {
      const antes = fs.readFileSync(arqInfo, 'utf8');
      await abrirDocumentos();
      await carregar(
        arquivo('cadastro-invalido.json', (c) => {
          c.produtos[0].ativo = 'S';
          c.vinculos[0].codigo_fornecedor = 450;
        }),
      );
      const erro = await avaliar(
        `${cartao}?.querySelector('.documento__erro')?.innerText ?? ''`,
      );
      confere(
        /não segue o formato do cadastro \(2 problemas\)/.test(erro),
        `mensagem: ${erro}`,
      );
      confere(
        /O cadastro anterior continua carregado/.test(erro),
        `mensagem: ${erro}`,
      );
      confere(
        (await avaliar(
          `${cartao}.querySelectorAll('.documento__erros li').length`,
        )) === 2,
        'a lista do que falhou não tem 2 itens',
      );
      confere(/produtos, registro 1: ativo/.test(erro), `lista: ${erro}`);
      confere((await selo()) === 'Carregado', `o selo mudou: ${await selo()}`);
      confere(
        fs.readFileSync(arqInfo, 'utf8') === antes,
        'o cadastro-info.json mudou',
      );
      confere(!fs.existsSync(`${arqCadastro}.novo`), 'sobrou o .novo');
      await em1366('documentos-cadastro-erro-1366.png');
      await avaliar(
        `document.querySelector('[data-foco="fechar-erro-cadastro"]').click()`,
      );
      await aguardar(
        `!${cartao}?.querySelector('.documento__erro')`,
        5000,
        'o X não fechou o aviso',
      );
    },
  );

  await caso(
    'Cadastro: arquivo acima de 30 MB é recusado antes de ler',
    async () => {
      const grande = path.join(arquivos, 'cadastro-grande.json');
      fs.writeFileSync(grande, '');
      fs.truncateSync(grande, 31 * 1024 * 1024);
      await abrirDocumentos();
      await carregar(grande);
      const erro = await avaliar(
        `${cartao}?.querySelector('.documento__erro')?.innerText ?? ''`,
      );
      confere(
        /31 MB, grande demais para o cadastro \(limite de 30 MB\)/.test(erro),
        `mensagem: ${erro}`,
      );
      confere((await selo()) === 'Carregado', 'o selo mudou');
      fs.rmSync(grande, { force: true });
    },
  );

  await caso(
    'Cadastro: ponto de atenção deixa o selo amarelo e abre o relatório',
    async () => {
      await abrirDocumentos();
      await carregar(
        arquivo('cadastro-com-ponto.json', (c) => {
          c.produtos.push({ ...c.produtos[0], descricao: 'REPETIDO' });
        }),
      );
      confere(
        (await selo()) === 'Carregado com 1 ponto de atenção',
        `selo: ${await selo()}`,
      );
      const tabela = await avaliar(
        `${cartao}?.querySelector('.documento__relatorio table')?.innerText ?? ''`,
      );
      confere(
        /produtos, registro 21/.test(tabela) &&
          /código de produto repetido/.test(tabela),
        `tabela: ${tabela}`,
      );
    },
  );

  await caso(
    'Cadastro: remover pergunta antes e volta a "Opcional"; recusa sem nada carregado é "Incompatível"',
    async () => {
      await abrirDocumentos();
      await avaliar(
        `document.querySelector('[data-foco="remover-cadastro"]').click()`,
      );
      await aguardar(
        `[...document.querySelectorAll('dialog[open] button')].some((b) => b.textContent.trim() === 'Remover')`,
        5000,
        'a confirmação não apareceu',
      );
      await avaliar(
        `[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Remover').click()`,
      );
      await aguardar(
        `(${cartao}?.querySelector('.documento__selo')?.textContent ?? '').includes('Opcional')`,
        10000,
        'não voltou a Opcional',
      );
      confere(
        !fs.existsSync(arqCadastro) && !fs.existsSync(arqInfo),
        'os arquivos continuam na pasta de dados',
      );
      await carregar(
        arquivo('nao-e-cadastro.json', (c) => {
          for (const k of Object.keys(c)) delete c[k];
          c.itens = [];
        }),
      );
      confere((await selo()) === 'Incompatível', `selo: ${await selo()}`);
      await avaliar(
        `document.querySelector('[data-foco="fechar-erro-cadastro"]').click()`,
      );
      await aguardar(
        `(${cartao}?.querySelector('.documento__selo')?.textContent ?? '') === 'Opcional, não carregado'`,
        5000,
        'fechar o aviso não voltou a Opcional',
      );
    },
  );
}

module.exports = { casosCadastro };
