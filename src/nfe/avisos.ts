// Avisos da nota na Conferência: quantidade recebida diferente da nota,
// totais que não fecham, nota de outra empresa e nota já conferida (um
// .psxml com a mesma chave na pasta de destino). Lógica pura, sem DOM e sem
// Electron: a tela e o processo principal só juntam os dados e mostram.

import { idDaAnotacao } from './config';
import * as f from './formato';
import type { Anotacoes, Item, Nota } from './tipos';

/**
 * CNPJ da empresa (destinatário esperado das notas), só dígitos. É o valor
 * padrão: o config.json pode trocar (chave cnpjEmpresa).
 */
export const CNPJ_EMPRESA_PADRAO = '09076777000104';

/** Coluna de anotação que liga a conferência de quantidade. */
export const ID_QTD_RECEBIDA = idDaAnotacao('Qtd recebida');

const soDigitos = (s: string) => s.replace(/\D/g, '');

/** CNPJ válido para a configuração (14 dígitos), só dígitos; senão null. */
export function cnpjDaConfig(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = soDigitos(v);
  return d.length === 14 ? d : null;
}

/**
 * Número digitado numa anotação, ou null se não é número. Aceita vírgula
 * decimal ("10,5"), ponto de milhar com vírgula ("1.000,5"), só ponto de
 * milhar ("1.000") e ponto decimal ("10.5").
 */
export function numeroDigitado(texto: string): number | null {
  let t = texto.trim().replace(/\s/g, '');
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  if (t.includes(',')) {
    if (t.indexOf(',') !== t.lastIndexOf(',')) return null;
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export interface DivergenciaQtd {
  nItem: string;
  nota: number;
  recebida: number;
}

/**
 * Itens com a Qtd recebida (preenchida e numérica) diferente da Qtd da nota
 * (qCom, na unidade comercial da nota). Texto que não é número não conta.
 */
export function divergenciasQtd(
  itens: Item[],
  anotacoes: Anotacoes,
): DivergenciaQtd[] {
  const digitadas = anotacoes.get(ID_QTD_RECEBIDA);
  if (!digitadas) return [];
  const lista: DivergenciaQtd[] = [];
  for (const i of itens) {
    const texto = digitadas.get(i.nItem);
    if (texto === undefined) continue;
    const recebida = numeroDigitado(texto);
    const nota = Number(i.qCom);
    if (recebida === null || !Number.isFinite(nota)) continue;
    // Até 4 casas, como a quantidade da NF-e.
    if (Math.round(recebida * 1e4) !== Math.round(nota * 1e4))
      lista.push({ nItem: i.nItem, nota, recebida });
  }
  return lista;
}

/** Centavos de um valor do XML ("123.45" -> 12345); vazio conta zero. */
export const centavos = (bruto: string) =>
  Math.round((Number(bruto) || 0) * 100);

export interface DiferencaTotal {
  /** Itens contra o total dos produtos, ou duplicatas contra o da nota. */
  qual: 'itens' | 'duplicatas';
  /** Soma calculada e valor da nota, em centavos. */
  soma: number;
  total: number;
}

/** Tolerância das somas, em centavos (R$ 0,01). */
const TOLERANCIA_CENTAVOS = 1;

/**
 * Somas que não batem com a nota: valor dos itens contra o total dos
 * produtos; duplicatas contra o valor total da nota (só se houver duplicatas).
 */
export function diferencasTotais(n: Nota): DiferencaTotal[] {
  const lista: DiferencaTotal[] = [];
  const somaItens = n.itens.reduce((t, i) => t + centavos(i.vProd), 0);
  const totalProdutos = centavos(n.totais.vProd);
  if (Math.abs(somaItens - totalProdutos) > TOLERANCIA_CENTAVOS)
    lista.push({ qual: 'itens', soma: somaItens, total: totalProdutos });
  if (n.duplicatas.length > 0) {
    const somaDup = n.duplicatas.reduce((t, d) => t + centavos(d.vDup), 0);
    const totalNota = centavos(n.totais.vNF);
    if (Math.abs(somaDup - totalNota) > TOLERANCIA_CENTAVOS)
      lista.push({ qual: 'duplicatas', soma: somaDup, total: totalNota });
  }
  return lista;
}

/** true se o destinatário não é a empresa (CNPJ diferente, ou CPF). */
export function ehOutraEmpresa(n: Nota, cnpjEmpresa: string): boolean {
  return soDigitos(n.destinatario.CNPJ) !== soDigitos(cnpjEmpresa);
}

/**
 * Nome de arquivo que pode ser a conferência desta nota: .psxml com
 * "_NF<número>" (sem zeros à esquerda) no nome, como o Salvar grava
 * (<FORNECEDOR>_NF<número>[-S<série>]_Conferencia.psxml). Serve para não
 * abrir todos os arquivos da pasta; a chave confirma depois.
 */
export function nomePodeSerConferencia(nome: string, nNF: string): boolean {
  if (!/^\d+$/.test(nNF) || !/\.psxml$/i.test(nome)) return false;
  const numero = nNF.replace(/^0+(?=\d)/, '');
  return new RegExp(`_NF0*${numero}(?!\\d)`, 'i').test(nome);
}

/** Chave de acesso da nota dentro de um .psxml (ou XML), ou null. */
export function chaveDoArquivo(texto: string): string | null {
  const m = /\bId\s*=\s*["']NFe(\d{44})["']/.exec(texto);
  return m ? m[1] : null;
}

/** Um .psxml da pasta de destino com a mesma chave da nota aberta. */
export interface Conferido {
  caminho: string;
  nome: string;
  /** Data de modificação (ISO). */
  modificado: string;
}

export type Aviso =
  | ({ tipo: 'qtd' } & DivergenciaQtd)
  | ({ tipo: 'total' } & DiferencaTotal)
  | { tipo: 'outra-empresa'; cnpj: string; cpf: string; nome: string }
  | { tipo: 'conferido'; arquivo: Conferido };

/**
 * Todos os avisos, na ordem da faixa. Cada item com a quantidade recebida
 * diferente é um aviso (conta no contador da faixa).
 */
export function avisosDaNota(dados: {
  nota: Nota;
  anotacoes: Anotacoes;
  /** A coluna Qtd recebida está na configuração (e visível). */
  comQtdRecebida: boolean;
  cnpjEmpresa: string;
  conferidos: Conferido[];
}): Aviso[] {
  const { nota } = dados;
  const avisos: Aviso[] = [];
  if (ehOutraEmpresa(nota, dados.cnpjEmpresa))
    avisos.push({
      tipo: 'outra-empresa',
      cnpj: nota.destinatario.CNPJ,
      cpf: nota.destinatario.CPF,
      nome: nota.destinatario.xNome,
    });
  for (const arquivo of dados.conferidos)
    avisos.push({ tipo: 'conferido', arquivo });
  if (dados.comQtdRecebida) {
    for (const d of divergenciasQtd(nota.itens, dados.anotacoes))
      avisos.push({ tipo: 'qtd', ...d });
  }
  for (const d of diferencasTotais(nota)) avisos.push({ tipo: 'total', ...d });
  return avisos;
}

/** Centavos em reais na tela ("R$ 1.234,56"). */
export const reais = (c: number) => f.moeda((c / 100).toFixed(2));

/** Data e hora no formato da tela ("28/10/2026 14:05"). */
export function dataHoraArquivo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** Título e detalhe de um aviso, para a lista da faixa. */
export function textoAviso(a: Aviso): { titulo: string; detalhe: string } {
  switch (a.tipo) {
    case 'qtd':
      return {
        titulo: `Item ${a.nItem}: quantidade recebida diferente da nota`,
        detalhe: `Nota ${f.quantidade(String(a.nota))}, recebida ${f.quantidade(String(a.recebida))}.`,
      };
    case 'total': {
      const dif = reais(Math.abs(a.soma - a.total));
      return a.qual === 'itens'
        ? {
            titulo: 'Soma dos itens diferente do total dos produtos',
            detalhe: `Soma dos itens ${reais(a.soma)}, total dos produtos na nota ${reais(a.total)}, diferença de ${dif}.`,
          }
        : {
            titulo: 'Soma das duplicatas diferente do valor da nota',
            detalhe: `Soma das duplicatas ${reais(a.soma)}, valor total da nota ${reais(a.total)}, diferença de ${dif}.`,
          };
    }
    case 'outra-empresa': {
      const doc = a.cnpj
        ? `CNPJ ${f.cnpj(a.cnpj)}`
        : a.cpf
          ? `CPF ${f.cpf(a.cpf)}`
          : 'sem CNPJ';
      return {
        titulo: 'Nota de outra empresa',
        detalhe: `O destinatário é ${a.nome || 'outro'} (${doc}), não a empresa.`,
      };
    }
    case 'conferido':
      return {
        titulo: 'Nota já conferida',
        detalhe: `Já existe ${a.arquivo.nome} na pasta de destino, modificado em ${dataHoraArquivo(a.arquivo.modificado)}.`,
      };
  }
}

// ---------- datas: vencimento das duplicatas e idade da nota ----------

/** Parcela que vence em até tantos dias: aviso leve (config.json). */
export const DIAS_AVISO_VENCIMENTO_PADRAO = 15;
/** Nota emitida há mais que tantos dias: aviso leve (config.json). */
export const DIAS_NOTA_ANTIGA_PADRAO = 30;

/** Número de dias da configuração (inteiro de 0 a 3650), ou `padrao`. */
export function diasDaConfig(v: unknown, padrao: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3650
    ? v
    : padrao;
}

/**
 * Dias de `hoje` até a data `bruto` do XML ("2026-11-13" ou o começo de
 * "2026-10-28T10:00:00-03:00"): negativo se já passou. Conta datas do
 * calendário (a hora não importa); a data é a escrita no XML, sem fuso.
 * null se não for data.
 */
export function diasAte(bruto: string, hoje: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(bruto);
  if (!m) return null;
  const alvo = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - base) / 86_400_000);
}

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/** "venceu há 20 dias", "vence hoje", "vence em 10 dias". */
export function distanciaVencimento(d: number): string {
  if (d < 0) return `venceu há ${dias(-d)}`;
  if (d === 0) return 'vence hoje';
  return `vence em ${dias(d)}`;
}

export type NivelParcela = 'vencida' | 'proxima' | 'ok';

export interface SituacaoParcela {
  nDup: string;
  dVenc: string;
  vDup: string;
  /** Dias até o vencimento (negativo: vencida); null sem data. */
  dias: number | null;
  nivel: NivelParcela;
  /** "Parcela 001, 13/10/2026, R$ 100,00: venceu há 20 dias." */
  texto: string;
}

/**
 * Cada duplicata comparada com a data de hoje (não com a emissão): vencida
 * antes de hoje; próxima se vence de hoje até `diasAviso` dias.
 */
export function situacaoParcelas(
  n: Nota,
  hoje: Date,
  diasAviso: number,
): SituacaoParcela[] {
  return n.duplicatas.map((d) => {
    const ate = diasAte(d.dVenc, hoje);
    const nivel: NivelParcela =
      ate === null
        ? 'ok'
        : ate < 0
          ? 'vencida'
          : ate <= diasAviso
            ? 'proxima'
            : 'ok';
    const valor = reais(centavos(d.vDup));
    const data = f.data(d.dVenc) || 'sem data';
    const distancia =
      ate === null ? 'sem data de vencimento' : distanciaVencimento(ate);
    const nome = d.nDup ? `Parcela ${d.nDup}` : 'Parcela';
    return {
      nDup: d.nDup,
      dVenc: d.dVenc,
      vDup: d.vDup,
      dias: ate,
      nivel,
      texto:
        nivel === 'vencida'
          ? `${nome}, ${data}, ${valor}: ${distancia}. Falar com o fornecedor para prorrogar.`
          : `${nome}, ${data}, ${valor}: ${distancia}.`,
    };
  });
}

export interface IdadeNota {
  /** Dias desde a emissão (0 = hoje); null sem data de emissão. */
  dias: number | null;
  /** Mais antiga que `diasNotaAntiga`: aviso leve. */
  antiga: boolean;
  /** "Emitida há 75 dias (20/08/2026)", "Emitida hoje (03/11/2026)". */
  texto: string;
}

/** Idade da nota contada a partir de hoje, pela data de emissão (dhEmi). */
export function idadeNota(
  n: Nota,
  hoje: Date,
  diasNotaAntiga: number,
): IdadeNota {
  const ate = diasAte(n.ide.dhEmi, hoje);
  if (ate === null)
    return { dias: null, antiga: false, texto: 'Sem data de emissão' };
  // Emissão com data futura (relógio errado): conta como hoje.
  const idade = Math.max(0, -ate);
  const data = f.data(n.ide.dhEmi);
  const antiga = idade > diasNotaAntiga;
  const quando =
    idade === 0
      ? 'Emitida hoje'
      : idade === 1
        ? 'Emitida ontem'
        : `Emitida há ${dias(idade)}`;
  return {
    dias: idade,
    antiga,
    texto: antiga
      ? `${quando}: confira vencimentos e pedido`
      : `${quando} (${data})`,
  };
}
