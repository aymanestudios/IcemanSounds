// Conciertos de tus artistas (solo lectura), con la API pública Discovery de Ticketmaster.
//  GET /conciertos?artistas=A|B|C&pais=ES&ciudad=Madrid   -> { eventos: [...], consultados: n }
// - Necesita una clave GRATIS de Ticketmaster en backend/.env:   TICKETMASTER_KEY=tu_clave   (nunca llega al navegador)
// - A Ticketmaster solo le llegan nombres de artistas, país y ciudad. Nada de tu cuenta de Spotify.
// - Si no hay clave o Ticketmaster falla, devuelve un error claro y el resto de la web sigue igual.
const { usuarioDe } = require('./assistant');

const BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';
const cache = new Map();          // consulta -> { hasta, eventos }
const uso = new Map();            // usuario -> marcas de tiempo
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function dentro(id) {
  const ahora = Date.now(), l = (uso.get(id) || []).filter((t) => ahora - t < 600000);
  if (l.length >= 6) { uso.set(id, l); return false; }   // 6 búsquedas cada 10 min por usuario
  l.push(ahora); uso.set(id, l); return true;
}

async function eventosDe(artista, pais, ciudad) {
  const clave = [norm(artista), pais, norm(ciudad)].join('|');
  const c = cache.get(clave);
  if (c && c.hasta > Date.now()) return c.eventos;
  const p = new URLSearchParams({ apikey: process.env.TICKETMASTER_KEY, keyword: artista, classificationName: 'music', size: '10', sort: 'date,asc' });
  if (pais) p.set('countryCode', pais);
  if (ciudad) p.set('city', ciudad);
  const r = await fetch(BASE + '?' + p, { signal: AbortSignal.timeout(10000) });
  if (r.status === 401 || r.status === 403) throw new Error('clave');
  if (!r.ok) throw new Error('Ticketmaster ' + r.status);
  const d = await r.json();
  const n = norm(artista);
  const eventos = ((d._embedded && d._embedded.events) || []).map((e) => {
    const at = ((e._embedded && e._embedded.attractions) || []).map((a) => a.name);
    const v = (e._embedded && e._embedded.venues && e._embedded.venues[0]) || {};
    return {
      artista, cartel: at.slice(0, 4),
      nombre: e.name, url: e.url,
      fecha: e.dates && e.dates.start && e.dates.start.localDate || '',
      hora: e.dates && e.dates.start && e.dates.start.localTime || '',
      sala: v.name || '', ciudad: (v.city && v.city.name) || '', pais: (v.country && v.country.countryCode) || '',
      _coincide: at.some((a) => norm(a) === n) || norm(e.name).includes(n)
    };
  }).filter((e) => e._coincide && e.url && e.fecha).map(({ _coincide, ...e }) => e);   // descarta resultados que no son del artista
  cache.set(clave, { hasta: Date.now() + 6 * 3600 * 1000, eventos });
  if (cache.size > 500) for (const [k, v] of cache) if (v.hasta < Date.now()) cache.delete(k);
  return eventos;
}

module.exports = function (app) {
  app.get('/conciertos', async (req, res) => {
    try {
      if (!process.env.TICKETMASTER_KEY) return res.status(503).json({ error: 'sin_clave' });
      const id = await usuarioDe(req);
      if (!id) return res.status(401).json({ error: 'Sesión de Spotify no válida' });
      if (!dentro(id)) return res.status(429).json({ error: 'Demasiadas búsquedas seguidas, espera unos minutos.' });
      const artistas = [...new Set(String(req.query.artistas || '').split('|').map((s) => s.trim()).filter((s) => s && s.length <= 80))].slice(0, 15);
      const pais = /^[A-Za-z]{2}$/.test(String(req.query.pais || '')) ? String(req.query.pais).toUpperCase() : '';
      const ciudad = String(req.query.ciudad || '').trim().slice(0, 60);
      if (!artistas.length) return res.status(400).json({ error: 'Faltan artistas.' });
      const todos = [];
      let fallos = 0;
      for (let i = 0; i < artistas.length; i += 4) {          // de 4 en 4: Ticketmaster limita a 5 peticiones por segundo
        const tanda = await Promise.all(artistas.slice(i, i + 4).map((a) => eventosDe(a, pais, ciudad).catch((e) => { if (e.message === 'clave') throw e; fallos++; return []; })));
        tanda.forEach((t) => todos.push(...t));
        if (i + 4 < artistas.length) await new Promise((r) => setTimeout(r, 1100));
      }
      if (fallos === artistas.length) return res.status(502).json({ error: 'Ticketmaster no responde ahora mismo.' });
      const vistos = new Set();
      const eventos = todos.filter((e) => !vistos.has(e.url) && vistos.add(e.url)).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 60);
      res.json({ eventos, consultados: artistas.length });
    } catch (e) {
      if (e.message === 'clave') return res.status(503).json({ error: 'clave_invalida' });
      console.error('conciertos:', e.message); res.status(500).json({ error: 'Error buscando conciertos.' });
    }
  });
};
