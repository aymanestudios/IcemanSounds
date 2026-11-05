// Arco de la sesión de Iceman Sounds (Fase 3). Reglas escritas a mano, TODO en tu navegador: no se envía nada a nadie.
// Tú eliges el ambiente (Libre, Subir, Bajar, Fiesta, Chill, Ola) y el DJ lleva la energía de la sesión poco a poco hacia allí.
// La energía es APROXIMADA y por estilo (tabla escrita a mano abajo). No se analizan canciones ni se usa ningún dato de audio de Spotify.
// Justo antes de que el DJ presente cada bloque, si el estilo no encaja con el ambiente, lo cambia por el estilo vecino más cercano
// al objetivo (sin saltos bruscos, respetando "Menos", artistas que evitas y lo ya sonado). "Libre" (por defecto) no toca nada.
// Apagar: elegir "Libre" en ⚙️ o localStorage.arco = 'libre'. Si algo falla aquí, suena el bloque de siempre.
(function () {
  'use strict';
  if (window.__arco) return;
  window.__arco = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const asignar = (n, expr) => { try { (0, eval)(n + ' = ' + expr); } catch (e) {} };
  const LS = localStorage;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  // energía aproximada de cada estilo (0 = muy tranquilo, 1 = muy movido). Escrita a mano.
  const ENERGIA = { electronica: 0.85, reggaeton: 0.8, afrobeat: 0.7, rap: 0.65, pop: 0.5, rnb: 0.35 };
  const NOMBRE = { reggaeton: 'reggaetón', rap: 'hip hop y rap', rnb: 'R&B y soul', pop: 'pop', electronica: 'electrónica', afrobeat: 'afrobeat' };
  const SALTO_MAX = 0.3;          // como mucho esto de cambio de energía entre bloques seguidos (si hay opciones)
  const RAMPA = 8;                // bloques que tarda en subir/bajar del todo
  const MODOS = [
    ['libre', 'Libre', null],
    ['subir', 'Subir', (n) => 0.4 + 0.45 * Math.min(1, n / RAMPA)],
    ['bajar', 'Bajar', (n) => 0.85 - 0.5 * Math.min(1, n / RAMPA)],
    ['fiesta', 'Fiesta', () => 0.82],
    ['chill', 'Chill', () => 0.4],
    ['ola', 'Ola', (n) => 0.62 + 0.25 * Math.sin((n / 10) * 2 * Math.PI)]
  ];
  const modo = () => { const m = LS.arco; return MODOS.some((x) => x[0] === m) ? m : 'libre'; };
  const objetivo = (m, n) => { const f = (MODOS.find((x) => x[0] === m) || [])[2]; return f ? f(n) : null; };

  // ---------- Memoria (solo esta pestaña, 6 h) ----------
  const KEY = 'arco_v1', TTL = 6 * 3600 * 1000;
  const nueva = () => ({ v: 1, t0: Date.now(), n: 0, ult: null, cambios: 0, modo: modo() });
  const cargar = () => { try { const m = JSON.parse(sessionStorage[KEY]); if (m && m.v === 1 && Date.now() - m.t0 < TTL) return m; } catch (e) {} return nueva(); };
  let A = cargar();
  const guardar = () => { try { sessionStorage[KEY] = JSON.stringify(A); } catch (e) {} };

  // ---------- Utilidades ----------
  const arte = (t) => (t && t.artists && t.artists[0] && t.artists[0].name) || '';
  const todas = (L) => [...new Map(Object.values(L || {}).flat().filter((t) => t && t.uri).map((t) => [t.uri, t])).values()];
  const puntos = (a) => (window.IcemanPerfil ? window.IcemanPerfil.puntos(a) : 0);
  const menos = () => { try { return window.IcemanGustos ? window.IcemanGustos.ajustes().menos : []; } catch (e) { return []; } };
  const mayoritario = (batch) => { const c = {}; (batch || []).forEach((t) => { if (t && t.g) c[t.g] = (c[t.g] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || null; };

  function planificar(batch) {
    const m = modo();
    if (m === 'libre' || !Array.isArray(batch) || batch.length < 2 || !hay('lib') || !get('lib')) return null;
    if (A.modo !== m) { A = nueva(); A.modo = m; }                     // al cambiar de ambiente, el arco empieza de cero
    const n = batch.length, meta = objetivo(m, A.n), g = mayoritario(batch);
    const vistas = hay('played') ? get('played')() : new Set();
    const enBloque = new Set(batch.map((t) => t.uri));
    const disp = todas(get('lib')).filter((t) => !vistas.has(t.uri) && !enBloque.has(t.uri) && puntos(arte(t)) > -4);
    const E = (k) => ENERGIA[k];
    const viable = (k) => E(k) !== undefined && !menos().includes(k) && disp.filter((t) => t.g === k).length >= n;
    const previa = A.ult === null ? E(g) : A.ult;
    let elegido = null;
    const noQuiero = menos().includes(g);                                // un estilo que has puesto en "Menos" también se cambia aquí, hacia el ambiente
    if (E(g) !== undefined && (noQuiero || Math.abs(E(g) - meta) > 0.2)) {
      let c = Object.keys(ENERGIA).filter(viable);
      const suaves = c.filter((k) => Math.abs(E(k) - previa) <= SALTO_MAX + 1e-9);
      if (suaves.length) c = suaves;
      c = c.map((k) => [Math.abs(E(k) - meta) + (k === g ? 0.1 : 0) + Math.random() * 0.08, k]).sort((a, b) => a[0] - b[0]);
      if (c.length && (noQuiero || (Math.abs(E(c[0][1]) - meta) < Math.abs(E(g) - meta) - 0.05 && (Math.abs(E(g) - meta) > 0.4 || Math.random() < 0.8)))) elegido = c[0][1];
    }
    let tema = null, texto = null, final = null;
    if (elegido) {
      const usados = new Set(), out = [];
      disp.filter((t) => t.g === elegido).map((t) => [puntos(arte(t)) * 0.5 + Math.random() * 1.2, t]).sort((a, b) => b[0] - a[0]).forEach(([, t]) => {
        const a = norm(arte(t)); if (out.length >= n || !a || usados.has(a)) return; usados.add(a); out.push(t);
      });
      if (out.length >= n) final = out;
    }
    if (final) {
      const originales = batch.map((t) => t.uri), nuevos = final.map((t) => t.uri);
      batch.splice(0, batch.length, ...final);
      if (hay('savePlayed') && hay('played')) {
        const v = get('played')();
        originales.filter((u) => !nuevos.includes(u)).forEach((u) => v.delete(u));
        nuevos.forEach((u) => v.add(u));
        get('savePlayed')(v);
      }
      asignar('lastUri', JSON.stringify(batch[batch.length - 1].uri));
      A.cambios++; tema = elegido; texto = 'canciones de ' + NOMBRE[elegido];
    }
    const real = tema || g;
    A.ult = E(real) !== undefined ? E(real) : A.ult; A.n++; A.meta = meta; guardar();
    return tema ? { tema, texto } : null;
  }

  // ---------- Enganche: justo antes de que el DJ presente el bloque (por fuera de los otros módulos) ----------
  if (hay('decir')) {
    const original = get('decir');
    window.__arcoDecir = async function (batch, first, tema, texto, ...resto) {
      if (tema !== 'intro') {
        try { const r = planificar(batch); if (r) { tema = r.tema; texto = r.texto; } }
        catch (e) { console.warn('arco:', e.message); }
      }
      return original.call(this, batch, first, tema, texto, ...resto);
    };
    asignar('decir', 'window.__arcoDecir');
  }

  // ---------- Panel ----------
  (window.__pfExtras = window.__pfExtras || []).push(function (body, el) {
    body.append(el('div', 'pfH', 'Ambiente de la sesión'));
    const fila = el('div', 'pfSeg'); fila.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:6px 0';
    MODOS.forEach(([k, nom]) => {
      const b = el('button', 'pfBig' + (modo() === k ? ' on' : ''), nom); b.type = 'button';
      if (modo() === k) b.style.outline = '2px solid var(--ac,#12a9b8)';
      b.onclick = () => { LS.arco = k; A = nueva(); A.modo = k; guardar(); if (window.__pfRedibujar) window.__pfRedibujar(); };
      fila.append(b);
    });
    body.append(fila);
    const m = modo();
    body.append(el('p', 'pfNota', m === 'libre'
      ? 'Libre: el DJ no fuerza ninguna energía. Elige otro ambiente y irá subiendo o bajando poco a poco. La energía se calcula por estilo, de forma aproximada.'
      : 'Bloques en este ambiente: ' + A.n + (A.meta != null ? ' · energía objetivo ahora: ' + Math.round(A.meta * 100) + ' %' : '') + ' · cambios de estilo para encajar: ' + A.cambios));
  });

  window.IcemanArco = { ENERGIA, modo, objetivo, planificar, memoria: () => JSON.parse(JSON.stringify(A)), reiniciar: () => { A = nueva(); guardar(); } };
})();
