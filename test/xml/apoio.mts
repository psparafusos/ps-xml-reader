// Apoio aos testes do leitor genérico: lê o XML e acrescenta a árvore
// compacta montada como objetos (nos e raizes), mais fácil de conferir.
import {
  filhosDe,
  lerXml,
  NENHUM,
  noXml,
  type LeituraXml,
  type NoXml,
} from '../../src/xml/leitor.ts';

export interface LeituraTeste extends LeituraXml {
  nos: NoXml[];
  raizes: number[];
}

export function ler(texto: string): LeituraTeste {
  const leitura = lerXml(texto);
  const nos: NoXml[] = [];
  for (let i = 0; i < leitura.quantidade; i++) nos.push(noXml(leitura, i));
  return { ...leitura, nos, raizes: filhosDe(leitura, NENHUM) };
}
