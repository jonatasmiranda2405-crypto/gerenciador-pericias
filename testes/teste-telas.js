// Teste das telas novas (prévia /novo): Importar, Publicações, Prazos e alertas, Tarefas,
// Agenda, Financeiro e Integrações. Roda no modo local (sem Firebase), com a extensão real.
const path = require("path");
const os = require("os");
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/npm-tools/node_modules/playwright")); }
const EXT = path.join(__dirname, "..", "extensao-projudi");
const SAIDA = path.join(__dirname, ".saida");
const PF = "https://jonatasmiranda2405-crypto.github.io/gerenciador-pericias/novo/";
const NUM = "5151870-23.2026.8.09.0051";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = [];
const check = (n, ok, x) => { res.push(ok); console.log(ok ? "  ✔" : "  ✘", n, x || ""); };

(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "pf-perfil-")), {
    channel: "chromium", headless: true, ignoreHTTPSErrors: true, acceptDownloads: true, viewport: { width: 1360, height: 900 },
    env: { ...process.env, HTTPS_PROXY: "", HTTP_PROXY: "", https_proxy: "", http_proxy: "" },
    args: ["--no-proxy-server", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--ignore-certificate-errors",
      "--host-resolver-rules=MAP projudi.tjgo.jus.br 127.0.0.1:8443, MAP jonatasmiranda2405-crypto.github.io 127.0.0.1:8443, MAP script.google.com 127.0.0.1:8443, EXCLUDE localhost"]
  });
  await ctx.grantPermissions(["notifications"], { origin: "https://jonatasmiranda2405-crypto.github.io" });
  let sw = ctx.serviceWorkers().find((w) => w.url().endsWith("/background.js"));
  while (!sw) { const w = await ctx.waitForEvent("serviceworker", { timeout: 10000 }); if (w.url().endsWith("/background.js")) sw = w; }
  for (let i = 0; i < 40 && !(await sw.evaluate(() => !!(self.chrome && chrome.storage && chrome.storage.local)).catch(() => false)); i++) { await sleep(250); sw = ctx.serviceWorkers().find((w) => w.url().endsWith("/background.js")) || sw; }
  await sw.evaluate(() => chrome.storage.local.set({ email: "teste@exemplo.com" }));
  { const r0 = await ctx.newPage(); await r0.goto("https://projudi.tjgo.jus.br/__reiniciar").catch(() => {}); await r0.close(); }

  const pf = await ctx.newPage();
  const erros = [];
  pf.on("pageerror", (e) => erros.push(e.message));
  // registra as notificações mostradas
  await pf.addInitScript(() => {
    window.__notas = [];
    const N = window.Notification;
    window.Notification = function (t, o) { window.__notas.push(t + " | " + (o && o.body)); return { close() {} }; };
    window.Notification.permission = "granted";
    window.Notification.requestPermission = async () => "granted";
  });
  await pf.goto(PF, { waitUntil: "domcontentloaded" });
  await pf.waitForFunction(() => typeof PJ !== "undefined" && PJ.versao && typeof renderTarefas === "function", null, { timeout: 15000 });
  const ir = async (s) => { await pf.evaluate((s) => { closeDrawer(); setSection(s); }, s); await sleep(250); };
  const foto = (n) => pf.screenshot({ path: path.join(SAIDA, `tela-${n}.png`) });

  // perícia de trabalho
  const c1 = await pf.evaluate(async (num) => {
    const id = await criarCaso({ dono: "", emails: [""], editores: [""], compartilhamentos: [], codigo: nextCodigo(), nome: "Revisional de contrato bancário",
      numeroProcesso: num, codigoAcesso: "", vara: "3ª Vara Cível de Goiânia", comarca: "Goiânia", partes: "Maria x Banco", dataNomeacao: todayIso(),
      prazoEntrega: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), honorarios: 6800, valorRecebido: 3400, statusCaso: "em_andamento", observacoes: [] });
    return id;
  }, NUM);

  console.log("\n1) Navegação");
  const nav = await pf.$$eval("#nav .nav-item span:first-of-type", (s) => s.map((x) => x.textContent));
  check("menu com as telas novas", ["Importar processo", "Publicações", "Prazos e alertas", "Tarefas", "Agenda", "Financeiro", "Integrações"].every((t) => nav.includes(t)), nav.join(" · "));
  check("telas antigas continuam no menu", ["Perícias", "Cálculos", "Proposta de honorários", "Documentos", "Análise IA", "Equipe", "Projudi", "Configurações"].every((t) => nav.includes(t)));

  console.log("\n2) Tarefas");
  await ir("tarefas");
  await pf.fill("#pfTarefaTitulo", "Responder quesitos complementares");
  await pf.selectOption("#pfTarefaCaso", c1);
  await pf.selectOption("#pfTarefaPrio", "alta");
  await pf.fill("#pfTarefaAte", new Date(Date.now() + 864e5).toISOString().slice(0, 10));
  await pf.click(".pf-form button[type=submit]");
  await sleep(300);
  check("tarefa criada na coluna A fazer", await pf.locator('.pf-kcol[data-col="fazer"] .pf-kcard').count() === 1);
  await pf.click('.pf-kcol[data-col="fazer"] .pf-kcard button[aria-label="Avançar"]');
  await sleep(300);
  check("tarefa avançou para Em andamento", await pf.locator('.pf-kcol[data-col="fazendo"] .pf-kcard').count() === 1);
  await pf.dragAndDrop('.pf-kcol[data-col="fazendo"] .pf-kcard', '.pf-kcol[data-col="feito"]');
  await sleep(300);
  check("arrastar e soltar para Feito", await pf.locator('.pf-kcol[data-col="feito"] .pf-kcard').count() === 1);
  await pf.click('.pf-kcol[data-col="feito"] .pf-kcard button[aria-label="Voltar"]');
  await sleep(300);
  const salvo = await pf.evaluate((id) => (casos.find((c) => c.id === id).tarefas || []).map((t) => t.col + ":" + t.prio), c1);
  check("tarefa gravada na perícia", salvo.join() === "fazendo:alta", salvo.join());
  check("selo de tarefas abertas no menu", /Tarefas\s*1/.test(await pf.textContent("#nav")));
  await foto("tarefas");

  console.log("\n3) Agenda");
  await ir("agenda");
  const amanha = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  await pf.fill("#pfCompTitulo", "Diligência na sede da empresa");
  await pf.selectOption("#pfCompTipo", "diligencia");
  await pf.fill("#pfCompData", amanha);
  await pf.fill("#pfCompHora", "10:00");
  await pf.fill("#pfCompLocal", "Av. T-63, Setor Bueno");
  await pf.selectOption("#pfCompCaso", c1);
  await pf.click(".pf-form button[type=submit]");
  await sleep(300);
  check("compromisso na agenda", /Diligência na sede da empresa/.test(await pf.textContent("#view")));
  check("prazo de entrega aparece na agenda", /Entrega do laudo/.test(await pf.textContent("#view")));
  const [dl] = await Promise.all([pf.waitForEvent("download"), pf.click("text=Baixar agenda (.ics)")]);
  const ics = fs.readFileSync(await dl.path(), "utf8");
  check("arquivo .ics válido com compromisso e prazo", /BEGIN:VCALENDAR/.test(ics) && /DTSTART;TZID=America\/Sao_Paulo:\d{8}T100000/.test(ics) && /PRAZO: Entrega do laudo/.test(ics), dl.suggestedFilename());
  await foto("agenda");

  console.log("\n4) Financeiro");
  await ir("financeiro");
  await pf.fill(`#pfDep-${c1}`, "5.000,00");
  await pf.press(`#pfDep-${c1}`, "Tab");
  await sleep(300);
  const dep = await pf.evaluate((id) => casos.find((c) => c.id === id).honorariosDepositados, c1);
  check("valor depositado salvo", dep === 5000, String(dep));
  const kpis = await pf.$$eval(".kpi .v", (v) => v.map((x) => x.textContent.replace(/\s/g, " ")));
  const esperado = await pf.evaluate(() => {
    const base = casosVisiveis().filter((c) => (+c.honorarios || 0) > 0 || (+c.valorRecebido || 0) > 0);
    const s = { arbitrado: 0, aLevantar: 0, levantado: 0, semDeposito: 0 };
    base.forEach((c) => { const f = pfFin(c); for (const k in s) s[k] += f[k]; });
    return [s.arbitrado, s.aLevantar, s.levantado, s.semDeposito].map((v) => fmtMoney(v).replace(/\s/g, " "));
  });
  const linha = await pf.$eval(`#pfDep-${c1}`, (i) => i.closest("tr").textContent.replace(/\s+/g, " "));
  check("indicadores somam todas as perícias", JSON.stringify(kpis) === JSON.stringify(esperado), kpis.join(" | "));
  check("linha da perícia: arbitrado 6.800 e levantado 3.400", /6\.800,00/.test(linha) && /3\.400,00/.test(linha), linha.slice(0, 120));
  await foto("financeiro");

  console.log("\n5) Prazos e alertas");
  await ir("prazos");
  check("painel de alertas no topo dos prazos", await pf.locator("text=Alertas de prazo").count() > 0);
  await pf.click("#pfAlertaNav");
  await sleep(500);
  const notas = await pf.evaluate(() => window.__notas);
  check("notificação do prazo em 3 dias e da tarefa de amanhã", notas.some((n) => /Prazo em 3 dias/.test(n)) && notas.some((n) => /Tarefa para amanhã/.test(n)), notas.join(" || "));
  const repet = await pf.evaluate(() => pfVerificarAlertas(false));
  check("não repete o mesmo aviso no mesmo dia", repet === 0, String(repet));
  await foto("prazos");

  console.log("\n6) Importar processo (PROJUDI pela extensão)");
  await ir("importar");
  await pf.fill("#pfImpNumero", NUM);
  check("reconhece a perícia do mesmo número", await pf.$eval("#pfImpDestino", (s) => s.value) === c1);
  await pf.fill("#pfImpCodigo", "Ab12Cd34");
  await foto("importar");
  await pf.click(".pf-form button[type=submit]");
  const aba = async () => { for (let i = 0; i < 40; i++) { const p = ctx.pages().find((x) => x.url().includes("projudi.tjgo.jus.br/BuscaProcesso")); if (p) return p; await sleep(250); } return null; };
  let st = await pf.waitForFunction((id) => PJ.status[id] && ["captcha", "confirmar", "erro", "fim"].includes(PJ.status[id].etapa) && PJ.status[id].etapa, c1, { timeout: 30000 }).then((h) => h.jsonValue());
  if (st === "captcha") { await (await aba()).click("#cf-ok"); st = await pf.waitForFunction((id) => ["confirmar", "erro", "fim"].includes(PJ.status[id].etapa) && PJ.status[id].etapa, c1, { timeout: 30000 }).then((h) => h.jsonValue()); }
  check("pedido chega ao PROJUDI e pede o clique em Consultar", st === "confirmar", st);
  const p = await aba();
  await p.check("#cf-humano"); await p.click("input[name=Localizar]");
  st = await pf.waitForFunction((id) => ["erro", "fim"].includes(PJ.status[id].etapa) && PJ.status[id].etapa, c1, { timeout: 60000 }).then((h) => h.jsonValue());
  const docs = await pf.evaluate((id) => (casos.find((c) => c.id === id).documentos || []).length, c1);
  check("autos importados na perícia certa", st === "fim" && docs === 3, `${st} · ${docs} documentos`);
  check("código de acesso salvo como digitado", await pf.evaluate((id) => casos.find((c) => c.id === id).codigoAcesso, c1) === "Ab12Cd34");

  console.log("\n7) Publicações e Integrações");
  await ir("publicacoes");
  check("Publicações explica o DJEN e lista o que será monitorado", /a conectar/.test(await pf.textContent("#view")) && (await pf.textContent("#view")).includes(NUM));
  await foto("publicacoes");
  await ir("integracoes");
  const integ = await pf.textContent("#view");
  check("Integrações mostra a extensão instalada e as notificações ligadas", /v1\.7\.\d instalada/.test(integ) && /ligadas/.test(integ), integ.slice(0, 160).replace(/\s+/g, " "));
  await foto("integracoes");
  await ir("visao");
  check("Visão geral mostra a agenda da semana", /Agenda da semana/.test(await pf.textContent("#view")));
  await foto("visao");

  console.log("\n8) Celular e tema escuro");
  await pf.setViewportSize({ width: 390, height: 844 });
  await pf.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); });
  for (const s of ["tarefas", "financeiro", "agenda"]) {
    await ir(s);
    const largura = await pf.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${s} sem rolagem lateral no celular`, largura <= 1, `${largura}px`);
    await foto(`${s}-celular-escuro`);
  }

  check("sem erros de JavaScript", erros.length === 0, erros.slice(0, 3).join(" | "));
  await ctx.close();
  console.log(`\n${res.filter(Boolean).length}/${res.length} verificações passaram`);
  process.exit(res.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error("ERRO NO TESTE:", e); process.exit(2); });
