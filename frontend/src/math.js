// Math support loads only for documents that contain "$", keeping KaTeX and its fonts out of the first screen.
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import katexCSS from 'katex/dist/katex.min.css?raw';
export const useMath = md =>
  md.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: { throwOnError: false, trust: false, maxExpand: 1000, maxSize: 20, strict: 'warn' },
  });
// Every font is embedded so offline snapshots render the same as the reading pane.
const fonts = import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', {
  eager: true,
  query: '?inline',
  import: 'default',
});
const data = new Map();
for (const [name, uri] of Object.entries(fonts)) data.set(name.split('/').pop(), uri);
export const mathCSS = katexCSS.replace(
  /src:url\(([^)]+\.woff2)\) format\("woff2"\)[^}]*/g,
  (_, name) => `src:url("${data.get(name.split('/').pop())}") format("woff2");`,
);
