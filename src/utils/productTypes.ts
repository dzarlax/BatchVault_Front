import type { Product, ProductType, ProductPackage, Recipe } from '../types/api';
import type { CostingDraft } from './costing';

export const currentProductType = (product: Pick<Product, 'product_type' | 'cost_mode'>): ProductType | null => {
  if (product.product_type != null) return product.product_type === 'standard' || product.product_type === 'assortment' ? product.product_type : null;
  return !product.cost_mode || product.cost_mode === 'manual' || product.cost_mode === 'recipe' ? 'standard' : product.cost_mode === 'assortment' ? 'assortment' : null;
};

export const emptyProductDraft = (): CostingDraft => ({ product_type: 'standard', cost_mode: 'recipe', cost_recipe_id: null, composition_basis: null, components: [], assortment_components: [], reviewed: true });
export const productDraft = (product: Product): CostingDraft => ({
  ...emptyProductDraft(), product_type: currentProductType(product) ?? undefined,
  cost_mode: product.cost_mode || 'manual', cost_recipe_id: product.recipe_id ?? product.cost_recipe_id ?? null,
  composition_basis: product.composition_basis === 'products' || product.composition_basis === 'legacy_recipes' ? product.composition_basis : product.cost_mode === 'assortment' ? 'legacy_recipes' : null,
  components: (product.components || []).map(row => ({ ...row, quantity_g: String(row.quantity_g) })),
  assortment_components: (product.assortment_components || []).map((row, index) => ({ ...row, quantity_g: String(row.quantity_g), position: row.position ?? index })),
  configuration_version: product.configuration_version,
});

// numeric(14,3) grams fit exactly in an integer milligram value, below Number.MAX_SAFE_INTEGER.
export const gramsInMilligrams = (input: string): number | null => {
  const value = input.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole || '0') * 1000 + Number(fraction.padEnd(3, '0'));
  return Number.isSafeInteger(result) && result <= 99999999999999 ? result : null;
};
export const componentWeight = (draft: CostingDraft): number | null => {
  const rows = draft.composition_basis === 'legacy_recipes' ? draft.components : draft.assortment_components || [];
  let total = 0;
  for (const row of rows) {
    const value = gramsInMilligrams(row.quantity_g);
    if (value == null) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total / 1000;
};
export const validProductDraft = (draft: CostingDraft, netWeight?: number | null, conversionContext?: string): boolean => {
  if (!draft.product_type) return false;
  if (draft.product_type === 'standard') return draft.cost_mode === 'manual' || (draft.cost_mode === 'recipe' && Boolean(draft.cost_recipe_id));
  if (draft.cost_mode !== 'manual' && draft.cost_mode !== 'assortment') return false;
  if (draft.converting) {
    if (!draft.conversionAccepted || !conversionContext || draft.conversionAcceptedContext !== conversionContext) return false;
    if (draft.cost_mode !== 'manual' && (!draft.conversionPreview?.complete || draft.conversionPreview.context !== conversionContext || draft.conversionAcceptedEstimate !== draft.conversionPreview.estimate)) return false;
  }
  const rows = draft.composition_basis === 'legacy_recipes' ? draft.components.map(row => ({ id: row.recipe_id, grams: row.quantity_g }))
    : (draft.assortment_components || []).map(row => ({ id: row.component_product_id, grams: row.quantity_g }));
  if (rows.length < 2 || new Set(rows.map(row => row.id)).size !== rows.length) return false;
  if (rows.some(row => !row.id || (gramsInMilligrams(row.grams) ?? 0) <= 0)) return false;
  const total = componentWeight(draft);
  return total != null && (netWeight == null || Math.round(total * 1000) === Math.round(netWeight * 1000));
};
export const productConfigurationPayload = (draft: CostingDraft) => ({
  product_type: draft.product_type, cost_mode: draft.cost_mode,
  recipe_id: draft.product_type === 'standard' ? draft.cost_recipe_id : null,
  cost_recipe_id: draft.product_type === 'standard' ? draft.cost_recipe_id : null,
  composition_basis: draft.product_type === 'assortment' ? draft.composition_basis : null,
  components: draft.product_type === 'assortment' && draft.composition_basis === 'legacy_recipes'
    ? draft.components.map(row => ({ recipe_id: row.recipe_id, quantity_g: Number(row.quantity_g.replace(',', '.')) })) : [],
  assortment_components: draft.product_type === 'assortment' && draft.composition_basis === 'products'
    ? (draft.assortment_components || []).map((row, position) => ({ component_product_id: row.component_product_id, quantity_g: Number(row.quantity_g.replace(',', '.')), position })) : [],
  ...(draft.configuration_version != null ? { configuration_version: draft.configuration_version } : {}),
});

export const changeProductType = (draft: CostingDraft, type: ProductType): CostingDraft => ({
  ...draft, product_type: type, cost_mode: draft.cost_mode === 'manual' ? 'manual' : type === 'standard' ? 'recipe' : 'assortment',
  cost_recipe_id: null, components: [], assortment_components: [], composition_basis: type === 'assortment' ? 'products' : null,
  converting: false, conversionAccepted: false,
});

// Acceptance belongs to this configuration and this authoritative preview, not a bare checkbox.
export const conversionContextKey = (draft: CostingDraft, packageId: number | null, packaging: ProductPackage | undefined, manualCost: string, products: Product[], recipes: Recipe[], workspaceId?: string | null): string => {
  const ids = new Set((draft.assortment_components || []).map(row => row.component_product_id));
  const sources = products.filter(product => ids.has(product.id)).map(product => ({
    id: product.id, recipe_id: product.recipe_id ?? product.cost_recipe_id, version: product.configuration_version,
    estimate: product.cost_estimate,
  }));
  const recipeIds = new Set(sources.map(source => source.recipe_id));
  if (draft.product_type === 'standard' && draft.cost_recipe_id) recipeIds.add(draft.cost_recipe_id);
  return JSON.stringify({ workspace_id: workspaceId, configuration: productConfigurationPayload(draft), package_id: packageId,
    net_weight_g: packaging?.net_weight_g, unit_cost: packaging?.unit_cost,
    manual_cost: draft.cost_mode === 'manual' ? manualCost : undefined, sources,
    recipes: recipes.filter(recipe => recipeIds.has(recipe.id)).map(recipe => ({ id: recipe.id, planned_yield_g: recipe.planned_yield_g, estimate: recipe.cost_estimate })),
  });
};
