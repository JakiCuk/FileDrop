// Local-only vault for share encryption keys.
//
// The AES-256-GCM key of a share lives only in the share URL fragment and is
// never sent to the server (zero-knowledge). If the uploader does not copy the
// link right after upload, the key is lost. To let the uploader recover the
// link later, we persist the key locally in the browser (localStorage) — keyed
// by slug. This never touches the server, so a server breach cannot reveal it.
//
// Trade-off: recovery works only on the same browser/profile, and the key is
// stored in plaintext (no passphrase). See docs/ARCHITECTURE.md.

const STORAGE_KEY = "sharedrop_share_keys";

interface StoredKey {
  key: string; // base64url-encoded raw AES key
  createdAt: string; // ISO timestamp
}

type Vault = Record<string, StoredKey>;

function readVault(): Vault {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Vault) : {};
  } catch {
    // private mode / corrupted value — behave as empty vault
    return {};
  }
}

function writeVault(vault: Vault): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
  } catch {
    // private mode / quota exceeded — recovery just won't be available
  }
}

export function saveShareKey(slug: string, keyBase64: string): void {
  const vault = readVault();
  vault[slug] = { key: keyBase64, createdAt: new Date().toISOString() };
  writeVault(vault);
}

export function getShareKey(slug: string): string | null {
  return readVault()[slug]?.key ?? null;
}

export function removeShareKey(slug: string): void {
  const vault = readVault();
  if (slug in vault) {
    delete vault[slug];
    writeVault(vault);
  }
}

export function buildShareUrl(slug: string, keyBase64: string): string {
  return `${window.location.origin}/s/${slug}#${keyBase64}`;
}
