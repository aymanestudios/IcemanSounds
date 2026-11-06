// Conciertos (solo lectura): botón 🎫 -> próximos conciertos de TUS artistas más escuchados, con enlace a Ticketmaster.
// Tus artistas salen de tu Spotify; al servidor solo viajan sus nombres, el país y la ciudad que pongas aquí.
(function () {
  'use strict';
  if (window.__conciertos) return;
  window.__conciertos = true;

  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);
  const $$ = (id) => document.getElementById(id);
  const SRV = () => (hay('SERVER') ? get('SERVER') : location.origin);
  const LS = { get: (k, d) => { try { return localStorage[k] || d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage[k] = v; } catch (e) {} } };
  const PAISES = [['ES', 'España'], ['MX', 'México'], ['AR', 'Argentina'], ['CO', 'Colombia'], ['CL', 'Chile'], ['US', 'Estados Unidos'], ['GB', 'Reino Unido'], ['FR', 'Francia'], ['DE', 'Alemania'], ['IT', 'Italia'], ['PT', 'Portugal'], ['NL', 'Países Bajos']];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  const css = document.createElement('style');
  css.textContent = `
  #tkBtn{position:fixed;right:18px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:60;width:56px;height:56px;border-radius:50%;padding:0;font-size:24px;background:#ffffff26;color:#fff;border:1px solid #ffffff40;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 8px 28px #0008}
  #tkPanel{position:fixed;left:0;right:0;bottom:0;z-index:72;max-width:440px;margin:0 auto;height:min(82vh,660px);display:flex;flex-direction:column;background:#12121cf2;color:#fff;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border:1px solid #ffffff26;border-bottom:0;border-radius:24px 24px 0 0;box-shadow:0 -10px 40px #000a;transform:translateY(105%);transition:transform .28s ease;padding-bottom:env(safe-area-inset-bottom);font-family:inherit}
  #tkPanel.open{transform:none}
  #tkPanel .h{display:flex;justify-content:space-between;align-items:center;padding:16px 18px 8px;font-weight:700}
  #tkPanel .h button{background:none;border:0;color:#fff;font-size:20px;padding:4px 8px}
  #tkPanel .f{display:flex;gap:8px;padding:4px 18px 10px}
  #tkPanel select,#tkPanel input{flex:1;min-width:0;padding:10px;border-radius:12px;border:1px solid #ffffff30;background:#ffffff14;color:#fff;font-size:16px}
  #tkPanel select option{color:#000}
  #tkPanel .go{margin:0 18px 8px;padding:12px;border-radius:14px;border:0;background:var(--ac,#7cf);color:#000;font-weight:700;font-size:16px}
  #tkPanel .go:disabled{opacity:.5}
  #tkList{flex:1;overflow:auto;padding:4px 18px 16px;-webkit-overflow-scrolling:touch}
  #tkList .m{opacity:.8;font-size:14px;line-height:1.45;padding:10px 0}
  #tkList a{display:flex;gap:12px;align-items:center;padding:11px 0;border-top:1px solid #ffffff1a;color:#fff;text-decoration:none}
  #tkList .d{min-width:46px;text-align:center;font-weight:700;line-height:1.1}
  #tkList .d small{display:block;font-weight:400;opacity:.7;font-size:12px;text-transform:uppercase}
  #tkList .t b{display:block;font-size:15px}
  #tkList .t span{font-size:13px;opacity:.75}`;
  document.head.append(css);

  const btn = document.createElement('button');
  btn.id = 'tkBtn'; btn.type = 'button'; btn.title = 'Conciertos'; btn.textContent = '🎫'; btn.hidden = true;
  const panel = document.createElement('div');
  panel.id = 'tkPanel';
  panel.innerHTML = '<div class="h"><span>Conciertos de tus artistas</span><button type="button" id="tkX" aria-label="Cerrar">✕</button></div>' +
    '<div class="f"><select id="tkPais"></select><input id="tkCiudad" placeholder="Ciudad (opcional)" maxlength="60"></div>' +
    '<button type="button" class="go" id="tkGo">Buscar conciertos</button><div id="tkList"><div class="m">Pulsa buscar y miro los próximos conciertos de tus artistas más escuchados.</div></div>';
  document.body.append(btn, panel);

  const pais = $$('tkPais'), ciudad = $$('tkCiudad'), lista = $$('tkList'), go = $$('tkGo');
  PAISES.forEach(([c, n]) => { const o = document.createElement('option'); o.value = c; o.textContent = n; pais.append(o); });
  pais.value = LS.get('tkPais', 'ES'); ciudad.value = LS.get('tkCiudad', '');

  const msg = (t) => { lista.innerHTML = ''; const d = document.createElement('div'); d.className = 'm'; d.textContent = t; lista.append(d); };
  const abrir = (v) => { panel.classList.toggle('open', v); };
  btn.onclick = () => abrir(!panel.classList.contains('open'));
  $$('tkX').onclick = () => abrir(false);
  setInterval(() => { btn.hidden = !localStorage.at || ($$('app') && $$('app').hidden) || panel.classList.contains('open'); }, 1000);

  async function artistas() {
    const out = [];
    try {
      const r = await get('api')('/me/top/artists?time_range=medium_term&limit=15');
      ((r && r.items) || []).forEach((a) => a && a.name && out.push(a.name));
    } catch (e) { console.warn('top artistas:', e.message); }
    if (out.length < 8 && hay('lib') && get('lib')) {          // si Spotify no da tus top, uso los más frecuentes de tu biblioteca
      const c = {};
      Object.values(get('lib')).flat().forEach((t) => (t.artists || []).slice(0, 1).forEach((a) => { c[a.name] = (c[a.name] || 0) + 1; }));
      Object.keys(c).sort((a, b) => c[b] - c[a]).forEach((n) => { if (out.length < 15 && !out.includes(n)) out.push(n); });
    }
    return out;
  }

  go.onclick = async () => {
    go.disabled = true; msg('Buscando tus artistas…');
    LS.set('tkPais', pais.value); LS.set('tkCiudad', ciudad.value.trim());
    try {
      const as = await artistas();
      if (!as.length) { msg('No he podido leer tus artistas de Spotify. Pon música un rato y vuelve a probar.'); return; }
      msg('Buscando conciertos de ' + as.length + ' artistas… (puede tardar unos segundos)');
      const tok = await get('token')();
      const q = new URLSearchParams({ artistas: as.join('|'), pais: pais.value, ciudad: ciudad.value.trim() });
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
      let r; try { r = await fetch(SRV() + '/conciertos?' + q, { headers: { Authorization: 'Bearer ' + tok }, signal: ctl.signal }); } finally { clearTimeout(t); }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.error === 'sin_clave') msg('Esta función aún no está activada: falta la clave de Ticketmaster en el servidor (TICKETMASTER_KEY).');
        else if (d.error === 'clave_invalida') msg('La clave de Ticketmaster del servidor no es válida.');
        else msg(d.error || 'No he podido buscar conciertos ahora mismo.');
        return;
      }
      if (!d.eventos.length) { msg('Ninguno de tus ' + d.consultados + ' artistas tiene conciertos anunciados en ' + pais.options[pais.selectedIndex].text + (ciudad.value.trim() ? ' (' + ciudad.value.trim() + ')' : '') + '. Prueba sin ciudad o con otro país.'); return; }
      lista.innerHTML = '';
      d.eventos.forEach((e) => {
        const [y, m, dia] = e.fecha.split('-');
        const a = document.createElement('a'); a.href = e.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        const f = document.createElement('div'); f.className = 'd'; f.textContent = String(Number(dia)); const s = document.createElement('small'); s.textContent = MESES[Number(m) - 1] + ' ' + String(y).slice(2); f.append(s);
        const x = document.createElement('div'); x.className = 't';
        const b = document.createElement('b'); b.textContent = e.artista; const sp = document.createElement('span'); sp.textContent = [e.sala, e.ciudad, e.hora ? e.hora.slice(0, 5) : ''].filter(Boolean).join(' · ');
        x.append(b, sp); a.append(f, x); lista.append(a);
      });
      const n = document.createElement('div'); n.className = 'm'; n.textContent = 'Datos de Ticketmaster. Al tocar un concierto se abre su página oficial.'; lista.append(n);
    } catch (e) { msg(e.name === 'AbortError' ? 'Ticketmaster tarda demasiado. Prueba otra vez en un momento.' : 'Error: ' + e.message); }
    finally { go.disabled = false; }
  };
})();
