// "Gerar XML de importação" na tela: o motivo da opção apagada no menu do
// Salvar e o resumo antes de gravar (quantos itens vão vinculados, quantos
// convertidos de unidade, quantos ficam como vieram e por quê, com a lista).
// A lógica da cópia é de src/nfe/importacao.ts.

import type { EstadoCodigoCasa } from './cadastro/codigoCasa';
import { novaCaixa } from './dialogos';
import { botao, el } from './dom';
import { ROTULO_SITUACAO, type PlanoImportacao } from './nfe/importacao';

export const AJUDA_IMPORTACAO =
  'Cópia do XML com os produtos da casa, para o sistema de gestão';

/**
 * Por que a opção fica apagada, ou null se pode gerar. `estados`: o código da
 * casa de cada item da nota aberta.
 */
export function motivoSemImportacao(c: {
  nfe: boolean;
  copiaImportacao: boolean;
  comCadastro: boolean;
  estados: readonly EstadoCodigoCasa[];
}): string | null {
  if (!c.nfe) return 'Só para NF-e';
  if (c.copiaImportacao) return 'O arquivo aberto já é uma cópia de importação';
  if (!c.comCadastro)
    return 'Carregue o cadastro do sistema de gestão em Documentos de referência';
  if (!c.estados.some((e) => e.situacao === 'definido' && e.escolha?.codigo))
    return 'Nenhum item com produto da casa definido';
  return null;
}

const plural = (n: number, um: string, varios: string) =>
  `${n} ${n === 1 ? um : varios}`;

/** Linhas da contagem do resumo (também usadas no teste da janela). */
export function linhasResumo(p: PlanoImportacao): string[] {
  const l = [
    `${plural(p.vinculados, 'item vai vinculado', 'itens vão vinculados')} ao produto da casa`,
    `${plural(p.convertidos, 'item convertido', 'itens convertidos')} para a unidade de venda`,
    `${plural(p.comoVieram, 'item fica como veio', 'itens ficam como vieram')}`,
  ];
  const motivos: [keyof PlanoImportacao['porMotivo'], string][] = [
    ['sem-produto', 'sem produto da casa definido'],
    ['sem-codigo-barras', 'produto sem código de barras no cadastro'],
    ['sem-fator', 'sem fator para a unidade da nota'],
  ];
  for (const [k, texto] of motivos)
    if (p.porMotivo[k] > 0) l.push(`${p.porMotivo[k]} ${texto}`);
  return l;
}

/**
 * Resumo antes de gravar. Devolve true para Gerar, false para Cancelar (ou
 * Esc).
 */
export function confirmarImportacao(
  p: PlanoImportacao,
  nomeArquivo: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const { d, corpo, fim } = novaCaixa<boolean>(
      'Gerar XML de importação',
      `Vai ser gravado ${nomeArquivo} na pasta de destino: uma cópia do XML só para importar no sistema de gestão, sem a assinatura. O XML original da nota não muda.`,
      false,
      resolve,
    );
    d.classList.add('caixa-importacao');
    const contagem = el('ul', 'importacao__contagem');
    for (const t of linhasResumo(p)) contagem.append(el('li', '', t));
    const tabela = el('table', 'importacao__lista');
    const cab = el('tr', '');
    for (const t of ['Item', 'Descrição na nota', 'Na cópia'])
      cab.append(el('th', '', t));
    tabela.append(el('thead', '', cab));
    const corpoTabela = el('tbody', '');
    for (const i of p.itens) {
      const tr = el('tr', `importacao__item importacao__item--${i.situacao}`);
      tr.dataset.situacao = i.situacao;
      tr.append(
        el('td', '', i.nItem),
        el('td', '', i.xProd),
        el(
          'td',
          '',
          el('strong', '', ROTULO_SITUACAO[i.situacao]),
          el('span', 'importacao__detalhe', i.detalhe),
        ),
      );
      corpoTabela.append(tr);
    }
    tabela.append(corpoTabela);
    corpo.append(
      contagem,
      el('div', 'importacao__rolagem', tabela),
      el(
        'p',
        'caixa-dialogo__texto',
        'Use a cópia só para importar. O arquivo da nota continua sendo o XML original.',
      ),
    );
    const cancelar = botao('botao botao--claro', 'Cancelar');
    const gerar = botao('botao botao--principal', 'Gerar');
    cancelar.addEventListener('click', () => fim(false));
    gerar.addEventListener('click', () => fim(true));
    d.append(el('footer', 'caixa-dialogo__botoes', cancelar, gerar));
    document.body.append(d);
    d.showModal();
    gerar.focus();
  });
}
