// Ayudas para el móvil (iPhone/Android) de Iceman Sounds.
// Por defecto la radio suena DENTRO de la propia página (reproductor web de Spotify), como siempre.
// Este módulo añade una red de seguridad para cuando bloqueas el móvil o cambias de app:
//  - Al bloquear/salir: añade unas canciones a la cola de Spotify, así la música NO se para aunque el iPhone congele la página.
//  - Al volver: si la música se había acabado mientras tanto, la radio retoma sola, con el DJ.
// Límite de iOS (no se puede saltar desde una web): con la pantalla bloqueada el DJ no puede hablar.
//
// Opcional (apagado por defecto): "modo mando" = controlar la app de Spotify del móvil en vez de reproducir en la página.
// Se activa solo con ?movil=1 en la dirección (o localStorage.mando = '1'). Necesita la app de Spotify abierta en el móvil.
(function () {
  'use strict';
  if (window.__movil) return;
  const esMovil = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const modoMando = /[?&]movil=1/.test(location.search) || localStorage.mando === '1';
  if (!esMovil && !modoMando) return;
  window.__movil = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const asignar = (n, expr) => { try { (0, eval)(n + ' = ' + expr); } catch (e) {} };
  const $$ = (id) => document.getElementById(id);
  const api = (p, o) => get('api')(p, o);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const estado = (t) => { const s = $$('st'); if (s) s.textContent = t; };

  // En móvil el volumen lo controlan los botones del teléfono; el deslizador no tendría efecto
  if (modoMando) {
    const css = document.createElement('style');
    css.textContent = '.vol{display:none!important}';
    document.head.append(css);
  }

  // ---------- Estado de lo que suena (se consulta cada 1,5 s y se extrapola entre consultas) ----------
  let snap = null, ocupado = false, ultimoOk = Date.now(), emitido = '';
  const oyentes = {};
  const avisar = (ev, s) => (oyentes[ev] || []).forEach((f) => { try { f(s); } catch (e) {} });

  function construir(sn, pos) {
    return {
      paused: !sn.playing, position: pos, duration: sn.dur,
      track_window: { current_track: sn.track, previous_tracks: [], next_tracks: [] }
    };
  }
  function actual() {
    if (!snap) return null;
    const pos = snap.playing ? Math.min(snap.dur, snap.pos + (Date.now() - snap.t)) : snap.pos;
    return construir(snap, pos);
  }
  function emitir(s) {
    avisar('player_state_changed', s);
    try { if (hay('onState')) get('onState')(s); } catch (e) {}
  }

  async function sondear() {
    if (ocupado) return;
    ocupado = true;
    const ahora = Date.now(), hueco = ahora - ultimoOk;
    try {
      const d = await api('/me/player');
      ultimoOk = Date.now();
      if (!d || !d.item) { snap = null; return; }
      const it = d.item, previo = snap;
      const nuevo = {
        t: Date.now(), pos: d.progress_ms || 0, playing: !!d.is_playing, dur: it.duration_ms,
        track: { uri: it.uri, id: it.id, name: it.name, artists: it.artists || [], album: it.album || { images: [] } }
      };
      // ¿Se ha acabado la música? (parada en el segundo 0 tras haber estado sonando hasta el final,
      // o tras un largo "hueco" en el que la página estuvo congelada con el móvil bloqueado)
      let fin = false;
      if (previo && previo.playing && !nuevo.playing && nuevo.pos < 2000) {
        const posPrevia = Math.min(previo.dur, previo.pos + (ahora - previo.t));
        if (posPrevia >= previo.dur * 0.8 || hueco > 20000) fin = true;
      }
      snap = nuevo;
      if (fin) {
        emitido = '';
        emitir({ paused: true, position: 0, duration: nuevo.dur, track_window: { current_track: nuevo.track, previous_tracks: [nuevo.track], next_tracks: [] } });
        return;
      }
      const huella = nuevo.track.uri + '|' + nuevo.playing;
      if (huella !== emitido) { emitido = huella; emitir(actual()); }
    } catch (e) {
      console.warn('mando:', e.message);
    } finally { ocupado = false; }
  }
  const pronto = () => setTimeout(sondear, 500);

  // ---------- Dispositivo (la app de Spotify del móvil) ----------
  async function buscarDispositivo() {
    const r = await api('/me/player/devices');
    const ds = (r && r.devices) || [];
    // Solo el móvil/tablet: nunca el reproductor de un ordenador, aunque esté activo
    const mov = ds.filter((d) => /smartphone|tablet/i.test(d.type || '') || /iphone|android|ipad|móvil|movil/i.test(d.name || ''));
    return mov.find((d) => d.is_active) || mov[0] || null;
  }
  const conDisp = (p) => p + (p.includes('?') ? '&' : '?') + 'device_id=' + encodeURIComponent(hay('device') && get('device') || '');

  // ---------- El "reproductor" falso que usa el resto de la web ----------
  const mando = {
    mando: true,
    addListener(ev, f) { (oyentes[ev] = oyentes[ev] || []).push(f); },
    removeListener() {},
    connect: async () => true, disconnect() {}, activateElement: async () => {},
    setVolume: async () => {},                         // en móvil no se hacen fundidos de volumen
    getCurrentState: async () => actual(),
    async resume() { await api(conDisp('/me/player/play'), { method: 'PUT' }); if (snap) { snap.t = Date.now(); snap.playing = true; } pronto(); },
    async pause() { const a = actual(); if (snap && a) { snap.pos = a.position; snap.playing = false; } await api(conDisp('/me/player/pause'), { method: 'PUT' }); pronto(); },
    async togglePlay() { return snap && snap.playing ? this.pause() : this.resume(); },
    async nextTrack() { await api(conDisp('/me/player/next'), { method: 'POST' }); pronto(); },
    async previousTrack() { await api(conDisp('/me/player/previous'), { method: 'POST' }); pronto(); },
    async seek(ms) { await api(conDisp('/me/player/seek?position_ms=' + Math.round(ms)), { method: 'PUT' }); if (snap) { snap.pos = ms; snap.t = Date.now(); } pronto(); }
  };
  window.__mando = mando;

  // ---------- Activar el mando en lugar del reproductor web ----------
  function instalar() {
    // el reproductor web de Spotify no funciona en móvil: anulamos su arranque y lo sustituimos
    window.onSpotifyWebPlaybackSDKReady = () => {};
    if (!hay('player') || get('player') !== mando) {
      try { const p = hay('player') && get('player'); if (p && p.disconnect) p.disconnect(); } catch (e) {}
      asignar('player', 'window.__mando');
    }
  }
  if (modoMando) {
    instalar();
    let n = 0; const vigila = setInterval(() => { instalar(); if (++n > 20) clearInterval(vigila); }, 500);
  }

  async function conectar() {
    const go = $$('go');
    if (go) go.disabled = true;
    estado('Buscando la app de Spotify de tu móvil…');
    for (let i = 0; ; i++) {
      try {
        const d = await buscarDispositivo();
        if (d) {
          asignar('device', JSON.stringify(d.id));
          if (go) go.disabled = false;
          estado('Listo en tu móvil (' + d.name + '). Dale al botón.');
          sondear();
          return;
        }
      } catch (e) { console.warn('dispositivos:', e.message); }
      estado('Abre la app de Spotify en tu móvil y pon una canción un segundo; yo la encuentro sola.');
      await dormir(4000);
    }
  }
  if (modoMando) conectar();

  // Si Spotify dice "Device not found" (la app del móvil se durmió), buscamos el móvil otra vez y reintentamos
  const MSG_ABRIR = 'No encuentro tu Spotify. Abre la app de Spotify en el móvil, pon una canción un segundo y vuelve a pulsar.';
  if (modoMando && hay('reproducir')) {
    const original = get('reproducir');
    window.__movilRep = async function (uris, ...resto) {
      try { return await original.call(this, uris, ...resto); }
      catch (e) {
        if (!/404|not found/i.test(String(e.message))) throw e;
        const d = await buscarDispositivo().catch(() => null);
        if (!d) throw new Error(MSG_ABRIR);
        asignar('device', JSON.stringify(d.id));
        try { await api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [d.id], play: false }) }); } catch (e2) {}
        await dormir(800);
        try { return await original.call(this, uris, ...resto); }
        catch (e3) { throw new Error(MSG_ABRIR); }
      }
    };
    asignar('reproducir', 'window.__movilRep');
  }
  if (modoMando) setInterval(() => { if (!document.hidden) sondear(); }, 1500);

  // ---------- Al bloquear o salir: cola de seguridad para que no se pare la música ----------
  // iOS congela la página en cuanto sales: por eso es lo PRIMERO que se hace (sin esperar nada) y con peticiones
  // "keepalive", que el sistema deja terminar aunque la página ya esté congelada.
  let colaEn = false, ultimaCola = 0;
  const nota = (ok, motivo) => { try { localStorage.colchon = JSON.stringify({ t: Date.now(), ok, motivo }); } catch (e) {} };
  async function colchon() {
    if (colaEn || Date.now() - ultimaCola < 3 * 60 * 1000) return;
    if (!(hay('started') && get('started'))) return;
    if (!(hay('lib') && get('lib')) || !(hay('device') && get('device'))) { nota(0, 'sin biblioteca o reproductor'); return; }
    colaEn = true;
    try {
      const L = get('lib'), vistas = get('played')(), dev = get('device');
      const todo = get('shuffle')(get('uniq')(Object.values(L).flat()).filter((t) => !vistas.has(t.uri)));
      const gs = get('shuffle')(Object.keys(get('GRUPOS')).filter((g) => todo.filter((t) => t.g === g).length >= 4));
      const lista = [];
      gs.slice(0, 3).forEach((g) => lista.push(...todo.filter((t) => t.g === g).slice(0, 4)));
      if (lista.length < 8) lista.push(...todo.filter((t) => !lista.includes(t)).slice(0, 12 - lista.length));
      if (!lista.length) { nota(0, 'no quedan canciones nuevas'); return; }
     
      ultimaCola = Date.now();
      // todas a la vez y con keepalive (la función api de la página pasa estas opciones tal cual a fetch)
      const res = await Promise.all(lista.map((t) =>
        api('/me/player/queue?uri=' + encodeURIComponent(t.uri) + '&device_id=' + encodeURIComponent(dev), { method: 'POST', keepalive: true })
          .then(() => 204, (e) => (String(e.message).match(/^\d+/) || [0])[0])));
      const puestas = lista.filter((t, i) => res[i] >= 200 && res[i] < 300);
      if (puestas.length) {
        const v = get('played')(); puestas.forEach((t) => v.add(t.uri)); get('savePlayed')(v);
        asignar('lastUri', JSON.stringify(puestas[puestas.length - 1].uri));   // para que al acabar la cola vuelva a hablar el DJ
      } else ultimaCola = 0;
      nota(puestas.length, puestas.length ? 'ok' : 'Spotify rechazó la cola (' + res[0] + ')');
    } catch (e) { console.warn('cola:', e.message); nota(0, e.message); ultimaCola = 0; } finally { colaEn = false; }
  }
  async function estadoActual() {
    try {
      if (modoMando) return actual();
      const p = hay('player') && get('player');
      return p && p.getCurrentState ? await p.getCurrentState() : null;
    } catch (e) { return null; }
  }

  // Al volver a la web: si la música se acabó mientras estabas fuera, la radio sigue sola (con el DJ)
  let ocultoDesde = 0;
  async function revisarAlVolver() {
    const hueco = Date.now() - ocultoDesde;
    await dormir(1200);                             // damos tiempo al reproductor a despertar
    try {
      const c = JSON.parse(localStorage.colchon || 'null');
      if (c && Date.now() - c.t < 6 * 3600 * 1000) { estado(c.ok ? 'Al salir dejé ' + c.ok + ' canciones en cola para que no se parase.' : 'Al salir no pude dejar cola: ' + c.motivo); setTimeout(() => { const e = $$('st'); if (e && /^Al salir/.test(e.textContent)) e.textContent = ''; }, 6000); localStorage.removeItem('colchon'); }
    } catch (e) {}
    if (!(hay('started') && get('started')) || (hay('busy') && get('busy')) || !hay('nextBatch')) return;
    const s = await estadoActual();
    const t = s && s.track_window && s.track_window.current_track;
    const terminado = !s || !t
      ? hueco > 20000
      : s.paused && s.position < 2000 && (hueco > 15000 || (s.track_window.previous_tracks || []).some((x) => x.id === t.id));
    if (terminado) get('nextBatch')(false);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ocultoDesde = Date.now(); colchon(); }
    else if (modoMando) sondear(); else revisarAlVolver();
  });
  window.addEventListener('pagehide', () => { ocultoDesde = Date.now(); colchon(); });
  window.addEventListener('pageshow', (e) => { if (modoMando) sondear(); else if (e.persisted) revisarAlVolver(); });
})();
