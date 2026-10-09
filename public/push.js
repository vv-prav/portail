// =====================================================================
//  ÊTRE PRÉVENU — le côté navigateur
//
//  ⚠️ iOS NE DÉLIVRE QU'À UNE WEBAPP INSTALLÉE SUR L'ÉCRAN D'ACCUEIL
//  (16.4 et au-delà). Dans Safari, `Notification` n'existe même pas tant
//  que la page n'est pas installée. On le DIT en clair plutôt que de
//  laisser un interrupteur qui ne marche pas : « Ajoute d'abord le salon
//  à ton écran d'accueil » est une consigne, un bouton mort est une panne.
//
//  ⚠️ LA PERMISSION SE DEMANDE DEPUIS UN GESTE, jamais au chargement.
//  Safari refuse sèchement sinon, et un navigateur à qui l'on a dit non
//  une fois ne le redemande plus : une demande automatique à l'ouverture
//  brûlerait l'autorisation de tout le salon en une après-midi.
// =====================================================================
(function () {
    if (window.Push) return;

    const SUPPORTE = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    // Sur iOS, la webapp installée répond `true` ; l'onglet Safari, non.
    const INSTALLEE = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const IOS = /iP(hone|ad|od)/.test(navigator.userAgent);

    function pourquoiPas() {
        if (SUPPORTE) return null;
        if (IOS && !INSTALLEE) {
            return 'Ajoute d’abord le salon à ton écran d’accueil : sur iPhone, ' +
                   'c’est la seule façon de recevoir des notifications.';
        }
        return 'Ce navigateur ne sait pas recevoir de notifications.';
    }

    // base64url → Uint8Array, ce qu'attend `applicationServerKey`.
    function versOctets(b64) {
        const p = '='.repeat((4 - b64.length % 4) % 4);
        const brut = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from([...brut].map(c => c.charCodeAt(0)));
    }

    async function etat() {
        if (!SUPPORTE) return { possible: false, raison: pourquoiPas(), actif: false };
        let actif = false;
        try {
            const reg = await navigator.serviceWorker.getRegistration('/');
            actif = !!(reg && await reg.pushManager.getSubscription());
        } catch (e) {}
        return { possible: true, actif, permission: Notification.permission };
    }

    async function activer() {
        if (!SUPPORTE) return { ok: false, erreur: pourquoiPas() };
        try {
            // ⚠️ Le service worker du push, et lui seul : `sw.js` sert le
            // cache de Voyages et n'a rien à faire à la racine.
            const reg = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
            await navigator.serviceWorker.ready;

            const perm = await Notification.requestPermission();
            if (perm !== 'granted') {
                return { ok: false, erreur: perm === 'denied'
                    ? 'Tu as refusé les notifications. Il faut les réautoriser dans les réglages du téléphone.'
                    : 'Autorisation non accordée.' };
            }

            const { cle } = await (await fetch('/api/push/cle')).json();
            const abo = await reg.pushManager.subscribe({
                userVisibleOnly: true,            // exigé par les navigateurs
                applicationServerKey: versOctets(cle),
            });
            const r = await fetch('/api/push/abonner', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ abonnement: abo.toJSON() }),
            });
            if (!r.ok) return { ok: false, erreur: 'Le salon n’a pas pu enregistrer l’abonnement.' };
            return { ok: true };
        } catch (e) {
            return { ok: false, erreur: 'Impossible d’activer : ' + (e && e.message ? e.message : 'erreur inconnue') };
        }
    }

    async function couper() {
        try {
            const reg = await navigator.serviceWorker.getRegistration('/');
            const abo = reg && await reg.pushManager.getSubscription();
            if (abo) { await abo.unsubscribe(); }
            await fetch('/api/push/desabonner', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: abo ? abo.endpoint : null }),
            });
        } catch (e) {}
        return { ok: true };
    }

    window.Push = { etat, activer, couper, supporte: SUPPORTE, installee: INSTALLEE };
})();
