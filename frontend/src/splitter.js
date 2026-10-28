// The split view divider: drag, double-click to centre, or arrow keys. The share is kept between 20% and 80%.
export const clampSplit = v => Math.min(80, Math.max(20, Math.round(v)));
// The ratio always describes the left pane, including when preview and source exchange sides.
export function applySplitLayout(area, splitter, prefs) {
  area.style.setProperty('--split', prefs.split + '%');
  area.classList.toggle('preview-left', prefs.previewOnLeft);
  splitter.setAttribute('aria-valuemin', 20);
  splitter.setAttribute('aria-valuemax', 80);
  splitter.setAttribute('aria-valuenow', prefs.split);
}
export function bindSplitter(splitter, area, { get, set, commit }) {
  const move = v => {
    set(clampSplit(v));
    area.style.setProperty('--split', get() + '%');
    splitter.setAttribute('aria-valuenow', get());
  };
  splitter.onpointerdown = e => {
    if (e.button !== 0) return;
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    splitter.ownerDocument.body.classList.add('resizing');
  };
  splitter.onpointermove = e => {
    if (!splitter.hasPointerCapture(e.pointerId)) return;
    const r = area.getBoundingClientRect();
    move(((e.clientX - r.left) / r.width) * 100);
  };
  splitter.onpointerup = splitter.onpointercancel = e => {
    if (splitter.hasPointerCapture(e.pointerId)) splitter.releasePointerCapture(e.pointerId);
    splitter.ownerDocument.body.classList.remove('resizing');
    commit();
  };
  splitter.ondblclick = () => {
    move(50);
    commit();
  };
  splitter.onkeydown = e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      move(get() + (e.key === 'ArrowLeft' ? -5 : 5));
      commit();
    }
  };
}
