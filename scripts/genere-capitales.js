// =====================================================================
//  RÉGÉNÉRER capitales/villes.js
//
//  Usage :  node scripts/genere-capitales.js
//  Rien à installer : tout vient de Wikidata, par son point d'accès
//  SPARQL public, en lecture seule.
//
//  Quatre requêtes séparées plutôt qu'une grosse — l'endpoint coupe au
//  bout de soixante secondes, et une requête qui tombe ne doit pas
//  emporter les trois autres :
//    1. pays → capitale (nom français)
//    2. capitale → coordonnées et population de la VILLE
//    3. pays → devise (code ISO 4217)
//    4. pays → langues officielles
//
//  ⚠️ Puis viennent les arbitrages écrits à la main, et c'est le cœur du
//  fichier : Wikidata liste tout ce qui a été capitale, siège du
//  gouvernement ou capitale constitutionnelle, sans trancher. Chaque
//  arbitrage est commenté avec sa raison. Les autres capitales d'un pays
//  restent acceptées à la saisie, donc personne n'est pénalisé pour avoir
//  tapé Sucre ou La Haye.
//
//  ⚠️ Et comme pour le quiz des drapeaux : la population est un MAUVAIS
//  juge de notoriété. Elle place Dodoma devant Bratislava et range
//  Reykjavik avec Ngerulmud. D'où la liste écrite à la main de ce qui peut
//  tomber un matin — le seul contenu du jeu qui ne soit pas dérivé des
//  données, et c'est assumé.
//
//  Vérifier le résultat À L'ŒIL après génération : une capitale fausse se
//  voit tout de suite, une population fantaisiste beaucoup moins.
// =====================================================================
const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..');
const UA = 'LeSalonErquy/1.0 (jeu du salon, usage personnel)';

async function sparql(q) {
    const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/sparql-results+json' } });
    if (!r.ok) throw new Error('SPARQL ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return (await r.json()).results.bindings;
}
const qid = (u) => String(u || '').split('/').pop();

async function tirer() {
    const out = {}, infos = {}, devises = {}, langues = {};

    // 1. pays → capitale, en écartant les capitales historiques (P582 = date de fin)
    for (const b of await sparql(`SELECT ?iso ?cap ?capLabel WHERE {
      ?pays wdt:P31 wd:Q6256; wdt:P297 ?iso; p:P36 ?st.
      ?st ps:P36 ?cap. FILTER NOT EXISTS { ?st pq:P582 ?fin }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }`)) {
        const iso = b.iso.value.toUpperCase();
        (out[iso] = out[iso] || { code: iso, capitales: [] }).capitales.push({ q: qid(b.cap.value), nom: b.capLabel.value });
    }

    // 2. capitale → coordonnées et population la plus récente
    for (const b of await sparql(`SELECT ?cap ?coord (MAX(?p) AS ?pop) WHERE {
      ?pays wdt:P31 wd:Q6256; wdt:P36 ?cap.
      ?cap wdt:P625 ?coord. OPTIONAL { ?cap wdt:P1082 ?p } } GROUP BY ?cap ?coord`)) {
        const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);
        infos[qid(b.cap.value)] = { lon: m ? +m[1] : null, lat: m ? +m[2] : null, pop: b.pop ? +b.pop.value : null };
    }

    // 3. pays → devise. ⚠️ `wdt:` et non `p:` : seules les valeurs de meilleur
    // rang, ce qui écarte les monnaies retirées — le zloty d'avant 1995 et le
    // franc malien remontaient sinon au même titre que la monnaie en cours.
    for (const b of await sparql(`SELECT ?iso ?code WHERE {
      ?pays wdt:P31 wd:Q6256; wdt:P297 ?iso; wdt:P38 ?dev. ?dev wdt:P498 ?code. }`)) {
        const iso = b.iso.value.toUpperCase();
        (devises[iso] = devises[iso] || []).push(b.code.value);
    }

    // 4. pays → langues officielles
    for (const b of await sparql(`SELECT ?iso ?langLabel WHERE {
      ?pays wdt:P31 wd:Q6256; wdt:P297 ?iso; wdt:P37 ?lang.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }`)) {
        const iso = b.iso.value.toUpperCase();
        (langues[iso] = langues[iso] || []).push(b.langLabel.value);
    }
    return { out, infos, devises, langues };
}

// ---- Les arbitrages faits à la main, et leur raison ----
// Le critère est le même partout : LA RÉPONSE QU'ON ATTEND DANS UN JEU.
const CAPITALE = {
    ID: 'Jakarta',            // Nusantara est en construction ; personne ne la devinera
    ZA: 'Pretoria',           // trois capitales : l'administrative est la réponse usuelle
    BO: 'La Paz',             // siège du gouvernement ; Sucre est constitutionnelle
    PK: 'Islamabad',          // Rawalpindi n'est pas capitale
    YE: 'Sanaa',
    MY: 'Kuala Lumpur',       // Putrajaya n'est qu'administrative
    BJ: 'Porto-Novo',         // capitale officielle ; Cotonou est le siège du gouvernement
    LK: 'Colombo',            // Sri Jayawardenapura Kotte est officielle mais intapable
    NL: 'Amsterdam',          // capitale constitutionnelle ; La Haye est le siège
    SZ: 'Mbabane',            // administrative
    NI: 'Managua',            // l'étiquette Wikidata porte « (City) »
    IL: 'Jérusalem',
};
// Les pays à plusieurs monnaies de meilleur rang : on nomme celle du quotidien.
const DEVISE = { FR: 'EUR', PL: 'PLN', CZ: 'CZK', BA: 'BAM', NL: 'EUR', ZW: 'ZWG', PA: 'PAB', LS: 'LSL', NA: 'NAD' };
// Les populations que Wikidata n'a pas.
const POP = { PW: 271, NI: 1055247 };

// Wikidata répond avec le nom exact du code ISO, qui n'est pas le mot qu'on
// emploie. Et les langues des signes, officielles dans une dizaine de pays,
// n'apprennent rien dans une colonne qui sert à rapprocher deux pays.
const RENOMMER = {
    'putonghua': 'mandarin', 'mandarin standard': 'mandarin',
    'anglais britannique': 'anglais', 'grec moderne': 'grec',
    'bokmål': 'norvégien', 'nynorsk': 'norvégien',
    'langue standard de la Corée du Nord': 'coréen',
    'quichua': 'quechua',
};
const ECARTER = (l) => /^langue des signes/.test(l) || l === 'langues en Guinée' || l === 'taglish';
// La colonne n'affiche qu'une langue, et « bambara » pour le Mali apprend
// moins que « français ». La comparaison, elle, porte sur la liste entière.
const LANGUES_CONNUES = ['français', 'anglais', 'espagnol', 'arabe', 'portugais', 'russe',
    'allemand', 'italien', 'néerlandais', 'mandarin', 'hindi', 'swahili', 'malais', 'turc'];

// Ce qui peut TOMBER un matin. Tout le reste reste PROPOSABLE à la saisie.
const NOTOIRES = new Set(['FR','DE','IT','ES','PT','GB','IE','BE','NL','LU','CH','AT',
    'DK','SE','NO','FI','IS','PL','CZ','HU','RO','GR','HR','RS','UA','RU','TR',
    'US','CA','MX','BR','AR','CL','PE','CO','VE','CU','CN','JP','KR','IN','TH','VN',
    'ID','PH','PK','IL','SA','AE','IR','IQ','AF','NP','MA','DZ','TN','EG','SN','CI',
    'ML','NG','ZA','KE','ET','CM','AU','NZ']);
// Des capitales qu'on situe sans peine alors que leur ville est petite.
const PETITES_MAIS_CONNUES = new Set(['SK','EE','SI','AL','BA','MK','ME','CY','MT',
    'MC','VA','AD','LI','SM','CR','SV','PY','BS','BW','NA','TZ','MU','FJ','BN','PA','BB']);
// ⚠️ Jamais tirée : un jeu du jour n'a pas à trancher un différend de
// souveraineté — c'est déjà la règle qui écarte le Kosovo de geo/pays.js.
const JAMAIS = new Set(['IL']);

(async () => {
    const d = await tirer();
    const pays = require(path.join(RACINE, 'geo', 'pays.js'));
    const v = [];
    for (const p of pays) {
        if (!p.souverain) continue;              // les territoires n'ont pas de capitale propre ici
        const e = d.out[p.code];
        if (!e) { console.log('⚠️ sans capitale :', p.nom); continue; }
        const candidates = e.capitales.map(c => ({ nom: c.nom.replace(/\s*\(.*\)$/, ''), ...(d.infos[c.q] || {}) }));
        const voulue = CAPITALE[p.code];
        const choisie = (voulue && candidates.find(c => c.nom === voulue))
            || candidates.slice().sort((a, b) => (b.pop || 0) - (a.pop || 0))[0];
        if (voulue && !candidates.some(c => c.nom === voulue)) console.log('⚠️ arbitrage introuvable :', p.nom, voulue);
        const alias = [...new Set(candidates.map(c => c.nom))].filter(n => n !== choisie.nom);

        const dv = (d.devises[p.code] || []).filter(x => /^[A-Z]{3}$/.test(x));
        const vues = new Set();
        const langues = [...new Set(d.langues[p.code] || [])]
            .map(l => RENOMMER[l] || l).filter(l => !ECARTER(l) && !vues.has(l) && vues.add(l))
            .sort((a, b) => {
                // Les familles (« langues sames », « langues bobo ») passent en
                // dernier : ce ne sont jamais la langue qu'on citerait.
                const rang = (x) => {
                    const i = LANGUES_CONNUES.indexOf(x.toLowerCase());
                    return i >= 0 ? i : (/^langues /.test(x) ? 999 : 99);
                };
                return rang(a) - rang(b) || a.localeCompare(b, 'fr');
            });
        if (!langues.length && p.code === 'UY') langues.push('espagnol');   // la constitution n'en nomme aucune

        // ⚠️ La population retenue d'abord, la notoriété ensuite : Managua n'a
        // pas de population chez Wikidata, et sans cet ordre elle sortait du
        // tirage pour une raison qui n'a rien à voir avec sa notoriété.
        const pop = POP[p.code] || choisie.pop || null;
        const connue = NOTOIRES.has(p.code) || PETITES_MAIS_CONNUES.has(p.code) || (pop || 0) >= 500000;
        v.push({
            code: p.code, pays: p.nom, ville: choisie.nom,
            lat: +(choisie.lat || 0).toFixed(4), lon: +(choisie.lon || 0).toFixed(4),
            pop,
            devise: DEVISE[p.code] || dv[0] || null,
            langues,
            alias: alias.length ? alias : undefined,
            horsTirage: (!connue || JAMAIS.has(p.code)) || undefined,
        });
    }
    const tirables = v.filter(c => !c.horsTirage);
    console.log('capitales :', v.length, '· tirables :', tirables.length);
    for (const c of v) {
        if (!c.pop) console.log('⚠️ sans population :', c.ville);
        if (!c.devise) console.log('⚠️ sans devise :', c.pays);
        if (!c.langues.length) console.log('⚠️ sans langue :', c.pays);
    }

    const entete = `// =====================================================================
//  LES CAPITALES — ce qu'il faut pour les deviner
//
//  Généré UNE FOIS par scripts/genere-capitales.js, depuis Wikidata. Le
//  fichier est autonome : aucune dépendance à l'exécution, et il ne quitte
//  jamais le serveur — le navigateur ne reçoit que les indices de ses
//  propres propositions.
//
//  Par entrée : le pays, sa capitale, les coordonnées de la VILLE (c'est la
//  distance entre deux capitales qu'on compare, pas entre deux pays), la
//  population de la ville, la devise du pays et ses langues officielles.
//
//  \`alias\` garde les autres capitales d'un pays qui en a plusieurs : on
//  tape Sucre, La Haye ou Cotonou et ça marche, même si la réponse attendue
//  est La Paz, Amsterdam ou Porto-Novo.
//
//  ⚠️ \`horsTirage\` ne retire RIEN de la saisie : ces capitales restent
//  proposables, elles ne tombent simplement pas un matin. Deux motifs : trop
//  confidentielles pour faire une manche honnête (Ngerulmud, Yaren), ou
//  porteuses d'un différend de souveraineté — Jérusalem, par la même règle
//  qui écarte le Kosovo et le Somaliland de geo/pays.js.
//
//  ${v.length} capitales, dont ${tirables.length} tirables.
// =====================================================================
module.exports = [\n`;
    fs.writeFileSync(path.join(RACINE, 'capitales', 'villes.js'),
        entete + v.map(c => JSON.stringify(c)).join(',\n') + '\n];\n');
    console.log('→ capitales/villes.js écrit');
})().catch(e => { console.error(e); process.exit(1); });
