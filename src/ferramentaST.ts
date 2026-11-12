// Ferramenta "ST, MVA e CFOP" do painel de conferência: a prévia item por
// item (ST em Sergipe, segmento e CEST, MVA, CFOP sugerido e o motivo), a
// finalidade de cada item, a escolha da linha da planilha quando é preciso
// confirmar, as decisões lembradas e o Aplicar, que grava o CFOP (e, se a
// pessoa quiser, a MVA e a alíquota interna) nas anotações. O XML original
// nunca muda.
//
// A tabela não cabe no painel (300 px): abre numa janela própria, por cima
// da nota. A análise roda no processo principal (src/documentos.ts); a
// lógica de cada item é de src/fiscal/entrada.ts, com os campos novos do
// motor (rótulo da MVA, alíquota interna, observações) em
// src/previaST.ts.

import { perguntar } from './dialogos';
import { botao, botaoFecharPainel, el } from './dom';
import { criarMenuEscolha, type OpcaoMenu, type Seletor } from './menuEscolha';
import {
  chaveDecisao,
  decisaoAplicavel,
  executarPlano,
  FINALIDADE_PADRAO,
  FINALIDADES,
  lerCfopManual,
  raizCnpj,
  RESSALVA_APENDICE_XIV,
  ROTULO_FINALIDADE,
  type EscolhaST,
  type DecisaoLembrada,
  type Finalidade,
} from './fiscal/entrada';
import {
  decisaoDaLembrada,
  previaItem,
  type DecisaoST,
  type LinhaPrevia,
} from './previaST';
import {
  explicacaoItem,
  formatarNcm,
  frasesForaLinhaAutomotiva,
  stRetidoNaNota,
  sugerirSemST,
  temCandidatoAutopecas,
  textoForaLinhaAutomotiva,
  textoOutrasLinhas,
} from './explicacaoST';
import { observacaoMvaFornecedor, sugestaoHistorico } from './historicoST';
import { ligarDica, type Dica } from './tooltip';
import { planoDoAplicar, type CamposST } from './nfe/ferramentasPerfil';
import type { ColunaItem } from './nfe/colunas';
import type { Anotacoes, Item, Nota } from './nfe/tipos';

export const TITULO_FERRAMENTA_ST = 'ST, MVA e CFOP';
export const DESCRICAO_FERRAMENTA_ST =
  'Diz se cada item tem ST em Sergipe, a MVA e o CFOP de entrada, e grava o CFOP numa coluna de anotação.';

/** Coluna sugerida para o CFOP; se não existir no perfil, dá para criar na hora. */
export const COLUNA_CFOP_PADRAO = 'CFOP de entrada';
const COLUNA_MVA_PADRAO = 'MVA';
const COLUNA_ALIQ_PADRAO = 'Alíquota interna';

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
  /**
   * Campos do rodapé à mostra (Configurações, aba Ferramentas). Oculto: o
   * campo some e o Aplicar não grava aquilo. Sem o campo: os dois à mostra.
   */
  campos?: CamposST;
}

/** Valor da lista de colunas que pede para criar a coluna. */
const CRIAR = '__criar__';

interface Linha {
  item: Item;
  decisao: DecisaoST;
  /** Decisão vinda do arquivo (abertura da nota). */
  lembrada: boolean;
  /** Decisão guardada agora, nesta prévia. */
  guardada: boolean;
  /** A escolha veio do "Usar" da sugestão pelo histórico. */
  origem?: 'histórico';
}

/** Textos das dicas (src/tooltip.ts) da ferramenta. */
const DICAS = {
  filtro:
    'Mostra só os itens em que o app não decidiu sozinho e precisa da sua escolha.',
  lote: 'Marque as caixas dos itens e escolha aqui uma finalidade para todos de uma vez (revenda, uso e consumo, bonificação...). O CFOP muda junto.',
  st: 'Se o produto tem substituição tributária em Sergipe, pela planilha de ST carregada.',
  segmento: 'A linha da planilha de ST que vale para o item.',
  mva: 'Margem de valor agregado da planilha, na coluna da alíquota de ICMS da nota.',
  aliq: 'Alíquota de ICMS de Sergipe para o produto, da linha da planilha (com FECOEP quando houver).',
  cfop: 'CFOP de entrada pela tabela da loja: origem do fornecedor, ST e finalidade.',
  finalidade:
    'Para que a loja comprou: revenda, uso e consumo, bonificação, ativo. Muda o CFOP.',
  motivo: 'Por que o app chegou a esse resultado, e o que conferir.',
  gravarCfop:
    'Em qual coluna de anotação da nota o CFOP vai ser escrito ao clicar em Aplicar. Se a coluna ainda não existe, o app cria.',
  gravarMva:
    'Marque para escrever também a MVA numa coluna de anotação. Útil para lançar no Saef.',
  gravarAliq:
    'Marque para escrever também a alíquota interna numa coluna de anotação.',
  aplicar:
    'Escreve os valores nas colunas de anotação da nota. Não mexe no XML do fornecedor.',
  lembrado:
    'Você já decidiu este produto deste fornecedor antes. Clique em desfazer para escolher de novo.',
};

/** Texto com dica que não é controle: ganha o Tab para a dica abrir no foco. */
function alvoDica(texto: string, dica: string): HTMLSpanElement {
  const s = el('span', 'st__dica-alvo', texto);
  s.tabIndex = 0;
  ligarDica(s, dica);
  return s;
}

export function abrirFerramentaST(c: ContextoST): void {
  const { nota } = c;
  const campos: CamposST = c.campos ?? { mva: true, aliquota: true };
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
    // Decisão antiga que só guardava a MVA-ST 2 não vale mais (a loja não
    // tem índice de fidelização): o item fica no automático, com a MVA-ST 1.
    const lembradaDecisao =
      lembrada !== null && decisaoAplicavel(analise, lembrada)
        ? decisaoDaLembrada(lembrada)
        : null;
    const vale = lembradaDecisao !== null;
    linhas.push({
      item,
      decisao: lembradaDecisao ?? {
        escolha: null,
        finalidade: FINALIDADE_PADRAO,
      },
      lembrada: vale,
      guardada: false,
      origem: vale ? lembrada?.origem : undefined,
    });
  }

  let soPendentes = false;
  const marcados = new Set<string>();
  /** Item com a escolha de linha aberta. */
  let confirmando: string | null = null;
  let ocupado = false;

  // "Não é da linha automotiva" nas informações complementares da nota: só
  // informação, nos itens com candidato em Autopeças (não muda a decisão).
  const foraAutomotiva = frasesForaLinhaAutomotiva(nota.infAdic?.infCpl ?? '');
  const avisosAutomotiva = (a: (typeof c.resultado.itens)[number]['analise']) =>
    temCandidatoAutopecas(a) ? foraAutomotiva : [];

  // Decisões lembradas de todos os fornecedores, para o histórico por NCM;
  // acompanha o que se decide nesta janela.
  const historico = new Map(
    (c.resultado.historico ?? []).map((d) => [
      chaveDecisao(d.raizCnpj, d.cProd),
      d,
    ]),
  );

  const resolver = (l: Linha): LinhaPrevia => {
    const r = previaItem(
      analises.get(l.item.nItem)!,
      uf,
      l.decisao,
      l.lembrada,
    );
    // MVA que o fornecedor usou na retenção x a da planilha: só observa.
    const obs =
      stRetidoNaNota(l.item) && !r.manual
        ? observacaoMvaFornecedor(l.item.pMVAST, r.mva)
        : null;
    return obs ? { ...r, observacoes: [...r.observacoes, obs] } : r;
  };

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
  // Menus no visual do app (no lugar dos <select>): um só, na camada de cima.
  const camadaMenus = el('div', 'st__menus');
  const menus = criarMenuEscolha(camadaMenus);
  const OPCOES_FINALIDADE: OpcaoMenu[] = FINALIDADES.map((f) => ({
    valor: f,
    texto: ROTULO_FINALIDADE[f],
  }));
  const finalidadeLote = menus.seletor({
    rotulo: 'Finalidade dos itens marcados',
    opcoes: OPCOES_FINALIDADE,
    valor: '',
    vazio: 'Mudar a finalidade dos marcados...',
    aoMudar: (f) => mudarFinalidadeLote(f as Finalidade),
  });
  const barra = el('div', 'st__barra', rotuloFiltro, finalidadeLote.botao);
  // Dicas fixas da janela (desligadas ao fechar).
  const dicas: Dica[] = [
    ligarDica(rotuloFiltro, DICAS.filtro),
    ligarDica(finalidadeLote.botao, DICAS.lote),
  ];
  const cab = (classe: string, texto: string, dica?: string) =>
    el('th', classe, dica ? alvoDica(texto, dica) : texto);

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
        cab('', 'ST em SE', DICAS.st),
        cab('', 'Segmento e CEST', DICAS.segmento),
        cab('num', 'MVA', DICAS.mva),
        cab('', 'Alíq. interna', DICAS.aliq),
        cab('', 'CFOP', DICAS.cfop),
        cab('', 'Finalidade', DICAS.finalidade),
        cab('', 'Motivo', DICAS.motivo),
      ),
    ),
    corpoTabela,
  );

  // Aplicar: coluna do CFOP (padrão "CFOP de entrada") e, se quiser, da MVA.
  const selCfop = menus.seletor({
    rotulo: 'Gravar o CFOP em',
    opcoes: [],
    valor: '',
    aoMudar: () => {
      opcaoColunas(selMva, COLUNA_MVA_PADRAO, selCfop.valor);
      opcaoColunas(selAliq, COLUNA_ALIQ_PADRAO, selCfop.valor);
      desenharResumo();
    },
  });
  selCfop.botao.id = 'st-coluna-cfop';
  const rotCfop = el('label', 'st__rotulo', 'Gravar o CFOP em');
  rotCfop.htmlFor = selCfop.botao.id;
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
  const selMva = menus.seletor({
    rotulo: 'Coluna da MVA',
    opcoes: [],
    valor: '',
    aoMudar: () => desenharResumo(),
  });
  const comAliq = el('input', '');
  comAliq.type = 'checkbox';
  comAliq.id = 'st-com-aliq';
  const rotAliq = el(
    'label',
    'documentos__opcao',
    comAliq,
    el('span', '', 'Gravar a alíquota interna em'),
  );
  rotAliq.htmlFor = comAliq.id;
  const selAliq = menus.seletor({
    rotulo: 'Coluna da alíquota interna',
    opcoes: [],
    valor: '',
    aoMudar: () => desenharResumo(),
  });
  const resumoAplicar = el('p', 'st__resumo');
  resumoAplicar.setAttribute('role', 'status');
  const erro = el('p', 'painel__erro');
  erro.setAttribute('role', 'alert');
  erro.hidden = true;
  const btnAplicar = botao('botao botao--principal', el('span', '', 'Aplicar'));
  const campoCfopDestino = el('div', 'st__campo', rotCfop, selCfop.botao);
  dicas.push(
    ligarDica(campoCfopDestino, DICAS.gravarCfop),
    ligarDica(rotMva, DICAS.gravarMva),
    ligarDica(rotAliq, DICAS.gravarAliq),
    ligarDica(btnAplicar, DICAS.aplicar),
  );

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
    el(
      'header',
      'painel__cabecalho',
      titulo,
      resumo,
      // X e Esc fecham (menos durante o Aplicar).
      botaoFecharPainel(() => {
        if (!ocupado) fechar();
      }),
    ),
    corpo,
    erro,
    el(
      'footer',
      'painel__rodape st__rodape',
      el(
        'div',
        'st__destino',
        campoCfopDestino,
        campos.mva && el('div', 'st__campo', rotMva, selMva.botao),
        campos.aliquota && el('div', 'st__campo', rotAliq, selAliq.botao),
        resumoAplicar,
      ),
      el('div', 'painel__grupo', btnAplicar),
    ),
    camadaMenus,
  );
  d.setAttribute('aria-labelledby', titulo.id);

  const fechar = () => {
    for (const x of dicas) x.remover();
    menus.fechar();
    if (d.open) d.close();
    d.remove();
  };
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (!ocupado) fechar();
  });

  // ---------- colunas de destino ----------
  function opcaoColunas(sel: Seletor, padrao: string, excluir?: string): void {
    const atual = sel.valor;
    const temPadrao = c.colunasAnotacao.some(
      (col) => col.rotulo.toLowerCase() === padrao.toLowerCase(),
    );
    const opcoes: OpcaoMenu[] = [
      ...(temPadrao
        ? []
        : [{ valor: CRIAR, texto: `Criar a coluna "${padrao}" agora` }]),
      ...c.colunasAnotacao
        .filter((col) => col.id !== excluir)
        .map((col) => ({
          valor: col.id,
          texto: col.visivel ? col.rotulo : `${col.rotulo} (coluna escondida)`,
        })),
    ];
    const preferida =
      c.colunasAnotacao.find(
        (col) => col.rotulo.toLowerCase() === padrao.toLowerCase(),
      )?.id ?? CRIAR;
    sel.definirOpcoes(
      opcoes,
      opcoes.some((o) => o.valor === atual) ? atual : preferida,
    );
  }
  opcaoColunas(selCfop, COLUNA_CFOP_PADRAO);
  opcaoColunas(selMva, COLUNA_MVA_PADRAO, selCfop.valor);
  opcaoColunas(selAliq, COLUNA_ALIQ_PADRAO, selCfop.valor);
  selMva.desabilitado = true;
  selAliq.desabilitado = true;
  comAliq.addEventListener('change', () => {
    selAliq.desabilitado = !comAliq.checked;
    desenharResumo();
  });
  comMva.addEventListener('change', () => {
    selMva.desabilitado = !comMva.checked;
    desenharResumo();
  });

  // ---------- decisões ----------
  async function decidir(
    l: Linha,
    decisao: DecisaoST,
    origem?: 'histórico',
  ): Promise<void> {
    // Mudou só a finalidade ou a MVA: a escolha (e de onde veio) fica.
    l.origem =
      origem ?? (decisao.escolha === l.decisao.escolha ? l.origem : undefined);
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
      historico.delete(chave);
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
        ...(l.origem ? { origem: l.origem } : {}),
      };
      l.guardada = await window.psApi.lembrarDecisao(lembrada);
      if (l.guardada) historico.set(chave, lembrada);
    }
  }

  async function desfazer(l: Linha): Promise<void> {
    await window.psApi.esquecerDecisao(chaveDecisao(cnpj, l.item.cProd));
    historico.delete(chaveDecisao(cnpj, l.item.cProd));
    l.origem = undefined;
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
  const ROTULO_ST: Record<LinhaPrevia['st'], string> = {
    sim: 'Sim',
    nao: 'Não',
    confirmar: 'Confirmar',
  };

  /** MVA com o rótulo, como texto (em Autopeças, sempre a MVA-ST 1). */
  function celulaMva(r: LinhaPrevia): HTMLTableCellElement {
    const textual = r.mva === null && r.mvaTexto !== '-';
    const td = el('td', `num st__mva${textual ? ' st__mva--texto' : ''}`);
    td.append(r.mvaTexto);
    if (r.mvaRotulo) td.append(el('span', 'st__cest', r.mvaRotulo));
    return td;
  }

  function linhaTabela(l: Linha, r: LinhaPrevia): HTMLTableRowElement[] {
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
    // NCM 2710/3403 fora da planilha, com o Apêndice XIV carregado: a pessoa
    // diz se é lubrificante. "Sim" pergunta se é derivado ou não derivado de
    // petróleo (a MVA vem da coluna do grupo); "Não" é sem ST.
    if (!podeEscolher && a.apendiceXIV && a.apendiceXIV.length > 0) {
      const esc = l.decisao.escolha;
      const selAp = menus.seletor({
        rotulo: `Apêndice XIV do item ${n}`,
        opcoes: [
          { valor: 'sim', texto: 'Apêndice XIV: Sim' },
          { valor: 'nao', texto: 'Apêndice XIV: Não' },
        ],
        valor:
          confirmando === n || esc?.tipo === 'apendice-xiv'
            ? 'sim'
            : esc?.tipo === 'sem-st'
              ? 'nao'
              : '',
        vazio: 'Apêndice XIV: Sim / Não',
        classe: 'seletor-menu--pequeno st__apendice',
        aoMudar: (v) => {
          if (v === 'nao') {
            confirmando = null;
            void acao(`apendice-${n}`, () =>
              decidir(l, { ...l.decisao, escolha: { tipo: 'sem-st' } }),
            );
            return;
          }
          confirmando = n;
          desenhar();
          d.querySelector<HTMLElement>(`[data-foco="escolha-${n}"]`)?.focus();
        },
      });
      selAp.botao.dataset.foco = `apendice-${n}`;
      selAp.botao.title =
        'Sim: diga se é derivado ou não derivado de petróleo (a MVA vem do Apêndice XIV). Não: sem ST.';
      celulaSt.append(selAp.botao);
    }

    const selFin = menus.seletor({
      rotulo: `Finalidade do item ${n}`,
      opcoes: OPCOES_FINALIDADE,
      valor: l.decisao.finalidade,
      classe: 'seletor-menu--pequeno',
      aoMudar: (f) =>
        void acao(`finalidade-${n}`, () =>
          decidir(l, { ...l.decisao, finalidade: f as Finalidade }),
        ),
    });
    selFin.botao.dataset.foco = `finalidade-${n}`;

    const marcaDecisao =
      (l.lembrada || l.guardada) &&
      el(
        'span',
        'st__lembrado',
        l.lembrada
          ? (() => {
              const selo = alvoDica('lembrado', DICAS.lembrado);
              selo.classList.add('st__etiqueta');
              return selo;
            })()
          : el('span', 'st__etiqueta', 'guardado'),
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

    // "segmento X lido com problemas" na cor do "confirmar"; observações em
    // itálico (protocolo, alíquota a confirmar), sem mudar o CFOP.
    const motivoEhSegmento = r.segmentoProblema === r.motivo;
    const motivo = el(
      'td',
      'st__motivo',
      el('span', motivoEhSegmento ? 'st__motivo-confirmar' : '', r.motivo),
      !motivoEhSegmento &&
        r.segmentoProblema &&
        el('span', 'st__motivo-confirmar', r.segmentoProblema),
      marcaDecisao,
      ...r.observacoesTipi.map((o) => el('span', 'st__obs', `TIPI: ${o}`)),
      ...r.observacoes.map((o) => el('span', 'st__obs', o)),
      ...avisosAutomotiva(a).map((f) =>
        el('span', 'st__obs st__nota-info', `Na nota: "${f}"`),
      ),
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
        r.segmento ??
          (r.st === 'nao' || r.manual
            ? '-'
            : a.candidatos.length === 0 && a.apendiceXIV
              ? 'Apêndice XIV'
              : `${a.candidatos.length} opções`),
        r.cest && el('span', 'st__cest', `CEST ${r.cest}`),
      ),
      celulaMva(r),
      el(
        'td',
        `st__aliq${r.aliquotaConfirmar ? ' st__aliq--confirmar' : ''}`,
        r.aliquotaTexto,
      ),
      el('td', 'st__cfop', r.cfop ?? '-'),
      el('td', '', selFin.botao),
      motivo,
    );
    const filas = [tr];
    if (confirmando === n) filas.push(escolhaCandidatos(l, r));
    return filas;
  }

  /** Lista de candidatos (e "sem ST") para a pessoa escolher, com o motivo à vista. */
  function escolhaCandidatos(l: Linha, r: LinhaPrevia): HTMLTableRowElement {
    const n = l.item.nItem;
    const a = analises.get(n)!;
    const nome = `st-escolha-${n}`;
    const atual = l.decisao.escolha;
    const apendice = a.candidatos.length === 0 ? (a.apendiceXIV ?? []) : [];
    const pct = (v: number | null) =>
      v === null
        ? '-'
        : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
    const retido = stRetidoNaNota(l.item);
    // "Sem ST" pré-marcado só sem escolha feita e quando nada liga o produto às linhas.
    const sugerido =
      !apendice.length && atual === null && sugerirSemST(a, retido);
    const explicacao = apendice.length ? null : explicacaoItem(a, retido);
    // Pelo histórico do NCM: só sem escolha própria; nunca pré-marcada.
    const hist =
      atual === null
        ? sugestaoHistorico(
            a,
            [...historico.values()],
            chaveDecisao(cnpj, l.item.cProd),
          )
        : null;
    // Histórico e "Sem ST" apontam o mesmo: uma só opção, com as duas razões.
    const juntos =
      hist?.tipo === 'sugere' && hist.escolha.tipo === 'sem-st' && sugerido;
    const blocoHistorico =
      hist &&
      (() => {
        if (hist.tipo === 'dividido')
          return el('p', 'st__historico st__historico--dividido', hist.texto);
        const usarHist = botao(
          'botao botao--claro botao--pequeno',
          el('span', '', 'Usar'),
        );
        usarHist.dataset.foco = `historico-${n}`;
        usarHist.addEventListener('click', () => {
          mostrarErro(null);
          confirmando = null;
          void acao(`finalidade-${n}`, () =>
            decidir(l, { ...l.decisao, escolha: hist.escolha }, 'histórico'),
          );
        });
        return el(
          'div',
          'st__historico',
          el(
            'p',
            'st__historico-texto',
            hist.texto,
            juntos &&
              el(
                'span',
                'st__sugerido',
                'Sugerido também porque o produto não parece ser nenhuma das linhas.',
              ),
          ),
          usarHist,
        );
      })();
    const opcoes: { valor: EscolhaST; rotulo: HTMLElement }[] = apendice.length
      ? apendice.map((cand) => ({
          valor: {
            tipo: 'apendice-xiv' as const,
            lubrificante: cand.lubrificante ?? 'derivado',
          },
          rotulo: el(
            'span',
            'st__opcao-texto',
            el('strong', '', cand.descricao),
            ` (${cand.segmentoOficial})`,
            el(
              'span',
              'st__cest',
              ` MVA ${pct(cand.mvas[0]?.valor ?? null)} (${cand.colunaApendice ?? '-'})`,
            ),
          ),
        }))
      : [
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
              sugerido &&
                !juntos &&
                el(
                  'span',
                  'st__sugerido',
                  'Sugerido: o produto não parece ser nenhuma das linhas',
                ),
            ),
          },
          {
            valor: { tipo: 'manual', cfop: '', mva: null, motivo: '' },
            rotulo: el(
              'span',
              'st__opcao-texto',
              el('strong', '', 'Outro'),
              ' Informar o CFOP (e a MVA, se houver) com o motivo.',
            ),
          },
        ];
    const igual = (x: EscolhaST, y: EscolhaST) =>
      x.tipo === y.tipo &&
      (x.tipo === 'sem-st' ||
        x.tipo === 'manual' ||
        (x.tipo === 'apendice-xiv'
          ? x.lubrificante === (y as typeof x).lubrificante
          : x.linhaPlanilha === (y as typeof x).linhaPlanilha &&
            x.segmento === (y as typeof x).segmento));
    const radios = opcoes.map((o, i) => {
      const r2 = el('input', '');
      r2.type = 'radio';
      r2.name = nome;
      r2.id = `${nome}-${i}`;
      r2.checked =
        atual !== null
          ? igual(o.valor, atual)
          : sugerido && o.valor.tipo === 'sem-st';
      if (i === 0) r2.dataset.foco = `escolha-${n}`;
      const lbl = el('label', 'st__opcao', r2, o.rotulo);
      lbl.htmlFor = r2.id;
      return { r2, lbl, valor: o.valor };
    });
    // Campos da opção "Outro": digitar num deles marca a opção.
    const manualAtual = atual?.tipo === 'manual' ? atual : null;
    const radioOutro = radios.find((x) => x.valor.tipo === 'manual');
    const campo = (
      id: string,
      rotulo: string,
      valor: string,
      dica: string,
      largura: string,
    ) => {
      const input = el('input', `st__manual-campo ${largura}`);
      input.type = 'text';
      input.id = `${nome}-${id}`;
      input.value = valor;
      input.placeholder = dica;
      input.autocomplete = 'off';
      input.addEventListener('input', () => {
        if (radioOutro) radioOutro.r2.checked = true;
        // Corrigindo o campo: o aviso de antes some.
        mostrarErro(null);
      });
      const lbl = el('label', 'st__manual-rotulo', rotulo);
      lbl.htmlFor = input.id;
      return { input, bloco: el('div', 'st__manual-item', lbl, input) };
    };
    const pctManual = (v: number | null) =>
      v === null
        ? ''
        : (Math.round(v * 10000) / 100).toLocaleString('pt-BR', {
            maximumFractionDigits: 2,
          });
    const campoCfop = campo(
      'cfop',
      'CFOP',
      manualAtual?.cfop ?? '',
      'ex. 2102',
      'st__manual-curto',
    );
    campoCfop.input.inputMode = 'numeric';
    campoCfop.input.maxLength = 5;
    const campoMva = campo(
      'mva',
      'MVA % (opcional)',
      pctManual(manualAtual?.mva ?? null),
      'ex. 56,94',
      'st__manual-curto',
    );
    campoMva.input.inputMode = 'decimal';
    const campoMotivo = campo(
      'motivo',
      'Motivo',
      manualAtual?.motivo ?? '',
      'Obrigatório: por que este CFOP',
      'st__manual-longo',
    );
    const camposManual = el(
      'div',
      'st__manual',
      campoCfop.bloco,
      campoMva.bloco,
      campoMotivo.bloco,
    );
    camposManual.setAttribute('role', 'group');
    camposManual.setAttribute('aria-label', 'CFOP manual');
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
        mostrarErro(
          apendice.length
            ? 'Escolha: derivado ou não derivado de petróleo.'
            : 'Escolha uma linha da planilha, "Sem ST" ou "Outro".',
        );
        return;
      }
      let escolha = marcada.valor;
      if (escolha.tipo === 'manual') {
        const lido = lerCfopManual({
          cfop: campoCfop.input.value,
          mva: campoMva.input.value,
          motivo: campoMotivo.input.value,
        });
        if (!lido.ok) {
          mostrarErro(lido.erro);
          ({ cfop: campoCfop, mva: campoMva, motivo: campoMotivo })[
            lido.campo
          ].input.focus();
          return;
        }
        escolha = lido.escolha;
      }
      mostrarErro(null);
      confirmando = null;
      void acao(`finalidade-${n}`, () => decidir(l, { ...l.decisao, escolha }));
    });
    voltar.addEventListener('click', () => {
      confirmando = null;
      desenhar();
      d.querySelector<HTMLElement>(
        `[data-foco="${apendice.length ? 'apendice' : 'confirmar'}-${n}"]`,
      )?.focus();
    });
    const grupo = el(
      'fieldset',
      'st__escolha',
      el(
        'legend',
        '',
        apendice.length
          ? `Item ${n}: o lubrificante é derivado de petróleo?`
          : `Item ${n}: qual linha da planilha vale?`,
      ),
      blocoHistorico,
      explicacao?.linhaTipi && el('p', 'st__tipi', explicacao.linhaTipi),
      explicacao && el('p', 'st__explicacao', explicacao.texto),
      // Por que a busca no Excel acha mais linhas do que as opções abaixo.
      !apendice.length &&
        a.outrasLinhas &&
        el(
          'p',
          'st__explicacao st__outras-linhas',
          textoOutrasLinhas(a.outrasLinhas),
        ),
      ...avisosAutomotiva(a).map((f) =>
        el('p', 'st__explicacao st__nota-info', textoForaLinhaAutomotiva(f)),
      ),
      apendice.length > 0 &&
        el('p', 'st__explicacao', `${RESSALVA_APENDICE_XIV}.`),
      el('ul', 'st__motivos', ...r.detalhes.map((m) => el('li', '', m))),
      ...radios.map((x) => x.lbl),
      !apendice.length && camposManual,
      el('div', 'documento__acoes', usar, voltar),
    );
    return el(
      'tr',
      'st__linha-escolha',
      el('td', '', ''),
      (() => {
        const td = el('td', '', grupo);
        td.colSpan = 10;
        return td;
      })(),
    );
  }

  function desenharBarra(): void {
    finalidadeLote.desabilitado = marcados.size === 0;
    finalidadeLote.definirOpcoes(OPCOES_FINALIDADE, '');
    finalidadeLote.botao.querySelector('.seletor-menu__texto')!.textContent =
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
    const destino = selCfop.valor;
    resumoAplicar.textContent =
      `${comCfop} de ${resolvidos.length} itens com CFOP para gravar` +
      (semCfop > 0
        ? `; ${semCfop} sem CFOP (precisam de você) ficam como estão.`
        : '.');
    // O porquê de estar desligado já está no resumo ao lado; a dica é fixa.
    btnAplicar.disabled = !destino || comCfop === 0;
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
              td.colSpan = 11;
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
  function mudarFinalidadeLote(f: Finalidade): void {
    const alvos = linhas.filter((l) => marcados.has(l.item.nItem));
    void acao(null, async () => {
      for (const l of alvos) await decidir(l, { ...l.decisao, finalidade: f });
    });
  }

  // ---------- aplicar ----------
  async function colunaDe(
    sel: Seletor,
    padrao: string,
  ): Promise<string | null> {
    if (sel.valor !== CRIAR) return sel.valor || null;
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
        const criarCfop = selCfop.valor === CRIAR;
        const colCfop = await colunaDe(selCfop, COLUNA_CFOP_PADRAO);
        if (!colCfop) return;
        const querMva = campos.mva && comMva.checked;
        const colMva = querMva
          ? await colunaDe(selMva, COLUNA_MVA_PADRAO)
          : null;
        if (querMva && !colMva) return;
        const querAliq = campos.aliquota && comAliq.checked;
        const colAliq = querAliq
          ? await colunaDe(selAliq, COLUNA_ALIQ_PADRAO)
          : null;
        if (querAliq && !colAliq) return;
        const rotuloDe = (id: string, padrao: string) =>
          c.colunasAnotacao.find((col) => col.id === id)?.rotulo ?? padrao;
        const resolvidos = linhas.map(resolver);
        const plano = planoDoAplicar(
          resolvidos,
          c.anotacoes,
          { cfop: colCfop, mva: colMva, aliquota: colAliq },
          campos,
        );
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
            : `${gravadas} ${gravadas === 1 ? 'anotação gravada' : 'anotações gravadas'} (${nomeCfop}${criarCfop ? ', coluna criada' : ''}${colMva ? `, ${rotuloDe(colMva, COLUNA_MVA_PADRAO)}` : ''}${colAliq ? `, ${rotuloDe(colAliq, COLUNA_ALIQ_PADRAO)}` : ''}). Salve para guardar no .psxml.`,
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
    vBCST: i.vBCST ?? '',
    vST: i.vST ?? '',
    CFOP: i.CFOP,
    cstIPI: i.cstIPI ?? '',
    pIPI: i.pIPI ?? '',
  }));
}
