// Ponte entre o renderer e o processo principal. Expõe só as funções de PsApi.
import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('psApi', {
  recentes: (): Promise<NotaRecenteTela[]> => ipcRenderer.invoke('recentes'),
  registrarRecente: (dados: DadosRecente): Promise<void> =>
    ipcRenderer.invoke('registrar-recente', dados),
  abrirRecente: (caminho: string): Promise<ResultadoAbrir> =>
    ipcRenderer.invoke('abrir-recente', caminho),
  limparRecentes: (caminho?: string): Promise<NotaRecenteTela[]> =>
    ipcRenderer.invoke('limpar-recentes', caminho),
  aoMudarRecentes: (callback: () => void): void => {
    ipcRenderer.on('recentes-mudou', () => callback());
  },
  documentos: (): Promise<EstadoDocumentos> => ipcRenderer.invoke('documentos'),
  importarDocumento: (
    tipo: TipoDocumento,
  ): Promise<ResultadoImportarDocumento> =>
    ipcRenderer.invoke('importar-documento', tipo),
  gravarPreferenciasDocumentos: (
    p: Partial<PreferenciasDocumentos>,
  ): Promise<EstadoDocumentos> =>
    ipcRenderer.invoke('preferencias-documentos', p),
  verificarDocumentos: (): Promise<EstadoDocumentos> =>
    ipcRenderer.invoke('verificar-documentos'),
  baixarDocumento: (tipo: TipoDocumento): Promise<ResultadoImportarDocumento> =>
    ipcRenderer.invoke('baixar-documento', tipo),
  confirmarParcial: (token: string): Promise<ResultadoImportarDocumento> =>
    ipcRenderer.invoke('confirmar-parcial', token),
  cancelarParcial: (token: string): Promise<void> =>
    ipcRenderer.invoke('cancelar-parcial', token),
  descartarRecusa: (tipo: TipoDocumento): Promise<EstadoDocumentos> =>
    ipcRenderer.invoke('descartar-recusa', tipo),
  removerDocumento: (tipo: TipoDocumento): Promise<EstadoDocumentos> =>
    ipcRenderer.invoke('remover-documento', tipo),
  abrirPaginaDocumento: (tipo: TipoDocumento): Promise<void> =>
    ipcRenderer.invoke('abrir-pagina-documento', tipo),
  importarCadastro: (): Promise<ResultadoImportarCadastro> =>
    ipcRenderer.invoke('importar-cadastro'),
  removerCadastro: (): Promise<EstadoDocumentos> =>
    ipcRenderer.invoke('remover-cadastro'),
  descartarRecusaCadastro: (): Promise<EstadoDocumentos> =>
    ipcRenderer.invoke('descartar-recusa-cadastro'),
  analisarST: (pedido: {
    itens: ItemParaAnalise[];
    uf: string;
    cnpj: string;
  }): Promise<ResultadoAnaliseST> => ipcRenderer.invoke('analisar-st', pedido),
  lembrarDecisao: (d: DecisaoLembrada): Promise<boolean> =>
    ipcRenderer.invoke('lembrar-decisao', d),
  esquecerDecisao: (chave: string): Promise<boolean> =>
    ipcRenderer.invoke('esquecer-decisao', chave),
  aoMudarDocumentos: (callback: () => void): void => {
    ipcRenderer.on('documentos-mudou', () => callback());
  },
  aoProgressoDocumento: (callback: (p: ProgressoDocumento) => void): void => {
    ipcRenderer.on('documento-progresso', (_e, p: ProgressoDocumento) =>
      callback(p),
    );
  },
  abrirArquivo: (): Promise<ResultadoAbrir> =>
    ipcRenderer.invoke('abrir-arquivo'),
  // O caminho do arquivo solto só existe aqui (webUtils); o processo
  // principal lê o arquivo e guarda o caminho.
  abrirSolto: (arquivo: File): Promise<ResultadoAbrir> =>
    ipcRenderer.invoke('abrir-caminho', webUtils.getPathForFile(arquivo)),
  informarSemNota: (): void => ipcRenderer.send('sem-nota'),
  aoMudarPerfis: (callback: (estado: EstadoPerfis) => void): void => {
    ipcRenderer.on('perfis-mudou', (_e, estado: EstadoPerfis) =>
      callback(estado),
    );
  },
  aoMudarPasta: (callback: () => void): void => {
    ipcRenderer.on('pasta-mudou', () => callback());
  },
  abrirExterno: (): Promise<ArquivoExterno | ArquivoRecusado | null> =>
    ipcRenderer.invoke('abrir-externo'),
  aoArquivoExterno: (callback: () => void): void => {
    ipcRenderer.on('arquivo-externo', () => callback());
  },
  pastaDestino: (): Promise<PastaDestino> =>
    ipcRenderer.invoke('pasta-destino'),
  escolherPasta: (): Promise<string | null> =>
    ipcRenderer.invoke('escolher-pasta'),
  abrirPastaDestino: (): Promise<ResultadoAbrirPasta> =>
    ipcRenderer.invoke('abrir-pasta-destino'),
  salvar: (
    textoCopia: string,
    base: string | null,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvar> =>
    ipcRenderer.invoke('salvar', textoCopia, base, opcoes),
  sugerirCopia: (
    base: string | null,
    tipo: TipoCopia,
    sufixo?: string,
  ): Promise<SugestaoCopia> =>
    ipcRenderer.invoke('sugerir-copia', base, tipo, sufixo),
  salvarCopia: (
    textoCopia: string,
    nome: string,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvar> =>
    ipcRenderer.invoke('salvar-copia', textoCopia, nome, opcoes),
  salvarPdfConferencia: (
    base: string | null,
    paisagem: boolean,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvarDanfe> =>
    ipcRenderer.invoke('salvar-pdf-conferencia', base, paisagem, opcoes),
  salvarDanfe: (
    base: string | null,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvarDanfe> =>
    ipcRenderer.invoke('salvar-danfe', base, opcoes),
  salvarDocumento: (
    base: string | null,
    sufixo: string,
    bobina: number | null,
    opcoes: OpcoesSalvar = {},
  ): Promise<ResultadoSalvarDanfe> =>
    ipcRenderer.invoke('salvar-documento', base, sufixo, bobina, opcoes),
  versao: (): Promise<string> => ipcRenderer.invoke('versao'),
  configAvisos: (): Promise<ConfigAvisos> =>
    ipcRenderer.invoke('config-avisos'),
  boasVindas: (): Promise<EstadoBoasVindas | null> =>
    ipcRenderer.invoke('boas-vindas'),
  escolherPastaBoasVindas: (): Promise<string | null> =>
    ipcRenderer.invoke('boas-vindas-escolher-pasta'),
  concluirBoasVindas: (dados: DadosBoasVindas): Promise<ResultadoBoasVindas> =>
    ipcRenderer.invoke('boas-vindas-concluir', dados),
  buscarConferidos: (chave: string, nNF: string): Promise<ArquivoConferido[]> =>
    ipcRenderer.invoke('buscar-conferidos', chave, nNF),
  abrirConferido: (caminho: string): Promise<boolean> =>
    ipcRenderer.invoke('abrir-conferido', caminho),
  imprimir: (
    modo: ModoImpressao,
    paisagem: boolean,
    bobina: number | null = null,
  ): Promise<ResultadoImprimir> =>
    ipcRenderer.invoke('imprimir', modo, paisagem, bobina),
  informarPendentes: (pendentes: boolean): void =>
    ipcRenderer.send('anotacoes-pendentes', pendentes),
  aoPedirFechar: (callback: () => void): void => {
    ipcRenderer.on('pedido-fechar', () => callback());
  },
  responderFechar: (pode: boolean): void =>
    ipcRenderer.send('resposta-fechar', pode),
  perfis: (): Promise<EstadoPerfis> => ipcRenderer.invoke('perfis'),
  gravarConfigConferencia: (
    config: ConfigConferencia,
  ): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('gravar-config-conferencia', config),
  ativarPerfil: (id: string): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('ativar-perfil', id),
  criarPerfil: (nome: string): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('criar-perfil', nome),
  renomearPerfil: (id: string, nome: string): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('renomear-perfil', id, nome),
  excluirPerfil: (id: string): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('excluir-perfil', id),
  exportarPerfil: (): Promise<ResultadoExportarConfig> =>
    ipcRenderer.invoke('exportar-perfil'),
  mostrarPerfilExportado: (): Promise<ResultadoAbrirPasta> =>
    ipcRenderer.invoke('mostrar-perfil-exportado'),
  importarPerfil: (): Promise<ResultadoImportarPerfil> =>
    ipcRenderer.invoke('importar-perfil'),
  adicionarPerfil: (
    perfil: PerfilImportado,
    modo: 'substituir' | 'manter',
  ): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('adicionar-perfil', perfil, modo),
  restaurarConfig: (): Promise<ResultadoPerfis> =>
    ipcRenderer.invoke('restaurar-config'),
  areaTransferencia: (
    pedido: PedidoAreaTransferencia,
  ): Promise<ResultadoAreaTransferencia> =>
    ipcRenderer.invoke('area-transferencia', pedido),
  ferramentasPerfis: (): Promise<EstadoFerramentas> =>
    ipcRenderer.invoke('ferramentas-perfis'),
  gravarFerramentasPerfil: (
    id: string,
    ferramentas: FerramentasPerfil,
  ): Promise<ResultadoFerramentas> =>
    ipcRenderer.invoke('gravar-ferramentas-perfil', id, ferramentas),
  aoMudarFerramentas: (callback: () => void): void => {
    ipcRenderer.on('ferramentas-mudou', () => callback());
  },
  gravarConfigAvisos: (
    p: Partial<ConfigAvisos>,
  ): Promise<ResultadoConfigAvisos> =>
    ipcRenderer.invoke('gravar-config-avisos', p),
  aoMudarAvisos: (callback: () => void): void => {
    ipcRenderer.on('avisos-mudou', () => callback());
  },
  dadosApp: (): Promise<EstadoDadosApp> => ipcRenderer.invoke('dados-app'),
  abrirPastaDados: (): Promise<ResultadoAbrirPasta> =>
    ipcRenderer.invoke('abrir-pasta-dados'),
  exportarBackup: (): Promise<ResultadoExportarConfig> =>
    ipcRenderer.invoke('exportar-backup'),
  lerBackup: (): Promise<ResultadoLerBackup> =>
    ipcRenderer.invoke('ler-backup'),
  confirmarBackup: (token: string): Promise<ResultadoImportarBackup> =>
    ipcRenderer.invoke('confirmar-backup', token),
  cancelarBackup: (token: string): Promise<void> =>
    ipcRenderer.invoke('cancelar-backup', token),
} satisfies PsApi);

// ---------- leitor de XML genérico (parte 1): início do bloco ----------
// Ponte própria da tela do leitor (src/leitorXml/tela.ts). Nenhuma função
// recebe caminho: o processo principal guarda o arquivo de cada janela.
import type { PsLeitorXmlApi } from './leitorXml/tipos';

contextBridge.exposeInMainWorld('psLeitorXml', {
  carregar: () => ipcRenderer.invoke('leitor-xml-carregar'),
  texto: () => ipcRenderer.invoke('leitor-xml-texto'),
  abrirNoBlocoDeNotas: () => ipcRenderer.invoke('leitor-xml-bloco-de-notas'),
  fechar: () => ipcRenderer.invoke('leitor-xml-fechar'),
  aoMostrar: (callback: (documento: boolean) => void): void => {
    ipcRenderer.on('leitor-xml-mostrar', (_e, documento: unknown) =>
      callback(documento === true),
    );
  },
} satisfies PsLeitorXmlApi);
// ---------- leitor de XML genérico (parte 1): fim do bloco ----------

// ---------- serviço de leitura pesada (parte 2): início do bloco ----------
// Andamento e Cancelar das leituras no utilityProcess (src/servico/), para o
// cartão de src/servico/progresso.ts. Só o id da leitura vai e volta.
import type { PsServicoApi } from './servico/ponte';

contextBridge.exposeInMainWorld('psServico', {
  aoInicio: (callback) => {
    ipcRenderer.on('servico-inicio', (_e, a) => callback(a));
  },
  aoProgresso: (callback) => {
    ipcRenderer.on('servico-progresso', (_e, p) => callback(p));
  },
  aoFim: (callback) => {
    ipcRenderer.on('servico-fim', (_e, f) => callback(f));
  },
  cancelar: (id: number) => ipcRenderer.invoke('servico-cancelar', id),
} satisfies PsServicoApi);
// ---------- serviço de leitura pesada (parte 2): fim do bloco ----------

// ---------- config.json seguro: início do bloco ----------
// Aviso de configuração recuperada (src/avisoConfig.ts). Nenhum dado vai
// da janela para o processo principal.
import type { PsConfigSeguroApi } from './configSeguro';

contextBridge.exposeInMainWorld('psConfigSeguro', {
  avisos: () => ipcRenderer.invoke('config-recuperacoes'),
  aoRecuperar: (callback: () => void): void => {
    ipcRenderer.on('config-recuperada', () => callback());
  },
} satisfies PsConfigSeguroApi);
// ---------- config.json seguro: fim do bloco ----------

// ---------- rascunhos das anotações: início do bloco ----------
// Rascunho contínuo da nota (src/rascunhos.ts) e o aviso de recuperar na
// abertura do app. Nenhum caminho vai da janela: o processo principal sabe o
// arquivo de cada janela; o aviso só devolve ids.
contextBridge.exposeInMainWorld('psRascunhos', {
  gravar: (dados: DadosRascunhoJanela): void =>
    ipcRenderer.send('rascunho-gravar', dados),
  apagar: (): void => ipcRenderer.send('rascunho-apagar'),
  descartar: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('rascunho-descartar', id),
  avisoAbertura: (): Promise<ResumoRascunho[]> =>
    ipcRenderer.invoke('rascunhos-aviso'),
  recuperar: (id: string): Promise<ResultadoRecuperarRascunho> =>
    ipcRenderer.invoke('rascunho-recuperar', id),
} satisfies PsRascunhosApi);
// ---------- rascunhos das anotações: fim do bloco ----------
