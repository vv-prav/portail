// =====================================================================
//  RÉGÉNÉRER public/carte/monde.js — la carte du monde cliquable
//
//  Usage :
//    mkdir /tmp/carte && cd /tmp/carte
//    npm i world-atlas topojson-client topojson-simplify d3-geo world-countries
//    node "<le salon>/scripts/genere-carte.js"
//
//  Même source que geo/pays.js (Natural Earth 1:50m, paquet `world-atlas`),
//  mais tout autre usage : là-bas chaque pays est projeté CENTRÉ SUR
//  LUI-MÊME pour que sa silhouette soit fidèle ; ici il faut au contraire
//  une projection unique où tous les pays coexistent.
//
//  ⚠️ Projection Natural Earth : ni Mercator (le Groenland y ferait la
//  taille de l'Afrique, et on cliquerait sur un mensonge), ni une
//  équivalente brute (les pôles y sont étirés au point qu'on ne reconnaît
//  plus la carte). Natural Earth est le compromis fait pour être REGARDÉ,
//  ce qui est exactement l'usage.
//
//  Trois chiffres mesurés qui justifient les choix :
//   · sans simplification, le tracé pèse 1 079 Ko ; simplifié à 0,1 et
//     arrondi au dixième de pixel, 145 Ko — 48 Ko une fois compressé, ce
//     que fait déjà le serveur. La carte reste nette à l'œil.
//   · sur un écran de 375 px, monde entier affiché, **2 pays sur 179**
//     atteignent la cible tactile de 44 × 44 px. La France fait 9 px de
//     côté, la Belgique 2. D'où `x`/`y` : le jeu ne teste pas si le doigt
//     est DANS le pays, il cherche le centre le plus proche. Sans ça, la
//     moitié du monde serait impossible à désigner.
//   · `aire` est la surface du tracé à l'écran, dans la boîte 1000 × 500.
//     Elle sert à écarter du TIRAGE ce qu'on ne saurait pas montrer.
// =====================================================================
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
// Les paquets sont cherchés là où on a lancé la commande : rien n'est
// installé dans le dépôt, c'est un outil, pas une dépendance.
const dep = (n) => require(path.join(process.cwd(), 'node_modules', n));

const topo = dep('world-atlas/countries-50m.json');
const { feature } = dep('topojson-client');
const { presimplify, simplify } = dep('topojson-simplify');
const { geoNaturalEarth1, geoPath } = dep('d3-geo');
const mondeCountries = dep('world-countries');

const W = 1000, H = 500;
const SIMPLIFICATION = 0.1;

// « 123.456789 » → « 123.5 » : le gain de poids le plus rentable de tous,
// et un dixième de pixel sur une carte de 1 000 px ne se voit pas.
const arrondir = (d) => d.replace(/-?\d+\.?\d*/g, (n) => (Math.round(+n * 10) / 10).toString());

const parNumerique = new Map(mondeCountries.map(c => [c.ccn3, c.cca2]));
// Les pays du salon : c'est eux qui font foi pour les noms français et pour
// ce qui est un pays. La carte n'en invente aucun.
const duSalon = new Map(require(path.join(RACINE, 'geo', 'pays.js')).map(p => [p.code, p]));

const t = simplify(presimplify(topo), SIMPLIFICATION);
const fc = feature(t, t.objects.countries);
const proj = geoNaturalEarth1().fitSize([W, H], fc);
const chemin = geoPath(proj);

// ⚠️ Natural Earth peut donner PLUSIEURS géométries pour un même pays
// (l'Australie en a deux : le continent et ses îles lointaines). Sans
// regroupement, on écrivait deux entrées de même code — donc deux balises
// SVG de même identifiant, et `marquer('AU')` n'en trouvait qu'une.
// On rassemble les tracés d'un même pays en un seul chemin.
const parPays = new Map();
const inconnus = [];
for (const f of fc.features) {
    const code = parNumerique.get(f.id);
    const connu = code && duSalon.get(code);
    const d = chemin(f);
    if (!d) continue;
    if (!connu) { inconnus.push(f.properties.name); continue; }
    // ⚠️ Le centre vient de geo/pays.js, PAS du centroïde du tracé. Le tracé
    // d'un pays inclut ses morceaux lointains : le centroïde de la France
    // tombe dans l'Atlantique à cause de la Guyane, celui des États-Unis part
    // vers l'Alaska. geo/pays.js a déjà réglé ça une fois, en ne gardant que
    // l'ensemble le plus étendu — on reprend son résultat au lieu de
    // redécouvrir le même piège.
    const [x, y] = proj([connu.lon, connu.lat]);
    if (!isFinite(x) || !isFinite(y)) { inconnus.push(f.properties.name + ' (sans centre)'); continue; }
    const deja = parPays.get(code);
    if (deja) {
        deja.d += arrondir(d);                 // les morceaux s'ajoutent au même tracé
        deja.a += Math.round(chemin.area(f));
        continue;
    }
    parPays.set(code, {
        c: code, n: connu.nom,
        x: +x.toFixed(1), y: +y.toFixed(1),
        a: Math.round(chemin.area(f)),
        d: arrondir(d),
    });
}
const pays = [...parPays.values()].sort((a, b) => a.n.localeCompare(b.n, 'fr'));

const poids = JSON.stringify(pays).length;
console.log(`carte : ${pays.length} pays tracés · ${(poids / 1024).toFixed(0)} Ko`);
console.log(`écartés (absents de geo/pays.js) : ${inconnus.length} — ${inconnus.slice(0, 8).join(', ')}…`);
// ⚠️ Les pays trop petits pour être VUS. Ils restaient cliquables (on vise
// le centre le plus proche), mais on ne voyait pas qu'il y avait un pays :
// on cliquait dans le vide de bonne foi. Ils sont marqués `mini`, et la
// carte leur dessine une pastille.
const MINI = 25;                       // px² dans la boîte 1000 × 500
for (const p of pays) if (p.a < MINI) p.mini = 1;
const petits = pays.filter(p => p.mini).length;
console.log(`pays trop petits pour être vus (pastille) : ${petits}`);

const entete = `// =====================================================================
//  LA CARTE DU MONDE — un tracé par pays, et le centre de chacun
//
//  Généré par scripts/genere-carte.js depuis Natural Earth 1:50m. C'est le
//  SEUL fichier de données du salon envoyé au navigateur : le jeu consiste
//  à montrer la carte, elle ne peut pas rester sur le serveur. Elle ne dit
//  rien du pays du jour pour autant.
//
//  Par pays : \`c\` son code, \`n\` son nom français (celui de geo/pays.js,
//  qui fait foi), \`d\` son tracé dans une boîte de ${W} × ${H},
//  \`x\`/\`y\` le centre de ce tracé, et \`a\` sa surface à l'écran.
//
//  ⚠️ \`x\`/\`y\` ne sont pas décoratifs : sur un téléphone de 375 px, deux
//  pays sur ${pays.length} seulement sont assez gros pour être visés au doigt (la
//  France fait 9 px de côté, la Belgique 2). Le jeu cherche donc le centre
//  le plus proche du doigt au lieu de tester l'intérieur du tracé — sans
//  quoi la moitié du monde serait impossible à désigner.
//
//  ${pays.length} pays, projection Natural Earth.
// =====================================================================
window.MONDE = { w: ${W}, h: ${H}, pays: [\n`;

fs.mkdirSync(path.join(RACINE, 'public', 'carte'), { recursive: true });
fs.writeFileSync(path.join(RACINE, 'public', 'carte', 'monde.js'),
    entete + pays.map(p => JSON.stringify(p)).join(',\n') + '\n] };\n');
console.log('→ public/carte/monde.js écrit');

// ⚠️ Et la MÊME chose côté serveur, sans les tracés : c'est lui qui calcule
// les caps, et il doit le faire dans le repère de la carte que le joueur a
// sous les yeux. Un cap orthodromique (le vrai, celui d'un globe) dirait
// « NORD » pour aller de la France aux Samoa — c'est exact sur une sphère et
// incompréhensible sur une carte plate, où les Samoa sont à l'ouest. Deux
// relèvements ne se croiseraient nulle part.
const centres = {};
for (const p of pays) centres[p.c] = [p.x, p.y];
fs.writeFileSync(path.join(RACINE, 'carte', 'centres.js'),
    `// Généré par scripts/genere-carte.js — NE PAS MODIFIER À LA MAIN.
// La position de chaque pays dans la carte de public/carte/monde.js
// (boîte ${W} × ${H}, projection Natural Earth). Le serveur s'en sert pour
// calculer les caps DANS LE REPÈRE DE LA CARTE : c'est la direction que le
// joueur peut suivre du doigt, et non le cap orthodromique, qui enverrait
// vers le pôle pour rejoindre les antipodes.
module.exports = ${JSON.stringify(centres)};\n`);
console.log('→ carte/centres.js écrit');
