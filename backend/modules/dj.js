// DJ extra: frases con las que el DJ reacciona a lo que haces (saltos, ♥, rachas de estilo).
//  GET /dj/extra?tipo=saltos  -> audio mp3 de una de las frases de ese tipo (texto en la cabecera X-Texto)
// - No toca /dj ni FRASES: son frases NUEVAS, con la misma voz y los mismos ajustes de ElevenLabs que server.js.
// - Mismo caché que /dj (carpeta backend/frases): cada frase se genera UNA vez.
// - En Render (disco que se borra) NO genera audios nuevos: solo usa los que ya subiste a GitHub.
//   Genéralos en tu PC con:  node modules/pregenerar-dj.js   (dentro de la carpeta backend) y luego Commit.
// - Si algo falla, devuelve error y la web usa la frase normal del DJ.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { usuarioDe } = require('./assistant');

const FRASES_EXTRA = {
  saltos: [
    'Vale, esto no te convence. Tranquilo, cambio de aires ahora mismo.',
    'Veo que vas saltando bastante. Dejo esto y probamos otra cosa.',
    'Entendido, no era lo que buscabas. Vamos a darle la vuelta a la sesión.',
    'Otra vez saltando, eh. Vamos a probar algo muy distinto.',
    'Vale, ahí no hay química. Cambio de estilo ahora mismo.'
  ],
  saltos_repetido: [
    'Seguimos sin dar con tu onda. Cuéntame en el chat qué te apetece y lo pongo.',
    'Esto sigue sin convencerte. Dime en el chat qué buscas y te lo pongo sin rodeos.'
  ],
  chequeo: [
    '¿Qué tal vamos? Si algo no te convence, salta sin miedo, que yo me adapto.',
    'Un momento, ¿te está gustando la sesión? Si quieres otra cosa, pídemela en el chat.',
    'Aquí sigue tu DJ, comprobando que todo va bien. Si quieres cambiar de rollo, ya sabes.'
  ],
  like: [
    'Esa te ha gustado, ¿eh? La tengo apuntada entre tus favoritas.',
    'Anotada, tienes buen gusto. Seguimos.'
  ],
  racha_reggaeton: ['Hoy vas de reggaetón, y me encanta la racha. Sigo por ahí.', 'Llevas un buen rato con reggaetón, así que la fiesta continúa.'],
  racha_rap:       ['Hoy vas de rap, eh. Me gusta esa racha, sigo por ahí.', 'Llevas un buen rato con hip hop, así que seguimos con las rimas.'],
  racha_rnb:       ['Hoy tienes un día de R&B y soul, y me gusta. Sigo por ahí.', 'Llevas un buen rato con R&B, así que seguimos con el sentimiento.'],
  racha_pop:       ['Hoy vas de pop, y la racha me gusta. Sigo por ahí.', 'Llevas un buen rato con pop, así que seguimos cantando.'],
  racha_afrobeat:  ['Hoy vas de afrobeat, y esa racha me encanta. Sigo por ahí.', 'Llevas un buen rato con afrobeat, así que seguimos con el ritmo.'],
  racha_electronica: ['Hoy vas de electrónica, eh. Me gusta la racha, sigo por ahí.', 'Llevas un buen rato con electrónica, así que seguimos bailando.']
};

// Ajustes de la voz: se leen de tu server.js para que SIEMPRE coincidan (si no se pueden leer, se usan estos)
const AJUSTES_POR_DEFECTO = { model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1.05 } };
function leerAjustes() {
  try {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const i = src.indexOf('const AJUSTES'), a = src.indexOf('{', i);
    if (i < 0 || a < 0) throw new Error('no encontrado');
    let d = 0, j = a;
    for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
    const o = new Function('return ' + src.slice(a, j + 1))();
    if (!o || !o.model_id || !o.voice_settings) throw new Error('formato inesperado');
    return o;
  } catch (e) { console.warn('dj.js: uso ajustes de voz por defecto (' + e.message + ')'); return AJUSTES_POR_DEFECTO; }
}
const AJUSTES = leerAjustes();
const CACHE = path.join(__dirname, '..', 'frases');
fs.mkdirSync(CACHE, { recursive: true });

const archivoDe = (texto) => path.join(CACHE, crypto.createHash('sha1').update(process.env.VOICE_ID + JSON.stringify(AJUSTES) + texto).digest('hex').slice(0, 12) + '.mp3');

async function vozDe(texto) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVEN_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: texto, ...AJUSTES }),
    signal: AbortSignal.timeout(25000)
  });
  if (!r.ok) throw new Error('ElevenLabs ' + r.status + ': ' + (await r.text()).slice(0, 150));
  return Buffer.from(await r.arrayBuffer());
}
async function vozConCache(texto) {
  const f = archivoDe(texto);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const audio = await vozDe(texto);
  fs.writeFileSync(f, audio);
  return audio;
}

const uso = new Map(); // límite sencillo: 20 peticiones cada 10 minutos por usuario
function dentro(id) {
  const ahora = Date.now(), l = (uso.get(id) || []).filter((t) => ahora - t < 600000);
  if (l.length >= 20) { uso.set(id, l); return false; }
  l.push(ahora); uso.set(id, l); return true;
}

module.exports = function (app) {
  app.get('/dj/extra', async (req, res) => {
    try {
      if (!process.env.ELEVEN_API_KEY || !process.env.VOICE_ID) return res.status(503).send('Voz no configurada');
      const id = await usuarioDe(req);
      if (!id) return res.status(401).send('Sesión de Spotify no válida');
      if (!dentro(id)) return res.status(429).send('Demasiado rápido');
      const lista = FRASES_EXTRA[String(req.query.tipo || '')];
      if (!lista) return res.status(400).send('Tipo desconocido');
      const guardadas = lista.filter((t) => fs.existsSync(archivoDe(t)));
      let texto;
      if (guardadas.length) texto = guardadas[Math.floor(Math.random() * guardadas.length)];
      else if (process.env.RENDER) return res.status(404).send('Frase aún no pregenerada');   // en Render no gastamos créditos en audios que se perderían
      else texto = lista[Math.floor(Math.random() * lista.length)];
      const audio = await vozConCache(texto);
      res.set('X-Texto', encodeURIComponent(texto));
      res.set('Content-Type', 'audio/mpeg');
      res.send(audio);
    } catch (e) { console.error('dj/extra:', e.message); res.status(500).send('error'); }
  });
};
module.exports.FRASES_EXTRA = FRASES_EXTRA;
module.exports.vozConCache = vozConCache;
module.exports.archivoDe = archivoDe;
