/* ==========================================================================
   Telas novas (protótipo aprovado → app): Importar processo, Publicações,
   Tarefas, Agenda, Financeiro, Integrações e alertas de prazo.

   Os dados novos ficam DENTRO da perícia (mesmo documento do Firestore):
     tarefas:      [{id, titulo, col:'fazer'|'fazendo'|'feito', prio:'alta'|'media'|'baixa', ate}]
     compromissos: [{id, data, hora, titulo, local, tipo:'diligencia'|'audiencia'|'reuniao'|'outro'}]
     honorariosDepositados: número (o que já está depositado em juízo)
   Assim funciona no Firebase e no modo local, sem coleção nova nem regra nova.
   Partes que dependem de servidor (DJEN, e-mail, DataJud) aparecem como "a conectar".
   ========================================================================== */
const PF_TAREFA_COLS = [['fazer','A fazer'], ['fazendo','Em andamento'], ['feito','Feito']];
const PF_PRIO = {alta:'Alta', media:'Média', baixa:'Baixa'};
const PF_TIPO_COMP = {diligencia:'Diligência', audiencia:'Audiência', reuniao:'Reunião', outro:'Compromisso'};
const pfNovoId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pfEditaveis = () => casosVisiveis('todas').filter(c => podeEditar(c));
const pfOpcoesCasos = (sel) => pfEditaveis().map(c => `<option value="${c.id}" ${sel===c.id?'selected':''}>${escapeHtml(c.codigo)} · ${escapeHtml(c.nome)}</option>`).join('');
const pfEscolhaCaso = (sel) => `<option value="" ${sel ? '' : 'selected'} disabled>Escolha a perícia</option>` + pfOpcoesCasos(sel);
function pfQuando(iso){
  const n = diasAte(iso);
  if(n === null) return '';
  if(n < 0) return `${-n} dia${n===-1?'':'s'} em atraso`;
  if(n === 0) return 'hoje';
  if(n === 1) return 'amanhã';
  return `em ${n} dias`;
}
function pfPillData(iso, final){
  if(final) return `<span class="pill pill-success">feito</span>`;
  const n = diasAte(iso);
  if(n === null) return '';
  const cls = n < 0 ? 'pill-danger' : n <= 3 ? 'pill-danger' : n <= 7 ? 'pill-warning' : 'pill-muted';
  return `<span class="pill ${cls}">${pfQuando(iso)}</span>`;
}
function pfAviso(texto, desfazer){
  const el = document.getElementById('pfAviso');
  if(!el) return;
  el.innerHTML = '';
  el.append(texto);
  if(desfazer){
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Desfazer';
    b.onclick = async () => { el.hidden = true; await desfazer(); };
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(pfAviso.t); pfAviso.t = setTimeout(() => { el.hidden = true; }, desfazer ? 7000 : 3200);
}

/* ---------- Tarefas (quadro) ---------- */
function pfTodasTarefas(){
  const out = [];
  casosVisiveis('todas').forEach(c => (c.tarefas || []).forEach(t => out.push({...t, casoId:c.id, caso:c})));
  return out;
}
const pfTarefasAbertas = () => pfTodasTarefas().filter(t => t.col !== 'feito');

async function pfSalvarTarefas(casoId, transformar){
  const c = casos.find(x => x.id === casoId);
  if(!c || !podeEditar(c)) return;
  await saveCaso(casoId, {tarefas: transformar([...(c.tarefas || [])])});
  renderAll();
}
async function pfAddTarefa(ev){
  ev.preventDefault();
  const f = ev.target;
  const titulo = f.titulo.value.trim();
  if(!titulo || !f.caso.value){ pfAviso('Escreva a tarefa e escolha a perícia.'); return; }
  await pfSalvarTarefas(f.caso.value, l => [...l, {id:pfNovoId('t'), titulo, col:'fazer', prio:f.prio.value, ate:f.ate.value || ''}]);
  pfAviso('Tarefa criada.');
}
function pfMoverTarefa(casoId, id, col){ return pfSalvarTarefas(casoId, l => l.map(t => t.id === id ? {...t, col} : t)); }
function pfPassoTarefa(casoId, id, delta){
  const c = casos.find(x => x.id === casoId); const t = c && (c.tarefas || []).find(x => x.id === id);
  if(!t) return;
  const i = PF_TAREFA_COLS.findIndex(x => x[0] === t.col);
  const j = Math.max(0, Math.min(PF_TAREFA_COLS.length - 1, i + delta));
  if(i !== j) pfMoverTarefa(casoId, id, PF_TAREFA_COLS[j][0]);
}
async function pfApagarTarefa(casoId, id){
  const c = casos.find(x => x.id === casoId);
  const lista = c ? [...(c.tarefas || [])] : [];
  const t = lista.find(x => x.id === id);
  await pfSalvarTarefas(casoId, l => l.filter(x => x.id !== id));
  if(t) pfAviso('Tarefa apagada.', () => pfSalvarTarefas(casoId, () => lista));
}
function pfSoltar(ev, col){
  ev.preventDefault();
  ev.currentTarget.classList.remove('over');
  const [casoId, id] = (ev.dataTransfer.getData('text/plain') || '').split('|');
  if(casoId && id) pfMoverTarefa(casoId, id, col);
}

function renderTarefas(){
  const todas = pfTodasTarefas();
  const editaveis = pfEditaveis();
  const ordemPrio = {alta:0, media:1, baixa:2};
  const form = editaveis.length ? `
    <form class="pf-form" onsubmit="pfAddTarefa(event)">
      <label class="pf-campo pf-largo"><span>Tarefa</span><input name="titulo" id="pfTarefaTitulo" placeholder="Ex.: responder quesitos" required></label>
      <label class="pf-campo pf-largo"><span>Perícia</span><select name="caso" id="pfTarefaCaso" required>${pfEscolhaCaso(drawerCasoId)}</select></label>
      <label class="pf-campo"><span>Prioridade</span><select name="prio" id="pfTarefaPrio"><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></label>
      <label class="pf-campo"><span>Até</span><input type="date" name="ate" id="pfTarefaAte"></label>
      <button class="btn btn-primary" type="submit">Adicionar</button>
    </form>` : `<div class="chart-empty">Crie uma perícia para começar a organizar as tarefas.</div>`;
  const colunas = PF_TAREFA_COLS.map(([k, rotulo], ci) => {
    const lista = todas.filter(t => (t.col || 'fazer') === k)
      .sort((a, b) => (ordemPrio[a.prio] ?? 1) - (ordemPrio[b.prio] ?? 1) || (a.ate || '9').localeCompare(b.ate || '9'));
    return `<div class="pf-kcol" data-col="${k}" ondragover="event.preventDefault(); this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="pfSoltar(event,'${k}')">
      <h5>${rotulo}<span>${lista.length}</span></h5>
      ${lista.map(t => `
        <div class="pf-kcard" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${t.casoId}|${t.id}')">
          <div class="pf-krow"><span class="pf-prio ${t.prio || 'media'}" title="prioridade ${PF_PRIO[t.prio] || 'Média'}"></span><b>${escapeHtml(t.titulo)}</b></div>
          <div class="pf-krow pf-kmeta"><button class="link-sutil mono" onclick="openDrawer('${t.casoId}')">${escapeHtml(t.caso.codigo)}</button><span style="flex:1"></span>${t.ate ? pfPillData(t.ate, k === 'feito') : ''}</div>
          <div class="pf-krow pf-kacoes">
            ${ci > 0 ? `<button class="btn btn-ghost btn-sm" onclick="pfPassoTarefa('${t.casoId}','${t.id}',-1)" aria-label="Voltar" title="Voltar para ${PF_TAREFA_COLS[ci-1][1]}">←</button>` : ''}
            ${ci < 2 ? `<button class="btn btn-ghost btn-sm" onclick="pfPassoTarefa('${t.casoId}','${t.id}',1)" aria-label="Avançar" title="Mover para ${PF_TAREFA_COLS[ci+1][1]}">→</button>` : ''}
            <span style="flex:1"></span>
            <button class="btn btn-ghost btn-sm" onclick="pfApagarTarefa('${t.casoId}','${t.id}')">Apagar</button>
          </div>
        </div>`).join('') || `<div class="pf-vazio">${['Nenhuma tarefa por fazer. Crie a próxima no formulário acima.', 'Arraste para cá a tarefa que você começar.', 'As tarefas concluídas aparecem aqui.'][ci]}</div>`}
    </div>`;
  }).join('');
  return `<div class="section-gap">
    ${panel('tarefasNova', 'Nova tarefa', 'fica ligada à perícia', form)}
    <div class="pf-kanban">${colunas}</div>
  </div>`;
}

/* ---------- Agenda (compromissos + prazos de entrega) ---------- */
function pfEventos(){
  const ev = [];
  casosVisiveis('todas').forEach(c => {
    (c.compromissos || []).forEach(m => ev.push({...m, casoId:c.id, caso:c, origem:'compromisso'}));
    if(c.prazoEntrega && !(STATUS[c.statusCaso] || {}).final) ev.push({id:'prazo-'+c.id, data:c.prazoEntrega, hora:'', titulo:'Entrega do laudo', local:c.vara || '', tipo:'prazo', casoId:c.id, caso:c, origem:'prazo'});
  });
  return ev.sort((a, b) => (a.data + (a.hora || '99')).localeCompare(b.data + (b.hora || '99')));
}
async function pfAddCompromisso(ev){
  ev.preventDefault();
  const f = ev.target;
  const c = casos.find(x => x.id === f.caso.value);
  if(!c || !f.titulo.value.trim() || !f.data.value){ pfAviso('Preencha o que é, a data e a perícia.'); return; }
  await saveCaso(c.id, {compromissos: [...(c.compromissos || []), {id:pfNovoId('m'), titulo:f.titulo.value.trim(), data:f.data.value, hora:f.hora.value || '', local:f.local.value.trim(), tipo:f.tipo.value}]});
  renderAll();
  pfAviso('Compromisso salvo.');
}
async function pfApagarCompromisso(casoId, id){
  const c = casos.find(x => x.id === casoId);
  if(!c || !podeEditar(c)) return;
  const lista = [...(c.compromissos || [])];
  await saveCaso(casoId, {compromissos: lista.filter(m => m.id !== id)});
  renderAll();
  pfAviso('Compromisso apagado.', async () => { await saveCaso(casoId, {compromissos: lista}); renderAll(); });
}
// Arquivo .ics: abre no Google Agenda, Outlook e celular.
function pfBaixarIcs(){
  const ev = pfEventos().filter(e => diasAte(e.data) >= -1);
  const esc = (s) => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const carimbo = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PericiaFlow//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:PeríciaFlow', 'X-WR-TIMEZONE:America/Sao_Paulo'];
  ev.forEach(e => {
    const d = e.data.replace(/-/g, '');
    linhas.push('BEGIN:VEVENT', `UID:${e.id}-${e.casoId}@periciaflow`, `DTSTAMP:${carimbo}`);
    if(e.hora){
      const [h, m] = e.hora.split(':');
      const fimH = String(Math.min(23, +h + 1)).padStart(2, '0');
      linhas.push(`DTSTART;TZID=America/Sao_Paulo:${d}T${h}${m}00`, `DTEND;TZID=America/Sao_Paulo:${d}T${fimH}${m}00`);
    } else {
      const dt = new Date(e.data + 'T12:00:00'); dt.setDate(dt.getDate() + 1);
      linhas.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${dt.toISOString().slice(0, 10).replace(/-/g, '')}`);
    }
    linhas.push(`SUMMARY:${esc((e.tipo === 'prazo' ? 'PRAZO: ' : '') + e.titulo + ' — ' + e.caso.codigo)}`);
    if(e.local) linhas.push(`LOCATION:${esc(e.local)}`);
    linhas.push(`DESCRIPTION:${esc(e.caso.nome + (e.caso.numeroProcesso ? ' · Processo ' + e.caso.numeroProcesso : ''))}`, 'END:VEVENT');
  });
  linhas.push('END:VCALENDAR');
  const blob = new Blob([linhas.join('\r\n')], {type:'text/calendar;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'periciaflow-agenda.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  pfAviso(`${ev.length} compromisso(s) exportado(s).`);
}
function renderAgenda(){
  const ev = pfEventos();
  const futuros = ev.filter(e => diasAte(e.data) >= 0);
  const passados = ev.filter(e => diasAte(e.data) < 0 && e.origem === 'compromisso').slice(-10).reverse();
  const sem = ['dom','seg','ter','qua','qui','sex','sáb'];
  const porDia = {};
  futuros.forEach(e => (porDia[e.data] = porDia[e.data] || []).push(e));
  const pillTipo = {prazo:'pill-danger', audiencia:'pill-warning', diligencia:'pill-accent', reuniao:'pill-muted', outro:'pill-muted'};
  const linha = (e) => `<div class="pf-ev">
      <time class="mono">${e.hora || '—'}</time>
      <div style="flex:1; min-width:0;">
        <b>${escapeHtml(e.titulo)}</b> <span class="pill ${pillTipo[e.tipo] || 'pill-muted'}">${e.tipo === 'prazo' ? 'Prazo' : PF_TIPO_COMP[e.tipo] || 'Compromisso'}</span>
        <div class="hint"><button class="link-sutil mono" onclick="openDrawer('${e.casoId}')">${escapeHtml(e.caso.codigo)}</button>${e.local ? ' · ' + escapeHtml(e.local) : ''}</div>
      </div>
      ${e.origem === 'compromisso' && podeEditar(e.caso) ? `<button class="btn btn-ghost btn-sm" onclick="pfApagarCompromisso('${e.casoId}','${e.id}')">Apagar</button>` : ''}
    </div>`;
  const lista = Object.keys(porDia).length ? Object.entries(porDia).map(([d, itens]) => {
      const dt = new Date(d + 'T12:00:00');
      return `<div class="pf-dia"><div class="pf-dia-d"><b>${dt.getDate()}</b><small>${sem[dt.getDay()]}, ${dt.toLocaleDateString('pt-BR', {month:'short'}).replace('.', '')}</small></div><div>${itens.map(linha).join('')}</div></div>`;
    }).join('') : `<div class="chart-empty">Nenhum compromisso pela frente.</div>`;
  const form = pfEditaveis().length ? `
    <form class="pf-form" onsubmit="pfAddCompromisso(event)">
      <label class="pf-campo pf-largo"><span>O que é</span><input name="titulo" id="pfCompTitulo" placeholder="Ex.: diligência na sede da empresa" required></label>
      <label class="pf-campo"><span>Tipo</span><select name="tipo" id="pfCompTipo">${Object.entries(PF_TIPO_COMP).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="pf-campo"><span>Data</span><input type="date" name="data" id="pfCompData" required></label>
      <label class="pf-campo"><span>Hora</span><input type="time" name="hora" id="pfCompHora"></label>
      <label class="pf-campo pf-largo"><span>Local</span><input name="local" id="pfCompLocal" placeholder="Endereço ou sala"></label>
      <label class="pf-campo"><span>Perícia</span><select name="caso" id="pfCompCaso" required>${pfEscolhaCaso(drawerCasoId)}</select></label>
      <button class="btn btn-primary" type="submit">Salvar</button>
    </form>` : `<div class="chart-empty">Crie uma perícia para agendar compromissos.</div>`;
  return `<div class="section-gap">
    <div class="pf-card">
      <div class="pf-linha"><div style="flex:1; min-width:0;"><b>Levar para o Google Agenda ou o celular</b>
        <div class="hint">Baixe o arquivo .ics com os compromissos e os prazos de entrega e abra no Google Agenda (Configurações → Importar) ou no celular. A sincronização automática com o Google é a próxima etapa.</div></div>
        <button class="btn btn-ghost" onclick="pfBaixarIcs()">Baixar agenda (.ics)</button></div>
    </div>
    ${panel('agendaNovo', 'Novo compromisso', 'vistoria, audiência, reunião', form)}
    ${panel('agendaLista', 'Próximos compromissos', `${futuros.length} na agenda`, lista)}
    ${passados.length ? panel('agendaPassados', 'Já aconteceram', 'últimos 10', passados.map(linha).join('')) : ''}
  </div>`;
}

/* ---------- Financeiro ---------- */
function pfFin(c){
  const arbitrado = +c.honorarios || 0;
  const levantado = +c.valorRecebido || 0;
  const depositado = Math.max(+c.honorariosDepositados || 0, levantado);
  return {arbitrado, depositado, levantado, semDeposito: Math.max(0, arbitrado - depositado), aLevantar: Math.max(0, depositado - levantado)};
}
async function pfSalvarDepositado(casoId, valor){
  const c = casos.find(x => x.id === casoId);
  if(!c || !podeEditar(c)) return;
  const v = Math.max(0, parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) || 0);
  await saveCaso(casoId, {honorariosDepositados: v});
  renderAll();
  pfAviso('Valor depositado atualizado.');
}
function renderFinanceiro(){
  const base = casosVisiveis().filter(c => (+c.honorarios || 0) > 0 || (+c.valorRecebido || 0) > 0);
  const tot = base.reduce((s, c) => { const f = pfFin(c); Object.keys(f).forEach(k => s[k] = (s[k] || 0) + f[k]); return s; }, {});
  const linhas = base.sort((a, b) => pfFin(b).semDeposito - pfFin(a).semDeposito).map(c => {
    const f = pfFin(c);
    const pct = (v) => f.arbitrado ? Math.min(100, Math.round(100 * v / f.arbitrado)) : 0;
    return `<tr>
      <td><button class="link-sutil" onclick="openDrawer('${c.id}')"><b>${escapeHtml(c.nome)}</b></button><div class="hint mono">${escapeHtml(c.codigo)}</div></td>
      <td style="min-width:140px;"><div class="pf-fin-bar" title="levantado ${pct(f.levantado)}% · depositado ${pct(f.depositado)}%"><i class="lev" style="width:${pct(f.levantado)}%"></i><i class="dep" style="width:${pct(f.depositado) - pct(f.levantado)}%"></i></div></td>
      <td class="n">${fmtMoney(f.arbitrado)}</td>
      <td class="n">${podeEditar(c) ? `<input class="pf-num" id="pfDep-${c.id}" inputmode="decimal" value="${f.depositado ? f.depositado.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}) : ''}" placeholder="0,00" onchange="pfSalvarDepositado('${c.id}', this.value)" aria-label="Depositado em juízo">` : fmtMoney(f.depositado)}</td>
      <td class="n">${fmtMoney(f.levantado)}</td>
    </tr>`;
  }).join('');
  return `<div class="section-gap">
    <div class="kpis">
      <div class="kpi"><div class="k">Arbitrado</div><div class="v">${fmtMoney(tot.arbitrado)}</div><div class="sub">${base.length} perícia${base.length === 1 ? '' : 's'} com honorários</div></div>
      <div class="kpi tone-accent"><div class="k">Depositado em juízo</div><div class="v">${fmtMoney(tot.aLevantar)}</div><div class="sub">aguardando alvará</div></div>
      <div class="kpi tone-ok"><div class="k">Levantado</div><div class="v">${fmtMoney(tot.levantado)}</div><div class="sub">já recebido</div></div>
      <div class="kpi ${tot.semDeposito ? 'tone-danger' : ''}"><div class="k">Sem depósito</div><div class="v">${fmtMoney(tot.semDeposito)}</div><div class="sub">cobrar nos autos</div></div>
    </div>
    ${panel('finTabela', 'Honorários por perícia', 'verde: levantado · cor do tema: depositado', base.length ? `
      <div class="pf-tabela"><table>
        <thead><tr><th>Perícia</th><th>Andamento</th><th class="n">Arbitrado</th><th class="n">Depositado</th><th class="n">Levantado</th></tr></thead>
        <tbody>${linhas}</tbody></table></div>
      <div class="hint" style="margin-top:10px;">Arbitrado e levantado vêm dos campos "Honorários" e "Recebido" de cada perícia. O depositado você atualiza aqui, quando sair a guia de depósito.</div>`
      : `<div class="chart-empty">Nenhuma perícia com honorários preenchidos ainda.</div>`)}
  </div>`;
}

/* ---------- Importar processo ---------- */
let pfOrigemImport = 'projudi';
function pfSetOrigem(o){ pfOrigemImport = o; renderAll(); }
async function pfImportarProjudi(ev){
  ev.preventDefault();
  const f = ev.target;
  const numero = f.numero.value.trim();
  if(numero.replace(/\D/g, '').length !== 20){ pfAviso('Use o número CNJ completo, com 20 dígitos.'); return; }
  let casoId = f.destino.value;
  if(casoId === 'novo'){
    if(!possoCriar()){ pfAviso('Confirme o seu e-mail para criar perícias.'); return; }
    const dono = meuEmail();
    casoId = await criarCaso({dono, emails:[dono], editores:[dono], compartilhamentos:[], codigo: nextCodigo(), nome:`Processo ${numero}`,
      numeroProcesso:numero, codigoAcesso:f.codigo.value.trim(), vara:'', comarca:'', partes:'', dataNomeacao: todayIso(), prazoEntrega: todayIso(),
      honorarios:0, valorRecebido:0, statusCaso:'em_andamento', observacoes:[], origem:'projudi'});
  } else if(f.codigo.value.trim()){
    await saveCaso(casoId, {codigoAcesso: f.codigo.value.trim()});
  }
  openDrawer(casoId);
  pjBaixarAutos(casoId);
}
function pfAtualizarDestino(input){
  const dig = input.value.replace(/\D/g, '');
  const sel = document.getElementById('pfImpDestino');
  if(!sel || dig.length !== 20) return;
  const igual = pfEditaveis().find(c => (c.numeroProcesso || '').replace(/\D/g, '') === dig);
  sel.value = igual ? igual.id : 'novo';
  const cod = document.getElementById('pfImpCodigo');
  if(igual && cod && !cod.value && igual.codigoAcesso) cod.value = igual.codigoAcesso;
}
function pfImportarZip(input){
  const sel = document.getElementById('pfZipDestino');
  const casoId = sel && sel.value;
  if(!casoId || !input.files[0]){ pfAviso('Escolha a perícia e o arquivo ZIP.'); return; }
  openDrawer(casoId);
  handleZipImport(casoId, input);
}
function renderImportar(){
  const abas = [['projudi', 'PROJUDI (TJGO)'], ['zip', 'Arquivo ZIP'], ['datajud', 'Outros tribunais (DataJud)']];
  const ext = PJ.versao ? (pjVersaoOk() ? `<span class="pill pill-success">extensão v${escapeHtml(PJ.versao)}</span>` : `<span class="pill pill-warning">atualize a extensão</span>`) : `<span class="pill pill-warning">extensão não encontrada</span>`;
  let corpo = '';
  if(pfOrigemImport === 'projudi'){
    corpo = `<div class="pf-card">
      <div class="pf-linha"><b style="flex:1">Baixar os autos do PROJUDI</b>${ext}</div>
      <p class="hint" style="margin:0;">Com o código de acesso, a consulta é pública e não precisa de login. Sem o código, a extensão usa o seu login no PROJUDI (certificado digital ou CPF e senha, digitados por você no site do tribunal). Os PDFs chegam um a um, separados por movimentação, sem repetir os que já estão na perícia.</p>
      <form class="pf-form" onsubmit="pfImportarProjudi(event)">
        <label class="pf-campo pf-largo"><span>Número do processo (CNJ)</span><input name="numero" id="pfImpNumero" class="mono" placeholder="0000000-00.0000.8.09.0000" oninput="pfAtualizarDestino(this)" required></label>
        <label class="pf-campo"><span>Código de acesso <i style="font-style:normal; opacity:.75;">(opcional)</i></span><input name="codigo" id="pfImpCodigo" class="mono" autocomplete="off" spellcheck="false" placeholder="Ex.: Ab12Cd34" aria-describedby="pfImpCodigoDica"><small id="pfImpCodigoDica">Digite como está no documento: maiúsculas e minúsculas contam.</small></label>
        <label class="pf-campo pf-largo"><span>Guardar em</span><select name="destino" id="pfImpDestino"><option value="novo">Nova perícia</option>${pfOpcoesCasos()}</select></label>
        <button class="btn btn-primary" type="submit" ${PJ.versao ? '' : 'disabled'}>Baixar autos</button>
      </form>
      ${PJ.versao ? '' : `<div class="banner">${svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>')}<span>Instale a extensão PROJUDI PDFs neste navegador e recarregue a página.</span></div>`}
    </div>`;
  } else if(pfOrigemImport === 'zip'){
    corpo = `<div class="pf-card">
      <b>Importar um ZIP de documentos</b>
      <p class="hint" style="margin:0;">Cada pasta do ZIP vira uma fase, e a data vem do nome do arquivo. Serve para o ZIP baixado pela extensão ou montado à mão.</p>
      ${pfEditaveis().length ? `<div class="pf-form">
        <label class="pf-campo pf-largo"><span>Perícia</span><select id="pfZipDestino">${pfOpcoesCasos(drawerCasoId)}</select></label>
        <input type="file" id="pfZipArquivo" accept=".zip" hidden onchange="pfImportarZip(this)">
        <button class="btn btn-primary" type="button" onclick="document.getElementById('pfZipArquivo').click()">Escolher ZIP</button>
      </div>` : `<div class="chart-empty">Crie uma perícia primeiro.</div>`}
    </div>`;
  } else {
    corpo = `<div class="pf-card">
      <div class="pf-linha"><b style="flex:1">Buscar pelo número em qualquer tribunal</b><span class="pill pill-muted">a conectar</span></div>
      <p class="hint" style="margin:0;">A API pública do DataJud (CNJ) traz capa e movimentações de qualquer tribunal pelo número, mas não os PDFs. Ela precisa de um pequeno servidor intermediário, porque o navegador não pode chamá-la direto. Está na próxima etapa.</p>
    </div>`;
  }
  return `<div class="section-gap">
    <div class="chips">${abas.map(([k, l]) => `<button class="chip ${pfOrigemImport === k ? 'active' : ''}" onclick="pfSetOrigem('${k}')">${l}</button>`).join('')}</div>
    ${corpo}
  </div>`;
}

/* ---------- Publicações (DJEN) ---------- */
function renderPublicacoes(){
  const numeros = casosVisiveis().filter(c => c.numeroProcesso && !(STATUS[c.statusCaso] || {}).final);
  return `<div class="section-gap">
    <div class="pf-card">
      <div class="pf-linha"><b style="flex:1">Diário de Justiça Eletrônico Nacional (DJEN)</b><span class="pill pill-muted">a conectar</span></div>
      <p class="hint" style="margin:0;">Quando estiver ligado, o PeríciaFlow vai conferir o DJEN toda manhã pelo seu nome e pelos números das suas perícias. Nomeações novas viram perícias, e intimações viram tarefas com prazo. Isso depende de um servidor que rode mesmo com o app fechado, e ele está na próxima etapa.</p>
      <div class="pf-linha"><a class="btn btn-ghost" href="https://comunica.pje.jus.br/" target="_blank" rel="noopener">Consultar o DJEN agora</a></div>
    </div>
    ${panel('pubMonitorar', 'O que será monitorado', `${numeros.length} processo${numeros.length === 1 ? '' : 's'} em andamento`, numeros.length
      ? `<div class="rows">${numeros.map(c => `<div class="row-item" onclick="openDrawer('${c.id}')"><div class="row-main"><div class="row-title">${escapeHtml(c.nome)}</div><div class="row-sub"><span class="mono">${escapeHtml(c.numeroProcesso)}</span> · ${escapeHtml(c.vara || 'vara não informada')}</div></div></div>`).join('')}</div>`
      : `<div class="chart-empty">Nenhuma perícia em andamento com número de processo.</div>`)}
  </div>`;
}

/* ---------- Alertas de prazo ---------- */
const PF_ALERTA_PADRAO = {dias:[7, 3, 1, 0], navegador:false};
function pfAlertas(){ try{ return {...PF_ALERTA_PADRAO, ...JSON.parse(localStorage.getItem('pf_alertas') || '{}')}; }catch(e){ return {...PF_ALERTA_PADRAO}; } }
function pfSalvarAlertas(cfg){ try{ localStorage.setItem('pf_alertas', JSON.stringify(cfg)); }catch(e){} renderAll(); }
function pfAlternarDia(d){
  const cfg = pfAlertas();
  cfg.dias = cfg.dias.includes(d) ? cfg.dias.filter(x => x !== d) : [...cfg.dias, d].sort((a, b) => b - a);
  pfSalvarAlertas(cfg);
}
async function pfAlternarNavegador(){
  const cfg = pfAlertas();
  if(!cfg.navegador){
    if(!('Notification' in window)){ pfAviso('Este navegador não mostra notificações.'); return; }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if(p !== 'granted'){ pfAviso('O navegador não autorizou as notificações. Libere nas configurações do site.'); return; }
  }
  cfg.navegador = !cfg.navegador;
  pfSalvarAlertas(cfg);
  if(cfg.navegador) pfVerificarAlertas(true);
}
// Avisa no navegador os prazos que caem nos dias escolhidos (uma vez por prazo e por dia).
function pfVerificarAlertas(forcar){
  const cfg = pfAlertas();
  if(!cfg.navegador || !('Notification' in window) || Notification.permission !== 'granted') return 0;
  let enviados = {};
  try{ enviados = JSON.parse(localStorage.getItem('pf_alertas_enviados') || '{}'); }catch(e){}
  const hoje = todayIso();
  let n = 0;
  const avisar = (chave, titulo, corpo, casoId) => {
    if(enviados[chave] === hoje && !forcar) return;
    enviados[chave] = hoje; n++;
    try{
      const no = new Notification(titulo, {body: corpo, tag: chave});
      no.onclick = () => { window.focus(); if(casoId) openDrawer(casoId); };
    }catch(e){}
  };
  casosVisiveis().forEach(c => {
    if((STATUS[c.statusCaso] || {}).final || !c.prazoEntrega) return;
    const d = diasAte(c.prazoEntrega);
    if(cfg.dias.includes(d) || d < 0) avisar(`prazo-${c.id}-${c.prazoEntrega}`, d < 0 ? 'Prazo vencido' : d === 0 ? 'Prazo vence hoje' : `Prazo em ${d} dia${d === 1 ? '' : 's'}`, `${c.codigo} · ${c.nome}`, c.id);
  });
  pfTarefasAbertas().forEach(t => {
    if(!t.ate) return;
    const d = diasAte(t.ate);
    if(d === 0 || d === 1 || d < 0) avisar(`tarefa-${t.id}-${t.ate}`, d < 0 ? 'Tarefa atrasada' : d === 0 ? 'Tarefa para hoje' : 'Tarefa para amanhã', `${t.titulo} · ${t.caso.codigo}`, t.casoId);
  });
  try{ localStorage.setItem('pf_alertas_enviados', JSON.stringify(enviados)); }catch(e){}
  return n;
}
function renderAlertasPainel(){
  const cfg = pfAlertas();
  const perm = 'Notification' in window ? Notification.permission : 'indisponivel';
  return `<div class="pf-grid2">
    <div class="pf-card">
      <b>Quando avisar</b>
      <div class="chips" role="group" aria-label="Dias de antecedência">${[15, 7, 3, 1, 0].map(d => `<button class="chip ${cfg.dias.includes(d) ? 'active' : ''}" aria-pressed="${cfg.dias.includes(d)}" onclick="pfAlternarDia(${d})">${d === 0 ? 'No dia' : d + (d === 1 ? ' dia' : ' dias')}</button>`).join('')}</div>
      <div class="hint">Dias antes do vencimento. Prazos vencidos são sempre avisados.</div>
    </div>
    <div class="pf-card">
      <b>Por onde avisar</b>
      <div class="pf-linha"><button class="pf-toggle" id="pfAlertaNav" aria-pressed="${cfg.navegador}" aria-label="Notificações neste navegador" onclick="pfAlternarNavegador()"></button>
        <div><b style="font-size:13px;">Notificações neste navegador</b><div class="hint">${perm === 'denied' ? 'bloqueadas nas configurações do site' : 'enquanto o PeríciaFlow estiver aberto'}</div></div></div>
      <div class="pf-linha"><button class="pf-toggle" disabled aria-pressed="false" aria-label="E-mail diário"></button>
        <div><b style="font-size:13px;">E-mail diário às 7h</b> <span class="pill pill-muted">a conectar</span><div class="hint">avisa mesmo com o app fechado</div></div></div>
    </div>
  </div>`;
}

/* ---------- Integrações ---------- */
function renderIntegracoes(){
  const st = (ok, txt) => `<span class="pf-st ${ok === true ? 'ok' : ok === false ? 'falta' : 'parcial'}">${txt}</span>`;
  const iaOk = typeof iaPronta === 'function' ? !!iaPronta() : false;
  const L = [
    ['Extensão PROJUDI PDFs', PJ.versao ? (pjVersaoOk() ? st(true, 'v' + escapeHtml(PJ.versao) + ' instalada') : st(null, 'atualize para ' + PJ_VERSAO_MINIMA)) : st(false, 'não encontrada neste navegador'),
      'Baixa os autos do PROJUDI pelo código de acesso ou com o seu login e entrega os PDFs um a um, sem duplicar.', `<button class="btn btn-ghost btn-sm" onclick="setSection('importar')">Importar processo</button>`],
    ['Conta e armazenamento', usingDb ? st(true, 'sincronizando na nuvem') : st(null, 'só neste navegador'),
      'Perícias, documentos, tarefas e agenda ficam na sua conta (Firebase) e acompanham você em qualquer dispositivo.', ''],
    ['Análise por IA (Gemini)', iaOk ? st(true, 'configurada') : st(null, 'falta a chave'),
      'Resumo do processo, pontos de atenção, quesitos e prazos, com a sua própria chave.', `<button class="btn btn-ghost btn-sm" onclick="setSection('ia')">Abrir</button>`],
    ['Agenda (.ics)', st(true, 'disponível'), 'Exporta compromissos e prazos para o Google Agenda, Outlook ou celular.', `<button class="btn btn-ghost btn-sm" onclick="setSection('agenda')">Abrir</button>`],
    ['Notificações do navegador', pfAlertas().navegador ? st(true, 'ligadas') : st(null, 'desligadas'), 'Avisos de prazo e de tarefas enquanto o app está aberto.', `<button class="btn btn-ghost btn-sm" onclick="setSection('prazos')">Configurar</button>`],
    ['DJEN (publicações)', st(false, 'a conectar'), 'Nomeações e intimações conferidas toda manhã.', ''],
    ['DataJud (outros tribunais)', st(false, 'a conectar'), 'Capa e movimentações de qualquer tribunal pelo número.', ''],
    ['E-mail diário', st(false, 'a conectar'), 'Avisos de prazo às 7h, mesmo com o app fechado.', ''],
  ];
  return `<div class="section-gap">
    <div class="banner banner-info">${svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>')}<span>Só o PROJUDI precisa da extensão, porque depende do seu login. DJEN, DataJud e e-mail vão rodar num pequeno servidor, que é a próxima etapa.</span></div>
    <div class="pf-grid3">${L.map(([n, s, d, acao]) => `<div class="pf-card"><b>${n}</b>${s}<p class="hint" style="margin:0;">${d}</p>${acao ? `<div>${acao}</div>` : ''}</div>`).join('')}</div>
  </div>`;
}

/* ---------- Painel: "hoje e próximos dias" na Visão geral ---------- */
function renderHoje(){
  const tarefas = pfTarefasAbertas().filter(t => t.ate && diasAte(t.ate) <= 3).sort((a, b) => a.ate.localeCompare(b.ate)).slice(0, 6);
  const comp = pfEventos().filter(e => e.origem === 'compromisso' && diasAte(e.data) >= 0 && diasAte(e.data) <= 7).slice(0, 6);
  if(!tarefas.length && !comp.length) return '';
  const item = (titulo, sub, iso, casoId) => `<div class="row-item" onclick="openDrawer('${casoId}')"><div class="row-main"><div class="row-title">${escapeHtml(titulo)}</div><div class="row-sub">${sub}</div></div><div class="row-side">${pfPillData(iso)}</div></div>`;
  return `<div class="pf-grid2">
    ${panel('hojeTarefas', 'Tarefas que vencem logo', `${pfTarefasAbertas().length} aberta${pfTarefasAbertas().length === 1 ? '' : 's'}`, tarefas.length ? `<div class="rows">${tarefas.map(t => item(t.titulo, `<span class="mono">${escapeHtml(t.caso.codigo)}</span> · prioridade ${PF_PRIO[t.prio] || 'Média'}`, t.ate, t.casoId)).join('')}</div>` : `<div class="chart-empty">Nenhuma tarefa vencendo.</div>`)}
    ${panel('hojeAgenda', 'Agenda da semana', 'próximos 7 dias', comp.length ? `<div class="rows">${comp.map(e => item(e.titulo, `${e.hora || 'dia todo'} · <span class="mono">${escapeHtml(e.caso.codigo)}</span>${e.local ? ' · ' + escapeHtml(e.local) : ''}`, e.data, e.casoId)).join('')}</div>` : `<div class="chart-empty">Nada agendado na semana.</div>`)}
  </div>`;
}

// confere os alertas ao abrir e a cada hora
setTimeout(() => pfVerificarAlertas(false), 4000);
setInterval(() => pfVerificarAlertas(false), 60 * 60 * 1000);
