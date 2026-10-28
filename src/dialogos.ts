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

/** Caixa modal vazia, com título e texto; some ao fechar. */
function novaCaixa(titulo: string, texto: string): HTMLDialogElement {
  const t = el('h2', 'caixa-dialogo__titulo', titulo);
  t.id = `caixa-titulo-${Math.random().toString(36).slice(2)}`;
  const d = el(
    'dialog',
    'caixa-dialogo',
    t,
    el('p', 'caixa-dialogo__texto', texto),
  );
  d.setAttribute('aria-labelledby', t.id);
  d.addEventListener('close', () => d.remove());
  return d;
}

/** Pergunta com botões. Devolve o valor do botão escolhido (Esc: `cancelar`). */
export function perguntar<T extends string>(opcoes: {
  titulo: string;
  texto: string;
  botoes: BotaoDialogo<T>[];
  cancelar: T;
}): Promise<T> {
  return new Promise((resolve) => {
    const d = novaCaixa(opcoes.titulo, opcoes.texto);
    let resposta = opcoes.cancelar;
    const botoes = opcoes.botoes.map((b) => {
      const e = botao(
        b.principal ? 'botao botao--principal' : 'botao botao--claro',
        b.rotulo,
      );
      e.addEventListener('click', () => {
        resposta = b.valor;
        d.close();
      });
      return e;
    });
    d.append(el('div', 'caixa-dialogo__botoes', ...botoes));
    d.addEventListener('close', () => resolve(resposta));
    document.body.append(d);
    d.showModal();
    const i = opcoes.botoes.findIndex((b) => b.principal);
    botoes[i >= 0 ? i : 0]?.focus();
  });
}

/**
 * Pede o nome do arquivo do Salvar cópia: campo com a sugestão selecionada,
 * a extensão ao lado e a pasta embaixo. `problema` diz o que há de errado com
 * o nome (null se pode salvar) e é conferido a cada tecla. Devolve o nome
 * (sem extensão) ou null se cancelou.
 */
export function pedirNomeCopia(opcoes: {
  sugestao: string;
  extensao: string;
  pasta: string;
  problema: (nome: string) => string | null;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const d = novaCaixa(
      'Salvar cópia',
      'A cópia é um .psxml novo com as anotações de agora. O arquivo aberto não muda, e a janela passa a trabalhar na cópia.',
    );
    const campo = el('input', 'caixa-dialogo__campo');
    campo.type = 'text';
    campo.value = opcoes.sugestao;
    campo.spellcheck = false;
    campo.setAttribute('aria-label', 'Nome da cópia');
    const erro = el('p', 'caixa-dialogo__erro');
    erro.id = 'erro-nome-copia';
    erro.hidden = true;
    campo.setAttribute('aria-describedby', erro.id);
    const salvar = botao('botao botao--principal', 'Salvar');
    const cancelar = botao('botao botao--claro', 'Cancelar');
    let resposta: string | null = null;

    const conferir = (): boolean => {
      const p = opcoes.problema(campo.value);
      erro.textContent = p ?? '';
      erro.hidden = !p;
      campo.setAttribute('aria-invalid', String(Boolean(p)));
      salvar.disabled = Boolean(p);
      return !p;
    };
    campo.addEventListener('input', conferir);
    const confirmar = () => {
      if (!conferir()) return;
      resposta = campo.value.trim();
      d.close();
    };
    campo.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      confirmar();
    });
    salvar.addEventListener('click', confirmar);
    cancelar.addEventListener('click', () => d.close());

    d.append(
      el(
        'div',
        'caixa-dialogo__linha',
        campo,
        el('span', 'caixa-dialogo__extensao', opcoes.extensao),
      ),
      erro,
      el('p', 'caixa-dialogo__pasta', `em ${opcoes.pasta}`),
      el('div', 'caixa-dialogo__botoes', cancelar, salvar),
    );
    d.addEventListener('close', () => resolve(resposta));
    document.body.append(d);
    d.showModal();
    conferir();
    campo.focus();
    campo.select();
  });
}
