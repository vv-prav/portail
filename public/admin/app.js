// =====================================================================
//  ADMINISTRATION — client
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, body) {
    const res = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 403) { location.href = '/'; return { ok: false, data: {} }; }
    return { ok: res.ok, data };
}

let toastT = null;
function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
}
function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtAgo(ts) {
    if (!ts) return 'jamais';
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d === 0) return "aujourd'hui";
    if (d === 1) return 'hier';
    if (d < 31) return 'il y a ' + d + ' j';
    return fmtDate(ts);
}
function fmtDur(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? h + ' h ' + m + ' min' : m + ' min';
}

// ---------- Onglets ----------
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === b));
    ['home', 'accounts', 'system'].forEach(p => { $('pane-' + p).hidden = (p !== b.dataset.tab); });
    if (b.dataset.tab === 'accounts') loadAccounts();
    if (b.dataset.tab === 'system') loadOverview();
}));

// ---------- Boîte générique ----------
function ask(emoji, title, sub, actions, code) {
    $('ask-emoji').textContent = emoji;
    $('ask-title').textContent = title;
    $('ask-sub').textContent = sub || '';
    const cb = $('ask-code');
    if (code) { cb.textContent = code; cb.hidden = false; } else cb.hidden = true;
    const box = $('ask-acts'); box.innerHTML = '';
    (actions || []).forEach(a => {
        const b = document.createElement('button');
        b.className = 'btn' + (a.danger ? ' danger' : '');
        b.type = 'button'; b.textContent = a.label;
        b.addEventListener('click', () => { $('ov-ask').hidden = true; a.run(); });
        box.appendChild(b);
    });
    $('ov-ask').hidden = false;
}
$('ask-cancel').addEventListener('click', () => { $('ov-ask').hidden = true; });

// ---------- Vue d'ensemble ----------
async function loadOverview() {
    const { data } = await api('/api/admin/overview');
    if (!data || !data.accounts && data.accounts !== 0) return;
    $('ad-who').textContent = data.you + ' · administrateur';
    $('ad-stats').innerHTML = [
        ['👥', data.accounts, 'comptes'],
        ['🟢', data.activeThisWeek, 'actifs (7 j)'],
        ['✨', data.newThisWeek, 'nouveaux (7 j)'],
        ['🧩', data.solvedToday, 'grilles réussies aujourd’hui'],
        ['⛔', data.banned, 'suspendus'],
        ['🔑', data.mfKeys, 'clés en base'],
    ].map(([i, v, l]) => `<div class="stat"><span class="s-ico">${i}</span><b>${v}</b><em>${l}</em></div>`).join('');
    $('ann-text').value = data.announce || '';
    $('sys-info').innerHTML = [
        ['Stockage', data.storage],
        ['Clés mots fléchés', data.mfKeys],
        ['Mémoire utilisée', data.memory + ' Mo'],
        ['En ligne depuis', fmtDur(data.uptime)],
        ['Administrateurs', (data.admins || []).join(', ')],
    ].map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    loadLog();
}
async function loadLog() {
    const { data } = await api('/api/admin/log');
    const list = (data && data.log) || [];
    $('ad-log').innerHTML = list.length
        ? list.slice(0, 30).map(e => `<div class="log-row"><span class="lg-a">${esc(e.action)}</span>
            <span class="lg-t">${esc(e.target)} ${esc(e.detail || '')}</span>
            <span class="lg-d">${fmtAgo(e.ts)}</span></div>`).join('')
        : '<p class="empty">Aucune action enregistrée.</p>';
}
$('ann-save').addEventListener('click', async () => {
    const { ok } = await api('/api/admin/announce', { text: $('ann-text').value });
    toast(ok ? ($('ann-text').value ? 'Annonce publiée.' : 'Annonce retirée.') : 'Erreur.');
});

// ---------- Comptes ----------
let accSort = 'recent', accT = null;
$('acc-q').addEventListener('input', () => { clearTimeout(accT); accT = setTimeout(loadAccounts, 250); });
document.querySelectorAll('#acc-sort button').forEach(b => b.addEventListener('click', () => {
    accSort = b.dataset.sort;
    document.querySelectorAll('#acc-sort button').forEach(x => x.classList.toggle('on', x === b));
    loadAccounts();
}));

async function loadAccounts() {
    const q = encodeURIComponent($('acc-q').value.trim());
    const { data } = await api(`/api/admin/accounts?q=${q}&sort=${accSort}`);
    const list = (data && data.accounts) || [];
    $('acc-count').textContent = list.length + ' compte(s) affiché(s) sur ' + (data.total || 0);
    $('acc-list').innerHTML = list.length ? list.map(u => `
        <button class="row" data-p="${esc(u.pseudo)}">
            <span class="r-main">
                <span class="r-name">${esc(u.pseudo)}${u.admin ? ' <i class="badge adm">admin</i>' : ''}${u.banned ? ' <i class="badge ban">suspendu</i>' : ''}</span>
                <span class="r-sub">inscrit ${fmtDate(u.created)} · vu ${fmtAgo(u.lastLogin)}</span>
            </span>
            <span class="r-go">›</span>
        </button>`).join('') : '<p class="empty">Aucun compte trouvé.</p>';
    $('acc-list').querySelectorAll('.row').forEach(b => b.addEventListener('click', () => openAccount(b.dataset.p)));
}

async function openAccount(pseudo) {
    const { ok, data } = await api('/api/admin/account?pseudo=' + encodeURIComponent(pseudo));
    if (!ok) return toast(data.error || 'Erreur');
    $('acc-name').textContent = data.pseudo;
    const mfs = data.motsfleches || {};
    $('acc-detail').innerHTML = [
        ['Statut', data.admin ? 'Administrateur' : (data.banned ? 'Suspendu' : 'Actif')],
        ['Inscrit le', fmtDate(data.created)],
        ['Dernière connexion', fmtAgo(data.lastLogin)],
        ['Code de récupération', data.hasRecovery ? 'défini' : 'aucun'],
        ['Mots fléchés', `${mfs.solved || 0} réussies · ${mfs.gaveUp || 0} abandons · ${mfs.daysPlayed || 0} jours`],
        ['Meilleur temps', mfs.best ? Math.floor(mfs.best / 60) + ':' + String(mfs.best % 60).padStart(2, '0') : '—'],
    ].map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

    const acts = $('acc-acts'); acts.innerHTML = '';
    const add = (label, fn, danger) => {
        const b = document.createElement('button');
        b.className = 'btn' + (danger ? ' danger' : ' ghost');
        b.type = 'button'; b.textContent = label;
        b.addEventListener('click', fn);
        acts.appendChild(b);
    };
    add('Réinitialiser le mot de passe', () => ask('🔑', 'Réinitialiser ?', `Un mot de passe temporaire sera créé pour ${data.pseudo}, qui sera déconnecté.`, [
        { label: 'Confirmer', run: async () => {
            const r = await api('/api/admin/account/password', { pseudo: data.pseudo });
            if (r.ok) ask('🔑', 'Mot de passe temporaire', 'Transmets-le à la personne. Elle pourra le changer ensuite.', [], r.data.tempPassword);
            else toast(r.data.error || 'Erreur');
        } }]));
    add('Générer un code de récupération', () => ask('🎫', 'Nouveau code ?', `L'ancien code de ${data.pseudo} sera invalidé.`, [
        { label: 'Confirmer', run: async () => {
            const r = await api('/api/admin/account/recovery', { pseudo: data.pseudo });
            if (r.ok) ask('🎫', 'Code de récupération', 'À transmettre et à noter.', [], r.data.recoveryCode);
            else toast(r.data.error || 'Erreur');
        } }]));
    add('Renommer', () => {
        const to = prompt('Nouveau pseudo pour ' + data.pseudo + ' :', data.pseudo);
        if (!to || to === data.pseudo) return;
        ask('✏️', 'Renommer ?', `${data.pseudo} deviendra « ${to} ». Ses données seront reportées.`, [
            { label: 'Confirmer', run: async () => {
                const r = await api('/api/admin/account/rename', { from: data.pseudo, to });
                toast(r.ok ? 'Compte renommé.' : (r.data.error || 'Erreur'));
                if (r.ok) { $('ov-acc').hidden = true; loadAccounts(); }
            } }]);
    });
    add('Déconnecter de force', () => ask('🚪', 'Déconnecter ?', `${data.pseudo} devra se reconnecter.`, [
        { label: 'Confirmer', run: async () => {
            const r = await api('/api/admin/account/logout', { pseudo: data.pseudo });
            toast(r.ok ? 'Sessions fermées.' : 'Erreur');
        } }]));
    if (!data.admin) {
        add(data.banned ? 'Réactiver le compte' : 'Suspendre le compte', () => ask(data.banned ? '✅' : '⛔',
            data.banned ? 'Réactiver ?' : 'Suspendre ?',
            data.banned ? `${data.pseudo} pourra se reconnecter.` : `${data.pseudo} sera déconnecté et ne pourra plus se connecter.`, [
            { label: 'Confirmer', danger: !data.banned, run: async () => {
                const r = await api('/api/admin/account/ban', { pseudo: data.pseudo, banned: !data.banned });
                toast(r.ok ? 'C’est fait.' : (r.data.error || 'Erreur'));
                if (r.ok) { $('ov-acc').hidden = true; loadAccounts(); }
            } }]), data.banned ? false : true);
        add('Supprimer définitivement', () => ask('🗑️', 'Supprimer ?', `Le compte ${data.pseudo} et toutes ses données seront effacés. Cette action est irréversible.`, [
            { label: 'Oui, supprimer', danger: true, run: async () => {
                const r = await api('/api/admin/account/delete', { pseudo: data.pseudo });
                toast(r.ok ? 'Compte supprimé.' : (r.data.error || 'Erreur'));
                if (r.ok) { $('ov-acc').hidden = true; loadAccounts(); }
            } }]), true);
    }
    $('ov-acc').hidden = false;
}
$('acc-close').addEventListener('click', () => { $('ov-acc').hidden = true; });

// ---------- Système ----------
$('sys-purge').addEventListener('click', () => ask('🧹', 'Lancer le ménage ?', 'Les données trop anciennes seront supprimées définitivement.', [
    { label: 'Confirmer', run: async () => {
        const r = await api('/api/admin/purge', {});
        toast(r.ok ? 'Ménage terminé — ' + r.data.keys + ' clés restantes.' : 'Erreur');
        loadOverview();
    } }]));

loadOverview();