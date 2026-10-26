// The desktop web view shows no native title tooltips, so hover and keyboard-focus hints are drawn here from data-tip.
export function bindTooltips(root = document, { delay = 450 } = {}) {
  const tip = root.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.id = 'moread-tooltip';
  tip.hidden = true;
  root.body.append(tip);
  let target = null,
    timer;
  const hide = () => {
    clearTimeout(timer);
    target?.removeAttribute('aria-describedby');
    target = null;
    tip.hidden = true;
  };
  const show = el => {
    const text = el.dataset.tip;
    if (!text || !el.isConnected) return;
    tip.textContent = text;
    tip.hidden = false;
    el.setAttribute('aria-describedby', tip.id);
    const view = root.defaultView,
      r = el.getBoundingClientRect(),
      w = tip.offsetWidth,
      h = tip.offsetHeight;
    let top = r.bottom + 8;
    if (top + h > view.innerHeight - 4) top = r.top - h - 8;
    tip.style.left =
      Math.round(Math.min(Math.max(4, r.left + r.width / 2 - w / 2), view.innerWidth - w - 4)) + 'px';
    tip.style.top = Math.round(Math.max(4, top)) + 'px';
  };
  root.addEventListener('pointerover', e => {
    const el = e.target.closest?.('[data-tip]');
    if (el === target) return;
    hide();
    if (!el || el.disabled) return;
    target = el;
    timer = setTimeout(() => show(el), delay);
  });
  root.addEventListener('pointerout', e => {
    if (target && !target.contains(e.relatedTarget)) hide();
  });
  root.addEventListener('focusin', e => {
    const el = e.target.closest?.('[data-tip]');
    if (!el || !el.matches(':focus-visible')) return;
    hide();
    target = el;
    show(el);
  });
  root.addEventListener('focusout', hide);
  for (const type of ['pointerdown', 'keydown', 'wheel']) root.addEventListener(type, hide, true);
  root.defaultView.addEventListener('blur', hide);
  return {
    hide,
    refresh() {
      if (target && !tip.hidden) show(target);
    },
  };
}
