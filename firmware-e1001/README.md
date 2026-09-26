# Futur firmware E1001

Cette étape reste à réaliser après réception du Seeed Studio reTerminal E1001.
Le PC continuera à calculer les métriques AIS; l'ESP32-S3 récupérera le
snapshot JSON version 1 et dessinera les vues 800×480 avec la bibliothèque
e-paper adaptée au matériel. Les trois boutons physiques reprendront
page précédente, cible suivante et page suivante.

À valider sur le matériel : bibliothèque et brochage de la révision reçue,
connexion Wi-Fi, intervalle de rafraîchissement, politique de rafraîchissement
complet et gestion d'énergie. Le serveur actuel écoute uniquement sur
127.0.0.1 pour les essais PC; l'accès réseau sera ajouté au moment de
l'intégration matérielle avec configuration et sécurité adaptées.
