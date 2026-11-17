// Formato "Cadastro do sistema de gestão", versão 1 (docs/formato-cadastro.md):
// o arquivo JSON que a loja exporta do próprio sistema de gestão para o app
// sugerir, item a item da NF-e de compra, o produto do cadastro (código da
// casa), o fator de conversão e os avisos. O app só conhece este formato
// genérico, nunca as tabelas de um sistema específico.
//
// Aqui ficam os tipos e o validador. Lógica pura, sem Node e sem Electron,
// e sem import em tempo de execução (só `import type`): o mesmo arquivo roda
// no serviço de leitura pesada, nos testes e, compilado sozinho, no medidor
// (scripts/medir-cadastro.mjs).
//
// O validador separa duas coisas:
// - erro de formato (JSON quebrado, seção que falta, campo obrigatório
//   ausente ou de outro tipo): o arquivo é recusado inteiro, com a lista do
//   que falhou e onde;
// - ponto de atenção (código de produto repetido, vínculo para produto que
//   não existe, NCM que não tem 8 dígitos): o arquivo é aceito, o registro
//   ou o valor fica de fora e o ponto vai para o relatório da leitura.
// Campos e seções a mais são tolerados (ficam de fora, citados nas
// observações).

export const VERSAO_FORMATO_CADASTRO = 1;

/** Erros guardados com o detalhe; acima disto, só a contagem. */
export const LIMITE_ERROS_CADASTRO = 20;
/** Pontos de atenção guardados com o detalhe; acima disto, só a contagem. */
export const LIMITE_PONTOS_CADASTRO = 200;

export interface MetaCadastro {
  versao: number;
  /** Nome livre da origem ("Sistema da loja, exportação de segunda"). */
  origem: string;
  /** Data (AAAA-MM-DD) ou data e hora (AAAA-MM-DDTHH:MM[:SS]) da extração. */
  extraidoEm: string;
}

export interface FornecedorCadastro {
  /** CNPJ (14 dígitos) ou CPF (11), só dígitos. */
  cnpjCpf: string;
  nome: string;
  ativo: boolean;
}

export interface ProdutoCadastro {
  /** Código da casa, sempre texto. */
  codigo: string;
  descricao: string;
  /** Unidade de venda (e de estoque). */
  unidade: string;
  codigoBarras: string | null;
  referencia: string | null;
  /** 8 dígitos; null se não veio ou não tinha 8 dígitos. */
  ncm: string | null;
  ativo: boolean;
  custo: number | null;
  preco: number | null;
  /** Data em que o código passou a ser de outra mercadoria, se houve. */
  reaproveitadoEm: string | null;
}

export interface VinculoCadastro {
  /** CNPJ ou CPF do fornecedor. */
  fornecedor: string;
  /** Código do produto no fornecedor, exatamente como vem na nota (cProd). */
  codigoFornecedor: string;
  /** Código da casa. */
  produto: string;
}

export interface FatorCadastro {
  fornecedor: string;
  produto: string;
  /** Unidade da nota (uCom) a que o fator se refere. */
  unidadeCompra: string;
  /** Quantas unidades de venda há em uma unidade de compra. */
  fator: number;
  ultimaEntrada: string | null;
}

export interface NotaLancadaCadastro {
  /** Chave de acesso, 44 dígitos. */
  chave: string;
  entrada: string | null;
}

export interface Cadastro {
  meta: MetaCadastro;
  fornecedores: FornecedorCadastro[];
  produtos: ProdutoCadastro[];
  vinculos: VinculoCadastro[];
  fatores: FatorCadastro[];
  notasLancadas: NotaLancadaCadastro[];
}

/** Algo aceito com ressalva: o registro (ou só o valor) ficou de fora. */
export interface PontoCadastro {
  /** "produtos, registro 12". */
  onde: string;
  motivo: string;
  valor: string;
}

export interface QuantidadesCadastro {
  fornecedores: number;
  produtos: number;
  produtosAtivos: number;
  vinculos: number;
  fatores: number;
  notasLancadas: number;
}

export interface RelatorioCadastro {
  quantidades: QuantidadesCadastro;
  pontos: PontoCadastro[];
  totalPontos: number;
  observacoes: string[];
}

export type ResultadoValidacaoCadastro =
  | { ok: true; cadastro: Cadastro; relatorio: RelatorioCadastro }
  | { ok: false; erros: string[]; totalErros: number };

// ---------- conferência dos valores ----------

type Registro = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Registro =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** AAAA-MM-DD de um dia que existe. */
export function dataValida(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = RE_DATA.exec(v);
  return !!m && diaExiste(+m[1], +m[2], +m[3]);
}

function diaExiste(a: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return d <= dias;
}

function dataOuDataHora(v: unknown): v is string {
  if (dataValida(v)) return true;
  if (typeof v !== 'string') return false;
  const m = RE_DATA_HORA.exec(v);
  return (
    !!m &&
    diaExiste(+m[1], +m[2], +m[3]) &&
    +m[4] < 24 &&
    +m[5] < 60 &&
    (m[6] === undefined || +m[6] < 60)
  );
}

/** Texto curto para a mensagem: o que veio no lugar do esperado. */
function mostrar(v: unknown): string {
  if (v === undefined) return 'nada';
  if (typeof v === 'string') {
    const t = v.length > 40 ? `${v.slice(0, 40)}...` : v;
    return `"${t}"`;
  }
  if (Array.isArray(v)) return 'uma lista';
  if (typeof v === 'object' && v !== null) return 'um objeto';
  return String(v);
}

// Nomes dos campos no arquivo (português, sem acento) e o que cada seção
// conhece; o resto é campo extra, tolerado.
const CAMPOS = {
  meta: ['versao', 'origem', 'extraido_em'],
  fornecedores: ['cnpj_cpf', 'nome', 'ativo'],
  produtos: [
    'codigo',
    'descricao',
    'unidade',
    'codigo_barras',
    'referencia',
    'ncm',
    'ativo',
    'custo',
    'preco',
    'reaproveitado_em',
  ],
  vinculos: ['fornecedor', 'codigo_fornecedor', 'produto'],
  fatores: [
    'fornecedor',
    'produto',
    'unidade_compra',
    'fator',
    'ultima_entrada',
  ],
  notas_lancadas: ['chave', 'entrada'],
} as const;

type Secao = keyof typeof CAMPOS;
const SECOES = Object.keys(CAMPOS) as Secao[];
const OPCIONAIS: ReadonlySet<Secao> = new Set(['fatores', 'notas_lancadas']);

/**
 * Lê o texto do arquivo (UTF-8, com ou sem BOM) e valida. Nunca lança:
 * JSON quebrado vira erro de formato com a posição.
 */
export function validarTextoCadastro(
  texto: string,
): ResultadoValidacaoCadastro {
  let dados: unknown;
  try {
    dados = JSON.parse(texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return {
      ok: false,
      erros: [`O arquivo não é um JSON válido (${detalhe}).`],
      totalErros: 1,
    };
  }
  return validarCadastro(dados);
}

/** Valida o objeto já lido do JSON. Nunca lança. */
export function validarCadastro(dados: unknown): ResultadoValidacaoCadastro {
  const erros: string[] = [];
  let totalErros = 0;
  const erro = (m: string) => {
    totalErros++;
    if (erros.length < LIMITE_ERROS_CADASTRO) erros.push(m);
  };
  const pontos: PontoCadastro[] = [];
  let totalPontos = 0;
  const ponto = (onde: string, motivo: string, valor: unknown) => {
    totalPontos++;
    if (pontos.length < LIMITE_PONTOS_CADASTRO)
      pontos.push({
        onde,
        motivo,
        valor:
          typeof valor === 'string'
            ? valor
            : valor == null
              ? ''
              : String(valor),
      });
  };
  /** Campos extras por seção (só os nomes, para a observação). */
  const extras = new Map<string, Set<string>>();

  if (!ehObjeto(dados))
    return {
      ok: false,
      erros: [
        'O arquivo não tem o formato do cadastro: esperado um objeto JSON com meta, fornecedores, produtos e vinculos.',
      ],
      totalErros: 1,
    };

  const faltando = SECOES.filter((s) => !OPCIONAIS.has(s) && !(s in dados));
  if (faltando.length === SECOES.length - OPCIONAIS.size)
    return {
      ok: false,
      erros: [
        'O arquivo não parece o cadastro do sistema de gestão: não tem meta, fornecedores, produtos nem vinculos.',
      ],
      totalErros: 1,
    };
  for (const s of faltando) erro(`Falta a seção ${s}.`);

  const outrasSecoes = Object.keys(dados).filter(
    (k) => !(SECOES as string[]).includes(k),
  );

  // ---------- meta ----------
  let meta: MetaCadastro | null = null;
  if ('meta' in dados) {
    const m = dados.meta;
    if (!ehObjeto(m)) erro(`meta deve ser um objeto (veio ${mostrar(m)}).`);
    else {
      anotarExtras(extras, 'meta', m);
      const versaoOk = m.versao === VERSAO_FORMATO_CADASTRO;
      if (!versaoOk)
        erro(
          typeof m.versao === 'number'
            ? `meta.versao ${m.versao} não é conhecida: este app lê a versão ${VERSAO_FORMATO_CADASTRO}.`
            : `meta.versao deve ser o número ${VERSAO_FORMATO_CADASTRO} (veio ${mostrar(m.versao)}).`,
        );
      const origemOk = typeof m.origem === 'string' && m.origem.trim() !== '';
      if (!origemOk)
        erro(
          `meta.origem deve ser um texto com o nome da origem (veio ${mostrar(m.origem)}).`,
        );
      const dataOk = dataOuDataHora(m.extraido_em);
      if (!dataOk)
        erro(
          `meta.extraido_em deve ser a data da extração, AAAA-MM-DD ou AAAA-MM-DDTHH:MM:SS (veio ${mostrar(m.extraido_em)}).`,
        );
      if (versaoOk && origemOk && dataOk)
        meta = {
          versao: VERSAO_FORMATO_CADASTRO,
          origem: (m.origem as string).trim(),
          extraidoEm: m.extraido_em as string,
        };
    }
  }

  /** Lista da seção; null (com erro) se não for lista. */
  const lista = (s: Secao): unknown[] | null => {
    if (!(s in dados)) return OPCIONAIS.has(s) ? [] : null;
    const v = dados[s];
    if (!Array.isArray(v)) {
      erro(`${s} deve ser uma lista (veio ${mostrar(v)}).`);
      return null;
    }
    return v;
  };

  /**
   * Percorre os registros de uma seção: cada campo é lido por `ler`, que
   * anota o erro com o lugar ("produtos, registro 3: ...") e devolve
   * undefined quando o valor não serve.
   */
  function registros<T>(
    s: Secao,
    montar: (r: Registro, campo: Leitor, onde: string) => T | undefined,
  ): T[] {
    const v = lista(s);
    if (!v) return [];
    const saida: T[] = [];
    v.forEach((r, i) => {
      const onde = `${s}, registro ${i + 1}`;
      if (!ehObjeto(r)) {
        erro(`${onde}: deve ser um objeto (veio ${mostrar(r)}).`);
        return;
      }
      anotarExtras(extras, s, r);
      let falhou = false;
      const campo: Leitor = (nome, regra) => {
        const valor = r[nome];
        const lido = regra(valor, nome in r);
        if (typeof lido === 'object' && lido !== null && 'falha' in lido) {
          falhou = true;
          erro(`${onde}: ${nome} ${lido.falha} (veio ${mostrar(valor)}).`);
          return undefined;
        }
        return lido;
      };
      const item = montar(r, campo, onde);
      if (!falhou && item !== undefined) saida.push(item);
    });
    return saida;
  }

  const fornecedores = registros<FornecedorCadastro>(
    'fornecedores',
    (_r, c) => {
      const cnpjCpf = c('cnpj_cpf', docFiscal);
      const nome = c('nome', textoObrigatorio);
      const ativo = c('ativo', booleano);
      if (cnpjCpf === undefined || nome === undefined || ativo === undefined)
        return undefined;
      return {
        cnpjCpf: cnpjCpf as string,
        nome: nome as string,
        ativo: ativo as boolean,
      };
    },
  );

  const produtosLidos = registros<ProdutoCadastro & { onde: string }>(
    'produtos',
    (r, c, onde) => {
      const codigo = c('codigo', codigoCasa);
      const descricao = c('descricao', textoObrigatorio);
      const unidade = c('unidade', textoObrigatorio);
      const codigoBarras = c('codigo_barras', textoOpcional);
      const referencia = c('referencia', textoOpcional);
      const ncmBruto = c('ncm', textoOpcional);
      const ativo = c('ativo', booleano);
      const custo = c('custo', numeroOpcional);
      const preco = c('preco', numeroOpcional);
      const reaproveitadoEm = c('reaproveitado_em', dataOpcional);
      if (
        [
          codigo,
          descricao,
          unidade,
          codigoBarras,
          referencia,
          ncmBruto,
          ativo,
          custo,
          preco,
          reaproveitadoEm,
        ].includes(undefined)
      )
        return undefined;
      let ncm = ncmBruto as string | null;
      if (ncm !== null && !/^\d{8}$/.test(ncm)) {
        ponto(onde, 'NCM sem 8 dígitos (o valor ficou de fora)', r.ncm);
        ncm = null;
      }
      return {
        onde,
        codigo: codigo as string,
        descricao: descricao as string,
        unidade: unidade as string,
        codigoBarras: codigoBarras as string | null,
        referencia: referencia as string | null,
        ncm,
        ativo: ativo as boolean,
        custo: custo as number | null,
        preco: preco as number | null,
        reaproveitadoEm: reaproveitadoEm as string | null,
      };
    },
  );

  const vinculosLidos = registros<VinculoCadastro & { onde: string }>(
    'vinculos',
    (_r, c, onde) => {
      const fornecedor = c('fornecedor', docFiscal);
      const codigoFornecedor = c('codigo_fornecedor', codigoComoTexto);
      const produto = c('produto', codigoCasa);
      if (
        fornecedor === undefined ||
        codigoFornecedor === undefined ||
        produto === undefined
      )
        return undefined;
      return {
        onde,
        fornecedor: fornecedor as string,
        codigoFornecedor: codigoFornecedor as string,
        produto: produto as string,
      };
    },
  );

  const fatoresLidos = registros<FatorCadastro & { onde: string }>(
    'fatores',
    (_r, c, onde) => {
      const fornecedor = c('fornecedor', docFiscal);
      const produto = c('produto', codigoCasa);
      const unidadeCompra = c('unidade_compra', textoObrigatorio);
      const fator = c('fator', numeroPositivo);
      const ultimaEntrada = c('ultima_entrada', dataOpcional);
      if (
        [fornecedor, produto, unidadeCompra, fator, ultimaEntrada].includes(
          undefined,
        )
      )
        return undefined;
      return {
        onde,
        fornecedor: fornecedor as string,
        produto: produto as string,
        unidadeCompra: unidadeCompra as string,
        fator: fator as number,
        ultimaEntrada: ultimaEntrada as string | null,
      };
    },
  );

  const notasLidas = registros<NotaLancadaCadastro>(
    'notas_lancadas',
    (_r, c) => {
      const chave = c('chave', chaveAcesso);
      const entrada = c('entrada', dataOpcional);
      if (chave === undefined || entrada === undefined) return undefined;
      return { chave: chave as string, entrada: entrada as string | null };
    },
  );

  if (totalErros > 0 || !meta) {
    if (totalErros === 0) erro('Falta a seção meta.');
    return {
      ok: false,
      erros:
        totalErros > erros.length
          ? [...erros, `... e mais ${totalErros - erros.length}.`]
          : erros,
      totalErros,
    };
  }

  // ---------- coerência entre as seções (pontos de atenção) ----------
  const produtos: ProdutoCadastro[] = [];
  const codigos = new Set<string>();
  for (const { onde, ...p } of produtosLidos) {
    if (codigos.has(p.codigo)) {
      ponto(onde, 'código de produto repetido (ficou o primeiro)', p.codigo);
      continue;
    }
    codigos.add(p.codigo);
    produtos.push(p);
  }
  if (produtos.length === 0)
    return {
      ok: false,
      erros: [
        'A seção produtos está vazia: sem produtos não há o que sugerir.',
      ],
      totalErros: 1,
    };

  const conhecidos = new Set(fornecedores.map((f) => f.cnpjCpf));
  const foraDaLista = new Set<string>();
  const vinculos: VinculoCadastro[] = [];
  const vistos = new Set<string>();
  let vinculosRepetidos = 0;
  for (const { onde, ...v } of vinculosLidos) {
    if (!codigos.has(v.produto)) {
      ponto(
        onde,
        'vínculo para produto que não está em produtos (ficou de fora)',
        v.produto,
      );
      continue;
    }
    const chave = `${v.fornecedor}\u0001${v.codigoFornecedor}\u0001${v.produto}`;
    if (vistos.has(chave)) {
      vinculosRepetidos++;
      continue;
    }
    vistos.add(chave);
    if (!conhecidos.has(v.fornecedor)) foraDaLista.add(v.fornecedor);
    vinculos.push(v);
  }

  const fatores: FatorCadastro[] = [];
  for (const { onde, ...f } of fatoresLidos) {
    if (!codigos.has(f.produto)) {
      ponto(
        onde,
        'fator para produto que não está em produtos (ficou de fora)',
        f.produto,
      );
      continue;
    }
    if (!conhecidos.has(f.fornecedor)) foraDaLista.add(f.fornecedor);
    fatores.push(f);
  }

  const notasLancadas: NotaLancadaCadastro[] = [];
  const chaves = new Set<string>();
  for (const n of notasLidas) {
    if (chaves.has(n.chave)) continue;
    chaves.add(n.chave);
    notasLancadas.push(n);
  }

  const observacoes: string[] = [];
  if (!('fatores' in dados))
    observacoes.push(
      'Sem a seção fatores: o fator de conversão não é sugerido.',
    );
  if (!('notas_lancadas' in dados))
    observacoes.push(
      'Sem a seção notas_lancadas: o aviso de nota já lançada não aparece.',
    );
  if (foraDaLista.size > 0)
    observacoes.push(
      `${foraDaLista.size} ${foraDaLista.size === 1 ? 'CNPJ ou CPF aparece' : 'CNPJs ou CPFs aparecem'} em vinculos ou fatores sem estar em fornecedores (usados assim mesmo, sem o nome).`,
    );
  if (vinculosRepetidos > 0)
    observacoes.push(
      `${vinculosRepetidos} ${vinculosRepetidos === 1 ? 'vínculo repetido igual foi contado' : 'vínculos repetidos iguais foram contados'} uma vez só.`,
    );
  if (notasLidas.length > notasLancadas.length)
    observacoes.push(
      `${notasLidas.length - notasLancadas.length} ${notasLidas.length - notasLancadas.length === 1 ? 'chave de nota repetida foi contada' : 'chaves de nota repetidas foram contadas'} uma vez só.`,
    );
  if (outrasSecoes.length > 0)
    observacoes.push(
      `Seções a mais, ignoradas: ${resumirNomes(outrasSecoes)}.`,
    );
  for (const [s, nomes] of extras)
    observacoes.push(
      `Campos a mais em ${s}, ignorados: ${resumirNomes([...nomes])}.`,
    );

  return {
    ok: true,
    cadastro: {
      meta,
      fornecedores,
      produtos,
      vinculos,
      fatores,
      notasLancadas,
    },
    relatorio: {
      quantidades: {
        fornecedores: fornecedores.length,
        produtos: produtos.length,
        produtosAtivos: produtos.filter((p) => p.ativo).length,
        vinculos: vinculos.length,
        fatores: fatores.length,
        notasLancadas: notasLancadas.length,
      },
      pontos,
      totalPontos,
      observacoes,
    },
  };
}

// ---------- regras de cada campo ----------

/** Lê um campo: o valor convertido, ou `{ falha }` com o que se esperava. */
type Regra = (v: unknown, presente: boolean) => unknown;
type Leitor = (nome: string, regra: Regra) => unknown;

const falha = (m: string) => ({ falha: m });

function textoObrigatorio(v: unknown): unknown {
  if (typeof v !== 'string' || v.trim() === '')
    return falha('é obrigatório e deve ser um texto não vazio');
  return v.trim();
}

/** Ausente, null ou texto vazio: null. */
function textoOpcional(v: unknown, presente: boolean): unknown {
  if (!presente || v === null) return null;
  if (typeof v !== 'string') return falha('deve ser um texto ou null');
  return v.trim() === '' ? null : v.trim();
}

function booleano(v: unknown): unknown {
  return typeof v === 'boolean'
    ? v
    : falha('é obrigatório e deve ser true ou false');
}

function numeroOpcional(v: unknown, presente: boolean): unknown {
  if (!presente || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
    return falha('deve ser um número maior ou igual a zero, ou null');
  return v;
}

function numeroPositivo(v: unknown): unknown {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0)
    return falha('é obrigatório e deve ser um número maior que zero');
  return v;
}

function dataOpcional(v: unknown, presente: boolean): unknown {
  if (!presente || v === null) return null;
  return dataValida(v) ? v : falha('deve ser uma data AAAA-MM-DD ou null');
}

/** CNPJ ou CPF: só dígitos, 14 ou 11. */
function docFiscal(v: unknown): unknown {
  if (typeof v !== 'string' || !/^(\d{14}|\d{11})$/.test(v))
    return falha(
      'deve ser o CNPJ (14 dígitos) ou o CPF (11), só os dígitos, como texto',
    );
  return v;
}

/** Código da casa: texto; número inteiro também é aceito e lido como texto. */
function codigoCasa(v: unknown): unknown {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)
    return String(v);
  if (typeof v !== 'string' || v.trim() === '')
    return falha(
      'é obrigatório e deve ser o código da casa (texto ou número inteiro)',
    );
  return v.trim();
}

/**
 * Código do fornecedor: só texto. Número não serve porque perde os zeros à
 * esquerda ("009381" e "9381" são códigos diferentes). Mantém o que veio,
 * com os espaços: quem compara decide o que ignorar.
 */
function codigoComoTexto(v: unknown): unknown {
  if (typeof v === 'number')
    return falha(
      'deve ser texto entre aspas, como veio na nota (número perde os zeros à esquerda)',
    );
  if (typeof v !== 'string' || v.trim() === '')
    return falha(
      'é obrigatório e deve ser o código como veio na nota, em texto',
    );
  return v;
}

function chaveAcesso(v: unknown): unknown {
  if (typeof v !== 'string' || !/^\d{44}$/.test(v))
    return falha('deve ser a chave de acesso com 44 dígitos, como texto');
  return v;
}

function anotarExtras(extras: Map<string, Set<string>>, s: Secao, r: Registro) {
  const conhecidos = CAMPOS[s] as readonly string[];
  for (const k of Object.keys(r)) {
    if (conhecidos.includes(k)) continue;
    let nomes = extras.get(s);
    if (!nomes) extras.set(s, (nomes = new Set()));
    if (nomes.size < 50) nomes.add(k);
  }
}

function resumirNomes(nomes: string[]): string {
  const mostrar = nomes.slice(0, 8).join(', ');
  return nomes.length > 8 ? `${mostrar} e mais ${nomes.length - 8}` : mostrar;
}
