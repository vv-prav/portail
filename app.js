// =====================================================================
//  LA BOUCLE DES MONTS D'ARRÉE, animations de présentation
// =====================================================================
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Révélation au défilement ----------
const revealEls = document.querySelectorAll('[data-reveal]');
if (reduceMotion) {
    revealEls.forEach(el => el.classList.add('in-view'));
} else {
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => io.observe(el));
}

// ---------- Compteurs animés (stats du hero) ----------
function animateCount(el, target, duration) {
    if (reduceMotion) { el.textContent = target; return; }
    const start = performance.now();
    function tick(now) {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased);
        if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}
document.querySelectorAll('.vy-num').forEach((el, i) => {
    const target = Number(el.dataset.count) || 0;
    setTimeout(() => animateCount(el, target, 1200), 600 + i * 120);
});

// ---------- Ambiance colorée par étape ----------
const MOODS = {
    foret: '#3a2d52', tourbiere: '#332c48', crete: '#2c2c4a', lande: '#40304a', retour: '#4a3540',
};
const moodLayer = $('moodLayer');
const dayEls = [...document.querySelectorAll('.vy-day')];
let currentMood = null;
function updateMood() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const centerY = vh * 0.5;
    let closest = null, closestDist = Infinity;
    dayEls.forEach(el => {
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const dist = Math.abs(mid - centerY);
        if (r.bottom > 0 && r.top < vh && dist < closestDist) { closestDist = dist; closest = el; }
    });
    if (closest) {
        const mood = closest.dataset.mood;
        if (mood !== currentMood) {
            currentMood = mood;
            moodLayer.style.setProperty('--mood-a', MOODS[mood] || MOODS.foret);
        }
    }
}

// ---------- Le sentier : tracé, marcheurs, indicateur d'étape ----------
const trail = $('trail');
const trailSvg = $('trailSvg');
const trailGuide = $('trailGuide');
const trailPath = $('trailPath');
const walkers = [...document.querySelectorAll('.vy-walker')];
const progressPill = $('progressPill');
const progressCur = $('progressCur');
const progressFill = $('progressFill');

let trailLen = 0;
let trailHeight = 0;

function layoutTrailPath() {
    if (!trail || !trailSvg || !trailPath) return 0;
    const h = trail.offsetHeight;
    if (h < 10) return 0;
    trailSvg.setAttribute('viewBox', `0 0 6 ${h}`);
    const d = `M3,0 L3,${h}`;
    trailGuide.setAttribute('d', d);
    trailPath.setAttribute('d', d);
    return h;
}

function refreshTrail() {
    const h = layoutTrailPath();
    if (!h) return;
    trailHeight = h;
    trailLen = trailPath.getTotalLength ? trailPath.getTotalLength() : trailHeight;
    trailPath.style.strokeDasharray = trailLen;
    updateTrailProgress();
}

// Les marcheurs suivent le tracé avec un léger décalage entre eux, comme une file
// qui avance : le premier est en tête, les deux autres suivent un peu plus haut.
const WALKER_LAG = [0, 0.012, 0.024];
function updateTrailProgress() {
    if (!trail || !trailHeight) return;
    const rect = trail.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const total = rect.height + vh * 0.6;
    const traveled = vh * 0.85 - rect.top;
    let progress = traveled / total;
    progress = Math.max(0, Math.min(1, progress));
    if (reduceMotion) progress = 1;

    trailPath.style.strokeDashoffset = trailLen * (1 - progress);

    walkers.forEach((w, i) => {
        const p = Math.max(0, progress - WALKER_LAG[i]);
        w.style.top = (p * trailHeight) + 'px';
        w.classList.toggle('vy-walker-visible', progress > 0.015 && progress < 0.995);
    });

    // L'indicateur d'étape reste visible tant qu'on est dans le sentier.
    const insideTrail = rect.top < vh * 0.6 && rect.bottom > vh * 0.15;
    progressPill.classList.toggle('vy-progress-on', insideTrail);
    if (insideTrail) {
        const dayCount = dayEls.length;
        const current = Math.min(dayCount, Math.max(1, Math.round(progress * dayCount) || 1));
        progressCur.textContent = current;
        progressFill.style.width = Math.round(progress * 100) + '%';
    }

    updateMood();
}

let ticking = false;
function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateTrailProgress(); ticking = false; });
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => refreshTrail());

// Le texte peut recomposer sa hauteur une fois les polices chargées : on recalcule
// le tracé à ce moment-là, sinon les marcheurs partiraient d'une hauteur périmée.
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => setTimeout(refreshTrail, 50));
}
if (window.ResizeObserver && trail) {
    const ro = new ResizeObserver(() => refreshTrail());
    ro.observe(trail);
}
window.addEventListener('load', () => setTimeout(refreshTrail, 100));
document.addEventListener('DOMContentLoaded', () => setTimeout(refreshTrail, 30));
refreshTrail();

// ---------- Confettis au générique final ----------
const confettiHost = $('confetti');
let confettiFired = false;
function fireConfetti() {
    if (confettiFired || reduceMotion || !confettiHost) return;
    confettiFired = true;
    const colors = ['#c9935a', '#8b6ba8', '#c9b8dc', '#e0b483'];
    for (let i = 0; i < 26; i++) {
        const bit = document.createElement('span');
        bit.className = 'vy-confetti-bit';
        const size = 5 + Math.random() * 5;
        bit.style.width = size + 'px';
        bit.style.height = (size * 0.5) + 'px';
        bit.style.left = (Math.random() * 100) + '%';
        bit.style.background = colors[i % colors.length];
        bit.style.animationDelay = (Math.random() * 0.5) + 's';
        bit.style.animationDuration = (2 + Math.random() * 1.2) + 's';
        confettiHost.appendChild(bit);
    }
}
const footerIo = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) fireConfetti(); });
}, { threshold: 0.5 });
const footerEl = document.querySelector('.vy-footer');
if (footerEl) footerIo.observe(footerEl);

// =====================================================================
//  CAPTEURS DE MOUVEMENT : boussole, inclinaison des cartes, secousse.
//  iOS exige un geste explicite pour autoriser l'orientation et le
//  mouvement, donc un seul bouton déclenche les deux d'un coup.
// =====================================================================
const compassNeedle = $('compassNeedle');
const motionBtn = $('motionBtn');
let motionEnabled = false;

function needsMotionPermission() {
    return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
}
function enableMotion() {
    if (motionEnabled) return;
    motionEnabled = true;
    window.addEventListener('deviceorientation', onDeviceOrientation);
    window.addEventListener('deviceorientationabsolute', onDeviceOrientation);
    window.addEventListener('devicemotion', onDeviceMotion);
    requestHuelgoatBearing();
}

// La boussole vise Huelgoat une fois la position connue (demandée une seule fois).
const HUELGOAT = { lat: 48.364725, lng: -3.745646 };
let huelgoatBearing = null;
function bearingTo(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180;
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function requestHuelgoatBearing() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
        huelgoatBearing = bearingTo(pos.coords.latitude, pos.coords.longitude, HUELGOAT.lat, HUELGOAT.lng);
        const cap = $('compassCaption');
        if (cap) cap.hidden = false;
    }, () => { /* position refusée, la boussole reste utilisable sans cette flèche */ }, { timeout: 8000 });
}
if (needsMotionPermission() && !reduceMotion) {
    motionBtn.hidden = false;
    motionBtn.addEventListener('click', async () => {
        try {
            const r1 = await DeviceOrientationEvent.requestPermission();
            let r2 = 'granted';
            if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
                r2 = await DeviceMotionEvent.requestPermission();
            }
            if (r1 === 'granted' || r2 === 'granted') { enableMotion(); motionBtn.hidden = true; }
        } catch (e) { /* refusé ou indisponible, tant pis */ }
    });
} else if (!reduceMotion) {
    // Android et la plupart des navigateurs n'ont pas besoin de permission explicite.
    enableMotion();
}

let lastBeta = 0, lastGamma = 0;
function onDeviceOrientation(e) {
    if (e.gamma == null || e.beta == null) return;
    lastBeta = e.beta; lastGamma = e.gamma;

    // Cap réel si le navigateur le fournit (webkitCompassHeading sur iOS, alpha
    // absolu ailleurs) ; sinon, on retombe sur le geste de la main (gamma).
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
    else if (e.absolute === true && e.alpha != null) heading = 360 - e.alpha;

    if (heading != null) {
        compassNeedle.style.transform = `rotate(${heading}deg)`;
        if (huelgoatBearing != null) {
            const marker = $('huelgoatMarker');
            if (marker) { marker.hidden = false; marker.style.transform = `rotate(${huelgoatBearing - heading}deg)`; }
        }
    } else {
        const angle = Math.max(-80, Math.min(80, e.gamma * 1.6));
        if (compassNeedle) compassNeedle.style.transform = `rotate(${angle}deg)`;
    }

    document.querySelectorAll('.vy-tilt').forEach(card => {
        const rx = Math.max(-8, Math.min(8, (e.beta - 45) * 0.25));
        const ry = Math.max(-10, Math.min(10, e.gamma * 0.3));
        card.style.transform = `perspective(900px) rotateX(${-rx}deg) rotateY(${ry}deg)`;

        // Plus l'appareil s'incline, plus le vent souffle fort, jusqu'à un seuil comique.
        const wind = card.querySelector('.vy-wind');
        if (wind) {
            const intensity = Math.min(1.6, Math.abs(e.gamma) / 30);
            wind.style.opacity = wind.classList.contains('vy-wind-on') ? Math.min(1, 0.5 + intensity * 0.6) : 0;
            wind.querySelectorAll('.vy-wind-streak').forEach(s => {
                const base = Number(s.dataset.basedur) || 2;
                s.style.animationDuration = Math.max(0.4, base / (1 + intensity)) + 's';
            });
            const lean = Math.max(-14, Math.min(14, e.gamma * 0.5));
            const title = card.querySelector('.vy-day-title');
            const tag = card.querySelector('.vy-day-tag');
            if (title) title.style.transform = `rotate(${lean * 0.5}deg)`;
            if (tag) tag.style.transform = `rotate(${lean * 0.3}deg)`;
        }
    });
}
// Sur ordinateur, la boussole suit la souris : un objet qu'on manipule du regard.
if (!needsMotionPermission()) {
    document.addEventListener('mousemove', (e) => {
        if (!compassNeedle) return;
        const cx = window.innerWidth / 2, cy = window.innerHeight / 3;
        const angle = Math.atan2(e.clientX - cx, -(e.clientY - cy)) * (180 / Math.PI);
        compassNeedle.style.transform = `rotate(${Math.max(-70, Math.min(70, angle * 0.35))}deg)`;
    }, { passive: true });
    document.querySelectorAll('.vy-tilt').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const r = card.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            card.style.transform = `perspective(900px) rotateX(${-py * 8}deg) rotateY(${px * 10}deg)`;
        });
        card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
}

// Secouer le téléphone révèle une silhouette bretonne, une seconde ou deux, puis s'efface.
const korrigan = $('korrigan');
let lastShakeTime = 0, lastAccel = null;
function onDeviceMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    if (lastAccel) {
        const delta = Math.abs(a.x - lastAccel.x) + Math.abs(a.y - lastAccel.y) + Math.abs(a.z - lastAccel.z);
        const now = Date.now();
        if (delta > 32 && now - lastShakeTime > 3000) {
            lastShakeTime = now;
            showKorrigan();
        }
    }
    lastAccel = { x: a.x, y: a.y, z: a.z };
}
function showKorrigan() {
    if (!korrigan || reduceMotion) return;
    korrigan.classList.add('vy-korrigan-on');
    if (navigator.vibrate) { try { navigator.vibrate([20, 40, 20]); } catch (err) {} }
    setTimeout(() => korrigan.classList.remove('vy-korrigan-on'), 1600);
}

// =====================================================================
//  LA ROCHE TREMBLANTE (jour 1) : on la fait vraiment vaciller au tap.
// =====================================================================
const roche = $('rocheTremblante');
if (roche) {
    const photo = roche.closest('.vy-day-card')?.querySelector('.vy-day-photo');
    const rock = () => {
        if (!photo) return;
        photo.classList.remove('vy-rocking');
        void photo.getBoundingClientRect();
        photo.classList.add('vy-rocking');
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    };
    roche.addEventListener('click', rock);
}

// =====================================================================
//  LA BRUME DU JOUR 2 : se dissipe littéralement au défilement.
// =====================================================================
const fogCard = $('fogCard');
const fogVeil = $('fogVeil');
function updateFog() {
    if (!fogCard || !fogVeil) return;
    const r = fogCard.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const p = 1 - Math.max(0, Math.min(1, (r.top - vh * 0.25) / (vh * 0.55)));
    fogVeil.classList.toggle('vy-fog-clear', p > 0.55 || reduceMotion);
}

// =====================================================================
//  LE VENT DU JOUR 3 : particules qui soufflent tant que la carte est visible.
// =====================================================================
const windLayer = $('windLayer');
let windBuilt = false;
function buildWind() {
    if (windBuilt || !windLayer || reduceMotion) return;
    windBuilt = true;
    for (let i = 0; i < 9; i++) {
        const s = document.createElement('span');
        s.className = 'vy-wind-streak';
        const baseDur = 1.6 + Math.random() * 1.8;
        s.dataset.basedur = baseDur;
        s.style.top = (8 + Math.random() * 84) + '%';
        s.style.width = (30 + Math.random() * 60) + 'px';
        s.style.animationDuration = baseDur + 's';
        s.style.animationDelay = (Math.random() * 2) + 's';
        windLayer.appendChild(s);
    }
}
const windIo = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) { buildWind(); windLayer.classList.add('vy-wind-on'); }
        else windLayer.classList.remove('vy-wind-on');
    });
}, { threshold: 0.2 });
if (windLayer) windIo.observe(windLayer.closest('.vy-day'));

// ---------- Regrouper la brume dans la boucle de défilement déjà en place ----------
const _origOnScroll = onScroll;
window.removeEventListener('scroll', _origOnScroll, { passive: true });
function combinedScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateTrailProgress(); updateFog(); ticking = false; });
}
window.addEventListener('scroll', combinedScroll, { passive: true });
combinedScroll();

// =====================================================================
//  EMPREINTES DE PAS sous le doigt, façon boue fraîche.
// =====================================================================
const footprintsHost = $('footprints');
let footStep = 0, lastFootTime = 0;
function dropFootprint(x, y) {
    if (!footprintsHost || reduceMotion) return;
    const now = Date.now();
    if (now - lastFootTime < 90) return;
    lastFootTime = now;
    const foot = document.createElement('div');
    foot.className = 'vy-footprint';
    foot.style.left = x + 'px';
    foot.style.top = y + 'px';
    foot.style.transform = `rotate(${footStep % 2 === 0 ? -14 : 14}deg)`;
    footStep++;
    footprintsHost.appendChild(foot);
    setTimeout(() => foot.remove(), 2300);
}
window.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch' || e.buttons) dropFootprint(e.clientX, e.clientY); }, { passive: true });
window.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) dropFootprint(t.clientX, t.clientY); }, { passive: true });


// =====================================================================
//  COMPTE À REBOURS jusqu'au départ, le 10 août.
// =====================================================================
const DEPARTURE = new Date('2026-08-10T07:00:00');
const flipEls = {
    d: document.querySelector('.vy-flip[data-unit="d"] .vy-flip-val'),
    h: document.querySelector('.vy-flip[data-unit="h"] .vy-flip-val'),
    m: document.querySelector('.vy-flip[data-unit="m"] .vy-flip-val'),
    s: document.querySelector('.vy-flip[data-unit="s"] .vy-flip-val'),
};
let lastCountdown = { d: null, h: null, m: null, s: null };
function pad2(n) { return String(Math.max(0, n)).padStart(2, '0'); }
function tickCountdown() {
    const diff = Math.max(0, DEPARTURE.getTime() - Date.now());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const vals = { d, h, m, s };
    Object.keys(vals).forEach(k => {
        const el = flipEls[k];
        if (!el) return;
        const text = pad2(vals[k]);
        if (text !== lastCountdown[k]) {
            el.textContent = text;
            if (!reduceMotion) { el.classList.remove('vy-flip-tick'); void el.offsetWidth; el.classList.add('vy-flip-tick'); }
            lastCountdown[k] = text;
        }
    });
}
tickCountdown();
setInterval(tickCountdown, 1000);

// Petit utilitaire pour parler au serveur (même motif que le reste du portail).
async function api(url, body) {
    try {
        const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
        const res = await fetch(url, opts);
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, data };
    } catch (e) { return { ok: false, data: {} }; }
}

// =====================================================================
//  LA CARTE : villages et sommets réels, dans l'ordre du parcours.
//  Coordonnées vérifiées une à une ; le tracé qui les relie reste une
//  reconstitution plausible en attendant un vrai relevé GPS terrain.
// =====================================================================
if (window.L && $('voyageMap')) {
    const stops = [
        { name: 'Huelgoat', lat: 48.364725, lng: -3.745646, day: 'Départ, jour 1', kind: 'etape', num: 1 },
        { name: 'Brennilis', lat: 48.357285, lng: -3.850650, day: 'Fin du jour 1', kind: 'etape', num: 2 },
        { name: 'Mont Saint-Michel de Brasparts', lat: 48.350000, lng: -3.950000, day: 'Sommet du jour 2, 381 m', kind: 'sommet' },
        { name: 'Botmeur', lat: 48.383642, lng: -3.915254, day: 'Fin du jour 2', kind: 'etape', num: 3 },
        { name: 'Roc\u2019h Trédudon', lat: 48.406667, lng: -3.909722, day: 'Sur la crête, jour 3', kind: 'sommet' },
        { name: 'Roc\u2019h Trévezel', lat: 48.410000, lng: -3.907500, day: 'Point culminant, 384 m, jour 3', kind: 'sommet' },
        { name: 'Plounéour-Ménez', lat: 48.439388, lng: -3.891231, day: 'Fin du jour 3', kind: 'etape', num: 4 },
        { name: 'La Feuillée', lat: 48.391647, lng: -3.853690, day: 'Fin du jour 4', kind: 'etape', num: 5 },
        { name: 'Huelgoat', lat: 48.364725, lng: -3.745646, day: 'Retour, fin du jour 5', kind: 'etape', num: 1 },
    ];
    const map = L.map('voyageMap', { zoomControl: true, attributionControl: true }).setView([48.39, -3.85], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 16, attribution: '© contributeurs OpenStreetMap',
    }).addTo(map);
    const etapeIcon = (label) => L.divIcon({ className: '', html: `<div class="vy-map-pin">${label}</div>`, iconSize: [26, 26] });
    const sommetIcon = () => L.divIcon({ className: '', html: `<div class="vy-map-pin vy-map-pin-sommet"></div>`, iconSize: [16, 16] });
    stops.forEach(s => {
        const icon = s.kind === 'etape' ? etapeIcon(s.num) : sommetIcon();
        L.marker([s.lat, s.lng], { icon }).addTo(map).bindPopup(`<b>${s.name}</b><br>${s.day}`);
    });
    const routePoints = stops.map(s => [s.lat, s.lng]);
    L.polyline(routePoints, { color: '#a98cc2', weight: 3, opacity: .85, dashArray: '2 8' }).addTo(map);
    map.fitBounds(routePoints, { padding: [26, 26] });

    // ---------- Mode hors-ligne : précharger la carte pendant qu'il y a du réseau ----------
    const offlineBtn = $('offlineBtn');
    const offlineStatus = $('offlineStatus');
    if (offlineBtn) {
        offlineBtn.addEventListener('click', async () => {
            offlineBtn.disabled = true;
            offlineStatus.textContent = 'Préparation...';
            try {
                const lats = routePoints.map(p => p[0]), lngs = routePoints.map(p => p[1]);
                const bounds = { minLat: Math.min(...lats) - 0.02, maxLat: Math.max(...lats) + 0.02, minLng: Math.min(...lngs) - 0.02, maxLng: Math.max(...lngs) + 0.02 };
                const lon2tile = (lon, z) => Math.floor((lon + 180) / 360 * Math.pow(2, z));
                const lat2tile = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
                const tiles = [];
                [11, 12, 13].forEach(z => {
                    const xMin = lon2tile(bounds.minLng, z), xMax = lon2tile(bounds.maxLng, z);
                    const yMin = lat2tile(bounds.maxLat, z), yMax = lat2tile(bounds.minLat, z);
                    for (let x = xMin; x <= xMax; x++) for (let y = yMin; y <= yMax; y++) tiles.push({ z, x, y });
                });
                let done = 0;
                const subs = ['a', 'b', 'c'];
                // Par petits lots, pour ne pas bombarder le serveur de tuiles d'un coup.
                for (let i = 0; i < tiles.length; i += 6) {
                    const batch = tiles.slice(i, i + 6);
                    await Promise.all(batch.map(t => {
                        const s = subs[(t.x + t.y) % subs.length];
                        return fetch(`https://${s}.tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`).catch(() => {});
                    }));
                    done += batch.length;
                    offlineStatus.textContent = `Tuiles préchargées : ${Math.min(done, tiles.length)} / ${tiles.length}`;
                }
                offlineStatus.textContent = `Carte prête hors-ligne (${tiles.length} tuiles). Le reste de la page l'est déjà.`;
            } catch (err) {
                offlineStatus.textContent = 'Le préchargement a échoué, réessayez avec du réseau.';
            }
            offlineBtn.disabled = false;
        });
    }
}

// =====================================================================
//  LÉGENDES À GRATTER : une vraie carte à gratter par jour.
// =====================================================================
document.querySelectorAll('.vy-legend-canvas').forEach((canvas) => {
    const wrap = canvas.closest('.vy-legend');
    let ctx, w, h, scratched = 0, totalPx = 0, done = false;

    function paint() {
        const rect = canvas.getBoundingClientRect();
        w = canvas.width = rect.width * devicePixelRatio;
        h = canvas.height = rect.height * devicePixelRatio;
        ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#8b7a9a'); grad.addColorStop(1, '#6e5f80');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        totalPx = w * h;
    }
    function scratchAt(x, y) {
        if (done || !ctx) return;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, 26 * devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
    }
    function pos(e) {
        const rect = canvas.getBoundingClientRect();
        const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
        return { x: cx * devicePixelRatio, y: cy * devicePixelRatio };
    }
    function checkDone() {
        if (done || !ctx) return;
        scratched++;
        if (scratched % 6 !== 0) return;
        const data = ctx.getImageData(0, 0, w, h).data;
        let clear = 0;
        for (let i = 3; i < data.length; i += 4 * 40) if (data[i] < 40) clear++;
        if (clear / (data.length / (4 * 40)) > 0.45) {
            done = true;
            wrap.classList.add('vy-legend-done');
        }
    }
    let drawing = false;
    function start(e) { drawing = true; const p = pos(e); scratchAt(p.x, p.y); checkDone(); }
    function move(e) { if (!drawing) return; e.preventDefault(); const p = pos(e); scratchAt(p.x, p.y); checkDone(); }
    function end() { drawing = false; }
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    canvas.addEventListener('touchstart', start, { passive: true });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    if (reduceMotion) { paint(); wrap.classList.add('vy-legend-done'); }
    else setTimeout(paint, 60);
    window.addEventListener('resize', () => { if (!done) paint(); });
});

// =====================================================================
//  LE CAIRN (jour 1) : chaque appui empile une pierre.
// =====================================================================
const cairnStack = $('cairnStack');
const cairnBtn = $('cairnBtn');
if (cairnBtn && cairnStack) {
    cairnBtn.addEventListener('click', () => {
        const stone = document.createElement('div');
        stone.className = 'vy-cairn-stone';
        const wobble = (Math.random() * 10 - 5).toFixed(1);
        const widthAdj = 54 - cairnStack.children.length * 3;
        stone.style.transform = `rotate(${wobble}deg)`;
        stone.style.width = Math.max(24, widthAdj) + 'px';
        cairnStack.appendChild(stone);
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
        if (cairnStack.children.length >= 9) { stone.after(); cairnBtn.textContent = 'Le cairn tient debout'; cairnBtn.disabled = true; }
    });
}

// =====================================================================
//  LE VŒU DE LA CHAPELLE (jour 2) : appui long fait monter une lumière.
// =====================================================================
const wishLight = $('wishLight');
if (fogCard && wishLight) {
    let pressTimer = null;
    function startPress() {
        pressTimer = setTimeout(() => {
            const beam = document.createElement('div');
            beam.className = 'vy-wish-beam';
            wishLight.appendChild(beam);
            if (navigator.vibrate) { try { navigator.vibrate([10, 30, 10]); } catch (e) {} }
            setTimeout(() => beam.remove(), 1500);
        }, 550);
    }
    function cancelPress() { clearTimeout(pressTimer); }
    fogCard.addEventListener('pointerdown', startPress);
    fogCard.addEventListener('pointerup', cancelPress);
    fogCard.addEventListener('pointerleave', cancelPress);
}

// =====================================================================
//  PLUIE D'ÉTOILES FILANTES (jour 2, la nuit du 11 août).
// =====================================================================
const meteorLayer = $('meteorLayer');
let meteorsBuilt = false;
function buildMeteors() {
    if (meteorsBuilt || !meteorLayer || reduceMotion) return;
    meteorsBuilt = true;
    for (let i = 0; i < 7; i++) {
        const m = document.createElement('span');
        m.className = 'vy-meteor';
        m.style.top = (Math.random() * 50) + '%';
        m.style.left = (40 + Math.random() * 55) + '%';
        m.style.animationDuration = (2 + Math.random() * 2) + 's';
        m.style.animationDelay = (Math.random() * 3) + 's';
        meteorLayer.appendChild(m);
    }
}
if (meteorLayer) {
    const meteorIo = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting) { buildMeteors(); meteorLayer.classList.add('vy-meteors-on'); }
            else meteorLayer.classList.remove('vy-meteors-on');
        });
    }, { threshold: 0.25 });
    meteorIo.observe(meteorLayer.closest('.vy-day'));
}

// =====================================================================
//  SUIVRE LE PROFIL D'ALTITUDE AU DOIGT.
// =====================================================================
document.querySelectorAll('.vy-elev').forEach((elevBox) => {
    const svg = elevBox.querySelector('.vy-elev-svg');
    const path = svg && svg.querySelector('path');
    const distKm = Number(elevBox.closest('.vy-day-card').querySelector('.vy-day-tag').textContent.match(/(\d+)\s*kilom/)?.[1]) || 15;
    if (!path) return;
    let badge = null;
    function ensureBadge() {
        if (badge) return badge;
        badge = document.createElement('div');
        badge.className = 'vy-elev-badge';
        badge.style.cssText = 'position:absolute;transform:translate(-50%,-120%);background:rgba(13,10,20,.85);' +
            'color:#f3e9f5;font-family:JetBrains Mono,monospace;font-size:.65rem;padding:4px 8px;border-radius:8px;' +
            'pointer-events:none;white-space:nowrap;z-index:5;';
        svg.parentElement.style.position = 'relative';
        svg.parentElement.appendChild(badge);
        return badge;
    }
    function handle(e) {
        const rect = svg.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const fx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const len = path.getTotalLength();
        const pt = path.getPointAtLength(fx * len);
        const km = (fx * distKm).toFixed(1);
        const b = ensureBadge();
        b.style.left = (fx * rect.width) + 'px';
        b.style.top = (pt.y / 30 * rect.height) + 'px';
        b.textContent = `${km} km sur ${distKm}`;
        b.style.display = 'block';
    }
    function hide() { if (badge) badge.style.display = 'none'; }
    svg.addEventListener('pointerdown', (e) => { handle(e); });
    svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') handle(e); });
    svg.addEventListener('pointerup', hide);
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('touchmove', (e) => { e.preventDefault(); handle(e); }, { passive: false });
    svg.addEventListener('touchend', hide);
});

// =====================================================================
//  DEVINER LE DÉNIVELÉ AVANT DE LE RÉVÉLER.
// =====================================================================
(function computeTotals() {
    let totalElev = 0, totalMinutes = 0;
    document.querySelectorAll('.vy-day-card').forEach(card => {
        const boxes = card.querySelectorAll('.vy-stat-box b');
        if (boxes.length < 2) return;
        const guess = card.querySelector('.vy-guess');
        const elev = guess ? Number(guess.dataset.answer) || 0 : 0;
        const timeMatch = boxes[1].textContent.match(/(\d+)\s*h\s*(\d+)/);
        const minutes = timeMatch ? Number(timeMatch[1]) * 60 + Number(timeMatch[2]) : 0;
        totalElev += elev;
        totalMinutes += minutes;
    });
    const h = Math.floor(totalMinutes / 60), m = Math.round(totalMinutes % 60);
    const elevEl = $('totalElev'), timeEl = $('totalTime');
    if (elevEl) elevEl.textContent = `${totalElev} m`;
    if (timeEl) timeEl.textContent = `${h} h ${String(m).padStart(2, '0')}`;
})();


document.querySelectorAll('.vy-guess').forEach((box) => {
    const slider = box.querySelector('.vy-guess-slider');
    const val = box.querySelector('.vy-guess-val');
    const btn = box.querySelector('.vy-guess-btn');
    const result = box.querySelector('.vy-guess-result');
    const answer = Number(box.dataset.answer);
    slider.addEventListener('input', () => { val.textContent = slider.value; });
    btn.addEventListener('click', () => {
        const guess = Number(slider.value);
        const diff = Math.abs(guess - answer);
        let msg;
        if (diff <= 20) msg = `Très proche ! Le vrai dénivelé positif est d'environ ${answer} mètres.`;
        else if (guess < answer) msg = `En vrai c'est plus : environ ${answer} mètres de dénivelé positif.`;
        else msg = `En vrai c'est moins : environ ${answer} mètres de dénivelé positif.`;
        result.textContent = msg;
        result.hidden = false;
        slider.disabled = true;
        btn.disabled = true;
    });
});

// =====================================================================
//  VOS PRÉNOMS, LE MATÉRIEL ET LES FRAIS : partagés entre vos téléphones.
// =====================================================================
let groupNames = [];
let gearCategories = [];
let editingExpenseId = null;
let expSplitSelection = [];

async function loadNames() {
    const { data } = await api('/api/voyages/names');
    groupNames = data.names || [];
    document.querySelectorAll('.vy-name-input').forEach((inp, i) => { inp.value = groupNames[i] || ''; });
    expSplitSelection = [...groupNames];
}
const namesSaveBtn = $('namesSave');
if (namesSaveBtn) {
    namesSaveBtn.addEventListener('click', async () => {
        const names = [...document.querySelectorAll('.vy-name-input')].map(i => i.value.trim()).filter(Boolean);
        const { ok, data } = await api('/api/voyages/names', { names });
        if (ok) {
            groupNames = data.names; expSplitSelection = [...groupNames];
            loadGear(); loadExpenses(); renderChecklistTabs();
            namesSaveBtn.textContent = 'Enregistré'; setTimeout(() => namesSaveBtn.textContent = 'Enregistrer', 1500);
        }
    });
}
function initials(name) { return (name || '?').trim().slice(0, 2).toUpperCase(); }
function avatarChip(i, name) {
    return `<span class="vy-avatar-chip vy-avatar-photo"><img src="photos/ami-${i + 1}.png" alt="" onerror="this.parentElement.classList.add('vy-avatar-noimg')"><i>${initials(name)}</i></span>`;
}

// ---------- QUI PORTE QUOI ----------
async function loadGear() {
    const { data } = await api('/api/voyages/gear');
    gearCategories = data.categories || [];
    renderGearFilter();
    renderGear();
}
async function saveGear() {
    const { data } = await api('/api/voyages/gear', { categories: gearCategories });
    gearCategories = data.categories || gearCategories;
}
let gearFilterPerson = null;
function renderGearFilter() {
    const host = $('gearFilter');
    if (!host) return;
    if (!groupNames.length) { host.innerHTML = ''; return; }
    host.innerHTML = groupNames.map((n, i) => `
        <button type="button" class="vy-avatar-btn${gearFilterPerson === n ? ' vy-avatar-on' : ''}" data-person="${esc(n)}">
            ${avatarChip(i, n)}${esc(n)}
        </button>`).join('') + (gearFilterPerson ? `<button type="button" class="vy-avatar-btn" id="gearFilterClear">Tout voir</button>` : '');
    host.querySelectorAll('[data-person]').forEach(b => b.addEventListener('click', () => {
        gearFilterPerson = gearFilterPerson === b.dataset.person ? null : b.dataset.person;
        renderGearFilter(); renderGear();
    }));
    const clearBtn = $('gearFilterClear');
    if (clearBtn) clearBtn.addEventListener('click', () => { gearFilterPerson = null; renderGearFilter(); renderGear(); });
}
function renderGear() {
    const host = $('gearCategories');
    if (!host) return;
    if (!gearCategories.length) {
        host.innerHTML = '<p class="vy-empty-note">Aucune catégorie pour l\u2019instant, créez-en une ci-dessous.</p>';
        return;
    }
    host.innerHTML = gearCategories.map(cat => `
        <div class="vy-gear-cat" data-cat="${cat.id}">
            <div class="vy-gear-cat-head">
                <span class="vy-gear-cat-name">${esc(cat.name)}</span>
                <button type="button" class="vy-gear-cat-del" data-catdel="${cat.id}" aria-label="Supprimer la catégorie">✕</button>
            </div>
            <div class="vy-gear-items" data-catitems="${cat.id}">
                ${cat.items.map(it => {
                    const dim = gearFilterPerson && it.person !== gearFilterPerson;
                    return `<div class="vy-gear-item${dim ? ' vy-item-dim' : ''}" draggable="false" data-item="${it.id}" data-cat="${cat.id}">
                        <span class="vy-gear-handle" data-handle="${it.id}">⠿</span>
                        <span class="vy-gear-name">${esc(it.name)}</span>
                        <div class="vy-gear-people">${groupNames.length ? groupNames.map((n, i) => `
                            <button type="button" class="vy-gear-avatar${it.person === n ? ' vy-gear-assigned' : ''}" data-cat="${cat.id}" data-item="${it.id}" data-person="${esc(n)}">${avatarChip(i, n)}</button>
                        `).join('') : '<span class="vy-gear-noname">prénoms non renseignés</span>'}</div>
                        <button type="button" class="vy-gear-del" data-cat="${cat.id}" data-itemdel="${it.id}" aria-label="Retirer">✕</button>
                    </div>`;
                }).join('')}
            </div>
            <div class="vy-gear-item-add">
                <input type="text" maxlength="60" placeholder="Ajouter un objet" data-catnew="${cat.id}">
                <button type="button" data-catnewbtn="${cat.id}">Ajouter</button>
            </div>
        </div>`).join('');

    host.querySelectorAll('[data-catdel]').forEach(b => b.addEventListener('click', () => {
        gearCategories = gearCategories.filter(c => c.id !== b.dataset.catdel);
        saveGear().then(renderGear);
    }));
    host.querySelectorAll('.vy-gear-avatar').forEach(b => b.addEventListener('click', () => {
        const cat = gearCategories.find(c => c.id === b.dataset.cat);
        const item = cat && cat.items.find(i => i.id === b.dataset.item);
        if (!item) return;
        item.person = item.person === b.dataset.person ? '' : b.dataset.person;
        saveGear().then(renderGear);
    }));
    host.querySelectorAll('[data-itemdel]').forEach(b => b.addEventListener('click', () => {
        const cat = gearCategories.find(c => c.id === b.dataset.cat);
        if (cat) cat.items = cat.items.filter(i => i.id !== b.dataset.itemdel);
        saveGear().then(renderGear);
    }));
    host.querySelectorAll('[data-catnewbtn]').forEach(b => b.addEventListener('click', () => {
        const input = host.querySelector(`input[data-catnew="${b.dataset.catnewbtn}"]`);
        const name = input.value.trim();
        if (!name) return;
        const cat = gearCategories.find(c => c.id === b.dataset.catnewbtn);
        if (cat) cat.items.push({ id: 'g-' + Date.now() + Math.random().toString(36).slice(2, 6), name, person: '' });
        input.value = '';
        saveGear().then(renderGear);
    }));
    host.querySelectorAll('[data-catnew]').forEach(inp => inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); host.querySelector(`[data-catnewbtn="${inp.dataset.catnew}"]`).click(); }
    }));
    wireGearDrag(host);
}

// Réordonner un objet dans sa catégorie en le faisant glisser au doigt.
function wireGearDrag(host) {
    let dragEl = null, dragCatId = null, startY = 0, placeholder = null;
    host.querySelectorAll('[data-handle]').forEach(handle => {
        handle.addEventListener('pointerdown', (e) => {
            const row = handle.closest('.vy-gear-item');
            dragEl = row; dragCatId = row.dataset.cat;
            startY = e.clientY;
            row.classList.add('vy-dragging');
            placeholder = document.createElement('div');
            placeholder.style.height = row.offsetHeight + 'px';
            row.after(placeholder);
            row.style.position = 'relative'; row.style.zIndex = '5';
            document.body.style.userSelect = 'none';
            handle.setPointerCapture(e.pointerId);
        });
        handle.addEventListener('pointermove', (e) => {
            if (!dragEl) return;
            const dy = e.clientY - startY;
            dragEl.style.transform = `translateY(${dy}px)`;
            const siblings = [...dragEl.parentElement.children].filter(c => c !== dragEl);
            const midY = e.clientY;
            for (const sib of siblings) {
                const r = sib.getBoundingClientRect();
                if (midY > r.top && midY < r.bottom && sib !== placeholder) {
                    sib.before(placeholder);
                    break;
                }
            }
        });
        function drop() {
            if (!dragEl) return;
            placeholder.replaceWith(dragEl);
            dragEl.style.transform = ''; dragEl.style.position = ''; dragEl.style.zIndex = '';
            dragEl.classList.remove('vy-dragging');
            document.body.style.userSelect = '';
            const cat = gearCategories.find(c => c.id === dragCatId);
            if (cat) {
                const order = [...dragEl.parentElement.children].map(c => c.dataset.item);
                cat.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
                saveGear();
            }
            dragEl = null; placeholder = null;
        }
        handle.addEventListener('pointerup', drop);
        handle.addEventListener('pointercancel', drop);
    });
}
const catAddBtn = $('catAdd');
const catInputEl = $('catInput');
if (catAddBtn) {
    catAddBtn.addEventListener('click', () => {
        const input = $('catInput');
        const name = input.value.trim();
        if (!name) return;
        gearCategories.push({ id: 'cat-' + Date.now(), name, items: [] });
        input.value = '';
        saveGear().then(renderGear);
    });
    if (catInputEl) catInputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); catAddBtn.click(); } });
}

// ---------- LES FRAIS ----------
let expensesCache = [];
function renderPaidByRow() {
    const host = $('expPaidByRow');
    if (!host) return;
    host.innerHTML = groupNames.map((n, i) => `
        <button type="button" class="vy-avatar-btn" data-paidby="${esc(n)}">${avatarChip(i, n)}${esc(n)}</button>
    `).join('') || '<p class="vy-empty-note">Renseignez vos prénoms plus haut.</p>';
    if (!host.dataset.selected) host.dataset.selected = '';
    highlightPaidBy(host.dataset.selected);
    host.querySelectorAll('[data-paidby]').forEach(b => b.addEventListener('click', () => {
        host.dataset.selected = b.dataset.paidby;
        highlightPaidBy(b.dataset.paidby);
    }));
}
function highlightPaidBy(name) {
    const host = $('expPaidByRow');
    host.querySelectorAll('[data-paidby]').forEach(b => b.classList.toggle('vy-avatar-on', b.dataset.paidby === name));
}
function renderSplitRow() {
    const host = $('expSplitRow');
    if (!host) return;
    host.innerHTML = `<button type="button" class="vy-avatar-btn${expSplitSelection.length === groupNames.length ? ' vy-avatar-on' : ''}" id="splitAll">Tous les trois</button>` +
        groupNames.map((n, i) => `
        <button type="button" class="vy-avatar-btn${expSplitSelection.includes(n) ? ' vy-avatar-on' : ''}" data-split="${esc(n)}">
            ${avatarChip(i, n)}${esc(n)}</button>`).join('');
    const allBtn = $('splitAll');
    if (allBtn) allBtn.addEventListener('click', () => { expSplitSelection = [...groupNames]; renderSplitRow(); });
    host.querySelectorAll('[data-split]').forEach(b => b.addEventListener('click', () => {
        const n = b.dataset.split;
        if (expSplitSelection.includes(n)) expSplitSelection = expSplitSelection.filter(x => x !== n);
        else expSplitSelection.push(n);
        if (!expSplitSelection.length) expSplitSelection = [...groupNames];
        renderSplitRow();
    }));
}
async function loadExpenses() {
    renderPaidByRow(); renderSplitRow();
    const { data } = await api('/api/voyages/expenses');
    expensesCache = data.expenses || [];
    renderExpenseList();
}
function splitLabel(e) {
    if (!e.splitWith || e.splitWith.length >= groupNames.length) return 'partagé entre tous les trois';
    if (e.splitWith.length === 1) return `pour ${esc(e.splitWith[0])} uniquement`;
    return `partagé entre ${e.splitWith.map(esc).join(', ')}`;
}
function renderExpenseList() {
    const listEl = $('expenseList');
    const sumEl = $('expenseSummary');
    if (!listEl) return;
    listEl.innerHTML = expensesCache.length ? expensesCache.slice().reverse().map(e => `
        <div class="vy-expense-row" data-editid="${e.id}">
            <div class="vy-expense-main">
                <span class="vy-expense-label">${esc(e.label)}</span>
                <span class="vy-expense-meta">payé par ${esc(e.paidBy)}, ${splitLabel(e)}</span>
            </div>
            <span class="vy-expense-amount">${e.amount.toFixed(2)} €</span>
            <button type="button" class="vy-expense-del" data-id="${e.id}" aria-label="Supprimer">✕</button>
        </div>`).join('') : '<p class="vy-empty-note">Aucune dépense enregistrée pour l\u2019instant.</p>';

    listEl.querySelectorAll('.vy-expense-del').forEach(b => b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        expensesCache = expensesCache.filter(e => e.id !== Number(b.dataset.id));
        await api('/api/voyages/expenses', { expenses: expensesCache });
        renderExpenseList();
    }));
    listEl.querySelectorAll('.vy-expense-row').forEach(row => row.addEventListener('click', () => startEditExpense(Number(row.dataset.editid))));

    if (!expensesCache.length) { sumEl.innerHTML = ''; return; }
    const people = groupNames.length ? groupNames : [...new Set(expensesCache.map(e => e.paidBy))];
    const total = expensesCache.reduce((s, e) => s + e.amount, 0);
    const balance = {}; people.forEach(p => balance[p] = 0);
    expensesCache.forEach(e => {
        const share = e.splitWith && e.splitWith.length ? e.splitWith : people;
        const per = e.amount / share.length;
        share.forEach(p => { if (p in balance) balance[p] -= per; });
        if (e.paidBy in balance) balance[e.paidBy] += e.amount;
    });
    sumEl.innerHTML = `<div class="vy-summary-row"><span>Total des frais</span><b>${total.toFixed(2)} €</b></div>` +
        people.map(p => {
            const b = balance[p] || 0;
            const txt = b >= 0.01 ? `doit recevoir ${b.toFixed(2)} €` : (b <= -0.01 ? `doit ${Math.abs(b).toFixed(2)} €` : 'équilibré');
            const cls = b >= 0.01 ? 'vy-owed' : (b <= -0.01 ? 'vy-owes' : '');
            return `<div class="vy-summary-row"><span>${esc(p)}</span><b class="${cls}">${txt}</b></div>`;
        }).join('');
}
function startEditExpense(id) {
    const e = expensesCache.find(x => x.id === id);
    if (!e) return;
    editingExpenseId = id;
    $('expLabel').value = e.label;
    $('expAmount').value = e.amount;
    $('expPaidByRow').dataset.selected = e.paidBy;
    highlightPaidBy(e.paidBy);
    expSplitSelection = e.splitWith && e.splitWith.length ? [...e.splitWith] : [...groupNames];
    renderSplitRow();
    $('expAdd').textContent = 'Modifier la dépense';
    $('expCancelEdit').hidden = false;
    $('expenseForm').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}
function resetExpenseForm() {
    editingExpenseId = null;
    $('expLabel').value = ''; $('expAmount').value = '';
    $('expPaidByRow').dataset.selected = ''; highlightPaidBy('');
    expSplitSelection = [...groupNames]; renderSplitRow();
    $('expAdd').textContent = 'Ajouter la dépense';
    $('expCancelEdit').hidden = true;
}
const expAddBtn = $('expAdd');
if (expAddBtn) {
    expAddBtn.addEventListener('click', async () => {
        const label = $('expLabel').value.trim();
        const amount = Number($('expAmount').value);
        const paidBy = $('expPaidByRow').dataset.selected;
        if (!label || !amount || !paidBy) return;
        if (editingExpenseId) {
            const e = expensesCache.find(x => x.id === editingExpenseId);
            if (e) { e.label = label; e.amount = amount; e.paidBy = paidBy; e.splitWith = [...expSplitSelection]; }
        } else {
            expensesCache.push({ id: Date.now() + Math.floor(Math.random() * 1000), label, amount, paidBy, splitWith: [...expSplitSelection], ts: Date.now() });
        }
        await api('/api/voyages/expenses', { expenses: expensesCache });
        resetExpenseForm();
        renderExpenseList();
    });
    ['expLabel', 'expAmount'].forEach(id => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); expAddBtn.click(); } }));
}
const expCancelBtn = $('expCancelEdit');
if (expCancelBtn) expCancelBtn.addEventListener('click', resetExpenseForm);

// =====================================================================
//  PORTAIL PRIVÉ : un mot de passe partagé débloque prénoms, matériel
//  et frais. Une fois entré, l'appareil s'en souvient. À noter, en toute
//  franchise : ce verrou est côté client, il décourage les curieux du
//  salon mais n'empêche pas un accès technique direct à l'API.
// =====================================================================
const GATE_PASSWORD = 'ERQUY';
const lockGate = $('lockGate');
const privateZone = $('privateZone');
const keyJump = $('keyJump');

function unlockPrivateZone(remember) {
    if (remember) localStorage.setItem('vy_unlocked', '1');
    lockGate.hidden = true;
    privateZone.hidden = false;
    keyJump.hidden = false;
    Promise.all([loadNames(), loadChecklists()]).then(() => {
        loadGear(); loadExpenses(); renderChecklistTabs();
    });
    startLiveSync();
}

// Actualise en tâche de fond ce que les deux autres ont pu changer de leur côté,
// sans jamais couper une saisie en cours (on attend que le champ perde le focus).
let liveSyncTimer = null;
function isTypingInPrivateZone() {
    const el = document.activeElement;
    return !!(el && privateZone.contains(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'));
}
function startLiveSync() {
    if (liveSyncTimer) return;
    liveSyncTimer = setInterval(async () => {
        if (privateZone.hidden || isTypingInPrivateZone()) return;
        await loadNames();
        loadGear();
        if (!editingExpenseId) loadExpenses();
        await loadChecklists();
        renderChecklistTabs();
    }, 6000);
}
const lockSubmitBtn = $('lockSubmit');
const lockInput = $('lockInput');
const lockError = $('lockError');
if (lockSubmitBtn) {
    lockSubmitBtn.addEventListener('click', () => {
        if (lockInput.value.trim().toUpperCase() === GATE_PASSWORD) {
            lockError.hidden = true;
            unlockPrivateZone(true);
        } else {
            lockError.hidden = false;
            lockInput.value = '';
        }
    });
    lockInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lockSubmitBtn.click(); } });
}
if (keyJump) {
    keyJump.addEventListener('click', () => {
        $('lockGateSection').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
}
if (localStorage.getItem('vy_unlocked') === '1') unlockPrivateZone(false);


// =====================================================================
//  VOS LISTES : un onglet par prénom, partagées entre vos téléphones.
// =====================================================================
let checklistsCache = {};
let activeChecklistTab = null;
const DEFAULT_CHECKLIST = ['Chaussures de randonnée montantes', 'Veste imperméable', 'Polaire', 'Gourde 2 litres',
    'Trousse de premiers soins personnelle', 'Chargeur et batterie externe', 'Cartes hors ligne téléchargées', 'Lampe frontale'];

async function loadChecklists() {
    const { data } = await api('/api/voyages/checklists');
    checklistsCache = data.lists || {};
}
async function saveChecklists() {
    await api('/api/voyages/checklists', { lists: checklistsCache });
}
function renderChecklistTabs() {
    const host = $('checklistTabs');
    if (!host) return;
    if (!groupNames.length) {
        host.innerHTML = '';
        $('checklist').innerHTML = '<p class="vy-empty-note">Renseignez vos prénoms plus haut pour créer vos listes.</p>';
        return;
    }
    if (!activeChecklistTab || !groupNames.includes(activeChecklistTab)) activeChecklistTab = groupNames[0];
    host.innerHTML = groupNames.map((n, i) => `<button type="button" class="vy-tab${n === activeChecklistTab ? ' vy-tab-on' : ''}" data-tab="${esc(n)}">${avatarChip(i, n)}${esc(n)}</button>`).join('');
    host.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { activeChecklistTab = b.dataset.tab; renderChecklistTabs(); renderChecklist(); }));
    renderChecklist();
}
function currentChecklistItems() {
    if (!activeChecklistTab) return [];
    if (!checklistsCache[activeChecklistTab]) checklistsCache[activeChecklistTab] = DEFAULT_CHECKLIST.map(t => ({ text: t, done: false }));
    return checklistsCache[activeChecklistTab];
}
function renderChecklist() {
    const host = $('checklist');
    if (!host || !activeChecklistTab) return;
    const items = currentChecklistItems();
    host.innerHTML = items.map((it, i) => `
        <div class="vy-check-item${it.done ? ' vy-checked' : ''}" data-i="${i}">
            <span class="vy-check-box"></span>
            <span class="vy-check-label">${esc(it.text)}</span>
            <button type="button" class="vy-check-del" data-del="${i}" aria-label="Retirer">✕</button>
        </div>`).join('');
    host.querySelectorAll('.vy-check-item').forEach(row => row.addEventListener('click', (e) => {
        if (e.target.closest('.vy-check-del')) return;
        const items2 = currentChecklistItems();
        const i = Number(row.dataset.i);
        items2[i].done = !items2[i].done;
        saveChecklists();
        row.classList.toggle('vy-checked');
        row.classList.remove('vy-crumple'); void row.offsetWidth; row.classList.add('vy-crumple');
    }));
    host.querySelectorAll('.vy-check-del').forEach(b => b.addEventListener('click', () => {
        currentChecklistItems().splice(Number(b.dataset.del), 1);
        saveChecklists();
        renderChecklist();
    }));
}
const checklistAddBtn = $('checklistAdd');
if (checklistAddBtn) {
    checklistAddBtn.addEventListener('click', () => {
        const inp = $('checklistInput');
        const text = inp.value.trim();
        if (!text || !activeChecklistTab) return;
        currentChecklistItems().push({ text, done: false });
        saveChecklists();
        inp.value = '';
        renderChecklist();
    });
    $('checklistInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); checklistAddBtn.click(); } });
}

// =====================================================================
//  ÉCRAN DE CHARGEMENT.
// =====================================================================
window.addEventListener('load', () => {
    setTimeout(() => document.body.classList.remove('vy-loading'), 350);
});

// =====================================================================
//  BARRE DE PROGRESSION GLOBALE (toute la page, pas seulement le sentier).
// =====================================================================
const topbarFill = $('topbarFill');
function updateTopbar() {
    if (!topbarFill) return;
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    topbarFill.style.width = (p * 100).toFixed(1) + '%';
}
window.addEventListener('scroll', () => requestAnimationFrame(updateTopbar), { passive: true });
updateTopbar();

// =====================================================================
//  CURSEUR PERSONNALISÉ (ordinateur uniquement, jamais sur tactile).
// =====================================================================
const customCursor = $('customCursor');
if (customCursor && window.matchMedia('(pointer: fine)').matches) {
    document.body.classList.add('vy-cursor-active');
    window.addEventListener('mousemove', (e) => {
        customCursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        customCursor.classList.add('vy-cursor-on');
    });
    window.addEventListener('mouseleave', () => customCursor.classList.remove('vy-cursor-on'));
    const compassZone = $('voyageMap');
    if (compassZone) {
        compassZone.addEventListener('mouseenter', () => customCursor.classList.add('vy-cursor-compass'));
        compassZone.addEventListener('mouseleave', () => customCursor.classList.remove('vy-cursor-compass'));
    }
    document.querySelectorAll('.vy-day-card, .vy-connector').forEach(el => {
        el.addEventListener('mouseenter', () => customCursor.classList.add('vy-cursor-foot'));
        el.addEventListener('mouseleave', () => customCursor.classList.remove('vy-cursor-foot'));
    });
    document.querySelectorAll('button, a, input, .vy-avatar-btn').forEach(el => {
        el.addEventListener('mouseenter', () => customCursor.classList.add('vy-cursor-point'));
        el.addEventListener('mouseleave', () => customCursor.classList.remove('vy-cursor-point'));
    });
}

// =====================================================================
//  TITRES RÉVÉLÉS MOT PAR MOT.
// =====================================================================
document.querySelectorAll('.vy-day-title').forEach(el => {
    // Découpe en mots sans casser les balises internes simples (<br>).
    const words = el.innerHTML.split(/(\s+|<br>)/).filter(Boolean);
    el.innerHTML = words.map((w, i) => {
        if (/^\s+$/.test(w) || w === '<br>') return w;
        return `<span class="vy-word" style="--i:${i}">${w}</span>`;
    }).join('');
});

// =====================================================================
//  MÉTÉO RÉELLE (Open-Meteo, sans clé, se met à jour à chaque visite).
// =====================================================================
(async function loadWeather() {
    const widget = $('weatherWidget');
    const row = $('weatherRow');
    if (!widget || !row) return;
    widget.hidden = false;
    row.innerHTML = '<p class="vy-weather-loading">Chargement des prévisions...</p>';
    try {
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=48.3647&longitude=-3.7456' +
            '&daily=weathercode,weather_code,temperature_2m_max,precipitation_probability_max&timezone=Europe%2FParis&forecast_days=10';
        const res = await fetch(url);
        if (!res.ok) throw new Error('reponse ' + res.status);
        const data = await res.json();
        const daily = data.daily;
        const codes = daily && (daily.weathercode || daily.weather_code);
        if (!daily || !codes) throw new Error('format inattendu');
        const codeIcon = (c) => (c === 0 ? '☀️' : c <= 3 ? '⛅' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌦️' : '⛈️');
        const days = daily.time.slice(0, 7);
        row.innerHTML = days.map((d, i) => {
            const date = new Date(d + 'T12:00:00');
            const label = date.toLocaleDateString('fr-FR', { weekday: 'short' });
            return `<div class="vy-weather-day">
                <b>${label}</b>
                <span class="vy-w-ico">${codeIcon(codes[i])}</span>
                <span class="vy-w-temp">${Math.round(daily.temperature_2m_max[i])}°</span>
                <span class="vy-w-rain">${daily.precipitation_probability_max[i]}%</span>
            </div>`;
        }).join('');
    } catch (e) {
        row.innerHTML = '<p class="vy-weather-loading">Prévisions indisponibles pour l\u2019instant, réessayez plus tard.</p>';
    }
})();

// =====================================================================
//  GALERIE PLEIN ÉCRAN pour les photos de chaque jour.
// =====================================================================
const lightbox = $('lightbox');
const lightboxImg = $('lightboxImg');
const lightboxCaption = $('lightboxCaption');
let galleryImages = [], galleryIndex = 0;
function buildGallery() {
    galleryImages = [...document.querySelectorAll('.vy-day-photo img')].filter(img => !img.parentElement.classList.contains('vy-photo-empty'));
}
function openLightbox(index) {
    buildGallery();
    if (!galleryImages.length) return;
    galleryIndex = Math.max(0, Math.min(galleryImages.length - 1, index));
    showLightboxImage();
    lightbox.classList.add('vy-lightbox-on');
}
function showLightboxImage() {
    const img = galleryImages[galleryIndex];
    lightboxImg.src = img.src;
    lightboxImg.style.transform = 'scale(1)';
    lightboxCaption.textContent = img.alt || '';
}
document.querySelectorAll('.vy-day-photo').forEach((photo, i) => {
    photo.addEventListener('click', () => { buildGallery(); const img = photo.querySelector('img'); const idx = galleryImages.indexOf(img); if (idx > -1) openLightbox(idx); });
});
$('lightboxClose')?.addEventListener('click', () => lightbox.classList.remove('vy-lightbox-on'));
$('lightboxPrev')?.addEventListener('click', () => { galleryIndex = (galleryIndex - 1 + galleryImages.length) % galleryImages.length; showLightboxImage(); });
$('lightboxNext')?.addEventListener('click', () => { galleryIndex = (galleryIndex + 1) % galleryImages.length; showLightboxImage(); });
let lightboxZoomed = false;
lightboxImg?.addEventListener('dblclick', () => {
    lightboxZoomed = !lightboxZoomed;
    lightboxImg.style.transform = lightboxZoomed ? 'scale(2)' : 'scale(1)';
});

// =====================================================================
//  TÉLÉCHARGER NOS DONNÉES (matériel, frais, listes), en texte lisible.
// =====================================================================
const downloadBtn = $('downloadDataBtn');
if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
        const [gearRes, expRes, listsRes] = await Promise.all([
            api('/api/voyages/gear'), api('/api/voyages/expenses'), api('/api/voyages/checklists'),
        ]);
        const lines = [];
        lines.push('LA BOUCLE DES MONTS D\u2019ARRÉE, données du groupe');
        lines.push('Exporté le ' + new Date().toLocaleDateString('fr-FR'));
        lines.push('');
        lines.push('MATÉRIEL');
        (gearRes.data.categories || []).forEach(cat => {
            lines.push(`  ${cat.name}`);
            cat.items.forEach(it => lines.push(`    - ${it.name}${it.person ? ' (' + it.person + ')' : ''}`));
        });
        lines.push('');
        lines.push('FRAIS');
        (expRes.data.expenses || []).forEach(e => {
            lines.push(`  ${e.label} : ${e.amount.toFixed(2)} \u20ac, payé par ${e.paidBy}`);
        });
        lines.push('');
        lines.push('LISTES PERSONNELLES');
        Object.entries(listsRes.data.lists || {}).forEach(([name, items]) => {
            lines.push(`  ${name}`);
            items.forEach(it => lines.push(`    ${it.done ? '[x]' : '[ ]'} ${it.text}`));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'monts-arree-donnees.txt';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
}