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
  #pfPanel{position:fixed;left:0;right:0;bottom:0;z-index:70;max-width:440px;margin:0 auto;height:min(82vh,660px);display:flex;flex-direction:column;background:#12121cf2;-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);border:1px solid #ffffff26;border-bottom:0;border-radius:24px 24px 0 0;box-shadow:0 -10px 40px #000a;transform:translateY(105%);transition:transform .28s ease;padding-bottom:env(safe-area-inset-bottom)}
  #pfPanel.open{transform:none}
  #pfHead{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px;font-weight:700}
  #pfHead button{width:36px;height:36px;padding:0}
  #pfBody{flex:1;overflow-y:auto;padding:4px 16px 16px;-webkit-overflow-scrolling:touch}
  .pfH{margin:16px 0 8px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--mu)}
  .pfGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .pfS{background:#ffffff14;border-radius:14px;padding:10px 12px}.pfS b{display:block;font-size:20px}.pfS span{font-size:12px;color:var(--mu)}
  .pfR{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:14px}
  .pfR .n{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pfR button{padding:4px 10px;font-size:12px;white-space:nowrap}
  .pfAdd{display:flex;gap:8px;margin:8px 0}
  .pfAdd input{flex:1;min-width:0;font-size:16px;color:var(--tx);background:#ffffff1f;border:1px solid #ffffff22;border-radius:999px;padding:9px 14px;outline:none}
  .pfNota{font-size:12px;color:var(--mu);line-height:1.4;margin-top:14px}
  .pfBig{width:100%;margin-top:10px}
  #pfSal{background:#ff5a7a26;color:#ff8da4}
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
  btn.id = 'pfBtn'; btn.type = 'button'; btn.title = 'Mis preferencias'; btn.textContent = '⚙️'; btn.hidden = true;
  const panel = document.createElement('div'); panel.id = 'pfPanel';
  panel.innerHTML = '<div id="pfHead"><span>⚙️ Mis preferencias</span><button type="button" id="pfX" aria-label="Cerrar">✕</button></div><div id="pfBody"></div>';
  document.body.append(btn, panel);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const tiempo = (s) => (s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' min' : Math.floor(s / 60) + ' min');

  function listaPref(titulo, tipo, otro, ayuda) {
    const body = $$('pfBody');
    body.append(el('div', 'pfH', titulo));
    const claves = Object.keys(PR[tipo]);
    claves.forEach((k) => {
      const r = el('div', 'pfR'); const q = el('button', '', 'Quitar');
      q.onclick = () => { delete PR[tipo][k]; guardarP(); dibujar(); };
      r.append(el('span', 'n', PR[tipo][k]), q); body.append(r);
    });
    if (!claves.length) body.append(el('p', 'pfNota', ayuda));
    const f = el('div', 'pfAdd'); const inp = document.createElement('input');
    inp.placeholder = 'Escribe un artista'; inp.maxLength = 60; inp.setAttribute('aria-label', titulo);
    const add = el('button', 'p', 'Añadir');
    const anadir = () => {
      const nombre = inp.value.replace(/\s+/g, ' ').trim().slice(0, 60), k = norm(nombre);
      if (!k) return;
      if (Object.keys(PR[tipo]).length >= 60) { inp.value = ''; inp.placeholder = 'Máximo 60 artistas'; return; }
      delete PR[otro][k]; PR[tipo][k] = nombre; guardarP(); dibujar();
    };
    add.onclick = anadir; inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } };
    f.append(inp, add); body.append(f);
  }

  function dibujar() {
    const body = $$('pfBody'); body.textContent = '';
    listaPref('Artistas que me gustan', 'gusta', 'evitar', 'Escribe aquí los artistas que quieres escuchar más. El DJ los meterá más a menudo.');
    listaPref('Artistas que prefiero evitar', 'evitar', 'gusta', 'Escribe aquí los que no quieres que suenen. Puedes quitarlos cuando quieras.');

    // --- Esta sesión ---
    const st = S.st;
    body.append(el('div', 'pfH', 'Esta sesión'));
    const grid = el('div', 'pfGrid');
    [['Escuchadas enteras', st.esc], ['Saltadas', st.salt], ['Vetadas 🚫', st.veta], ['Me gusta ♥', st.like], ['Tiempo escuchado', tiempo(st.seg)], ['Ajustes hechos', st.evit + st.afin]].forEach(([k, v]) => {
      const c = el('div', 'pfS'); c.append(el('b', '', String(v)), el('span', '', k)); grid.append(c);
    });
    body.append(grid);
    const arts = Object.keys(S.art).map((k) => ({ k, n: S.art[k].n, s: S.art[k].s }));
    const top = arts.filter((a) => a.s >= 1).sort((a, b) => b.s - a.s).slice(0, 5);
    if (top.length) {
      body.append(el('div', 'pfH', 'Lo que más te ha gustado hoy'));
      top.forEach((a) => {
        const r = el('div', 'pfR'); const q = el('button', '', 'Siempre');
        q.title = 'Guardarlo en "Artistas que me gustan"';
        q.onclick = () => { delete PR.evitar[a.k]; PR.gusta[a.k] = a.n; guardarP(); dibujar(); };
        r.append(el('span', 'n', a.n), q); body.append(r);
      });
    }
    const mal = arts.filter((a) => a.s <= UMBRAL_EVITAR).sort((a, b) => a.s - b.s).slice(0, 8);
    if (mal.length) {
      body.append(el('div', 'pfH', 'Estoy evitando hoy'));
      mal.forEach((a) => {
        const r = el('div', 'pfR'); const q = el('button', '', 'Perdonar'), s = el('button', '', 'Siempre');
        q.onclick = () => { delete S.art[a.k]; guardarS(); dibujar(); };
        s.title = 'Guardarlo en "Artistas que prefiero evitar"';
        s.onclick = () => { delete PR.gusta[a.k]; PR.evitar[a.k] = a.n; guardarP(); dibujar(); };
        r.append(el('span', 'n', a.n), q, s); body.append(r);
      });
    }
    if (!(st.esc + st.salt + st.veta + st.like)) body.append(el('p', 'pfNota', 'Aún no hay nada de hoy. Lo que saltes, vetes o marques con ♥ solo cuenta durante esta sesión; si quieres que sea permanente, usa "Siempre".'));

    const fila = el('label', 'pfR'); const ck = document.createElement('input'); ck.type = 'checkbox'; ck.checked = LS.djcom !== 'off';
    ck.onchange = () => { LS.djcom = ck.checked ? 'on' : 'off'; };
    const tx = el('span', 'n', 'El DJ comenta tu sesión (saltos, ♥ y rachas) entre canción y canción'); tx.style.whiteSpace = 'normal'; fila.append(ck, tx); fila.style.marginTop = '16px';
    body.append(fila);

    body.append(el('p', 'pfNota', 'Tus artistas escritos se guardan solo en este dispositivo. Lo de la sesión se olvida a las 6 horas o al cerrar la pestaña. Nada de esto se envía a ningún servidor ni a Claude.'));
    const olv = el('button', 'pfBig', 'Olvidar lo de esta sesión'); olv.type = 'button';
    olv.onclick = () => { S = nuevaS(); guardarS(); cur = cur && Object.assign(cur, { omitir: true }); pintarCorazon(); dibujar(); };
    const bor = el('button', 'pfBig', 'Borrar mis artistas escritos'); bor.type = 'button';
    bor.onclick = () => { if (confirm('¿Borrar tus listas de artistas que te gustan y que evitas?')) { PR = vaciasP(); guardarP(); dibujar(); } };
    const sal = el('button', 'pfBig', 'Cerrar sesión y borrar mis datos de Spotify'); sal.id = 'pfSal'; sal.type = 'button';
    sal.onclick = () => { if (confirm('Se cerrará tu sesión y se borrará de este dispositivo todo lo que la radio guardó de tu Spotify (biblioteca, canciones ya sonadas, vetos). Tus artistas escritos se conservan. ¿Seguir?')) { if (window.IcemanPrivacidad) window.IcemanPrivacidad.salir(); else { LS.clear(); location.reload(); } } };
    body.append(olv, bor, sal);
  }
  const abrir = (v) => { if (v) { dibujar(); const tt = $$('pfToast'); if (tt) tt.remove(); } panel.classList.toggle('open', v); btn.hidden = v || !LS.at; };
  btn.onclick = () => abrir(true);
  $$('pfX').onclick = () => abrir(false);
  setInterval(() => { if (!panel.classList.contains('open')) btn.hidden = !LS.at || ($$('app') && $$('app').hidden); }, 1000);

  // ---------- Arranque ----------
  PR = cargarP();
  if (!LS[PK]) restaurar().then((r) => { if (r) { LS[PK] = r; PR = cargarP(); } });
})();
