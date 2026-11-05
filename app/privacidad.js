// Privacidad de Iceman Sounds (Fase 0).
// 1) Limpieza única de lo que guardaban las versiones anteriores (perfil de gustos, estilos clasificados por IA, copia en IndexedDB).
// 2) Caducidad: cada 30 días se borran las cachés con datos de Spotify (biblioteca, "ya sonadas", estilos, favoritos).
// 3) Botón "Cerrar sesión y borrar mis datos de Spotify" (lo usa el panel de preferencias).
// 4) Si Spotify dice que desconectaste la app (invalid_grant), se borran esos datos solos.
// Lo que escribes tú (tus preferencias) y los ajustes (volumen, DJ) NO se borran con la caducidad.
(function () {
  'use strict';
  if (window.__priv) return;
  window.__priv = true;

  const LS = localStorage;
  const VERSION = '10';
  const DIA = 864e5;
  const CACHES = ['lib', 'played', 'generosArtistas', 'afroMapa', 'favArtistas', 'colchon'];   // datos derivados de Spotify
  const SESION = ['ses_v1'];                                                                   // sessionStorage
  const TOKENS = ['at', 'rt', 'exp', 'v'];
  const hay = (n) => { try { return typeof (0, eval)(n) !== 'undefined'; } catch (e) { return false; } };
  const get = (n) => (0, eval)(n);

  const quitar = (claves) => claves.forEach((k) => { try { LS.removeItem(k); } catch (e) {} });
  const quitarPerfilAntiguo = () => {
    const ks = []; for (let i = 0; i < LS.length; i++) ks.push(LS.key(i));
    ks.filter((k) => /^perfil_/.test(k)).forEach((k) => { try { LS.removeItem(k); } catch (e) {} });
    try { indexedDB.deleteDatabase('iceman'); } catch (e) {}                 // la copia de seguridad del perfil antiguo
  };

  // ---------- 1) Limpieza única ----------
  let recargar = false;
  try {
    if (LS.priv_v !== VERSION) {
      quitarPerfilAntiguo();
      quitar(['generosArtistas', 'afroMapa', 'favArtistas', 'lib']);          // estaban clasificados por IA: se recalculan con el diccionario
      LS.priv_v = VERSION; LS.priv_t0 = String(Date.now());
      // si la página ya tenía la biblioteca antigua en memoria, se recarga una vez para que no la vuelva a guardar
      try { recargar = !!(LS.at && hay('lib') && get('lib')); } catch (e) {}
    } else {
      // ---------- 2) Caducidad de 30 días ----------
      const t0 = Number(LS.priv_t0) || 0;
      if (!t0) LS.priv_t0 = String(Date.now());
      else if (Date.now() - t0 > 30 * DIA) { quitar(CACHES); LS.priv_t0 = String(Date.now()); }
    }
  } catch (e) {}
  if (recargar) setTimeout(() => location.reload(), 300);

  // ---------- 3) Borrar todo lo de Spotify ----------
  async function borrarDatosSpotify() {
    quitar(CACHES); quitar(['blocked']); quitar(TOKENS); quitarPerfilAntiguo();
    try { SESION.forEach((k) => sessionStorage.removeItem(k)); } catch (e) {}
    try { LS.priv_t0 = String(Date.now()); } catch (e) {}
  }
  async function salir() {
    await borrarDatosSpotify();
    location.reload();
  }

  // ---------- 4) Desconexión detectada ----------
  try {
    const f = window.fetch;
    window.fetch = function (u, o) {
      const p = f.apply(this, arguments);
      try {
        if (typeof u === 'string' && u.indexOf('accounts.spotify.com/api/token') >= 0) {
          p.then((r) => { if (r && (r.status === 400 || r.status === 401)) r.clone().json().then((d) => { if (d && d.error === 'invalid_grant') borrarDatosSpotify(); }).catch(() => {}); }).catch(() => {});
        }
      } catch (e) {}
      return p;
    };
  } catch (e) {}

  window.IcemanPrivacidad = { salir, borrarDatosSpotify, CACHES };
})();
