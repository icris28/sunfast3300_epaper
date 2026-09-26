# Sun Fast 3300 · AIS Race / E1001 virtuel

Prototype PC en Python pour tester un afficheur AIS de régate avant l'arrivée du
Seeed Studio reTerminal E1001. L'interface s'ouvre dans le navigateur et
représente l'écran en **800 × 480 pixels**, en noir et blanc. Six concurrents simulés évoluent autour
du Sun Fast 3300. Aucun matériel AIS ou e-paper n'est requis.

## Démarrer

Python 3.10+ et un navigateur sont nécessaires. Sur ce PC, `run.cmd` utilise le
Python fourni avec Codex s'il est présent, sinon une installation `python`
du système. Il n'y a aucune dépendance tierce à installer.

```powershell
cd C:\Users\chris\Documents\GitHub\sunfast3300_epaper
.\run.cmd
```

La page affiche la carte au départ, à `http://127.0.0.1:8765/`. Si le
navigateur ne s'ouvre pas automatiquement, ouvrir cette adresse. Arrêter le
simulateur avec Ctrl+C dans le terminal. Une installation editable est aussi
possible avec `python -m pip install -e .` sur un autre ordinateur.

| Commande | Effet |
| --- | --- |
| Flèche gauche / bouton gauche en bas | Vue précédente |
| Flèche droite / bouton droit en bas | Vue suivante |
| Entrée, Espace / bouton central | Concurrent suivant |

Les vues sont **Carte**, **Tableau**, **Graphiques** (écart avec la cible sur
les cinq dernières minutes) et **Détail**. Les trois zones en bas de fenêtre
simulent les trois boutons physiques. Le temps simulé peut être accéléré :

```powershell
.\run.cmd --speed 10
```

Pour tester le calcul sans interface :

```powershell
.\run.cmd --headless 300 > snapshot.json
.\run.cmd --test
```

Pendant que le simulateur tourne, le dernier état est aussi accessible à
`http://127.0.0.1:8765/snapshot`. Option `--port N` pour changer le port.
Le serveur n'écoute que sur l'ordinateur local. Une fenêtre Tkinter alternative
est disponible avec `--tk` si l'installation Python contient Tcl/Tk;
`--tk --no-server` désactive alors le serveur.

## Architecture

```text
AIS simulé (simulator.py) ─┐
                           ├─> observations ─> RaceEngine (core.py)
Futur AIS réel / NMEA 2000 ┘                         │
                                                   snapshot JSON v1
                                                      └─> HTTP local (server.py)
                                                               ├─> écran navigateur (display.html)
                                                               ├─> UI Tk optionnelle (ui.py)
                                                               └─> futur ESP32-S3 / E1001
```

Le moteur dans `core.py` n'importe ni Tkinter, ni le simulateur, ni le serveur.
Un futur lecteur AIS réel pourra fournir les mêmes `Observation` à
`RaceEngine.ingest`. L'affichage et le futur firmware doivent lire le même
snapshot. Le firmware n'est pas encore implémenté; `firmware-e1001/README.md`
décrit le point d'intégration prévu.

Chaque observation contient MMSI, nom, latitude, longitude, SOG en nœuds,
COG en degrés vrais et temps en secondes croissantes. Le moteur conserve
30 minutes d'historique par défaut et calcule pour chaque concurrent :

- distance et relèvement vrais depuis notre bateau ;
- SOG moyenne et COG moyenne circulaire sur 30 s, 2 min et 5 min ;
- gain/perte en mètres sur les mêmes horizons : valeur positive si l'écart se réduit ;
- CPA en milles nautiques et TCPA en minutes, à vitesses et routes constantes ;
- historique horodaté des écarts, utilisé par le graphique.

Avant qu'un horizon complet soit disponible, les moyennes portent sur les
échantillons déjà reçus et le gain est affiché à zéro. Le calcul CPA/TCPA est
une projection locale simplifiée pour des bateaux proches, pas une alarme
anticollision certifiée. Les cibles sans observation depuis plus de 180 s ne
sont plus affichées.

Le JSON porte `schema: 1`, `timestamp`, `own`, `targets` et `units`.
Les clés des horizons (`30`, `120`, `300`) deviennent des chaînes en JSON.
Le rafraîchissement de l'interface est d'une seconde; un vrai écran e-paper
devra limiter les rafraîchissements selon les caractéristiques du matériel.

## Dépôt

Le dépôt local Git est la source de vérité. Aucun commit ou push n'est nécessaire
pour lancer le prototype. Les données de démonstration sont générées par le code;
aucun fichier AIS externe n'est stocké.
