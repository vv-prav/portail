// =====================================================================
//  L'ENTRAIDE — la page du rôle éditeur
//
//  Une page, deux boutons. Tout ce qui ressemble à de l'administration
//  (les données, les classements, la suppression) n'est pas ici, et les
//  routes ne le serviraient pas de toute façon : le serveur vérifie le
//  rôle à chaque geste, l'interface ne fait que montrer ce qui marche.
//
//  ⚠️ Un compte « protégé » (administrateur, ou autre éditeur) s'affiche
//  grisé, avec la raison écrite. Masquer la ligne ferait croire que le
//  compte n'existe pas et enverrait chercher une faute de frappe ; des
//  boutons qui refusent sans rien dire se liraient comme une panne.
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(chemin, corps) {
    const r = await fetch(chemin, {
        method: corps ? 'POST' : 'GET',
        headers: corps ? { 'Content-Type': 'application/json' } : undefined,
        body: corps ? JSON.stringify(corps) : undefined,
    });
    let data = {};
    try { data = await r.json(); } catch (e) {}
    return { ok: r.ok, data };
}

function ilYA(ts) {
    if (!ts) return 'jamais vu';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 90) return 'à l’instant';
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
    const j = Math.floor(s / 86400);
    return 'il y a ' + j + (j > 1 ? ' jours' : ' jour');
}

// ---------------------------------------------------------------
//  LES DEUX GESTES
//  La popup de confirmation dit ce que la personne devra faire, parce
//  que c'est à l'éditeur de le lui expliquer en lui envoyant le code.
// ---------------------------------------------------------------
function donnerUnCode(pseudo) {
    DS.confirm({
        emoji: '🎫', title: 'Un nouveau code ?',
        text: `Un code de récupération neuf sera créé pour ${pseudo}, et l'ancien ne marchera plus. Il choisira lui-même son nouveau mot de passe.`,
        actions: [{ label: 'Créer le code', run: async () => {
            const { ok, data } = await api('/api/entraide/code', { pseudo });
            if (!ok) return DS.toast(data.error || 'Erreur.');
            DS.confirm({
                emoji: '🎫', title: 'Code de récupération',
                text: `Envoie ce code à ${pseudo}. Sur l'écran de connexion : « Mot de passe oublié ? », son pseudo, ce code, et il choisit un nouveau mot de passe.`,
                code: data.recoveryCode, cancelLabel: 'Fermer', closeIcon: false,
                actions: [{ label: 'Copier le code', run: () => navigator.clipboard.writeText(data.recoveryCode).catch(() => {}) }],
            });
            tout();
        } }],
    });
}

function poserUnProvisoire(pseudo) {
    DS.confirm({
        emoji: '🔑', title: 'Un mot de passe provisoire ?',
        text: `${pseudo} sera déconnecté de tous ses appareils. Le mot de passe provisoire ne vaut que 24 heures, et l'appli lui demandera d'en choisir un vrai dès son arrivée. Le code de récupération est préférable quand c'est possible.`,
        actions: [{ label: 'Créer le provisoire', run: async () => {
            const { ok, data } = await api('/api/entraide/provisoire', { pseudo });
            if (!ok) return DS.toast(data.error || 'Erreur.');
            DS.confirm({
                emoji: '🔑', title: 'Mot de passe provisoire',
                text: 'Transmets-le à la personne. Il n’est valable que 24 heures, et elle devra en choisir un vrai dès sa connexion.',
                code: data.tempPassword, cancelLabel: 'Fermer', closeIcon: false,
                actions: [{ label: 'Copier', run: () => navigator.clipboard.writeText(data.tempPassword).catch(() => {}) }],
            });
            tout();
        } }],
    });
}

// Les deux boutons, posés par le même code pour les demandes et pour la
// recherche : ce sont les mêmes gestes, ils doivent se présenter pareil.
function brancherLesGestes(hote) {
    hote.querySelectorAll('[data-code]').forEach(b =>
        b.addEventListener('click', () => donnerUnCode(b.dataset.code)));
    hote.querySelectorAll('[data-prov]').forEach(b =>
        b.addEventListener('click', () => poserUnProvisoire(b.dataset.prov)));
    hote.querySelectorAll('[data-ignorer]').forEach(b => b.addEventListener('click', () => {
        const pseudo = b.dataset.ignorer;
        DS.confirm({
            emoji: '🤫', title: 'Écarter la demande ?',
            text: `La demande de ${pseudo} disparaîtra de la liste sans que rien ne soit changé sur son compte. Il pourra en refaire une.`,
            actions: [{ label: 'Écarter', run: async () => {
                const { ok } = await api('/api/entraide/ignorer', { pseudo });
                DS.toast(ok ? 'Demande écartée.' : 'Erreur.');
                tout();
            } }],
        });
    }));
    hote.querySelectorAll('[data-profil]').forEach(b => b.addEventListener('click', () => {
        if (window.PortailProfile) PortailProfile.open(b.dataset.profil);
    }));
}

const boutons = (c) => c.protege
    ? `<p class="en-protege">Compte d'un administrateur ou d'un éditeur : seul un administrateur peut le dépanner.</p>`
    : `<div class="en-actions">
           <button class="ds-btn small" type="button" data-code="${esc(c.pseudo)}">🎫 Un code</button>
           <button class="ds-btn small ghost" type="button" data-prov="${esc(c.pseudo)}">🔑 Un provisoire</button>
       </div>`;

// ---------------------------------------------------------------
//  LES DEMANDES
// ---------------------------------------------------------------
async function chargerLesDemandes() {
    const { ok, data } = await api('/api/entraide/demandes');
    if (!ok) return;
    const liste = data.enAttente || [];
    $('en-demandes').innerHTML = liste.length ? liste.map(d => `
        <article class="en-carte ${d.protege ? 'off' : ''}">
            <div class="en-carte-head">
                <button class="en-nom" type="button" data-profil="${esc(d.pseudo)}">${esc(d.pseudo)}</button>
                <span class="en-quand">${esc(ilYA(d.ts))}</span>
            </div>
            ${d.message ? `<p class="en-mot">« ${esc(d.message)} »</p>` : '<p class="en-mot vide">Aucun message.</p>'}
            ${d.existe ? boutons(d) : '<p class="en-protege">Ce compte n’existe plus.</p>'}
            <button class="en-ignorer" type="button" data-ignorer="${esc(d.pseudo)}">Écarter sans rien faire</button>
        </article>`).join('')
        // ⚠️ Le vide est l'état NORMAL de cette page, et il doit se lire comme
        // une bonne nouvelle, pas comme un écran qui n'a pas chargé.
        : `<p class="en-vide">Personne n’attend. Tout le monde est entré.</p>`;
    brancherLesGestes($('en-demandes'));

    const faites = data.traitees || [];
    $('en-sec-faites').hidden = !faites.length;
    $('en-faites').innerHTML = faites.map(d => `
        <div class="en-ligne off">
            <span class="en-ligne-nom">${esc(d.pseudo)}</span>
            <span class="en-ligne-sub">${d.ignoree ? 'écartée' : 'réglée'} ${esc(ilYA(d.traiteeLe))}${d.par ? ' par ' + esc(d.par) : ''}</span>
        </div>`).join('');
}

// ---------------------------------------------------------------
//  LA RECHERCHE
//  Vide, elle montre les dernières personnes vues : neuf fois sur dix
//  c'est l'une d'elles qui appelle, et ça évite de taper un nom.
// ---------------------------------------------------------------
let minuteur = null;
async function chargerLesComptes() {
    const q = encodeURIComponent($('en-q').value.trim());
    const { ok, data } = await api('/api/entraide/comptes?q=' + q);
    if (!ok) return;
    const liste = data.comptes || [];
    $('en-comptes').innerHTML = liste.length ? liste.map(c => `
        <details class="en-compte ${c.protege ? 'off' : ''}">
            <summary>
                <span class="en-bulle">${c.avatarPhoto ? `<img src="${esc(c.avatarPhoto)}" alt="">` : esc(c.avatar || '✦')}</span>
                <span class="en-compte-txt">
                    <span class="en-ligne-nom">${esc(c.pseudo)}${c.role ? ` <i class="en-role">${c.role === 'admin' ? 'admin' : 'éditeur'}</i>` : ''}${c.suspendu ? ' <i class="en-role ban">suspendu</i>' : ''}</span>
                    <span class="en-ligne-sub">${esc(ilYA(c.lastSeen))} · ${c.aUnCode ? 'a un code' : 'aucun code'}${c.enAttenteDeChangement ? ' · provisoire en cours' : ''}</span>
                </span>
            </summary>
            ${boutons(c)}
        </details>`).join('')
        : '<p class="en-vide">Aucun compte à ce nom.</p>';
    brancherLesGestes($('en-comptes'));
}
$('en-q').addEventListener('input', () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(chargerLesComptes, 250);
});

function tout() { chargerLesDemandes(); chargerLesComptes(); }
tout();
// Au retour sur l'onglet : une demande peut être arrivée pendant ce temps.
document.addEventListener('visibilitychange', () => { if (!document.hidden) chargerLesDemandes(); });
