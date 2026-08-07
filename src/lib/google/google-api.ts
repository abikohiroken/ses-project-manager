import { JWT } from "google-auth-library";

const MAX_RETRIES = 3;

export const GOOGLE_API_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
] as const;

type RetryOptions = {
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

export function restorePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n");
}

export function createGoogleJwt(clientEmail: string, privateKey: string): JWT {
  return new JWT({
    email: clientEmail,
    key: restorePrivateKey(privateKey),
    scopes: [...GOOGLE_API_SCOPES],
  });
}

function googleStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown };
  };
  if (typeof candidate.response?.status === "number")
    return candidate.response.status;
  return typeof candidate.code === "number" ? candidate.code : null;
}

function isRetryableGoogleStatus(status: number | null): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function withGoogleApiRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  let retry = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isRetryableGoogleStatus(googleStatus(error)) ||
        retry >= MAX_RETRIES
      ) {
        throw error;
      }
      const baseDelay = 1_000 * 2 ** retry;
      const jitter = Math.floor(random() * 250);
      retry += 1;
      await sleep(baseDelay + jitter);
    }
  }
}
