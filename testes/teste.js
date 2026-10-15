// Teste de ponta a ponta: extensão real + PROJUDI simulado + Gerenciador de Perícia (index.html do repositório).
const path = require("path");
const os = require("os");
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/npm-tools/node_modules/playwright")); }
const EXT = path.join(__dirname, "..", "extensao-projudi");
const SAIDA = path.join(__dirname, ".saida");
const fs = require("fs");
const NUM = "5151870-23.2026.8.09.0051";
const PF = "https://jonatasmiranda2405-crypto.github.io/gerenciador-pericias/" + (process.env.PF_CAMINHO || "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];
const check = (nome, ok, extra) => { resultados.push([ok ? "OK " : "FALHOU", nome, extra || ""]); console.log(ok ? "  ✔" : "  ✘", nome, extra || ""); };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-perfil-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium", headless: true, ignoreHTTPSErrors: true,
    env: { ...process.env, HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "" },
    args: ["--no-proxy-server", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--ignore-certificate-errors",
      "--host-resolver-rules=MAP projudi.tjgo.jus.br 127.0.0.1:8443, MAP jonatasmiranda2405-crypto.github.io 127.0.0.1:8443, MAP script.google.com 127.0.0.1:8443, MAP * ~NOTFOUND"]
  });
  const erros = [];
  ctx.on("page", (p) => p.on("pageerror", (e) => erros.push(p.url() + " :: " + e.message)));

  // assinatura: grava o e-mail do assinante (o servidor de teste responde ativo)
  let sw = ctx.serviceWorkers().find((w) => w.url().endsWith("/background.js"));
  while (!sw) { const w = await ctx.waitForEvent("serviceworker", { timeout: 10000 }); if (w.url().endsWith("/background.js")) sw = w; }
  for (let i = 0; i < 40 && !(await sw.evaluate(() => !!(self.chrome && chrome.storage && chrome.storage.local)).catch(() => false)); i++) {
    await sleep(250);
    sw = ctx.serviceWorkers().find((w) => w.url().endsWith("/background.js")) || sw; // pode ter reiniciado
  }
  await sw.evaluate(() => chrome.storage.local.set({ email: "teste@exemplo.com" }));
  { const r0 = await ctx.newPage(); await r0.goto("https://projudi.tjgo.jus.br/__reiniciar").catch(() => {}); await r0.close(); }

  const pf = await ctx.newPage();
  pf.on("pageerror", (e) => erros.push("PF :: " + e.message));
  await pf.goto(PF, { waitUntil: "domcontentloaded" });
  await pf.waitForFunction(() => typeof PJ !== "undefined" && PJ.versao, null, { timeout: 15000 });
  check("site detecta a extensão", true, await pf.evaluate(() => PJ.versao));

  const novoCaso = (dados) => pf.evaluate(async (d) => {
    const id = await criarCaso({ dono: "", emails: [""], editores: [""], compartilhamentos: [], codigo: nextCodigo(), nome: d.nome,
      numeroProcesso: d.numero, codigoAcesso: d.codigo || "", vara: "", comarca: "", partes: "", dataNomeacao: todayIso(), prazoEntrega: todayIso(),
      honorarios: 0, valorRecebido: 0, statusCaso: "em_andamento", observacoes: [] });
    openDrawer(id); return id;
  }, dados);
  const estado = (id) => pf.evaluate((id) => ({ s: PJ.status[id] || {}, docs: (casos.find((c) => c.id === id).documentos || []).map((d) => ({ id: d.id, nome: d.nome, fase: d.fase, data: d.data, pj: d.projudiId, url: d.arquivo && (d.arquivo.dataUrl || "").slice(0, 40) })) }), id);
  const esperarEtapa = async (id, etapas, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const e = await estado(id); if (etapas.includes(e.s.etapa)) return e; await sleep(300); }
    return await estado(id);
  };

  const abaProjudi = () => ctx.pages().find((p) => p.url().includes("projudi.tjgo.jus.br/BuscaProcesso"));
  // ---------- 1) pelo código de acesso, sem login ----------
  console.log("\n1) Baixar autos pelo código de acesso (sem login)");
  const c1 = await novoCaso({ nome: "Teste código", numero: NUM, codigo: "Ab12Cd34" });
  await pf.click(`button[onclick="pjBaixarAutos('${c1}')"]`);
  let e = await esperarEtapa(c1, ["captcha", "confirmar", "fim", "erro", "assistido", "login"], 30000);
  check("detecta a verificação do Cloudflare e pede ao perito", e.s.etapa === "captcha", e.s.texto);
  await abaProjudi().click("#cf-ok");                       // o perito resolve a verificação
  e = await esperarEtapa(c1, ["confirmar", "fim", "erro", "assistido", "login"], 30000);
  check("preenche e pede para clicar em Buscar (sem clique automático)", e.s.etapa === "confirmar", e.s.texto);
  const campos1 = await abaProjudi().evaluate(() => [document.querySelector("#ProcessoNumero").value, document.querySelector("#CodigoAcesso").value]);
  check("número curto e código (com maiúsculas e minúsculas) preenchidos", campos1[0] === "5151870-23" && campos1[1] === "Ab12Cd34", campos1.join(" / "));
  await abaProjudi().check("#cf-humano").catch(() => {}); await abaProjudi().click("input[name=Localizar]");            // o perito clica em Buscar
  e = await esperarEtapa(c1, ["fim", "erro", "assistido", "login"]);
  check("terminou", e.s.etapa === "fim", e.s.texto);
  check("3 documentos gravados", e.docs.length === 3, e.docs.map((d) => d.id).join(", "));
  check("IDs fixos do PROJUDI (sem duplicar)", e.docs.every((d) => /^pj_100[1-3]$/.test(d.id)));
  check("PDF extraído do .p7s", e.docs.some((d) => d.id === "pj_1002" && d.url.startsWith("data:application/pdf;base64,JVBER")), (e.docs.find((d) => d.id === "pj_1002") || {}).url);
  check("fase = movimentação", e.docs.some((d) => /Quesitos/.test(d.fase)), e.docs.map((d) => d.fase).join(" | "));
  check("data da movimentação", e.docs.some((d) => d.data === "2026-08-26"));
  await sleep(800);
  check("aba do PROJUDI fechada no fim", !ctx.pages().some((p) => p.url().includes("projudi")), ctx.pages().map((p) => p.url()).join(" "));

  // ---------- 2) repetir: nada novo; depois um arquivo novo ----------
  console.log("\n2) Repetir o pedido (não pode duplicar)");
  await pf.click(`button[onclick="pjBaixarAutos('${c1}')"]`);
  await sleep(500);
  e = await esperarEtapa(c1, ["confirmar", "fim", "erro", "assistido", "login"]);
  if (e.s.etapa === "confirmar") { await abaProjudi().check("#cf-humano").catch(() => {}); await abaProjudi().click("input[name=Localizar]"); }
  e = await esperarEtapa(c1, ["fim", "erro", "assistido", "login"]);
  check("sem arquivos novos", e.s.etapa === "fim" && e.docs.length === 3, e.s.texto);
  await pf.evaluate(() => fetch("/__liberar_extra"));
  await pf.click(`button[onclick="pjBaixarAutos('${c1}')"]`);
  await sleep(500);
  e = await esperarEtapa(c1, ["confirmar", "fim", "erro", "assistido", "login"]);
  if (e.s.etapa === "confirmar") { await abaProjudi().check("#cf-humano").catch(() => {}); await abaProjudi().click("input[name=Localizar]"); }
  e = await esperarEtapa(c1, ["fim", "erro", "assistido", "login"]);
  check("só o arquivo novo veio", e.docs.length === 4 && e.s.texto.includes("1 arquivo"), e.s.texto);

  // ---------- 3) com o login do perito ----------
  console.log("\n3) Baixar autos com o login do perito (sem código)");
  const c2 = await novoCaso({ nome: "Teste login", numero: NUM });
  await pf.click(`button[onclick="pjBaixarAutos('${c2}')"]`);
  e = await esperarEtapa(c2, ["login", "fim", "erro", "assistido"], 30000);
  check("pede login ao perito", e.s.etapa === "login", e.s.texto);
  const aba = ctx.pages().find((p) => p.url().includes("projudi"));
  check("aba do PROJUDI com a faixa de aviso", !!aba && await aba.locator("#pf-robo-faixa").count() === 1, aba && await aba.locator("#pf-robo-faixa").textContent());
  // o perito entra (aqui simulado com CPF e senha)
  await aba.fill("#u", "00000000000"); await aba.fill("#s", "senha-do-perito");
  await aba.click("button[type=submit]");
  e = await esperarEtapa(c2, ["confirmar", "fim", "erro", "assistido"], 60000);
  check("depois do login, preenche a busca e pede o clique", e.s.etapa === "confirmar", e.s.texto);
  await abaProjudi().check("#cf-humano").catch(() => {}); await abaProjudi().click("input[name=Localizar]");
  e = await esperarEtapa(c2, ["fim", "erro", "assistido"], 60000);
  check("continuou sozinho depois do login", e.s.etapa === "fim" && e.docs.length === 4, e.s.texto);

  // ---------- 4) envio iniciado no PROJUDI ----------
  console.log("\n4) Enviar ao Gerenciador de Perícia a partir da tela do processo");
  const pj = await ctx.newPage();
  await pj.goto("https://projudi.tjgo.jus.br/Processo?Id=77");
  await pj.waitForSelector("#projudi-pdf-send:not([disabled])", { timeout: 15000 });
  await pj.click("#projudi-pdf-send");
  await pf.waitForSelector("#pjOferta select", { timeout: 30000 });
  const opcao = await pf.$eval("#pjOferta select", (s) => s.value);
  check("oferta aparece no Gerenciador de Perícia com a perícia do mesmo número pré-escolhida", opcao !== "novo", opcao);
  await pf.selectOption("#pjOferta select", "novo");
  const antes = await pf.evaluate(() => casos.length);
  await pf.click("#pjOferta .btn-primary");
  await pf.waitForFunction((n) => casos.length > n, antes, { timeout: 10000 });
  const c3 = await pf.evaluate(() => casos[casos.length - 1].id);
  e = await esperarEtapa(c3, ["fim", "erro"], 60000);
  const caso3 = await pf.evaluate((id) => { const c = casos.find((x) => x.id === id); return { nome: c.nome, vara: c.vara, partes: c.partes, num: c.numeroProcesso }; }, c3);
  check("perícia nova criada com a capa do processo", caso3.nome === "Procedimento Comum Cível" && /5ª Vara/.test(caso3.vara) && /Maria Teste x Banco/.test(caso3.partes), JSON.stringify(caso3));
  check("arquivos importados na perícia nova", e.s.etapa === "fim" && e.docs.length === 4, e.s.texto);
  check("status no painel do PROJUDI", /Concluído: 4/.test(await pj.textContent("#projudi-pdf-status")), await pj.textContent("#projudi-pdf-status"));

  // ---------- 5) botão de ZIP continua funcionando ----------
  console.log("\n5) Baixar ZIP (função antiga)");
  await pj.click("#projudi-pdf-btn");
  await pj.waitForFunction(() => /Pronto:|Erro|falharam/.test(document.querySelector("#projudi-pdf-status").textContent), null, { timeout: 30000 });
  check("ZIP gerado", /Pronto: PROJUDI_.*4 arquivo/.test(await pj.textContent("#projudi-pdf-status")), await pj.textContent("#projudi-pdf-status"));

  // ---------- 6) telas ----------
  await pf.evaluate(() => { closeDrawer(); setSection("perfil"); });
  await sleep(400);
  check("Meu perfil mostra 'Acesso ao PROJUDI'", await pf.locator("text=Acesso ao PROJUDI").count() > 0);
  await pf.screenshot({ path: path.join(SAIDA, "config.png"), fullPage: false });
  await pf.evaluate((id) => openDrawer(id), c1);
  await sleep(400);
  await pf.locator(`button[onclick="pjBaixarAutos('${c1}')"]`).scrollIntoViewIfNeeded();
  await pf.screenshot({ path: path.join(SAIDA, "drawer.png") });

  check("sem erros de JavaScript", erros.length === 0, erros.slice(0, 5).join(" || "));
  await ctx.close();
  const falhas = resultados.filter((r) => r[0] !== "OK ");
  console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações passaram`);
  process.exit(falhas.length ? 1 : 0);
})().catch((e) => { console.error("ERRO NO TESTE:", e); process.exit(2); });
