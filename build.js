const fs = require('fs');
const babel = require('@babel/core');
const OUT = '/mnt/user-data/outputs/keepscore-flat/';
fs.mkdirSync(OUT, { recursive: true });

let src = fs.readFileSync('/mnt/user-data/outputs/scorepad.jsx', 'utf8');
src = src.replace(/^import React[^;]+;\n/m,
  'const { useState, useEffect, useMemo, useRef, useLayoutEffect } = React;\n');
src = src.replace('export default function ScorePad', 'function ScorePad');
src += '\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(ScorePad));\n';

const app = babel.transformSync(src, {
  presets: [['@babel/preset-react', { runtime: 'classic', development: false }]],
  compact: false, filename: 'scorepad.jsx',
}).code;

const react = fs.readFileSync('node_modules/react/umd/react.production.min.js', 'utf8');
const reactDom = fs.readFileSync('node_modules/react-dom/umd/react-dom.production.min.js', 'utf8');

const bundle = [
  '/* Keepscore - single-file bundle.',
  '   Contains React 18.3.1, ReactDOM 18.3.1, and the app.',
  '   Source of truth is scorepad.jsx; regenerate with build.js. */',
  '', react, '', reactDom, '', app,
].join('\n');

fs.writeFileSync(OUT + 'app.js', bundle);
console.log('bundled app.js:', Math.round(bundle.length / 1024) + 'KB');
