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
$('ad-select').addEventListener('change', () => {
    const tab = $('ad-select').value;
    ['home', 'accounts', 'perudo', 'grids', 'motus', 'dict', 'system'].forEach(p => { $('pane-' + p).hidden = (p !== tab); });
    if (tab === 'accounts') loadAccounts();
    if (tab === 'perudo') loadPerudo();
    if (tab === 'grids') loadGrids();
    if (tab === 'motus') loadMotus();
    if (tab === 'dict') { loadDictStats(); loadDict(); }
    if (tab === 'system') { loadOverview(); loadAdmins(); }
    window.scrollTo(0, 0);
});

// ---------- Boîte générique ----------
function ask(emoji, title, sub, actions, code, confirmText) {
    $('ask-emoji').textContent = emoji;
    $('ask-title').textContent = title;
    $('ask-sub').textContent = sub || '';
    const cb = $('ask-code');
    if (code) { cb.textContent = code; cb.hidden = false; } else cb.hidden = true;
    const inp = $('ask-input');
    inp.value = '';
    if (confirmText) { inp.placeholder = confirmText; inp.hidden = false; } else inp.hidden = true;
    const box = $('ask-acts'); box.innerHTML = '';
    (actions || []).forEach(a => {
        const b = document.createElement('button');
        b.className = 'btn' + (a.danger ? ' danger' : '');
        b.type = 'button'; b.textContent = a.label;
        if (confirmText) {
            b.disabled = true;
            inp.addEventListener('input', () => { b.disabled = (inp.value.trim() !== confirmText); });
        }
        b.addEventListener('click', () => { $('ov-ask').hidden = true; a.run(); });
        box.appendChild(b);
    });
    $('ov-ask').hidden = false;
    if (confirmText) setTimeout(() => inp.focus(), 80);
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
    $('ann-clear').hidden = !data.announce;
    $('sys-info').innerHTML = [
        ['Stockage', data.storage],
        ['Clés mots fléchés', data.mfKeys],
        ['Mémoire utilisée', data.memory + ' Mo'],
        ['En ligne depuis', fmtDur(data.uptime)],
        ['Administrateurs', (data.admins || []).join(', ')],
    ].map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    loadLog();
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
        ['Perudo', data.perudo ? `${data.perudo.wins} victoires / ${data.perudo.played} parties · ${data.perudo.rankPoints} pts` : 'jamais joué'],
    ].map(([k, v]) => `<div class="kv-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

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
        <button class="row" data-m="${esc(w.m)}">
            <span class="r-main">
                <span class="r-name">${esc(w.m)}${w.custom ? ' <i class="badge adm">modifié</i>' : ''}</span>
                <span class="r-sub">${esc(w.defs[0] || '')}${w.defs.length > 1 ? ' · +' + (w.defs.length - 1) : ''} — ${LVL_NAME[w.n]} · vu ${w.used}×</span>
            </span>
            <span class="r-go">›</span>
        </button>`).join('') : '<p class="empty">Aucun mot trouvé.</p>';
    $('dict-list').querySelectorAll('.row').forEach(b => b.addEventListener('click', () => openWord(b.dataset.m)));
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
        <div class="row static">
            <span class="r-main">
                <span class="r-name">${esc(x.id)}${x.vsBot ? ' <i class="badge adm">bot</i>' : ''}${x.isDuo ? ' <i class="badge adm">duo</i>' : ''}</span>
                <span class="r-sub">${x.started ? 'en cours' : 'en attente'} · ${x.players.map(p => esc(p.pseudo) + (p.isBot ? '🤖' : '') + ' (' + p.dice + ')').join(', ')}</span>
            </span>
            <button class="mini danger" data-end="${esc(x.id)}" type="button">Clore</button>
        </div>`).join('') : '<p class="empty">Aucune partie en cours.</p>';
    $('pd-games').querySelectorAll('[data-end]').forEach(b => b.addEventListener('click', () => {
        ask('🛑', 'Clore la partie ?', 'Les joueurs seront renvoyés au lobby.', [
            { label: 'Confirmer', danger: true, run: async () => { await api('/api/admin/perudo/endgame', { id: b.dataset.end }); toast('Partie close.'); loadPerudo(); } }]);
    }));

    const on = data.online || [];
    $('pd-online').innerHTML = on.length ? on.map(o => `
        <div class="row static">
            <span class="r-main"><span class="r-name">${esc(o.pseudo)}</span></span>
            <button class="mini" data-kick="${esc(o.sid)}" data-p="${esc(o.pseudo)}" type="button">Déconnecter</button>
        </div>`).join('') : '<p class="empty">Personne en ligne.</p>';
    $('pd-online').querySelectorAll('[data-kick]').forEach(b => b.addEventListener('click', async () => {
        await api('/api/admin/perudo/kick', { sid: b.dataset.kick, pseudo: b.dataset.p });
        toast('Joueur déconnecté.'); loadPerudo();
    }));

    const top = data.topPlayers || [];
    $('pd-top').innerHTML = top.length ? top.map((u, i) => `
        <button class="row" data-p="${esc(u.pseudo)}">
            <span class="r-main">
                <span class="r-name">${i + 1}. ${esc(u.pseudo)}</span>
                <span class="r-sub">${u.rankPoints} pts · ${u.wins} victoires / ${u.played} parties</span>
            </span><span class="r-go">›</span>
        </button>`).join('') : '<p class="empty">Aucun joueur.</p>';
    $('pd-top').querySelectorAll('.row').forEach(b => b.addEventListener('click', () => openPerudoPlayer(b.dataset.p)));
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
        <div class="kv-row"><span>Mot du jour</span><b>${esc(data.word)}</b></div>
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
        <span class="lg-t">${esc(d.word)}</span></div>`).join('');
});

// ---------- Administrateurs ----------
async function loadAdmins() {
    const { data } = await api('/api/admin/admins');
    if (!data || !data.all) return;
    $('sys-admins').innerHTML = data.all.map(p => {
        const root = (data.root || []).includes(p);
        return `<div class="row static">
            <span class="r-main"><span class="r-name">${esc(p)}${root ? ' <i class="badge adm">principal</i>' : ''}</span></span>
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