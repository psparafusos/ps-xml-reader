// Casos do test:janela para a tela de boas-vindas (src/boasVindas.ts). Cada
// abertura do app é um processo à parte (boasVindasFilho.cjs), com a pasta
// de dados e a pasta Documentos só do caso, dentro da pasta temporária da
// rodada. CNPJs e notas inventados. Com PS_JANELA_CAPTURAS, grava a tela
// com o CNPJ inválido e com a sugestão das notas recentes, em 680, 1366 e
// 1920.
'use strict';

const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FILHO = path.join(__dirname, 'boasVindasFilho.cjs');
const FIXTURES = path.join(__dirname, 'fixtures');
/** CNPJ inventado da loja (o destinatário dos fixtures t15 a t19). */
const CNPJ_LOJA = '12345678000195';

async function casosBoasVindas(ctx) {
  const { caso, confere, tmp } = ctx;
  const raiz = path.join(tmp, 'boas-vindas-casos');
  let n = 0;

  /** Pastas novas do caso; `config`: o config.json inicial (sem: nenhum). */
  function novoCaso(config) {
    const base = path.join(raiz, `caso-${++n}`);
    const dados = path.join(base, 'dados');
    const documentos = path.join(base, 'documentos');
    const notas = path.join(base, 'notas');
    for (const p of [dados, documentos, notas])
      fs.mkdirSync(p, { recursive: true });
    if (config)
      fs.writeFileSync(
        path.join(dados, 'config.json'),
        JSON.stringify(config(base), null, 2),
      );
    return { base, dados, documentos, notas };
  }

  const copia = (c, nome) => {
    const alvo = path.join(c.notas, nome);
    fs.copyFileSync(path.join(FIXTURES, nome), alvo);
    return alvo;
  };

  /** Abre o app num processo à parte, roda o roteiro e devolve o resultado. */
  async function rodar(
    roteiro,
    c,
    { arquivo = '', extra = '', captura = '' } = {},
  ) {
    const saida = path.join(c.base, `saida-${roteiro}-${Date.now()}.json`);
    const filho = spawn(process.execPath, [FILHO], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env,
        PS_BV_DADOS: c.dados,
        PS_BV_DOCUMENTOS: c.documentos,
        PS_BV_ROTEIRO: roteiro,
        PS_BV_SAIDA: saida,
        PS_BV_ARQUIVO: arquivo,
        PS_BV_EXTRA: extra,
        PS_BV_CAPTURA: captura,
      },
    });
    let erros = '';
    filho.stderr.on('data', (d) => {
      erros = (erros + String(d)).slice(-4000);
    });
    const saiu = new Promise((r) => filho.on('exit', (codigo) => r(codigo)));
    let terminou = false;
    saiu.then(() => {
      terminou = true;
    });
    const limite = Date.now() + 120000;
    while (!terminou && Date.now() < limite)
      await new Promise((r) => setTimeout(r, 200));
    if (!terminou) {
      try {
        execFileSync('taskkill', ['/F', '/T', '/PID', String(filho.pid)], {
          stdio: 'ignore',
        });
      } catch {
        // Já tinha saído.
      }
    }
    await saiu;
    // O Windows solta a pasta de dados (trava de instância única) logo
    // depois que os processos saem.
    await new Promise((r) => setTimeout(r, 800));
    confere(
      fs.existsSync(saida),
      `o roteiro ${roteiro} não terminou; stderr: ${erros}`,
    );
    const r = JSON.parse(fs.readFileSync(saida, 'utf8'));
    confere(r.ok, `roteiro ${roteiro}: ${r.erro}`);
    return r.dados;
  }

  const nomeWindows = (() => {
    try {
      return os.userInfo().username;
    } catch {
      return '';
    }
  })();

  await caso(
    'boas-vindas: primeira abertura sem configuração mostra a tela; CNPJ vazio e inválido não passam; o válido grava e abre a tela inicial',
    async () => {
      const c = novoCaso(null);
      const r = await rodar('primeira', c, { captura: 'boas-vindas' });
      const t = r.tela;
      confere(t, 'a tela não foi lida');
      confere(t.titulo === 'Boas-vindas ao PS Reader', `título: ${t.titulo}`);
      confere(t.cnpj === '', `o campo do CNPJ não começou vazio: ${t.cnpj}`);
      confere(t.sugestao === null, 'sugestão sem notas recentes');
      confere(
        t.perfil === nomeWindows.slice(0, 40) || (!nomeWindows && t.perfil),
        `nome do perfil sugerido: ${t.perfil}`,
      );
      const pastaSugerida = path.join(c.documentos, 'PS Reader');
      confere(t.pasta === pastaSugerida, `pasta sugerida: ${t.pasta}`);
      confere(
        t.textos.some((x) =>
          x.includes('Serve para conferir se as notas abertas são da loja'),
        ),
        `a frase do CNPJ não apareceu: ${JSON.stringify(t.textos)}`,
      );
      confere(t.semNome === 0, 'botão sem texto e sem aria-label');
      confere(
        t.selecaoTitulo === 'none' &&
          t.selecaoRotulo === 'none' &&
          t.selecaoBotao === 'none' &&
          t.selecaoTexto === 'none',
        `partes do app selecionáveis: ${JSON.stringify(t)}`,
      );
      confere(
        t.selecaoCampo === 'text' && t.selecaoCaminho === 'text',
        `dados não selecionáveis: campo ${t.selecaoCampo}, caminho ${t.selecaoCaminho}`,
      );
      for (const m of r.medidas)
        confere(
          m.ladoPagina && m.ladoTela && m.botaoNaTela,
          `largura ${m.largura}: ${JSON.stringify(m)}`,
        );
      confere(r.depoisEsc, 'o Esc fechou a tela');
      confere(r.dialogos === 0, 'Ctrl+O abriu o diálogo de arquivo');
      confere(
        r.vazio && r.vazio.erro.includes('Digite o CNPJ da loja.'),
        `CNPJ vazio: ${JSON.stringify(r.vazio && r.vazio.erro)}`,
      );
      confere(
        r.invalido &&
          r.invalido.erro.includes('CNPJ inválido: confira os dígitos.') &&
          r.invalido.invalido === 'true',
        `CNPJ inválido: ${JSON.stringify(r.invalido && r.invalido.erro)}`,
      );
      confere(
        r.configInvalido.cnpjEmpresa === undefined,
        'o CNPJ inválido foi gravado',
      );
      confere(
        r.config.cnpjEmpresa === CNPJ_LOJA,
        `CNPJ gravado: ${r.config.cnpjEmpresa}`,
      );
      confere(
        r.config.pastaDestino === pastaSugerida &&
          fs.statSync(pastaSugerida).isDirectory(),
        `pasta gravada: ${r.config.pastaDestino}`,
      );
      confere(
        r.perfis.lista.length === 1 && r.perfis.nomeAtivo === t.perfil,
        `perfis: ${JSON.stringify(r.perfis.lista)}`,
      );
      confere(
        r.avisos.cnpjEmpresa === CNPJ_LOJA,
        `configAvisos: ${JSON.stringify(r.avisos)}`,
      );
      if (process.env.PS_JANELA_CAPTURAS)
        confere(
          r.capturadas.length === 3,
          `capturas: ${JSON.stringify(r.capturadas)}`,
        );
    },
    { limpar: false },
  );

  await caso(
    'boas-vindas: atualização com perfis e sem CNPJ mostra a sugestão das notas recentes e mantém perfis e pasta',
    async () => {
      // Notas recentes: duas para a loja (t15, t16) e uma para outra
      // empresa (t13, destinatário inventado com zeros).
      const c = novoCaso((base) => {
        const notas = path.join(base, 'notas');
        const recente = (nome, numero, horas) => ({
          caminho: path.join(notas, nome),
          chave: '',
          fornecedor: 'Fornecedor Inventado',
          numero,
          itens: 1,
          acesso: new Date(Date.now() - horas * 3600000).toISOString(),
          situacao: 'conferida',
          alerta: '',
        });
        return {
          pastaDestino: path.join(base, 'destino'),
          perfis: {
            versao: 1,
            ativo: 'p-fiscal2',
            lista: [
              { id: 'p-conf1', nome: 'Conferente Teste' },
              { id: 'p-fiscal2', nome: 'Fiscal Teste' },
            ].map((p) => ({
              ...p,
              colunas: [],
              anotacoes: [],
              layout: { blocos: [] },
            })),
            fornecedores: {},
          },
          notasRecentes: [
            recente('t13-st-autopecas.xml', '13', 1),
            recente('t15-frete-cif.xml', '15', 2),
            recente('t16-frete-fob.xml', '16', 3),
          ],
        };
      });
      fs.mkdirSync(path.join(c.base, 'destino'));
      for (const nome of [
        't13-st-autopecas.xml',
        't15-frete-cif.xml',
        't16-frete-fob.xml',
      ])
        copia(c, nome);
      const antes = JSON.parse(
        fs.readFileSync(path.join(c.dados, 'config.json'), 'utf8'),
      );
      const r = await rodar('atualizacao', c, { captura: 'boas-vindas' });
      confere(
        r.tela.sugestao === '12.345.678/0001-95',
        `sugestão: ${r.tela.sugestao}`,
      );
      confere(
        r.tela.selecaoSugestao === 'text',
        `a sugestão não é selecionável: ${r.tela.selecaoSugestao}`,
      );
      confere(r.tela.cnpj === '', `o campo veio preenchido: ${r.tela.cnpj}`);
      confere(r.tela.perfil === 'Fiscal Teste', `perfil: ${r.tela.perfil}`);
      confere(
        r.tela.pasta === path.join(c.base, 'destino'),
        `pasta: ${r.tela.pasta}`,
      );
      confere(
        r.configAntes.cnpjEmpresa === undefined,
        'a sugestão foi gravada sem confirmação',
      );
      confere(
        r.depoisUsar.cnpj === '12.345.678/0001-95',
        `Usar este CNPJ: ${r.depoisUsar.cnpj}`,
      );
      confere(
        r.config.cnpjEmpresa === CNPJ_LOJA,
        `CNPJ gravado: ${r.config.cnpjEmpresa}`,
      );
      confere(
        r.config.pastaDestino === antes.pastaDestino,
        `pasta trocada: ${r.config.pastaDestino}`,
      );
      const ids = r.config.perfis.lista.map((p) => `${p.id}:${p.nome}`);
      confere(
        JSON.stringify(ids) ===
          '["p-conf1:Conferente Teste","p-fiscal2:Fiscal Teste"]' &&
          r.config.perfis.ativo === 'p-fiscal2',
        `perfis depois: ${JSON.stringify(ids)}, ativo ${r.config.perfis.ativo}`,
      );
      confere(
        JSON.stringify(r.config.notasRecentes.map((x) => x.numero)) ===
          JSON.stringify(antes.notasRecentes.map((x) => x.numero)),
        'as notas recentes mudaram',
      );
      confere(
        !fs.existsSync(path.join(c.documentos, 'PS Reader')),
        'criou a pasta sugerida com uma pasta já gravada',
      );
    },
    { limpar: false },
  );

  await caso(
    'boas-vindas: com CNPJ gravado, a tela não aparece (nem no --squirrel-firstrun sem CNPJ)',
    async () => {
      const c = novoCaso((base) => ({
        pastaDestino: path.join(base, 'notas'),
        cnpjEmpresa: CNPJ_LOJA,
      }));
      const r = await rodar('comCnpj', c);
      confere(!r.tela, 'a tela apareceu com CNPJ gravado');
      const f = novoCaso(null);
      const rf = await rodar('comCnpj', f, { extra: '--squirrel-firstrun' });
      confere(!rf.tela, 'a tela apareceu no --squirrel-firstrun');
    },
    { limpar: false },
  );

  await caso(
    'boas-vindas: arquivo aberto com a tela aberta espera e abre depois do Começar',
    async () => {
      const c = novoCaso((base) => ({
        pastaDestino: path.join(base, 'notas'),
      }));
      const nota = copia(c, 't15-frete-cif.xml');
      const r = await rodar('comArquivo', c, { arquivo: nota });
      confere(
        r.antes && !r.antes.notaAberta,
        'a nota abriu por baixo da tela de boas-vindas',
      );
      confere(r.config.cnpjEmpresa === CNPJ_LOJA, 'CNPJ não gravado');
    },
    { limpar: false },
  );
}

module.exports = { casosBoasVindas };
