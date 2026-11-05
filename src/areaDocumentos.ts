// Área "Documentos de referência": o que o app usa para a análise fiscal e
// que a pessoa carrega (o app vem sem nenhum). Um cartão por documento, com
// o semáforo, o arquivo em uso (e o X para remover), a versão e a vigência,
// a data da importação, as quantidades lidas e o relatório da leitura
// (problemas de leitura separados do ignorado de propósito). Arquivo errado
// é recusado com o que ele parece e o que fazer; planilha com segmentos não
// lidos só entra com a confirmação da pessoa; embaixo, as decisões lembradas da
// ferramenta "ST, MVA e CFOP" (com Apagar) e a verificação online (desligada
// por padrão). Abre pelo rodapé do painel de conferência e pela tela
// inicial. Tudo passa pelo processo principal (src/documentos.ts).

import { botao, el, icone, marcaEstado } from './dom';
import {
  chaveDecisao,
  ROTULO_FINALIDADE,
  ROTULO_LUBRIFICANTE,
  textoMva,
  type DecisaoLembrada,
} from './fiscal/entrada';
import { perguntar } from './dialogos';
import { NOME_DOCUMENTO } from './fiscal/documentos';
import { problemasPorAba, rotuloDocumento } from './leituraDocumentos';
import { seloVisivel, textoVersaoNova } from './estadoDocumentos';
import { ICONES } from './icones';

let dialogo: HTMLDialogElement | null = null;
let redesenhar: ((e: EstadoDocumentos) => void) | null = null;
let irParaCartao: ((tipo: TipoDocumento) => void) | null = null;
let mostrarProgresso: ((p: ProgressoDocumento) => void) | null = null;
let aoFecharErro: ((tipo: TipoDocumento) => void) | null = null;

/** Aviso de erro fechado num cartão: quem mais mostra o aviso (a tela inicial) tira o seu. */
export function aoFecharErroDocumento(fn: (tipo: TipoDocumento) => void): void {
  aoFecharErro = fn;
}

export function areaDocumentosAberta(): boolean {
  return dialogo?.open === true;
}

/** Documentos mudaram (outra janela, verificação ao abrir): a área aberta se atualiza. */
export function atualizarAreaDocumentos(estado: EstadoDocumentos): void {
  redesenhar?.(estado);
}

/** Andamento do download do Atualizar: a área aberta mostra no cartão. */
export function progressoAreaDocumentos(p: ProgressoDocumento): void {
  mostrarProgresso?.(p);
}

export interface OpcoesAreaDocumentos {
  /** Abre rolada até o cartão deste documento. */
  cartao?: TipoDocumento;
  /** Resultado de um Carregar ou Atualizar feito fora (tela inicial). */
  resultado?: ResultadoImportarDocumento;
}

const PARA_QUE: Record<TipoDocumento, string> = {
  st: 'Arquivo .xlsx do Portal Nacional da Substituição Tributária (CONFAZ), página de Sergipe. Necessária para a ferramenta "ST, MVA e CFOP": diz se o produto tem ST em Sergipe e qual MVA usar.',
  tipi: 'Tabela do IPI da Receita Federal: o tipi.xlsx oficial ou o texto .txt extraído do PDF. Usada para conferir se o NCM existe e a alíquota de IPI da nota.',
  combustiveis:
    'Opcional. Planilha .xlsx de combustíveis e lubrificantes do CONFAZ para Sergipe (Ato COTEPE/ICMS 61/19); só o Apêndice XIV (lubrificantes derivados e não derivados de petróleo) é lido. Com ela, item de NCM 2710 ou 3403 fora da planilha de ST pede confirmação na ferramenta "ST, MVA e CFOP".',
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

export function abrirAreaDocumentos(opcoes: OpcoesAreaDocumentos = {}): void {
  if (areaDocumentosAberta()) {
    if (opcoes.cartao) irParaCartao?.(opcoes.cartao);
    else dialogo?.focus();
    return;
  }
  let estado: EstadoDocumentos | null = null;
  /** Erro da última importação, por documento: o que houve e o que fazer. */
  const erros = new Map<
    TipoDocumento,
    { mensagem: string; oQueFazer?: string }
  >();
  /** Planilha com segmentos não lidos, esperando a confirmação. */
  const parciais = new Map<
    TipoDocumento,
    { token: string; arquivo: string; segmentos: string[] }
  >();
  /** Relatórios abertos. */
  const relatorios = new Set<TipoDocumento>();
  let ocupado = false;
  /** Download do Atualizar em andamento (indicador no cartão). */
  const progresso = new Map<TipoDocumento, ProgressoDocumento>();

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
    irParaCartao = null;
    mostrarProgresso = null;
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
      parciais.delete(tipo);
      const rotulo = rotuloDocumento(r.info, r.estado.leitura[tipo]);
      status.textContent = `${NOME_DOCUMENTO[tipo]}: ${rotulo.texto.toLowerCase()}.`;
      if (rotulo.cor !== 'verde') relatorios.add(tipo);
    } else if (r.status === 'parcial') {
      erros.delete(tipo);
      parciais.set(tipo, {
        token: r.token,
        arquivo: r.arquivo,
        segmentos: r.segmentos,
      });
      status.textContent = '';
    } else {
      parciais.delete(tipo);
      erros.set(tipo, { mensagem: r.mensagem, oQueFazer: r.oQueFazer });
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

  function tabelaProblemas(problemas: LeituraDocumento['problemas']) {
    return el(
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
            el('th', '', 'Célula'),
            el('th', '', 'Motivo'),
            el('th', '', 'Conteúdo'),
          ),
        ),
        el(
          'tbody',
          '',
          ...problemas.map((p) =>
            el(
              'tr',
              '',
              el('td', '', p.celula || '-'),
              el('td', '', p.motivo),
              el('td', 'documento__valor', p.valor || '-'),
            ),
          ),
        ),
      ),
    );
  }

  /** Relatório: problemas de leitura (por aba) separados do ignorado de propósito. */
  function relatorio(tipo: TipoDocumento, l: LeituraDocumento | null) {
    if (!l)
      return el(
        'section',
        'documento__relatorio',
        el('p', 'documento__nota', 'Relatório da leitura indisponível.'),
      );
    const total = l.totalProblemas;
    return el(
      'section',
      'documento__relatorio',
      el(
        'h4',
        'documento__subtitulo',
        total === 0
          ? 'Problemas de leitura: nenhum'
          : `Problemas de leitura: ${total}`,
      ),
      total > 0 &&
        el(
          'p',
          'documento__nota',
          'Células que não deu para converter. O resto do documento está carregado.',
        ),
      ...problemasPorAba(l.problemas).map(([aba, ps]) =>
        el(
          'div',
          'documento__grupo',
          el(
            'h5',
            'documento__aba',
            aba || (tipo === 'tipi' ? 'TIPI' : 'Sem aba'),
            el('span', 'documento__quando', ` (${ps.length})`),
          ),
          tabelaProblemas(ps),
        ),
      ),
      total > l.problemas.length &&
        el(
          'p',
          'documento__nota',
          `Mostrando ${l.problemas.length} de ${total}.`,
        ),
      l.segmentosIncompletos.length > 0 &&
        el(
          'div',
          'documento__grupo',
          el('h4', 'documento__subtitulo', 'Segmentos não lidos'),
          el(
            'p',
            'documento__nota',
            `${l.segmentosIncompletos.join(', ')}. Usado assim por sua confirmação: produtos desses segmentos não são achados nesta planilha.`,
          ),
        ),
      l.ignorados.length > 0 &&
        el(
          'div',
          'documento__grupo',
          el('h4', 'documento__subtitulo', 'Ignorado de propósito'),
          el(
            'ul',
            'documento__observacoes',
            ...l.ignorados.map((g) =>
              el(
                'li',
                '',
                `${g.motivo}: ${g.total.toLocaleString('pt-BR')}`,
                g.onde.length > 0 &&
                  el(
                    'span',
                    'documento__quando',
                    ` (${g.onde.join(', ')}${g.total > g.onde.length && tipo === 'tipi' ? ', ...' : ''})`,
                  ),
              ),
            ),
          ),
        ),
      l.observacoes.length > 0 &&
        el(
          'div',
          'documento__grupo',
          el('h4', 'documento__subtitulo', 'Observações'),
          el(
            'ul',
            'documento__observacoes',
            ...l.observacoes.map((o) => el('li', '', o)),
          ),
        ),
    );
  }

  /**
   * Arquivo de outro tipo ou ilegível: o que houve e o que fazer, em
   * destaque. O X fecha o aviso e o documento volta ao estado de antes da
   * tentativa; o aviso só volta numa nova tentativa.
   */
  function caixaErro(
    tipo: TipoDocumento,
    erro: { mensagem: string; oQueFazer?: string },
  ) {
    const fecharErro = botao('fechar-aviso', icone(...ICONES.fechar));
    fecharErro.dataset.foco = `fechar-erro-${tipo}`;
    fecharErro.title = 'Fechar o aviso';
    fecharErro.setAttribute(
      'aria-label',
      `Fechar o aviso de erro de ${NOME_DOCUMENTO[tipo]}`,
    );
    fecharErro.addEventListener(
      'click',
      () =>
        void acao(`atualizar-${tipo}`, async () => {
          erros.delete(tipo);
          estado = await window.psApi.descartarRecusa(tipo);
          aoFecharErro?.(tipo);
        }),
    );
    const caixa = el(
      'div',
      'documento__erro',
      el('p', '', el('strong', '', erro.mensagem)),
      fecharErro,
      erro.oQueFazer && el('p', '', `O que fazer: ${erro.oQueFazer}`),
    );
    caixa.setAttribute('role', 'alert');
    return caixa;
  }

  /** Segmentos não lidos: só ativa a planilha com a confirmação marcada. */
  function caixaParcial(
    tipo: TipoDocumento,
    p: { token: string; arquivo: string; segmentos: string[] },
    temAnterior: boolean,
  ): HTMLElement {
    const marca = el('input', '');
    marca.type = 'checkbox';
    marca.id = `parcial-${tipo}`;
    marca.dataset.foco = `parcial-${tipo}`;
    const usar = botao(
      'botao botao--principal botao--pequeno',
      el('span', '', 'Usar o resto'),
    );
    usar.disabled = true;
    marca.addEventListener('change', () => {
      usar.disabled = !marca.checked;
    });
    const cancelar = botao(
      'botao botao--claro botao--pequeno',
      el('span', '', 'Cancelar'),
    );
    usar.addEventListener(
      'click',
      () =>
        void acao(`atualizar-${tipo}`, async () => {
          aoImportar(tipo, await window.psApi.confirmarParcial(p.token));
        }),
    );
    cancelar.addEventListener(
      'click',
      () =>
        void acao(`atualizar-${tipo}`, async () => {
          await window.psApi.cancelarParcial(p.token);
          parciais.delete(tipo);
          status.textContent = `${p.arquivo} não foi usado.`;
        }),
    );
    const rotulo = el(
      'label',
      'documentos__opcao',
      marca,
      el(
        'span',
        '',
        'Os segmentos com problema não afetam meu trabalho. Usar o resto.',
      ),
    );
    rotulo.htmlFor = marca.id;
    const caixa = el(
      'div',
      'documento__parcial',
      el(
        'p',
        '',
        el(
          'strong',
          '',
          `${p.arquivo}: ${p.segmentos.length === 1 ? 'um segmento não foi lido' : `${p.segmentos.length} segmentos não foram lidos`}.`,
        ),
        temAnterior
          ? ' Ainda não está em uso; o documento anterior continua valendo.'
          : ` Ainda não está em uso; ${NOME_DOCUMENTO[tipo]} continua faltando.`,
      ),
      el(
        'ul',
        'documento__observacoes',
        ...p.segmentos.map((x) => el('li', '', x)),
      ),
      rotulo,
      el('div', 'documento__acoes', usar, cancelar),
    );
    caixa.setAttribute('role', 'alert');
    return caixa;
  }

  /** Download em andamento: barra de progresso e o texto. */
  function indicador(p: ProgressoDocumento): HTMLElement {
    const barra = el('progress', 'documento__barra');
    const pct = p.total
      ? Math.min(100, Math.round((p.recebido / p.total) * 100))
      : null;
    if (pct !== null) {
      barra.max = 100;
      barra.value = pct;
    }
    barra.setAttribute('aria-hidden', 'true');
    return el(
      'span',
      'documento__progresso',
      barra,
      el(
        'span',
        '',
        p.fim
          ? 'Importando...'
          : pct === null
            ? 'Baixando...'
            : `Baixando ${pct}%`,
      ),
    );
  }

  function verificacao(
    tipo: TipoDocumento,
    r: ResultadoVerificacao,
  ): HTMLElement {
    const acoes: HTMLElement[] = [];
    const andamento = progresso.get(tipo);
    if (andamento) acoes.push(indicador(andamento));
    else if (r.estado === 'nova' && r.disponivel) {
      // Com documento carregado é o Atualizar (troca só se a nova for lida).
      const temInfo = estado?.[tipo] != null;
      const b = botao(
        'botao botao--principal botao--pequeno',
        icone(...ICONES.salvar),
        el('span', '', temInfo ? 'Atualizar' : 'Baixar e importar'),
      );
      b.dataset.foco = `baixar-${tipo}`;
      b.title = temInfo
        ? `Baixar a versão nova do site oficial (a ${NOME_DOCUMENTO[tipo]} atual só é trocada se a nova for lida)`
        : `Baixar do site oficial e importar`;
      b.addEventListener(
        'click',
        () =>
          void acao(`atualizar-${tipo}`, async () => {
            status.textContent = 'Baixando...';
            progresso.set(tipo, {
              tipo,
              recebido: 0,
              total: null,
              fim: false,
            });
            if (estado) desenhar(estado);
            try {
              aoImportar(tipo, await window.psApi.baixarDocumento(tipo));
            } finally {
              progresso.delete(tipo);
            }
          }),
      );
      acoes.push(b);
    }
    if (r.estado === 'nao-verificou' || r.estado === 'sem-conexao') {
      const b = botao(
        'botao botao--claro botao--pequeno',
        icone(...ICONES.externo),
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
    const leitura = e.leitura[tipo];
    const r =
      e.preferencias.verificacaoOnline && tipo !== 'combustiveis'
        ? e.verificacao[tipo]
        : null;
    // Opcional e não carregado: não é falta (nada muda no app sem ele).
    // Ícone e cor do estado iguais aos da tela inicial e da barra.
    const selo = seloVisivel(tipo, e);
    const nova = textoVersaoNova(tipo, e);
    const tituloId = `documento-${tipo}`;
    const btnAtualizar = botao(
      info
        ? 'botao botao--claro botao--pequeno'
        : 'botao botao--principal botao--pequeno',
      icone(...ICONES.enviar),
      el('span', '', info ? 'Trocar arquivo' : 'Carregar'),
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
    // Planilha importada antes da leitura das colunas de estados: sem os
    // protocolos, a prévia não mostra as observações de protocolo.
    let avisoReimportar: HTMLElement | false = false;
    if (tipo === 'st' && info && e.stSemProtocolos) {
      const reimportar = botao(
        'botao botao--claro botao--pequeno',
        icone(...ICONES.enviar),
        el('span', '', 'Trocar arquivo'),
      );
      reimportar.dataset.foco = 'reimportar-st';
      reimportar.addEventListener(
        'click',
        () =>
          void acao('atualizar-st', async () => {
            status.textContent = '';
            aoImportar('st', await window.psApi.importarDocumento('st'));
          }),
      );
      avisoReimportar = el(
        'div',
        'documento__parcial documento__reimportar',
        el(
          'p',
          '',
          el(
            'strong',
            '',
            'Reimporte a planilha para habilitar as observações de protocolo.',
          ),
          ' Esta importação é anterior à leitura das colunas de estados.',
        ),
        el('div', 'documento__acoes', reimportar),
      );
    }
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
    // Nome do arquivo em uso e o X que tira o documento da base.
    let arquivo: HTMLElement | false = false;
    if (info) {
      const remover = botao('documento__remover', icone(...ICONES.fechar));
      remover.dataset.foco = `remover-${tipo}`;
      remover.title = `Remover ${info.arquivo}`;
      remover.setAttribute(
        'aria-label',
        `Remover ${NOME_DOCUMENTO[tipo]} (${info.arquivo})`,
      );
      remover.addEventListener(
        'click',
        () =>
          void acao(`atualizar-${tipo}`, async () => {
            const resposta = await perguntar({
              titulo: `Remover ${NOME_DOCUMENTO[tipo]}?`,
              texto:
                tipo === 'st'
                  ? `${info.arquivo} sai da base. A ferramenta "ST, MVA e CFOP" volta a pedir a planilha até você carregar outra.`
                  : tipo === 'combustiveis'
                    ? `${info.arquivo} sai da base. Itens de NCM 2710 e 3403 fora da planilha de ST voltam a ser tratados como sem ST.`
                    : `${info.arquivo} sai da base. A análise passa a rodar sem conferir NCM e IPI até você carregar outra.`,
              botoes: [
                { rotulo: 'Cancelar', valor: 'cancelar', principal: true },
                { rotulo: 'Remover', valor: 'remover', perigo: true },
              ],
              cancelar: 'cancelar',
            });
            if (resposta !== 'remover') return;
            estado = await window.psApi.removerDocumento(tipo);
            relatorios.delete(tipo);
            erros.delete(tipo);
            status.textContent = `${NOME_DOCUMENTO[tipo]} removida.`;
          }),
      );
      arquivo = el(
        'p',
        'documento__arquivo',
        el('span', '', 'Arquivo: '),
        el('strong', '', info.arquivo),
        remover,
      );
    }
    const erro = erros.get(tipo);
    const parcial = parciais.get(tipo);
    const versao = info
      ? tipo === 'combustiveis'
        ? `${info.versao ? `Versão ${info.versao}` : 'Versão não informada'} (Ato COTEPE/ICMS 61/19, Apêndice XIV)`
        : tipo === 'st'
          ? info.versao
            ? `Versão ${info.versao}`
            : 'Versão não informada'
          : info.versao
            ? `TIPI ${info.versao}`
            : 'Ano não informado'
      : '';
    const vigencia =
      info && info.vigencia
        ? tipo === 'st' || tipo === 'combustiveis'
          ? `a partir de ${info.vigencia}`
          : `atualizada até ${info.vigencia}`
        : '';
    const h = el('h3', 'documento__titulo', NOME_DOCUMENTO[tipo]);
    h.id = tituloId;
    const artigo = el(
      'article',
      `documento documento--${selo.estado}${tipo === 'combustiveis' ? ' documento--opcional' : ''}`,
      el(
        'header',
        'documento__cabecalho',
        h,
        // Um selo só: o ícone do estado e o texto da situação. Com versão
        // nova e o documento lido sem problema, o selo diz qual é.
        el(
          'span',
          `documento__selo documento__selo--${selo.estado}`,
          marcaEstado(
            selo.estado,
            nova && selo.texto === 'Versão nova disponível' ? nova : selo.texto,
          ),
        ),
      ),
      arquivo,
      avisoReimportar,
      el('p', 'documento__para-que', PARA_QUE[tipo]),
      info &&
        el(
          'dl',
          'documento__dados',
          linhaInfo('Versão', versao),
          vigencia &&
            linhaInfo(tipo === 'tipi' ? 'Atualização' : 'Vigência', vigencia),
          linhaInfo(
            'Importado',
            `${dataHora(info.importadoEm)} (${tamanho(info.tamanhoArquivo)})`,
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
      erro && caixaErro(tipo, erro),
      parcial && caixaParcial(tipo, parcial, info !== null),
      r && verificacao(tipo, r),
      el('div', 'documento__acoes', btnAtualizar, btnRelatorio),
      info && aberto && relatorio(tipo, leitura),
    );
    artigo.setAttribute('aria-labelledby', tituloId);
    return artigo;
  }

  // ---------- decisões lembradas (ferramenta ST, MVA e CFOP) ----------

  function decisoes(e: EstadoDocumentos): HTMLElement {
    const textoDecisao = (d: DecisaoLembrada) =>
      [
        d.escolha === null
          ? null
          : d.escolha.tipo === 'sem-st'
            ? 'Sem ST'
            : d.escolha.tipo === 'apendice-xiv'
              ? `Apêndice XIV: ${ROTULO_LUBRIFICANTE[d.escolha.lubrificante]}`
              : d.escolha.tipo === 'manual'
                ? `CFOP manual ${d.escolha.cfop}${d.escolha.mva === null ? '' : `, MVA ${textoMva(d.escolha.mva)}`}: ${d.escolha.motivo}`
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
        icone(...ICONES.desfazer),
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
          cartao('combustiveis', e),
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
  irParaCartao = (tipo) => {
    const artigo = corpo
      .querySelector(`#documento-${tipo}`)
      ?.closest<HTMLElement>('article');
    if (!artigo) return;
    artigo.scrollIntoView({ block: 'start' });
    artigo
      .querySelector<HTMLElement>(
        `[data-foco="baixar-${tipo}"], [data-foco="atualizar-${tipo}"]`,
      )
      ?.focus({ preventScroll: true });
  };
  mostrarProgresso = (p) => {
    if (!progresso.has(p.tipo)) return;
    progresso.set(p.tipo, p);
    const pct = p.total
      ? Math.min(100, Math.round((p.recebido / p.total) * 100))
      : null;
    status.textContent = p.fim
      ? 'Importando...'
      : pct === null
        ? 'Baixando...'
        : `Baixando ${pct}%`;
    const antigo = corpo.querySelector(
      `article:has(#documento-${p.tipo}) .documento__progresso`,
    );
    antigo?.replaceWith(indicador(p));
  };

  document.body.append(d);
  d.showModal();
  corpo.replaceChildren(el('p', 'documento__nota', 'Carregando...'));
  void window.psApi.documentos().then((e) => {
    if (opcoes.cartao && opcoes.resultado)
      aoImportar(opcoes.cartao, opcoes.resultado);
    desenhar(e);
    if (opcoes.cartao) irParaCartao?.(opcoes.cartao);
    else corpo.querySelector<HTMLElement>('[data-foco^="atualizar-"]')?.focus();
  });
}
