// Tela de boas-vindas (visual Bancada): aparece na primeira abertura normal
// quando não há CNPJ da loja gravado no config.json (o processo principal
// decide, canal boas-vindas). Pede o CNPJ da loja, obrigatório e conferido
// com os dígitos verificadores; o nome do perfil e a pasta de destino já vêm
// preenchidos e podem ficar como estão. Os documentos de referência são só
// um link para as Configurações. Sem CNPJ válido a tela não fecha (nem com
// Esc); fechar o app continua valendo. A sugestão do CNPJ (o destinatário
// que mais aparece nas notas recentes) só preenche o campo quando a pessoa
// clica em Usar este CNPJ: nada é gravado sem o Começar.

import { botao, el, icone } from './dom';
import { ICONES } from './icones';
import { mascaraCnpj, problemaCnpj } from './nfe/cnpj';

export const TITULO_BOAS_VINDAS = 'Boas-vindas ao PS Reader';
export const TEXTO_CNPJ =
  'Serve para conferir se as notas abertas são da loja: nota para outro CNPJ ganha aviso.';

export interface AcoesBoasVindas {
  /** Diálogo de pasta (nada é gravado); null se cancelou. */
  escolherPasta(): Promise<string | null>;
  /** Abre as Configurações na aba dos documentos de referência. */
  abrirDocumentos(): void;
  concluir(dados: DadosBoasVindas): Promise<ResultadoBoasVindas>;
}

/** Campo com rótulo, ajuda e a linha de erro embaixo. */
function campo(
  id: string,
  rotulo: string,
  entrada: HTMLElement,
  ajuda: string,
  ...extra: HTMLElement[]
): { bloco: HTMLElement; erro: HTMLParagraphElement } {
  const l = el('label', 'boas-vindas__rotulo', rotulo);
  l.htmlFor = id;
  const a = el('p', 'boas-vindas__ajuda boas-vindas__texto', ajuda);
  a.id = `${id}-ajuda`;
  const erro = el('p', 'boas-vindas__erro');
  erro.id = `${id}-erro`;
  erro.setAttribute('role', 'alert');
  erro.hidden = true;
  entrada.setAttribute('aria-describedby', `${a.id} ${erro.id}`);
  return {
    bloco: el('div', 'boas-vindas__campo', l, entrada, a, ...extra, erro),
    erro,
  };
}

function mostrarErro(
  p: HTMLParagraphElement,
  entrada: HTMLElement | null,
  texto: string | null,
): void {
  p.textContent = texto ?? '';
  p.hidden = !texto;
  if (entrada) {
    if (texto) entrada.setAttribute('aria-invalid', 'true');
    else entrada.removeAttribute('aria-invalid');
  }
}

/**
 * Mostra a tela e resolve quando a configuração foi gravada (Começar com
 * CNPJ válido). Devolve o resultado da gravação, para a janela aplicar o
 * perfil e a pasta.
 */
export function mostrarBoasVindas(
  estado: EstadoBoasVindas,
  acoes: AcoesBoasVindas,
): Promise<Extract<ResultadoBoasVindas, { status: 'ok' }>> {
  return new Promise((resolve) => {
    const titulo = el('h1', 'boas-vindas__titulo', TITULO_BOAS_VINDAS);
    titulo.id = 'boas-vindas-titulo';

    // CNPJ da loja (obrigatório).
    const cnpj = el('input', 'boas-vindas__entrada boas-vindas__entrada--cnpj');
    cnpj.id = 'boas-vindas-cnpj';
    cnpj.inputMode = 'numeric';
    cnpj.autocomplete = 'off';
    cnpj.spellcheck = false;
    cnpj.maxLength = 18;
    cnpj.required = true;
    cnpj.placeholder = '00.000.000/0000-00';
    let sugestao: HTMLElement | null = null;
    if (estado.cnpjSugerido) {
      const usar = botao(
        'botao botao--claro botao--pequeno',
        el('span', '', 'Usar este CNPJ'),
      );
      usar.addEventListener('click', () => {
        cnpj.value = mascaraCnpj(estado.cnpjSugerido!);
        mostrarErro(campoCnpj.erro, cnpj, null);
        cnpj.focus();
      });
      sugestao = el(
        'div',
        'boas-vindas__sugestao',
        el(
          'p',
          'boas-vindas__sugestao-texto boas-vindas__texto',
          'Sugestão: o destinatário que mais aparece nas suas notas recentes.',
        ),
        el(
          'span',
          'boas-vindas__sugestao-cnpj',
          mascaraCnpj(estado.cnpjSugerido),
        ),
        usar,
      );
    }
    const campoCnpj = campo(
      cnpj.id,
      'CNPJ da loja',
      cnpj,
      TEXTO_CNPJ,
      ...(sugestao ? [sugestao] : []),
    );
    cnpj.addEventListener('input', () => {
      if (!campoCnpj.erro.hidden) mostrarErro(campoCnpj.erro, cnpj, null);
    });
    cnpj.addEventListener('blur', () => {
      if (!problemaCnpj(cnpj.value))
        cnpj.value = mascaraCnpj(cnpj.value.replace(/\D/g, ''));
    });

    // Nome do perfil (opcional, já preenchido).
    const perfil = el('input', 'boas-vindas__entrada');
    perfil.id = 'boas-vindas-perfil';
    perfil.autocomplete = 'off';
    perfil.maxLength = 40;
    perfil.value = estado.nomePerfil;
    const campoPerfil = campo(
      perfil.id,
      'Nome do perfil',
      perfil,
      'O perfil guarda as colunas e as ferramentas da conferência. Pode ficar como está.',
    );
    perfil.addEventListener('input', () =>
      mostrarErro(campoPerfil.erro, perfil, null),
    );

    // Pasta de destino (opcional, já preenchida).
    let pasta: 'atual' | 'sugerida' | 'escolhida' = estado.pastaSugerida
      ? 'sugerida'
      : 'atual';
    const caminho = el('span', 'boas-vindas__caminho', estado.pasta);
    const marca = el('span', 'boas-vindas__marca', 'sugerida');
    marca.hidden = pasta !== 'sugerida';
    const trocar = botao(
      'botao botao--claro botao--pequeno',
      icone(...ICONES.pastaTrocar),
      el('span', '', 'Trocar...'),
    );
    trocar.id = 'boas-vindas-pasta';
    const linhaPasta = el(
      'div',
      'boas-vindas__pasta',
      el('span', 'boas-vindas__pasta-caminho', caminho, marca),
      trocar,
    );
    const rotuloPasta = el('p', 'boas-vindas__rotulo', 'Pasta de destino');
    rotuloPasta.id = 'boas-vindas-pasta-rotulo';
    const ajudaPasta = el(
      'p',
      'boas-vindas__ajuda boas-vindas__texto',
      'Onde o Salvar grava o PDF e a cópia editada (.psxml).',
    );
    ajudaPasta.id = 'boas-vindas-pasta-ajuda';
    const erroPasta = el('p', 'boas-vindas__erro');
    erroPasta.setAttribute('role', 'alert');
    erroPasta.hidden = true;
    trocar.setAttribute(
      'aria-describedby',
      `${rotuloPasta.id} ${ajudaPasta.id}`,
    );
    trocar.addEventListener('click', () => {
      mostrarErro(erroPasta, null, null);
      void acoes.escolherPasta().then((p) => {
        if (!p) return;
        pasta = 'escolhida';
        caminho.textContent = p;
        marca.hidden = true;
      });
    });

    // Documentos de referência: só o link.
    const docs = botao('link', 'Configurações');
    docs.addEventListener('click', () => acoes.abrirDocumentos());

    const erroGeral = el('p', 'boas-vindas__erro');
    erroGeral.setAttribute('role', 'alert');
    erroGeral.hidden = true;

    const comecar = botao(
      'botao botao--principal boas-vindas__comecar',
      el('span', '', 'Começar'),
    );

    const d = el(
      'dialog',
      'boas-vindas',
      el(
        'header',
        'boas-vindas__faixa',
        titulo,
        el(
          'p',
          'boas-vindas__subtitulo',
          'Conferência de NF-e antes do lançamento no sistema de gestão.',
        ),
      ),
      el(
        'div',
        'boas-vindas__corpo',
        el(
          'section',
          'cartao cartao--grande boas-vindas__cartao',
          el(
            'p',
            'boas-vindas__intro boas-vindas__texto',
            'Antes de começar, informe o CNPJ da loja. O resto já vem preenchido e pode ser trocado depois nas Configurações.',
          ),
          campoCnpj.bloco,
          el('h2', 'titulo-secao boas-vindas__secao', 'Opcional'),
          campoPerfil.bloco,
          el(
            'div',
            'boas-vindas__campo',
            rotuloPasta,
            linhaPasta,
            ajudaPasta,
            erroPasta,
          ),
          el(
            'p',
            'boas-vindas__docs boas-vindas__texto',
            'Documentos de referência (planilha de ST e TIPI) não são obrigatórios. Para importar agora ou depois: ',
            docs,
            '.',
          ),
          erroGeral,
          el('footer', 'boas-vindas__rodape', comecar),
        ),
      ),
    );
    d.setAttribute('aria-labelledby', titulo.id);
    // Sem CNPJ a tela não fecha: o Esc não vale.
    d.addEventListener('cancel', (e) => e.preventDefault());

    let enviando = false;
    const concluir = async () => {
      if (enviando) return;
      mostrarErro(erroGeral, null, null);
      const problema = problemaCnpj(cnpj.value);
      mostrarErro(campoCnpj.erro, cnpj, problema);
      if (problema) {
        cnpj.focus();
        return;
      }
      enviando = true;
      comecar.disabled = true;
      try {
        const r = await acoes.concluir({
          cnpj: cnpj.value,
          nomePerfil: perfil.value,
          pasta,
        });
        if (r.status === 'ok') {
          if (d.open) d.close();
          d.remove();
          resolve(r);
          return;
        }
        if (r.campo === 'cnpj') {
          mostrarErro(campoCnpj.erro, cnpj, r.mensagem);
          cnpj.focus();
        } else if (r.campo === 'perfil') {
          mostrarErro(campoPerfil.erro, perfil, r.mensagem);
          perfil.focus();
        } else if (r.campo === 'pasta') {
          mostrarErro(erroPasta, null, r.mensagem);
          trocar.focus();
        } else mostrarErro(erroGeral, null, r.mensagem);
      } catch (erro) {
        console.error(erro);
        mostrarErro(erroGeral, null, 'Não foi possível salvar. Tente de novo.');
      } finally {
        enviando = false;
        comecar.disabled = false;
      }
    };
    comecar.addEventListener('click', () => void concluir());
    for (const entrada of [cnpj, perfil])
      entrada.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void concluir();
        }
      });

    document.body.append(d);
    d.showModal();
    cnpj.focus();
  });
}
