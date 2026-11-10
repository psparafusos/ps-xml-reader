// Tipos da ponte entre a janela e o serviço de leitura pesada
// (window.psServico, bloco do serviço em src/preload.ts). Só tipos.

import type { EtapaProgresso } from './protocolo';

export interface InicioServico {
  id: number;
  rotulo: string;
}

export interface ProgressoServico {
  id: number;
  rotulo: string;
  etapa: EtapaProgresso;
}

export interface PsServicoApi {
  /** Uma leitura pedida por esta janela começou. */
  aoInicio(callback: (a: InicioServico) => void): void;
  aoProgresso(callback: (p: ProgressoServico) => void): void;
  aoFim(callback: (f: { id: number }) => void): void;
  /** Cancela uma leitura desta janela. */
  cancelar(id: number): Promise<boolean>;
}
