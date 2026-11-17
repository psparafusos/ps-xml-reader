// Casos do test:janela para o config.json seguro (src/configSeguro.ts):
// config.json cortado com config.json.bak válido, e perfis com um campo
// inválido num perfil. Os arquivos vão para a pasta de dados temporária da
// rodada; a janela é recarregada e relê tudo (o app não guarda o config em
// memória). Confere a lista de perfis, a cópia guardada na pasta de dados e
// o aviso no visual do app (uma vez, com o texto selecionável). Perfis
// inventados. Roda por último: muda os perfis da rodada.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TITULO_AVISO = 'Configuração recuperada';

/** Perfil inventado no formato do config.json (o que falta entra no padrão). */
function perfil(id, nome, extra = {}) {
  return {
    id,
    nome,
    colunas: [],
    anotacoes: [],
    orientacao: 'automatica',
    layout: { blocos: [] },
    ...extra,
  };
}

async function casosConfigSeguro(ctx) {
  const { caso, avaliar, aguardar, confere, espera, janela, dados } = ctx;
  const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
  const arquivo = (nome) => path.join(dados, nome);
  const copias = (prefixo) =>
    fs.readdirSync(dados).filter((n) => n.startsWith(prefixo));
  const usuario = (() => {
    try {
      return os.userInfo().username;
    } catch {
      return '';
    }
  })();

  /** Recarrega a janela e espera a tela inicial da página nova. */
  async function recarregar() {
    await avaliar('window.__antesDaRecarga = true; true');
    janela().webContents.reload();
    await aguardar(
      `!window.__antesDaRecarga && document.readyState === 'complete' && !!window.psApi`,
      30000,
      'a janela não recarregou',
    );
  }

  const avisoAberto = `[...document.querySelectorAll('dialog[open] .caixa-dialogo__titulo')].some((t) => t.textContent === ${JSON.stringify(TITULO_AVISO)})`;

  /** Espera o aviso, devolve o texto e a seleção, e fecha pelo Entendi. */
  async function lerEFecharAviso() {
    await aguardar(avisoAberto, 15000, 'o aviso de recuperação não apareceu');
    const aviso = await avaliar(`(() => {
      const d = [...document.querySelectorAll('dialog[open]')].find(
        (x) => x.querySelector('.caixa-dialogo__titulo')?.textContent === ${JSON.stringify(TITULO_AVISO)},
      );
      const p = d.querySelector('.caixa-dialogo__texto');
      return { texto: p.textContent, selecao: getComputedStyle(p).userSelect };
    })()`);
    await avaliar(`[...document.querySelectorAll('dialog[open] button')]
      .find((b) => b.textContent.trim() === 'Entendi').click(); true`);
    await aguardar(`!(${avisoAberto})`, 5000, 'o Entendi não fechou o aviso');
    return aviso;
  }

  /** Nada gravando: o que o app grava ao voltar para o início já terminou. */
  async function quieto() {
    await espera(800);
  }

  await caso(
    'config: config.json cortado com .bak válido abre com "Perfil Teste", sem perfil com o nome do Windows',
    async () => {
      await quieto();
      const atual = JSON.parse(fs.readFileSync(arquivo('config.json'), 'utf8'));
      const bak = json({
        pastaDestino: atual.pastaDestino,
        cnpjEmpresa: atual.cnpjEmpresa,
        perfis: {
          versao: 1,
          ativo: 'p-teste1',
          lista: [perfil('p-teste1', 'Perfil Teste')],
          fornecedores: {},
        },
      });
      const cortado = bak.slice(0, Math.floor(bak.length / 2));
      const antes = new Set(copias('config-ilegivel-'));
      fs.writeFileSync(arquivo('config.json.bak'), bak);
      fs.writeFileSync(arquivo('config.json'), cortado);
      await recarregar();
      const aviso = await lerEFecharAviso();
      const estado = await avaliar('window.psApi.perfis()');
      const nomes = estado.lista.map((p) => p.nome);
      confere(
        JSON.stringify(nomes) === '["Perfil Teste"]',
        `perfis depois da recuperação: ${JSON.stringify(nomes)}`,
      );
      confere(
        estado.nomeAtivo === 'Perfil Teste',
        `perfil ativo: ${estado.nomeAtivo}`,
      );
      confere(
        !usuario || !nomes.includes(usuario),
        'apareceu o perfil com o nome do Windows',
      );
      const novas = copias('config-ilegivel-').filter((n) => !antes.has(n));
      confere(novas.length === 1, `cópias novas: ${novas.join(', ')}`);
      confere(
        fs.readFileSync(arquivo(novas[0]), 'utf8') === cortado,
        'a cópia não é o arquivo cortado',
      );
      confere(
        aviso.texto.includes(novas[0]),
        `o aviso não cita a cópia: ${aviso.texto}`,
      );
      confere(aviso.selecao === 'text', `texto do aviso: ${aviso.selecao}`);
      const config = JSON.parse(
        fs.readFileSync(arquivo('config.json'), 'utf8'),
      );
      confere(
        config.pastaDestino === atual.pastaDestino,
        'a pasta de destino do .bak não voltou',
      );
      // Uma vez só: recarregar de novo não mostra o aviso.
      await recarregar();
      await espera(1500);
      confere(
        !(await avaliar(avisoAberto)),
        'o aviso apareceu de novo depois de fechado',
      );
    },
  );

  await caso(
    'config: perfis com um campo inválido num perfil mantêm os nomes e guardam a cópia perfis-invalidos',
    async () => {
      await quieto();
      const atual = JSON.parse(fs.readFileSync(arquivo('config.json'), 'utf8'));
      const original = {
        versao: 1,
        ativo: 'p-fiscal2',
        lista: [
          perfil('p-conf1', 'Conferente Teste', { orientacao: 'retrato' }),
          // Orientação que nenhuma versão aceita.
          perfil('p-fiscal2', 'Fiscal Teste', { orientacao: 'diagonal' }),
        ],
        fornecedores: {},
      };
      const antes = new Set(copias('perfis-invalidos-'));
      fs.writeFileSync(
        arquivo('config.json'),
        json({ ...atual, perfis: original }),
      );
      await recarregar();
      const aviso = await lerEFecharAviso();
      const estado = await avaliar('window.psApi.perfis()');
      const nomes = estado.lista.map((p) => p.nome);
      confere(
        JSON.stringify(nomes) === '["Conferente Teste","Fiscal Teste"]',
        `perfis depois da recuperação: ${JSON.stringify(nomes)}`,
      );
      confere(
        estado.nomeAtivo === 'Fiscal Teste',
        `perfil ativo: ${estado.nomeAtivo}`,
      );
      confere(
        estado.config.orientacao === 'automatica',
        `orientação do perfil recuperado: ${estado.config.orientacao}`,
      );
      const novas = copias('perfis-invalidos-').filter((n) => !antes.has(n));
      confere(novas.length === 1, `cópias novas: ${novas.join(', ')}`);
      confere(
        JSON.stringify(
          JSON.parse(fs.readFileSync(arquivo(novas[0]), 'utf8')),
        ) === JSON.stringify(original),
        'a cópia não é o conteúdo original dos perfis',
      );
      confere(
        aviso.texto.includes(novas[0]) && aviso.texto.includes('Fiscal Teste'),
        `aviso: ${aviso.texto}`,
      );
      const gravado = JSON.parse(
        fs.readFileSync(arquivo('config.json'), 'utf8'),
      );
      confere(
        gravado.perfis.lista[0].orientacao === 'retrato',
        'o perfil válido mudou',
      );
    },
  );
}

module.exports = { casosConfigSeguro };
