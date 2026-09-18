# =====================================================================
#  Génère motlong/mots.js — le dictionnaire du Mot le plus long.
#
#  Lexique383 n'est PAS dans le dépôt (26 Mo) : le télécharger d'abord,
#      curl -o Lexique383.tsv http://www.lexique.org/databases/Lexique383/Lexique383.tsv
#  puis :
#      python3 scripts/genere-motlong.py Lexique383.tsv > motlong/mots.js
#
#  Règles, et pourquoi :
#   · acceptés = toutes les formes attestées de 3 à 9 lettres, pluriels et
#     conjugaisons compris — c'est la règle de l'émission, et refuser
#     « PARTIRONS » à quelqu'un qui l'a trouvé serait injuste.
#   · exclus : mots composés (espace, trait d'union, apostrophe), et ce qui
#     n'est QUE onomatopée (« BZZZ » n'est pas un mot qu'on défend).
#   · tirables = lemmes de 9 lettres, noms, adjectifs ou infinitifs, d'une
#     fréquence d'au moins 3 par million : la réponse montrée à la fin doit
#     être un mot que tout le monde connaît.
# =====================================================================
import csv, collections, json, sys, unicodedata

def norm(w):
    w = w.replace('œ', 'oe').replace('æ', 'ae')
    w = unicodedata.normalize('NFD', w)
    return ''.join(c for c in w if unicodedata.category(c) != 'Mn').upper()

VULGAIRES = {'SALOPERIE', 'BRANLETTE', 'MASTURBER', 'EMMERDANT', 'EMMERDEUR', 'DEGUEULER', 'SODOMISER'}

freq = collections.defaultdict(float)
pas_que_onomatopee = collections.defaultdict(bool)
cible = {}
with open(sys.argv[1], encoding='utf-8') as f:
    for row in csv.DictReader(f, delimiter='\t', quoting=csv.QUOTE_NONE):
        o = row['ortho']
        if not o or any(c in o for c in " -'.0123456789"):
            continue
        n = norm(o)
        if not n.isalpha() or not n.isascii() or not 3 <= len(n) <= 9:
            continue
        fq = max(float(row['freqfilms2'] or 0), float(row['freqlivres'] or 0))
        freq[n] = max(freq[n], fq)
        if row['cgram'] != 'ONO':
            pas_que_onomatopee[n] = True
        if (len(n) == 9 and row['islem'] == '1' and fq >= 3
                and (row['cgram'] in ('NOM', 'ADJ') or (row['cgram'] == 'VER' and 'inf' in row['infover']))):
            cible[n] = max(cible.get(n, 0), fq)

acceptes = [w for w in sorted(freq, key=lambda w: -freq[w]) if pas_que_onomatopee[w]]
tirables = sorted(w for w in cible if w not in VULGAIRES)

print('// FICHIER GÉNÉRÉ par scripts/genere-motlong.py depuis Lexique383 (lexique.org).')
print('// Ne pas éditer à la main : relancer le script. Voir la section du CLAUDE.md.')
print('module.exports = {')
print('    acceptes: ' + json.dumps(' '.join(acceptes)) + ',')
print('    tirables: ' + json.dumps(' '.join(tirables)) + ',')
print('};')
