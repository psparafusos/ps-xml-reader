// Ferramentas do painel de conferência por perfil: a ordem, quais aparecem e,
// na "ST, MVA e CFOP", quais campos do rodapé ("Gravar a MVA em", "Gravar a
// alíquota interna em") ficam à mostra. Campo oculto some da ferramenta e o
// Aplicar não grava aquilo. Lógica pura (sem Electron, sem DOM): o processo
// principal valida o que vem da tela e o que está no config.json; o renderer
// monta o painel e a aba Ferramentas das Configurações.
//
// No config.json, chave "ferramentasPerfis" (fora dos perfis, para o arquivo
// exportado de um perfil e uma versão anterior do app continuarem iguais):
//   { "<id do perfil>": { ordem: [{ id, visivel }], camposST: { mva, aliquota },
//                         abrirEm: "leitura" | "conferencia" } }
// Perfil sem entrada: o padrão (as duas ferramentas, os dois campos, notas
// abertas em leitura protegida).

import { planoAplicar, type PlanoAplicar } from '../fiscal/entrada';
import { gravacoesAliquota, type LinhaPrevia } from '../previaST';
import type { Anotacoes } from './tipos';

export const ID_FERRAMENTA_ST = 'st-mva-cfop';
export const ID_FERRAMENTA_CFOPS = 'cfops-entrada';

/** Ferramentas do painel, na ordem padrão. */
export const FERRAMENTAS_PAINEL = [
  {
    id: ID_FERRAMENTA_ST,
    titulo: 'ST, MVA e CFOP',
    descricao:
      'Diz se cada item tem ST em Sergipe, a MVA e o CFOP de entrada, e grava nas anotações.',
  },
  {
    id: ID_FERRAMENTA_CFOPS,
    titulo: 'CFOPs de entrada',
    descricao:
      'Resumo dos valores da coluna "CFOP de entrada", com os itens de cada um.',
  },
] as const;

export type IdFerramentaPainel = (typeof FERRAMENTAS_PAINEL)[number]['id'];

/** Campos opcionais do rodapé da "ST, MVA e CFOP". */
export interface CamposST {
  /** "Gravar a MVA em". */
  mva: boolean;
  /** "Gravar a alíquota interna em". */
  aliquota: boolean;
}

export const ROTULO_CAMPO_ST: Record<keyof CamposST, string> = {
  mva: 'Gravar a MVA em',
  aliquota: 'Gravar a alíquota interna em',
};

export interface FerramentaNaOrdem {
  id: IdFerramentaPainel;
  visivel: boolean;
}

/**
 * Como um XML de NF-e abre neste perfil: em leitura protegida (só ver, o
 * padrão) ou direto na Conferência, para editar.
 */
export type AbrirNotasEm = 'leitura' | 'conferencia';

export const ROTULO_ABRIR_EM: Record<AbrirNotasEm, string> = {
  leitura: 'Leitura protegida',
  conferencia: 'Conferência',
};

const ehAbrirEm = (v: unknown): v is AbrirNotasEm =>
  v === 'leitura' || v === 'conferencia';

export interface FerramentasPerfil {
  ordem: FerramentaNaOrdem[];
  camposST: CamposST;
  abrirEm: AbrirNotasEm;
}

const IDS: readonly string[] = FERRAMENTAS_PAINEL.map((f) => f.id);
const ehId = (v: unknown): v is IdFerramentaPainel =>
  typeof v === 'string' && IDS.includes(v);

const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function ferramentasPadrao(): FerramentasPerfil {
  return {
    ordem: FERRAMENTAS_PAINEL.map((f) => ({ id: f.id, visivel: true })),
    camposST: { mva: true, aliquota: true },
    abrirEm: 'leitura',
  };
}

/**
 * Lê o que veio do config.json ou da tela, sem lançar: id desconhecido ou
 * repetido sai, ferramenta que faltou entra no fim (visível), campo que não
 * é booleano fica no padrão (à mostra), "Abrir notas em" desconhecido fica
 * em leitura protegida.
 */
export function lerFerramentas(v: unknown): FerramentasPerfil {
  const padrao = ferramentasPadrao();
  if (!objeto(v)) return padrao;
  const ordem: FerramentaNaOrdem[] = [];
  if (Array.isArray(v.ordem))
    for (const f of v.ordem) {
      if (!objeto(f) || !ehId(f.id) || ordem.some((x) => x.id === f.id))
        continue;
      ordem.push({ id: f.id, visivel: f.visivel !== false });
    }
  for (const f of padrao.ordem)
    if (!ordem.some((x) => x.id === f.id)) ordem.push(f);
  const c = objeto(v.camposST) ? v.camposST : {};
  return {
    ordem,
    camposST: {
      mva: typeof c.mva === 'boolean' ? c.mva : true,
      aliquota: typeof c.aliquota === 'boolean' ? c.aliquota : true,
    },
    abrirEm: ehAbrirEm(v.abrirEm) ? v.abrirEm : 'leitura',
  };
}

/**
 * A chave "ferramentasPerfis" do config.json. Só ficam os perfis de
 * `idsPerfis` (perfil excluído some na próxima gravação).
 */
export function lerFerramentasPorPerfil(
  v: unknown,
  idsPerfis: readonly string[],
): Record<string, FerramentasPerfil> {
  const r: Record<string, FerramentasPerfil> = {};
  if (!objeto(v)) return r;
  for (const id of idsPerfis) if (id in v) r[id] = lerFerramentas(v[id]);
  return r;
}

/** As ferramentas do perfil `id` (o padrão se não houver nada salvo). */
export function ferramentasDoPerfil(
  porPerfil: Record<string, FerramentasPerfil>,
  id: string,
): FerramentasPerfil {
  return porPerfil[id] ? lerFerramentas(porPerfil[id]) : ferramentasPadrao();
}

/** Ids das ferramentas à mostra, na ordem do perfil. */
export function ferramentasVisiveis(
  f: FerramentasPerfil,
): IdFerramentaPainel[] {
  return f.ordem.filter((x) => x.visivel).map((x) => x.id);
}

/** Cópia com a ferramenta `id` uma posição acima (-1) ou abaixo (+1). */
export function moverFerramenta(
  f: FerramentasPerfil,
  id: string,
  delta: -1 | 1,
): FerramentasPerfil {
  const ordem = f.ordem.map((x) => ({ ...x }));
  const i = ordem.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ordem.length) return { ...f, ordem };
  const [movida] = ordem.splice(i, 1);
  ordem.splice(j, 0, movida);
  return { ordem, camposST: { ...f.camposST }, abrirEm: f.abrirEm };
}

/**
 * Plano do Aplicar da "ST, MVA e CFOP" com os campos do perfil: campo oculto
 * não grava, mesmo que chegue uma coluna para ele.
 */
export function planoDoAplicar(
  linhas: LinhaPrevia[],
  anotacoes: Anotacoes,
  colunas: { cfop: string; mva: string | null; aliquota: string | null },
  campos: CamposST,
): PlanoAplicar {
  const colMva = campos.mva ? colunas.mva : null;
  const colAliq = campos.aliquota ? colunas.aliquota : null;
  const base = planoAplicar(linhas, anotacoes, colunas.cfop, colMva);
  return {
    ...base,
    gravacoes: [
      ...base.gravacoes,
      ...(colAliq ? gravacoesAliquota(linhas, anotacoes, colAliq) : []),
    ],
  };
}

/**
 * Validação estrita da chave "ferramentasPerfis" vinda de fora (backup):
 * cada entrada precisa ser de um perfil de `idsPerfis`, com a ordem só de
 * ferramentas conhecidas, sem repetir, as marcas booleanas e o "Abrir notas
 * em" (leitura ou conferencia), quando vier. Campo que esta versão não
 * conhece fica de fora sem recusar (uma versão nova pode guardar mais coisas
 * por perfil). Lança Error com o motivo, em português.
 */
export function validarFerramentasPorPerfil(
  v: unknown,
  idsPerfis: readonly string[],
): Record<string, FerramentasPerfil> {
  if (!objeto(v)) throw new Error('As ferramentas por perfil estão inválidas.');
  const r: Record<string, FerramentasPerfil> = {};
  for (const [id, f] of Object.entries(v)) {
    if (!idsPerfis.includes(id))
      throw new Error(`Ferramentas de um perfil que não existe: ${id}.`);
    if (!objeto(f) || !Array.isArray(f.ordem))
      throw new Error('As ferramentas de um perfil estão sem a ordem.');
    const vistos = new Set<string>();
    for (const x of f.ordem) {
      if (!objeto(x) || !ehId(x.id) || typeof x.visivel !== 'boolean')
        throw new Error('Uma ferramenta de um perfil está inválida.');
      if (vistos.has(x.id))
        throw new Error(`A ferramenta ${x.id} aparece duas vezes.`);
      vistos.add(x.id);
    }
    if (f.camposST !== undefined) {
      const c = f.camposST;
      if (
        !objeto(c) ||
        (c.mva !== undefined && typeof c.mva !== 'boolean') ||
        (c.aliquota !== undefined && typeof c.aliquota !== 'boolean')
      )
        throw new Error(
          'Os campos da ferramenta ST de um perfil estão inválidos.',
        );
    }
    if (f.abrirEm !== undefined && !ehAbrirEm(f.abrirEm))
      throw new Error('O "Abrir notas em" de um perfil está inválido.');
    r[id] = lerFerramentas(f);
  }
  return r;
}

/**
 * A chave "ferramentasPerfis" sem as entradas de perfis que não existem
 * mais (perfil excluído). As entradas que ficam vão como estavam, com campos
 * de versões mais novas e tudo.
 */
export function semPerfisExcluidos(
  v: unknown,
  idsPerfis: readonly string[],
): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  if (!objeto(v)) return r;
  for (const [id, f] of Object.entries(v))
    if (idsPerfis.includes(id)) r[id] = f;
  return r;
}
