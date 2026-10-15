// ==== CONFIGURAÇÃO DO DONO DA EXTENSÃO ====
// 1) URL do Apps Script publicado (termina em /exec). Veja o arquivo LEIA-ME-ASSINATURAS.txt.
const LICENSE_URL = "https://script.google.com/macros/s/AKfycbxDK9lZorhunpNNK8k1_zghlP9PQJhhb0Hyv1Ngr8fX7n_4Z_eQqx0FH1LmhIEWrCET/exec";

// 2) Texto mostrado para quem ainda não é assinante (como assinar / pagar).
const SUBSCRIBE_TEXT = "Assine com o e-mail acima: o pagamento é pelo Mercado Pago e a liberação é automática. Dúvidas: WhatsApp (62) 98411-7863.";

// Planos vendidos pelo Mercado Pago. Os ids precisam bater com PLANOS do Code.gs (Apps Script).
const PLANOS = [
  { id: "mensal",     nome: "Mensal",     preco: "R$ 15,99",  dias: 30 },
  { id: "trimestral", nome: "Trimestral", preco: "R$ 45,00",  dias: 90 },
  { id: "anual",      nome: "Anual",      preco: "R$ 150,00", dias: 365 }
];

// Tempo que uma verificação bem-sucedida fica válida sem consultar de novo (horas).
const LICENSE_CACHE_HOURS = 12;
// Se a internet/servidor falhar, aceita a última verificação por até N dias (dentro da validade).
const LICENSE_OFFLINE_DAYS = 3;

// 3) Endereços do Gerenciador de Perícia (com a barra no fim). Precisam bater com o "matches"
//    do content script periciaflow.js e com o host_permissions do manifest.json.
//    O primeiro é o principal (abre quando nenhum estiver aberto).
const PERICIAFLOW_URLS = [
  "https://gerenciadorpericias.com.br/",                                 // site publicado (domínio próprio)
  "https://www.gerenciadorpericias.com.br/",
  "https://jonatasmiranda2405-crypto.github.io/gerenciador-pericias/", // endereço antigo (redireciona)
  "http://localhost:8080/"                                               // versão PHP/MySQL
];
const PERICIAFLOW_URL = PERICIAFLOW_URLS[0];
// Por quanto tempo um pedido de autos fica ativo sem andar (minutos).
const PERICIAFLOW_ENVIO_MIN = 30;

// 4) Endereços do PROJUDI usados pelo robô de busca (robo.js).
//    Se o tribunal mudar alguma tela, ajuste só aqui.
const PROJUDI_URLS = {
  // Consulta pública "Processo por Código": número + código de acesso, sem login.
  // A própria página lê NumeroProcesso e CodigoAcesso da URL e preenche o formulário.
  porCodigo: "https://projudi.tjgo.jus.br/BuscaProcesso?PaginaAtual=4&TipoConsultaProcesso=23",
  // Busca pelo número com o perito logado (certificado digital ou CPF + senha).
  comLogin: "https://projudi.tjgo.jus.br/BuscaProcesso?PaginaAtual=4&TipoConsultaProcesso=24",
  // Tela de entrada do PROJUDI (para o botão "Entrar no PROJUDI" do Gerenciador de Perícia).
  login: "https://projudi.tjgo.jus.br/"
};
// Quantas tentativas automáticas o robô faz antes de pedir ajuda ao perito na aba.
const ROBO_MAX_TENTATIVAS = 4;
// O robô preenche a busca; quem clica em "Consultar" é o perito. Clicar sozinho aciona o bloqueio
// do Cloudflare no PROJUDI (visto em produção na v1.1). Troque para true se isso mudar.
const ROBO_CLICA_BUSCAR = false;
// O formulário do PROJUDI pede o número curto: número e dígito ("5151870-23"), até 18 caracteres.
const PROJUDI_NUMERO_CURTO = true;
