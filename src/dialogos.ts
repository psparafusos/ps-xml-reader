// Caixas de diálogo no visual do app (dentro da janela, por cima de tudo):
// pergunta com botões e o pedido de nome do Salvar cópia. Esc e o fundo
// escuro equivalem a Cancelar.

import { botao, el } from './dom';

export interface BotaoDialogo<T extends string> {
  rotulo: string;
  valor: T;
  /** O botão preenchido (a ação sugerida); recebe o foco. */
  principal?: boolean;
}

/**
 * Caixa modal com título e texto. `fim(valor)` fecha, tira do DOM e entrega a
 * resposta na hora (sem esperar o evento close do <dialog>, que o Chromium
 * pode atrasar numa janela coberta por outras). Esc vale `aoCancelar`.
 */
function novaCaixa<T>(
  titulo: string,
  texto: string,
  aoCancelar: T,
  resolver: (valor: T) => void,
): { d: HTMLDialogElement; fim: (valor: T) => void } {
  const t = el('h2', 'caixa-dialogo__titulo', titulo);
  t.id = `caixa-titulo-${Math.random().toString(36).slice(2)}`;
  const d = el(
    'dialog',
    'caixa-dialogo',
    t,
    el('p', 'caixa-dialogo__texto', texto),
  );
  d.setAttribute('aria-labelledby', t.id);
  let terminou = false;
  const fim = (valor: T) => {
    if (terminou) return;
    terminou = true;
    if (d.open) d.close();
    d.remove();
    resolver(valor);
  };
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    fim(aoCancelar);
  });
  return { d, fim };
}

/** Pergunta com botões. Devolve o valor do botão escolhido (Esc: `cancelar`). */
export function perguntar<T extends string>(opcoes: {
  titulo: string;
  texto: string;
  botoes: BotaoDialogo<T>[];
  cancelar: T;
}): Promise<T> {
  return new Promise((resolve) => {
    const { d, fim } = novaCaixa(
      opcoes.titulo,
      opcoes.texto,
      opcoes.cancelar,
      resolve,
    );
    const botoes = opcoes.botoes.map((b) => {
      const e = botao(
        b.principal ? 'botao botao--principal' : 'botao botao--claro',
        b.rotulo,
      );
      e.addEventListener('click', () => fim(b.valor));
      return e;
    });
    d.append(el('div', 'caixa-dialogo__botoes', ...botoes));
    document.body.append(d);
    d.showModal();
    const i = opcoes.botoes.findIndex((b) => b.principal);
    botoes[i >= 0 ? i : 0]?.focus();
  });
}

/**
 * Pede um texto numa caixa: campo com `valor` selecionado, `sufixo` ao lado
 * (por exemplo a extensão) e `nota` embaixo. `problema` diz o que há de
 * errado (null se pode confirmar) e é conferido a cada tecla. Devolve o texto
 * (sem espaços nas pontas) ou null se cancelou.
 */
export function pedirTexto(opcoes: {
  titulo: string;
  texto: string;
  valor: string;
  rotulo: string;
  confirmar: string;
  sufixo?: string;
  nota?: string;
  problema: (texto: string) => string | null;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const { d, fim } = novaCaixa<string | null>(
      opcoes.titulo,
      opcoes.texto,
      null,
      resolve,
    );
    const campo = el('input', 'caixa-dialogo__campo');
    campo.type = 'text';
    campo.value = opcoes.valor;
    campo.spellcheck = false;
    campo.setAttribute('aria-label', opcoes.rotulo);
    const erro = el('p', 'caixa-dialogo__erro');
    erro.id = `erro-${Math.random().toString(36).slice(2)}`;
    erro.hidden = true;
    campo.setAttribute('aria-describedby', erro.id);
    const confirmar = botao('botao botao--principal', opcoes.confirmar);
    const cancelar = botao('botao botao--claro', 'Cancelar');

    const conferir = (): boolean => {
      const p = opcoes.problema(campo.value);
      erro.textContent = p ?? '';
      erro.hidden = !p;
      campo.setAttribute('aria-invalid', String(Boolean(p)));
      confirmar.disabled = Boolean(p);
      return !p;
    };
    campo.addEventListener('input', conferir);
    const concluir = () => {
      if (conferir()) fim(campo.value.trim());
    };
    campo.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      concluir();
    });
    confirmar.addEventListener('click', concluir);
    cancelar.addEventListener('click', () => fim(null));

    d.append(
      el(
        'div',
        'caixa-dialogo__linha',
        campo,
        opcoes.sufixo && el('span', 'caixa-dialogo__extensao', opcoes.sufixo),
      ),
      erro,
      ...(opcoes.nota ? [el('p', 'caixa-dialogo__pasta', opcoes.nota)] : []),
      el('div', 'caixa-dialogo__botoes', cancelar, confirmar),
    );
    document.body.append(d);
    d.showModal();
    conferir();
    campo.focus();
    campo.select();
  });
}

/**
 * Pede o nome do arquivo do Salvar cópia: a sugestão selecionada, a extensão
 * ao lado e a pasta embaixo. Devolve o nome (sem extensão) ou null.
 */
export function pedirNomeCopia(opcoes: {
  sugestao: string;
  extensao: string;
  pasta: string;
  problema: (nome: string) => string | null;
}): Promise<string | null> {
  return pedirTexto({
    titulo: 'Salvar cópia',
    texto:
      'A cópia é um .psxml novo com as anotações de agora. O arquivo aberto não muda, e a janela passa a trabalhar na cópia.',
    valor: opcoes.sugestao,
    rotulo: 'Nome da cópia',
    confirmar: 'Salvar',
    sufixo: opcoes.extensao,
    nota: `em ${opcoes.pasta}`,
    problema: opcoes.problema,
  });
}
