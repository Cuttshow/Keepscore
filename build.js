const babel = require('@babel/core');
const fs = require('fs');

let src = fs.readFileSync('/mnt/user-data/outputs/scorepad.jsx', 'utf8');

// Swap the module import for React globals, and the export for a plain function.
src = src.replace(
  /^import React[^;]+;\n/m,
  'const { useState, useEffect, useMemo, useRef, useLayoutEffect } = React;\n'
);
src = src.replace('export default function ScorePad', 'function ScorePad');

src += `
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(ScorePad));
`;

const out = babel.transformSync(src, {
  presets: [['@babel/preset-react', { runtime: 'classic', development: false }]],
  filename: 'scorepad.jsx',
  compact: false,
}).code;

fs.writeFileSync('/home/claude/ks/build/app.js',
  '/* Compiled from scorepad.jsx - edit that file, not this one. */\n' + out);
console.log('app.js written,', out.length, 'bytes');
