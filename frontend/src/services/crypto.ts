const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bufferToBase64Url(raw);
}

export async function importKeyFromBase64(
  base64url: string,
): Promise<CryptoKey> {
  const raw = base64UrlToBuffer(base64url);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptChunk(
  key: CryptoKey,
  data: ArrayBuffer,
): Promise<{ iv: string; ciphertext: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data,
  );
  return { iv: bufferToBase64Url(iv.buffer), ciphertext };
}

export async function decryptChunk(
  key: CryptoKey,
  iv: string,
  ciphertext: ArrayBuffer,
): Promise<ArrayBuffer> {
  const ivBuf = base64UrlToBuffer(iv);
  return crypto.subtle.decrypt({ name: ALGORITHM, iv: ivBuf }, key, ciphertext);
}

export async function encryptString(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const data = new TextEncoder().encode(plaintext);
  const { iv, ciphertext } = await encryptChunk(key, data.buffer);
  return JSON.stringify({ iv, data: bufferToBase64Url(ciphertext) });
}

export async function decryptString(
  key: CryptoKey,
  encrypted: string,
): Promise<string> {
  const { iv, data } = JSON.parse(encrypted);
  const buf = base64UrlToBuffer(data);
  const decrypted = await decryptChunk(key, iv, buf);
  return new TextDecoder().decode(decrypted);
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
