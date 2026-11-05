// Diccionario de estilos y escenas escrito A MANO (sin IA y sin datos de Spotify).
// Sustituye a las llamadas a Claude que clasificaban artistas: aquí solo se comparan nombres con listas fijas.
// Si un artista no está, su estilo es "otros" (la radio funciona igual). Puedes ampliar las listas cuando quieras.
//  clasificar(nombres)  -> { "Nombre": "estilo" }   estilos: reggaeton, rap, rnb, pop, electronica, otros
//  esAfro(nombre)       -> true/false               afrobeat / afropop / amapiano
//  cercanos(nombre, n)  -> hasta n artistas de la misma escena (para el botón 🎤)

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const lista = (txt) => txt.split('|').map(norm).filter(Boolean);

const ESTILOS = {
  reggaeton: lista(`tokischa|rochy rd|yailin la mas viral|el alfa|los legendarios|j quiles|farina|bad bunny|karol g|j balvin|ozuna|anuel aa|anuel|daddy yankee|don omar|wisin|yandel|wisin y yandel|wisin & yandel|nicky jam|farruko|maluma|rauw alejandro|jhay cortez|myke towers|feid|sech|lunay|eladio carrion|mora|arcangel|de la ghetto|zion y lennox|zion & lennox|plan b|tito el bambino|ivy queen|becky g|natti natasha|quevedo|bizarrap|justin quiles|jowell y randy|jowell & randy|alex rose|brray|young miko|lenny tavarez|nengo flow|baby rasta|hector el father|tego calderon|nejo|gente de zona|chencho corleone|jay wheeler|dimelo flow|bryant myers|darell|nio garcia|casper magico|cosculluela|noriel|rich music|ryan castro|blessd|omar montes|bad gyal|tainy|dalex|cris mj|ovy on the drums|mambo kingz|rafa pabon|kevvo|chucho flash|maldy|sebastian yatra|manuel turizo|danny ocean|miky woodz`),
  rap: lista(`kidd keo|israel b|dinos|orelsan|vald|nekfeu|bigflo et oli|mister v|heuss l enfoire|josman|hornet la frappe|gradur|kekra|lomepal|lil nas x|doechii|glorilla|latto|ice spice|sexyy red|kodak black|rod wave|little simz|aitch|tion wayne|russ millions|dutchavelli|d block europe|lil tjay|drake|kendrick lamar|j cole|travis scott|kanye west|ye|jay z|eminem|50 cent|snoop dogg|dr dre|nas|lil wayne|future|21 savage|lil baby|lil uzi vert|juice wrld|post malone|tyler the creator|a ap rocky|asap rocky|nicki minaj|cardi b|megan thee stallion|roddy ricch|dababy|gunna|young thug|migos|offset|quavo|takeoff|playboi carti|polo g|lil durk|nba youngboy|pop smoke|central cee|dave|stormzy|skepta|headie one|digga d|aj tracey|jack harlow|logic|mac miller|xxxtentacion|lil peep|ski mask the slump god|don toliver|metro boomin|lil tecca|trippie redd|big sean|wiz khalifa|ludacris|ice cube|2pac|tupac|the notorious b i g|notorious big|rick ross|meek mill|jid|denzel curry|freddie gibbs|earl sweatshirt|morad|abir|beny jr|natos y waor|c tangana|kase o|violadores del verso|nach|sfdk|el chojin|mala rodriguez|la mala rodriguez|hard gz|cruz cafune|recycled j|dellafuente|pedro ladroga|yung beef|kaydy cain|bejo|ayax y prok|ayax|prok|lil santa|rvfv|rels b|delaossa|duki|trueno|khea|cazzu|nicki nicole|wos|ysy a|neo pistea|tiago pzk|lit killah|bhavi|mesita|big one|ninho|jul|sch|pnl|booba|damso|gazo|tiakola|werenoi|hamza|laylow|lacrim|kaaris|niska|naps|rim k|alonzo|sdm|leto|zkr|maes|freeze corleone|ziak|soolking|ptazeta|soto asa|jarfaiter|drefquila|lucho ss|yung sarria`),
  rnb: lista(`chloe|coco jones|muni long|tink|queen naija|jacquees|the weeknd|sza|frank ocean|usher|chris brown|bryson tiller|summer walker|h e r|daniel caesar|giveon|brent faiyaz|jhene aiko|miguel|kehlani|ari lennox|jorja smith|tinashe|ne yo|beyonce|alicia keys|john legend|anderson paak|silk sonic|6lack|partynextdoor|partynextdoor|khalid|lucky daye|victoria monet|normani|ella mai|mary j blige|aaliyah|jodeci|d angelo|erykah badu|lauryn hill|amy winehouse|sade|stevie wonder|marvin gaye|al green|otis redding|aretha franklin|whitney houston|toni braxton|tyrese|trey songz|omarion|jeremih|the dream|tank|sabrina claudio|snoh aalegra|tory lanez|joji|dvsn|ty dolla ign|kali uchis|syd|mariah the scientist`),
  pop: lista(`nathy peluso|angele|stromae|indila|m pokora|bruno mars|adele|taylor swift|ariana grande|dua lipa|billie eilish|ed sheeran|justin bieber|harry styles|olivia rodrigo|sabrina carpenter|selena gomez|shawn mendes|katy perry|lady gaga|rosalia|shakira|enrique iglesias|aitana|lola indigo|pablo alboran|alejandro sanz|david bisbal|ricky martin|camila cabello|charlie puth|lewis capaldi|sam smith|imagine dragons|coldplay|maroon 5|onerepublic|anitta|tini|emilia|maria becerra|danna paola|camilo|morat|reik|ha ash|mau y ricky|luis fonsi|juanes|pitbull|sia|rihanna|miley cyrus|ava max|tate mcrae|conan gray|gracie abrams|chappell roan|the kid laroi|doja cat|lizzo|lana del rey|lorde|halsey|rose|jungkook|bts|blackpink|melendi|pablo lopez|dani martin|manuel carrasco|malu|gims|ed sheeran|mon laferte|natalia lafourcade|paula cendejas|ana mena|abraham mateo|cali y el dandee|bomba estereo|sofia reyes|karol sevilla`),
  electronica: lista(`bicep|purple disco machine|sofi tukker|gorgon city|duke dumont|claptone|david guetta|dj snake|calvin harris|avicii|martin garrix|tiesto|marshmello|alan walker|kygo|zedd|skrillex|diplo|major lazer|deadmau5|daft punk|swedish house mafia|afrojack|the chainsmokers|fisher|chris lake|fred again|peggy gou|bonobo|disclosure|kaytranada|jamie xx|four tet|aphex twin|flume|odesza|illenium|porter robinson|madeon|rufus du sol|sebastian ingrosso|steve aoki|r3hab|oliver heldens|don diablo|robin schulz|lost frequencies|meduza|tchami|cassius|the prodigy|justice|moby|armin van buuren|hardwell|dimitri vegas|like mike|nervo|axwell|eric prydz|boris brejcha|solomun|tale of us|charlotte de witte|amelie lens|paul kalkbrenner|nina kraviz|john summit|dom dolla|vintage culture|alok|kshmr|gryffin|lost kings`),
  afrobeat: lista(`j hus|burna boy|wizkid|davido|rema|tems|asake|ayra starr|tyla|fireboy dml|ckay|omah lay|kizz daniel|tiwa savage|joeboy|oxlade|black sherif|mr eazi|yemi alade|diamond platnumz|stonebwoy|shatta wale|fally ipupa|master kg|tyler icu|uncle waffles|focalistic|kabza de small|dj maphorisa|spyro|libianca|gyakie|king promise|camidoh|lojay|victony|ruger|bnxn|buju|odumodublvck|olamide|pheelz|bella shmurda|zinoleesky|joe dwet file|dadju|tayc|franglish|locko|aya nakamura|naza|ferre gola|innoss b|dj arafat|tekno|patoranking|flavour|runtown|d banj|2baba|p square|psquare|sarkodie|wande coal|lady donli|ayra|ice prince|skales|simi|johnny drille|adekunle gold|chike|oxlade|crayon|magixx|fave|asake|young jonn|seyi vibez|shallipopi|portable|kel p|bad boy timz|ycee|mayorkun|dremo|teni|niniola|reekado banks|eugy|kidi|mugeez|r2bees|medikal|fuse odg|amaarae|moliy|tay iwar`)
};

// Escenas: grupos de artistas que suelen sonar juntos (para sugerir "cercanos" en el bloque de un artista).
// No dicen que hayan colaborado: solo que comparten sonido, país o época.
const ESCENAS = [
  lista('morad|beny jr|abir|natos y waor|c tangana|delaossa|recycled j|dellafuente|cruz cafune|pedro ladroga|kaydy cain|yung beef|bejo|ayax y prok|hard gz|rels b|lil santa|rvfv|ptazeta|soto asa|quevedo|bad gyal'),
  lista('bad bunny|ozuna|anuel aa|myke towers|jhay cortez|rauw alejandro|farruko|eladio carrion|lunay|arcangel|de la ghetto|sech|brray|jay wheeler|kevvo|young miko|nengo flow'),
  lista('karol g|j balvin|feid|maluma|manuel turizo|ryan castro|blessd|sebastian yatra|danny ocean|kali uchis|camilo'),
  lista('daddy yankee|don omar|wisin|yandel|wisin y yandel|plan b|tito el bambino|zion y lennox|hector el father|tego calderon|ivy queen|nicky jam|baby rasta|gente de zona'),
  lista('duki|bizarrap|trueno|khea|wos|cazzu|nicki nicole|lit killah|maria becerra|tiago pzk|emilia|tini|ysy a|neo pistea|bhavi|mesita|big one'),
  lista('drake|21 savage|future|travis scott|kendrick lamar|j cole|lil baby|lil wayne|young thug|gunna|don toliver|playboi carti|metro boomin|offset|quavo|migos|roddy ricch|polo g|lil durk|kanye west|ye|a ap rocky|asap rocky|tyler the creator|nicki minaj|cardi b|post malone|lil uzi vert|juice wrld'),
  lista('central cee|dave|stormzy|skepta|headie one|digga d|aj tracey'),
  lista('dinos|orelsan|vald|nekfeu|josman|hornet la frappe|gradur|kekra|lomepal|heuss l enfoire|ninho|jul|sch|pnl|booba|damso|gazo|tiakola|werenoi|hamza|laylow|lacrim|niska|naps|soolking|alonzo|leto|maes|sdm|zkr|kaaris|rim k|freeze corleone|ziak'),
  lista('the weeknd|sza|frank ocean|usher|chris brown|bryson tiller|summer walker|daniel caesar|giveon|brent faiyaz|jhene aiko|partynextdoor|kehlani|6lack|khalid|miguel|tinashe|ty dolla ign|joji'),
  lista('burna boy|wizkid|davido|rema|tems|asake|ayra starr|fireboy dml|ckay|omah lay|kizz daniel|tiwa savage|oxlade|joeboy|black sherif|victony|ruger|bnxn|lojay|libianca|pheelz|olamide|tyla|shallipopi|seyi vibez|tems'),
  lista('dadju|tayc|franglish|locko|aya nakamura|naza|gims'),
  lista('master kg|tyler icu|uncle waffles|focalistic|kabza de small|dj maphorisa'),
  lista('taylor swift|ariana grande|dua lipa|billie eilish|olivia rodrigo|sabrina carpenter|selena gomez|harry styles|tate mcrae|gracie abrams|chappell roan|doja cat'),
  lista('rosalia|aitana|lola indigo|pablo alboran|alejandro sanz|pablo lopez|dani martin|manuel carrasco|melendi'),
  lista('david guetta|calvin harris|martin garrix|tiesto|marshmello|alan walker|kygo|zedd|swedish house mafia|afrojack|the chainsmokers|avicii|r3hab|steve aoki|robin schulz|lost frequencies'),
  lista('fred again|peggy gou|bonobo|disclosure|kaytranada|jamie xx|four tet|fisher|chris lake|john summit|dom dolla|meduza')
];

const INDICE = new Map();   // nombre normalizado -> estilo
for (const est of Object.keys(ESTILOS)) for (const n of ESTILOS[est]) if (!INDICE.has(n)) INDICE.set(n, est);

// El estilo "afrobeat" no existe en la radio original (reggaeton, rap, rnb, pop, electronica, otros): se trata aparte.
function estiloDe(nombre) {
  const e = INDICE.get(norm(nombre));
  return !e || e === 'afrobeat' ? 'otros' : e;
}
function esAfro(nombre) { return INDICE.get(norm(nombre)) === 'afrobeat'; }

function clasificar(nombres) {
  const out = {};
  (Array.isArray(nombres) ? nombres : []).slice(0, 400).forEach((n) => {
    if (typeof n === 'string' && n.trim() && n.length <= 120) out[n] = estiloDe(n);
  });
  return out;
}

function cercanos(nombre, n) {
  const k = norm(nombre);
  if (!k) return [];
  const vecinos = new Set();
  ESCENAS.forEach((esc) => { if (esc.includes(k)) esc.forEach((x) => { if (x !== k) vecinos.add(x); }); });
  const arr = [...vecinos].sort(() => Math.random() - 0.5).slice(0, n || 3);
  return arr.map((x) => NOMBRES.get(x) || x);
}

// nombre "bonito" para buscar en Spotify (la búsqueda ignora mayúsculas, pero así el texto del DJ queda mejor)
const NOMBRES = new Map();
for (const est of Object.keys(ESTILOS)) ESTILOS[est].forEach((n) => NOMBRES.set(n, n.replace(/\b\w/g, (c) => c.toUpperCase())));

module.exports = { norm, estiloDe, esAfro, clasificar, cercanos, ESTILOS };
