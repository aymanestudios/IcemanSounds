// Interfaz (Fase UI): junta los botones flotantes (ajustes, conciertos y chat) en una barra de accesos con nombre, abajo en el centro.
// No cambia lo que hace ningún botón: solo los mueve de sitio. Se oculta sola cuando hay una hoja abierta.
// Se desactiva con ?tema=off (o localStorage.tema = 'off'), igual que el rediseño. Si falla, los botones se quedan donde estaban.
(function () {
  'use strict';
  if (window.__interfaz) return;
  try { if (/[?&]tema=off/.test(location.search) || localStorage.tema === 'off') return; } catch (e) {}
  window.__interfaz = true;
  let base = location.origin;
  try { if ((0, eval)('typeof SERVER') !== 'undefined') base = (0, eval)('SERVER'); } catch (e) {}
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + '/app/interfaz.css'; document.head.append(css);

  const dock = document.createElement('nav'); dock.id = 'dock'; dock.setAttribute('aria-label', 'Accesos'); dock.hidden = true;
  document.body.append(dock);
  const BOTONES = [['pfBtn', 'Ajustes'], ['tkBtn', 'Conciertos'], ['asBtn', 'Chat']];
  const mover = () => BOTONES.forEach(([id, nombre]) => {
    const b = document.getElementById(id);
    if (b && b.parentNode !== dock) { b.dataset.l = nombre; b.setAttribute('aria-label', nombre); b.title = nombre; dock.append(b); }
  });
  mover();
  const mo = new MutationObserver(mover); mo.observe(document.body, { childList: true });
  setTimeout(() => mo.disconnect(), 20000);       // los módulos crean sus botones en los primeros segundos

  const hoja = () => !!document.querySelector('#pfPanel.open,#asPanel.open,#tkPanel.open');
  // Telón oscuro detrás de la hoja abierta: tocar fuera la cierra (igual que la ✕).
  const telon = document.createElement('div'); telon.id = 'ixTelon'; document.body.append(telon);
  const sync = () => { const h = hoja(); telon.classList.toggle('on', h); dock.classList.toggle('oculto', h); };
  setInterval(() => { dock.hidden = !dock.querySelector('button:not([hidden])'); sync(); }, 250);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  // Captura: se evalúa ANTES de que el clic haga nada, así un clic dentro que repinta el panel nunca cuenta como "fuera".
  document.addEventListener('click', (e) => {
    try {
      const abiertos = [...document.querySelectorAll('#pfPanel.open,#asPanel.open,#tkPanel.open')];
      if (!abiertos.length || document.getElementById('bienv')) return;
      const t = e.target;
      if (!t || !t.closest || abiertos.some((p) => p.contains(t)) || t.closest('#dock,#pfBtn,#asBtn,#tkBtn,#pfToast')) return;
      abiertos.forEach((p) => { const x = p.querySelector('#pfX,#asX,#tkX'); if (x) x.click(); else p.classList.remove('open'); });
    } catch (err) {}
  }, true);

  // Deslizar el dedo a izquierda/derecha en Ajustes pasa de una pestaña a otra.
  const pf = () => document.getElementById('pfPanel');
  let ini = null;
  document.addEventListener('touchstart', (e) => {
    const p = pf(), t = e.touches[0];
    ini = p && p.classList.contains('open') && e.touches.length === 1 && p.contains(e.target) && !e.target.closest('input[type=range],select,textarea,#pfTabs') ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!ini) return;
    const t = e.changedTouches[0], dx = t.clientX - ini.x, dy = t.clientY - ini.y, rapido = Date.now() - ini.t < 700; ini = null;
    if (!rapido || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const bs = [...document.querySelectorAll('#pfTabs button')]; const i = bs.findIndex((b) => b.classList.contains('on')), j = i + (dx < 0 ? 1 : -1);
    if (i < 0 || j < 0 || j >= bs.length) return;
    const body = document.getElementById('pfBody'); if (body) body.dataset.dir = dx < 0 ? 'izq' : 'der';
    bs[j].click(); setTimeout(() => { if (body) delete body.dataset.dir; }, 350);
  }, { passive: true });
  window.IcemanInterfaz = { dock };
})();
