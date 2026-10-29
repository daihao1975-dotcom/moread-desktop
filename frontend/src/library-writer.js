// Keep failures observable by quit, while allowing the next full snapshot to retry.
export function createLibraryWriter({ write, onError }) {
  let pending = Promise.resolve();
  return {
    persist(state) {
      const snapshot = JSON.parse(JSON.stringify(state));
      pending = pending.catch(() => {}).then(() => write(snapshot));
      // Reporting a background failure must not turn the write into a success.
      pending.catch(onError);
      return pending;
    },
    async flush() {
      for (;;) {
        const last = pending;
        try {
          await last;
        } catch (error) {
          if (last === pending) throw error;
        }
        if (last === pending) return;
      }
    },
  };
}
