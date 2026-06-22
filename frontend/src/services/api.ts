export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

class ApiClient {
  private token: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  /** Register a callback fired when an authenticated request returns 401. */
  setUnauthorizedHandler(handler: (() => void) | null) {
    this.onUnauthorized = handler;
  }

  private authHeaders(): Record<string, string> {
    if (this.token) {
      return { Authorization: `Bearer ${this.token}` };
    }
    return {};
  }

  /**
   * Turn a non-ok response into an ApiError. When an authenticated request
   * (token present) is rejected with 401, the token is expired/invalid — fire
   * the unauthorized handler so the app can log the user out. The token guard
   * avoids spurious logouts during login (verify-otp 401) and on public pages.
   */
  private async handleError(res: Response): Promise<never> {
    if (res.status === 401 && this.token) {
      this.onUnauthorized?.();
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(path, { headers: this.authHeaders() });
    if (!res.ok) return this.handleError(res);
    return res.json();
  }

  async post<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(path, {
      method: "POST",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) return this.handleError(res);
    return res.json();
  }

  async del<T = unknown>(path: string): Promise<T> {
    const res = await fetch(path, {
      method: "DELETE",
      headers: this.authHeaders(),
    });
    if (!res.ok) return this.handleError(res);
    return res.json();
  }

  async uploadChunk(
    path: string,
    data: ArrayBuffer,
    iv: string,
    signal?: AbortSignal,
  ): Promise<{ chunkIndex: number; size: number }> {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/octet-stream",
        "X-Chunk-IV": iv,
      },
      body: data,
      signal,
    });
    if (!res.ok) return this.handleError(res);
    return res.json();
  }

  async downloadChunk(
    path: string,
    signal?: AbortSignal,
  ): Promise<{ data: ArrayBuffer; iv: string }> {
    const res = await fetch(path, { headers: this.authHeaders(), signal });
    if (!res.ok) return this.handleError(res);
    const iv = res.headers.get("X-Chunk-IV") || "";
    const data = await res.arrayBuffer();
    return { data, iv };
  }
}

export const api = new ApiClient();
