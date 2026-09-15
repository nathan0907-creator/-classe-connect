# ClasseConnect

Un espace de classe en français : discussion en temps réel, actualités, comptes-rendus du conseil, demandes privées au délégué et liste des membres.

## Publication sur GitHub Pages

Le site se trouve dans `public/`. Le workflow `.github/workflows/pages.yml` publie ce dossier à chaque modification sur `main`.

1. Ouvrir [Settings → Pages](https://github.com/nathan0907-creator/-classe-connect/settings/pages).
2. Dans **Build and deployment → Source**, choisir **GitHub Actions**.
3. Dans [Actions](https://github.com/nathan0907-creator/-classe-connect/actions), lancer **Publier ClasseConnect → Run workflow** si la première exécution a échoué avant l’activation de Pages.
4. Après réussite, le site sera disponible sur **https://nathan0907-creator.github.io/-classe-connect/**.

GitHub Pages héberge l’interface. Firebase Authentication gère les comptes et Firebase Realtime Database synchronise les messages entre appareils.

## Activer le service Firebase existant

La configuration publique du fichier d’origine a été conservée (`e-pacifique`). Aucun compte de service ni clé privée n’est inclus. Les règles du projet hébergé ne sont pas modifiées par la publication sur GitHub.

Le propriétaire du projet doit effectuer les opérations suivantes dans la [console Firebase](https://console.firebase.google.com/project/e-pacifique/overview) :

1. **Authentication → Sign-in method** : activer **Email/Password**.
2. **Authentication → Settings → Authorized domains** : ajouter `nathan0907-creator.github.io`. Pour les essais locaux, ajouter `localhost` et `127.0.0.1` si nécessaire.
3. **Realtime Database → Rules** : après vérification des éventuels autres usages de cette base, publier le contenu de `database.rules.json`. Le fichier couvre les cinq collections de ClasseConnect ; il refuse par défaut l’accès aux autres chemins. S’il existe d’autres applications dans ce projet Firebase, fusionner leurs règles au lieu de les remplacer.
4. Créer un compte depuis le site. Dans **Realtime Database → Data → users → UID du délégué**, attribuer `isAdmin: true` uniquement à la personne choisie. Cette opération se fait depuis la console administrateur ; personne ne peut s’auto-attribuer ce rôle depuis le site avec les règles fournies.

Avec une session CLI Firebase déjà autorisée, la commande suivante déploie ces règles :

```sh
firebase deploy --only database --project e-pacifique
```

Les utilisateurs existants restent en place. Les comptes créés depuis le site sont des membres ordinaires. Vérifier les délégués existants avant ouverture : l’ancienne version attribuait le rôle au premier inscrit côté navigateur.

## Fonctionnement et limites

- Les messages récents (300 maximum) se synchronisent en temps réel après connexion. La recherche porte sur ces messages chargés.
- Entrée envoie ; Maj + Entrée ajoute une ligne. Le texte reste dans la page si l’envoi échoue. Aucun stockage persistant de brouillons n’est effectué.
- Tous les membres inscrits peuvent lire la discussion et publier une actualité. Cette version représente une seule classe et ne comporte pas de code d’invitation.
- Le délégué publie les comptes-rendus et lit les demandes privées. Un élève peut envoyer une demande ; il ne peut pas consulter les demandes dans cette version.
- Le bouton **Découvrir l’espace** ouvre des données fictives séparées du service. Les essais de messages restent en mémoire dans cette page et disparaissent à son rechargement.
- Déconnexion et changement de compte ferment les abonnements et effacent le contenu visible de la session précédente.
- L’interface s’adapte au téléphone et respecte le réglage système de réduction des animations.

Les règles ont été validées sur l’émulateur Firebase. Une validation de bout en bout sur le projet réel nécessite les accès Firebase du propriétaire et deux comptes de test : envoyer un message avec le premier, vérifier sa réception avec le second, puis vérifier qu’un élève ne peut pas consulter les demandes du délégué.

## Développement local

Node.js 24 ou plus récent. Le site fonctionne sans compilation :

```sh
node server.cjs
```

Ouvrir `http://127.0.0.1:4180`.

## Tests

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm test:rules
```

Les tests des règles nécessitent Java 21 ou plus récent. Ils utilisent exclusivement `demo-classe-connect` et ne modifient pas les données du projet réel.

Les tests couvrent la conservation des brouillons après échec, le mode hors ligne, les doubles envois, l’affichage du texte HTML, le nettoyage des sessions, la recherche, le refus de l’usurpation d’identité, les limites des messages, les droits du délégué et la confidentialité des demandes.
