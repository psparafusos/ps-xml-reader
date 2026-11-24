// Coluna "Código da casa" da Conferência na tela: o estado de cada item da
// nota aberta (escolha gravada no .psxml ou feita agora, decisão lembrada,
// sugestão do motor), a célula (código, descrição curta, ícone de confiança,
// conversão do fator e o botão de escolher), o quadro de escolha (o item da
// nota, os candidatos do motor com o motivo, a busca no cadastro, "nenhum"
// e o fator) e o resumo do painel. A lógica é de src/cadastro/codigoCasa.ts;
// o motor roda no processo principal (src/cadastroGestao.ts).

import {
  chaveCodigoCasa,
  estadoCodigoCasa,
  lerFator,
  MOTIVO_CAMINHO,
  raizDoDocumento,
  resumoCodigoCasa,
  ROTULO_CONFIANCA,
  ROTULO_ORIGEM,
  TEXTO_NENHUM,
  textoCodigoCasa,
  textoConversao,
  textoFator,
  textoOrigemFator,
  type ConfiancaCasa,
  type DecisaoCodigoCasa,
  type EscolhaCodigoCasa,
  type EstadoCodigoCasa,
  type ResumoCodigoCasa,
} from './cadastro/codigoCasa';
import type { FatorSugerido, SugestaoItem } from './cadastro/casamento';
import { novaCaixa } from './dialogos';
import { botao, el, icone, iconeSinal } from './dom';
import { ICONES } from './icones';
import type { Item, Nota } from './nfe/tipos';

export interface AcoesCodigoCasa {
  /** Mudou o estado de um item (ou de todos, null): a tela redesenha. */
  mudou(nItem: string | null): void;
}

export interface CodigoCasaTela {
  /** Nota aberta (ou nenhuma): as escolhas gravadas no .psxml e o motor. */
  abrirNota(
    nota: Nota | null,
    gravadas: ReadonlyMap<string, EscolhaCodigoCasa>,
  ): void;
  /**
   * Rascunho recuperado: as escolhas dele passam a valer, e as do arquivo
   * continuam como as salvas (sem o original, nada conta como salvo).
   */
  recuperar(
    rascunho: ReadonlyMap<string, EscolhaCodigoCasa>,
    semOriginal: boolean,
  ): void;
  /** Os documentos mudaram (cadastro carregado ou trocado, decisões lembradas). */
  atualizarDocumentos(e: EstadoDocumentos | null): void;
  /** Há cadastro carregado: a coluna existe. */
  comCadastro(): boolean;
  estado(i: Item): EstadoCodigoCasa;
  texto(i: Item): string;
  /** Preenche a célula da tabela (tela e, escondido, o texto da folha). */
  celula(
    i: Item,
    td: HTMLTableCellElement,
    interativa: boolean,
  ): HTMLTableCellElement;
  /** Resumo do painel; null sem cadastro ou sem nota. */
  resumo(): ResumoCodigoCasa | null;
  /** O que vai para o .psxml: a escolha que vale em cada item. */
  paraSalvar(): Map<string, EscolhaCodigoCasa>;
  /** A pessoa escolheu algo desde o último abrir ou salvar. */
  alterado(): boolean;
  /** O estado atual passa a ser o gravado. */
  marcarSalvas(): void;
  /** Abre o quadro de escolha do item. */
  escolher(nItem: string): Promise<void>;
}

const CLASSE_SINAL: Record<ConfiancaCasa, string> = {
  alta: 'ok',
  media: 'aviso',
  baixa: 'erro',
};
const ICONE_CONFIANCA = {
  alta: ICONES.confiancaAlta,
  media: ICONES.confiancaMedia,
  baixa: ICONES.confiancaBaixa,
} as const;

/** Ícone da confiança: o tamanho e o traço dos ícones de estado. */
export function iconeConfianca(c: ConfiancaCasa): SVGSVGElement {
  const svg = icone(...ICONE_CONFIANCA[c]);
  svg.classList.add(
    'icone-estado',
    `icone-estado--${CLASSE_SINAL[c]}`,
    'codigo-casa__sinal',
  );
  return svg;
}

/** Ícone do item na célula, com o texto para leitor de tela. */
function sinalDoItem(e: EscolhaCodigoCasa): HTMLElement {
  const texto =
    e.origem === 'motor' && e.confianca
      ? ROTULO_CONFIANCA[e.confianca]
      : e.origem === 'lembrada'
        ? 'Decisão lembrada'
        : 'Sua escolha';
  const svg =
    e.origem === 'motor' && e.confianca
      ? iconeConfianca(e.confianca)
      : iconeSinal('ok');
  svg.classList.add('codigo-casa__sinal');
  return el(
    'span',
    'codigo-casa__icone',
    svg,
    el('span', 'conferencia__so-leitor', texto),
  );
}

const iguais = (
  a: EscolhaCodigoCasa | undefined,
  b: EscolhaCodigoCasa | undefined,
) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function criarCodigoCasa(acoes: AcoesCodigoCasa): CodigoCasaTela {
  let nota: Nota | null = null;
  /** Sugestões do motor por nItem; null sem cadastro (ou ainda pedindo). */
  let sugestoes: Map<string, SugestaoItem> | null = null;
  let barras: Record<string, string> = {};
  /** importadoEm do cadastro carregado; null sem cadastro. */
  let cadastro: string | null = null;
  let lembradas = new Map<string, DecisaoCodigoCasa>();
  /** Escolhas gravadas no .psxml e as feitas agora pela pessoa. */
  const escolhas = new Map<string, EscolhaCodigoCasa>();
  const salvas = new Map<string, EscolhaCodigoCasa>();
  let geracao = 0;

  const emitente = () => nota?.emitente.CNPJ.replace(/\D/g, '') ?? '';

  async function pedirSugestoes(): Promise<void> {
    const g = ++geracao;
    sugestoes = null;
    if (!nota || !cadastro || nota.itens.length === 0) return;
    const n = nota;
    try {
      const r = await window.psApi.sugerirCodigosCasa({
        cnpj: n.emitente.CNPJ,
        cpf: '',
        chave: n.chave,
        itens: n.itens.map((i) => ({
          nItem: i.nItem,
          cProd: i.cProd,
          cEAN: i.cEAN,
          xProd: i.xProd,
          NCM: i.NCM,
          uCom: i.uCom,
          vUnCom: i.vUnCom,
        })),
      });
      if (g !== geracao) return;
      if (r.status !== 'ok') {
        sugestoes = new Map();
        barras = {};
      } else {
        sugestoes = new Map(r.itens.map((s) => [String(s.nItem), s]));
        barras = r.barras;
      }
    } catch (erro) {
      console.error(erro);
      if (g !== geracao) return;
      sugestoes = new Map();
    }
    acoes.mudou(null);
  }

  function lembradaDe(i: Item): DecisaoCodigoCasa | undefined {
    if (!nota) return undefined;
    return lembradas.get(chaveCodigoCasa(emitente(), i.cProd));
  }

  function estado(i: Item): EstadoCodigoCasa {
    return estadoCodigoCasa(
      escolhas.get(i.nItem),
      lembradaDe(i),
      sugestoes?.get(i.nItem) ?? null,
      i.uCom,
    );
  }

  function celula(
    i: Item,
    td: HTMLTableCellElement,
    interativa: boolean,
  ): HTMLTableCellElement {
    const e = estado(i);
    const x = e.escolha;
    const tela = el('span', 'codigo-casa__tela');
    if (x) {
      const conv = textoConversao(x);
      tela.append(
        sinalDoItem(x),
        el(
          'span',
          'codigo-casa__textos',
          x.codigo === null
            ? el('span', 'codigo-casa__nenhum', TEXTO_NENHUM)
            : el(
                'span',
                'codigo-casa__produto',
                el('strong', 'codigo-casa__codigo', x.codigo),
                x.descricao &&
                  el('span', 'codigo-casa__descricao', x.descricao),
              ),
          conv && el('span', 'codigo-casa__conversao', conv),
        ),
      );
    } else if (e.situacao === 'ambiguo') {
      const n = sugestoes?.get(i.nItem)?.candidatos.length ?? 0;
      tela.append(
        el('span', 'codigo-casa__ambiguo', `${n} produtos possíveis`),
      );
    }
    if (interativa) {
      const rotulo = `Escolher o produto da casa do item ${i.nItem}`;
      const b = x
        ? botao(
            'botao botao--claro botao--pequeno botao--icone codigo-casa__escolher',
            icone(...ICONES.editar),
          )
        : botao(
            'botao botao--claro botao--pequeno codigo-casa__escolher',
            el('span', '', 'Escolher'),
          );
      b.setAttribute('aria-label', rotulo);
      b.dataset.codigoCasa = i.nItem;
      b.addEventListener('click', () => void escolher(i.nItem));
      tela.append(b);
    }
    td.classList.toggle('codigo-casa--pendente', e.precisaDeVoce);
    td.replaceChildren(
      tela,
      el('span', 'codigo-casa__impressao', textoCodigoCasa(e)),
    );
    return td;
  }

  function paraSalvar(): Map<string, EscolhaCodigoCasa> {
    const r = new Map<string, EscolhaCodigoCasa>();
    if (!nota) return r;
    if (!cadastro || sugestoes === null) {
      // Sem cadastro (ou antes do motor responder): o que já estava gravado
      // e o que a pessoa escolheu, mais as decisões lembradas.
      for (const i of nota.itens) {
        const g = escolhas.get(i.nItem);
        const l = lembradaDe(i);
        const e =
          g ?? (l ? estadoCodigoCasa(null, l, null, i.uCom).escolha : null);
        if (e) r.set(i.nItem, e);
      }
      return r;
    }
    for (const i of nota.itens) {
      const e = estado(i).escolha;
      if (e) r.set(i.nItem, e);
    }
    return r;
  }

  function alterado(): boolean {
    const ids = new Set([...escolhas.keys(), ...salvas.keys()]);
    for (const id of ids)
      if (!iguais(escolhas.get(id), salvas.get(id))) return true;
    return false;
  }

  function marcarSalvas(): void {
    salvas.clear();
    for (const [k, v] of escolhas) salvas.set(k, v);
  }

  // ---------- quadro de escolha ----------

  interface Opcao {
    valor: string;
    codigo: string | null;
    descricao: string;
    unidade: string;
    codigoBarras: string | null;
    ativo: boolean;
    motivo: string | null;
    fator: FatorSugerido | null | undefined;
  }

  async function escolher(nItem: string): Promise<void> {
    const item = nota?.itens.find((x) => x.nItem === nItem);
    if (!nota || !item) return;
    const sug = sugestoes?.get(nItem) ?? null;
    const atual = estado(item);
    const emit = emitente();
    const nomeEmitente = nota.emitente.xFant || nota.emitente.xNome;

    await new Promise<void>((resolve) => {
      const { d, corpo, fim } = novaCaixa<void>(
        `Produto da casa do item ${nItem}`,
        'Escolha o produto do cadastro da loja para este item da nota. A escolha fica lembrada para as próximas notas deste fornecedor.',
        undefined,
        resolve,
      );
      d.classList.add('caixa-dialogo--larga', 'casa-quadro');
      const nome = `casa-opcao-${nItem}-${Math.random().toString(36).slice(2)}`;
      let selecionado: Opcao | null = null;
      let fatorEditado = false;
      const opcoesPorValor = new Map<string, Opcao>();

      // Item da nota.
      const dado = (rotulo: string, valor: string) =>
        el(
          'div',
          'casa-quadro__campo',
          el('dt', '', rotulo),
          el('dd', 'casa-quadro__dado', valor || '-'),
        );
      const blocoItem = el(
        'section',
        'casa-quadro__item',
        el('h3', 'casa-quadro__subtitulo', 'Item da nota'),
        el(
          'dl',
          'casa-quadro__dados',
          dado('Código', item.cProd),
          dado('Descrição', item.xProd),
          dado(
            'Código de barras',
            /^\d+$/.test(item.cEAN.trim()) ? item.cEAN : '',
          ),
          dado('Unidade', item.uCom),
        ),
      );

      // Fator.
      const campoFator = el('input', 'caixa-dialogo__campo casa-quadro__fator');
      campoFator.type = 'text';
      campoFator.inputMode = 'decimal';
      campoFator.id = `${nome}-fator`;
      campoFator.autocomplete = 'off';
      const rotuloFator = el('label', 'casa-quadro__rotulo-fator');
      rotuloFator.htmlFor = campoFator.id;
      const origemFator = el('p', 'casa-quadro__nota');
      const erro = el('p', 'caixa-dialogo__erro');
      erro.hidden = true;
      erro.setAttribute('role', 'alert');
      campoFator.addEventListener('input', () => {
        fatorEditado = true;
        erro.hidden = true;
        campoFator.removeAttribute('aria-invalid');
      });
      const blocoFator = el(
        'div',
        'casa-quadro__bloco-fator',
        rotuloFator,
        campoFator,
        origemFator,
      );

      function mostrarFator(): void {
        const o = selecionado;
        blocoFator.hidden = !o || o.codigo === null;
        if (!o || o.codigo === null) return;
        rotuloFator.textContent = `Fator: quantos ${o.unidade || 'unidades de venda'} há em 1 ${item!.uCom.trim() || 'unidade da nota'}`;
        if (o.fator === undefined) {
          origemFator.textContent = 'Procurando o fator no cadastro…';
          return;
        }
        origemFator.textContent = textoOrigemFator(o.fator);
        if (!fatorEditado) {
          const valorInicial =
            atual.escolha?.codigo === o.codigo && atual.escolha.fator !== null
              ? atual.escolha.fator
              : (o.fator?.fator ??
                (o.unidade.trim().toUpperCase() ===
                item!.uCom.trim().toUpperCase()
                  ? 1
                  : null));
          campoFator.value =
            valorInicial === null ? '' : textoFator(valorInicial);
        }
      }

      async function buscarFator(o: Opcao): Promise<void> {
        if (o.codigo === null || o.fator !== undefined) return;
        try {
          const r = await window.psApi.buscarCadastro({
            texto: '',
            codigo: o.codigo,
            emitente: emit,
            uCom: item!.uCom,
          });
          o.fator = r.status === 'ok' ? (r.produtos[0]?.fator ?? null) : null;
        } catch {
          o.fator = null;
        }
        if (selecionado === o) mostrarFator();
      }

      function selecionar(o: Opcao): void {
        selecionado = o;
        fatorEditado = false;
        mostrarFator();
        void buscarFator(o);
      }

      function linhaOpcao(o: Opcao): HTMLElement {
        opcoesPorValor.set(o.valor, o);
        const r = el('input', 'casa-opcao__marca');
        r.type = 'radio';
        r.name = nome;
        r.value = o.valor;
        r.id = `${nome}-${o.valor}`;
        r.checked = selecionado?.valor === o.valor;
        r.addEventListener('change', () => {
          if (r.checked) selecionar(o);
        });
        const textos =
          o.codigo === null
            ? el(
                'span',
                'casa-opcao__textos',
                el('span', 'casa-opcao__nome', TEXTO_NENHUM),
              )
            : el(
                'span',
                'casa-opcao__textos',
                el(
                  'span',
                  'casa-opcao__nome',
                  el('strong', 'casa-quadro__dado', o.codigo),
                  ' ',
                  el('span', 'casa-quadro__dado', o.descricao),
                ),
                el(
                  'span',
                  'casa-opcao__detalhe',
                  el('span', 'casa-quadro__dado', o.unidade),
                  o.codigoBarras &&
                    el(
                      'span',
                      'casa-quadro__dado',
                      ` · barras ${o.codigoBarras}`,
                    ),
                  !o.ativo && el('span', 'casa-opcao__inativo', ' · inativo'),
                ),
                o.motivo && el('span', 'casa-opcao__motivo', o.motivo),
              );
        const rotulo = el('label', 'casa-opcao', r, textos);
        rotulo.htmlFor = r.id;
        return rotulo;
      }

      // Candidatos do motor.
      const candidatos: Opcao[] = sug
        ? sug.candidatos.map((c) => ({
            valor: `motor-${c.codigo}`,
            codigo: c.codigo,
            descricao: c.descricao,
            unidade: c.unidade,
            codigoBarras: barras[c.codigo] ?? null,
            ativo: c.ativo,
            motivo: sug.caminho
              ? [
                  MOTIVO_CAMINHO[sug.caminho],
                  sug.codigo === c.codigo && sug.confianca !== 'nenhuma'
                    ? `${ROTULO_CONFIANCA[sug.confianca]}.`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' ')
              : null,
            fator: sug.codigo === c.codigo ? sug.fator : undefined,
          }))
        : [];
      const avisos = sug?.avisos ?? [];
      const blocoMotor = el(
        'section',
        'casa-quadro__secao',
        el('h3', 'casa-quadro__subtitulo', 'Sugestões do app'),
        candidatos.length === 0
          ? el(
              'p',
              'casa-quadro__nota',
              sugestoes === null
                ? 'O app ainda está procurando no cadastro.'
                : 'O app não achou este item no cadastro. Procure abaixo ou escolha "nenhum".',
            )
          : el(
              'div',
              'casa-quadro__opcoes',
              sug?.ambiguo &&
                el(
                  'p',
                  'casa-quadro__nota',
                  `O app achou ${candidatos.length} produtos pelo mesmo caminho e não escolheu nenhum.`,
                ),
              ...candidatos.map(linhaOpcao),
            ),
        ...avisos.map((a) => el('p', 'casa-quadro__aviso', a.texto)),
      );

      // Escolha atual (lembrada ou da pessoa) fora dos candidatos.
      const x = atual.escolha;
      let blocoAtual: HTMLElement | false = false;
      if (x && x.origem !== 'motor') {
        const o: Opcao = {
          valor: x.codigo === null ? 'nenhum' : `atual-${x.codigo}`,
          codigo: x.codigo,
          descricao: x.descricao,
          unidade: x.unidade,
          codigoBarras: null,
          ativo: true,
          motivo: `Escolha atual (${ROTULO_ORIGEM[x.origem]}).`,
          fator: undefined,
        };
        if (
          x.codigo !== null &&
          !candidatos.some((c) => c.codigo === x.codigo)
        ) {
          selecionado = o;
          blocoAtual = el(
            'section',
            'casa-quadro__secao',
            el('h3', 'casa-quadro__subtitulo', 'Escolha atual'),
            el('div', 'casa-quadro__opcoes', linhaOpcao(o)),
          );
        }
      }
      if (!selecionado && x) {
        const v =
          x.codigo === null
            ? 'nenhum'
            : candidatos.find((c) => c.codigo === x.codigo)?.valor;
        if (v === 'nenhum') selecionado = null;
        else selecionado = candidatos.find((c) => c.valor === v) ?? null;
      }

      // Busca no cadastro.
      const campoBusca = el('input', 'caixa-dialogo__campo casa-quadro__busca');
      campoBusca.type = 'search';
      campoBusca.id = `${nome}-busca`;
      campoBusca.autocomplete = 'off';
      campoBusca.setAttribute(
        'aria-label',
        'Buscar no cadastro por código, descrição ou código de barras',
      );
      campoBusca.placeholder = 'Código, descrição ou código de barras';
      const resultados = el(
        'div',
        'casa-quadro__opcoes casa-quadro__resultados',
      );
      const statusBusca = el('p', 'casa-quadro__nota casa-quadro__status');
      statusBusca.setAttribute('role', 'status');
      let temporizador: number | undefined;
      let buscaGeracao = 0;
      async function buscar(): Promise<void> {
        const termo = campoBusca.value.trim();
        const g = ++buscaGeracao;
        if (!termo) {
          resultados.replaceChildren();
          statusBusca.textContent = '';
          return;
        }
        let r: ResultadoBuscaCasa;
        try {
          r = await window.psApi.buscarCadastro({
            texto: termo,
            emitente: emit,
            uCom: item!.uCom,
          });
        } catch {
          r = { status: 'sem-cadastro' };
        }
        if (g !== buscaGeracao) return;
        if (r.status !== 'ok') {
          resultados.replaceChildren();
          statusBusca.textContent = 'O cadastro não está carregado.';
          return;
        }
        const ops = r.produtos.map((p): Opcao => ({
          valor: `busca-${p.codigo}`,
          codigo: p.codigo,
          descricao: p.descricao,
          unidade: p.unidade,
          codigoBarras: p.codigoBarras,
          ativo: p.ativo,
          motivo: null,
          fator: p.fator,
        }));
        resultados.replaceChildren(...ops.map(linhaOpcao));
        statusBusca.textContent =
          ops.length === 0
            ? 'Nenhum produto com essa busca.'
            : ops.length === 1
              ? '1 produto achado.'
              : `${ops.length} produtos achados${ops.length >= 50 ? ' (os 50 primeiros)' : ''}.`;
      }
      campoBusca.addEventListener('input', () => {
        window.clearTimeout(temporizador);
        temporizador = window.setTimeout(() => void buscar(), 200);
      });
      campoBusca.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          window.clearTimeout(temporizador);
          void buscar();
        }
      });
      const blocoBusca = el(
        'section',
        'casa-quadro__secao',
        el('h3', 'casa-quadro__subtitulo', 'Buscar no cadastro'),
        campoBusca,
        statusBusca,
        resultados,
      );

      // Nenhum.
      const opNenhum: Opcao = {
        valor: 'nenhum',
        codigo: null,
        descricao: '',
        unidade: '',
        codigoBarras: null,
        ativo: true,
        motivo: null,
        fator: null,
      };
      if (x?.codigo === null) selecionado = opNenhum;
      const blocoNenhum = el(
        'section',
        'casa-quadro__secao',
        el('div', 'casa-quadro__opcoes', linhaOpcao(opNenhum)),
      );

      const rolagem = el(
        'div',
        'casa-quadro__rolagem',
        blocoItem,
        blocoMotor,
        blocoAtual,
        blocoBusca,
        blocoNenhum,
      );
      corpo.append(rolagem, blocoFator, erro);

      // Botões.
      const btnCancelar = botao('botao botao--claro', 'Cancelar');
      btnCancelar.addEventListener('click', () => fim());
      const btnUsar = botao('botao botao--principal', 'Usar');
      const btnEsquecer =
        x && x.origem !== 'motor'
          ? botao(
              'botao botao--claro casa-quadro__esquecer',
              'Voltar ao automático',
            )
          : null;
      btnEsquecer?.addEventListener('click', () => {
        void (async () => {
          escolhas.delete(nItem);
          await window.psApi
            .esquecerCodigoCasa(chaveCodigoCasa(emit, item!.cProd))
            .catch(() => false);
          lembradas.delete(chaveCodigoCasa(emit, item!.cProd));
          acoes.mudou(nItem);
          fim();
        })();
      });
      btnUsar.addEventListener('click', () => {
        const o = selecionado;
        if (!o) {
          erro.textContent = 'Escolha um produto ou "nenhum".';
          erro.hidden = false;
          return;
        }
        let fator: number | null = null;
        if (o.codigo !== null && campoFator.value.trim() !== '') {
          fator = lerFator(campoFator.value);
          if (fator === null) {
            erro.textContent =
              'O fator precisa ser um número maior que zero (por exemplo 12 ou 0,5).';
            erro.hidden = false;
            campoFator.setAttribute('aria-invalid', 'true');
            campoFator.focus();
            return;
          }
        }
        const escolha: EscolhaCodigoCasa = {
          codigo: o.codigo,
          descricao: o.codigo === null ? '' : o.descricao,
          unidade: o.codigo === null ? '' : o.unidade,
          fator: o.codigo === null ? null : fator,
          unidadeCompra: item!.uCom.trim(),
          origem: 'pessoa',
          confianca: null,
        };
        escolhas.set(nItem, escolha);
        const decisao: DecisaoCodigoCasa = {
          raizCnpj: raizDoDocumento(emit),
          fornecedor: nomeEmitente,
          cProd: item!.cProd.trim(),
          xProd: item!.xProd,
          codigo: escolha.codigo,
          descricao: escolha.descricao,
          unidade: escolha.unidade,
          fator: escolha.fator,
          unidadeCompra: escolha.unidadeCompra,
          atualizadaEm: new Date().toISOString(),
        };
        if (/^\d{8}$/.test(decisao.raizCnpj) && decisao.cProd) {
          lembradas.set(chaveCodigoCasa(emit, item!.cProd), decisao);
          void window.psApi.lembrarCodigoCasa(decisao).catch(() => false);
        }
        acoes.mudou(nItem);
        fim();
      });
      d.append(
        el(
          'footer',
          'caixa-dialogo__botoes',
          btnEsquecer,
          btnCancelar,
          btnUsar,
        ),
      );
      document.body.append(d);
      d.showModal();
      if (selecionado) {
        const s = selecionado as Opcao;
        mostrarFator();
        void buscarFator(s);
      } else blocoFator.hidden = true;
      (
        d.querySelector<HTMLInputElement>(`input[name="${nome}"]:checked`) ??
        campoBusca
      ).focus();
    });
    // Foco de volta no botão da célula.
    document
      .querySelector<HTMLElement>(`[data-codigo-casa="${CSS.escape(nItem)}"]`)
      ?.focus();
  }

  return {
    abrirNota(n, gravadas) {
      nota = n;
      escolhas.clear();
      for (const [k, v] of gravadas) escolhas.set(k, v);
      marcarSalvas();
      sugestoes = null;
      barras = {};
      void pedirSugestoes();
    },
    recuperar(rascunho, semOriginal) {
      escolhas.clear();
      for (const [k, v] of rascunho) escolhas.set(k, v);
      if (semOriginal) salvas.clear();
      acoes.mudou(null);
    },
    atualizarDocumentos(e) {
      lembradas = new Map(
        (e?.codigosCasa ?? []).map((d) => [
          chaveCodigoCasa(d.raizCnpj, d.cProd),
          d,
        ]),
      );
      const novo = e?.cadastro.info?.importadoEm ?? null;
      if (novo !== cadastro) {
        cadastro = novo;
        void pedirSugestoes();
      }
      acoes.mudou(null);
    },
    comCadastro: () => cadastro !== null,
    estado,
    texto: (i) => textoCodigoCasa(estado(i)),
    celula,
    resumo() {
      if (!nota || !cadastro || nota.itens.length === 0) return null;
      return resumoCodigoCasa(
        nota.itens.map((i) => ({ nItem: i.nItem, estado: estado(i) })),
      );
    },
    paraSalvar,
    alterado,
    marcarSalvas,
    escolher,
  };
}
