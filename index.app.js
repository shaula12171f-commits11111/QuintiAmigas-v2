import {
  setNombreUsuario, iniciarChatLibre, iniciarHistoria, enviarMensaje,
  regenerarUltimaRespuesta, resetChat, volverAlSelector, getEstado,
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
let chicaActual = null, busy = false, activeAudioEl = null;

function show(id) { screens.forEach((s) => $(s)?.classList.toggle('active', s === id)); }
function stopAllAudio() {
  if (activeAudioEl) {
    try { activeAudioEl.pause(); activeAudioEl.currentTime = 0; } catch (_) {}
    activeAudioEl = null;
  }
  document.querySelectorAll('#msgs audio').forEach((a) => {
    try { a.pause(); a.currentTime = 0; } catch (_) {}
  });
}
/** Reproduce audios en secuencia (autoplay tras enviar mensaje = gesto de usuario). */
async function playAudioSequence(audioEls) {
  stopAllAudio();
  for (const au of audioEls) {
    if (!au || !au.src) continue;
    activeAudioEl = au;
    try {
      au.loop = false;
      au.currentTime = 0;
      await au.play();
      await new Promise((resolve) => {
        const done = () => { au.removeEventListener('ended', done); resolve(); };
        au.addEventListener('ended', done);
        setTimeout(resolve, 60000);
      });
    } catch (e) {
      console.warn('[Quinti] No se pudo autoplay audio:', e?.message || e);
    }
  }
}
function actualizarMeta(r) {
  if (!r) r = getEstado();
  const a = (r.chicasActivas || [r.chica]).join(', ');
  if ($('chat-meta')) $('chat-meta').textContent = `${a} · fase: ${r.fase || 'normal'} · relación: ${r.relacion || '—'}`;
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
  const el = document.createElement('div'); el.className = 'msg bot';
  const tag = document.createElement('div'); tag.className = 'who-tag'; tag.textContent = part.chica || chicaActual || '';
  el.appendChild(tag);
  const body = document.createElement('div'); body.innerHTML = fmtText(part.texto); el.appendChild(body);
  if (part.imagenUrl) { const im = document.createElement('img'); im.className = 'scene'; im.src = part.imagenUrl; el.appendChild(im); }
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
          item.innerHTML = `<strong>${h.titulo||h.id}</strong><span>${h.descripcion||''}</span>`;
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

if ($('btn-guardar-mem')) $('btn-guardar-mem').onclick = () => alert('Memorias: próxima versión compacta');
if ($('btn-memorias')) $('btn-memorias').onclick = () => $('mem-overlay')?.classList.add('open');
if ($('btn-cerrar-mem')) $('btn-cerrar-mem').onclick = () => $('mem-overlay')?.classList.remove('open');

console.log('%c[Quinti] OK — Entrar y APIs deberían funcionar', 'color:#34d399;font-weight:bold');
