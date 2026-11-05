// Gustos de Iceman Sounds (Fase 1): lo que TÚ decides, con reglas escritas a mano (sin IA y sin enviar nada a ningún servidor).
//  1) Mis estilos: para cada estilo eliges Menos / Normal / Más. Menos = aparece mucho menos; Más = aparece más.
//  2) Variedad de artistas: "Alta" evita repetir artista dentro de un bloque y respecto a los dos bloques anteriores.
//  3) Artistas sin estilo: les pones tú el estilo con un toque (el diccionario no los conoce) y la radio los agrupa mejor.
// Se engancha en `decir` (justo antes de que el DJ presente cada bloque): así la frase del DJ siempre coincide con lo que suena.
// Si algo falla aquí, suena el bloque original de siempre.
(function () {
  'use strict';
  if (window.__gustos) return;
  window.__gustos = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const asignar = (n, expr) => { try { (0, eval)(n + ' = ' + expr); } catch (e) {} };
  const LS = localStorage;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const mezclar = (a) => [...a].sort(() => Math.random() - 0.5);

  const EST = [['reggaeton', 'reggaetón'], ['rap', 'hip hop y rap'], ['rnb', 'R&B y soul'], ['pop', 'pop'], ['electronica', 'electrónica'], ['afrobeat', 'afrobeat']];
  const NOMBRE = Object.fromEntries(EST), CLAVES = EST.map((e) => e[0]);
  const P_MENOS = 0.75, P_MAS = 0.2;          // probabilidades de cambiar un bloque de un estilo "menos" / de empujar uno "más"

  // ---------- Ajustes (los eliges tú; se guardan en este dispositivo) ----------
  const KEY = 'estilos_v1';
  const vacio = () => ({ v: 1, mas: [], menos: [], variedad: 'alta', tags: {} });
  const cargar = () => {
    try { const g = JSON.parse(LS[KEY]); if (g && g.v === 1) return { v: 1, mas: (g.mas || []).filter((x) => CLAVES.includes(x)), menos: (g.menos || []).filter((x) => CLAVES.includes(x)), variedad: g.variedad === 'normal' ? 'normal' : 'alta', tags: g.tags && typeof g.tags === 'object' ? g.tags : {} }; } catch (e) {}
    return vacio();
  };
  let G = cargar();
  // copia de seguridad solo de ESTOS ajustes (la radio hace LS.clear() si Spotify da un error de login)
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('iceman-prefs', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function respaldo(v) { try { (await idb()).transaction('k', 'readwrite').objectStore('k').put(v, KEY); } catch (e) {} }
  async function restaurar() { try { const d = await idb(); return await new Promise((res) => { const q = d.transaction('k').objectStore('k').get(KEY); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } }
  const guardar = () => { try { const j = JSON.stringify(G); LS[KEY] = j; respaldo(j); } catch (e) {} };
  if (!LS[KEY]) restaurar().then((r) => { if (r) { LS[KEY] = r; G = cargar(); marcarTodo(); } });

  // ---------- Utilidades de la biblioteca ----------
  const arte = (t) => (t && t.artists && t.artists[0] && t.artists[0].name) || '';
  const todas = (L) => [...new Map(Object.values(L || {}).flat().filter((t) => t && t.uri).map((t) => [t.uri, t])).values()];
  const puntos = (a) => (window.IcemanPerfil ? window.IcemanPerfil.puntos(a) : 0);
  const mayoritario = (batch) => { const c = {}; (batch || []).forEach((t) => { if (t && t.g) c[t.g] = (c[t.g] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || null; };
  function grupo() { try { const GR = get('GRUPOS'); if (GR && !GR.afrobeat) GR.afrobeat = { nombre: 'afrobeat', re: /afro|amapiano/ }; } catch (e) {} }

  // Etiquetas puestas por ti: mandan sobre el diccionario
  function marcar(L) {
    const tags = G.tags; if (!L || !Object.keys(tags).length) return 0;
    grupo(); let n = 0;
    todas(L).forEach((t) => { const e = tags[norm(arte(t))]; if (e && t.g !== e.g) { t.g = e.g; n++; } });
    return n;
  }
  function marcarTodo() { try { const L = hay('lib') && get('lib'); if (L && marcar(L) && hay('saveLib')) get('saveLib')(L); } catch (e) {} }
  if (hay('cachedLib')) {
    const o = get('cachedLib');
    window.__gustosCached = function (...a) { const L = o.apply(this, a); try { marcar(L); } catch (e) {} return L; };
    asignar('cachedLib', 'window.__gustosCached');
  }
  if (hay('loadLib')) {
    const o = get('loadLib');
    window.__gustosLoad = async function (...a) { const L = await o.apply(this, a); try { if (marcar(L) && hay('saveLib')) get('saveLib')(L); } catch (e) {} return L; };
    asignar('loadLib', 'window.__gustosLoad');
  }
  marcarTodo();

  // ---------- Qué sonó en los últimos bloques (solo en memoria; se olvida al cerrar) ----------
  const ultimos = [];                          // conjuntos de artistas de los 2 últimos bloques

  // ---------- Adaptar el bloque ANTES de que el DJ lo presente ----------
  function elegirN(pool, n, maxPor, vetados) {
    const cnt = {}, out = [];
    for (const t of mezclar(pool)) {
      const k = norm(arte(t)); if (!k || vetados.has(k)) continue;
      cnt[k] = (cnt[k] || 0) + 1; if (cnt[k] > maxPor) continue;
      out.push(t); if (out.length >= n) break;
    }
    return out;
  }
  function estiloObjetivo(pool, n, soloMas) {
    const cand = CLAVES.filter((k) => (soloMas ? G.mas.includes(k) : !G.menos.includes(k)) && pool.filter((t) => t.g === k).length >= n);
    if (!cand.length) return null;
    const pesos = cand.map((k) => (G.mas.includes(k) ? 3 : 1)), total = pesos.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < cand.length; i++) { r -= pesos[i]; if (r <= 0) return cand[i]; }
    return cand[cand.length - 1];
  }

  function adaptar(batch, tema, texto) {
    if (!Array.isArray(batch) || batch.length < 2 || !hay('lib') || !get('lib')) return null;
    const L = get('lib');
    const vistas = hay('played') ? get('played')() : new Set();
    const originales = batch.map((t) => t.uri);
    const enBloque = new Set(originales);
    let pool = todas(L).filter((t) => !vistas.has(t.uri) && !enBloque.has(t.uri) && puntos(arte(t)) > -4);
    const maxPor = G.variedad === 'alta' ? 1 : 2;
    let nuevo = null;

    // 1) estilos que quieres menos / más
    const g = mayoritario(batch), n = batch.length;
    let objetivo = null;
    if (g && G.menos.includes(g) && Math.random() < P_MENOS) objetivo = estiloObjetivo(pool, n, false);
    else if (G.mas.length && !G.mas.includes(g) && Math.random() < P_MAS) objetivo = estiloObjetivo(pool, n, true);
    if (objetivo && objetivo !== g) {
      const sel = elegirN(pool.filter((t) => t.g === objetivo), n, maxPor, new Set());
      if (sel.length >= n) { batch.splice(0, batch.length, ...sel); nuevo = { tema: objetivo, texto: 'canciones de ' + NOMBRE[objetivo] }; }
    }

    // 2) variedad alta: ningún artista repetido en el bloque ni respecto a los 2 bloques anteriores
    if (G.variedad === 'alta') {
      const previos = new Set(); ultimos.forEach((s) => s.forEach((k) => previos.add(k)));
      const usados = new Set(), tomadas = new Set(batch.map((t) => t.uri));
      const libres = todas(L).filter((t) => !vistas.has(t.uri) && !tomadas.has(t.uri) && puntos(arte(t)) > -4);
      for (let i = 0; i < batch.length; i++) {
        const k = norm(arte(batch[i]));
        if (k && !usados.has(k) && !previos.has(k)) { usados.add(k); continue; }
        const mismo = libres.filter((t) => t.g === batch[i].g && !tomadas.has(t.uri));
        const alt = mezclar(mismo).find((t) => { const kk = norm(arte(t)); return kk && !usados.has(kk) && !previos.has(kk); });
        if (alt) { tomadas.add(alt.uri); batch[i] = alt; usados.add(norm(arte(alt))); }
        else usados.add(k);
      }
    }

    // 3) si algo cambió: las que no sonarán vuelven a estar disponibles, las nuevas se apuntan, y se actualiza el final del bloque
    const finales = batch.map((t) => t.uri);
    const igual = finales.length === originales.length && finales.every((u, i) => u === originales[i]);
    ultimos.push(new Set(batch.map((t) => norm(arte(t))))); while (ultimos.length > 2) ultimos.shift();
    if (!igual) {
      if (hay('savePlayed') && hay('played')) {
        const v = get('played')();
        originales.filter((u) => !finales.includes(u)).forEach((u) => v.delete(u));
        finales.forEach((u) => v.add(u));
        get('savePlayed')(v);
      }
      asignar('lastUri', JSON.stringify(batch[batch.length - 1].uri));
    }
    return nuevo;
  }

  if (hay('decir')) {
    const original = get('decir');
    window.__gustosDecir = async function (batch, first, tema, texto, ...resto) {
      if (tema !== 'intro') {
        try { const r = adaptar(batch, tema, texto); if (r) { tema = r.tema; texto = r.texto; } }
        catch (e) { console.warn('gustos:', e.message); }
      }
      return original.call(this, batch, first, tema, texto, ...resto);
    };
    asignar('decir', 'window.__gustosDecir');
  }

  // ---------- Panel: se añade dentro de "Mis preferencias" ----------
  const css = document.createElement('style');
  css.textContent = `.gSeg{display:flex;gap:4px}.gSeg button{padding:4px 10px;font-size:12px}.gSeg button.p{color:#000}
  .gSel{max-width:46%;font-size:14px;color:var(--tx);background:#ffffff1f;border:1px solid #ffffff22;border-radius:999px;padding:6px 10px}.gSel option{color:#000}`;
  document.head.append(css);
  let verSin = false;
  const redibujar = () => { try { if (window.__pfRedibujar) window.__pfRedibujar(); } catch (e) {} };

  function sinEstilo() {
    const L = hay('lib') && get('lib'); if (!L) return { sin: [], con: [] };
    const cuenta = {};
    todas(L).forEach((t) => { const a = arte(t), k = norm(a); if (k && (!t.g || t.g === 'otros' || G.tags[k])) { const e = cuenta[k] || (cuenta[k] = { k, n: a, c: 0 }); e.c++; } });
    const todos = Object.values(cuenta).sort((a, b) => b.c - a.c);
    return { sin: todos.filter((e) => !G.tags[e.k]).slice(0, 8), con: todos.filter((e) => G.tags[e.k]).slice(0, 8) };
  }
  function etiquetar(k, nombre, g) {
    const previo = G.tags[k];
    if (g && CLAVES.includes(g)) G.tags[k] = { n: nombre, g }; else delete G.tags[k];
    guardar();
    const L = hay('lib') && get('lib');
    if (L) {
      if (g) { if (marcar(L) && hay('saveLib')) get('saveLib')(L); }
      else { try { LS.removeItem('lib'); } catch (e) {} todas(L).forEach((t) => { if (norm(arte(t)) === k && previo && t.g === previo.g) t.g = 'otros'; }); }   // al quitar, la biblioteca se recalcula la próxima vez
    }
    redibujar();
  }

  (window.__pfExtras = window.__pfExtras || []).push(function (body, el) {
    body.append(el('div', 'pfH', 'Mis estilos'));
    EST.forEach(([k, nom]) => {
      const r = el('div', 'pfR'); const val = G.menos.includes(k) ? 'menos' : G.mas.includes(k) ? 'mas' : 'normal';
      const seg = el('div', 'gSeg');
      [['menos', 'Menos'], ['normal', 'Normal'], ['mas', 'Más']].forEach(([v, t]) => {
        const b = el('button', v === val ? 'p' : '', t); b.type = 'button';
        b.onclick = () => { G.menos = G.menos.filter((x) => x !== k); G.mas = G.mas.filter((x) => x !== k); if (v === 'menos') G.menos.push(k); if (v === 'mas') G.mas.push(k); guardar(); redibujar(); };
        seg.append(b);
      });
      r.append(el('span', 'n', nom), seg); body.append(r);
    });
    body.append(el('p', 'pfNota', '"Menos" hace que ese estilo suene bastante menos; "Más", un poco más a menudo. Lo que pides tú por el chat no se toca.'));

    body.append(el('div', 'pfH', 'Variedad de artistas'));
    const rv = el('div', 'pfR'); const sv = el('div', 'gSeg');
    [['normal', 'Normal'], ['alta', 'Alta']].forEach(([v, t]) => {
      const b = el('button', G.variedad === v ? 'p' : '', t); b.type = 'button';
      b.onclick = () => { G.variedad = v; guardar(); redibujar(); }; sv.append(b);
    });
    rv.append(el('span', 'n', G.variedad === 'alta' ? 'No repito artista en el bloque ni en los 2 anteriores' : 'Como siempre'), sv); body.append(rv);

    const { sin, con } = sinEstilo();
    if (sin.length || con.length) {
      body.append(el('div', 'pfH', 'Artistas sin estilo'));
      let nAuto = 0; try { nAuto = window.IcemanGeneros ? window.IcemanGeneros.estado().resueltos : 0; } catch (e) {}
      body.append(el('p', 'pfNota', 'Los estilos se deducen solos (diccionario, géneros de Spotify y colaboraciones)' + (nAuto ? ': ' + nAuto + ' artistas clasificados en esta sesión' : '') + '. Solo hace falta revisar esto si algún artista te suena mal clasificado.'));
      const ver = el('button', 'pfBig', verSin ? 'Ocultar artistas sin estilo' : 'Revisar artistas sin estilo (' + (sin.length + con.length) + ')'); ver.type = 'button';
      ver.onclick = () => { verSin = !verSin; redibujar(); };
      body.append(ver);
      if (verSin) {
        const fila = (e) => {
          const r = el('div', 'pfR'); const s = document.createElement('select'); s.className = 'gSel'; s.setAttribute('aria-label', 'Estilo de ' + e.n);
          const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Sin estilo'; s.append(o0);
          EST.forEach(([k, nom]) => { const o = document.createElement('option'); o.value = k; o.textContent = nom; s.append(o); });
          s.value = (G.tags[e.k] || {}).g || '';
          s.onchange = () => etiquetar(e.k, e.n, s.value);
          r.append(el('span', 'n', e.n), s); return r;
        };
        con.forEach((e) => body.append(fila(e)));
        sin.forEach((e) => body.append(fila(e)));
      }
    }
  });

  window.IcemanGustos = { ajustes: () => JSON.parse(JSON.stringify(G)), marcar };
})();
