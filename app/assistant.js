// Asistente de Iceman Sounds (por texto). Se carga desde djKELOKE.HTML con una línea.
// Reutiliza las funciones que ya existen en la página: api, token, reproducir, setVol, played, savePlayed, loadLib...
// No crea un segundo reproductor. Si algo falla aquí, la radio sigue igual.
(function () {
  'use strict';
  if (window.__asistente) return;
  window.__asistente = true;

  const $$ = (id) => document.getElementById(id);
  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);   // lee variables globales de la página (lib, busy, player...)
  const set = (n, v) => { try { (0, eval)(n + ' = ' + JSON.stringify(v)); } catch (e) {} };
  const SRV = () => (hay('SERVER') ? get('SERVER') : location.origin);

  // ---------- Estilos ----------
  const css = document.createElement('style');
  css.textContent = `
  #asBtn{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:60;width:56px;height:56px;border-radius:50%;padding:0;font-size:24px;background:var(--ac);color:#000;box-shadow:0 8px 28px #0008}
  #asPanel{position:fixed;left:0;right:0;bottom:0;z-index:70;max-width:440px;margin:0 auto;height:min(78vh,620px);display:flex;flex-direction:column;
    background:#12121cf2;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid #ffffff26;border-bottom:0;border-radius:24px 24px 0 0;
    box-shadow:0 -10px 40px #000a;transform:translateY(105%);transition:transform .28s ease;padding-bottom:env(safe-area-inset-bottom)}
  #asPanel.open{transform:none}
  #asHead{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px;font-weight:700}
  #asHead button{width:36px;height:36px;padding:0}
  #asMsgs{flex:1;overflow-y:auto;padding:6px 14px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}
  .asM{max-width:86%;padding:10px 14px;border-radius:18px;line-height:1.35;font-size:15px;white-space:pre-wrap;word-wrap:break-word}
  .asM.u{align-self:flex-end;background:var(--ac);color:#000;border-bottom-right-radius:6px}
  .asM.a{align-self:flex-start;background:#ffffff1c;border-bottom-left-radius:6px}
  .asM.n{align-self:center;background:none;color:var(--mu);font-size:13px;text-align:center}
  #asChips{display:flex;gap:8px;overflow-x:auto;padding:6px 14px}
  #asChips button{white-space:nowrap;font-size:13px;padding:8px 12px}
  #asForm{display:flex;gap:8px;padding:8px 14px 12px}
  #asIn{flex:1;font-size:16px;color:var(--tx);background:#ffffff1f;border:1px solid #ffffff22;border-radius:999px;padding:11px 16px;outline:none}
  #asForm button{width:46px;height:46px;padding:0}`;
  document.head.append(css);

  // ---------- Interfaz ----------
  const btn = document.createElement('button');
  btn.id = 'asBtn'; btn.title = 'Asistente'; btn.textContent = '💬'; btn.hidden = true;
  const panel = document.createElement('div');
  panel.id = 'asPanel';
  panel.innerHTML = `<div id="asHead"><span>🧊 Asistente</span><button type="button" id="asX" aria-label="Cerrar">✕</button></div>
    <div id="asMsgs"></div><div id="asChips"></div>
    <form id="asForm" autocomplete="off"><input id="asIn" placeholder="Pídeme música o controla la radio…" maxlength="300"><button class="p" id="asSend" type="submit" aria-label="Enviar">➤</button></form>`;
  document.body.append(btn, panel);

  const msgs = $$('asMsgs'), input = $$('asIn'), send = $$('asSend');
  const SUGERENCIAS = ['Ponme algo para estudiar', 'Reggaetón', 'Algo tranquilo para la noche', 'Lo que más me gusta', 'Lo último que guardé', 'Más fuerte', 'Salta esta'];
  SUGERENCIAS.forEach((s) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = s;
    b.onclick = () => enviar(s); $$('asChips').append(b);
  });

  let historial = [];
  const burbuja = (cls, texto) => {
    const d = document.createElement('div'); d.className = 'asM ' + cls; d.textContent = texto;
    msgs.append(d); msgs.scrollTop = msgs.scrollHeight; return d;
  };
  const abrir = (v) => {
    panel.classList.toggle('open', v);
    btn.hidden = v || !localStorage.at;
    if (v) { if (!msgs.children.length) burbuja('a', 'Hola, soy tu asistente. Dime qué te apetece escuchar o qué quieres hacer con la radio.'); setTimeout(() => input.focus(), 300); }
  };
  btn.onclick = () => abrir(true);
  $$('asX').onclick = () => abrir(false);
  setInterval(() => { if (!panel.classList.contains('open')) btn.hidden = !localStorage.at || ($$('app') && $$('app').hidden); }, 1000);

  // ---------- Utilidades de música ----------
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const mezclar = (a) => [...a].sort(() => Math.random() - 0.5);
  const unicas = (a) => [...new Map(a.map((t) => [t.uri, t])).values()];
  const esTema = (t) => t && t.uri && t.uri.startsWith('spotify:track:');
  const authH = async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await get('token')()) });

  async function buscar(q, paginas) {
    const out = [];
    for (let i = 0; i < paginas; i++) {
      const r = await get('api')('/search?type=track&limit=10&offset=' + i * 10 + '&q=' + encodeURIComponent(q));
      out.push(...((r && r.tracks && r.tracks.items) || []).filter(esTema));
    }
    return unicas(out);
  }

  async function biblioteca() {
    if (hay('lib') && get('lib')) return get('lib');
    let l = hay('cachedLib') ? get('cachedLib')() : null;
    if (!l || !Object.values(l).flat().length) { burbuja('n', 'Leyendo tu música, un momento…'); l = await get('loadLib')(); }
    window.__tmpLib = l;                                  // la guardamos también en la variable `lib` de la radio
    try { (0, eval)('lib = window.__tmpLib'); } catch (e) {}
    return l;
  }
  const noVistas = (tracks) => {
    const v = hay('played') ? get('played')() : new Set();
    return tracks.filter((t) => !v.has(t.uri));
  };

  async function tocar(tracks) {
    const uris = unicas(tracks).map((t) => t.uri).slice(0, 12);
    if (!uris.length) throw new Error('No encontré canciones para eso.');
    if (hay('busy') && get('busy')) throw new Error('El DJ está hablando, prueba en unos segundos.');
    try { if (hay('player') && get('player') && get('player').activateElement) await get('player').activateElement(); } catch (e) {}
    window.__directo = true;                    // lo has pedido tú: el perfil no lo modifica
    try { await get('reproducir')(uris); } finally { window.__directo = false; }
    if (hay('played') && hay('savePlayed')) { const v = get('played')(); uris.forEach((u) => v.add(u)); get('savePlayed')(v); }
    // al acabar la lista, la radio (el DJ) continúa sola
    set('lastUri', uris[uris.length - 1]);
    set('started', true);
    return uris.length;
  }

  // ---------- Ejecutor de acciones (lista cerrada, ya validada por el servidor) ----------
  const EJECUTAR = {
    async play_artist(a) {
      const quiero = norm(a.artist);
      let t = (await buscar('artist:"' + a.artist + '"', 2)).filter((x) => x.artists.some((ar) => norm(ar.name) === quiero || norm(ar.name).includes(quiero)));
      if (!t.length) t = (await buscar(a.artist, 2)).filter((x) => x.artists.some((ar) => norm(ar.name).includes(quiero)));
      const n = await tocar(mezclar(t).slice(0, 10)); return `Poniendo ${a.artist} (${n} canciones)`;
    },
    async play_song(a) {
      const t = await buscar(a.query, 1);
      if (!t.length) throw new Error('No encontré esa canción.');
      await tocar(t.slice(0, 1)); return `Poniendo ${t[0].name} de ${t[0].artists[0].name}`;
    },
    async play_vibe(a) {
      const L = await biblioteca();
      const pool = mezclar(noVistas(unicas(Object.values(L).flat()))).slice(0, 150);
      if (pool.length < 5) throw new Error('Aún no tengo suficiente música tuya cargada.');
      const r = await fetch(SRV() + '/assistant/pick', { method: 'POST', headers: await authH(), body: JSON.stringify({ descripcion: a.description, n: 8, canciones: pool.map((t) => t.name + ' - ' + t.artists[0].name) }) });
      if (!r.ok) throw new Error('No pude elegir canciones ahora.');
      const { indices } = await r.json();
      await tocar(indices.map((i) => pool[i]).filter(Boolean)); return `Música para: ${a.description}`;
    },
    async play_genre(a) {
      const L = await biblioteca();
      const t = mezclar(noVistas(unicas(Object.values(L).flat()).filter((x) => x.g === a.genre))).slice(0, 8);
      if (!t.length) throw new Error('No tengo canciones tuyas de ese estilo sin escuchar.');
      await tocar(t); return `Poniendo ${a.genre}`;
    },
    async play_source(a) {
      const L = await biblioteca();
      const t = mezclar(noVistas(L[a.source] || [])).slice(0, 8);
      if (!t.length) throw new Error('No tengo canciones nuevas en esa categoría.');
      await tocar(t); return 'Listo';
    },
    async play_favorites() {
      const t = window.IcemanPerfil ? window.IcemanPerfil.favoritas(8) : [];
      if (!t.length) throw new Error('Aún no sé cuáles son tus favoritas. Escucha, salta y dale al ♥ un poco más.');
      await tocar(t); return 'Tus favoritas del momento';
    },
    async skip() { $$('next').click(); return 'Siguiente'; },
    async previous() { $$('prev').click(); return 'Anterior'; },
    async pause() { await get('api')('/me/player/pause', { method: 'PUT' }); return 'Pausado'; },
    async resume() { await get('api')('/me/player/play', { method: 'PUT' }); return 'Reanudado'; },
    async ban_current() { $$('ban').click(); return 'No volverá a sonar'; },
    async volume(a) {
      if (hay('setVol')) { get('setVol')(a.level); if ($$('vol')) $$('vol').value = a.level; }
      return 'Volumen al ' + a.level + '%';
    }
  };

  window.IcemanAsistente = { tocar, buscar, norm, mezclar };   // lo reutilizan los módulos (bloque de artista)

  async function sonando() {
    try {
      if (hay('player') && get('player') && get('player').getCurrentState) {
        const s = await get('player').getCurrentState();
        if (s) { const t = s.track_window.current_track; return { titulo: t.name, artista: t.artists.map((a) => a.name).join(', ') }; }
      }
    } catch (e) {}
    return null;
  }

  // ---------- Envío ----------
  let ocupado = false;
  async function enviar(texto) {
    texto = (texto || '').trim();
    if (!texto || ocupado) return;
    ocupado = true; send.disabled = true; input.value = '';
    burbuja('u', texto);
    const espera = burbuja('a', '…');
    try {
      const r = await fetch(SRV() + '/assistant', { method: 'POST', headers: await authH(), body: JSON.stringify({ mensaje: texto, historial, ahora: await sonando() }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
      espera.textContent = d.reply || 'Hecho.';
      historial.push({ rol: 'user', texto }, { rol: 'assistant', texto: d.reply || '' });
      historial = historial.slice(-8);
      for (const a of d.actions || []) {
        try { const nota = await EJECUTAR[a.action](a); if (nota) burbuja('n', '✓ ' + nota); }
        catch (e) { burbuja('n', '⚠️ ' + String(e.message).replace(/^\d{3} /, '').slice(0, 160)); }
      }
    } catch (e) {
      espera.textContent = 'No pude responder ahora: ' + e.message;
    } finally { ocupado = false; send.disabled = false; msgs.scrollTop = msgs.scrollHeight; }
  }
  $$('asForm').onsubmit = (e) => { e.preventDefault(); enviar(input.value); };

  // Módulos adicionales (modo móvil y perfil de gustos). Si no cargan, el asistente sigue funcionando.
  // (movil.js va primero: en móvil sustituye el reproductor, y el perfil debe engancharse al definitivo)
  ['tema.js', 'movil.js', 'afro.js', 'profile.js', 'dj.js', 'conciertos.js', 'artista.js', 'mini.js'].forEach((f) => { const s = document.createElement('script'); s.async = false; s.src = SRV() + '/app/' + f; document.body.append(s); });
})();
