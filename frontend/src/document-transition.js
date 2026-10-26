// Keep the current editor immutable between the user's decision and the new document.
export async function documentTransition({ guard, load, apply, setOpening, valid = () => true }) {
  if (!(await guard()) || !valid()) return false;
  setOpening(true);
  try {
    const document = await load();
    if (!valid()) return false;
    apply(document);
    return true;
  } finally {
    setOpening(false);
  }
}
