// Casos do test:janela para os perfis: renomear no Gerenciar perfis (Aplicar
// com o nome em edição, nome inválido, o check, o X, Enter), a cópia em
// perfis-excluidos antes de excluir, substituir ou voltar ao padrão (com a
// confirmação no visual do app), o importar com nome repetido (Substituir,
// Importar como cópia, Cancelar) e o aviso do exportar (caminho selecionável
// e Abrir pasta). Os diálogos do Windows e o Explorer são trocados por
// respostas fixas; nada abre de verdade. Perfis inventados; os criados aqui
// são excluídos no fim.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function casosPerfis(ctx) {
  const { caso, avaliar, aguardar, confere, espera, janela, dados, tmp } = ctx;
  const { dialog, shell } = require('electron');
  const pastaCopias = path.join(dados, 'perfis-excluidos');
  const copias = () =>
    fs.existsSync(pastaCopias) ? fs.readdirSync(pastaCopias) : [];
  const arquivos = path.join(tmp, 'perfis-arquivos');
  fs.mkdirSync(arquivos, { recursive: true });
  /** O perfil gravado no config.json (com o conteúdo), pelo nome. */
  const gravado = (nome) =>
    JSON.parse(
      fs.readFileSync(path.join(dados, 'config.json'), 'utf8'),
    ).perfis.lista.find((p) => p.nome === nome);

  const perfis = () => avaliar('window.psApi.perfis()');
  const nomes = async () => (await perfis()).lista.map((p) => p.nome);

  /**
   * Recarrega a janela: a tela guarda os perfis em memória, e o que muda
   * pelo canal direto (criar, limpar) só chega às outras janelas.
   */
  async function recarregar() {
    await avaliar('window.__antesDaRecarga = true; true');
    janela().webContents.reload();
    await aguardar(
      `!window.__antesDaRecarga && document.readyState === 'complete' && !!window.psApi`,
      30000,
      'a janela não recarregou',
    );
  }

  /** Cria um perfil de teste (vira o ativo) pelo canal do app. */
  async function criar(nome) {
    const r = await avaliar(
      `window.psApi.criarPerfil(${JSON.stringify(nome)})`,
    );
    confere(r.status === 'ok', `criar ${nome}: ${JSON.stringify(r)}`);
  }

  /** Exclui os perfis de teste que sobraram (sem a tela; não volta erro). */
  async function limpar(...prefixos) {
    for (const p of (await perfis()).lista)
      if (prefixos.some((x) => p.nome.startsWith(x)))
        await avaliar(`window.psApi.excluirPerfil(${JSON.stringify(p.id)})`);
  }

  const painelAberto = `!!document.getElementById('painel-colunas-titulo')?.closest('dialog[open]')`;

  /**
   * Abre o Gerenciar perfis pelo menu do perfil (com a lista à mostra),
   * depois de recarregar a janela com os perfis atuais.
   */
  async function abrirGerenciar() {
    await recarregar();
    await aguardar(
      `!!document.getElementById('btn-perfil') && !document.getElementById('vazio').hidden`,
      30000,
      'a tela inicial não voltou',
    );
    await avaliar(`document.getElementById('btn-perfil').click()`);
    await aguardar(
      `!!document.querySelector('#menu-perfil:not([hidden]) .perfil-rapido__opcao--gerenciar')`,
      15000,
      'o menu do perfil não abriu',
    );
    await avaliar(
      `document.querySelector('#menu-perfil .perfil-rapido__opcao--gerenciar').click()`,
    );
    await aguardar(
      `${painelAberto} && !document.getElementById('menu-perfis').hidden`,
      15000,
      'o Gerenciar perfis não abriu com a lista',
    );
  }

  /** Clica num botão do menu de perfis pelo aria-label. */
  const clicarRotulo = (rotulo) =>
    avaliar(`(() => {
      const b = document.querySelector('#menu-perfis [aria-label=${JSON.stringify(rotulo)}]');
      if (!b) return false;
      b.click();
      return true;
    })()`);

  /** Lápis do perfil `nome` e, no campo, o texto `novo` (como digitado). */
  async function editarNome(nome, novo) {
    if (await avaliar(`document.getElementById('menu-perfis').hidden`))
      await avaliar(`document.querySelector('.perfil-ativo__trocar').click()`);
    confere(
      await clicarRotulo(`Renomear o perfil ${nome}`),
      `sem o lápis de ${nome}`,
    );
    await aguardar(
      `!!document.querySelector('#menu-perfis .perfis-menu__campo')`,
      5000,
      'o campo do nome não apareceu',
    );
    await avaliar(`(() => {
      const c = document.querySelector('#menu-perfis .perfis-menu__campo');
      c.value = ${JSON.stringify(novo)};
      c.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  }

  /** Botão do rodapé do painel pelo texto. */
  const botaoRodape = (texto) =>
    `[...document.querySelectorAll('.painel__rodape button')].find((b) => b.textContent.trim() === ${JSON.stringify(texto)})`;

  /**
   * Clica no Aplicar como o mouse faz: o mousedown (que fecha o menu de
   * perfis) e o foco saem do campo antes do clique.
   */
  const clicarAplicar = () =>
    avaliar(`(() => {
      const b = ${botaoRodape('Aplicar')};
      b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      b.focus();
      b.click();
      return true;
    })()`);

  /** Fecha o painel pelo Cancelar, se estiver aberto. */
  async function fecharPainel() {
    await avaliar(
      `(() => { const b = ${botaoRodape('Cancelar')}; b?.click(); return true; })()`,
    ).catch(() => {});
    await aguardar(`!(${painelAberto})`, 5000, 'o painel não fechou').catch(
      () => {},
    );
  }

  /** O diálogo do app com este título, aberto. */
  const dialogoCom = (titulo) =>
    `[...document.querySelectorAll('dialog[open]')].find((d) => d.querySelector('.caixa-dialogo__titulo')?.textContent === ${JSON.stringify(titulo)})`;

  /** Espera o diálogo `titulo` e devolve o texto, o caminho e os botões. */
  async function lerDialogo(titulo) {
    await aguardar(`!!${dialogoCom(titulo)}`, 15000, `sem o diálogo ${titulo}`);
    return avaliar(`(() => {
      const d = ${dialogoCom(titulo)};
      const caminho = d.querySelector('.caixa-dialogo__pasta');
      return {
        texto: d.querySelector('.caixa-dialogo__texto').textContent,
        caminho: caminho ? caminho.textContent : null,
        selecao: caminho ? getComputedStyle(caminho).userSelect : null,
        botoes: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()),
        foco: document.activeElement?.textContent.trim() ?? '',
      };
    })()`);
  }

  const clicarNoDialogo = (titulo, rotulo) =>
    avaliar(`(() => {
      const b = [...${dialogoCom(titulo)}.querySelectorAll('button')]
        .find((x) => x.textContent.trim() === ${JSON.stringify(rotulo)});
      b.click();
      return true;
    })()`);

  /** Troca a resposta de um diálogo do Windows enquanto `fn` roda. */
  async function comDialogo(nome, resposta, fn) {
    const original = dialog[nome];
    dialog[nome] = async () => resposta;
    try {
      await fn();
    } finally {
      dialog[nome] = original;
    }
  }

  // ---------- renomear ----------

  await caso(
    'Perfis: nome em edição e Aplicar grava o nome junto e fecha',
    async () => {
      await criar('Renomear Teste');
      try {
        await abrirGerenciar();
        await editarNome('Renomear Teste', 'Renomeado Aplicar');
        await clicarAplicar();
        await aguardar(`!(${painelAberto})`, 15000, 'o Aplicar não fechou');
        const lista = await nomes();
        confere(
          lista.includes('Renomeado Aplicar') &&
            !lista.includes('Renomear Teste'),
          `perfis: ${JSON.stringify(lista)}`,
        );
      } finally {
        await fecharPainel();
        await limpar('Renomear Teste', 'Renomeado');
      }
    },
  );

  await caso(
    'Perfis: Aplicar com o nome inválido mostra o erro no campo e não fecha',
    async () => {
      await criar('Renomear Teste');
      await criar('Outro Teste');
      try {
        await abrirGerenciar();
        for (const [novo, erro] of [
          ['', 'Digite o nome do perfil.'],
          ['outro teste', 'Já existe um perfil com esse nome.'],
          ['x'.repeat(41), 'O nome pode ter no máximo 40 caracteres.'],
        ]) {
          await editarNome('Renomear Teste', novo);
          await clicarAplicar();
          await aguardar(
            `!document.querySelector('#menu-perfis .perfis-menu__erro')?.hidden`,
            5000,
            `o erro não apareceu para "${novo}"`,
          );
          const tela = await avaliar(`(() => {
            const c = document.querySelector('#menu-perfis .perfis-menu__campo');
            return {
              erro: document.querySelector('#menu-perfis .perfis-menu__erro').textContent,
              invalido: c?.getAttribute('aria-invalid'),
              foco: document.activeElement === c,
              menu: !document.getElementById('menu-perfis').hidden,
            };
          })()`);
          confere(tela.erro === erro, `erro para "${novo}": ${tela.erro}`);
          confere(tela.invalido === 'true', 'o campo não ficou inválido');
          confere(tela.menu && tela.foco, 'o campo não voltou à vista');
          confere(await avaliar(painelAberto), 'o painel fechou');
          // Volta ao nome de antes pelo X, para o próximo nome.
          await clicarRotulo('Cancelar');
        }
        confere(
          (await nomes()).includes('Renomear Teste'),
          'o nome mudou com um nome inválido',
        );
      } finally {
        await fecharPainel();
        await limpar('Renomear Teste', 'Outro Teste');
      }
    },
  );

  await caso(
    'Perfis: o check grava o nome e o X volta ao anterior',
    async () => {
      await criar('Renomear Teste');
      try {
        await abrirGerenciar();
        // Só ícone: o nome vai no aria-label, sem dica.
        await editarNome('Renomear Teste', 'Renomeado Check');
        const botoes =
          await avaliar(`[...document.querySelectorAll('#menu-perfis .perfis-menu__linha--editando button')]
        .map((b) => ({ rotulo: b.getAttribute('aria-label'), texto: b.textContent.trim(), dica: b.title }))`);
        confere(
          JSON.stringify(botoes) ===
            JSON.stringify([
              { rotulo: 'Salvar nome', texto: '', dica: '' },
              { rotulo: 'Cancelar', texto: '', dica: '' },
            ]),
          `botões da edição: ${JSON.stringify(botoes)}`,
        );
        confere(await clicarRotulo('Salvar nome'), 'sem o check');
        await aguardar(
          `window.psApi.perfis().then((e) => e.lista.some((p) => p.nome === 'Renomeado Check'))`,
          15000,
          'o check não gravou o nome',
        );
        await aguardar(
          `!document.querySelector('#menu-perfis .perfis-menu__campo')`,
          5000,
          'o campo continuou aberto depois do check',
        );
        confere(await avaliar(painelAberto), 'o check fechou o painel');
        // X: volta ao nome de antes, sem gravar.
        await editarNome('Renomeado Check', 'Nao Deve Ficar');
        confere(await clicarRotulo('Cancelar'), 'sem o X');
        await aguardar(
          `!document.querySelector('#menu-perfis .perfis-menu__campo')`,
          5000,
          'o X não fechou o campo',
        );
        const linha = await avaliar(
          `[...document.querySelectorAll('#menu-perfis .perfis-menu__texto')].map((e) => e.textContent)`,
        );
        confere(
          linha.includes('Renomeado Check') &&
            !linha.includes('Nao Deve Ficar'),
          `lista na tela: ${JSON.stringify(linha)}`,
        );
        // Esc também cancela, e o Enter grava.
        await editarNome('Renomeado Check', 'Renomeado Enter');
        await avaliar(`document.querySelector('#menu-perfis .perfis-menu__campo')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
        await aguardar(
          `window.psApi.perfis().then((e) => e.lista.some((p) => p.nome === 'Renomeado Enter'))`,
          15000,
          'o Enter não gravou o nome',
        );
        const lista = await nomes();
        confere(!lista.includes('Nao Deve Ficar'), `perfis: ${lista}`);
      } finally {
        await fecharPainel();
        await limpar('Renomear Teste', 'Renomeado');
      }
    },
  );

  // ---------- excluir ----------

  await caso(
    'Perfis: excluir confirma no app e guarda a cópia em perfis-excluidos antes',
    async () => {
      await criar('Excluir Teste');
      const antes = new Set(copias());
      try {
        await abrirGerenciar();
        confere(
          await clicarRotulo('Excluir o perfil Excluir Teste'),
          'sem a lixeira',
        );
        const d = await lerDialogo('Excluir perfil');
        confere(
          d.texto.includes('"Excluir Teste" sai da lista') &&
            d.texto.includes('perfis-excluidos') &&
            d.texto.includes('passa a ser o ativo'),
          `texto: ${d.texto}`,
        );
        confere(
          d.botoes.join() === 'Cancelar,Excluir',
          `botões: ${d.botoes.join()}`,
        );
        // Cancelar não exclui nem guarda nada.
        await clicarNoDialogo('Excluir perfil', 'Cancelar');
        confere(
          (await nomes()).includes('Excluir Teste'),
          'excluiu no Cancelar',
        );
        confere(copias().length === antes.size, 'guardou cópia no Cancelar');
        await clicarRotulo('Excluir o perfil Excluir Teste');
        await lerDialogo('Excluir perfil');
        await clicarNoDialogo('Excluir perfil', 'Excluir');
        await aguardar(
          `window.psApi.perfis().then((e) => !e.lista.some((p) => p.nome === 'Excluir Teste'))`,
          15000,
          'o perfil não saiu',
        );
        const novas = copias().filter((n) => !antes.has(n));
        confere(
          novas.length === 1 &&
            novas[0].endsWith(
              ' excluido - PS Reader - perfil Excluir Teste.json',
            ),
          `cópias novas: ${novas.join(', ')}`,
        );
        const copia = JSON.parse(
          fs.readFileSync(path.join(pastaCopias, novas[0]), 'utf8'),
        );
        confere(
          copia.tipo === 'perfil-ps-reader' && copia.nome === 'Excluir Teste',
          `cópia: ${JSON.stringify(copia).slice(0, 200)}`,
        );
      } finally {
        await fecharPainel();
        await limpar('Excluir Teste');
      }
    },
  );

  // ---------- importar ----------

  /** Arquivo de perfil inventado, como o Exportar grava. */
  function arquivoPerfil(nome, orientacao, sufixo) {
    const caminho = path.join(arquivos, `importar-${sufixo}.json`);
    fs.writeFileSync(
      caminho,
      JSON.stringify(
        {
          tipo: 'perfil-ps-reader',
          versao: 1,
          nome,
          colunas: [],
          anotacoes: [],
          orientacao,
          layout: { blocos: [] },
        },
        null,
        2,
      ),
    );
    return { canceled: false, filePaths: [caminho] };
  }

  /** Clica no Importar do menu de perfis (com o diálogo do Windows trocado). */
  async function importar(resposta) {
    await comDialogo('showOpenDialog', resposta, async () => {
      if (await avaliar(`document.getElementById('menu-perfis').hidden`))
        await avaliar(
          `document.querySelector('.perfil-ativo__trocar').click()`,
        );
      await avaliar(`[...document.querySelectorAll('#menu-perfis .perfis-menu__acao')]
        .find((b) => b.textContent.trim() === 'Importar').click()`);
      // O diálogo do Windows é lido logo no clique.
      await espera(500);
    });
  }

  await caso(
    'Perfis: importar com nome repetido pergunta Substituir, Importar como cópia ou Cancelar',
    async () => {
      const antes = new Set(copias());
      try {
        await abrirGerenciar();
        // Primeiro: nome livre, entra direto.
        await importar(arquivoPerfil('Importado Teste', 'paisagem', 'a'));
        await aguardar(
          `window.psApi.perfis().then((e) => e.lista.some((p) => p.nome === 'Importado Teste'))`,
          15000,
          'o perfil não foi importado',
        );
        // De novo: o nome já existe.
        const outro = arquivoPerfil('Importado Teste', 'retrato', 'b');
        await importar(outro);
        let d = await lerDialogo('Perfil com o mesmo nome');
        confere(
          d.botoes.join() === 'Cancelar,Substituir,Importar como cópia',
          `botões: ${d.botoes.join()}`,
        );
        confere(
          d.foco === 'Importar como cópia',
          `o foco começa em: ${d.foco}`,
        );
        confere(
          d.texto.includes('perfis-excluidos') &&
            d.texto.includes('"Importado Teste (2)"'),
          `texto: ${d.texto}`,
        );
        await clicarNoDialogo('Perfil com o mesmo nome', 'Cancelar');
        await espera(500);
        confere(
          (await nomes()).filter((n) => n.startsWith('Importado Teste'))
            .length === 1,
          'o Cancelar importou',
        );
        // Importar como cópia: os dois ficam.
        await importar(outro);
        await lerDialogo('Perfil com o mesmo nome');
        await clicarNoDialogo('Perfil com o mesmo nome', 'Importar como cópia');
        await aguardar(
          `window.psApi.perfis().then((e) => e.lista.some((p) => p.nome === 'Importado Teste (2)'))`,
          15000,
          'a cópia não entrou',
        );
        confere(
          gravado('Importado Teste').orientacao === 'paisagem',
          'o perfil de antes mudou no Importar como cópia',
        );
        confere(copias().length === antes.size, 'guardou cópia sem substituir');
        // Substituir: a cópia do perfil como estava, depois o conteúdo novo.
        await importar(outro);
        await lerDialogo('Perfil com o mesmo nome');
        await clicarNoDialogo('Perfil com o mesmo nome', 'Substituir');
        await aguardar(
          `window.psApi.perfis().then(() => true)`,
          5000,
          'o app não respondeu',
        );
        const limite = Date.now() + 15000;
        while (
          gravado('Importado Teste')?.orientacao !== 'retrato' &&
          Date.now() < limite
        )
          await espera(200);
        confere(
          gravado('Importado Teste').orientacao === 'retrato',
          'o Substituir não trocou o conteúdo',
        );
        const novas = copias().filter((n) => !antes.has(n));
        confere(
          novas.length === 1 &&
            novas[0].endsWith(
              ' substituido - PS Reader - perfil Importado Teste.json',
            ),
          `cópias novas: ${novas.join(', ')}`,
        );
        confere(
          JSON.parse(fs.readFileSync(path.join(pastaCopias, novas[0]), 'utf8'))
            .orientacao === 'paisagem',
          'a cópia não é o perfil de antes',
        );
      } finally {
        await fecharPainel();
        await limpar('Importado Teste');
      }
    },
  );

  // ---------- exportar ----------

  await caso(
    'Perfis: o aviso do exportar mostra o caminho selecionável e Abrir pasta mostra o arquivo',
    async () => {
      const destino = path.join(arquivos, 'PS Reader - perfil exportado.json');
      const mostrados = [];
      const original = shell.showItemInFolder;
      shell.showItemInFolder = (p) => {
        mostrados.push(p);
      };
      try {
        await abrirGerenciar();
        const ativo = (await perfis()).nomeAtivo;
        await comDialogo(
          'showSaveDialog',
          { canceled: false, filePath: destino },
          async () => {
            await avaliar(`[...document.querySelectorAll('#menu-perfis .perfis-menu__acao')]
              .find((b) => b.textContent.trim() === 'Exportar perfil ativo').click()`);
            await espera(500);
          },
        );
        const d = await lerDialogo('Perfil exportado');
        confere(d.caminho === destino, `caminho: ${d.caminho}`);
        confere(d.selecao === 'text', `caminho com user-select ${d.selecao}`);
        confere(d.texto.includes(`"${ativo}"`), `texto: ${d.texto}`);
        confere(
          d.botoes.join() === 'Fechar,Abrir pasta',
          `botões: ${d.botoes.join()}`,
        );
        confere(fs.existsSync(destino), 'o arquivo não foi gravado');
        await clicarNoDialogo('Perfil exportado', 'Abrir pasta');
        const limite = Date.now() + 5000;
        while (mostrados.length === 0 && Date.now() < limite) await espera(100);
        confere(
          mostrados.length === 1 && mostrados[0] === destino,
          `Abrir pasta mostrou: ${JSON.stringify(mostrados)}`,
        );
      } finally {
        shell.showItemInFolder = original;
        await fecharPainel();
      }
    },
  );

  // ---------- restaurar padrão ----------

  await caso(
    'Perfis: restaurar padrão confirma no app e guarda a cópia antes',
    async () => {
      await criar('Padrao Teste');
      const antes = new Set(copias());
      try {
        await abrirGerenciar();
        await avaliar(
          `document.querySelector('.perfil-ativo__trocar').click()`,
        );
        await avaliar(
          `(() => { const b = ${botaoRodape('Restaurar padrão')}; b.click(); return true; })()`,
        );
        const d = await lerDialogo('Restaurar padrão');
        confere(
          d.texto.includes('"Padrao Teste" voltam ao padrão') &&
            d.texto.includes('perfis-excluidos'),
          `texto: ${d.texto}`,
        );
        await clicarNoDialogo('Restaurar padrão', 'Restaurar');
        const limite = Date.now() + 15000;
        while (
          copias().filter((n) => !antes.has(n)).length === 0 &&
          Date.now() < limite
        )
          await espera(200);
        const novas = copias().filter((n) => !antes.has(n));
        confere(
          novas.length === 1 &&
            novas[0].endsWith(
              ' antes do padrao - PS Reader - perfil Padrao Teste.json',
            ),
          `cópias novas: ${novas.join(', ')}`,
        );
      } finally {
        await fecharPainel();
        await limpar('Padrao Teste');
      }
    },
  );
}

module.exports = { casosPerfis };
