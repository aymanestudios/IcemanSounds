// Pantalla de bienvenida de Iceman Sounds: la primera vez que alguien entra, se encuentra con esto antes de nada.
// Explica en cuatro líneas qué hace el DJ y la web, y con "¡Entendido, vamos!" se cierra y ya puede entrar.
// Solo se muestra una vez por navegador (localStorage.bienv_v1). Para verla otra vez: abre la web con ?bienvenida
// No toca nada de la radio, no hace peticiones y no guarda datos personales. Para quitarla: quita 'bienvenida.js' de la lista en assistant.js.
(function () {
  'use strict';
  if (window.__bienvenida) return;
  window.__bienvenida = true;

  const KEY = 'bienv_v1';
  let vista = false;
  try { vista = localStorage[KEY] === '1'; } catch (e) {}
  const forzada = /[?&]bienvenida(=|&|$)/.test(location.search);
  if (vista && !forzada) return;

  const css = `
#bienv{position:fixed;inset:0;z-index:2147483000;background:radial-gradient(120% 80% at 50% 0%,#0f2a33 0%,#070d12 62%);color:var(--hielo,#eaf6f8);
  font:16px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;overflow-y:auto;-webkit-overflow-scrolling:touch;animation:bvIn .45s ease both}
#bienv *{box-sizing:border-box}
#bienv .bvW{max-width:440px;margin:0 auto;padding:max(28px,env(safe-area-inset-top)) 22px 0;min-height:100%;display:flex;flex-direction:column}
#bienv .bvMarca{font:700 19px/1 var(--f,ui-rounded,system-ui,sans-serif);letter-spacing:-.01em;opacity:.95}
#bienv h2{font:700 33px/1.05 var(--f,ui-rounded,system-ui,sans-serif);letter-spacing:-.025em;margin:16px 0 8px}
#bienv .bvSub{font-size:17px;color:var(--escarcha,#8fb3bb);margin:0 0 16px}
#bienv .bvLista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
#bienv .bvLista li{display:flex;gap:13px;align-items:flex-start;padding:11px 14px;border-radius:18px;background:#ffffff0d;border:1px solid #ffffff14}
#bienv .bvE{font-size:25px;line-height:1.1;flex:none;width:32px;text-align:center}
#bienv .bvLista b{display:block;font:700 16.5px/1.2 var(--f,ui-rounded,system-ui,sans-serif);margin-bottom:2px}
#bienv .bvLista span{color:var(--escarcha,#8fb3bb);font-size:14.5px}
#bienv .bvConf{margin:14px 0 0;padding:13px 14px;border-radius:18px;background:#12a9b81a;border:1px solid #12a9b84d;font-size:14.5px;color:#cfe9ee}
#bienv .bvConf b{color:var(--hielo,#eaf6f8)}
#bienv .bvPie{margin-top:auto;position:sticky;bottom:0;padding:18px 0 max(18px,env(safe-area-inset-bottom));background:linear-gradient(180deg,#070d1200,#070d12 38%)}
#bienv button{width:100%;font:700 18px/1 var(--f,ui-rounded,system-ui,sans-serif);border:0;border-radius:999px;padding:18px 20px;background:var(--ac,#12a9b8);color:#031014;cursor:pointer;box-shadow:0 10px 30px -10px #12a9b8aa;transition:transform .12s}
#bienv button:active{transform:scale(.98)}
#bienv button:focus-visible{outline:3px solid #bffaff;outline-offset:3px}
#bienv .bvFirma{text-align:center;font-size:12.5px;color:var(--escarcha,#8fb3bb);margin-top:11px;opacity:.85}
@keyframes bvIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes bvOut{to{opacity:0;transform:scale(1.02)}}
#bienv.fuera{animation:bvOut .25s ease both;pointer-events:none}
@media (prefers-reduced-motion:reduce){#bienv,#bienv.fuera{animation:none}}
@media (min-width:700px){#bienv .bvW{max-width:640px}#bienv h2{font-size:38px}}
@media (max-height:640px){#bienv h2{font-size:28px;margin-top:16px}#bienv .bvLista li{padding:10px 12px}}
`;

  const FILAS = [
    ['🎙️', 'Un DJ con voz propia', 'Entre bloques te suelta su rollo, como en la radio. Nunca te pisa la música.'],
    ['🎧', 'Tu música, pero con sorpresas', 'Mezcla lo que ya escuchas con canciones antiguas tuyas y artistas nuevos que te pueden molar.'],
    ['💬', 'Háblale cuando quieras', '¿Gym, estudio, fiesta? Díselo por el chat y te monta el ambiente.'],
    ['✨', 'Y más cositas', '🎤 un bloque de un artista concreto · 🎫 conciertos de tus artistas · ♥ para guardar lo que te flipa · 🚫 para no oír una nunca más.']
  ];

  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function montar() {
    if (document.getElementById('bienv')) return;
    const st = el('style'); st.textContent = css; document.head.append(st);

    const root = el('div'); root.id = 'bienv'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'bvT');
    const w = el('div', 'bvW');
    w.append(el('div', 'bvMarca', '🧊 Iceman Sounds'));
    const h = el('h2', '', '¡Ey, bienvenido! 👋'); h.id = 'bvT'; w.append(h);
    w.append(el('p', 'bvSub', 'Tu radio con un DJ que de verdad habla. Tú dale al play y disfruta.'));

    const ul = el('ul', 'bvLista');
    FILAS.forEach(([e, t, d]) => { const li = el('li'); const x = el('div', 'bvE', e); const c = el('div'); c.append(el('b', '', t), el('span', '', d)); li.append(x, c); ul.append(li); });
    w.append(ul);

    const conf = el('div', 'bvConf');
    const b1 = el('b', '', '🔒 Cero líos con tus datos. '); conf.append(b1);
    conf.append(document.createTextNode('Entras con tu Spotify (hace falta Premium). Lo que escuchas no se manda a ninguna IA: se queda en tu navegador y lo borras desde ⚙️ cuando quieras. Solo lo que le escribes al DJ en el chat llega a su cerebro. Proyecto independiente, no es de Spotify.'));
    w.append(conf);

    const pie = el('div', 'bvPie');
    const btn = el('button', '', '¡Entendido, vamos! 🎧'); btn.type = 'button';
    pie.append(btn, el('div', 'bvFirma', 'Hecho con buen rollo por AymaneTheCreator'));
    w.append(pie);
    root.append(w);
    document.body.append(root);

    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const cerrar = () => {
      try { localStorage[KEY] = '1'; } catch (e) {}
      root.classList.add('fuera');
      document.documentElement.style.overflow = prev;
      setTimeout(() => { root.remove(); st.remove(); }, 260);
    };
    btn.onclick = cerrar;
  }

  if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar);
  window.IcemanBienvenida = { mostrar: montar };
})();
