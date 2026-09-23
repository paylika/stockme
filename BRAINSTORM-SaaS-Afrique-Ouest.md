# Brainstorm — SaaS à récurrence pour l'Afrique de l'Ouest

> Objectif : trouver **un** SaaS (pas une marketplace, pas du stock) dont le revenu est **récurrent**
> et vendable depuis le Sénégal / la Côte d'Ivoire.

---

## 1. Le vrai problème n'est pas l'idée, c'est la récurrence

En Afrique de l'Ouest, 80 % des SaaS meurent sur un seul point : **le client ne renouvelle pas**,
pas parce que le produit est mauvais, mais parce que le paiement de l'abonnement est pénible
(pas de carte, pas de prélèvement automatique fiable) et parce que le produit est un
« nice-to-have » qu'on coupe quand la trésorerie serre.

**Conclusion : cherche une récurrence forcée, pas une récurrence souhaitée.**

Il n'existe que **deux moteurs de récurrence solides** sur ce marché :

| Moteur | Pourquoi ça tient | Exemples |
|---|---|---|
| **L'obligation** | Le client ne peut pas arrêter sans risque légal/financier | Paie & cotisations sociales, facture normalisée, traçabilité export, fiscalité |
| **Le flux d'argent** | Tu es branché sur de l'argent qui circule, tu prends une petite part | Encaissement de frais scolaires, collecte, paiement de récolte |

Un SaaS qui n'est ni l'un ni l'autre (CRM, site web, compta « pour bien gérer ») aura
un churn de 5–8 %/mois dans ce marché. À éviter pour un premier produit.

### Les 3 modèles de monétisation récurrente utilisables ici

1. **Abonnement pur** — ne marche que sur du formel qui a une carte ou fait des virements
   (filiales, ONG, cabinets, écoles privées huppées).
2. **Abonnement + usage** — base faible + prix par unité (bulletin de paie, facture, camion, élève,
   tonne exportée). C'est le meilleur compromis : le prix suit la valeur, et la croissance du
   client devient ta croissance (**net revenue retention > 100 %**, l'arme secrète des bons SaaS).
3. **Take rate sur flux + abonnement plancher** — le plus adapté à l'informel : le client ne
   « paie pas un logiciel », il paie sur ce que tu lui fais encaisser. Auto-financé par le ROI.

### Comment on encaisse vraiment (contrainte à intégrer dès le jour 1)

- Mobile money via agrégateurs : **PayDunya, CinetPay, PayTech, Hub2, Bizao** (Wave, Orange Money,
  MTN MoMo, Moov). Le vrai sujet : le **prélèvement récurrent** est fragile → prévoir
  **wallet prépayé + relance automatique WhatsApp + formule annuelle prépayée avec remise**.
- Ne construis **jamais** un produit dont la monétisation dépend d'un débit automatique mensuel.

### Les 5 filtres (une idée doit passer les 5)

1. **Obligation ou flux d'argent** (sinon → non).
2. **ARPU ≥ 15 000 FCFA/mois** ou volume auto-servi très élevé.
3. **Le client peut calculer le ROI en une phrase** (« ça m'encaisse X », « ça m'évite une amende »).
4. **Distribution possible sans équipe terrain de 10 personnes** (WhatsApp, comptables, associations
   professionnelles, agréments).
5. **Pas besoin d'un agrément bancaire** pour démarrer (sinon : 12–24 mois de délai).

---

## 2. Les 6 idées

### Idée 1 — L'école qui encaisse : recouvrement des frais scolaires + portail parents
**Score : 9/10**

- **Client** : écoles privées (maternelle → lycée), groupes scolaires, écoles coraniques modernes,
  établissements de formation professionnelle. Il y en a des dizaines de milliers dans l'espace
  francophone, la majorité gérées avec un cahier + Excel + WhatsApp.
- **Douleur n°1** : les **frais impayés**. Le directeur/proviseur est jugé là-dessus. En parallèle,
  les parents veulent payer en plusieurs fois mais l'école ne sait pas gérer les échéanciers.
- **Produit** : fiche élève + échéancier de scolarité, encaissement mobile money avec **reçu
  automatique WhatsApp/SMS au parent**, relances automatiques avant échéance, tableau de bord
  « qui doit quoi », caisse de l'école, bulletins, communication de masse aux parents.
- **Monétisation récurrente** : `abonnement annuel 300 000 – 900 000 FCFA selon la taille`
  **+ 1 % du flux encaissé** via la plateforme (et/ou 300–800 FCFA par élève et par an).
  La récurrence est portée par le flux : chaque rentrée, chaque tranche de frais, tu es payé.
- **Wedge d'entrée** : « Je vous fais recouvrer vos impayés, vous ne payez que si ça rentre. »
  Propose une campagne de recouvrement gratuite sur les impayés de l'année passée. C'est un
  cheval de Troie imbattable : tu prouves le ROI en 3 semaines avec de l'argent réel.
- **Pourquoi ça tient** : le flux d'argent est structurel (les frais reviennent chaque trimestre),
  et l'école qui a migré ses encaissements ne revient jamais au cahier.
- **Moat** : historique de paiement des familles + intégration mobile money + confiance des parents.
- **Concurrence** : logiciels scolaires locaux (bulletins/notes) souvent datés et **sans couche
  encaissement** → c'est précisément ton angle. Tu n'attaques pas « la gestion scolaire », tu
  attaques **la trésorerie de l'école**.
- **Difficulté** : cycles saisonniers (vendre en juin–septembre), écoles parfois lentes à payer,
  il faut du support WhatsApp réactif. S'intégrer avec Wave contribue à la crédibilité.
- **Test 14 jours** : 10 écoles privées à Dakar/Abidjan, une seule question :
  « combien d'impayés cette année, et qui relance les parents aujourd'hui ? » Si la douleur
  est confirmée, fais encaisser 20 paiements par mobile money à une école pilote avant d'écrire du code.

---

### Idée 2 — Paie & conformité sociale multi-pays (UEMOA / OHADA)
**Score : 9/10**

- **Client** : PME formelles de 5 à 300 salariés + **cabinets d'expertise comptable** (qui
  deviennent ton canal de distribution : 1 cabinet = 30 clients).
- **Douleur** : chaque mois, la paie est une obligation légale (bulletins, **IPRES/CNSS/CNPS, ITS,
  contrats, congés, déclarations**) et une source de redressement. Les outils existants sont
  chers, lourds, mal localisés, ou gérés en Excel par le comptable.
- **Produit** : bulletins de paie conformes, moteur de calcul par pays, déclarations sociales
  et fiscales pré-remplies, contrats OHADA, registre du personnel, congés/absences, paiement
  des salaires par **mobile money en lot**, self-service salarié sur WhatsApp.
- **Monétisation** : `15 000 FCFA/mois jusqu'à 20 bulletins, puis 500–1 000 FCFA/bulletin`,
  ou `250 000 – 1 500 000 FCFA/an` pour les PME ; licence cabinet revendeur.
  Facturation annuelle prépayée avec 2 mois offerts.
- **Wedge** : « La déclaration sociale et la paie de vos 40 salariés en 20 minutes, prêtes à déposer. »
- **Pourquoi ça tient** : **récurrence forcée** — la paie revient tous les mois, sans exception.
  Churn quasi nul dès que tu portes 3 mois de paie.
- **Moat** : le **moteur de règles par pays** (Sénégal, CI, Mali, Burkina, Bénin, Togo, Niger…).
  Chaque nouveau pays est un actif défendable et une nouvelle courbe de croissance. Un concurrent
  peut copier ton UI en 2 mois, pas 8 barèmes sociaux corrects.
- **Difficulté** : charge de travail domaine/conformité, besoin de crédibilité → recrute un
  expert paie dès le départ (associé ou consultant). Cycle de vente 2–8 semaines.
- **Test 14 jours** : 8 cabinets comptables + 10 PME. Trois questions :
  « Qui fait la paie ? Avec quel outil ? Combien ça coûte ? Qui a déjà eu un redressement ? »
  Si 3 cabinets acceptent d'être partenaires pilotes, tu as un canal.

---

### Idée 3 — Traçabilité agricole & conformité export (EUDR, certifications)
**Score : 8/10 — le plus gros ARPU**

- **Client** : exportateurs agricoles, acheteurs/transformateurs, coopératives et unions de
  producteurs, dans le cajou, le cacao, le café, l'hévéa, le palmier, le sésame, la mangue,
  le coton. Acheteurs finaux : l'UE.
- **Douleur** : le règlement européen sur la déforestation (**EUDR**) impose une **géolocalisation
  des parcelles** et une diligence raisonnée, et Bruxelles a refermé la porte aux nouveaux reports
  — les exportateurs africains sont sous contrainte de calendrier
  ([Ecofin](https://www.ecofinagency.com/news/1407-57380-eu-closes-door-on-deforestation-law-delays-putting-african-exporters-on-the-clock)),
  alors que la conformité cacao reste très incomplète
  ([CocoaIntel](https://www.cocoaintel.com/eudr-cocoa-readiness-mapped-not-compliant/)).
  Aujourd'hui c'est fait au GPS de téléphone + Excel, ou pas fait.
- **Produit** : cartographie des parcelles (polygones GPS), fiche producteur, agrégation des lots
  jusqu'au conteneur, **déclaration de diligence (DDS)**, QR code de traçabilité, conformité
  certification (Rainforest Alliance, Fairtrade, bio), tableau de bord pour l'acheteur UE.
- **Monétisation** : la plus élevée du lot — `5 – 25 M FCFA/an par exportateur`, ou au volume
  (`0,5 – 2 FCFA/kg tracé`), ou par producteur enrôlé. Budgets en EUR, contrats annuels,
  souvent payés par l'acheteur européen, pas par l'exportateur.
- **Pourquoi ça tient** : obligation réglementaire côté UE = **le client ne peut pas choisir de ne
  pas acheter**. C'est le seul cas où ton acheteur a un budget en devise forte et une deadline.
- **Moat** : base de producteurs géolocalisés + données historiques de parcelles. Très difficile à
  rattraper une fois qu'un exportateur a enrôlé 12 000 producteurs chez toi.
- **Difficulté** : cycle de vente long, travail de terrain (enrôlement des producteurs), culture
  de l'export. Ce n'est pas un SaaS auto-servi : c'est un SaaS + opérations.
- **Test 14 jours** : 5 exportateurs de cajou (SN/CI) et 3 de cacao (CI). Question :
  « Que vous demande votre acheteur européen, et qu'est-ce que vous n'arrivez pas à produire ? »
  Puis fais-toi payer un **pilote de géolocalisation de 500 parcelles** (2–5 M FCFA) avant le produit.

---

### Idée 4 — Conformité fiscale & e-facturation (FNE Côte d'Ivoire, e-facturation Sénégal)
**Score : 7/10**

- **Client** : toute entreprise facturant à des professionnels (B2B) en Côte d'Ivoire et au Sénégal.
- **Douleur** : la **facture normalisée électronique** est généralisée et contrôlée en Côte d'Ivoire
  ([DGI](https://fne.dgi.gouv.ci/documents/arrete_0337_modalites_fne_2025.pdf),
  [KOACI](https://www.koaci.com/article/2026/08/26/cote-divoire/economie/cote-divoire-operation-de-controle-de-la-facturation-normalisee-electronique-a-partir-du-1er-septembre-voici-les-entreprises-visees_199883.html)),
  et le Sénégal pousse la facturation électronique comme levier de recettes
  ([Juridoc](https://juridoc.sn/fr/paroles-experts/61/facturation-electronique-au-senegal-un-levier-de-mobilisation-recettes-fiscales-sous-tension)).
  Facturer à la main = risque de rejet de la TVA et de redressement.
- **Produit** : émission de factures conformes, envoi au client, suivi des paiements et relances,
  export comptable, mode offline.
- **Monétisation** : `10 000 – 40 000 FCFA/mois + 5–15 FCFA par facture émise`. Usage = croissance.
- **Pourquoi ça tient** : obligation légale, et **prix par facture** = le revenu monte avec le client.
- **Le piège** : ce n'est pas un business, c'est une **fonctionnalité**. Les logiciels comptables
  et les cabinets vont l'inclure gratuitement. À jouer **uniquement** en devenant partenaire
  technique agréé, ou comme **wedge d'entrée** vers l'Idée 2 (paie + facturation + fiscal = vraie
  plateforme). Ne bâtis pas l'entreprise entière là-dessus seul.

---

### Idée 5 — TMS léger pour transporteurs & logisticiens (prix par camion)
**Score : 7,5/10**

- **Client** : transporteurs routiers (5–200 camions), sociétés de distribution, flottes de
  livraison, transitaires. Le corridor Dakar–Bamako–Abidjan est un poumon économique.
- **Douleur** : les bons de livraison perdus, les factures qui traînent, le carburant non
  contrôlé, l'immobilisation des camions, l'absence de preuve de livraison face au client.
- **Produit** : ordre de mission, **preuve de livraison photo + signature (fonctionne hors ligne)**,
  suivi de position, gestion carburant et péages, facturation automatique par course, marge par camion.
- **Monétisation** : `base 25 000 FCFA/mois + 8 000–15 000 FCFA par camion actif/mois`.
  C'est le modèle avec la **meilleure expansion** : un client qui passe de 10 à 40 camions
  quadruple ton revenu sans que tu vendes à nouveau.
- **Pourquoi ça tient** : le client mesure en dinars la valeur (un camion immobilisé = perte sèche),
  et la preuve de livraison débloque **son** encaissement, donc ton abonnement est le dernier poste
  qu'il coupe.
- **Difficulté** : vente directe, terrain, offline obligatoire, clients difficiles à joindre.
- **Test 14 jours** : 15 transporteurs, question « comment prouvez-vous une livraison litigieuse,
  et combien de factures traînent plus de 60 jours ? »

---

### Idée 6 — SaaS pour cabinets professionnels (avocats, notaires, huissiers, experts-comptables)
**Score : 7/10 — le plus ennuyeux, le plus rentable**

- **Client** : cabinets de 3 à 40 personnes. Ils sont **formels**, ont un compte bancaire, paient
  par virement, et ne changent pas d'outil tous les deux ans.
- **Douleur** : délais de procédure, dossiers dispersés, temps facturable non tracé, honoraires
  impayés, échéances ratées.
- **Produit** : gestion de dossiers, échéancier de procédure avec alertes, suivi du temps et
  facturation à l'heure/forfait, espace client, relance des honoraires, conflits d'intérêts.
- **Monétisation** : `25 000 – 75 000 FCFA/mois par cabinet` + par utilisateur au-delà.
  Récurrence annuelle, **churn parmi les plus bas du marché** (un avocat change rarement d'outil).
- **Pourquoi ça tient** : professionnels réglementés, sensibles au risque de rater un délai,
  et regroupés en ordres/barreaux → **un seul partenariat t'ouvre tout un pays**.
- **Difficulté** : marché plus petit, il faut aimer le verticiel et le support haut de gamme.

---

### Outsiders (à garder en réserve)

- **SaaS de suivi-évaluation & reporting bailleurs pour ONG/coopératives** : budgets en devise
  forte, obligation contractuelle de reporting, ARPU 1–4 M FCFA/an. Mais concurrence du gratuit
  (KoboToolbox, DHIS2, ActivityInfo) → exige une exécution excellente.
- **SaaS vendu aux opérateurs (B2B2C)** : gestion de flottes de kits solaires PAYG, logiciel de
  scoring pour fintechs, back-office pour réseaux d'agents. ARPU élevé, payé en USD, mais peu
  d'acheteurs et cycle long.
- **Conformité données personnelles / cyber-PME** (loi sénégalaise, ARTCI en CI) : récurrence par
  obligation, mais le marché ne ressent pas encore la douleur. À reprendre dans 2–3 ans.

---

## 3. Tableau comparatif

| Idée | Récurrence | ARPU | Churn | Facilité à vendre seul | Plafond | Verdict |
|---|---|---|---|---|---|---|
| 1. Écoles / recouvrement frais | Flux d'argent | Moyen | Moyen | Élevée | Très grand (volume) | **Meilleur premier produit** |
| 2. Paie & conformité sociale | Obligation mensuelle | Moyen-élevé | Très faible | Moyenne (via cabinets) | Très grand (multi-pays) | **Meilleur actif long terme** |
| 3. Traçabilité / EUDR | Obligation UE | Très élevé | Faible | Faible (terrain) | Élevé | Meilleur si tu peux faire du B2B |
| 4. E-facturation / FNE | Obligation | Faible | Faible | Moyenne | Moyen | Wedge, pas business |
| 5. TMS transporteurs | Usage (par camion) | Moyen-élevé | Moyen | Moyenne | Grand (expansion) | Solide, sous-estimé |
| 6. Cabinets professionnels | Obligation + usage | Moyen | Très faible | Élevée | Moyen | Cash-flow tranquille |

---

## 4. Ma recommandation

**Si tu construis seul et veux du revenu dans 90 jours → Idée 1 (écoles).**
Le produit est dans tes cordes, le nombre de clients est immense, et tu es payé sur l'argent que
tu fais rentrer : tu n'as pas à convaincre, tu fais la démonstration.

**Si tu peux faire du B2B et supporter 6 mois de cycle → Idée 3 (traçabilité EUDR).**
C'est le seul segment où le client a une deadline réglementaire, un budget en euros et pas le
choix. C'est là que se trouvent les contrats à 10 M FCFA/an.

**Si tu veux l'actif qui compose le plus → Idée 2 (paie multi-pays).**
Mois après mois, presque zéro churn, et chaque pays ajouté est une barrière à l'entrée.

**Le combo le plus intelligent** : démarrer par l'Idée 1 pour générer du cash et apprendre la
distribution locale, puis réinvestir dans l'Idée 2 pour construire une base récurrente défendable.

---

## 5. Plan de validation en 30 jours (avant une seule ligne de code)

**Semaine 1 — 30 interviews, pas une de moins.**
20 clients cibles + 10 « prescripteurs » (comptables, associations professionnelles, directions
diocésaines/régionales de l'éducation). Une seule question ouverte : « Raconte-moi comment
ça se passe aujourd'hui. » Tu cherches la phrase que tous répètent.

**Semaine 2 — vérifie que l'argent est là.**
Demande un **engagement écrit** : lettre d'intention, ou mieux, un acompte de 50 000 FCFA
remboursable pour une place en pilote. Un client qui ne sort pas 50 000 FCFA ne sortira pas
15 000 FCFA par mois. Objectif : 3 engagements.

**Semaine 3 — encaisse un vrai flux manuellement.**
Aucun logiciel : WhatsApp + un tableur + un lien de paiement mobile money. Fais tourner le
service à la main pour tes 3 pilotes. Tu gagnes 2 à 3 mois d'apprentissage produit.

**Semaine 4 — décide.**
Si les 3 pilotes t'ont payé et redemandé le service → construis le MVP en 6–8 semaines en
automatisant exactement ce que tu viens de faire à la main. Sinon, passe à l'idée suivante.
**Ton coût d'échec = 30 jours. C'est pour ça qu'on valide avant de coder.**

---

## 6. Les 7 pièges qui tuent ce type de projet

1. **Construire avant de vendre.** En Afrique de l'Ouest, le produit n'est presque jamais le
   facteur limitant : la distribution et la collecte du paiement le sont.
2. **Le pricing en dollars.** Facture en FCFA, prix rond, comparable à un salaire de secrétaire.
3. **Pas de support WhatsApp.** C'est le canal d'onboarding, de support et de relance. Sans lui, churn.
4. **Négliger la collecte.** L'abonnement annuel prépayé avec remise de 2 mois est ton meilleur
   ami : il transforme un churn mensuel en un churn annuel et finance ton développement.
5. **Vendre du « gain de temps ».** Vends du **cash encaissé**, de l'**amende évitée** ou du
   **client gardé**. Personne ne paie pour du confort ici.
6. **Viser 5 pays d'un coup.** Un pays bien conquis, avec ses barèmes, ses agrégateurs et son
   réseau de prescripteurs, vaut mieux que cinq pays en pilote.
7. **Rester sous le radar fiscal.** Un SaaS qui encaisse pour le compte de tiers touche à la
   réglementation des paiements. Reste un **intermédiaire technique** (l'argent passe par
   l'agrégateur agréé et arrive sur le compte du client), ne détiens jamais les fonds.

---

## 7. Deuxième vague — 6 idées différentes (hors éducation, paie, EUDR, TMS, cabinets)

> Le terrain de jeu : le Sénégal. Critère : récurrence portée par un **contrat**, un **abonnement
> mensuel structurel** ou un **flux d'argent**, et une concurrence faible en francophonie.

### Idée A — Le carnet de route digital du commercial terrain (van sales / DMS)
**Score : 9/10 — ma piste n°1**

- **Client** : distributeurs et dépositaires (boissons, agro-alimentaire, cosmétiques, ciment,
  matériaux, télécom, produits laitiers) qui emploient **20 à 200 commerciaux/voyageurs** avec
  camionnettes. À Dakar et en région, ces réseaux sont partout et pilotés au cahier + téléphone.
- **Douleur** : personne ne sait ce qui se passe réellement sur une tournée. Ventes perdues faute de
  stock dans la camionnette, ruptures invisibles, crédit accordé à une boutique sans trace,
  cash non réconcilié, objectifs fixés à l'aveugle. Le patron découvre les problèmes en fin de mois.
- **Produit** : application mobile **qui fonctionne hors ligne** pour le commercial (tournée du jour,
  prise de commande, stocks camion, encaissement cash/Wave, photo linéaire, géolocalisation),
  + back-office patron : tournées, objectifs, prix par client, encours de crédit, réconciliation
  de caisse, tableau de bord des ventes par commercial / par produit / par zone.
- **Monétisation récurrente** : `5 000 – 15 000 FCFA par commercial et par mois`.
  Un distributeur de 60 commerciaux = **300 000 à 900 000 FCFA/mois**, tous les mois.
  Et la meilleure expansion du marché : le client qui passe de 40 à 90 commerciaux double ton revenu
  sans nouvelle vente (**NRR > 130 %**).
- **Deuxième source de revenus** : les **industriels** (marques) paient cher pour voir leur
  distribution réelle dans l'informel — parts de linéaire, ruptures, prix pratiqués. C'est un
  revenu en devise, avec très peu de clients à signer.
- **Wedge** : « Montrez-moi vos 3 dernières tournées. » Personne ne peut. Puis :
  « On équipe 10 commerciaux pendant 1 mois, vous verrez où part l'argent. »
- **Pourquoi ça tient** : le logiciel devient le système d'exploitation du chiffre d'affaires du
  client → il ne peut plus s'en passer. Contrats annuels payés par des entreprises formelles.
- **Honnêteté sur la concurrence** : les solutions existantes viennent de l'Inde (Bizom, FieldAssist,
  SalesBeat), chères, mal localisées, sans mobile money ni français correct. En Afrique de
  l'Ouest francophone, presque personne.
- **Le vrai risque (pas la techno)** : **l'adoption par les commerciaux**. Ils perdent leur
  autonomie et leur marge d'arrangement : certains saboteront l'outil. Il faut que le produit soit
  *aussi* à leur avantage (leur calcul de commission, leur preuve en cas de litige de caisse)
  et que le patron le rende obligatoire. C'est un problème de change management, à traiter dès le
  premier jour. Le mode hors ligne est non négociable.
- **Test 14 jours** : 12 distributeurs, une question : « Comment suivez-vous les tournées et les
  encours de vos commerciaux aujourd'hui ? » Puis demande à **faire une tournée avec un commercial**
  et note tout ce qui se perd. C'est ton cahier des charges.

---

### Idée B — Les loyers de la diaspora (« votre patrimoine à Dakar, encaissé et justifié »)
**Score : 8,5/10 — le meilleur ARPU en devise forte**

- **Client** : Sénégalais de l'étranger (France, Italie, Espagne, USA) propriétaires d'un ou
  plusieurs biens à Dakar, Mbour, Thiès. Les transferts de la diaspora pèsent de l'ordre de 10 %
  du PIB sénégalais (chiffre à revérifier et à sourcer avant tout pitch).
  Clients secondaires : **agences immobilières** qui veulent industrialiser la gestion locative.
- **Douleur** : le loyer n'est pas versé, le locataire « négocie », les travaux annoncés n'ont jamais
  eu lieu, la famille censée gérer est débordée, et le propriétaire n'a aucune preuve de rien.
  La douleur est **financière et émotionnelle** (patrimoine construit à la sueur de l'étranger).
- **Produit** : mandat digital, état des lieux photo horodaté, **encaissement du loyer par Wave /
  Orange Money** directement sur le compte du bailleur, quittance automatique, relances graduées,
  suivi des travaux avec photos avant/après, **reporting vidéo mensuel** et transmission
  internationale.
- **Monétisation récurrente** : `6 – 10 % du loyer effectivement encaissé` (soit ~15 000 – 30 000
  FCFA/mois pour un appartement à 250 000 FCFA), ou `15 000 FCFA/mois + commission`.
  La récurrence est **auto-financée** : tu n'es payé que quand il est payé → argument de vente massif.
- **Wedge** : « Votre locataire paie-t-il à temps ? » Puis : « On encaisse pour vous, vous recevez
  le loyer et une vidéo chaque mois. Si on n'encaisse rien, vous ne payez rien. »
- **Pourquoi ça tient** : client avec **revenu en euros**, churn très faible, bouche-à-oreille
  communautaire explosif (les diasporas se parlent, par ville d'accueil et par région d'origine),
  et acquisition possible par **Facebook/TikTok ciblés en France/Italie** — sans terrain.
- **Honnêteté sur la concurrence** : les agences immobilières existent mais sont peu fiables aux yeux
  des propriétaires (c'est exactement ton argument). Des tentatives locales existent, rarement
  jusqu'au bout de la chaîne d'encaissement.
- **Le vrai risque** : ce n'est pas du SaaS pur — il faut une **couche opérationnelle locale**
  (visites, artisans, clés) et de la confiance, donc une présence humaine à Dakar. Le logiciel
  ne suffit pas à vendre la confiance.
- **Test 14 jours** : 20 interviews de propriétaires en France/Italie + 5 locataires à Dakar.
  Puis : gère **2 biens à la main** pendant un mois, encaisse les loyers, envoie la vidéo.
  Si les propriétaires te recommandent à leurs amis sans que tu demandes → tu as un business.

---

### Idée C — Le carnet d'entretien des contrats de maintenance (field service récurrent)
**Score : 8/10 — l'ennuyeux qui rapporte**

- **Client** : sociétés de **maintenance et de service terrain** : froid et climatisation, groupes
  électrogènes, ascenseurs, plomberie et pompes, piscines, traitement des nuisibles,
  **sociétés de gardiennage** et de nettoyage. Leur point commun décisif : **elles vivent de
  contrats récurrents** (abonnements mensuels ou trimestriels facturés à leurs propres clients).
- **Douleur** : 150 interventions par mois planifiées par WhatsApp, contrats dont on oublie la
  visite préventive, pièces et main-d'œuvre non facturées, rapports d'intervention perdus,
  impossibilité de prouver au client que le contrat est honoré.
- **Produit** : parc d'équipements sous contrat, **contrats récurrents avec alerte d'échéance de
  visite**, planning des techniciens, application mobile terrain avec **rapport d'intervention
  signé (hors ligne)**, photos, pièces utilisées, devis et facturation automatiques,
  et le **contrat d'entretien prêt à renouveler** avec l'historique des interventions.
- **Monétisation récurrente** : `2 000 – 5 000 FCFA par technicien et par mois`
  (ou `100 000 – 400 000 FCFA/mois` par société selon la taille), plus `1 000 – 2 500 FCFA par
  équipement sous contrat et par mois`. Récurrence **doublée** : ton abonnement est mensuel,
  et il porte sur les contrats mensuels du client.
- **Wedge** : « Combien d'interventions préventives avez-vous ratées le mois dernier, et combien
  avez-vous oublié de facturer ? » Le montant non facturé dépasse presque toujours ton abonnement.
- **Pourquoi ça tient** : churn très faible (le logiciel détient les contrats et l'historique
  technique), NRR élevé (chaque nouvelle machine sous contrat augmente la facture), vente facile
  (peu d'acteurs, tous joignables en une semaine).
- **Difficulté** : marché plus étroit, ARPU de départ modeste → il faut 25–40 clients pour
  atteindre 5 M FCFA/mois. Vente très directe et très humaine.
- **Test 14 jours** : 15 sociétés (froid/clim, groupes électrogènes, gardiennage). Demande à voir
  leur planning du mois et leur liste de contrats. Si c'est sur papier ou WhatsApp → go.

---

### Idée D — L'officine qui ne perd plus d'argent (stock, péremption, grossiste)
**Score : 7,5/10**

- **Client** : pharmacies d'officine privées. Acheteurs **formels, réglementés, avec du cash**,
  habitués à payer un logiciel (contrairement au commerce informel).
- **Douleur** : la **péremption** est une perte sèche directe (les invendus sont détruits, pas
  retournés), les ruptures sur les produits à forte marge, des commandes passées au feeling auprès
  des grossistes, et des marges réellement inconnues produit par produit.
- **Produit** : gestion de stock avec **alertes de péremption et de rotation**, encours grossistes,
  suggestions de commande, ventes et marge par produit, ordonnance et historique patient,
  caisse, et **commande grossiste** depuis l'application.
- **Monétisation** : `25 000 – 60 000 FCFA/mois` par officine (+ 5 000 – 10 000 par poste
  supplémentaire). Récurrence forte : le logiciel détient le stock et l'historique de ventes,
  donc le churn tombe à quasi zéro après 3 mois.
- **Moat** : la **base de données produits-prix** (dénominations, dosages, PPV) et l'intégration
  avec les grossistes. C'est un actif lent à construire et très défendable.
- **Honnêteté sur la concurrence** : des logiciels de gestion d'officine existent déjà au Sénégal.
  Ton angle n'est pas « le logiciel de caisse » mais **la lutte contre la péremption et la commande
  optimisée** : tu te présentes avec un chiffre, pas avec des fonctionnalités.
- **Difficulté** : il faut un partenariat avec un grossiste ou le conseil de l'ordre pour la
  distribution ; vente une à une (pas d'auto-servi).
- **Test 14 jours** : 10 pharmaciens. Question unique : « Combien avez-vous détruit de stock périmé
  l'an dernier ? » Si le chiffre sort facilement, la douleur est validée.

---

### Idée E — Ne plus jamais rater un appel d'offres (veille + dossiers pour PME)
**Score : 7/10 — le plus faisable en solo**

- **Client** : PME qui vivent des **marchés publics et des bailleurs** (BTP, fournitures, gardiennage,
  nettoyage, informatique, formation, transport) au Sénégal et dans l'espace UEMOA.
- **Douleur** : rater une date limite de soumission, reconstituer chaque fois le dossier administratif
  (attestations fiscales, CNSS, quitus, références), ne pas savoir **qui a gagné et à quel prix**,
  donc soumissionner à l'aveugle.
- **Produit** : veille quotidienne personnalisée par secteur/métier/montant avec **alerte WhatsApp**,
  checklist et génération du dossier administratif, suivi des soumissions et des résultats,
  et surtout un **historique des attributions** (qui gagne quoi, à quel montant, chez quel maître
  d'ouvrage) qui devient ton actif de données.
- **Monétisation** : `20 000 – 75 000 FCFA/mois` par PME. Récurrence mensuelle naturelle : les
  appels d'offres tombent en continu, et l'abonnement est lié à un pipeline permanent.
- **Wedge** : « Combien d'appels d'offres avez-vous découverts trop tard ce trimestre ? »
  Puis offre une **veille gratuite d'un mois** et prouve-leur en 30 jours ce qu'ils ont raté.
- **Pourquoi ça tient** : coût d'acquisition quasi nul (prospection WhatsApp/LinkedIn + contenu),
  produit majoritairement data et alertes, faisable seul, marges très élevées.
- **Le vrai risque** : une PME qui ne gagne jamais de marché se désabonne. Contre-mesure :
  facture l'**accompagnement au montage de dossier** (revenu de service, plus élevé) et vends
  l'abonnement comme un pipeline commercial, pas comme un fil d'actualité.
- **Test 14 jours** : 15 PME + 3 cabinets de réponse aux appels d'offres. Demande-leur leurs
  soumissions des 6 derniers mois et le taux de réussite.

---

### Idée F — Faire rentrer l'argent : recouvrement de créances B2B assisté par logiciel
**Score : 7,5/10**

- **Client** : toute PME B2B qui facture à d'autres entreprises — distributeurs, prestataires,
  BTP, agences, imprimeurs, transporteurs. Les **impayés** sont la première cause de mortalité
  des PME ici.
- **Douleur** : les factures ne sont pas payées, les relances sont gênantes socialement
  (« on ne va pas embêter un client »), il n'y a aucune traçabilité des relances, et l'encours
  grossit jusqu'à menacer la trésorerie.
- **Produit** : relances automatiques multicanal **WhatsApp + SMS + e-mail + appel programmé**,
  échéanciers négociés, encaissement par Wave/OM directement depuis le lien de relance,
  tableau de bord d'encours avec priorisation, et lettre de mise en demeure générée automatiquement.
- **Monétisation** : `30 000 – 100 000 FCFA/mois` **+ 5 – 10 % des sommes effectivement recouvrées**.
  Double moteur de récurrence, et un ROI calculable en une phrase : « 1 million récupéré = 100 000
  pour moi, pour 50 000 d'abonnement ».
- **Wedge** : « Envoyez-moi la liste de vos factures impayées. Je relance pendant 30 jours.
  Vous ne payez que sur ce qui rentre. » Cheval de Troie redoutable, zéro risque pour le client.
- **Pourquoi ça tient** : douleur universelle et permanente, récurrence doublée (abonnement + succès),
  et chaque recouvrement réussi finance la facture suivante.
- **⚠ Cadre réglementaire à vérifier avant de te lancer** : au Sénégal, l'activité de recouvrement de
  créances pour le compte d'autrui peut être encadrée. Positionne-toi comme **fournisseur d'outil
  logiciel du créancier** (le créancier relance et encaisse lui-même, sur son compte, via
  l'agrégateur), **jamais** comme cabinet qui recouvre pour le compte de tiers. Fais valider les
  CGU par un avocat avant d'encaisser le premier franc de commission.
- **Test 14 jours** : 20 PME, question : « Quel est le montant de vos impayés à plus de 60 jours ? »
  Puis relance à la main pour 3 d'entre elles avec un simple lien de paiement. Si ça rentre,
  tu as un produit.

---

### Tableau comparatif — deuxième vague

| Idée | Moteur de récurrence | ARPU | Churn | Vendable en solo depuis Dakar | Effort produit | Plafond |
|---|---|---|---|---|---|---|
| **A. Van sales / DMS distributeurs** | Abonnement par commercial + NRR | Élevé | Faible | Moyen (vente directe B2B) | Élevé (mobile offline) | **Très grand** |
| **B. Loyers de la diaspora** | % du flux encaissé | Moyen, **en euros** | Très faible | **Élevé** (acquisition en ligne) | Moyen + ops locales | Grand |
| **C. Contrats de maintenance / field service** | Abonnement par technicien/équipement | Moyen | Très faible | **Élevé** | Moyen | Moyen |
| **D. Pharmacies d'officine** | Abonnement mensuel | Moyen | Très faible | Moyen (vente une à une) | Élevé (base produits) | Moyen |
| **E. Appels d'offres / veille PME** | Abonnement mensuel + data | Faible-moyen | Moyen | **Très élevé** | **Faible** | Moyen |
| **F. Recouvrement B2B** | Abonnement + % recouvré | Moyen-élevé | Moyen | Élevé | Moyen | Grand |

### Verdict sur cette deuxième vague

1. **Si tu veux le plus gros actif et un vrai moat** → **Idée A (van sales)**. Personne ne le fait
   correctement en francophonie, l'expansion est automatique, et la donnée de distribution ouvre un
   second marché (les marques) payé en devise. C'est le projet avec lequel tu peux lever des fonds.
2. **Si tu veux du cash vite avec un client qui a de l'argent en euros** → **Idée B (diaspora)**.
   Acquisition 100 % en ligne depuis l'Europe, zéro terrain au départ, et une confiance qui se
   propage toute seule. Accepte la part d'opérations.
3. **Si tu veux le projet le plus simple à lancer seul, cette semaine** → **Idée E (appels d'offres)**.
   Faible effort produit, distribution quasi gratuite, tu peux avoir tes 10 premiers clients en
   3 semaines. Plafond plus bas, mais c'est un excellent premier revenu récurrent.
4. **Si tu veux du très collant et de l'ennuyeux rentable** → **Idée C (contrats de maintenance)**.

**Mon choix personnel si c'était mon projet : A**, avec un démarrage étroit (« je n'équipe que les
distributeurs de boissons et d'agro-alimentaire de la région de Dakar ») pour ne pas me disperser.

---

## 8. Sources consultées

- EUDR / exportateurs africains sous contrainte de calendrier — [Ecofin Agency](https://www.ecofinagency.com/news/1407-57380-eu-closes-door-on-deforestation-law-delays-putting-african-exporters-on-the-clock)
- État de préparation EUDR cacao — [CocoaIntel](https://www.cocoaintel.com/eudr-cocoa-readiness-mapped-not-compliant/)
- Facture normalisée électronique, modalités (Côte d'Ivoire) — [fne.dgi.gouv.ci](https://fne.dgi.gouv.ci/documents/arrete_0337_modalites_fne_2025.pdf)
- Contrôles FNE en Côte d'Ivoire — [KOACI](https://www.koaci.com/article/2026/08/26/cote-divoire/economie/cote-divoire-operation-de-controle-de-la-facturation-normalisee-electronique-a-partir-du-1er-septembre-voici-les-entreprises-visees_199883.html)
- Facturation électronique au Sénégal — [Juridoc](https://juridoc.sn/fr/paroles-experts/61/facturation-electronique-au-senegal-un-levier-de-mobilisation-recettes-fiscales-sous-tension)
- Abonnements SaaS payés par Wave/mobile money au Sénégal — [Kolonell (FR)](https://kolonell.com/fr/blog/paiement-recurrent-abonnement-wave-senegal-2026)
- Encaissement de frais de scolarité par mobile money — [Kolonell](https://kolonell.com/en/blog/school-management-app-tuition-2026)
- Secteur informel en Afrique de l'Ouest — [UNECA](https://repository.uneca.org/entities/publication/10e2dbdc-45c9-494b-980f-e269bbb8bc93)

> Les fourchettes de prix sont des **hypothèses à tester en interview**, pas des relevés de marché.
