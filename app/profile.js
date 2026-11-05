// Perfil de gustos de Iceman Sounds (Fase 2).
// Aprende SOLO de lo que haces dentro de la app: canciones escuchadas enteras, saltos, vetos (🚫) y "me gusta" (♥).
// Todo se guarda en este dispositivo (localStorage), por usuario de Spotify. No se envía a ningún servidor ni a Claude.
// Lo usa para: evitar artistas que descartas, dar un poco más de peso a los que disfrutas y mostrarte tu perfil real.
(function () {
  'use strict';
  if (window.__perfil) return;
  window.__perfil = true;

  // ---------- Acceso a las variables de la radio (globales de la página) ----------
  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const asignar = (n, expr) => { try { (0, eval)(n + ' = ' + expr); } catch (e) {} };
  const $$ = (id) => document.getElementById(id);
  const LS = localStorage;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const mezclar = (a) => [...a].sort(() => Math.random() - 0.5);

  // ---------- Datos ----------
  const MEDIA_VIDA = 60 * 864e5;           // los gustos pesan la mitad cada 60 días
  const UMBRAL_EVITAR = -4, UMBRAL_FAV = 3;
  const vacio = () => ({ v: 1, art: {}, gen: {}, likes: {}, st: { esc: 0, salt: 0, veta: 0, like: 0, seg: 0, evit: 0, afin: 0 } });
  const clave = () => 'perfil_' + (LS.perfil_uid || 'anon');
  let P = vacio();
  const cargar = () => { try { const p = JSON.parse(LS[clave()]); if (p && p.v === 1) return p; } catch (e) {} return vacio(); };
  const guardar = () => { try { const j = JSON.stringify(P); LS[clave()] = j; respaldo(clave(), j); } catch (e) {} };
  // Copia de seguridad en IndexedDB: la radio hace LS.clear() si Spotify da un error de login, y no queremos perder tu perfil por eso
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('iceman', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function respaldo(k, v) { try { (await idb()).transaction('k', 'readwrite').objectStore('k').put(v, k); } catch (e) {} }
  async function restaurar(k) { try { const d = await idb(); return await new Promise((res) => { const q = d.transaction('k').objectStore('k').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } }
  const efectivo = (e) => (e ? e.s * Math.pow(0.5, (Date.now() - e.u) / MEDIA_VIDA) : 0);
  const puntos = (artista) => efectivo(P.art[norm(artista)]);

  function sumar(artista, pts, g) {
    if (!artista) return;
    const k = norm(artista); if (!k) return;
    const e = P.art[k] || (P.art[k] = { n: artista, s: 0, c: 0, u: Date.now() });
    e.s = efectivo(e) + pts; e.u = Date.now(); e.c++;
    if (g) P.gen[g] = (P.gen[g] || 0) * 0.98 + pts;
    const ks = Object.keys(P.art);
    if (ks.length > 400) ks.sort((a, b) => Math.abs(efectivo(P.art[a])) - Math.abs(efectivo(P.art[b]))).slice(0, ks.length - 400).forEach((x) => delete P.art[x]);
    guardar();
  }

  // ---------- Identificar al usuario (para no mezclar perfiles en el mismo navegador) ----------
  async function identificar() {
    try {
      for (let i = 0; i < 40 && !(hay('api') && LS.at); i++) await new Promise((r) => setTimeout(r, 500));
      if (!LS.perfil_uid || LS.perfil_tok !== LS.rt) {
        const me = await get('api')('/me');
        if (me && me.id) { LS.perfil_uid = me.id; LS.perfil_tok = LS.rt || ''; }
      }
    } catch (e) { /* si falla, se usa el perfil "anon" de este navegador */ }
    if (!LS[clave()]) { const r = await restaurar(clave()); if (r) LS[clave()] = r; }
    P = cargar();
  }

  // ---------- Biblioteca (para saber el estilo de cada canción y elegir sustitutas) ----------
  let mapaL = null, mapa = new Map();
  function biblioteca() {
    let L = null;
    try { L = (hay('lib') && get('lib')) || (hay('cachedLib') ? get('cachedLib')() : null); } catch (e) {}
    if (L && L !== mapaL) {
      mapaL = L; mapa = new Map();
      Object.values(L).flat().forEach((t) => { if (t && t.uri && !mapa.has(t.uri)) mapa.set(t.uri, t); });
    }
    return L ? mapa : null;
  }

  // ---------- Seguimiento de lo que suena ----------
  let cur = null, ultimos = [], ultimosG = [], ultimoAviso = 0;
  function cerrar(c) {
    if (!c || c.omitir || !c.dur) return;
    const ratio = c.max / c.dur;
    P.st.seg += Math.round(c.max / 1000);
    if (c.baneada) { ultimos.push('s'); }
    else if (ratio >= 0.8) { P.st.esc++; sumar(c.artista, 1, c.g); ultimos.push('c'); }
    else if (c.max < 20000 || ratio < 0.25) { P.st.salt++; sumar(c.artista, c.max < 8000 ? -1.5 : -1, c.g); ultimos.push('s'); }
    else ultimos.push('n');
    ultimosG.push(c.g || null);
    ultimos = ultimos.slice(-6); ultimosG = ultimosG.slice(-6);
    guardar();
    if (ultimos.filter((x) => x === 's').length >= 3 && Date.now() - ultimoAviso > 90 * 1000) {
      const gs = ultimosG.filter((_, i) => ultimos[i] === 's');
      ultimoAviso = Date.now(); ultimos = []; ultimosG = []; aviso(gs);
    }
  }
  function enEstado(s) {
    if (!s || !s.track_window || !s.track_window.current_track) return;
    const t = s.track_window.current_track;
    if (!cur || cur.uri !== t.uri) {
      cerrar(cur);
      const m = biblioteca(), conocida = m && m.get(t.uri);
      cur = { uri: t.uri, name: t.name, artista: (t.artists[0] || {}).name || '', g: conocida ? conocida.g : null, dur: s.duration, max: s.position };
      pintarCorazon();
    } else { cur.dur = s.duration; cur.max = Math.max(cur.max, s.position); }
  }
  let enganchado = null;   // el reproductor al que estamos enganchados (puede cambiar: en móvil se sustituye)
  setInterval(async () => {
    try {
      const pl = hay('player') && get('player');
      if (pl && pl.addListener && enganchado !== pl) { pl.addListener('player_state_changed', enEstado); enganchado = pl; }
      if (enganchado) enEstado(await enganchado.getCurrentState());
    } catch (e) {}
  }, 1000);

  // Veto (🚫): se añade un listener aparte; el de la página sigue funcionando igual
  const ban = $$('ban');
  if (ban) ban.addEventListener('click', () => {
    if (!cur || cur.baneada) return;
    cur.baneada = true; P.st.veta++; sumar(cur.artista, -2.5, cur.g);
  }, true);

  // ---------- Botón ♥ ----------
  const css = document.createElement('style');
  css.textContent = `
  #pfLike{position:absolute;right:10px;bottom:10px;z-index:3;width:46px;height:46px;border-radius:50%;padding:0;font-size:22px;line-height:1;background:#0008;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
  #pfLike.on{color:#ff5a7a}
  #pfBtn{position:fixed;left:18px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:60;width:56px;height:56px;border-radius:50%;padding:0;font-size:24px;background:#ffffff26;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 8px 28px #0008}
  #pfPanel{position:fixed;left:0;right:0;bottom:0;z-index:70;max-width:440px;margin:0 auto;height:min(82vh,660px);display:flex;flex-direction:column;background:#12121cf2;-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);border:1px solid #ffffff26;border-bottom:0;border-radius:24px 24px 0 0;box-shadow:0 -10px 40px #000a;transform:translateY(105%);transition:transform .28s ease;padding-bottom:env(safe-area-inset-bottom)}
  #pfPanel.open{transform:none}
  #pfHead{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px;font-weight:700}
  #pfHead button{width:36px;height:36px;padding:0}
  #pfBody{flex:1;overflow-y:auto;padding:4px 16px 16px;-webkit-overflow-scrolling:touch}
  .pfH{margin:16px 0 8px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--mu)}
  .pfGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .pfS{background:#ffffff14;border-radius:14px;padding:10px 12px}.pfS b{display:block;font-size:20px}.pfS span{font-size:12px;color:var(--mu)}
  .pfR{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:14px}
  .pfR .n{flex:0 0 38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pfR .b{flex:1;height:8px;background:#ffffff1f;border-radius:4px;overflow:hidden}.pfR .b i{display:block;height:100%;background:var(--ac)}
  .pfR .v{flex:0 0 auto;font-size:12px;color:var(--mu)}
  .pfR button{padding:4px 10px;font-size:12px}
  .pfNota{font-size:12px;color:var(--mu);line-height:1.4;margin-top:14px}
  #pfDel{width:100%;margin-top:14px;background:#ff5a7a26;color:#ff8da4}
  #pfToast{position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;max-width:min(92vw,380px);display:flex;gap:10px;align-items:center;padding:10px 14px;border-radius:18px;background:#12121cf2;border:1px solid #ffffff2a;box-shadow:0 8px 28px #000a;font-size:14px}
  #pfToast button{padding:7px 12px;white-space:nowrap}`;
  document.head.append(css);

  const like = document.createElement('button');
  like.id = 'pfLike'; like.type = 'button'; like.title = 'Me gusta'; like.textContent = '♡';
  const cover = $$('cover'); if (cover) cover.append(like);
  function pintarCorazon() { const on = !!(cur && P.likes[cur.uri]); like.classList.toggle('on', on); like.textContent = on ? '♥' : '♡'; }
  like.onclick = () => {
    if (!cur) return;
    if (P.likes[cur.uri]) { delete P.likes[cur.uri]; P.st.like = Math.max(0, P.st.like - 1); sumar(cur.artista, -3, cur.g); }
    else {
      P.likes[cur.uri] = 1; P.st.like++; sumar(cur.artista, 3, cur.g);
      try { if (window.IcemanDJ) window.IcemanDJ.nota('like'); } catch (e) {}
      const k = Object.keys(P.likes); if (k.length > 500) delete P.likes[k[0]];
    }
    guardar(); pintarCorazon();
  };

  // ---------- Aviso tras varios saltos seguidos ----------
  function aviso(gs) {
    // si el DJ está activo, es él quien lo comenta (y cambia de estilo); si no, sale este aviso
    try { if (window.IcemanDJ && window.IcemanDJ.reaccionSaltos(gs || [])) return; } catch (e) {}
    if ($$('pfToast')) return;
    const t = document.createElement('div'); t.id = 'pfToast';
    const p = document.createElement('span'); p.textContent = 'Parece que esto no te convence. ¿Cambio de rollo?';
    const b = document.createElement('button'); b.className = 'p'; b.textContent = 'Pedir otra cosa';
    b.onclick = () => { t.remove(); const a = $$('asBtn'); if (a) a.click(); };
    t.append(p, b); document.body.append(t);
    setTimeout(() => t.remove(), 12000);
  }

  // ---------- Ajuste de lo que se va a reproducir ----------
  function candidatas(uris) {
    const m = biblioteca(); if (!m) return null;
    const vistas = hay('played') ? get('played')() : new Set();
    return [...m.values()].filter((t) => !vistas.has(t.uri) && !uris.includes(t.uri));
  }
  function ajustar(uris) {
    if (!Array.isArray(uris) || uris.length < 2) return uris;
    const m = biblioteca(); if (!m) return uris;
    const pool = candidatas(uris); if (!pool || !pool.length) return uris;
    const cuenta = {}; uris.forEach((u) => { const t = m.get(u); if (t && t.g) cuenta[t.g] = (cuenta[t.g] || 0) + 1; });
    const g = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0];
    // Tras varios saltos, el DJ pide cambiar de estilo: si este bloque es del estilo que saltaste, se sustituye entero por otro
    const cambio = window.__cambioDe; window.__cambioDe = null;
    if (cambio && Date.now() - cambio.t < 3 * 60 * 1000 && cambio.g.length && (!g || cambio.g.includes(g))) {
      const nuevoG = mezclar([...new Set(pool.map((t) => t.g).filter((x) => x && !cambio.g.includes(x)))])
        .find((x) => pool.filter((t) => t.g === x && puntos((t.artists[0] || {}).name) > UMBRAL_EVITAR).length >= Math.min(uris.length, 3));
      if (nuevoG) {
        const elegidas = mezclar(pool.filter((t) => t.g === nuevoG && puntos((t.artists[0] || {}).name) > UMBRAL_EVITAR)).slice(0, uris.length).map((t) => t.uri);
        if (hay('savePlayed')) { const v = get('played')(); elegidas.forEach((u) => v.add(u)); get('savePlayed')(v); }
        if (hay('lastUri') && get('lastUri') === uris[uris.length - 1]) asignar('lastUri', JSON.stringify(elegidas[elegidas.length - 1]));
        return elegidas;
      }
    }
    let delMismo = mezclar(pool.filter((t) => !g || t.g === g));
    const arte = (t) => (t.artists && t.artists[0] && t.artists[0].name) || '';
    const usadas = [];
    // 1) fuera artistas que has descartado, y en su lugar canciones neutras o que te gustan
    let out = [];
    for (const u of uris) {
      const t = m.get(u), a = t ? arte(t) : '';
      if (a && puntos(a) <= UMBRAL_EVITAR) {
        const i = delMismo.findIndex((c) => puntos(arte(c)) >= 0);
        if (i >= 0) { const r = delMismo.splice(i, 1)[0]; out.push(r.uri); usadas.push(r.uri); P.st.evit++; }
        else P.st.evit++;               // sin sustituta: simplemente se quita
      } else out.push(u);
    }
    if (!out.length) return uris;       // nunca dejamos la lista vacía
    // 2) a veces, una canción de un artista que te gusta
    if (out.length >= 3 && Math.random() < 0.5) {
      const favs = delMismo.filter((c) => puntos(arte(c)) >= UMBRAL_FAV);
      if (favs.length) {
        const r = favs[Math.floor(Math.random() * favs.length)];
        const idx = 1 + Math.floor(Math.random() * (out.length - 1));
        const quien = m.get(out[idx]);
        if (!quien || puntos(arte(quien)) < UMBRAL_FAV) { out[idx] = r.uri; usadas.push(r.uri); P.st.afin++; }
      }
    }
    if (usadas.length && hay('savePlayed')) { const v = get('played')(); usadas.forEach((u) => v.add(u)); get('savePlayed')(v); }
    // el final del bloque lo detecta la radio por lastUri: lo mantenemos al día
    if (hay('lastUri') && get('lastUri') === uris[uris.length - 1]) asignar('lastUri', JSON.stringify(out[out.length - 1]));
    guardar();
    return out;
  }
  if (hay('reproducir')) {
    const original = get('reproducir');
    window.__perfilRep = function (uris, ...resto) {
      let lista = uris;
      if (window.__directo) { if (cur) cur.omitir = true; }       // lo has pedido tú: no se toca
      else { try { lista = ajustar(uris); } catch (e) { console.warn('perfil:', e.message); } }
      return original.call(this, lista, ...resto);
    };
    asignar('reproducir', 'window.__perfilRep');
  }

  // ---------- API para el asistente ----------
  window.IcemanPerfil = {
    favoritas(n) {
      const m = biblioteca(); if (!m) return [];
      const vistas = hay('played') ? get('played')() : new Set();
      const arte = (t) => (t.artists && t.artists[0] && t.artists[0].name) || '';
      const buenas = [...m.values()].filter((t) => !vistas.has(t.uri) && puntos(arte(t)) >= 1);
      buenas.sort((a, b) => puntos(arte(b)) - puntos(arte(a)) + (Math.random() - 0.5) * 2);
      const porArtista = {}, out = [];
      for (const t of buenas) { const k = norm(arte(t)); porArtista[k] = (porArtista[k] || 0) + 1; if (porArtista[k] <= 2) out.push(t); if (out.length >= (n || 8)) break; }
      return out;
    }
  };

  // ---------- Panel "Tu perfil" ----------
  const btn = document.createElement('button');
  btn.id = 'pfBtn'; btn.type = 'button'; btn.title = 'Tu perfil'; btn.textContent = '📊'; btn.hidden = true;
  const panel = document.createElement('div'); panel.id = 'pfPanel';
  panel.innerHTML = '<div id="pfHead"><span>📊 Tu perfil</span><button type="button" id="pfX" aria-label="Cerrar">✕</button></div><div id="pfBody"></div>';
  document.body.append(btn, panel);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const tiempo = (s) => (s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' min' : Math.floor(s / 60) + ' min');
  const nombreG = (g) => { try { return get('GRUPOS')[g].nombre; } catch (e) { return g; } };

  function dibujar() {
    const body = $$('pfBody'); body.textContent = '';
    const st = P.st, total = st.esc + st.salt + st.veta + st.like;
    const grid = el('div', 'pfGrid');
    [['Escuchadas enteras', st.esc], ['Saltadas', st.salt], ['Vetadas 🚫', st.veta], ['Me gusta ♥', st.like], ['Tiempo escuchado', tiempo(st.seg)], ['Ajustes del perfil', st.evit + st.afin]].forEach(([k, v]) => {
      const c = el('div', 'pfS'); c.append(el('b', '', String(v)), el('span', '', k)); grid.append(c);
    });
    body.append(grid);
    if (total < 5) { body.append(el('p', 'pfNota', 'Aún estoy aprendiendo. Escucha canciones enteras, salta las que no te gusten, usa 🚫 y ♥, y aquí aparecerán tus gustos reales.')); }
    const arts = Object.keys(P.art).map((k) => ({ k, n: P.art[k].n, s: efectivo(P.art[k]) }));
    const top = arts.filter((a) => a.s >= 0.9).sort((a, b) => b.s - a.s).slice(0, 5);
    if (top.length) {
      body.append(el('div', 'pfH', 'Tus artistas del momento'));
      top.forEach((a) => { const r = el('div', 'pfR'); const b = el('div', 'b'); const i = document.createElement('i'); i.style.width = Math.round(a.s / top[0].s * 100) + '%'; b.append(i); r.append(el('span', 'n', a.n), b, el('span', 'v', a.s.toFixed(1))); body.append(r); });
    }
    const gs = Object.keys(P.gen).filter((g) => P.gen[g] > 0.5).sort((a, b) => P.gen[b] - P.gen[a]).slice(0, 4);
    if (gs.length) {
      const sum = gs.reduce((x, g) => x + P.gen[g], 0);
      body.append(el('div', 'pfH', 'Estilos que más disfrutas'));
      gs.forEach((g) => { const r = el('div', 'pfR'); const b = el('div', 'b'); const i = document.createElement('i'); i.style.width = Math.round(P.gen[g] / sum * 100) + '%'; b.append(i); r.append(el('span', 'n', nombreG(g)), b, el('span', 'v', Math.round(P.gen[g] / sum * 100) + '%')); body.append(r); });
    }
    const mal = arts.filter((a) => a.s <= UMBRAL_EVITAR).sort((a, b) => a.s - b.s).slice(0, 8);
    if (mal.length) {
      body.append(el('div', 'pfH', 'Artistas que estoy evitando'));
      mal.forEach((a) => {
        const r = el('div', 'pfR'); const q = el('button', '', 'Perdonar');
        q.onclick = () => { delete P.art[a.k]; guardar(); dibujar(); };
        const sp = el('span', 'n', a.n); sp.style.flex = '1'; r.append(sp, q); body.append(r);
      });
    }
    if (st.evit || st.afin) body.append(el('p', 'pfNota', `Hasta ahora: ${st.evit} canciones evitadas y ${st.afin} añadidas por afinidad.`));
    const fila = el('label', 'pfR'); const ck = document.createElement('input'); ck.type = 'checkbox'; ck.checked = LS.djcom !== 'off';
    ck.onchange = () => { LS.djcom = ck.checked ? 'on' : 'off'; };
    fila.append(ck, el('span', '', 'El DJ comenta tu sesión (saltos, ♥ y rachas) entre canción y canción')); fila.style.marginTop = '16px';
    body.append(fila);
    body.append(el('p', 'pfNota', 'Tu perfil se guarda solo en este dispositivo y solo con lo que haces aquí (saltos, vetos y ♥). No se envía a ningún servidor y no analiza tu cuenta de Spotify. En el móvil y en el PC es independiente.'));
    const del = el('button', '', 'Borrar mi perfil'); del.id = 'pfDel'; del.type = 'button';
    del.onclick = () => { if (confirm('¿Borrar todo tu perfil de gustos en este dispositivo?')) { P = vacio(); guardar(); pintarCorazon(); dibujar(); } };
    body.append(del);
  }
  const abrir = (v) => { if (v) dibujar(); panel.classList.toggle('open', v); btn.hidden = v || !LS.at; };
  btn.onclick = () => abrir(true);
  $$('pfX').onclick = () => abrir(false);
  setInterval(() => { if (!panel.classList.contains('open')) btn.hidden = !LS.at || ($$('app') && $$('app').hidden); }, 1000);

  identificar().then(pintarCorazon);
})();
