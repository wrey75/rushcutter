# RushCutter 🎬

**Logiciel de dérushing vidéo professionnel**  
Simplifiez le tri et la pré-découpe de vos rushs en début de workflow de montage.

---

## Fonctionnalités

- **Lecture vidéo intégrée** avec contrôles complets
- **Point d'entrée / sortie** pour chaque rush (touches I et O)
- **4 statuts** : À vérifier · Partiel · Complet · Supprimé
- **Export sans perte de qualité** : copie en stream copy (même codec, même bitrate)
- **Coupes sur images I (keyframes)** pour éviter les artefacts
- **Métadonnées préservées** (EXIF, timestamps)
- **Timeline interactive** avec visualisation de la sélection
- **Raccourcis clavier** complets pour un dérushing rapide

---

## Raccourcis clavier

| Touche       | Action                    |
|-------------|---------------------------|
| `Espace`    | Lecture / Pause           |
| `←`         | Reculer de 10 secondes    |
| `→`         | Avancer de 10 secondes    |
| `↑`         | Rush précédent            |
| `↓`         | Rush suivant              |
| `I`         | Définir le point d'entrée |
| `O`         | Définir le point de sortie|
| `R`         | Conserver tout (reset)    |
| `Suppr`     | Marquer comme supprimé    |

---

## Installation

### Prérequis

- **Node.js** v18 ou supérieur : https://nodejs.org
- **FFmpeg** doit être installé sur le système ou sera fourni via `ffmpeg-static`

### Installation des dépendances

```bash
cd rushcutter
npm install
```

### Lancement en développement

```bash
npm start
```

### Créer un installeur distributable

```bash
# macOS (.dmg)
npm run build:mac

# Windows (.exe installeur NSIS)
npm run build:win

# Linux (.AppImage)
npm run build:linux

# Toutes les plateformes
npm run build
```

Les fichiers de distribution se trouvent dans le dossier `dist/`.

---

## Workflow recommandé

1. **Ouvrir le répertoire** contenant vos rushs caméra
2. **Parcourir** chaque rush avec les touches ↑/↓
3. Pour chaque rush :
   - Appuyer `R` pour conserver tout le rush tel quel
   - Appuyer `I` au début de la partie intéressante, `O` à la fin → statut "Partiel"
   - Appuyer `Suppr` pour les rushs inutiles (flous, noirs, vides)
4. Une fois **tous les rushs traités**, le bouton "Exporter" se déverrouille
5. **Choisir le répertoire de sortie** et lancer l'export

---

## Remarques techniques

### Qualité de l'export
L'export utilise **FFmpeg en stream copy** (`-c copy`) : aucun réencodage n'est effectué. La qualité est strictement identique à l'original.

### Coupes sur images I
Pour les rushs "Partiels", la coupe est effectuée en utilisant le paramètre `-ss` *avant* `-i` dans FFmpeg, ce qui force FFmpeg à chercher la keyframe (image I) la plus proche du point souhaité. La zone conservée peut donc être légèrement plus grande que ce qui a été sélectionné, mais cela garantit une coupe propre sans artefacts.

### Formats supportés
MP4, MOV, AVI, MXF, MTS, M2TS, MKV, WMV, FLV, WebM, et autres formats reconnus par FFmpeg.

---

## Structure du projet

```
rushcutter/
├── package.json        # Configuration npm et electron-builder
├── src/
│   ├── main.js         # Processus principal Electron (Node.js)
│   ├── preload.js      # Bridge sécurisé IPC
│   ├── index.html      # Interface utilisateur
│   ├── style.css       # Styles
│   └── app.js          # Logique applicative (renderer)
└── README.md
```
