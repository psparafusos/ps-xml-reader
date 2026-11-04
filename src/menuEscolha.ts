// Seletor no visual do app, no lugar do <select> nativo: um botão com o
// valor e a seta, que abre o menu de opções (o mesmo do seletor de perfil e
// da largura das anotações), com ✓ na opção ativa e o teclado de navegarMenu
// (setas, Home, End, Esc e Tab). Um menu por grupo de seletores, numa camada
// por cima (popover), para a rolagem da tabela não cortar.

import { botao, el, icone, navegarMenu } from './dom';
import { ICONES } from './icones';

export interface OpcaoMenu {
  valor: string;
  texto: string;
}

export interface Seletor {
  botao: HTMLButtonElement;
  /** Valor escolhido ('' quando nenhum). */
  valor: string;
  desabilitado: boolean;
  /** Troca as opções (e o valor, se vier). */
  definirOpcoes(opcoes: OpcaoMenu[], valor?: string): void;
}

export interface OpcoesSeletor {
  /** Nome para o leitor de tela ("Finalidade do item 3"). */
  rotulo: string;
  opcoes: OpcaoMenu[];
  valor: string;
  /** Texto do botão quando o valor não está entre as opções. */
  vazio?: string;
  /** Classe a mais no botão (tamanho, largura). */
  classe?: string;
  aoMudar(valor: string): void;
}

/**
 * Grupo de seletores de uma janela: um só menu, posto em `container` (a
 * janela), aberto embaixo do botão que o pediu.
 */
export function criarMenuEscolha(container: HTMLElement): {
  seletor(o: OpcoesSeletor): Seletor;
  fechar(): void;
} {
  const menu = el('div', 'menu-largura menu-escolha');
  menu.popover = 'manual';
  menu.setAttribute('role', 'menu');
  menu.id = `menu-escolha-${Math.random().toString(36).slice(2)}`;
  container.append(menu);
  let dono: HTMLButtonElement | null = null;

  function fechar(focarBotao = false): void {
    const b = dono;
    if (!b) return;
    dono = null;
    b.setAttribute('aria-expanded', 'false');
    if (menu.matches(':popover-open')) menu.hidePopover();
    if (focarBotao) b.focus();
  }

  menu.addEventListener('keydown', (e) =>
    navegarMenu(e, [...menu.querySelectorAll<HTMLElement>('button')], (f) =>
      fechar(f),
    ),
  );
  document.addEventListener('mousedown', (e) => {
    const alvo = e.target as Node;
    if (dono && !menu.contains(alvo) && !dono.contains(alvo)) fechar();
  });
  // A rolagem (da tabela ou da janela) tiraria o menu do lugar: fecha. A do
  // próprio menu (lista longa) não conta.
  document.addEventListener(
    'scroll',
    (e) => {
      if (dono && !menu.contains(e.target as Node)) fechar();
    },
    true,
  );

  function seletor(o: OpcoesSeletor): Seletor {
    let opcoes = o.opcoes;
    let valor = o.valor;
    const texto = el('span', 'seletor-menu__texto');
    const b = botao(
      `seletor-menu${o.classe ? ` ${o.classe}` : ''}`,
      texto,
      icone(...ICONES.setaBaixo),
    );
    b.setAttribute('aria-haspopup', 'menu');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', menu.id);

    const atualizar = () => {
      const atual = opcoes.find((x) => x.valor === valor);
      texto.textContent = atual?.texto ?? o.vazio ?? '';
      b.setAttribute(
        'aria-label',
        atual ? `${o.rotulo}: ${atual.texto}` : o.rotulo,
      );
      b.title = atual?.texto ?? o.vazio ?? '';
    };

    const abrir = () => {
      fechar();
      menu.setAttribute('aria-label', o.rotulo);
      menu.replaceChildren(
        ...opcoes.map((x) => {
          const ativo = x.valor === valor;
          const item = botao(
            'perfil-rapido__opcao',
            el('span', 'perfil-rapido__marca', ativo ? '✓' : ''),
            el('span', 'perfil-rapido__texto', x.texto),
          );
          item.setAttribute('role', 'menuitemradio');
          item.setAttribute('aria-checked', String(ativo));
          item.addEventListener('click', () => {
            fechar(true);
            if (x.valor === valor) return;
            valor = x.valor;
            atualizar();
            o.aoMudar(x.valor);
          });
          return item;
        }),
      );
      dono = b;
      b.setAttribute('aria-expanded', 'true');
      menu.showPopover();
      // Embaixo do botão, alinhado pela esquerda; perto da borda, por cima.
      const r = b.getBoundingClientRect();
      const alto = menu.offsetHeight;
      const embaixo = r.bottom + alto <= window.innerHeight - 8;
      menu.style.top = `${embaixo ? r.bottom : Math.max(8, r.top - alto - 8)}px`;
      menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.minWidth = `${r.width}px`;
      (
        menu.querySelector<HTMLElement>('[aria-checked="true"]') ??
        menu.querySelector<HTMLElement>('button')
      )?.focus();
    };
    b.addEventListener('click', () => {
      if (dono === b) fechar();
      else abrir();
    });
    // Seta para baixo no botão também abre (como no <select>).
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && dono !== b) {
        e.preventDefault();
        abrir();
      }
    });
    atualizar();

    return {
      botao: b,
      get valor() {
        return valor;
      },
      set valor(v: string) {
        valor = v;
        atualizar();
      },
      get desabilitado() {
        return b.disabled;
      },
      set desabilitado(v: boolean) {
        b.disabled = v;
        if (v && dono === b) fechar();
      },
      definirOpcoes(novas: OpcaoMenu[], v?: string) {
        opcoes = novas;
        if (v !== undefined) valor = v;
        atualizar();
      },
    };
  }

  return { seletor, fechar: () => fechar() };
}
