import bootstrap from './frame-bootstrap.js?raw';
import { t } from './i18n.js';
const channel = 'moread-frame-v1';
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exact = (x, allowed) => plain(x) && Object.keys(x).every(k => allowed.includes(k));
const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
export function createFrame(element, { onAction, onShortcut, onDrop, onError, onPosition } = {}) {
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map(n => n.toString(16).padStart(2, '0'))
    .join('');
  let version = 0,
    ackVersion = 0,
    request = 0,
    actions = new Map(),
    anchors = new Set(),
    resolveReady;
  let readyTimer;
  const ready = new Promise((resolve, reject) => {
      resolveReady = () => {
        clearTimeout(readyTimer);
        resolve();
      };
      readyTimer = setTimeout(() => reject(new Error(t('frame.timeout'))), 10000);
    }),
    pending = new Map();
  const csp = `default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${token}'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  element.setAttribute('sandbox', 'allow-scripts');
  addEventListener('message', event => {
    const m = event.data;
    if (
      event.source !== element.contentWindow ||
      event.origin !== 'null' ||
      !exact(m, [
        'channel',
        'token',
        'version',
        'type',
        'request',
        'command',
        'result',
        'message',
        'id',
        'key',
        'files',
        'x',
        'y',
        'ratio',
        'heading',
        'section',
        'progress',
      ]) ||
      m.channel !== channel ||
      m.token !== token ||
      !integer(m.version, 0, 1e9)
    )
      return;
    if (m.type === 'ready') {
      if (exact(m, ['channel', 'token', 'version', 'type']) && m.version === 0) resolveReady();
      return;
    }
    if (m.version !== version) return;
    if (m.type === 'ack') {
      if (
        !exact(m, ['channel', 'token', 'version', 'type', 'request', 'command', 'result']) ||
        !integer(m.request, 1, 1e9) ||
        typeof m.command !== 'string' ||
        !plain(m.result)
      )
        return;
      const p = pending.get(m.request);
      if (!p || p.version !== m.version || p.command !== m.command) return;
      if (
        ['find', 'next', 'clear-find'].includes(m.command) &&
        (!exact(m.result, ['count', 'index']) ||
          !integer(m.result.count, 0, 2000) ||
          !integer(m.result.index, -1, m.result.count - 1))
      )
        return;
      if (
        m.command === 'inspect' &&
        (!exact(m.result, ['parentAccessDenied', 'goVisible', 'nativeProbeAttempted']) ||
          !['parentAccessDenied', 'goVisible', 'nativeProbeAttempted'].every(
            k => typeof m.result[k] === 'boolean',
          ))
      )
        return;
      if (
        m.command === 'paint-timing' &&
        (!exact(m.result, ['firstContentfulPaintAt']) ||
          !Number.isSafeInteger(m.result.firstContentfulPaintAt) ||
          m.result.firstContentfulPaintAt < 0)
      )
        return;
      if (m.command === 'render') {
        if (
          !exact(m.result, ['empty', 'images']) ||
          typeof m.result.empty !== 'boolean' ||
          !integer(m.result.images, 0, 200000) ||
          m.result.images !== p.images
        )
          return;
        ackVersion = version;
      }
      clearTimeout(p.timer);
      pending.delete(m.request);
      p.resolve(m.result);
      return;
    }
    if (m.type === 'error') {
      if (
        exact(m, ['channel', 'token', 'version', 'type', 'request', 'message']) &&
        integer(m.request, 1, 1e9) &&
        typeof m.message === 'string' &&
        m.message.length <= 200
      ) {
        const p = pending.get(m.request);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(m.request);
          p.reject(new Error(m.message));
        }
        onError?.(m.message);
      }
      return;
    }
    if (m.version !== ackVersion) return;
    if (
      m.type === 'action' &&
      exact(m, ['channel', 'token', 'version', 'type', 'id']) &&
      integer(m.id, 1, actions.size)
    ) {
      const action = actions.get(m.id);
      if (action) onAction?.({ ...action, id: m.id, version });
    } else if (
      m.type === 'shortcut' &&
      exact(m, ['channel', 'token', 'version', 'type', 'key']) &&
      [
        'o',
        's',
        'save-as',
        'n',
        'f',
        'p',
        ',',
        '1',
        '2',
        '3',
        'w',
        'replace',
        '=',
        '-',
        '0',
        '/',
        'escape',
      ].includes(m.key)
    )
      onShortcut?.(m.key);
    else if (
      m.type === 'position' &&
      exact(m, ['channel', 'token', 'version', 'type', 'ratio', 'heading', 'section', 'progress']) &&
      integer(m.ratio, 0, 10000) &&
      integer(m.section, -1, 200000) &&
      integer(m.progress, 0, 10000) &&
      typeof m.heading === 'string' &&
      m.heading.length <= 2048 &&
      (m.heading === '' || anchors.has(m.heading))
    )
      onPosition?.({
        ratio: m.ratio / 10000,
        heading: m.heading,
        section: m.section,
        progress: m.progress / 10000,
      });
    else if (
      m.type === 'drop' &&
      exact(m, ['channel', 'token', 'version', 'type', 'files', 'x', 'y']) &&
      Array.isArray(m.files) &&
      m.files.length > 0 &&
      m.files.length <= 256 &&
      m.files.every(f => f instanceof File && f.name.length <= 512 && f.size >= 0) &&
      integer(m.x, 0, Math.ceil(element.clientWidth)) &&
      integer(m.y, 0, Math.ceil(element.clientHeight))
    )
      onDrop?.(m.files, m.x, m.y);
  });
  // The bootstrap source is fixed. Document content never enters this script string.
  element.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style></style></head><body><article></article><script nonce="${token}">${bootstrap}</script></body></html>`;
  async function command(type, payload = {}, v = version) {
    await ready;
    if (v !== version) return { cancelled: true };
    const id = ++request;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(t('frame.noResponse')));
      }, 15000);
      pending.set(id, {
        version: v,
        command: type,
        images: type === 'render' ? (payload.body.match(/<img\b/gi) || []).length : undefined,
        resolve,
        reject,
        timer,
      });
      element.contentWindow.postMessage(
        { channel: 'moread-host-v1', token, version: v, type, request: id, ...payload },
        '*',
      );
    });
  }
  return {
    begin(v) {
      version = v;
      ackVersion = -1;
      actions = new Map();
      anchors = new Set();
      for (const [id, p] of pending) {
        if (p.version !== v) {
          clearTimeout(p.timer);
          p.resolve({ cancelled: true });
          pending.delete(id);
        }
      }
    },
    async render(
      body,
      css,
      { reset = false, theme = 'light', size = 16, width = 'auto', font = 'sans', leading = 'normal' } = {},
    ) {
      if (typeof body !== 'string' || body.length > 64 * 1024 * 1024) throw new Error(t('frame.tooLarge'));
      const renderVersion = version;
      const container = document.createElement('div');
      container.innerHTML = body;
      const nextActions = new Map();
      const nextAnchors = new Set([...container.querySelectorAll('[id]')].map(n => n.id));
      const interactive = container.querySelectorAll('a,button.copy-code,img.zoomable');
      if (interactive.length > 200000) throw new Error(t('frame.tooMany'));
      for (const node of interactive) {
        let action;
        if (node.matches('a')) {
          const value = node.getAttribute('href');
          if (value) action = { kind: 'link', value };
          node.setAttribute('role', 'link');
          node.tabIndex = 0;
        } else if (node.matches('.copy-code')) {
          const code = node.closest('pre')?.querySelector('code');
          if (code) action = { kind: 'copy', value: code.textContent };
        } else {
          const value = node.getAttribute('src');
          if (/^data:image\/(png|jpeg|gif|webp|avif|svg\+xml);base64,/.test(value || ''))
            action = { kind: 'zoom', value };
          node.draggable = false;
        }
        if (action && nextActions.size < 200000) {
          const id = nextActions.size + 1;
          nextActions.set(id, action);
          node.setAttribute('data-moread-action', String(id));
        }
      }
      for (const node of container.querySelectorAll('*'))
        for (const name of ['href', 'target', 'ping', 'download', 'xlink:href']) node.removeAttribute(name);
      actions = nextActions;
      anchors = nextAnchors;
      const labels = {
        copy: t('code.copy'),
        copied: t('code.copied'),
        copyFailed: t('code.copyFailed'),
        empty: t('doc.empty'),
        failed: t('frame.failed'),
      };
      const result = await command(
        'render',
        { body: container.innerHTML, css, reset, labels },
        renderVersion,
      );
      if (result.cancelled || version !== renderVersion) return { cancelled: true };
      await command('prefs', { theme, size, width, font, leading }, renderVersion);
      return result;
    },
    prefs(prefs) {
      if (ackVersion !== version) return Promise.resolve();
      return command('prefs', prefs);
    },
    // section -2 scrolls by whole-document ratio; otherwise ratio is the progress within that heading section.
    scrollTo(ratio, section = -2) {
      if (ackVersion !== version || !Number.isFinite(ratio) || !integer(section, -2, 200000))
        return Promise.resolve();
      return command('scroll', { ratio: Math.round(Math.min(1, Math.max(0, ratio)) * 10000), section });
    },
    anchor(anchor) {
      if (!anchors.has(anchor)) return Promise.resolve();
      return command('anchor', { anchor });
    },
    find(query, move) {
      return command('find', { query: query.slice(0, 2048), move });
    },
    clearFind() {
      if (ackVersion !== version) return Promise.resolve({ count: 0, index: -1 });
      return command('clear-find');
    },
    next(delta) {
      return command('next', { delta });
    },
    copyResult(id, success) {
      if (actions.has(id)) return command('copy-result', { id, success });
      return Promise.resolve();
    },
    paintTiming() {
      return command('paint-timing');
    },
    inspect() {
      return command('inspect');
    },
    current(v) {
      return version === v && ackVersion === v;
    },
  };
}
