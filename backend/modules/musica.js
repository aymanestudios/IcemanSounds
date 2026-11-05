// Dos ayudas para la música. Desde la Fase 0 NO usan IA: se resuelven con el diccionario escrito a mano (estilos.js).
//  POST /artista/plan    { artista }     -> { artistas: [hasta 3 artistas de la misma escena] }   (bloque "más de este artista")
//  POST /afro/clasificar { artistas: [] } -> { afro: [los que son afrobeat/afropop/amapiano...] }
// Misma seguridad que el asistente: token de Spotify válido + límite por usuario. No necesitan clave de Anthropic.
// El navegador comprueba todo en Spotify; aquí solo se comparan nombres con listas fijas.
const { guardia, corto } = require('./assistant');
const { esAfro, cercanos } = require('./estilos');

const limpia = (v, n) => corto(typeof v === 'string' ? v.replace(/[\r\n"{}\[\]]/g, ' ') : '', n);

module.exports = function (app) {
  app.post('/artista/plan', guardia(async (req, res) => {
    const artista = limpia((req.body || {}).artista, 80);
    if (!artista) return res.status(400).json({ error: 'Falta el artista.' });
    const artistas = cercanos(artista, 3).filter((x) => x.toLowerCase() !== artista.toLowerCase());
    res.json({ artistas });
  }, { sinClave: true }));

  app.post('/afro/clasificar', guardia(async (req, res) => {
    const lista = [...new Set((Array.isArray((req.body || {}).artistas) ? req.body.artistas : []).filter((x) => typeof x === 'string' && x.trim() && x.length <= 120))].slice(0, 100);
    if (!lista.length) return res.status(400).json({ error: 'Faltan artistas.' });
    res.json({ afro: lista.filter(esAfro) });
  }, { sinClave: true }));
};
