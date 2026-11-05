// Arreglo del "se queda parado en la primera canción del bloque".
// Causa: si pulsas ⏭ muy rápido, la web lee la canción ANTES de que cambie y cree que aún no es la última del bloque;
// el reproductor pasa de la última canción y vuelve a la primera, en pausa, sin que el DJ arranque el bloque siguiente.
// Aquí: (1) cada ⏭ espera a que termine el anterior y mira la canción real, y si es la última pasa al bloque siguiente;
//       (2) una vigilancia detecta ese estado raro (acabó el bloque y volvió a la primera, en pausa) y arranca el siguiente bloque.
(function () {
  'use strict';
  if (window.__bloques) return;
  window.__bloques = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const $$ = (id) => document.getElementById(id);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const valor = (n, d) => (hay(n) ? get(n) : d);
  const actual = (s) => s && s.track_window && s.track_window.current_track;

  // ---------- (1) ⏭ ordenado ----------
  let enCurso = Promise.resolve();
  function envolver(pl) {
    if (!pl || pl.__bloques || pl.mando || typeof pl.nextTrack !== 'function' || typeof pl.getCurrentState !== 'function') return;
    pl.__bloques = true;
    const original = pl.nextTrack.bind(pl);
    pl.nextTrack = function () {
      const p = enCurso.then(async () => {
        const s = await pl.getCurrentState().catch(() => null);
        const t = actual(s);
        const ultima = t && (t.uri === valor('lastUri', '') || !((s.track_window.next_tracks || []).length));
        if (valor('started', false) && ultima) {          // era la última del bloque: toca el DJ y el bloque siguiente
          if (!valor('busy', false) && hay('nextBatch')) { await pl.pause(); get('nextBatch')(false); }
          return;
        }
        await original();
        for (let i = 0; i < 15; i++) {                     // esperamos a que la canción cambie de verdad (máx. 1,5 s)
          await dormir(100);
          const t2 = actual(await pl.getCurrentState().catch(() => null));
          if (!t || !t2 || t2.uri !== t.uri) break;
        }
      });
      enCurso = p.catch(() => {});
      return p;
    };
  }

  // ---------- (2) Vigilancia: "acabó el bloque y volvió a la primera, en pausa" ----------
  let ultimoLast = '', visto = false, raro = 0, manual = false;
  ['prev', 'pp'].forEach((id) => { const b = $$(id); if (b) b.addEventListener('click', () => { manual = true; }, true); });   // si vas atrás o pausas tú, no interviene

  setInterval(async () => {
    try {
      const pl = hay('player') && get('player');
      envolver(pl);
      if (!pl || !pl.getCurrentState || !valor('started', false)) return;
      const last = valor('lastUri', '');
      if (last !== ultimoLast) { ultimoLast = last; visto = false; raro = 0; manual = false; }
      if (valor('busy', false)) { raro = 0; return; }
      const s = await pl.getCurrentState();
      const t = actual(s);
      if (!t) return;
      if (t.uri === last) visto = true;
      const alReves = visto && !manual && s.paused && s.position < 1500 && t.uri !== last && !(s.track_window.previous_tracks || []).length;
      raro = alReves ? raro + 1 : 0;
      if (raro >= 2) { raro = 0; visto = false; get('nextBatch')(false); }
    } catch (e) {}
  }, 1000);
})();
