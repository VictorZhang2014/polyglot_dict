export async function fetchWithSingleRetryOn500(
  input: RequestInfo | URL,
  init?: RequestInit,
  retryDelayMs = 500
): Promise<Response> {
  const firstResponse = await fetch(input, init);
  if (firstResponse.status !== 500) {
    return firstResponse;
  }

  await new Promise((resolve) => {
    window.setTimeout(resolve, retryDelayMs);
  });

  return fetch(input, init);
}
