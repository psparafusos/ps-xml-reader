// Busca na árvore do leitor genérico de XML: procura o termo nos nomes dos
// elementos e das instruções, nos nomes e valores dos atributos e nos textos
// (texto, CDATA, comentário, dados da instrução, DOCTYPE). Devolve, para cada
// achado, o caminho da raiz até o nó, para a tela abrir os nós até ele.
// Pura e sem recursão: os nós já estão em ordem de documento.

import { NENHUM, nomeDe, tipoDe, type ArvoreXml } from './arvore';
import { LIMITE_ACHADOS } from './limites';

/** Onde o termo apareceu dentro do nó. */
export type LugarAchado = 'nome' | 'atributo' | 'valorAtributo' | 'texto';

export interface Achado {
  /** Número do nó na árvore. */
  no: number;
  /** Nós da raiz do documento até o nó (inclusive). */
  caminho: number[];
  lugar: LugarAchado;
  /** Posição do atributo no nó, quando `lugar` é atributo ou valorAtributo. */
  atributo: number | null;
}

export interface ResultadoBusca {
  achados: Achado[];
  /** Havia mais achados que o limite; só os primeiros vieram. */
  truncado: boolean;
}

export interface OpcoesBusca {
  /** Diferenciar maiúsculas e minúsculas (padrão: não). */
  diferenciarMaiusculas?: boolean;
  /** Máximo de achados (padrão: LIMITE_ACHADOS). */
  limite?: number;
}

/** Nós da raiz até `no`, seguindo os pais. */
export function caminhoAte(arvore: ArvoreXml, no: number): number[] {
  const caminho: number[] = [];
  for (let atual = no; atual !== NENHUM; atual = arvore.pai[atual]) {
    caminho.push(atual);
  }
  return caminho.reverse();
}

/**
 * Caminho legível, como /nfeProc/NFe/infNFe/det[2]/prod/xProd. O número
 * entre colchetes aparece quando há mais de um irmão do mesmo tipo e nome;
 * nós que não são elementos aparecem como texto(), comentario(), cdata(),
 * instrucao(alvo) ou doctype().
 */
export function caminhoLegivel(arvore: ArvoreXml, no: number): string {
  const partes: string[] = [];
  for (const atual of caminhoAte(arvore, no)) {
    const pai = arvore.pai[atual];
    let irmao =
      pai === NENHUM ? arvore.primeiraRaiz : arvore.primeiroFilho[pai];
    let posicao = 0;
    let total = 0;
    for (; irmao !== NENHUM; irmao = arvore.proximoIrmao[irmao]) {
      if (
        arvore.tipo[irmao] !== arvore.tipo[atual] ||
        arvore.nome[irmao] !== arvore.nome[atual]
      ) {
        continue;
      }
      total++;
      if (irmao === atual) posicao = total;
    }
    const tipo = tipoDe(arvore, atual);
    const nome = nomeDe(arvore, atual);
    const base =
      tipo === 'elemento'
        ? nome
        : `${tipo}(${tipo === 'instrucao' ? nome : ''})`;
    partes.push(total > 1 ? `${base}[${posicao}]` : base);
  }
  return `/${partes.join('/')}`;
}

/** Procura `termo` na árvore; termo vazio não acha nada. */
export function buscar(
  arvore: ArvoreXml,
  termo: string,
  opcoes: OpcoesBusca = {},
): ResultadoBusca {
  const limite = opcoes.limite ?? LIMITE_ACHADOS;
  const achados: Achado[] = [];
  if (termo === '') return { achados, truncado: false };

  const exato = opcoes.diferenciarMaiusculas === true;
  const procurado = exato ? termo : termo.toLocaleLowerCase('pt-BR');
  const tem = (s: string) =>
    s !== '' && (exato ? s : s.toLocaleLowerCase('pt-BR')).includes(procurado);
  const trecho = (inicio: number, fim: number) =>
    fim > inicio && tem(arvore.valores.slice(inicio, fim));

  // A tabela de nomes é pequena: decide uma vez por nome.
  const nomeAcha = arvore.nomes.map(tem);

  const anotar = (
    no: number,
    lugar: LugarAchado,
    atributo: number | null,
  ): boolean => {
    if (achados.length >= limite) return false;
    achados.push({ no, caminho: caminhoAte(arvore, no), lugar, atributo });
    return true;
  };

  for (let no = 0; no < arvore.quantidade; no++) {
    const nome = arvore.nome[no];
    if (nome !== NENHUM && nomeAcha[nome] && !anotar(no, 'nome', null)) {
      return { achados, truncado: true };
    }
    const primeiro = arvore.primeiroAtributo[no];
    for (let a = 0; a < arvore.quantosAtributos[no]; a++) {
      const k = primeiro + a;
      if (nomeAcha[arvore.atributoNome[k]] && !anotar(no, 'atributo', a)) {
        return { achados, truncado: true };
      }
      if (
        trecho(arvore.atributoValorInicio[k], arvore.atributoValorFim[k]) &&
        !anotar(no, 'valorAtributo', a)
      ) {
        return { achados, truncado: true };
      }
    }
    if (
      trecho(arvore.valorInicio[no], arvore.valorFim[no]) &&
      !anotar(no, 'texto', null)
    ) {
      return { achados, truncado: true };
    }
  }
  return { achados, truncado: false };
}
