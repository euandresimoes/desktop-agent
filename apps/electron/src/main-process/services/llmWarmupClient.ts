const ACTIVE_LLM_WARMUP_URL =
  "http://localhost:35421/api/v1/models/active/warmup";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function warmupActiveLlmModel(
  attempts = 6,
  delayMs = 1500,
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(ACTIVE_LLM_WARMUP_URL, {
        method: "POST",
      });

      if (response.ok) {
        return true;
      }

      if (response.status === 404) {
        return false;
      }
    } catch {
      // Backend may still be starting up.
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  return false;
}
