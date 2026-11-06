// Dica (tooltip) no visual do app: fundo preto, texto branco, 12px, cantos
// arredondados. Abre 400 ms depois de o mouse entrar ou do foco por teclado
// (não abre no clique do mouse), fecha ao sair, ao perder o foco e com Esc.
// No lugar do title nativo. Reutilizável: ligarDica(alvo, texto).
//
// Uma só caixa para o app inteiro, num popover (camada de cima: aparece por
// cima de <dialog> modal). Uma dica por vez; o foco do teclado vale mais que
// o mouse (grupos, mais abaixo). O alvo ganha aria-describedby enquanto ela está
// aberta. A parte de eventos não depende do DOM de verdade (os testes usam
// um EventTarget e uma caixa falsa).

export const ATRASO_DICA = 400;

/** Onde a dica aparece: a caixa do app, ou uma falsa nos testes. */
export interface CaixaDica {
  mostrar(alvo: EventTarget, texto: string): void;
  /** Fecha, se a dica aberta for a deste alvo. */
  esconder(alvo: EventTarget): void;
}

let caixaPadrao: CaixaDica | null = null;

/** A caixa do app (criada na primeira dica). */
function caixaDoApp(): CaixaDica {
  if (caixaPadrao) return caixaPadrao;
  const elemento = document.createElement('div');
  elemento.className = 'dica-flutuante';
  elemento.id = 'dica-app';
  elemento.setAttribute('role', 'tooltip');
  elemento.setAttribute('popover', 'manual');
  let dono: Element | null = null;
  let vigia: ReturnType<typeof setInterval> | null = null;
  const fecharJa = () => {
    if (vigia !== null) clearInterval(vigia);
    vigia = null;
    dono?.removeAttribute('aria-describedby');
    dono = null;
    if (elemento.isConnected && elemento.matches(':popover-open'))
      elemento.hidePopover();
  };
  caixaPadrao = {
    mostrar(alvo, texto) {
      if (!elemento.isConnected) document.body.append(elemento);
      if (dono && dono !== alvo) dono.removeAttribute('aria-describedby');
      dono = alvo as Element;
      dono.setAttribute('aria-describedby', elemento.id);
      elemento.textContent = texto;
      if (!elemento.matches(':popover-open')) elemento.showPopover();
      posicionar(elemento, dono);
      // O alvo saiu da tela (a tabela redesenhou, a janela fechou) sem
      // "mouseleave": a dica não fica pendurada.
      if (vigia === null)
        vigia = setInterval(() => {
          if (!dono?.isConnected) fecharJa();
        }, 250);
    },
    esconder(alvo) {
      if (alvo === dono) fecharJa();
    },
  };
  return caixaPadrao;
}

/** Embaixo do alvo, alinhada à esquerda; sem espaço, em cima. Sempre dentro da janela. */
function posicionar(dica: HTMLElement, alvo: Element): void {
  const margem = 8;
  const r = alvo.getBoundingClientRect();
  const d = dica.getBoundingClientRect();
  const largura = window.innerWidth;
  const altura = window.innerHeight;
  let top = r.bottom + 6;
  if (top + d.height > altura - margem)
    top = Math.max(margem, r.top - 6 - d.height);
  const left = Math.min(
    Math.max(margem, r.left),
    Math.max(margem, largura - margem - d.width),
  );
  dica.style.top = `${Math.round(top)}px`;
  dica.style.left = `${Math.round(left)}px`;
}

/** Foco que veio do teclado (Tab), não do clique. Fora do navegador: sim. */
function focoPorTeclado(e: Event): boolean {
  const t = e.target as Partial<Element> | null;
  if (!t || typeof t.matches !== 'function') return true;
  try {
    return t.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * Dicas ligadas a uma mesma caixa. O foco do teclado vale mais que o mouse:
 * com um alvo focado, passar o mouse em outro não troca a dica; quando o
 * foco sai, abre a do alvo que está sob o mouse.
 */
interface Controle {
  comFoco(): boolean;
  /** Outra dica tomou a caixa: esta deixa de se considerar aberta. */
  perdeuCaixa(): void;
  /** O foco saiu de outro alvo: abre, se o mouse estiver em cima. */
  focoLiberado(): void;
}
const grupos = new Map<CaixaDica | 'app', Set<Controle>>();

export interface Dica {
  /** Troca o texto (vale na próxima vez que abrir, ou já, se aberta). */
  definirTexto(texto: string): void;
  /** Desliga os eventos e fecha. */
  remover(): void;
}

/**
 * Liga a dica ao alvo. O alvo pode ser um contêiner: o foco de um campo
 * dentro dele (focusin) também abre. `caixa`: para os testes.
 */
export function ligarDica(
  alvo: EventTarget,
  texto: string,
  caixa?: CaixaDica,
): Dica {
  let atual = texto;
  let espera: ReturnType<typeof setTimeout> | null = null;
  let aberta = false;
  let pelaMao = false;
  let peloFoco = false;
  const daCaixa = () => caixa ?? caixaDoApp();
  const chave = caixa ?? 'app';
  const grupo = grupos.get(chave) ?? new Set<Controle>();
  grupos.set(chave, grupo);
  const outros = () => [...grupo].filter((c) => c !== controle);
  const outroComFoco = () => outros().some((c) => c.comFoco());
  // Esc vale com o mouse em cima (o foco pode estar em outro lugar): ouve
  // no documento enquanto aberta; fora do navegador, no próprio alvo.
  const ondeOuvirEsc: EventTarget =
    (alvo as Partial<Node>).ownerDocument ?? alvo;

  const cancelar = () => {
    if (espera !== null) clearTimeout(espera);
    espera = null;
  };
  const abrir = () => {
    cancelar();
    espera = setTimeout(() => {
      espera = null;
      if ((alvo as Partial<Node>).isConnected === false) return;
      // Só pelo mouse, com outro alvo focado: a dica do foco fica.
      if (!peloFoco && outroComFoco()) return;
      for (const c of outros()) c.perdeuCaixa();
      aberta = true;
      daCaixa().mostrar(alvo, atual);
      ondeOuvirEsc.addEventListener('keydown', aoTeclar, true);
    }, ATRASO_DICA);
  };
  const fechar = () => {
    cancelar();
    if (!aberta) return;
    aberta = false;
    ondeOuvirEsc.removeEventListener('keydown', aoTeclar, true);
    daCaixa().esconder(alvo);
  };
  const talvezFechar = () => {
    if (!pelaMao && !peloFoco) fechar();
  };
  function aoTeclar(e: Event): void {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    if (!aberta && espera === null) return;
    // Alvo que já saiu da tela: só solta o Esc, sem segurá-lo.
    if ((alvo as Partial<Node>).isConnected === false) {
      fechar();
      return;
    }
    // Só a dica fecha: o Esc não chega a fechar a janela por baixo.
    e.preventDefault();
    e.stopPropagation();
    pelaMao = false;
    peloFoco = false;
    fechar();
  }

  const entrar = () => {
    pelaMao = true;
    if (!aberta && espera === null) abrir();
  };
  const sair = () => {
    pelaMao = false;
    talvezFechar();
  };
  const focar = (e: Event) => {
    if (!focoPorTeclado(e)) return;
    peloFoco = true;
    if (!aberta && espera === null) abrir();
  };
  const desfocar = () => {
    if (!peloFoco) return;
    peloFoco = false;
    talvezFechar();
    if (!outroComFoco()) for (const c of outros()) c.focoLiberado();
  };
  // Clique: some (o que importa agora é a ação).
  const clicar = () => {
    pelaMao = false;
    peloFoco = false;
    fechar();
  };
  const eventos: [string, (e: Event) => void][] = [
    ['mouseenter', entrar],
    ['mouseleave', sair],
    ['focusin', focar],
    ['focusout', desfocar],
    ['mousedown', clicar],
    ['keydown', aoTeclar],
  ];
  for (const [tipo, fn] of eventos) alvo.addEventListener(tipo, fn);

  const controle: Controle = {
    comFoco: () => peloFoco && (alvo as Partial<Node>).isConnected !== false,
    perdeuCaixa() {
      cancelar();
      if (!aberta) return;
      aberta = false;
      ondeOuvirEsc.removeEventListener('keydown', aoTeclar, true);
    },
    focoLiberado() {
      if (pelaMao && !aberta && espera === null) abrir();
    },
  };
  grupo.add(controle);

  return {
    definirTexto(t) {
      atual = t;
      if (aberta) daCaixa().mostrar(alvo, atual);
    },
    remover() {
      for (const [tipo, fn] of eventos) alvo.removeEventListener(tipo, fn);
      fechar();
      grupo.delete(controle);
    },
  };
}
