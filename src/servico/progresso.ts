// Cartão de andamento do serviço de leitura pesada, na janela: aparece
// quando uma leitura (XML genérico, NF-e grande, planilha de referência)
// passa de MOSTRAR_APOS_MS, com o que está sendo lido, a etapa e o botão
// Cancelar. Módulo separado: monta o próprio elemento e só fala com o
// processo principal pela ponte window.psServico. Texto sempre por
// textContent.

import type { EtapaProgresso } from './protocolo';

/** Leitura rápida não pisca o cartão. */
const MOSTRAR_APOS_MS = 300;

const ETAPA: Record<EtapaProgresso, string> = {
  lendo: 'Lendo o arquivo…',
  decodificando: 'Decodificando o texto…',
  arvore: 'Montando a árvore…',
  linhas: 'Preparando o texto…',
  planilha: 'Conferindo a planilha…',
};

const api = window.psServico;

const cartao = document.createElement('div');
cartao.className = 'servico-progresso';
cartao.hidden = true;
cartao.setAttribute('role', 'status');
// O leitor de XML deixa o resto da tela inerte; este cartão fica de fora.
cartao.setAttribute('data-fora-do-leitor', '');
const rotulo = document.createElement('strong');
rotulo.className = 'servico-progresso__rotulo';
const etapa = document.createElement('span');
etapa.className = 'servico-progresso__etapa';
const barra = document.createElement('div');
barra.className = 'servico-progresso__barra';
barra.append(document.createElement('div'));
const btnCancelar = document.createElement('button');
btnCancelar.type = 'button';
btnCancelar.className = 'botao botao--claro botao--pequeno';
btnCancelar.textContent = 'Cancelar';
const textos = document.createElement('div');
textos.className = 'servico-progresso__textos';
textos.append(rotulo, etapa);
cartao.append(textos, barra, btnCancelar);
document.body.append(cartao);

interface Andamento {
  rotulo: string;
  etapa: string;
  relogio: ReturnType<typeof setTimeout>;
  /** Já passou do tempo de espera: pode aparecer. */
  pronto: boolean;
}
/** Leituras desta janela em andamento, pela ordem de início. */
const andamentos = new Map<number, Andamento>();
let mostrado: number | null = null;

function desenhar(): void {
  // Uma por vez: a mais antiga que já passou do tempo de espera.
  if (mostrado === null || !andamentos.has(mostrado)) {
    mostrado = null;
    for (const [id, x] of andamentos)
      if (x.pronto) {
        mostrado = id;
        break;
      }
  }
  const a = mostrado === null ? undefined : andamentos.get(mostrado);
  if (!a) {
    cartao.hidden = true;
    return;
  }
  rotulo.textContent = a.rotulo;
  etapa.textContent = a.etapa;
  btnCancelar.disabled = false;
  hospedar();
  cartao.hidden = false;
}

/** Vigia o modal que hospeda o cartão (null com o cartão no body). */
let vigiaModal: MutationObserver | null = null;

/**
 * Um <dialog> modal aberto (Configurações, por exemplo) fica na camada de
 * cima e deixa inerte tudo o que está fora dele: o cartão vai para dentro
 * do modal mais recente, para aparecer e o Cancelar funcionar. Sem modal,
 * fica no body.
 */
function hospedar(): void {
  const modais = [...document.querySelectorAll('dialog')].filter(
    (d) => d.open && d.matches(':modal'),
  );
  const destino: HTMLDialogElement | HTMLElement =
    modais.at(-1) ?? document.body;
  if (cartao.parentElement === destino) return;
  vigiaModal?.disconnect();
  vigiaModal = null;
  destino.append(cartao);
  if (!(destino instanceof HTMLDialogElement)) return;
  // O modal fechou ou saiu da página com o cartão dentro: volta para o body.
  // Pela mudança no DOM, não pelo evento close: as caixas do app fecham e
  // saem da página no mesmo instante (d.close() e d.remove()), e o close
  // chega depois, numa tarefa à parte.
  const modal = destino;
  vigiaModal = new MutationObserver(() => {
    if (modal.open && modal.isConnected) return;
    vigiaModal?.disconnect();
    vigiaModal = null;
    document.body.append(cartao);
    desenhar();
  });
  vigiaModal.observe(modal, { attributes: true, attributeFilter: ['open'] });
  vigiaModal.observe(document.body, { childList: true });
}

api.aoInicio(({ id, rotulo: r }) => {
  const relogio = setTimeout(() => {
    const a = andamentos.get(id);
    if (!a) return;
    a.pronto = true;
    desenhar();
  }, MOSTRAR_APOS_MS);
  andamentos.set(id, { rotulo: r, etapa: ETAPA.lendo, relogio, pronto: false });
});

api.aoProgresso(({ id, etapa: e }) => {
  const a = andamentos.get(id);
  if (!a) return;
  a.etapa = ETAPA[e] ?? a.etapa;
  if (mostrado === id) desenhar();
});

api.aoFim(({ id }) => {
  const a = andamentos.get(id);
  if (a) clearTimeout(a.relogio);
  andamentos.delete(id);
  if (mostrado === id) mostrado = null;
  desenhar();
});

btnCancelar.addEventListener('click', () => {
  if (mostrado === null) return;
  btnCancelar.disabled = true;
  etapa.textContent = 'Cancelando…';
  void api.cancelar(mostrado);
});
