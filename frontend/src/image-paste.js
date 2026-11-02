import { t } from './i18n.js';

const maxBytes = 20 * 1024 * 1024;
const supported = /^image\/(png|jpeg|gif)$/i;

// Capture File objects while the paste event's clipboard store is still readable.
export function clipboardImages(data) {
  const items = [...(data?.items || [])]
    .filter(item => item.kind === 'file' && /^image\//i.test(item.type))
    .map(item => item.getAsFile())
    .filter(Boolean);
  return items.length ? items : [...(data?.files || [])].filter(file => /^image\//i.test(file.type));
}

function readImage(file, Reader) {
  return new Promise((resolve, reject) => {
    const reader = new Reader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reader.onabort = () => reject(new Error(t('err.clipboardImageRead')));
    reader.readAsDataURL(file);
  });
}

export function imageEdit(value, start, end, refs) {
  const before = start > 0 && value[start - 1] !== '\n' ? '\n\n' : '';
  const after = end < value.length && value[end] !== '\n' ? '\n\n' : '\n';
  const text = before + refs.map(ref => `![${t('img.default')}](${ref})`).join('\n\n') + after;
  const caret = start + text.length;
  return { start, end, text, select: [caret, caret] };
}

// Serialize image I/O with document transitions. Keep the source read-only until the
// edit can be inserted as one undoable operation at the original selection.
export function bindImagePaste(editor, { enqueue, documentKey, ensureSaved, store, apply, busy, onError }) {
  editor.addEventListener('paste', event => {
    if (editor.disabled || editor.readOnly || event.defaultPrevented) return;
    const files = clipboardImages(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    if (files.some(file => !supported.test(file.type))) {
      onError(new Error(t('err.clipboardImageType')));
      return;
    }
    if (files.length > 20 || files.reduce((sum, file) => sum + file.size, 0) > maxBytes) {
      onError(new Error(t('err.clipboardImageSize')));
      return;
    }
    const key = documentKey(),
      value = editor.value,
      start = editor.selectionStart,
      end = editor.selectionEnd;
    editor.readOnly = true;
    busy(true);
    enqueue(async () => {
      try {
        if (documentKey() !== key || editor.value !== value) return;
        const encoded = [];
        for (const file of files)
          encoded.push(await readImage(file, editor.ownerDocument.defaultView.FileReader));
        if (!(await ensureSaved())) return;
        const refs = await store(encoded);
        editor.readOnly = false;
        apply(imageEdit(value, start, end, refs));
      } catch (e) {
        onError(e);
      } finally {
        editor.readOnly = false;
        busy(false);
        if (!editor.disabled && !editor.classList.contains('hidden')) editor.focus();
      }
    });
  });
}
