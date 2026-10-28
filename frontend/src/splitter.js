// The split view divider: drag, double-click to centre, or arrow keys. The share is kept between 20% and 80%.
export const clampSplit = v => Math.min(80, Math.max(20, Math.round(v)));
export function bindSplitter(splitter, area, { get, set, commit }) {
  const move = v => {
    set(clampSplit(v));
    area.style.setProperty('--split', get() + '%');
  };
  splitter.onpointerdown = e => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
  };
  splitter.onpointermove = e => {
    if (!splitter.hasPointerCapture(e.pointerId)) return;
    const r = area.getBoundingClientRect();
    move(((e.clientX - r.left) / r.width) * 100);
  };
  splitter.onpointerup = splitter.onpointercancel = e => {
    if (splitter.hasPointerCapture(e.pointerId)) splitter.releasePointerCapture(e.pointerId);
    document.body.classList.remove('resizing');
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
