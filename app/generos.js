// Estilos automáticos (sin IA, sin enviar nada a nadie): usa los géneros que Spotify ya da de cada artista,
// y los traduce a tus estilos (reggaetón, rap, R&B, pop, electrónica, afrobeat) con reglas escritas a mano.
// Solo mira artistas que el diccionario no conocía, de pocos en pocos, en segundo plano y sin molestar a la música.
// Después, lo que siga sin estilo se deduce por colaboraciones (con quién sale en las canciones de tu biblioteca).
// Las etiquetas que pongas tú a mano (gustos.js) siempre mandan sobre esto. Si algo falla, todo sigue como antes.
(function () {
  'use strict';
  if (window.__generos) return;
  window.__generos = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const asignar = (n, expr) => { try { (0, eval)(n + ' = ' + expr); } catch (e) {} };
  const LS = localStorage;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const DIA = 864e5;

  const MAX_POR_TANDA = 30, MAX_POR_SESION = 240, PAUSA = 450, ENTRE_TANDAS = 90 * 1000;

  // género de Spotify -> estilo de la radio (cada género "vota"; gana el estilo con más votos)
  const REGLAS = [
    ['afrobeat', /afrobeat|afropop|afroswing|amapiano|afro house|afro fusion|naija|nigerian|ghanaian|azonto|highlife|alte$|coupe decale|afro trap/],
    ['reggaeton', /reggaeton|urbano|trap latino|trap argentino|dembow|perreo|moombahton|rkt|corrido tumbado|latin viral/],
    ['rap', /hip hop|\brap\b|rap |trap|drill|grime|boom bap|cloud rap|phonk|crunk/],
    ['rnb', /r&b|\brnb\b|soul|funk|quiet storm|urban contemporary|neo mellow/],
    ['electronica', /house|techno|electro|edm|dance|trance|dubstep|drum and bass|bass|synthwave|big room|downtempo|ambient|idm|lo-fi|lofi/],
    ['pop', /pop|singer-songwriter|boy band|girl group/]
  ];
  const PRIORIDAD = ['afrobeat', 'reggaeton', 'rap', 'rnb', 'electronica', 'pop'];
  function estiloDeGeneros(gs) {
    const v = {};
    (gs || []).forEach((g) => { const t = String(g).toLowerCase(); const r = REGLAS.find(([, re]) => re.test(t)); if (r) v[r[0]] = (v[r[0]] || 0) + 1; });
    const k = Object.keys(v); if (!k.length) return '';
    return k.sort((a, b) => v[b] - v[a] || PRIORIDAD.indexOf(a) - PRIORIDAD.indexOf(b))[0];
  }

  // ---------- Caché (se borra a los 30 días o al cerrar sesión, ver privacidad.js) ----------
  const KEY = 'genArt';
  let C = {};
  try { C = JSON.parse(LS[KEY] || '{}') || {}; } catch (e) {}
  const guardar = () => { try { LS[KEY] = JSON.stringify(C); } catch (e) {} };

  const arte = (t) => (t && t.artists && t.artists[0]) || null;
  const todas = (L) => [...new Map(Object.values(L || {}).flat().filter((t) => t && t.uri).map((t) => [t.uri, t])).values()];
  const sinEstilo = (t) => !t.g || t.g === 'otros';
  function grupo() { try { const GR = get('GRUPOS'); if (GR && !GR.afrobeat) GR.afrobeat = { nombre: 'afrobeat', re: /afro|amapiano/ }; } catch (e) {} }

  // aplica lo que ya se sabe (caché de géneros + colaboraciones) a las canciones sin estilo
  function marcar(L) {
    if (!L) return 0;
    grupo(); let n = 0;
    const lista = todas(L);
    lista.forEach((t) => { const a = arte(t); if (a && a.id && sinEstilo(t) && C[a.id] && C[a.id].g) { t.g = C[a.id].g; n++; } });
    // colaboraciones: el estilo de quien sale contigo en las canciones de tu biblioteca
    const estiloDe = {};                        // nombre normalizado -> estilo (de artistas ya clasificados)
    lista.forEach((t) => { const a = arte(t); if (a && !sinEstilo(t)) estiloDe[norm(a.name)] = t.g; });
    const votos = {};
    lista.forEach((t) => {
      const a = arte(t); if (!a || !sinEstilo(t) || (t.artists || []).length < 2) return;
      const k = norm(a.name); const v = votos[k] || (votos[k] = {});
      t.artists.slice(1).forEach((o) => { const e = estiloDe[norm(o.name)]; if (e) v[e] = (v[e] || 0) + 1; });
    });
    const decide = {};
    Object.keys(votos).forEach((k) => {
      const v = votos[k], tot = Object.values(v).reduce((a, b) => a + b, 0); if (tot < 2) return;
      const mejor = Object.keys(v).sort((a, b) => v[b] - v[a])[0];
      if (v[mejor] / tot >= 0.6) decide[k] = mejor;
    });
    lista.forEach((t) => { const a = arte(t); if (a && sinEstilo(t) && decide[norm(a.name)]) { t.g = decide[norm(a.name)]; n++; } });
    return n;
  }

  // ---------- Preguntar a Spotify por los géneros de los artistas que faltan ----------
  let corriendo = false, parar = false, usadas = 0, resueltos = 0, pendientes = 0;
  const caducado = (e) => !e || Date.now() - e.t > 30 * DIA;
  async function tanda() {
    if (corriendo || parar || !hay('lib') || !get('lib') || !hay('api')) return;
    corriendo = true;
    try {
      const L = get('lib'), cuenta = {};
      todas(L).forEach((t) => { const a = arte(t); if (a && a.id && sinEstilo(t) && caducado(C[a.id])) { const e = cuenta[a.id] || (cuenta[a.id] = { id: a.id, c: 0 }); e.c++; } });
      const faltan = Object.values(cuenta).sort((x, y) => y.c - x.c);
      pendientes = faltan.length;
      let hechos = 0;
      for (const e of faltan) {
        if (hechos >= MAX_POR_TANDA || usadas >= MAX_POR_SESION || parar) break;
        if (hay('busy') && get('busy')) { await dormir(2000); }   // si el DJ está arrancando un bloque, no estorbamos
        try {
          const d = await get('api')('/artists/' + e.id);
          C[e.id] = { g: estiloDeGeneros(d && d.genres), t: Date.now() };
          hechos++; usadas++; if (C[e.id].g) resueltos++;
        } catch (er) {
          if (/^429|^401|^403/.test(String(er.message))) { parar = true; break; }   // demasiadas peticiones o sin permiso: paramos hasta recargar
          C[e.id] = { g: '', t: Date.now() }; hechos++; usadas++;                    // artista raro/borrado: no insistimos
        }
        await dormir(PAUSA);
      }
      guardar();
      if (marcar(L) && hay('saveLib')) get('saveLib')(L);
    } catch (e) { console.warn('generos:', e.message); } finally { corriendo = false; }
    if (!parar && usadas < MAX_POR_SESION && pendientes > MAX_POR_TANDA) setTimeout(tanda, ENTRE_TANDAS);
  }

  if (hay('cachedLib')) {
    const o = get('cachedLib'); let vista = null;
    window.__generosCached = function (...a) { const L = o.apply(this, a); try { if (L) { marcar(L); if (vista !== L) { vista = L; setTimeout(tanda, 8000); } } } catch (e) {} return L; };
    asignar('cachedLib', 'window.__generosCached');
  }
  if (hay('loadLib')) {
    const o = get('loadLib');
    window.__generosLoad = async function (...a) { const L = await o.apply(this, a); try { marcar(L); if (hay('saveLib')) get('saveLib')(L); setTimeout(tanda, 8000); } catch (e) {} return L; };
    asignar('loadLib', 'window.__generosLoad');
  }
  try { const L = hay('lib') && get('lib'); if (L) { marcar(L); setTimeout(tanda, 8000); } } catch (e) {}

  window.IcemanGeneros = { estiloDeGeneros, marcar, tanda, estado: () => ({ pendientes, resueltos, usadas, parado: parar }) };
})();
