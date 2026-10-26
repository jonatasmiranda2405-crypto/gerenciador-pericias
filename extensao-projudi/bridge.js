// Ponte entre o script da página (mundo MAIN) e o service worker da extensão.
const reply = (id, data) => window.postMessage({ __projudiPdf: "res", id, ...data }, window.location.origin);

window.addEventListener("message", (ev) => {
  if (ev.source !== window || !ev.data || ev.data.__projudiPdf !== "req") return;
  const { id, kind } = ev.data;
  let msg;
  if (kind === "zip") msg = { type: "PROJUDI_ZIP", files: ev.data.files, zipFilename: ev.data.zipFilename, folder: ev.data.folder };
  else if (kind === "lista") msg = { type: "PROJUDI_LISTA", files: ev.data.files, proc: ev.data.proc, capa: ev.data.capa, pedidoId: ev.data.pedidoId || null };
  else if (kind === "tarefa") msg = { type: "PROJUDI_TAREFA" };
  else if (kind === "checkout") msg = { type: "PROJUDI_CHECKOUT", plano: ev.data.plano, email: ev.data.email };
  else if (kind === "license") msg = { type: "PROJUDI_LICENSE", email: ev.data.email };
  else return;
  try {
    chrome.runtime.sendMessage(msg, (res) => {
      const err = chrome.runtime.lastError;
      reply(id, err ? { ok: false, error: err.message } : res || { ok: false });
    });
  } catch (e) {
    reply(id, { ok: false, error: "A extensão foi atualizada. Recarregue esta página (F5)." });
  }
});

// Progresso do ZIP → página
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "ZIP_PROGRESS") {
    window.postMessage({ __projudiPdf: "progress", text: msg.text }, window.location.origin);
  } else if (msg?.type === "ZIP_FIM") {
    window.postMessage({ __projudiPdf: "zipfim", jobId: msg.jobId, res: msg.res }, window.location.origin);
  }
});
