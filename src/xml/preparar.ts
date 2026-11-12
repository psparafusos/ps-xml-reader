// Preparo de um XML qualquer para a tela do leitor genérico: decodifica, lê a
// árvore (até 20 MB) e monta as linhas da vista Texto. Puro (sem Electron,
// sem DOM, sem disco): hoje roda no processo principal; na parte 2 passa para
// o utilityProcess sem mudar. O tamanho já foi conferido pelo stat antes de
// ler (src/leitorXml/arquivo.ts).

import { NENHUM, TIPOS } from './arvore';
import type { Codificacao, OrigemCodificacao } from './decodificar';
import { decodificarXml } from './decodificar';
import type { ErroXml, LeituraXml } from './leitor';
import { contarControles, lerXml } from './leitor';
import { avaliarTamanho } from './limites';
import type { LinhasTexto } from './texto';
import { formatarTexto } from './texto';

export interface CodificacaoLida {
  codificacao: Codificacao;
  origem: OrigemCodificacao;
  declarada: string | null;
}

export interface LeituraPreparada {
  ok: true;
  /** 'arvore': árvore e texto; 'texto': modo leve ou fundo demais. */
  modo: 'arvore' | 'texto';
  /** Por que a árvore ficou desligada: tamanho ou profundidade. */
  semArvore: 'tamanho' | 'profundidade' | null;
  codificacao: CodificacaoLida;
  /** Aviso da decodificação (a declarada não confere), ou null. */
  avisoCodificacao: string | null;
  /** Primeiro erro de XML malformado (só no modo árvore), ou null. */
  erro: ErroXml | null;
  /** Caracteres de controle proibidos no texto. */
  controles: number;
  /** O arquivo tem <!DOCTYPE ...> (mostrado como texto, nunca processado). */
  doctype: boolean;
  arvore: LeituraXml | null;
  linhas: LinhasTexto;
  texto: string;
}

export interface LeituraRecusada {
  ok: false;
  motivo: 'binario' | 'vazio' | 'grande';
  mensagem: string;
}

export type ResultadoPreparo = LeituraPreparada | LeituraRecusada;

const RE_DOCTYPE = /<!DOCTYPE[\s>[]/;
const TIPO_DOCTYPE = TIPOS.indexOf('doctype');

/** Etapa do preparo (para quem mostra o andamento). */
export type EtapaPreparo = 'decodificando' | 'arvore' | 'linhas';

/** Prepara os bytes do arquivo para a tela. */
export function prepararLeitura(
  bytes: Uint8Array,
  aoEtapa: (etapa: EtapaPreparo) => void = () => {},
): ResultadoPreparo {
  const tamanho = avaliarTamanho(bytes.byteLength);
  if (tamanho.modo === 'recusado') {
    return { ok: false, motivo: 'grande', mensagem: tamanho.mensagem ?? '' };
  }
  aoEtapa('decodificando');
  const dec = decodificarXml(bytes);
  if (!dec.ok) return { ok: false, motivo: dec.motivo, mensagem: dec.mensagem };
  const texto = dec.texto;

  let arvore: LeituraXml | null = null;
  let semArvore: LeituraPreparada['semArvore'] =
    tamanho.modo === 'arvore' ? null : 'tamanho';
  if (tamanho.modo === 'arvore') {
    aoEtapa('arvore');
    const leitura = lerXml(texto);
    if (leitura.profundidadeExcedida) semArvore = 'profundidade';
    else arvore = leitura;
  }

  let doctype: boolean;
  if (arvore) {
    doctype = false;
    for (let i = 0; i < arvore.quantidade && !doctype; i++) {
      // DOCTYPE só existe no nível do documento, antes da raiz.
      if (arvore.pai[i] !== NENHUM) continue;
      doctype = arvore.tipo[i] === TIPO_DOCTYPE;
    }
  } else {
    // Sem árvore: procura só no começo (o DOCTYPE vem antes da raiz).
    doctype = RE_DOCTYPE.test(texto.slice(0, 64 * 1024));
  }

  aoEtapa('linhas');
  const linhas = formatarTexto(texto);
  return {
    ok: true,
    modo: arvore ? 'arvore' : 'texto',
    semArvore,
    codificacao: {
      codificacao: dec.codificacao,
      origem: dec.origem,
      declarada: dec.declarada,
    },
    avisoCodificacao: dec.aviso,
    erro: arvore?.erro ?? null,
    controles: arvore ? arvore.controles : contarControles(texto),
    doctype,
    arvore,
    linhas,
    texto,
  };
}
