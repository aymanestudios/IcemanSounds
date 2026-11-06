// Cerebro de sesión de Iceman Sounds (Fase 2). Reglas escritas a mano, TODO en tu navegador: no se envía nada a ningún servidor ni a Claude.
// Recuerda qué ha ido sonando en esta sesión (estilos, artistas, descubrimientos) y, justo antes de que el DJ presente cada bloque, decide:
//   - MANTENER el bloque tal cual, DERIVAR hacia un estilo vecino (rap -> R&B...) o VARIAR hacia el estilo que menos ha sonado.
//   - Cada ~3 bloques mete un DESCUBRIMIENTO (canción de artistas que aún no tenías) y de vez en cuando una canción ANTIGUA de tu biblioteca.
//   - Puntúa las canciones candidatas: artistas que te gustan suman; los que acaban de sonar o suenan demasiado restan; un poco de azar para sorprender.
// Respeta tus ajustes (estilos "Menos/Más", artistas que evitas). La memoria vive en esta pestaña y se olvida a las 6 h.
// Apagar: localStorage.cerebro = 'off' (o el interruptor en ⚙️). Si algo falla aquí, suena el bloque original de siempre.
(function () {
  'use strict';
  if (window.__cerebro) return;
  window.__cerebro = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const asignar = (n, expr) => { try { (0, eval)(n + ' = ' + expr); } catch (e) {} };
  const LS = localStorage;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const mezclar = (a) => [...a].sort(() => Math.random() - 0.5);
  const apagado = () => LS.cerebro === 'off';

  const ESTILOS = ['reggaeton', 'rap', 'rnb', 'pop', 'electronica', 'afrobeat'];
  const NOMBRE = { reggaeton: 'reggaetón', rap: 'hip hop y rap', rnb: 'R&B y soul', pop: 'pop', electronica: 'electrónica', afrobeat: 'afrobeat' };
  // estilos "vecinos": a cuál se puede derivar sin que el cambio chirríe (escrito a mano)
  const PUENTES = { reggaeton: ['afrobeat', 'pop', 'rap'], rap: ['rnb', 'reggaeton', 'afrobeat'], rnb: ['rap', 'pop', 'afrobeat'], pop: ['rnb', 'electronica', 'reggaeton'], electronica: ['pop', 'rnb', 'afrobeat'], afrobeat: ['reggaeton', 'rnb', 'pop'] };
  const CADA_DESCUBRIMIENTO = 3, CADA_ANTIGUA = 5;
  const P_RACHA = { 2: 0.15, 3: 0.5, 4: 0.9 };

  // ---------- Memoria de sesión (solo esta pestaña, 6 h) ----------
  const KEY = 'cer_v1', TTL = 6 * 3600 * 1000;
  const nueva = () => ({ v: 1, t0: Date.now(), bl: [], n: 0, sinD: 0, sinV: 0, d: 0, cambios: 0 });
  const cargar = () => { try { const m = JSON.parse(sessionStorage[KEY]); if (m && m.v === 1 && Date.now() - m.t0 < TTL) return m; } catch (e) {} return nueva(); };
  let M = cargar();
  const guardar = () => { try { sessionStorage[KEY] = JSON.stringify(M); } catch (e) {} };

  // ---------- Utilidades ----------
  const arte = (t) => (t && t.artists && t.artists[0] && t.artists[0].name) || '';
  const todas = (L) => [...new Map(Object.values(L || {}).flat().filter((t) => t && t.uri).map((t) => [t.uri, t])).values()];
  const puntos = (a) => (window.IcemanPerfil ? window.IcemanPerfil.puntos(a) : 0);
  const mayoritario = (batch) => { const c = {}; (batch || []).forEach((t) => { if (t && t.g) c[t.g] = (c[t.g] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || null; };
  const ajustesG = () => { try { return window.IcemanGustos ? window.IcemanGustos.ajustes() : { mas: [], menos: [] }; } catch (e) { return { mas: [], menos: [] }; } };
  const CONOCIDAS = ['recientes', 'top', 'playlists', 'artistas'];

  function origenes(L) {                 // uri -> conjunto de fuentes ('viejas', 'descubrir', 'top'...)
    const m = new Map();
    Object.keys(L || {}).forEach((k) => (L[k] || []).forEach((t) => { if (!t || !t.uri) return; if (!m.has(t.uri)) m.set(t.uri, new Set()); m.get(t.uri).add(k); }));
    return m;
  }
  const recientes = () => { const s = new Set(); M.bl.slice(-3).forEach((b) => b.a.forEach((k) => s.add(k))); return s; };
  const apariciones = () => { const c = {}; M.bl.forEach((b) => b.a.forEach((k) => { c[k] = (c[k] || 0) + 1; })); return c; };
  const conteoEstilos = () => { const c = {}; M.bl.forEach((b) => { if (b.e) c[b.e] = (c[b.e] || 0) + 1; }); return c; };

  // Puntuación de una canción candidata (cuanto más alta, antes se elige)
  function puntuar(t, ctx, tipo) {
    const k = norm(arte(t)); let s = Math.random() * 1.2;                        // un poco de azar: sorprende sin ser aleatorio
    const p = puntos(arte(t));
    s += p >= 3 ? 3 : Math.max(-3, Math.min(3, p)) * 0.5;                        // artistas que te gustan suman, los que no, restan
    if (ctx.rec.has(k)) s -= 4;                                                  // acaba de sonar
    s -= Math.min(3, ctx.ap[k] || 0) * 0.7;                                      // suena demasiado en esta sesión
    if (tipo === 'conocida') { const f = ctx.f.get(t.uri); if (f && (f.has('recientes') || f.has('top'))) s += 1; }
    return s;
  }
  function elegir(cands, k, tipo, ctx, usados) {
    const out = [];
    cands.map((t) => [puntuar(t, ctx, tipo), t]).sort((a, b) => b[0] - a[0]).forEach(([, t]) => {
      if (out.length >= k) return;
      const a = norm(arte(t)); if (!a || usados.has(a)) return;
      usados.add(a); out.push(t);
    });
    return out;
  }
  function pesado(lista, mas) {
    const pesos = lista.map((x) => (mas.includes(x) ? 3 : 1)), tot = pesos.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot; for (let i = 0; i < lista.length; i++) { r -= pesos[i]; if (r <= 0) return lista[i]; }
    return lista[lista.length - 1];
  }

  // si hay un ambiente elegido (arco.js), él lleva el estilo; aquí solo quedan descubrimientos y antiguas
  const arcoManda = () => { try { return !!(window.IcemanArco && window.IcemanArco.modo() !== 'libre'); } catch (e) { return false; } };

  // ---------- Decidir el bloque ----------
  function planificar(batch) {
    if (apagado() || !Array.isArray(batch) || batch.length < 2 || !hay('lib') || !get('lib')) return null;
    const L = get('lib'), n = batch.length;
    const aj = ajustesG(), g = mayoritario(batch);
    const vistas = hay('played') ? get('played')() : new Set();
    const enBloque = new Set(batch.map((t) => t.uri));
    const disp = todas(L).filter((t) => !vistas.has(t.uri) && !enBloque.has(t.uri) && puntos(arte(t)) > -4);
    const f = origenes(L), ctx = { rec: recientes(), ap: apariciones(), f };
    const es = (t, fuente) => { const x = f.get(t.uri); return !!(x && x.has(fuente)); };

    // 1) estrategia según lo que ha sonado
    let racha = 1; for (let i = M.bl.length - 1; i >= 0 && M.bl[i].e === g; i--) racha++;
    let estrategia = 'mantener', objetivo = null;
    const p = racha >= 4 ? P_RACHA[4] : (P_RACHA[racha] || 0);
    if (g && Math.random() < p && !arcoManda()) {
      const viable = (k) => k !== g && !aj.menos.includes(k) && disp.filter((t) => t.g === k).length >= n;
      if (racha >= 3 && Math.random() < 0.6) { const c = (PUENTES[g] || []).filter(viable); if (c.length) { objetivo = pesado(c, aj.mas); estrategia = 'derivar'; } }
      if (!objetivo) {
        const cnt = conteoEstilos(), c = ESTILOS.filter(viable);
        if (c.length) { const min = Math.min(...c.map((k) => cnt[k] || 0)); objetivo = pesado(c.filter((k) => (cnt[k] || 0) === min), aj.mas); estrategia = 'variar'; }
      }
    }
    const estilo = objetivo || g;
    const quiereD = M.sinD >= CADA_DESCUBRIMIENTO || (M.sinD >= CADA_DESCUBRIMIENTO - 1 && Math.random() < 0.3);
    const quiereV = M.sinV >= CADA_ANTIGUA;

    // 2) construir el bloque final
    let final = null;
    if (objetivo) {
      const usados = new Set(), out = [];
      const delEstilo = disp.filter((t) => t.g === estilo);
      let desc = null, vieja = null;
      if (quiereD) { desc = elegir(delEstilo.filter((t) => es(t, 'descubrir')), 1, 'desc', ctx, usados)[0] || null; }
      if (quiereV) { vieja = elegir(delEstilo.filter((t) => es(t, 'viejas') && t !== desc), 1, 'vieja', ctx, usados)[0] || null; }
      const resto = n - (desc ? 1 : 0) - (vieja ? 1 : 0);
      const conocidas = elegir(delEstilo.filter((t) => t !== desc && t !== vieja), resto, 'conocida', ctx, usados);
      if (conocidas.length >= resto) {
        out.push(...conocidas.slice(0, Math.ceil(resto / 2)));
        if (vieja) out.push(vieja);
        out.push(...conocidas.slice(Math.ceil(resto / 2)));
        if (desc) out.push(desc);                                  // el descubrimiento va al final, como en la radio original
        final = out;
      } else { objetivo = null; estrategia = 'mantener'; }
    }
    if (!final) {
      final = [...batch];
      const usados = new Set(final.map((t) => norm(arte(t))));
      const tiene = (fuente) => final.some((t) => es(t, fuente));
      if (quiereD && !tiene('descubrir')) {
        const c = elegir(disp.filter((t) => t.g === g && es(t, 'descubrir') && !usados.has(norm(arte(t)))), 1, 'desc', ctx, new Set())[0];
        if (c) final[final.length - 1] = c;
      }
      if (quiereV && !tiene('viejas')) {
        const c = elegir(disp.filter((t) => t.g === g && es(t, 'viejas') && !final.includes(t) && !usados.has(norm(arte(t)))), 1, 'vieja', ctx, new Set())[0];
        if (c && final.length >= 3) final[1] = c;
      }
    }

    // 3) aplicar y recordar
    const originales = batch.map((t) => t.uri), nuevos = final.map((t) => t.uri);
    const igual = nuevos.length === originales.length && nuevos.every((u, i) => u === originales[i]);
    if (!igual) {
      batch.splice(0, batch.length, ...final);
      if (hay('savePlayed') && hay('played')) {
        const v = get('played')();
        originales.filter((u) => !nuevos.includes(u)).forEach((u) => v.delete(u));
        nuevos.forEach((u) => v.add(u));
        get('savePlayed')(v);
      }
      asignar('lastUri', JSON.stringify(batch[batch.length - 1].uri));
      M.cambios++;
    }
    return { tema: objetivo, texto: objetivo ? 'canciones de ' + NOMBRE[objetivo] : null, estrategia };
  }

  // Se apunta lo que ha sonado de verdad (después de que otros módulos hayan podido retocar el bloque)
  function registrar(batch, estrategia) {
    if (!Array.isArray(batch) || !batch.length) return;
    const f = hay('lib') && get('lib') ? origenes(get('lib')) : new Map();
    const es = (t, fuente) => { const x = f.get(t.uri); return !!(x && x.has(fuente)); };
    const hayD = batch.some((t) => es(t, 'descubrir')), hayV = batch.some((t) => es(t, 'viejas'));
    M.bl.push({ e: mayoritario(batch), a: [...new Set(batch.map((t) => norm(arte(t))))], d: hayD ? 1 : 0, v: hayV ? 1 : 0, s: estrategia || 'mantener' });
    while (M.bl.length > 12) M.bl.shift();
    M.n++; M.sinD = hayD ? 0 : M.sinD + 1; M.sinV = hayV ? 0 : M.sinV + 1; if (hayD) M.d++;
    guardar();
  }

  // ---------- Enganche: justo antes de que el DJ presente el bloque ----------
  if (hay('decir')) {
    const original = get('decir');
    window.__cerebroDecir = async function (batch, first, tema, texto, ...resto) {
      let estrategia = null, vivo = tema !== 'intro' && !apagado();
      if (vivo) {
        try { const r = planificar(batch); if (r) { estrategia = r.estrategia; if (r.tema) { tema = r.tema; texto = r.texto; } } else vivo = false; }
        catch (e) { console.warn('cerebro:', e.message); vivo = false; }
      }
      try { return await original.call(this, batch, first, tema, texto, ...resto); }
      finally { if (vivo) { try { registrar(batch, estrategia); } catch (e) {} } }
    };
    asignar('decir', 'window.__cerebroDecir');
  }

  // ---------- Panel: interruptor (pestaña DJ) + resumen (pestaña Sesión) ----------
  const panelDJ = function (body, el) {
    body.append(window.__pfUI.interruptor('Que el DJ planifique la sesión', 'Varía de estilo, mete descubrimientos y alguna canción antigua.', !apagado(), (v) => { LS.cerebro = v ? 'on' : 'off'; }));
  };
  panelDJ.tab = 'dj';
  const panelSesion = function (body, el) {
    body.append(el('div', 'pfH', 'El DJ en esta sesión'));
    const c = conteoEstilos(), ks = Object.keys(c).sort((a, b) => c[b] - c[a]);
    body.append(el('p', 'pfNota', M.n + ' bloques · ' + M.d + ' descubrimientos · ' + M.cambios + ' cambios de rumbo' + (ks.length ? ' — ' + ks.map((k) => (NOMBRE[k] || k) + ' ×' + c[k]).join(', ') : '')));
  };
  panelSesion.tab = 'sesion';
  (window.__pfExtras = window.__pfExtras || []).push(panelDJ, panelSesion);

  window.IcemanCerebro = { memoria: () => JSON.parse(JSON.stringify(M)), planificar, olvidar: () => { M = nueva(); guardar(); } };
})();
