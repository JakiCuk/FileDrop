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

  setToken(token: string | null) {
    this.token = token;
  }

  private authHeaders(): Record<string, string> {
    if (this.token) {
      return { Authorization: `Bearer ${this.token}` };
    }
    return {};
  }

  async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(path, { headers: this.authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error || res.statusText);
    }
    return res.json();
  }

  async post<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(path, {
      method: "POST",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, data.error || res.statusText);
    }
    return res.json();
  }

  async del<T = unknown>(path: string): Promise<T> {
    const res = await fetch(path, {
      method: "DELETE",
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, data.error || res.statusText);
    }
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
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error || res.statusText);
    }
    return res.json();
  }

  async downloadChunk(
    path: string,
    signal?: AbortSignal,
  ): Promise<{ data: ArrayBuffer; iv: string }> {
    const res = await fetch(path, { headers: this.authHeaders(), signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new ApiError(res.status, body.error || res.statusText);
    }
    const iv = res.headers.get("X-Chunk-IV") || "";
    const data = await res.arrayBuffer();
    return { data, iv };
  }
}

export const api = new ApiClient();
