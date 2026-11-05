// Modo móvil de Iceman Sounds.
// En iPhone/Android el reproductor web de Spotify no funciona, así que aquí la web hace de MANDO:
// controla la app de Spotify de tu móvil (Spotify Connect) y la radio sigue funcionando igual.
// Solo se activa en móvil (o con ?movil=1 en la dirección, para probar desde el PC). En PC no hace nada.
//
// Límites reales de iOS (no se pueden saltar desde una web):
//  - Con la pantalla bloqueada el iPhone congela la página: el DJ no puede hablar y la radio no puede elegir el siguiente bloque.
//  - Por eso, justo al bloquear/salir, se añaden unas canciones a la cola de Spotify para que la música NO se pare,
//    y al volver a abrir la web la radio retoma sola, con el DJ.
(function () {
  'use strict';
  if (window.__movil) return;
  const esMovil = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || /[?&]movil=1/.test(location.search);
  if (!esMovil) return;
  window.__movil = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const asignar = (n, expr) => { try { (0, eval)(n + ' = ' + expr); } catch (e) {} };
  const $$ = (id) => document.getElementById(id);
  const api = (p, o) => get('api')(p, o);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const estado = (t) => { const s = $$('st'); if (s) s.textContent = t; };

  // En móvil el volumen lo controlan los botones del teléfono; el deslizador no tendría efecto
  const css = document.createElement('style');
  css.textContent = '.vol{display:none!important}';
  document.head.append(css);

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
  instalar();
  let n = 0; const vigila = setInterval(() => { instalar(); if (++n > 20) clearInterval(vigila); }, 500);

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
  conectar();

  // Si Spotify dice "Device not found" (la app del móvil se durmió), buscamos el móvil otra vez y reintentamos
  const MSG_ABRIR = 'No encuentro tu Spotify. Abre la app de Spotify en el móvil, pon una canción un segundo y vuelve a pulsar.';
  if (hay('reproducir')) {
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
  setInterval(() => { if (!document.hidden) sondear(); }, 1500);

  // ---------- Al bloquear o salir: cola de seguridad para que no se pare la música ----------
  let colaEn = false, ultimaCola = 0;
  async function colchon() {
    if (colaEn || Date.now() - ultimaCola < 10 * 60 * 1000) return;
    if (!(hay('started') && get('started')) || !snap || !snap.playing || !(hay('lib') && get('lib')) || !(hay('device') && get('device'))) return;
    colaEn = true; ultimaCola = Date.now();
    try {
      const L = get('lib'), vistas = get('played')();
      const todo = get('shuffle')(get('uniq')(Object.values(L).flat()).filter((t) => !vistas.has(t.uri)));
      const gs = Object.keys(get('GRUPOS')).filter((g) => todo.filter((t) => t.g === g).length >= 4);
      const lista = [];
      const g1 = gs[Math.floor(Math.random() * gs.length)];
      if (g1) lista.push(...todo.filter((t) => t.g === g1).slice(0, 4));
      const g2 = gs.filter((g) => g !== g1)[0];
      lista.push(...(g2 ? todo.filter((t) => t.g === g2).slice(0, 4) : todo.filter((t) => !lista.includes(t)).slice(0, 4)));
      const puestas = [];
      for (const t of lista) {
        try { await api('/me/player/queue?uri=' + encodeURIComponent(t.uri) + '&device_id=' + encodeURIComponent(get('device')), { method: 'POST' }); puestas.push(t.uri); }
        catch (e) { break; }
      }
      if (puestas.length) { const v = get('played')(); puestas.forEach((u) => v.add(u)); get('savePlayed')(v); }
    } catch (e) { console.warn('cola:', e.message); } finally { colaEn = false; }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) colchon(); else { sondear(); } });
  window.addEventListener('pagehide', colchon);
  window.addEventListener('pageshow', () => sondear());
})();
