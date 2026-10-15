// Documento offscreen: é o único lugar da extensão que segura arquivos grandes na memória.
// 1) ZIP para download (botão "Baixar todos os PDFs"): monta e devolve uma URL blob.
// 2) Autos para o Gerenciador de Perícia: baixa UM arquivo por vez com a sessão do perito no PROJUDI,
//    tira o PDF de dentro do .p7s quando preciso e entrega em partes à aba do Gerenciador de Perícia.
//    O próximo arquivo só é baixado depois que o site confirma que gravou o anterior.
const blobUrls = new Set();
const pedidos = new Map(); // pedidoId -> { arquivos: [...] }
const PARTE = 4 * 1024 * 1024;   // 4 MB por mensagem
const TENTATIVAS = 3;

function uniqueName(name, used) {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (used.has(`${base} (${i})${ext}`)) i++;
  const n = `${base} (${i})${ext}`;
  used.add(n);
  return n;
}

async function fetchBytes(url) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  const data = new Uint8Array(await r.arrayBuffer());
  return { data, ct };
}

const ehPdf = (d) => d[0] === 0x25 && d[1] === 0x50 && d[2] === 0x44 && d[3] === 0x46; // %PDF

// Baixa um arquivo do PROJUDI e devolve os bytes do documento (PDF limpo quando possível).
async function obterArquivo(f) {
  let ultimo;
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const { data, ct } = await fetchBytes(f.url);
      if (f.isPdf && !ehPdf(data)) {
        if (ct.includes("text/html")) throw new Error("o PROJUDI devolveu uma página no lugar do PDF (sessão expirada?)");
        const pdf = pdfDeP7s(data);           // assinatura .p7s com o PDF dentro
        if (pdf) return pdf;
        throw new Error("arquivo sem PDF reconhecível");
      }
      return data;
    } catch (e) {
      ultimo = e;
      await new Promise((r) => setTimeout(r, 800 * t));
    }
  }
  throw ultimo;
}

const restantes = () => blobUrls.size + pedidos.size;

function base64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => { const s = String(fr.result); resolve(s.slice(s.indexOf(",") + 1)); };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return;

  if (msg.type === "BUILD_ZIP") {
    (async () => {
      const { files, tabId } = msg;
      const out = [];
      const failed = [];
      const used = new Set();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        chrome.runtime.sendMessage({ type: "ZIP_PROGRESS", tabId, text: `Buscando ${i + 1}/${files.length}…` });
        try {
          const data = await obterArquivo(f);
          out.push({ name: uniqueName(f.zipName, used), data });
        } catch (e) {
          failed.push(f);
        }
      }
      if (!out.length) { sendResponse({ ok: false, failed, error: "Nenhum arquivo pôde ser obtido." }); return; }
      chrome.runtime.sendMessage({ type: "ZIP_PROGRESS", tabId, text: `Montando o ZIP (${out.length} arquivos)…` });
      const blob = buildZip(out);
      const url = URL.createObjectURL(blob);
      blobUrls.add(url);
      sendResponse({ ok: true, url, count: out.length, bytes: blob.size, failed });
    })();
    return true;
  }

  if (msg.type === "REVOKE") {
    if (blobUrls.has(msg.url)) { URL.revokeObjectURL(msg.url); blobUrls.delete(msg.url); }
    sendResponse({ remaining: restantes() });
  }

  // O service worker entrega a lista de arquivos de um pedido antes de a aba do Gerenciador de Perícia conectar.
  if (msg.type === "PREPARAR") {
    pedidos.set(msg.pedidoId, { arquivos: msg.arquivos, tabProjudi: msg.tabProjudi });
    sendResponse({ ok: true });
  }

  if (msg.type === "ESQUECER") {
    pedidos.delete(msg.pedidoId);
    sendResponse({ remaining: restantes() });
  }
});

// Conversa com o periciaflow.js (aba do Gerenciador de Perícia), um arquivo por vez:
//   → { pedidoId }                      começa
//   ← { arquivo: meta, partes: n }      cabeçalho de um arquivo
//   ← { i, data }                       uma parte (base64);   → { ack: i }
//   ← { fimArquivo: true }                                       → { salvo: true } (site gravou)
//   ← { falha: meta, erro }             arquivo que não deu   → { salvo: true }
//   ← { fim: true, resumo }
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "pf-autos") return;
  let ped = null, pedidoId = null;
  let idx = 0, blob = null, parte = 0, totalPartes = 0;
  const resumo = { gravados: 0, falhas: [] };
  const status = (text) => ped?.tabProjudi != null &&
    chrome.runtime.sendMessage({ type: "ZIP_PROGRESS", tabId: ped.tabProjudi, text }).catch(() => {});

  async function proximoArquivo() {
    // número no ícone da extensão: quantos arquivos faltam; no fim, o check
    chrome.runtime.sendMessage({ type: "PF_BADGE", texto: idx >= ped.arquivos.length ? "✓" : String(ped.arquivos.length - idx) }).catch(() => {});
    if (idx >= ped.arquivos.length) {
      port.postMessage({ fim: true, resumo });
      status(`Concluído: ${resumo.gravados} arquivo(s) no Gerenciador de Perícia.` + (resumo.falhas.length ? ` ${resumo.falhas.length} falharam.` : ""));
      pedidos.delete(pedidoId);
      return;
    }
    const f = ped.arquivos[idx];
    const meta = { idArquivo: f.idArquivo, nome: f.nome, fase: f.fase, data: f.data, mov: f.mov, tipoMov: f.tipo, ordem: idx + 1, total: ped.arquivos.length };
    status(`Enviando ao Gerenciador de Perícia ${idx + 1}/${ped.arquivos.length}…`);
    try {
      const bytes = await obterArquivo(f);
      blob = new Blob([bytes], { type: f.isPdf ? "application/pdf" : "text/html" });
      parte = 0; totalPartes = Math.max(1, Math.ceil(blob.size / PARTE));
      port.postMessage({ arquivo: { ...meta, tamanho: blob.size, mime: blob.type }, partes: totalPartes });
      await enviarParte();
    } catch (e) {
      resumo.falhas.push(f.nome);
      port.postMessage({ falha: meta, erro: String(e && e.message || e) });
    }
  }

  async function enviarParte() {
    if (parte >= totalPartes) { blob = null; port.postMessage({ fimArquivo: true }); return; }
    const data = await base64(blob.slice(parte * PARTE, (parte + 1) * PARTE));
    port.postMessage({ i: parte, data });
  }

  port.onMessage.addListener(async (m) => {
    try {
      if (m.pedidoId) {
        pedidoId = m.pedidoId; ped = pedidos.get(pedidoId);
        if (!ped) { port.postMessage({ erro: "Este pedido expirou. Peça os autos de novo." }); return; }
        idx = 0;
        await proximoArquivo();
      } else if (typeof m.ack === "number") {
        parte = m.ack + 1;
        await enviarParte();
      } else if (m.salvo) {
        if (m.ok) resumo.gravados++;
        else if (m.ok === false) resumo.falhas.push(ped.arquivos[idx]?.nome || "?");
        idx++;
        await proximoArquivo();
      }
    } catch (e) {
      port.postMessage({ erro: "Falha na transferência: " + (e && e.message || e) });
    }
  });
});
