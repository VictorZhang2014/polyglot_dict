export function runInBackground(task: () => Promise<unknown> | unknown, label: string): void {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((error) => {
        console.error(`[background-task] ${label} failed:`, error);
      });
  });
}
