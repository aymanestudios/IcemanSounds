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

  // Pequeños retoques de texto (sin tocar la lógica de la web)
  const $$ = (id) => document.getElementById(id);
  const h1 = document.querySelector('h1'); if (h1) h1.textContent = 'Iceman Sounds';              // el cubo ahora es un icono propio
  const go = $$('go'); if (go) go.textContent = 'Empezar la radio';                                 // sin emoticono
  const pp = $$('pp');                                                                                // ▶ / ⏸ -> icono de play o pausa
  if (pp) {
    const sync = () => { pp.dataset.e = pp.textContent.trim() === '⏸' ? 'pausa' : 'play'; };
    new MutationObserver(sync).observe(pp, { childList: true, characterData: true, subtree: true }); sync();
  }
})();
