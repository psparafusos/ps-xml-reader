// Só para os testes: .xlsx de uma aba, montado na memória.
import { zip } from './zip.mts';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

/** Célula vazia: null. Texto vira inlineStr; número, <v>. */
export type CelulaTeste = string | number | null;

export function xlsx(nome: string, linhas: CelulaTeste[][]): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const col = (c: number) => String.fromCharCode(65 + c);
  const rows = linhas
    .map(
      (l, i) =>
        `<row r="${i + 1}">${l
          .map((v, c) => {
            const r = `${col(c)}${i + 1}`;
            if (v === null) return '';
            return typeof v === 'number'
              ? `<c r="${r}"><v>${v}</v></c>`
              : `<c r="${r}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join('');
  return zip({
    'xl/workbook.xml': `<workbook ${NS} xmlns:r="r"><sheets><sheet name="${nome}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<worksheet ${NS}><sheetData>${rows}</sheetData></worksheet>`,
  });
}

/**
 * .xlsx de várias abas, na ordem dada (cada uma como em xlsx()). `mesclas`:
 * áreas mescladas da aba, como no Excel ("A96:B96").
 */
export function xlsxAbas(
  abas: { nome: string; linhas: CelulaTeste[][]; mesclas?: string[] }[],
): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const col = (c: number) => String.fromCharCode(65 + c);
  const folha = (linhas: CelulaTeste[][], mesclas: string[] = []) =>
    `<worksheet ${NS}><sheetData>${linhas
      .map(
        (l, i) =>
          `<row r="${i + 1}">${l
            .map((v, c) => {
              const r = `${col(c)}${i + 1}`;
              if (v === null) return '';
              return typeof v === 'number'
                ? `<c r="${r}"><v>${v}</v></c>`
                : `<c r="${r}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
            })
            .join('')}</row>`,
      )
      .join('')}</sheetData>${
      mesclas.length
        ? `<mergeCells count="${mesclas.length}">${mesclas
            .map((m) => `<mergeCell ref="${m}"/>`)
            .join('')}</mergeCells>`
        : ''
    }</worksheet>`;
  const arquivos: Record<string, string> = {
    'xl/workbook.xml': `<workbook ${NS} xmlns:r="r"><sheets>${abas
      .map(
        (a, i) =>
          `<sheet name="${esc(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships>${abas
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('')}</Relationships>`,
  };
  abas.forEach((a, i) => {
    arquivos[`xl/worksheets/sheet${i + 1}.xml`] = folha(a.linhas, a.mesclas);
  });
  return zip(arquivos);
}
