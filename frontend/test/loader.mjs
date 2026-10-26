import { readFile, readdir } from 'node:fs/promises';
export async function resolve(specifier, ctx, next) {
  if (specifier.endsWith('?raw')) {
    const url = specifier.startsWith('.')
      ? new URL(specifier, ctx.parentURL)
      : new URL('../node_modules/' + specifier, import.meta.url);
    return { url: url.href, shortCircuit: true };
  }
  return next(specifier, ctx);
}
export async function load(url, ctx, next) {
  if (url.endsWith('?raw'))
    return {
      format: 'module',
      source: 'export default ' + JSON.stringify(await readFile(new URL(url.split('?')[0]), 'utf8')),
      shortCircuit: true,
    };
  if (url.endsWith('.json'))
    return {
      format: 'module',
      source: 'export default ' + (await readFile(new URL(url), 'utf8')),
      shortCircuit: true,
    };
  if (url.endsWith('/src/math.js')) {
    let s = await readFile(new URL(url), 'utf8');
    const dir = new URL('../node_modules/katex/dist/fonts/', import.meta.url),
      fonts = {};
    for (const f of await readdir(dir)) {
      if (f.endsWith('.woff2'))
        fonts['/node_modules/katex/dist/fonts/' + f] =
          'data:font/woff2;base64,' + (await readFile(new URL(f, dir))).toString('base64');
    }
    s = s.replace(/import\.meta\.glob\([^;]+?\)/, JSON.stringify(fonts));
    return { format: 'module', source: s, shortCircuit: true };
  }
  return next(url, ctx);
}
