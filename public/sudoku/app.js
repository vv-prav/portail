// =====================================================================
//  LE SUDOKU DU JOUR
//
//  On touche une case, puis un chiffre. Le pavé de chiffres sous la
//  grille n'est pas un « clavier à l'écran » au sens de la règle du
//  salon : c'est la commande du jeu, comme les plaques et les opérations
//  du Compte est bon. Un clavier numérique de téléphone qui s'ouvre et se
//  ferme à chaque case serait bien plus pénible. Sur ordinateur, le
//  clavier physique marche aussi (chiffres, flèches, Retour, N).
//
//  Le navigateur signale les conflits VISIBLES (deux 7 dans une ligne),
//  jamais les erreurs : il ne connaît pas la solution. C'est le serveur
//  qui la détient et qui juge la grille terminée.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LOCALE = 'fr-FR';

async function api(path, body) {
    const res = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, data };
}

let P = null;                  // la grille du jour
let donnee = [];               // 81 chiffres, 0 = case à remplir
let cases = [];                // la grille du joueur
let notes = [];                // 81 ensembles de chiffres notés au crayon
let choisie = -1;              // la case sélectionnée
let modeNotes = false;
let historique = [];           // pour « Annuler »
let fini = false;
let debutA = 0, chronoTimer = null;

const laDate = () => { try { return new URLSearchParams(location.search).get('date') || ''; } catch (e) { return ''; } };
const suffixeDate = () => (laDate() ? '?date=' + encodeURIComponent(laDate()) : '');
const LIGNE = (i) => Math.floor(i / 9), COL = (i) => i % 9;
const CARRE = (i) => Math.floor(LIGNE(i) / 3) * 3 + Math.floor(COL(i) / 3);
const voit = (i, j) => i !== j && (LIGNE(i) === LIGNE(j) || COL(i) === COL(j) || CARRE(i) === CARRE(j));

// ---------- Les notes au crayon ----------
// Gardées dans le navigateur seulement : elles ne comptent pour rien, et les
// envoyer au serveur à chaque trait de crayon ne servirait à personne.
const cleNotes = () => 'sudoku_notes_' + (P && P.date);
function lireNotes() {
    try {
        const brut = JSON.parse(localStorage.getItem(cleNotes()) || '[]');
        return Array.from({ length: 81 }, (_, i) => new Set(Array.isArray(brut[i]) ? brut[i] : []));
    } catch (e) { return Array.from({ length: 81 }, () => new Set()); }
}
function garderNotes() {
    try { localStorage.setItem(cleNotes(), JSON.stringify(notes.map(s => [...s]))); } catch (e) {}
}

// ---------- Les conflits visibles ----------
function conflits() {
    const faux = new Set();
    for (let i = 0; i < 81; i++) {
        if (!cases[i]) continue;
        for (let j = i + 1; j < 81; j++) {
            if (cases[j] === cases[i] && voit(i, j)) { faux.add(i); faux.add(j); }
        }
    }
    return faux;
}

// ---------- L'affichage ----------
function renderGrille() {
    const faux = conflits();
    const valeur = choisie >= 0 ? cases[choisie] : 0;
    let html = '';
    for (let i = 0; i < 81; i++) {
        const cls = ['sd-case'];
        if (donnee[i]) cls.push('donnee');
        if (i === choisie) cls.push('choisie');
        else if (choisie >= 0 && voit(i, choisie)) cls.push('voisine');
        if (valeur && cases[i] === valeur && i !== choisie) cls.push('meme');
        if (faux.has(i)) cls.push('conflit');
        if (COL(i) === 2 || COL(i) === 5) cls.push('bord-d');
        if (LIGNE(i) === 2 || LIGNE(i) === 5) cls.push('bord-b');
        let dedans = '';
        if (cases[i]) dedans = cases[i];
        else if (notes[i].size) {
            dedans = '<span class="sd-notes">' + [1, 2, 3, 4, 5, 6, 7, 8, 9]
                .map(d => `<i>${notes[i].has(d) ? d : ''}</i>`).join('') + '</span>';
        }
        html += `<button type="button" class="${cls.join(' ')}" data-i="${i}" role="gridcell"
            aria-label="Ligne ${LIGNE(i) + 1}, colonne ${COL(i) + 1}${cases[i] ? ', ' + cases[i] : ', vide'}">${dedans}</button>`;
    }
    $('sd-grille').innerHTML = html;
    renderPave();
}
// Le pavé : chaque chiffre dit combien il en reste à placer, et s'éteint
// quand les neuf sont posés — un repère que tout joueur de sudoku cherche.
function renderPave() {
    const compte = Array(10).fill(0);
    cases.forEach(v => { if (v) compte[v]++; });
    $('sd-pave').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `
        <button type="button" class="sd-chiffre${compte[d] >= 9 ? ' epuise' : ''}" data-d="${d}">
            ${d}<small>${Math.max(0, 9 - compte[d]) || ''}</small>
        </button>`).join('');
    $('sd-notes').classList.toggle('on', modeNotes);
    $('sd-notes').setAttribute('aria-pressed', modeNotes ? 'true' : 'false');
    $('sd-annuler').disabled = fini || !historique.length;
}

// ---------- Jouer ----------
function choisir(i) {
    if (fini) return;
    choisie = i;
    renderGrille();
}
function memoriser(i) {
    historique.push({ i, v: cases[i], n: new Set(notes[i]), autres: null });
}
function poser(d) {
    if (fini || choisie < 0 || donnee[choisie]) return;
    const i = choisie;
    if (modeNotes) {
        if (cases[i]) return;
        memoriser(i);
        if (notes[i].has(d)) notes[i].delete(d); else notes[i].add(d);
        garderNotes(); renderGrille(); return;
    }
    memoriser(i);
    cases[i] = cases[i] === d ? 0 : d;       // retoucher le même chiffre le retire
    if (cases[i]) {
        // Le chiffre posé disparaît des notes des cases qui le voient : c'est
        // ce que tout le monde fait à la main, et le plus fastidieux.
        const effaces = [];
        for (let j = 0; j < 81; j++) if (voit(i, j) && notes[j].has(d)) { notes[j].delete(d); effaces.push(j); }
        historique[historique.length - 1].autres = { d, cases: effaces };
        notes[i].clear();
    }
    garderNotes(); renderGrille(); sauverBientot(); verifierSiPleine();
}
function effacer() {
    if (fini || choisie < 0 || donnee[choisie]) return;
    if (!cases[choisie] && !notes[choisie].size) return;
    memoriser(choisie);
    cases[choisie] = 0; notes[choisie].clear();
    garderNotes(); renderGrille(); sauverBientot();
}
function annuler() {
    if (fini) return;
    const h = historique.pop();
    if (!h) return;
    cases[h.i] = h.v; notes[h.i] = h.n;
    if (h.autres) h.autres.cases.forEach(j => notes[j].add(h.autres.d));
    choisie = h.i;
    garderNotes(); renderGrille(); sauverBientot();
}

// ---------- La sauvegarde ----------
let sauverT = null;
function sauverBientot() {
    clearTimeout(sauverT);
    sauverT = setTimeout(() => api('/api/sudoku/sauver', { date: P.date, cases: cases.join('') }), 800);
}

// Dès que la grille est pleine et sans conflit visible, on l'envoie : pas de
// bouton « Valider » à chercher quand on vient de poser le dernier chiffre.
async function verifierSiPleine() {
    if (fini || cases.some(v => !v) || conflits().size) return;
    clearTimeout(sauverT);
    const { ok, data } = await api('/api/sudoku/valider', { date: P.date, cases: cases.join('') });
    if (!ok) { DS.toast((data && data.error) || 'Impossible de valider.'); return; }
    if (!data.juste) { DS.toast('Quelque chose cloche encore…'); return; }
    P.progression = { ...(P.progression || {}), fini: true, trouve: true, ms: data.ms };
    montrerFin({ trouve: true, ms: data.ms, classement: data.classement, place: data.place });
}

// ---------- Le chronomètre ----------
function formaterTemps(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0');
}
function lancerChrono() {
    clearInterval(chronoTimer);
    $('sd-chrono').hidden = false;
    const maj = () => { $('sd-chrono').textContent = formaterTemps(Date.now() - debutA); };
    maj();
    chronoTimer = setInterval(() => { if (fini) { clearInterval(chronoTimer); return; } maj(); }, 500);
}
let restant = 0;
setInterval(() => {
    if (restant <= 0) return;
    restant--;
    const h = Math.floor(restant / 3600), m = Math.floor((restant % 3600) / 60);
    $('sd-next').textContent = `🕛 ${h} h ${String(m).padStart(2, '0')}`;
}, 1000);

// ---------- La fin ----------
function montrerFin(d) {
    fini = true;
    clearInterval(chronoTimer);
    choisie = -1;
    if (d.solution) cases = d.solution.split('').map(Number);
    renderGrille();
    document.body.classList.add('sd-fini');
    $('sd-fin-emoji').textContent = d.trouve ? '🎉' : '🏳️';
    $('sd-fin-titre').textContent = d.trouve ? 'Grille résolue !' : 'Grille abandonnée';
    $('sd-fin-texte').textContent = d.trouve
        ? (d.ms != null ? `En ${formaterTemps(d.ms)}.` : 'Grille d’archive, hors classement.')
        : 'La solution est affichée dans la grille. Demain, une autre.';
    renderBoard(d.classement || [], d.place);
    $('sd-fin').hidden = false;
    if (!laDate() && window.Enchainement) Enchainement.proposer('sudoku', $('sd-fin').querySelector('.ds-card'));
}
function renderBoard(liste, maPlace) {
    if (!liste.length) { $('sd-board').innerHTML = ''; return; }
    const medaille = ['🥇', '🥈', '🥉'];
    $('sd-board').innerHTML = `<p class="sd-board-titre">Le classement du jour</p>`
        + liste.map((e, i) => `
            <button type="button" class="sd-board-row${i + 1 === maPlace ? ' moi' : ''}" data-view="${esc(e.u)}">
                <span class="sd-b-rang">${e.trouve === false ? '·' : (medaille[i] || (i + 1))}</span>
                <span class="ds-avatar xs" data-p="${esc(e.u)}"></span>
                <span class="sd-b-nom">${esc(e.u)}</span>
                <span class="sd-b-temps">${e.trouve === false ? 'abandon' : (e.ms != null ? formaterTemps(e.ms) : '')}</span>
            </button>`).join('');
    if (window.PortailProfile) {
        const box = $('sd-board');
        box.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => PortailProfile.open(b.dataset.view)));
        PortailProfile.fetchAvatars(liste.map(e => e.u)).then(a => {
            box.querySelectorAll('.ds-avatar[data-p]').forEach(el => { el.innerHTML = PortailProfile.bubbleHTML(a[el.dataset.p]); });
        });
    }
}
function texteDePartage() {
    const jour = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
    const prog = P.progression || {};
    return `Sudoku du jour — ${jour}\n`
        + (prog.trouve ? `✅ ${prog.ms != null ? formaterTemps(prog.ms) : 'résolu'}` : '🏳️ abandonné')
        + `\n${location.origin}/sudoku`;
}

// ---------- Les commandes ----------
$('sd-grille').addEventListener('click', (e) => {
    const b = e.target.closest('.sd-case');
    if (b) choisir(Number(b.dataset.i));
});
$('sd-pave').addEventListener('click', (e) => {
    const b = e.target.closest('.sd-chiffre');
    if (b) poser(Number(b.dataset.d));
});
$('sd-notes').addEventListener('click', () => { modeNotes = !modeNotes; renderPave(); });
$('sd-effacer').addEventListener('click', effacer);
$('sd-annuler').addEventListener('click', annuler);
$('sd-abandon').addEventListener('click', () => {
    if (fini) return;
    DS.confirm({
        emoji: '🏳️', title: 'Abandonner la grille ?',
        text: 'La solution s’affichera. La journée comptera comme jouée, sans point.',
        actions: [{ label: 'Abandonner', danger: true, run: async () => {
            const { ok, data } = await api('/api/sudoku/abandon', { date: P.date });
            if (!ok) return DS.toast('Impossible pour l’instant.');
            P.progression = { ...(P.progression || {}), fini: true, trouve: false };
            montrerFin({ trouve: false, solution: data.solution, classement: data.classement, place: data.place });
        } }],
    });
});
$('sd-fin-close').addEventListener('click', () => { $('sd-fin').hidden = true; });
$('sd-partage').addEventListener('click', async () => {
    const texte = texteDePartage();
    try {
        if (navigator.share) await navigator.share({ text: texte });
        else { await navigator.clipboard.writeText(texte); DS.toast('Résultat copié.'); }
    } catch (e) {}
});

// Le clavier physique, pour qui joue sur ordinateur.
document.addEventListener('keydown', (e) => {
    if (fini || $('sd-jeu').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[1-9]$/.test(e.key)) { poser(Number(e.key)); e.preventDefault(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { effacer(); e.preventDefault(); return; }
    if (e.key === 'n' || e.key === 'N') { modeNotes = !modeNotes; renderPave(); return; }
    const pas = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (pas) {
        e.preventDefault();
        const i = choisie < 0 ? 0 : choisie + pas;
        if (i >= 0 && i < 81 && !(Math.abs(pas) === 1 && LIGNE(i) !== LIGNE(choisie < 0 ? 0 : choisie))) choisir(i);
    }
});

// ---------- Démarrage ----------
function afficherJeu() {
    $('sd-start').hidden = true;
    $('sd-jeu').hidden = false;
    renderGrille();
}
$('sd-start-btn').addEventListener('click', async () => {
    debutA = Date.now();
    afficherJeu();
    const { data } = await api('/api/sudoku/start', { date: P.date });
    if (data && data.debutA) debutA = data.debutA;
    lancerChrono();
});

async function charger() {
    const { ok, data } = await api('/api/sudoku/today' + suffixeDate());
    if (!ok) { location.href = '/'; return; }
    P = data;
    restant = P.nextIn || 0;
    donnee = P.donnee.split('').map(Number);
    const prog = P.progression || null;
    cases = (prog && prog.cases ? prog.cases : P.donnee).split('').map(Number);
    notes = lireNotes();
    $('sd-date').textContent = new Date(P.date + 'T12:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    $('sd-archive-chip').hidden = !P.archive;
    const serie = (P.serie && P.serie.encours) || 0;
    if (serie > 1) { $('sd-serie').hidden = false; $('sd-serie').innerHTML = `🔥 <b>${serie}</b>`; }
    document.body.className = 'is-ready';

    if (prog && prog.fini) {
        afficherJeu();
        const { data: cl } = await api('/api/sudoku/classement?date=' + encodeURIComponent(P.date));
        montrerFin({ trouve: !!prog.trouve, ms: prog.ms, solution: P.solution, classement: (cl && cl.classement) || [] });
    } else if (prog && prog.debutA) {
        // Une grille déjà commencée reprend là où on l'avait laissée, chrono compris.
        debutA = prog.debutA;
        afficherJeu();
        lancerChrono();
    }
}
charger();
