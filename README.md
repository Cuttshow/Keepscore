# Keepscore

A scorepad for card games. 2–8 players, any game that scores by rounds.
Columns per player, oldest round on top, totals at the bottom — same as
pencil and paper, except you can fix a number without scribbling it out.

Runs entirely in the browser. No accounts, no server, no network needed
after the first visit. Scores are saved on the device.

**Every file goes in the repo root. There are no folders.**

## Put it online

1. Put all the files in the root of the repo and push.
2. On GitHub: **Settings → Pages → Source: Deploy from a branch**, then
   pick **main** and **/ (root)**. Save.
3. Wait a minute. It goes live at **https://cuttshow.github.io/Keepscore/**

To check it worked, open the URL and then open
`https://cuttshow.github.io/Keepscore/app.js` — you should see a wall of
JavaScript, not a 404.

## Put it on a phone

Open the URL on the phone, then:

- **iPhone** — Share → Add to Home Screen
- **Android** — menu → Install app / Add to Home screen

It launches full-screen with its own icon and works with no signal.
Send the URL to anyone else who wants a copy.

## What's here

| File | What it is | Needed to run? |
|---|---|---|
| `index.html` | Page shell and home-screen meta tags | Yes |
| `app.js` | React plus the app, bundled into one file | Yes |
| `sw.js` | Service worker — caches everything for offline use | Yes |
| `manifest.webmanifest` | Name, colors, icons for the home screen | Yes |
| `icon-192.png` `icon-512.png` `apple-touch-icon.png` | Icons | Yes |
| `.nojekyll` | Tells GitHub Pages to serve files untouched | Yes |
| `scorepad.jsx` | The readable source | No |
| `build.js` | Regenerates `app.js` from the source | No |

`app.js` is 174KB because React is bundled into it. That's deliberate:
one flat file can't be broken by a folder going missing, and once the
service worker caches it, size stops mattering.

## Changing it

Edit `scorepad.jsx`, never `app.js`. Then:

```
npm install @babel/core @babel/preset-react react@18.3.1 react-dom@18.3.1
node build.js
```

Then **bump the version in `sw.js`** — `keepscore-v2` to `-v3`, and so on.
This matters: the service worker serves its cached copy first, so phones
that already opened the app keep running the old version until that string
changes. It's the easy step to forget and a confusing one to debug.

## If the page says "Keepscore didn't load"

That message means the browser couldn't run `app.js`. Check that `app.js`
and `index.html` are both in the repo **root**, side by side, and that
`.nojekyll` exists. Open `.../app.js` directly — a 404 there names the problem.

## Known limits

- **Scores are per device.** Each phone keeps its own games. There's no
  sync between players — one person keeps score, like the paper pad.
- **Clearing browser data wipes saved games.**
- **Fonts come from Google.** Offline before they've been cached once, the
  app falls back to the system font. Everything works, it just looks plainer.
