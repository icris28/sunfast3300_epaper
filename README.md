# Sun Fast 3300 · AIS Race Lab / TRMNL & E1001

Simulateur tactique **800 × 480**, avec notre Sun Fast et **six concurrents
fictifs**. Vues Carte, Tableau, Graphiques et Détail. La même interface fonctionne
avec le moteur Python local ou, sans backend, directement dans un navigateur.

## Essayer la version web autonome

Ouvrir `docs/index.html` dans un navigateur récent (Edge, Chrome, Firefox ou
Safari). Aucun téléchargement, compte, clé API ou connexion AIS n'est nécessaire.
Les ressources sont locales ; la version publique ne demande aucune géolocalisation.

Pour un essai via HTTP :

```powershell
cd D:\Github\sunfast3300_epaper
python -m http.server 8080 --bind 127.0.0.1 --directory docs
```

Ouvrir <http://127.0.0.1:8080/>. Ctrl+C arrête le serveur.

La flotte démarre automatiquement avec cinq minutes d'historique fictif calculé
à 1 Hz. `×5` / `×20` accélèrent les bateaux, **pas les délais e-paper**. Pause
arrête la flotte ; les nettoyages d'écran continuent. Rejouer réinitialise la
flotte. Un onglet masqué suspend l'avancement local sans rattrapage brutal.

## Lancer le moteur Python local

Python 3.10+ ; aucune dépendance tierce pour l'application.

```powershell
cd D:\Github\sunfast3300_epaper
.\run.cmd
```

L'écran s'ouvre à <http://127.0.0.1:8765/>. Il utilise les mêmes fichiers de
rendu que le site public, alimentés par le moteur Python. Dans ce mode, la
vitesse se règle au lancement et les commandes web Pause/Rejouer sont désactivées.
Le serveur écoute uniquement sur `127.0.0.1`. Ctrl+C l'arrête.

```powershell
.\run.cmd --speed 10
.\run.cmd --port 8767 --no-browser
.\run.cmd --headless 300 > snapshot.json
.\run.cmd --test
```

`--headless N` produit **N secondes simulées**, toujours par pas de 1 seconde ;
`--speed` ne concerne que les modes interactifs. En accéléré, les échantillons
intermédiaires sont conservés. Le JSON est accessible sur `/snapshot`, à 1 Hz
réel en mode interactif. Installation facultative : `python -m pip install -e .`.
`run.cmd` emploie le Python fourni avec Codex s'il existe, sinon `python`.

L'ancienne fenêtre Tkinter reste disponible : `--tk` (Tcl/Tk requis), avec
`--tk --no-server` pour couper HTTP. Cette UI historique n'inclut pas le nouvel
ordonnanceur e-paper ; utiliser le navigateur pour les essais TRMNL/E1001.
L'ancien `display.html` est conservé comme référence ; le serveur sert désormais
`static/index.html`.

## Navigation

| Commande | Action |
| --- | --- |
| Onglets ou ← / → hors des champs de formulaire | Page précédente / suivante |
| Entrée / espace ou bouton ● | Concurrent suivant |
| Sélecteur Concurrent | Cible choisie par MMSI, conservée même si les distances se croisent |
| Portée | 0,5 / 1 / 2 / 5 NM ; full systématique |
| Profil écran | TRMNL 7.5 OG ou reTerminal E1001 |
| Rendu instantané | Pas de délai de dalle ni de rémanence ; seuils conservés |
| Dirty rectangles | Rectangles orange pendant 2 s après une mise à jour ; teinte liée au ghost score |
| Nettoyer l'écran | Full manuel, sans réinitialiser les données AIS |

Les trois boutons sont accessibles au clavier et à la souris. La surface de
rendu reste exactement 800 × 480 ; elle se réduit proportionnellement sur mobile.
La carte est orientée nord en haut, avec vecteurs COG. Une cible hors cadre est
ramenée en bordure et marquée `↗` ; sa distance réelle reste dans les valeurs.

## Stratégie e-paper

Les durées sont **des hypothèses de simulation**, pas une émulation électrique ni
une validation des dalles. TRMNL : partial 0,34 s / full 3,5 s ; E1001 : valeurs
provisoires 0,5 s / 4 s à mesurer sur le matériel reçu. Le full utilise une phase
claire unique ; il ne reproduit pas les formes d'onde et flashes du contrôleur.

| Zone / événement | Politique par défaut |
| --- | --- |
| Calcul / acquisition AIS | 1 échantillon par seconde simulée |
| Carte, valeurs | Opportunité de partial toutes les 2 s réelles, uniquement si un seuil est franchi |
| Graphiques | Mise à jour toutes les 10 s réelles ; un point par 10 s simulées sur 30 min |
| Cadres, titres, éléments statiques | Rendus au full ; restaurés seulement si traversés par un rectangle partiel |
| Full adaptatif | Dès 30 s si ghost ≥ 15 ; au plus tard 60 s après la fin du dernier full |
| Ghost ≥ 30 | Full au prochain créneau libre, même avant 30 s |
| Changement de page / portée / cible / profil / flotte | Full obligatoire |

Les seuils sont comparés au **dernier contenu effectivement affiché**, pas à
l'échantillon précédent : mouvement ≥ 3 px sur un axe, distance/CPA ≥ 0,01 NM,
SOG ≥ 0,05 kn, COG/relèvement ≥ 2° (écart circulaire), gain ≥ 5 m, TCPA ≥ 0,5 min.
Les valeurs sont arrondies pour la lecture, sans supprimer l'accumulation des
variations sous le seuil.

Chaque rectangle englobe l'ancienne et la nouvelle position, texte et vecteur
compris. Les rectangles se recouvrant sont fusionnés et leurs abscisses alignées
sur 8 pixels. Un framebuffer complet restaure aussi les voisins et le fond dans
les zones effacées ; seules ces zones sont copiées vers la dalle simulée.
Le score ajoute 2 par bateau/vecteur, 1 par groupe de valeurs, 5 par zone graphique,
plus `5 × fraction de surface rafraîchie`. Un full terminé remet le score à zéro.

Les mises à jour ne se chevauchent pas. Le plan d'affichage reste figé pendant
le délai simulé et est validé seulement à la fin. Les calculs AIS continuent ;
le prochain plan prend l'état le plus récent. La cadence nominale est mesurée
entre débuts de refresh, et limitée par le temps d'occupation de la dalle.
La rémanence visuelle conserve 16 % de l'ancien rendu dans les zones partielles ;
c'est un outil de démonstration, pas une mesure physique. 30–60 s est un réglage
expérimental ; ajuster aux prescriptions du fabricant et aux essais réels.

## Calculs et protocole

`core.py` et `static/core.js` calculent les mêmes métriques, vérifiées par un test
de parité sur la même flotte déterministe :

- Distance orthodromique et relèvement vrai ; positions carte dans un plan local.
- Moyennes SOG arithmétiques et COG circulaires sur 30 s, 120 s et 300 s.
- Gain = `(distance ancienne − distance actuelle) × 1852` en mètres. Positif :
  rapprochement, **pas un classement ni un gain sur l'axe de course**.
- CPA/TCPA dans un plan local, à routes et vitesses constantes. Un TCPA passé
  est ramené à 0 et le CPA devient la distance locale actuelle ; vitesses
  relatives identiques : même convention.
- Historique de distances à 1 Hz pendant 30 min ; historique SOG/COG échantillonné
  toutes les 10 s. COG déroulé sur les graphiques pour éviter un saut 359° → 0°.

Les moyennes utilisent les échantillons disponibles au démarrage. Avant un
horizon complet, `gain_m` vaut 0 pour compatibilité, `gain_ready` vaut false et la
nouvelle UI affiche `—`. Les observations répétées ou hors ordre sont refusées.
Les cibles vieilles de plus de 180 s sont masquées. Pas de parseur AIS/NMEA réel
ni d'alarme anticollision dans cette version.

Le snapshot conserve `schema: 1`, `timestamp`, `own`, `targets`, `units`. Ajouts
compatibles aux cibles : `gain_ready` et `motion_history` (triplets temps/SOG/COG).
Les horizons sont des clés JSON `"30"`, `"120"`, `"300"`. L'interface ne dépend
pas du matériel. `own` inclut aussi `sog_avg` et `cog_avg` sur les trois horizons ;
le pied d'écran affiche nos moyennes sur 2 minutes. L'interface ne dépend
pas du générateur : l'adaptateur Python récupère `/snapshot`, l'adaptateur web
calcule localement. Une perte de connexion Python est affichée explicitement,
sans basculer silencieusement vers un autre générateur.

```text
Python : simulator.py → core.py → server.py /snapshot ─┐
Web    : static/core.js (flotte + calculs) ────────────┤
                                                     ↓
                    renderer.js → epaper.js → CanvasBackend
                        scène       plan       rendu 800×480
```

`renderer.js` est indépendant du matériel. `epaper.js` produit le plan full ou
partial, les rectangles et la durée. `CanvasBackend` applique le plan au
navigateur. Un futur driver TRMNL/E1001 devra porter les primitives de rendu et
les opérations full/partial, gérer BUSY et confirmer la fin réelle du refresh.
**Aucun firmware ESP32 prêt à flasher n'est fourni** ; voir
[`firmware-e1001/README.md`](firmware-e1001/README.md).

## Publication GitHub Pages

Les fichiers prêts à publier sont versionnés dans **`docs/`**, avec `.nojekyll`.
Pas de compilation, CDN, backend, npm ou workflow de déploiement nécessaire.
Tous les liens sont relatifs, adaptés au sous-chemin du dépôt.

1. Vérifier les changements dans GitHub Desktop, créer le commit puis pousser
   vers `main` lorsque vous êtes prêt.
2. Dans le dépôt GitHub : **Settings → Pages → Build and deployment**.
3. Source : **Deploy from a branch**. Branche : **main**. Dossier : **/docs**.
4. Cliquer **Save**, puis attendre la fin de la publication Pages.

URL attendue après activation et déploiement :
**<https://icris28.github.io/sunfast3300_epaper/>**.
Cette URL n'est pas déclarée publiée par cette préparation locale : aucun
push ni changement de réglage GitHub n'est effectué automatiquement.
Référence : [configuration officielle GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Développement et vérification

Modifier **`src/ais_race/static/`**, puis synchroniser les ressources publiques :

```powershell
python tools/sync_web.py
python tools/sync_web.py --check
.\run.cmd --test
node --test tests/web.test.cjs
```

Node.js 20+ est nécessaire seulement pour les tests JavaScript, jamais pour
ouvrir le simulateur. Le test de parité appelle `python` ; définir `$env:PYTHON`
avec le chemin de l'exécutable si nécessaire. `sync_web.py --check` détecte une
version publique oubliée lors d'une modification du renderer. Le script ne
touche qu'aux six ressources connues et à `.nojekyll`.

Les tests couvrent les calculs, horizons incomplets, rétention, cibles périmées,
parité Python/JS, service HTTP, accumulation des petits changements, rectangles
anciens/nouveaux, cadence indépendante des graphiques, BUSY, navigation et
nettoyages adaptatifs. Pour un contrôle visuel : parcourir les quatre vues,
changer la portée et le concurrent, activer les rectangles, attendre un full,
tester ×20, Pause, Rejouer et une largeur mobile.
