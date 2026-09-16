// =====================================================================
//  PERUDO — côté joueur
//
//  Réécriture complète au standard du salon. L'ancienne interface tenait
//  en 4 600 lignes et portait le hall, les tournois, la campagne, la
//  taverne, les cosmétiques et la voix. Tout cela est archivé ; il reste
//  le jeu, et un seul panneau de réglages pour le lancer.
//
//  ⚠️ LES RÈGLES NE SONT PAS ÉCRITES ICI. Celles de la maison sont
//  particulières (les Pacos coûtent la moitié pour y aller, le double pour
//  en revenir, l'anti-boucle, le palifico qui verrouille la face) et
//  personne ne les connaît par cœur. Le serveur envoie donc `minParFace` :
//  la plus petite quantité annonçable sur chaque face. Le client n'a
//  qu'à offrir ce qui est permis — deux implémentations des mêmes règles
//  finiraient forcément par diverger.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let socket = null, etat = null, moi = null;
let face = 2, qty = 1;                    // l'enchère en cours de composition

function vue(id) {
    ['v-lobby', 'v-waiting', 'v-game', 'v-fin'].forEach(v => { $(v).hidden = v !== id; });
    if (window.Vues) Vues.suivre(id);
    window.scrollTo(0, 0);
}

// ---------- Un dé, au skin du joueur ----------
// `Des` est le composant partagé : même catalogue et même rendu qu'au Yams,
// et le skin choisi vaut pour les deux jeux.
function de(n, classe) {
    return window.Des ? Des.face(n, { classe }) : `<span class="${classe || ''}">${n}</span>`;
}
const nomFace = (f) => (f === 1 ? 'Paco' : String(f));

// Changer de dé depuis le coin de style ne doit pas demander de recharger :
// la main et les mains révélées se redessinent avec l'état courant.
if (window.Style) Style.surChangement((id) => {
    if (id === 'des' && etat) rendreJeu(etat);
});

// =====================================================================
//  LE HALL
// =====================================================================
const reglages = {
    startDice: 5, mode: 'chacun', palifico: true, calza: true,
    minuteur: false, bots: 0, niveauBots: 'normal', maxPlayers: 12,
};

function brancherSegment(id, champ, transforme) {
    $(id).addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        reglages[champ] = transforme ? transforme(b.dataset.v) : b.dataset.v;
        if (champ === 'bots') $('set-niveau').hidden = reglages.bots === 0;
    });
}
brancherSegment('set-des', 'startDice', Number);
brancherSegment('set-mode', 'mode');
brancherSegment('set-bots', 'bots', Number);
brancherSegment('set-niveau', 'niveauBots');
brancherSegment('set-max', 'maxPlayers', Number);

// Les trois règles sont des bascules : un bouton qui s'allume dit mieux
// « c'est activé » qu'une case à cocher perdue dans une ligne de texte.
[['set-palifico', 'palifico'], ['set-calza', 'calza'], ['set-minuteur', 'minuteur']].forEach(([id, champ]) => {
    $(id).addEventListener('click', () => {
        reglages[champ] = !reglages[champ];
        $(id).classList.toggle('on', reglages[champ]);
    });
});

$('btn-create').addEventListener('click', () => socket.emit('perudo_create', reglages));

function ligneTable(t) {
    const nb = t.players.length + (t.bots || 0);
    const quoi = t.status === 'lobby' ? 'Rejoindre ›' : '👁 Regarder';
    const detail = [
        `${nb}/${t.options.maxPlayers}`,
        `${t.options.startDice} dés`,
        t.options.mode === 'equipes' ? 'en équipes' : null,
        t.bots ? `${t.bots} bot${t.bots > 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' · ');
    return `<button type="button" class="pe-table" data-id="${esc(t.id)}">
        <span class="pe-table-corps">
            <b>Chez ${esc(t.host)}</b>
            <em>${esc(t.players.join(', ') || 'personne encore')} · ${esc(detail)}</em>
        </span>
        <span class="pe-table-go">${quoi}</span>
    </button>`;
}
function rendreHall(liste) {
    const ouvertes = liste.filter(t => t.status !== 'ended');
    $('pe-tables').innerHTML = ouvertes.map(ligneTable).join('');
    $('lobby-vide').hidden = ouvertes.length > 0;
    $('pe-sub').textContent = ouvertes.length
        ? `${ouvertes.length} table${ouvertes.length > 1 ? 's' : ''} ouverte${ouvertes.length > 1 ? 's' : ''}`
        : 'Salon des parties';
    $('pe-tables').querySelectorAll('[data-id]').forEach(b =>
        b.addEventListener('click', () => socket.emit('perudo_join', { id: b.dataset.id })));
}

// =====================================================================
//  LA SALLE D'ATTENTE
// =====================================================================
function rendreAttente(s) {
    const o = s.options;
    $('wait-reglages').textContent = [
        `${o.startDice} dés`,
        o.mode === 'equipes' ? 'équipes de 2' : 'chacun pour soi',
        o.palifico ? 'palifico' : 'sans palifico',
        o.calza ? 'calza' : 'sans calza',
        o.bots ? `${o.bots} bot${o.bots > 1 ? 's' : ''} (${o.niveauBots})` : null,
        o.minuteur ? 'minuteur' : null,
    ].filter(Boolean).join(' · ');

    const humains = s.players.filter(p => !p.isBot);
    $('wait-players').innerHTML = humains.map(p => `
        <span class="ds-waiting-chip${p.connected ? '' : ' off'}">
            <span class="ds-avatar xs" data-p="${esc(p.pseudo)}"></span>${esc(p.pseudo)}${p.pseudo === s.host ? ' 👑' : ''}
        </span>`).join('');
    bullesDe($('wait-players'), humains.map(p => p.pseudo));

    const jeSuisHote = moi === s.host;
    $('btn-start').hidden = !jeSuisHote;
    $('wait-hint').hidden = jeSuisHote;
    if (jeSuisHote) {
        const total = humains.length + (s.options.bots || 0);
        $('btn-start').textContent = total < 2
            ? 'Ajoute un adversaire pour lancer'
            : `Lancer la partie (${total})`;
        $('btn-start').disabled = total < 2;
    }
    if (window.Invitation) Invitation.definirTable(s.id);
}
function bullesDe(box, pseudos) {
    if (!window.PortailProfile || !pseudos.length) return;
    PortailProfile.fetchAvatars(pseudos).then(a => {
        box.querySelectorAll('.ds-avatar[data-p]').forEach(el => {
            el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]);
        });
    });
}

// =====================================================================
//  LA TABLE
// =====================================================================
function rendreJeu(s) {
    $('pe-manche').textContent = 'Manche ' + (s.manche || 1);
    $('pe-palifico').hidden = !s.isPalifico;
    if (s.isPalifico && s.palificoFace) {
        $('pe-palifico').textContent = 'PALIFICO · ' + nomFace(s.palificoFace);
    } else $('pe-palifico').textContent = 'PALIFICO';

    // Les joueurs, avec leurs dés restants. On montre le nombre, jamais les
    // faces : c'est tout le jeu.
    $('pe-joueurs').innerHTML = s.players.map(p => {
        const aLaMain = p.pseudo === s.turnPseudo;
        const mort = p.dice <= 0;
        const equipe = p.team != null ? `<i class="pe-equipe e${p.team % 6}">${p.team + 1}</i>` : '';
        return `<div class="pe-joueur${aLaMain ? ' actif' : ''}${mort ? ' mort' : ''}${p.connected ? '' : ' parti'}">
            <span class="pe-joueur-nom">${equipe}${esc(p.pseudo)}${p.isBot ? ' 🤖' : ''}</span>
            <span class="pe-joueur-des">${mort ? '—' : '🎲'.repeat(Math.min(p.dice, 6))}</span>
        </div>`;
    }).join('');

    // La mise en cours
    if (s.currentBid && s.currentBid.qty > 0) {
        $('pe-mise-label').textContent = `${s.currentBid.pseudo} annonce`;
        $('pe-mise-val').innerHTML = `<b>${s.currentBid.qty}</b> × ${de(s.currentBid.face, 'pe-de-mise')}`;
    } else {
        $('pe-mise-label').textContent = 'Personne n’a encore misé';
        $('pe-mise-val').innerHTML = '';
    }

    const aMoi = s.turnPseudo === moi;
    $('pe-tour').textContent = s.jeSuisSpectateur ? ''
        : (aMoi ? 'À toi de jouer' : `Au tour de ${s.turnPseudo || '…'}`);
    $('pe-spectateur').hidden = !s.jeSuisSpectateur;

    $('pe-main').innerHTML = (s.maMain || []).map(d => de(d, 'pe-de')).join('')
        || '<span class="pe-plus-de-des">Tu n’as plus de dés</span>';

    $('pe-journal').innerHTML = (s.journal || []).map(l => `<p>${esc(l)}</p>`).join('');

    // Les commandes : seulement pour qui a la main.
    $('pe-actions').hidden = !aMoi || s.jeSuisSpectateur;
    if (aMoi) rendreCommandes(s);

    // Le minuteur, s'il tourne.
    majChrono(s);
}

// Le choix de la face n'offre que ce qui est jouable : en palifico, cinq
// faces sur six sont interdites, et un bouton qu'on ne peut pas presser
// n'apprend rien à personne.
function rendreCommandes(s) {
    const min = s.minParFace || [];
    const possibles = [];
    for (let f = 1; f <= 6; f++) if (min[f]) possibles.push(f);
    if (!possibles.includes(face)) face = possibles[0] || 2;
    if (!qty || qty < (min[face] || 1)) qty = min[face] || 1;

    $('pe-choix-face').innerHTML = possibles.map(f =>
        `<button type="button" class="pe-face${f === face ? ' on' : ''}" data-f="${f}">
            ${de(f, 'pe-de-choix')}<span>${nomFace(f)}</span>
        </button>`).join('');
    $('pe-choix-face').querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
        face = Number(b.dataset.f);
        qty = min[face] || 1;
        rendreCommandes(etat);
    }));
    $('qty-val').textContent = qty;
    $('qty-moins').disabled = qty <= (min[face] || 1);
    $('btn-miser').textContent = `Annoncer ${qty} × ${nomFace(face)}`;

    // On ne peut contester que s'il y a une mise à contester.
    const yAMise = s.currentBid && s.currentBid.qty > 0;
    $('btn-dudo').hidden = !yAMise;
    $('btn-calza').hidden = !yAMise || !s.options.calza;
}

let chronoTimer = null;
function majChrono(s) {
    clearInterval(chronoTimer);
    if (!s.minuteurFin) { $('pe-chrono').hidden = true; return; }
    const tick = () => {
        const reste = Math.max(0, Math.round((s.minuteurFin - Date.now()) / 1000));
        $('pe-chrono').textContent = reste + ' s';
        $('pe-chrono').classList.toggle('urgent', reste <= 10);
        $('pe-chrono').hidden = false;
        if (reste <= 0) clearInterval(chronoTimer);
    };
    tick();
    chronoTimer = setInterval(tick, 500);
}

$('qty-moins').addEventListener('click', () => {
    const min = (etat && etat.minParFace && etat.minParFace[face]) || 1;
    if (qty > min) { qty--; rendreCommandes(etat); }
});
$('qty-plus').addEventListener('click', () => { qty++; rendreCommandes(etat); });
$('btn-miser').addEventListener('click', () => socket.emit('perudo_bid', { qty, face }));
$('btn-dudo').addEventListener('click', () => socket.emit('perudo_dudo'));
$('btn-calza').addEventListener('click', () => socket.emit('perudo_calza'));

// ---------- Les mains révélées ----------
function montrerRevele(s) {
    const r = s.mainsRevelees;
    if (!r) { $('ov-revele').hidden = true; return; }
    const parId = {};
    s.players.forEach(p => { parId[p.pseudo] = p; });
    $('revele-resume').textContent =
        `Annonce : ${r.qty} × ${nomFace(r.face)} — il y en avait ${r.total}.`;
    // Les mains arrivent indexées par identifiant de socket : on les
    // rapproche des joueurs dans l'ordre de la table.
    const ids = Object.keys(r.hands);
    $('revele-mains').innerHTML = s.players.map((p, i) => {
        const main = r.hands[ids[i]] || [];
        if (!main.length) return '';
        return `<div class="pe-revele-l"><span>${esc(p.pseudo)}</span>
            <span class="pe-revele-des">${main.map(d => de(d, 'pe-de-mini')).join('')}</span></div>`;
    }).join('');
    $('ov-revele').hidden = false;
}

// =====================================================================
//  LA FIN
// =====================================================================
function rendreFin(s) {
    const f = s.fin || {};
    const gagnants = f.gagnants || [];
    const jAiGagne = gagnants.includes(moi);
    $('fin-emoji').textContent = jAiGagne ? '🏆' : '🏴';
    $('fin-titre').textContent = gagnants.length
        ? (f.equipe ? `L’équipe de ${gagnants.join(' et ')} l’emporte` : `${gagnants.join(' et ')} l’emporte`)
        : 'Partie terminée';
    $('fin-detail').textContent = `${f.manches || 0} manche${(f.manches || 0) > 1 ? 's' : ''} jouée${(f.manches || 0) > 1 ? 's' : ''}.`;
    $('fin-ordre').innerHTML = (f.ordre || []).map(p =>
        `<div class="pe-cl-row${gagnants.includes(p.pseudo) ? ' moi' : ''}">
            <span>${esc(p.pseudo)}${p.isBot ? ' 🤖' : ''}</span>
            <b>${p.dice > 0 ? p.dice + ' dés' : 'éliminé'}</b>
        </div>`).join('');
    $('btn-rematch').hidden = moi !== s.host;
}
$('btn-start').addEventListener('click', () => socket.emit('perudo_start'));
$('btn-rematch').addEventListener('click', () => socket.emit('perudo_rematch'));
$('btn-retour').addEventListener('click', () => { socket.emit('perudo_leave'); location.href = '/jouer/'; });
$('btn-leave').addEventListener('click', () => { socket.emit('perudo_leave'); vue('v-lobby'); });
$('btn-quitter-partie').addEventListener('click', () => {
    DS.confirm({
        emoji: '🚪', title: 'Quitter la table ?',
        text: 'La partie continue sans toi, et tes dés restent sur la table.',
        actions: [{ label: 'Quitter', danger: true, run: () => { socket.emit('perudo_leave'); vue('v-lobby'); } }],
    });
});

// =====================================================================
//  STATISTIQUES ET CLASSEMENT
// =====================================================================
$('btn-stats').addEventListener('click', () => socket.emit('perudo_stats'));
$('stats-close').addEventListener('click', () => { $('v-stats').hidden = true; });
$('btn-classement').addEventListener('click', () => socket.emit('perudo_classement'));
$('classement-close').addEventListener('click', () => { $('v-classement').hidden = true; });

function rendreStats(f) {
    if (!f || (!f.parties && !f.partiesSolo)) {
        $('statsCorps').innerHTML = '<p class="pe-vide">Aucune partie pour l’instant. Lance une table, même contre des bots.</p>';
    } else {
        const lignes = [
            ['Parties', f.parties], ['Victoires', f.victoires],
            ['Taux de victoire', f.parties ? f.tauxVictoire + ' %' : null],
            ['Deuxièmes places', f.deuxiemes],
            ['Contre l’ordinateur', f.partiesSolo],
            ['Manches jouées', f.manches],
            ['Menteurs démasqués', f.dudosGagnes],
            ['Calzas réussis', f.calzasGagnes],
            ['Défis gagnés', f.defisLances ? `${f.defisGagnes} / ${f.defisLances} (${f.tauxDefis} %)` : null],
            ['Bluffs qui sont passés', f.bluffsSurvecus],
            ['Éliminations', f.eliminations],
            ['Dés perdus', f.desPerdus],
            ['Face préférée', f.faceFavorite],
            ['Meilleure série', f.meilleureSerie > 1 ? f.meilleureSerie + ' d’affilée' : null],
            ['Bête noire', f.beteNoire ? `${f.beteNoire.pseudo} (${f.beteNoire.fois}×)` : null],
        ].filter(([, v]) => v !== null && v !== undefined && v !== 0 && v !== '');
        $('statsCorps').innerHTML = lignes.map(([l, v]) =>
            `<div class="pe-stat-l"><span>${esc(l)}</span><b>${esc(String(v))}</b></div>`).join('');
    }
    $('v-stats').hidden = false;
}
function rendreClassement(liste) {
    $('classementCorps').innerHTML = liste.length
        ? liste.map((l, i) => `<div class="pe-cl-row${l.pseudo === moi ? ' moi' : ''}">
              <span class="pe-cl-place">${i + 1}</span>
              <span class="pe-cl-nom">${esc(l.pseudo)}<em>${l.parties} partie${l.parties > 1 ? 's' : ''} · ${l.taux} %</em></span>
              <b>${l.victoires}</b>
          </div>`).join('')
        : '<p class="pe-vide">Personne n’a encore terminé de partie.</p>';
    $('v-classement').hidden = false;
}

// =====================================================================
//  LE SOCKET
// =====================================================================
function onEtat(s) {
    etat = s;
    montrerRevele(s);
    if (s.status === 'lobby') { vue('v-waiting'); rendreAttente(s); }
    else if (s.status === 'playing') { vue('v-game'); rendreJeu(s); }
    else if (s.status === 'ended') { vue('v-fin'); rendreFin(s); }
}

function demarrer() {
    socket = io();
    socket.on('connect', () => {
        socket.emit('perudo_identify', (r) => {
            if (!r || !r.ok) { location.href = '/'; return; }
            moi = r.pseudo;
            socket.emit('perudo_list');
            // Un lien d'invitation mène droit à la table.
            const table = window.Invitation && Invitation.tableDuLien();
            if (table) socket.emit('perudo_join', { id: table });
            else if (new URLSearchParams(location.search).get('creer') === '1') {
                // Arrivé depuis le catalogue : on ouvre le panneau de réglages,
                // qui est déjà la vue par défaut.
                history.replaceState(null, '', location.pathname);
            }
        });
    });
    socket.on('perudo_games', rendreHall);
    socket.on('perudo_state', onEtat);
    socket.on('perudo_stats', rendreStats);
    socket.on('perudo_classement', rendreClassement);
    socket.on('perudo_plouf', (d) => { if (window.Plouf) Plouf.tirage(d || {}); });
    socket.on('perudo_error', (m) => DS.toast(m));
    socket.on('perudo_refus', (m) => {
        $('pe-refus').textContent = m;
        setTimeout(() => { $('pe-refus').textContent = ''; }, 2600);
    });
    socket.on('perudo_closed', () => { DS.toast('La table a été fermée.'); location.href = '/jouer/'; });
}
demarrer();

// Le geste retour du téléphone remonte d'une vue au lieu de quitter le site.
if (window.Vues) {
    Vues.suivre('v-lobby');
    Vues.surRetour(() => {
        if (!$('v-stats').hidden) { $('v-stats').hidden = true; return; }
        if (!$('v-classement').hidden) { $('v-classement').hidden = true; return; }
        if (!$('v-lobby').hidden) return;
        socket.emit('perudo_leave');
        vue('v-lobby');
    });
}
$('pe-retour').addEventListener('click', (e) => {
    if ($('v-lobby').hidden) { e.preventDefault(); socket.emit('perudo_leave'); vue('v-lobby'); }
});
