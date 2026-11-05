// Mini reproductor flotante (PC): una ventanita que se queda ENCIMA de todo (juegos en ventana o sin bordes, otras apps...)
// y se puede mover y redimensionar. Usa "Document Picture-in-Picture", que solo existe en Chrome y Edge de escritorio.
// No funciona sobre juegos en pantalla completa exclusiva (límite del sistema operativo).
(function () {
  'use strict';
  if (window.__mini) return;
  window.__mini = true;
  if (!('documentPictureInPicture' in window)) return;     // otros navegadores: el botón no aparece

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const $$ = (id) => document.getElementById(id);

  const css = document.createElement('style');
  css.textContent = '#miniBtn{position:fixed;top:calc(14px + env(safe-area-inset-top));right:14px;z-index:60;width:42px;height:42px;border-radius:50%;padding:0;font-size:19px;background:#0a1218d9;color:#fff;border:1px solid #ffffff2e;cursor:pointer}';
  document.head.append(css);
  const btn = document.createElement('button');
  btn.id = 'miniBtn'; btn.type = 'button'; btn.title = 'Mini reproductor flotante'; btn.setAttribute('aria-label', 'Mini reproductor flotante'); btn.textContent = '⧉'; btn.hidden = true;
  document.body.append(btn);
  setInterval(() => { btn.hidden = !localStorage.at || ($$('app') && $$('app').hidden); }, 1000);

  const ESTILO = `*{box-sizing:border-box}body{margin:0;background:#070d12;color:#eaf6f8;font:14px system-ui,sans-serif;display:flex;gap:12px;align-items:center;padding:12px;height:100vh;overflow:hidden}
  img{width:min(96px,80vh);aspect-ratio:1;object-fit:cover;border-radius:12px;background:#000;flex:none}
  .x{flex:1;min-width:0;display:grid;gap:6px}
  .t{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .a{opacity:.7;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .b{height:14px;position:relative;cursor:pointer;touch-action:none}.b::before{content:"";position:absolute;left:0;right:0;top:6px;height:3px;background:#ffffff2e;border-radius:2px}
  .b i{position:absolute;left:0;top:6px;height:3px;background:#12a9b8;border-radius:2px;width:0}
  .r{display:flex;gap:6px}
  button{flex:1;min-width:0;height:34px;border:0;border-radius:999px;background:#ffffff1c;color:#fff;font-size:15px;cursor:pointer}
  button.p{background:#12a9b8;color:#04161a}button:active{transform:scale(.94)}`;

  let ventana = null, reloj = null;

  async function abrir() {
    const w = await window.documentPictureInPicture.requestWindow({ width: 360, height: 150 });
    ventana = w;
    const d = w.document;
    const st = d.createElement('style'); st.textContent = ESTILO; d.head.append(st);
    d.title = 'Iceman Sounds';
    d.body.innerHTML = '<img id="c" alt=""><div class="x"><div class="t" id="t">—</div><div class="a" id="a"></div><div class="b" id="b"><i id="i"></i></div>' +
      '<div class="r"><button id="prev" title="Anterior">⏮</button><button id="pp" class="p" title="Pausa o play">▶</button><button id="next" title="Siguiente">⏭</button><button id="art" title="Un bloque de este artista">🎤</button><button id="ban" title="No volver a poner esta">🚫</button></div></div>';
    const q = (id) => d.getElementById(id);
    // cada botón pulsa el botón de la web: así hacen exactamente lo mismo
    ['prev', 'pp', 'next', 'art', 'ban'].forEach((id) => { q(id).onclick = () => { const o = $$(id); if (o) o.click(); }; });
    let dur = 0;
    q('b').onclick = async (e) => {
      const r = q('b').getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      try { const s = await get('player').getCurrentState(); if (s) get('player').seek(Math.round(p * s.duration)); } catch (er) {}
    };
    const pintar = async () => {
      try {
        const s = hay('player') && get('player') ? await get('player').getCurrentState() : null;
        if (!s || !s.track_window) return;
        const t = s.track_window.current_track;
        q('t').textContent = t.name; q('a').textContent = t.artists.map((x) => x.name).join(', ');
        const im = t.album && t.album.images && t.album.images[0];
        if (im && q('c').src !== im.url) q('c').src = im.url;
        q('pp').textContent = s.paused ? '▶' : '⏸';
        dur = s.duration || 0;
        q('i').style.width = dur ? (s.position / dur * 100) + '%' : '0';
      } catch (e) {}
    };
    pintar(); reloj = setInterval(pintar, 500);
    w.addEventListener('pagehide', () => { clearInterval(reloj); reloj = null; ventana = null; });
  }

  btn.onclick = async () => {
    try {
      if (ventana) { ventana.close(); return; }
      await abrir();
    } catch (e) { console.warn('mini:', e.message); const s = $$('st'); if (s) s.textContent = 'No he podido abrir el mini reproductor: ' + e.message; }
  };
})();
