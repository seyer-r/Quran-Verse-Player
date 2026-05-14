/**
 * Quran Foundation User API client.
 *
 * Authentication: the QF User API uses JWT Bearer tokens. Obtain one via
 * loginQF() (email + password). All user-scoped endpoints require the token
 * in the Authorization header.
 *
 * Base URL: https://api.quran.com/api/v4
 * Docs: https://api-docs.quran.foundation  (login required)
 */

const QF_API = "https://api.quran.com/api/v4";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

interface LoginResponse {
  // The QF API may nest the token under `data` or return it at the top level.
  token?: string;
  data?: { token?: string; user?: QFUser };
  user?: QFUser;
}

export interface QFUser {
  id: number | string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

/**
 * Sign in with a Quran.com email and password.
 * Returns the access token on success; throws a user-readable error on failure.
 */
export async function loginQF(
  email: string,
  password: string,
): Promise<{ token: string; user: QFUser | null }> {
  const res = await fetch(`${QF_API}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const json = (await res.json().catch(() => null)) as LoginResponse | null;

  if (__DEV__) {
    console.log("[QF auth] login response", res.status, JSON.stringify(json));
  }

  if (!res.ok) {
    const msg =
      (json as Record<string, unknown> | null)?.message ??
      (json as Record<string, unknown> | null)?.error ??
      `Login failed (${res.status})`;
    throw new Error(String(msg));
  }

  const token = json?.token ?? json?.data?.token;
  if (!token) throw new Error("No token in response — check API endpoint.");

  const user = json?.user ?? json?.data?.user ?? null;
  return { token, user };
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────

export interface QFBookmark {
  id: string;
  /** e.g. "2:255" */
  verseKey: string;
}

interface RawQFBookmark {
  id?: string | number;
  key?: string;
  verse_key?: string;
  ayah_key?: string;
}

function parseBookmark(raw: RawQFBookmark): QFBookmark | null {
  const id = String(raw.id ?? "");
  const verseKey = raw.verse_key ?? raw.ayah_key ?? raw.key ?? "";
  if (!id || !verseKey) return null;
  return { id, verseKey };
}

interface BookmarksListResponse {
  bookmarks?: RawQFBookmark[];
  data?: RawQFBookmark[];
}

/** Fetch all bookmarks for the authenticated user. */
export async function fetchQFBookmarks(token: string): Promise<QFBookmark[]> {
  const res = await fetch(`${QF_API}/bookmarks`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Bookmarks fetch failed (${res.status})`);
  const json = (await res.json()) as BookmarksListResponse;
  const raw = json.bookmarks ?? json.data ?? [];
  return raw.map(parseBookmark).filter((b): b is QFBookmark => b !== null);
}

interface BookmarkCreateResponse {
  bookmark?: RawQFBookmark;
  data?: RawQFBookmark;
  id?: string | number;
}

/** Add a bookmark for a verse key (e.g. "2:255"). Returns the new QFBookmark. */
export async function addQFBookmark(
  token: string,
  verseKey: string,
): Promise<QFBookmark> {
  const res = await fetch(`${QF_API}/bookmarks`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ verse_key: verseKey }),
  });
  if (!res.ok) throw new Error(`Add bookmark failed (${res.status})`);
  const json = (await res.json()) as BookmarkCreateResponse;
  const raw = json.bookmark ?? json.data ?? json;
  const parsed = parseBookmark(raw as RawQFBookmark);
  if (!parsed) throw new Error("Unexpected bookmark response shape");
  return parsed;
}

/** Delete a bookmark by its QF ID. */
export async function deleteQFBookmark(
  token: string,
  bookmarkId: string,
): Promise<void> {
  const res = await fetch(`${QF_API}/bookmarks/${bookmarkId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Delete bookmark failed (${res.status})`);
}
