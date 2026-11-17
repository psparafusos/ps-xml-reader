// Aviso de configuração recuperada (src/configSeguro.ts): o config.json
// estava ilegível ou os perfis estavam inválidos, e o app recuperou o que deu
// e guardou uma cópia. Caixa no visual do app (dialogos.ts), com o texto
// selecionável. O processo principal entrega cada aviso a uma janela só,
// então ele aparece uma vez.

import { perguntar } from './dialogos';

let mostrando = false;
let deNovo = false;

async function mostrar(): Promise<void> {
  if (mostrando) {
    deNovo = true;
    return;
  }
  mostrando = true;
  try {
    do {
      deNovo = false;
      const avisos = await window.psConfigSeguro.avisos();
      if (avisos.length === 0) continue;
      await perguntar({
        titulo: 'Configuração recuperada',
        texto: avisos.map((a) => a.mensagem).join(' '),
        botoes: [{ rotulo: 'Entendi', valor: 'ok', principal: true }],
        cancelar: 'ok',
      });
    } while (deNovo);
  } catch (erro) {
    console.error(erro);
  } finally {
    mostrando = false;
  }
}

/** Mostra o que já estiver guardado e os avisos que chegarem depois. */
export function iniciarAvisoConfig(): void {
  if (!window.psConfigSeguro) return;
  window.psConfigSeguro.aoRecuperar(() => void mostrar());
  void mostrar();
}
