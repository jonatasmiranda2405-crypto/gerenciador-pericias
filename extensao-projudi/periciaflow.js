// Content script na aba do Gerenciador de Perícia. É a ponte entre o site e a extensão.
// Conversa com a página só por window.postMessage, sempre na própria origem.
//
//   site → extensão  { __pf:"app", tipo, ref?, ... }
//     ola                              pede "pronta" e as ofertas pendentes
//     licenca                          estado da assinatura da extensão
//     baixar   {casoId, numero, codigo, jaTenho, preferencia}   pede os autos ao PROJUDI
//     aceitar  {pedidoId, casoId, jaTenho}                       aceita um envio feito no PROJUDI
//     salvo    {pedidoId, ok}          o site gravou o arquivo recebido; pode mandar o próximo
//     cancelar {pedidoId}
//     entrar                           abre a tela de login do PROJUDI
//
//   extensão → site  { __pf:"ext", tipo, ... }
//     pronta {versao} · resposta {ref, ...} · oferta {pedido} · status {pedidoId, etapa, texto}
//     inicio {pedido} · arquivo {pedidoId, meta, blob} · falha {pedidoId, meta, erro}
//     fim {pedidoId, resumo} · erro {pedidoId, erro}
(() => {
  if (window.__pfExtLoaded) return;
  window.__pfExtLoaded = true;

  const ORIGEM = location.origin;
  const VERSAO = chrome.runtime.getManifest().version;
  const portas = new Map(); // pedidoId -> port

  const postar = (dados) => window.postMessage({ __pf: "ext", ...dados }, ORIGEM);
  const enviar = (msg) => new Promise((res) => {
    try { chrome.runtime.sendMessage(msg, (r) => { const e = chrome.runtime.lastError; res(e ? { ok: false, erro: e.message } : r || { ok: false }); }); }
    catch (e) { res({ ok: false, erro: "A extensão foi atualizada. Recarregue esta página." }); }
  });

  function bytesDe(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Recebe os arquivos de um pedido, um por vez.
  function transferir(pedido) {
    if (portas.has(pedido.id)) return;
    let port;
    try { port = chrome.runtime.connect({ name: "pf-autos" }); }
    catch (e) { postar({ tipo: "erro", pedidoId: pedido.id, erro: "A extensão foi atualizada. Recarregue esta página." }); return; }
    portas.set(pedido.id, port);
    postar({ tipo: "inicio", pedido });
    let meta = null, partes = [], terminou = false;

    port.onMessage.addListener((m) => {
      if (m.erro) {
        terminou = true; portas.delete(pedido.id); port.disconnect();
        postar({ tipo: "erro", pedidoId: pedido.id, erro: m.erro });
        return;
      }
      if (m.arquivo) { meta = m.arquivo; partes = []; return; }
      if (typeof m.data === "string") { partes[m.i] = bytesDe(m.data); port.postMessage({ ack: m.i }); return; }
      if (m.fimArquivo) {
        const blob = new Blob(partes, { type: meta.mime || "application/pdf" });
        partes = [];
        postar({ tipo: "arquivo", pedidoId: pedido.id, casoId: pedido.casoId, meta, blob });
        return; // espera o "salvo" do site
      }
      if (m.falha) {
        postar({ tipo: "falha", pedidoId: pedido.id, meta: m.falha, erro: m.erro });
        port.postMessage({ salvo: true });
        return;
      }
      if (m.fim) {
        terminou = true; portas.delete(pedido.id); port.disconnect();
        const resumo = { ...m.resumo, pulados: pedido.pulados || 0 };
        postar({ tipo: "fim", pedidoId: pedido.id, casoId: pedido.casoId, resumo });
        enviar({ type: "PF_FIM", pedidoId: pedido.id, resumo });
      }
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      portas.delete(pedido.id);
      if (!terminou) postar({ tipo: "erro", pedidoId: pedido.id, erro: "A transferência foi interrompida. Peça os autos de novo: só virão os arquivos que faltam." });
    });
    port.postMessage({ pedidoId: pedido.id });
  }

  window.addEventListener("message", async (ev) => {
    if (ev.source !== window || ev.origin !== ORIGEM || !ev.data || ev.data.__pf !== "app") return;
    const d = ev.data;
    const responder = (dados) => postar({ tipo: "resposta", ref: d.ref, ...dados });
    switch (d.tipo) {
      case "ola": {
        postar({ tipo: "pronta", versao: VERSAO });
        const r = await enviar({ type: "PF_PENDENTES" });
        (r.ofertas || []).forEach((p) => postar({ tipo: "oferta", pedido: p }));
        break;
      }
      case "licenca": responder(await enviar({ type: "PF_LICENCA" })); break;
      case "baixar":
        responder(await enviar({ type: "PF_BAIXAR", casoId: d.casoId, numero: d.numero, codigo: d.codigo, jaTenho: d.jaTenho, preferencia: d.preferencia }));
        break;
      case "aceitar":
        responder(await enviar({ type: "PF_ACEITAR", pedidoId: d.pedidoId, casoId: d.casoId, jaTenho: d.jaTenho }));
        break; // a transferência começa quando chegar PF_INICIAR
      case "salvo": { const p = portas.get(d.pedidoId); if (p) p.postMessage({ salvo: true, ok: d.ok !== false }); break; }
      case "cancelar": {
        const p = portas.get(d.pedidoId); if (p) { portas.delete(d.pedidoId); p.disconnect(); }
        await enviar({ type: "PF_CANCELAR", pedidoId: d.pedidoId });
        break;
      }
      case "entrar": responder(await enviar({ type: "PF_ENTRAR" })); break;
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "PF_OFERTA") postar({ tipo: "oferta", pedido: msg.pedido });
    else if (msg?.type === "PF_STATUS") postar({ tipo: "status", ...msg, type: undefined });
    else if (msg?.type === "PF_INICIAR") transferir(msg.pedido);
  });

  document.documentElement.dataset.projudiPdfs = VERSAO; // o site sabe que a extensão está instalada
  postar({ tipo: "pronta", versao: VERSAO });
})();
