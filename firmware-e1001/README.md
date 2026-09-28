# Intégration matérielle future · TRMNL / E1001

Le simulateur partage une surface 800 × 480 et un contrat de rendu indépendant
du matériel. Aucun firmware flashable n'est livré à ce stade.

Le PC calcule les métriques et expose le snapshot JSON v1. Le navigateur local
et le simulateur statique utilisent la même scène (`renderer.js`) et le même
ordonnanceur (`epaper.js`). Les profils TRMNL / E1001 ne changent aujourd'hui
que les durées **simulées** ; ils ne sélectionnent pas un vrai driver.

Pour porter sur ESP32-S3 :

1. Sélectionner la bibliothèque, le brochage et les formes d'onde adaptés à la
   révision exacte du matériel reçu.
2. Adapter les primitives de scène (texte, traits, triangles, graphiques) à un
   framebuffer monochrome 800 × 480 ; utiliser des polices embarquées.
3. Porter le planificateur : rectangles ancienne + nouvelle position, clipping,
   alignement de 8 pixels, seuils comparés à la dernière image **validée**.
4. Appliquer full ou partial via le driver et attendre le signal BUSY. Valider
   le plan uniquement après la fin réelle ; conserver les nouvelles données
   reçues pendant l'opération pour le plan suivant.
5. Relier les trois boutons : précédent / cible suivante / suivant. Tout
   changement de contexte entraîne un full.
6. Mesurer durées et rémanence à différentes températures, puis régler le budget
   de partials, le ghost score et le cleanup selon les prescriptions de la dalle.

La stratégie 2 s / 10 s / full adaptatif 30–60 s est expérimentale. La simulation
ne reproduit ni le ghosting physique ni les formes d'onde. Les valeurs E1001
0,5 s / 4 s sont des paramètres provisoires, pas des spécifications constructeur.

La connexion Wi-Fi, la réception HTTP, l'alimentation, la gestion d'erreurs et
les mesures matérielles restent à réaliser. Le serveur Python actuel écoute
uniquement sur `127.0.0.1` pour les essais PC. L'accès réseau se configurera lors
de l'intégration embarquée. L'ancien dossier est conservé pour continuité ; le
contrat vaut pour les deux appareils.
