// Robô de navegação no PROJUDI. Só age em abas abertas por um pedido do PeríciaFlow.
// Cada carregamento de página dá UM passo: preencher a busca, clicar no processo ou pedir ajuda.
// Nunca digita senha nem mexe no certificado: o login é sempre feito pelo perito.
(() => {
  if (window.top !== window || window.__pfRoboLoaded) return;
  window.__pfRoboLoaded = true;

  const TOGGLE_SEL = 'img[id^="MostrarArquivos_"]';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const digitos = (s) => String(s || "").replace(/\D/g, "");
  const enviar = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r || null); }));

  // ---------- faixa de aviso no topo da página ----------
  function faixa(texto, alerta) {
    let el = document.getElementById("pf-robo-faixa");
    if (!el) {
      el = document.createElement("div");
      el.id = "pf-robo-faixa";
      el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483646;padding:10px 16px;" +
        "font:600 14px/1.4 system-ui,'Segoe UI',Arial,sans-serif;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.2)";
      document.documentElement.appendChild(el);
    }
    el.style.background = alerta ? "#8a5f10" : "#14655c";
    el.textContent = "PeríciaFlow · " + texto;
  }

  // ---------- leitura de formulários ----------
  const visivel = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)) && getComputedStyle(el).visibility !== "hidden";
  function rotulo(el) {
    const partes = [el.name, el.id, el.placeholder, el.title, el.getAttribute("aria-label")];
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) partes.push(l.textContent); }
    const l2 = el.closest("label"); if (l2) partes.push(l2.textContent);
    // texto da célula/linha anterior (formulários em tabela)
    const td = el.closest("td"); if (td && td.previousElementSibling) partes.push(td.previousElementSibling.textContent);
    let irmao = el.previousElementSibling; let n = 0;
    while (irmao && n++ < 3) { if (irmao.textContent) { partes.push(irmao.textContent); break; } irmao = irmao.previousElementSibling; }
    return norm(partes.filter(Boolean).join(" | "));
  }
  const campos = () => [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button])")].filter(visivel);

  function acharNumero() {
    const real = document.querySelector('input[name*="numeroProcesso" i], input#numeroProcesso, input[name*="ProcessoNumero" i]');
    if (real && visivel(real)) return real;
    return campos().find((el) => el.type !== "password" && /processo|numero/.test(rotulo(el)) && !/codigo|chave|senha|advog|oab|cpf|nome|parte|usuario/.test(rotulo(el)));
  }
  function acharCodigo() {
    return campos().find((el) => /codigo|chave|senha do processo|acesso/.test(rotulo(el)) && !/usuario|cpf|login|captcha|caracteres/.test(rotulo(el)));
  }
  function temCaptcha() {
    if (document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, .h-captcha')) return true;
    if ([...document.images].some((i) => visivel(i) && /captcha/i.test(i.src + i.id + i.alt))) return true;
    return campos().some((el) => /captcha|caracteres da imagem|codigo da imagem/.test(rotulo(el)));
  }
  // Página de verificação do Cloudflare ("Just a moment…", "Verifique se você é humano").
  function verificacaoCloudflare() {
    if (document.querySelector('iframe[src*="challenges.cloudflare.com"], #challenge-form, #cf-challenge-running, .cf-turnstile, #turnstile-wrapper')) return true;
    const t = norm(document.title + " " + (document.body ? document.body.innerText.slice(0, 600) : ""));
    return /just a moment|um momento|verify(ing)? you are human|verifique se voce e humano|checking your browser|verificando (se|seu navegador)/.test(t);
  }

  // Tela de login do perito: campo de senha + usuário/CPF (ou formulário de LogOn).
  function telaDeLogin() {
    const senha = campos().find((el) => el.type === "password" && !/processo|chave/.test(rotulo(el)));
    if (!senha) return false;
    const form = senha.form;
    const usuario = campos().some((el) => el.type !== "password" && /usuario|cpf|login/.test(rotulo(el)));
    return usuario || /logon|login/i.test((form && form.action) || "");
  }
  // Digita caractere por caractere, com pausas variadas (o PROJUDI fica atrás do Cloudflare).
  async function preencher(el, valor) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    el.focus();
    setter.call(el, "");
    for (const ch of String(valor)) {
      setter.call(el, el.value + ch);
      el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
      await sleep(40 + Math.random() * 70);
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  function botaoBuscar(form) {
    const raiz = form || document;
    const bts = [...raiz.querySelectorAll('button, input[type=submit], input[type=button], input[type=image], a.botao, a[onclick]')].filter(visivel);
    return bts.find((b) => /buscar|consultar|pesquisar|localizar/.test(norm(b.textContent || b.value || b.title || b.alt))) ||
      bts.find((b) => b.type === "submit") || null;
  }
  // Link do processo na lista de resultados.
  function linkDoProcesso(numero) {
    const alvo = digitos(numero);
    return [...document.querySelectorAll("a")].find((a) => visivel(a) && digitos(a.textContent).includes(alvo)) || null;
  }
  const mensagemDeErro = () => /nao (foi )?encontrad|nenhum (processo|registro)|codigo invalido|codigo de acesso invalido|dados invalidos/.test(norm(document.body.innerText).slice(0, 20000));

  // ---------- um passo por carregamento ----------
  async function passo() {
    const res = await enviar({ type: "PJ_TAREFA" });
    if (!res || !res.pedido) return;
    const { pedido, urls, max, clicaBuscar } = res;
    const tentar = async (texto) => {
      const r = await enviar({ type: "PJ_TENTATIVA", texto });
      if (!r || r.tentativas > max) { await precisar("assistido"); return false; }
      return true;
    };
    const precisar = async (etapa) => {
      const textos = {
        login: "Entre no PROJUDI com o seu certificado digital ou CPF e senha. Depois disso a busca continua sozinha.",
        captcha: "O PROJUDI pediu uma verificação de segurança. Resolva nesta aba; o resto continua sozinho.",
        confirmar: `Confira o processo ${pedido.numero}${pedido.metodo === "codigo" ? " e o código de acesso" : ""} e clique em Buscar. O resto continua sozinho.`,
        assistido: `Não consegui chegar sozinho ao processo ${pedido.numero}. Abra o processo nesta aba: o download para o PeríciaFlow começa sozinho.`
      };
      faixa(textos[etapa], true);
      await enviar({ type: "PJ_PRECISA", etapa });
    };

    faixa(`buscando os autos do processo ${pedido.numero}…`);
    await sleep(700); // dá tempo de a página terminar de montar

    // 0) Verificação de segurança do Cloudflare: só o perito resolve.
    if (verificacaoCloudflare()) { await precisar("captcha"); return; }

    // 1) Já é a tela do processo: o page.js assume daqui.
    if (document.querySelector(TOGGLE_SEL)) { faixa("lendo os arquivos do processo…"); return; }

    // 2) Lista de resultados com o processo: abre.
    const link = linkDoProcesso(pedido.numero);
    if (link && !acharNumero()) {
      if (await tentar("Abrindo o processo no PROJUDI…")) link.click();
      return;
    }

    // 3) Formulário de busca.
    const campoNum = acharNumero();
    const campoCod = pedido.metodo === "codigo" ? acharCodigo() : null;
    if (campoNum && (pedido.metodo !== "codigo" || campoCod)) {
      if (mensagemDeErro() && pedido.tentativas > 0) {
        faixa(pedido.metodo === "codigo" ? "o PROJUDI não aceitou o número e o código de acesso." : "o PROJUDI não encontrou o processo.", true);
        await precisar("assistido");
        return;
      }
      await preencher(campoNum, pedido.numero);
      if (campoCod) await preencher(campoCod, pedido.codigo);
      if (temCaptcha()) { await precisar("captcha"); return; }
      // Clique automático em Buscar fica desligado por padrão: o Cloudflare bloqueia.
      if (!clicaBuscar) { await precisar("confirmar"); return; }
      const bt = botaoBuscar(campoNum.form);
      if (!(await tentar(pedido.metodo === "codigo" ? "Consultando pelo código de acesso…" : "Consultando o processo…"))) return;
      if (bt) bt.click(); else if (campoNum.form) campoNum.form.requestSubmit ? campoNum.form.requestSubmit() : campoNum.form.submit();
      return;
    }

    // 4) Precisa de login (busca com a sessão do perito).
    if (telaDeLogin()) {
      if (pedido.metodo === "codigo") { await precisar("assistido"); return; }
      await precisar("login");
      return;
    }

    // 5) Outra tela qualquer (ex.: início depois do login): vai para a busca.
    if (pedido.etapa === "assistido") { faixa(`abra o processo ${pedido.numero} nesta aba: o download começa sozinho.`, true); return; }
    if (await tentar("Indo para a busca de processos…")) {
      location.href = pedido.metodo === "codigo" ? urls.porCodigo : urls.comLogin;
    }
  }

  passo();
})();
