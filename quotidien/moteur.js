// =====================================================================
//  MOTEUR DES JEUX DU JOUR
//
//  Motus, Mots Fléchés et Le Mot Juste sont trois implémentations du même
//  modèle : un contenu tiré de la date, une progression par joueur, un
//  classement du jour, une série, des archives. Trente routes pour trois
//  fois la même chose — c'est le chantier n° 2 du CLAUDE.md.
//
//  Ce module ne touche pas à ces trois-là : les réécrire pendant qu'ils
//  portent 90 % de l'activité du salon serait un risque pris pour rien.
//  Il sert les jeux du jour **nouveaux**, pour qu'ils ne recopient pas une
//  quatrième fois le même code — et il montre au passage à quoi
//  ressemblerait le moteur commun, le jour où on migrera les anciens.
//
//  Convention de clés, la même que partout ailleurs dans le salon :
//      <app>:prog:<pseudo>:<date>     la partie d'un joueur, un jour donné
//      <app>:board:<date>             le classement de la journée
//      <app>:days:<pseudo>            les jours joués, pour la série
// =====================================================================

module.exports = function creerMoteur(app, deps) {
    const { get, set, today, shift } = deps;

    const kProg = (pseudo, date) => `${app}:prog:${pseudo}:${date}`;
    const kBoard = (date) => `${app}:board:${date}`;
    const kDays = (pseudo) => `${app}:days:${pseudo}`;

    // ---------- Le tirage du jour ----------
    // Même principe que Motus : une graine calculée sur la date, donc tout le
    // monde a le même contenu et le passé ne bouge jamais. `variante` permet à
    // l'admin de retirer un contenu raté sans changer les jours d'avant — le
    // Motus a dû l'ajouter après coup, autant l'avoir dès le départ ici.
    function graineDe(texte) {
        let h = 2166136261;
        for (let i = 0; i < texte.length; i++) {
            h ^= texte.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    // Générateur mulberry32 : court, sans dépendance, et suffisamment uniforme
    // pour un tirage quotidien.
    function hasard(graine) {
        let a = graine >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const kVariante = (date) => `${app}:variante:${date}`;
    function tirageDuJour(date, extra) {
        const n = Number(get(kVariante(date))) || 0;
        return hasard(graineDe(`${app}|${extra || ''}|${date}${n ? '|' + n : ''}`));
    }
    function varianteSuivante(date) {
        const n = (Number(get(kVariante(date))) || 0) + 1;
        set(kVariante(date), n);
        return n;
    }

    // ---------- La partie d'un joueur ----------
    function progression(pseudo, date) {
        return get(kProg(pseudo, date)) || null;
    }
    // Le chronomètre part quand le joueur découvre la grille, pas à son premier
    // coup — c'est la leçon tirée du Motus, où le classement se jouait sinon à
    // qui ouvrait la page le plus tôt.
    function demarrer(pseudo, date) {
        const cle = kProg(pseudo, date);
        const p = get(cle) || { debutA: 0, essais: [], fini: false };
        if (!p.debutA) { p.debutA = Date.now(); set(cle, p); }
        return p;
    }
    function enregistrer(pseudo, date, prog) {
        set(kProg(pseudo, date), prog);
        return prog;
    }
    // Le temps écoulé, borné : un joueur qui laisse l'onglet ouvert une nuit ne
    // doit pas produire une valeur absurde dans le classement.
    const MAX_MS = 3 * 3600 * 1000;
    function tempsEcoule(prog) {
        if (!prog || !prog.debutA) return null;
        return Math.min(MAX_MS, Math.max(0, Date.now() - prog.debutA));
    }

    // ---------- Le classement du jour ----------
    // Trié par score décroissant puis par temps croissant : à performance égale,
    // c'est la rapidité qui départage. Les parties d'avant le chronométrage
    // n'ont pas de `ms` et se rangent après celles qui en ont, jamais perdues.
    function classement(date) {
        return (get(kBoard(date)) || [])
            .filter(e => !e.susp)
            .slice()
            .sort((a, b) => (b.score - a.score)
                || ((a.ms == null ? Infinity : a.ms) - (b.ms == null ? Infinity : b.ms))
                || (a.ts - b.ts));
    }
    function inscrireAuClassement(pseudo, date, score, ms, extra) {
        const cle = kBoard(date);
        const liste = (get(cle) || []).slice();
        if (liste.some(e => e.u === pseudo)) return classement(date);
        liste.push(Object.assign({ u: pseudo, score, ms: ms == null ? null : Math.round(ms), ts: Date.now() }, extra || {}));
        set(cle, liste);
        return classement(date);
    }
    function placeDe(pseudo, date) {
        const i = classement(date).findIndex(e => e.u === pseudo);
        return i < 0 ? null : i + 1;
    }

    // ---------- La série ----------
    function noterJourJoue(pseudo, date) {
        const jours = (get(kDays(pseudo)) || []).slice();
        if (!jours.includes(date)) { jours.push(date); set(kDays(pseudo), jours.slice(-400)); }
    }
    function serie(pseudo) {
        const jours = new Set(get(kDays(pseudo)) || []);
        let n = 0, d = today();
        if (!jours.has(d)) d = shift(d, -1);   // la journée en cours ne casse pas la série tant qu'elle dure
        while (jours.has(d)) { n++; d = shift(d, -1); }
        return { encours: n, total: jours.size };
    }

    // ---------- Les archives ----------
    // Les jours déjà joués, du plus récent au plus ancien, pour rejouer une
    // vieille grille sans qu'elle compte au classement.
    function archives(pseudo, combien) {
        const jours = (get(kDays(pseudo)) || []).slice().sort().reverse();
        return jours.slice(0, combien || 30);
    }

    return {
        app, kProg, kBoard, kDays, kVariante,
        tirageDuJour, varianteSuivante, graineDe, hasard,
        progression, demarrer, enregistrer, tempsEcoule,
        classement, inscrireAuClassement, placeDe,
        noterJourJoue, serie, archives,
    };
};
