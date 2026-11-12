// Tela de Configurações, dentro da janela, no mesmo padrão da área de
// Documentos (cabeça preta com o filete amarelo, corpo bege, cartões
// brancos, X no canto do cabeçalho). Abre pela engrenagem da barra preta (tela
// inicial e tela da nota). Abas à esquerda:
//   Geral                  pasta de destino, CNPJ da empresa, dias dos
//                          avisos, verificação online
//   Perfis e colunas       os perfis e o editor de colunas (src/editorColunas.ts)
//   Ferramentas            por perfil: ordem, quais aparecem e os campos do
//                          rodapé da "ST, MVA e CFOP" (src/nfe/ferramentasPerfil.ts)
//   Documentos de referência  a área de antes (src/areaDocumentos.ts)
//   Decisões lembradas     busca, filtro por tipo e apagar (src/filtroDecisoes.ts)
//   Dados do app           o que o app guarda, a pasta, o backup (src/dadosApp.ts)
// Tudo passa pelo processo principal (src/main.ts, src/documentos.ts).

import {
  definirAberturaDocumentos,
  montarAreaDocumentos,
  type OpcoesAreaDocumentos,
} from './areaDocumentos';
import { botao, botaoFecharPainel, el, icone } from './dom';
import { chaveDecisao, type DecisaoLembrada } from './fiscal/entrada';
import {
  contagemPorTipo,
  filtrarDecisoes,
  ROTULO_TIPO_DECISAO,
  textoDecisao,
  TIPOS_DECISAO,
  type TipoDecisao,
} from './filtroDecisoes';
import { ICONES } from './icones';
import { criarMenuEscolha } from './menuEscolha';
import {
  FERRAMENTAS_PAINEL,
  ID_FERRAMENTA_ST,
  moverFerramenta,
  ROTULO_ABRIR_EM,
  ROTULO_CAMPO_ST,
  type AbrirNotasEm,
  type CamposST,
  type FerramentasPerfil,
} from './nfe/ferramentasPerfil';

export const ABAS_CONFIG = [
  'geral',
  'perfis',
  'ferramentas',
  'documentos',
  'decisoes',
  'dados',
] as const;
export type AbaConfig = (typeof ABAS_CONFIG)[number];

const ROTULO_ABA: Record<AbaConfig, string> = {
  geral: 'Geral',
  perfis: 'Perfis e colunas',
  ferramentas: 'Ferramentas',
  documentos: 'Documentos de referência',
  decisoes: 'Decisões lembradas',
  dados: 'Dados do app',
};

/** O que a tela pede ao renderer (pasta de destino, editor de colunas). */
export interface AcoesConfiguracoes {
  /** Abre o editor de colunas que já existe, por cima das Configurações. */
  editarColunas(): void;
  /** O seletor de pasta do app; devolve a pasta escolhida (ou null). */
  escolherPasta(): Promise<string | null>;
}

let acoes: AcoesConfiguracoes | null = null;
let dialogo: HTMLDialogElement | null = null;
let irPara: ((aba: AbaConfig, docs?: OpcoesAreaDocumentos) => void) | null =
  null;
let redesenharAba: (() => void) | null = null;

export function ligarConfiguracoes(a: AcoesConfiguracoes): void {
  acoes = a;
}

export function configuracoesAbertas(): boolean {
  return dialogo?.open === true;
}

/**
 * Algo mudou fora (outra janela, importação, perfis): a aba aberta se
 * redesenha. A aba Documentos se atualiza sozinha (atualizarAreaDocumentos).
 */
export function atualizarConfiguracoes(): void {
  redesenharAba?.();
}

// O caminho antigo dos Documentos (pastilha, tela inicial, painel) abre aqui.
definirAberturaDocumentos((o) => abrirConfiguracoes('documentos', o));

const dataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const data = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
};

export const tamanho = (bytes: number) =>
  bytes < 1024
    ? `${bytes.toLocaleString('pt-BR')} bytes`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`
      : `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

const formatarCnpj = (d: string) =>
  d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : d;

/** Cartão branco com título de seção. */
function cartao(
  titulo: string,
  ...filhos: (Node | false | null)[]
): HTMLElement {
  return el(
    'section',
    'config__cartao',
    el('h3', 'painel__subtitulo', titulo),
    ...filhos,
  );
}

/** Caixa de marcar com o rótulo ao lado. */
function marcar(
  id: string,
  texto: string,
  marcado: boolean,
  aoMudar: (v: boolean) => void,
  interruptor = false,
): HTMLLabelElement {
  const c = el('input', interruptor ? 'documentos__chave' : '');
  c.type = 'checkbox';
  c.id = id;
  c.checked = marcado;
  if (interruptor) c.setAttribute('role', 'switch');
  c.addEventListener('change', () => aoMudar(c.checked));
  const l = el('label', 'documentos__opcao', c, el('span', '', texto));
  l.htmlFor = id;
  return l;
}

export function abrirConfiguracoes(
  aba: AbaConfig = 'geral',
  docs?: OpcoesAreaDocumentos,
): void {
  if (configuracoesAbertas()) {
    irPara?.(aba, docs);
    return;
  }
  const titulo = el('h2', 'painel__titulo', 'Configurações');
  titulo.id = 'config-titulo';
  const status = el('p', 'painel__status');
  status.setAttribute('role', 'status');
  const abas = el('div', 'config__abas');
  abas.setAttribute('role', 'tablist');
  abas.setAttribute('aria-orientation', 'vertical');
  abas.setAttribute('aria-label', 'Configurações');
  const conteudo = el('div', 'config__conteudo');
  conteudo.setAttribute('role', 'tabpanel');
  conteudo.tabIndex = -1;
  const d = el(
    'dialog',
    'painel painel--config',
    el(
      'header',
      'painel__cabecalho',
      titulo,
      el(
        'p',
        'painel__dica',
        'Ajustes do PS Reader neste computador: pasta, empresa, perfis, ferramentas, documentos, decisões e os dados guardados.',
      ),
      botaoFecharPainel(() => fechar()),
    ),
    el('div', 'config__corpo', abas, conteudo),
    el('footer', 'painel__rodape', status),
  );
  d.setAttribute('aria-labelledby', titulo.id);
  dialogo = d;

  let atual: AbaConfig = aba;
  let desmontar: (() => void) | null = null;

  const botoesAba = new Map<AbaConfig, HTMLButtonElement>();
  for (const a of ABAS_CONFIG) {
    const b = botao('config__aba', el('span', '', ROTULO_ABA[a]));
    b.id = `config-aba-${a}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', 'config-conteudo');
    // O foco segue a aba clicada (com o mouse, sem o contorno de foco, que
    // só aparece pelo teclado: :focus-visible).
    b.addEventListener('click', () => {
      mostrar(a);
      b.focus({ preventScroll: true });
    });
    botoesAba.set(a, b);
    abas.append(b);
  }
  conteudo.id = 'config-conteudo';
  abas.addEventListener('keydown', (e) => {
    const lista = [...botoesAba.values()];
    const i = lista.indexOf(document.activeElement as HTMLButtonElement);
    let j: number | null = null;
    if (e.key === 'ArrowDown') j = (i + 1) % lista.length;
    else if (e.key === 'ArrowUp') j = (i - 1 + lista.length) % lista.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = lista.length - 1;
    if (j === null) return;
    e.preventDefault();
    lista[j].focus();
    mostrar(ABAS_CONFIG[j]);
  });

  const fechar = () => {
    desmontar?.();
    desmontar = null;
    redesenharAba = null;
    irPara = null;
    if (d.open) d.close();
    d.remove();
    dialogo = null;
  };
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    fechar();
  });

  function mostrar(a: AbaConfig, docsAba?: OpcoesAreaDocumentos): void {
    desmontar?.();
    desmontar = null;
    redesenharAba = null;
    atual = a;
    status.textContent = '';
    for (const [x, b] of botoesAba) {
      b.setAttribute('aria-selected', String(x === a));
      b.tabIndex = x === a ? 0 : -1;
    }
    conteudo.setAttribute('aria-labelledby', `config-aba-${a}`);
    conteudo.dataset.aba = a;
    const area = el('div', 'config__area');
    conteudo.replaceChildren(area);
    conteudo.scrollTop = 0;
    const h = { area, status };
    if (a === 'geral') abaGeral(h);
    else if (a === 'perfis') abaPerfis(h);
    else if (a === 'ferramentas') abaFerramentas(h);
    else if (a === 'documentos')
      desmontar = montarAreaDocumentos(
        {
          corpo: area,
          status,
          irParaDecisoes: () => {
            mostrar('decisoes');
            botoesAba.get('decisoes')?.focus({ preventScroll: true });
          },
        },
        docsAba,
      );
    else if (a === 'decisoes') abaDecisoes(h);
    else abaDados(h);
  }
  irPara = (a, o) => {
    if (a !== atual || o) mostrar(a, o);
    botoesAba.get(a)?.focus();
  };

  document.body.append(d);
  d.showModal();
  mostrar(aba, docs);
  // Ao abrir, o foco vai para o conteúdo (sem contorno): nenhuma aba fica
  // com o contorno de foco parado. Tab e Shift+Tab seguem dali. Aberta no
  // cartão de um documento (pastilha ST/TIPI), a área leva o foco ao cartão
  // quando ele chegar.
  conteudo.focus({ preventScroll: true });
}

interface Hospede {
  area: HTMLElement;
  status: HTMLElement;
}

/** Erro dentro da aba (vermelho, some na próxima ação). */
function caixaErro(): HTMLParagraphElement {
  const p = el('p', 'painel__erro config__erro');
  p.setAttribute('role', 'alert');
  p.hidden = true;
  return p;
}

function mostrarErro(p: HTMLElement, texto: string | null): void {
  p.textContent = texto ?? '';
  p.hidden = !texto;
}

// ---------- Geral ----------

function abaGeral({ area, status }: Hospede): void {
  let vivo = true;
  const erroPasta = caixaErro();
  const erroAvisos = caixaErro();
  const caminho = el('p', 'config__caminho');
  const sessao = el(
    'p',
    'documento__nota',
    'Só nesta janela vale a pasta do arquivo aberto; a pasta salva abaixo volta quando ela fechar.',
  );
  sessao.hidden = true;
  const trocar = botao(
    'botao botao--claro botao--pequeno',
    icone(...ICONES.pastaTrocar),
    el('span', '', 'Trocar pasta...'),
  );
  const abrir = botao(
    'botao botao--claro botao--pequeno',
    icone(...ICONES.pastaAberta),
    el('span', '', 'Abrir pasta no Explorer'),
  );
  const desenharPasta = (p: PastaDestino) => {
    caminho.textContent = p.caminho ?? 'Nenhuma pasta escolhida ainda.';
    caminho.classList.toggle('config__caminho--vazio', !p.caminho);
    sessao.hidden = !p.sessao;
    abrir.disabled = !p.caminho;
  };
  trocar.addEventListener('click', () => {
    mostrarErro(erroPasta, null);
    void acoes?.escolherPasta().then((pasta) => {
      if (pasta) {
        status.textContent = `Pasta de destino: ${pasta}`;
        desenharPasta({ caminho: pasta, sessao: false });
      }
    });
  });
  abrir.addEventListener('click', () => {
    mostrarErro(erroPasta, null);
    void window.psApi.abrirPastaDestino().then((r) => {
      if (r.status === 'erro') mostrarErro(erroPasta, r.mensagem);
    });
  });

  // Empresa e avisos
  const cnpj = el('input', 'config__entrada config__campo-cnpj');
  cnpj.id = 'config-cnpj';
  cnpj.inputMode = 'numeric';
  cnpj.autocomplete = 'off';
  cnpj.maxLength = 18;
  const diasVenc = el('input', 'config__entrada config__campo-dias');
  diasVenc.id = 'config-dias-vencimento';
  diasVenc.type = 'number';
  diasVenc.min = '0';
  diasVenc.max = '3650';
  const diasAntiga = el('input', 'config__entrada config__campo-dias');
  diasAntiga.id = 'config-dias-antiga';
  diasAntiga.type = 'number';
  diasAntiga.min = '0';
  diasAntiga.max = '3650';
  const salvar = botao(
    'botao botao--principal botao--pequeno',
    el('span', '', 'Salvar'),
  );
  const campo = (input: HTMLInputElement, rotulo: string, ajuda: string) => {
    const l = el('label', 'config__rotulo', rotulo);
    l.htmlFor = input.id;
    const a = el('span', 'config__ajuda', ajuda);
    a.id = `${input.id}-ajuda`;
    input.setAttribute('aria-describedby', a.id);
    return el('div', 'config__campo', l, input, a);
  };
  const preencher = (c: ConfigAvisos) => {
    cnpj.value = formatarCnpj(c.cnpjEmpresa);
    diasVenc.value = String(c.diasAvisoVencimento);
    diasAntiga.value = String(c.diasNotaAntiga);
  };
  const numero = (v: string) => (v.trim() === '' ? NaN : Number(v));
  salvar.addEventListener('click', () => {
    mostrarErro(erroAvisos, null);
    salvar.disabled = true;
    void window.psApi
      .gravarConfigAvisos({
        cnpjEmpresa: cnpj.value,
        diasAvisoVencimento: numero(diasVenc.value),
        diasNotaAntiga: numero(diasAntiga.value),
      })
      .then((r) => {
        if (r.status === 'erro') mostrarErro(erroAvisos, r.mensagem);
        else {
          preencher(r.config);
          status.textContent = 'Empresa e avisos salvos.';
        }
      })
      .finally(() => {
        salvar.disabled = false;
      });
  });

  const online = el('div', 'config__online');
  const desenharOnline = (p: PreferenciasDocumentos) => {
    online.replaceChildren(
      marcar(
        'config-online',
        'Verificação online de documentos',
        p.verificacaoOnline,
        (v) => {
          void window.psApi
            .gravarPreferenciasDocumentos({ verificacaoOnline: v })
            .then((e) => {
              desenharOnline(e.preferencias);
              status.textContent = v
                ? 'Verificação online ligada.'
                : 'Verificação online desligada: o app não acessa a internet.';
              online.querySelector<HTMLElement>('#config-online')?.focus();
            });
        },
        true,
      ),
      el(
        'p',
        'documento__nota',
        p.verificacaoOnline
          ? 'Ligada: o app consulta a página do CONFAZ (planilha de ST) e o site da Receita (TIPI) só quando você pede, ou ao abrir o app se marcar a opção abaixo.'
          : 'Desligada: o app nunca acessa a internet.',
      ),
      p.verificacaoOnline
        ? marcar(
            'config-ao-abrir',
            'Verificar ao abrir o app',
            p.verificarAoAbrir,
            (v) =>
              void window.psApi
                .gravarPreferenciasDocumentos({ verificarAoAbrir: v })
                .then((e) => desenharOnline(e.preferencias)),
          )
        : '',
    );
  };

  area.replaceChildren(
    cartao(
      'Pasta de destino',
      el(
        'p',
        'documento__nota',
        'Onde o Salvar grava o PDF e a cópia editada (.psxml). É a mesma pasta da pastilha "Salvando em" da barra.',
      ),
      caminho,
      sessao,
      el('div', 'documento__acoes', trocar, abrir),
      erroPasta,
    ),
    cartao(
      'Empresa e avisos da nota',
      el(
        'div',
        'config__campos',
        campo(
          cnpj,
          'CNPJ da empresa',
          'O destinatário esperado das notas. Nota para outro CNPJ ganha aviso. Vazio volta ao padrão.',
        ),
        campo(
          diasVenc,
          'Aviso de vencimento (dias)',
          'Parcela que vence em até tantos dias ganha aviso leve. Padrão: 15.',
        ),
        campo(
          diasAntiga,
          'Nota antiga (dias)',
          'Nota emitida há mais que tantos dias ganha aviso leve. Padrão: 30.',
        ),
      ),
      el('div', 'documento__acoes', salvar),
      erroAvisos,
    ),
    cartao('Verificação online', online),
  );

  const carregar = () => {
    void Promise.all([
      window.psApi.pastaDestino(),
      window.psApi.configAvisos(),
      window.psApi.documentos(),
    ]).then(([p, c, e]) => {
      if (!vivo || !area.isConnected) return;
      desenharPasta(p);
      if (document.activeElement?.closest('.config__campos') == null)
        preencher(c);
      desenharOnline(e.preferencias);
    });
  };
  carregar();
  redesenharAba = () => {
    if (!area.isConnected) {
      vivo = false;
      return;
    }
    carregar();
  };
}

// ---------- Perfis e colunas ----------

function abaPerfis({ area }: Hospede): void {
  const lista = el('ul', 'config__perfis');
  const abrir = botao(
    'botao botao--principal',
    icone(...ICONES.colunas),
    el('span', '', 'Abrir o editor de colunas'),
  );
  abrir.addEventListener('click', () => acoes?.editarColunas());
  area.replaceChildren(
    cartao(
      'Perfis e colunas',
      el(
        'p',
        'documento__nota',
        'Cada perfil guarda as colunas da tabela de itens, as anotações extras, a orientação da folha e o layout. O perfil em uso vale para o app inteiro e troca pela pastilha "Perfil" da barra.',
      ),
      lista,
      el(
        'p',
        'documento__nota',
        'No editor: mostrar, esconder e ordenar colunas, criar anotações, e criar, renomear, exportar, importar ou excluir perfis.',
      ),
      el('div', 'documento__acoes', abrir),
    ),
  );
  const carregar = () =>
    void window.psApi.perfis().then((e) => {
      lista.replaceChildren(
        ...e.lista.map((p) =>
          el(
            'li',
            `config__perfil${p.id === e.ativo ? ' config__perfil--ativo' : ''}`,
            el('span', 'config__perfil-nome', p.nome),
            p.id === e.ativo && el('span', 'config__selo', 'em uso'),
          ),
        ),
      );
    });
  carregar();
  redesenharAba = carregar;
}

// ---------- Ferramentas ----------

function abaFerramentas({ area, status }: Hospede): void {
  let estado: EstadoFerramentas | null = null;
  let perfilId: string | null = null;
  const erro = caixaErro();
  // Seletor de perfil no menu do app (o mesmo da ferramenta ST e do perfil
  // rápido): teclado de navegarMenu e ✓ na opção ativa.
  const camadaMenus = el('div', 'config__menus');
  const menus = criarMenuEscolha(camadaMenus);
  const seletor = menus.seletor({
    rotulo: 'Perfil das ferramentas',
    opcoes: [],
    valor: '',
    classe: 'config__seletor',
    semDica: true,
    aoMudar: (v) => {
      perfilId = v;
      status.textContent = '';
      desenhar();
    },
  });
  seletor.botao.id = 'config-ferramentas-perfil';
  const rotuloSeletor = el('label', 'config__rotulo', 'Perfil');
  rotuloSeletor.htmlFor = seletor.botao.id;
  const lista = el('ul', 'colunas-lista config__ferramentas');
  lista.setAttribute('aria-label', 'Ferramentas do painel, na ordem');
  const campos = el('div', 'config__campos-st');
  const abrirEm = el('div', 'config__abrir-em');

  const atualFerr = (): FerramentasPerfil | null =>
    estado?.lista.find((p) => p.id === perfilId)?.ferramentas ?? null;

  async function gravar(
    f: FerramentasPerfil,
    mensagem: string,
    foco?: string,
  ): Promise<void> {
    if (!perfilId) return;
    mostrarErro(erro, null);
    // Mostra já; o que voltar do processo principal confirma.
    const item = estado?.lista.find((p) => p.id === perfilId);
    if (item) item.ferramentas = f;
    desenhar(foco);
    const r = await window.psApi.gravarFerramentasPerfil(perfilId, f);
    if (r.status === 'erro') {
      mostrarErro(erro, r.mensagem);
      return;
    }
    estado = r.estado;
    status.textContent = mensagem;
    desenhar(foco);
  }

  function linha(
    f: FerramentasPerfil,
    id: string,
    visivel: boolean,
  ): HTMLLIElement {
    const info = FERRAMENTAS_PAINEL.find((x) => x.id === id)!;
    const marca = el('input', 'colunas-lista__marca');
    marca.type = 'checkbox';
    marca.checked = visivel;
    marca.id = `config-ferramenta-${id}`;
    marca.dataset.foco = `marca-${id}`;
    marca.addEventListener('change', () => {
      const nova: FerramentasPerfil = {
        ordem: f.ordem.map((x) =>
          x.id === id ? { ...x, visivel: marca.checked } : { ...x },
        ),
        camposST: { ...f.camposST },
        abrirEm: f.abrirEm,
      };
      void gravar(
        nova,
        `${info.titulo}: ${marca.checked ? 'aparece' : 'oculta'} no painel.`,
        `marca-${id}`,
      );
    });
    const rotulo = el(
      'label',
      'colunas-lista__rotulo config__ferramenta-rotulo',
      el('span', 'config__ferramenta-titulo', info.titulo),
      el('span', 'config__ajuda', info.descricao),
    );
    rotulo.htmlFor = marca.id;
    const alca = botao(
      'colunas-lista__alca',
      icone(
        'M9 6h.01',
        'M15 6h.01',
        'M9 12h.01',
        'M15 12h.01',
        'M9 18h.01',
        'M15 18h.01',
      ),
    );
    alca.setAttribute(
      'aria-label',
      `Mover ${info.titulo}. Use as setas para cima e para baixo.`,
    );
    alca.dataset.foco = `alca-${id}`;
    alca.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? -1 : 1;
      const i = f.ordem.findIndex((x) => x.id === id);
      if (i + delta < 0 || i + delta >= f.ordem.length) return;
      void gravar(
        moverFerramenta(f, id, delta),
        `${info.titulo} ${delta < 0 ? 'subiu' : 'desceu'} na ordem.`,
        `alca-${id}`,
      );
    });
    const li = el('li', 'colunas-lista__item', alca, marca, rotulo);
    li.dataset.id = id;
    alca.addEventListener('pointerdown', (e) => arrastar(e, li));
    return li;
  }

  /** Arrastar pela alça, como no editor de colunas. */
  function arrastar(e: PointerEvent, li: HTMLLIElement): void {
    if (e.button !== 0) return;
    e.preventDefault();
    lista.setPointerCapture(e.pointerId);
    li.classList.add('colunas-lista__item--arrastando');
    let inicioY = e.clientY;
    const r = (x: Element) => x.getBoundingClientRect();
    const meio = (x: Element) => r(x).top + r(x).height / 2;
    const mover = (ev: PointerEvent) => {
      li.style.transform = `translateY(${ev.clientY - inicioY}px)`;
      for (;;) {
        const anterior = li.previousElementSibling;
        const proxima = li.nextElementSibling;
        const antes = r(li).top;
        if (anterior && meio(li) < meio(anterior))
          lista.insertBefore(li, anterior);
        else if (proxima && meio(li) > meio(proxima))
          lista.insertBefore(proxima, li);
        else return;
        inicioY += r(li).top - antes;
        li.style.transform = `translateY(${ev.clientY - inicioY}px)`;
      }
    };
    const soltar = () => {
      lista.removeEventListener('pointermove', mover);
      lista.removeEventListener('pointerup', soltar);
      lista.removeEventListener('pointercancel', soltar);
      li.style.transform = '';
      li.classList.remove('colunas-lista__item--arrastando');
      const f = atualFerr();
      if (!f) return;
      const ordem = [...lista.children].map(
        (x) => (x as HTMLElement).dataset.id,
      );
      const nova: FerramentasPerfil = {
        ordem: [...f.ordem].sort(
          (a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id),
        ),
        camposST: { ...f.camposST },
        abrirEm: f.abrirEm,
      };
      if (nova.ordem.some((x, i) => x.id !== f.ordem[i].id))
        void gravar(nova, 'Ordem das ferramentas salva.');
    };
    lista.addEventListener('pointermove', mover);
    lista.addEventListener('pointerup', soltar);
    lista.addEventListener('pointercancel', soltar);
  }

  function desenhar(foco?: string): void {
    if (!estado || !area.isConnected) return;
    const f = atualFerr();
    if (!f) return;
    lista.replaceChildren(...f.ordem.map((x) => linha(f, x.id, x.visivel)));
    const st = f.ordem.find((x) => x.id === ID_FERRAMENTA_ST);
    const marcaCampo = (k: keyof CamposST) =>
      marcar(
        `config-campo-${k}`,
        ROTULO_CAMPO_ST[k],
        f.camposST[k],
        (v) =>
          void gravar(
            {
              ordem: f.ordem.map((x) => ({ ...x })),
              camposST: { ...f.camposST, [k]: v },
              abrirEm: f.abrirEm,
            },
            `"${ROTULO_CAMPO_ST[k]}" ${v ? 'aparece' : 'oculto'} na ferramenta ST, MVA e CFOP.`,
            `campo-${k}`,
          ),
      );
    const mva = marcaCampo('mva');
    const aliq = marcaCampo('aliquota');
    mva.querySelector('input')!.dataset.foco = 'campo-mva';
    aliq.querySelector('input')!.dataset.foco = 'campo-aliquota';
    campos.replaceChildren(
      el(
        'p',
        'documento__nota',
        'Campos do rodapé da "ST, MVA e CFOP". Oculto: some da ferramenta e o Aplicar não grava aquilo. O CFOP é sempre gravado.',
      ),
      mva,
      aliq,
      st && !st.visivel
        ? el(
            'p',
            'config__ajuda',
            'A ferramenta está oculta neste perfil; os campos valem quando ela voltar.',
          )
        : '',
    );
    abrirEm.replaceChildren(...opcoesAbrirEm(f));
    if (foco) area.querySelector<HTMLElement>(`[data-foco="${foco}"]`)?.focus();
  }

  /** As duas opções, como botões de rádio, para o perfil escolhido. */
  function opcoesAbrirEm(f: FerramentasPerfil): HTMLElement[] {
    const opcoes: { valor: AbrirNotasEm; ajuda: string }[] = [
      {
        valor: 'leitura',
        ajuda:
          'Só para ver: DANFE, Conferência, imprimir e salvar PDF. Para anotar, a faixa da leitura oferece Usar a Conferência.',
      },
      {
        valor: 'conferencia',
        ajuda:
          'Direto na Conferência, com as anotações liberadas, como antes da leitura protegida.',
      },
    ];
    const grupo = el(
      'div',
      'config__opcoes',
      ...opcoes.map(({ valor, ajuda }) => {
        const radio = el('input', 'config__radio');
        radio.type = 'radio';
        radio.name = 'config-abrir-em';
        radio.value = valor;
        radio.id = `config-abrir-em-${valor}`;
        radio.checked = f.abrirEm === valor;
        radio.dataset.foco = `abrir-em-${valor}`;
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          void gravar(
            { ...f, ordem: f.ordem.map((x) => ({ ...x })), abrirEm: valor },
            `Neste perfil, as notas abrem em: ${ROTULO_ABRIR_EM[valor]}.`,
            `abrir-em-${valor}`,
          );
        });
        const rotulo = el(
          'label',
          'config__opcao',
          radio,
          el(
            'span',
            'config__opcao-textos',
            el('span', 'config__ferramenta-titulo', ROTULO_ABRIR_EM[valor]),
            el('span', 'config__ajuda', ajuda),
          ),
        );
        return rotulo;
      }),
    );
    grupo.setAttribute('role', 'radiogroup');
    grupo.setAttribute('aria-label', 'Abrir notas em');
    return [grupo];
  }

  area.replaceChildren(
    cartao(
      'Ferramentas do painel',
      el(
        'p',
        'documento__nota',
        'Por perfil: quais ferramentas aparecem na seção Ferramentas do painel de conferência e em que ordem. Arraste pela alça ou use as setas para cima e para baixo nela. As mudanças valem na hora.',
      ),
      el(
        'div',
        'config__campo config__campo--linha',
        rotuloSeletor,
        seletor.botao,
      ),
      lista,
      erro,
    ),
    cartao(
      'Abrir notas em',
      el(
        'p',
        'documento__nota',
        'Por perfil (o escolhido acima): como um XML de NF-e abre, pelo botão Abrir, ao arrastar, pela nota recente e no duplo clique no Explorer. A cópia editada (.psxml) abre na Conferência, a não ser que tenha vindo da internet: aí abre em leitura protegida.',
      ),
      abrirEm,
    ),
    cartao('ST, MVA e CFOP: campos do rodapé', campos),
    camadaMenus,
  );

  const carregar = () =>
    void window.psApi.ferramentasPerfis().then((e) => {
      if (!area.isConnected) return;
      estado = e;
      if (!perfilId || !e.lista.some((p) => p.id === perfilId))
        perfilId = e.ativo;
      seletor.definirOpcoes(
        e.lista.map((p) => ({
          valor: p.id,
          texto: p.id === e.ativo ? `${p.nome} (em uso)` : p.nome,
        })),
        perfilId,
      );
      const foco = (document.activeElement as HTMLElement | null)?.dataset.foco;
      desenhar(foco);
    });
  carregar();
  redesenharAba = carregar;
}

// ---------- Decisões lembradas ----------

function abaDecisoes({ area, status }: Hospede): void {
  let decisoes: DecisaoLembrada[] = [];
  let busca = '';
  let tipo: TipoDecisao | null = null;
  const selecionadas = new Set<string>();
  let confirmando = false;
  let ocupado = false;

  const titulo = el('h3', 'painel__subtitulo');
  const campoBusca = el('input', 'config__entrada config__busca');
  campoBusca.type = 'search';
  campoBusca.id = 'config-decisoes-busca';
  campoBusca.placeholder = 'Fornecedor, produto ou NCM';
  campoBusca.autocomplete = 'off';
  const rotBusca = el('label', 'config__rotulo', 'Buscar');
  rotBusca.htmlFor = campoBusca.id;
  const filtros = el('div', 'config__filtros');
  filtros.setAttribute('role', 'group');
  filtros.setAttribute('aria-label', 'Filtrar por tipo');
  const tabela = el('div', 'config__tabela-area');
  const barra = el('div', 'config__barra-selecao');
  const confirmacao = el('div', 'config__confirmar');
  confirmacao.hidden = true;
  const erro = caixaErro();

  campoBusca.addEventListener('input', () => {
    busca = campoBusca.value;
    desenhar();
  });

  const visiveis = () => filtrarDecisoes(decisoes, { busca, tipo });

  async function apagar(chaves: string[], mensagem: string): Promise<void> {
    if (ocupado) return;
    ocupado = true;
    mostrarErro(erro, null);
    try {
      for (const c of chaves) {
        const ok = await window.psApi.esquecerDecisao(c);
        if (!ok) throw new Error(c);
        selecionadas.delete(c);
      }
      status.textContent = mensagem;
    } catch {
      mostrarErro(erro, 'Não foi possível apagar todas as decisões.');
    } finally {
      ocupado = false;
      confirmando = false;
      decisoes = (await window.psApi.documentos()).decisoes;
      desenhar();
    }
  }

  function desenhar(foco?: string): void {
    if (!area.isConnected) return;
    const chaves = new Set(
      decisoes.map((d) => chaveDecisao(d.raizCnpj, d.cProd)),
    );
    for (const c of selecionadas) if (!chaves.has(c)) selecionadas.delete(c);
    const lista = visiveis();
    titulo.textContent = `Decisões lembradas (${decisoes.length})`;

    const n = contagemPorTipo(decisoes);
    const chip = (t: TipoDecisao | null, rotulo: string, qtd: number) => {
      const b = botao(
        'config__filtro',
        el('span', '', rotulo),
        el('span', 'config__filtro-qtd', String(qtd)),
      );
      b.setAttribute('aria-pressed', String(tipo === t));
      b.dataset.foco = `filtro-${t ?? 'todos'}`;
      b.addEventListener('click', () => {
        tipo = t;
        desenhar(`filtro-${t ?? 'todos'}`);
      });
      return b;
    };
    filtros.replaceChildren(
      chip(null, 'Todos', decisoes.length),
      ...TIPOS_DECISAO.map((t) => chip(t, ROTULO_TIPO_DECISAO[t], n[t])),
    );

    const marcarTodas = el('input', '');
    marcarTodas.type = 'checkbox';
    marcarTodas.setAttribute('aria-label', 'Marcar todas as decisões da lista');
    const chavesVisiveis = lista.map((d) => chaveDecisao(d.raizCnpj, d.cProd));
    marcarTodas.checked =
      chavesVisiveis.length > 0 &&
      chavesVisiveis.every((c) => selecionadas.has(c));
    marcarTodas.indeterminate =
      !marcarTodas.checked && chavesVisiveis.some((c) => selecionadas.has(c));
    marcarTodas.dataset.foco = 'marcar-todas';
    marcarTodas.addEventListener('change', () => {
      for (const c of chavesVisiveis)
        if (marcarTodas.checked) selecionadas.add(c);
        else selecionadas.delete(c);
      desenhar('marcar-todas');
    });

    tabela.replaceChildren(
      decisoes.length === 0
        ? el('p', 'documento__vazio', 'Nenhuma decisão lembrada.')
        : lista.length === 0
          ? el(
              'p',
              'documento__vazio',
              'Nenhuma decisão com essa busca e esse filtro.',
            )
          : el(
              'div',
              'documento__tabela config__tabela',
              el(
                'table',
                '',
                el(
                  'thead',
                  '',
                  el(
                    'tr',
                    '',
                    el('th', 'config__col-marca', marcarTodas),
                    el('th', '', 'Fornecedor'),
                    el('th', '', 'Produto'),
                    el('th', '', 'NCM'),
                    el('th', '', 'Decisão'),
                    el('th', '', 'Data'),
                    el('th', '', ''),
                  ),
                ),
                el(
                  'tbody',
                  '',
                  ...lista.map((d) => {
                    const chave = chaveDecisao(d.raizCnpj, d.cProd);
                    const marca = el('input', '');
                    marca.type = 'checkbox';
                    marca.checked = selecionadas.has(chave);
                    marca.setAttribute(
                      'aria-label',
                      `Marcar a decisão de ${d.cProd}`,
                    );
                    marca.dataset.foco = `marca-${chave}`;
                    marca.addEventListener('change', () => {
                      if (marca.checked) selecionadas.add(chave);
                      else selecionadas.delete(chave);
                      desenhar(`marca-${chave}`);
                    });
                    const apagarUma = botao(
                      'botao botao--claro botao--pequeno',
                      el('span', '', 'Apagar'),
                    );
                    apagarUma.setAttribute(
                      'aria-label',
                      `Apagar a decisão de ${d.cProd}`,
                    );
                    apagarUma.addEventListener(
                      'click',
                      () =>
                        void apagar([chave], `Decisão de ${d.cProd} apagada.`),
                    );
                    return el(
                      'tr',
                      selecionadas.has(chave) ? 'config__linha--marcada' : '',
                      el('td', 'config__col-marca', marca),
                      el(
                        'td',
                        '',
                        d.fornecedor,
                        el('span', 'documento__quando', ` (${d.raizCnpj})`),
                      ),
                      el('td', 'documento__valor', `${d.cProd}: ${d.xProd}`),
                      el('td', 'config__nowrap', d.ncm),
                      el('td', '', textoDecisao(d)),
                      el('td', 'config__nowrap', data(d.atualizadaEm)),
                      el('td', '', apagarUma),
                    );
                  }),
                ),
              ),
            ),
    );

    const k = selecionadas.size;
    const apagarSel = botao(
      'botao botao--perigo botao--pequeno',
      el(
        'span',
        '',
        k > 0 ? `Apagar as selecionadas (${k})` : 'Apagar as selecionadas',
      ),
    );
    apagarSel.disabled = k === 0 || confirmando;
    apagarSel.dataset.foco = 'apagar-selecionadas';
    apagarSel.addEventListener('click', () => {
      confirmando = true;
      desenhar('confirmar-nao');
    });
    const limpar = botao('link', el('span', '', 'Desmarcar todas'));
    limpar.hidden = k === 0;
    limpar.addEventListener('click', () => {
      selecionadas.clear();
      desenhar('apagar-selecionadas');
    });
    barra.replaceChildren(
      el(
        'span',
        'config__ajuda',
        `${lista.length} de ${decisoes.length} na lista · ${k} ${k === 1 ? 'selecionada' : 'selecionadas'}`,
      ),
      limpar,
      apagarSel,
    );

    confirmacao.hidden = !confirmando || k === 0;
    if (confirmando && k > 0) {
      const sim = botao(
        'botao botao--perigo botao--pequeno',
        el('span', '', k === 1 ? 'Apagar 1 decisão' : `Apagar ${k} decisões`),
      );
      sim.addEventListener(
        'click',
        () =>
          void apagar(
            [...selecionadas],
            `${k} ${k === 1 ? 'decisão apagada' : 'decisões apagadas'}.`,
          ),
      );
      const nao = botao(
        'botao botao--claro botao--pequeno',
        el('span', '', 'Cancelar'),
      );
      nao.dataset.foco = 'confirmar-nao';
      nao.addEventListener('click', () => {
        confirmando = false;
        desenhar('apagar-selecionadas');
      });
      confirmacao.replaceChildren(
        el(
          'p',
          '',
          el(
            'strong',
            '',
            `Apagar ${k} ${k === 1 ? 'decisão lembrada' : 'decisões lembradas'}?`,
          ),
          ' Na próxima nota desses produtos a ferramenta "ST, MVA e CFOP" volta a perguntar. Não dá para desfazer.',
        ),
        el('div', 'documento__acoes', nao, sim),
      );
    }
    if (foco)
      area
        .querySelector<HTMLElement>(`[data-foco="${CSS.escape(foco)}"]`)
        ?.focus();
  }

  area.replaceChildren(
    el(
      'section',
      'config__cartao',
      titulo,
      el(
        'p',
        'documento__nota',
        'Escolhas feitas na ferramenta "ST, MVA e CFOP", por fornecedor (raiz do CNPJ) e código do produto. Na próxima nota o item já vem resolvido.',
      ),
      el('div', 'config__campo config__campo--linha', rotBusca, campoBusca),
      filtros,
      barra,
      confirmacao,
      erro,
      tabela,
    ),
  );
  const carregar = () =>
    void window.psApi.documentos().then((e) => {
      if (ocupado) return;
      decisoes = e.decisoes;
      desenhar();
    });
  carregar();
  redesenharAba = carregar;
}

// ---------- Dados do app ----------

function abaDados({ area, status }: Hospede): void {
  const caminho = el('p', 'config__caminho');
  const tabela = el('div', 'config__tabela-area');
  const erro = caixaErro();
  const erroBackup = caixaErro();
  const confirmacao = el('div', 'config__confirmar');
  confirmacao.hidden = true;
  const resultado = el('p', 'documento__nota config__resultado');
  resultado.hidden = true;

  const abrir = botao(
    'botao botao--claro botao--pequeno',
    icone(...ICONES.pastaAberta),
    el('span', '', 'Abrir pasta dos dados'),
  );
  abrir.addEventListener('click', () => {
    mostrarErro(erro, null);
    void window.psApi.abrirPastaDados().then((r) => {
      if (r.status === 'erro') mostrarErro(erro, r.mensagem);
    });
  });
  const exportar = botao(
    'botao botao--claro botao--pequeno',
    icone(...ICONES.enviar),
    el('span', '', 'Exportar backup'),
  );
  const importar = botao(
    'botao botao--claro botao--pequeno',
    icone(...ICONES.salvar),
    el('span', '', 'Importar backup'),
  );
  exportar.addEventListener('click', () => {
    mostrarErro(erroBackup, null);
    status.textContent = '';
    resultado.hidden = true;
    void window.psApi.exportarBackup().then((r) => {
      if (r.status === 'erro') mostrarErro(erroBackup, r.mensagem);
      else if (r.status === 'exportado') {
        resultado.textContent = `Backup exportado: ${r.caminho}`;
        resultado.hidden = false;
        status.textContent = 'Backup exportado.';
      }
    });
  });

  let token: string | null = null;
  const cancelarPendente = () => {
    if (token) void window.psApi.cancelarBackup(token);
    token = null;
    confirmacao.hidden = true;
    confirmacao.replaceChildren();
    importar.disabled = false;
  };
  importar.addEventListener('click', () => {
    mostrarErro(erroBackup, null);
    status.textContent = '';
    resultado.hidden = true;
    cancelarPendente();
    void window.psApi.lerBackup().then((r) => {
      if (r.status === 'erro') mostrarErro(erroBackup, r.mensagem);
      else if (r.status === 'lido') mostrarConfirmacao(r);
    });
  });

  function mostrarConfirmacao(
    r: Extract<ResultadoLerBackup, { status: 'lido' }>,
  ): void {
    token = r.token;
    importar.disabled = true;
    /** Linha de uma parte: o que tem agora, no backup e o que acontece. */
    const linhaParte = (
      rotulo: string,
      agora: string,
      novo: string,
      acontece: 'substitui' | 'nao-veio' | 'local',
    ) =>
      el(
        'tr',
        `config__parte--${acontece}`,
        el('th', '', rotulo),
        el('td', '', agora),
        el('td', '', novo),
        el(
          'td',
          'config__acontece',
          acontece === 'substitui'
            ? 'Substitui'
            : acontece === 'nao-veio'
              ? 'Não veio no backup: fica como está'
              : 'Deste computador: não muda',
        ),
      );
    const valorAtual = (x: ResumoBackup, id: string) =>
      x.partes.find((p) => p.id === id)?.valor || 'nada';
    const sim = botao(
      'botao botao--perigo botao--pequeno',
      el('span', '', 'Importar e substituir'),
    );
    const nao = botao(
      'botao botao--claro botao--pequeno',
      el('span', '', 'Cancelar'),
    );
    nao.addEventListener('click', () => {
      cancelarPendente();
      importar.focus();
    });
    sim.addEventListener('click', () => {
      sim.disabled = true;
      nao.disabled = true;
      const t = token!;
      token = null;
      void window.psApi.confirmarBackup(t).then((res) => {
        confirmacao.hidden = true;
        confirmacao.replaceChildren();
        importar.disabled = false;
        if (res.status === 'erro') mostrarErro(erroBackup, res.mensagem);
        else if (res.status === 'ok') {
          resultado.textContent = `Backup importado. Os dados de antes estão em ${res.pastaAntes}`;
          resultado.hidden = false;
          status.textContent = 'Backup importado.';
          carregar();
        }
        importar.focus();
      });
    });
    confirmacao.replaceChildren(
      el(
        'p',
        '',
        el('strong', '', `Importar ${r.arquivo}?`),
        ` Backup de ${dataHora(r.novo.criadoEm)}${r.novo.versaoApp ? ` (versão ${r.novo.versaoApp})` : ''}. Só as partes que vieram no backup substituem as deste computador; as outras ficam como estão. Os dados de agora vão antes para uma pasta "antes-da-importacao-<data>" dentro da pasta de dados (ficam as 3 mais recentes). Os documentos de referência ficam como estão.`,
      ),
      el(
        'p',
        'config__nao-muda',
        'A pasta de destino e as notas recentes deste computador não mudam.',
      ),
      el(
        'div',
        'documento__tabela config__comparar',
        el(
          'table',
          '',
          el(
            'thead',
            '',
            el(
              'tr',
              '',
              el('th', '', 'Parte'),
              el('th', '', 'Agora'),
              el('th', '', 'No backup'),
              el('th', '', 'O que acontece'),
            ),
          ),
          el(
            'tbody',
            '',
            ...r.novo.partes.map((p) =>
              linhaParte(
                p.rotulo,
                valorAtual(r.atual, p.id),
                p.veio ? p.valor : '',
                p.veio ? 'substitui' : 'nao-veio',
              ),
            ),
            linhaParte('Pasta de destino', '', '', 'local'),
            linhaParte('Notas recentes', '', '', 'local'),
          ),
        ),
      ),
      el('div', 'documento__acoes', nao, sim),
    );
    confirmacao.hidden = false;
    nao.focus();
  }

  area.replaceChildren(
    cartao(
      'Pasta dos dados',
      el(
        'p',
        'documento__nota',
        'Onde o PS Reader guarda a configuração, os perfis, as preferências, os documentos lidos e as decisões lembradas.',
      ),
      caminho,
      el('div', 'documento__acoes', abrir),
      erro,
    ),
    cartao('O que o app guarda', tabela),
    cartao(
      'Backup',
      el(
        'p',
        'documento__nota',
        'Um arquivo .psbackup com a configuração, os perfis, as ferramentas, as preferências e as decisões lembradas. Os documentos fiscais (planilha de ST, TIPI, combustíveis) ficam de fora: carregue ou baixe de novo depois.',
      ),
      el('div', 'documento__acoes', exportar, importar),
      confirmacao,
      resultado,
      erroBackup,
    ),
  );

  const carregar = () =>
    void window.psApi.dadosApp().then((e) => {
      if (!area.isConnected) return;
      caminho.textContent = e.pasta;
      tabela.replaceChildren(
        e.itens.length === 0
          ? el('p', 'documento__vazio', 'Nada guardado ainda.')
          : el(
              'div',
              'documento__tabela config__tabela',
              el(
                'table',
                '',
                el(
                  'thead',
                  '',
                  el(
                    'tr',
                    '',
                    el('th', '', 'Arquivo'),
                    el('th', '', 'O que é'),
                    el('th', 'num', 'Tamanho'),
                    el('th', '', 'Modificado'),
                    el('th', '', 'No backup'),
                  ),
                ),
                el(
                  'tbody',
                  '',
                  ...e.itens.map((i) =>
                    el(
                      'tr',
                      '',
                      el('td', 'documento__valor config__arquivo', i.nome),
                      el('td', '', i.oQueE),
                      el('td', 'num config__nowrap', tamanho(i.tamanho)),
                      el('td', 'config__nowrap', dataHora(i.modificadoEm)),
                      el('td', '', i.noBackup ? 'Sim' : 'Não'),
                    ),
                  ),
                ),
              ),
            ),
      );
    });
  carregar();
  redesenharAba = carregar;
}
