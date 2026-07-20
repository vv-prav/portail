// =====================================================================
//  RECETTES — carnet partagé du cercle (client)
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- i18n (clé partagée avec tout le portail) ----------
const I18N = {
    fr: {
        title: 'Recettes', search_ph: 'Chercher une recette…',
        all: 'Toutes', empty: 'Aucune recette ne correspond.', empty_first: 'Le carnet est vide — ajoute la première recette du cercle ! 🍽️',
        count_one: 'recette partagée', count_many: 'recettes partagées',
        cat_entree: 'Entrée', cat_plat: 'Plat', cat_dessert: 'Dessert', cat_apero: 'Apéro', cat_boisson: 'Boisson',
        diff_facile: 'Facile', diff_moyen: 'Moyen', diff_difficile: 'Difficile',
        tag_vege: '🌱 Végé', 'tag_vegan': '🌿 Vegan', 'tag_sans-gluten': '🌾 Sans gluten',
        tag_rapide: '⚡ Rapide', 'tag_sans-cuisson': '❄️ Sans cuisson', tag_epice: '🌶️ Épicé',
        min: 'min', pers: 'pers.', by: 'par', steps_count: 'étapes',
        form_new: 'Nouvelle recette', form_edit: 'Modifier la recette',
        f_title: 'Titre', f_title_ph: 'Tarte aux pommes de Mamie…',
        f_cat: 'Catégorie', f_diff: 'Difficulté', f_time: 'Temps (min)', f_serv: 'Personnes',
        f_tags: 'Étiquettes', f_photo: 'Photo', f_photo_add: 'Ajouter une photo', f_photo_del: 'Retirer la photo',
        f_ing: 'Ingrédients', f_ing_add: 'Ajouter un ingrédient', f_steps: 'Étapes', f_step_add: 'Ajouter une étape',
        f_save: 'Enregistrer la recette', f_saving: 'Enregistrement…',
        ph_ing: 'Ingrédient', ph_qty: 'Qté', ph_unit: 'Unité', ph_step: 'Décris cette étape…',
        err_title: 'Donne au moins un titre à ta recette.',
        d_ing: 'Ingrédients', d_ing_hint: 'Touche un ingrédient pour le cocher pendant que tu cuisines.',
        d_steps: 'Préparation', edit: '✏️ Modifier', del: '🗑️ Supprimer',
        ask_del: 'Supprimer cette recette ?', ask_del_sub: 'Elle disparaîtra pour tout le monde.',
        ask_yes: 'Oui, supprimer', cancel: 'Annuler',
        saved: 'Recette enregistrée ! 🍽️', deleted: 'Recette supprimée.', photo_err: 'Photo illisible, réessaie.',
    },
    en: {
        title: 'Recipes', search_ph: 'Search a recipe…',
        all: 'All', empty: 'No recipe matches.', empty_first: 'The book is empty — add the first recipe! 🍽️',
        count_one: 'shared recipe', count_many: 'shared recipes',
        cat_entree: 'Starter', cat_plat: 'Main', cat_dessert: 'Dessert', cat_apero: 'Snacks', cat_boisson: 'Drink',
        diff_facile: 'Easy', diff_moyen: 'Medium', diff_difficile: 'Hard',
        tag_vege: '🌱 Veggie', tag_vegan: '🌿 Vegan', 'tag_sans-gluten': '🌾 Gluten-free',
        tag_rapide: '⚡ Quick', 'tag_sans-cuisson': '❄️ No-cook', tag_epice: '🌶️ Spicy',
        min: 'min', pers: 'ppl', by: 'by', steps_count: 'steps',
        form_new: 'New recipe', form_edit: 'Edit recipe',
        f_title: 'Title', f_title_ph: "Granny's apple pie…",
        f_cat: 'Category', f_diff: 'Difficulty', f_time: 'Time (min)', f_serv: 'Servings',
        f_tags: 'Tags', f_photo: 'Photo', f_photo_add: 'Add a photo', f_photo_del: 'Remove photo',
        f_ing: 'Ingredients', f_ing_add: 'Add an ingredient', f_steps: 'Steps', f_step_add: 'Add a step',
        f_save: 'Save recipe', f_saving: 'Saving…',
        ph_ing: 'Ingredient', ph_qty: 'Qty', ph_unit: 'Unit', ph_step: 'Describe this step…',
        err_title: 'Give your recipe a title.',
        d_ing: 'Ingredients', d_ing_hint: 'Tap an ingredient to tick it while cooking.',
        d_steps: 'Method', edit: '✏️ Edit', del: '🗑️ Delete',
        ask_del: 'Delete this recipe?', ask_del_sub: 'It will disappear for everyone.',
        ask_yes: 'Yes, delete', cancel: 'Cancel',
        saved: 'Recipe saved! 🍽️', deleted: 'Recipe deleted.', photo_err: 'Unreadable photo, try again.',
    },
    es: {
        title: 'Recetas', search_ph: 'Buscar una receta…',
        all: 'Todas', empty: 'Ninguna receta coincide.', empty_first: '¡El cuaderno está vacío — añade la primera receta! 🍽️',
        count_one: 'receta compartida', count_many: 'recetas compartidas',
        cat_entree: 'Entrante', cat_plat: 'Plato', cat_dessert: 'Postre', cat_apero: 'Aperitivo', cat_boisson: 'Bebida',
        diff_facile: 'Fácil', diff_moyen: 'Medio', diff_difficile: 'Difícil',
        tag_vege: '🌱 Vegetariano', tag_vegan: '🌿 Vegano', 'tag_sans-gluten': '🌾 Sin gluten',
        tag_rapide: '⚡ Rápido', 'tag_sans-cuisson': '❄️ Sin cocción', tag_epice: '🌶️ Picante',
        min: 'min', pers: 'pers.', by: 'de', steps_count: 'pasos',
        form_new: 'Nueva receta', form_edit: 'Editar receta',
        f_title: 'Título', f_title_ph: 'Tarta de manzana de la abuela…',
        f_cat: 'Categoría', f_diff: 'Dificultad', f_time: 'Tiempo (min)', f_serv: 'Personas',
        f_tags: 'Etiquetas', f_photo: 'Foto', f_photo_add: 'Añadir una foto', f_photo_del: 'Quitar la foto',
        f_ing: 'Ingredientes', f_ing_add: 'Añadir un ingrediente', f_steps: 'Pasos', f_step_add: 'Añadir un paso',
        f_save: 'Guardar la receta', f_saving: 'Guardando…',
        ph_ing: 'Ingrediente', ph_qty: 'Cant.', ph_unit: 'Unidad', ph_step: 'Describe este paso…',
        err_title: 'Dale un título a tu receta.',
        d_ing: 'Ingredientes', d_ing_hint: 'Toca un ingrediente para marcarlo mientras cocinas.',
        d_steps: 'Preparación', edit: '✏️ Editar', del: '🗑️ Eliminar',
        ask_del: '¿Eliminar esta receta?', ask_del_sub: 'Desaparecerá para todos.',
        ask_yes: 'Sí, eliminar', cancel: 'Cancelar',
        saved: '¡Receta guardada! 🍽️', deleted: 'Receta eliminada.', photo_err: 'Foto ilegible, inténtalo de nuevo.',
    },
};
let LANG = localStorage.getItem('erquy_lang') || 'fr';
if (!I18N[LANG]) LANG = 'fr';
const t = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N.fr[k] || k;
function applyI18n() {
    document.querySelectorAll('[data-i]').forEach(el => { el.textContent = t(el.dataset.i); });
    document.querySelectorAll('[data-ph]').forEach(el => { el.placeholder = t(el.dataset.ph); });
}

// ---------- Références ----------
const CATS = [
    { id: 'entree', emoji: '🥗' }, { id: 'plat', emoji: '🍲' }, { id: 'dessert', emoji: '🍰' },
    { id: 'apero', emoji: '🥂' }, { id: 'boisson', emoji: '🍹' },
];
const DIFFS = ['facile', 'moyen', 'difficile'];
const TAGS = ['vege', 'vegan', 'sans-gluten', 'rapide', 'sans-cuisson', 'epice'];
const UNITS = ['g', 'kg', 'ml', 'L', 'c. à s.', 'c. à c.', 'pièce(s)', 'pincée'];
const COMMON = ['Sel', 'Poivre', "Huile d'olive", 'Beurre', 'Ail', 'Oignon', 'Farine', 'Sucre',
    'Œufs', 'Lait', 'Crème fraîche', 'Tomate', 'Citron', 'Parmesan', 'Pâtes', 'Riz'];
const catEmoji = (id) => (CATS.find(c => c.id === id) || {}).emoji || '🍽️';

// ---------- État ----------
let ME = null, LIST = [], filterCat = '', filterTags = new Set(), q = '';
let editingId = null, fPhoto = null, fThumb = null, removePhoto = false;

async function api(path, body) {
    const res = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401) { location.href = '/'; }
    return { ok: res.ok, data };
}
let toastT = null;
function toast(msg) {
    const el = $('rc-toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---------- Liste ----------
async function load() {
    const { ok, data } = await api('/api/rec/list');
    if (!ok) return;
    ME = data.me; LIST = data.recipes || [];
    document.body.className = 'is-ready';
    renderCount(); renderChips(); renderGrid();
}
function renderCount() {
    $('rc-count').textContent = LIST.length + ' ' + (LIST.length > 1 ? t('count_many') : t('count_one'));
}
function renderChips() {
    $('rc-cats').innerHTML = `<button class="chip${filterCat === '' ? ' on' : ''}" data-c="">${t('all')}</button>` +
        CATS.map(c => `<button class="chip${filterCat === c.id ? ' on' : ''}" data-c="${c.id}">${c.emoji} ${t('cat_' + c.id)}</button>`).join('');
    $('rc-cats').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
        filterCat = b.dataset.c; renderChips(); renderGrid();
    }));
    $('rc-tags').innerHTML = TAGS.map(tg =>
        `<button class="chip${filterTags.has(tg) ? ' on' : ''}" data-t="${tg}">${t('tag_' + tg)}</button>`).join('');
    $('rc-tags').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
        const tg = b.dataset.t;
        if (filterTags.has(tg)) filterTags.delete(tg); else filterTags.add(tg);
        renderChips(); renderGrid();
    }));
}
function filtered() {
    const needle = q.toLowerCase();
    return LIST.filter(r => {
        if (filterCat && r.category !== filterCat) return false;
        for (const tg of filterTags) if (!(r.tags || []).includes(tg)) return false;
        if (needle && !r.title.toLowerCase().includes(needle) && !(r.author || '').toLowerCase().includes(needle)) return false;
        return true;
    });
}
function renderGrid() {
    const list = filtered();
    $('rc-grid').innerHTML = list.map(r => `
        <button class="card" data-id="${r.id}">
            <span class="card-media">
                ${r.thumb ? `<img src="${r.thumb}" alt="" loading="lazy">` : `<span class="card-emoji">${catEmoji(r.category)}</span>`}
                <span class="card-cat">${t('cat_' + r.category)}</span>
            </span>
            <span class="card-body">
                <span class="card-title">${esc(r.title)}</span>
                <span class="card-meta">⏱ ${r.prepTime || '–'} ${t('min')} · ${t('diff_' + r.difficulty)}</span>
                <span class="card-author">${t('by')} ${esc(r.author)}</span>
            </span>
        </button>`).join('');
    const empty = $('rc-empty');
    if (!list.length) { empty.textContent = LIST.length ? t('empty') : t('empty_first'); empty.hidden = false; }
    else empty.hidden = true;
    $('rc-grid').querySelectorAll('.card').forEach(b => b.addEventListener('click', () => openDetail(b.dataset.id)));
}
let qT = null;
$('rc-q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { q = $('rc-q').value.trim(); renderGrid(); }, 200); });

// ---------- Détail ----------
let currentDetail = null;
async function openDetail(id) {
    const { ok, data } = await api('/api/rec/one?id=' + encodeURIComponent(id));
    if (!ok) return toast(data.error || '…');
    const r = data.recipe;
    currentDetail = r;
    if (r.image) { $('d-img').src = r.image; $('d-img').hidden = false; $('d-emoji').hidden = true; }
    else { $('d-img').hidden = true; $('d-emoji').textContent = catEmoji(r.category); $('d-emoji').hidden = false; }
    $('d-title').textContent = r.title;
    $('d-meta').textContent = `${t('cat_' + r.category)} · ⏱ ${r.prepTime || '–'} ${t('min')} · 👥 ${r.servings} ${t('pers')} · ${t('diff_' + r.difficulty)} · ${t('by')} ${r.author}`;
    $('d-tags').innerHTML = (r.tags || []).map(tg => `<span class="chip mini">${t('tag_' + tg)}</span>`).join('');
    $('d-ings').innerHTML = (r.ingredients || []).map((i, idx) => `
        <button class="ing" data-idx="${idx}">
            <span class="ing-box"></span>
            <span class="ing-txt">${esc([i.qty, i.unit, i.name].filter(Boolean).join(' '))}</span>
        </button>`).join('');
    $('d-ings').querySelectorAll('.ing').forEach(b => b.addEventListener('click', () => b.classList.toggle('done')));
    $('d-steps').innerHTML = (r.steps || []).map((s, i) => `
        <div class="step"><span class="step-n">${i + 1}</span><p class="step-t">${esc(s)}</p></div>`).join('');
    const acts = $('d-actions'); acts.innerHTML = '';
    if (data.canEdit) {
        const be = document.createElement('button');
        be.className = 'rc-btn ghost'; be.type = 'button'; be.textContent = t('edit');
        be.addEventListener('click', () => { closeDetail(); openForm(r); });
        const bd = document.createElement('button');
        bd.className = 'rc-btn danger'; bd.type = 'button'; bd.textContent = t('del');
        bd.addEventListener('click', () => { $('rc-ask').hidden = false; });
        acts.appendChild(be); acts.appendChild(bd);
    }
    $('rc-detail').hidden = false;
    $('rc-detail').scrollTop = 0;
    document.body.classList.add('locked');
}
function closeDetail() { $('rc-detail').hidden = true; document.body.classList.remove('locked'); }
$('d-close').addEventListener('click', closeDetail);
$('ask-no').addEventListener('click', () => { $('rc-ask').hidden = true; });
$('ask-yes').addEventListener('click', async () => {
    $('rc-ask').hidden = true;
    if (!currentDetail) return;
    const { ok, data } = await api('/api/rec/delete', { id: currentDetail.id });
    if (!ok) return toast(data.error || '…');
    closeDetail(); toast(t('deleted')); load();
});

// ---------- Photo : compression canvas (2 tailles) ----------
function compress(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(img.src);
            resolve(cv.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}
$('f-photo-btn').addEventListener('click', () => $('f-photo').click());
$('f-photo').addEventListener('change', async () => {
    const file = $('f-photo').files[0];
    if (!file) return;
    try {
        fPhoto = await compress(file, 900, 0.72);      // grande : ~100-250 Ko
        fThumb = await compress(file, 320, 0.6);       // miniature : ~15-30 Ko
        removePhoto = false;
        $('f-photo-img').src = fPhoto; $('f-photo-img').hidden = false;
        $('f-photo-txt').hidden = true; $('f-photo-del').hidden = false;
    } catch (e) { toast(t('photo_err')); }
    $('f-photo').value = '';
});
$('f-photo-del').addEventListener('click', () => {
    fPhoto = null; fThumb = null; removePhoto = true;
    $('f-photo-img').hidden = true; $('f-photo-txt').hidden = false; $('f-photo-del').hidden = true;
});

// ---------- Formulaire ----------
let fCat = 'plat', fDiff = 'facile', fTags = new Set();
function chipRow(el, items, current, onPick, tkey) {
    el.innerHTML = items.map(it => `<button type="button" class="chip${current === it || (current instanceof Set && current.has(it)) ? ' on' : ''}" data-v="${it}">${t(tkey + it)}</button>`).join('');
    el.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => onPick(b.dataset.v)));
}
function paintFormChips() {
    chipRow($('f-cats'), CATS.map(c => c.id), fCat, v => { fCat = v; paintFormChips(); }, 'cat_');
    chipRow($('f-diffs'), DIFFS, fDiff, v => { fDiff = v; paintFormChips(); }, 'diff_');
    chipRow($('f-tags'), TAGS, fTags, v => { fTags.has(v) ? fTags.delete(v) : fTags.add(v); paintFormChips(); }, 'tag_');
}
function ingLine(i) {
    const row = document.createElement('div');
    row.className = 'f-ing';
    row.innerHTML = `
        <input class="f-in ing-name" data-ph="ph_ing" placeholder="${t('ph_ing')}" maxlength="80" value="${esc((i && i.name) || '')}">
        <input class="f-in ing-qty" data-ph="ph_qty" placeholder="${t('ph_qty')}" maxlength="20" value="${esc((i && i.qty) || '')}">
        <select class="f-in ing-unit">${['', ...UNITS].map(u => `<option value="${u}"${(i && i.unit) === u ? ' selected' : ''}>${u || '—'}</option>`).join('')}</select>
        <button type="button" class="f-x" aria-label="Retirer">✕</button>`;
    row.querySelector('.f-x').addEventListener('click', () => row.remove());
    $('f-ings').appendChild(row);
    return row;
}
function stepLine(text) {
    const row = document.createElement('div');
    row.className = 'f-step';
    row.innerHTML = `
        <textarea class="f-in step-txt" rows="2" data-ph="ph_step" placeholder="${t('ph_step')}" maxlength="500">${esc(text || '')}</textarea>
        <button type="button" class="f-x" aria-label="Retirer">✕</button>`;
    row.querySelector('.f-x').addEventListener('click', () => row.remove());
    $('f-steps').appendChild(row);
}
function renderSuggest() {
    $('f-suggest').innerHTML = COMMON.map(n => `<button type="button" class="chip" data-n="${esc(n)}">${esc(n)}</button>`).join('');
    $('f-suggest').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
        const rows = [...$('f-ings').querySelectorAll('.ing-name')];
        const empty = rows.find(inp => !inp.value.trim());
        if (empty) empty.value = b.dataset.n;
        else ingLine({ name: b.dataset.n });
    }));
}
$('f-ing-add').addEventListener('click', () => ingLine());
$('f-step-add').addEventListener('click', () => stepLine());

function openForm(recipe) {
    editingId = recipe ? recipe.id : null;
    $('form-title').textContent = recipe ? t('form_edit') : t('form_new');
    $('f-title').value = recipe ? recipe.title : '';
    fCat = recipe ? recipe.category : 'plat';
    fDiff = recipe ? recipe.difficulty : 'facile';
    fTags = new Set(recipe ? recipe.tags : []);
    $('f-time').value = recipe ? (recipe.prepTime || '') : '';
    $('f-serv').value = recipe ? (recipe.servings || 4) : 4;
    fPhoto = null; fThumb = null; removePhoto = false;
    if (recipe && recipe.image) {
        $('f-photo-img').src = recipe.image; $('f-photo-img').hidden = false;
        $('f-photo-txt').hidden = true; $('f-photo-del').hidden = false;
    } else {
        $('f-photo-img').hidden = true; $('f-photo-txt').hidden = false; $('f-photo-del').hidden = true;
    }
    $('f-ings').innerHTML = '';
    ((recipe && recipe.ingredients) || [{}, {}, {}]).forEach(i => ingLine(i));
    $('f-steps').innerHTML = '';
    ((recipe && recipe.steps) || ['']).forEach(s => stepLine(s));
    paintFormChips(); renderSuggest();
    $('f-err').textContent = '';
    $('rc-form').hidden = false;
    $('rc-form').scrollTop = 0;
    document.body.classList.add('locked');
}
function closeForm() { $('rc-form').hidden = true; document.body.classList.remove('locked'); }
$('rc-add').addEventListener('click', () => openForm(null));
$('form-close').addEventListener('click', closeForm);

$('f-save').addEventListener('click', async () => {
    const title = $('f-title').value.trim();
    if (!title) { $('f-err').textContent = t('err_title'); return; }
    const payload = {
        title, category: fCat, difficulty: fDiff,
        prepTime: Number($('f-time').value) || 0,
        servings: Number($('f-serv').value) || 1,
        tags: [...fTags],
        ingredients: [...$('f-ings').querySelectorAll('.f-ing')].map(row => ({
            name: row.querySelector('.ing-name').value,
            qty: row.querySelector('.ing-qty').value,
            unit: row.querySelector('.ing-unit').value,
        })),
        steps: [...$('f-steps').querySelectorAll('.step-txt')].map(ta => ta.value),
    };
    if (fPhoto) { payload.image = fPhoto; payload.thumb = fThumb; }
    if (removePhoto) payload.removeImage = true;
    $('f-save').disabled = true;
    $('f-save').textContent = t('f_saving');
    const { ok, data } = editingId
        ? await api('/api/rec/update', { id: editingId, ...payload })
        : await api('/api/rec/add', payload);
    $('f-save').disabled = false;
    $('f-save').textContent = t('f_save');
    if (!ok) { $('f-err').textContent = data.error || '…'; return; }
    closeForm(); toast(t('saved'));
    if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
    load();
});

// ---------- Démarrage ----------
applyI18n();
load();