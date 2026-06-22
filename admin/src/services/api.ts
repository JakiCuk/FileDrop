class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

function headers(): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (authToken) h["Authorization"] = `Bearer ${authToken}`;
  return h;
}

async function handleResponse(res: Response) {
  if (!res.ok) {
    // An authenticated request rejected with 401 means the token expired.
    if (res.status === 401 && authToken) onUnauthorized?.();
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }
  return res.json();
}

export const api = {
  setToken(token: string | null) {
    authToken = token;
  },

  /** Register a callback fired when an authenticated request returns 401. */
  setUnauthorizedHandler(handler: (() => void) | null) {
    onUnauthorized = handler;
  },

  async get(path: string) {
    const res = await fetch(path, { headers: headers() });
    return handleResponse(res);
  },

  async post(path: string, body?: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse(res);
  },

  async put(path: string, body?: unknown) {
    const res = await fetch(path, {
      method: "PUT",
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse(res);
  },

  async del(path: string) {
    const res = await fetch(path, {
      method: "DELETE",
      headers: headers(),
    });
    return handleResponse(res);
  },
};

export { ApiError };
