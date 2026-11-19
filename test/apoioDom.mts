// Só para os testes: um DOMParser mínimo para o Node, montado sobre o leitor
// de XML do app (src/xml/leitor.ts). Cobre o que src/nfe/parser.ts usa:
// documentElement, children, localName, namespaceURI, textContent,
// getAttribute, firstElementChild e getElementsByTagName(NS). Não é um DOM
// completo; serve para conferir a leitura da nota sem abrir a janela.
import { filhosDe, lerXml, NENHUM, noXml } from '../src/xml/leitor.ts';

type NoMinimo = ElementoMinimo | { tipo: 'texto'; valor: string };

class ElementoMinimo {
  readonly tipo = 'elemento';
  children: ElementoMinimo[] = [];
  nos: NoMinimo[] = [];
  pai: ElementoMinimo | null = null;
  readonly nome: string;
  readonly atributos: Map<string, string>;
  constructor(nome: string, atributos: Map<string, string>) {
    this.nome = nome;
    this.atributos = atributos;
  }

  get localName(): string {
    return this.nome.includes(':') ? this.nome.split(':')[1] : this.nome;
  }

  get namespaceURI(): string | null {
    const prefixo = this.nome.includes(':') ? this.nome.split(':')[0] : '';
    const attr = prefixo ? `xmlns:${prefixo}` : 'xmlns';
    return this.namespaceUri(attr);
  }

  /** Namespace pelo atributo xmlns (ou xmlns:prefixo) mais próximo. */
  namespaceUri(attr: string): string | null {
    const v = this.atributos.get(attr);
    if (v !== undefined) return v || null;
    return this.pai ? this.pai.namespaceUri(attr) : null;
  }

  get firstElementChild(): ElementoMinimo | null {
    return this.children[0] ?? null;
  }

  get textContent(): string {
    return this.nos
      .map((n) => (n.tipo === 'texto' ? n.valor : n.textContent))
      .join('');
  }

  getAttribute(nome: string): string | null {
    return this.atributos.get(nome) ?? null;
  }

  getAttributeNames(): string[] {
    return [...this.atributos.keys()];
  }

  private descendentes(cond: (e: ElementoMinimo) => boolean): ElementoMinimo[] {
    const r: ElementoMinimo[] = [];
    const pilha = [...this.children].reverse();
    while (pilha.length) {
      const e = pilha.pop()!;
      if (cond(e)) r.push(e);
      pilha.push(...[...e.children].reverse());
    }
    return r;
  }

  getElementsByTagNameNS(ns: string, tag: string): ElementoMinimo[] {
    return this.descendentes(
      (e) => e.localName === tag && e.namespaceURI === ns,
    );
  }

  getElementsByTagName(tag: string): ElementoMinimo[] {
    return this.descendentes((e) => e.nome === tag);
  }
}

class DocumentoMinimo {
  readonly documentElement: ElementoMinimo;
  constructor(raiz: ElementoMinimo) {
    this.documentElement = raiz;
  }
  getElementsByTagName(tag: string): ElementoMinimo[] {
    return this.documentElement.nome === tag
      ? [this.documentElement]
      : this.documentElement.getElementsByTagName(tag);
  }
}

export class DOMParserMinimo {
  parseFromString(texto: string): DocumentoMinimo {
    const leitura = lerXml(texto);
    if (leitura.erro)
      throw new Error(`XML malformado: ${JSON.stringify(leitura.erro)}`);
    const montar = (i: number): ElementoMinimo => {
      const no = noXml(leitura, i);
      const e = new ElementoMinimo(
        no.nome,
        new Map((no.atributos ?? []).map((a) => [a.nome, a.valor])),
      );
      for (const f of filhosDe(leitura, i)) {
        const filho = noXml(leitura, f);
        if (filho.tipo === 'elemento') {
          const fe = montar(f);
          fe.pai = e;
          e.children.push(fe);
          e.nos.push(fe);
        } else if (filho.tipo === 'texto' || filho.tipo === 'cdata') {
          e.nos.push({ tipo: 'texto', valor: filho.valor });
        }
      }
      return e;
    };
    const raiz = filhosDe(leitura, NENHUM).find(
      (i) => noXml(leitura, i).tipo === 'elemento',
    );
    if (raiz === undefined) throw new Error('XML sem elemento raiz');
    return new DocumentoMinimo(montar(raiz));
  }
}

/** Liga o DOMParser mínimo no globalThis (o parser da nota usa o global). */
export function ligarDomMinimo(): void {
  (globalThis as { DOMParser?: unknown }).DOMParser = DOMParserMinimo;
}
