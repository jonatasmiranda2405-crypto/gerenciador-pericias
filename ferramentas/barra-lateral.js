/* ==========================================================================
   Barra lateral limpa + paleta de comandos (Ctrl/⌘ K)
   - Dia a dia sempre à vista; o resto em grupos que abrem e fecham (o app lembra).
   - Selos só quando pedem ação: prazos atrasados e tarefas vencendo.
   - Rodapé compacto: quem está usando, se sincroniza, tema e sair.
   - Paleta: telas, perícias (código, nome ou número) e ações, sem tirar a mão do teclado.
   ========================================================================== */
const PF_NAV = [
  {id:null,        itens:['visao','pericias','prazos','tarefas','agenda']},
  {id:'processos', titulo:'Processos',        itens:['importar','publicacoes','docs']},
  {id:'producao',  titulo:'Produção técnica', itens:['calculos','proposta','ia']},
  {id:'escritorio',titulo:'Escritório',       itens:['financeiro','equipe']},
  {id:'sistema',   titulo:'Sistema',          itens:['integracoes','projudi','privacidade','config'], fechado:true},
];
function pfGruposAbertos(){
  let salvo = {};
  try{ salvo = JSON.parse(localStorage.getItem('pf_nav_grupos') || '{}'); }catch(e){}
  const abertos = {};
  PF_NAV.forEach(g => { if(g.id) abertos[g.id] = g.id in salvo ? salvo[g.id] : !g.fechado; });
  return abertos;
}
function pfAlternarGrupo(id){
  const abertos = pfGruposAbertos();
  abertos[id] = !abertos[id];
  try{ localStorage.setItem('pf_nav_grupos', JSON.stringify(abertos)); }catch(e){}
  renderNav();
}

let pfIndTopo = null; // posição anterior do destaque, para ele deslizar
function renderNav(){
  const base = casosVisiveis();
  const atrasadas = base.filter(c => prazoState(c) === 'atrasada').length;
  const tarefasUrgentes = pfTarefasAbertas().filter(t => t.ate && diasAte(t.ate) <= 0).length;
  const selos = {
    prazos: atrasadas ? `<span class="nav-badge alert" title="${atrasadas} prazo(s) vencido(s)">${atrasadas}</span>` : '',
    tarefas: tarefasUrgentes ? `<span class="nav-badge warn" title="${tarefasUrgentes} tarefa(s) para hoje ou atrasada(s)">${tarefasUrgentes}</span>` : '',
  };
  const abertos = pfGruposAbertos();
  const item = (id) => {
    const s = SECTIONS.find(x => x.id === id);
    if(!s) return '';
    return `<button class="nav-item ${activeSection === id ? 'active' : ''}" data-sec="${id}" onclick="setSection('${id}')" title="${escapeHtml(s.titulo)}" ${activeSection === id ? 'aria-current="page"' : ''}>
      ${svg(ICONS[id] || ICONS.docs)}<span>${escapeHtml(s.titulo)}</span>${selos[id] || ''}</button>`;
  };
  const html = PF_NAV.map(g => {
    if(!g.id) return `<div class="pf-grupo-itens">${g.itens.map(item).join('')}</div>`;
    const temAtivo = g.itens.includes(activeSection);
    const aberto = abertos[g.id] || temAtivo;
    const alerta = !aberto && g.itens.some(i => selos[i]);
    return `<div class="pf-grupo ${aberto ? 'aberto' : ''}">
      <button class="pf-grupo-tit" onclick="pfAlternarGrupo('${g.id}')" aria-expanded="${aberto}" aria-controls="pfg-${g.id}">
        <span>${g.titulo}</span>${alerta ? '<i class="pf-ponto" aria-label="tem pendências"></i>' : ''}
        ${svg('<path d="M9 6l6 6-6 6"/>', 'class="pf-chev"')}
      </button>
      <div class="pf-grupo-corpo" id="pfg-${g.id}"><div class="pf-grupo-itens">${g.itens.map(item).join('')}</div></div>
    </div>`;
  }).join('');
  const nav = document.getElementById('nav');
  nav.innerHTML = `<span class="pf-ind" aria-hidden="true"></span>${html}`;
  requestAnimationFrame(() => pfPosicionarInd(true));
  pfObservarNav(nav);
}

// Destaque deslizante: anima ao trocar de tela; ao mudar o tamanho da barra, só acompanha.
function pfPosicionarInd(animar){
  const nav = document.getElementById('nav');
  const ind = nav && nav.querySelector('.pf-ind');
  const ativo = nav && nav.querySelector('.nav-item.active');
  if(!ind) return;
  if(!ativo || !ativo.offsetParent || getComputedStyle(ativo).visibility === 'hidden'){ ind.style.opacity = 0; return; }
  const topo = ativo.offsetTop, alt = ativo.offsetHeight;
  const deslizar = animar && pfIndTopo !== null && pfIndTopo !== topo;
  ind.style.transition = 'none';
  if(deslizar){ ind.style.transform = `translateY(${pfIndTopo}px)`; void ind.offsetHeight; ind.style.transition = ''; }
  ind.style.transform = `translateY(${topo}px)`; ind.style.height = alt + 'px'; ind.style.opacity = 1;
  if(!deslizar) requestAnimationFrame(() => { ind.style.transition = ''; });
  pfIndTopo = topo;
}
let pfNavObs = null;
function pfObservarNav(nav){
  if(pfNavObs || typeof ResizeObserver === 'undefined') return;
  pfNavObs = new ResizeObserver(() => pfPosicionarInd(false));
  pfNavObs.observe(nav);
  // a abertura/fechamento dos grupos é animada: acompanha até o fim
  nav.addEventListener('transitionend', (e) => { if(e.target.classList && e.target.classList.contains('pf-grupo-corpo')) pfPosicionarInd(false); });
}

/* ---------- rodapé: quem está usando ---------- */
function renderPerfil(){
  const el = document.getElementById('perfil');
  if(!el) return;
  const email = meuEmail();
  const m = membroDe(email);
  const foto = currentUser && currentUser.photoURL;
  const nome = email ? m.nome : 'Sem conta conectada';
  el.innerHTML = `<button class="pf-quem ${activeSection === 'equipe' ? 'active' : ''}" onclick="setSection('equipe')" title="${escapeHtml(email || 'Sem conta conectada')}">
      ${avatarMembro(m, 30, foto)}
      <span class="pf-quem-txt"><b>${escapeHtml(nome)}</b><span><i class="account-dot ${currentUser ? 'on' : ''}"></i>${currentUser ? 'Sincronizado' : 'Dados só neste navegador'}</span></span>
    </button>`;
}
function renderAccount(){
  const btn = document.getElementById('authBtn');
  if(!btn) return;
  if(currentUser){
    btn.className = 'icon-btn pf-sair';
    btn.innerHTML = svg('<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H4"/>');
    btn.title = 'Sair da conta'; btn.setAttribute('aria-label', 'Sair da conta');
    btn.onclick = signOutGoogle;
  } else {
    btn.className = 'btn btn-primary btn-sm pf-entrar';
    btn.textContent = 'Entrar com Google';
    btn.title = ''; btn.removeAttribute('aria-label');
    btn.onclick = signInGoogle;
  }
  renderPerfil();
}

/* ---------- paleta de comandos ---------- */
const pfPal = {aberta:false, itens:[], sel:0};
function pfAbrirPaleta(){
  if(pfPal.aberta) return;
  pfPal.aberta = true; pfPal.sel = 0;
  const el = document.getElementById('pfPaleta');
  el.hidden = false;
  document.body.classList.add('pf-paleta-on');
  const inp = document.getElementById('pfPalInput');
  inp.value = '';
  inp.focus(); // já visível: foco imediato para não perder as primeiras letras
  pfFiltrarPaleta('');
}
function pfFecharPaleta(){
  if(!pfPal.aberta) return;
  pfPal.aberta = false;
  document.getElementById('pfPaleta').hidden = true;
  document.body.classList.remove('pf-paleta-on');
}
function pfOpcoesPaleta(){
  const telas = SECTIONS.map(s => ({grupo:'Ir para', titulo:s.titulo, sub:s.sub, icone:ICONS[s.id] || ICONS.docs, busca:s.titulo + ' ' + s.sub, fazer:() => setSection(s.id)}));
  const pericias = casosVisiveis('todas').map(c => ({grupo:'Perícias', titulo:c.nome, sub:[c.codigo, c.numeroProcesso, c.vara].filter(Boolean).join(' · '),
    icone:ICONS.pericias, busca:[c.codigo, c.nome, c.numeroProcesso, (c.numeroProcesso || '').replace(/\D/g, ''), c.partes, c.vara].join(' '), fazer:() => openDrawer(c.id)}));
  const acoes = [
    possoCriar() && {grupo:'Ações', titulo:'Nova perícia', sub:'cria e abre para preencher', icone:'<path d="M12 5v14M5 12h14"/>', busca:'nova pericia criar adicionar', fazer:() => { setSection('pericias'); novaPericia(); }},
    {grupo:'Ações', titulo:'Baixar autos do PROJUDI', sub:'pelo código de acesso ou com o seu login', icone:ICONS.importar, busca:'baixar autos projudi importar processo pdf', fazer:() => { pfOrigemImport = 'projudi'; setSection('importar'); setTimeout(() => { const i = document.getElementById('pfImpNumero'); if(i) i.focus(); }, 50); }},
    {grupo:'Ações', titulo:'Nova tarefa', sub:'no quadro de tarefas', icone:ICONS.tarefas, busca:'nova tarefa adicionar fazer', fazer:() => { setSection('tarefas'); setTimeout(() => { const i = document.getElementById('pfTarefaTitulo'); if(i) i.focus(); }, 50); }},
    {grupo:'Ações', titulo:'Novo compromisso', sub:'diligência, audiência ou reunião', icone:ICONS.agenda, busca:'novo compromisso agenda diligencia audiencia vistoria reuniao', fazer:() => { setSection('agenda'); setTimeout(() => { const i = document.getElementById('pfCompTitulo'); if(i) i.focus(); }, 50); }},
    {grupo:'Ações', titulo:'Alternar tema claro/escuro', sub:'', icone:'<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>', busca:'tema escuro claro modo noturno', fazer:() => toggleTheme()},
  ].filter(Boolean);
  return {telas, pericias, acoes};
}
function pfFiltrarPaleta(q){
  const {telas, pericias, acoes} = pfOpcoesPaleta();
  const termos = normalizeText(q).split(/\s+/).filter(Boolean);
  const casa = (o) => { const t = normalizeText(o.busca + ' ' + o.titulo); return termos.every(p => t.includes(p)); };
  let lista;
  if(!termos.length){
    const recentes = pericias.slice(-4).reverse();
    lista = [...acoes.slice(0, 4), ...recentes, ...telas.slice(0, 6)];
  } else {
    lista = [...telas.filter(casa).slice(0, 5), ...pericias.filter(casa).slice(0, 8), ...acoes.filter(casa).slice(0, 4)];
  }
  pfPal.itens = lista; pfPal.sel = 0;
  const box = document.getElementById('pfPalLista');
  if(!lista.length){ box.innerHTML = `<div class="pf-pal-vazio">Nada encontrado para “${escapeHtml(q)}”. Tente o número do processo ou o nome das partes.</div>`; return; }
  let grupo = '';
  box.innerHTML = lista.map((o, i) => {
    const cab = o.grupo !== grupo ? `<div class="pf-pal-grupo">${termos.length || o.grupo !== 'Perícias' ? o.grupo : 'Perícias recentes'}</div>` : '';
    grupo = o.grupo;
    return `${cab}<button class="pf-pal-item ${i === 0 ? 'sel' : ''}" role="option" aria-selected="${i === 0}" data-i="${i}" onmousemove="pfMarcarPaleta(${i})" onclick="pfExecutarPaleta(${i})">
      ${svg(o.icone)}<span class="pf-pal-txt"><b>${escapeHtml(o.titulo)}</b>${o.sub ? `<span>${escapeHtml(o.sub)}</span>` : ''}</span></button>`;
  }).join('');
}
function pfMarcarPaleta(i){
  if(i === pfPal.sel) return;
  pfPal.sel = i;
  document.querySelectorAll('.pf-pal-item').forEach(b => { const on = +b.dataset.i === i; b.classList.toggle('sel', on); b.setAttribute('aria-selected', on); });
  const atual = document.querySelector('.pf-pal-item.sel');
  if(atual) atual.scrollIntoView({block:'nearest'});
}
function pfExecutarPaleta(i){
  const o = pfPal.itens[i];
  pfFecharPaleta();
  if(o) o.fazer();
}
document.addEventListener('keydown', (e) => {
  const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') || (document.activeElement || {}).isContentEditable;
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); pfPal.aberta ? pfFecharPaleta() : pfAbrirPaleta(); return; }
  if(!pfPal.aberta){ if(e.key === '/' && !digitando){ e.preventDefault(); pfAbrirPaleta(); } return; }
  if(e.key === 'Escape'){ e.preventDefault(); pfFecharPaleta(); }
  else if(e.key === 'ArrowDown'){ e.preventDefault(); pfMarcarPaleta(Math.min(pfPal.itens.length - 1, pfPal.sel + 1)); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); pfMarcarPaleta(Math.max(0, pfPal.sel - 1)); }
  else if(e.key === 'Enter'){ e.preventDefault(); pfExecutarPaleta(pfPal.sel); }
});
// atalho certo para o sistema (⌘ no Mac)
setTimeout(() => { const k = document.getElementById('pfAtalho'); if(k && /Mac|iPhone|iPad/.test(navigator.platform)) k.textContent = '⌘K'; }, 0);
