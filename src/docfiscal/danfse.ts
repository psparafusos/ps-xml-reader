// DANFSe: o documento auxiliar da NFS-e, no modelo da NFS-e Nacional (Nota
// Técnica SE/CGNFS-e nº 008, versão 1.02: blocos do item 2.1, supressões do
// 2.3, cabeçalho e QR Code do 2.4.3), em uma folha A4 retrato por nota.
//
// NFS-e no padrão ABRASF não tem modelo oficial de impressão (cada município
// define o seu): o PS Reader usa o mesmo leiaute com o que o XML municipal
// traz, sem o QR Code do portal nacional (que não consulta nota municipal),
// e escreve no rodapé que montou o documento a partir do XML, com o código
// de verificação para a consulta no site da prefeitura.
//
// modeloDanfse é puro (testado fora do app); montarDanfse desenha.

import { registrarMontador } from './documento';
import { el, montarFolhas, qrSvg } from './folha';
import { campo, f, type Bloco, type Campo } from './modelo';
import {
  lerNfseAbrasf,
  lerNfseNacional,
  type DadosNfse,
  type PessoaNfse,
} from './nfse';
import type { ElementoXml } from './tipo';

export const URL_CONSULTA_NACIONAL =
  'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=';

export const TEXTO_QR =
  'A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e';

export interface ModeloDanfse {
  titulo: string;
  subtitulo: string;
  /** "NFS-e SEM VALIDADE JURÍDICA" em homologação, ou null. */
  semValidade: string | null;
  /** Município, ambiente gerador e tipo de ambiente (canto direito). */
  ambiente: string[];
  identificacao: Campo[][];
  /** Texto do QR Code (NFS-e Nacional), ou o aviso no lugar dele. */
  qr: { texto: string; legenda: string } | { aviso: string };
  blocos: Bloco[];
  /** Texto do PS Reader no pé (ABRASF), ou null. */
  rodape: string | null;
}

const ROTULO_ABRASF = 'NFS-e municipal (padrão ABRASF)';

function blocoPessoa(
  chave: string,
  titulo: string,
  p: PessoaNfse | null,
  suprimido: string,
  extra: Campo[][] = [],
  semIm = false,
): Bloco {
  if (!p) return { chave, titulo, aviso: suprimido };
  return {
    chave,
    titulo,
    linhas: [
      semIm
        ? [
            campo('CNPJ / CPF / NIF', p.documento, 1),
            campo('Telefone', p.telefone, 1),
          ]
        : [
            campo('CNPJ / CPF / NIF', p.documento, 1),
            campo('Indicador Municipal (Inscrição)', p.inscricaoMunicipal, 1),
            campo('Telefone', p.telefone, 2),
          ],
      [
        campo('Nome / Nome Empresarial', p.nome, 2),
        campo('Município / Sigla UF', p.municipio, 1),
        campo('Código IBGE / CEP', p.codigoCep, 1),
      ],
      [campo('Endereço', p.endereco, 2), campo('E-mail', p.email, 2)],
      ...extra,
    ],
  };
}

/** O modelo do DANFSe de uma NFS-e (puro). */
export function modeloDanfse(d: DadosNfse): ModeloDanfse {
  const abrasf = d.origem === 'abrasf';
  const ident: Campo[][] = [
    [campo('CHAVE DE ACESSO DA NFS-E', d.chave, 3)],
    [
      campo('NÚMERO DA NFS-E', d.numero),
      campo('COMPETÊNCIA DA NFS-E', d.competencia),
      campo('DATA E HORA DA EMISSÃO DA NFS-E', dataHora(d.dhNfse)),
    ],
    abrasf
      ? [
          campo('NÚMERO DO RPS', d.numeroDps),
          campo('SÉRIE DO RPS', d.serieDps),
          campo('DATA DA EMISSÃO DO RPS', dataHora(d.dhDps)),
        ]
      : [
          campo('NÚMERO DA DPS', d.numeroDps),
          campo('SÉRIE DA DPS', d.serieDps),
          campo('DATA E HORA DA EMISSÃO DA DPS', dataHora(d.dhDps)),
        ],
    abrasf
      ? [
          campo('CÓDIGO DE VERIFICAÇÃO', d.codigoVerificacao, 1, {
            destaque: true,
          }),
          campo('SITUAÇÃO DA NFS-E', d.situacao),
          campo('PADRÃO DO XML', `ABRASF ${d.versao}`.trim()),
        ]
      : [
          campo('EMITENTE DA NFS-E', d.emitente, 1, { destaque: true }),
          campo('SITUAÇÃO DA NFS-E', d.situacao),
          campo('FINALIDADE', d.finalidade),
        ],
  ];

  const p = d.prestador;
  const blocos: Bloco[] = [
    blocoPessoa('prestador', 'PRESTADOR / FORNECEDOR', p, '', [
      [
        campo('Simples Nacional na Data de Competência', p.simples, 2),
        campo('Regime de Apuração Tributária pelo SN', p.regimeSN, 2),
      ],
    ]),
    blocoPessoa(
      'tomador',
      'TOMADOR / ADQUIRENTE',
      d.tomador,
      'TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',
    ),
    d.destinatario === 'tomador'
      ? {
          chave: 'destinatario',
          titulo: 'DESTINATÁRIO DA OPERAÇÃO',
          aviso: 'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO',
        }
      : blocoPessoa(
          'destinatario',
          'DESTINATÁRIO DA OPERAÇÃO',
          d.destinatario,
          'DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',
          [],
          true,
        ),
    blocoPessoa(
      'intermediario',
      'INTERMEDIÁRIO DA OPERAÇÃO',
      d.intermediario,
      'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e',
    ),
    {
      chave: 'servico',
      titulo: 'SERVIÇO PRESTADO',
      linhas: [
        [
          campo(
            abrasf
              ? 'Item da Lista de Serviços / Código de Tributação Municipal'
              : 'Código de Tributação Nacional / Municipal',
            d.servico.codigo,
          ),
          campo('Código da NBS', d.servico.nbs),
          campo('Local da Prestação / Sigla UF / País', d.servico.local, 2),
        ],
        [
          campo(
            abrasf
              ? 'Atividade Econômica'
              : 'Descrição do Código de Tributação Nacional / Municipal',
            d.servico.descricaoCodigo,
          ),
        ],
      ],
      texto: { rotulo: 'Descrição do Serviço', valor: d.servico.descricao },
    },
    d.issqn
      ? {
          chave: 'issqn',
          titulo: 'TRIBUTAÇÃO MUNICIPAL (ISSQN)',
          linhas: [
            [
              campo('Tipo de Tributação do ISSQN', d.issqn.tributacao),
              campo(
                'Município / Sigla UF / País de Incidência do ISSQN',
                d.issqn.incidencia,
              ),
              campo(
                'Regime Especial de Tributação do ISSQN',
                d.issqn.regimeEspecial,
              ),
              campo('Tipo de Imunidade do ISSQN', d.issqn.imunidade),
            ],
            [
              campo('Suspensão da Exigibilidade do ISSQN', d.issqn.suspensao),
              campo('Número Processo Suspensão', d.issqn.processo),
              campo('Benefício Municipal', d.issqn.beneficio),
              campo('Cálculo do BM', d.issqn.calculoBM, 1, { alinhar: 'dir' }),
            ],
            [
              campo('Total Deduções/Reduções', d.issqn.deducoes, 1, {
                alinhar: 'dir',
              }),
              campo(
                'Desconto Incondicionado',
                d.issqn.descontoIncondicionado,
                1,
                {
                  alinhar: 'dir',
                },
              ),
              campo('BC ISSQN', d.issqn.base, 1, { alinhar: 'dir' }),
              campo('Alíquota Aplicada', d.issqn.aliquota, 1, {
                alinhar: 'dir',
              }),
            ],
            [
              campo('Retenção do ISSQN', d.issqn.retencao, 2),
              campo('ISSQN Apurado', d.issqn.valor, 2, { alinhar: 'dir' }),
            ],
          ],
        }
      : {
          chave: 'issqn',
          titulo: 'TRIBUTAÇÃO MUNICIPAL (ISSQN)',
          aviso: 'TRIBUTAÇÃO MUNICIPAL (ISSQN) - OPERAÇÃO NÃO SUJEITA AO ISSQN',
        },
    {
      chave: 'federal',
      titulo: 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)',
      linhas: [
        [
          campo('IRRF', d.federal.irrf, 1, { alinhar: 'dir' }),
          campo('Contribuição Previdenciária - Retida', d.federal.cp, 1, {
            alinhar: 'dir',
          }),
          campo(
            'Contribuições Sociais - Retidas',
            d.federal.contribuicoesRetidas,
            1,
            { alinhar: 'dir' },
          ),
          campo(
            'Descrição das Contribuições Sociais - Retidas',
            d.federal.descricaoRetidas,
          ),
        ],
        ...(abrasf
          ? []
          : [
              [
                campo('PIS - Débito Apuração Própria', d.federal.pis, 1, {
                  alinhar: 'dir',
                }),
                campo('COFINS - Débito Apuração Própria', d.federal.cofins, 1, {
                  alinhar: 'dir',
                }),
                campo('', '', 2),
              ],
            ]),
      ],
    },
  ];

  if (d.ibscbs) {
    const i = d.ibscbs;
    blocos.push({
      chave: 'ibscbs',
      titulo: 'TRIBUTAÇÃO IBS / CBS',
      linhas: [
        [
          campo('CST / Classificação Tributária', i.cst),
          campo('Município de Incidência / Código IBGE', i.incidencia, 2),
          campo('Base de Cálculo', i.base, 1, { alinhar: 'dir' }),
        ],
        [
          campo(
            'Alíquota do IBS Estadual / Municipal',
            `${i.aliquotaIbsUf} / ${i.aliquotaIbsMun}`,
          ),
          campo('Alíquota Efetiva do IBS Municipal', i.efetivaIbsMun, 1, {
            alinhar: 'dir',
          }),
          campo('Valor Apurado do IBS Municipal', i.valorIbsMun, 1, {
            alinhar: 'dir',
          }),
          campo('Alíquota Efetiva do IBS Estadual', i.efetivaIbsUf, 1, {
            alinhar: 'dir',
          }),
        ],
        [
          campo('Valor Apurado do IBS Estadual', i.valorIbsUf, 1, {
            alinhar: 'dir',
          }),
          campo('Valor Total Apurado do IBS', f.valor(i.totalIbs), 1, {
            alinhar: 'dir',
          }),
          campo(
            'Alíquota da CBS / Efetiva',
            `${i.aliquotaCbs} / ${i.efetivaCbs}`,
          ),
          campo('Valor Total Apurado da CBS', f.valor(i.totalCbs), 1, {
            alinhar: 'dir',
          }),
        ],
      ],
    });
  }

  const t = d.total;
  blocos.push(
    {
      chave: 'total',
      titulo: 'VALOR TOTAL DA NFS-E',
      linhas: [
        [
          campo('Valor da Operação / Serviço', t.servico, 1, {
            alinhar: 'dir',
          }),
          campo('Desconto Incondicionado', t.descontoIncondicionado, 1, {
            alinhar: 'dir',
          }),
          campo('Desconto Condicionado', t.descontoCondicionado, 1, {
            alinhar: 'dir',
          }),
          campo('Total das Retenções (ISSQN / Federais)', t.retencoes, 1, {
            alinhar: 'dir',
          }),
        ],
        [
          campo('Valor Líquido da NFS-e', t.liquido, 1, { alinhar: 'dir' }),
          campo('Total do IBS/CBS', t.ibscbs, 1, { alinhar: 'dir' }),
          campo('Valor Líquido da NFS-e + IBS/CBS', t.liquidoMaisIbscbs, 2, {
            alinhar: 'dir',
            destaque: true,
          }),
        ],
      ],
    },
    {
      chave: 'complementares',
      titulo: 'INFORMAÇÕES COMPLEMENTARES',
      texto: { rotulo: null, valor: d.complementares },
    },
  );

  return {
    titulo: abrasf ? 'DANFSe' : 'DANFSe v2.0',
    subtitulo: 'Documento Auxiliar da NFS-e',
    semValidade: d.tpAmb === '2' ? 'NFS-e SEM VALIDADE JURÍDICA' : null,
    ambiente: [
      d.municipioEmissor,
      d.ambienteGerador,
      abrasf ? ROTULO_ABRASF : d.tipoAmbiente,
    ].filter(Boolean),
    identificacao: ident,
    qr:
      abrasf || !d.chave
        ? {
            aviso: abrasf
              ? `Consulte a autenticidade no site da prefeitura com o código de verificação${d.codigoVerificacao ? ` ${d.codigoVerificacao}` : ''}.`
              : 'NFS-e sem chave de acesso no XML.',
          }
        : { texto: `${URL_CONSULTA_NACIONAL}${d.chave}`, legenda: TEXTO_QR },
    blocos,
    rodape: abrasf
      ? `Documento montado pelo PS Reader a partir do XML da NFS-e no padrão ABRASF${d.versao ? ` (versão ${d.versao})` : ''}. Não há modelo oficial de impressão para este padrão: cada município define o seu. Para conferir a autenticidade, consulte a nota no site da prefeitura com o código de verificação${d.codigoVerificacao ? ` ${d.codigoVerificacao}` : ''}.`
      : null,
  };
}

/** "2026-02-03T15:02:35-03:00" -> "03/02/2026 15:02:35"; só data fica dd/mm/aaaa. */
function dataHora(bruto: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/.exec(bruto);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : f.data(bruto);
}

// ---------- desenho ----------

function cabecalho(m: ModeloDanfse): HTMLElement {
  return el(
    'header',
    'dx-danfse__cab',
    el('div', 'dx-danfse__logo', el('span', '', 'NFS-e')),
    el(
      'div',
      'dx-danfse__titulo',
      el('div', '', m.titulo),
      el('div', '', m.subtitulo),
      m.semValidade
        ? el('div', 'dx-danfse__sem-validade', m.semValidade)
        : null,
    ),
    el(
      'div',
      'dx-danfse__ambiente',
      ...m.ambiente.map((a, i) =>
        el('div', i === 0 ? 'dx-danfse__municipio' : '', a),
      ),
    ),
  );
}

function identificacao(m: ModeloDanfse): HTMLElement {
  const linhas = m.identificacao.map((l) =>
    el(
      'div',
      'dx-linha',
      ...l.map((c) => {
        const e = el(
          'div',
          `dx-campo dx-campo--ident${c.destaque ? ' dx-campo--destaque' : ''}`,
          el('div', 'dx-campo__rotulo', c.rotulo),
          el('div', 'dx-campo__valor', c.valor),
        );
        e.style.flex = `${c.peso} 1 0`;
        return e;
      }),
    ),
  );
  const qr =
    'texto' in m.qr
      ? el(
          'div',
          'dx-danfse__qr',
          qrSvg(m.qr.texto, 'QR Code de consulta da NFS-e no portal nacional'),
          el('div', 'dx-danfse__qr-texto', m.qr.legenda),
        )
      : el(
          'div',
          'dx-danfse__qr dx-danfse__qr--aviso',
          el('div', 'dx-danfse__qr-texto', m.qr.aviso),
        );
  return el(
    'section',
    'dx-bloco dx-bloco--identificacao',
    el(
      'div',
      'dx-danfse__ident',
      el('div', 'dx-danfse__campos', ...linhas),
      qr,
    ),
  );
}

/** Desenha os DANFSe (uma folha por nota) em `container`. */
export function montarDanfse(
  container: HTMLElement,
  notas: DadosNfse[],
): number {
  container.replaceChildren();
  let total = 0;
  for (const d of notas) {
    const m = modeloDanfse(d);
    const lugar = el('div', 'dx-lote');
    container.append(lugar);
    total += montarFolhas(lugar, {
      classe: 'danfse',
      umaFolha: true,
      cabecalho: () =>
        el('div', 'dx-danfse__topo', cabecalho(m), identificacao(m)),
      blocos: m.blocos,
      rodape: m.rodape ? el('div', 'dx-rodape', m.rodape) : null,
      marca: null,
    });
    lugar.replaceWith(...Array.from(lugar.children));
  }
  return total;
}

function resumo(notas: DadosNfse[]): {
  emitente: string;
  titulo: string;
  emissao: string;
  versao: string;
} {
  const d = notas[0];
  const titulo =
    notas.length > 1
      ? `${notas.length} NFS-e (nº ${d.numero} e outras)`
      : `NFS-e nº ${d.numero}`;
  return {
    emitente: d.prestador.nome,
    titulo,
    emissao: d.dhNfse,
    versao: d.versao,
  };
}

registrarMontador('nfse-nacional', (elementos: ElementoXml[]) => {
  const notas = elementos.map(lerNfseNacional);
  return {
    resumo: resumo(notas),
    montar: (c) => montarDanfse(c, notas),
  };
});

registrarMontador('nfse-abrasf', (elementos: ElementoXml[]) => {
  const notas = elementos.map(lerNfseAbrasf);
  return {
    resumo: resumo(notas),
    montar: (c) => montarDanfse(c, notas),
  };
});
