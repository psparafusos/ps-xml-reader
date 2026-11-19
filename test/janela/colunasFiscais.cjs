// Casos do test:janela para as colunas fiscais da Conferência: a tabela com
// Alíq. ICMS 12,00% e 4,00% na mesma nota, o editor de colunas por grupos
// (busca por "aliq" e siglas, filtro "Só os campos desta nota", campo fora
// do catálogo em "Outros campos do XML"), a coluna ligada que some numa nota
// sem o campo (apagada no editor, com a dica) e volta na seguinte, a
// ordenação por coluna nova e o PDF com 25 itens e muitas colunas. Notas
// inventadas (notasFiscais.cjs), gravadas na pasta temporária do teste. Um
// perfil de teste próprio, excluído no fim. Nenhum caso aciona Copiar.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  notaVariada,
  nota25Itens,
  notaSemAliquota,
} = require('./notasFiscais.cjs');

const ALIQ_ICMS = 'xml:imposto/ICMS/pICMS';
const ALIQ_IPI = 'xml:imposto/IPI/pIPI';
const MVA = 'xml:imposto/ICMS/pMVAST';
const CACHORRO = 'xml:prod/nomeDoCachorro';
const AUSENTE = 'Campo não existe neste documento';
const NOME_PERFIL = 'Colunas fiscais (teste)';

/** Muitas colunas fiscais para o PDF (além das do padrão). */
const MUITAS = [
  'xml:imposto/ICMS/CST+CSOSN',
  'xml:imposto/ICMS/orig',
  'xml:prod/CEST',
  'xml:imposto/ICMS/vBC',
  'xml:imposto/ICMS/pRedBC',
  MVA,
  'xml:imposto/ICMS/vBCST',
  'xml:imposto/ICMS/pICMSST',
  'xml:imposto/ICMS/vICMSST',
  'xml:imposto/ICMS/pFCP',
  'xml:imposto/ICMS/vFCP',
  'xml:imposto/ICMS/vFCPST',
  'xml:prod/vDesc',
  'xml:prod/vFrete',
  'xml:prod/vOutro',
  'xml:prod/uTrib',
  'xml:prod/qTrib',
  'xml:imposto/PIS/pPIS',
  'xml:imposto/PIS/vPIS',
  'xml:imposto/COFINS/pCOFINS',
  'xml:imposto/COFINS/vCOFINS',
  'xml:imposto/IPI/CST',
];

async function casosColunasFiscais(ctx) {
  const {
    caso,
    avaliar,
    aguardar,
    confere,
    espera,
    janela,
    abrirNota,
    irParaConferencia,
    inicio,
    capturar,
    tmp,
    pdfNoDestino,
    paginasDoPdf,
    apagarPdfs,
  } = ctx;

  const pasta = path.join(tmp, 'notas-fiscais');
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = (nome, xml) => {
    const p = path.join(pasta, nome);
    fs.writeFileSync(p, xml);
    return p;
  };
  const variada = arquivo('cf-variada.xml', notaVariada());
  const semAliquota = arquivo('cf-sem-aliquota.xml', notaSemAliquota());
  const vinteCinco = arquivo('cf-25-itens.xml', nota25Itens());

  const painelAberto = `!!document.getElementById('painel-colunas-titulo')?.closest('dialog[open]')`;

  /** Recarrega a janela (a tela lê os perfis de novo). */
  async function recarregar() {
    await avaliar('window.__antesDaRecarga = true; true');
    janela().webContents.reload();
    await aguardar(
      `!window.__antesDaRecarga && document.readyState === 'complete' && !!window.psApi && !document.getElementById('vazio').hidden`,
      30000,
      'a janela não recarregou',
    );
  }

  /** Abre a nota e passa para a Conferência. */
  async function conferencia(caminho) {
    await abrirNota(caminho);
    await irParaConferencia();
  }

  /** Títulos da tabela de itens da tela: [id, texto]. */
  const titulos = () =>
    avaliar(
      `[...document.querySelectorAll('#nota table.tabela--itens thead th')].map((th) => [th.dataset.coluna, th.textContent])`,
    );

  /** Texto da célula da coluna `id` no item `nItem`. */
  const celula = (nItem, id) =>
    avaliar(`(() => {
      const tabela = document.querySelector('#nota table.tabela--itens');
      const i = [...tabela.querySelectorAll('thead th')].findIndex((th) => th.dataset.coluna === ${JSON.stringify(id)});
      const tr = tabela.querySelector('tbody[data-n-item="${nItem}"] tr.item__linha');
      return i < 0 || !tr ? null : tr.children[i].textContent;
    })()`);

  async function abrirEditor() {
    await avaliar(`document.getElementById('btn-editar-colunas').click()`);
    await aguardar(painelAberto, 15000, 'o Editar colunas não abriu');
  }

  /** Busca no editor (como digitado). */
  const buscar = (texto) =>
    avaliar(`(() => {
      const b = document.getElementById('campos-busca');
      b.value = ${JSON.stringify(texto)};
      b.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);

  /** Nomes dos campos à mostra nos grupos abertos. */
  const nomesNaLista = () =>
    avaliar(
      `[...document.querySelectorAll('#campos-grupos .campos__nome > span:first-child')].map((s) => s.textContent)`,
    );

  /** Marca ou desmarca o campo `id` pela busca (a tag) e pelo clique. */
  async function marcarCampo(id, tag, marcado = true) {
    await buscar(tag);
    const r = await avaliar(`(() => {
      const m = document.getElementById(${JSON.stringify(`campo-${id}`)});
      if (!m) return 'sem a marca';
      if (m.checked !== ${marcado}) m.click();
      return m.checked;
    })()`);
    confere(r === marcado, `campo ${id} (${tag}): ${r}`);
    await buscar('');
  }

  async function aplicar() {
    await avaliar(
      `[...document.querySelectorAll('dialog[open] .painel__rodape button')].find((b) => b.textContent.trim() === 'Aplicar').click()`,
    );
    await aguardar(
      `!(${painelAberto})`,
      15000,
      'o Aplicar não fechou o painel',
    );
    await espera(300);
  }

  async function cancelarEditor() {
    await avaliar(`(() => {
      const d = document.getElementById('painel-colunas-titulo').closest('dialog[open]');
      d.dispatchEvent(new Event('cancel', { cancelable: true }));
      return true;
    })()`);
    await aguardar(`!(${painelAberto})`, 5000, 'o painel não fechou');
  }

  /** Grava as capturas desta tela em 1366 e em 1920. */
  async function capturas(nome) {
    const [largura, altura] = janela().getContentSize();
    try {
      for (const [w, h] of [
        [1366, 768],
        [1920, 1040],
      ]) {
        janela().setContentSize(w, h);
        await espera(400);
        await capturar(`${nome}-${w}.png`);
      }
    } finally {
      janela().setContentSize(largura, altura);
      await espera(200);
    }
  }

  let perfilAntes = null;

  await caso(
    'Colunas fiscais: perfil de teste e Alíq. ICMS 12,00% e 4,00% na mesma nota, ao lado do ICMS',
    async () => {
      const estado = await avaliar('window.psApi.perfis()');
      perfilAntes = estado.ativo;
      const r = await avaliar(
        `window.psApi.criarPerfil(${JSON.stringify(NOME_PERFIL)})`,
      );
      confere(r.status === 'ok', `criar perfil: ${JSON.stringify(r)}`);
      // Começa no padrão de hoje (as alíquotas ao lado dos valores).
      const p = await avaliar('window.psApi.restaurarConfig()');
      confere(p.status === 'ok', `padrão: ${JSON.stringify(p)}`);
      await recarregar();
      await conferencia(variada);
      const t = await titulos();
      const ids = t.map(([id]) => id);
      const rotulo = (id) => t.find(([x]) => x === id)?.[1];
      confere(
        ids[ids.indexOf('icms') + 1] === ALIQ_ICMS &&
          ids[ids.indexOf('ipi') + 1] === ALIQ_IPI,
        `ordem das colunas: ${ids.join(', ')}`,
      );
      confere(
        rotulo(ALIQ_ICMS) === 'Alíq. ICMS' && rotulo(ALIQ_IPI) === 'Alíq. IPI',
        `títulos: ${JSON.stringify(t)}`,
      );
      const valores = [
        await celula('1', ALIQ_ICMS),
        await celula('2', ALIQ_ICMS),
        await celula('1', ALIQ_IPI),
        await celula('4', ALIQ_IPI),
      ];
      confere(
        JSON.stringify(valores) ===
          JSON.stringify(['12,00%', '4,00%', '5,00%', '']),
        `células: ${JSON.stringify(valores)}`,
      );
      const selecao = await avaliar(`(() => {
        const t = document.querySelector('#nota table.tabela--itens');
        const td = t.querySelector('td.col-xml-imposto-ICMS-pICMS');
        const th = t.querySelector('th.col-xml-imposto-ICMS-pICMS');
        return [getComputedStyle(td).userSelect, getComputedStyle(th).userSelect];
      })()`);
      confere(
        selecao[0] !== 'none' && selecao[1] === 'none',
        `seleção (dado, título): ${selecao}`,
      );
      await capturas('colunas-fiscais-tabela');
      await inicio();
    },
  );

  await caso(
    'Colunas fiscais: editor por grupos, busca por "aliq" e siglas, filtro "Só os campos desta nota"',
    async () => {
      await conferencia(variada);
      await abrirEditor();
      const grupos = await avaliar(
        `[...document.querySelectorAll('#campos-grupos .campos__grupo-titulo')].map((b) => [b.querySelector('.campos__grupo-nome').textContent, b.getAttribute('aria-expanded')])`,
      );
      const nomes = grupos.map(([g]) => g);
      for (const g of [
        'Produto',
        'ICMS',
        'FCP',
        'ICMS ST',
        'IPI',
        'II',
        'PIS e COFINS',
        'IBS, CBS e IS',
        'Anotações',
        'Outros campos do XML',
      ])
        confere(nomes.includes(g), `sem o grupo ${g}: ${nomes.join(', ')}`);
      confere(
        grupos.every(([, a]) => a === 'false'),
        `grupos abertos no começo: ${JSON.stringify(grupos)}`,
      );
      // Abrir e fechar o ICMS.
      const titulo = `[...document.querySelectorAll('#campos-grupos .campos__grupo-titulo')].find((b) => b.dataset.grupo === 'icms')`;
      await avaliar(`${titulo}.click()`);
      confere(
        (await avaliar(`${titulo}.getAttribute('aria-expanded')`)) === 'true' &&
          (await avaliar(
            `document.getElementById('campo-${ALIQ_ICMS}')?.checked === true`,
          )),
        'o grupo ICMS não abriu com a Alíquota do ICMS marcada',
      );
      await avaliar(`${titulo}.click()`);
      // Busca "aliq": só alíquotas, com os grupos abertos.
      await buscar('aliq');
      const aliq = await nomesNaLista();
      for (const n of [
        'Alíquota do ICMS',
        'Alíquota do IPI',
        'Alíquota do ICMS ST',
      ])
        confere(aliq.includes(n), `"aliq" sem ${n}: ${aliq.join(' | ')}`);
      confere(!aliq.includes('Frete'), '"aliq" achou Frete');
      confere(
        await avaliar(
          `[...document.querySelectorAll('#campos-grupos .campos__grupo-titulo')].every((b) => b.getAttribute('aria-expanded') === 'true')`,
        ),
        'com busca, os grupos não ficaram abertos',
      );
      await capturas('colunas-fiscais-editor-busca');
      for (const [termo, esperado] of [
        ['alíquota', 'Alíquota do ICMS'],
        ['mva', '% MVA do ICMS ST'],
        ['st', 'Valor do ICMS ST'],
        ['bc', 'Base de cálculo do ICMS'],
        ['cst', 'CST do ICMS'],
        ['pICMS', 'Alíquota do ICMS'],
      ]) {
        await buscar(termo);
        const achados = await nomesNaLista();
        confere(
          achados.includes(esperado),
          `"${termo}" sem ${esperado}: ${achados.slice(0, 15).join(' | ')}`,
        );
      }
      await buscar('');
      // Sem o filtro: campo que a nota não tem aparece apagado.
      await avaliar(`${titulo}.click()`);
      confere(
        await avaliar(
          `!!document.getElementById('campo-xml:imposto/ICMS/vICMSMono')?.closest('.campos__campo--ausente') && !document.getElementById('campo-${ALIQ_ICMS}').closest('.campos__campo--ausente')`,
        ),
        'o campo que a nota não tem não está apagado',
      );
      // Com o filtro: só os campos desta nota.
      await avaliar(`document.getElementById('campos-so-da-nota').click()`);
      const filtrados = await avaliar(
        `[...document.querySelectorAll('#campos-grupos .campos__grupo-nome')].map((s) => s.textContent)`,
      );
      confere(
        !filtrados.includes('II') &&
          !filtrados.includes('ISSQN') &&
          filtrados.includes('Outros campos do XML'),
        `grupos com o filtro: ${filtrados.join(', ')}`,
      );
      const icms = await nomesNaLista();
      confere(
        icms.includes('Alíquota do ICMS') &&
          !icms.some((n) => n.startsWith('ICMS monofásico')),
        `ICMS com o filtro: ${icms.join(' | ')}`,
      );
      await capturas('colunas-fiscais-editor-filtro');
      await avaliar(`document.getElementById('campos-so-da-nota').click()`);
      const sel = await avaliar(`(() => {
        const r = document.querySelector('#campos-grupos .campos__nome');
        return [getComputedStyle(r).userSelect, getComputedStyle(document.getElementById('campos-busca')).userSelect];
      })()`);
      confere(
        sel[0] === 'none' && sel[1] !== 'none',
        `seleção (rótulo, busca): ${sel}`,
      );
      // Campo fora do catálogo e % MVA: Aplicar.
      const outros = `[...document.querySelectorAll('#campos-grupos .campos__grupo-titulo')].find((b) => b.dataset.grupo === 'outros')`;
      await avaliar(`${outros}.click()`);
      const cachorro = await avaliar(
        `document.getElementById('campo-${CACHORRO}')?.closest('li')?.textContent`,
      );
      confere(cachorro === 'nomeDoCachorro (prod)', `Outros: ${cachorro}`);
      await avaliar(`document.getElementById('campo-${CACHORRO}').click()`);
      await marcarCampo(MVA, 'pMVAST');
      await aplicar();
      const t = await titulos();
      confere(
        t.some(([id, x]) => id === CACHORRO && x === 'nomeDoCachorro (prod)') &&
          t.some(([id, x]) => id === MVA && x === '% MVA'),
        `títulos depois do Aplicar: ${JSON.stringify(t)}`,
      );
      confere((await celula('9', CACHORRO)) === 'Rex', 'sem o Rex no item 9');
      confere((await celula('3', MVA)) === '40,00%', 'sem a MVA no item 3');
      const perfil = (await avaliar('window.psApi.perfis()')).config.colunas;
      confere(
        perfil.some((c) => c.id === MVA && c.visivel) &&
          !perfil.some((c) => c.id === CACHORRO),
        `perfil gravado: ${JSON.stringify(perfil.slice(-4))}`,
      );
      // Ordenar pela coluna nova (como número) e pela de fora do catálogo.
      const ordenar = (id) =>
        avaliar(
          `document.querySelector('#nota th[data-coluna=${JSON.stringify(id)}]').click()`,
        );
      const primeiro = () =>
        avaliar(
          `document.querySelector('#nota table.tabela--itens tbody').dataset.nItem`,
        );
      await ordenar(ALIQ_ICMS);
      confere((await primeiro()) === '2', 'Alíq. ICMS crescente: 4% primeiro');
      confere(
        (await avaliar(
          `document.querySelector('#nota th[data-coluna="${ALIQ_ICMS}"]').getAttribute('aria-sort')`,
        )) === 'ascending',
        'sem aria-sort crescente',
      );
      await ordenar(ALIQ_ICMS);
      confere(
        (await celula(await primeiro(), ALIQ_ICMS)) === '12,00%',
        'Alíq. ICMS decrescente: 12% primeiro',
      );
      await ordenar(CACHORRO);
      confere((await primeiro()) === '9', 'nomeDoCachorro crescente: item 9');
      await capturas('colunas-fiscais-ordenada');
      await inicio();
    },
  );

  await caso(
    'Colunas fiscais: coluna ligada some na nota sem o campo, fica apagada no editor e volta na nota seguinte',
    async () => {
      await conferencia(semAliquota);
      const ids = (await titulos()).map(([id]) => id);
      for (const id of [MVA, ALIQ_ICMS, ALIQ_IPI, CACHORRO, 'ipi'])
        confere(!ids.includes(id), `${id} na nota sem o campo: ${ids}`);
      confere(
        ids.includes('descricao') && ids.includes('icms') === false,
        `colunas da nota do Simples: ${ids}`,
      );
      await abrirEditor();
      const linha = `document.querySelector('#colunas-ordem li[data-id="${MVA}"]')`;
      const antes = await avaliar(`(() => {
        const li = ${linha};
        const m = li.querySelector('.colunas-lista__marca');
        return {
          ausente: li.classList.contains('colunas-lista__item--ausente'),
          marcada: m.checked,
          aria: m.getAttribute('aria-label'),
          cor: getComputedStyle(li.querySelector('.colunas-lista__nome')).color,
          corNormal: getComputedStyle(document.querySelector('#colunas-ordem li[data-id="descricao"] .colunas-lista__nome')).color,
          posicao: [...document.querySelectorAll('#colunas-ordem li')].indexOf(li),
        };
      })()`);
      confere(
        antes.ausente &&
          antes.marcada &&
          antes.aria === `% MVA. ${AUSENTE}` &&
          antes.cor !== antes.corNormal,
        `coluna apagada: ${JSON.stringify(antes)}`,
      );
      // A dica ao passar o mouse.
      await avaliar(
        `${linha}.scrollIntoView({ block: 'center' }); ${linha}.dispatchEvent(new MouseEvent('mouseenter')); true`,
      );
      await aguardar(
        `(() => { const d = document.getElementById('dica-app'); return !!d && d.matches(':popover-open') && d.textContent === ${JSON.stringify(AUSENTE)}; })()`,
        3000,
        'a dica da coluna apagada não abriu',
      );
      await capturas('colunas-fiscais-editor-ausente');
      await avaliar(
        `${linha}.dispatchEvent(new MouseEvent('mouseleave')); true`,
      );
      // Reordenar, desmarcar e marcar de novo, como as outras.
      await avaliar(
        `${linha}.querySelector('.colunas-lista__alca').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); true`,
      );
      const subiu = await avaliar(
        `[...document.querySelectorAll('#colunas-ordem li')].indexOf(${linha})`,
      );
      confere(subiu === antes.posicao - 1, `não subiu: ${subiu}`);
      await avaliar(
        `${linha}.querySelector('.colunas-lista__alca').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); true`,
      );
      for (const esperado of [false, true]) {
        await avaliar(
          `${linha}.querySelector('.colunas-lista__marca').click()`,
        );
        confere(
          (await avaliar(
            `${linha}.querySelector('.colunas-lista__marca').checked`,
          )) === esperado,
          `marcar/desmarcar: ${!esperado}`,
        );
      }
      // O campo fora do catálogo da nota anterior não ficou no perfil.
      confere(
        !(await avaliar(
          `!!document.querySelector('#colunas-ordem li[data-id="${CACHORRO}"]')`,
        )),
        'o campo fora do catálogo da outra nota ficou na lista',
      );
      await cancelarEditor();
      await inicio();
      // Terceira nota, com o campo: a coluna volta na posição escolhida.
      await conferencia(vinteCinco);
      const ids3 = (await titulos()).map(([id]) => id);
      const perfil = (await avaliar('window.psApi.perfis()')).config.colunas
        .filter((c) => c.visivel && ids3.includes(c.id))
        .map((c) => c.id);
      confere(ids3.includes(MVA), `% MVA não voltou: ${ids3}`);
      confere(
        JSON.stringify(ids3) === JSON.stringify(perfil),
        `posição: tela ${ids3} / perfil ${perfil}`,
      );
      // Só alguns itens têm MVA: os outros ficam vazios.
      confere(
        (await celula('5', MVA)) === '40,00%' &&
          (await celula('1', MVA)) === '',
        'MVA só no item que tem',
      );
      await inicio();
    },
  );

  await caso(
    'Colunas fiscais: PDF com 25 itens e muitas colunas fiscais, sem cortar coluna',
    async () => {
      apagarPdfs();
      await conferencia(vinteCinco);
      await abrirEditor();
      for (const id of MUITAS)
        await marcarCampo(
          id,
          id.slice(id.lastIndexOf('/') + 1).replace('CST+CSOSN', 'CSOSN'),
        );
      await aplicar();
      const visiveis = (await titulos()).map(([id]) => id);
      confere(visiveis.length >= 30, `poucas colunas: ${visiveis.length}`);
      await capturas('colunas-fiscais-muitas');
      // O PDF: o teste olha as partes montadas para a folha na hora do
      // printToPDF e responde Continuar se o app avisar que vai dividir.
      const proto = Object.getPrototypeOf(janela().webContents);
      const original = proto.printToPDF;
      let partes = null;
      proto.printToPDF = async function (opcoes) {
        partes = await this.executeJavaScript(`({
          partes: [...document.querySelectorAll('.tabela-impressao__parte')].map((p) => [...p.querySelectorAll('thead th')].map((th) => th.dataset.coluna)),
          pagina: document.getElementById('estilo-pagina-conferencia')?.textContent ?? '',
          fonte: document.querySelector('.tabela-impressao')?.style.getPropertyValue('--fs-tabela-folha'),
        })`);
        return original.call(this, opcoes);
      };
      try {
        await avaliar(`document.getElementById('btn-salvar-mais').click()`);
        await aguardar(`!document.getElementById('menu-salvar').hidden`);
        await avaliar(`document.getElementById('btn-salvar-pdf').click()`);
        const limite = Date.now() + 15000;
        while (!partes && Date.now() < limite) {
          await avaliar(`(() => {
            const b = [...document.querySelectorAll('dialog[open] button')].find((x) => x.textContent.trim() === 'Continuar');
            if (b) b.click();
            return true;
          })()`);
          await espera(150);
        }
        const pdf = paginasDoPdf(await pdfNoDestino('_Conferencia.pdf'));
        confere(partes, 'o PDF não montou a tabela da folha');
        const todas = new Set(partes.partes.flat());
        const faltam = visiveis.filter((id) => !todas.has(id));
        confere(faltam.length === 0, `colunas fora do PDF: ${faltam}`);
        if (partes.partes.length > 1)
          for (const p of partes.partes)
            confere(
              ['nItem', 'codigo', 'descricao'].every((id) => p.includes(id)),
              `parte sem Nº, Código e Descrição: ${p}`,
            );
        confere(
          pdf.largura > pdf.altura && partes.pagina.includes('landscape'),
          `orientação: ${JSON.stringify(pdf)} ${partes.pagina}`,
        );
        confere(
          pdf.paginas >= partes.partes.length,
          `páginas: ${pdf.paginas} para ${partes.partes.length} partes`,
        );
        console.log(
          `     PDF: ${pdf.paginas} página(s), ${partes.partes.length} parte(s), fonte ${partes.fonte}, ${visiveis.length} colunas`,
        );
      } finally {
        proto.printToPDF = original;
        apagarPdfs();
      }
      await inicio();
    },
  );

  await caso(
    'Colunas fiscais: volta ao perfil de antes e exclui o de teste',
    async () => {
      const estado = await avaliar('window.psApi.perfis()');
      const teste = estado.lista.find((p) => p.nome === NOME_PERFIL);
      if (perfilAntes && estado.ativo !== perfilAntes)
        await avaliar(
          `window.psApi.ativarPerfil(${JSON.stringify(perfilAntes)})`,
        );
      if (teste)
        await avaliar(
          `window.psApi.excluirPerfil(${JSON.stringify(teste.id)})`,
        );
      await recarregar();
      const depois = await avaliar('window.psApi.perfis()');
      confere(
        !depois.lista.some((p) => p.nome === NOME_PERFIL) &&
          (!perfilAntes || depois.ativo === perfilAntes),
        `perfis: ${JSON.stringify(depois.lista.map((p) => p.nome))}`,
      );
    },
  );
}

module.exports = { casosColunasFiscais };
