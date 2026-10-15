/* Gerenciador de Perícia (PHP) — receptor dos autos do PROJUDI.
 *
 * Liga a página da perícia à extensão "PROJUDI PDFs" (v1.7+) e envia cada arquivo recebido
 * à API api/autos-projudi.php, um por vez. Mesmo protocolo do Gerenciador de Perícia do GitHub.
 *
 * Uso mínimo na página da perícia:
 *   <button data-pf-autos data-caso="123" data-numero="5151870-23.2026.8.09.0051" data-codigo="AB12CD34">
 *     Baixar autos do PROJUDI</button>
 *   <div data-pf-autos-status="123"></div>
 *   <script src="/js/pj-receptor.js"></script>
 *   <script>PericiaFlowAutos.configurar({ api: "/api/autos-projudi.php" });</script>
 *
 * Opcional, para aceitar envios feitos no PROJUDI ("Enviar ao Gerenciador de Perícia"):
 *   casos: () => [{ id, nome, numero }]              perícias que o usuário pode editar
 *   criarCaso: async (pedido) => novoId              cria a perícia com pedido.numero e pedido.capa
 *   aoTerminar: (casoId, resumo) => {}               ex.: recarregar a lista de documentos
 */
(function () {
  "use strict";
  if (window.PericiaFlowAutos) return;

  const cfg = { api: "api/autos-projudi.php", casos: null, criarCaso: null, aoTerminar: null };
  const st = { versao: null, status: {}, pedidos: {}, ofertas: new Map(), respostas: new Map(), ref: 0, fila: Promise.resolve() };
  const VERSAO_MINIMA = [1, 7, 0];
  const ORIGEM = location.origin;

  // ---------- utilidades ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const post = (dados) => window.postMessage({ __pf: "app", ...dados }, ORIGEM);
  function pedir(dados, ms) {
    return new Promise((res) => {
      const ref = ++st.ref;
      st.respostas.set(ref, res);
      post({ ...dados, ref });
      setTimeout(() => { if (st.respostas.has(ref)) { st.respostas.delete(ref); res({ ok: false, erro: "A extensão não respondeu. Recarregue a página." }); } }, ms || 20000);
    });
  }
  function versaoOk() {
    if (!st.versao) return false;
    const a = st.versao.split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((a[i] || 0) !== VERSAO_MINIMA[i]) return (a[i] || 0) > VERSAO_MINIMA[i];
    return true;
  }
  function metodo(novo) {
    try { if (novo) localStorage.setItem("pf_projudi_metodo", novo); return localStorage.getItem("pf_projudi_metodo") || "auto"; }
    catch (e) { return novo || "auto"; }
  }
  async function api(acao, dados, corpo) {
    const url = new URL(cfg.api, location.href);
    url.searchParams.set("acao", acao);
    if (!corpo) Object.entries(dados || {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url, { method: corpo ? "POST" : "GET", body: corpo, credentials: "same-origin", headers: { "X-PF-Autos": "1" } });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j.ok) throw new Error(j.erro || `HTTP ${r.status}`);
    return j;
  }

  // ---------- estado na tela ----------
  (function estilo() {
    const css = `.pf-autos-st{display:flex;gap:8px;align-items:flex-start;margin-top:8px;font:13px/1.45 system-ui,sans-serif}
      .pf-autos-pill{flex-shrink:0;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:#e1eeeb;color:#0e4a44}
      .pf-autos-pill.alerta{background:#f4ead2;color:#8a5f10}.pf-autos-pill.erro{background:#f5e2de;color:#a33d33}.pf-autos-pill.ok{background:#dfede5;color:#2e6b4f}
      .pf-autos-barra{height:6px;border-radius:3px;background:#e9edeb;margin-top:6px;overflow:hidden}.pf-autos-barra i{display:block;height:100%;background:#14655c}
      #pf-autos-oferta{position:fixed;right:16px;bottom:16px;z-index:9999;width:min(380px,calc(100vw - 32px));background:#fff;border:1px solid #c3cdca;border-radius:10px;box-shadow:0 10px 24px -16px rgba(22,32,42,.4);padding:14px;font:13px/1.45 system-ui,sans-serif;display:grid;gap:8px}`;
    const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  })();

  function html(casoId) {
    const s = st.status[casoId];
    if (!s) return "";
    const tipo = { erro: "erro", cancelado: "", fim: "ok", login: "alerta", assistido: "alerta", captcha: "alerta", confirmar: "alerta" }[s.etapa] || "";
    const rotulo = { erro: "erro", cancelado: "cancelado", login: "entre no PROJUDI", assistido: "precisa de você", captcha: "verificação", confirmar: "clique em Consultar", fim: "concluído", transferindo: "recebendo" }[s.etapa] || "em andamento";
    const barra = s.etapa === "transferindo" && s.total ? `<div class="pf-autos-barra"><i style="width:${Math.round(100 * s.feitos / s.total)}%"></i></div>` : "";
    const ativo = s.pedidoId && !["fim", "erro", "cancelado"].includes(s.etapa);
    return `<div class="pf-autos-st"><span class="pf-autos-pill ${tipo}">${rotulo}</span><span style="flex:1;min-width:0">${esc(s.texto)}${barra}</span>
      ${ativo ? `<button type="button" data-pf-autos-cancelar="${esc(casoId)}">Cancelar</button>` : ""}</div>`;
  }
  function status(casoId, patch) {
    if (!casoId) return;
    st.status[casoId] = { ...(st.status[casoId] || {}), ...patch };
    document.querySelectorAll(`[data-pf-autos-status="${CSS.escape(String(casoId))}"]`).forEach((el) => (el.innerHTML = html(casoId)));
  }
  const casoDe = (pedidoId, casoId) => casoId || st.pedidos[pedidoId] || null;

  // ---------- pedir os autos ----------
  async function baixar({ casoId, numero, codigo }) {
    casoId = String(casoId);
    if (!st.versao) return status(casoId, { etapa: "erro", texto: "Extensão PROJUDI PDFs não encontrada neste navegador. Instale a versão 1.7 ou mais nova e recarregue a página." });
    if (!versaoOk()) return status(casoId, { etapa: "erro", texto: `A extensão instalada é a ${st.versao}. Atualize para a 1.7 ou mais nova.` });
    if (String(numero || "").replace(/\D/g, "").length !== 20) return status(casoId, { etapa: "erro", texto: "Preencha o número do processo no formato CNJ (20 dígitos)." });
    status(casoId, { etapa: "pedindo", texto: "Conferindo o que já foi importado…", feitos: 0, total: 0, falhas: 0, pedidoId: null });
    let jaTenho = [];
    try { jaTenho = (await api("ja-tenho", { caso_id: casoId })).ids; }
    catch (e) { return status(casoId, { etapa: "erro", texto: e.message }); }
    const r = await pedir({ tipo: "baixar", casoId, numero, codigo: codigo || "", jaTenho, preferencia: metodo() });
    if (!r.ok) return status(casoId, { etapa: "erro", texto: r.erro || "A extensão recusou o pedido." });
    st.pedidos[r.pedido.id] = casoId;
    status(casoId, { etapa: "buscando", pedidoId: r.pedido.id, texto: r.pedido.metodo === "codigo"
      ? "Consultando o PROJUDI pelo código de acesso, numa aba em segundo plano…"
      : "Abrindo o PROJUDI com o seu login, numa aba em segundo plano…" });
  }
  function cancelar(casoId) {
    const s = st.status[casoId];
    if (s && s.pedidoId) { post({ tipo: "cancelar", pedidoId: s.pedidoId }); delete st.pedidos[s.pedidoId]; }
    status(casoId, { etapa: "cancelado", texto: "Pedido cancelado. O que já chegou continua salvo.", pedidoId: null });
  }

  // ---------- gravar cada arquivo ----------
  async function gravar(d) {
    const casoId = casoDe(d.pedidoId, d.casoId);
    let ok = false, duplicado = false;
    try {
      const m = d.meta;
      const fd = new FormData();
      fd.append("caso_id", casoId);
      fd.append("projudi_id", String(m.idArquivo).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128));
      fd.append("nome", m.nome || "");
      fd.append("fase", m.fase || "");
      fd.append("movimentacao", m.mov || "");
      fd.append("data", m.data || "");
      fd.append("arquivo", d.blob, m.nome || "documento.pdf");
      const r = await api("enviar", null, fd);
      ok = true; duplicado = !!r.duplicado;
    } catch (e) { ok = false; }
    const s = st.status[casoId] || {};
    status(casoId, { feitos: (s.feitos || 0) + 1, falhas: (s.falhas || 0) + (ok ? 0 : 1),
      texto: `Recebendo ${Math.min((s.feitos || 0) + 1, s.total || 0)} de ${s.total || "?"}: ${d.meta.nome}${duplicado ? " (já existia)" : ""}` });
    post({ tipo: "salvo", pedidoId: d.pedidoId, ok });
  }

  // ---------- envios feitos no PROJUDI ----------
  function mostrarOfertas() {
    let caixa = document.getElementById("pf-autos-oferta");
    if (!st.ofertas.size || typeof cfg.casos !== "function") { if (caixa) caixa.remove(); return; }
    if (!caixa) { caixa = document.createElement("div"); caixa.id = "pf-autos-oferta"; caixa.setAttribute("role", "dialog"); document.body.appendChild(caixa); }
    const casos = cfg.casos() || [];
    caixa.innerHTML = [...st.ofertas.values()].map((p) => {
      const dig = String(p.numero).replace(/\D/g, "");
      const igual = casos.find((c) => String(c.numero || "").replace(/\D/g, "") === dig);
      const opcoes = (cfg.criarCaso ? [`<option value="novo" ${igual ? "" : "selected"}>Nova perícia com os dados do processo</option>`] : [])
        .concat(casos.map((c) => `<option value="${esc(c.id)}" ${igual && igual.id === c.id ? "selected" : ""}>${esc(c.nome)}</option>`)).join("");
      return `<div><b>Chegou do PROJUDI</b><div>Processo ${esc(p.numero)} · ${p.total} arquivo(s)</div></div>
        <label for="pf-autos-dest-${esc(p.id)}">Guardar em</label><select id="pf-autos-dest-${esc(p.id)}">${opcoes}</select>
        <div style="display:flex;gap:8px"><button type="button" data-pf-autos-aceitar="${esc(p.id)}">Importar</button>
        <button type="button" data-pf-autos-descartar="${esc(p.id)}">Descartar</button></div>`;
    }).join("<hr>");
  }
  async function aceitar(pedidoId) {
    const p = st.ofertas.get(pedidoId);
    if (!p) return;
    let casoId = document.getElementById(`pf-autos-dest-${pedidoId}`).value;
    if (casoId === "novo") casoId = String(await cfg.criarCaso(p));
    st.ofertas.delete(pedidoId); mostrarOfertas();
    st.pedidos[pedidoId] = casoId;
    status(casoId, { etapa: "pedindo", texto: "Conferindo o que já foi importado…", feitos: 0, total: 0, falhas: 0, pedidoId });
    let jaTenho = [];
    try { jaTenho = (await api("ja-tenho", { caso_id: casoId })).ids; } catch (e) { return status(casoId, { etapa: "erro", texto: e.message }); }
    const r = await pedir({ tipo: "aceitar", pedidoId, casoId, jaTenho });
    if (!r.ok) status(casoId, { etapa: "erro", texto: r.erro || "Não foi possível aceitar o envio.", pedidoId: null });
  }

  // ---------- eventos ----------
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pf-autos],[data-pf-autos-cancelar],[data-pf-autos-aceitar],[data-pf-autos-descartar]");
    if (!b) return;
    if (b.hasAttribute("data-pf-autos")) baixar({ casoId: b.dataset.caso, numero: b.dataset.numero, codigo: b.dataset.codigo });
    else if (b.dataset.pfAutosCancelar) cancelar(b.dataset.pfAutosCancelar);
    else if (b.dataset.pfAutosAceitar) aceitar(b.dataset.pfAutosAceitar);
    else if (b.dataset.pfAutosDescartar) { st.ofertas.delete(b.dataset.pfAutosDescartar); post({ tipo: "cancelar", pedidoId: b.dataset.pfAutosDescartar }); mostrarOfertas(); }
  });

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || ev.origin !== ORIGEM || !ev.data || ev.data.__pf !== "ext") return;
    const d = ev.data;
    switch (d.tipo) {
      case "pronta": st.versao = d.versao || "0"; document.dispatchEvent(new CustomEvent("pf-autos-extensao", { detail: { versao: st.versao, ok: versaoOk() } })); break;
      case "resposta": { const r = st.respostas.get(d.ref); if (r) { st.respostas.delete(d.ref); r(d); } break; }
      case "oferta": st.ofertas.set(d.pedido.id, d.pedido); mostrarOfertas(); break;
      case "status": {
        const casoId = casoDe(d.pedidoId, d.casoId); if (!casoId) break;
        const fim = ["fim", "cancelado"].includes(d.etapa);
        status(casoId, { etapa: d.etapa === "lista" ? "buscando" : d.etapa, texto: d.texto, pedidoId: fim ? null : d.pedidoId });
        if (fim) delete st.pedidos[d.pedidoId];
        break;
      }
      case "inicio": {
        const casoId = casoDe(d.pedido.id, d.pedido.casoId); st.pedidos[d.pedido.id] = casoId;
        status(casoId, { etapa: "transferindo", pedidoId: d.pedido.id, feitos: 0, falhas: 0, total: d.pedido.total,
          texto: `Recebendo ${d.pedido.total} arquivo(s)` + (d.pedido.pulados ? ` (${d.pedido.pulados} já estavam aqui)` : "") + "…" });
        break;
      }
      case "arquivo": st.fila = st.fila.then(() => gravar(d)); break;
      case "falha": { const c = casoDe(d.pedidoId, d.casoId); const s = st.status[c] || {}; status(c, { feitos: (s.feitos || 0) + 1, falhas: (s.falhas || 0) + 1, texto: `Não foi possível baixar ${d.meta && d.meta.nome}: ${d.erro}` }); break; }
      case "fim":
        st.fila = st.fila.then(() => {
          const c = casoDe(d.pedidoId, d.casoId); const s = st.status[c] || {}; const r = d.resumo || {}; const falhas = s.falhas || 0;
          status(c, { etapa: falhas && !r.gravados ? "erro" : "fim", pedidoId: null,
            texto: `${r.gravados || 0} arquivo(s) importado(s)` + (r.pulados ? `, ${r.pulados} já estavam aqui` : "") + (falhas ? `, ${falhas} com falha (peça de novo para tentar só esses)` : "") + "." });
          delete st.pedidos[d.pedidoId];
          if (typeof cfg.aoTerminar === "function") cfg.aoTerminar(c, { ...r, falhas });
        });
        break;
      case "erro": { const c = casoDe(d.pedidoId, d.casoId); status(c, { etapa: "erro", texto: d.erro, pedidoId: null }); delete st.pedidos[d.pedidoId]; break; }
    }
  });

  window.PericiaFlowAutos = {
    configurar(opcoes) { Object.assign(cfg, opcoes || {}); mostrarOfertas(); },
    baixar, cancelar, metodo,
    entrarNoProjudi: () => pedir({ tipo: "entrar" }),
    get extensao() { return { versao: st.versao, ok: versaoOk() }; },
  };
  post({ tipo: "ola" });
})();
