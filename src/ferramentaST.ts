// Ferramenta "ST, MVA e CFOP" do painel de conferência: a prévia item por
// item (ST em Sergipe, segmento e CEST, MVA, CFOP sugerido e o motivo), a
// finalidade de cada item, a escolha da linha da planilha quando é preciso
// confirmar, as decisões lembradas e o Aplicar, que grava o CFOP (e, se a
// pessoa quiser, a MVA) nas anotações. O XML original nunca muda.
//
// A tabela não cabe no painel (300 px): abre numa janela própria, por cima
// da nota. A análise roda no processo principal (src/documentos.ts) e a
// lógica de cada item é de src/fiscal/entrada.ts.

import { perguntar } from './dialogos';
import { botao, el } from './dom';
import {
  chaveDecisao,
  decisaoAplicavel,
  executarPlano,
  FINALIDADE_PADRAO,
  FINALIDADES,
  planoAplicar,
  raizCnpj,
  resolverItem,
  ROTULO_FINALIDADE,
  type Decisao,
  type DecisaoLembrada,
  type EscolhaST,
  type Finalidade,
  type ItemResolvido,
} from './fiscal/entrada';
import type { ColunaItem } from './nfe/colunas';
import type { Anotacoes, Item, Nota } from './nfe/tipos';

export const TITULO_FERRAMENTA_ST = 'ST, MVA e CFOP';
export const DESCRICAO_FERRAMENTA_ST =
  'Diz se cada item tem ST em Sergipe, a MVA e o CFOP de entrada, e grava o CFOP numa coluna de anotação.';

/** Coluna sugerida para o CFOP; se não existir no perfil, dá para criar na hora. */
export const COLUNA_CFOP_PADRAO = 'CFOP de entrada';
const COLUNA_MVA_PADRAO = 'MVA';

export interface ContextoST {
  nota: Nota;
  anotacoes: Anotacoes;
  resultado: Extract<ResultadoAnaliseST, { status: 'ok' }>;
  /** Colunas de anotação do perfil ativo (as escondidas vêm marcadas). */
  colunasAnotacao: ColunaItem[];
  /** Cria a coluna de anotação no perfil ativo; devolve o id ou a mensagem de erro. */
  criarColuna(titulo: string): Promise<{ id: string } | { erro: string }>;
  /** Gravou nas anotações: a tela redesenha e avisa. */
  aplicado(mensagem: string): void;
}

/** Valor da lista de colunas que pede para criar a coluna. */
const CRIAR = '__criar__';

interface Linha {
  item: Item;
  decisao: Decisao;
  /** Decisão vinda do arquivo (abertura da nota). */
  lembrada: boolean;
  /** Decisão guardada agora, nesta prévia. */
  guardada: boolean;
}

export function abrirFerramentaST(c: ContextoST): void {
  const { nota } = c;
  const uf = nota.emitente.endereco.UF;
  const cnpj = nota.emitente.CNPJ;
  const porItem = new Map(nota.itens.map((i) => [i.nItem, i]));
  const linhas: Linha[] = [];
  const analises = new Map<
    string,
    (typeof c.resultado.itens)[number]['analise']
  >();
  for (const { analise, lembrada } of c.resultado.itens) {
    const item = porItem.get(analise.nItem);
    if (!item) continue;
    analises.set(analise.nItem, analise);
    const vale = lembrada !== null && decisaoAplicavel(analise, lembrada);
    linhas.push({
      item,
      decisao: vale
        ? { escolha: lembrada.escolha, finalidade: lembrada.finalidade }
        : { escolha: null, finalidade: FINALIDADE_PADRAO },
      lembrada: vale,
      guardada: false,
    });
  }

  let soPendentes = false;
  const marcados = new Set<string>();
  /** Item com a escolha de linha aberta. */
  let confirmando: string | null = null;
  let ocupado = false;

  const resolver = (l: Linha): ItemResolvido =>
    resolverItem(analises.get(l.item.nItem)!, uf, l.decisao, l.lembrada);

  // ---------- estrutura da janela ----------
  const titulo = el('h2', 'painel__titulo', TITULO_FERRAMENTA_ST);
  titulo.id = 'ferramenta-st-titulo';
  const resumo = el('p', 'painel__dica');
  const avisoTipi =
    c.resultado.semTipi &&
    el(
      'p',
      'st__aviso',
      'TIPI não carregada: a análise roda sem conferir se o NCM existe e a alíquota de IPI.',
    );
  const filtro = el('input', '');
  filtro.type = 'checkbox';
  filtro.id = 'st-filtro';
  const rotuloFiltro = el('label', 'documentos__opcao', filtro);
  rotuloFiltro.htmlFor = filtro.id;
  const textoFiltro = el('span', '');
  rotuloFiltro.append(textoFiltro);
  const finalidadeLote = el('select', 'st__select');
  finalidadeLote.append(
    el('option', '', 'Mudar a finalidade dos marcados...'),
    ...FINALIDADES.map((f) => {
      const o = el('option', '', ROTULO_FINALIDADE[f]);
      o.value = f;
      return o;
    }),
  );
  finalidadeLote.options[0].value = '';
  finalidadeLote.setAttribute('aria-label', 'Finalidade dos itens marcados');
  const barra = el('div', 'st__barra', rotuloFiltro, finalidadeLote);

  const tabela = el('table', 'st__tabela');
  const corpoTabela = el('tbody', '');
  const marcarTodos = el('input', '');
  marcarTodos.type = 'checkbox';
  marcarTodos.setAttribute('aria-label', 'Marcar todos os itens');
  tabela.append(
    el(
      'thead',
      '',
      el(
        'tr',
        '',
        el('th', 'st__marca', marcarTodos),
        el('th', 'num', 'Item'),
        el('th', '', 'Descrição'),
        el('th', '', 'NCM'),
        el('th', '', 'ST em SE'),
        el('th', '', 'Segmento e CEST'),
        el('th', 'num', 'MVA'),
        el('th', '', 'CFOP'),
        el('th', '', 'Finalidade'),
        el('th', '', 'Motivo'),
      ),
    ),
    corpoTabela,
  );

  // Aplicar: coluna do CFOP (padrão "CFOP de entrada") e, se quiser, da MVA.
  const selCfop = el('select', 'st__select');
  selCfop.id = 'st-coluna-cfop';
  const rotCfop = el('label', 'st__rotulo', 'Gravar o CFOP em');
  rotCfop.htmlFor = selCfop.id;
  const comMva = el('input', '');
  comMva.type = 'checkbox';
  comMva.id = 'st-com-mva';
  const rotMva = el(
    'label',
    'documentos__opcao',
    comMva,
    el('span', '', 'Gravar a MVA em'),
  );
  rotMva.htmlFor = comMva.id;
  const selMva = el('select', 'st__select');
  selMva.setAttribute('aria-label', 'Coluna da MVA');
  const resumoAplicar = el('p', 'st__resumo');
  resumoAplicar.setAttribute('role', 'status');
  const erro = el('p', 'painel__erro');
  erro.setAttribute('role', 'alert');
  erro.hidden = true;
  const btnCancelar = botao('botao botao--claro', el('span', '', 'Fechar'));
  const btnAplicar = botao('botao botao--principal', el('span', '', 'Aplicar'));

  const corpo = el(
    'div',
    'st__corpo',
    avisoTipi,
    barra,
    el('div', 'st__rolagem', tabela),
  );
  const d = el(
    'dialog',
    'painel painel--st',
    el('header', 'painel__cabecalho', titulo, resumo),
    corpo,
    erro,
    el(
      'footer',
      'painel__rodape st__rodape',
      el(
        'div',
        'st__destino',
        el('div', 'st__campo', rotCfop, selCfop),
        el('div', 'st__campo', rotMva, selMva),
        resumoAplicar,
      ),
      el('div', 'painel__grupo', btnCancelar, btnAplicar),
    ),
  );
  d.setAttribute('aria-labelledby', titulo.id);

  const fechar = () => {
    if (d.open) d.close();
    d.remove();
  };
  btnCancelar.addEventListener('click', fechar);
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (!ocupado) fechar();
  });

  // ---------- colunas de destino ----------
  const opcaoColunas = (
    sel: HTMLSelectElement,
    padrao: string,
    excluir?: string,
  ) => {
    const atual = sel.value;
    const temPadrao = c.colunasAnotacao.some(
      (col) => col.rotulo.toLowerCase() === padrao.toLowerCase(),
    );
    sel.replaceChildren(
      ...c.colunasAnotacao
        .filter((col) => col.id !== excluir)
        .map((col) => {
          const o = el(
            'option',
            '',
            col.visivel ? col.rotulo : `${col.rotulo} (coluna escondida)`,
          );
          o.value = col.id;
          return o;
        }),
    );
    if (!temPadrao) {
      const o = el('option', '', `Criar a coluna "${padrao}" agora`);
      o.value = CRIAR;
      sel.prepend(o);
    }
    const preferida =
      c.colunasAnotacao.find(
        (col) => col.rotulo.toLowerCase() === padrao.toLowerCase(),
      )?.id ?? CRIAR;
    sel.value = [...sel.options].some((o) => o.value === atual)
      ? atual
      : preferida;
  };
  opcaoColunas(selCfop, COLUNA_CFOP_PADRAO);
  opcaoColunas(selMva, COLUNA_MVA_PADRAO, selCfop.value);
  selMva.disabled = true;
  comMva.addEventListener('change', () => {
    selMva.disabled = !comMva.checked;
    desenharResumo();
  });
  selCfop.addEventListener('change', () => {
    opcaoColunas(selMva, COLUNA_MVA_PADRAO, selCfop.value);
    desenharResumo();
  });
  selMva.addEventListener('change', desenharResumo);

  // ---------- decisões ----------
  async function decidir(l: Linha, decisao: Decisao): Promise<void> {
    l.decisao = decisao;
    l.lembrada = false;
    const a = analises.get(l.item.nItem)!;
    const chave = chaveDecisao(cnpj, l.item.cProd);
    if (!l.item.cProd.trim() || raizCnpj(cnpj).length !== 8) {
      l.guardada = false;
    } else if (
      decisao.escolha === null &&
      decisao.finalidade === FINALIDADE_PADRAO
    ) {
      // Voltou ao automático: nada a lembrar.
      await window.psApi.esquecerDecisao(chave);
      l.guardada = false;
    } else {
      const lembrada: DecisaoLembrada = {
        ...decisao,
        raizCnpj: raizCnpj(cnpj),
        fornecedor: nota.emitente.xNome,
        cProd: l.item.cProd.trim(),
        xProd: l.item.xProd,
        ncm: a.ncm,
        atualizadaEm: new Date().toISOString(),
      };
      l.guardada = await window.psApi.lembrarDecisao(lembrada);
    }
  }

  async function desfazer(l: Linha): Promise<void> {
    await window.psApi.esquecerDecisao(chaveDecisao(cnpj, l.item.cProd));
    l.decisao = { escolha: null, finalidade: FINALIDADE_PADRAO };
    l.lembrada = false;
    l.guardada = false;
  }

  /** Uma mudança por vez; redesenha e devolve o foco ao controle de mesmo papel. */
  async function acao(foco: string | null, fn: () => Promise<void>) {
    if (ocupado) return;
    ocupado = true;
    try {
      await fn();
    } catch (e) {
      console.error(e);
      mostrarErro('Não foi possível guardar a decisão.');
    } finally {
      ocupado = false;
      desenhar();
      if (foco) d.querySelector<HTMLElement>(`[data-foco="${foco}"]`)?.focus();
    }
  }

  function mostrarErro(texto: string | null): void {
    erro.textContent = texto ?? '';
    erro.hidden = texto === null;
  }

  // ---------- tabela ----------
  const ROTULO_ST: Record<ItemResolvido['st'], string> = {
    sim: 'Sim',
    nao: 'Não',
    confirmar: 'Confirmar',
  };

  function linhaTabela(l: Linha, r: ItemResolvido): HTMLTableRowElement[] {
    const n = l.item.nItem;
    const marca = el('input', '');
    marca.type = 'checkbox';
    marca.checked = marcados.has(n);
    marca.setAttribute('aria-label', `Marcar o item ${n}`);
    marca.addEventListener('change', () => {
      if (marca.checked) marcados.add(n);
      else marcados.delete(n);
      desenharBarra();
    });

    const a = analises.get(n)!;
    const podeEscolher = a.candidatos.length > 0;
    const st = el(
      'span',
      `st__situacao st__situacao--${r.st}`,
      ROTULO_ST[r.st],
    );
    const celulaSt = el('td', '', st);
    if (podeEscolher && (r.st === 'confirmar' || l.decisao.escolha !== null)) {
      const b = botao(
        'botao botao--claro botao--pequeno st__confirmar',
        el('span', '', r.st === 'confirmar' ? 'Confirmar' : 'Trocar'),
      );
      b.dataset.foco = `confirmar-${n}`;
      b.setAttribute('aria-expanded', String(confirmando === n));
      b.addEventListener('click', () => {
        confirmando = confirmando === n ? null : n;
        desenhar();
        d.querySelector<HTMLElement>(
          confirmando
            ? `[data-foco="escolha-${n}"]`
            : `[data-foco="confirmar-${n}"]`,
        )?.focus();
      });
      celulaSt.append(b);
    }

    const selFin = el('select', 'st__select st__select--pequeno');
    selFin.setAttribute('aria-label', `Finalidade do item ${n}`);
    selFin.dataset.foco = `finalidade-${n}`;
    for (const f of FINALIDADES) {
      const o = el('option', '', ROTULO_FINALIDADE[f]);
      o.value = f;
      selFin.append(o);
    }
    selFin.value = l.decisao.finalidade;
    selFin.addEventListener(
      'change',
      () =>
        void acao(`finalidade-${n}`, () =>
          decidir(l, { ...l.decisao, finalidade: selFin.value as Finalidade }),
        ),
    );

    const marcaDecisao =
      (l.lembrada || l.guardada) &&
      el(
        'span',
        'st__lembrado',
        el('span', 'st__etiqueta', l.lembrada ? 'lembrado' : 'guardado'),
        (() => {
          const b = botao('st__desfazer', 'desfazer');
          b.dataset.foco = `desfazer-${n}`;
          b.title = 'Esquecer a decisão deste produto e voltar ao automático';
          b.addEventListener(
            'click',
            () => void acao(`finalidade-${n}`, () => desfazer(l)),
          );
          return b;
        })(),
      );

    const motivo = el(
      'td',
      'st__motivo',
      el('span', '', r.motivo),
      marcaDecisao,
      ...r.observacoesTipi.map((o) => el('span', 'st__obs', `TIPI: ${o}`)),
    );
    motivo.title = r.detalhes.join('\n');

    const tr = el(
      'tr',
      `st__linha${r.precisaDeMim ? ' st__linha--pendente' : ''}`,
      el('td', 'st__marca', marca),
      el('td', 'num', n),
      el('td', 'st__descricao', l.item.xProd),
      el('td', 'st__ncm', formatarNcm(r.ncm)),
      celulaSt,
      el(
        'td',
        '',
        r.segmento ?? (r.st === 'nao' ? '-' : `${a.candidatos.length} opções`),
        r.cest && el('span', 'st__cest', `CEST ${r.cest}`),
      ),
      el(
        'td',
        `num st__mva${r.mva === null && r.mvaTexto !== '-' ? ' st__mva--texto' : ''}`,
        r.mvaTexto,
      ),
      el('td', 'st__cfop', r.cfop ?? '-'),
      el('td', '', selFin),
      motivo,
    );
    const filas = [tr];
    if (confirmando === n) filas.push(escolhaCandidatos(l, r));
    return filas;
  }

  /** Lista de candidatos (e "sem ST") para a pessoa escolher, com o motivo à vista. */
  function escolhaCandidatos(l: Linha, r: ItemResolvido): HTMLTableRowElement {
    const n = l.item.nItem;
    const a = analises.get(n)!;
    const nome = `st-escolha-${n}`;
    const atual = l.decisao.escolha;
    const opcoes: { valor: EscolhaST; rotulo: HTMLElement }[] = [
      ...a.candidatos.map((cand) => ({
        valor: {
          tipo: 'candidato' as const,
          segmento: cand.segmento,
          linhaPlanilha: cand.linhaPlanilha,
          cest: cand.cest,
        },
        rotulo: el(
          'span',
          'st__opcao-texto',
          el('strong', '', `${cand.segmento}, CEST ${cand.cest}`),
          ` NCM ${cand.ncmPlanilha} na planilha (linha ${cand.linhaPlanilha}): ${cand.descricao}`,
          el(
            'span',
            'st__cest',
            ` MVA: ${cand.mvas.map((m) => (m.valor === null ? '-' : `${(m.valor * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`)).join(' / ')}${cand.cestConfere ? ' · CEST da nota confere' : ''}`,
          ),
        ),
      })),
      {
        valor: { tipo: 'sem-st' },
        rotulo: el(
          'span',
          'st__opcao-texto',
          el('strong', '', 'Sem ST'),
          ' O produto não é nenhuma das linhas acima.',
        ),
      },
    ];
    const radios = opcoes.map((o, i) => {
      const r2 = el('input', '');
      r2.type = 'radio';
      r2.name = nome;
      r2.id = `${nome}-${i}`;
      r2.checked =
        atual !== null &&
        (atual.tipo === 'sem-st'
          ? o.valor.tipo === 'sem-st'
          : o.valor.tipo === 'candidato' &&
            o.valor.linhaPlanilha === atual.linhaPlanilha &&
            o.valor.segmento === atual.segmento);
      if (i === 0) r2.dataset.foco = `escolha-${n}`;
      const lbl = el('label', 'st__opcao', r2, o.rotulo);
      lbl.htmlFor = r2.id;
      return { r2, lbl, valor: o.valor };
    });
    const usar = botao(
      'botao botao--principal botao--pequeno',
      el('span', '', 'Usar esta escolha'),
    );
    const voltar = botao(
      'botao botao--claro botao--pequeno',
      el('span', '', 'Cancelar'),
    );
    usar.addEventListener('click', () => {
      const marcada = radios.find((x) => x.r2.checked);
      if (!marcada) {
        mostrarErro('Escolha uma linha da planilha ou "Sem ST".');
        return;
      }
      mostrarErro(null);
      confirmando = null;
      void acao(`finalidade-${n}`, () =>
        decidir(l, { ...l.decisao, escolha: marcada.valor }),
      );
    });
    voltar.addEventListener('click', () => {
      confirmando = null;
      desenhar();
      d.querySelector<HTMLElement>(`[data-foco="confirmar-${n}"]`)?.focus();
    });
    const grupo = el(
      'fieldset',
      'st__escolha',
      el('legend', '', `Item ${n}: qual linha da planilha vale?`),
      el('ul', 'st__motivos', ...r.detalhes.map((m) => el('li', '', m))),
      ...radios.map((x) => x.lbl),
      el('div', 'documento__acoes', usar, voltar),
    );
    return el(
      'tr',
      'st__linha-escolha',
      el('td', '', ''),
      (() => {
        const td = el('td', '', grupo);
        td.colSpan = 9;
        return td;
      })(),
    );
  }

  function desenharBarra(): void {
    finalidadeLote.disabled = marcados.size === 0;
    finalidadeLote.options[0].textContent =
      marcados.size === 0
        ? 'Marque itens para mudar a finalidade de vários'
        : `Mudar a finalidade de ${marcados.size} ${marcados.size === 1 ? 'item marcado' : 'itens marcados'}...`;
    marcarTodos.checked = marcados.size > 0 && marcados.size === linhas.length;
    marcarTodos.indeterminate =
      marcados.size > 0 && marcados.size < linhas.length;
  }

  function desenharResumo(): void {
    const resolvidos = linhas.map(resolver);
    const comCfop = resolvidos.filter((r) => r.cfop !== null).length;
    const semCfop = resolvidos.length - comCfop;
    const destino = selCfop.value;
    resumoAplicar.textContent =
      `${comCfop} de ${resolvidos.length} itens com CFOP para gravar` +
      (semCfop > 0
        ? `; ${semCfop} sem CFOP (precisam de você) ficam como estão.`
        : '.');
    btnAplicar.disabled = !destino || comCfop === 0;
    btnAplicar.title = !destino
      ? 'Escolha a coluna de destino'
      : comCfop === 0
        ? 'Nenhum item com CFOP definido'
        : '';
  }

  function desenhar(): void {
    const resolvidos = linhas.map((l) => ({ l, r: resolver(l) }));
    const pendentes = resolvidos.filter((x) => x.r.precisaDeMim).length;
    resumo.textContent = `${nota.emitente.xNome} (${uf || 'UF ausente'}) · ${linhas.length} ${linhas.length === 1 ? 'item' : 'itens'} · ${pendentes} ${pendentes === 1 ? 'precisa' : 'precisam'} de você`;
    textoFiltro.textContent = `Só os que precisam de mim (${pendentes})`;
    filtro.checked = soPendentes;
    const visiveis = resolvidos.filter(
      (x) => !soPendentes || x.r.precisaDeMim || confirmando === x.l.item.nItem,
    );
    corpoTabela.replaceChildren(
      ...(visiveis.length === 0
        ? [
            (() => {
              const td = el('td', 'st__vazio', 'Nenhum item precisa de você.');
              td.colSpan = 10;
              return el('tr', '', td);
            })(),
          ]
        : visiveis.flatMap((x) => linhaTabela(x.l, x.r))),
    );
    desenharBarra();
    desenharResumo();
  }

  filtro.addEventListener('change', () => {
    soPendentes = filtro.checked;
    desenhar();
  });
  marcarTodos.addEventListener('change', () => {
    if (marcarTodos.checked) for (const l of linhas) marcados.add(l.item.nItem);
    else marcados.clear();
    desenhar();
  });
  finalidadeLote.addEventListener('change', () => {
    const f = finalidadeLote.value as Finalidade | '';
    if (!f) return;
    const alvos = linhas.filter((l) => marcados.has(l.item.nItem));
    void acao(null, async () => {
      for (const l of alvos) await decidir(l, { ...l.decisao, finalidade: f });
      finalidadeLote.value = '';
    });
  });

  // ---------- aplicar ----------
  async function colunaDe(
    sel: HTMLSelectElement,
    padrao: string,
  ): Promise<string | null> {
    if (sel.value !== CRIAR) return sel.value || null;
    const r = await c.criarColuna(padrao);
    if ('erro' in r) {
      mostrarErro(`Não foi possível criar a coluna "${padrao}": ${r.erro}`);
      return null;
    }
    return r.id;
  }

  btnAplicar.addEventListener('click', () => {
    if (ocupado) return;
    ocupado = true;
    mostrarErro(null);
    void (async () => {
      try {
        const criarCfop = selCfop.value === CRIAR;
        const colCfop = await colunaDe(selCfop, COLUNA_CFOP_PADRAO);
        if (!colCfop) return;
        const colMva = comMva.checked
          ? await colunaDe(selMva, COLUNA_MVA_PADRAO)
          : null;
        if (comMva.checked && !colMva) return;
        const rotuloDe = (id: string, padrao: string) =>
          c.colunasAnotacao.find((col) => col.id === id)?.rotulo ?? padrao;
        const resolvidos = linhas.map(resolver);
        const plano = planoAplicar(resolvidos, c.anotacoes, colCfop, colMva);
        const preenchidas = plano.gravacoes.filter((g) =>
          g.atual.trim(),
        ).length;
        let substituir = false;
        if (preenchidas > 0) {
          const r = await perguntar({
            titulo: 'Já há valores preenchidos',
            texto: `${preenchidas} ${preenchidas === 1 ? 'célula já tem' : 'células já têm'} um valor diferente do sugerido. Substituir?`,
            botoes: [
              { rotulo: 'Não substituir', valor: 'manter', principal: true },
              { rotulo: 'Substituir', valor: 'substituir', perigo: true },
              { rotulo: 'Cancelar', valor: 'cancelar' },
            ],
            cancelar: 'cancelar',
          });
          if (r === 'cancelar') return;
          substituir = r === 'substituir';
        }
        const gravadas = executarPlano(plano, c.anotacoes, substituir);
        const nomeCfop = rotuloDe(colCfop, COLUNA_CFOP_PADRAO);
        fechar();
        c.aplicado(
          gravadas === 0
            ? 'Nada mudou: as anotações já estavam assim.'
            : `${gravadas} ${gravadas === 1 ? 'anotação gravada' : 'anotações gravadas'} (${nomeCfop}${criarCfop ? ', coluna criada' : ''}${colMva ? `, ${rotuloDe(colMva, COLUNA_MVA_PADRAO)}` : ''}). Salve para guardar no .psxml.`,
        );
      } finally {
        ocupado = false;
      }
    })();
  });

  desenhar();
  document.body.append(d);
  d.showModal();
  (d.querySelector<HTMLElement>('.st__confirmar') ?? filtro).focus();
}

function formatarNcm(ncm: string): string {
  return ncm.length === 8
    ? `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}`
    : ncm;
}

/** Itens da nota no formato do pedido de análise. */
export function itensParaAnalise(itens: Item[]): ItemParaAnalise[] {
  return itens.map((i) => ({
    nItem: i.nItem,
    cProd: i.cProd,
    xProd: i.xProd,
    NCM: i.NCM,
    CEST: i.CEST,
    orig: i.orig ?? '',
    CST: i.CST ?? '',
    CSOSN: i.CSOSN ?? '',
    pICMS: i.pICMS ?? '',
    CFOP: i.CFOP,
    cstIPI: i.cstIPI ?? '',
    pIPI: i.pIPI ?? '',
  }));
}
