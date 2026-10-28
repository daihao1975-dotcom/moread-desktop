// Textareas expose LF text. Keep each original delimiter separately so an edit
// does not silently rewrite all the other lines in a mixed-ending document.
export function readLineEndings(content) {
  const endings = content.match(/\r\n|\r|\n/g) || [];
  return {
    text: content.replace(/\r\n|\r/g, '\n'),
    endings,
    preferred: endings[0] || '\n',
  };
}

export function editLineEndings(before, after, endings, preferred = '\n') {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let oldEnd = before.length,
    newEnd = after.length;
  while (oldEnd > prefix && newEnd > prefix && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const count = text => (text.match(/\n/g) || []).length;
  const kept = count(before.slice(0, prefix));
  const removed = count(before.slice(prefix, oldEnd));
  const added = count(after.slice(prefix, newEnd));
  const middle = added === removed ? endings.slice(kept, kept + removed) : Array(added).fill(preferred);
  return [...endings.slice(0, kept), ...middle, ...endings.slice(kept + removed)];
}

export function writeLineEndings(text, endings, preferred = '\n') {
  let index = 0;
  return text.replace(/\n/g, () => endings[index++] || preferred);
}
