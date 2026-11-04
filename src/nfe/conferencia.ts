// Resumo do painel de conferência (à esquerda da nota, modo Conferência): as
// verificações automáticas, cada uma com um nível (✓ certo, i informativo,
// ! aviso leve, ! alerta forte), e o que precisa da pessoa (as divergências
// de Qtd recebida). Lógica pura, sem DOM e sem Electron.

import {
  centavos,
  diferencasTotais,
  divergenciasQtd,
  ehOutraEmpresa,
  idadeNota,
  reais,
  situacaoParcelas,
  textoAviso,
  type Conferido,
  type SituacaoParcela,
} from './avisos';
import * as f from './formato';
import type { Anotacoes, Nota } from './tipos';

export type IdVerificacao =
  | 'idade'
  | 'totais-itens'
  | 'duplicatas'
  | 'vencimentos'
  | 'destinatario'
  | 'conferida';

/**
 * ok: ✓. info: só informa (não conta como ponto). leve: aviso leve. forte:
 * alerta forte. leve e forte contam como pontos para olhar.
 */
export type NivelVerificacao = 'ok' | 'info' | 'leve' | 'forte';

export interface Verificacao {
  id: IdVerificacao;
  /** Não conta como ponto para olhar (nível ok ou info). */
  ok: boolean;
  nivel: NivelVerificacao;
  titulo: string;
  detalhe: string;
  /** Linhas do detalhe, cada uma com o seu nível (as parcelas). */
  linhas?: { texto: string; nivel: NivelVerificacao }[];
  /** Só na "já conferida": os .psxml achados, do mais novo ao mais antigo. */
  conferidos?: Conferido[];
}

export interface Pendencia {
  nItem: string;
  titulo: string;
  detalhe: string;
}

export interface ResumoConferencia {
  verificacoes: Verificacao[];
  pendencias: Pendencia[];
  /** Verificações de nível leve ou forte mais as pendências. */
  pontos: number;
  /** Texto do topo do painel ("Tudo certo · 4 verificações"). */
  titulo: string;
}

export interface DadosConferencia {
  nota: Nota;
  anotacoes: Anotacoes;
  /** A coluna Qtd recebida está na configuração (e visível). */
  comQtdRecebida: boolean;
  cnpjEmpresa: string;
  conferidos: Conferido[];
  /** Há pasta de destino para procurar notas já conferidas. */
  temPastaDestino: boolean;
  /** Data de hoje (vencimentos e idade da nota contam a partir dela). */
  hoje: Date;
  /** Parcela que vence em até tantos dias: aviso leve. */
  diasAvisoVencimento: number;
  /** Nota emitida há mais que tantos dias: aviso leve. */
  diasNotaAntiga: number;
}

const plural = (n: number, um: string, varios: string) =>
  `${n} ${n === 1 ? um : varios}`;

export function resumoConferencia(d: DadosConferencia): ResumoConferencia {
  const { nota } = d;
  const diferencas = diferencasTotais(nota);
  const dif = (qual: 'itens' | 'duplicatas') =>
    diferencas.find((x) => x.qual === qual);
  const verificacoes: Verificacao[] = [];

  const idade = idadeNota(nota, d.hoje, d.diasNotaAntiga);
  verificacoes.push({
    id: 'idade',
    ok: !idade.antiga,
    nivel: idade.antiga ? 'leve' : 'info',
    titulo: idade.texto,
    detalhe:
      idade.dias === null
        ? 'A nota não tem data de emissão.'
        : idade.antiga
          ? `Emitida em ${f.data(nota.ide.dhEmi)}, há mais de ${d.diasNotaAntiga} dias.`
          : `Emitida em ${f.data(nota.ide.dhEmi)}. Acima de ${d.diasNotaAntiga} dias, vira aviso.`,
  });

  // Os títulos dizem o resultado ("Totais conferem", "Parcela 001 vencida há
  // 20 dias"), não a pergunta; o detalhe explica.
  const difItens = dif('itens');
  const diferenca = (x: { soma: number; total: number }) =>
    reais(Math.abs(x.soma - x.total));
  verificacoes.push(
    difItens
      ? {
          id: 'totais-itens',
          ok: false,
          nivel: 'forte',
          titulo: `Total dos itens difere em ${diferenca(difItens)}`,
          detalhe: textoAviso({ tipo: 'total', ...difItens }).detalhe,
        }
      : {
          id: 'totais-itens',
          ok: true,
          nivel: 'ok',
          titulo: 'Totais conferem',
          detalhe: `A soma dos itens, ${reais(nota.itens.reduce((t, i) => t + centavos(i.vProd), 0))}, bate com o total dos produtos.`,
        },
  );

  const difDup = dif('duplicatas');
  verificacoes.push(
    difDup
      ? {
          id: 'duplicatas',
          ok: false,
          nivel: 'forte',
          titulo: `Duplicatas diferem em ${diferenca(difDup)}`,
          detalhe: textoAviso({ tipo: 'total', ...difDup }).detalhe,
        }
      : {
          id: 'duplicatas',
          ok: true,
          nivel: 'ok',
          titulo:
            nota.duplicatas.length === 0
              ? 'Sem duplicatas'
              : 'Duplicatas conferem',
          detalhe:
            nota.duplicatas.length === 0
              ? 'A nota não tem duplicatas.'
              : `A soma das duplicatas, ${reais(nota.duplicatas.reduce((t, x) => t + centavos(x.vDup), 0))}, bate com o valor total da nota.`,
        },
  );

  const parcelas = situacaoParcelas(nota, d.hoje, d.diasAvisoVencimento);
  const vencidas = parcelas.filter((x) => x.nivel === 'vencida').length;
  const proximas = parcelas.filter((x) => x.nivel === 'proxima').length;
  const nivelVenc: NivelVerificacao =
    vencidas > 0 ? 'forte' : proximas > 0 ? 'leve' : 'ok';
  verificacoes.push({
    id: 'vencimentos',
    ok: nivelVenc === 'ok',
    nivel: nivelVenc,
    titulo: tituloParcelas(parcelas, d.diasAvisoVencimento),
    detalhe:
      parcelas.length === 0
        ? 'A nota não tem duplicatas.'
        : vencidas > 0
          ? 'Falar com o fornecedor para prorrogar.'
          : `Nenhuma parcela vencida. Datas contadas a partir de hoje.`,
    linhas: parcelas.map((x) => ({
      texto: x.texto,
      nivel:
        x.nivel === 'vencida' ? 'forte' : x.nivel === 'proxima' ? 'leve' : 'ok',
    })),
  });

  const outra = ehOutraEmpresa(nota, d.cnpjEmpresa);
  verificacoes.push({
    id: 'destinatario',
    ok: !outra,
    nivel: outra ? 'forte' : 'ok',
    titulo: outra
      ? `Destinatário é outra empresa${nota.destinatario.xNome ? `: ${nota.destinatario.xNome}` : ''}`
      : `Destinatário: ${nota.destinatario.xNome || f.cnpj(d.cnpjEmpresa)}`,
    detalhe: outra
      ? textoAviso({
          tipo: 'outra-empresa',
          cnpj: nota.destinatario.CNPJ,
          cpf: nota.destinatario.CPF,
          nome: nota.destinatario.xNome,
        }).detalhe
      : `O destinatário é a empresa (CNPJ ${f.cnpj(d.cnpjEmpresa)}).`,
  });

  const [maisNovo] = d.conferidos;
  verificacoes.push(
    maisNovo
      ? {
          id: 'conferida',
          ok: false,
          nivel: 'forte',
          titulo: `Já conferida em ${dataCurta(maisNovo.modificado)}`,
          detalhe: textoAviso({ tipo: 'conferido', arquivo: maisNovo }).detalhe,
          conferidos: d.conferidos,
        }
      : {
          id: 'conferida',
          ok: true,
          nivel: 'ok',
          titulo: d.temPastaDestino
            ? 'Primeira conferência desta nota'
            : 'Sem pasta de destino para procurar conferências',
          detalhe: d.temPastaDestino
            ? 'Nenhum .psxml desta nota na pasta de destino.'
            : 'Sem pasta de destino escolhida: não há onde procurar.',
        },
  );

  const pendencias: Pendencia[] = d.comQtdRecebida
    ? divergenciasQtd(nota.itens, d.anotacoes).map((x) => ({
        nItem: x.nItem,
        titulo: `Item ${x.nItem}: Qtd recebida diferente`,
        detalhe: textoAviso({ tipo: 'qtd', ...x }).detalhe,
      }))
    : [];

  const pontos = verificacoes.filter((v) => !v.ok).length + pendencias.length;
  return {
    verificacoes,
    pendencias,
    pontos,
    titulo:
      pontos === 0
        ? `Tudo certo · ${plural(verificacoes.length, 'verificação', 'verificações')}`
        : plural(pontos, 'ponto para olhar', 'pontos para olhar'),
  };
}

/** "28/10" (ano só quando não é o de agora); vazio se a data não for válida. */
function dataCurta(iso: string, agora = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return 'data desconhecida';
  const dd = String(t.getDate()).padStart(2, '0');
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  return t.getFullYear() === agora.getFullYear()
    ? `${dd}/${mm}`
    : `${dd}/${mm}/${t.getFullYear()}`;
}

/** Título dos vencimentos: o pior caso primeiro ("Parcela 001 vencida há 20 dias"). */
function tituloParcelas(
  parcelas: SituacaoParcela[],
  diasAviso: number,
): string {
  if (parcelas.length === 0) return 'Sem parcelas';
  const nome = (x: SituacaoParcela) =>
    x.nDup ? `Parcela ${x.nDup}` : 'Parcela';
  const dias = (n: number) => plural(n, 'dia', 'dias');
  const vencidas = parcelas.filter((x) => x.nivel === 'vencida');
  if (vencidas.length === 1)
    return `${nome(vencidas[0])} vencida há ${dias(-(vencidas[0].dias ?? 0))}`;
  if (vencidas.length > 1) {
    const maisAntiga = Math.max(...vencidas.map((x) => -(x.dias ?? 0)));
    return `${vencidas.length} parcelas vencidas, a mais antiga há ${dias(maisAntiga)}`;
  }
  const proximas = parcelas.filter((x) => x.nivel === 'proxima');
  if (proximas.length === 1) {
    const p = proximas[0];
    return p.dias === 0
      ? `${nome(p)} vence hoje`
      : `${nome(p)} vence em ${dias(p.dias ?? 0)}`;
  }
  if (proximas.length > 1)
    return `${proximas.length} parcelas vencem em até ${diasAviso} dias`;
  return 'Parcelas em dia';
}

/**
 * Painel aberto ao lado da nota sem empurrá-la: cabe na sobra à esquerda do
 * conteúdo centralizado (janela larga). Senão, o painel começa recolhido e
 * abre por cima da nota. Medidas em pixels CSS.
 */
export function painelCabeAoLado(
  larguraJanela: number,
  larguraConteudo: number,
  larguraPainel: number,
): boolean {
  return (larguraJanela - larguraConteudo) / 2 >= larguraPainel;
}

/**
 * Quanto a seção de itens cresce para cada lado quando a tabela não cabe na
 * largura do conteúdo: usa a sobra da janela (sem passar por cima do painel)
 * antes de deixar a tabela rolar. Divide entre os lados; o que um lado não
 * tem, o outro dá. Medidas em pixels CSS; tudo zero quando a tabela cabe.
 */
export function expansaoLateral(
  falta: number,
  livreEsquerda: number,
  livreDireita: number,
): { esquerda: number; direita: number } {
  const esq = Math.max(0, livreEsquerda);
  const dir = Math.max(0, livreDireita);
  const total = Math.min(Math.max(0, Math.ceil(falta)), esq + dir);
  let esquerda = Math.min(esq, Math.floor(total / 2));
  const direita = Math.min(dir, total - esquerda);
  esquerda = Math.min(esq, total - direita);
  return { esquerda, direita };
}
