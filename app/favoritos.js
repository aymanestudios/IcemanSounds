// Bloques con tus artistas favoritos, de TODA su discografía (no solo lo que tienes guardado).
// A veces (1 de cada ~3 bloques) la radio cambia el bloque por uno de un artista que te gusta (los de tu top de Spotify y los que más
// tienes en tus Me gusta/playlists): 2 canciones que ya tienes + clásicos de sus discos antiguos + lo más reciente.
// - Solo si el artista encaja con el estilo del bloque que iba a sonar (si no, se deja el bloque como estaba).
// - Prepara las discografías en segundo plano: si no están listas o algo falla, el bloque original suena igual, sin esperas.
// - No se mete cuando tú pides algo concreto (chat, 🎤) ni en el primer bloque de la sesión.
(function () {
  'use strict';
  if (window.__favoritos) return;
  window.__favoritos = true;

  const PROB = 0.35;          // probabilidad de cambiar un bloque por uno de artista favorito
  const MAX_PRECARGADOS = 8;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const asignar = (n, expr) => { try { (0, eval)(n + ' = ' + expr); } catch (e) {} };
  const $$ = (id) => document.getElementById(id);
  const api = (p) => get('api')(p);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const mezclar = (a) => [...a].sort(() => Math.random() - 0.5);
  const ANIO = new Date().getFullYear();
  const NO_VALE = /instrumental|karaoke|acapella|a cappella|sped up|slowed|nightcore|\blive\b|en vivo|remix|version|demo/i;

  const memo = {};            // id artista -> { art, g, viejos:[], nuevos:[] }
  let favs = null, cargando = false, llamadas = 0, ultimoArtista = '';

  const libs = () => (hay('lib') && get('lib')) || null;
  const todas = () => Object.values(libs() || {}).flat();
  const principal = (t) => (t && t.artists && t.artists[0]) || null;

  // género dominante de un artista según tu biblioteca
  function generoDe(nombre) {
    const c = {};
    todas().forEach((t) => { const a = principal(t); if (a && norm(a.name) === norm(nombre) && t.g) c[t.g] = (c[t.g] || 0) + 1; });
    return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || null;
  }

  // ---------- Quiénes son tus favoritos ----------
  async function cargarFavs() {
    if (favs) return favs;
    try { const c = JSON.parse(localStorage.favArtistas || 'null'); if (c && Date.now() - c.t < 12 * 3600 * 1000 && c.l.length) return (favs = c.l); } catch (e) {}
    const out = [];
    for (const rango of ['long_term', 'medium_term']) {
      try { ((await api('/me/top/artists?time_range=' + rango + '&limit=20')).items || []).forEach((a) => a && a.id && out.push({ id: a.id, name: a.name })); } catch (e) {}
    }
    const cuenta = {};                                   // y los que más tienes en tu biblioteca
    todas().forEach((t) => { const a = principal(t); if (a && a.id) { const k = a.id; cuenta[k] = cuenta[k] || { id: a.id, name: a.name, n: 0 }; cuenta[k].n++; } });
    Object.values(cuenta).sort((a, b) => b.n - a.n).slice(0, 12).forEach((a) => out.push({ id: a.id, name: a.name }));
    favs = [...new Map(out.map((a) => [a.id, a])).values()];
    try { localStorage.favArtistas = JSON.stringify({ t: Date.now(), l: favs }); } catch (e) {}
    return favs;
  }

  // ---------- Discografía: antiguas y recientes ----------
  async function discografia(art) {
    const items = ((await api('/artists/' + art.id + '/albums?include_groups=album,single&limit=50')).items) || [];
    const vistos = new Set();
    const albums = items.filter((a) => a && a.id && !vistos.has(norm(a.name)) && vistos.add(norm(a.name)))
      .map((a) => ({ id: a.id, y: parseInt(String(a.release_date || '').slice(0, 4), 10) || 0 })).filter((a) => a.y);
    if (!albums.length) return null;
    let viejosA = albums.filter((a) => a.y <= ANIO - 5), nuevosA = albums.filter((a) => a.y >= ANIO - 2);
    if (!viejosA.length) viejosA = albums.filter((a) => !nuevosA.includes(a));
    if (!nuevosA.length) nuevosA = albums.filter((a) => !viejosA.includes(a));
    const g = generoDe(art.name);
    const pistas = async (lista) => {
      const out = [];
      for (const a of mezclar(lista).slice(0, 2)) {
        try {
          const tr = ((await api('/albums/' + a.id + '/tracks?limit=50')).items) || [];
          tr.filter((t) => t && t.uri && t.uri.startsWith('spotify:track:') && (t.artists || []).some((x) => x.id === art.id) && !NO_VALE.test(t.name))
            .forEach((t) => out.push({ uri: t.uri, name: t.name, g, artists: (t.artists || []).map((x) => ({ id: x.id, name: x.name })) }));
        } catch (e) {}
        await dormir(300);
      }
      return mezclar(out).slice(0, 6);
    };
    const viejos = await pistas(viejosA), nuevos = await pistas(nuevosA);
    return viejos.length + nuevos.length >= 3 ? { art, g, viejos, nuevos } : null;
  }

  async function precargar() {
    if (cargando || Object.keys(memo).length >= MAX_PRECARGADOS || !libs()) return;
    cargando = true;
    try {
      const f = await cargarFavs();
      const faltan = mezclar(f.filter((a) => !(a.id in memo)));
      for (const a of faltan.slice(0, 2)) {
        try { memo[a.id] = (await discografia(a)) || { art: a, g: null, viejos: [], nuevos: [] }; } catch (e) { memo[a.id] = { art: a, g: null, viejos: [], nuevos: [] }; }
        await dormir(400);
      }
    } catch (e) { console.warn('favoritos:', e.message); } finally { cargando = false; }
  }

  // ---------- ¿Cambiamos este bloque por uno de un favorito? ----------
  function bloqueDe(uris) {
    if (!Array.isArray(uris) || uris.length < 2 || window.__directo) return null;
    if (!(hay('started') && get('started')) || llamadas < 2) return null;            // el primer bloque de la sesión no se toca
    if (window.__cambioDe && Date.now() - window.__cambioDe.t < 3 * 60 * 1000) return null;   // el perfil está cambiando de estilo por tus saltos
    if (Math.random() >= PROB) return null;
    const porUri = new Map(todas().map((t) => [t.uri, t]));
    const cuenta = {};
    uris.forEach((u) => { const t = porUri.get(u); if (t && t.g) cuenta[t.g] = (cuenta[t.g] || 0) + 1; });
    const estilo = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0] || null;
    const candidatos = Object.values(memo).filter((m) => m.art && m.art.id !== ultimoArtista && m.viejos.length + m.nuevos.length >= 3 && estilo && m.g === estilo);
    if (!candidatos.length) return null;
    const m = candidatos[Math.floor(Math.random() * candidatos.length)];
    const vistas = hay('played') ? get('played')() : new Set();
    const libres = (l) => l.filter((t) => !vistas.has(t.uri));
    const conocidas = mezclar(todas().filter((t) => { const a = principal(t); return a && a.id === m.art.id && !vistas.has(t.uri); })).slice(0, 2);
    const viejas = libres(m.viejos).slice(0, 2), nuevas = libres(m.nuevos).slice(0, 2);
    const orden = [conocidas[0], viejas[0], nuevas[0], conocidas[1], viejas[1], nuevas[1]].filter(Boolean);
    const lista = [...new Map(orden.map((t) => [t.uri, t])).values()];
    if (lista.length < 4) return null;
    const partes = [conocidas.length ? 'las que ya tienes' : '', viejas.length ? 'clásicos' : '', nuevas.length ? 'lo último' : ''].filter(Boolean);
    const texto = 'Bloque de ' + m.art.name + ': ' + partes.join(', ').replace(/, ([^,]*)$/, ' y $1');
    return { uris: lista.map((t) => t.uri), artista: m.art.id, texto };
  }

  // ---------- Enganche con la radio ----------
  if (hay('reproducir')) {
    const original = get('reproducir');
    window.__favRep = async function (uris, ...resto) {
      llamadas++;
      let texto = '';
      try {
        const b = bloqueDe(uris);
        if (b) {
          const ultimaAntes = uris[uris.length - 1];
          if (hay('lastUri') && get('lastUri') === ultimaAntes) asignar('lastUri', JSON.stringify(b.uris[b.uris.length - 1]));   // el final del bloque lo detecta la radio con lastUri
          if (hay('played') && hay('savePlayed')) { const v = get('played')(); b.uris.forEach((u) => v.add(u)); get('savePlayed')(v); }
          ultimoArtista = b.artista; texto = b.texto; uris = b.uris;
        }
      } catch (e) { console.warn('favoritos:', e.message); }
      let r;
      try { r = await original.call(this, uris, ...resto); }
      finally { setTimeout(precargar, 2500); }
      if (texto && hay('animar') && $$('dj')) { get('animar')($$('dj'), texto); setTimeout(() => { const d = $$('dj'); if (d && d.textContent.replace(/ /g, ' ') === texto) d.textContent = ''; }, 7000); }
      return r;
    };
    asignar('reproducir', 'window.__favRep');
  }
  setTimeout(precargar, 4000);
})();
