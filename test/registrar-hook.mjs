// Só para os testes: o Node exige a extensão nos imports relativos, e
// src/nfe/ordem.ts importa './colunas' e './formato' sem ela (o Vite aceita).
// Este hook acrescenta .ts quando a resolução falha, sem mexer no código-fonte.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (erro) {
      if (erro?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) {
        return next(`${specifier}.ts`, context);
      }
      throw erro;
    }
  },
});
