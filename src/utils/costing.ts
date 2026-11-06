import { mutate } from 'swr';
import { CostEstimate, CostMode, Product } from '../types/api';

export interface CostingDraft {
  cost_mode: CostMode;
  cost_recipe_id: number | null;
  components: { recipe_id: number; quantity_g: string }[];
  reviewed: boolean;
}
export const emptyCostingDraft = (): CostingDraft => ({ cost_mode: 'manual', cost_recipe_id: null, components: [], reviewed: false });
export const decimalInput = (value: string): number | null => {
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
};
export const costingPayload = (draft: CostingDraft) => ({
  cost_mode: draft.cost_mode,
  cost_recipe_id: draft.cost_mode === 'recipe' ? draft.cost_recipe_id : null,
  components: draft.cost_mode === 'assortment' ? draft.components.map(row => ({ recipe_id: row.recipe_id, quantity_g: decimalInput(row.quantity_g) })) : [],
});
export const validCostingDraft = (draft: CostingDraft, netWeight?: number | null) => {
  if (draft.cost_mode === 'manual') return true;
  if (!draft.reviewed) return false;
  if (draft.cost_mode === 'recipe') return Boolean(draft.cost_recipe_id);
  const rows = draft.components;
  if (rows.length < 2 || new Set(rows.map(row => row.recipe_id)).size !== rows.length) return false;
  if (rows.some(row => !row.recipe_id || decimalInput(row.quantity_g) === null || Number(decimalInput(row.quantity_g)) <= 0)) return false;
  const totalMg = rows.reduce((sum, row) => sum + Math.round(Number(decimalInput(row.quantity_g)) * 1000), 0);
  return netWeight == null || totalMg === Math.round(netWeight * 1000);
};
export const effectiveProductCost = (product: Pick<Product, 'cost' | 'cost_estimate' | 'cost_mode'>): number | null => {
  if (product.cost_estimate) return product.cost_estimate.status === 'complete' ? product.cost_estimate.total_cost : null;
  if (product.cost_mode === 'recipe' || product.cost_mode === 'assortment') return null;
  return Number.isFinite(product.cost) ? product.cost : null;
};
export const calculatedSnapshot = (snapshot?: { source: string } | null) => snapshot?.source === 'recipe' || snapshot?.source === 'assortment';
export const costSourceLabel = (source?: string) => source === 'recipe' ? 'From recipe' : source === 'assortment' ? 'Assortment' : 'Manual';
export const invalidateCosting = (workspaceId: string | null | undefined) => mutate((key: unknown) =>
  Array.isArray(key) && key[1] === workspaceId && typeof key[0] === 'string' &&
  ['/api/products', '/api/recipes', '/api/packages', '/api/prices', '/api/workspace-ingredients'].some(prefix => key[0] === prefix || key[0].startsWith(`${prefix}/`))
);
export const costIssues = (estimate?: CostEstimate | null) => estimate?.issues.map(issue => issue.message).join('; ') || 'Cost information is unavailable';
