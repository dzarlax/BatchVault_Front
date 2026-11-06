import type { CostingDraft } from './costing';
import { decimalInput } from './costing';
import { componentWeight, gramsInMilligrams } from './productTypes';

export interface ProductEditorValues {
  name: string; description: string; price: string; cost: string; image: string;
  packageId: number | null; draft: CostingDraft; recipeIds: number[]; conversionChoice?: boolean;
}
// Only authored values belong to a draft. Preview results and server versions can arrive independently.
export const productEditorSnapshot = (value: ProductEditorValues): string => JSON.stringify({
  name: value.name, description: value.description, price: value.price, image: value.image,
  packageId: value.packageId, cost: value.cost,
  product_type: value.draft.product_type, cost_mode: value.draft.cost_mode, recipe: value.draft.cost_recipe_id,
  basis: value.draft.composition_basis, reviewed: value.draft.reviewed, converting: Boolean(value.draft.converting),
  conversionChoice: Boolean(value.conversionChoice), recipeIds: value.recipeIds,
  components: value.draft.components.map(row => [row.recipe_id, row.quantity_g]),
  products: (value.draft.assortment_components || []).map(row => [row.component_product_id, row.quantity_g]),
});
export const productEditorIsDirty = (baseline: string | null, values: ProductEditorValues): boolean => baseline != null && baseline !== productEditorSnapshot(values);
export interface ProductEditorIssue { key: string; values?: Record<string, number>; }
export type ProductEditorErrors = Record<string, ProductEditorIssue>;
export const productEditorErrors = (values: ProductEditorValues, modern: boolean, costingValid: boolean, netWeight?: number | null): ProductEditorErrors => {
  const errors: ProductEditorErrors = {};
  if (!values.name.trim()) errors.name = { key: 'productNameRequired' };
  if (!values.description.trim()) errors.description = { key: 'productDescriptionRequired' };
  if (decimalInput(values.price) == null || !(Number(decimalInput(values.price)) > 0)) errors.price = { key: 'validPriceRequired' };
  if (values.image.trim()) { try { new URL(values.image); } catch { errors.image = { key: 'invalidImageUrl' }; } }
  const draft = values.draft;
  if (modern && draft.product_type === 'standard' && draft.cost_mode !== 'manual' && !draft.cost_recipe_id) errors.costRecipe = { key: 'productRecipeRequired' };
  if (modern && draft.product_type === 'assortment') {
    const rows = draft.composition_basis === 'legacy_recipes' ? draft.components.map(row => ({ id: row.recipe_id, grams: row.quantity_g })) : (draft.assortment_components || []).map(row => ({ id: row.component_product_id, grams: row.quantity_g }));
    if (rows.length < 2) errors['assortment-composition'] = { key: 'productCompositionMinimum' };
    rows.forEach((row, index) => {
      if (draft.composition_basis === 'legacy_recipes') {
        if (!row.id || rows.some((other, otherIndex) => otherIndex !== index && row.id === other.id)) errors['assortment-composition'] = { key: 'productComponentRequired' };
        if ((gramsInMilligrams(row.grams) ?? 0) <= 0) errors['assortment-composition'] = { key: 'productComponentWeightRequired' };
        return;
      }
      if (!row.id || rows.some((other, otherIndex) => otherIndex !== index && row.id === other.id)) errors[`component-product-${index}`] = { key: 'productComponentRequired' };
      if ((gramsInMilligrams(row.grams) ?? 0) <= 0) errors[`component-grams-${index}`] = { key: 'productComponentWeightRequired' };
    });
    const total = componentWeight(draft);
    if (total != null && netWeight != null) {
      const difference = Math.round(netWeight * 1000) - Math.round(total * 1000);
      if (difference !== 0) errors['assortment-composition'] = { key: difference > 0 ? 'productWeightMissing' : 'productWeightExcess', values: { weight: Math.abs(difference) / 1000 } };
    }
    if (draft.converting && !costingValid && !Object.keys(errors).some(key => key.startsWith('component-') || key === 'assortment-composition')) errors['accept-conversion'] = { key: 'productConversionRequired' };
  }
  if (!values.packageId) errors.packageId = { key: 'packageRequired' };
  if (draft.cost_mode === 'manual' && decimalInput(values.cost) == null) errors.cost = { key: 'costingNonNegativeManual' };
  if (!costingValid && !Object.keys(errors).some(key => key === 'costRecipe' || key === 'assortment-composition' || key.startsWith('component-') || key === 'accept-conversion')) errors['product-configuration'] = { key: 'costingReviewWeights' };
  return errors;
};

export const focusFirstProductError = (root: HTMLElement | null): void => {
  requestAnimationFrame(() => {
    const control = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!control) return;
    let parent = control.parentElement;
    while (parent && parent !== root) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
    control.focus({ preventScroll: true });
    control.scrollIntoView({ block: 'center', behavior: 'auto' });
  });
};
