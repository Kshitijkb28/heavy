/**
 * Where the editor keeps the owner's GitHub token. By default only for this tab (sessionStorage): every *.github.io page
 * of the account shares one origin, so anything stored for good is readable by the owner's other Pages sites too.
 * "Remember on this device" (an explicit choice at sign-in) keeps it in localStorage instead. Every access is guarded
 * (private windows, blocked storage).
 */
export const TOKEN_KEY = "heavy:gh-token";

export interface TokenStores {
  session: Storage | null;
  local: Storage | null;
}

function browserStores(): TokenStores {
  const pick = (get: () => Storage): Storage | null => {
    try {
      return get();
    } catch {
      return null;
    }
  };
  return { session: pick(() => window.sessionStorage), local: pick(() => window.localStorage) };
}

const read = (s: Storage | null) => {
  try {
    return s?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
};
const write = (s: Storage | null, value: string | null) => {
  try {
    if (value === null) s?.removeItem(TOKEN_KEY);
    else s?.setItem(TOKEN_KEY, value);
  } catch {
    // unavailable storage: signed in for this page only
  }
};

export function readToken(stores: TokenStores = browserStores()): string | null {
  return read(stores.session) ?? read(stores.local);
}

export function saveToken(token: string, remember: boolean, stores: TokenStores = browserStores()): void {
  write(remember ? stores.local : stores.session, token);
  write(remember ? stores.session : stores.local, null);
}

export function clearToken(stores: TokenStores = browserStores()): void {
  write(stores.session, null);
  write(stores.local, null);
}
