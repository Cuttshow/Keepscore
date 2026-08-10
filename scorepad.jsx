import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

const KEY = "scorepad:v2:state";

/* Works in two places: the Claude artifact sandbox (window.storage) and a
   normal browser (localStorage). Same async shape either way. */

async function loadState() {
  try {
    if (typeof window === "undefined") return null;
    if (window.storage) {
      const res = await window.storage.get(KEY);
      return res ? JSON.parse(res.value) : null;
    }
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function saveState(state) {
  try {
    if (typeof window === "undefined") return;
    if (window.storage) {
      await window.storage.set(KEY, JSON.stringify(state));
      return;
    }
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    /* private browsing or a full quota - scoring still works, it just won't persist */
  }
}

/* ------------------------------------------------------------------ */
/*  Game data                                                          */
/* ------------------------------------------------------------------ */

const PRESETS = [
  { key: "flip7", label: "Flip 7", name: "Flip 7", endMode: "target", target: 200, maxRounds: 10, lowWins: false },
  { key: "pigs", label: "Pass the Pigs", name: "Pass the Pigs", endMode: "target", target: 100, maxRounds: 10, lowWins: false },
  { key: "shucks", label: "Aw Shucks", name: "Aw Shucks", endMode: "rounds", target: 200, maxRounds: 10, lowWins: false },
  { key: "rummy", label: "Rummy", name: "Rummy", endMode: "target", target: 500, maxRounds: 10, lowWins: false },
  { key: "hearts", label: "Hearts", name: "Hearts", endMode: "target", target: 100, maxRounds: 10, lowWins: true },
  { key: "golf", label: "Golf", name: "Golf", endMode: "rounds", target: 100, maxRounds: 9, lowWins: true },
  { key: "custom", label: "Something else", name: "", endMode: "open", target: 100, maxRounds: 10, lowWins: false },
];

const uid = () => Math.random().toString(36).slice(2, 9);

function newGameFrom(draft) {
  return {
    id: uid(),
    name: draft.name.trim() || "Game night",
    players: draft.players.map((n, i) => ({
      id: uid(),
      name: (n.trim() || "PLAYER " + (i + 1)).toUpperCase(),
    })),
    rounds: [],
    endMode: draft.endMode,
    target: Number(draft.target) || 100,
    maxRounds: Number(draft.maxRounds) || 10,
    lowWins: draft.lowWins,
    bidding: !!draft.bidding,
    dismissedAt: -1,
  };
}

function totalsFor(game) {
  const t = {};
  game.players.forEach((p) => (t[p.id] = 0));
  game.rounds.forEach((r) => {
    game.players.forEach((p) => {
      t[p.id] += r.scores[p.id] || 0;
    });
  });
  return t;
}

function rankedFor(game, totals) {
  return game.players
    .map((p, i) => ({ ...p, total: totals[p.id] || 0, seat: i }))
    .sort((a, b) =>
      a.total === b.total ? a.seat - b.seat : game.lowWins ? a.total - b.total : b.total - a.total
    );
}

/* The open round holds two passes: bids first, then scores. Older saves
   stored a flat map of scores, so normalize those forward. */
const emptyPending = () => ({ bids: {}, scores: {} });

function normalizePending(p) {
  if (!p) return emptyPending();
  if (p.bids || p.scores) return { bids: p.bids || {}, scores: p.scores || {} };
  return { bids: {}, scores: { ...p } };
}

const toInt = (s) => {
  const n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap');

.sp {
  --ink: #0E2028;
  --ink-2: #163039;
  --ink-3: #23444F;
  --line: #1B3A44;
  --paper: #F4F0E4;
  --paper-2: #9FB0B6;
  --gold: #F2A93B;
  --gold-2: #C87C16;
  --rose: #E2685C;
  --display: 'Bricolage Grotesque', 'Arial Narrow', system-ui, sans-serif;
  --body: 'Instrument Sans', system-ui, -apple-system, sans-serif;

  min-height: 100vh;
  min-height: 100dvh;
  background: var(--ink);
  color: var(--paper);
  font-family: var(--body);
  -webkit-font-smoothing: antialiased;
}
.sp * { box-sizing: border-box; }
.sp button { font-family: var(--body); cursor: pointer; border: none; background: none; color: inherit; }
.sp input { font-family: var(--body); }
.sp button:focus-visible, .sp input:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

.sp-wrap { max-width: 560px; margin: 0 auto; padding: 22px 14px 40px; }

.sp-eyebrow {
  font-size: 11px; font-weight: 600; letter-spacing: .15em;
  text-transform: uppercase; color: var(--paper-2);
}
.sp-title {
  font-family: var(--display); font-weight: 800; font-size: 30px;
  letter-spacing: -.02em; text-transform: uppercase; line-height: 1; margin: 6px 0 0;
}

.sp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.sp-menu {
  width: 40px; height: 40px; border-radius: 12px; flex: none;
  border: 1px solid var(--ink-3); color: var(--paper-2);
  display: grid; place-items: center; font-size: 17px;
}
.sp-menu:hover { color: var(--paper); border-color: var(--gold); }

.sp-meter { height: 3px; border-radius: 2px; background: #1C3B45; margin: 16px 0 22px; overflow: hidden; }
.sp-meter i { display: block; height: 100%; background: var(--gold); border-radius: 2px; transition: width .5s ease; }

/* ---------- the pad ---------- */
.sp-pad { width: 100%; border-collapse: collapse; table-layout: fixed; font-variant-numeric: tabular-nums; }
.sp-pad th, .sp-pad td { padding: 0; text-align: center; }

.sp-pad thead th {
  padding: 0 2px 9px; font-weight: 600; color: var(--paper-2);
  letter-spacing: .04em; text-transform: uppercase;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border-bottom: 1px solid var(--ink-3);
  transition: color .2s ease, background-color .2s ease;
}
.sp-pad thead th.is-live { color: var(--gold); background: rgba(242,169,59,.09); }
.sp-rdcol { width: 30px; }
.sp-pad thead th.sp-rdcol { color: #5C7A85; letter-spacing: .1em; }

.sp-cell {
  position: relative;
  height: 40px; font-family: var(--display); font-weight: 700; font-size: 16px;
  border-bottom: 1px solid var(--line); color: var(--paper);
  cursor: pointer; transition: background-color .16s ease;
}
.sp-cell:hover { background: var(--ink-2); }
.sp-cell.is-blank { color: #40606B; }
.sp-cell.is-live {
  background: var(--gold); color: #17202B; border-radius: 8px;
  box-shadow: inset 0 0 0 1px var(--gold-2);
}
.sp-cell.is-draft { color: var(--paper-2); }
.sp-bid {
  position: absolute; top: 2px; left: 3px;
  font-family: var(--body); font-weight: 600; font-size: 9px;
  letter-spacing: .02em; color: #6E8B94; pointer-events: none;
}
.sp-cell.is-live .sp-bid { color: rgba(23,32,43,.62); }

.sp-kp-seg { display: flex; gap: 6px; background: var(--ink); padding: 4px; border-radius: 12px; margin-bottom: 12px; }
.sp-kp-seg button {
  flex: 1; height: 34px; border-radius: 9px; font-size: 12.5px; font-weight: 600;
  letter-spacing: .06em; text-transform: uppercase; color: var(--paper-2);
  transition: background-color .18s ease, color .18s ease;
}
.sp-kp-seg button.is-on { background: var(--gold); color: #17202B; }

.sp-rd {
  font-family: var(--body); font-size: 11px; font-weight: 600; color: #5C7A85;
  border-bottom: 1px solid var(--line);
}
.sp-row-new .sp-rd { color: var(--gold); }

.sp-pad tfoot td {
  padding-top: 13px; font-family: var(--display); font-weight: 800; font-size: 20px;
  letter-spacing: -.02em; color: var(--gold); border-top: 2px solid var(--ink-3);
}
.sp-pad tfoot td.sp-rd {
  font-family: var(--body); font-size: 10px; font-weight: 600; color: var(--paper-2);
  letter-spacing: .1em; border-bottom: none;
}

.sp-note { font-size: 12.5px; color: #6E8B94; margin-top: 14px; line-height: 1.55; text-align: center; }

/* ---------- buttons ---------- */
.sp-primary {
  width: 100%; height: 56px; border-radius: 16px;
  background: var(--gold); color: #17202B; font-size: 16px; font-weight: 600;
  transition: filter .18s ease, transform .18s ease;
}
.sp-primary:hover { filter: brightness(1.07); }
.sp-primary:active { transform: scale(.985); }

.sp-ghost {
  height: 46px; border-radius: 13px; padding: 0 16px;
  border: 1px solid var(--ink-3); color: var(--paper-2); font-size: 14px; font-weight: 500;
  transition: color .18s ease, border-color .18s ease;
}
.sp-ghost:hover { color: var(--paper); border-color: #38626F; }
.sp-ghost.is-danger:hover { color: var(--rose); border-color: var(--rose); }
.sp-ghost[disabled] { opacity: .35; cursor: not-allowed; }
.sp-ghost[disabled]:hover { color: var(--paper-2); border-color: var(--ink-3); }
.sp-actions { display: flex; gap: 10px; margin-top: 22px; }
.sp-actions .sp-ghost { flex: 1; }

/* ---------- setup ---------- */
.sp-field { margin-top: 26px; }
.sp-input {
  width: 100%; height: 52px; border-radius: 14px; padding: 0 16px;
  background: var(--ink-2); border: 1px solid transparent; color: var(--paper);
  font-size: 16px; font-weight: 500;
}
.sp-input::placeholder { color: #62808A; }
.sp-input:focus { border-color: var(--gold); outline: none; }
.sp-input.is-name { letter-spacing: .02em; }

.sp-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.sp-chips.is-editing { padding-top: 8px; }
.sp-chip-wrap { position: relative; }
.sp-chip-x {
  position: absolute; top: -6px; right: -6px;
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--rose); color: #17202B;
  font-size: 15px; font-weight: 700; line-height: 1;
  display: grid; place-items: center;
  box-shadow: 0 0 0 2px var(--ink);
}
.sp-chips-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.sp-link { font-size: 12.5px; font-weight: 600; color: var(--gold); }
.sp-link.is-quiet { color: var(--paper-2); }
.sp-link:hover { text-decoration: underline; }
.sp-chip {
  height: 38px; padding: 0 14px; border-radius: 11px;
  background: var(--ink-2); color: var(--paper-2); font-size: 14px; font-weight: 500;
  transition: background-color .18s ease, color .18s ease;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.sp-chip:hover { color: var(--paper); }
.sp-chip.is-on { background: var(--gold); color: #17202B; font-weight: 600; }

.sp-seg { display: flex; gap: 6px; margin-top: 10px; background: var(--ink-2); padding: 5px; border-radius: 14px; }
.sp-seg button {
  flex: 1; height: 40px; border-radius: 10px; font-size: 13px; font-weight: 500;
  color: var(--paper-2); transition: background-color .18s ease, color .18s ease;
}
.sp-seg button:hover { color: var(--paper); }
.sp-seg button.is-on { background: var(--gold); color: #17202B; font-weight: 600; }

.sp-player { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.sp-player .sp-input { flex: 1; }
.sp-x { width: 44px; height: 52px; border-radius: 13px; flex: none; color: #5C7A85; font-size: 20px; transition: color .18s ease; }
.sp-x:hover { color: var(--rose); }
.sp-add { width: 100%; height: 48px; border-radius: 13px; margin-top: 10px; border: 1px dashed var(--ink-3); color: var(--paper-2); font-size: 14px; font-weight: 500; }
.sp-add:hover { color: var(--paper); border-color: #38626F; }
.sp-hint { font-size: 12.5px; color: #6E8B94; margin-top: 8px; line-height: 1.5; }

/* ---------- keypad ---------- */
.sp-keypad {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
  background: var(--ink-2); border-top: 1px solid var(--ink-3);
  border-radius: 20px 20px 0 0;
  padding: 14px 14px calc(14px + env(safe-area-inset-bottom));
  animation: sp-rise .22s cubic-bezier(.2,.8,.25,1);
}
.sp-keypad-inner { max-width: 560px; margin: 0 auto; }
@keyframes sp-rise { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.sp-kp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.sp-kp-who { min-width: 0; }
.sp-kp-who b {
  display: block; font-family: var(--display); font-weight: 800; font-size: 19px;
  letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sp-kp-who span { font-size: 11.5px; color: var(--paper-2); letter-spacing: .06em; text-transform: uppercase; font-weight: 600; }
.sp-kp-val {
  font-family: var(--display); font-weight: 800; font-size: 34px; letter-spacing: -.03em;
  font-variant-numeric: tabular-nums; color: var(--gold); flex: none;
}
.sp-kp-val.is-empty { color: #40606B; }

.sp-keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.sp-key {
  height: 54px; border-radius: 13px; background: var(--ink);
  font-family: var(--display); font-weight: 700; font-size: 22px; color: var(--paper);
  transition: background-color .12s ease, transform .12s ease;
}
.sp-key:hover { background: #0A1920; }
.sp-key:active { transform: scale(.95); }
.sp-key.is-util { font-family: var(--body); font-size: 17px; font-weight: 600; color: var(--paper-2); }
.sp-key.is-go {
  grid-column: 4; grid-row: 3 / span 2; height: auto;
  background: var(--gold); color: #17202B; font-family: var(--body);
  font-size: 14px; font-weight: 600; letter-spacing: .04em;
}
.sp-key.is-go:hover { background: #F5B857; }

/* ---------- sheets ---------- */
.sp-scrim {
  position: fixed; inset: 0; background: rgba(8,20,26,.72); z-index: 60;
  display: flex; align-items: flex-end; justify-content: center; animation: sp-fade .2s ease;
}
@keyframes sp-fade { from { opacity: 0; } to { opacity: 1; } }
.sp-sheet {
  width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto;
  background: var(--ink); border-radius: 22px 22px 0 0; border-top: 1px solid var(--ink-3);
  padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
  animation: sp-rise .28s cubic-bezier(.2,.8,.25,1);
}
.sp-crown { font-family: var(--display); font-weight: 800; font-size: 42px; letter-spacing: -.03em; line-height: 1.05; }
.sp-standing { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 15px; }
.sp-standing b { font-family: var(--display); font-weight: 700; font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) {
  .sp * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`;

/* ------------------------------------------------------------------ */
/*  Uppercase-only text input (caret-safe)                             */
/* ------------------------------------------------------------------ */

function CapsInput({ value, onChange, ...rest }) {
  const ref = useRef(null);
  const caret = useRef(null);

  useLayoutEffect(() => {
    if (caret.current != null && ref.current) {
      const pos = caret.current;
      caret.current = null;
      try {
        ref.current.setSelectionRange(pos, pos);
      } catch (e) {
        /* input type may not support selection */
      }
    }
  });

  return (
    <input
      {...rest}
      ref={ref}
      value={value}
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck="false"
      onChange={(e) => {
        caret.current = e.target.selectionStart;
        onChange(e.target.value.toUpperCase());
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

function Setup({ initialPlayers, customGames, hiddenPresets, onDeletePreset, onDeleteCustom, onRestorePresets, onStart }) {
  const visiblePresets = PRESETS.filter((p) => p.key !== "custom" && hiddenPresets.indexOf(p.key) === -1);
  const somethingElse = PRESETS[PRESETS.length - 1];
  const first = visiblePresets[0];

  const [preset, setPreset] = useState(first ? first.key : null);
  const [editing, setEditing] = useState(false);
  const pressTimer = useRef(null);

  const [draft, setDraft] = useState({
    name: first ? first.name : "",
    players: initialPlayers && initialPlayers.length ? initialPlayers : ["", ""],
    endMode: first ? first.endMode : "open",
    target: first ? first.target : 100,
    maxRounds: first ? first.maxRounds : 10,
    lowWins: first ? first.lowWins : false,
    bidding: false,
  });

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // Built-in chips carry their settings. Saved names carry only the name -
  // whatever is set below stays where you left it.
  const applyPreset = (p) => {
    setPreset(p.key);
    set({ name: p.name, endMode: p.endMode, target: p.target, maxRounds: p.maxRounds, lowWins: p.lowWins });
  };
  const applySaved = (nm) => {
    setPreset("saved:" + nm);
    set({ name: nm });
  };

  const chips = [
    ...visiblePresets.map((p) => ({ key: p.key, label: p.label, deletable: true, pick: () => applyPreset(p), del: () => onDeletePreset(p.key) })),
    ...customGames.map((nm) => ({ key: "saved:" + nm, label: nm, deletable: true, pick: () => applySaved(nm), del: () => onDeleteCustom(nm) })),
    { key: "custom", label: "Something else", deletable: false, pick: () => applyPreset(somethingElse) },
  ];

  const startPress = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setEditing(true), 550);
  };
  const endPress = () => clearTimeout(pressTimer.current);

  // Keep the highlight honest when the name is typed by hand.
  const onNameTyped = (v) => {
    const hit = chips.find((c) => c.label.toLowerCase() === v.trim().toLowerCase());
    setPreset(hit ? hit.key : null);
    set({ name: v });
  };

  return (
    <div className="sp-wrap">
      <h1 className="sp-title">New game - setup</h1>

      <div className="sp-field">
        <div className="sp-chips-head">
          <p className="sp-eyebrow">What are you playing?</p>
          {editing ? (
            <button className="sp-link" onClick={() => setEditing(false)}>Done</button>
          ) : (
            customGames.length + hiddenPresets.length > 0 && (
              <button className="sp-link is-quiet" onClick={() => setEditing(true)}>Edit</button>
            )
          )}
        </div>

        <div className={"sp-chips" + (editing ? " is-editing" : "")}>
          {chips.map((c) => (
            <div className="sp-chip-wrap" key={c.key}>
              <button
                className={"sp-chip" + (preset === c.key ? " is-on" : "")}
                onClick={() => { if (!editing) c.pick(); }}
                onPointerDown={startPress}
                onPointerUp={endPress}
                onPointerLeave={endPress}
                onPointerCancel={endPress}
                onContextMenu={(e) => e.preventDefault()}
              >
                {c.label}
              </button>
              {editing && c.deletable && (
                <button className="sp-chip-x" aria-label={"Remove " + c.label} onClick={() => c.del()}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {editing && hiddenPresets.length > 0 && (
          <button className="sp-link" style={{ marginTop: 12 }} onClick={onRestorePresets}>
            Restore the built-in games
          </button>
        )}

        <input
          className="sp-input"
          style={{ marginTop: 10 }}
          value={draft.name}
          placeholder="Name this game"
          onChange={(e) => onNameTyped(e.target.value)}
        />
        <p className="sp-hint">
          {editing
            ? "Tap × to remove a game from the list. This doesn't touch any scores."
            : "New names are added to the list when you start. Long-press a game to remove it."}
        </p>
      </div>

      <div className="sp-field">
        <p className="sp-eyebrow">Players ({draft.players.length})</p>
        {draft.players.map((p, i) => (
          <div className="sp-player" key={i}>
            <CapsInput
              className="sp-input is-name"
              value={p}
              placeholder={"PLAYER " + (i + 1)}
              onChange={(v) => set({ players: draft.players.map((x, j) => (j === i ? v : x)) })}
            />
            {draft.players.length > 2 && (
              <button className="sp-x" aria-label={"Remove player " + (i + 1)} onClick={() => set({ players: draft.players.filter((_, j) => j !== i) })}>
                ×
              </button>
            )}
          </div>
        ))}
        {draft.players.length < 8 && (
          <button className="sp-add" onClick={() => set({ players: [...draft.players, ""] })}>
            Add player
          </button>
        )}
        <p className="sp-hint">Shorter names read better once there are six or more columns.</p>
      </div>

      <div className="sp-field">
        <p className="sp-eyebrow">The game ends</p>
        <div className="sp-seg">
          {[["target", "At a score"], ["rounds", "After rounds"], ["open", "When you say"]].map(([k, label]) => (
            <button key={k} className={draft.endMode === k ? "is-on" : ""} onClick={() => set({ endMode: k })}>
              {label}
            </button>
          ))}
        </div>
        {draft.endMode === "target" && (
          <input
            className="sp-input"
            style={{ marginTop: 10 }}
            inputMode="numeric"
            value={draft.target}
            onChange={(e) => set({ target: e.target.value.replace(/[^0-9]/g, "") })}
            placeholder="Target score"
          />
        )}
        {draft.endMode === "rounds" && (
          <input
            className="sp-input"
            style={{ marginTop: 10 }}
            inputMode="numeric"
            value={draft.maxRounds}
            onChange={(e) => set({ maxRounds: e.target.value.replace(/[^0-9]/g, "") })}
            placeholder="Number of rounds"
          />
        )}
      </div>

      <div className="sp-field">
        <p className="sp-eyebrow">Winner is</p>
        <div className="sp-seg">
          <button className={!draft.lowWins ? "is-on" : ""} onClick={() => set({ lowWins: false })}>
            Highest score
          </button>
          <button className={draft.lowWins ? "is-on" : ""} onClick={() => set({ lowWins: true })}>
            Lowest score
          </button>
        </div>
      </div>

      <div className="sp-field">
        <p className="sp-eyebrow">Bidding</p>
        <div className="sp-seg">
          <button className={!draft.bidding ? "is-on" : ""} onClick={() => set({ bidding: false })}>
            Off
          </button>
          <button className={draft.bidding ? "is-on" : ""} onClick={() => set({ bidding: true })}>
            On
          </button>
        </div>
        <p className="sp-hint">
          Collects a bid from every player before the round is played, then the scores after.
          Bids sit next to the score on the pad — they aren't scored for you.
        </p>
      </div>

      <div style={{ marginTop: 30 }}>
        <button className="sp-primary" onClick={() => onStart(newGameFrom(draft))}>
          Start scoring
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Keypad                                                             */
/* ------------------------------------------------------------------ */

function Keypad({ player, playerIndex, playerCount, roundLabel, isCorrection, isLast, value, field, showSwitch, onField, onKey, onGo, onClose }) {
  const goLabel = isCorrection ? "SAVE" : isLast ? "DONE" : "NEXT";

  return (
    <div className="sp-keypad">
      <div className="sp-keypad-inner">
        <div className="sp-kp-head">
          <div className="sp-kp-who">
            <b>{player.name}</b>
            <span>
              {roundLabel}
              {field ? " · " + (field === "bid" ? "Bid" : "Score") : ""} · {playerIndex + 1} of {playerCount}
            </span>
          </div>
          <div className={"sp-kp-val" + (value === "" || value === "-" ? " is-empty" : "")}>
            {value === "" ? "0" : value}
          </div>
          <button className="sp-menu" onClick={onClose} aria-label="Close keypad">
            ×
          </button>
        </div>

        {showSwitch && (
          <div className="sp-kp-seg">
            <button className={field === "bid" ? "is-on" : ""} onClick={() => onField("bid")}>
              Bid
            </button>
            <button className={field === "score" ? "is-on" : ""} onClick={() => onField("score")}>
              Score
            </button>
          </div>
        )}

        <div className="sp-keys">
          {[
            ["1", 1, 1], ["2", 2, 1], ["3", 3, 1],
            ["4", 1, 2], ["5", 2, 2], ["6", 3, 2],
            ["7", 1, 3], ["8", 2, 3], ["9", 3, 3],
          ].map(([k, c, r]) => (
            <button key={k} className="sp-key" style={{ gridColumn: c, gridRow: r }} onClick={() => onKey(k)}>
              {k}
            </button>
          ))}
          <button className="sp-key is-util" style={{ gridColumn: 4, gridRow: 1 }} onClick={() => onKey("back")} aria-label="Backspace">
            ⌫
          </button>
          <button className="sp-key is-util" style={{ gridColumn: 4, gridRow: 2 }} onClick={() => onKey("neg")} aria-label="Positive or negative">
            ±
          </button>
          <button className="sp-key" style={{ gridColumn: "1 / span 2", gridRow: 4 }} onClick={() => onKey("0")}>
            0
          </button>
          <button className="sp-key is-util" style={{ gridColumn: 3, gridRow: 4 }} onClick={() => onKey("clear")} aria-label="Clear">
            C
          </button>
          <button className="sp-key is-go" onClick={onGo}>
            {goLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Result                                                             */
/* ------------------------------------------------------------------ */

function ResultSheet({ game, ranked, onKeepPlaying, onRematch, onNewGame }) {
  const top = ranked[0];
  const tied = ranked.filter((p) => p.total === top.total);
  return (
    <div className="sp-scrim">
      <div className="sp-sheet">
        <p className="sp-eyebrow">{game.name} · final</p>
        <p className="sp-crown" style={{ margin: "8px 0 20px" }}>
          {tied.length > 1 ? tied.map((p) => p.name).join(" & ") + " tie it." : top.name + " wins."}
        </p>
        {ranked.map((p, i) => (
          <div className="sp-standing" key={p.id}>
            <span style={{ color: i === 0 ? "#F4F0E4" : "#9FB0B6" }}>
              {i + 1}. {p.name}
            </span>
            <b style={{ color: i === 0 ? "#F2A93B" : "#9FB0B6" }}>{p.total}</b>
          </div>
        ))}
        <div style={{ marginTop: 24 }}>
          <button className="sp-primary" onClick={onRematch}>
            Rematch, same players
          </button>
        </div>
        <div className="sp-actions" style={{ marginTop: 14 }}>
          <button className="sp-ghost" onClick={onKeepPlaying}>
            Keep playing
          </button>
          <button className="sp-ghost" onClick={onNewGame}>
            New game
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

export default function ScorePad() {
  const [ready, setReady] = useState(false);
  const [game, setGame] = useState(null);
  const [lastPlayers, setLastPlayers] = useState(null);
  const [customGames, setCustomGames] = useState([]);
  const [hiddenPresets, setHiddenPresets] = useState([]);
  const [confirmNew, setConfirmNew] = useState(false);

  // pending (uncommitted) bottom row: playerId -> string
  const [pending, setPending] = useState(emptyPending());
  // active cell: { roundIndex: number|null, playerIndex, buffer, pristine }
  const [live, setLive] = useState(null);

  const liveRowRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadState().then((s) => {
      if (!alive) return;
      if (s && s.game) setGame(s.game);
      if (s && s.pending) setPending(normalizePending(s.pending));
      if (s && s.customGames) setCustomGames(s.customGames);
      if (s && s.hiddenPresets) setHiddenPresets(s.hiddenPresets);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ready) saveState({ game, pending, customGames, hiddenPresets });
  }, [game, pending, customGames, hiddenPresets, ready]);

  useLayoutEffect(() => {
    if (live && liveRowRef.current) {
      liveRowRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [live && live.roundIndex, live && live.playerIndex]);

  const totals = useMemo(() => (game ? totalsFor(game) : {}), [game]);
  const ranked = useMemo(() => (game ? rankedFor(game, totals) : []), [game, totals]);

  const ended = useMemo(() => {
    if (!game) return false;
    if (game.endMode === "target") return ranked.some((p) => p.total >= game.target);
    if (game.endMode === "rounds") return game.rounds.length >= game.maxRounds;
    return false;
  }, [game, ranked]);

  if (!ready) return <div className="sp"><style>{CSS}</style></div>;

  if (!game) {
    return (
      <div className="sp">
        <style>{CSS}</style>
        <Setup
          initialPlayers={lastPlayers}
          customGames={customGames}
          hiddenPresets={hiddenPresets}
          onDeletePreset={(k) => setHiddenPresets((h) => (h.indexOf(k) === -1 ? [...h, k] : h))}
          onDeleteCustom={(nm) => setCustomGames((c) => c.filter((x) => x !== nm))}
          onRestorePresets={() => setHiddenPresets([])}
          onStart={(g) => {
            const nm = g.name.trim();
            const builtIn = PRESETS.some(
              (p) => p.key !== "custom" && hiddenPresets.indexOf(p.key) === -1 && p.name.toLowerCase() === nm.toLowerCase()
            );
            if (nm && !builtIn) {
              setCustomGames((c) => [nm, ...c.filter((x) => x.toLowerCase() !== nm.toLowerCase())].slice(0, 40));
            }
            setPending(emptyPending());
            setGame(g);
          }}
        />
      </div>
    );
  }

  /* -------- bidding phase -------- */

  // Bids are mandatory, so the open round collects every bid before it will
  // take a single score.
  const bidsIn = game.players.every((p) => pending.bids[p.id] != null);
  const phase = game.bidding && !bidsIn ? "bids" : "scores";

  const valueAt = (roundIndex, pid, field) => {
    if (roundIndex == null) return field === "bid" ? pending.bids[pid] : pending.scores[pid];
    const r = game.rounds[roundIndex];
    return field === "bid" ? (r.bids || {})[pid] : r.scores[pid];
  };

  /* -------- cell editing -------- */

  const openCell = (roundIndex, playerIndex, field) => {
    const pid = game.players[playerIndex].id;
    let f = field;
    if (!f) f = roundIndex == null && phase === "bids" ? "bid" : "score";
    if (!game.bidding) f = "score";
    const cur = valueAt(roundIndex, pid, f);
    setLive({
      roundIndex,
      playerIndex,
      field: f,
      buffer: cur != null ? String(cur) : roundIndex == null ? "" : "0",
      pristine: true,
      staged: {},
    });
  };

  // Switching bid/score banks whatever is on screen so nothing is lost.
  const switchField = (f) => {
    setLive((l) => {
      if (!l || l.field === f) return l;
      const staged = { ...l.staged, [l.field]: toInt(l.buffer) };
      const pid = game.players[l.playerIndex].id;
      const cur = staged[f] != null ? staged[f] : valueAt(l.roundIndex, pid, f);
      return {
        ...l,
        field: f,
        staged,
        buffer: cur != null ? String(cur) : l.roundIndex == null ? "" : "0",
        pristine: true,
      };
    });
  };

  const onKey = (k) => {
    setLive((l) => {
      if (!l) return l;
      let b = l.buffer;
      if (k === "back") {
        b = b.slice(0, -1);
      } else if (k === "clear") {
        b = "";
      } else if (k === "neg") {
        b = b.startsWith("-") ? b.slice(1) : b === "" ? "-" : "-" + b;
      } else {
        // first digit press on an untouched cell replaces what was there
        if (l.pristine) b = k;
        else if (b.replace("-", "").length < 5) b = b === "0" ? k : b + k;
      }
      return { ...l, buffer: b, pristine: false };
    });
  };

  const onGo = () => {
    if (!live) return;
    const pid = game.players[live.playerIndex].id;
    const staged = { ...live.staged, [live.field]: toInt(live.buffer) };

    // Correcting a committed round: write whatever was touched, then get out.
    if (live.roundIndex != null) {
      setGame((g) => ({
        ...g,
        rounds: g.rounds.map((r, i) => {
          if (i !== live.roundIndex) return r;
          const next = { ...r, scores: { ...r.scores }, bids: { ...(r.bids || {}) } };
          if (staged.score != null) next.scores[pid] = staged.score;
          if (staged.bid != null) next.bids[pid] = staged.bid;
          return next;
        }),
      }));
      setLive(null);
      return;
    }

    const nextPending = { bids: { ...pending.bids }, scores: { ...pending.scores } };
    if (staged.bid != null) nextPending.bids[pid] = staged.bid;
    if (staged.score != null) nextPending.scores[pid] = staged.score;

    const isLast = live.playerIndex === game.players.length - 1;

    if (isLast) {
      // Finishing the bid pass just banks the bids - the round still has to be played.
      if (live.field === "bid") {
        setPending(nextPending);
        setLive(null);
        return;
      }
      const scores = {};
      const bids = {};
      game.players.forEach((p) => {
        scores[p.id] = toInt(nextPending.scores[p.id]);
        if (game.bidding) bids[p.id] = toInt(nextPending.bids[p.id]);
      });
      const round = { id: uid(), scores };
      if (game.bidding) round.bids = bids;
      setGame((g) => ({ ...g, rounds: [...g.rounds, round] }));
      setPending(emptyPending());
      setLive(null);
      return;
    }

    setPending(nextPending);
    const ni = live.playerIndex + 1;
    const nid = game.players[ni].id;
    const nv = live.field === "bid" ? nextPending.bids[nid] : nextPending.scores[nid];
    setLive({
      roundIndex: null,
      playerIndex: ni,
      field: live.field,
      buffer: nv != null ? String(nv) : "",
      pristine: true,
      staged: {},
    });
  };

  const closeKeypad = () => {
    if (live && live.roundIndex == null) {
      const pid = game.players[live.playerIndex].id;
      const staged = { ...live.staged };
      if (live.buffer !== "") staged[live.field] = toInt(live.buffer);
      const next = { bids: { ...pending.bids }, scores: { ...pending.scores } };
      if (staged.bid != null) next.bids[pid] = staged.bid;
      if (staged.score != null) next.scores[pid] = staged.score;
      setPending(next);
    }
    setLive(null);
  };

  /* -------- game actions -------- */

  const undoLast = () => {
    if (!game.rounds.length) return;
    setLive(null);
    setGame({ ...game, rounds: game.rounds.slice(0, -1) });
  };

  const clearPending = () => setPending(emptyPending());

  const rematch = () => {
    setPending(emptyPending());
    setLive(null);
    setGame({ ...game, id: uid(), rounds: [], dismissedAt: -1 });
  };

  const clearGame = () => {
    setLastPlayers(game.players.map((p) => p.name));
    setPending(emptyPending());
    setLive(null);
    setGame(null);
  };

  const startOver = () => {
    if (game.rounds.length) { setConfirmNew(true); return; }
    clearGame();
  };

  /* -------- display -------- */

  const n = game.players.length;
  const showResult = ended && game.dismissedAt !== game.rounds.length;
  const nextRoundNo = game.rounds.length + 1;
  const hasPending = Object.keys(pending.bids).length + Object.keys(pending.scores).length > 0;

  const headSize = n >= 7 ? 9.5 : n >= 5 ? 11 : 12.5;
  const cellSize = n >= 7 ? 13 : n >= 5 ? 15 : 16;

  const progress =
    game.endMode === "target"
      ? Math.min(100, (Math.max(...ranked.map((p) => p.total), 0) / game.target) * 100)
      : game.endMode === "rounds"
      ? Math.min(100, (game.rounds.length / game.maxRounds) * 100)
      : 0;

  const subtitle =
    game.endMode === "target"
      ? "Round " + nextRoundNo + " · " + (game.lowWins ? "ends at " : "first to ") + game.target
      : game.endMode === "rounds"
      ? "Round " + Math.min(nextRoundNo, game.maxRounds) + " of " + game.maxRounds
      : "Round " + nextRoundNo;

  return (
    <div className="sp">
      <style>{CSS}</style>
      <div className="sp-wrap" style={{ paddingBottom: live ? 340 : 40 }}>
        <div className="sp-head">
          <div style={{ minWidth: 0 }}>
            <p className="sp-eyebrow">{subtitle}</p>
            <h1 className="sp-title">{game.name}</h1>
          </div>
          <button className="sp-menu" onClick={startOver} aria-label="Start a new game">
            ⌂
          </button>
        </div>

        {game.endMode !== "open" ? (
          <div className="sp-meter"><i style={{ width: progress + "%" }} /></div>
        ) : (
          <div style={{ height: 24 }} />
        )}

        <table className="sp-pad">
          <thead>
            <tr>
              <th className="sp-rdcol" style={{ fontSize: 9.5 }}>Rd</th>
              {game.players.map((p, i) => (
                <th
                  key={p.id}
                  title={p.name}
                  style={{ fontSize: headSize }}
                  className={live && live.playerIndex === i ? "is-live" : ""}
                >
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {game.rounds.map((r, ri) => {
              const isLiveRow = live && live.roundIndex === ri;
              return (
                <tr key={r.id} ref={isLiveRow ? liveRowRef : null}>
                  <td className="sp-rd">{ri + 1}</td>
                  {game.players.map((p, pi) => {
                    const isLiveCell = isLiveRow && live.playerIndex === pi;
                    const bid = (r.bids || {})[p.id];
                    const showBid = game.bidding && bid != null && !(isLiveCell && live.field === "bid");
                    return (
                      <td
                        key={p.id}
                        className={"sp-cell" + (isLiveCell ? " is-live" : "")}
                        style={{ fontSize: cellSize }}
                        onClick={() => openCell(ri, pi)}
                      >
                        {showBid && <span className="sp-bid">{bid}</span>}
                        {isLiveCell ? live.buffer || "0" : r.scores[p.id] || 0}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* the open round */}
            <tr className="sp-row-new" ref={live && live.roundIndex == null ? liveRowRef : null}>
              <td className="sp-rd">{nextRoundNo}</td>
              {game.players.map((p, pi) => {
                const isLiveCell = live && live.roundIndex == null && live.playerIndex === pi;
                const bid = pending.bids[p.id];
                const score = pending.scores[p.id];

                // Whatever is being typed is always the big number; the bid
                // drops to the corner once the round moves on to scores.
                let text, showBid, filled;
                if (isLiveCell) {
                  text = live.buffer || "0";
                  showBid = game.bidding && live.field === "score" && bid != null;
                  filled = true;
                } else if (game.bidding && phase === "bids") {
                  text = bid != null ? String(bid) : "–";
                  showBid = false;
                  filled = bid != null;
                } else {
                  text = score != null ? String(score) : "–";
                  showBid = game.bidding && bid != null;
                  filled = score != null;
                }

                return (
                  <td
                    key={p.id}
                    className={"sp-cell" + (isLiveCell ? " is-live" : filled ? " is-draft" : " is-blank")}
                    style={{ fontSize: cellSize }}
                    onClick={() => openCell(null, pi)}
                  >
                    {showBid && <span className="sp-bid">{bid}</span>}
                    {text}
                  </td>
                );
              })}
            </tr>
          </tbody>

          <tfoot>
            <tr>
              <td className="sp-rd">Tot</td>
              {game.players.map((p) => (
                <td key={p.id} style={{ fontSize: n >= 7 ? 16 : 20 }}>
                  {totals[p.id] || 0}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>

        {game.rounds.length === 0 && !live && (
          <p className="sp-note">
            Tap {game.bidding ? "Enter Bids" : "Enter Scores"}, or any cell in round 1, to start.
            <br />
            DONE on the last player writes the round in.
          </p>
        )}

        <div style={{ marginTop: 22 }}>
          <button className="sp-primary" onClick={() => openCell(null, 0)}>
            {phase === "bids" ? "Enter Bids" : "Enter Scores"}
          </button>
        </div>

        <div className="sp-actions" style={{ marginTop: 10 }}>
          <button className="sp-ghost" onClick={undoLast} disabled={!game.rounds.length}>
            Undo last round
          </button>
          <button className="sp-ghost" onClick={clearPending} disabled={!hasPending}>
            Clear this round
          </button>
        </div>
      </div>

      {live && (
        <Keypad
          player={game.players[live.playerIndex]}
          playerIndex={live.playerIndex}
          playerCount={n}
          roundLabel={"Round " + (live.roundIndex == null ? nextRoundNo : live.roundIndex + 1)}
          isCorrection={live.roundIndex != null}
          isLast={live.playerIndex === n - 1}
          value={live.buffer}
          field={game.bidding ? live.field : null}
          showSwitch={game.bidding && (live.roundIndex != null || phase === "scores")}
          onField={switchField}
          onKey={onKey}
          onGo={onGo}
          onClose={closeKeypad}
        />
      )}

      {confirmNew && (
        <div className="sp-scrim" onClick={() => setConfirmNew(false)}>
          <div className="sp-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="sp-eyebrow">Heads up</p>
            <h2 className="sp-title" style={{ fontSize: 24, marginBottom: 10 }}>Clear this game?</h2>
            <p className="sp-hint" style={{ marginBottom: 20 }}>
              {game.rounds.length} round{game.rounds.length === 1 ? "" : "s"} of {game.name} will be erased.
            </p>
            <button className="sp-primary" onClick={() => { setConfirmNew(false); clearGame(); }}>
              Set up a new game
            </button>
            <div className="sp-actions">
              <button className="sp-ghost" onClick={() => setConfirmNew(false)}>Keep scoring</button>
            </div>
          </div>
        </div>
      )}

      {showResult && (
        <ResultSheet
          game={game}
          ranked={ranked}
          onKeepPlaying={() => setGame({ ...game, dismissedAt: game.rounds.length })}
          onRematch={rematch}
          onNewGame={clearGame}
        />
      )}
    </div>
  );
}
