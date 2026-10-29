// The dirty decision and the final library flush share one immutable editor state.
export function createCloseRequest({ enqueue, guard, flush, setLocked, quit, cancel, onError }) {
  let inFlight = false,
    approved = false;
  return () => {
    if (inFlight || approved) return;
    inFlight = true;
    return enqueue(async () => {
      let locked = false;
      try {
        if (!(await guard())) {
          await cancel();
          return false;
        }
        setLocked(true);
        locked = true;
        await flush();
        await quit();
        approved = true;
        return true;
      } catch (error) {
        try {
          await cancel();
        } catch (cancelError) {
          onError(cancelError);
        }
        onError(error);
        return false;
      } finally {
        if (locked && !approved) setLocked(false);
        inFlight = false;
      }
    });
  };
}
