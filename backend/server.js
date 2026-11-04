// server.js: el "cerebro" secreto del DJ.
//  /dj   -> devuelve el audio de lo que dice el DJ (y el texto en la cabecera X-Texto)
//  /mood -> Claude elige qué canciones encajan con un mood (necesita clave de Anthropic)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

// ====== AJUSTES QUE PUEDES CAMBIAR ======
const NOMBRE = 'Iceman Sounds';       // el nombre de tu DJ (si lo cambias, se generan intros nuevas)
const PROB_PERSONALIZADA = 0.05;  // % de veces que habla Claude con datos reales (solo si hay clave de Anthropic)
const FRASES = {                  // frases guardadas por tema: se generan UNA vez y se reutilizan
  // Intros: una de ellas suena siempre al empezar la sesión
  intro: [
    `Muy buenas, soy ${NOMBRE}. Hoy vengo con unas vibras bien altas.`,
    `¡Hola, hola! Aquí ${NOMBRE}, listo para poner la música que te mueve.`,
    `Bienvenido, soy ${NOMBRE}. Ponte cómodo, que empieza el show.`,
    `Aquí ${NOMBRE} otra vez. Sube el volumen, que arrancamos.`
  ],
  reggaeton:   ['Ahora toca reggaetón, ¡a mover el cuerpo!', 'Vamos con una tanda de reggaetón de la buena.'],
  rap:         ['Ahora, un bloque de hip hop y rap.', 'Toca rap, con las rimas por delante.'],
  rnb:         ['Ahora, R&B y soul para ir con calma.', 'Vamos con una tanda de soul y R&B, suave y con sentimiento.'],
  pop:         ['Ahora, un poquito de pop.', 'Vamos con canciones pop para cantar.'],
  electronica: ['Ahora, electrónica para no parar de bailar.', 'Vamos con música electrónica.'],
  mezcla:      ['Ahora, una mezcla de todo un poco.', 'Vamos con una mezcla, sin etiquetas y sin reglas.'],
  general:   ['Seguimos con la música, que esto no para.', 'Aquí sigue vuestro DJ de confianza.', 'Subid el volumen, que esto se pone bueno.'],
  viejas:    ['Ahora vamos a rescatar canciones que guardaste hace tiempo.', 'Hoy toca recordar temas que tenías olvidados.'],
  playlists: ['Ahora, un poquito de lo mejor de tus playlists.', 'Vamos con canciones de tus propias listas.'],
  artistas:  ['Ahora, más música de tus artistas favoritos.', 'Vamos a profundizar en los artistas que más te gustan.'],
  top:       ['Ahora, lo que más has escuchado durante este último año.', 'Vamos con tus canciones más repetidas del año.'],
  recientes: ['Ahora, lo último que has guardado en tus favoritas.', 'Vamos con lo más reciente de tus Me gusta.', 'Ahora, canciones que acabas de añadir a tus favoritas.'],
};
const MOODS = {
  noche: 'conducir de noche (R&B, soul, ambiente nocturno)',
  triste: 'acompañar un día triste (melancólicas, suaves)',
  energia: 'subir la energía (animadas, con ritmo)',
  chill: 'relajarse (tranquilas, suaves)'
};
const SYS_DJ = 'Eres un DJ de radio con mucha personalidad y buen rollo. Hablas en español, ' +
               'máximo 2 frases cortas, sin emojis. Menciona alguna de las canciones y no inventes datos sobre ellas.';
// ========================================
const AJUSTES = {
  model_id: 'eleven_multilingual_v2',   // el de mejor calidad en español
  voice_settings: {
    stability: 0.4,          // más bajo = más expresivo y menos monótono
    similarity_boost: 0.8,
    style: 0.35,             // más alto = más "actuado" y enérgico
    use_speaker_boost: true,
    speed: 1.05              // de 0.7 a 1.2
  }
};
const CACHE = path.join(__dirname, 'frases');       // audios generados (automático)
const PROPIAS = path.join(__dirname, 'mis-frases'); // tus mp3 (los metes tú a mano)
[CACHE, PROPIAS].forEach(d => fs.mkdirSync(d, { recursive: true }));

const app = express();
// exposedHeaders deja que la web lea el texto de la frase (cabecera X-Texto)
app.use(cors({ origin: 'http://127.0.0.1:5500', exposedHeaders: ['X-Texto'] }));
app.use(express.json());

async function claude(system, user, max) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: max, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] })
  });
  if (!r.ok) throw new Error('Claude: ' + await r.text());
  const data = await r.json();
const bloque = data.content.find(b => b.type === 'text');
if (!bloque) throw new Error('Claude no devolvió texto (' + data.stop_reason + ')');
return bloque.text;
}

async function vozDe(texto) { // esto es lo que gasta créditos de ElevenLabs
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVEN_API_KEY, 'content-type': 'application/json', 'accept': 'audio/mpeg' },
    body: JSON.stringify({ text: texto, ...AJUSTES })
  });
  if (!r.ok) throw new Error('ElevenLabs: ' + await r.text());
  return Buffer.from(await r.arrayBuffer());
}

async function vozConCache(texto) { // si ya se generó antes, reutiliza el archivo
  const id = crypto.createHash('sha1').update(process.env.VOICE_ID + JSON.stringify(AJUSTES) + texto).digest('hex').slice(0, 12);
  const archivo = path.join(CACHE, id + '.mp3');
  if (fs.existsSync(archivo)) { console.log('Reutilizo audio guardado (0 créditos):', texto); return fs.readFileSync(archivo); }
  console.log('Generando y guardando audio nuevo:', texto);
  const audio = await vozDe(texto);
  fs.writeFileSync(archivo, audio);
  return audio;
}

app.post('/dj', async (req, res) => {
  try {
    const { canciones, modo, tema } = req.body;
    let audio, texto = '';
    // Frase personalizada con Claude (solo si hay clave y nunca en la intro)
    if (tema !== 'intro' && process.env.ANTHROPIC_API_KEY && Math.random() < PROB_PERSONALIZADA) {
      try {
        texto = await claude(SYS_DJ, `Vas a poner ${modo}. Las próximas canciones son: ${canciones.join(', ')}.`, 400);
        console.log('DJ dice (personalizada):', texto);
        audio = await vozDe(texto);
      } catch (e) { console.warn('Personalizada falló, uso frase guardada:', e.message); audio = null; texto = ''; }
    }
    if (!audio) { // frase guardada del tema (o un mp3 tuyo)
      const lista = FRASES[tema] || FRASES.general;
      const propias = tema === 'intro' ? [] : fs.readdirSync(PROPIAS).filter(n => n.toLowerCase().endsWith('.mp3'));
      const n = Math.floor(Math.random() * (lista.length + propias.length));
      if (n < lista.length) { texto = lista[n]; audio = await vozConCache(texto); }
      else { texto = ''; audio = fs.readFileSync(path.join(PROPIAS, propias[n - lista.length])); }
    }
    res.set('X-Texto', encodeURIComponent(texto)); // la web lo muestra en pantalla
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (e) { console.error(e); res.status(500).send(e.message); }
});

app.post('/mood', async (req, res) => {
  try {
    const { mood, n, canciones } = req.body;
    const txt = await claude('Eliges canciones para un DJ. Responde SOLO con un array JSON de números, sin texto.',
      `Elige las ${n} canciones que mejor encajan para ${MOODS[mood]}. Lista numerada desde 0:\n` +
      canciones.map((c, i) => i + ': ' + c).join('\n'), 300);
    res.json({ indices: JSON.parse(txt.match(/\[[\d,\s]*\]/)[0]) });
  } catch (e) { console.error(e); res.status(500).send(e.message); }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'djKELOKE.HTML')));
app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, '..', 'logo.png')));
['manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'].forEach(f =>
  app.get('/' + f, (req, res) => res.sendFile(path.join(__dirname, '..', f))));

  app.post('/generos', async (req, res) => {
  try {
    const { artistas } = req.body;
    const txt = await claude(
      'Clasificas artistas musicales por estilo. Responde SOLO con un objeto JSON {"nombre":"estilo"}, sin texto extra. ' +
      'Estilos permitidos: reggaeton, rap, rnb, pop, electronica, otros. Usa exactamente los nombres que te doy.',
      'Clasifica cada artista en su estilo principal (reggaeton incluye música urbana latina y trap latino; rap incluye hip hop y trap; rnb incluye soul):\n' + artistas.join('\n'),
      3000);
    res.json(JSON.parse(txt.match(/\{[\s\S]*\}/)[0]));
  } catch (e) { console.error(e); res.status(500).send(e.message); }
});

app.listen(process.env.PORT || 3000, () => console.log('Servidor listo'));