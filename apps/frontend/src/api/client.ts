const API_BASE_URL = 'http://localhost:3000';

export async function apiPost<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed (${response.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) message = parsed.error;
    } catch {
      // non-JSON error body — use status-based message
    }
    throw new Error(message);
  }

  const json = await response.json();
  return json.data as TRes;
}
