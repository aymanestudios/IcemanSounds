// Módulos nuevos de Iceman Sounds. Se montan con UNA línea en server.js.
// Cada módulo se carga por separado: si uno falla, los demás (y el DJ de siempre) siguen funcionando.
const path = require('path');
const express = require('express');

module.exports = function montar(app) {
  // Archivos del frontend nuevo (app/assistant.js, etc.)
  app.use('/app', express.static(path.join(__dirname, '..', '..', 'app')));

  const cargados = [];
  for (const m of ['assistant', 'dj']) {
    try { require('./' + m)(app); cargados.push(m); }
    catch (e) { console.warn('Módulo "' + m + '" no cargado:', e.message); }
  }
  console.log('Módulos nuevos cargados:', cargados.join(', ') || 'ninguno');
};
