/* Compiled from scorepad.jsx - edit that file, not this one. */
const {
  useState,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect
} = React;

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

const PRESETS = [{
  key: "flip7",
  label: "Flip 7",
  name: "Flip 7",
  endMode: "target",
  target: 200,
  maxRounds: 10,
  lowWins: false
}, {
  key: "pigs",
  label: "Pass the Pigs",
  name: "Pass the Pigs",
  endMode: "target",
  target: 100,
  maxRounds: 10,
  lowWins: false
}, {
  key: "shucks",
  label: "Aw Shucks",
  name: "Aw Shucks",
  endMode: "rounds",
  target: 200,
  maxRounds: 10,
  lowWins: false
}, {
  key: "rummy",
  label: "Rummy",
  name: "Rummy",
  endMode: "target",
  target: 500,
  maxRounds: 10,
  lowWins: false
}, {
  key: "hearts",
  label: "Hearts",
  name: "Hearts",
  endMode: "target",
  target: 100,
  maxRounds: 10,
  lowWins: true
}, {
  key: "golf",
  label: "Golf",
  name: "Golf",
  endMode: "rounds",
  target: 100,
  maxRounds: 9,
  lowWins: true
}, {
  key: "custom",
  label: "Something else",
  name: "",
  endMode: "open",
  target: 100,
  maxRounds: 10,
  lowWins: false
}];
const uid = () => Math.random().toString(36).slice(2, 9);
function newGameFrom(draft) {
  return {
    id: uid(),
    name: draft.name.trim() || "Game night",
    players: draft.players.map((n, i) => ({
      id: uid(),
      name: (n.trim() || "PLAYER " + (i + 1)).toUpperCase()
    })),
    rounds: [],
    endMode: draft.endMode,
    target: Number(draft.target) || 100,
    maxRounds: Number(draft.maxRounds) || 10,
    lowWins: draft.lowWins,
    dismissedAt: -1
  };
}
function totalsFor(game) {
  const t = {};
  game.players.forEach(p => t[p.id] = 0);
  game.rounds.forEach(r => {
    game.players.forEach(p => {
      t[p.id] += r.scores[p.id] || 0;
    });
  });
  return t;
}
function rankedFor(game, totals) {
  return game.players.map((p, i) => ({
    ...p,
    total: totals[p.id] || 0,
    seat: i
  })).sort((a, b) => a.total === b.total ? a.seat - b.seat : game.lowWins ? a.total - b.total : b.total - a.total);
}
const toInt = s => {
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
.sp-chip {
  height: 38px; padding: 0 14px; border-radius: 11px;
  background: var(--ink-2); color: var(--paper-2); font-size: 14px; font-weight: 500;
  transition: background-color .18s ease, color .18s ease;
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

function CapsInput({
  value,
  onChange,
  ...rest
}) {
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
  return /*#__PURE__*/React.createElement("input", {
    ...rest,
    ref: ref,
    value: value,
    autoCapitalize: "characters",
    autoCorrect: "off",
    spellCheck: "false",
    onChange: e => {
      caret.current = e.target.selectionStart;
      onChange(e.target.value.toUpperCase());
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

function Setup({
  initialPlayers,
  onStart
}) {
  const [preset, setPreset] = useState("flip7");
  const [draft, setDraft] = useState({
    name: "Flip 7",
    players: initialPlayers && initialPlayers.length ? initialPlayers : ["", ""],
    endMode: "target",
    target: 200,
    maxRounds: 10,
    lowWins: false
  });
  const set = patch => setDraft(d => ({
    ...d,
    ...patch
  }));
  const applyPreset = p => {
    setPreset(p.key);
    set({
      name: p.name,
      endMode: p.endMode,
      target: p.target,
      maxRounds: p.maxRounds,
      lowWins: p.lowWins
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "sp-wrap"
  }, /*#__PURE__*/React.createElement("p", {
    className: "sp-eyebrow"
  }, "New game"), /*#__PURE__*/React.createElement("h1", {
    className: "sp-title"
  }, "Set up the pad"), /*#__PURE__*/React.createElement("div", {
    className: "sp-field"
  }, /*#__PURE__*/React.createElement("p", {
    className: "sp-eyebrow"
  }, "What are you playing?"), /*#__PURE__*/React.createElement("div", {
    className: "sp-chips"
  }, PRESETS.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.key,
    className: "sp-chip" + (preset === p.key ? " is-on" : ""),
    onClick: () => applyPreset(p)
  }, p.label))), /*#__PURE__*/React.createElement("input", {
    className: "sp-input",
    style: {
      marginTop: 10
    },
    value: draft.name,
    placeholder: "Name this game",
    onChange: e => set({
      name: e.target.value
    })
  }), /*#__PURE__*/React.createElement("p", {
    className: "sp-hint"
  }, "Presets just fill in a starting target — change anything below.")), /*#__PURE__*/React.createElement("div", {
    className: "sp-field"
  }, /*#__PURE__*/React.createElement("p", {
    className: "sp-eyebrow"
  }, "Players (", draft.players.length, ")"), draft.players.map((p, i) => /*#__PURE__*/React.createElement("div", {
    className: "sp-player",
    key: i
  }, /*#__PURE__*/React.createElement(CapsInput, {
    className: "sp-input is-name",
    value: p,
    placeholder: "PLAYER " + (i + 1),
    onChange: v => set({
      players: draft.players.map((x, j) => j === i ? v : x)
    })
  }), draft.players.length > 2 && /*#__PURE__*/React.createElement("button", {
    className: "sp-x",
    "aria-label": "Remove player " + (i + 1),
    onClick: () => set({
      players: draft.players.filter((_, j) => j !== i)
    })
  }, "×"))), draft.players.length < 8 && /*#__PURE__*/React.createElement("button", {
    className: "sp-add",
    onClick: () => set({
      players: [...draft.players, ""]
    })
  }, "Add player"), /*#__PURE__*/React.createElement("p", {
    className: "sp-hint"
  }, "Shorter names read better once there are six or more columns.")), /*#__PURE__*/React.createElement("div", {
    className: "sp-field"
  }, /*#__PURE__*/React.createElement("p", {
    className: "sp-eyebrow"
  }, "The game ends"), /*#__PURE__*/React.createElement("div", {
    className: "sp-seg"
  }, [["target", "At a score"], ["rounds", "After rounds"], ["open", "When you say"]].map(([k, label]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: draft.endMode === k ? "is-on" : "",
    onClick: () => set({
      endMode: k
    })
  }, label))), draft.endMode === "target" && /*#__PURE__*/React.createElement("input", {
    className: "sp-input",
    style: {
      marginTop: 10
    },
    inputMode: "numeric",
    value: draft.target,
    onChange: e => set({
      target: e.target.value.replace(/[^0-9]/g, "")
    }),
    placeholder: "Target score"
  }), draft.endMode === "rounds" && /*#__PURE__*/React.createElement("input", {
    className: "sp-input",
    style: {
      marginTop: 10
    },
    inputMode: "numeric",
    value: draft.maxRounds,
    onChange: e => set({
      maxRounds: e.target.value.replace(/[^0-9]/g, "")
    }),
    placeholder: "Number of rounds"
  })), /*#__PURE__*/React.createElement("div", {
    className: "sp-field"
  }, /*#__PURE__*/React.createElement("p", {
    className: "sp-eyebrow"
  }, "Winner is"), /*#__PURE__*/React.createElement("div", {
    className: "sp-seg"
  }, /*#__PURE__*/React.createElement("button", {
    className: !draft.lowWins ? "is-on" : "",
    onClick: () => set({
      lowWins: false
    })
  }, "Highest score"), /*#__PURE__*/React.createElement("button", {
    className: draft.lowWins ? "is-on" : "",
    onClick: () => set({
      lowWins: true
    })
  }, "Lowest score"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 30
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "sp-primary",
    onClick: () => onStart(newGameFrom(draft))
  }, "Start scoring")));
}

/* ------------------------------------------------------------------ */
/*  Keypad                                                             */
/* ------------------------------------------------------------------ */

function Keypad({
  player,
  playerIndex,
  playerCount,
  roundLabel,
  isCorrection,
  isLast,
  value,
  onKey,
  onGo,
  onClose
}) {
  const goLabel = isCorrection ? "SAVE" : isLast ? "DONE" : "NEXT";
  return /*#__PURE__*/React.createElement("div", {
    className: "sp-keypad"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sp-keypad-inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sp-kp-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sp-kp-who"
  }, /*#__PURE__*/React.createElement("b", null, player.name), /*#__PURE__*/React.createElement("span", null, roundLabel, " · ", playerIndex + 1, " of ", playerCount)), /*#__PURE__*/React.createElement("div", {
    className: "sp-kp-val" + (value === "" || value === "-" ? " is-empty" : "")
  }, value === "" ? "0" : value), /*#__PURE__*/React.createElement("button", {
    className: "sp-menu",
    onClick: onClose,
    "aria-label": "Close keypad"
  }, "×")), /*#__PURE__*/React.createElement("div", {
    className: "sp-keys"
  }, [["1", 1, 1], ["2", 2, 1], ["3", 3, 1], ["4", 1, 2], ["5", 2, 2], ["6", 3, 2], ["7", 1, 3], ["8", 2, 3], ["9", 3, 3]].map(([k, c, r]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: "sp-key",
    style: {
      gridColumn: c,
      gridRow: r
    },
    onClick: () => onKey(k)
  }, k)), /*#__PURE__*/React.createElement("button", {
    className: "sp-key is-util",
    style: {
      gridColumn: 4,
      gridRow: 1
    },
    onClick: () => onKey("back"),
    "aria-label": "Backspace"
  }, "⌫"), /*#__PURE__*/React.createElement("button", {
    className: "sp-key is-util",
    style: {
      gridColumn: 4,
      gridRow: 2
    },
    onClick: () => onKey("neg"),
    "aria-label": "Positive or negative"
  }, "±"), /*#__PURE__*/React.createElement("button", {
    className: "sp-key",
    style: {
      gridColumn: "1 / span 2",
      gridRow: 4
    },
    onClick: () => onKey("0")
  }, "0"), /*#__PURE__*/React.createElement("button", {
    className: "sp-key is-util",
    style: {
      gridColumn: 3,
      gridRow: 4
    },
    onClick: () => onKey("clear"),
    "aria-label": "Clear"
  }, "C"), /*#__PURE__*/React.createElement("button", {
    className: "sp-key is-go",
    onClick: onGo
  }, goLabel))));
}

/* ------------------------------------------------------------------ */
/*  Result                                                             */
/* ------------------------------------------------------------------ */

function ResultSheet({
  game,
  ranked,
  onKeepPlaying,
  onRematch,
  onNewGame
}) {
  const top = ranked[0];
  const tied = ranked.filter(p => p.total === top.total);
  return /*#__PURE__*/React.createElement("div", {
    className: "sp-scrim"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sp-sheet"
  }, /*#__PURE__*/React.createElement("p", {
    className: "sp-eyebrow"
  }, game.name, " · final"), /*#__PURE__*/React.createElement("p", {
    className: "sp-crown",
    style: {
      margin: "8px 0 20px"
    }
  }, tied.length > 1 ? tied.map(p => p.name).join(" & ") + " tie it." : top.name + " wins."), ranked.map((p, i) => /*#__PURE__*/React.createElement("div", {
    className: "sp-standing",
    key: p.id
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: i === 0 ? "#F4F0E4" : "#9FB0B6"
    }
  }, i + 1, ". ", p.name), /*#__PURE__*/React.createElement("b", {
    style: {
      color: i === 0 ? "#F2A93B" : "#9FB0B6"
    }
  }, p.total))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "sp-primary",
    onClick: onRematch
  }, "Rematch, same players")), /*#__PURE__*/React.createElement("div", {
    className: "sp-actions",
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "sp-ghost",
    onClick: onKeepPlaying
  }, "Keep playing"), /*#__PURE__*/React.createElement("button", {
    className: "sp-ghost",
    onClick: onNewGame
  }, "New game"))));
}

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

function ScorePad() {
  const [ready, setReady] = useState(false);
  const [game, setGame] = useState(null);
  const [lastPlayers, setLastPlayers] = useState(null);
  const [confirmNew, setConfirmNew] = useState(false);

  // pending (uncommitted) bottom row: playerId -> string
  const [pending, setPending] = useState({});
  // active cell: { roundIndex: number|null, playerIndex, buffer, pristine }
  const [live, setLive] = useState(null);
  const liveRowRef = useRef(null);
  useEffect(() => {
    let alive = true;
    loadState().then(s => {
      if (!alive) return;
      if (s && s.game) setGame(s.game);
      if (s && s.pending) setPending(s.pending);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (ready) saveState({
      game,
      pending
    });
  }, [game, pending, ready]);
  useLayoutEffect(() => {
    if (live && liveRowRef.current) {
      liveRowRef.current.scrollIntoView({
        block: "center",
        behavior: "smooth"
      });
    }
  }, [live && live.roundIndex, live && live.playerIndex]);
  const totals = useMemo(() => game ? totalsFor(game) : {}, [game]);
  const ranked = useMemo(() => game ? rankedFor(game, totals) : [], [game, totals]);
  const ended = useMemo(() => {
    if (!game) return false;
    if (game.endMode === "target") return ranked.some(p => p.total >= game.target);
    if (game.endMode === "rounds") return game.rounds.length >= game.maxRounds;
    return false;
  }, [game, ranked]);
  if (!ready) return /*#__PURE__*/React.createElement("div", {
    className: "sp"
  }, /*#__PURE__*/React.createElement("style", null, CSS));
  if (!game) {
    return /*#__PURE__*/React.createElement("div", {
      className: "sp"
    }, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement(Setup, {
      initialPlayers: lastPlayers,
      onStart: g => {
        setPending({});
        setGame(g);
      }
    }));
  }

  /* -------- cell editing -------- */

  const openCell = (roundIndex, playerIndex) => {
    const pid = game.players[playerIndex].id;
    const current = roundIndex == null ? pending[pid] != null ? String(pending[pid]) : "" : String(game.rounds[roundIndex].scores[pid] || 0);
    setLive({
      roundIndex,
      playerIndex,
      buffer: current,
      pristine: true
    });
  };
  const onKey = k => {
    setLive(l => {
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
        if (l.pristine) b = k;else if (b.replace("-", "").length < 5) b = b === "0" ? k : b + k;
      }
      return {
        ...l,
        buffer: b,
        pristine: false
      };
    });
  };
  const commitRound = scores => {
    setGame(g => ({
      ...g,
      rounds: [...g.rounds, {
        id: uid(),
        scores
      }]
    }));
    setPending({});
    setLive(null);
  };
  const onGo = () => {
    if (!live) return;
    const pid = game.players[live.playerIndex].id;
    const val = toInt(live.buffer);

    // correcting a committed round: save this one cell and get out
    if (live.roundIndex != null) {
      setGame(g => ({
        ...g,
        rounds: g.rounds.map((r, i) => i === live.roundIndex ? {
          ...r,
          scores: {
            ...r.scores,
            [pid]: val
          }
        } : r)
      }));
      setLive(null);
      return;
    }
    const nextPending = {
      ...pending,
      [pid]: val
    };
    const isLast = live.playerIndex === game.players.length - 1;
    if (isLast) {
      const scores = {};
      game.players.forEach(p => scores[p.id] = toInt(nextPending[p.id]));
      commitRound(scores);
      return;
    }
    setPending(nextPending);
    const ni = live.playerIndex + 1;
    const nid = game.players[ni].id;
    setLive({
      roundIndex: null,
      playerIndex: ni,
      buffer: nextPending[nid] != null ? String(nextPending[nid]) : "",
      pristine: true
    });
  };
  const closeKeypad = () => {
    // keep whatever was typed into the pending row
    if (live && live.roundIndex == null) {
      const pid = game.players[live.playerIndex].id;
      if (live.buffer !== "") setPending({
        ...pending,
        [pid]: toInt(live.buffer)
      });
    }
    setLive(null);
  };

  /* -------- game actions -------- */

  const undoLast = () => {
    if (!game.rounds.length) return;
    setLive(null);
    setGame({
      ...game,
      rounds: game.rounds.slice(0, -1)
    });
  };
  const clearPending = () => setPending({});
  const rematch = () => {
    setPending({});
    setLive(null);
    setGame({
      ...game,
      id: uid(),
      rounds: [],
      dismissedAt: -1
    });
  };
  const clearGame = () => {
    setLastPlayers(game.players.map(p => p.name));
    setPending({});
    setLive(null);
    setGame(null);
  };
  const startOver = () => {
    if (game.rounds.length) {
      setConfirmNew(true);
      return;
    }
    clearGame();
  };

  /* -------- display -------- */

  const n = game.players.length;
  const showResult = ended && game.dismissedAt !== game.rounds.length;
  const nextRoundNo = game.rounds.length + 1;
  const hasPending = Object.keys(pending).length > 0;
  const headSize = n >= 7 ? 9.5 : n >= 5 ? 11 : 12.5;
  const cellSize = n >= 7 ? 13 : n >= 5 ? 15 : 16;
  const progress = game.endMode === "target" ? Math.min(100, Math.max(...ranked.map(p => p.total), 0) / game.target * 100) : game.endMode === "rounds" ? Math.min(100, game.rounds.length / game.maxRounds * 100) : 0;
  const subtitle = game.endMode === "target" ? "Round " + nextRoundNo + " · " + (game.lowWins ? "ends at " : "first to ") + game.target : game.endMode === "rounds" ? "Round " + Math.min(nextRoundNo, game.maxRounds) + " of " + game.maxRounds : "Round " + nextRoundNo;
  return /*#__PURE__*/React.createElement("div", {
    className: "sp"
  }, /*#__PURE__*/React.createElement("style", null, CSS), /*#__PURE__*/React.createElement("div", {
    className: "sp-wrap",
    style: {
      paddingBottom: live ? 340 : 40
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "sp-head"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "sp-eyebrow"
  }, subtitle), /*#__PURE__*/React.createElement("h1", {
    className: "sp-title"
  }, game.name)), /*#__PURE__*/React.createElement("button", {
    className: "sp-menu",
    onClick: startOver,
    "aria-label": "Start a new game"
  }, "⌂")), game.endMode !== "open" ? /*#__PURE__*/React.createElement("div", {
    className: "sp-meter"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: progress + "%"
    }
  })) : /*#__PURE__*/React.createElement("div", {
    style: {
      height: 24
    }
  }), /*#__PURE__*/React.createElement("table", {
    className: "sp-pad"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "sp-rdcol",
    style: {
      fontSize: 9.5
    }
  }, "Rd"), game.players.map((p, i) => /*#__PURE__*/React.createElement("th", {
    key: p.id,
    title: p.name,
    style: {
      fontSize: headSize
    },
    className: live && live.playerIndex === i ? "is-live" : ""
  }, p.name)))), /*#__PURE__*/React.createElement("tbody", null, game.rounds.map((r, ri) => {
    const isLiveRow = live && live.roundIndex === ri;
    return /*#__PURE__*/React.createElement("tr", {
      key: r.id,
      ref: isLiveRow ? liveRowRef : null
    }, /*#__PURE__*/React.createElement("td", {
      className: "sp-rd"
    }, ri + 1), game.players.map((p, pi) => /*#__PURE__*/React.createElement("td", {
      key: p.id,
      className: "sp-cell" + (isLiveRow && live.playerIndex === pi ? " is-live" : ""),
      style: {
        fontSize: cellSize
      },
      onClick: () => openCell(ri, pi)
    }, isLiveRow && live.playerIndex === pi ? live.buffer || "0" : r.scores[p.id] || 0)));
  }), /*#__PURE__*/React.createElement("tr", {
    className: "sp-row-new",
    ref: live && live.roundIndex == null ? liveRowRef : null
  }, /*#__PURE__*/React.createElement("td", {
    className: "sp-rd"
  }, nextRoundNo), game.players.map((p, pi) => {
    const isLiveCell = live && live.roundIndex == null && live.playerIndex === pi;
    const val = pending[p.id];
    const text = isLiveCell ? live.buffer || "0" : val != null ? String(val) : "–";
    return /*#__PURE__*/React.createElement("td", {
      key: p.id,
      className: "sp-cell" + (isLiveCell ? " is-live" : val != null ? " is-draft" : " is-blank"),
      style: {
        fontSize: cellSize
      },
      onClick: () => openCell(null, pi)
    }, text);
  }))), /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "sp-rd"
  }, "Tot"), game.players.map(p => /*#__PURE__*/React.createElement("td", {
    key: p.id,
    style: {
      fontSize: n >= 7 ? 16 : 20
    }
  }, totals[p.id] || 0))))), game.rounds.length === 0 && !live && /*#__PURE__*/React.createElement("p", {
    className: "sp-note"
  }, "Tap a cell in round 1 to start scoring.", /*#__PURE__*/React.createElement("br", null), "DONE on the last player writes the round in."), /*#__PURE__*/React.createElement("div", {
    className: "sp-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "sp-ghost",
    onClick: undoLast,
    disabled: !game.rounds.length
  }, "Undo last round"), /*#__PURE__*/React.createElement("button", {
    className: "sp-ghost",
    onClick: clearPending,
    disabled: !hasPending
  }, "Clear this round"))), live && /*#__PURE__*/React.createElement(Keypad, {
    player: game.players[live.playerIndex],
    playerIndex: live.playerIndex,
    playerCount: n,
    roundLabel: "Round " + (live.roundIndex == null ? nextRoundNo : live.roundIndex + 1),
    isCorrection: live.roundIndex != null,
    isLast: live.playerIndex === n - 1,
    value: live.buffer,
    onKey: onKey,
    onGo: onGo,
    onClose: closeKeypad
  }), confirmNew && /*#__PURE__*/React.createElement("div", {
    className: "sp-scrim",
    onClick: () => setConfirmNew(false)
  }, /*#__PURE__*/React.createElement("div", {
    className: "sp-sheet",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("p", {
    className: "sp-eyebrow"
  }, "Heads up"), /*#__PURE__*/React.createElement("h2", {
    className: "sp-title",
    style: {
      fontSize: 24,
      marginBottom: 10
    }
  }, "Clear this game?"), /*#__PURE__*/React.createElement("p", {
    className: "sp-hint",
    style: {
      marginBottom: 20
    }
  }, game.rounds.length, " round", game.rounds.length === 1 ? "" : "s", " of ", game.name, " will be erased."), /*#__PURE__*/React.createElement("button", {
    className: "sp-primary",
    onClick: () => {
      setConfirmNew(false);
      clearGame();
    }
  }, "Set up a new game"), /*#__PURE__*/React.createElement("div", {
    className: "sp-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "sp-ghost",
    onClick: () => setConfirmNew(false)
  }, "Keep scoring")))), showResult && /*#__PURE__*/React.createElement(ResultSheet, {
    game: game,
    ranked: ranked,
    onKeepPlaying: () => setGame({
      ...game,
      dismissedAt: game.rounds.length
    }),
    onRematch: rematch,
    onNewGame: clearGame
  }));
}
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(ScorePad));