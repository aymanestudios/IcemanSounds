// Preferencias y memoria de sesión de Iceman Sounds (Fase 0, cumplimiento de Spotify).
// Sustituye al antiguo "perfil de gustos" (que guardaba puntuaciones de artistas durante meses).
//  1) PREFERENCIAS: artistas que TÚ escribes ("me gustan" / "evitar"). Son tus datos, se guardan en este dispositivo.
//  2) SESIÓN: lo que haces ahora (saltos, vetos 🚫, ♥). Se guarda solo en esta pestaña y se olvida a las 6 h o al cerrarla.
// Nada de esto se envía a ningún servidor ni a Claude. Para hacerlo permanente hay que pedirlo tú (botones "Siempre").
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

  const UMBRAL_EVITAR = -4, UMBRAL_FAV = 3, PESO_GUSTA = 4, PESO_EVITAR = -10;
  const TTL_SESION = 6 * 3600 * 1000, MAX_ARTISTAS = 150;

  // ---------- 1) Preferencias (lo que escribes tú) ----------
  const PK = 'prefs_v1';
  const vaciasP = () => ({ v: 1, gusta: {}, evitar: {} });         // clave normalizada -> nombre como lo escribiste
  let PR = vaciasP();
  const cargarP = () => { try { const p = JSON.parse(LS[PK]); if (p && p.v === 1 && p.gusta && p.evitar) return p; } catch (e) {} return vaciasP(); };
  // Copia de seguridad SOLO de tus preferencias (la radio hace LS.clear() si Spotify da un error de login)
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('iceman-prefs', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function respaldo(v) { try { (await idb()).transaction('k', 'readwrite').objectStore('k').put(v, PK); } catch (e) {} }
  async function restaurar() { try { const d = await idb(); return await new Promise((res) => { const q = d.transaction('k').objectStore('k').get(PK); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } }
  const guardarP = () => { try { const j = JSON.stringify(PR); LS[PK] = j; respaldo(j); } catch (e) {} };

  // ---------- 2) Sesión (solo esta pestaña) ----------
  const SK = 'ses_v1';
  const nuevaS = () => ({ v: 1, t0: Date.now(), art: {}, gen: {}, likes: {}, st: { esc: 0, salt: 0, veta: 0, like: 0, seg: 0, evit: 0, afin: 0 } });
  let S = nuevaS();
  const cargarS = () => { try { const s = JSON.parse(sessionStorage[SK]); if (s && s.v === 1 && Date.now() - s.t0 < TTL_SESION) return s; } catch (e) {} return nuevaS(); };
  const guardarS = () => { try { sessionStorage[SK] = JSON.stringify(S); } catch (e) {} };
  S = cargarS();

  // puntos de un artista = lo de esta sesión + lo que tú declaras
  const puntos = (artista) => {
    const k = norm(artista); if (!k) return 0;
    let p = S.art[k] ? S.art[k].s : 0;
    if (PR.gusta[k]) p += PESO_GUSTA;
    if (PR.evitar[k]) p += PESO_EVITAR;
    return p;
  };

  function sumar(artista, pts, g) {
    if (!artista) return;
    const k = norm(artista); if (!k) return;
    const e = S.art[k] || (S.art[k] = { n: artista, s: 0, c: 0 });
    e.s += pts; e.c++;
    if (g) S.gen[g] = (S.gen[g] || 0) + pts;
    const ks = Object.keys(S.art);
    if (ks.length > MAX_ARTISTAS) ks.sort((a, b) => Math.abs(S.art[a].s) - Math.abs(S.art[b].s)).slice(0, ks.length - MAX_ARTISTAS).forEach((x) => delete S.art[x]);
    guardarS();
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
    S.st.seg += Math.round(c.max / 1000);
    if (c.baneada) { ultimos.push('s'); }
    else if (ratio >= 0.8) { S.st.esc++; sumar(c.artista, 1, c.g); ultimos.push('c'); }
    else if (c.max < 20000 || ratio < 0.25) { S.st.salt++; sumar(c.artista, c.max < 8000 ? -1.5 : -1, c.g); ultimos.push('s'); }
    else ultimos.push('n');
    ultimosG.push(c.g || null);
    ultimos = ultimos.slice(-6); ultimosG = ultimosG.slice(-6);
    guardarS();
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
    cur.baneada = true; S.st.veta++; sumar(cur.artista, -2.5, cur.g);
  }, true);

  // ---------- Botón ♥ (solo afecta a esta sesión) ----------
  const css = document.createElement('style');
  css.textContent = `
  #pfLike{position:absolute;right:10px;bottom:10px;z-index:3;width:46px;height:46px;border-radius:50%;padding:0;font-size:22px;line-height:1;background:#0008;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
  #pfLike.on{color:#ff5a7a}
  #pfBtn{position:fixed;left:18px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:60;width:56px;height:56px;border-radius:50%;padding:0;font-size:24px;background:#ffffff26;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 8px 28px #0008}
  #pfPanel{position:fixed;left:0;right:0;bottom:0;z-index:70;max-width:440px;margin:0 auto;height:auto;max-height:min(80vh,640px);display:flex;flex-direction:column;background:#0d141bf5;-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);border:1px solid #ffffff26;border-bottom:0;border-radius:26px 26px 0 0;box-shadow:0 -10px 40px #000a;transform:translateY(105%);transition:transform .28s ease;padding-bottom:env(safe-area-inset-bottom)}
  #pfPanel{--i-gear:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M19.14 12.94a7.4 7.4 0 0 0 .05-.94 7.4 7.4 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.1 7.1 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.55-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.66 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.4 7.4 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.61.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96c.22.09.48 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z'/%3E%3C/svg%3E")}
  #pfPanel.open{transform:none}
  #pfPanel::before{content:"";position:absolute;left:50%;top:7px;width:38px;height:4px;margin-left:-19px;border-radius:2px;background:#ffffff3a}
  #pfHead{display:flex;align-items:center;justify-content:space-between;padding:20px 16px 6px 18px;font:700 19px/1 var(--f,system-ui)}
  #pfHead span{display:flex;align-items:center;gap:9px}
  #pfHead span::before{content:"";width:22px;height:22px;background:var(--ac);-webkit-mask:var(--i-gear) center/contain no-repeat;mask:var(--i-gear) center/contain no-repeat}
  #pfHead button{width:36px;height:36px;padding:0;font-size:17px}
  #pfTabs{display:flex;gap:4px;margin:8px 14px 2px;padding:4px;border-radius:16px;background:#ffffff0f}
  #pfTabs button{flex:1;min-width:0;padding:9px 2px;font-size:13.5px;font-weight:600;background:none;color:var(--mu);border-radius:12px;display:flex;flex-direction:column;align-items:center;gap:3px;line-height:1}
  #pfTabs button::before{content:"";width:19px;height:19px;background:currentColor;-webkit-mask:var(--ti) center/contain no-repeat;mask:var(--ti) center/contain no-repeat}
  #pfTabs button.on{background:#ffffff1f;color:var(--tx);box-shadow:inset 0 0 0 1px #ffffff24}
  #pfTabs button.on::before{background:var(--ac)}
  #pfBody{flex:1;overflow-y:auto;padding:6px 16px 18px;min-height:min(300px,40vh);-webkit-overflow-scrolling:touch}
  .pfPane{display:none}.pfPane.on{display:block;animation:pfIn .22s ease both}
  @keyframes pfIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .pfH{margin:16px 0 8px;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mu);display:flex;align-items:center;gap:8px}
  .pfH:first-child{margin-top:8px}
  .pfH small{font-size:11px;font-weight:700;letter-spacing:0;text-transform:none;padding:2px 8px;border-radius:999px;background:#ffffff1a;color:var(--tx)}
  .pfGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .pfS{background:#ffffff12;border-radius:14px;padding:8px 10px 8px;box-shadow:inset 0 0 0 1px #ffffff14}.pfS b{display:block;font:700 18px/1.1 var(--f,system-ui)}.pfS span{display:block;font-size:11.5px;color:var(--mu);margin-top:3px;line-height:1.2}
  .pfR{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:14px}
  .pfR .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pfR button{padding:4px 10px;font-size:12px;white-space:nowrap}
  .pfChips{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 8px}
  .pfChip{display:inline-flex;align-items:center;gap:2px;max-width:100%;padding:5px 5px 5px 12px;border-radius:999px;font-size:14px;background:#12a9b826;box-shadow:inset 0 0 0 1px #12a9b855}
  .pfChip.no{background:#ff5a4d1f;box-shadow:inset 0 0 0 1px #ff5a4d4d}
  .pfChip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pfChip button{width:26px;height:26px;padding:0;font-size:15px;line-height:1;background:#ffffff1f;color:var(--tx);border-radius:50%;flex:none}
  .pfChip button.t{width:auto;padding:0 9px;font-size:12px;border-radius:999px}
  .pfAdd{display:flex;gap:8px;margin:6px 0 4px}
  .pfAdd input{flex:1;min-width:0;font-size:16px;color:var(--tx);background:#ffffff14;border:1px solid #ffffff22;border-radius:999px;padding:10px 15px;outline:none}
  .pfAdd input:focus{border-color:var(--ac)}
  .pfAdd button{width:44px;height:44px;padding:0;font-size:22px;line-height:1;flex:none}
  .pfNota{font-size:12.5px;color:var(--mu);line-height:1.4;margin:8px 0 2px}
  .pfBig{width:100%;margin-top:8px;border-radius:14px;padding:12px}
  .pfDuo{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.pfDuo .pfBig{margin:0;padding:11px 8px;font-size:13.5px}
  #pfSal{background:#ff5a7a26;color:#ff8da4}
  .pfSw{display:flex;align-items:flex-start;gap:12px;margin:8px 0;padding:11px 12px;border-radius:14px;background:#ffffff0f;cursor:pointer;box-shadow:inset 0 0 0 1px #ffffff12}
  .pfSw .tx{flex:1;font-size:14.5px;line-height:1.25}.pfSw .tx small{display:block;font-size:12.5px;color:var(--mu);margin-top:3px;line-height:1.3}
  .pfSw input{position:absolute;opacity:0;pointer-events:none}
  .pfSw i{flex:none;width:46px;height:28px;border-radius:14px;background:#ffffff2e;position:relative;transition:background .2s;margin-top:1px}
  .pfSw i::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 2px 6px #0005}
  .pfSw input:checked+i{background:var(--ac)}.pfSw input:checked+i::after{transform:translateX(18px)}
  .pfSw input:focus-visible+i{outline:2px solid #8ff4ff;outline-offset:2px}
  .pfSeg{display:flex;gap:3px;padding:3px;border-radius:12px;background:#ffffff12;flex:none}
  .pfSeg button{flex:1;padding:6px 10px;font-size:12.5px;font-weight:600;background:none;border-radius:9px;color:var(--mu);white-space:nowrap}
  .pfSeg button.on,.pfSeg button.p.on{background:var(--ac);color:#04161a}
  #pfToast{position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;max-width:min(92vw,380px);display:flex;gap:10px;align-items:center;padding:10px 14px;border-radius:18px;background:#12121cf2;border:1px solid #ffffff2a;box-shadow:0 8px 28px #000a;font-size:14px}
  #pfToast button{padding:7px 12px;white-space:nowrap}`;
  document.head.append(css);

  const like = document.createElement('button');
  like.id = 'pfLike'; like.type = 'button'; like.title = 'Me gusta (en esta sesión)'; like.textContent = '♡';
  const cover = $$('cover'); if (cover) cover.append(like);
  function pintarCorazon() { const on = !!(cur && S.likes[cur.uri]); like.classList.toggle('on', on); like.textContent = on ? '♥' : '♡'; }
  like.onclick = () => {
    if (!cur) return;
    if (S.likes[cur.uri]) { delete S.likes[cur.uri]; S.st.like = Math.max(0, S.st.like - 1); sumar(cur.artista, -3, cur.g); }
    else {
      S.likes[cur.uri] = 1; S.st.like++; sumar(cur.artista, 3, cur.g);
      try { if (window.IcemanDJ) window.IcemanDJ.nota('like'); } catch (e) {}
      const k = Object.keys(S.likes); if (k.length > 200) delete S.likes[k[0]];
    }
    guardarS(); pintarCorazon();
  };

  // ---------- Aviso tras varios saltos seguidos ----------
  function aviso(gs) {
    // si el DJ está activo, es él quien lo comenta (y cambia de estilo); si no, sale este aviso
    try { if (window.IcemanDJ && window.IcemanDJ.reaccionSaltos(gs || [])) return; } catch (e) {}
    if ($$('pfToast') || panel.classList.contains('open')) return;
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
        if (i >= 0) { const r = delMismo.splice(i, 1)[0]; out.push(r.uri); usadas.push(r.uri); S.st.evit++; }
        else S.st.evit++;               // sin sustituta: simplemente se quita
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
        if (!quien || puntos(arte(quien)) < UMBRAL_FAV) { out[idx] = r.uri; usadas.push(r.uri); S.st.afin++; }
      }
    }
    if (usadas.length && hay('savePlayed')) { const v = get('played')(); usadas.forEach((u) => v.add(u)); get('savePlayed')(v); }
    // el final del bloque lo detecta la radio por lastUri: lo mantenemos al día
    if (hay('lastUri') && get('lastUri') === uris[uris.length - 1]) asignar('lastUri', JSON.stringify(out[out.length - 1]));
    guardarS();
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
    puntos,
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

  // ---------- Panel "Mis preferencias" ----------
  const btn = document.createElement('button');
  btn.id = 'pfBtn'; btn.type = 'button'; btn.title = 'Ajustes'; btn.textContent = '⚙️'; btn.hidden = true;
  const panel = document.createElement('div'); panel.id = 'pfPanel';
  panel.innerHTML = '<div id="pfHead"><span>Ajustes</span><button type="button" id="pfX" aria-label="Cerrar">✕</button></div><div id="pfTabs" role="tablist"></div><div id="pfBody"></div>';
  document.body.append(btn, panel);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const tiempo = (s) => (s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' min' : Math.floor(s / 60) + ' min');

  // Piezas de interfaz que reutilizan los otros módulos (estilos, DJ...) para que todo se vea igual
  const interruptor = (texto, ayuda, activo, alCambiar) => {
    const l = el('label', 'pfSw'); const ck = document.createElement('input'); ck.type = 'checkbox'; ck.checked = !!activo;
    ck.onchange = () => alCambiar(ck.checked);
    const tx = el('span', 'tx', texto); if (ayuda) tx.append(el('small', '', ayuda));
    l.append(ck, el('i'), tx); return l;
  };
  const segmentos = (opciones, valor, alElegir) => {
    const g = el('div', 'pfSeg');
    opciones.forEach(([v, t]) => { const b = el('button', v === valor ? 'on' : '', t); b.type = 'button'; b.onclick = () => alElegir(v); g.append(b); });
    return g;
  };
  window.__pfUI = { el, interruptor, segmentos };

  function listaPref(cont, titulo, tipo, otro, ayuda) {
    const claves = Object.keys(PR[tipo]);
    const h = el('div', 'pfH', titulo); if (claves.length) h.append(el('small', '', String(claves.length))); cont.append(h);
    const chips = el('div', 'pfChips');
    claves.forEach((k) => {
      const c = el('span', 'pfChip' + (tipo === 'evitar' ? ' no' : '')); const q = el('button', '', '×'); q.type = 'button';
      q.title = 'Quitar'; q.setAttribute('aria-label', 'Quitar ' + PR[tipo][k]);
      q.onclick = () => { delete PR[tipo][k]; guardarP(); dibujar(); };
      c.append(el('span', '', PR[tipo][k]), q); chips.append(c);
    });
    if (claves.length) cont.append(chips); else cont.append(el('p', 'pfNota', ayuda));
    const f = el('div', 'pfAdd'); const inp = document.createElement('input');
    inp.placeholder = 'Escribe un artista…'; inp.maxLength = 60; inp.setAttribute('aria-label', titulo);
    const add = el('button', 'p', '+'); add.type = 'button'; add.setAttribute('aria-label', 'Añadir');
    const anadir = () => {
      const nombre = inp.value.replace(/\s+/g, ' ').trim().slice(0, 60), k = norm(nombre);
      if (!k) return;
      if (Object.keys(PR[tipo]).length >= 60) { inp.value = ''; inp.placeholder = 'Máximo 60 artistas'; return; }
      delete PR[otro][k]; PR[tipo][k] = nombre; guardarP(); dibujar();
    };
    add.onclick = anadir; inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } };
    f.append(inp, add); cont.append(f);
  }

  const TABS = [['artistas', 'Artistas', 'gusta'], ['estilos', 'Estilos', 'estilos'], ['dj', 'DJ', 'dj'], ['sesion', 'Sesión', 'sesion']];
  const ICONOS = {   // iconos propios (se pintan con máscara, del color del texto)
    artistas: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5z'/%3E%3C/svg%3E\")",
    estilos: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 17h8v2H3zm0-6h12v2H3zm0-6h18v2H3zm14 8 4 3-4 3z'/%3E%3C/svg%3E\")",
    dj: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 14a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 14zm6-3.5a6 6 0 0 1-12 0H4.5a7.5 7.5 0 0 0 6.75 7.46V21h1.5v-3.04A7.5 7.5 0 0 0 19.5 10.5z'/%3E%3C/svg%3E\")",
    sesion: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 20V10h3.5v10zm5.25 0V4h3.5v16zm5.25 0v-7H19v7z'/%3E%3C/svg%3E\")"
  };
  let pestana = 'artistas';
  try { pestana = sessionStorage.pf_tab || 'artistas'; } catch (e) {}
  if (!TABS.some((t) => t[0] === pestana)) pestana = 'artistas';
  const elegirPestana = (id) => {
    pestana = id; try { sessionStorage.pf_tab = id; } catch (e) {}
    $$('pfTabs').querySelectorAll('button').forEach((b) => { const on = b.dataset.t === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $$('pfBody').querySelectorAll('.pfPane').forEach((p) => p.classList.toggle('on', p.dataset.t === id));
    $$('pfBody').scrollTop = 0;
  };

  function dibujar() {
    const body = $$('pfBody'), barra = $$('pfTabs'); body.textContent = ''; barra.textContent = '';
    const panes = {};
    TABS.forEach(([id, nom]) => {
      const b = el('button', '', nom); b.type = 'button'; b.dataset.t = id; b.setAttribute('role', 'tab'); b.style.setProperty('--ti', ICONOS[id]);
      b.onclick = () => elegirPestana(id); barra.append(b);
      const p = el('div', 'pfPane'); p.dataset.t = id; p.setAttribute('role', 'tabpanel'); panes[id] = p; body.append(p);
    });

    // --- Artistas ---
    listaPref(panes.artistas, 'Me gustan', 'gusta', 'evitar', 'Escribe los artistas que quieres escuchar más. El DJ los meterá más a menudo.');
    listaPref(panes.artistas, 'Prefiero evitar', 'evitar', 'gusta', 'Escribe los que no quieres que suenen. Puedes quitarlos cuando quieras.');

    // --- Estilos / DJ / Sesión: los añaden otros módulos (cada uno dice en qué pestaña va) ---
    const dj = panes.dj;
    dj.append(interruptor('El DJ comenta mi sesión', 'Saltos, ♥ y rachas, entre canción y canción.', LS.djcom !== 'off', (v) => { LS.djcom = v ? 'on' : 'off'; }));
    (window.__pfExtras || []).forEach((f) => { try { f(panes[f.tab] || panes.estilos, el); } catch (e) { console.warn('preferencias:', e.message); } });

    // --- Sesión ---
    const ses = panes.sesion, st = S.st;
    ses.append(el('div', 'pfH', 'Esta sesión'));
    const grid = el('div', 'pfGrid');
    [['Enteras', st.esc], ['Saltadas', st.salt], ['Vetadas', st.veta], ['Me gusta', st.like], ['Escuchado', tiempo(st.seg)], ['Ajustes', st.evit + st.afin]].forEach(([k, v]) => {
      const c = el('div', 'pfS'); c.append(el('b', '', String(v)), el('span', '', k)); grid.append(c);
    });
    ses.append(grid);
    const arts = Object.keys(S.art).map((k) => ({ k, n: S.art[k].n, s: S.art[k].s }));
    const top = arts.filter((a) => a.s >= 1).sort((a, b) => b.s - a.s).slice(0, 5);
    if (top.length) {
      ses.append(el('div', 'pfH', 'Lo que más te ha gustado hoy'));
      const ch = el('div', 'pfChips');
      top.forEach((a) => {
        const c = el('span', 'pfChip'); const q = el('button', 't', 'Siempre'); q.type = 'button';
        q.title = 'Guardarlo en "Me gustan"';
        q.onclick = () => { delete PR.evitar[a.k]; PR.gusta[a.k] = a.n; guardarP(); dibujar(); };
        c.append(el('span', '', a.n), q); ch.append(c);
      });
      ses.append(ch);
    }
    const mal = arts.filter((a) => a.s <= UMBRAL_EVITAR).sort((a, b) => a.s - b.s).slice(0, 8);
    if (mal.length) {
      ses.append(el('div', 'pfH', 'Estoy evitando hoy'));
      const ch = el('div', 'pfChips');
      mal.forEach((a) => {
        const c = el('span', 'pfChip no'); const q = el('button', 't', 'Perdonar'), s2 = el('button', 't', 'Siempre'); q.type = 'button'; s2.type = 'button';
        q.onclick = () => { delete S.art[a.k]; guardarS(); dibujar(); };
        s2.title = 'Guardarlo en "Prefiero evitar"';
        s2.onclick = () => { delete PR.gusta[a.k]; PR.evitar[a.k] = a.n; guardarP(); dibujar(); };
        c.append(el('span', '', a.n), q, s2); ch.append(c);
      });
      ses.append(ch);
    }
    if (!(st.esc + st.salt + st.veta + st.like)) ses.append(el('p', 'pfNota', 'Aún no hay nada de hoy. Lo que saltes, vetes o marques con ♥ solo cuenta durante esta sesión; si quieres que sea permanente, usa "Siempre".'));

    ses.append(el('div', 'pfH', 'Datos y privacidad'));
    ses.append(el('p', 'pfNota', 'Tus artistas escritos se guardan solo en este dispositivo. Lo de la sesión se olvida a las 6 horas o al cerrar la pestaña. Nada de esto se envía a ningún servidor ni a Claude.'));
    const olv = el('button', 'pfBig', 'Olvidar la sesión'); olv.type = 'button';
    olv.onclick = () => { S = nuevaS(); guardarS(); cur = cur && Object.assign(cur, { omitir: true }); pintarCorazon(); dibujar(); };
    const bor = el('button', 'pfBig', 'Borrar mis artistas'); bor.type = 'button';
    bor.onclick = () => { if (confirm('¿Borrar tus listas de artistas que te gustan y que evitas?')) { PR = vaciasP(); guardarP(); dibujar(); } };
    const duo = el('div', 'pfDuo'); duo.append(olv, bor); ses.append(duo);
    const sal = el('button', 'pfBig', 'Cerrar sesión y borrar mis datos de Spotify'); sal.id = 'pfSal'; sal.type = 'button';
    sal.onclick = () => { if (confirm('Se cerrará tu sesión y se borrará de este dispositivo todo lo que la radio guardó de tu Spotify (biblioteca, canciones ya sonadas, vetos). Tus artistas escritos se conservan. ¿Seguir?')) { if (window.IcemanPrivacidad) window.IcemanPrivacidad.salir(); else { LS.clear(); location.reload(); } } };
    ses.append(sal);
    elegirPestana(pestana);
  }
  window.__pfRedibujar = () => { if (panel.classList.contains('open')) { const y = $$('pfBody').scrollTop; dibujar(); $$('pfBody').scrollTop = y; } };
  const abrir = (v) => { if (v) { dibujar(); const tt = $$('pfToast'); if (tt) tt.remove(); } panel.classList.toggle('open', v); btn.hidden = v || !LS.at; };
  btn.onclick = () => abrir(true);
  $$('pfX').onclick = () => abrir(false);
  setInterval(() => { if (!panel.classList.contains('open')) btn.hidden = !LS.at || ($$('app') && $$('app').hidden); }, 1000);

  // ---------- Arranque ----------
  PR = cargarP();
  if (!LS[PK]) restaurar().then((r) => { if (r) { LS[PK] = r; PR = cargarP(); } });
})();
