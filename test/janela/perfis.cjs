// Casos do test:janela para os perfis: renomear no Gerenciar perfis (Aplicar
// com o nome em edição, nome inválido, o check, o X, Enter). Perfis
// inventados; os criados aqui são excluídos no fim.
'use strict';

async function casosPerfis(ctx) {
  const { caso, avaliar, aguardar, confere, janela } = ctx;

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
}

module.exports = { casosPerfis };
