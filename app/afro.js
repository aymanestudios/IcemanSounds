// Estilo AFROBEAT (afrobeats, afropop, amapiano, afroswing...). Se añade como un estilo más de la radio, sin tocar tu HTML ni server.js.
// El servidor (diccionario escrito a mano, sin IA) dice qué artistas de tu biblioteca son afro; se guarda en tu navegador unos días y solo se pregunta por artistas nuevos.
// Si algo falla, todo sigue como antes (esas canciones quedan en su estilo de siempre).
(function () {
  'use strict';
  if (window.__afro) return;
  window.__afro = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const asignar = (n, expr) => { try { (0, eval)(n + ' = ' + expr); } catch (e) {} };
  const SRV = () => (hay('SERVER') ? get('SERVER') : location.origin);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  let mapa = {};
  try { mapa = JSON.parse(localStorage.afroMapa || '{}'); } catch (e) {}
  const guardar = () => { try { localStorage.afroMapa = JSON.stringify(mapa); } catch (e) {} };

  function grupo() {
    try { const G = get('GRUPOS'); if (G && !G.afrobeat) G.afrobeat = { nombre: 'afrobeat', re: /afro|amapiano/ }; } catch (e) {}
  }
  const nombreDe = (t) => t && t.artists && t.artists[0] && t.artists[0].name;
  const todas = (L) => Object.values(L || {}).flat();

  function marcar(L) {
    grupo();
    let n = 0;
    todas(L).forEach((t) => { const a = nombreDe(t); if (a && mapa[a] === 1 && t.g !== 'afrobeat') { t.g = 'afrobeat'; n++; } });
    return n;
  }

  let corriendo = false;
  async function clasificar(L) {
    if (corriendo || !L) return;
    corriendo = true;
    try {
      const cuenta = {};
      todas(L).forEach((t) => { const a = nombreDe(t); if (a && !(a in mapa)) cuenta[a] = (cuenta[a] || 0) + 1; });
      const faltan = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]).slice(0, 300);
      for (let i = 0; i < faltan.length; i += 100) {
        const lote = faltan.slice(i, i + 100);
        const r = await fetch(SRV() + '/afro/clasificar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await get('token')()) },
          body: JSON.stringify({ artistas: lote })
        });
        if (!r.ok) break;
        const d = await r.json();
        const afro = new Set(d.afro || []);
        lote.forEach((a) => { mapa[a] = afro.has(a) ? 1 : 0; });
        guardar();
        if (marcar(L) && hay('saveLib')) get('saveLib')(L);
        await dormir(400);
      }
    } catch (e) { console.warn('afro:', e.message); } finally { corriendo = false; }
  }

  grupo();
  // Al cargar la biblioteca de cero: se clasifica antes de empezar (máx. 20 s)
  if (hay('loadLib')) {
    const original = get('loadLib');
    window.__afroLoadLib = async function (...a) {
      const L = await original.apply(this, a);
      try { marcar(L); await Promise.race([clasificar(L), dormir(20000)]); if (hay('saveLib')) get('saveLib')(L); } catch (e) {}
      return L;
    };
    asignar('loadLib', 'window.__afroLoadLib');
  }
  // Al usar la biblioteca guardada: se aplica lo que ya sabemos y lo nuevo se clasifica en segundo plano
  if (hay('cachedLib')) {
    const original = get('cachedLib');
    let vista = null;
    window.__afroCachedLib = function (...a) {
      const L = original.apply(this, a);
      if (L) { marcar(L); if (vista !== L) { vista = L; clasificar(L); } }
      return L;
    };
    asignar('cachedLib', 'window.__afroCachedLib');
  }
})();
