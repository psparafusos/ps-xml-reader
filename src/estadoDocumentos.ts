// Estado visível de cada documento de referência: o mesmo ícone e a mesma
// cor na lista da tela inicial, nas pastilhas da barra e no selo do cartão
// da tela de Documentos. Lógica pura, sem DOM: a tela (renderer.ts e
// areaDocumentos.ts) desenha a partir daqui, e os testes conferem o mapa.

import { NOME_DOCUMENTO, type TipoDocumento } from './fiscal/documentos';
import type { ResultadoVerificacao } from './fiscal/online';
import type { SinalEstado } from './icones';
import {
  seloDocumento,
  semaforoDocumento,
  type CorSemaforo,
} from './leituraDocumentos';

/**
 * ok: carregado e lido sem problema. aviso: problemas de leitura ou versão
 * nova. faltando: obrigatório sem arquivo (ou arquivo recusado). opcional:
 * o de combustíveis, ainda não carregado (não é falta).
 */
export type EstadoVisivel = 'ok' | 'aviso' | 'faltando' | 'opcional';

/**
 * Ícone de cada estado, do conjunto único de src/icones.ts (a cor vem do
 * CSS, .icone-estado--*): ok é o check verde, aviso o triângulo amarelo,
 * faltando o x vermelho e opcional o círculo vazado.
 */
export const VISUAL_ESTADO: Record<EstadoVisivel, SinalEstado> = {
  ok: 'ok',
  aviso: 'aviso',
  faltando: 'erro',
  opcional: 'opcional',
};

const DA_COR: Record<CorSemaforo | 'neutra', EstadoVisivel> = {
  verde: 'ok',
  amarela: 'aviso',
  vermelha: 'faltando',
  neutra: 'opcional',
};

export function estadoDaCor(cor: CorSemaforo | 'neutra'): EstadoVisivel {
  return DA_COR[cor];
}

const SIGLA: Record<TipoDocumento, string> = {
  st: 'ST',
  tipi: 'TIPI',
  combustiveis: 'Combustíveis',
};

/** Verificação online que vale para a tela: só com o interruptor ligado. */
export function verificacaoVisivel(
  tipo: TipoDocumento,
  e: EstadoDocumentos,
): ResultadoVerificacao | null {
  if (!e.preferencias.verificacaoOnline || tipo === 'combustiveis') return null;
  return e.verificacao[tipo];
}

/** "01.02.2026" ou "01/02/2026" -> "01/02/2026". */
const dataBR = (s: string) => s.replace(/\./g, '/');

/**
 * Texto da versão nova anunciada ("v0020 disponível, vigência 01/02/2026").
 * null quando não há versão nova para um documento já carregado.
 */
export function textoVersaoNova(
  tipo: TipoDocumento,
  e: EstadoDocumentos,
): string | null {
  const r = verificacaoVisivel(tipo, e);
  if (!e[tipo] || r?.estado !== 'nova' || !r.disponivel) return null;
  const d = r.disponivel;
  const partes = [
    d.versao ? `v${d.versao} disponível` : 'Versão nova disponível',
  ];
  if (d.vigencia) partes.push(`vigência ${dataBR(d.vigencia)}`);
  else if (d.data)
    partes.push(`arquivo de ${new Date(d.data).toLocaleDateString('pt-BR')}`);
  return partes.join(', ');
}

/**
 * Planilha de ST importada antes da leitura das colunas de estados: sem os
 * protocolos, a ferramenta não mostra as observações de protocolo. O cartão
 * pede para reimportar, e o selo, a lista e a pastilha mostram o aviso.
 */
export function precisaReimportar(
  tipo: TipoDocumento,
  e: EstadoDocumentos,
): boolean {
  return tipo === 'st' && e.st !== null && e.stSemProtocolos;
}

/** Selo do cartão (tela de Documentos): estado, texto. */
export function seloVisivel(
  tipo: TipoDocumento,
  e: EstadoDocumentos,
): { estado: EstadoVisivel; texto: string } {
  const info = e[tipo];
  if (tipo === 'combustiveis' && !info && !e.recusado[tipo])
    return { estado: 'opcional', texto: 'Opcional, não carregado' };
  const s = seloDocumento(
    info,
    e.leitura[tipo],
    verificacaoVisivel(tipo, e),
    e.recusado[tipo],
  );
  // Problemas de leitura continuam com o texto deles (já são aviso).
  if (precisaReimportar(tipo, e) && !problemasDeLeitura(tipo, e))
    return { estado: 'aviso', texto: 'Reimportar' };
  return { estado: estadoDaCor(s.cor), texto: s.texto };
}

/** A leitura do documento teve problemas ou segmentos incompletos. */
function problemasDeLeitura(tipo: TipoDocumento, e: EstadoDocumentos): boolean {
  const l = e.leitura[tipo];
  return !!l && (l.totalProblemas > 0 || l.segmentosIncompletos.length > 0);
}

export interface LinhaDocumento {
  tipo: TipoDocumento;
  nome: string;
  estado: EstadoVisivel;
  /** Situação curta ("Carregado", "Faltando", "v0020 disponível, ..."). */
  situacao: string;
  /** Versão e vigência do carregado; vazio se não há. */
  detalhe: string;
  /** Há versão nova para baixar (botão Atualizar). */
  versaoNova: boolean;
}

/** Versão e vigência do documento carregado, numa linha curta. */
export function detalheVersao(
  tipo: TipoDocumento,
  e: EstadoDocumentos,
): string {
  const info = e[tipo];
  if (!info) return '';
  const versao =
    tipo === 'st' || tipo === 'combustiveis'
      ? info.versao
        ? `Versão ${info.versao}`
        : 'Versão não informada'
      : info.versao
        ? `TIPI ${info.versao}`
        : 'Ano não informado';
  const vigencia = info.vigencia
    ? tipo === 'st' || tipo === 'combustiveis'
      ? `vigência a partir de ${info.vigencia}`
      : `atualizada até ${info.vigencia}`
    : '';
  return [versao, vigencia].filter(Boolean).join(', ');
}

/** Uma linha por documento, na ordem da tela de Documentos. */
export function linhasDocumentos(e: EstadoDocumentos): LinhaDocumento[] {
  return (['st', 'tipi', 'combustiveis'] as const).map((tipo) => {
    const selo = seloVisivel(tipo, e);
    // Reimportar vale mais que a versão nova (o Atualizar continua à mostra).
    const nova = selo.texto === 'Reimportar' ? null : textoVersaoNova(tipo, e);
    return {
      tipo,
      nome: NOME_DOCUMENTO[tipo],
      estado: nova ? 'aviso' : selo.estado,
      situacao: nova ?? selo.texto,
      detalhe: detalheVersao(tipo, e),
      versaoNova: textoVersaoNova(tipo, e) !== null,
    };
  });
}

export interface PastilhaDocumento {
  tipo: TipoDocumento;
  estado: EstadoVisivel;
  /** "ST ok", "TIPI falta", "Combustíveis ok". */
  texto: string;
}

/** Pastilhas da barra: ST e TIPI sempre; combustíveis só quando carregado. */
export function pastilhasDocumentos(e: EstadoDocumentos): PastilhaDocumento[] {
  const tipos: TipoDocumento[] = ['st', 'tipi'];
  if (e.combustiveis) tipos.push('combustiveis');
  return tipos.map((tipo) => {
    const s = semaforoDocumento(
      e[tipo],
      e.leitura[tipo],
      verificacaoVisivel(tipo, e),
      e.recusado[tipo],
    );
    if (s.cor === 'verde' && precisaReimportar(tipo, e))
      return { tipo, estado: 'aviso', texto: `${SIGLA[tipo]} reimportar` };
    return {
      tipo,
      estado: estadoDaCor(s.cor),
      texto: `${SIGLA[tipo]} ${s.texto}`,
    };
  });
}
