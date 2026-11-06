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
  setInterval(() => {
    const hay = !!dock.querySelector('button:not([hidden])');
    dock.hidden = !hay;
    dock.classList.toggle('oculto', hoja());
  }, 250);
  window.IcemanInterfaz = { dock };
})();
