// Rascunhos das notas com anotações não salvas. Sem Electron: o processo
// principal (src/main.ts) cria um com a pasta de dados; os testes, com uma
// pasta temporária.
//
// Fechamento à força (instalador da versão nova, queda de energia, Windows
// travando) não passa pela pergunta de Salvar, Descartar ou Cancelar. Para
// não perder o trabalho, a janela manda o estado da nota enquanto a pessoa
// anota, e ele fica em <pasta de dados>/rascunhos/<id>.json. Nunca na pasta
// de destino nem ao lado do XML: um .psxml lá marca a nota como conferida.
// O rascunho não substitui o .psxml (só a pessoa salva) e o XML original
// nunca muda.
//
// Um rascunho por nota: pela chave de acesso (nfe-<chave>) ou, sem chave,
// pelo caminho do arquivo (arquivo-<hash>). Cada gravação usa a gravação
// segura do config.json (temporário com fsync e troca, src/configSeguro.ts).
// Rascunho acima de 20 MB não é gravado; com mais de 30 dias sai na abertura
// do app. As duas coisas vão para o recuperacoes.log.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { gravarAtomico, registrarNoLog } from './configSeguro';

export const PASTA_RASCUNHOS = 'rascunhos';
/** Rascunho maior que isso não é gravado (o log diz). */
export const LIMITE_BYTES_RASCUNHO = 20 * 1024 * 1024;
/** Rascunho com mais dias que isso sai na abertura do app. */
export const DIAS_RASCUNHO = 30;
export const VERSAO_RASCUNHO = 1;
const SUFIXO = '.json';
/** Cópia do .psxml do rascunho que a janela abre quando o original sumiu. */
export const SUFIXO_RECUPERADO = '.recuperado.psxml';
const SUFIXO_TEMPORARIO = /\.\d+\.\d+\.tmp$/;
const DIA_MS = 24 * 60 * 60 * 1000;

/** O que a janela e o processo principal sabem da nota. */
export interface DadosRascunho {
  /** Chave de acesso (44 dígitos), ou null se a nota não tem. */
  chave: string | null;
  /** Arquivo aberto na janela (o XML da NF-e ou o .psxml). */
  caminho: string;
  tipo: 'xml' | 'psxml';
  /** Pasta de destino da janela (a desta sessão ou a salva), se havia. */
  pastaDestino: string | null;
  fornecedor: string;
  numero: string;
  serie: string;
  versaoApp: string;
  /**
   * O .psxml que a nota teria se fosse salva agora: o XML original dentro,
   * as anotações de todas as colunas e a ordem dos itens.
   */
  psxml: string;
}

export interface Rascunho extends DadosRascunho {
  versao: typeof VERSAO_RASCUNHO;
  id: string;
  /** Data e hora da última alteração (ISO). */
  alteradoEm: string;
}

export type ResultadoGravarRascunho =
  | { status: 'gravado'; id: string }
  | { status: 'grande-demais'; id: string; bytes: number }
  | { status: 'erro'; id: string; mensagem: string };

export interface OpcoesRascunhos {
  /** Pasta de dados (lida a cada uso); os rascunhos vão na subpasta. */
  pasta: () => string;
  /** Data e hora das gravações e do log (os testes fixam). */
  agora?: () => Date;
}

export interface Rascunhos {
  /** Pasta dos rascunhos (<pasta de dados>/rascunhos). */
  pasta(): string;
  gravar(dados: DadosRascunho): ResultadoGravarRascunho;
  ler(id: string): Rascunho | null;
  /** Os rascunhos válidos, do alterado mais recente para o mais antigo. */
  listar(): Rascunho[];
  /** true se havia o rascunho e ele saiu. */
  apagar(id: string): boolean;
  /**
   * Abertura do app: apaga os rascunhos com mais de 30 dias (uma linha no
   * log por rascunho), os temporários de gravações interrompidas e as cópias
   * .recuperado.psxml da execução anterior. Devolve os rascunhos apagados.
   */
  limparNaAbertura(): Rascunho[];
  /**
   * Grava o .psxml do rascunho como arquivo, para a janela abrir quando o
   * original não está mais no caminho gravado. Devolve o caminho.
   */
  gravarRecuperado(r: Rascunho): string;
  /** true se o caminho fica dentro da pasta dos rascunhos. */
  dentroDaPasta(caminho: string): boolean;
}

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Id do rascunho: pela chave de acesso; sem chave, pelo caminho. */
export function idDoRascunho(chave: string | null, caminho: string): string {
  if (chave !== null && /^\d{44}$/.test(chave)) return `nfe-${chave}`;
  const hash = createHash('sha256')
    .update(path.resolve(caminho).toLowerCase())
    .digest('hex')
    .slice(0, 32);
  return `arquivo-${hash}`;
}

/** true se `id` tem o formato de um id de rascunho (nada de caminho). */
export function idValido(id: unknown): id is string {
  return (
    typeof id === 'string' && /^(nfe-\d{44}|arquivo-[0-9a-f]{32})$/.test(id)
  );
}

/** Texto do arquivo como rascunho, ou null se não é um rascunho válido. */
export function interpretarRascunho(texto: string): Rascunho | null {
  let v: unknown;
  try {
    v = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!objeto(v) || v.versao !== VERSAO_RASCUNHO || !idValido(v.id))
    return null;
  const textos = [
    'caminho',
    'fornecedor',
    'numero',
    'serie',
    'versaoApp',
    'psxml',
    'alteradoEm',
  ];
  if (!textos.every((k) => typeof v[k] === 'string')) return null;
  if (
    v.chave !== null &&
    !(typeof v.chave === 'string' && /^\d{44}$/.test(v.chave))
  )
    return null;
  if (v.tipo !== 'xml' && v.tipo !== 'psxml') return null;
  if (v.pastaDestino !== null && typeof v.pastaDestino !== 'string')
    return null;
  if (v.psxml === '' || v.caminho === '') return null;
  if (Number.isNaN(Date.parse(v.alteradoEm as string))) return null;
  return v as unknown as Rascunho;
}

/** "Fornecedor, NF 123 série 1", para o log. */
export function descreverRascunho(
  r: Pick<DadosRascunho, 'fornecedor' | 'numero' | 'serie'>,
): string {
  const nota = [
    r.numero ? `NF ${r.numero}` : 'NF sem número',
    r.serie ? `série ${r.serie}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `${r.fornecedor || 'Fornecedor sem nome'}, ${nota}`;
}

export function criarRascunhos(opcoes: OpcoesRascunhos): Rascunhos {
  const agora = opcoes.agora ?? (() => new Date());
  const pasta = () => path.join(opcoes.pasta(), PASTA_RASCUNHOS);
  const arquivo = (id: string) => path.join(pasta(), `${id}${SUFIXO}`);
  /** Ids já registrados no log como grandes demais ou com erro (uma vez). */
  const registrados = new Set<string>();

  function registrar(linha: string): void {
    registrarNoLog(opcoes.pasta(), linha, agora(), 'rascunhos');
  }

  function registrarUmaVez(chave: string, linha: string): void {
    if (registrados.has(chave)) return;
    registrados.add(chave);
    registrar(linha);
  }

  function gravar(dados: DadosRascunho): ResultadoGravarRascunho {
    const id = idDoRascunho(dados.chave, dados.caminho);
    const r: Rascunho = {
      versao: VERSAO_RASCUNHO,
      id,
      alteradoEm: agora().toISOString(),
      chave: dados.chave,
      caminho: dados.caminho,
      tipo: dados.tipo,
      pastaDestino: dados.pastaDestino,
      fornecedor: dados.fornecedor,
      numero: dados.numero,
      serie: dados.serie,
      versaoApp: dados.versaoApp,
      psxml: dados.psxml,
    };
    const texto = `${JSON.stringify(r, null, 2)}\n`;
    const bytes = Buffer.byteLength(texto, 'utf8');
    if (bytes > LIMITE_BYTES_RASCUNHO) {
      registrarUmaVez(
        `grande:${id}`,
        `Rascunho não gravado: ${(bytes / 1024 / 1024).toFixed(1)} MB passa do limite de ${LIMITE_BYTES_RASCUNHO / 1024 / 1024} MB (${descreverRascunho(r)}).`,
      );
      return { status: 'grande-demais', id, bytes };
    }
    try {
      gravarAtomico(arquivo(id), texto);
      registrados.delete(`erro:${id}`);
      return { status: 'gravado', id };
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      registrarUmaVez(
        `erro:${id}`,
        `Rascunho não gravado (${descreverRascunho(r)}): ${mensagem}`,
      );
      return { status: 'erro', id, mensagem };
    }
  }

  function lerArquivo(nome: string): Rascunho | null {
    try {
      const r = interpretarRascunho(
        readFileSync(path.join(pasta(), nome), 'utf8'),
      );
      // O nome manda: um arquivo renomeado não vale por outra nota.
      return r && `${r.id}${SUFIXO}` === nome ? r : null;
    } catch {
      return null;
    }
  }

  function nomes(): string[] {
    try {
      return readdirSync(pasta());
    } catch {
      return [];
    }
  }

  function ler(id: string): Rascunho | null {
    return idValido(id) ? lerArquivo(`${id}${SUFIXO}`) : null;
  }

  function listar(): Rascunho[] {
    return nomes()
      .filter((n) => n.endsWith(SUFIXO) && idValido(n.slice(0, -SUFIXO.length)))
      .map(lerArquivo)
      .filter((r): r is Rascunho => r !== null)
      .sort((a, b) => b.alteradoEm.localeCompare(a.alteradoEm));
  }

  function apagar(id: string): boolean {
    if (!idValido(id)) return false;
    try {
      statSync(arquivo(id));
    } catch {
      return false;
    }
    try {
      rmSync(arquivo(id), { force: true });
      return true;
    } catch {
      // Preso por outro programa: sai na próxima vez.
      return false;
    }
  }

  function limparNaAbertura(): Rascunho[] {
    const limite = agora().getTime() - DIAS_RASCUNHO * DIA_MS;
    const apagados: Rascunho[] = [];
    for (const nome of nomes()) {
      const cheio = path.join(pasta(), nome);
      try {
        if (
          nome.endsWith(SUFIXO_RECUPERADO) ||
          (SUFIXO_TEMPORARIO.test(nome) && !nome.includes(`.${process.pid}.`))
        ) {
          rmSync(cheio, { force: true });
          continue;
        }
        if (!nome.endsWith(SUFIXO)) continue;
        const r = lerArquivo(nome);
        const quando = r
          ? Date.parse(r.alteradoEm)
          : statSync(cheio).mtime.getTime();
        if (quando >= limite) continue;
        rmSync(cheio, { force: true });
        if (r) apagados.push(r);
        registrar(
          r
            ? `Rascunho com mais de ${DIAS_RASCUNHO} dias apagado: ${descreverRascunho(r)}, alterado em ${r.alteradoEm}.`
            : `Rascunho ilegível com mais de ${DIAS_RASCUNHO} dias apagado: ${nome}.`,
        );
      } catch {
        // Preso por outro programa: tenta na próxima abertura.
      }
    }
    return apagados;
  }

  function gravarRecuperado(r: Rascunho): string {
    const destino = path.join(pasta(), `${r.id}${SUFIXO_RECUPERADO}`);
    gravarAtomico(destino, r.psxml);
    return destino;
  }

  function dentroDaPasta(caminho: string): boolean {
    const relativo = path.relative(
      path.resolve(pasta()).toLowerCase(),
      path.resolve(caminho).toLowerCase(),
    );
    return (
      relativo !== '' &&
      !relativo.startsWith('..') &&
      !path.isAbsolute(relativo)
    );
  }

  return {
    pasta,
    gravar,
    ler,
    listar,
    apagar,
    limparNaAbertura,
    gravarRecuperado,
    dentroDaPasta,
  };
}
