// =====================================================================
//  LES DRAPEAUX — ce qui se ressemble, et ce qui se range ensemble
//
//  ⚠️ **Le seul contenu de toute la géographie qui ne se dérive d'aucune
//  donnée**, et c'est assumé — comme la liste des pays notoires du quiz.
//  Aucune base ne dit « le drapeau du Tchad et celui de la Roumanie se
//  confondent » : c'est un fait d'usage, pas une propriété mesurable.
//
//  Pourquoi ce fichier existe : les leurres des exercices venaient des
//  pays VOISINS, ce qui est juste pour une silhouette ou une capitale et
//  faux pour un drapeau. Mesuré sur mille tirages, le Tchad n'était
//  JAMAIS proposé avec la Roumanie, Monaco jamais avec l'Indonésie,
//  l'Irlande jamais avec la Côte d'Ivoire, la Norvège jamais avec
//  l'Islande. On s'entraînait donc exactement sur ce qu'on savait déjà.
//
//  Deux tables :
//   · RESSEMBLANTS — des groupes de drapeaux qu'on confond vraiment. Ils
//     servent de leurres en priorité, et nourrissent l'exercice du duel.
//   · FAMILLES — les grands ensembles qui s'apprennent d'un coup. Un
//     drapeau n'est pas une image à retenir, c'est une règle à comprendre
//     puis une variante à distinguer.
//
//  Un pays peut appartenir à plusieurs groupes et à plusieurs familles :
//  le Mali est à la fois un tricolore vertical et un drapeau panafricain.
// =====================================================================

// ---------------------------------------------------------------------
//  CE QU'ON CONFOND
//  Chaque groupe réunit des drapeaux qu'on prend l'un pour l'autre, avec
//  ce qui les sépare — parce que savoir QUOI regarder est tout ce qui
//  manque, la plupart du temps.
// ---------------------------------------------------------------------
const RESSEMBLANTS = [
    { pays: ['TD', 'RO'], quoi: 'Bleu, jaune, rouge en bandes verticales',
      distinguer: 'Le bleu du Tchad est plus sombre que celui de la Roumanie — c’est tout.' },
    { pays: ['TD', 'RO', 'AD', 'MD'], quoi: 'Le tricolore bleu-jaune-rouge',
      distinguer: 'Andorre et la Moldavie portent des armoiries au centre ; le Tchad et la Roumanie, rien.' },
    { pays: ['MC', 'ID', 'PL'], quoi: 'Deux bandes horizontales rouge et blanche',
      distinguer: 'Monaco et l’Indonésie ont le rouge en haut, la Pologne le blanc. Celui de l’Indonésie est plus long.' },
    { pays: ['IE', 'CI'], quoi: 'Vert, blanc, orange en bandes verticales',
      distinguer: 'L’Irlande a le vert près du mât, la Côte d’Ivoire l’orange. Ce sont deux miroirs.' },
    { pays: ['IE', 'IT', 'MX'], quoi: 'Le tricolore vertical à bande blanche centrale',
      distinguer: 'L’Italie finit par du rouge, l’Irlande par de l’orange, le Mexique porte un aigle.' },
    { pays: ['NO', 'IS'], quoi: 'Une croix nordique bleue et blanche sur rouge, ou l’inverse',
      distinguer: 'La Norvège est rouge à croix bleue bordée de blanc ; l’Islande bleue à croix rouge bordée de blanc.' },
    { pays: ['SI', 'SK', 'RU'], quoi: 'Blanc, bleu, rouge en bandes horizontales',
      distinguer: 'La Russie n’a aucun emblème. La Slovénie et la Slovaquie en portent un, placé à gauche.' },
    { pays: ['NL', 'LU', 'PY'], quoi: 'Rouge, blanc, bleu en bandes horizontales',
      distinguer: 'Le bleu du Luxembourg est plus clair et son drapeau plus long. Le Paraguay porte un emblème central.' },
    { pays: ['CO', 'EC', 'VE'], quoi: 'Jaune, bleu, rouge en bandes horizontales',
      distinguer: 'La Colombie n’a rien, l’Équateur des armoiries, le Venezuela un arc d’étoiles blanches.' },
    { pays: ['AU', 'NZ'], quoi: 'L’Union Jack au canton, sur fond bleu, avec la Croix du Sud',
      distinguer: 'L’Australie a six étoiles blanches dont une grande sous l’Union Jack ; la Nouvelle-Zélande quatre étoiles rouges.' },
    { pays: ['EG', 'IQ', 'SY', 'YE'], quoi: 'Rouge, blanc, noir en bandes horizontales',
      distinguer: 'Le Yémen n’a rien au centre, l’Égypte un aigle doré, la Syrie deux étoiles vertes, l’Irak une inscription verte.' },
    { pays: ['AT', 'LV'], quoi: 'Rouge, blanc, rouge en bandes horizontales',
      distinguer: 'Le rouge letton tire sur le brun et sa bande blanche est plus fine.' },
    { pays: ['ML', 'GN', 'SN', 'CM'], quoi: 'Vert, jaune, rouge en bandes verticales',
      distinguer: 'Le Mali n’a rien, le Sénégal une étoile verte, le Cameroun une étoile jaune. La Guinée est l’ordre inverse de celui du Mali.' },
    { pays: ['BO', 'GH', 'LT'], quoi: 'Rouge, jaune et vert en bandes horizontales',
      distinguer: 'Le Ghana porte une étoile noire. La Lituanie range le jaune en haut et le vert au milieu.' },
    { pays: ['IR', 'TJ', 'HU', 'BG'], quoi: 'Vert ou blanc, puis blanc, puis rouge',
      distinguer: 'La Hongrie va du rouge au vert, la Bulgarie du blanc au rouge en passant par le vert. L’Iran et le Tadjikistan portent un emblème.' },
    { pays: ['TR', 'TN'], quoi: 'Un croissant et une étoile blancs sur rouge',
      distinguer: 'La Tunisie enferme son croissant dans un disque blanc ; la Turquie le pose à même le rouge.' },
    { pays: ['DZ', 'PK'], quoi: 'Vert et blanc, croissant et étoile',
      distinguer: 'L’Algérie est coupée verticalement en deux moitiés égales ; le Pakistan n’a qu’une bande blanche au mât.' },
    { pays: ['SE', 'FI'], quoi: 'Une croix nordique sur fond uni',
      distinguer: 'La Suède est bleue à croix jaune, la Finlande blanche à croix bleue.' },
    { pays: ['DK', 'IS', 'NO'], quoi: 'Une croix nordique sur fond rouge ou bleu',
      distinguer: 'Le Danemark n’a qu’une croix blanche sur rouge. La Norvège ajoute une croix bleue dedans ; l’Islande est bleue avec une croix rouge bordée de blanc.' },
    { pays: ['DK', 'SE', 'NO', 'FI', 'IS'], quoi: 'Les cinq croix nordiques',
      distinguer: 'Regarde d’abord le fond : rouge pour le Danemark et la Norvège, bleu pour la Suède et l’Islande, blanc pour la Finlande.' },
    { pays: ['QA', 'BH'], quoi: 'Blanc et rouge séparés par une ligne dentelée',
      distinguer: 'Le Qatar tire sur le pourpre et a neuf dents ; Bahreïn est rouge vif et en a cinq.' },
    { pays: ['NE', 'IN'], quoi: 'Orange, blanc, vert avec un rond au centre',
      distinguer: 'L’Inde porte une roue bleue à vingt-quatre rayons ; le Niger un disque orange plein.' },
    { pays: ['JP', 'BD', 'PW'], quoi: 'Un disque plein sur fond uni',
      distinguer: 'Le Japon est rouge sur blanc, le Bangladesh rouge sur vert, les Palaos jaune sur bleu — et leur disque est décentré.' },
    { pays: ['VN', 'MA', 'CN'], quoi: 'Une ou plusieurs étoiles sur fond rouge',
      distinguer: 'Le Viêt Nam a une étoile jaune centrée, le Maroc un pentagramme vert ajouré, la Chine cinq étoiles au canton.' },
    { pays: ['US', 'LR', 'MY'], quoi: 'Des bandes rouges et blanches avec un canton',
      distinguer: 'Le Liberia n’a qu’une étoile, la Malaisie un croissant jaune, les États-Unis cinquante étoiles.' },
    { pays: ['CU', 'PR'], quoi: 'Cinq bandes, un triangle et une étoile',
      distinguer: 'Cuba a le triangle rouge et les bandes bleues ; Porto Rico l’inverse exact.' },
    { pays: ['CL', 'CU'], quoi: 'Une étoile blanche dans un quartier de couleur',
      distinguer: 'Le Chili n’a que deux bandes et un carré bleu ; Cuba cinq bandes et un triangle.' },
    { pays: ['AR', 'UY'], quoi: 'Bleu ciel et blanc, avec un soleil',
      distinguer: 'L’Argentine a trois bandes et le soleil au centre ; l’Uruguay neuf bandes et le soleil au canton.' },
    { pays: ['BE', 'DE'], quoi: 'Noir, jaune, rouge',
      distinguer: 'La Belgique est verticale, l’Allemagne horizontale.' },
    { pays: ['PL', 'CZ'], quoi: 'Blanc et rouge',
      distinguer: 'La Tchéquie ajoute un triangle bleu au mât.' },
    { pays: ['CZ', 'PH'], quoi: 'Deux bandes et un triangle au mât',
      distinguer: 'Les Philippines ont un triangle blanc avec soleil et étoiles, et leurs bandes sont bleue et rouge.' },
    { pays: ['GE', 'CH'], quoi: 'Des croix rouges sur blanc',
      distinguer: 'La Suisse est carrée avec une seule croix ; la Géorgie en a cinq.' },
    { pays: ['DK', 'CH'], quoi: 'Une croix blanche sur rouge',
      distinguer: 'La croix danoise est décalée vers le mât ; la suisse est centrée, et le drapeau carré.' },
    { pays: ['PT', 'MG'], quoi: 'Vert, rouge et blanc en parts inégales',
      distinguer: 'Madagascar a une bande blanche verticale au mât ; le Portugal des armoiries sur la ligne de partage.' },
    { pays: ['ES', 'CO'], quoi: 'Jaune et rouge en bandes horizontales',
      distinguer: 'L’Espagne n’a que du rouge et du jaune, avec des armoiries ; la Colombie ajoute du bleu.' },
    { pays: ['ZA', 'SS'], quoi: 'Un chevron au mât et plusieurs bandes',
      distinguer: 'Le Soudan du Sud a un chevron bleu avec une étoile jaune ; l’Afrique du Sud un Y vert bordé de blanc et d’or.' },
    { pays: ['JO', 'PS', 'SD'], quoi: 'Un chevron rouge et trois bandes',
      distinguer: 'La Jordanie porte une étoile blanche à sept branches dans le chevron.' },
    { pays: ['KW', 'AE'], quoi: 'Vert, blanc, noir et une marque rouge',
      distinguer: 'Les Émirats ont une bande rouge verticale au mât ; le Koweït un trapèze noir.' },
    { pays: ['MY', 'ID'], quoi: 'Du rouge et du blanc en bandes',
      distinguer: 'L’Indonésie n’a que deux bandes et aucun canton.' },
    { pays: ['FR', 'NL', 'RU'], quoi: 'Bleu, blanc, rouge',
      distinguer: 'La France est verticale. Les Pays-Bas et la Russie sont horizontaux, dans l’ordre inverse l’un de l’autre.' },
    { pays: ['IT', 'HU', 'BG'], quoi: 'Vert, blanc, rouge',
      distinguer: 'L’Italie est verticale ; la Hongrie et la Bulgarie horizontales, et la Bulgarie met le blanc en haut.' },
    { pays: ['GN', 'IT'], quoi: 'Trois bandes verticales à centre jaune ou blanc',
      distinguer: 'La Guinée est rouge-jaune-vert, l’Italie vert-blanc-rouge.' },
    { pays: ['LU', 'NL'], quoi: 'Rouge, blanc, bleu',
      distinguer: 'Rien d’autre que la nuance du bleu, plus claire au Luxembourg.' },
    { pays: ['SK', 'SI'], quoi: 'Blanc, bleu, rouge avec un emblème',
      distinguer: 'L’emblème slovène montre trois étoiles et le mont Triglav ; le slovaque une croix sur trois collines.' },
    { pays: ['CF', 'MU'], quoi: 'Quatre bandes de couleurs vives',
      distinguer: 'La Centrafrique a une bande rouge verticale et une étoile ; Maurice n’a que quatre bandes horizontales.' },
    { pays: ['GA', 'AM'], quoi: 'Trois bandes horizontales de couleurs franches',
      distinguer: 'Le Gabon est vert-jaune-bleu, l’Arménie rouge-bleu-orange.' },
    { pays: ['LT', 'BO'], quoi: 'Jaune, vert et rouge',
      distinguer: 'La Lituanie met le jaune en haut et le rouge en bas ; la Bolivie commence par le rouge.' },
];

// ---------------------------------------------------------------------
//  LES FAMILLES
//  ⚠️ Un drapeau ne s'apprend pas comme une image à retenir, mais comme
//  une RÈGLE à comprendre puis une variante à distinguer. Les croix
//  nordiques se retiennent en bloc une fois qu'on a vu la règle ; une par
//  une, elles ne tiennent pas.
// ---------------------------------------------------------------------
const FAMILLES = [
    { id: 'nordique', nom: 'Les croix nordiques', emoji: '✝️',
      regle: 'Une croix décalée vers le mât, héritée du drapeau danois — le plus vieux du monde encore en usage.',
      pays: ['DK', 'SE', 'NO', 'FI', 'IS'] },
    { id: 'panafricain', nom: 'Les couleurs panafricaines', emoji: '🌍',
      regle: 'Le vert, le jaune et le rouge de l’Éthiopie, seul pays d’Afrique jamais colonisé durablement. Les indépendances les ont reprises.',
      pays: ['ET', 'GH', 'SN', 'ML', 'GN', 'CM', 'TG', 'BJ', 'BF', 'GW', 'CG'] },
    { id: 'panarabe', nom: 'Les couleurs panarabes', emoji: '🕌',
      regle: 'Le rouge, le blanc, le noir et le vert de la révolte arabe de 1916 — chaque couleur rappelle une dynastie.',
      pays: ['EG', 'IQ', 'SY', 'YE', 'JO', 'SD', 'KW', 'AE', 'PS'] },
    { id: 'croissant', nom: 'Le croissant et l’étoile', emoji: '🌙',
      regle: 'Hérité de l’Empire ottoman, repris par plusieurs pays musulmans — mais pas tous, et il n’est pas un symbole religieux à l’origine.',
      pays: ['TR', 'TN', 'DZ', 'PK', 'MR', 'LY', 'MY', 'MV', 'AZ', 'TM', 'KM', 'UZ'] },
    { id: 'union-jack', nom: 'L’Union Jack au canton', emoji: '🇬🇧',
      regle: 'Le drapeau britannique dans le coin supérieur gauche, souvenir de l’Empire.',
      pays: ['AU', 'NZ', 'FJ', 'TV'] },
    { id: 'croix-du-sud', nom: 'La Croix du Sud', emoji: '✨',
      regle: 'La constellation qui sert de boussole dans l’hémisphère sud.',
      pays: ['AU', 'NZ', 'BR', 'PG', 'WS'] },
    { id: 'tricolore-vertical', nom: 'Les tricolores verticaux', emoji: '🇫🇷',
      regle: 'Trois bandes verticales, modèle né du drapeau français et repris partout.',
      pays: ['FR', 'IT', 'IE', 'BE', 'RO', 'TD', 'ML', 'GN', 'NG', 'CI', 'MX', 'PE', 'AD', 'MD'] },
    { id: 'soleil', nom: 'Les drapeaux à soleil', emoji: '☀️',
      regle: 'Un soleil, levant ou rayonnant, souvent emblème de renaissance nationale.',
      pays: ['JP', 'AR', 'UY', 'BD', 'NE', 'KZ', 'KG', 'RW', 'MK', 'AG', 'PH', 'NA', 'MW'] },
    { id: 'slave', nom: 'Les couleurs panslaves', emoji: '🏳️',
      regle: 'Le blanc, le bleu et le rouge du drapeau russe, repris par les nations slaves au XIXᵉ siècle.',
      pays: ['RU', 'SK', 'SI', 'HR', 'RS', 'CZ', 'BG'] },
    { id: 'etoiles', nom: 'Les drapeaux étoilés', emoji: '⭐',
      regle: 'Une étoile par État, par province ou par principe — il faut toujours savoir ce qu’elles comptent.',
      pays: ['US', 'CN', 'BR', 'VE', 'UZ', 'HN', 'SY', 'VN', 'MA', 'SO', 'TR', 'SN', 'CM', 'GH'] },
];

// ---------------------------------------------------------------------
//  LES INDEX
// ---------------------------------------------------------------------
// Pour un pays donné, tous ceux avec lesquels on le confond.
const CONFUSIONS = new Map();
for (const g of RESSEMBLANTS) {
    for (const a of g.pays) {
        if (!CONFUSIONS.has(a)) CONFUSIONS.set(a, new Set());
        for (const b of g.pays) if (b !== a) CONFUSIONS.get(a).add(b);
    }
}
function confondsAvec(code) {
    return [...(CONFUSIONS.get(code) || [])];
}
// Le groupe qui explique une confusion : ce qu'on doit regarder.
function pourquoiOnConfond(a, b) {
    return RESSEMBLANTS.find(g => g.pays.includes(a) && g.pays.includes(b)) || null;
}
const familleDe = (code) => FAMILLES.filter(f => f.pays.includes(code));

module.exports = { RESSEMBLANTS, FAMILLES, confondsAvec, pourquoiOnConfond, familleDe };
