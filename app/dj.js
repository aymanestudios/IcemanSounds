// El DJ que te conoce (Fase 3). Reacciona a lo que haces, SIEMPRE entre bloques (nunca encima de la música):
//  - 3 saltos seguidos  -> el DJ lo comenta, para la música y cambia de estilo.
//  - ♥ en una canción   -> comenta que la apunta entre tus favoritas (en el siguiente bloque).
//  - 3 bloques seguidos del mismo estilo -> comenta la racha.
// Usa frases ya grabadas (/dj/extra), sin pasar tu perfil a Claude. Si algo falla, habla el DJ de siempre.
(function () {
  'use strict';
  if (window.__djExtra) return;
  window.__djExtra = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const asignar = (n, expr) => { try { (0, eval)(n + ' = ' + expr); } catch (e) {} };
  const $$ = (id) => document.getElementById(id);
  const SRV = () => (hay('SERVER') ? get('SERVER') : location.origin);
  const activado = () => localStorage.djcom !== 'off';

  const MIN_ENTRE_COMENTARIOS = 5 * 60 * 1000;   // ♥, rachas y chequeos: máximo uno cada 5 minutos
  const MIN_ENTRE_SALTOS = 90 * 1000;            // reacción a los saltos: como mucho cada minuto y medio
  const BLOQUES_CHEQUEO = 4;                      // "¿qué tal vamos?" cada 4 bloques, si no ha habido otro comentario
  let pendiente = null, ultimoComentario = 0, ultimoSaltos = 0, ultimoTipo = '', ultimaFrase = '', bloquesDesde = 0;
  const estilos = [];                              // estilo (mayoritario) de los últimos bloques

  const mayoritario = (batch) => {
    const c = {}; (batch || []).forEach((t) => { if (t && t.g) c[t.g] = (c[t.g] || 0) + 1; });
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || null;
  };

  // ---------- Hablar: igual que el DJ normal (voz, texto en pantalla, pingüino), pero con tiempos máximos ----------
  async function hablar(tipo) {
    const ctl = new AbortController(), cortar = setTimeout(() => ctl.abort(), 12000);
    let r;
    try {
      const tok = await get('token')();
      r = await fetch(SRV() + '/dj/extra?tipo=' + encodeURIComponent(tipo), { headers: { Authorization: 'Bearer ' + tok }, signal: ctl.signal });
    } finally { clearTimeout(cortar); }
    if (!r.ok) throw new Error('dj/extra ' + r.status);
    const frase = decodeURIComponent(r.headers.get('X-Texto') || '');
    const a = new Audio(URL.createObjectURL(await r.blob()));
    a.volume = hay('VOL') ? get('VOL') : 0.8;
    if (frase && hay('animar') && $$('dj')) get('animar')($$('dj'), frase);
    if ($$('cover')) $$('cover').classList.add('talk');
    try {
      await new Promise((res) => { const t = setTimeout(res, 25000); a.onended = a.onerror = () => { clearTimeout(t); res(); }; a.play().catch(() => { clearTimeout(t); res(); }); });
    } finally { if ($$('dj')) $$('dj').textContent = ''; if ($$('cover')) $$('cover').classList.remove('talk'); }
    ultimaFrase = frase;
  }

  // ---------- ¿Toca comentar algo en este bloque? ----------
  function elegir(first, intro) {
    if (first || intro || !activado()) return null;
    const ahora = Date.now();
    if (pendiente === 'saltos' || pendiente === 'saltos_repetido') { const t = pendiente; pendiente = null; return t; }
    if (ahora - ultimoComentario < MIN_ENTRE_COMENTARIOS) return null;
    if (pendiente === 'like') { pendiente = null; return ultimoTipo === 'like' ? null : 'like'; }
    const u = estilos.slice(-3);
    if (u.length === 3 && u[0] && u.every((g) => g === u[0])) {
      const tipo = 'racha_' + u[0];
      if (tipo !== ultimoTipo) { estilos.length = 0; return tipo; }
    }
    if (bloquesDesde >= BLOQUES_CHEQUEO) return 'chequeo';
    return null;
  }

  // ---------- Enganche con la radio: se cambia `decir` (lo que dice el DJ antes de cada bloque) ----------
  if (hay('decir')) {
    const original = get('decir');
    window.__djDecir = async function (batch, first, tema, texto, ...resto) {
      const intro = tema === 'intro';
      if (!intro) { estilos.push(mayoritario(batch)); bloquesDesde++; }
      const tipo = elegir(first, intro);
      if (tipo) {
        try {
          await hablar(tipo);
          ultimoTipo = tipo; ultimoComentario = Date.now(); bloquesDesde = 0;
          return;                                  // el comentario sustituye a la frase habitual de este bloque
        } catch (e) { console.warn('DJ extra:', e.message); }   // si falla, habla el DJ de siempre
      }
      return original.call(this, batch, first, tema, texto, ...resto);
    };
    asignar('decir', 'window.__djDecir');
  }

  // ---------- Lo que usa el perfil ----------
  function listo() { return activado() && hay('started') && get('started') && hay('nextBatch') && hay('player') && get('player'); }
  window.IcemanDJ = {
    // devuelve true si el DJ se encarga (para que no salga el aviso de siempre)
    reaccionSaltos(generos) {
      if (!listo() || Date.now() - ultimoSaltos < MIN_ENTRE_SALTOS) return false;
      if (hay('busy') && get('busy')) return false;    // ya está arrancando un bloque (p. ej. al saltar la última canción): no nos metemos en medio
      const ahora = Date.now();
      pendiente = ahora - ultimoSaltos < 10 * 60 * 1000 ? 'saltos_repetido' : 'saltos';   // 2.ª vez en poco tiempo: te anima a usar el chat
      ultimoSaltos = ahora;
      window.__cambioDe = { g: [...new Set((generos || []).filter(Boolean))], t: ahora };   // el perfil evita ese estilo en el próximo bloque
      (async () => {
        try {
          const s = await get('player').getCurrentState();
          const t = s && s.track_window && s.track_window.current_track;
          if (hay('busy') && get('busy')) { pendiente = null; return; }
          if (t && t.uri === get('lastUri')) return;   // es la última del bloque: el siguiente ya viene y el DJ lo comenta ahí
          await get('player').pause();
          if (hay('busy') && get('busy')) return;
          get('nextBatch')(false);
        } catch (e) { console.warn('DJ extra:', e.message); }
      })();
      return true;
    },
    nota(tipo) { if (tipo === 'like' && activado() && !pendiente) pendiente = 'like'; },
    activado
  };
})();
