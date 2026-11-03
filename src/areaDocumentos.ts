// Área "Documentos de referência": o que o app usa para a análise fiscal e
// que a pessoa carrega (o app vem sem nenhum). Um cartão por documento, com
// a situação, a versão e a vigência, a data da importação, as quantidades
// lidas e o relatório da leitura; embaixo, as decisões lembradas da
// ferramenta "ST, MVA e CFOP" (com Apagar) e a verificação online (desligada
// por padrão). Abre pelo rodapé do painel de conferência e pela tela
// inicial. Tudo passa pelo processo principal (src/documentos.ts).

import { botao, el, icone } from './dom';
import {
  chaveDecisao,
  ROTULO_FINALIDADE,
  type DecisaoLembrada,
} from './fiscal/entrada';
import {
  NOME_DOCUMENTO,
  situacaoDocumento,
  type SituacaoDocumento,
} from './fiscal/documentos';

let dialogo: HTMLDialogElement | null = null;
let redesenhar: ((e: EstadoDocumentos) => void) | null = null;

export function areaDocumentosAberta(): boolean {
  return dialogo?.open === true;
}

/** Documentos mudaram (outra janela, verificação ao abrir): a área aberta se atualiza. */
export function atualizarAreaDocumentos(estado: EstadoDocumentos): void {
  redesenhar?.(estado);
}

const ROTULO_SITUACAO: Record<SituacaoDocumento, string> = {
  carregado: 'Carregado',
  faltando: 'Faltando',
  'com-pontos': 'Carregado com pontos não entendidos',
};

const PARA_QUE: Record<TipoDocumento, string> = {
  st: 'Arquivo .xlsx do Portal Nacional da Substituição Tributária (CONFAZ), página de Sergipe. Necessária para a ferramenta "ST, MVA e CFOP": diz se o produto tem ST em Sergipe e qual MVA usar.',
  tipi: 'Tabela do IPI da Receita Federal: o tipi.xlsx oficial ou o texto .txt extraído do PDF. Usada para conferir se o NCM existe e a alíquota de IPI da nota.',
};

const ROTULO_VERIFICACAO: Record<ResultadoVerificacao['estado'], string> = {
  atualizado: 'Atualizado',
  nova: 'Versão nova disponível',
  'sem-conexao': 'Sem conexão',
  'nao-verificou': 'Não consegui verificar',
};

const dataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const tamanho = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pt-BR')} KB`;

export function abrirAreaDocumentos(): void {
  if (areaDocumentosAberta()) {
    dialogo?.focus();
    return;
  }
  let estado: EstadoDocumentos | null = null;
  /** Erro da última importação, por documento (formato não reconhecido). */
  const erros = new Map<TipoDocumento, string>();
  /** Relatórios abertos. */
  const relatorios = new Set<TipoDocumento>();
  let ocupado = false;

  const titulo = el('h2', 'painel__titulo', 'Documentos de referência');
  titulo.id = 'documentos-titulo';
  const corpo = el('div', 'documentos__corpo');
  const status = el('p', 'painel__status');
  status.setAttribute('role', 'status');
  const btnFechar = botao('botao botao--claro', el('span', '', 'Fechar'));
  const d = el(
    'dialog',
    'painel painel--documentos',
    el(
      'header',
      'painel__cabecalho',
      titulo,
      el(
        'p',
        'painel__dica',
        'Os arquivos oficiais que o PS Reader usa na análise fiscal. Ficam guardados, já lidos, na pasta de dados do app.',
      ),
    ),
    corpo,
    el('footer', 'painel__rodape', status, btnFechar),
  );
  d.setAttribute('aria-labelledby', titulo.id);
  dialogo = d;

  const fechar = () => {
    if (d.open) d.close();
    d.remove();
    dialogo = null;
    redesenhar = null;
  };
  btnFechar.addEventListener('click', fechar);
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    fechar();
  });

  /** Uma ação por vez; o foco volta ao botão de mesmo papel depois de redesenhar. */
  async function acao(
    foco: string | null,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (ocupado) return;
    ocupado = true;
    corpo.setAttribute('aria-busy', 'true');
    for (const b of corpo.querySelectorAll('button, input')) {
      (b as HTMLButtonElement).disabled = true;
    }
    try {
      await fn();
    } finally {
      ocupado = false;
      corpo.removeAttribute('aria-busy');
      if (estado) desenhar(estado);
      if (foco)
        corpo.querySelector<HTMLElement>(`[data-foco="${foco}"]`)?.focus();
    }
  }

  function aoImportar(tipo: TipoDocumento, r: ResultadoImportarDocumento) {
    if (r.status === 'cancelado') return;
    estado = r.estado;
    if (r.status === 'ok') {
      erros.delete(tipo);
      const s = situacaoDocumento(r.info);
      status.textContent =
        s === 'com-pontos'
          ? `${NOME_DOCUMENTO[tipo]} carregada, com ${r.info.totalNaoEntendidos} ${r.info.totalNaoEntendidos === 1 ? 'ponto não entendido' : 'pontos não entendidos'}.`
          : `${NOME_DOCUMENTO[tipo]} carregada.`;
      if (s === 'com-pontos') relatorios.add(tipo);
    } else {
      erros.set(tipo, r.mensagem);
      status.textContent = '';
    }
  }

  // ---------- cartões ----------

  function linhaInfo(rotulo: string, valor: string): HTMLElement {
    return el(
      'div',
      'documento__info',
      el('dt', '', rotulo),
      el('dd', '', valor),
    );
  }

  function relatorio(info: InfoDocumento): HTMLElement {
    const pontos =
      info.totalNaoEntendidos === 0
        ? el('p', 'documento__vazio', 'Nenhum ponto não entendido.')
        : el(
            'div',
            'documento__tabela',
            el(
              'table',
              'tabela-simples',
              el(
                'thead',
                '',
                el(
                  'tr',
                  '',
                  el('th', '', 'Aba'),
                  el('th', '', 'Célula'),
                  el('th', '', 'Motivo'),
                  el('th', '', 'Conteúdo'),
                ),
              ),
              el(
                'tbody',
                '',
                ...info.naoEntendidos.map((p) =>
                  el(
                    'tr',
                    '',
                    el('td', '', p.aba || '-'),
                    el('td', '', p.celula || '-'),
                    el('td', '', p.motivo),
                    el('td', 'documento__valor', p.valor || '-'),
                  ),
                ),
              ),
            ),
          );
    const total = info.totalNaoEntendidos;
    return el(
      'section',
      'documento__relatorio',
      el(
        'h4',
        'documento__subtitulo',
        total === 0
          ? 'Relatório da leitura'
          : `Relatório da leitura: ${total} ${total === 1 ? 'ponto não entendido' : 'pontos não entendidos'}`,
      ),
      total > 0 &&
        el(
          'p',
          'documento__nota',
          'O que foi entendido está carregado; os pontos abaixo ficaram de fora.',
        ),
      pontos,
      total > info.naoEntendidos.length &&
        el(
          'p',
          'documento__nota',
          `Mostrando ${info.naoEntendidos.length} de ${total}.`,
        ),
      info.observacoes.length > 0 &&
        el(
          'div',
          '',
          el('h5', 'documento__subtitulo', 'Observações'),
          el(
            'ul',
            'documento__observacoes',
            ...info.observacoes.map((o) => el('li', '', o)),
          ),
        ),
    );
  }

  function verificacao(
    tipo: TipoDocumento,
    r: ResultadoVerificacao,
  ): HTMLElement {
    const acoes: HTMLElement[] = [];
    if (r.estado === 'nova' && r.disponivel) {
      const b = botao(
        'botao botao--principal botao--pequeno',
        icone('M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'),
        el('span', '', 'Baixar e importar'),
      );
      b.dataset.foco = `baixar-${tipo}`;
      b.addEventListener(
        'click',
        () =>
          void acao(`atualizar-${tipo}`, async () => {
            status.textContent = 'Baixando...';
            aoImportar(tipo, await window.psApi.baixarDocumento(tipo));
          }),
      );
      acoes.push(b);
    }
    if (r.estado === 'nao-verificou' || r.estado === 'sem-conexao') {
      const b = botao(
        'botao botao--claro botao--pequeno',
        icone('M14 4h6v6', 'M20 4l-9 9', 'M18 14v6H4V6h6'),
        el('span', '', 'Abrir no navegador'),
      );
      b.title = r.pagina;
      b.addEventListener(
        'click',
        () => void window.psApi.abrirPaginaDocumento(tipo),
      );
      acoes.push(b);
    }
    return el(
      'div',
      `documento__verificacao documento__verificacao--${r.estado}`,
      el(
        'p',
        '',
        // O detalhe quase sempre já começa pelo rótulo ("Atualizado: ...").
        ...(r.detalhe.startsWith(ROTULO_VERIFICACAO[r.estado])
          ? [el('strong', '', r.detalhe)]
          : [el('strong', '', `${ROTULO_VERIFICACAO[r.estado]}. `), r.detalhe]),
        el(
          'span',
          'documento__quando',
          ` Verificado em ${dataHora(r.verificadoEm)}.`,
        ),
      ),
      acoes.length > 0 && el('div', 'documento__acoes', ...acoes),
    );
  }

  function cartao(tipo: TipoDocumento, e: EstadoDocumentos): HTMLElement {
    const info = e[tipo];
    const s = situacaoDocumento(info);
    const tituloId = `documento-${tipo}`;
    const btnAtualizar = botao(
      info
        ? 'botao botao--claro botao--pequeno'
        : 'botao botao--principal botao--pequeno',
      icone('M12 15V4', 'M7 9l5-5 5 5', 'M5 20h14'),
      el('span', '', info ? 'Atualizar' : 'Carregar'),
    );
    btnAtualizar.dataset.foco = `atualizar-${tipo}`;
    btnAtualizar.title = info
      ? `Carregar outro arquivo no lugar deste (o atual só é trocado se o novo for reconhecido)`
      : `Escolher o arquivo da ${NOME_DOCUMENTO[tipo]}`;
    btnAtualizar.addEventListener(
      'click',
      () =>
        void acao(`atualizar-${tipo}`, async () => {
          status.textContent = '';
          aoImportar(tipo, await window.psApi.importarDocumento(tipo));
        }),
    );
    const aberto = relatorios.has(tipo);
    const btnRelatorio =
      info &&
      botao(
        'botao botao--claro botao--pequeno',
        el(
          'span',
          '',
          aberto ? 'Esconder relatório' : 'Ver relatório da leitura',
        ),
      );
    if (btnRelatorio) {
      btnRelatorio.dataset.foco = `relatorio-${tipo}`;
      btnRelatorio.setAttribute('aria-expanded', String(aberto));
      btnRelatorio.addEventListener('click', () => {
        if (aberto) relatorios.delete(tipo);
        else relatorios.add(tipo);
        desenhar(e);
        corpo
          .querySelector<HTMLElement>(`[data-foco="relatorio-${tipo}"]`)
          ?.focus();
      });
    }
    const erro = erros.get(tipo);
    const r = e.preferencias.verificacaoOnline ? e.verificacao[tipo] : null;
    const versao = info
      ? tipo === 'st'
        ? info.versao
          ? `Versão ${info.versao}`
          : 'Versão não informada'
        : info.versao
          ? `TIPI ${info.versao}`
          : 'Ano não informado'
      : '';
    const vigencia =
      info && info.vigencia
        ? tipo === 'st'
          ? `a partir de ${info.vigencia}`
          : `atualizada até ${info.vigencia}`
        : '';
    const h = el('h3', 'documento__titulo', NOME_DOCUMENTO[tipo]);
    h.id = tituloId;
    const artigo = el(
      'article',
      `documento documento--${s}`,
      el(
        'header',
        'documento__cabecalho',
        h,
        el(
          'span',
          `documento__situacao documento__situacao--${s}`,
          ROTULO_SITUACAO[s],
        ),
      ),
      el('p', 'documento__para-que', PARA_QUE[tipo]),
      info &&
        el(
          'dl',
          'documento__dados',
          linhaInfo('Versão', versao),
          vigencia &&
            linhaInfo(tipo === 'st' ? 'Vigência' : 'Atualização', vigencia),
          linhaInfo(
            'Importado',
            `${dataHora(info.importadoEm)}, de ${info.arquivo} (${tamanho(info.tamanhoArquivo)})`,
          ),
          info.servidor &&
            linhaInfo(
              'Baixado',
              [
                `${dataHora(info.servidor.baixadoEm)} do site oficial`,
                info.servidor.tamanho !== null &&
                  `${tamanho(info.servidor.tamanho)} no servidor`,
                info.servidor.data &&
                  `arquivo de ${new Date(info.servidor.data).toLocaleDateString('pt-BR')}`,
              ]
                .filter(Boolean)
                .join(', '),
            ),
          linhaInfo(
            'Lido',
            info.quantidades
              .map((q) => `${q.valor.toLocaleString('pt-BR')} ${q.rotulo}`)
              .join(' · '),
          ),
        ),
      erro && el('p', 'documento__erro', erro),
      r && verificacao(tipo, r),
      el('div', 'documento__acoes', btnAtualizar, btnRelatorio),
      info && aberto && relatorio(info),
    );
    artigo.setAttribute('aria-labelledby', tituloId);
    return artigo;
  }

  function cartaoDerivados(): HTMLElement {
    return el(
      'article',
      'documento documento--opcional',
      el(
        'header',
        'documento__cabecalho',
        el('h3', 'documento__titulo', 'Planilha de derivados de petróleo'),
        el(
          'span',
          'documento__situacao documento__situacao--opcional',
          'Opcional',
        ),
      ),
      el(
        'p',
        'documento__para-que',
        'Opcional, ainda não usada pelo app. Por enquanto não há importação.',
      ),
    );
  }

  // ---------- decisões lembradas (ferramenta ST, MVA e CFOP) ----------

  function decisoes(e: EstadoDocumentos): HTMLElement {
    const textoDecisao = (d: DecisaoLembrada) =>
      [
        d.escolha === null
          ? null
          : d.escolha.tipo === 'sem-st'
            ? 'Sem ST'
            : `${d.escolha.segmento}, CEST ${d.escolha.cest}`,
        ROTULO_FINALIDADE[d.finalidade],
      ]
        .filter(Boolean)
        .join(' · ');
    return el(
      'section',
      'documentos__online',
      el('h3', 'painel__subtitulo', 'Decisões lembradas'),
      el(
        'p',
        'documento__nota',
        'Escolhas feitas na ferramenta "ST, MVA e CFOP", por fornecedor (raiz do CNPJ) e código do produto. Na próxima nota o item já vem resolvido.',
      ),
      e.decisoes.length === 0
        ? el('p', 'documento__vazio', 'Nenhuma decisão lembrada.')
        : el(
            'div',
            'documento__tabela',
            el(
              'table',
              '',
              el(
                'thead',
                '',
                el(
                  'tr',
                  '',
                  el('th', '', 'Fornecedor'),
                  el('th', '', 'Produto'),
                  el('th', '', 'NCM'),
                  el('th', '', 'Decisão'),
                  el('th', '', ''),
                ),
              ),
              el(
                'tbody',
                '',
                ...e.decisoes.map((d) => {
                  const chave = chaveDecisao(d.raizCnpj, d.cProd);
                  const apagar = botao(
                    'botao botao--claro botao--pequeno',
                    el('span', '', 'Apagar'),
                  );
                  apagar.dataset.foco = `apagar-${chave}`;
                  apagar.title = `Esquecer a decisão de ${d.cProd}`;
                  apagar.addEventListener(
                    'click',
                    () =>
                      void acao(null, async () => {
                        await window.psApi.esquecerDecisao(chave);
                        estado = await window.psApi.documentos();
                        status.textContent = `Decisão de ${d.cProd} apagada.`;
                      }),
                  );
                  return el(
                    'tr',
                    '',
                    el(
                      'td',
                      '',
                      d.fornecedor,
                      el('span', 'documento__quando', ` (${d.raizCnpj})`),
                    ),
                    el('td', 'documento__valor', `${d.cProd}: ${d.xProd}`),
                    el('td', '', d.ncm),
                    el('td', '', textoDecisao(d)),
                    el('td', '', apagar),
                  );
                }),
              ),
            ),
          ),
    );
  }

  // ---------- verificação online ----------

  function online(e: EstadoDocumentos): HTMLElement {
    const p = e.preferencias;
    const chave = el('input', 'documentos__chave');
    chave.type = 'checkbox';
    chave.setAttribute('role', 'switch');
    chave.checked = p.verificacaoOnline;
    chave.id = 'documentos-online';
    chave.dataset.foco = 'online';
    chave.addEventListener(
      'change',
      () =>
        void acao('online', async () => {
          estado = await window.psApi.gravarPreferenciasDocumentos({
            verificacaoOnline: chave.checked,
          });
          status.textContent = chave.checked
            ? 'Verificação online ligada.'
            : 'Verificação online desligada: o app não acessa a internet.';
        }),
    );
    const linhaChave = el(
      'label',
      'documentos__opcao',
      chave,
      el('span', 'documentos__opcao-texto', 'Verificação online de documentos'),
    );
    linhaChave.htmlFor = chave.id;

    const filhos: (HTMLElement | false)[] = [
      el('h3', 'painel__subtitulo', 'Verificação online'),
      linhaChave,
      el(
        'p',
        'documento__nota',
        p.verificacaoOnline
          ? 'Ligada: o app consulta a página do CONFAZ (planilha de ST) e o site da Receita (TIPI) só quando você pede, ou ao abrir o app se marcar a opção abaixo.'
          : 'Desligada: o app nunca acessa a internet.',
      ),
    ];
    if (p.verificacaoOnline) {
      const aoAbrir = el('input', '');
      aoAbrir.type = 'checkbox';
      aoAbrir.id = 'documentos-ao-abrir';
      aoAbrir.checked = p.verificarAoAbrir;
      aoAbrir.dataset.foco = 'ao-abrir';
      aoAbrir.addEventListener(
        'change',
        () =>
          void acao('ao-abrir', async () => {
            estado = await window.psApi.gravarPreferenciasDocumentos({
              verificarAoAbrir: aoAbrir.checked,
            });
          }),
      );
      const linhaAoAbrir = el(
        'label',
        'documentos__opcao',
        aoAbrir,
        el('span', '', 'Verificar ao abrir o app'),
      );
      linhaAoAbrir.htmlFor = aoAbrir.id;
      const verificar = botao(
        'botao botao--claro botao--pequeno',
        icone('M4 12a8 8 0 1 0 3-6.2', 'M4 4v5h5'),
        el('span', '', e.verificando ? 'Verificando...' : 'Verificar agora'),
      );
      verificar.dataset.foco = 'verificar';
      verificar.disabled = e.verificando;
      verificar.addEventListener(
        'click',
        () =>
          void acao('verificar', async () => {
            status.textContent = 'Verificando...';
            estado = await window.psApi.verificarDocumentos();
            status.textContent = 'Verificação concluída.';
          }),
      );
      filhos.push(linhaAoAbrir, el('div', 'documento__acoes', verificar));
    }
    return el('section', 'documentos__online', ...filhos);
  }

  function desenhar(e: EstadoDocumentos): void {
    estado = e;
    const nenhum = !e.st && !e.tipi;
    corpo.replaceChildren(
      el(
        'div',
        'documentos__conteudo',
        nenhum &&
          el(
            'div',
            'documentos__primeira',
            el(
              'p',
              '',
              el(
                'strong',
                '',
                'O PS Reader vem sem documentos: você carrega os arquivos oficiais.',
              ),
            ),
            el(
              'ul',
              '',
              el(
                'li',
                '',
                el('strong', '', 'Planilha de ST de Sergipe'),
                ': baixe o .xlsx mais recente na página de Sergipe do Portal Nacional da Substituição Tributária (CONFAZ). Sem ela, a ferramenta "ST, MVA e CFOP" não roda.',
              ),
              el(
                'li',
                '',
                el('strong', '', 'TIPI'),
                ': o tipi.xlsx da página da TIPI no site da Receita Federal (ou o texto extraído do PDF). Sem ela, a análise roda sem conferir NCM e IPI.',
              ),
            ),
            el(
              'p',
              '',
              'Use "Carregar" em cada cartão. O arquivo é conferido antes: se não for reconhecido, nada é trocado.',
            ),
          ),
        el(
          'div',
          'documentos__cartoes',
          cartao('st', e),
          cartao('tipi', e),
          cartaoDerivados(),
        ),
        decisoes(e),
        online(e),
      ),
    );
    if (ocupado)
      for (const b of corpo.querySelectorAll('button, input'))
        (b as HTMLButtonElement).disabled = true;
  }
  redesenhar = (e) => {
    if (!ocupado) desenhar(e);
  };

  document.body.append(d);
  d.showModal();
  corpo.replaceChildren(el('p', 'documento__nota', 'Carregando...'));
  void window.psApi.documentos().then((e) => {
    desenhar(e);
    corpo.querySelector<HTMLElement>('[data-foco^="atualizar-"]')?.focus();
  });
}
