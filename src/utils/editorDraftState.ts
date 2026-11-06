import type { OrderItem } from '../types/api';

export interface OrderEditorValues {
  clientId: number | null;
  status: string;
  comment: string;
  items: OrderItem[];
}

// Preserve invalid numeric input while excluding server identities, snapshots and previews.
const authoredNumber = (value: number): number | string => Number.isFinite(value) ? value : String(value);
export const orderEditorSnapshot = (values: OrderEditorValues): string => JSON.stringify({
  clientId: values.clientId,
  status: values.status,
  comment: values.comment,
  items: values.items.map(item => ({
    numbers: [item.product_id, item.quantity, item.price, item.cost_price].map(authoredNumber),
    costSource: item.cost_source || '',
  })),
});
export const orderEditorIsDirty = (baseline: string | null, values: OrderEditorValues): boolean => (
  baseline != null && baseline !== orderEditorSnapshot(values)
);

export interface RecipeIngredientEntry { ingredientId: string; quantity: string; unit: string; }
export const recipeEditorHasPendingIngredient = (entry: RecipeIngredientEntry): boolean => (
  Boolean(entry.ingredientId || entry.quantity.trim() || entry.unit)
);

export interface RecipeEditorValues {
  mode: 'create' | 'edit';
  name: string;
  plannedYield: string;
  ingredients: { id: number; quantity: string; unit: { value: string } }[];
  entry: RecipeIngredientEntry;
}
export interface RecipeEditorSnapshot {
  name: string;
  plannedYield: string;
  ingredients: [number, string, string][];
  entry: RecipeIngredientEntry;
}

export const recipeEditorSnapshot = (values: RecipeEditorValues): RecipeEditorSnapshot => ({
  name: values.mode === 'create' ? values.name : '',
  plannedYield: values.plannedYield,
  // Edit-mode ingredient operations persist immediately; they are never discarded on close.
  ingredients: values.mode === 'create' ? values.ingredients.map(row => [row.id, row.quantity, row.unit.value]) : [],
  entry: { ...values.entry },
});
export const recipeEditorIsDirty = (baseline: RecipeEditorSnapshot | null, values: RecipeEditorValues): boolean => (
  baseline != null && JSON.stringify(baseline) !== JSON.stringify(recipeEditorSnapshot(values))
);

// A partial save acknowledges only the fields it wrote, preserving other pending edits.
export const acknowledgeRecipeEditorSave = (
  baseline: RecipeEditorSnapshot | null,
  saved: Partial<Pick<RecipeEditorSnapshot, 'plannedYield' | 'entry'>>,
): RecipeEditorSnapshot | null => baseline == null ? null : { ...baseline, ...saved };


export interface EditorOperationScope { key: string; epoch: number; }
// Identity changes even when a workspace or editor is revisited (A -> B -> A).
export const advanceEditorOperationScope = (current: EditorOperationScope | null, key: string): EditorOperationScope => (
  current?.key === key ? current : { key, epoch: (current?.epoch ?? 0) + 1 }
);

// Once a write succeeds, a failed read must never turn the action into a repeatable write.
export const commitEditorWrite = async <T>({ write, acknowledge, refresh, requireRefresh, isCurrent }: {
  write: () => Promise<T>;
  acknowledge: (result: T) => void;
  refresh: () => Promise<unknown>;
  requireRefresh: () => void;
  isCurrent: () => boolean;
}): Promise<void> => {
  const result = await write();
  if (!isCurrent()) return;
  acknowledge(result);
  try { await refresh(); }
  catch (error) { if (isCurrent()) requireRefresh(); }
};

export interface RecipeCreationRequest {
  headers: Record<string, string>;
  body: string;
  ingredientBodies: readonly string[];
}

// Finish a submitted composition in its original workspace, independently of the visible editor.
export const createRecipeWithIngredients = async (
  request: RecipeCreationRequest,
  send: (endpoint: string, options: { method: 'POST' | 'DELETE'; headers: Readonly<Record<string, string>>; body?: string }) => Promise<any>,
): Promise<any> => {
  const headers = Object.freeze({ ...request.headers });
  const body = request.body;
  const ingredientBodies = [...request.ingredientBodies];
  const created = await send('/api/recipes', { method: 'POST', headers, body });
  if (!created?.id) throw new Error('Failed to create recipe');
  const recipeId = created.id;
  try {
    for (const ingredientBody of ingredientBodies) {
      const added = await send(`/api/recipes/${recipeId}/ingredients`, { method: 'POST', headers, body: ingredientBody });
      if (!added) throw new Error('Failed to add ingredient');
    }
  } catch (error) {
    await send(`/api/recipes/${recipeId}`, { method: 'DELETE', headers }).catch(() => undefined);
    throw new Error('Failed to add ingredient', { cause: error });
  }
  return created;
};
