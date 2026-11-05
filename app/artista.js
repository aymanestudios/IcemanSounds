// Botón 🎤 "un bloque de este artista": Claude propone 3 artistas cercanos al que suena (colaboradores o misma escena),
// el navegador comprueba en Spotify que existen y arma un bloque: varias canciones del artista + un par de cada uno de los otros.
// Solo se anuncia lo que de verdad se encuentra. El texto sale en pantalla (sin voz, para no gastar créditos de ElevenLabs).
(function () {
  'use strict';
  if (window.__artista) return;
  window.__artista = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const $$ = (id) => document.getElementById(id);
  const SRV = () => (hay('SERVER') ? get('SERVER') : location.origin);
  const estado = (t) => { const s = $$('st'); if (s) s.textContent = t; };

  const fila = document.querySelector('.row');
  if (!fila) return;
  const btn = document.createElement('button');
  btn.id = 'art'; btn.type = 'button'; btn.title = 'Un bloque de este artista'; btn.setAttribute('aria-label', 'Un bloque de este artista'); btn.textContent = '🎤';
  fila.append(btn);

  let ocupado = false;
  btn.onclick = async () => {
    if (ocupado) return;
    const A = window.IcemanAsistente;
    if (!A) { estado('El asistente aún no ha cargado, prueba en un momento.'); return; }
    if (hay('busy') && get('busy')) { estado('El DJ está hablando, prueba en unos segundos.'); return; }
    ocupado = true; btn.disabled = true;
    try {
      const s = hay('player') && get('player') ? await get('player').getCurrentState() : null;
      const actual = s && s.track_window && s.track_window.current_track;
      if (!actual || !actual.artists || !actual.artists[0]) { estado('Pon primero una canción y luego pulsa 🎤.'); return; }
      const principal = actual.artists[0].name;
      estado('Pensando un bloque de ' + principal + '…');

      let propuestos = [];
      try {
        const r = await fetch(SRV() + '/artista/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await get('token')()) }, body: JSON.stringify({ artista: principal, cancion: actual.name }) });
        if (r.ok) propuestos = (await r.json()).artistas || [];
      } catch (e) { console.warn('plan:', e.message); }

      const vistas = hay('played') ? get('played')() : new Set();
      const delArtista = async (nombre, max, paginas) => {
        const q = A.norm(nombre);
        let t = await A.buscar('artist:"' + nombre + '"', paginas);
        t = t.filter((x) => x.uri !== actual.uri && x.artists.some((ar) => A.norm(ar.name) === q));
        const nuevas = t.filter((x) => !vistas.has(x.uri));
        return A.mezclar(nuevas.length >= max ? nuevas : t).slice(0, max);
      };
      const A0 = await delArtista(principal, 6, 3);
      const otros = [];
      for (const n of propuestos) {
        try { const t = await delArtista(n, 2, 1); if (t.length) otros.push({ nombre: n, t }); } catch (e) {}
      }
      if (!A0.length && !otros.length) { estado('No he encontrado más canciones de ' + principal + '.'); return; }

      // orden: 2 del artista, 1 de otro, 2 del artista, 1 de otro... y al final lo que sobre
      const bloque = [], P = [...A0], O = otros.map((o) => [...o.t]);
      let i = 0;
      while (bloque.length < 10 && (P.length || O.some((x) => x.length))) {
        for (let j = 0; j < 2 && P.length; j++) bloque.push(P.shift());
        const con = O.filter((x) => x.length);
        if (con.length) { bloque.push(con[i % con.length].shift()); i++; }
      }
      const unir = (l) => (l.length > 1 ? l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1] : l[0]);
      const nombres = otros.map((o) => o.nombre);
      const texto = nombres.length ? 'Te pongo un bloque de ' + principal + ', con un par de ' + unir(nombres) : 'Te pongo un bloque entero de ' + principal;
      await A.tocar(bloque);
      estado('');
      if (hay('animar') && $$('dj')) { get('animar')($$('dj'), texto); setTimeout(() => { const d = $$('dj'); if (d && d.textContent.replace(/ /g, ' ') === texto) d.textContent = ''; }, 7000); }
    } catch (e) {
      estado(String(e.message).replace(/^\d{3} /, '').slice(0, 120));
    } finally { ocupado = false; btn.disabled = false; }
  };
})();
