// Modelo comum dos documentos auxiliares montados pelo PS Reader (DACTE,
// DANFSe, DANFE NFC-e, Evento): blocos com título, linhas de campos (rótulo
// e valor, com largura proporcional), texto livre e tabela. Puro, sem DOM:
// cada documento monta o seu modelo a partir do XML, os testes conferem o
// modelo e ./folha.ts o desenha. Também as formatações que os documentos
// têm em comum. Nenhum texto que não venha do XML, além dos rótulos.

import * as f from '../nfe/formato';

export type Alinhamento = 'esq' | 'dir' | 'centro';

export interface Campo {
  rotulo: string;
  valor: string;
  /** Largura relativa na linha. */
  peso: number;
  alinhar?: Alinhamento;
  /** Fundo cinza claro (campos em destaque do modelo). */
  destaque?: boolean;
}

export interface Coluna {
  titulo: string;
  peso: number;
  alinhar?: Alinhamento;
}

export interface Bloco {
  /** Classe do bloco (dx-bloco--<chave>), para o leiaute de cada documento. */
  chave: string;
  titulo: string | null;
  linhas?: Campo[][];
  /** Texto livre, com quebras de linha preservadas. */
  texto?: { rotulo: string | null; valor: string };
  /** Tabela que pode continuar na folha seguinte, linha a linha. */
  tabela?: { colunas: Coluna[]; linhas: string[][] };
  /** Um texto só no lugar dos campos (bloco suprimido, aviso do modelo). */
  aviso?: string;
}

export function campo(
  rotulo: string,
  valor: string,
  peso = 1,
  opcoes: { alinhar?: Alinhamento; destaque?: boolean } = {},
): Campo {
  return { rotulo, valor, peso, ...opcoes };
}

/** Campo de valor em reais, alinhado à direita ("1.234,50"). */
export function campoValor(rotulo: string, bruto: string, peso = 1): Campo {
  return campo(rotulo, f.valor(bruto), peso, { alinhar: 'dir' });
}

// ---------- formatação ----------

export function juntar(partes: string[], sep: string): string {
  return partes
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .join(sep);
}

/** CNPJ ou CPF com máscara; o que vier preenchido. */
export function documento(CNPJ: string, CPF: string, outro = ''): string {
  if (CNPJ) return f.cnpj(CNPJ);
  if (CPF) return f.cpf(CPF);
  return outro;
}

/** "2026-02-03T15:02:35-03:00" -> "03/02/2026 15:02:35" (hora do XML). */
export function dataHoraSegundos(bruto: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/.exec(bruto);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : f.data(bruto);
}

/** "2026-02" ou "2026-02-01" -> "02/2026"; data completa -> "dd/mm/aaaa". */
export function competencia(bruto: string): string {
  const mes = /^(\d{4})-(\d{2})$/.exec(bruto);
  if (mes) return `${mes[2]}/${mes[1]}`;
  return f.data(bruto);
}

/** Percentual do XML ("5.00" ou "0.05" já em percentual) -> "5,00". */
export function percentual(bruto: string): string {
  return f.valor(bruto);
}

/** Corta o texto em `max` caracteres com reticências (regra dos modelos). */
export function limitar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 3)}...` : texto;
}

/** Descrição de um código pela tabela: "1 - Normal"; código fora da tabela fica como veio. */
export function descrever(
  codigo: string,
  tabela: Record<string, string>,
  comCodigo = true,
): string {
  if (!codigo) return '';
  const d = tabela[codigo];
  if (!d) return codigo;
  return comCodigo ? `${codigo} - ${d}` : d;
}

/** "Sim" / "Não" de um indicador 1/2 (ou 1/0); outro valor fica como veio. */
export function simNao(codigo: string, sim = '1', nao = '2'): string {
  if (codigo === sim) return 'Sim';
  if (codigo === nao) return 'Não';
  return codigo;
}

export { f };
