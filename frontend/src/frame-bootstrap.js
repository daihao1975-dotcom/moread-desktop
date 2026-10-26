/* Trusted application bootstrap. This exact UTF-8 source is authorized by the parent CSP hash. */
(() => {
  'use strict';
  const token = document.currentScript.nonce;
  const host = parent;
  const article = document.querySelector('article');
  const sheet = document.querySelector('style');
  let version = 0,
    hits = [],
    hitIndex = -1,
    actionNodes = new Map();
  // Interface labels arrive with each render so the pane follows the reader's language.
  let labels = {
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    empty: '',
    failed: 'Rendering failed',
  };
  const validLabels = x =>
    keys(x, ['copy', 'copied', 'copyFailed', 'empty', 'failed']) &&
    Object.keys(x).length === 5 &&
    Object.values(x).every(v => typeof v === 'string' && v.length <= 200);
  const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const keys = (x, list) => plain(x) && Object.keys(x).every(k => list.includes(k));
  const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
  const send = (type, payload = {}) =>
    host.postMessage({ channel: 'moread-frame-v1', token, version, type, ...payload }, '*');
  const clearFind = () => {
    article
      .querySelectorAll('mark.search-hit')
      .forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
    article.normalize();
    hits = [];
    hitIndex = -1;
  };
  const findState = () => ({ count: hits.length, index: hitIndex });
  const next = delta => {
    if (hits.length) {
      hitIndex = (hitIndex + delta + hits.length) % hits.length;
      hits.forEach(h => h.classList.remove('current'));
      hits[hitIndex].classList.add('current');
      hits[hitIndex].scrollIntoView({ block: 'center' });
    }
    return findState();
  };
  const find = (query, move) => {
    clearFind();
    if (!query) return findState();
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
      acceptNode: n =>
        n.parentElement.closest('script,style,button,.katex,.diagram')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.textContent,
        low = text.toLowerCase();
      let start = 0,
        pos;
      const frag = document.createDocumentFragment();
      while ((pos = low.indexOf(query.toLowerCase(), start)) !== -1) {
        frag.append(document.createTextNode(text.slice(start, pos)));
        const mark = document.createElement('mark');
        mark.className = 'search-hit';
        mark.textContent = text.slice(pos, pos + query.length);
        frag.append(mark);
        hits.push(mark);
        start = pos + query.length;
        if (hits.length >= 2000) break;
      }
      if (start) {
        frag.append(document.createTextNode(text.slice(start)));
        node.replaceWith(frag);
      }
      if (hits.length >= 2000) break;
    }
    return move ? next(1) : findState();
  };
  addEventListener('message', async event => {
    const m = event.data;
    if (
      event.source !== host ||
      !keys(m, [
        'channel',
        'token',
        'version',
        'type',
        'request',
        'body',
        'css',
        'theme',
        'size',
        'width',
        'reset',
        'query',
        'move',
        'delta',
        'anchor',
        'id',
        'success',
        'ratio',
        'section',
        'labels',
      ]) ||
      m.channel !== 'moread-host-v1' ||
      m.token !== token ||
      !integer(m.version, 0, 1e9) ||
      !integer(m.request, 1, 1e9)
    )
      return;
    if (m.type !== 'render' && m.version !== version) return;
    try {
      let result = {};
      switch (m.type) {
        case 'render': {
          if (
            m.version < version ||
            typeof m.body !== 'string' ||
            m.body.length > 64 * 1024 * 1024 ||
            typeof m.css !== 'string' ||
            m.css.length > 1024 * 1024 ||
            typeof m.reset !== 'boolean' ||
            !validLabels(m.labels)
          )
            return;
          labels = m.labels;
          version = m.version;
          clearFind();
          sheet.textContent = m.css;
          article.innerHTML =
            m.body ||
            (() => {
              const p = document.createElement('p');
              p.className = 'empty-document';
              p.textContent = labels.empty;
              return p.outerHTML;
            })();
          actionNodes = new Map();
          for (const node of article.querySelectorAll('[data-moread-action]')) {
            const id = Number(node.getAttribute('data-moread-action'));
            if (integer(id, 1, 200000)) actionNodes.set(id, node);
          }
          if (m.reset) scrollTo(0, 0);
          const thisVersion = version;
          await Promise.allSettled([...article.querySelectorAll('img')].map(i => i.decode()));
          await document.fonts.ready;
          if (thisVersion !== version) return;
          result = {
            empty: !article.children.length && !article.textContent.trim(),
            images: article.querySelectorAll('img').length,
          };
          break;
        }
        case 'prefs':
          if (
            !['light', 'dark', 'paper'].includes(m.theme) ||
            !integer(m.size, 13, 24) ||
            !['auto', 720, 860, 1040].includes(m.width)
          )
            return;
          document.documentElement.dataset.theme = m.theme;
          document.documentElement.style.setProperty('--font-size', m.size + 'px');
          document.documentElement.style.setProperty(
            '--content-width',
            m.width === 'auto' ? 'min(100%, 48em)' : m.width + 'px',
          );
          break;
        case 'find':
          if (typeof m.query !== 'string' || m.query.length > 2048 || typeof m.move !== 'boolean') return;
          result = find(m.query, m.move);
          break;
        case 'scroll':
          if (!integer(m.ratio, 0, 10000) || !integer(m.section, -2, 200000)) return;
          {
            const tops = headingTops();
            scrollTo(
              0,
              m.section === -2 || m.section >= tops.length
                ? (room() * m.ratio) / 10000
                : place(tops, m.section, m.ratio / 10000, room()),
            );
          }
          break;
        case 'clear-find':
          clearFind();
          result = findState();
          break;
        case 'next':
          if (![-1, 1].includes(m.delta)) return;
          result = next(m.delta);
          break;
        case 'anchor':
          if (typeof m.anchor !== 'string' || m.anchor.length > 2048) return;
          {
            const node = document.getElementById(m.anchor);
            if (node && article.contains(node)) node.scrollIntoView({ behavior: 'smooth' });
          }
          break;
        case 'inspect': {
          let parentAccessDenied = false;
          try {
            void host.document;
          } catch {
            parentAccessDenied = true;
          }
          const goVisible = typeof window.go === 'object' || typeof window.WailsInvoke === 'function';
          let nativeProbeAttempted = false;
          try {
            const handler = window.webkit?.messageHandlers?.external;
            if (handler && typeof handler.postMessage === 'function') {
              handler.postMessage(
                'C' +
                  JSON.stringify({
                    name: 'main.App.AboutInfo',
                    args: [],
                    callbackID: 'moread-readonly-frame-probe',
                  }),
              );
              nativeProbeAttempted = true;
            }
          } catch {}
          await new Promise(resolve => setTimeout(resolve, 300));
          result = { parentAccessDenied, goVisible, nativeProbeAttempted };
          break;
        }
        case 'copy-result':
          if (!integer(m.id, 1, 200000) || typeof m.success !== 'boolean') return;
          {
            const node = actionNodes.get(m.id);
            if (node?.matches('.copy-code')) {
              node.textContent = m.success ? labels.copied : labels.copyFailed;
              setTimeout(() => {
                if (version === m.version && actionNodes.get(m.id) === node) node.textContent = labels.copy;
              }, 1500);
            }
          }
          break;
        default:
          return;
      }
      send('ack', { request: m.request, command: m.type, result });
    } catch {
      send('error', { request: m.request, message: labels.failed });
    }
  });
  function activate(event) {
    const node = event.target.closest?.('[data-moread-action]');
    if (!node) return;
    event.preventDefault();
    if (!event.isTrusted) return;
    const id = Number(node.getAttribute('data-moread-action'));
    if (integer(id, 1, 200000) && actionNodes.get(id) === node) send('action', { id });
  }
  document.addEventListener('click', activate);
  document.addEventListener('auxclick', event => {
    event.preventDefault();
    if (event.button === 1) activate(event);
  });
  document.addEventListener('keydown', event => {
    if (!event.isTrusted) return;
    let key = '';
    if (event.key === 'Escape') key = 'escape';
    else if (event.metaKey || event.ctrlKey) {
      const k = event.key.toLowerCase();
      if (['o', 's', 'n', 'f', 'p', ',', '1', '2', '3'].includes(k))
        key = k === 's' && event.shiftKey ? 'save-as' : k;
    }
    if (key) {
      event.preventDefault();
      send('shortcut', { key });
      return;
    }
    if (['Enter', ' '].includes(event.key) && event.target.closest?.('[data-moread-action]')) activate(event);
  });
  document.addEventListener('dragover', event => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
  document.addEventListener('drop', event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    if (event.isTrusted) {
      const files = [...event.dataTransfer.files];
      if (files.length && files.length <= 256)
        send('drop', { files, x: Math.round(event.clientX), y: Math.round(event.clientY) });
    }
  });
  // Report reading position so the host can sync the editor and mark the current outline heading.
  let positionQueued = false;
  const headingTops = () =>
    [...article.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')].map(
      h => h.getBoundingClientRect().top + scrollY,
    );
  const room = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  // Section -1 is the text before the first heading; each section ends at the next heading or the last scroll position.
  const span = (tops, k, max) => [
    k < 0 ? 0 : tops[k],
    Math.min(k + 1 < tops.length ? tops[k + 1] : max, max),
  ];
  const locate = (tops, y, max) => {
    let k = -1;
    while (k + 1 < tops.length && tops[k + 1] <= y) k++;
    const [a, b] = span(tops, k, max);
    return { section: k, progress: b > a ? Math.min(1, Math.max(0, (y - a) / (b - a))) : 0 };
  };
  const place = (tops, k, p, max) => {
    const [a, b] = span(tops, k, max);
    return a + Math.max(0, b - a) * p;
  };
  const position = () => {
    positionQueued = false;
    const max = room(),
      y = Math.min(scrollY, max);
    const ratio = max > 0 ? Math.min(10000, Math.max(0, Math.round((y / max) * 10000))) : 0;
    let heading = '';
    for (const h of article.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')) {
      if (h.getBoundingClientRect().top > 80) break;
      heading = h.id;
    }
    const at = locate(headingTops(), y, max);
    send('position', {
      ratio,
      heading: heading.slice(0, 2048),
      section: at.section,
      progress: Math.round(at.progress * 10000),
    });
  };
  addEventListener(
    'scroll',
    () => {
      if (!positionQueued) {
        positionQueued = true;
        requestAnimationFrame(position);
      }
    },
    { passive: true },
  );
  send('ready');
})();
