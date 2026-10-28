// Monta a cópia editada (.psxml): o elemento raiz do XML original, copiado sem
// alteração, mais as anotações dos itens. Usa só DOM: o texto do usuário entra
// por createTextNode e setAttribute, nunca concatenado em string XML.

import { ID_ANOTACAO } from './colunas';
import { lerDocumento, localizarOriginal, NS_PS } from './parser';
import type { Anotacoes } from './tipos';

const AVISO = 'Cópia de uso interno. Não é NF-e e não tem validade fiscal.';

// Caracteres que não podem existir em XML 1.0. O XMLSerializer não os
// rejeita, e o arquivo sairia ilegível.
// oxlint-disable-next-line no-control-regex -- justamente os caracteres de controle inválidos em XML
const INVALIDOS_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/**
 * Gera o texto do .psxml. `textoArquivo` é o arquivo aberto (XML de NF-e ou
 * cópia editada); de uma cópia, reaproveita o original de dentro dela.
 * Só itens com anotação não vazia entram em <anotacoes>. A coluna Anotação
 * vai em <anotacao nItem> direto em <anotacoes>, como na versão 1.0.1 (que
 * continua lendo essa coluna); cada anotação extra vai num
 * <coluna id="..." titulo="...">, na ordem de `titulos` (id -> título de
 * todas as colunas de `anotacoes`). A ordem dos itens na tela vai em
 * <ordem criterio="..." direcao="..."/>.
 */
export function montarCopia(
  textoArquivo: string,
  anotacoes: Anotacoes,
  titulos: Map<string, string>,
  ordem: { criterio: string; direcao: 'asc' | 'desc' },
): string {
  const { original } = localizarOriginal(lerDocumento(textoArquivo));

  const doc = document.implementation.createDocument(
    NS_PS,
    'psCopiaEditada',
    null,
  );
  const raiz = doc.documentElement;
  raiz.setAttribute('versao', '2');

  const quebra = (recuo: string) => doc.createTextNode(`\n${recuo}`);
  const elemento = (nome: string) => doc.createElementNS(NS_PS, nome);

  const aviso = elemento('aviso');
  aviso.textContent = AVISO;

  const elOriginal = elemento('original');
  elOriginal.append(
    quebra('    '),
    doc.importNode(original, true),
    quebra('  '),
  );

  /** Os <anotacao nItem> de uma coluna, por nItem; false se não há nenhum. */
  const valores = (destino: Element, id: string, recuo: string): boolean => {
    const ordenadas = [...(anotacoes.get(id) ?? [])].sort(
      ([a], [b]) => Number(a) - Number(b),
    );
    let algum = false;
    for (const [nItem, texto] of ordenadas) {
      const limpo = texto.replace(INVALIDOS_XML, '');
      if (!limpo.trim()) continue;
      const a = elemento('anotacao');
      a.setAttribute('nItem', nItem);
      a.textContent = limpo;
      destino.append(quebra(recuo), a);
      algum = true;
    }
    return algum;
  };
  const limparTitulo = (t: string) => t.replace(INVALIDOS_XML, '');

  const elAnotacoes = elemento('anotacoes');
  elAnotacoes.setAttribute(
    'titulo',
    limparTitulo(titulos.get(ID_ANOTACAO) ?? 'Anotação'),
  );
  valores(elAnotacoes, ID_ANOTACAO, '    ');
  for (const [id, titulo] of titulos) {
    if (id === ID_ANOTACAO) continue;
    const coluna = elemento('coluna');
    coluna.setAttribute('id', id);
    coluna.setAttribute('titulo', limparTitulo(titulo));
    if (!valores(coluna, id, '      ')) continue;
    coluna.append(quebra('    '));
    elAnotacoes.append(quebra('    '), coluna);
  }
  if (elAnotacoes.childNodes.length > 0) elAnotacoes.append(quebra('  '));

  const elOrdem = elemento('ordem');
  elOrdem.setAttribute('criterio', ordem.criterio);
  elOrdem.setAttribute('direcao', ordem.direcao);

  raiz.append(
    quebra('  '),
    aviso,
    quebra('  '),
    elOriginal,
    quebra('  '),
    elAnotacoes,
    quebra('  '),
    elOrdem,
    quebra(''),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc)}\n`;
}
