// Teste: extensão → PeríciaFlow PHP (localhost:8080) → API de upload (SQLite, criptografado); e Mercado Pago.
const path = require("path");
const os = require("os");
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/npm-tools/node_modules/playwright")); }
const EXT = path.join(__dirname, "..", "extensao-projudi");
const SAIDA = path.join(__dirname, ".saida");
const fs = require("fs");
const NUM = "5151870-23.2026.8.09.0051";
const ARMAZ = process.env.PF_ARMAZ || path.join(SAIDA, "php", "armazenamento");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = [];
const check = (n, ok, x) => { res.push(ok); console.log(ok ? "  ✔" : "  ✘", n, x || ""); };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-perfil-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium", headless: true, ignoreHTTPSErrors: true,
    env: { ...process.env, HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "" },
    args: ["--no-proxy-server", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--ignore-certificate-errors",
      "--host-resolver-rules=MAP projudi.tjgo.jus.br 127.0.0.1:8443, MAP script.google.com 127.0.0.1:8443, MAP www.mercadopago.com.br 127.0.0.1:8443, EXCLUDE localhost"]
  });
  const erros = [];
  let sw = ctx.serviceWorkers().find((w) => w.url().endsWith("/background.js"));
  while (!sw) { const w = await ctx.waitForEvent("serviceworker", { timeout: 10000 }); if (w.url().endsWith("/background.js")) sw = w; }
  for (let i = 0; i < 40 && !(await sw.evaluate(() => !!(self.chrome && chrome.storage && chrome.storage.local)).catch(() => false)); i++) {
    await sleep(250);
    sw = ctx.serviceWorkers().find((w) => w.url().endsWith("/background.js")) || sw; // pode ter reiniciado
  }
  await sw.evaluate(() => chrome.storage.local.set({ email: "teste@exemplo.com" }));
  { const r0 = await ctx.newPage(); await r0.goto("https://projudi.tjgo.jus.br/__reiniciar").catch(() => {}); await r0.close(); }

  const pf = await ctx.newPage();
  pf.on("pageerror", (e) => erros.push(e.message));
  await pf.goto("http://localhost:8080/", { waitUntil: "domcontentloaded" });
  await pf.waitForFunction(() => window.PericiaFlowAutos && PericiaFlowAutos.extensao.versao, null, { timeout: 15000 });
  check("página PHP detecta a extensão", true, await pf.evaluate(() => PericiaFlowAutos.extensao.versao));

  const statusTxt = () => pf.textContent('[data-pf-autos-status="caso-42"]');
  const esperar = async (re, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const t = await statusTxt(); if (re.test(t)) return t; await sleep(300); } return await statusTxt(); };
  const aba = () => ctx.pages().find((p) => p.url().includes("projudi.tjgo.jus.br/BuscaProcesso"));
  const api = (q) => pf.evaluate(async (q) => (await fetch("/api/autos-projudi.php?" + q, { headers: { "X-PF-Autos": "1" } })).json(), q);

  console.log("\n1) Baixar autos para o PeríciaFlow PHP");
  await pf.click("[data-pf-autos]");
  let t = await esperar(/verificação|clique em Consultar|concluído|erro/, 30000);
  if (/verificação/.test(t)) { await aba().click("#cf-ok"); t = await esperar(/clique em Consultar|concluído|erro/, 30000); }
  check("pede o clique em Consultar", /clique em Consultar/.test(t), t);
  await aba().check("#cf-humano").catch(() => {}); await aba().click("input[name=Localizar]");
  t = await esperar(/concluído|erro/);
  check("concluído", /concluído/.test(t) && /3 arquivo/.test(t), t);
  const lista = await api("acao=listar&caso_id=caso-42");
  check("3 registros na tabela", lista.ok && lista.arquivos.length === 3, JSON.stringify(lista.arquivos.map((a) => [a.projudi_id, a.fase.slice(0, 20), a.data_mov])));
  const p7s = lista.arquivos.find((a) => a.projudi_id === "1002");
  const pdf = await pf.evaluate(async (id) => { const r = await fetch("/api/autos-projudi.php?acao=abrir&id=" + id, { headers: { "X-PF-Autos": "1" } }); const b = new Uint8Array(await r.arrayBuffer()); return String.fromCharCode(...b.slice(0, 5)) + " " + r.headers.get("content-type"); }, p7s.id);
  check("abre o PDF descriptografado (tirado do .p7s)", pdf.startsWith("%PDF-") && pdf.includes("application/pdf"), pdf);
  const noDisco = fs.readdirSync(ARMAZ + "/caso-42").map((f) => fs.readFileSync(ARMAZ + "/caso-42/" + f));
  check("arquivos no disco estão criptografados", noDisco.length === 3 && noDisco.every((b) => b.slice(0, 4).toString() === "PFA1" && !b.includes("%PDF")));
  const semCab = await pf.evaluate(async () => (await fetch("/api/autos-projudi.php?acao=listar&caso_id=caso-42")).status);
  check("API recusa chamada sem o cabeçalho de segurança", semCab === 400, String(semCab));

  console.log("\n2) Repetir (sem duplicar)");
  await pf.click("[data-pf-autos]");
  t = await esperar(/clique em Consultar|concluído|erro/, 30000);
  if (/clique em Consultar/.test(t)) { await aba().check("#cf-humano").catch(() => {}); await aba().click("input[name=Localizar]"); t = await esperar(/concluído|erro|Nada novo/); }
  const lista2 = await api("acao=listar&caso_id=caso-42");
  check("nada duplicado", lista2.arquivos.length === 3, t);
  const dup = await pf.evaluate(async () => {
    const fd = new FormData(); fd.append("caso_id", "caso-42"); fd.append("projudi_id", "1001"); fd.append("nome", "x.pdf");
    fd.append("arquivo", new Blob(["%PDF-1.4 teste"]), "x.pdf");
    return (await fetch("/api/autos-projudi.php?acao=enviar", { method: "POST", body: fd, headers: { "X-PF-Autos": "1" } })).json();
  });
  check("API devolve 'duplicado' para o mesmo arquivo", dup.ok && dup.duplicado === true, JSON.stringify(dup));

  console.log("\n3) Assinatura pelo Mercado Pago");
  await sw.evaluate(() => chrome.storage.local.set({ email: "novo@exemplo.com", lastOk: 0, validade: "" }));
  const pj = await ctx.newPage();
  await pj.goto("https://projudi.tjgo.jus.br/");                 // perito logado (cookie de sessão)
  await pj.evaluate(() => { document.cookie = "sess=1; path=/; Secure"; });
  await pj.goto("https://projudi.tjgo.jus.br/Processo?Id=77");
  await pj.waitForSelector(".projudi-pdf-planos button", { timeout: 15000 });
  check("sem assinatura: botões travados e planos à mostra", await pj.$eval("#projudi-pdf-send", (b) => b.disabled) && (await pj.$$(".projudi-pdf-planos button")).length === 3,
    await pj.textContent(".projudi-pdf-planos"));
  const pedidos = [];
  ctx.on("request", (r) => { if (r.url().includes("mercadopago")) pedidos.push(r.url()); });
  await sw.evaluate(() => { self.__abertas = []; const o = chrome.tabs.create.bind(chrome.tabs); chrome.tabs.create = (p, ...a) => { self.__abertas.push(p.url); return o(p, ...a); }; });
  await pj.click(".projudi-pdf-planos button:nth-child(3)");
  await sleep(1500);
  const abas = await sw.evaluate(() => self.__abertas || []);
  const mp = abas.find((u) => /mercadopago/.test(u)) || "";
  check("abre o checkout do plano anual no Mercado Pago", /mercadopago\.com\.br\/checkout.*pref_id=teste-anual.*novo%40exemplo\.com/.test(mp), mp || abas.join(" "));
  check("aviso no painel depois de abrir o pagamento", /Conclua o pagamento/.test(await pj.textContent("#projudi-pdf-lic-info")), await pj.textContent("#projudi-pdf-lic-info"));

  check("sem erros de JavaScript na página PHP", erros.length === 0, erros.join(" | "));
  await ctx.close();
  console.log(`\n${res.filter(Boolean).length}/${res.length} verificações passaram`);
  process.exit(res.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error("ERRO NO TESTE:", e); process.exit(2); });
