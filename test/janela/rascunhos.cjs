// Casos do test:janela para o rascunho das anotações (src/rascunhos.ts).
// Cada abertura do app é um processo à parte (rascunhoFilho.cjs), com uma
// pasta de dados só do caso, dentro da pasta temporária da rodada: assim dá
// para encerrar o processo à força, como o instalador ou a queda de energia,
// e abrir de novo com a mesma pasta. Notas inventadas (fixtures). Com
// PS_JANELA_CAPTURAS, grava o aviso com uma e com três notas e a pergunta
// de uma nota só, em 680, 1366 e 1920.
'use strict';

const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const FILHO = path.join(__dirname, 'rascunhoFilho.cjs');
const FIXTURES = path.join(__dirname, 'fixtures');
/** Nota inventada com dois itens. */
const NOTA = 't13-st-autopecas.xml';
const CHAVE_NOTA = '35261100000000000000550010000000131000000130';

async function casosRascunhos(ctx) {
  const { caso, confere, tmp } = ctx;
  const raiz = path.join(tmp, 'rascunhos-casos');
  let n = 0;

  /** Pasta de dados nova (com pasta de destino própria) e a cópia da nota. */
  function novoCaso() {
    const base = path.join(raiz, `caso-${++n}`);
    const dados = path.join(base, 'dados');
    const destino = path.join(base, 'destino');
    const notas = path.join(base, 'notas');
    for (const p of [dados, destino, notas])
      fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(
      path.join(dados, 'config.json'),
      JSON.stringify(
        { pastaDestino: destino, cnpjEmpresa: '12345678000195' },
        null,
        2,
      ),
    );
    const nota = path.join(notas, NOTA);
    fs.copyFileSync(path.join(FIXTURES, NOTA), nota);
    return { base, dados, destino, nota };
  }

  const rascunhosEm = (dados) => {
    try {
      return fs
        .readdirSync(path.join(dados, 'rascunhos'))
        .filter((x) => x.endsWith('.json'));
    } catch {
      return [];
    }
  };

  /**
   * Abre o app num processo à parte e roda o roteiro. `matar`: espera o
   * resultado e encerra o processo à força (taskkill /F /T), sem passar
   * pelo fechamento normal.
   */
  async function rodar(
    roteiro,
    c,
    { arquivo = '', extra = '', captura = '', matar = false } = {},
  ) {
    const saida = path.join(c.base, `saida-${roteiro}-${Date.now()}.json`);
    const filho = spawn(process.execPath, [FILHO], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env,
        PS_RASCUNHO_DADOS: c.dados,
        PS_RASCUNHO_ROTEIRO: roteiro,
        PS_RASCUNHO_SAIDA: saida,
        PS_RASCUNHO_ARQUIVO: arquivo,
        PS_RASCUNHO_EXTRA: extra,
        PS_RASCUNHO_CAPTURA: captura,
      },
    });
    let erros = '';
    filho.stderr.on('data', (d) => {
      erros = (erros + String(d)).slice(-4000);
    });
    const saiu = new Promise((r) => filho.on('exit', (codigo) => r(codigo)));
    const limite = Date.now() + 120000;
    let terminou = false;
    saiu.then(() => {
      terminou = true;
    });
    while (!fs.existsSync(saida) && !terminou && Date.now() < limite)
      await new Promise((r) => setTimeout(r, 200));
    if (matar || !terminou) {
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

  /** Rascunho inventado no formato do app (para o aviso com três notas). */
  function rascunhoInventado(dados, chave, fornecedor, numero, minutos) {
    const pasta = path.join(dados, 'rascunhos');
    fs.mkdirSync(pasta, { recursive: true });
    const r = {
      versao: 1,
      id: `nfe-${chave}`,
      alteradoEm: new Date(Date.now() - minutos * 60000).toISOString(),
      chave,
      caminho: path.join(dados, '..', 'notas', `nota-${numero}.xml`),
      tipo: 'xml',
      pastaDestino: null,
      fornecedor,
      numero,
      serie: '1',
      versaoApp: '0.0.0',
      psxml: fs.readFileSync(path.join(FIXTURES, NOTA), 'utf8'),
    };
    fs.writeFileSync(path.join(pasta, `${r.id}.json`), JSON.stringify(r));
  }

  const TEXTO_AVISO =
    'O PS Reader fechou sem salvar estas notas. Quer recuperar as anotações?';

  // (a) e (e) usam a mesma pasta de dados, em sequência.
  const a = novoCaso();

  await caso(
    'rascunho (a): anotar, encerrar à força, abrir de novo e recuperar as duas anotações',
    async () => {
      const anotado = await rodar('anotar', a, {
        arquivo: a.nota,
        matar: true,
      });
      confere(
        anotado.durante === 0,
        'o rascunho foi gravado durante a digitação',
      );
      confere(
        anotado.rascunho.nome === `nfe-${CHAVE_NOTA}.json`,
        `nome do rascunho: ${anotado.rascunho.nome}`,
      );
      const r = anotado.rascunho;
      confere(
        r.caminho === a.nota &&
          r.tipo === 'xml' &&
          r.pastaDestino === a.destino,
        `caminho, tipo e destino: ${r.caminho} ${r.tipo} ${r.pastaDestino}`,
      );
      confere(
        r.psxml.includes('psCopiaEditada') && r.psxml.includes('<nfeProc'),
        'o rascunho não tem o .psxml com o XML original dentro',
      );
      confere(
        r.fornecedor && r.numero === '13' && r.serie === '1' && r.versaoApp,
        `dados da nota: ${r.fornecedor} ${r.numero} ${r.serie} ${r.versaoApp}`,
      );
      // Nada na pasta de destino nem ao lado do XML.
      confere(
        fs.readdirSync(a.destino).length === 0,
        `pasta de destino: ${fs.readdirSync(a.destino).join(', ')}`,
      );
      confere(
        fs.readdirSync(path.dirname(a.nota)).join() === NOTA,
        'apareceu arquivo ao lado do XML',
      );
      const rec = await rodar('recuperar', a, { captura: 'rascunhos' });
      confere(rec.aviso.texto === TEXTO_AVISO, `texto: ${rec.aviso.texto}`);
      confere(rec.aviso.linhas.length === 1, 'o aviso não tem uma linha');
      const linha = rec.aviso.linhas[0];
      confere(
        /NF 13, série 1/.test(linha.dados) &&
          /Última alteração em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/.test(
            linha.dados,
          ),
        `linha: ${linha.dados}`,
      );
      confere(
        JSON.stringify(linha.botoes) === '["Descartar","Recuperar"]' &&
          JSON.stringify(rec.aviso.rodape) === '["Decidir depois"]',
        `botões: ${JSON.stringify(linha.botoes)} ${JSON.stringify(rec.aviso.rodape)}`,
      );
      confere(
        rec.aviso.selecaoDados === 'text' && rec.aviso.selecaoTitulo === 'none',
        `seleção: dados ${rec.aviso.selecaoDados}, título ${rec.aviso.selecaoTitulo}`,
      );
      confere(
        rec.valores['1'] === 'COD-A1' && rec.valores['2'] === 'COD-B2',
        `anotações recuperadas: ${JSON.stringify(rec.valores)}`,
      );
      confere(rec.naConferencia, 'a nota não abriu na aba PSXML');
      confere(rec.naoSalva, 'a janela não marcou alteração não salva');
      confere(
        rascunhosEm(a.dados).length === 1,
        'o rascunho saiu sem a pessoa salvar',
      );
    },
  );

  await caso(
    'rascunho (e): nota com rascunho aberta por duplo clique pergunta só dela',
    async () => {
      confere(rascunhosEm(a.dados).length === 1, 'sem o rascunho do caso (a)');
      const d = await rodar('duploClique', a, {
        arquivo: a.nota,
        captura: 'rascunhos',
      });
      confere(
        JSON.stringify(d.pergunta.caixas) ===
          '["Recuperar anotações desta nota"]',
        `caixas abertas: ${JSON.stringify(d.pergunta.caixas)}`,
      );
      confere(
        !d.pergunta.notaVisivel,
        'a nota apareceu antes da resposta da pergunta',
      );
      confere(
        JSON.stringify(d.pergunta.botoes) ===
          '["Abrir sem elas","Recuperar as anotações"]',
        `botões: ${JSON.stringify(d.pergunta.botoes)}`,
      );
      confere(/NF 13, série 1/.test(d.pergunta.dados), d.pergunta.dados);
      confere(
        d.valores['1'] === 'COD-A1' && d.valores['2'] === 'COD-B2',
        `anotações: ${JSON.stringify(d.valores)}`,
      );
      confere(!d.aviso, 'o aviso da abertura apareceu com a nota na janela');
    },
  );

  await caso(
    'rascunho (a): sem o XML original, recupera com a nota de dentro do rascunho e avisa',
    async () => {
      const c = novoCaso();
      await rodar('anotar', c, { arquivo: c.nota, matar: true });
      fs.rmSync(c.nota);
      const rec = await rodar('recuperar', c);
      confere(
        rec.valores['1'] === 'COD-A1' && rec.valores['2'] === 'COD-B2',
        `anotações: ${JSON.stringify(rec.valores)}`,
      );
      confere(
        rec.mensagem.includes(`não está mais em ${c.nota}`),
        `aviso: ${rec.mensagem}`,
      );
      confere(rec.naoSalva, 'a janela não marcou alteração não salva');
    },
  );

  await caso('rascunho (b): anotar e salvar apaga o rascunho', async () => {
    const c = novoCaso();
    const r = await rodar('salvar', c, { arquivo: c.nota });
    confere(r.antes === 1, 'o rascunho não foi gravado antes de salvar');
    confere(r.depois === 0, 'o rascunho ficou depois de salvar');
    confere(
      fs.readdirSync(c.destino).some((x) => x.endsWith('.psxml')),
      'o .psxml não foi salvo',
    );
  });

  await caso(
    'rascunho (c): fechar escolhendo Descartar apaga o rascunho e não há aviso ao abrir',
    async () => {
      const c = novoCaso();
      const r = await rodar('descartar', c, { arquivo: c.nota });
      confere(r.antes === 1, 'o rascunho não foi gravado antes de fechar');
      confere(rascunhosEm(c.dados).length === 0, 'o rascunho ficou');
      const s = await rodar('semArquivo', c);
      confere(s.aviso === null, 'o aviso apareceu depois de Descartar');
    },
  );

  await caso(
    'rascunho (d): Decidir depois fecha o aviso e ele volta na próxima abertura',
    async () => {
      const c = novoCaso();
      const chave = (i) => CHAVE_NOTA.replace(/0130$/, `09${i}0`);
      rascunhoInventado(c.dados, chave(1), 'Parafusos Exemplo Ltda', '901', 3);
      rascunhoInventado(c.dados, chave(2), 'Ferragens Modelo S.A.', '902', 50);
      rascunhoInventado(
        c.dados,
        chave(3),
        'Distribuidora Fictícia de Fixadores e Ferramentas Industriais',
        '903',
        200,
      );
      const r = await rodar('adiar', c, { captura: 'rascunhos' });
      confere(r.aviso.linhas.length === 3, 'o aviso não tem três linhas');
      confere(
        r.aviso.linhas[0].dados.startsWith('Parafusos Exemplo Ltda'),
        `ordem: ${r.aviso.linhas.map((l) => l.dados).join(' | ')}`,
      );
      confere(r.rascunhos === 3, 'Decidir depois apagou rascunho');
      // O instalador abre o app com --squirrel-firstrun: sem aviso.
      const f = await rodar('semArquivo', c, { extra: '--squirrel-firstrun' });
      confere(f.aviso === null, 'o aviso apareceu no --squirrel-firstrun');
      const s = await rodar('semArquivo', c);
      confere(
        s.aviso && s.aviso.linhas.length === 3,
        'o aviso não voltou na próxima abertura',
      );
    },
  );
}

module.exports = { casosRascunhos };
