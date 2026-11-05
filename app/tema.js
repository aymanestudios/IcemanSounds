// Rediseño visual (solo estilos). Se desactiva con ?tema=off o localStorage.tema = 'off'.
(function () {
  'use strict';
  if (window.__tema) return;
  try { if (/[?&]tema=off/.test(location.search) || localStorage.tema === 'off') return; } catch (e) {}
  window.__tema = true;
  let base = location.origin;
  try { if ((0, eval)('typeof SERVER') !== 'undefined') base = (0, eval)('SERVER'); } catch (e) {}
  const fuente = document.createElement('link');
  fuente.rel = 'stylesheet'; fuente.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700&display=swap';   // si no carga, se usa la fuente del sistema
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = base + '/app/tema.css';
  document.head.append(fuente, css);
})();
