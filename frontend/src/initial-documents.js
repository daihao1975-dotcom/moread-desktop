export function initializeDocuments({ runtime, ready, enqueue, addResult, ensureRendered, onError }) {
  const receive = result =>
    enqueue(async () => {
      try {
        await addResult(result);
      } finally {
        ensureRendered();
      }
    });
  runtime.EventsOn('files-opened', receive);
  ready()
    .then(receive)
    .catch(error => {
      onError(error);
      ensureRendered();
    });
}
