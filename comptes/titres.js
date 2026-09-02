// =====================================================================
//  LES TITRES DU SALON
//
//  Un titre se gagne en jouant, et se perd parfois. Trois raretés :
//
//   • commun  — à la portée de tout le monde, c'est une étape ;
//   • rare    — il faut vraiment le chercher ;
//   • unique  — UN SEUL détenteur à la fois. Celui qui a la meilleure
//               moyenne, le meilleur temps, le plus de victoires. Il
//               change de mains dès que quelqu'un fait mieux, ce qui est
//               tout l'intérêt : un titre unique se dispute.
//
//  Comme le classement, ce module ne stocke RIEN : tout est recalculé
//  depuis les clés déjà en base. Changer une condition ne demande donc
//  aucune migration — et un titre mal réglé se corrige en une ligne.
//
//  Seuls les titres ATTRIBUÉS À LA MAIN depuis l'administration sont
//  persistés, dans la clé `titres:manuels`.
// =====================================================================

function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

// ---------------------------------------------------------------------
//  LE CATALOGUE
//  Isolé en haut du fichier, comme le barème du classement : c'est un
//  choix de jeu, pas une contrainte technique.
// ---------------------------------------------------------------------
const TITRES = [
    // ---- Communs ----
    { id: 'nouveau', nom: 'Nouveau venu', emoji: '🌱', rarete: 'commun',
      desc: 'A joué au moins une fois à un jeu du jour.',
      obtenu: (s) => s.joursTotal >= 1 },
    { id: 'habitue', nom: 'Habitué', emoji: '🔁', rarete: 'commun',
      desc: 'Dix jours de jeu au compteur.',
      obtenu: (s) => s.joursTotal >= 10 },
    { id: 'curieux', nom: 'Curieux', emoji: '🧭', rarete: 'commun',
      desc: 'A essayé les trois jeux du jour.',
      obtenu: (s) => s.motusJours > 0 && s.mfJours > 0 && s.mjJours > 0 },
    { id: 'causant', nom: 'Causant', emoji: '💬', rarete: 'commun',
      desc: 'Dix messages dans les discussions du jour.',
      obtenu: (s) => s.messages >= 10 },

    // ---- Rares ----
    // Seuils calibrés sur les données réelles du salon plutôt qu'au jugé :
    // 7 jours de série, c'était 8 joueurs sur 32 — pas rare. 12 en fait 3.
    { id: 'metronome', nom: 'Métronome', emoji: '🔥', rarete: 'rare',
      desc: 'Douze jours de suite sans en manquer un.',
      obtenu: (s) => s.meilleureSerie >= 12 },
    { id: 'increvable', nom: 'Increvable', emoji: '🗿', rarete: 'rare',
      desc: 'Vingt-cinq jours de suite. Vingt-cinq.',
      obtenu: (s) => s.meilleureSerie >= 25 },
    { id: 'sansfaute', nom: 'Sans faute', emoji: '🎯', rarete: 'rare',
      desc: 'Dix manches de Motus, aucune perdue.',
      obtenu: (s) => s.motusManches >= 10 && s.motusEchecs === 0 },
    // « En deux essais » n'avait rien de rare : la première lettre étant
    // offerte, 12 joueurs sur 32 l'avaient déjà fait. Du PREMIER coup, en
    // revanche, reste un vrai exploit.
    { id: 'eclair', nom: "Coup d'éclat", emoji: '⚡', rarete: 'rare',
      desc: 'A trouvé le mot de Motus du premier coup.',
      obtenu: (s) => s.motusMeilleurEssais !== null && s.motusMeilleurEssais <= 1 },
    { id: 'devin', nom: 'Devin', emoji: '🔮', rarete: 'rare',
      desc: 'A deviné Le Mot Juste en moins de huit mots.',
      obtenu: (s) => s.mjMeilleurEssais !== null && s.mjMeilleurEssais < 8 },
    { id: 'veteran', nom: 'Vétéran', emoji: '🎖️', rarete: 'rare',
      desc: 'Dix parties en multijoueur.',
      obtenu: (s) => s.multiParties >= 10 },
    { id: 'touchatout', nom: 'Touche-à-tout', emoji: '🏰', rarete: 'rare',
      desc: 'A joué à cinq jeux différents du salon.',
      obtenu: (s) => s.jeuxDifferents >= 5 },
    { id: 'centurion', nom: 'Centurion', emoji: '💯', rarete: 'rare',
      desc: 'Cent points au classement du Salon.',
      obtenu: (s) => s.points >= 100 },

    // ---- Uniques : un seul détenteur, il change de mains ----
    { id: 'maitre', nom: 'Maître du Salon', emoji: '👑', rarete: 'unique',
      desc: 'Premier au classement du Salon.',
      mesure: (s) => (s.points > 0 ? s.points : null), ordre: 'max' },
    { id: 'plume', nom: 'La plume la plus rapide', emoji: '🖋️', rarete: 'unique',
      desc: 'Meilleur temps sur une grille de mots fléchés.',
      mesure: (s) => s.mfMeilleurTemps, ordre: 'min' },
    { id: 'lynx', nom: 'Œil de lynx', emoji: '🦉', rarete: 'unique',
      desc: 'Meilleure moyenne d’essais à Motus, sur au moins cinq manches.',
      mesure: (s) => (s.motusManches >= 5 ? s.motusMoyenneEssais : null), ordre: 'min' },
    { id: 'roidedes', nom: 'Roi des dés', emoji: '🎲', rarete: 'unique',
      desc: 'Le plus de victoires au Yams.',
      mesure: (s) => (s.yamsVictoires > 0 ? s.yamsVictoires : null), ordre: 'max' },
    { id: 'plumebac', nom: 'Plume du Petit Bac', emoji: '✏️', rarete: 'unique',
      desc: 'Meilleure manche jamais jouée au Petit Bac.',
      mesure: (s) => (s.pbacMeilleureManche > 0 ? s.pbacMeilleureManche : null), ordre: 'max' },
    { id: 'assidu', nom: 'L’assidu', emoji: '🌟', rarete: 'unique',
      desc: 'La plus longue série en cours du salon.',
      mesure: (s) => (s.serie > 1 ? s.serie : null), ordre: 'max' },
];

const PAR_ID = new Map(TITRES.map(t => [t.id, t]));

// ---------------------------------------------------------------------
//  Les statistiques dont les conditions ont besoin, en une seule passe
//  sur le cache — le parcourir une fois par titre serait ruineux.
// ---------------------------------------------------------------------
function statsParJoueur(cache, pseudos, series, points) {
    const parNorm = new Map(pseudos.map(p => [norm(p), p]));
    const st = new Map();
    for (const p of pseudos) {
        st.set(p, {
            joursTotal: 0, motusJours: 0, mfJours: 0, mjJours: 0,
            motusManches: 0, motusEchecs: 0, motusTotalEssais: 0, motusTrouves: 0,
            motusMeilleurEssais: null, motusMoyenneEssais: null,
            mjMeilleurEssais: null, mfMeilleurTemps: null,
            yamsParties: 0, yamsVictoires: 0, pbacParties: 0, pbacMeilleureManche: 0,
            mpCourses: 0, perudoParties: 0, multiParties: 0,
            messages: 0, jeuxDifferents: 0,
            serie: (series && series[p]) || 0, meilleureSerie: 0,
            points: (points && points[p]) || 0,
        });
    }

    for (const [cle, val] of Object.entries(cache)) {
        if (val == null) continue;
        const seg = cle.split(':');
        const famille = seg.slice(0, 2).join(':');

        // Jours joués, conservés à vie
        if (seg[1] === 'days' && Array.isArray(val)) {
            const s = st.get(seg[2]); if (!s) continue;
            const n = val.length;
            if (seg[0] === 'motus') s.motusJours = n;
            else if (seg[0] === 'mf') s.mfJours = n;
            else if (seg[0] === 'mj') s.mjJours = n;
            continue;
        }
        if (famille === 'motus:beststreak' && typeof val === 'number') {
            const s = st.get(seg[2]); if (s) s.meilleureSerie = Math.max(s.meilleureSerie, val);
            continue;
        }

        // Progressions détaillées (purgées après 15 à 20 jours : ces titres
        // portent donc sur la période récente, ce que leur libellé assume)
        if (seg[1] === 'prog' && typeof val === 'object') {
            const s = st.get(seg[2]); if (!s) continue;
            const essais = (val.guesses || []).length;
            if (seg[0] === 'motus') {
                s.motusManches++;
                if (val.solved) {
                    s.motusTrouves++; s.motusTotalEssais += essais;
                    if (s.motusMeilleurEssais === null || essais < s.motusMeilleurEssais) s.motusMeilleurEssais = essais;
                } else s.motusEchecs++;
            } else if (seg[0] === 'mj' && val.solved) {
                if (s.mjMeilleurEssais === null || essais < s.mjMeilleurEssais) s.mjMeilleurEssais = essais;
            } else if (seg[0] === 'mf' && val.solved && val.seconds) {
                if (s.mfMeilleurTemps === null || val.seconds < s.mfMeilleurTemps) s.mfMeilleurTemps = val.seconds;
            }
            continue;
        }

        // Discussions : le champ `u` porte l'auteur
        if (seg[1] === 'cmt' && Array.isArray(val)) {
            for (const m of val) { const s = st.get(m && m.u); if (s) s.messages++; }
            continue;
        }

        // Stats multijoueur (Yams et Petit Bac indexent par pseudo normalisé)
        if (famille === 'yams:stats' && typeof val === 'object') {
            const s = st.get(parNorm.get(seg[2])); if (!s) continue;
            s.yamsParties = val.gamesPlayed || 0; s.yamsVictoires = val.gamesWon || 0;
            continue;
        }
        if (famille === 'pbac:stats' && typeof val === 'object') {
            const s = st.get(parNorm.get(seg[2])); if (!s) continue;
            s.pbacParties = val.gamesPlayed || 0; s.pbacMeilleureManche = val.bestRoundScore || 0;
            continue;
        }
        if (famille === 'motusparty:stats' && typeof val === 'object') {
            const s = st.get(seg[2]); if (s) s.mpCourses = val.matchesPlayed || 0;
        }
    }

    for (const s of st.values()) {
        s.joursTotal = s.motusJours + s.mfJours + s.mjJours;
        s.motusMoyenneEssais = s.motusTrouves ? Math.round((s.motusTotalEssais / s.motusTrouves) * 100) / 100 : null;
        s.multiParties = s.yamsParties + s.pbacParties + s.mpCourses + s.perudoParties;
        s.jeuxDifferents = [s.motusJours, s.mfJours, s.mjJours, s.yamsParties, s.pbacParties, s.mpCourses, s.perudoParties]
            .filter(n => n > 0).length;
        s.meilleureSerie = Math.max(s.meilleureSerie, s.serie);
    }
    return st;
}

/**
 * Attribue les titres à tout le monde en une passe.
 *
 * @param {object} cache   mfCache
 * @param {string[]} pseudos
 * @param {object} series  { pseudo: série en cours }
 * @param {object} points  { pseudo: points au classement }
 * @param {object} perudo  { pseudo: { played } } — clé séparée, hors cache
 * @param {object} manuels { pseudo: [idTitre] } — attributions de l'administration
 * @returns {Map} pseudo → [{ id, nom, emoji, rarete, desc, manuel? }]
 */
function attribuerTitres(cache, pseudos, series, points, perudo, manuels) {
    const st = statsParJoueur(cache, pseudos, series, points);
    if (perudo) {
        for (const [pseudo, u] of Object.entries(perudo)) {
            const s = st.get(pseudo);
            if (s && u) {
                s.perudoParties = u.played || 0;
                s.multiParties += s.perudoParties;
                if (s.perudoParties > 0) s.jeuxDifferents++;
            }
        }
    }

    const parJoueur = new Map(pseudos.map(p => [p, []]));

    for (const t of TITRES) {
        if (t.rarete === 'unique') {
            // Un seul détenteur : le meilleur. En cas d'égalité parfaite, le
            // premier par ordre alphabétique, pour que le résultat soit stable
            // d'un calcul à l'autre plutôt que dépendant de l'ordre des clés.
            let champion = null, meilleure = null;
            for (const p of [...pseudos].sort((a, b) => a.localeCompare(b, 'fr'))) {
                const v = t.mesure(st.get(p));
                if (v === null || v === undefined || Number.isNaN(v)) continue;
                if (meilleure === null || (t.ordre === 'min' ? v < meilleure : v > meilleure)) {
                    meilleure = v; champion = p;
                }
            }
            if (champion) parJoueur.get(champion).push({ ...vue(t), valeur: meilleure });
        } else {
            for (const p of pseudos) if (t.obtenu(st.get(p))) parJoueur.get(p).push(vue(t));
        }
    }

    // Titres posés à la main depuis l'administration
    for (const [pseudo, ids] of Object.entries(manuels || {})) {
        const liste = parJoueur.get(pseudo);
        if (!liste) continue;
        for (const id of (ids || [])) {
            const t = PAR_ID.get(id);
            if (t && !liste.some(x => x.id === id)) liste.push({ ...vue(t), manuel: true });
        }
    }

    // Les plus rares d'abord : c'est ce qu'on veut voir en premier sur un profil.
    const rang = { unique: 0, rare: 1, commun: 2 };
    for (const liste of parJoueur.values()) liste.sort((a, b) => rang[a.rarete] - rang[b.rarete]);
    return parJoueur;
}

function vue(t) {
    return { id: t.id, nom: t.nom, emoji: t.emoji, rarete: t.rarete, desc: t.desc };
}

module.exports = { TITRES, attribuerTitres, statsParJoueur };
