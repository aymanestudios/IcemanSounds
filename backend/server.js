// server.js: el "cerebro" secreto del DJ.
//  /dj   -> devuelve el audio de lo que dice el DJ (y el texto en la cabecera X-Texto)
//  /mood -> DESACTIVADO (Fase 0: no se envían datos de Spotify a Claude)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

// ====== AJUSTES QUE PUEDES CAMBIAR ======
const NOMBRE = 'Iceman Sounds';       // el nombre de tu DJ (si lo cambias, se generan intros nuevas)
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

// (Fase 0: la función que llamaba a Claude desde aquí se ha quitado; el servidor ya no envía nada a Claude.)

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
    const { tema } = req.body;
    let audio, texto = '';
    // Fase 0 (cumplimiento Spotify): ya NO se manda ninguna canción ni artista a Claude. Siempre suena una frase guardada.
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

app.post('/mood', (req, res) => {
  // Desactivado en la Fase 0: enviaba títulos de canciones de Spotify a Claude. La web actual no lo usa.
  res.status(410).json({ error: 'Desactivado.' });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'djKELOKE.HTML')));
app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, '..', 'logo.png')));
['manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'].forEach(f =>
  app.get('/' + f, (req, res) => res.sendFile(path.join(__dirname, '..', f))));

app.post('/generos', (req, res) => {
  // Fase 0: sin IA. Los estilos salen de un diccionario escrito a mano (backend/modules/estilos.js); lo que no está, es "otros".
  try {
    const { clasificar } = require('./modules/estilos');
    res.json(clasificar((req.body || {}).artistas));
  } catch (e) { console.error(e); res.status(500).send('No pude clasificar ahora.'); }
});
   try { require('./modules')(app); } catch (e) { console.warn('Módulos nuevos no cargados:', e.message); }

app.listen(process.env.PORT || 3000, () => console.log('Servidor listo'));