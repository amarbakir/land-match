const API_BASE_URL = 'http://localhost:3000';

export async function apiPost<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await response.json();

  if (!json.ok) {
    throw new Error(json.error ?? 'Request failed');
  }

  return json.data as TRes;
}
