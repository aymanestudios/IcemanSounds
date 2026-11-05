// Genera UNA vez los audios de las frases nuevas del DJ (reacciones). Ejecútalo en tu PC, dentro de la carpeta backend:
//    node modules/pregenerar-dj.js
// Gasta créditos de ElevenLabs (aprox. 1 por carácter; el total sale al empezar) solo las frases que aún no existen.
// Después haz Commit y Sync para que Render tenga los audios.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { FRASES_EXTRA, vozConCache, archivoDe } = require('./dj');

(async () => {
  if (!process.env.ELEVEN_API_KEY || !process.env.VOICE_ID) { console.error('Falta ELEVEN_API_KEY o VOICE_ID en backend/.env'); process.exit(1); }
  const todas = Object.values(FRASES_EXTRA).flat();
  const faltan = todas.filter((t) => !fs.existsSync(archivoDe(t)));
  const creditos = faltan.reduce((n, t) => n + t.length, 0);
  console.log(`${todas.length} frases en total, ${faltan.length} por generar (unos ${creditos} créditos de ElevenLabs).`);
  for (const t of faltan) { await vozConCache(t); console.log('  hecha:', t); }
  console.log('Listo. Ahora haz Commit y Sync para subir los audios nuevos de backend/frases.');
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
