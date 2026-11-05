// Módulos nuevos de Iceman Sounds. Se montan con UNA línea en server.js.
// Si algo aquí falla, server.js lo captura y el DJ sigue funcionando igual.
const path = require('path');
const express = require('express');

module.exports = function montar(app) {
  // Archivos del frontend nuevo (app/assistant.js, etc.)
  app.use('/app', express.static(path.join(__dirname, '..', '..', 'app')));

  require('./assistant')(app);
  // Fases siguientes: perfil, conciertos, comunidad...
  console.log('Módulos nuevos cargados: asistente');
};
