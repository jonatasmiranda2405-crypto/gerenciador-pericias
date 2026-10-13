// Servidor de teste: PROJUDI simulado + PeríciaFlow (index.html do repositório) + verificador de assinatura.
const https = require("https");
const fs = require("fs");
const path = require("path");
const D = __dirname;
const APP = path.join(__dirname, "..", "index.html");
const NUM = "5151870-23.2026.8.09.0051";
const COD = "AB12CD34";
let extraLiberado = false; // simula um arquivo novo juntado depois

const ARQS = {
  "1001": { nome: "peticao_inicial.pdf", file: "peticao.pdf", mov: 1 },
  "1002": { nome: "quesitos.pdf.p7s", file: "quesitos.pdf.p7s", mov: 2 },
  "1003": { nome: "decisao_nomeacao.pdf", file: "nomeacao.pdf", mov: 3 },
  "1004": { nome: "laudo_complementar.pdf", file: "extra.pdf", mov: 4 },
};
const MOVS = [
  { n: 1, tipo: "Juntada -> Petição -> Inicial", data: "10/02/2026 09:12:00", arqs: ["1001"] },
  { n: 2, tipo: "Juntada -> Petição -> Quesitos", data: "26/08/2026 17:17:11", arqs: ["1002"] },
  { n: 3, tipo: "Decisão -> Nomeação de Perito", data: "13/10/2026 10:00:00", arqs: ["1003"] },
  { n: 4, tipo: "Juntada -> Laudo Complementar", data: "13/10/2026 15:00:00", arqs: ["1004"], extra: true },
];

const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((c) => c.split("=")));
const html = (res, corpo, extra = {}) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...extra }); res.end(`<!doctype html><meta charset="utf-8"><body>${corpo}</body>`); };
const redir = (res, to, extra = {}) => { res.writeHead(302, { Location: to, ...extra }); res.end(); };

function projudi(req, res, u) {
  const ck = cookies(req);
  const logado = ck.sess === "1";
  const pub = ck.pub === "1";
  const p = u.pathname;
  if (p === "/" ) {
    if (logado) return html(res, `<h1>PROJUDI</h1><p>Bem-vindo, perito.</p><a href="/LogOn?PaginaAtual=-200">Sair</a>`);
    return html(res, `<h1>PROJUDI</h1><form method="post" action="/LogOn?PaginaAtual=7">
      <label for="u">Usuário (CPF)</label><input id="u" name="Usuario">
      <label for="s">Senha</label><input id="s" name="Senha" type="password">
      <button type="submit">Entrar</button></form>`);
  }
  if (p === "/LogOn" && req.method === "POST") return redir(res, "/", { "Set-Cookie": "sess=1; Path=/; Secure; SameSite=Lax" });
  if (p === "/BuscaProcesso") {
    const tipo = u.searchParams.get("TipoConsultaProcesso");
    const pag = u.searchParams.get("PaginaAtual");
    if (tipo === "24" && !logado) return redir(res, "/");
    // verificação do Cloudflare na primeira visita
    if (ck.cf !== "1") return html(res, `<title>Just a moment...</title><div id="challenge-form"><p>Verifying you are human.</p>
      <button id="cf-ok" onclick="document.cookie='cf=1; path=/; Secure'; location.reload()">Verificar</button></div>`);
    if (pag === "2") {
      const num = u.searchParams.get("numeroProcesso") || "";
      const cod = u.searchParams.get("CodigoAcesso") || "";
      const okNum = num.replace(/\D/g, "") === NUM.replace(/\D/g, "");
      const ok = okNum && (tipo === "24" || cod === COD);
      if (!ok) return html(res, `<p>Processo não encontrado.</p>` + formBusca(tipo));
      return html(res, `<table><tr><td><a href="/Processo?Id=77">${NUM}</a></td><td>Procedimento Comum Cível</td></tr></table>`,
        tipo === "23" ? { "Set-Cookie": "pub=1; Path=/; Secure; SameSite=Lax" } : {});
    }
    return html(res, formBusca(tipo));
  }
  if (p === "/Processo") {
    if (!logado && !pub) return redir(res, "/");
    const linhas = MOVS.filter((m) => !m.extra || extraLiberado).map((m) => `
      <tr><td>${m.n}</td><td>${m.tipo}<br>${m.data} SERVIDOR</td>
      <td><a href="javascript:void(0)" onclick="carregar(${m.n})"><img id="MostrarArquivos_${m.n}" alt="arquivos" width="10" height="10" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a></td></tr>
      <tr id="arqs_${m.n}"><td colspan="3"></td></tr>`).join("");
    return html(res, `<h2>Processo ${NUM}</h2>
      <table><tr><td>Classe</td><td>Procedimento Comum Cível</td></tr>
      <tr><td>Serventia</td><td>5ª Vara Cível de Goiânia</td></tr>
      <tr><td>Polo Ativo</td><td>Maria Teste</td></tr><tr><td>Polo Passivo</td><td>Banco Exemplo S.A.</td></tr></table>
      <table id="movs">${linhas}</table>
      <script>
        const ARQ = ${JSON.stringify(Object.fromEntries(MOVS.map((m) => [m.n, m.arqs.map((a) => [a, ARQS[a].nome])])))};
        function carregar(n){ setTimeout(() => {
          document.querySelector('#arqs_'+n+' td').innerHTML = '<ul class="lista_arquivos">' +
            ARQ[n].map(([id,nome]) => '<li><span nome_arquivo="'+nome+'"></span><a href="/Arquivo?Id_MovimentacaoArquivo='+id+'&hash=x">'+nome+'</a></li>').join('') + '</ul>';
        }, 250); }
      </script>`);
  }
  if (p === "/Arquivo") {
    if (!logado && !pub) return html(res, "<p>Sessão expirada</p>");
    const a = ARQS[u.searchParams.get("Id_MovimentacaoArquivo")];
    if (!a) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": a.file.endsWith(".p7s") ? "application/pkcs7-signature" : "application/pdf" });
    return res.end(fs.readFileSync(path.join(D, a.file)));
  }
  res.writeHead(404); res.end("404");
}
function formBusca(tipo) {
  return `<form method="get" action="/BuscaProcesso">
    <input type="hidden" name="PaginaAtual" value="2"><input type="hidden" name="TipoConsultaProcesso" value="${tipo}">
    <table><tr><td>Número do Processo</td><td><input name="numeroProcesso" id="numeroProcesso"></td></tr>
    ${tipo === "23" ? `<tr><td>Código de Acesso</td><td><input name="CodigoAcesso" id="CodigoAcesso"></td></tr>` : ""}
    </table><input type="button" value="Buscar" onclick="this.form.submit()"></form>`;
}

const CERT = path.join(D, ".saida", "cert");
if (!fs.existsSync(CERT + "/k.pem")) {
  fs.mkdirSync(CERT, { recursive: true });
  require("child_process").execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${CERT}/k.pem -out ${CERT}/c.pem -days 2 -subj /CN=teste`, { stdio: "ignore" });
}
https.createServer({ key: fs.readFileSync(CERT + "/k.pem"), cert: fs.readFileSync(CERT + "/c.pem") }, (req, res) => {
  const u = new URL(req.url, "https://" + req.headers.host);
  const host = (req.headers.host || "").split(":")[0];
  if (u.pathname === "/__liberar_extra") { extraLiberado = true; res.end("ok"); return; }
  if (u.pathname === "/__reiniciar") { extraLiberado = false; res.end("ok"); return; }
  if (host === "projudi.tjgo.jus.br") return projudi(req, res, u);
  if (host === "jonatasmiranda2405-crypto.github.io") {
    if (u.pathname.startsWith("/gerenciador-pericias/")) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(fs.readFileSync(APP)); }
  }
  if (host === "script.google.com") {
    let corpo = ""; req.on("data", (c) => (corpo += c));
    req.on("end", () => {
      let j = {}; try { j = JSON.parse(corpo); } catch (e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      if (j.acao === "checkout") return res.end(JSON.stringify({ ok: true, url: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=teste-" + j.plano + "&email=" + encodeURIComponent(j.email) }));
      if (j.email === "novo@exemplo.com") return res.end(JSON.stringify({ ativo: false, validade: "" }));
      res.end(JSON.stringify({ ativo: true, validade: "2026-12-31" }));
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(8443, "127.0.0.1", () => console.log("servidor de teste em 8443"));
