(() => {
  if (window.__projudiPdfLoaded) return;
  window.__projudiPdfLoaded = true;

  const TOGGLE_SEL = 'img[id^="MostrarArquivos_"]';
  const LINK_SEL = 'a[href*="Id_MovimentacaoArquivo"]';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Download via extensão ----------
  let reqId = 0;
  const pending = new Map();
  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.__projudiPdf !== "res") return;
    const cb = pending.get(ev.data.id);
    if (cb) { pending.delete(ev.data.id); cb(ev.data); }
  });
  let onProgress = null;
  window.addEventListener("message", (ev) => {
    if (ev.source === window && ev.data && ev.data.__projudiPdf === "progress" && onProgress) onProgress(ev.data.text);
  });
  function request(payload, timeoutMs) {
    return new Promise((resolve) => {
      const id = ++reqId;
      pending.set(id, resolve);
      window.postMessage({ __projudiPdf: "req", id, ...payload }, window.location.origin);
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ ok: false, error: "tempo esgotado" }); } }, timeoutMs);
    });
  }

  // ---------- Leitura da página ----------
  function numeroProcesso() {
    const m = document.body.innerText.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/);
    return m ? m[0] : "processo";
  }

  // Dados da capa do processo, quando a tela os mostrar. Tudo é opcional:
  // o PeríciaFlow só exige o número; o resto ajuda a preencher a perícia nova.
  const ROTULOS = {
    classe: /^classe( processual)?$/i,
    assunto: /^assuntos?$/i,
    serventia: /^(serventia|ju[ií]zo|vara|[oó]rg[aã]o julgador)$/i,
    comarca: /^comarca$/i,
    valorCausa: /^valor( da)? causa$/i,
    poloAtivo: /^(polo ativo|autor(es)?|requerente(s)?|exequente(s)?)$/i,
    poloPassivo: /^(polo passivo|r[eé]u(s)?|requerido(s)?|executado(s)?)$/i,
    distribuicao: /^(data (de|da) )?distribui[cç][aã]o$/i
  };
  function lerCapa() {
    const capa = {};
    const limpa = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const candidatos = document.querySelectorAll("td, th, dt, label, span, div, b, strong");
    for (const el of candidatos) {
      if (el.children.length > 1) continue;
      const rotulo = limpa(el.textContent).replace(/:$/, "");
      if (!rotulo || rotulo.length > 40) continue;
      for (const [campo, re] of Object.entries(ROTULOS)) {
        if (capa[campo] || !re.test(rotulo)) continue;
        // valor: próximo irmão; senão a próxima célula da linha; senão o texto depois dos dois-pontos
        let alvo = el.nextElementSibling;
        if (!alvo && el.parentElement && el.parentElement.tagName !== "TR") alvo = el.parentElement.nextElementSibling;
        const valor = limpa(alvo && alvo.innerText);
        if (valor && valor.length < 300 && !ROTULOS[campo].test(valor)) capa[campo] = valor;
      }
    }
    return capa;
  }

  function sanitize(name) {
    return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 150);
  }

  function filesRowFor(toggle) {
    const row = toggle.closest("tr");
    return row ? row.nextElementSibling : null;
  }

  function isLoaded(toggle) {
    const n = filesRowFor(toggle);
    return !!(n && n.querySelector("ul.lista_arquivos li " + LINK_SEL));
  }

  async function expandAll(onProgress) {
    const toggles = [...document.querySelectorAll(TOGGLE_SEL)];
    let i = 0;
    for (const t of toggles) {
      i++;
      onProgress(`Abrindo movimentações… ${i}/${toggles.length}`);
      if (isLoaded(t)) continue;
      const link = t.closest("a") || t;
      link.click();
      for (let k = 0; k < 60 && !isLoaded(t); k++) await sleep(150);
    }
    return toggles;
  }

  // Número, tipo e data da movimentação, lidos do texto da linha.
  // Ex.: "261\tJuntada -> Petição -> Impugnação\nQuesitos... 26/08/2026 17:17:11 HELVECIO..."
  function rowInfo(row) {
    const txt = row ? row.innerText || "" : "";
    const mov = (txt.match(/^\s*(\d+)/) || [])[1] || "";
    const semNumero = txt.replace(/^\s*\d+\s*/, "");
    const primeira = (semNumero.split(/\n/).map((l) => l.trim()).find(Boolean) || "")
      .replace(/\s*\d{2}\/\d{2}\/\d{4}.*$/, "")        // tira data/hora se vier na mesma linha
      .replace(/\s*->\s*/g, " - ")
      .trim();
    const d = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return { mov, tipo: primeira || "Movimentação", data: d ? `${d[3]}-${d[2]}-${d[1]}` : "" };
  }

  function collectFiles(toggles, includeHtml) {
    const files = [];
    const seen = new Set();
    for (const t of toggles) {
      const row = t.closest("tr");
      const info = rowInfo(row);
      const mov = info.mov;
      const filesRow = filesRowFor(t);
      if (!filesRow) continue;
      filesRow.querySelectorAll("ul.lista_arquivos li").forEach((li) => {
        const a = li.querySelector(LINK_SEL);
        if (!a || seen.has(a.href)) return;
        const d = li.querySelector("[nome_arquivo]");
        let name = (d && d.getAttribute("nome_arquivo")) || a.innerText.trim();
        name = name.replace(/\.p7s$/i, "");
        const isPdf = /\.pdf$/i.test(name);
        const isHtml = /\.html?$/i.test(name);
        if (!isPdf && !(includeHtml && isHtml)) return;
        seen.add(a.href);
        const idArquivo = (a.href.match(/Id_MovimentacaoArquivo=([^&#]+)/) || [])[1] || "";
        files.push({ url: a.href, idArquivo, mov, name, isPdf, tipo: info.tipo, data: info.data });
      });
    }
    return files;
  }

  // Lista no formato do ZIP: "261 - Juntada - Petição/2026-08-26_arquivo.pdf".
  // O importador de ZIP do PeríciaFlow usa a pasta como fase e a data do nome.
  async function prepararArquivos(includeHtml, setStatus) {
    const toggles = await expandAll(setStatus);
    const files = collectFiles(toggles, includeHtml);
    const proc = sanitize(numeroProcesso());
    const zipFiles = files.map((f) => {
      const fase = f.mov ? `${String(f.mov).padStart(3, "0")} - ${sanitize(f.tipo).slice(0, 80)}` : "";
      const nome = (f.data ? `${f.data}_` : "") + sanitize(f.name);
      return {
        url: f.url, isPdf: f.isPdf,
        zipName: (fase ? fase + "/" : "") + nome,
        // usados no envio ao PeríciaFlow
        idArquivo: f.idArquivo || `${f.mov}-${sanitize(f.name)}`, nome, fase, mov: f.mov, tipo: f.tipo, data: f.data
      };
    });
    return { proc, zipFiles };
  }

  // ---------- Interface ----------
  function buildUI() {
    const box = document.createElement("div");
    box.id = "projudi-pdf-box";
    box.innerHTML = `
      <button id="projudi-pdf-btn" type="button">⬇ Baixar todos os PDFs (ZIP)</button>
      <button id="projudi-pdf-send" type="button">↗ Enviar ao PeríciaFlow</button>
      <label class="projudi-pdf-opt"><input type="checkbox" id="projudi-pdf-html"> incluir documentos HTML (decisões/despachos)</label>
      <div id="projudi-pdf-status"></div>
      <div id="projudi-pdf-lic">
        <div id="projudi-pdf-lic-info"></div>
        <form id="projudi-pdf-lic-form" hidden>
          <input id="projudi-pdf-email" type="email" placeholder="e-mail da assinatura" autocomplete="email" required>
          <button type="submit">Ativar</button>
        </form>
        <div id="projudi-pdf-assinar" hidden></div>
      </div>
      <button id="projudi-pdf-close" type="button" title="Ocultar">×</button>`;
    document.body.appendChild(box);
    const btn = box.querySelector("#projudi-pdf-btn");
    const sendBtn = box.querySelector("#projudi-pdf-send");
    const status = box.querySelector("#projudi-pdf-status");
    const setStatus = (t) => (status.textContent = t);
    const setBusy = (busy) => { btn.disabled = sendBtn.disabled = busy || !licenciado; };
    box.querySelector("#projudi-pdf-close").onclick = () => box.remove();

    // ---------- Assinatura ----------
    const licInfo = box.querySelector("#projudi-pdf-lic-info");
    const licForm = box.querySelector("#projudi-pdf-lic-form");
    const licEmail = box.querySelector("#projudi-pdf-email");
    const assinar = box.querySelector("#projudi-pdf-assinar");
    const fmt = (d) => (d ? d.split("-").reverse().join("/") : "");
    let licenciado = false;

    // Botões dos planos (Mercado Pago). O pagamento abre numa aba nova; a liberação é automática.
    function desenharPlanos(lic) {
      assinar.innerHTML = "";
      const nota = document.createElement("div");
      nota.textContent = lic.assinar || "";
      const linha = document.createElement("div");
      linha.className = "projudi-pdf-planos";
      for (const pl of lic.planos || []) {
        const b = document.createElement("button");
        b.type = "button";
        b.innerHTML = `<b></b><span></span>`;
        b.querySelector("b").textContent = pl.nome;
        b.querySelector("span").textContent = pl.preco;
        b.onclick = async () => {
          const email = licEmail.value.trim();
          if (!email) { licInfo.textContent = "Escreva o seu e-mail para assinar."; licEmail.focus(); return; }
          b.disabled = true;
          licInfo.textContent = "Abrindo o pagamento no Mercado Pago…";
          const r = await request({ kind: "checkout", plano: pl.id, email }, 30000);
          b.disabled = false;
          licInfo.textContent = r.ok
            ? "Conclua o pagamento na aba do Mercado Pago. Depois clique em Ativar aqui."
            : (r.erro || "Não foi possível abrir o pagamento.");
        };
        linha.appendChild(b);
      }
      assinar.append(linha, nota);
    }

    function showLicense(lic) {
      licenciado = !!lic.ativo;
      setBusy(false);
      desenharPlanos(lic);
      if (licenciado && lic.modoTeste) {
        licInfo.textContent = "Modo de teste: assinatura ainda não configurada.";
        licForm.hidden = true; assinar.hidden = true;
      } else if (licenciado) {
        licInfo.innerHTML = "";
        licInfo.append(`Assinante: ${lic.email}` + (lic.validade ? ` · válida até ${fmt(lic.validade)} · ` : " · "));
        const trocar = document.createElement("a");
        trocar.href = "#"; trocar.textContent = "trocar e-mail";
        trocar.onclick = (e) => { e.preventDefault(); licForm.hidden = false; licEmail.value = lic.email || ""; licEmail.focus(); };
        licInfo.append(trocar);
        licForm.hidden = true; assinar.hidden = true;
      } else {
        licInfo.textContent = lic.motivo || "Assinatura necessária.";
        licForm.hidden = false; assinar.hidden = false;
        if (lic.email && !licEmail.value) licEmail.value = lic.email;
      }
    }

    licForm.onsubmit = async (e) => {
      e.preventDefault();
      licInfo.textContent = "Verificando assinatura…";
      showLicense(await request({ kind: "license", email: licEmail.value }, 30000));
    };

    setBusy(true);
    licInfo.textContent = "Verificando assinatura…";
    request({ kind: "license" }, 30000).then(showLicense);

    btn.onclick = async () => {
      setBusy(true);
      try {
        const includeHtml = box.querySelector("#projudi-pdf-html").checked;
        const { proc, zipFiles } = await prepararArquivos(includeHtml, setStatus);
        if (!zipFiles.length) { setStatus("Nenhum PDF encontrado neste processo."); return; }
        onProgress = setStatus;
        setStatus(`Preparando ${zipFiles.length} arquivo(s)…`);
        const res = await request({ kind: "zip", files: zipFiles, zipFilename: `PROJUDI_${proc}.zip`, folder: `PROJUDI/${proc}` }, 30 * 60 * 1000);
        onProgress = null;
        if (res.license) { showLicense(res.license); setStatus(""); return; }
        if (res.error && !res.ok && !res.avulsos) { setStatus("Erro: " + res.error); return; }
        const mb = (res.bytes / 1048576).toFixed(1);
        let txt = res.ok ? `Pronto: PROJUDI_${proc}.zip com ${res.count} arquivo(s) (${mb} MB) na pasta Downloads.` : "Não foi possível montar o ZIP.";
        if (res.avulsos) txt += ` ${res.avulsos} arquivo(s) baixado(s) avulso(s) em Downloads/PROJUDI/${proc}.`;
        if (res.falhas) txt += ` ${res.falhas} falharam.`;
        setStatus(txt);
      } catch (e) {
        setStatus("Erro: " + (e && e.message ? e.message : e));
      } finally {
        onProgress = null;
        setBusy(false);
      }
    };

    // Envia a lista ao PeríciaFlow. pedidoId vem preenchido quando o próprio site pediu os autos.
    async function enviarLista(pedidoId) {
      setBusy(true);
      try {
        const includeHtml = box.querySelector("#projudi-pdf-html").checked;
        const { proc, zipFiles } = await prepararArquivos(includeHtml, setStatus);
        if (!zipFiles.length) { setStatus("Nenhum PDF encontrado neste processo."); return; }
        onProgress = setStatus;
        setStatus(`Lendo ${zipFiles.length} arquivo(s)…`);
        const res = await request({ kind: "lista", files: zipFiles, proc, capa: lerCapa(), pedidoId }, 60000);
        if (res.license) { showLicense(res.license); setStatus(""); return; }
        if (!res.ok) { setStatus("Erro: " + (res.error || "não foi possível enviar.")); return; }
        if (res.oferta) {
          setStatus(`${res.total} arquivo(s) prontos. Escolha a perícia na aba do PeríciaFlow` + (res.abaNova ? " que acabou de abrir." : "."));
          return; // o progresso do envio continua chegando por onProgress
        } else if (!res.total) {
          setStatus("A perícia já tem todos os arquivos deste processo.");
        } else {
          setStatus(`Enviando ${res.total} arquivo(s) novo(s) ao PeríciaFlow` + (res.pulados ? ` (${res.pulados} já estavam lá)` : "") + "…");
          return; // o progresso continua chegando por onProgress
        }
        onProgress = null;
      } catch (e) {
        setStatus("Erro: " + (e && e.message ? e.message : e));
        onProgress = null;
      } finally {
        setBusy(false);
      }
    }
    sendBtn.onclick = () => enviarLista(null);

    // Aba aberta pela extensão a pedido do PeríciaFlow: começa sozinha se for o processo certo.
    request({ kind: "tarefa" }, 15000).then((res) => {
      const ped = res && res.pedido;
      if (!ped) return;
      const aqui = numeroProcesso().replace(/\D/g, "");
      if (aqui !== String(ped.numero).replace(/\D/g, "")) {
        setStatus(`PeríciaFlow pediu o processo ${ped.numero}; esta tela é de outro.`);
        return;
      }
      setStatus("Pedido do PeríciaFlow: lendo os arquivos do processo…");
      let voltas = 0; // espera a verificação da assinatura (até ~15 s)
      const esperar = () => {
        if (licenciado) enviarLista(ped.id);
        else if (++voltas < 50) setTimeout(esperar, 300);
        else setStatus("Ative a assinatura da extensão para continuar o pedido do PeríciaFlow.");
      };
      esperar();
    });
  }

  function init() {
    if (document.getElementById("projudi-pdf-box")) return;
    if (document.querySelector(TOGGLE_SEL)) buildUI();
  }

  init();
  // A página pode carregar a lista de movimentações depois; observa por alguns segundos.
  const obs = new MutationObserver(init);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 15000);
})();
