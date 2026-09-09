// =====================================================================
//  LE QUIZ DES DRAPEAUX
//
//  Tout le monde répond en même temps : il n'y a donc jamais de tour à
//  attendre, et c'est ce qui permet de jouer à dix. Quatre grandes cibles
//  tactiles, aucune saisie au clavier — la vitesse compte, et taper un nom
//  sur un téléphone la tuerait.
//
//  Le navigateur ne sait jamais quelle réponse est la bonne avant la
//  fermeture de la question : le serveur ne l'envoie qu'avec la correction.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let socket = null, etat = null, moi = null;
let monChoix = null;             // l'index touché, en attendant la correction
let jaugeTimer = null;
const LS_CLE = 'drapeaux_derniere_partie';

const TYPES = [
    { id: 'drapeau-nom', nom: 'Reconnaître un drapeau' },
    { id: 'nom-drapeau', nom: 'Retrouver un drapeau' },
    { id: 'continent', nom: 'Situer un continent' },
    { id: 'plus-grand', nom: 'Comparer des superficies' },
    { id: 'voisin', nom: 'Trouver un voisin' },
];
let reglages = { nbQuestions: 15, duree: 12, niveau: 'moyen', types: TYPES.map(t => t.id) };

function connecter() {
    socket = io();
    socket.on('connect', () => {
        socket.emit('drapeaux_identify', (res) => {
            if (!res || !res.ok) { DS.toast('Reconnecte-toi au salon.'); return; }
            moi = res.pseudo;
            const sauve = Invitation.tableDuLien() || localStorage.getItem(LS_CLE);
            if (sauve) socket.emit('drapeaux_join', { id: sauve });
            else socket.emit('drapeaux_list');
        });
    });
    socket.on('drapeaux_games', renderLobby);
    socket.on('drapeaux_state', onEtat);
    socket.on('drapeaux_pris', ({ index }) => { monChoix = index; renderChoix(); });
    socket.on('drapeaux_stats_result', renderStats);
    socket.on('drapeaux_classement_result', renderClassementSalon);
    socket.on('drapeaux_error', (msg) => {
        DS.toast(msg || 'Erreur.');
        if (/existe plus/i.test(msg || '')) { localStorage.removeItem(LS_CLE); montrer('v-lobby'); socket.emit('drapeaux_list'); }
    });
    socket.on('drapeaux_closed', () => { DS.toast('La partie a été fermée.'); localStorage.removeItem(LS_CLE); location.href = '/jouer/'; });
    socket.on('disconnect', () => DS.toast('Connexion perdue, on retente…'));
}

function montrer(vue) {
    ['v-lobby', 'v-waiting', 'v-question', 'v-fin'].forEach(v => { $(v).hidden = (v !== vue); });
    Vues.suivre(vue);
}
Vues.surRetour((precedente) => { if (precedente) montrer(precedente); });

// ---------- Le lobby ----------
function segment(id, cle) {
    $(id).querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        reglages[cle] = isNaN(Number(b.dataset.v)) ? b.dataset.v : Number(b.dataset.v);
    }));
}
segment('setQuestions', 'nbQuestions');
segment('setDuree', 'duree');
segment('setNiveau', 'niveau');

$('setTypes').innerHTML = TYPES.map(t =>
    `<button type="button" class="qz-type on" data-t="${t.id}">${esc(t.nom)}</button>`).join('');
$('setTypes').querySelectorAll('.qz-type').forEach(b => b.addEventListener('click', () => {
    b.classList.toggle('on');
    const actifs = [...$('setTypes').querySelectorAll('.qz-type.on')].map(x => x.dataset.t);
    // On ne peut pas tout décocher : il faut au moins un type de question.
    if (!actifs.length) { b.classList.add('on'); DS.toast('Garde au moins un type de question.'); return; }
    reglages.types = actifs;
}));

$('btn-create').addEventListener('click', () => socket.emit('drapeaux_create', reglages));
function renderLobby(parties) {
    $('lobby-vide').hidden = !!parties.length;
    $('qz-tables').innerHTML = parties.map(p => `
        <button type="button" class="ds-row" data-id="${p.id}">
            <span class="ds-row-main">
                <span class="ds-row-name">${esc(p.host)}</span>
                <span class="ds-row-sub">${p.status === 'playing' ? `🔴 Question ${p.question}/${p.total}` : 'En attente'} · ${p.alive}/${p.players} joueur${p.players > 1 ? 's' : ''}${p.spectators ? ` · 👀 ${p.spectators}` : ''}</span>
            </span>
            <span class="ds-row-go">${p.status === 'playing' ? 'Regarder ›' : 'Rejoindre ›'}</span>
        </button>`).join('');
    $('qz-tables').querySelectorAll('.ds-row').forEach(b =>
        b.addEventListener('click', () => socket.emit('drapeaux_join', { id: b.dataset.id })));
}
setInterval(() => { if (socket && socket.connected && !$('v-lobby').hidden) socket.emit('drapeaux_list'); }, 5000);

// ---------- La salle d'attente ----------
const NOM_NIVEAU = { facile: 'Faciles', moyen: 'Toutes', expert: 'Expert' };
function renderAttente(s) {
    $('wait-reglages').textContent =
        `${s.options.nbQuestions} questions · ${s.options.duree} s · ${NOM_NIVEAU[s.options.niveau] || s.options.niveau}`;
    $('wait-players').innerHTML = s.joueurs.map(j => `
        <button type="button" class="ds-waiting-chip${j.connected ? '' : ' off'}" data-view="${esc(j.pseudo)}">
            <span class="ds-avatar sm" data-p="${esc(j.pseudo)}">✦</span>
            ${esc(j.pseudo)}${j.pseudo === s.host ? '<span class="ds-waiting-host">Hôte</span>' : ''}
        </button>`).join('');
    $('wait-players').querySelectorAll('.ds-waiting-chip').forEach(b =>
        b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    PortailProfile.fetchAvatars(s.joueurs.map(j => j.pseudo)).then(a => {
        $('wait-players').querySelectorAll('.ds-avatar').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
    });
    const hote = moi === s.host;
    $('btn-start').hidden = !hote;
    $('wait-hint').hidden = hote;
    $('btn-start').textContent = s.joueurs.length < 2 ? 'Jouer seul' : `Lancer la partie (${s.joueurs.length})`;
}
$('btn-start').addEventListener('click', () => socket.emit('drapeaux_start'));
$('btn-leave').addEventListener('click', () => {
    socket.emit('drapeaux_leave'); localStorage.removeItem(LS_CLE);
    montrer('v-lobby'); socket.emit('drapeaux_list');
});
$('btn-retour').addEventListener('click', () => {
    socket.emit('drapeaux_leave'); localStorage.removeItem(LS_CLE);
    montrer('v-lobby'); socket.emit('drapeaux_list');
});

// ---------- La question ----------
function renderChoix() {
    const q = etat.question;
    const c = etat.correction;
    $('q-choix').innerHTML = q.choix.map((ch, i) => {
        const classes = ['qz-choix-btn'];
        if (ch.drapeau && !ch.texte) classes.push('drapeau-seul');
        if (monChoix === i) classes.push('choisi');
        if (c) {
            if (i === c.bonne) classes.push('juste');
            else if (monChoix === i) classes.push('faux');
            else classes.push('eteint');
        }
        return `<button type="button" class="${classes.join(' ')}" data-i="${i}" ${c || monChoix !== null || spectateur() ? 'disabled' : ''}>
            ${ch.drapeau ? `<span class="qz-choix-drapeau">${ch.drapeau}</span>` : ''}
            ${ch.texte ? `<span class="qz-choix-texte">${esc(ch.texte)}</span>` : ''}
        </button>`;
    }).join('');
    $('q-choix').querySelectorAll('.qz-choix-btn').forEach(b =>
        b.addEventListener('click', () => {
            if (monChoix !== null || etat.correction) return;
            monChoix = Number(b.dataset.i);
            renderChoix();
            socket.emit('drapeaux_repondre', { index: monChoix });
        }));
}
const spectateur = () => !!(etat && !etat.joueurs.some(j => j.pseudo === moi));

function renderQuestion(s) {
    const q = s.question;
    $('q-num').textContent = `${q.numero} / ${q.total}`;
    $('q-double').hidden = !q.doublee;
    $('q-enonce').textContent = q.enonce;
    $('q-media').innerHTML = q.media && q.media.drapeau
        ? `<span class="qz-drapeau">${q.media.drapeau}</span>` : '';
    $('q-media').hidden = !(q.media && q.media.drapeau);
    $('q-spectateur').hidden = !spectateur();
    renderChoix();
    renderRepondu(s);
    renderMini(s);
    lancerJauge(s);
}
function renderRepondu(s) {
    const el = $('q-repondu');
    if (s.correction) {
        const c = s.correction;
        const mien = c.resultats.find(r => r.pseudo === moi);
        el.className = 'qz-repondu ' + (mien && mien.juste ? 'juste' : 'faux');
        el.innerHTML = mien && mien.juste
            ? `✅ ${esc(c.reponse)} — <b>+${mien.points}</b>`
            : `❌ ${esc(c.reponse)}`;
    } else {
        el.className = 'qz-repondu';
        // Combien ont répondu, jamais qui ni quoi : sinon on regarde le voisin
        // au lieu de réfléchir.
        el.textContent = s.presents > 1 ? `${s.repondu} joueur${s.repondu > 1 ? 's' : ''} sur ${s.presents} ${s.repondu > 1 ? 'ont' : 'a'} répondu` : '';
    }
}
// À dix joueurs, la liste entière est illisible : on montre le podium et TA
// ligne, et la liste complète se déplie d'une touche.
function renderMini(s) {
    const cl = s.classement;
    const maPlace = cl.findIndex(l => l.pseudo === moi);
    const haut = cl.slice(0, 3);
    const ligne = (l) => `<span class="qz-mini-l${l.pseudo === moi ? ' moi' : ''}">
        <b>${l.place}</b> ${esc(l.pseudo === moi ? 'Toi' : l.pseudo)} <i>${l.score}</i></span>`;
    let html = haut.map(ligne).join('');
    if (maPlace >= 3) html += `<span class="qz-mini-sep">…</span>` + ligne(cl[maPlace]);
    $('q-mini').innerHTML = html;
    $('q-mini').hidden = cl.length < 2;
}
$('q-mini').addEventListener('click', () => {
    if (!etat) return;
    DS.confirm({
        emoji: '🏆', title: 'Classement',
        text: etat.classement.map(l => `${l.place}. ${l.pseudo === moi ? 'Toi' : l.pseudo} — ${l.score}`).join('\n'),
        actions: [], cancelLabel: 'Fermer', closeIcon: false,
    });
});

// La jauge se vide toute seule d'après l'heure de fin envoyée par le serveur :
// aucune horloge locale à synchroniser, et un rechargement retombe juste.
function lancerJauge(s) {
    clearInterval(jaugeTimer);
    if (s.phase !== 'question' || !s.finitA) {
        $('q-jauge').style.width = '0%';
        $('q-chrono').textContent = s.phase === 'reveal' ? 'Réponse' : '—';
        return;
    }
    const duree = s.options.duree * 1000;
    const tic = () => {
        const reste = Math.max(0, s.finitA - Date.now());
        $('q-jauge').style.width = Math.round((reste / duree) * 100) + '%';
        $('q-chrono').textContent = Math.ceil(reste / 1000) + ' s';
        $('q-chrono').classList.toggle('urgent', reste <= 3000);
        if (reste <= 0) clearInterval(jaugeTimer);
    };
    jaugeTimer = setInterval(tic, 100);
    tic();
}

// ---------- La fin ----------
const COULEURS = ['#d9a94e', '#ecca82', '#9b6fc7', '#5aa8d9', '#3fb6ae'];
function renderFin(s) {
    const f = s.final;
    const cl = f.classement;
    const nul = f.gagnants.length > 1;
    const solo = s.joueurs.length < 2;
    const jeGagne = f.gagnants.includes(moi);
    $('fin-emoji').textContent = solo ? '🎯' : (jeGagne && !nul ? '🏆' : (nul ? '🤝' : '🌍'));
    $('fin-titre').textContent = solo
        ? `${cl[0] ? cl[0].score : 0} points`
        : (nul ? `Égalité entre ${f.gagnants.join(' et ')}`
               : (jeGagne ? 'Tu as gagné !' : `${f.gagnants[0] || '—'} a gagné !`));
    $('fin-podium').innerHTML = cl.slice(0, 3).map((l, i) => `
        <button type="button" class="qz-podium-place p${i + 1}" data-view="${esc(l.pseudo)}">
            <span class="qz-podium-medaille">${['🥇', '🥈', '🥉'][i]}</span>
            <span class="qz-podium-nom">${esc(l.pseudo === moi ? 'Toi' : l.pseudo)}</span>
            <b class="qz-podium-score">${l.score}</b>
        </button>`).join('');
    $('fin-faits').innerHTML = (f.faits || []).map(x => `<p class="qz-fait">${esc(x)}</p>`).join('');
    $('fin-classement').innerHTML = cl.length > 3
        ? `<p class="qz-sous-titre">Le classement complet</p>` + cl.map(l => `
            <button type="button" class="qz-cl-row${l.pseudo === moi ? ' moi' : ''}" data-view="${esc(l.pseudo)}">
                <span class="qz-cl-place">${l.place}</span>
                <span class="qz-cl-nom">${esc(l.pseudo)}</span>
                <span class="qz-cl-score">${l.score}</span>
            </button>`).join('')
        : '';
    document.querySelectorAll('#fin-podium [data-view], #fin-classement [data-view]').forEach(b =>
        b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
    $('btn-rematch').hidden = moi !== s.host;
    if (jeGagne && !nul && !solo) confettis();
}
function confettis() {
    const champ = $('qz-confetti');
    champ.innerHTML = '';
    for (let i = 0; i < 80; i++) {
        const b = document.createElement('span');
        b.className = 'qz-confetti-bit';
        b.style.left = Math.random() * 100 + '%';
        b.style.background = COULEURS[i % COULEURS.length];
        b.style.animationDelay = (Math.random() * .7) + 's';
        b.style.animationDuration = (1.6 + Math.random() * 1.3) + 's';
        b.style.setProperty('--derive', (Math.random() * 150 - 75) + 'px');
        champ.appendChild(b);
    }
    setTimeout(() => { champ.innerHTML = ''; }, 3200);
}
$('btn-rematch').addEventListener('click', () => socket.emit('drapeaux_rematch'));

// ---------- Les statistiques ----------
$('btn-stats').addEventListener('click', () => { $('v-stats').hidden = false; socket.emit('drapeaux_stats'); });
$('stats-close').addEventListener('click', () => { $('v-stats').hidden = true; });
$('btn-classement').addEventListener('click', () => { $('v-classement').hidden = false; socket.emit('drapeaux_classement'); });
$('classement-close').addEventListener('click', () => { $('v-classement').hidden = true; });

function renderStats(d) {
    if (!d) return;
    if (!d.questions) { $('statsCorps').innerHTML = `<p class="qz-list-label">Aucune partie jouée pour l'instant.</p>`; return; }
    const boite = (l, v) => `<div class="ds-stat-box"><b>${v}</b><em>${l}</em></div>`;
    $('statsCorps').innerHTML =
        `<p class="qz-bilan"><b>${d.bonnes}</b> bonnes réponses sur <b>${d.questions}</b> — ${d.tauxBonnes} %</p>`
        + `<div class="ds-stat-grid">`
        + boite(d.parties ? 'Parties' : 'Parties solo', d.parties || d.solo || 0)
        + boite('Victoires', d.victoires)
        + boite('Meilleur score', d.meilleurScore)
        + boite('Score moyen', d.moyenne)
        + boite('Meilleure série', d.meilleureSerie)
        + (d.parties && d.solo ? boite('dont solo', d.solo) : '')
        + boite('Plus rapide', d.plusRapide != null ? (d.plusRapide / 1000).toFixed(1) + ' s' : '—')
        + `</div>`
        // Le détail par type : c'est ce qui dit à quelqu'un où il est bon.
        + (d.types.length ? `<p class="qz-sous-titre">Par type de question</p>`
            + d.types.map(t => `
                <div class="qz-type-ligne">
                    <span class="qz-type-nom">${esc(t.nom)}</span>
                    <span class="qz-type-taux">${t.taux} %</span>
                    <span class="qz-type-detail">${t.bonnes}/${t.posees}</span>
                    <span class="qz-type-jauge"><i style="width:${t.taux}%"></i></span>
                </div>`).join('') : '');
}
function renderClassementSalon(rows) {
    if (!rows || !rows.length) { $('classementCorps').innerHTML = `<p class="qz-list-label">Personne n'a encore joué.</p>`; return; }
    const medaille = ['🥇', '🥈', '🥉'];
    $('classementCorps').innerHTML = rows.map((r, i) => `
        <button type="button" class="qz-cl-row${r.pseudo === moi ? ' moi' : ''}" data-view="${esc(r.pseudo)}">
            <span class="qz-cl-place">${medaille[i] || (i + 1)}</span>
            <span class="qz-cl-nom">${esc(r.pseudo)}
                <em>${r.tauxBonnes} % de bonnes · record ${r.meilleurScore}${r.plusRapide != null ? ' · ' + (r.plusRapide / 1000).toFixed(1) + ' s' : ''}</em></span>
            <span class="qz-cl-score">${r.victoires}V</span>
        </button>`).join('');
    $('classementCorps').querySelectorAll('[data-view]').forEach(b =>
        b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
}

// ---------- Le routage ----------
let derniereQuestion = null, dernierePhase = null;
function onEtat(s) {
    etat = s;
    localStorage.setItem(LS_CLE, s.id);
    $('qz-sub').textContent = s.status === 'playing'
        ? `Question ${s.question ? s.question.numero : 1} / ${s.options.nbQuestions}`
        : (s.status === 'ended' ? 'Partie terminée' : `Partie de ${s.host}`);
    if (s.status === 'lobby') Invitation.definirTable(s.id); else Invitation.effacer();

    if (s.status === 'lobby') { montrer('v-waiting'); renderAttente(s); }
    else if (s.status === 'playing') {
        montrer('v-question');
        // Nouvelle question : on remet le choix à zéro. La correction, elle,
        // ne doit pas l'effacer — le joueur doit voir ce qu'il avait touché.
        const cle = s.question ? s.question.numero : 0;
        if (cle !== derniereQuestion) { monChoix = null; derniereQuestion = cle; }
        if (s.maReponse && monChoix === null) monChoix = s.maReponse.index;
        renderQuestion(s);
        if (s.phase !== dernierePhase && s.phase === 'reveal' && navigator.vibrate) {
            const mien = s.correction && s.correction.resultats.find(r => r.pseudo === moi);
            try { navigator.vibrate(mien && mien.juste ? [40, 60, 40] : 30); } catch (e) {}
        }
        dernierePhase = s.phase;
    }
    else if (s.status === 'ended') { clearInterval(jaugeTimer); montrer('v-fin'); renderFin(s); }
}

connecter();
