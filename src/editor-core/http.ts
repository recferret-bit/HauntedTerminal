/** The spec file on disk changed outside this editor (HTTP 409 conflict). */
export class ConflictError extends Error {}

export interface EditorSaveResult {
  regenerated: boolean;
  etag: string;
  warning?: string;
}

/** Issues a JSON request to a local editor dev API endpoint, raising `ConflictError` on HTTP 409. */
export async function requestEditorJson<T>(
  url: string,
  init?: RequestInit,
  conflictFallback = 'file changed on disk',
): Promise<T> {
  const res = await fetch(url, init);
  const raw = await res.text();
  let body: (T & { error?: string }) | null = null;
  if (raw) {
    try {
      body = JSON.parse(raw) as T & { error?: string };
    } catch {
      body = null;
    }
  }
  if (res.status === 409) throw new ConflictError(body?.error ?? conflictFallback);
  if (!res.ok) throw new Error(body?.error ?? (`${res.status} ${res.statusText}`.trim() || 'HTTP error'));
  if (body === null) throw new Error('Invalid JSON response from editor API');
  return body;
}

/** Writes one spec file via `PUT` with optimistic `baseEtag` conflict protection. */
export async function putEditorSpecFile<T = EditorSaveResult>(
  endpoint: string,
  relPath: string,
  json: unknown,
  baseEtag?: string,
  conflictFallback = 'the file changed on disk',
): Promise<T> {
  return requestEditorJson<T>(
    endpoint,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: relPath, json, baseEtag }),
    },
    conflictFallback,
  );
}
