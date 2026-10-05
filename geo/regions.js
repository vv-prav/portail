// =====================================================================
//  LES RÉGIONS D'APPRENTISSAGE
//
//  Généré une fois par scripts/genere-regions.js depuis `world-countries`
//  (le champ `subregion` de la norme M49 des Nations unies), croisé avec
//  geo/pays.js qui fait foi pour les noms et pour ce qui est un pays.
//
//  ⚠️ **C'est la seule donnée que l'apprentissage ajoutait.** geo/pays.js
//  ne connaît que cinq régions, dont une Afrique à cinquante-quatre pays :
//  personne n'apprend cinquante-quatre pays d'un coup. Découpées ainsi,
//  les vingt-quatre régions font de deux à dix-sept pays — la taille d'une
//  leçon.
//
//  Les noms français sont écrits à la main : ce sont des libellés qu'on lit,
//  pas des codes. L'ordre (`rang`) est celui dans lequel on les propose —
//  on commence par chez soi, on finit par le Pacifique.
//
//  Dans chaque région, les pays vont du plus vaste au plus petit : on
//  apprend le Nigeria avant la Gambie, et c'est l'ordre dans lequel on les
//  rencontre vraiment.
//
//  24 régions, 194 pays.
// =====================================================================
module.exports = [
{"id":"western-europe","nom":"Europe de l’Ouest","emoji":"🇫🇷","rang":1,"pays":["FR","DE","NL","CH","BE","LU","LI","MC"]},
{"id":"southern-europe","nom":"Europe du Sud","emoji":"🇮🇹","rang":2,"pays":["ES","IT","GR","PT","CY","AD","MT","SM","VA"]},
{"id":"northern-europe","nom":"Europe du Nord","emoji":"🇸🇪","rang":3,"pays":["SE","FI","NO","GB","IS","IE","LT","LV","EE","DK"]},
{"id":"central-europe","nom":"Europe centrale","emoji":"🇵🇱","rang":4,"pays":["PL","HU","AT","CZ","SK","SI"]},
{"id":"southeast-europe","nom":"Europe du Sud-Est","emoji":"🇬🇷","rang":5,"pays":["RO","BG","RS","HR","BA","AL","MK","ME"]},
{"id":"eastern-europe","nom":"Europe de l’Est","emoji":"🇺🇦","rang":6,"pays":["RU","UA","BY","MD"]},
{"id":"northern-africa","nom":"Afrique du Nord","emoji":"🇲🇦","rang":7,"pays":["DZ","SD","LY","EG","MA","TN"]},
{"id":"western-africa","nom":"Afrique de l’Ouest","emoji":"🇸🇳","rang":8,"pays":["NE","ML","MR","NG","CI","BF","GN","GH","SN","BJ","LR","SL","TG","GW","GM","CV"]},
{"id":"middle-africa","nom":"Afrique centrale","emoji":"🇨🇲","rang":9,"pays":["CD","TD","AO","CF","SS","CM","CG","GA","GQ","ST"]},
{"id":"eastern-africa","nom":"Afrique de l’Est","emoji":"🇰🇪","rang":10,"pays":["ET","TZ","MZ","ZM","SO","MG","KE","ZW","UG","MW","ER","BI","RW","DJ","MU","KM","SC"]},
{"id":"southern-africa","nom":"Afrique australe","emoji":"🇿🇦","rang":11,"pays":["ZA","NA","BW","LS","SZ"]},
{"id":"western-asia","nom":"Proche et Moyen-Orient","emoji":"🇹🇷","rang":12,"pays":["SA","TR","YE","IQ","OM","SY","JO","AZ","AE","GE","AM","IL","KW","QA","LB","BH"]},
{"id":"central-asia","nom":"Asie centrale","emoji":"🇰🇿","rang":13,"pays":["KZ","TM","UZ","KG","TJ"]},
{"id":"southern-asia","nom":"Asie du Sud","emoji":"🇮🇳","rang":14,"pays":["IN","IR","PK","AF","BD","NP","LK","BT","MV"]},
{"id":"eastern-asia","nom":"Asie de l’Est","emoji":"🇯🇵","rang":15,"pays":["CN","MN","JP","KP","KR"]},
{"id":"south-eastern-asia","nom":"Asie du Sud-Est","emoji":"🇹🇭","rang":16,"pays":["ID","MM","TH","PH","VN","MY","LA","KH","TL","BN","SG"]},
{"id":"north-america","nom":"Amérique du Nord","emoji":"🇨🇦","rang":17,"pays":["CA","US","MX"]},
{"id":"central-america","nom":"Amérique centrale","emoji":"🇲🇽","rang":18,"pays":["NI","HN","GT","PA","CR","BZ","SV"]},
{"id":"caribbean","nom":"Caraïbes","emoji":"🇨🇺","rang":19,"pays":["CU","DO","HT","BS","JM","TT","DM","LC","AG","BB","VC","GD","KN"]},
{"id":"south-america","nom":"Amérique du Sud","emoji":"🇧🇷","rang":20,"pays":["BR","AR","PE","CO","BO","VE","CL","PY","EC","GY","UY","SR"]},
{"id":"australia-and-new-zealand","nom":"Australie et Nouvelle-Zélande","emoji":"🇦🇺","rang":21,"pays":["AU","NZ"]},
{"id":"melanesia","nom":"Mélanésie","emoji":"🇫🇯","rang":22,"pays":["PG","SB","FJ","VU"]},
{"id":"micronesia","nom":"Micronésie","emoji":"🇫🇲","rang":23,"pays":["KI","FM","PW","MH","NR"]},
{"id":"polynesia","nom":"Polynésie","emoji":"🇼🇸","rang":24,"pays":["WS","TO","TV"]}
];
