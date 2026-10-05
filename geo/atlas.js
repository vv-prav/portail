// =====================================================================
//  MON ATLAS — les pays qu'on a trouvés, sur la carte du monde
//
//  Les cinq jeux de géographie laissent déjà, dans le cache, la trace de
//  chaque pays trouvé : il n'y a rien à stocker de plus, seulement à
//  rapprocher ce qui existe.
//
//  Un pays est « trouvé » quand on a réussi une manche qui portait sur
//  lui, dans n'importe lequel des cinq jeux :
//    · Le pays / Le drapeau → `geo:prog:<u>:<date>:<mode>` et le pays de
//      cette journée-là, rangé dans `geo:pays:<mode>:<date>` ;
//    · Le voyage            → tous les pays réellement TRAVERSÉS, parce
//      qu'on est passé dessus pour de bon ;
//    · Les capitales        → le pays de la capitale trouvée ;
//    · La carte             → le pays qu'on a su montrer du doigt.
//
//  ⚠️ Seules les manches RÉUSSIES comptent. Un pays qu'on a proposé au
//  hasard dans une manche perdue ne s'est pas appris — et un atlas qui se
//  remplit sans rien savoir ne vaudrait rien.
// =====================================================================
const PAYS = require('./pays');

const SOUVERAINS = PAYS.filter(p => p.souverain);
const TOTAL = SOUVERAINS.length;
const estSouverain = new Set(SOUVERAINS.map(p => p.code));

/**
 * Les pays qu'un joueur a trouvés, et par quel jeu.
 * @param {object} cache   l'objet clé → valeur (mfCache)
 * @param {string} pseudo
 */
function atlas(cache, pseudo) {
    const trouves = new Map();        // code → le premier jeu qui l'a fait trouver
    const noter = (code, jeu) => {
        if (!code || !estSouverain.has(code)) return;
        if (!trouves.has(code)) trouves.set(code, jeu);
    };

    for (const [k, v] of Object.entries(cache)) {
        if (!v || typeof v !== 'object') continue;
        const seg = k.split(':');
        if (seg[1] !== 'prog' || seg[2] !== pseudo) continue;
        const date = seg[3];

        if (seg[0] === 'geo' && v.fini) {
            const mode = seg[4];
            if (mode === 'voyage') {
                // Le voyage : les pays traversés, qu'on soit arrivé ou non.
                // Y avoir mis le pied suffit — c'est le principe du jeu.
                for (const p of (v.pas || [])) noter(p.code, 'voyage');
            } else if (v.trouve) {
                noter(cache[`geo:pays:${mode}:${date}`], mode === 'drapeau' ? 'drapeau' : 'pays');
            }
            continue;
        }
        if (seg[0] === 'capitales' && v.fini && v.trouve) {
            noter(cache[`capitales:ville:${date}`], 'capitales');
            continue;
        }
        if (seg[0] === 'carte' && v.fini && v.trouve) {
            noter(cache[`carte:pays:${date}`], 'carte');
        }
    }

    return {
        total: TOTAL,
        combien: trouves.size,
        // La liste est envoyée au navigateur, qui colorie la carte qu'il a
        // déjà : code → le jeu par lequel on l'a trouvé, pour la teinte.
        pays: Object.fromEntries(trouves),
        // Les cinq manquants les plus vastes : de quoi se dire « tiens, je
        // n'ai jamais eu l'Argentine ». Une liste de cent soixante noms ne
        // servirait à personne.
        manquants: SOUVERAINS.filter(p => !trouves.has(p.code))
            .sort((a, b) => (b.aireReelle || 0) - (a.aireReelle || 0))
            .slice(0, 5).map(p => p.nom),
    };
}

module.exports = { atlas, TOTAL };
