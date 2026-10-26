// Wails handles dragging custom title bars, but does not handle double-clicks.
export function bindTitlebar(topbar, runtime) {
  topbar.addEventListener('dblclick', event => {
    if (
      event.button !== 0 ||
      event.target.closest('button,input,select,textarea,a,[role="button"],[contenteditable]')
    )
      return;
    if (typeof runtime?.WindowToggleMaximise !== 'function') return;
    event.preventDefault();
    runtime.WindowToggleMaximise();
  });
}
