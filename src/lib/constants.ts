// West African countries (ECOWAS + Mauritania) — main cities
export const WEST_AFRICA_LOCATIONS: Record<string, string[]> = {
  Sénégal: [
    "Dakar", "Thiès", "Saint-Louis", "Mbour", "Rufisque", "Touba",
    "Kaolack", "Ziguinchor", "Diourbel", "Louga", "Tambacounda",
    "Kolda", "Fatick", "Matam", "Kaffrine", "Kédougou", "Sédhiou",
    "Keur Massar", "Guédiawaye", "Pikine",
  ],
  "Côte d'Ivoire": [
    "Abidjan", "Bouaké", "Yamoussoukro", "Daloa", "San-Pédro",
    "Korhogo", "Man", "Gagnoa", "Divo", "Anyama", "Abengourou",
  ],
  Mali: [
    "Bamako", "Sikasso", "Mopti", "Koutiala", "Ségou", "Kayes",
    "Gao", "Tombouctou", "Kidal",
  ],
  "Burkina Faso": [
    "Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Banfora",
    "Ouahigouya", "Pouytenga", "Kaya", "Tenkodogo",
  ],
  Niger: [
    "Niamey", "Zinder", "Maradi", "Agadez", "Tahoua", "Dosso",
    "Tillabéri", "Diffa",
  ],
  Guinée: [
    "Conakry", "Nzérékoré", "Kankan", "Kindia", "Labé", "Boké",
    "Mamou", "Faranah",
  ],
  "Guinée-Bissau": [
    "Bissau", "Bafatá", "Gabú", "Bissorã", "Bolama", "Cacheu", "Canchungo",
  ],
  Bénin: [
    "Cotonou", "Porto-Novo", "Parakou", "Djougou", "Bohicon",
    "Abomey", "Natitingou", "Lokossa",
  ],
  Togo: [
    "Lomé", "Sokodé", "Kara", "Kpalimé", "Atakpamé", "Dapaong",
    "Tsévié", "Aného",
  ],
  Ghana: [
    "Accra", "Kumasi", "Tamale", "Sekondi-Takoradi", "Cape Coast",
    "Sunyani", "Ho", "Koforidua", "Tema",
  ],
  Nigeria: [
    "Lagos", "Abuja", "Kano", "Ibadan", "Port Harcourt", "Benin City",
    "Kaduna", "Enugu", "Onitsha", "Aba", "Jos", "Maiduguri",
  ],
  Liberia: [
    "Monrovia", "Gbarnga", "Buchanan", "Kakata", "Voinjama", "Harper",
  ],
  "Sierra Leone": [
    "Freetown", "Bo", "Kenema", "Makeni", "Koidu", "Lunsar",
  ],
  Gambie: [
    "Banjul", "Serekunda", "Brikama", "Bakau", "Farafenni", "Basse Santa Su",
  ],
  Mauritanie: [
    "Nouakchott", "Nouadhibou", "Rosso", "Kaédi", "Zouérat", "Atar", "Néma",
  ],
  "Cap-Vert": [
    "Praia", "Mindelo", "Santa Maria", "Assomada", "São Filipe", "Espargos",
  ],
};

// Indicatifs téléphoniques par pays (Afrique de l'Ouest)
export const COUNTRY_DIAL_CODES: Record<string, string> = {
  Sénégal: "+221",
  "Côte d'Ivoire": "+225",
  Mali: "+223",
  "Burkina Faso": "+226",
  Niger: "+227",
  Guinée: "+224",
  "Guinée-Bissau": "+245",
  Bénin: "+229",
  Togo: "+228",
  Ghana: "+233",
  Nigeria: "+234",
  Liberia: "+231",
  "Sierra Leone": "+232",
  Gambie: "+220",
  Mauritanie: "+222",
  "Cap-Vert": "+238",
};

export const COUNTRY_FLAGS: Record<string, string> = {
  Sénégal: "🇸🇳",
  "Côte d'Ivoire": "🇨🇮",
  Mali: "🇲🇱",
  "Burkina Faso": "🇧🇫",
  Niger: "🇳🇪",
  Guinée: "🇬🇳",
  "Guinée-Bissau": "🇬🇼",
  Bénin: "🇧🇯",
  Togo: "🇹🇬",
  Ghana: "🇬🇭",
  Nigeria: "🇳🇬",
  Liberia: "🇱🇷",
  "Sierra Leone": "🇸🇱",
  Gambie: "🇬🇲",
  Mauritanie: "🇲🇷",
  "Cap-Vert": "🇨🇻",
};

export const WEST_AFRICA_COUNTRIES = Object.keys(WEST_AFRICA_LOCATIONS);

// Flat list of all West African cities (used in selects and validation)
export const WEST_AFRICA_CITIES: string[] = Object.values(WEST_AFRICA_LOCATIONS)
  .flat()
  .sort((a, b) => a.localeCompare(b, "fr"));

// Backwards compatibility alias — now covers all West Africa
export const SENEGAL_CITIES = WEST_AFRICA_CITIES;

// Zones / quartiers par ville (Sénégal — autres pays à venir)
export const CITY_ZONES: Record<string, string[]> = {
  Dakar: ["Plateau", "Médina", "Fann", "Point E", "Mermoz", "Ouakam", "Yoff", "Almadies", "Ngor", "HLM", "Grand Dakar", "Sicap", "Liberté", "Parcelles Assainies", "Hann", "Colobane"],
  "Keur Massar": ["Keur Massar Nord", "Keur Massar Sud", "Jaxaay", "Malika", "Boune", "Tivaouane Peulh"],
  Pikine: ["Pikine Est", "Pikine Ouest", "Pikine Nord", "Thiaroye", "Yeumbeul", "Diamaguène", "Mbao", "Tivaouane Diacksao"],
  Guédiawaye: ["Golf Sud", "Sahm Notaire", "Médina Gounass", "Wakhinane Nimzatt", "Ndiarème Limamoulaye"],
  Rufisque: ["Rufisque Est", "Rufisque Ouest", "Rufisque Nord", "Bargny", "Diamniadio", "Sangalkam"],
  Thiès: ["Thiès Nord", "Thiès Sud", "Thiès Est", "Mbour 1", "Mbour 2", "Randoulène"],
  "Saint-Louis": ["Sor", "Île Nord", "Île Sud", "Pikine SL", "Goxu Mbacc"],
  Mbour: ["Mbour Centre", "Saly", "Nianing", "Warang", "Tefess"],
  Touba: ["Touba Mosquée", "Darou Khoudoss", "Darou Marnane", "Madiyana", "Ndame"],
  Kaolack: ["Kaolack Centre", "Médina Baye", "Sara Ndiougary", "Léona", "Ndorong"],
  Ziguinchor: ["Centre-ville", "Tilène", "Boucotte", "Lyndiane", "Néma"],
  Abidjan: ["Plateau", "Cocody", "Yopougon", "Marcory", "Treichville", "Adjamé", "Abobo", "Koumassi", "Port-Bouët", "Bingerville"],
  Lagos: ["Ikeja", "Lekki", "Victoria Island", "Ikoyi", "Surulere", "Yaba", "Ajah", "Apapa"],
  Accra: ["Osu", "East Legon", "Airport", "Tema", "Madina", "Adabraka", "Cantonments"],
  Cotonou: ["Akpakpa", "Cadjehoun", "Ganhi", "Jéricho", "Sainte Rita"],
  Lomé: ["Bè", "Tokoin", "Adidogomé", "Agoè", "Hédzranawoé"],
  Bamako: ["Hamdallaye", "Badalabougou", "ACI 2000", "Kalaban Coro", "Magnambougou"],
  Ouagadougou: ["Ouaga 2000", "Zone du Bois", "Pissy", "Tampouy", "Patte d'Oie"],
  Conakry: ["Kaloum", "Dixinn", "Matam", "Ratoma", "Matoto"],
  Niamey: ["Plateau", "Yantala", "Kouara Kano", "Lazaret", "Boukoki"],
};

export const CATEGORIES = [
  "Mode & Textile",
  "Beauté & Cosmétiques",
  "Électronique",
  "Maison & Déco",
  "Alimentation",
  "Bébé & Enfant",
  "Sport & Loisirs",
  "Santé",
  "Bureautique",
  "Automobile",
  "Autre",
];

export const ADMIN_EMAILS = ["adabecomx@gmail.com", "adbaecomx@gmail.com"] as const;
export const ADMIN_EMAIL = ADMIN_EMAILS[0];
export const isAdminEmail = (email?: string | null) =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase() as (typeof ADMIN_EMAILS)[number]);
