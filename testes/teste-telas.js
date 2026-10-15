// Teste das telas novas (prévia /novo): Importar, Publicações, Prazos e alertas, Tarefas,
// Agenda, Financeiro e Integrações. Roda no modo local (sem Firebase), com a extensão real.
const path = require("path");
const os = require("os");
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/npm-tools/node_modules/playwright")); }
const EXT = path.join(__dirname, "..", "extensao-projudi");
const SAIDA = path.join(__dirname, ".saida");
const PF = "https://jonatasmiranda2405-crypto.github.io/gerenciador-pericias/";
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
  const cspErros = [];
  pf.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) cspErros.push(m.text().slice(0, 200)); });
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
  check("telas antigas continuam no menu", ["Perícias", "Cálculos", "Proposta de honorários", "Documentos", "Revisão IA", "Equipe", "Projudi", "Configurações"].every((t) => nav.includes(t)));

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
  check("menu sem selo para tarefa que ainda não vence", await pf.locator('#nav .nav-item[data-sec="tarefas"] .nav-badge').count() === 0);
  await pf.click('.pf-kcol[data-col="fazendo"] .pf-kcard button:has-text("Apagar")');
  await sleep(300);
  const apagou = await pf.locator(".pf-kcard").count() === 0;
  await pf.click("#pfAviso button");
  await sleep(300);
  check("apagar mostra Desfazer e a tarefa volta", apagou && await pf.locator('.pf-kcol[data-col="fazendo"] .pf-kcard').count() === 1);
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

  console.log("\n9) Revisão IA: carrossel, decisões e PDF");
  await pf.evaluate(async (id) => {
    perfil.ia = { chave: "chave-de-teste", cienciaEm: "2026-10-01T00:00:00Z" };
    iaCatalogo = [];
    const c = casos.find((x) => x.id === id);
    await saveCaso(id, { analiseIA: {
      resumo: "Embargos à execução com perícia contábil.", areaProvavel: "Contábil", objeto: "Cálculos", confianca: "media",
      achados: [
        { categoria: "Cálculo", gravidade: "erro", titulo: "Juros contados antes do termo inicial", detalhe: "Planilha aplica juros desde o contrato.", efeito: "aumenta o valor.", fonte: "Planilha, p. 3", trecho: "juros a partir da citação" },
        { categoria: "Documentos", gravidade: "atencao", titulo: "Extratos de 2023 ausentes", detalhe: "Faltam extratos.", efeito: "", fonte: "Embargos, anexos 4 a 9", trecho: "" },
        { categoria: "Prazos", gravidade: "verificar", titulo: "Prazo do laudo não encontrado", detalhe: "Sem prazo.", efeito: "", fonte: "Nomeação", trecho: "" },
        { categoria: "Valores", gravidade: "erro", titulo: "Total não confere", detalhe: "Soma diferente.", efeito: "", fonte: "Planilha, p. 5", trecho: "" }
      ],
      documentos: [], linhaDoTempo: [{ data: "02/03/2026", fato: "Apelação provida", fonte: "Acórdão" }], prazos: [], lacunas: ["Planilha do exequente"],
      quando: new Date().toISOString(), modelo: "gemini-teste", fontes: [{ nome: "a.pdf" }], avisos: [], chars: 100, assinatura: iaAssinatura(c) } });
    iaCasoId = id;
  }, c1);
  await pf.evaluate(() => { document.documentElement.setAttribute("data-theme", "light"); });
  await pf.setViewportSize({ width: 1360, height: 900 });
  await ir("ia");
  check("revisão mostra um cartão por achado, erros primeiro", await pf.locator(".ia-card").count() === 4 && /Erro/.test(await pf.textContent("#iaDetalhe")), await pf.textContent(".ia-nav"));
  const c2 = await pf.evaluate(async () => criarCaso({ dono: "", emails: [""], editores: [""], compartilhamentos: [], codigo: nextCodigo(), nome: "Outra perícia", numeroProcesso: "0000009-00.2026.8.00.0000", statusCaso: "em_andamento", observacoes: [] }));
  await ir("ia");
  await pf.selectOption("#iaPericia", c2);
  await sleep(250);
  const numOutra = (await pf.textContent(".ia-num")).trim();
  await pf.selectOption("#iaPericia", c1);
  await sleep(250);
  check("número do processo na Revisão IA acompanha a perícia escolhida", numOutra === "0000009-00.2026.8.00.0000" && (await pf.textContent(".ia-num")).trim() === NUM, numOutra);
  check("sem quesitos sugeridos na tela", !/Quesitos sugeridos/i.test(await pf.textContent("#view")));
  check("selo de revisão em dia", /Em dia/.test(await pf.textContent(".ia-fresco")));
  await pf.click('.ia-chip:has-text("Documentos")');
  check("filtro por categoria", await pf.locator(".ia-card").count() === 1 && /Extratos de 2023/.test(await pf.textContent("#iaDetalhe")));
  await pf.click('.ia-chip:has-text("Todos")');
  await pf.click('#iaDetalhe button:has-text("Confirmar erro")');
  await sleep(300);
  const dec = await pf.evaluate((id) => Object.values(casos.find((c) => c.id === id).iaRevisao || {}), c1);
  check("confirmar grava a decisão e passa ao próximo", dec.join() === "confirmado" && /2 de 4/.test(await pf.textContent(".ia-nav")), dec.join() + " · " + (await pf.textContent(".ia-nav")).trim());
  await pf.keyboard.press("ArrowRight");
  await sleep(200);
  check("seta do teclado passa o cartão", /3 de 4/.test(await pf.textContent(".ia-nav")));
  await pf.click(".ia-card >> nth=0");
  await sleep(200);
  check("cartão confirmado mostra a marca", /erro/.test(await pf.textContent(".ia-card >> nth=0 >> .ia-card-top em")));
  await pf.screenshot({ path: path.join(SAIDA, "tela-revisao-ia.png"), fullPage: true });
  const [pdf] = await Promise.all([pf.waitForEvent("download", { timeout: 20000 }), pf.click('button:has-text("Baixar PDF dos erros")')]);
  const bytes = fs.readFileSync(await pdf.path());
  const txt = bytes.toString("latin1");
  check("PDF dos erros baixado", bytes.slice(0, 5).toString() === "%PDF-" && /Erros confirmados \\\(1\\\)/.test(txt) && /Pontos a conferir \\\(3\\\)/.test(txt), `${pdf.suggestedFilename()} · ${bytes.length} bytes`);
  fs.copyFileSync(await pdf.path(), path.join(SAIDA, "verificacao-exemplo.pdf"));
  await pf.evaluate(async (id) => {
    const c = casos.find((x) => x.id === id);
    await saveCaso(id, { analiseIA: Object.assign({}, c.analiseIA, { achados: undefined, pontosAtencao: [{ titulo: "Ponto antigo", detalhe: "x", risco: "alto", fonte: "y" }], quesitos: [{ pergunta: "Q antiga?", porque: "z" }] }) });
  }, c1);
  await ir("ia");
  check("análise antiga continua abrindo, sem os quesitos", await pf.locator(".ia-card").count() === 1 && !/Q antiga/.test(await pf.textContent("#view")));

  console.log("\n10) Meu perfil e Configurações");
  await pf.evaluate(() => { closeDrawer(); setSection("visao"); });
  await pf.click("#perfil .pf-quem");
  await sleep(250);
  check("clicar no perfil abre Meu perfil com o cadastro", await pf.evaluate(() => activeSection) === "perfil" && /Meu cadastro/i.test(await pf.textContent("#view")) && /Acesso ao PROJUDI/i.test(await pf.textContent("#view")));
  await pf.screenshot({ path: path.join(SAIDA, "tela-perfil.png") });
  await ir("config");
  const cfgTxt = await pf.textContent("#view");
  check("Configurações sem cadastro: só tela, cores e manuais", !/Meu cadastro|CRC/i.test(cfgTxt) && /Tela/.test(cfgTxt) && /Cores/.test(cfgTxt) && /Manuais de uso/.test(cfgTxt));
  await pf.click('.cfg-tema[data-tema="dark"]');
  await sleep(200);
  check("tema escuro aplica na hora", await pf.evaluate(() => document.documentElement.getAttribute("data-theme")) === "dark" && await pf.locator('.cfg-tema.on[data-tema="dark"]').count() === 1);
  await pf.click('.cfg-cor[data-paleta="jade"]');
  await sleep(200);
  check("cor escolhida aplica e fica lembrada", await pf.evaluate(() => document.documentElement.getAttribute("data-palette") + "|" + JSON.parse(localStorage.getItem("pericias.aparencia")).paleta) === "jade|jade");
  await pf.screenshot({ path: path.join(SAIDA, "tela-config-escuro.png"), fullPage: true });
  await pf.click('.cfg-tema[data-tema="light"]');
  await pf.click('.cfg-cor[data-paleta="flow"]');
  await sleep(200);
  await pf.screenshot({ path: path.join(SAIDA, "tela-config.png"), fullPage: true });
  check("um cartão por manual, com a chave da IA em destaque", await pf.locator(".cfg-manual").count() >= 6 && await pf.locator('.cfg-manual.destaque[data-manual="chave-ia"]').count() === 1);
  const [man] = await Promise.all([pf.waitForEvent("download", { timeout: 20000 }), pf.click('.cfg-manual[data-manual="chave-ia"]')]);
  const mb = fs.readFileSync(await man.path());
  fs.copyFileSync(await man.path(), path.join(SAIDA, "manual-chave-ia.pdf"));
  check("manual da chave da IA baixa em PDF", mb.slice(0, 5).toString() === "%PDF-" && man.suggestedFilename() === "gerenciador-pericia-manual-chave-ia.pdf", `${mb.length} bytes`);
  const [tudo] = await Promise.all([pf.waitForEvent("download", { timeout: 20000 }), pf.click(".cfg-todos")]);
  fs.copyFileSync(await tudo.path(), path.join(SAIDA, "manuais-todos.pdf"));
  check("manual completo baixa em um PDF", tudo.suggestedFilename() === "gerenciador-pericia-manuais.pdf");

  console.log("\n11) Segurança e Termos e privacidade");
  check("página com política de segurança (CSP) e sem scripts de CDN", await pf.evaluate(() =>
    /object-src 'none'/.test((document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || "") &&
    ![...document.scripts].some((x) => /cdnjs|gstatic/.test(x.src))));
  const MAL = "x');window.__xss=1;('";
  await pf.evaluate(async ([id, mal]) => {
    const c = casos.find((x) => x.id === id);
    await saveCaso(id, { tarefas: [...(c.tarefas || []), { id: mal, titulo: "<img src=x onerror=window.__xss=2>", col: "fazer", prio: "alta" }] });
  }, [c1, MAL]);
  await ir("tarefas");
  await pf.click(`.pf-kcard:has-text("<img src=x") button[aria-label="Avançar"]`);
  await sleep(300);
  check("id e título maliciosos não viram código (tarefas)", await pf.evaluate(() => window.__xss === undefined) && await pf.locator('.pf-kcol[data-col="fazendo"] .pf-kcard:has-text("<img src=x")').count() === 1);
  check("dados da nuvem passam pela limpeza", await pf.evaluate(() => {
    const o = limparCaso({ emails: ["ok@x.com", "a');alert(1)//@x.com"], editores: ["OK@X.COM"], tarefas: [{ id: "a'b", titulo: "t" }], compartilhamentos: [{ email: 'b"@x.com' }] });
    return o.emails.join() === "ok@x.com" && o.editores.join() === "ok@x.com" && o.tarefas[0].id === "a_b" && o.compartilhamentos.length === 0;
  }));
  check("endereço de arquivo perigoso é recusado", await pf.evaluate(() =>
    arquivoSrc({ url: "javascript:alert(1)" }) === "" && arquivoSrc({ dataUrl: "data:text/html;base64,PHNjcmlwdD4=" }) === "" &&
    arquivoSrc({ url: "https://firebasestorage.googleapis.com/v0/b/outro-bucket/o/casos%2Fx.html?alt=media" }) === "" &&
    arquivoSrc({ url: "https://firebasestorage.googleapis.com/v0/b/gerenciador-pericias-app.firebasestorage.app/o/casos%2Fc1%2Fdocumentos%2Fd1%2Fa.pdf?alt=media&token=t" }) !== "" &&
    arquivoSrc({ dataUrl: "data:application/pdf;base64,JVBE" }) !== ""));
  check("hora, prioridade, datas e valores voltam ao formato esperado", await pf.evaluate(() => {
    const o = limparCaso({ honorarios: "<img src=x onerror=alert(1)>", prazoEntrega: "2026-01-01\"><b>", compromissos: [{ id: "e1", hora: "<img src=x onerror=alert(1)>", data: "x", tipo: "zz" }],
      tarefas: [{ id: "t1", prio: "alta\" onmouseover=alert(1) x=\"", col: "zz", ate: 5 }], proposta: { adiantamento: "\"><script>" } });
    return o.honorarios === 0 && o.prazoEntrega === "" && o.compromissos[0].hora === "" && o.compromissos[0].tipo === "outro" &&
      o.tarefas[0].prio === "media" && o.tarefas[0].col === "fazer" && o.tarefas[0].ate === "" && o.proposta.adiantamento === 0;
  }));
  await ir("privacidade");
  check("Termos e privacidade: três documentos em abas", await pf.locator(".lg-aba").count() === 3 && /Termos de uso/.test(await pf.textContent(".lg-texto h1")));
  check("índice lateral com as seções", await pf.locator(".lg-indice-item").count() === await pf.locator(".lg-sec").count() && await pf.locator(".lg-sec").count() >= 10);
  await pf.click('.lg-aba[data-legal="seguranca"]');
  await sleep(200);
  check("aba Segurança abre", /Segurança/.test(await pf.textContent(".lg-texto h1")) && /Controle de acesso no servidor/.test(await pf.textContent(".lg-texto")));
  await pf.screenshot({ path: path.join(SAIDA, "tela-seguranca.png"), fullPage: true });
  await pf.click('.lg-aba[data-legal="privacidade"]');
  await sleep(200);
  await pf.screenshot({ path: path.join(SAIDA, "tela-privacidade.png") });
  const [lgpdf] = await Promise.all([pf.waitForEvent("download", { timeout: 20000 }), pf.click(".lg-pdf")]);
  fs.copyFileSync(await lgpdf.path(), path.join(SAIDA, "politica-privacidade.pdf"));
  check("política baixa em PDF", lgpdf.suggestedFilename() === "gerenciador-pericia-privacidade.pdf");
  await pf.evaluate(() => abrirLegal("termos"));
  await sleep(200);
  check("janela dos termos abre por cima (login e aceite)", await pf.isVisible("#legalModal .lg-texto"));
  await pf.screenshot({ path: path.join(SAIDA, "tela-termos-janela.png") });
  await pf.keyboard.press("Escape");
  check("Esc fecha a janela", !(await pf.isVisible("#legalModal .lg-texto")));
  check("sem violação da política de segurança no console", cspErros.length === 0, cspErros.slice(0, 2).join(" | "));

  console.log("\n12) Página de apresentação (antes do login)");
  await pf.evaluate(() => { closeDrawer(); abrirLogin(true); });
  await sleep(400);
  check("apresentação aparece com as seções", await pf.isVisible("#login .lp-heroi") && await pf.locator("#login .lp-mod").count() === 11 && await pf.locator("#login .lp-faq details").count() >= 8);
  check("telas reais carregam na demonstração", await pf.evaluate(() => new Promise((ok) => { const i = document.getElementById("lpDemoImg"); if (i.complete) ok(i.naturalWidth > 0); else { i.onload = () => ok(i.naturalWidth > 0); i.onerror = () => ok(false); } })));
  await pf.click('#login .lp-demo-aba:has-text("Revisão IA")');
  await sleep(300);
  check("escolher a tela da demonstração", /revisao-ia\.webp/.test(await pf.getAttribute("#lpDemoImg", "src")) && (await pf.textContent("#lpDemoNum")).trim() === "3/8");
  await pf.fill("#lpHora", "200");
  await pf.evaluate(() => { const r = document.getElementById("lpH0"); r.value = "10"; r.dispatchEvent(new Event("input")); });
  check("simulador de honorários calcula", /R\$\s?7\.200,00/.test(await pf.textContent("#lpTotal")), await pf.textContent("#lpTotal"));
  await pf.click("#lpAbaPrazo");
  await pf.fill("#lpPzData", "2026-10-16");
  await pf.fill("#lpPzDias", "5");
  await pf.evaluate(() => lpPrazo());
  check("contador de prazo pula o fim de semana", /23 de outubro de 2026/.test(await pf.textContent("#lpPzFim")), await pf.textContent("#lpPzFim"));
  await pf.click('#login .lp-cab-acoes button:has-text("Entrar")');
  await sleep(200);
  check("Entrar abre o login em janela", await pf.isVisible("#lpJanela #loginEmail") && await pf.evaluate(() => document.activeElement && document.activeElement.id === "loginEmail"));
  await pf.fill("#lpJanela #loginEmail", "perita@exemplo.com");
  await pf.click('#lpJanela button:has-text("Esqueci a senha")');
  await sleep(150);
  check("Esqueci a senha abre a tela própria com o e-mail digitado", /Redefinir a senha/.test(await pf.textContent("#lpJanela")) && await pf.inputValue("#lpJanela #loginEmail") === "perita@exemplo.com");
  await pf.evaluate(() => { recuperarEnviado = "perita@exemplo.com"; recuperarEspera = Date.now() + 30000; renderLogin(); });
  check("depois do envio: confira o e-mail, com espera para reenviar", /Confira o seu e-mail/.test(await pf.textContent("#lpJanela")) && /Pode reenviar em/.test(await pf.textContent("#lpJanela")));
  await pf.click('#lpJanela button:has-text("Voltar para entrar")');
  await sleep(150);
  check("voltar para entrar", await pf.isVisible("#lpJanela #loginSenha"));
  await pf.click('#lpJanela button:has-text("Criar conta grátis")');
  await sleep(150);
  check("trocar para criar conta na janela", await pf.isVisible("#lpJanela #loginNome"));
  await pf.keyboard.press("Escape");
  await sleep(150);
  check("Esc fecha a janela e a apresentação continua", !(await pf.isVisible("#lpJanela #loginNome")) && await pf.isVisible("#login .lp-heroi"));
  await pf.click('#login .lp-rodape button:has-text("Política de privacidade")');
  await sleep(200);
  check("rodapé abre a política por cima", await pf.isVisible("#legalModal .lg-texto") && /Política de privacidade/.test(await pf.textContent("#legalModal .lg-texto h1")));
  await pf.keyboard.press("Escape");
  await pf.evaluate(() => abrirLogin(false));
  check("ao entrar, a apresentação some", !(await pf.isVisible("#login .lp")));

  console.log("\n13) Central do administrador (vigia)");
  check("quem não é administrador não vê a Central", await pf.locator('#nav .nav-item[data-sec="admin"]').count() === 0);
  await pf.evaluate(() => { currentUser = { email: "estranho@exemplo.com", emailVerified: true, providerData: [] }; renderAll(); setSection("admin"); });
  await sleep(200);
  check("conta comum que força a tela vê 'Área restrita'", /Área restrita/.test(await pf.textContent("#view")) && await pf.locator('#nav .nav-item[data-sec="admin"]').count() === 0);
  await pf.evaluate(() => { currentUser = { email: "jonatasmiranda2405@gmail.com", emailVerified: true, providerData: [] }; pfRegistrarErro("erro", "teste do vigia: x is not a function", "index.html:10:5", "at teste"); renderAll(); setSection("admin"); });
  await pf.waitForFunction(() => ADM.quando !== null, null, { timeout: 15000 });
  await sleep(200);
  const admTxt = await pf.textContent("#view");
  check("administrador vê a Central com sondas, pontos frágeis e erros", await pf.locator('#nav .nav-item[data-sec="admin"]').count() === 1 && /Pontos frágeis para corrigir/.test(admTxt) && await pf.locator(".adm-sonda").count() >= 5 && /teste do vigia/.test(admTxt));
  check("sondas do site passam (HTTPS, CSP, moldura, código só do site)", await pf.evaluate(() => ["csp", "moldura", "scripts"].every((id) => (ADM.sondas.find((x) => x.id === id) || {}).ok === true)), JSON.stringify(await pf.evaluate(() => ADM.sondas.map((x) => x.id + ":" + x.ok))));
  await pf.check('.adm-ponto:has-text("duas etapas") input[type="checkbox"]');
  await sleep(200);
  check("'Já fiz' marca o ponto e fica salvo", await pf.evaluate(() => !!(perfil.adminFeitos || {})["2fa"]) && await pf.locator(".adm-ponto.feito").count() === 1);
  await pf.screenshot({ path: path.join(SAIDA, "tela-admin.png"), fullPage: true });
  const [rel] = await Promise.all([pf.waitForEvent("download", { timeout: 20000 }), pf.click('button:has-text("Relatório em PDF")')]);
  fs.copyFileSync(await rel.path(), path.join(SAIDA, "relatorio-seguranca.pdf"));
  check("relatório de segurança em PDF", /gerenciador-pericia-seguranca-/.test(rel.suggestedFilename()));

  console.log("\n14) Agente comercial");
  check("administrador vê o Agente comercial no menu", await pf.locator('#nav .nav-item[data-sec="comercial"]').count() === 1);
  await pf.evaluate(() => { window.__abertos = []; window.open = (u) => { window.__abertos.push(String(u)); return null; }; setSection("comercial"); });
  await sleep(300);
  await pf.fill("#comImport", "maria.souza@exemplo.com; Maria Souza; Goiânia\nMARIA.SOUZA@exemplo.com; repetida\nlinha sem email\njoao@exemplo.com; João Lima\n<script>@x.com");
  await pf.click('button:has-text("Adicionar à lista")');
  await sleep(300);
  const comTxt = await pf.textContent("#view");
  check("importa, ignora repetido e linha sem e-mail", await pf.evaluate(() => COM.contatos.length) === 2 && /2 contatos novos/.test(comTxt) && /1 já estava/.test(comTxt) && /2 linhas sem e-mail válido/.test(comTxt), comTxt.match(/\d+ contatos? nov[^·]*(·[^·]*){0,2}/)?.[0]);
  check("prévia preenche nome e link de convite único", await pf.evaluate(() => { const p = document.getElementById("comPrevia").textContent; return /Olá, (Maria|João)!/.test(p) && /\?convite=[a-z0-9]{6,}/.test(p) && /remover/.test(p); }));
  await pf.click('button:has-text("Abrir o próximo no Gmail")');
  await sleep(300);
  const aberto = await pf.evaluate(() => window.__abertos[0] || "");
  check("abre o Gmail para uma pessoa só, com assunto e texto", /^https:\/\/mail\.google\.com\/mail\/\?view=cm/.test(aberto) && /&to=[^&,%]+%40exemplo\.com&su=/.test(aberto) && /convite%3D/.test(aberto), aberto.slice(0, 120));
  check("contato vira 'Convidado' e conta no limite do dia", await pf.evaluate(() => COM.contatos.filter((c) => c.status === "convidado").length === 1 && comEnviadosHoje() === 1));
  await pf.evaluate(() => { const c = COM.contatos.find((x) => x.status === "convidado"); c.enviadoEm = new Date(Date.now() - 8 * 864e5).toISOString(); renderAll(); });
  check("depois de 7 dias sem conta, entra na fila de lembrete", await pf.evaluate(() => comFila().lembrar.length === 1));
  await pf.evaluate(() => { const c = COM.contatos.find((x) => x.status === "novo"); comMudarStatus(c.id, "nao"); });
  await sleep(200);
  check("quem não quer sai da fila", await pf.evaluate(() => comFila().novos.length === 0));
  await pf.screenshot({ path: path.join(SAIDA, "tela-comercial.png"), fullPage: true });
  {
    const pc = await ctx.newPage();
    await pc.goto(PF + (PF.includes("?") ? "&" : "?") + "convite=abc123", { waitUntil: "domcontentloaded" });
    await sleep(500);
    const r = await pc.evaluate(() => ({ cv: localStorage.getItem("pf_convite"), url: location.href, selo: document.body.textContent.includes("convite de um colega") }));
    check("link de convite: código guardado, some do endereço e a apresentação avisa", r.cv === "abc123" && !/convite=/.test(r.url), JSON.stringify(r));
    await pc.evaluate(() => localStorage.removeItem("pf_convite"));
    await pc.close();
  }
  await pf.evaluate(() => { currentUser = { email: "estranho@exemplo.com", emailVerified: true, providerData: [] }; renderAll(); setSection("comercial"); });
  await sleep(200);
  check("conta comum não vê o Agente comercial", /Área restrita/.test(await pf.textContent("#view")) && await pf.locator('#nav .nav-item[data-sec="comercial"]').count() === 0);
  await pf.evaluate(() => { currentUser = null; perfil.adminFeitos = {}; setSection("visao"); });

  console.log("\n9) Barra lateral e paleta de comandos");
  await pf.setViewportSize({ width: 1360, height: 900 });
  await pf.evaluate(() => { document.documentElement.setAttribute("data-theme", "light"); setSection("visao"); });
  check("sem contadores informativos (Perícias, Documentos)", await pf.locator('#nav .nav-item[data-sec="pericias"] .nav-badge, #nav .nav-item[data-sec="docs"] .nav-badge').count() === 0);
  check("grupo Sistema começa fechado", await pf.$eval('#nav .pf-grupo-tit[aria-controls="pfg-sistema"]', (b) => b.getAttribute("aria-expanded")) === "false");
  await pf.click('#nav .pf-grupo-tit[aria-controls="pfg-sistema"]');
  check("grupo abre e o app lembra", await pf.evaluate(() => JSON.parse(localStorage.getItem("pf_nav_grupos")).sistema) === true);
  await pf.keyboard.press("Control+k");
  check("Ctrl K abre a paleta", await pf.isVisible("#pfPaleta"));
  await pf.keyboard.type("5151870");
  await sleep(150);
  const primeiro = await pf.textContent(".pf-pal-item.sel");
  check("busca a perícia pelo número do processo", /Revisional de contrato/.test(primeiro), primeiro.trim().slice(0, 80));
  await pf.keyboard.press("Enter");
  await sleep(300);
  check("Enter abre a perícia", await pf.evaluate(() => drawerCasoId) === c1);
  await pf.evaluate(() => closeDrawer());
  await pf.keyboard.press("/");
  await pf.keyboard.type("financ");
  await pf.keyboard.press("Enter");
  await sleep(300);
  check("/ abre a paleta e leva à tela", await pf.evaluate(() => activeSection) === "financeiro");
  await pf.keyboard.press("Control+k"); await pf.keyboard.press("Escape");
  check("Esc fecha a paleta", !(await pf.isVisible("#pfPaleta")));
  await pf.evaluate(() => toggleRail());
  await sleep(300);
  await pf.screenshot({ path: path.join(SAIDA, "barra-recolhida.png") });
  check("modo recolhido mostra só ícones", await pf.$eval('#nav .nav-item[data-sec="financeiro"] span', (s) => getComputedStyle(s).display) === "none");
  await pf.evaluate(() => toggleRail());

  check("sem erros de JavaScript", erros.length === 0, erros.slice(0, 3).join(" | "));
  await ctx.close();
  console.log(`\n${res.filter(Boolean).length}/${res.length} verificações passaram`);
  process.exit(res.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error("ERRO NO TESTE:", e); process.exit(2); });
