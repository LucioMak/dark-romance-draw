Dark Romance Draw

Contenu :
- index.html
- style.css
- app.js
- manifest.json
- service-worker.js
- icons/

Utilisation rapide :
1. Dézippe le dossier.
2. Ouvre index.html pour tester rapidement.
3. Pour que l'installation PWA et le service worker fonctionnent correctement, héberge le dossier ou lance un petit serveur local.

Exemples :
- Avec Node : npx serve dark-romance-draw
- Avec Python : python -m http.server 8080
- Hébergement simple : GitHub Pages, Netlify ou Vercel.

Installation Android :
1. Ouvre l'adresse de l'application dans Chrome Android.
2. Menu ⋮.
3. Ajouter à l'écran d'accueil ou Installer l'application.

Notes :
- Les médias sont stockés localement dans IndexedDB, pas sur un serveur.
- Les GIF et WEBP animés sont rendus avec une balise img pour éviter qu'ils deviennent fixes.
- Les vidéos MP4/WEBM/MOV sont rendues avec video, loop, muted et playsinline.
- Deezer est intégré via widget/lien quand c'est possible. Une vraie connexion au compte Deezer demande une configuration développeur OAuth côté service externe.
