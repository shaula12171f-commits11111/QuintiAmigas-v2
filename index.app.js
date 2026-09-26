import {
  setNombreUsuario, iniciarChatLibre, iniciarChatLasCinco, iniciarHistoria, enviarMensaje,
  regenerarUltimaRespuesta, resetChat, volverAlSelector, getEstado, getResumenConversacion, textoMetaEstadoUI,
  getChicasDisponibles, exportarEstadoCompleto, restaurarEstadoCompleto
} from './src/core/logica.js';
import { ensureImagenesLoaded, getImagenSelector, getDescripcionChica } from './src/systems/imagenes.js';
import { getHistorias } from './src/stories/historias.js';
import {
  loadApiKeys, addApiKey, updateApiKey, removeApiKey,
  moveApiKeyUp, moveApiKeyDown, maskKey
} from './src/systems/apiKeys.js';

const $ = (id) => document.getElementById(id);
const screens = ['screen-name', 'screen-select', 'screen-modo', 'screen-chat'];
let chicaActual = null, busy = false;
/** Audios que están sonando ahora (pueden ser varios a la vez). */
let activeAudioEls = [];

function show(id) { screens.forEach((s) => $(s)?.classList.toggle('active', s === id)); }
function stopAllAudio() {
  for (const a of activeAudioEls) {
    try { a.pause(); a.currentTime = 0; } catch (_) {}
  }
  activeAudioEls = [];
  document.querySelectorAll('#msgs audio').forEach((a) => {
    try { a.pause(); a.currentTime = 0; } catch (_) {}
  });
}
/** Reproduce audios en secuencia (autoplay tras enviar mensaje = gesto de usuario). */
/** Reproduce varios audios a la VEZ (multi: cada chica suena en paralelo). */
async function playAudioParallel(audioEls) {
  stopAllAudio();
  const list = (audioEls || []).filter((au) => au && au.src);
  if (!list.length) return;
  activeAudioEls = list;
  await Promise.all(list.map(async (au) => {
    try {
      au.loop = false;
      au.currentTime = 0;
      await au.play();
    } catch (e) {
      console.warn('[Quinti] No se pudo autoplay audio:', e?.message || e);
    }
  }));
}

/** @deprecated nombre viejo — ahora suenan en paralelo */
async function playAudioSequence(audioEls) {
  return playAudioParallel(audioEls);
}
function actualizarMeta(r) {
  if (!r) r = getEstado();
  const a = (r.chicasActivas || [r.chica]).filter(Boolean).join(', ');
  let metaLine = '';
  try {
    if (typeof textoMetaEstadoUI === 'function') metaLine = textoMetaEstadoUI();
  } catch (_) {}
  if (!metaLine) {
    metaLine = `fase: ${r.fase || 'normal'} · relación: ${r.relacion || '—'}`;
  }
  if ($('chat-meta')) $('chat-meta').textContent = a ? `${a} · ${metaLine}` : metaLine;
  if ($('chat-who')) $('chat-who').textContent = a;
}
function fmtText(t) {
  return String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*([^*]+)\*/g,'<em>*$1*</em>');
}
function addUser(text) {
  const el = document.createElement('div'); el.className = 'msg user'; el.textContent = text;
  $('msgs')?.appendChild(el); if ($('msgs')) $('msgs').scrollTop = $('msgs').scrollHeight;
}
function addBotPart(part) {
  const el = document.createElement('div');
  el.className = 'msg bot' + (part.esEventoHistoria ? ' evento-historia' : '');
  const tag = document.createElement('div');
  tag.className = 'who-tag';
  tag.textContent = part.esEventoHistoria
    ? ((part.chica || 'Sistema') + ' · mensaje')
    : (part.chica || chicaActual || '');
  el.appendChild(tag);
  const body = document.createElement('div'); body.innerHTML = fmtText(part.texto); el.appendChild(body);
  if (part.imagenUrl) {
    const im = document.createElement('img');
    im.className = 'scene';
    im.src = part.imagenUrl;
    im.alt = part.descripcionImg || part.imagen_tag || '';
    el.appendChild(im);
  }
  if (part.descripcionImg) { const c = document.createElement('div'); c.className = 'cap'; c.textContent = part.descripcionImg; el.appendChild(c); }
  let audioEl = null;
  if (part.audioUrl) {
    const au = document.createElement('audio');
    au.controls = true;
    au.preload = 'auto';
    au.loop = false;
    au.src = part.audioUrl;
    el.appendChild(au);
    audioEl = au;
  }
  $('msgs')?.appendChild(el); if ($('msgs')) $('msgs').scrollTop = $('msgs').scrollHeight;
  return audioEl;
}

function openApiModal() { renderApiList(); $('api-overlay')?.classList.add('open'); }
function closeApiModal() { $('api-overlay')?.classList.remove('open'); }
function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function renderApiList() {
  const list = loadApiKeys(); const box = $('api-list'); if (!box) return;
  if (!list.length) { box.innerHTML = '<p class="api-empty">No hay keys. Agregá una abajo.</p>'; return; }
  box.innerHTML = '';
  list.forEach((item, idx) => {
    const el = document.createElement('div'); el.className = 'api-item';
    el.innerHTML = `<div class="row-top"><span class="orden">#${idx+1}</span> <span class="mask">${maskKey(item.key)}</span></div>
      <div class="note">${item.note ? '📝 '+escapeHtml(item.note) : 'Sin nota'}</div>
      <div class="actions">
        <button class="btn sm ghost" data-act="up" data-id="${item.id}">↑</button>
        <button class="btn sm ghost" data-act="down" data-id="${item.id}">↓</button>
        <button class="btn sm ghost" data-act="note" data-id="${item.id}">Nota</button>
        <button class="btn sm danger" data-act="del" data-id="${item.id}">Borrar</button></div>`;
    box.appendChild(el);
  });
  box.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-id'), act = btn.getAttribute('data-act');
      try {
        if (act==='up') moveApiKeyUp(id);
        if (act==='down') moveApiKeyDown(id);
        if (act==='del') { if (confirm('¿Borrar key?')) removeApiKey(id); }
        if (act==='note') {
          const cur = loadApiKeys().find(x=>x.id===id);
          const n = prompt('Nota (correo):', cur?.note||'');
          if (n!==null) updateApiKey(id,{note:n});
        }
        renderApiList();
      } catch(e) { alert(e.message||e); }
    };
  });
}

if ($('btn-api-cerrar')) $('btn-api-cerrar').onclick = closeApiModal;
if ($('api-overlay')) $('api-overlay').addEventListener('click', e => { if (e.target===$('api-overlay')) closeApiModal(); });
if ($('btn-apis-home')) $('btn-apis-home').onclick = openApiModal;
if ($('btn-apis-chat')) $('btn-apis-chat').onclick = openApiModal;
if ($('btn-api-toggle-show')) $('btn-api-toggle-show').onclick = () => {
  const inp = $('api-input-key'); if (!inp) return;
  inp.type = inp.type==='password' ? 'text' : 'password';
};
if ($('btn-api-add')) $('btn-api-add').onclick = () => {
  try {
    addApiKey(($('api-input-key')?.value||'').trim(), ($('api-input-note')?.value||'').trim());
    if ($('api-input-key')) $('api-input-key').value='';
    if ($('api-input-note')) $('api-input-note').value='';
    renderApiList();
  } catch(e) { alert(e.message||e); }
};

if ($('btn-nombre')) $('btn-nombre').onclick = () => {
  const n = ($('input-nombre')?.value||'').trim() || 'Fabrizio';
  setNombreUsuario(n);
  if ($('saludo-nombre')) $('saludo-nombre').textContent = `Hola, ${n}. Tocá una chica.`;
  show('screen-select');
};
$('input-nombre')?.addEventListener('keydown', e => { if (e.key==='Enter') $('btn-nombre')?.click(); });

await ensureImagenesLoaded().catch(()=>{});
const grid = $('grid-chicas');
if (grid) {
  for (const nombre of getChicasDisponibles()) {
    const card = document.createElement('div');
    card.className = 'card-chica';
    card.innerHTML = `<img src="${getImagenSelector(nombre)}" alt="${nombre}"/><div class="info"><strong>${nombre}</strong></div>`;
    card.onclick = () => {
      chicaActual = nombre;
      if ($('modo-nombre')) $('modo-nombre').textContent = nombre;
      if ($('modo-desc')) $('modo-desc').textContent = getDescripcionChica(nombre)||'';
      if ($('modo-avatar')) $('modo-avatar').src = getImagenSelector(nombre);
      const lista = $('lista-historias');
      if (lista) {
        lista.innerHTML = '';
        for (const h of (getHistorias(nombre)||[])) {
          const item = document.createElement('div');
          item.className = 'story-item';
          item.innerHTML = `<strong>${h.nombre||h.titulo||h.id}</strong><span>${h.descripcion||''}</span>`;
          item.onclick = async () => {
            chicaActual = nombre; $('msgs').innerHTML = ''; show('screen-chat');
            const r = await iniciarHistoria(nombre, h.id);
            const audioEls = [];
            if (r?.partes) {
              for (const p of r.partes) { const au = addBotPart(p); if (au) audioEls.push(au); }
            } else if (r?.texto) {
              const au = addBotPart({ chica: nombre, texto: r.texto, imagenUrl: r.imagenUrl, audioUrl: r.audioUrl, descripcionImg: r.descripcionImg, imagen_tag: r.imagen_tag });
              if (au) audioEls.push(au);
            }
            if (audioEls.length) playAudioSequence(audioEls);
            actualizarMeta(r||getEstado());
          };
          lista.appendChild(item);
        }
      }
      show('screen-modo');
    };
    grid.appendChild(card);
  }
}


if ($('btn-chat-las-5')) $('btn-chat-las-5').onclick = async () => {
  chicaActual = 'Nino';
  $('msgs').innerHTML = '';
  show('screen-chat');
  try {
    const r = await iniciarChatLasCinco();
    actualizarMeta(r || getEstado());
    if ($('chat-who')) $('chat-who').textContent = 'Las 5';
  } catch (e) {
    console.error(e);
    addBotPart({ chica: 'Sistema', texto: 'Error al iniciar chat de las 5: ' + e.message });
  }
};

if ($('btn-chat-libre')) $('btn-chat-libre').onclick = async () => {
  if (!chicaActual) return;
  $('msgs').innerHTML = ''; show('screen-chat');
  const r = await iniciarChatLibre(chicaActual);
  actualizarMeta(r||getEstado());
};
if ($('btn-volver-selector')) $('btn-volver-selector').onclick = () => show('screen-select');
if ($('btn-salir-chat')) $('btn-salir-chat').onclick = () => { stopAllAudio(); volverAlSelector(); show('screen-select'); };
if ($('btn-reset')) $('btn-reset').onclick = () => { if (confirm('¿Reset?')) { stopAllAudio(); resetChat(); $('msgs').innerHTML=''; } };

async function send() {
  if (busy) return;
  const input = $('input'); const text = (input?.value||'').trim(); if (!text) return;
  input.value = ''; addUser(text); busy = true; if ($('send')) $('send').disabled = true;
  try {
    const r = await enviarMensaje(text);
    const partes = r.partes || [{ chica: r.chica||chicaActual, texto: r.texto, imagenUrl: r.imagenUrl, audioUrl: r.audioUrl, descripcionImg: r.descripcionImg, imagen_tag: r.imagen_tag }];
    stopAllAudio();
    const audioEls = [];
    for (const p of partes) { const au = addBotPart(p); if (au) audioEls.push(au); }
    if (audioEls.length) playAudioSequence(audioEls);
    actualizarMeta(r);
  } catch (e) {
    console.error(e); addBotPart({ chica: 'Sistema', texto: 'Error: '+e.message });
  } finally { busy = false; if ($('send')) $('send').disabled = false; input?.focus(); }
}
if ($('send')) $('send').onclick = send;
$('input')?.addEventListener('keydown', e => { if (e.key==='Enter') send(); });
if ($('btn-refresh')) $('btn-refresh').onclick = async () => {
  if (busy) return; busy = true;
  try {
    const r = await regenerarUltimaRespuesta(); if (!r) return;
    const last = [...($('msgs')?.querySelectorAll('.msg.bot')||[])].pop(); if (last) last.remove();
    const partes = r.partes || [{ chica: r.chica||chicaActual, texto: r.texto, imagenUrl: r.imagenUrl, audioUrl: r.audioUrl, descripcionImg: r.descripcionImg, imagen_tag: r.imagen_tag }];
    stopAllAudio();
    const audioEls = [];
    for (const p of partes) { const au = addBotPart(p); if (au) audioEls.push(au); }
    if (audioEls.length) playAudioSequence(audioEls);
    actualizarMeta(r);
  } catch(e) { addBotPart({ chica:'Sistema', texto:'Error: '+e.message }); }
  finally { busy = false; }
};

// ── Memorias ──────────────────────────────────────────────
const MEM_KEY = 'quinti_memorias_v1';

function loadAllMemorias() {
  try { return JSON.parse(localStorage.getItem(MEM_KEY) || '{}'); }
  catch { return {}; }
}
function saveAllMemorias(all) {
  try { localStorage.setItem(MEM_KEY, JSON.stringify(all)); } catch (_) {}
}

function guardarMemoriaActual() {
  const st = getEstado();
  if (!st?.chica) {
    alert('No hay chat activo para guardar.');
    return;
  }
  const defaultName = `${st.chica} · ${new Date().toLocaleString('es')}`;
  const nombre = prompt('Nombre de la memoria:', defaultName);
  if (nombre === null) return;
  const nombreFinal = (nombre || '').trim() || defaultName;

  const msgs = [...($('msgs')?.querySelectorAll('.msg') || [])].map((el) => ({
    tipo: el.classList.contains('user') ? 'user' : 'bot',
    html: el.innerHTML
  }));

  const all = loadAllMemorias();
  if (!all[st.chica]) all[st.chica] = [];
  all[st.chica].unshift({
    id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    nombre: nombreFinal,
    fecha: Date.now(),
    estado: exportarEstadoCompleto(),
    mensajesVisuales: msgs
  });
  all[st.chica] = all[st.chica].slice(0, 30);
  saveAllMemorias(all);
  alert('Memoria guardada: ' + nombreFinal);
}

function cargarMemoria(chica, id) {
  const m = (loadAllMemorias()[chica] || []).find((x) => x.id === id);
  if (!m) {
    alert('Memoria no encontrada');
    return;
  }
  try {
    restaurarEstadoCompleto(m.estado);
  } catch (e) {
    console.error(e);
    alert('No se pudo restaurar el estado: ' + (e.message || e));
    return;
  }
  chicaActual = chica;
  if ($('msgs')) $('msgs').innerHTML = '';
  for (const msg of (m.mensajesVisuales || [])) {
    const el = document.createElement('div');
    el.className = 'msg ' + (msg.tipo === 'user' ? 'user' : 'bot');
    el.innerHTML = msg.html || '';
    $('msgs')?.appendChild(el);
  }
  if ($('msgs')) $('msgs').scrollTop = $('msgs').scrollHeight;
  show('screen-chat');
  actualizarMeta(getEstado());
  cerrarMemorias();
}

function eliminarMemoria(chica, id) {
  if (!confirm('¿Borrar esta memoria?')) return;
  const all = loadAllMemorias();
  all[chica] = (all[chica] || []).filter((x) => x.id !== id);
  saveAllMemorias(all);
  renderMemoriasPanel();
}

function renderMemoriasPanel() {
  const body = $('mem-body');
  if (!body) return;
  const all = loadAllMemorias();
  let html = '';
  let tiene = false;

  for (const chica of getChicasDisponibles()) {
    const lista = all[chica] || [];
    if (!lista.length) continue;
    tiene = true;
    html += `<div class="mem-chica-section"><h3 style="color:var(--gold);margin:12px 0 8px;border-bottom:1px solid var(--line-dim);padding-bottom:4px">${chica} (${lista.length})</h3>`;
    for (const m of lista) {
      const fechaStr = new Date(m.fecha).toLocaleString('es');
      const cant = (m.mensajesVisuales || []).length;
      const rel = m.estado?.relacion || '—';
      const fase = m.estado?.fase || '—';
      html += `
        <div class="mem-item">
          <div class="info">
            <strong>${escapeHtml(m.nombre)}</strong>
            <small>${fechaStr} · ${cant} msgs · fase: ${fase} · relación: ${rel}</small>
          </div>
          <div class="actions">
            <button class="btn sm" data-cargar="${chica}|${m.id}">Cargar</button>
            <button class="btn sm danger" data-borrar="${chica}|${m.id}">Borrar</button>
          </div>
        </div>`;
    }
    html += '</div>';
  }

  if (!tiene) {
    html = '<p class="mem-empty">No hay memorias guardadas todavía.<br>Entrá a un chat y tocá <strong>💾 Guardar</strong>.</p>';
  }
  body.innerHTML = html;

  body.querySelectorAll('[data-cargar]').forEach((btn) => {
    btn.onclick = () => {
      const [chica, id] = btn.getAttribute('data-cargar').split('|');
      cargarMemoria(chica, id);
    };
  });
  body.querySelectorAll('[data-borrar]').forEach((btn) => {
    btn.onclick = () => {
      const [chica, id] = btn.getAttribute('data-borrar').split('|');
      eliminarMemoria(chica, id);
    };
  });
}

function abrirMemorias() {
  renderMemoriasPanel();
  $('mem-overlay')?.classList.add('open');
}
function cerrarMemorias() {
  $('mem-overlay')?.classList.remove('open');
}


function abrirResumen() {
  const texto = (typeof getResumenConversacion === 'function' ? getResumenConversacion() : '') || (getEstado()?.resumenConversacion || '');
  const pre = $('resumen-texto');
  const vacio = $('resumen-vacio');
  if (pre) pre.textContent = texto || '';
  if (vacio) vacio.style.display = texto && texto.trim() ? 'none' : 'block';
  $('resumen-overlay')?.classList.add('open');
}
function cerrarResumen() {
  $('resumen-overlay')?.classList.remove('open');
}

if ($('btn-guardar-mem')) $('btn-guardar-mem').onclick = guardarMemoriaActual;
if ($('btn-memorias')) $('btn-memorias').onclick = abrirMemorias;
if ($('btn-cerrar-mem')) $('btn-cerrar-mem').onclick = cerrarMemorias;
if ($('btn-ver-resumen')) $('btn-ver-resumen').onclick = abrirResumen;
if ($('btn-cerrar-resumen')) $('btn-cerrar-resumen').onclick = cerrarResumen;
if ($('resumen-overlay')) {
  $('resumen-overlay').addEventListener('click', (e) => {
    if (e.target === $('resumen-overlay')) cerrarResumen();
  });
}

if ($('mem-overlay')) {
  $('mem-overlay').addEventListener('click', (e) => {
    if (e.target === $('mem-overlay')) cerrarMemorias();
  });
}

console.log('%c[Quinti] OK — APIs + audio + memorias', 'color:#34d399;font-weight:bold');
