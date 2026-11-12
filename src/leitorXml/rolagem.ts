// Rolagem virtual das vistas Árvore e Texto do leitor genérico de XML: só as
// linhas que aparecem existem na tela, todas da mesma altura. A conta de
// quais linhas mostrar está em janelaVisivel.ts. Ao rolar, as linhas que
// continuam visíveis não são recriadas (uma seleção de texto nelas fica).

import { calcularJanela, rolagemParaLinha } from './janelaVisivel';

export class RolagemVirtual {
  /** A área que rola (recebe o foco e o teclado). */
  readonly area: HTMLElement;
  private readonly espaco: HTMLElement;
  private readonly camada: HTMLElement;
  private readonly alturaLinha: number;
  private readonly desenhar: (linha: number) => HTMLElement;
  private quantidade = 0;
  private larguraMaxima = 0;
  /** Linhas desenhadas agora, da primeira à última, sem buracos. */
  private desenhadas = new Map<number, HTMLElement>();
  private primeira = 0;
  private ultima = -1;
  private pedido = 0;

  constructor(
    area: HTMLElement,
    alturaLinha: number,
    desenhar: (linha: number) => HTMLElement,
  ) {
    this.area = area;
    this.alturaLinha = alturaLinha;
    this.desenhar = desenhar;
    this.espaco = document.createElement('div');
    this.espaco.className = 'leitor-xml__espaco';
    this.camada = document.createElement('div');
    this.camada.className = 'leitor-xml__camada';
    area.append(this.espaco, this.camada);
    area.style.setProperty('--lx-altura-linha', `${alturaLinha}px`);
    area.addEventListener('scroll', () => this.agendar());
    new ResizeObserver(() => this.agendar()).observe(area);
  }

  private agendar(): void {
    if (this.pedido) return;
    this.pedido = requestAnimationFrame(() => {
      this.pedido = 0;
      this.atualizar();
    });
  }

  /** Conteúdo novo: volta ao topo e desenha do zero. */
  definir(quantidade: number): void {
    this.quantidade = quantidade;
    this.larguraMaxima = 0;
    this.espaco.style.width = '';
    this.area.scrollTop = 0;
    this.area.scrollLeft = 0;
    this.redesenhar();
  }

  /** Mudou a quantidade (abriu ou fechou um nó): mantém a posição. */
  mudarQuantidade(quantidade: number): void {
    this.quantidade = quantidade;
    this.redesenhar();
  }

  /** Desenha de novo todas as linhas visíveis (destaque da busca mudou). */
  redesenhar(): void {
    this.desenhadas.clear();
    this.ultima = -1;
    this.camada.replaceChildren();
    this.atualizar();
  }

  /** Primeira linha visível. */
  primeiraVisivel(): number {
    return calcularJanela(
      this.area.scrollTop,
      this.area.clientHeight,
      this.quantidade,
      this.alturaLinha,
    ).primeira;
  }

  /** Quantas linhas inteiras cabem na área. */
  linhasPorTela(): number {
    return Math.max(1, Math.floor(this.area.clientHeight / this.alturaLinha));
  }

  /** Rola até a linha (no centro, ou o mínimo para ela aparecer). */
  irPara(linha: number, modo: 'centro' | 'perto' = 'centro'): void {
    if (this.quantidade === 0) return;
    const alvo = rolagemParaLinha(
      linha,
      this.area.scrollTop,
      this.area.clientHeight,
      this.quantidade,
      this.alturaLinha,
      modo,
    );
    if (alvo !== this.area.scrollTop) this.area.scrollTop = alvo;
    this.atualizar();
  }

  /** O elemento da linha, se ela está desenhada. */
  elementoDa(linha: number): HTMLElement | null {
    return this.desenhadas.get(linha) ?? null;
  }

  private atualizar(): void {
    const j = calcularJanela(
      this.area.scrollTop,
      this.area.clientHeight,
      this.quantidade,
      this.alturaLinha,
    );
    this.espaco.style.height = `${j.alturaTotal}px`;
    this.camada.style.transform = `translateY(${j.topo}px)`;
    const primeira = j.primeira;
    const ultima = j.primeira + j.quantas - 1;
    const semCruzar = ultima < this.primeira || primeira > this.ultima;
    if (this.ultima < this.primeira || semCruzar) {
      this.desenhadas.clear();
      const novas: HTMLElement[] = [];
      for (let i = primeira; i <= ultima; i++) {
        const e = this.desenhar(i);
        this.desenhadas.set(i, e);
        novas.push(e);
      }
      this.camada.replaceChildren(...novas);
    } else {
      // Tira o que saiu por cima e por baixo, põe o que entrou.
      for (let i = this.primeira; i < primeira; i++) this.remover(i);
      for (let i = ultima + 1; i <= this.ultima; i++) this.remover(i);
      const inicio = Math.max(primeira, this.primeira);
      for (let i = inicio - 1; i >= primeira; i--) {
        const e = this.desenhar(i);
        this.desenhadas.set(i, e);
        this.camada.prepend(e);
      }
      for (let i = Math.min(ultima, this.ultima) + 1; i <= ultima; i++) {
        const e = this.desenhar(i);
        this.desenhadas.set(i, e);
        this.camada.append(e);
      }
    }
    this.primeira = primeira;
    this.ultima = ultima;
    // A largura só cresce: a barra de baixo não pula enquanto rola.
    const largura = this.camada.scrollWidth;
    if (largura > this.larguraMaxima) {
      this.larguraMaxima = largura;
      this.espaco.style.width = `${largura}px`;
    }
  }

  private remover(linha: number): void {
    this.desenhadas.get(linha)?.remove();
    this.desenhadas.delete(linha);
  }
}
