import fetcher from './fetcher';
import { getApiUrl } from './runtimeConfig';
import type {
  CookingAdjustmentInput, CookingPackingInput, CookingPackingPreview, CookingPlanInput,
  CookingPlanPreview, CookingPreparationInput, CookingResultInput, CookingRun, CookingStock,
} from '../types/cooking';

const currentAccountId = () => {
  if (typeof window === 'undefined') return 'server';
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const userId = user?.id || user?.userID || user?.userId;
    if (userId) return String(userId);
  } catch { /* fall through to token claims */ }
  try {
    const token = localStorage.getItem('token');
    const payload = JSON.parse(atob(token?.split('.')[1] || ''));
    return String(payload.userID || payload.userId || payload.sub || 'unknown');
  } catch { return 'unknown'; }
};

export const cookingOperationScope = (workspaceId?: string | null) => `${getApiUrl().replace(/\/$/, '')}|${currentAccountId()}|${workspaceId || 'no-workspace'}`;
const scopedKey = (runId: number | 'new', action: string, workspaceId?: string | null, scope = cookingOperationScope(workspaceId)) => `cooking:operation:${encodeURIComponent(scope)}:${runId}:${action}`;

const readPendingRecord = (key: string, scope: string) => {
  if (typeof window === 'undefined') return null;
  const persistent = localStorage.getItem(key);
  if (persistent) {
    try { const record = JSON.parse(persistent); if (record.scope === scope) return record; }
    catch { /* discard malformed pending data */ }
    localStorage.removeItem(key);
  }
  const legacy = sessionStorage.getItem(key);
  if (!legacy) return null;
  try {
    const record = JSON.parse(legacy);
    if (record.scope !== scope) { sessionStorage.removeItem(key); return null; }
    localStorage.setItem(key, legacy);
    sessionStorage.removeItem(key);
    return record;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
};

const secureOperationId = () => {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) throw new Error('Secure operation IDs are unavailable in this browser.');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const cookingOperationId = (runId: number | 'new', action: string, workspaceId?: string | null) => {
  const key = scopedKey(runId, action, workspaceId);
  if (typeof window === 'undefined') return secureOperationId();
  const scope = cookingOperationScope(workspaceId);
  const current = readPendingRecord(key, scope);
  if (current && typeof current.id === 'string') return current.id;
  const next = secureOperationId();
  localStorage.setItem(key, JSON.stringify({ scope, id: next }));
  return next;
};

export const clearCookingOperationId = (runId: number | 'new', action: string, workspaceId?: string | null, capturedScope?: string) => {
  if (typeof window !== 'undefined') {
    const key = scopedKey(runId, action, workspaceId, capturedScope || cookingOperationScope(workspaceId));
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}:body`);
    sessionStorage.removeItem(key);
    sessionStorage.removeItem(`${key}:body`);
  }
};

export const cookingRequestBody = <T,>(runId: number | 'new', action: string, build: (operationId: string) => T, workspaceId?: string | null): T => {
  const key = `${scopedKey(runId, action, workspaceId)}:body`;
  if (typeof window !== 'undefined') {
    const saved = readPendingRecord(key, cookingOperationScope(workspaceId));
    if (saved && Object.prototype.hasOwnProperty.call(saved, 'body')) return saved.body as T;
  }
  const body = build(cookingOperationId(runId, action, workspaceId));
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify({ scope: cookingOperationScope(workspaceId), body }));
  return body;
};

export const getCookingPendingBody = <T,>(runId: number | 'new', action: string, workspaceId?: string | null): T | null => {
  if (typeof window === 'undefined') return null;
  const saved = readPendingRecord(`${scopedKey(runId, action, workspaceId)}:body`, cookingOperationScope(workspaceId));
  return saved && Object.prototype.hasOwnProperty.call(saved, 'body') ? saved.body as T : null;
};

type CookingRequester = (path: string, options: Record<string, unknown>) => Promise<unknown>;

const request = <T,>(requester: CookingRequester, path: string, method: string, body?: unknown, workspaceId?: string | null) => requester(path, {
  method,
  ...(workspaceId ? { headers: { 'X-Workspace-ID': workspaceId } } : {}),
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}) as Promise<T>;

export const cookingApiFor = (workspaceId?: string | null, requester: CookingRequester = fetcher) => ({
  plan: (body: CookingPlanInput) => request<CookingPlanPreview>(requester, '/api/cooking/plan-preview', 'POST', body, workspaceId),
  createRun: (body: CookingPlanInput & { title: string; date: string; source_signature: string; stock_version: number; operation_id: string }) => request<CookingRun>(requester, '/api/cooking-runs', 'POST', body, workspaceId),
  replan: (id: number, body: CookingPlanInput & { title: string; date: string; source_signature: string; stock_version: number; version: number; operation_id: string }) => request<CookingRun>(requester, `/api/cooking-runs/${id}/plan`, 'PUT', body, workspaceId),
  runs: (cursor?: string) => request<{ items: CookingRun[]; next_cursor?: string | null }>(requester, `/api/cooking-runs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET', undefined, workspaceId),
  run: (id: number) => request<CookingRun>(requester, `/api/cooking-runs/${id}`, 'GET', undefined, workspaceId),
  preparationPreview: (body: CookingPreparationInput) => request(requester, '/api/cooking/preparation-preview', 'POST', body, workspaceId),
  savePreparation: (id: number, body: CookingPreparationInput) => request<CookingRun>(requester, `/api/cooking-runs/${id}/preparation`, 'PUT', body, workspaceId),
  packingPreview: (id: number, body: { lines: CookingPackingInput['lines']; sources?: CookingPackingInput['sources']; actual_usable_g?: { recipe_id: number; quantity_g: string }[] }) => request<CookingPackingPreview>(requester, `/api/cooking-runs/${id}/packing-preview`, 'POST', body, workspaceId),
  results: (id: number, body: CookingResultInput) => request<CookingRun>(requester, `/api/cooking-runs/${id}/results`, 'POST', body, workspaceId),
  pack: (id: number, body: CookingPackingInput) => request<CookingRun>(requester, `/api/cooking-runs/${id}/packings`, 'POST', body, workspaceId),
  archive: (id: number, body: { version: number; operation_id: string }) => request<CookingRun>(requester, `/api/cooking-runs/${id}/archive`, 'POST', body, workspaceId),
  stock: () => request<CookingStock>(requester, '/api/cooking-stock', 'GET', undefined, workspaceId),
  adjustStock: (body: CookingAdjustmentInput) => request<CookingStock>(requester, '/api/cooking-stock/adjustments', 'POST', body, workspaceId),
  operation: (id: string) => request<{ status: 'committed'; result: CookingRun | CookingStock }>(requester, `/api/cooking/operations/${id}`, 'GET', undefined, workspaceId),
});

export const parseDecimalInput = (value: string) => {
  const normalized = value.trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(normalized) ? normalized : '';
};

export const parseSignedDecimalInput = (value: string) => {
  const normalized = value.trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : '';
};

export const hasBaseSelectionIssue = (issues: { code: string }[] = []) => issues.some(issue => issue.code.toLowerCase().includes('base') && issue.code.toLowerCase().includes('select'));

const massUnitGrams = (unit: string) => {
  switch (unit.trim().toLowerCase()) {
    case 'g': case 'gram': case 'grams': return 1;
    case 'kg': case 'kilogram': case 'kilograms': return 1000;
    default: return null;
  }
};

export const isSupportedMassUnit = (unit: string) => massUnitGrams(unit) !== null;

export const normalizeMassQuantityToGrams = (quantity: string, unit: string) => {
  const multiplier = massUnitGrams(unit);
  const parsed = parseDecimalInput(quantity);
  if (multiplier === null || !parsed) return null;
  if (multiplier === 1) return parsed;
  const [whole, fraction = ''] = parsed.split('.');
  const digits = `${whole}${fraction}`;
  const decimalPosition = whole.length + 3;
  const integer = digits.slice(0, decimalPosition).padEnd(decimalPosition, '0').replace(/^0+(?=\d)/, '') || '0';
  const gramsFraction = digits.slice(decimalPosition).replace(/0+$/, '');
  return gramsFraction ? `${integer}.${gramsFraction}` : integer;
};

export const displayGrams = (value?: string | null) => {
  if (!value) return '—';
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(number) : value;
};

export const operationErrorMessage = (error: unknown) => {
  const status = (error as { status?: number })?.status;
  if (status === 409) return 'conflict';
  if (status === 0 || (typeof status === 'number' && status >= 500) || error instanceof TypeError || !Number.isFinite(status)) return 'ambiguous';
  return 'failed';
};

export const operationWasRejected = (error: unknown) => {
  const status = (error as { status?: number })?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
};
