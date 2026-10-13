#!/usr/bin/env python3
"""Monta a prévia novo/index.html = index.html + telas novas (ferramentas/telas-novas.js).

Uso: python3 ferramentas/montar-novo.py
Cada troca confere que o trecho original existe uma única vez; se o index.html mudar
de um jeito que quebre a montagem, o script para com uma mensagem clara.
"""
import pathlib, sys

# APOSENTADO em 13/10/2026: a prévia virou o site principal. As telas novas, a barra lateral e a
# paleta já estão dentro do index.html, que voltou a ser a única fonte. Os arquivos desta pasta
# ficam como referência do que foi acrescentado.
sys.exit("montar-novo: aposentado. Edite o index.html diretamente (a prévia já é o site principal).")

RAIZ = pathlib.Path(__file__).resolve().parent.parent
h = (RAIZ / "index.html").read_text(encoding="utf-8")
mod = (RAIZ / "ferramentas" / "telas-novas.js").read_text(encoding="utf-8")


def trocar(antigo, novo, rotulo):
    global h
    n = h.count(antigo)
    if n != 1:
        sys.exit(f"montar-novo: trecho '{rotulo}' encontrado {n} vez(es); era para ser 1.")
    h = h.replace(antigo, novo)


CSS = """<style>
/* ===== Telas novas (Importar, Publicações, Tarefas, Agenda, Financeiro, Integrações) ===== */
.pf-card{background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:16px; display:grid; gap:10px; min-width:0;}
.pf-linha{display:flex; gap:10px; align-items:center; flex-wrap:wrap;}
.pf-grid2{display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:16px;}
.pf-grid3{display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr)); gap:14px;}
.pf-form{display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;}
.pf-campo{display:grid; gap:4px; flex:1 1 150px; min-width:0; font-size:12px; color:var(--muted);}
.pf-campo.pf-largo{flex:2 1 260px;}
.pf-campo input,.pf-campo select,.pf-num{font:inherit; font-size:14px; color:var(--ink); background:var(--surface); border:1px solid var(--line-strong); border-radius:8px; padding:8px 10px; min-width:0; width:100%;}
.pf-num{width:120px; text-align:right; font-variant-numeric:tabular-nums;}
.pf-kanban{display:grid; grid-template-columns:repeat(3,minmax(250px,1fr)); gap:14px; overflow-x:auto; padding-bottom:4px;}
.pf-kcol{background:var(--surface-2); border-radius:var(--radius); padding:10px; display:grid; gap:8px; align-content:start; min-height:140px;}
.pf-kcol.over{outline:2px dashed var(--accent); outline-offset:-4px;}
.pf-kcol h5{margin:2px 4px 4px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); display:flex; justify-content:space-between;}
.pf-kcard{background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:10px; display:grid; gap:6px; cursor:grab;}
.pf-krow{display:flex; gap:8px; align-items:center; min-width:0;}
.pf-krow b{font-size:13px; font-weight:600; overflow-wrap:anywhere;}
.pf-kmeta{font-size:12px;}
.pf-kacoes .btn{padding:2px 8px;}
.pf-vazio{font-size:12px; color:var(--muted); padding:8px 4px;}
.pf-prio{width:8px; height:8px; border-radius:50%; flex-shrink:0;}
.pf-prio.alta{background:var(--danger);} .pf-prio.media{background:var(--warn);} .pf-prio.baixa{background:var(--line-strong);}
.pf-dia{display:grid; grid-template-columns:70px 1fr; gap:12px; padding:10px 0; border-bottom:1px solid var(--line);}
.pf-dia:last-child{border-bottom:0;}
.pf-dia-d{text-align:center;}
.pf-dia-d b{display:block; font-size:22px; line-height:1; color:var(--accent-deep);}
.pf-dia-d small{font-size:11px; color:var(--muted); text-transform:uppercase;}
.pf-ev{display:flex; gap:10px; align-items:flex-start; padding:4px 0;}
.pf-ev time{font-size:12px; color:var(--muted); min-width:44px; padding-top:2px;}
.pf-tabela{overflow-x:auto;}
.pf-tabela table{width:100%; border-collapse:collapse; font-size:13px; font-variant-numeric:tabular-nums;}
.pf-tabela th{text-align:left; font-weight:600; color:var(--muted); font-size:11.5px; text-transform:uppercase; letter-spacing:.04em; padding:8px 10px; border-bottom:1px solid var(--line);}
.pf-tabela td{padding:10px; border-bottom:1px solid var(--line); vertical-align:top;}
.pf-tabela .n{text-align:right; white-space:nowrap;}
.pf-fin-bar{display:flex; height:10px; border-radius:5px; overflow:hidden; background:var(--surface-3);}
.pf-fin-bar i{display:block; height:100%;}
.pf-fin-bar .lev{background:var(--ok);} .pf-fin-bar .dep{background:var(--accent);}
.pf-st{display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600;}
.pf-st::before{content:""; width:8px; height:8px; border-radius:50%; background:currentColor;}
.pf-st.ok{color:var(--ok);} .pf-st.parcial{color:var(--warn);} .pf-st.falta{color:var(--danger);}
.pf-toggle{position:relative; width:38px; height:22px; border-radius:11px; background:var(--line-strong); border:0; cursor:pointer; flex-shrink:0;}
.pf-toggle::after{content:""; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:var(--surface); transition:left .15s;}
.pf-toggle[aria-pressed="true"]{background:var(--accent);}
.pf-toggle[aria-pressed="true"]::after{left:19px;}
.pf-toggle:disabled{opacity:.45; cursor:not-allowed;}
#pfAviso{position:fixed; left:50%; transform:translateX(-50%); bottom:calc(20px + env(safe-area-inset-bottom,0px)); z-index:90; background:var(--ink); color:var(--surface); padding:10px 16px; border-radius:8px; font-size:13px; box-shadow:var(--shadow);}
.pf-tabela .link-sutil,.pf-kcard .link-sutil,.pf-ev .link-sutil{padding:0; margin:0; text-align:left; background:none; border:0;}
/* acabamento */
.pf-campo input,.pf-campo select{height:40px; box-sizing:border-box;}
.pf-campo small{font-size:11.5px; color:var(--muted); line-height:1.35;}
.pf-form{align-items:flex-start;}
.pf-form > .btn{margin-top:20px; height:40px;}
.pf-ev .hint .link-sutil{display:inline; width:auto;}
#pfAviso{display:flex; align-items:center; gap:14px;}
#pfAviso[hidden]{display:none;}
#pfAviso button{background:none; border:0; color:inherit; font:inherit; font-weight:600; text-decoration:underline; text-underline-offset:3px; cursor:pointer; padding:0;}
.pf-card :focus-visible,.pf-kcard :focus-visible,.pf-form :focus-visible,.pf-tabela :focus-visible,#pfAviso :focus-visible,.pf-toggle:focus-visible{outline:2px solid var(--accent); outline-offset:2px;}
@media (max-width:760px){ .pf-kanban{grid-template-columns:1fr; overflow-x:visible;} .pf-kcol{min-height:0;} }
@media (prefers-reduced-motion:reduce){.pf-toggle::after{transition:none;}}
</style>
</head>"""

trocar("\n</head>", "\n" + CSS, "fim do <head>")
trocar('<div class="drawer" id="drawer"></div>', '<div class="drawer" id="drawer"></div>\n<div id="pfAviso" role="status" hidden></div>', "gaveta")

ini = h.index("const SECTIONS = [")
fim = h.index("];", ini) + 2
h = h[:ini] + """const SECTIONS = [
  {id:'visao',    titulo:'Visão geral',   sub:'Indicadores das perícias sob sua responsabilidade'},
  {id:'pericias', titulo:'Perícias',      sub:'Todas as perícias, com busca e filtros'},
  {id:'importar', titulo:'Importar processo', sub:'PROJUDI pela extensão, arquivo ZIP ou outros tribunais'},
  {id:'publicacoes', titulo:'Publicações', sub:'Diário de Justiça Eletrônico Nacional (DJEN)'},
  {id:'prazos',   titulo:'Prazos e alertas', sub:'Entregas por urgência e avisos antes do vencimento'},
  {id:'tarefas',  titulo:'Tarefas',       sub:'Quadro por etapa, ligado a cada perícia'},
  {id:'agenda',   titulo:'Agenda',        sub:'Diligências, vistorias, audiências e prazos'},
  {id:'financeiro', titulo:'Financeiro',  sub:'Honorários arbitrados, depositados e levantados'},
  {id:'calculos', titulo:'Cálculos',      sub:'Ferramentas periciais com memória de cálculo auditável'},
  {id:'proposta', titulo:'Proposta de honorários', sub:'Preenche o seu modelo com os dados da perícia escolhida'},
  {id:'docs',     titulo:'Documentos',    sub:'Índice de todos os documentos das perícias'},
  {id:'ia',       titulo:'Análise IA',    sub:'Leitura do processo pela IA: resumo, pontos de atenção, quesitos e prazos'},
  {id:'equipe',   titulo:'Equipe',        sub:'Quem tem acesso ao sistema e o que foi compartilhado'},
  {id:'projudi',  titulo:'Projudi',       sub:'Consulta processual no Tribunal de Justiça de Goiás'},
  {id:'integracoes', titulo:'Integrações', sub:'O que liga o PeríciaFlow aos tribunais e serviços'},
  {id:'privacidade', titulo:'Privacidade', sub:'Como os dados são guardados, quem vê e quais são os seus direitos'},
  {id:'config',   titulo:'Configurações', sub:'Seu cadastro, aparência e armazenamento'},
];""" + h[fim:]

trocar("const ICONS = {", """const ICONS = {
  importar:'<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
  publicacoes:'<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  tarefas:'<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  agenda:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  financeiro:'<path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3"/>',
  integracoes:'<path d="M9 7H5a2 2 0 00-2 2v6a2 2 0 002 2h4M15 7h4a2 2 0 012 2v6a2 2 0 01-2 2h-4M8 12h8"/>',""", "ícones")

old = "  else if(activeSection === 'projudi') view.innerHTML = renderProjudi();"
trocar(old, old + """
  else if(['importar','tarefas','agenda','financeiro'].includes(activeSection)){
    /* formulários: não redesenhar enquanto a pessoa digita */
    const foco = document.activeElement;
    if(!(foco && /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName) && view.contains(foco))){
      view.innerHTML = activeSection === 'importar' ? renderImportar() : activeSection === 'tarefas' ? renderTarefas()
        : activeSection === 'agenda' ? renderAgenda() : renderFinanceiro();
    }
  }
  else if(activeSection === 'publicacoes') view.innerHTML = renderPublicacoes();
  else if(activeSection === 'integracoes') view.innerHTML = renderIntegracoes();""", "despacho das telas")

old = "    docs: (() => { const n = todosDocumentos().length; return n ? `<span class=\"nav-badge\">${n}</span>` : ''; })(),"
trocar(old, old + "\n    tarefas: (() => { const n = pfTarefasAbertas().length; return n ? `<span class=\"nav-badge\">${n}</span>` : ''; })(),", "selos da navegação")

trocar("  return `<div class=\"section-gap\">${blocos}${concluido}</div>`;",
       "  return `<div class=\"section-gap\">${panel('alertas', 'Alertas de prazo', 'quando e por onde avisar', renderAlertasPainel())}${blocos}${concluido}</div>`;", "tela de prazos")
old = "      ${panel('entregas', 'Próximas entregas', 'perícias não concluídas',"
trocar(old, "      ${renderHoje()}\n" + old, "visão geral")

# ---------- barra lateral limpa + paleta de comandos (Ctrl K) ----------
FERR = RAIZ / "ferramentas"
barra_js = (FERR / "barra-lateral.js").read_text(encoding="utf-8")
barra_css = (FERR / "barra-lateral.css").read_text(encoding="utf-8")
barra_html = (FERR / "barra-lateral.html").read_text(encoding="utf-8").rstrip()
paleta_html = (FERR / "paleta.html").read_text(encoding="utf-8").rstrip()

ini = h.index('<aside class="sidebar" id="sidebar">')
fim = h.index("</aside>", ini) + len("</aside>")
aside = h[ini:fim]
b0 = aside.index('<div class="brand">')
b1 = aside.index("<div>", b0 + 10)  # depois da marca vem o bloco "Perfil"
marca = aside[b0:b1].strip()
h = h[:ini] + barra_html.replace("{MARCA}", marca) + h[fim:]

trocar('<div id="pfAviso" role="status" hidden></div>', '<div id="pfAviso" role="status" hidden></div>\n' + paleta_html, "paleta")
trocar("</style>\n</head>", barra_css + "</style>\n</head>", "estilo da barra")
for nome in ("renderNav", "renderPerfil", "renderAccount"):
    trocar(f"function {nome}(){{", f"function {nome}Original(){{", f"função {nome}")

alvo = "/* ========================================================================== */\naplicarRail();"
trocar(alvo, mod + "\n" + barra_js + "\n" + alvo, "inicialização")

(RAIZ / "novo").mkdir(exist_ok=True)
(RAIZ / "novo" / "index.html").write_text(h, encoding="utf-8")
print(f"novo/index.html montado ({len(h):,} bytes)")
