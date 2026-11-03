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

  const difItens = dif('itens');
  verificacoes.push(
    difItens
      ? {
          id: 'totais-itens',
          ok: false,
          nivel: 'forte',
          titulo: 'Total dos itens',
          detalhe: textoAviso({ tipo: 'total', ...difItens }).detalhe,
        }
      : {
          id: 'totais-itens',
          ok: true,
          nivel: 'ok',
          titulo: 'Total dos itens',
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
          titulo: 'Duplicatas',
          detalhe: textoAviso({ tipo: 'total', ...difDup }).detalhe,
        }
      : {
          id: 'duplicatas',
          ok: true,
          nivel: 'ok',
          titulo: 'Duplicatas',
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
    titulo:
      vencidas > 0
        ? plural(vencidas, 'parcela vencida', 'parcelas vencidas')
        : proximas > 0
          ? `${plural(proximas, 'parcela vence', 'parcelas vencem')} em até ${d.diasAvisoVencimento} dias`
          : 'Vencimentos',
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
    titulo: 'Destinatário',
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
          titulo: 'Nota já conferida',
          detalhe: textoAviso({ tipo: 'conferido', arquivo: maisNovo }).detalhe,
          conferidos: d.conferidos,
        }
      : {
          id: 'conferida',
          ok: true,
          nivel: 'ok',
          titulo: 'Nota já conferida',
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
