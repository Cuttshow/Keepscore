# Keepscore

A scorepad for card games. 2–8 players, any game that scores by rounds.
Columns per player, oldest round on top, totals at the bottom — same as
pencil and paper, except you can fix a number without scribbling it out.

Runs entirely in the browser. No accounts, no server, no network needed
after the first visit. Scores are saved on the device.

## Put it online

1. Push these files to the root of the repo:

   ```
   git remote add origin https://github.com/Cuttshow/Keepscore.git
   git add .
   git commit -m "Keepscore"
   git branch -M main
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Source: Deploy from a branch**, then
   pick **main** and **/ (root)**. Save.

3. Wait a minute. It goes live at:

   **https://cuttshow.github.io/Keepscore/**

## Put it on a phone

Open that URL on the phone, then:

- **iPhone** — Share → Add to Home Screen
- **Android** — menu → Install app / Add to Home screen

It launches full-screen with its own icon, no browser bars, and works
with no signal. Send the URL to anyone else who wants a copy.

## What's here

| File | What it is |
|---|---|
| `index.html` | Page shell, home-screen meta tags, service worker registration |
| `app.js` | The app, compiled to plain JavaScript. **Don't edit by hand.** |
| `src/scorepad.jsx` | The actual source. Edit this one. |
| `src/build.js` | Compiles the JSX into `app.js` |
| `sw.js` | Service worker — caches everything for offline use |
| `manifest.webmanifest` | Name, colors, and icons for the home screen |
| `vendor/` | React 18, vendored so the app has no CDN dependency |

## Changing it

`app.js` is generated, so edits belong in `src/scorepad.jsx`. To rebuild:

```
npm install @babel/core @babel/preset-react
node src/build.js
```

Then **bump the version in `sw.js`** — change `keepscore-v1` to `-v2`, and
so on. This matters: the service worker serves the cached copy first, so
phones that already installed the app will keep running the old version
until that string changes. It's the one step that's easy to forget and
confusing when you do.

## Known limits

- **Scores are per device.** Each phone keeps its own games. There's no
  sync between players — one person keeps score, like the paper pad.
- **Clearing browser data wipes saved games.** Nothing is stored anywhere else.
- **Fonts come from Google.** Offline before they've been cached once, the
  app falls back to the system font. Everything still works, it just looks
  slightly plainer.
