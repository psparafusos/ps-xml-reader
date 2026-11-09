// Leitor de XML próprio do leitor genérico (etapa 3 do plano da
// visualização protegida). Puro: sem DOM, sem Electron, sem rede, sem disco.
// Roda fora da janela (utilityProcess) e devolve uma árvore compacta.
//
// Regras de segurança:
// - Sem recursão: um laço só, com pilha explícita dos elementos abertos.
// - DTD nunca é processado: o <!DOCTYPE ...> inteiro vira um nó de texto.
// - Só as 5 entidades predefinidas (lt, gt, amp, quot, apos) e as
//   referências numéricas (&#...; e &#x...;) viram caractere; qualquer outra
//   (&foo;) fica literal. Nada é expandido, nada é buscado fora.
// - Mais de PROFUNDIDADE_MAXIMA níveis: para e marca.
// - XML malformado: para no primeiro erro, com linha, coluna e motivo, e
//   devolve a árvore até onde deu.
// - Caracteres de controle proibidos no XML 1.0 aparecem como [U+0001] nos
//   valores da árvore e são contados.
//
// A árvore sai compacta (colunas em typed arrays, ver arvore.ts), para
// passar por postMessage sem custo e ser percorrida sem recursão.

import {
  MontadorArvore,
  NENHUM,
  type ArvoreXml,
  type AtributoXml,
  type TipoNo,
} from './arvore';
import { PROFUNDIDADE_MAXIMA } from './limites';

export type { ArvoreXml, AtributoXml, NoXml, TipoNo } from './arvore';
export {
  atributosDe,
  filhosDe,
  NENHUM,
  nomeDe,
  noXml,
  tipoDe,
  valorDe,
} from './arvore';

export interface ErroXml {
  /** Linha, a partir de 1. */
  linha: number;
  /** Coluna em caracteres, a partir de 1. */
  coluna: number;
  /** Posição (em caracteres) no texto. */
  posicao: number;
  motivo: string;
}

export interface LeituraXml extends ArvoreXml {
  /** Primeiro erro de XML malformado, ou null. */
  erro: ErroXml | null;
  /** Passou de PROFUNDIDADE_MAXIMA níveis e parou de montar a árvore. */
  profundidadeExcedida: boolean;
  /** Quantos caracteres de controle proibidos o texto tem. */
  controles: number;
}

// Proibidos no XML 1.0: controles (menos tab, LF e CR), U+FFFE, U+FFFF e
// metades de par substituto soltas.
const CONTROLE =
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]|[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]';
const RE_CONTROLE = new RegExp(CONTROLE);
const RE_CONTROLE_G = new RegExp(CONTROLE, 'g');

/** Troca cada caractere de controle proibido por uma marca visível. */
export function marcarControles(s: string): string {
  if (!RE_CONTROLE.test(s)) return s;
  return s.replace(
    RE_CONTROLE_G,
    (c) => `[U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}]`,
  );
}

/** Quantos caracteres de controle proibidos há em `s`. */
export function contarControles(s: string): number {
  if (!RE_CONTROLE.test(s)) return 0;
  RE_CONTROLE_G.lastIndex = 0;
  let total = 0;
  while (RE_CONTROLE_G.exec(s) !== null) total++;
  return total;
}

/** Linha e coluna (a partir de 1) de uma posição; CRLF e CR contam como uma quebra. */
export function posicaoNoTexto(
  texto: string,
  posicao: number,
): { linha: number; coluna: number } {
  let linha = 1;
  let inicioLinha = 0;
  const fim = Math.min(posicao, texto.length);
  for (let i = 0; i < fim; i++) {
    const c = texto.charCodeAt(i);
    if (c === 0x0a) {
      linha++;
      inicioLinha = i + 1;
    } else if (c === 0x0d) {
      if (texto.charCodeAt(i + 1) === 0x0a) i++;
      linha++;
      inicioLinha = i + 1;
    }
  }
  return { linha, coluna: fim - inicioLinha + 1 };
}

const PREDEFINIDAS: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

const RE_NUMERICA = /^#(?:x([0-9A-Fa-f]{1,6})|([0-9]{1,7}))$/;

/**
 * Troca só as 5 entidades predefinidas e as referências numéricas; o resto
 * (&foo;, & solto) fica como está. `contar` recebe cada caractere de controle
 * gerado por uma referência numérica (&#x1;).
 */
export function trocarEntidades(s: string, contar?: () => void): string {
  let amp = s.indexOf('&');
  if (amp === -1) return s;
  let saida = '';
  let ultimo = 0;
  while (amp !== -1) {
    const pv = s.indexOf(';', amp + 1);
    // Nome de entidade longo demais ou sem ";": fica literal.
    if (pv === -1 || pv - amp > 12) {
      amp = s.indexOf('&', amp + 1);
      continue;
    }
    const nome = s.slice(amp + 1, pv);
    let troca: string | null = PREDEFINIDAS[nome] ?? null;
    if (troca === null && nome.charCodeAt(0) === 0x23) {
      const num = RE_NUMERICA.exec(nome);
      if (num) {
        const ponto = num[1] ? parseInt(num[1], 16) : parseInt(num[2], 10);
        if (ponto <= 0x10ffff) {
          troca = String.fromCodePoint(ponto);
          if (contar && RE_CONTROLE.test(troca)) contar();
        }
      }
    }
    if (troca === null) {
      amp = s.indexOf('&', amp + 1);
      continue;
    }
    saida += s.slice(ultimo, amp) + troca;
    ultimo = pv + 1;
    amp = s.indexOf('&', ultimo);
  }
  return saida + s.slice(ultimo);
}

function ehEspaco(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
}

function inicioDeNome(c: number): boolean {
  return (
    (c >= 0x61 && c <= 0x7a) || // a-z
    (c >= 0x41 && c <= 0x5a) || // A-Z
    c === 0x5f || // _
    c === 0x3a || // :
    (c >= 0xc0 && c !== 0xd7 && c !== 0xf7 && c < 0xfffe)
  );
}

function parteDeNome(c: number): boolean {
  return (
    inicioDeNome(c) ||
    (c >= 0x30 && c <= 0x39) || // 0-9
    c === 0x2d || // -
    c === 0x2e || // .
    c === 0xb7
  );
}

/** Lê o XML inteiro; nunca lança erro por causa do conteúdo. */
export function lerXml(texto: string): LeituraXml {
  const n = texto.length;
  const arvore = new MontadorArvore();
  const pilha: number[] = [];
  let erro: ErroXml | null = null;
  let profundidadeExcedida = false;
  let controlesDeReferencia = 0;
  let raizVista = false;
  let raizFechada = false;

  const contar = () => {
    controlesDeReferencia++;
  };

  const falhar = (posicao: number, motivo: string) => {
    const { linha, coluna } = posicaoNoTexto(texto, posicao);
    erro = { linha, coluna, posicao, motivo };
  };

  // Sem controle cru no texto, só uma referência (&#x1;) pode criar um:
  // aí basta marcar os valores em que alguma entidade foi trocada.
  const controlesCrus = contarControles(texto);
  const marcar = (s: string) => (controlesCrus ? marcarControles(s) : s);
  const valor = (bruto: string) => {
    const trocado = trocarEntidades(bruto, contar);
    return controlesCrus || trocado !== bruto
      ? marcarControles(trocado)
      : trocado;
  };

  const paiAtual = () => (pilha.length ? pilha[pilha.length - 1] : NENHUM);

  /** Acrescenta o nó como último filho do elemento aberto no topo da pilha. */
  const acrescentar = (
    tipo: TipoNo,
    nome: string,
    conteudo: string,
    inicio: number,
    fim: number,
    atributos: AtributoXml[] | null = null,
  ): number =>
    arvore.acrescentar(
      tipo,
      paiAtual(),
      nome,
      conteudo,
      inicio,
      fim,
      atributos,
    );

  /** Fim do nome que começa em `k` (igual a `k` se não há nome). */
  const fimDoNome = (k: number): number => {
    if (k >= n || !inicioDeNome(texto.charCodeAt(k))) return k;
    k++;
    while (k < n && parteDeNome(texto.charCodeAt(k))) k++;
    return k;
  };

  const pularEspacos = (k: number): number => {
    while (k < n && ehEspaco(texto.charCodeAt(k))) k++;
    return k;
  };

  let i = 0;
  laco: while (i < n) {
    // Texto até o próximo "<".
    const menor = texto.indexOf('<', i);
    const fimTexto = menor === -1 ? n : menor;
    if (fimTexto > i) {
      const k = pularEspacos(i);
      if (k < fimTexto) {
        if (pilha.length === 0) {
          falhar(k, 'Há texto fora do elemento raiz.');
          break;
        }
        acrescentar('texto', '', valor(texto.slice(i, fimTexto)), i, fimTexto);
      }
    }
    if (menor === -1) break;
    i = menor;
    const c1 = texto.charCodeAt(i + 1);

    if (c1 === 0x2f) {
      // </nome>
      const fimNome = fimDoNome(i + 2);
      if (fimNome === i + 2) {
        falhar(i + 2, 'Falta o nome depois de "</".');
        break;
      }
      const nome = arvore.nomeEm(texto, i + 2, fimNome);
      const k = pularEspacos(fimNome);
      if (texto.charCodeAt(k) !== 0x3e) {
        falhar(k, `Falta ">" no fechamento </${nome}>.`);
        break;
      }
      if (pilha.length === 0) {
        falhar(i, `O fechamento </${nome}> não tem elemento aberto.`);
        break;
      }
      const aberto = pilha[pilha.length - 1];
      const nomeAberto = arvore.nomeDoNo(aberto);
      if (nomeAberto !== nome) {
        falhar(
          i,
          `O fechamento </${nome}> não corresponde ao elemento aberto <${nomeAberto}>.`,
        );
        break;
      }
      arvore.definirFim(aberto, k + 1);
      pilha.pop();
      if (pilha.length === 0) raizFechada = true;
      i = k + 1;
      continue;
    }

    if (c1 === 0x3f) {
      // <?alvo dados?>
      const fim = texto.indexOf('?>', i + 2);
      if (fim === -1) {
        falhar(i, 'A instrução de processamento não foi fechada (falta "?>").');
        break;
      }
      const fimNome = fimDoNome(i + 2);
      if (fimNome === i + 2) {
        falhar(i + 2, 'Falta o nome depois de "<?".');
        break;
      }
      const dados = texto.slice(pularEspacos(fimNome), fim);
      acrescentar(
        'instrucao',
        arvore.nomeEm(texto, i + 2, fimNome),
        marcar(dados),
        i,
        fim + 2,
      );
      i = fim + 2;
      continue;
    }

    if (c1 === 0x21) {
      if (texto.startsWith('<!--', i)) {
        const fim = texto.indexOf('-->', i + 4);
        if (fim === -1) {
          falhar(i, 'O comentário não foi fechado (falta "-->").');
          break;
        }
        acrescentar(
          'comentario',
          '',
          marcar(texto.slice(i + 4, fim)),
          i,
          fim + 3,
        );
        i = fim + 3;
        continue;
      }
      if (texto.startsWith('<![CDATA[', i)) {
        if (pilha.length === 0) {
          falhar(i, 'Há um bloco CDATA fora do elemento raiz.');
          break;
        }
        const fim = texto.indexOf(']]>', i + 9);
        if (fim === -1) {
          falhar(i, 'O bloco CDATA não foi fechado (falta "]]>").');
          break;
        }
        acrescentar('cdata', '', marcar(texto.slice(i + 9, fim)), i, fim + 3);
        i = fim + 3;
        continue;
      }
      if (texto.startsWith('<!DOCTYPE', i)) {
        if (pilha.length > 0 || raizVista) {
          falhar(i, 'A declaração DOCTYPE só pode vir antes do elemento raiz.');
          break;
        }
        // Só acha o ">" final (pulando aspas, comentários e o bloco [...]).
        // Nada de dentro é interpretado.
        let k = i + 9;
        let colchetes = 0;
        let fim = -1;
        while (k < n) {
          const c = texto.charCodeAt(k);
          if (c === 0x22 || c === 0x27) {
            const fecha = texto.indexOf(c === 0x22 ? '"' : "'", k + 1);
            if (fecha === -1) break;
            k = fecha + 1;
          } else if (c === 0x3c && texto.startsWith('<!--', k)) {
            const fecha = texto.indexOf('-->', k + 4);
            if (fecha === -1) break;
            k = fecha + 3;
          } else if (c === 0x5b) {
            colchetes++;
            k++;
          } else if (c === 0x5d) {
            colchetes--;
            k++;
          } else if (c === 0x3e && colchetes <= 0) {
            fim = k;
            break;
          } else {
            k++;
          }
        }
        if (fim === -1) {
          falhar(i, 'A declaração DOCTYPE não foi fechada.');
          break;
        }
        acrescentar('doctype', '', marcar(texto.slice(i, fim + 1)), i, fim + 1);
        i = fim + 1;
        continue;
      }
      falhar(i, 'Declaração "<!" desconhecida.');
      break;
    }

    // <nome atributos> ou <nome atributos/>
    const fimNome = fimDoNome(i + 1);
    if (fimNome === i + 1) {
      falhar(i + 1, 'Falta o nome do elemento depois de "<".');
      break;
    }
    const nome = arvore.nomeEm(texto, i + 1, fimNome);
    if (pilha.length === 0 && raizFechada) {
      falhar(i, 'Há mais de um elemento raiz.');
      break;
    }
    let atributos: AtributoXml[] | null = null;
    let k = fimNome;
    let vazio = false;
    for (;;) {
      const antes = k;
      k = pularEspacos(k);
      if (k >= n) {
        falhar(i, `A marcação <${nome}> não foi fechada (falta ">").`);
        break laco;
      }
      const c = texto.charCodeAt(k);
      if (c === 0x3e) {
        k++;
        break;
      }
      if (c === 0x2f) {
        if (texto.charCodeAt(k + 1) !== 0x3e) {
          falhar(k, `Falta ">" depois de "/" em <${nome}>.`);
          break laco;
        }
        vazio = true;
        k += 2;
        break;
      }
      if (k === antes) {
        falhar(k, `Falta espaço antes do atributo em <${nome}>.`);
        break laco;
      }
      const fimAtributo = fimDoNome(k);
      if (fimAtributo === k) {
        falhar(k, `Caractere inesperado dentro de <${nome}>.`);
        break laco;
      }
      const inicioAtributo = k;
      const nomeAtributo = arvore.nomeEm(texto, k, fimAtributo);
      k = pularEspacos(fimAtributo);
      if (texto.charCodeAt(k) !== 0x3d) {
        falhar(k, `Falta "=" depois do atributo ${nomeAtributo}.`);
        break laco;
      }
      k = pularEspacos(k + 1);
      const aspas = texto.charCodeAt(k);
      if (aspas !== 0x22 && aspas !== 0x27) {
        falhar(k, `O valor do atributo ${nomeAtributo} precisa de aspas.`);
        break laco;
      }
      const fecha = texto.indexOf(aspas === 0x22 ? '"' : "'", k + 1);
      if (fecha === -1) {
        falhar(k, `O valor do atributo ${nomeAtributo} não foi fechado.`);
        break laco;
      }
      const bruto = texto.slice(k + 1, fecha);
      const menorNoValor = bruto.indexOf('<');
      if (menorNoValor !== -1) {
        falhar(
          k + 1 + menorNoValor,
          `O valor do atributo ${nomeAtributo} tem "<", que não é permitido.`,
        );
        break laco;
      }
      if (atributos?.some((a) => a.nome === nomeAtributo)) {
        falhar(inicioAtributo, `O atributo ${nomeAtributo} aparece repetido.`);
        break laco;
      }
      (atributos ??= []).push({ nome: nomeAtributo, valor: valor(bruto) });
      k = fecha + 1;
    }

    if (pilha.length >= PROFUNDIDADE_MAXIMA) {
      profundidadeExcedida = true;
      break;
    }
    const indice = acrescentar('elemento', nome, '', i, k, atributos);
    if (pilha.length === 0) raizVista = true;
    if (vazio) {
      if (pilha.length === 0) raizFechada = true;
    } else {
      pilha.push(indice);
    }
    i = k;
  }

  if (!erro && !profundidadeExcedida) {
    if (pilha.length > 0) {
      falhar(
        n,
        `O arquivo terminou com o elemento <${arvore.nomeDoNo(pilha[pilha.length - 1])}> aberto.`,
      );
    } else if (!raizVista) {
      falhar(n, 'O arquivo não tem nenhum elemento.');
    }
  }
  // Elementos que ficaram abertos terminam onde a leitura parou.
  const parou = erro ? (erro as ErroXml).posicao : i;
  for (const aberto of pilha) {
    arvore.definirFim(aberto, Math.max(arvore.fimDoNo(aberto), parou));
  }

  return {
    ...arvore.terminar(),
    erro,
    profundidadeExcedida,
    controles: controlesCrus + controlesDeReferencia,
  };
}
