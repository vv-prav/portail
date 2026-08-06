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

function toast(msg) { DS.toast(msg); }
function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(ts) { return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function fmtAgo(ts) {
    if (!ts) return 'jamais';
    const d = Math.floor((Date.now() - ts) / 86400000);
    if (d === 0) return "aujourd'hui à " + fmtTime(ts);
    if (d === 1) return 'hier à ' + fmtTime(ts);
    if (d < 31) return 'il y a ' + d + ' j, à ' + fmtTime(ts);
    return fmtDate(ts) + ' à ' + fmtTime(ts);
}
function fmtDur(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? h + ' h ' + m + ' min' : m + ' min';
}

// ---------- Onglets ----------
function switchTab(tab) {
    ['home', 'accounts', 'perudo', 'grids', 'motus', 'motjuste', 'pbac', 'undercover', 'yams', 'motusparty', 'dict', 'system'].forEach(p => { $('pane-' + p).hidden = (p !== tab); });
    document.querySelectorAll('.ad-tile').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'home') loadOverview();
    if (tab === 'accounts') loadAccounts();
    if (tab === 'perudo') loadPerudo();
    if (tab === 'grids') loadGrids();
    if (tab === 'motus') loadMotus();
    if (tab === 'motjuste') loadMotJuste();
    if (tab === 'pbac') loadPbac();
    if (tab === 'undercover') loadUndercover();
    if (tab === 'yams') loadYams();
    if (tab === 'motusparty') loadMotusParty();
    if (tab === 'dict') { loadDictStats(); loadDict(); }
    if (tab === 'system') { loadOverview(); loadAdmins(); }
    window.scrollTo(0, 0);
}
document.querySelectorAll('.ad-tile').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
let homeSearchT = null;
$('home-search').addEventListener('input', () => {
    clearTimeout(homeSearchT);
    const q = $('home-search').value.trim();
    if (!q) { $('home-search-results').hidden = true; return; }
    homeSearchT = setTimeout(async () => {
        const { data } = await api('/api/admin/search?q=' + encodeURIComponent(q));
        if (!data) return;
        const parts = [];
        if (data.accounts.length) parts.push(`
            <p class="hsr-label">Comptes</p>
            ${data.accounts.map(u => `
                <button class="ds-row" data-open-acc="${esc(u.pseudo)}">
                    <span class="ds-row-main"><span class="ds-row-name">${esc(u.pseudo)}${u.online ? ' <i class="badge online">🟢</i>' : ''}${u.banned ? ' <i class="badge ban">suspendu</i>' : ''}</span></span>
                    <span class="ds-row-go">›</span>
                </button>`).join('')}`);
        if (data.games.length) parts.push(`
            <p class="hsr-label">Parties passées</p>
            ${data.games.map(g => `
                <div class="ds-row static">
                    <span class="ds-row-main">
                        <span class="ds-row-name">${GAME_LABEL_ICON[g.app] || ''} ${esc(g.label)}</span>
                        <span class="ds-row-sub">${g.players.map(esc).join(', ')} · ${fmtAgo(g.endedAt)}</span>
                    </span>
                </div>`).join('')}`);
        $('home-search-results').innerHTML = parts.length ? parts.join('') : '<p class="empty">Rien trouvé.</p>';
        $('home-search-results').hidden = false;
    }, 250);
});
$('home-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open-acc]');
    if (!b) return;
    switchTab('accounts');
    openAccount(b.dataset.openAcc);
});

// ---------- Boîte générique ----------
function ask(emoji, title, sub, actions, code, confirmText) {
    DS.confirm({ emoji, title, text: sub, actions, code, confirmText });
}

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
    ].map(([i, v, l]) => `<div class="stat"><span class="s-ico">${i}</span><b>${v}</b><em>${l}</em></div>`).join('');
    $('ad-online').innerHTML = (data.onlineNow || []).length
        ? data.onlineNow.map(p => `<div class="ds-row static"><span class="ds-row-main"><span class="ds-row-name">🟢 ${esc(p)}</span></span></div>`).join('')
        : '<p class="empty">Personne pour l\u2019instant.</p>';
    $('ann-text').value = data.announce || '';
    $('ann-clear').hidden = !data.announce;
    $('sys-info').innerHTML = [
        ['Stockage', data.storage],
        ['Clés mots fléchés', data.mfKeys],
        ['Mémoire utilisée', data.memory + ' Mo'],
        ['En ligne depuis', fmtDur(data.uptime)],
        ['Administrateurs', (data.admins || []).join(', ')],
    ].map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    loadLog();
    loadAppsOverview();
    loadGameHistory();
}
async function loadAppsOverview() {
    const { data } = await api('/api/admin/apps-overview');
    if (!data) return;
    const groups = [
        { icon: '🧩', name: 'Mots Fléchés', stats: [[data.mf.solvedToday, 'résolues aujourd\u2019hui']] },
        { icon: '📝', name: 'Motus', stats: [[data.motus.solversToday, 'ont trouvé aujourd\u2019hui']] },
        { icon: '🔤', name: 'Le Mot Juste', stats: [[data.motjuste.solversToday, 'ont trouvé aujourd\u2019hui']] },
        { icon: '🎲', name: 'Perudo', stats: [[data.perudo.online, 'en ligne'], [data.perudo.activeGames, 'en cours']] },
        { icon: '🍎', name: 'Petit Bac', stats: [[data.pbac.online, 'en ligne'], [data.pbac.totalGamesPlayed, 'jouées au total']] },
        { icon: '🕵️', name: 'Infiltré', stats: [[data.undercover.online, 'en ligne']] },
        { icon: '🎯', name: 'Yams', stats: [[data.yams.online, 'en ligne'], [data.yams.activeGames, 'en cours'], [data.yams.totalGamesPlayed, 'au total']] },
        { icon: '🏁', name: 'Motus Party', stats: [[data.motusparty.online, 'en ligne'], [data.motusparty.activeGames, 'en cours'], [data.motusparty.totalMatchesPlayed, 'au total']] },
    ];
    $('ad-apps-stats').innerHTML = groups.map(g => `
        <div class="game-overview-card">
            <div class="game-overview-head"><span>${g.icon}</span><b>${g.name}</b></div>
            <div class="game-overview-stats">
                ${g.stats.map(([v, l]) => `<div class="game-overview-stat"><b>${v}</b><em>${l}</em></div>`).join('')}
            </div>
        </div>`).join('');
}
const GAME_LABEL_ICON = { perudo: '🎲', pbac: '🍎', undercover: '🕵️', yams: '🎯', motusparty: '🏁' };
async function loadGameHistory() {
    const { data } = await api('/api/admin/game-history');
    const list = (data && data.history) || [];
    $('ad-game-history').innerHTML = list.length
        ? list.slice(0, 30).map(g => `<div class="log-row"><span class="lg-a">${GAME_LABEL_ICON[g.app] || ''} ${esc(g.label)}</span>
            <span class="lg-t">${(g.players || []).map(esc).join(', ') || 'personne'}</span>
            <span class="lg-d">${fmtAgo(g.endedAt)}</span></div>`).join('')
        : '<p class="empty">Aucune partie terminée pour l\u2019instant.</p>';
}
let _logCache = [];
function renderLog() {
    const q = ($('log-q').value || '').toLowerCase().trim();
    const list = _logCache.filter(e => !q ||
        (e.action || '').toLowerCase().includes(q) ||
        (e.target || '').toLowerCase().includes(q) ||
        (e.who || '').toLowerCase().includes(q) ||
        (e.detail || '').toLowerCase().includes(q));
    $('ad-log').innerHTML = list.length
        ? list.slice(0, 60).map(e => `<div class="log-row"><span class="lg-a">${esc(e.action)}</span>
            <span class="lg-t">${esc(e.target)} ${esc(e.detail || '')}</span>
            <span class="lg-d">${fmtAgo(e.ts)}</span></div>`).join('')
        : '<p class="empty">Aucune action trouvée.</p>';
}
async function loadLog() {
    const { data } = await api('/api/admin/log');
    _logCache = (data && data.log) || [];
    renderLog();
}
$('log-q').addEventListener('input', renderLog);
$('log-export').addEventListener('click', () => {
    const rows = [['date', 'admin', 'action', 'cible', 'détail']];
    _logCache.forEach(e => rows.push([
        new Date(e.ts).toISOString(), e.who || '', e.action || '', e.target || '', e.detail || '',
    ]));
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const aEl = document.createElement('a');
    aEl.href = URL.createObjectURL(blob);
    aEl.download = 'journal-admin-' + new Date().toISOString().slice(0, 10) + '.csv';
    aEl.click();
    setTimeout(() => URL.revokeObjectURL(aEl.href), 2000);
});
$('ann-save').addEventListener('click', async () => {
    const { ok } = await api('/api/admin/announce', { text: $('ann-text').value });
    toast(ok ? ($('ann-text').value ? 'Annonce publiée.' : 'Annonce retirée.') : 'Erreur.');
    $('ann-clear').hidden = !$('ann-text').value;
});
$('ann-clear').addEventListener('click', async () => {
    const { ok } = await api('/api/admin/announce', { text: '' });
    if (!ok) return toast('Erreur.');
    $('ann-text').value = '';
    $('ann-clear').hidden = true;
    toast('Annonce retirée.');
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
        <button class="ds-row" data-p="${esc(u.pseudo)}">
            <span class="acc-avatar-bubble">${u.avatarPhoto ? `<img src="${u.avatarPhoto}" alt="">` : esc(u.avatar || '✦')}</span>
            <span class="ds-row-main">
                <span class="ds-row-name">${esc(u.pseudo)}${u.online ? ' <i class="badge online">🟢 en ligne</i>' : ''}${u.admin ? ' <i class="badge adm">admin</i>' : ''}${u.banned ? ' <i class="badge ban">suspendu</i>' : ''}</span>
                <span class="ds-row-sub">inscrit ${fmtDate(u.created)} · vu ${fmtAgo(u.lastSeen)}</span>
            </span>
            <span class="ds-row-go">›</span>
        </button>`).join('') : '<p class="empty">Aucun compte trouvé.</p>';
    $('acc-list').querySelectorAll('.ds-row').forEach(b => b.addEventListener('click', () => openAccount(b.dataset.p)));
}

async function openAccount(pseudo) {
    const { ok, data } = await api('/api/admin/account?pseudo=' + encodeURIComponent(pseudo));
    if (!ok) return toast(data.error || 'Erreur');
    $('acc-name').innerHTML = `${data.avatarPhoto ? `<img class="acc-avatar-img" src="${data.avatarPhoto}" alt="">` : (data.avatar ? esc(data.avatar) + ' ' : '')}${esc(data.pseudo)}`;
    const mfs = data.motsfleches || {};
    const mo = data.motus || {}, mj = data.motjuste || {};
    const rows = [
        ['Statut', data.admin ? 'Administrateur' : (data.banned ? `Suspendu${data.bannedAt ? ' le ' + fmtDate(data.bannedAt) : ''}` : 'Actif')],
        ['Inscrit le', fmtDate(data.created)],
        ['Dernière présence', (data.online ? '🟢 en ligne maintenant · ' : '') + fmtAgo(data.lastSeen)],
        ['Code de récupération', data.hasRecovery ? 'défini' : 'aucun'],
        ['Mots fléchés', `${mfs.solved || 0} réussies · ${mfs.gaveUp || 0} abandons · ${mfs.daysPlayed || 0} jours`],
        ['Meilleur temps (Mots Fléchés)', mfs.best ? Math.floor(mfs.best / 60) + ':' + String(mfs.best % 60).padStart(2, '0') : '—'],
        ['Perudo', data.perudo ? `${data.perudo.wins} victoires / ${data.perudo.played} parties · ${data.perudo.rankPoints} pts` : 'jamais joué'],
        ['Motus', mo.started ? `${mo.solved} résolues · ${mo.gaveUp} ratées · meilleur ${mo.bestTries ?? '—'} essais` : 'jamais joué'],
        ['Le Mot Juste', mj.started ? `${mj.solved} résolues · ${mj.gaveUp} ratées · meilleur ${mj.bestTries ?? '—'} essais` : 'jamais joué'],
        ['Yams', data.yams ? `${data.yams.gamesWon} victoires / ${data.yams.gamesPlayed} parties · ${data.yams.totalYams} Yams · record ${data.yams.bestScore}` : 'jamais joué'],
        ['Motus Party', data.motusparty ? `${data.motusparty.matchesWon} courses gagnées / ${data.motusparty.matchesPlayed} jouées · ${data.motusparty.wordsFound} mots trouvés` : 'jamais joué'],
    ];
    $('acc-detail').innerHTML = rows.map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

    const acts = $('acc-acts'); acts.innerHTML = '';
    const add = (label, fn, danger) => {
        const b = document.createElement('button');
        b.className = 'btn' + (danger ? ' danger' : ' ghost');
        b.type = 'button'; b.textContent = label;
        b.addEventListener('click', fn);
        acts.appendChild(b);
    };
    if (data.perudo) add('Gérer le profil Perudo (stats, cosmétiques)', () => {
        $('ov-acc').hidden = true;
        openPerudoPlayer(data.pseudo);
    });
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
        add('Supprimer définitivement', () => ask('🗑️', 'Supprimer ?', `Le compte ${data.pseudo} et toutes ses données seront effacés. Cette action est irréversible. Pour confirmer, recopie exactement le pseudo ci-dessous.`, [
            { label: 'Supprimer ce compte', danger: true, run: async () => {
                const r = await api('/api/admin/account/delete', { pseudo: data.pseudo });
                toast(r.ok ? 'Compte supprimé.' : (r.data.error || 'Erreur'));
                if (r.ok) { $('ov-acc').hidden = true; loadAccounts(); }
            } }], null, data.pseudo), true);
    }
    $('ov-acc').hidden = false;
}
$('acc-close').addEventListener('click', () => { $('ov-acc').hidden = true; });

// ---------- Dictionnaire ----------
let dQ = '', dLen = 0, dLvl = 0, dOnly = '', dT = null, editing = null;

function segBind(id, attr, apply) {
    document.querySelectorAll('#' + id + ' button').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('#' + id + ' button').forEach(x => x.classList.toggle('on', x === b));
        apply(b.dataset[attr]);
        loadDict();
    }));
}
segBind('dict-len', 'len', v => { dLen = Number(v) || 0; });
segBind('dict-lvl', 'level', v => { dLvl = Number(v) || 0; });
segBind('dict-only', 'only', v => { dOnly = v || ''; });
$('dict-q').addEventListener('input', () => { clearTimeout(dT); dT = setTimeout(() => { dQ = $('dict-q').value.trim(); loadDict(); }, 250); });

const LVL_NAME = { 1: 'courant', 2: 'moyen', 3: 'rare' };
async function loadDict() {
    const url = `/api/admin/dict?q=${encodeURIComponent(dQ)}&len=${dLen}&level=${dLvl}&only=${dOnly}`;
    const { data } = await api(url);
    const list = (data && data.words) || [];
    $('dict-count').textContent = list.length + ' mot(s) affiché(s) sur ' + (data.total || 0);
    $('dict-list').innerHTML = list.length ? list.map(w => `
        <button class="ds-row" data-m="${esc(w.m)}">
            <span class="ds-row-main">
                <span class="ds-row-name">${esc(w.m)}${w.custom ? ' <i class="badge adm">modifié</i>' : ''}</span>
                <span class="ds-row-sub">${esc(w.defs[0] || '')}${w.defs.length > 1 ? ' · +' + (w.defs.length - 1) : ''} — ${LVL_NAME[w.n]} · vu ${w.used}×</span>
            </span>
            <span class="ds-row-go">›</span>
        </button>`).join('') : '<p class="empty">Aucun mot trouvé.</p>';
    $('dict-list').querySelectorAll('.ds-row').forEach(b => b.addEventListener('click', () => openWord(b.dataset.m)));
}

async function loadDictStats() {
    const { data } = await api('/api/admin/dict/stats');
    if (!data || data.total == null) return;
    $('dict-stats').innerHTML = [
        ['📖', data.total, 'mots'],
        ['💬', data.defs, 'définitions'],
        ['✏️', data.custom, 'ajoutés / modifiés'],
        ['🚫', data.removed, 'retirés'],
        ['💤', data.never, 'jamais sortis'],
        ['🔁', (data.top[0] ? data.top[0].m + ' (' + data.top[0].c + '×)' : '—'), 'le plus vu'],
    ].map(([i, v, l]) => `<div class="stat"><span class="s-ico">${i}</span><b>${v}</b><em>${l}</em></div>`).join('');
}

function setLevelButtons(n) {
    document.querySelectorAll('#w-level button').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === n));
}
function currentLevel() {
    const b = document.querySelector('#w-level button.on');
    return b ? Number(b.dataset.n) : 1;
}
document.querySelectorAll('#w-level button').forEach(b => b.addEventListener('click', () => setLevelButtons(Number(b.dataset.n))));

$('dict-new').addEventListener('click', () => {
    editing = null;
    $('w-title').textContent = 'Nouveau mot';
    $('w-info').textContent = '3 à 8 lettres, sans accent ni espace.';
    $('w-mot').value = ''; $('w-mot').disabled = false;
    $('w-defs').value = ''; $('w-err').textContent = '';
    setLevelButtons(1);
    $('w-del').hidden = true; $('w-restore').hidden = true;
    $('ov-word').hidden = false;
    $('w-mot').focus();
});

async function openWord(m) {
    const { ok, data } = await api('/api/admin/dict/word?m=' + encodeURIComponent(m));
    if (!ok) return toast(data.error || 'Erreur');
    const w = data.word;
    editing = w.m;
    $('w-title').textContent = w.m;
    $('w-info').textContent = `${w.m.length} lettres · utilisé ${w.used}× dans les grilles` + (w.inBase ? ' · présent dans le dictionnaire de base' : ' · ajouté par toi');
    $('w-mot').value = w.m; $('w-mot').disabled = true;
    $('w-defs').value = (w.defs || []).join('\n');
    $('w-err').textContent = '';
    setLevelButtons(w.n);
    $('w-del').hidden = false;
    $('w-restore').hidden = !w.custom;
    $('ov-word').hidden = false;
}
$('w-close').addEventListener('click', () => { $('ov-word').hidden = true; });

$('w-save').addEventListener('click', async () => {
    const m = $('w-mot').value.trim().toUpperCase();
    const defs = $('w-defs').value.split('\n').map(s => s.trim()).filter(Boolean);
    const n = currentLevel();
    $('w-err').textContent = '';
    const { ok, data } = await api('/api/admin/dict/save', { m, defs, n, edit: !!editing });
    if (!ok) { $('w-err').textContent = data.error || 'Erreur.'; return; }
    $('ov-word').hidden = true;
    toast(editing ? 'Mot modifié.' : 'Mot ajouté.');
    loadDict(); loadDictStats();
});

$('w-del').addEventListener('click', () => {
    const m = editing;
    ask('🚫', 'Retirer du jeu ?', `« ${m} » ne sortira plus dans les grilles. Tu pourras l'annuler plus tard.`, [
        { label: 'Confirmer', danger: true, run: async () => {
            const r = await api('/api/admin/dict/delete', { m });
            toast(r.ok ? 'Mot retiré.' : (r.data.error || 'Erreur'));
            $('ov-word').hidden = true; loadDict(); loadDictStats();
        } }]);
});

$('w-restore').addEventListener('click', () => {
    const m = editing;
    ask('↩️', 'Annuler tes modifications ?', `« ${m} » reviendra à sa version d'origine du dictionnaire.`, [
        { label: 'Confirmer', run: async () => {
            const r = await api('/api/admin/dict/restore', { m });
            toast(r.ok ? 'Modifications annulées.' : (r.data.error || 'Erreur'));
            $('ov-word').hidden = true; loadDict(); loadDictStats();
        } }]);
});

// ---------- Perudo ----------
const PD_AVATARS = ['', 'pirate', 'crane', 'perroquet', 'ancre', 'kraken', 'requin', 'epees', 'boussole', 'couronne', 'rhum', 'navire', 'tresor'];
const PD_FRAMES = ['', 'or', 'argent', 'bronze', 'os', 'corde', 'emeraude', 'rubis', 'royal'];
const PD_BANNERS = ['', 'ocean', 'coucher', 'nuit', 'tempete', 'jungle', 'or', 'sang', 'abysse'];
function fillSelect(id, values, cur) {
    $(id).innerHTML = values.map(v => `<option value="${v}"${v === cur ? ' selected' : ''}>${v || '— aucun —'}</option>`).join('');
}
let pdEditing = null;

async function loadPerudo() {
    const { data } = await api('/api/admin/perudo/overview');
    if (!data || !data.available) { $('pd-games').innerHTML = '<p class="empty">Perudo indisponible.</p>'; return; }
    const g = data.games || [];
    $('pd-games').innerHTML = g.length ? g.map(x => `
        <div class="ds-row static">
            <span class="ds-row-main">
                <span class="ds-row-name">${esc(x.id)}${x.vsBot ? ' <i class="badge adm">bot</i>' : ''}${x.isDuo ? ' <i class="badge adm">duo</i>' : ''}</span>
                <span class="ds-row-sub">${x.started ? 'en cours' : 'en attente'} · ${x.players.map(p => esc(p.pseudo) + (p.isBot ? '🤖' : '') + ' (' + p.dice + ')').join(', ')}</span>
            </span>
            <button class="mini danger" data-end="${esc(x.id)}" type="button">Clore</button>
        </div>`).join('') : '<p class="empty">Aucune partie en cours.</p>';
    $('pd-games').querySelectorAll('[data-end]').forEach(b => b.addEventListener('click', () => {
        ask('🛑', 'Clore la partie ?', 'Les joueurs seront renvoyés au lobby.', [
            { label: 'Confirmer', danger: true, run: async () => { await api('/api/admin/perudo/endgame', { id: b.dataset.end }); toast('Partie close.'); loadPerudo(); } }]);
    }));

    const on = data.online || [];
    $('pd-online').innerHTML = on.length ? on.map(o => `
        <div class="ds-row static">
            <span class="ds-row-main"><span class="ds-row-name">${esc(o.pseudo)}</span></span>
            <button class="mini" data-kick="${esc(o.sid)}" data-p="${esc(o.pseudo)}" type="button">Déconnecter</button>
        </div>`).join('') : '<p class="empty">Personne en ligne.</p>';
    $('pd-online').querySelectorAll('[data-kick]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/perudo/kick', { sid: b.dataset.kick, pseudo: b.dataset.p });
        toast('Joueur déconnecté.'); loadPerudo();
    }));

    const top = data.topPlayers || [];
    $('pd-top').innerHTML = top.length ? top.map((u, i) => `
        <button class="ds-row" data-p="${esc(u.pseudo)}">
            <span class="ds-row-main">
                <span class="ds-row-name">${i + 1}. ${esc(u.pseudo)}</span>
                <span class="ds-row-sub">${u.rankPoints} pts · ${u.wins} victoires / ${u.played} parties</span>
            </span><span class="ds-row-go">›</span>
        </button>`).join('') : '<p class="empty">Aucun joueur.</p>';
    $('pd-top').querySelectorAll('.ds-row').forEach(b => b.addEventListener('click', () => openPerudoPlayer(b.dataset.p)));
}

async function openPerudoPlayer(pseudo) {
    const { ok, data } = await api('/api/admin/perudo/player?pseudo=' + encodeURIComponent(pseudo));
    if (!ok) return toast(data.error || 'Aucun profil Perudo');
    pdEditing = data.pseudo;
    $('pd-name').textContent = data.pseudo;
    $('pd-wins').value = data.wins; $('pd-played').value = data.played;
    $('pd-points').value = data.rankPoints; $('pd-streak').value = data.bestStreak;
    fillSelect('pd-avatar', PD_AVATARS, data.avatar);
    fillSelect('pd-frame', PD_FRAMES, data.frame);
    fillSelect('pd-banner', PD_BANNERS, data.banner);
    $('pd-color').value = data.nameColor || '#d4af37';
    $('pd-err').textContent = '';
    $('ov-pd').hidden = false;
}
$('pd-close').addEventListener('click', () => { $('ov-pd').hidden = true; });
$('pd-save').addEventListener('click', async () => {
    const p = pdEditing;
    const r1 = await api('/api/admin/perudo/stats', { pseudo: p, wins: $('pd-wins').value, played: $('pd-played').value, rankPoints: $('pd-points').value, bestStreak: $('pd-streak').value });
    const r2 = await api('/api/admin/perudo/cosmetics', { pseudo: p, avatar: $('pd-avatar').value, frame: $('pd-frame').value, banner: $('pd-banner').value, nameColor: $('pd-color').value });
    if (!r1.ok || !r2.ok) { $('pd-err').textContent = (r1.data.error || r2.data.error || 'Erreur.'); return; }
    $('ov-pd').hidden = true; toast('Profil mis à jour.'); loadPerudo();
});
$('pd-reset').addEventListener('click', () => {
    const p = pdEditing;
    ask('🗑️', 'Réinitialiser ?', `Toutes les stats Perudo de ${p} seront remises à zéro.`, [
        { label: 'Confirmer', danger: true, run: async () => {
            const r = await api('/api/admin/perudo/reset', { pseudo: p });
            toast(r.ok ? 'Profil réinitialisé.' : 'Erreur');
            $('ov-pd').hidden = true; loadPerudo();
        } }]);
});

// ---------- Grilles ----------
const LV_LABEL = { moyen: 'Moyen', difficile: 'Difficile', expert: 'Expert' };
function mmss(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

async function loadGrids() {
    const d = await api('/api/admin/mf/difficulty');
    const L = (d.data && d.data.levels) || {};
    $('gr-diff').innerHTML = Object.entries(L).map(([lv, v]) =>
        `<div class="kv-row"><span>${LV_LABEL[lv] || lv}</span><b>${v.solved}/${v.started} réussies (${v.rate}%) · moy ${v.avg ? mmss(v.avg) : '—'} · ${v.gaveUp} abandons</b></div>`).join('')
        || '<p class="empty">Pas encore de données.</p>';
    if (!$('gr-date').value) $('gr-date').value = new Date().toISOString().slice(0, 10);
    loadGridDay();
}
$('gr-date').addEventListener('change', loadGridDay);

async function loadGridDay() {
    const date = $('gr-date').value;
    const { data } = await api('/api/admin/mf/day?date=' + encodeURIComponent(date));
    const L = (data && data.levels) || {};
    $('gr-levels').innerHTML = Object.entries(L).map(([lv, v]) => `
        <div class="glv">
            <div class="glv-head"><b>${LV_LABEL[lv] || lv}</b>
                <span>${v.generated ? v.words + ' mots' : 'non générée'} · ${v.solved}/${v.started} réussies</span></div>
            ${v.wordList && v.wordList.length ? `<p class="glv-words">${v.wordList.map(esc).join(' · ')}</p>` : ''}
            <div class="glv-board">${v.board.length ? v.board.map((e, i) => `
                <div class="bd-row${e.susp ? ' susp' : ''}">
                    <span>${i + 1}. ${esc(e.u)}</span><b>${mmss(e.s)}</b>
                    <button class="mini" data-flag="${esc(e.u)}" data-lv="${lv}" type="button">${e.susp ? 'Valider' : 'Suspect'}</button>
                    <button class="mini danger" data-del="${esc(e.u)}" data-lv="${lv}" type="button">✕</button>
                </div>`).join('') : '<p class="empty">Aucun temps enregistré.</p>'}</div>
            <button class="mini wide" data-regen="${lv}" type="button">Régénérer cette grille</button>
        </div>`).join('');

    $('gr-levels').querySelectorAll('[data-flag]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/mf/board/flag', { date, level: b.dataset.lv, pseudo: b.dataset.flag });
        loadGridDay();
    }));
    $('gr-levels').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/mf/board/remove', { date, level: b.dataset.lv, pseudo: b.dataset.del });
        toast('Temps supprimé.'); loadGridDay();
    }));
    $('gr-levels').querySelectorAll('[data-regen]').forEach(b => b.addEventListener('click', () => {
        ask('♻️', 'Régénérer la grille ?', 'Une nouvelle grille sera tirée. Les progressions et le classement de cette grille seront effacés.', [
            { label: 'Confirmer', danger: true, run: async () => {
                await api('/api/admin/mf/regen', { date, level: b.dataset.regen });
                toast('Grille régénérée.'); loadGridDay();
            } }]);
    }));
    loadGridComments(date);
}

async function loadGridComments(date) {
    const { data } = await api('/api/admin/mf/comments?date=' + encodeURIComponent(date));
    const list = (data && data.comments) || [];
    $('gr-cmts').innerHTML = list.length ? list.map(c => `
        <div class="log-row"><span class="lg-a">${esc(c.u)}</span><span class="lg-t">${c.t}</span>
        <button class="mini danger" data-ts="${c.ts}" type="button">✕</button></div>`).join('')
        : '<p class="empty">Aucun message ce jour-là.</p>';
    $('gr-cmts').querySelectorAll('[data-ts]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/mf/comments/remove', { date, ts: Number(b.dataset.ts) });
        toast('Message supprimé.'); loadGridComments(date);
    }));
}

$('gr-next').addEventListener('click', async () => {
    $('gr-upcoming').innerHTML = '<p class="empty">Calcul en cours…</p>';
    const { data } = await api('/api/admin/mf/upcoming');
    const days = (data && data.days) || [];
    $('gr-upcoming').innerHTML = days.map(d => `
        <div class="log-row up"><span class="lg-a">${new Date(d.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        <span class="lg-t">${Object.entries(d.levels).map(([lv, v]) => (LV_LABEL[lv] || lv) + ' : ' + (v.error ? '⚠️' : v.words + ' mots')).join(' · ')}</span></div>`).join('');
});

// ---------- Motus ----------
async function loadMotus() {
    const d = await api('/api/admin/motus/difficulty');
    const v = d.data || {};
    $('mt-diff').innerHTML = `<div class="kv-row"><span>Sur 14 jours</span><b>${v.solved || 0}/${v.started || 0} trouvés (${v.rate || 0}%) · moy ${v.avgTries || 0} essais · ${v.lost || 0} échecs</b></div>`;
    if (!$('mt-date').value) $('mt-date').value = new Date().toISOString().slice(0, 10);
    loadMotusDay();
}
$('mt-date').addEventListener('change', loadMotusDay);

async function loadMotusDay() {
    const date = $('mt-date').value;
    const { data } = await api('/api/admin/motus/day?date=' + encodeURIComponent(date));
    if (!data) return;
    $('mt-word-box').innerHTML = `
        <div class="kv-row"><span>Mot du jour</span><b>${esc(data.word)} <i class="card-sub" style="font-style:normal">(${data.word.length} lettres)</i></b></div>
        ${data.definition ? `<div class="kv-row"><span>Définition</span><b>${esc(data.definition)}</b></div>` : ''}
        <div class="kv-row"><span>Parties</span><b>${data.started} commencées · ${data.solved} trouvées · ${data.lost} échouées</b></div>`;
    $('mt-board-box').innerHTML = (data.board || []).length ? data.board.map((e, i) => `
        <div class="bd-row${e.susp ? ' susp' : ''}">
            <span>${i + 1}. ${esc(e.u)}</span><b>${e.tries} essai${e.tries > 1 ? 's' : ''}</b>
            <button class="mini" data-flag="${esc(e.u)}" type="button">${e.susp ? 'Valider' : 'Suspect'}</button>
            <button class="mini danger" data-del="${esc(e.u)}" type="button">✕</button>
        </div>`).join('') : '<p class="empty">Aucun score aujourd\u2019hui.</p>';
    $('mt-board-box').querySelectorAll('[data-flag]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/motus/board/flag', { date, pseudo: b.dataset.flag });
        loadMotusDay();
    }));
    $('mt-board-box').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/motus/board/remove', { date, pseudo: b.dataset.del });
        toast('Score supprimé.'); loadMotusDay();
    }));
    loadMotusComments(date);
}

async function loadMotusComments(date) {
    const { data } = await api('/api/admin/motus/comments?date=' + encodeURIComponent(date));
    const list = (data && data.comments) || [];
    $('mt-cmts').innerHTML = list.length ? list.map(c => `
        <div class="log-row"><span class="lg-a">${esc(c.u)}</span><span class="lg-t">${c.t}</span>
        <button class="mini danger" data-ts="${c.ts}" type="button">✕</button></div>`).join('')
        : '<p class="empty">Aucun message ce jour-là.</p>';
    $('mt-cmts').querySelectorAll('[data-ts]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/motus/comments/remove', { date, ts: Number(b.dataset.ts) });
        toast('Message supprimé.'); loadMotusComments(date);
    }));
}

$('mt-regen').addEventListener('click', () => {
    const date = $('mt-date').value;
    ask('♻️', 'Régénérer le mot ?', 'Un nouveau mot sera tiré. Les parties en cours ce jour-là et le classement seront effacés.', [
        { label: 'Confirmer', danger: true, run: async () => {
            await api('/api/admin/motus/regen', { date });
            toast('Mot régénéré.'); loadMotusDay();
        } }]);
});

$('mt-next').addEventListener('click', async () => {
    $('mt-upcoming').innerHTML = '<p class="empty">Calcul en cours…</p>';
    const { data } = await api('/api/admin/motus/upcoming');
    const days = (data && data.days) || [];
    $('mt-upcoming').innerHTML = days.map(d => `
        <div class="log-row up"><span class="lg-a">${new Date(d.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        <span class="lg-t">${esc(d.word)} <i class="card-sub" style="font-style:normal">(${d.word.length})</i></span></div>`).join('');
});

// ---------- Le Mot Juste ----------
async function loadMotJuste() {
    const d = await api('/api/admin/motjuste/difficulty');
    const v = d.data || {};
    $('mj-diff').innerHTML = `<div class="kv-row"><span>Sur 14 jours</span><b>${v.solved || 0}/${v.started || 0} trouvés (${v.rate || 0}%) · moy ${v.avgGuesses || 0} mots essayés</b></div>`;
    if (!$('mj-date').value) $('mj-date').value = new Date().toISOString().slice(0, 10);
    loadMotJusteDay();
    loadMotJusteVocab();
}
$('mj-date').addEventListener('change', loadMotJusteDay);

async function loadMotJusteDay() {
    const date = $('mj-date').value;
    const { data } = await api('/api/admin/motjuste/day?date=' + encodeURIComponent(date));
    if (!data) return;
    $('mj-word-box').innerHTML = `
        <div class="kv-row"><span>Mot du jour</span><b>${esc(data.word)}</b></div>
        <div class="kv-row"><span>Parties</span><b>${data.started} commencées · ${data.solved} trouvées</b></div>`;
    $('mj-neighbors-box').innerHTML = '<p class="card-sub" style="margin-top:10px">Mots les plus proches (repère admin) :</p>' +
        (data.neighbors || []).map(n => `<span class="chip mini" style="display:inline-block;margin:2px">${esc(n.m)} ${n.score > 0 ? '+' : ''}${n.score.toFixed(1)}</span>`).join(' ');
    $('mj-board-box').innerHTML = (data.board || []).length ? data.board.map((e, i) => `
        <div class="bd-row${e.susp ? ' susp' : ''}">
            <span>${i + 1}. ${esc(e.u)}</span><b>${e.guesses} mot${e.guesses > 1 ? 's' : ''}</b>
            <button class="mini" data-flag="${esc(e.u)}" type="button">${e.susp ? 'Valider' : 'Suspect'}</button>
            <button class="mini danger" data-del="${esc(e.u)}" type="button">✕</button>
        </div>`).join('') : '<p class="empty">Aucun score aujourd\u2019hui.</p>';
    $('mj-board-box').querySelectorAll('[data-flag]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/motjuste/board/flag', { date, pseudo: b.dataset.flag });
        loadMotJusteDay();
    }));
    $('mj-board-box').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/motjuste/board/remove', { date, pseudo: b.dataset.del });
        toast('Score supprimé.'); loadMotJusteDay();
    }));
    loadMotJusteComments(date);
}

async function loadMotJusteComments(date) {
    const { data } = await api('/api/admin/motjuste/comments?date=' + encodeURIComponent(date));
    const list = (data && data.comments) || [];
    $('mj-cmts').innerHTML = list.length ? list.map(c => `
        <div class="log-row"><span class="lg-a">${esc(c.u)}</span><span class="lg-t">${c.t}</span>
        <button class="mini danger" data-ts="${c.ts}" type="button">✕</button></div>`).join('')
        : '<p class="empty">Aucun message ce jour-là.</p>';
    $('mj-cmts').querySelectorAll('[data-ts]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/motjuste/comments/remove', { date, ts: Number(b.dataset.ts) });
        toast('Message supprimé.'); loadMotJusteComments(date);
    }));
}

$('mj-regen').addEventListener('click', () => {
    const date = $('mj-date').value;
    ask('♻️', 'Régénérer le mot ?', 'Un nouveau mot sera tiré. Les parties en cours ce jour-là et le classement seront effacés.', [
        { label: 'Confirmer', danger: true, run: async () => {
            await api('/api/admin/motjuste/regen', { date });
            toast('Mot régénéré.'); loadMotJusteDay();
        } }]);
});

$('mj-next').addEventListener('click', async () => {
    $('mj-upcoming').innerHTML = '<p class="empty">Calcul en cours…</p>';
    const { data } = await api('/api/admin/motjuste/upcoming');
    const days = (data && data.days) || [];
    $('mj-upcoming').innerHTML = days.map(d => `
        <div class="log-row up"><span class="lg-a">${new Date(d.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        <span class="lg-t">${esc(d.word)}</span></div>`).join('');
});

// Vocabulaire
let mjVocabT = null;
$('mj-vocab-q').addEventListener('input', () => { clearTimeout(mjVocabT); mjVocabT = setTimeout(loadMotJusteVocab, 250); });
async function loadMotJusteVocab() {
    const q = $('mj-vocab-q').value.trim();
    const { data } = await api('/api/admin/motjuste/vocab?q=' + encodeURIComponent(q));
    if (!data) return;
    $('mj-vocab-count').textContent = data.count;
    $('mj-vocab-list').innerHTML = (data.words || []).map(w => `
        <div class="ds-row static">
            <span class="ds-row-main"><span class="ds-row-name">${esc(w.m)}${w.custom ? ' <i class="badge adm">ajouté</i>' : ''}</span></span>
            ${w.custom ? `<button class="mini danger" data-rm="${esc(w.m)}" type="button">Retirer</button>` : ''}
        </div>`).join('') || '<p class="empty">Aucun résultat.</p>';
    $('mj-vocab-list').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
        ask('🗑️', 'Retirer ce mot ?', `« ${b.dataset.rm} » ne sera plus reconnu comme mot secret ni comme tentative valide.`, [
            { label: 'Confirmer', danger: true, run: async () => {
                const r = await api('/api/admin/motjuste/vocab/remove', { word: b.dataset.rm });
                toast(r.ok ? 'Mot retiré.' : (r.data.error || 'Erreur')); loadMotJusteVocab();
            } }]);
    }));
}
$('mj-vocab-add').addEventListener('click', async () => {
    const word = $('mj-new-word').value.trim();
    const like = $('mj-new-like').value.trim();
    if (!word || !like) return toast('Renseigne les deux champs.');
    const { ok, data } = await api('/api/admin/motjuste/vocab/add', { word, like });
    if (!ok) return toast(data.error || 'Erreur');
    $('mj-new-word').value = ''; $('mj-new-like').value = '';
    toast('Mot ajouté au vocabulaire.'); loadMotJusteVocab();
});

// ---------- Petit Bac ----------
async function loadPbac() {
    const { data } = await api('/api/admin/pbac/overview');
    if (!data || !data.available) {
        $('pbac-live').innerHTML = '<div class="kv-row"><span>Statut</span><b>indisponible</b></div>';
        $('pbac-tables').innerHTML = '';
        return;
    }
    $('pbac-live').innerHTML = `<div class="kv-row"><span>Joueurs connectés</span><b>${data.online.length}</b></div>
        <div class="kv-row"><span>Tables actives</span><b>${data.tables.length}</b></div>`;
    $('pbac-tables').innerHTML = data.tables.length ? data.tables.map(t => `
        <div class="ds-row static">
            <span class="ds-row-main">
                <span class="ds-row-name">Table de ${esc(t.host)} <i class="badge adm">${esc(t.status)}</i></span>
                <span class="ds-row-sub">${t.players.map(esc).join(', ') || 'aucun joueur'}</span>
            </span>
            <button class="mini danger" data-close="${esc(t.id)}" type="button">Fermer</button>
        </div>`).join('') : '<p class="empty">Aucune table active.</p>';
    $('pbac-tables').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
        ask('🛑', 'Fermer cette table ?', 'Les joueurs seront renvoyés au salon des parties.', [
            { label: 'Confirmer', danger: true, run: async () => {
                await api('/api/admin/pbac/close', { id: b.dataset.close });
                toast('Table fermée.'); loadPbac();
            } }]);
    }));
}
$('pbac-refresh').addEventListener('click', loadPbac);

// ---------- Infiltré ----------
async function loadUndercover() {
    const { data } = await api('/api/admin/undercover/overview');
    if (!data || !data.available) { $('uc-games').innerHTML = '<p class="empty">Infiltré indisponible.</p>'; $('uc-online').innerHTML = ''; return; }
    const g = data.games || [];
    $('uc-games').innerHTML = g.length ? g.map(x => `
        <div class="ds-row static">
            <span class="ds-row-main">
                <span class="ds-row-name">Partie de ${esc(x.host)} <i class="badge adm">${esc(x.status)}</i></span>
                <span class="ds-row-sub">${x.players.map(esc).join(', ') || 'aucun joueur'}</span>
            </span>
            <button class="mini danger" data-close="${esc(x.id)}" type="button">Fermer</button>
        </div>`).join('') : '<p class="empty">Aucune partie en cours.</p>';
    $('uc-games').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
        ask('🛑', 'Fermer cette partie ?', 'Les joueurs seront renvoyés au salon des parties.', [
            { label: 'Confirmer', danger: true, run: async () => {
                await api('/api/admin/undercover/close', { id: b.dataset.close });
                toast('Partie fermée.'); loadUndercover();
            } }]);
    }));
    const on = data.online || [];
    $('uc-online').innerHTML = on.length ? on.map(p => `
        <div class="ds-row static"><span class="ds-row-main"><span class="ds-row-name">${esc(p)}</span></span></div>`).join('')
        : '<p class="empty">Personne en ligne.</p>';
}

// ---------- Yams ----------
async function loadYams() {
    const { data } = await api('/api/admin/yams/overview');
    if (!data || !data.available) { $('ym-games').innerHTML = '<p class="empty">Yams indisponible.</p>'; $('ym-online').innerHTML = ''; $('ym-top').innerHTML = ''; return; }
    const g = data.games || [];
    $('ym-games').innerHTML = g.length ? g.map(x => `
        <div class="ds-row static">
            <span class="ds-row-main">
                <span class="ds-row-name">Table de ${esc(x.host)} <i class="badge adm">${esc(x.status)}</i></span>
                <span class="ds-row-sub">${x.players.map(esc).join(', ') || 'aucun joueur'}</span>
            </span>
            <button class="mini danger" data-close="${esc(x.id)}" type="button">Fermer</button>
        </div>`).join('') : '<p class="empty">Aucune partie en cours.</p>';
    $('ym-games').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
        ask('🛑', 'Fermer cette table ?', 'Les joueurs seront renvoyés au salon des parties.', [
            { label: 'Confirmer', danger: true, run: async () => {
                await api('/api/admin/yams/close', { id: b.dataset.close });
                toast('Table fermée.'); loadYams();
            } }]);
    }));
    const on = data.online || [];
    $('ym-online').innerHTML = on.length ? on.map(p => `
        <div class="ds-row static"><span class="ds-row-main"><span class="ds-row-name">${esc(p)}</span></span></div>`).join('')
        : '<p class="empty">Personne en ligne.</p>';
    const top = data.leaderboard || [];
    $('ym-top').innerHTML = top.length ? top.map((u, i) => `
        <div class="ds-row static">
            <span class="ds-row-main">
                <span class="ds-row-name">${i + 1}. ${esc(u.pseudo)}</span>
                <span class="ds-row-sub">${u.gamesWon} victoires / ${u.gamesPlayed} parties · ${u.totalYams} Yams · record ${u.bestScore}</span>
            </span>
        </div>`).join('') : '<p class="empty">Personne n\u2019a encore terminé de partie.</p>';
}

// ---------- Motus Party ----------
async function loadMotusParty() {
    const { data } = await api('/api/admin/motusparty/overview');
    if (!data || !data.available) { $('mp-games').innerHTML = '<p class="empty">Motus Party indisponible.</p>'; $('mp-online').innerHTML = ''; $('mp-top').innerHTML = ''; return; }
    const g = data.games || [];
    $('mp-games').innerHTML = g.length ? g.map(x => `
        <div class="ds-row static">
            <span class="ds-row-main">
                <span class="ds-row-name">Course de ${esc(x.host)} <i class="badge adm">${esc(x.status)}</i></span>
                <span class="ds-row-sub">${x.players.map(esc).join(', ') || 'aucun joueur'}</span>
            </span>
            <button class="mini danger" data-close="${esc(x.id)}" type="button">Fermer</button>
        </div>`).join('') : '<p class="empty">Aucune course en cours.</p>';
    $('mp-games').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
        ask('🛑', 'Fermer cette course ?', 'Les joueurs seront renvoyés au salon des parties.', [
            { label: 'Confirmer', danger: true, run: async () => {
                await api('/api/admin/motusparty/close', { id: b.dataset.close });
                toast('Course fermée.'); loadMotusParty();
            } }]);
    }));
    const on = data.online || [];
    $('mp-online').innerHTML = on.length ? on.map(p => `
        <div class="ds-row static"><span class="ds-row-main"><span class="ds-row-name">${esc(p)}</span></span></div>`).join('')
        : '<p class="empty">Personne en ligne.</p>';
    const top = data.leaderboard || [];
    $('mp-top').innerHTML = top.length ? top.map((u, i) => `
        <div class="ds-row static">
            <span class="ds-row-main">
                <span class="ds-row-name">${i + 1}. ${esc(u.pseudo)}</span>
                <span class="ds-row-sub">${u.matchesWon} courses gagnées / ${u.matchesPlayed} jouées · ${u.wordsFound} mots trouvés</span>
            </span>
        </div>`).join('') : '<p class="empty">Personne n\u2019a encore terminé de course.</p>';
}

// ---------- Administrateurs ----------
async function loadAdmins() {
    const { data } = await api('/api/admin/admins');
    if (!data || !data.all) return;
    $('sys-admins').innerHTML = data.all.map(p => {
        const root = (data.root || []).includes(p);
        return `<div class="ds-row static">
            <span class="ds-row-main"><span class="ds-row-name">${esc(p)}${root ? ' <i class="badge adm">principal</i>' : ''}</span></span>
            ${root || p === data.you ? '' : `<button class="mini danger" data-rm="${esc(p)}" type="button">Retirer</button>`}
        </div>`;
    }).join('');
    $('sys-admins').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
        ask('🛡️', 'Retirer les droits ?', `${b.dataset.rm} n'aura plus accès à l'administration.`, [
            { label: 'Confirmer', danger: true, run: async () => {
                const r = await api('/api/admin/admins/remove', { pseudo: b.dataset.rm });
                toast(r.ok ? 'Droits retirés.' : (r.data.error || 'Erreur')); loadAdmins();
            } }]);
    }));
}
$('adm-add').addEventListener('click', async () => {
    const pseudo = $('adm-new').value.trim();
    if (!pseudo) return;
    const { ok, data } = await api('/api/admin/admins/add', { pseudo });
    if (!ok) return toast(data.error || 'Erreur');
    $('adm-new').value = ''; toast('Administrateur ajouté.'); loadAdmins();
});

// ---------- Système ----------
$('sys-purge').addEventListener('click', () => ask('🧹', 'Lancer le ménage ?', 'Les données trop anciennes seront supprimées définitivement.', [
    { label: 'Confirmer', run: async () => {
        const r = await api('/api/admin/purge', {});
        toast(r.ok ? 'Ménage terminé — ' + r.data.keys + ' clés restantes.' : 'Erreur');
        loadOverview();
    } }]));

loadOverview();
setInterval(() => { if (!$('pane-home').hidden) loadOverview(); }, 30000);