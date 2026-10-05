// =====================================================================
//  RÉGÉNÉRER geo/regions.js — les régions d'apprentissage
//
//  Usage :
//    mkdir /tmp/reg && cd /tmp/reg && npm i world-countries
//    node "<le salon>/scripts/genere-regions.js"
//
//  geo/pays.js ne connaît que cinq régions, dont une Afrique à
//  cinquante-quatre pays. Personne n'apprend cinquante-quatre pays d'un
//  coup : on redécoupe donc selon la norme M49 des Nations unies, qui
//  donne vingt-quatre groupes de deux à dix-sept pays — la taille d'une
//  leçon.
// =====================================================================
const fs = require('fs');
const path = require('path');
const wc = require(path.join(process.cwd(), 'node_modules', 'world-countries'));
const R = path.join(__dirname, '..');
const PAYS = require(R + '/geo/pays.js');

// Les noms français des sous-régions, écrits à la main : ce sont des
// libellés destinés à être lus, pas des codes. L'ordre est celui dans lequel
// on les propose à l'apprentissage — on commence par chez soi.
const NOMS = {
    'Western Europe': ['Europe de l’Ouest', '🇫🇷', 1],
    'Southern Europe': ['Europe du Sud', '🇮🇹', 2],
    'Northern Europe': ['Europe du Nord', '🇸🇪', 3],
    'Central Europe': ['Europe centrale', '🇵🇱', 4],
    'Southeast Europe': ['Europe du Sud-Est', '🇬🇷', 5],
    'Eastern Europe': ['Europe de l’Est', '🇺🇦', 6],
    'Northern Africa': ['Afrique du Nord', '🇲🇦', 7],
    'Western Africa': ['Afrique de l’Ouest', '🇸🇳', 8],
    'Middle Africa': ['Afrique centrale', '🇨🇲', 9],
    'Eastern Africa': ['Afrique de l’Est', '🇰🇪', 10],
    'Southern Africa': ['Afrique australe', '🇿🇦', 11],
    'Western Asia': ['Proche et Moyen-Orient', '🇹🇷', 12],
    'Central Asia': ['Asie centrale', '🇰🇿', 13],
    'Southern Asia': ['Asie du Sud', '🇮🇳', 14],
    'Eastern Asia': ['Asie de l’Est', '🇯🇵', 15],
    'South-Eastern Asia': ['Asie du Sud-Est', '🇹🇭', 16],
    'North America': ['Amérique du Nord', '🇨🇦', 17],
    'Central America': ['Amérique centrale', '🇲🇽', 18],
    'Caribbean': ['Caraïbes', '🇨🇺', 19],
    'South America': ['Amérique du Sud', '🇧🇷', 20],
    'Australia and New Zealand': ['Australie et Nouvelle-Zélande', '🇦🇺', 21],
    'Melanesia': ['Mélanésie', '🇫🇯', 22],
    'Micronesia': ['Micronésie', '🇫🇲', 23],
    'Polynesia': ['Polynésie', '🇼🇸', 24],
};

const parCode = new Map(PAYS.map(p => [p.code, p]));
const groupes = new Map();
const sans = [];
for (const c of wc) {
    const p = parCode.get(c.cca2);
    if (!p || !p.souverain) continue;
    const cle = c.subregion;
    if (!NOMS[cle]) { sans.push(p.nom + ' (' + cle + ')'); continue; }
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(p);
}
if (sans.length) console.log('⚠️ sans sous-région :', sans.join(', '));

// Dans chaque région, les pays sont rangés du plus vaste au plus petit :
// on apprend le Nigeria avant la Gambie, et c'est l'ordre dans lequel on les
// rencontre vraiment.
const sortie = [];
for (const [cle, [nom, emoji, rang]] of Object.entries(NOMS)) {
    const liste = (groupes.get(cle) || []).slice()
        .sort((a, b) => (b.aireReelle || 0) - (a.aireReelle || 0));
    if (!liste.length) { console.log('⚠️ région vide :', nom); continue; }
    sortie.push({ id: cle.toLowerCase().replace(/[^a-z]+/g, '-'), nom, emoji, rang,
                  pays: liste.map(p => p.code) });
}
sortie.sort((a, b) => a.rang - b.rang);

const total = sortie.reduce((s, r) => s + r.pays.length, 0);
console.log('régions :', sortie.length, '· pays couverts :', total, '/', PAYS.filter(p => p.souverain).length);
console.log(sortie.map(r => '  ' + String(r.pays.length).padStart(2) + ' · ' + r.nom).join('\n'));

const entete = `// =====================================================================
//  LES RÉGIONS D'APPRENTISSAGE
//
//  Généré une fois par scripts/genere-regions.js depuis \`world-countries\`
//  (le champ \`subregion\` de la norme M49 des Nations unies), croisé avec
//  geo/pays.js qui fait foi pour les noms et pour ce qui est un pays.
//
//  ⚠️ **C'est la seule donnée que l'apprentissage ajoutait.** geo/pays.js
//  ne connaît que cinq régions, dont une Afrique à cinquante-quatre pays :
//  personne n'apprend cinquante-quatre pays d'un coup. Découpées ainsi,
//  les vingt-quatre régions font de deux à dix-sept pays — la taille d'une
//  leçon.
//
//  Les noms français sont écrits à la main : ce sont des libellés qu'on lit,
//  pas des codes. L'ordre (\`rang\`) est celui dans lequel on les propose —
//  on commence par chez soi, on finit par le Pacifique.
//
//  Dans chaque région, les pays vont du plus vaste au plus petit : on
//  apprend le Nigeria avant la Gambie, et c'est l'ordre dans lequel on les
//  rencontre vraiment.
//
//  ${sortie.length} régions, ${total} pays.
// =====================================================================
module.exports = [\n`;
fs.writeFileSync(R + '/geo/regions.js',
    entete + sortie.map(r => JSON.stringify(r)).join(',\n') + '\n];\n');
console.log('→ geo/regions.js écrit');
