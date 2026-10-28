// Keep URL fragments separate from filesystem authorization. The native side
// still resolves the original reference and enforces the opened-folder boundary.
export async function readRelativeDocument(id, href, call, valid = () => true) {
  const hash = href.indexOf('#');
  const anchor = hash < 0 ? '' : decodeURIComponent(href.slice(hash + 1));
  const registered = await call('OpenRelative', id, href);
  if (!valid()) return null;
  const loaded = await call('ReadDocument', registered.id);
  return { registered, document: { ...loaded, navigationAnchor: anchor } };
}
