// Service worker: coordena downloads, a geração do ZIP, a verificação da assinatura
// e o envio do ZIP para o Gerenciador de Perícia.
importScripts("config.js");

// ---------- Assinatura ----------
const HOUR = 3600 * 1000;
const today = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso local

async function remoteCheck(email) {
  const r = await fetch(LICENSE_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ email })
  });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json(); // { ativo, validade }
}

// Retorna { ativo, email, validade, motivo, assinar }
async function checkLicense(newEmail) {
  // Enquanto a URL do Apps Script não for configurada, a extensão funciona sem cobrança (modo de teste).
  if (!LICENSE_URL || LICENSE_URL.includes("COLE_AQUI")) {
    return { ativo: true, email: "", validade: "", assinar: SUBSCRIBE_TEXT, planos: PLANOS, modoTeste: true };
  }
  const st = await chrome.storage.local.get(["email", "lastOk", "validade"]);
  const email = (newEmail || st.email || "").trim().toLowerCase();
  const base = { email, assinar: SUBSCRIBE_TEXT, planos: PLANOS };
  if (!email) return { ...base, ativo: false, motivo: "Informe o e-mail da sua assinatura." };

  const cacheValid = !newEmail && st.lastOk && Date.now() - st.lastOk < LICENSE_CACHE_HOURS * HOUR && st.validade >= today();
  if (cacheValid) return { ...base, ativo: true, validade: st.validade };

  try {
    const res = await remoteCheck(email);
    if (res.ativo) {
      await chrome.storage.local.set({ email, lastOk: Date.now(), validade: res.validade });
      return { ...base, ativo: true, validade: res.validade };
    }
    await chrome.storage.local.set({ email, lastOk: 0, validade: res.validade || "" });
    const motivo = res.validade ? `Assinatura vencida em ${res.validade.split("-").reverse().join("/")}.` : "E-mail sem assinatura ativa.";
    return { ...base, ativo: false, validade: res.validade || "", motivo };
  } catch (e) {
    const offlineOk = !newEmail && st.lastOk && Date.now() - st.lastOk < LICENSE_OFFLINE_DAYS * 24 * HOUR && st.validade >= today();
    if (offlineOk) return { ...base, ativo: true, validade: st.validade };
    return { ...base, ativo: false, motivo: "Não foi possível verificar a assinatura agora. Confira a internet e tente de novo." };
  }
}


const OFFSCREEN_URL = "offscreen.html";
const pendingRevoke = new Map(); // downloadId -> blobUrl

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["BLOBS"],
      justification: "Montar o arquivo ZIP com os PDFs do processo."
    });
  } catch (e) {
    if (!String(e).includes("single offscreen")) throw e;
  }
}

// Fecha o documento offscreen quando não há mais ZIP guardado (download ou envio pendente).
async function closeOffscreenIfIdle(remaining) {
  if (remaining !== 0 || pendingRevoke.size !== 0) return;
  const ativos = await listarPedidos();
  if (ativos.some((p) => p.etapa === "transferindo" || p.etapa === "oferta")) return;
  try { await chrome.offscreen.closeDocument(); } catch (_) {}
}

function download(opts) {
  return new Promise((resolve) => {
    chrome.downloads.download({ conflictAction: "uniquify", saveAs: false, ...opts }, (id) => {
      const err = chrome.runtime.lastError;
      resolve({ ok: !err && id !== undefined, id, error: err ? err.message : null });
    });
  });
}

// Libera a memória do ZIP depois que o download termina.
chrome.downloads.onChanged.addListener(async (d) => {
  const url = pendingRevoke.get(d.id);
  if (!url || !d.state || d.state.current === "in_progress") return;
  pendingRevoke.delete(d.id);
  try {
    const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "REVOKE", url });
    if (res) await closeOffscreenIfIdle(res.remaining);
  } catch (_) {}
});

// ---------- Pedidos de autos para o Gerenciador de Perícia ----------
// Um "pedido" liga uma perícia do Gerenciador de Perícia a uma aba do PROJUDI. Ele nasce de dois jeitos:
//  - no site ("Baixar autos do PROJUDI"): a extensão abre o PROJUDI e busca o processo sozinha;
//  - no PROJUDI ("Enviar ao Gerenciador de Perícia"): a lista já está pronta e o site escolhe a perícia.
// Etapas: buscando → (login | assistido) → transferindo → fim;  ou  oferta → transferindo → fim.
// Fica em storage.session: sobrevive ao service worker dormir e some ao fechar o navegador.
const PED = "pf_ped_";
const minutos = (n) => n * 60 * 1000;
const soDigitos = (s) => String(s || "").replace(/\D/g, "");
// "5151870-23.2026.8.09.0051" → "5151870-23" (formato pedido pelo formulário do PROJUDI)
function numeroParaBusca(numero) {
  const m = String(numero || "").match(/(\d{1,7})[-.](\d{2})/);
  return PROJUDI_NUMERO_CURTO && m ? `${m[1]}-${m[2]}` : String(numero || "");
}

async function listarPedidos() {
  const all = await chrome.storage.session.get(null);
  const limite = Date.now() - minutos(PERICIAFLOW_ENVIO_MIN);
  const vivos = [], vencidos = [];
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(PED)) continue;
    if (v && v.atualizado >= limite) vivos.push(v); else vencidos.push(k);
  }
  if (vencidos.length) await chrome.storage.session.remove(vencidos);
  return vivos;
}
async function lerPedido(id) { return (await chrome.storage.session.get(PED + id))[PED + id] || null; }
async function gravarPedido(p) { p.atualizado = Date.now(); await chrome.storage.session.set({ [PED + p.id]: p }); return p; }
async function pedidoDaAba(tabId) { return (await listarPedidos()).find((p) => p.tabProjudi === tabId) || null; }

// Avisa a aba do Gerenciador de Perícia (o periciaflow.js repassa ao site).
function avisarSite(p, dados) {
  if (p.tabPF == null) return;
  chrome.tabs.sendMessage(p.tabPF, { type: "PF_STATUS", pedidoId: p.id, casoId: p.casoId, ...dados }).catch(() => {});
}

async function encerrarPedido(id, { fecharAba = true } = {}) {
  const p = await lerPedido(id);
  await chrome.storage.session.remove(PED + id);
  if (p && fecharAba && p.abriuAba && p.tabProjudi != null) chrome.tabs.remove(p.tabProjudi).catch(() => {});
  try {
    const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "ESQUECER", pedidoId: id });
    if (res) await closeOffscreenIfIdle(res.remaining);
  } catch (_) {}
}

// Arquivos que o site ainda não tem (o ID vem de Id_MovimentacaoArquivo).
function filtrarNovos(arquivos, jaTenho) {
  const tem = new Set((jaTenho || []).map(String));
  return arquivos.filter((f) => !tem.has(String(f.idArquivo)));
}

// Entrega a lista ao offscreen e manda a aba do Gerenciador de Perícia puxar os arquivos.
async function iniciarTransferencia(p, arquivos, pulados) {
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ target: "offscreen", type: "PREPARAR", pedidoId: p.id, arquivos, tabProjudi: p.tabProjudi });
  p.etapa = "transferindo"; p.total = arquivos.length; p.pulados = pulados;
  await gravarPedido(p);
  if (p.tabPF != null) {
    chrome.tabs.sendMessage(p.tabPF, { type: "PF_INICIAR", pedido: publico(p) }).catch(() => {});
  }
}

const publico = (p) => ({
  id: p.id, origem: p.origem, casoId: p.casoId, numero: p.numero, metodo: p.metodo, etapa: p.etapa,
  capa: p.capa || {}, total: p.total || (p.arquivos ? p.arquivos.length : 0), pulados: p.pulados || 0
});

// Traz a aba do Gerenciador de Perícia para a frente (ou abre uma nova).
async function abrirPericiaFlow() {
  const abas = await chrome.tabs.query({ url: PERICIAFLOW_URLS.map((u) => u + "*") });
  if (abas.length) {
    const aba = abas[0];
    await chrome.tabs.update(aba.id, { active: true });
    try { await chrome.windows.update(aba.windowId, { focused: true }); } catch (_) {}
    return { aba, nova: false };
  }
  const aba = await chrome.tabs.create({ url: PERICIAFLOW_URL + "#projudi" });
  return { aba, nova: true };
}

async function mostrarAba(tabId) {
  try {
    const t = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(t.windowId, { focused: true });
  } catch (_) {}
}

// Se o perito fechar a aba do PROJUDI antes da lista ficar pronta, o site fica sabendo.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const p = await pedidoDaAba(tabId);
  if (!p || p.etapa === "transferindo") return;
  avisarSite(p, { etapa: "cancelado", texto: "A aba do PROJUDI foi fechada antes de terminar." });
  await encerrarPedido(p.id, { fecharAba: false });
});


// ---------- Quem pode pedir o quê ----------
// Cada tipo de mensagem só é aceito vindo do lugar certo: os pedidos "PF_" só da página do
// Gerenciador de Perícia, os "PROJUDI_"/"PJ_" só do site do PROJUDI. E só baixamos arquivos do PROJUDI.
const ORIGENS_PF = ["https://gerenciadorpericias.com.br", "https://www.gerenciadorpericias.com.br", "https://jonatasmiranda2405-crypto.github.io", "http://localhost:8080"];
const ORIGEM_PJ = "https://projudi.tjgo.jus.br";
const TIPOS_PF = new Set(["PF_ACEITAR", "PF_BAIXAR", "PF_CANCELAR", "PF_ENTRAR", "PF_FIM", "PF_LICENCA", "PF_PENDENTES"]);
const TIPOS_PJ = new Set(["PROJUDI_CHECKOUT", "PROJUDI_LICENSE", "PROJUDI_LISTA", "PROJUDI_TAREFA", "PROJUDI_ZIP", "PJ_TAREFA", "PJ_TENTATIVA", "PJ_PRECISA"]);
function origemDe(sender) {
  if (sender.origin) return sender.origin;
  try { return new URL(sender.url || sender.tab?.url || "").origin; } catch (_) { return ""; }
}
function urlDoProjudi(u) {
  try { const x = new URL(u); return x.protocol === "https:" && (x.hostname === "projudi.tjgo.jus.br" || x.hostname.endsWith(".tjgo.jus.br")); }
  catch (_) { return false; }
}
function nomeSeguro(n, padrao) {
  const s = String(n || "").replace(/\.\.+/g, ".").replace(/[\\:*?"<>|\x00-\x1f]/g, "_").replace(/^[\/.]+/, "").slice(0, 180);
  return s || padrao;
}
function soArquivosDoProjudi(lista) {
  return (Array.isArray(lista) ? lista : []).filter((f) => f && urlDoProjudi(f.url));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  const origem = origemDe(sender);
  if (TIPOS_PF.has(msg?.type) && !ORIGENS_PF.includes(origem)) { sendResponse({ ok: false, erro: "Origem não permitida." }); return; }
  if (TIPOS_PJ.has(msg?.type) && origem !== ORIGEM_PJ) { sendResponse({ ok: false, error: "Origem não permitida." }); return; }

  // Ícone da extensão mostra o progresso do envio (só o documento offscreen manda isso)
  if (msg?.type === "PF_BADGE") {
    if (!String(sender.url || "").startsWith(chrome.runtime.getURL("offscreen.html"))) return;
    const texto = String(msg.texto || "").slice(0, 4);
    chrome.action.setBadgeBackgroundColor({ color: texto === "✓" ? "#2E6B4F" : "#1B3850" }).catch(() => {});
    chrome.action.setBadgeText({ text: texto }).catch(() => {});
    if (texto === "✓") setTimeout(() => chrome.action.setBadgeText({ text: "" }).catch(() => {}), 8000);
    return;
  }

  if (msg?.type === "PROJUDI_LICENSE") {
    checkLicense(msg.email).then(sendResponse);
    return true;
  }

  // Progresso vindo do offscreen → repassa para a aba
  if (msg?.type === "ZIP_PROGRESS" && msg.tabId != null) {
    chrome.tabs.sendMessage(msg.tabId, { type: "ZIP_PROGRESS", text: msg.text }).catch(() => {});
    return;
  }

  // Pedido de ZIP vindo da página
  if (msg?.type === "PROJUDI_ZIP") {
    (async () => {
      const tabId = sender.tab?.id;
      const files = soArquivosDoProjudi(msg.files);
      const zipFilename = nomeSeguro(msg.zipFilename, "PROJUDI.zip");
      const folder = nomeSeguro(msg.folder, "PROJUDI");
      try {
        const lic = await checkLicense();
        if (!lic.ativo) { sendResponse({ ok: false, license: lic }); return; }
        await ensureOffscreen();
        const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "BUILD_ZIP", files, tabId });
        let zipOk = false;
        if (res?.ok) {
          const dl = await download({ url: res.url, filename: zipFilename });
          zipOk = dl.ok;
          if (dl.ok) pendingRevoke.set(dl.id, res.url);
        }
        // Arquivos que não entraram no ZIP são baixados avulsos, para não perder nada.
        const failed = res?.failed || files;
        let avulsos = 0;
        for (const f of failed) {
          const r = await download({ url: f.url, filename: `${folder}/${nomeSeguro(f.zipName, "arquivo.pdf")}` });
          if (r.ok) avulsos++;
        }
        sendResponse({ ok: zipOk, count: zipOk ? res.count : 0, bytes: res?.bytes || 0, avulsos, falhas: failed.length - avulsos });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  // ----- Assinatura pelo Mercado Pago (Checkout Pro criado no Apps Script) -----
  if (msg?.type === "PROJUDI_CHECKOUT") {
    (async () => {
      try {
        const st = await chrome.storage.local.get(["email"]);
        const email = String(msg.email || st.email || "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { sendResponse({ ok: false, erro: "Escreva o seu e-mail antes de escolher o plano." }); return; }
        const plano = PLANOS.find((p) => p.id === msg.plano);
        if (!plano) { sendResponse({ ok: false, erro: "Plano desconhecido." }); return; }
        const r = await fetch(LICENSE_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ acao: "checkout", email, plano: plano.id })
        });
        const res = await r.json();
        const link = res && (res.url || res.link || res.init_point || res.checkout || res.checkoutUrl);
        let host = "";
        try { host = new URL(link).hostname; } catch (_) {}
        // só abre página do próprio Mercado Pago
        if (!/(^|\.)mercadopago\.com(\.br)?$|(^|\.)mercadolivre\.com(\.br)?$|(^|\.)mpago\.(la|li)$/.test(host)) {
          sendResponse({ ok: false, erro: (res && (res.erro || res.error)) || "Não foi possível gerar o link de pagamento agora." });
          return;
        }
        await chrome.storage.local.set({ email, lastOk: 0 }); // força nova verificação depois do pagamento
        await chrome.tabs.create({ url: link, active: true });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, erro: "Sem conexão com o servidor de assinaturas. Tente de novo." });
      }
    })();
    return true;
  }

  // ----- Vindo do periciaflow.js (aba do Gerenciador de Perícia) -----
  if (msg?.type === "PF_BAIXAR") {
    (async () => {
      try {
        const lic = await checkLicense();
        if (!lic.ativo) { sendResponse({ ok: false, erro: "Assinatura da extensão inativa: " + (lic.motivo || "") + " " + lic.assinar }); return; }
        const numero = String(msg.numero || "").trim();
        if (soDigitos(numero).length !== 20) { sendResponse({ ok: false, erro: "Número do processo incompleto. Use o formato CNJ, com 20 dígitos." }); return; }
        const codigo = String(msg.codigo || "").trim();
        const pref = msg.preferencia || "auto";
        if (pref === "codigo" && !codigo) { sendResponse({ ok: false, erro: "Esta perícia não tem código de acesso cadastrado." }); return; }
        const metodo = codigo && pref !== "sessao" ? "codigo" : "sessao";
        // um pedido por perícia: refazer o pedido substitui o anterior
        for (const v of await listarPedidos()) if (v.casoId === msg.casoId && v.origem === "site") await encerrarPedido(v.id);
        // Por código: a página do PROJUDI já abre preenchida (ela lê NumeroProcesso e CodigoAcesso da URL).
        let url = metodo === "codigo" ? PROJUDI_URLS.porCodigo : PROJUDI_URLS.comLogin;
        if (metodo === "codigo") url += `&NumeroProcesso=${encodeURIComponent(numeroParaBusca(numero))}&CodigoAcesso=${encodeURIComponent(codigo)}`;
        const aba = await chrome.tabs.create({ url, active: false });
        const p = await gravarPedido({
          id: crypto.randomUUID(), origem: "site", casoId: msg.casoId, numero, codigo, metodo,
          jaTenho: msg.jaTenho || [], tabPF: sender.tab?.id, tabProjudi: aba.id, abriuAba: true,
          etapa: "buscando", tentativas: 0, criado: Date.now()
        });
        sendResponse({ ok: true, pedido: publico(p) });
      } catch (e) {
        sendResponse({ ok: false, erro: String(e && e.message || e) });
      }
    })();
    return true;
  }

  if (msg?.type === "PF_ACEITAR") {
    (async () => {
      const p = await lerPedido(msg.pedidoId);
      if (!p || p.etapa !== "oferta") { sendResponse({ ok: false, erro: "Este envio expirou. Envie de novo pelo PROJUDI." }); return; }
      p.casoId = msg.casoId; p.tabPF = sender.tab?.id;
      const novos = filtrarNovos(p.arquivos, msg.jaTenho);
      await iniciarTransferencia(p, novos, p.arquivos.length - novos.length);
      sendResponse({ ok: true, pedido: publico(p) });
    })();
    return true;
  }

  if (msg?.type === "PF_PENDENTES") {
    listarPedidos().then((lista) => {
      const tab = sender.tab?.id;
      for (const p of lista) if (p.origem === "projudi" && p.etapa === "oferta") { p.tabPF = tab; gravarPedido(p); }
      sendResponse({ ofertas: lista.filter((p) => p.etapa === "oferta").map(publico) });
    });
    return true;
  }

  if (msg?.type === "PF_FIM" || msg?.type === "PF_CANCELAR") {
    encerrarPedido(msg.pedidoId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.type === "PF_ENTRAR") {
    chrome.tabs.create({ url: PROJUDI_URLS.login, active: true }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.type === "PF_LICENCA") {
    checkLicense().then((lic) => sendResponse({ ativo: !!lic.ativo, motivo: lic.motivo || "", assinar: lic.assinar, modoTeste: !!lic.modoTeste }));
    return true;
  }

  // ----- Vindo do robo.js (aba do PROJUDI aberta por um pedido) -----
  if (msg?.type === "PJ_TAREFA") {
    pedidoDaAba(sender.tab?.id).then((p) => {
      const ativo = p && ["buscando", "login", "assistido", "captcha", "confirmar"].includes(p.etapa);
      sendResponse(ativo ? { pedido: { id: p.id, numero: p.numero, numeroBusca: numeroParaBusca(p.numero), codigo: p.codigo, metodo: p.metodo, etapa: p.etapa, tentativas: p.tentativas }, urls: PROJUDI_URLS, max: ROBO_MAX_TENTATIVAS, clicaBuscar: ROBO_CLICA_BUSCAR } : { pedido: null });
    });
    return true;
  }

  if (msg?.type === "PJ_TENTATIVA") {
    (async () => {
      const p = await pedidoDaAba(sender.tab?.id);
      if (!p) { sendResponse({ tentativas: 99 }); return; }
      p.tentativas = (p.tentativas || 0) + 1;
      await gravarPedido(p);
      avisarSite(p, { etapa: "buscando", texto: msg.texto || "Procurando o processo no PROJUDI…" });
      sendResponse({ tentativas: p.tentativas });
    })();
    return true;
  }

  // O robô precisa do perito: login, verificação (captcha) ou abrir o processo à mão.
  if (msg?.type === "PJ_PRECISA") {
    (async () => {
      const p = await pedidoDaAba(sender.tab?.id);
      if (!p) { sendResponse({ ok: false }); return; }
      p.etapa = ["login", "captcha", "confirmar"].includes(msg.etapa) ? msg.etapa : "assistido";
      await gravarPedido(p);
      await mostrarAba(p.tabProjudi);
      const textos = {
        login: "Entre no PROJUDI na aba que abriu (certificado digital ou CPF e senha). Depois disso a busca continua sozinha.",
        captcha: "O PROJUDI pediu uma verificação de segurança. Resolva na aba que abriu; depois disso a busca continua sozinha.",
        confirmar: "Os dados do processo já estão preenchidos no PROJUDI. Na aba que abriu, marque a verificação se ela aparecer e clique em Consultar; o resto continua sozinho.",
        assistido: `Não consegui chegar sozinho ao processo. Abra o processo ${p.numero} na aba do PROJUDI e o download começa.`
      };
      avisarSite(p, { etapa: p.etapa, texto: textos[msg.etapa] || textos.assistido });
      sendResponse({ ok: true });
    })();
    return true;
  }

  // ----- Vindo do page.js (tela do processo no PROJUDI) -----
  // A tela do processo pergunta se existe um pedido esperando por ela.
  if (msg?.type === "PROJUDI_TAREFA") {
    pedidoDaAba(sender.tab?.id).then((p) => {
      const ativo = p && ["buscando", "login", "assistido", "captcha", "confirmar"].includes(p.etapa);
      sendResponse(ativo ? { pedido: { id: p.id, numero: p.numero } } : { pedido: null });
    });
    return true;
  }

  // Lista de arquivos lida na tela do processo.
  if (msg?.type === "PROJUDI_LISTA") {
    (async () => {
      const tabId = sender.tab?.id;
      try {
        const lic = await checkLicense();
        if (!lic.ativo) { sendResponse({ ok: false, license: lic }); return; }
        const arquivos = soArquivosDoProjudi(msg.files);
        let p = msg.pedidoId ? await lerPedido(msg.pedidoId) : null;
        if (p) {
          // pedido feito pelo site: só os arquivos novos
          if (soDigitos(msg.proc) && soDigitos(msg.proc) !== soDigitos(p.numero)) {
            sendResponse({ ok: false, error: `Esta tela é do processo ${msg.proc}, mas o pedido é do ${p.numero}.` }); return;
          }
          p.capa = msg.capa || {};
          const novos = filtrarNovos(arquivos, p.jaTenho);
          avisarSite(p, { etapa: "lista", texto: `${arquivos.length} arquivo(s) no PROJUDI, ${novos.length} novo(s).` });
          if (!novos.length) {
            avisarSite(p, { etapa: "fim", texto: "Nada novo: a perícia já tem todos os arquivos deste processo.", resumo: { gravados: 0, falhas: [], pulados: arquivos.length } });
            await encerrarPedido(p.id);
            sendResponse({ ok: true, total: 0, pulados: arquivos.length });
            return;
          }
          await iniciarTransferencia(p, novos, arquivos.length - novos.length);
          sendResponse({ ok: true, total: novos.length, pulados: arquivos.length - novos.length });
          return;
        }
        // envio iniciado no PROJUDI: o site vai perguntar em qual perícia guardar
        p = await gravarPedido({
          id: crypto.randomUUID(), origem: "projudi", casoId: null, numero: msg.proc, codigo: "", metodo: "sessao",
          arquivos, capa: msg.capa || {}, tabProjudi: tabId, abriuAba: false, etapa: "oferta", criado: Date.now()
        });
        const { aba, nova } = await abrirPericiaFlow();
        p.tabPF = aba.id; await gravarPedido(p);
        if (!nova) chrome.tabs.sendMessage(aba.id, { type: "PF_OFERTA", pedido: publico(p) }).catch(() => {});
        sendResponse({ ok: true, oferta: true, total: arquivos.length, abaNova: nova });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }
});
