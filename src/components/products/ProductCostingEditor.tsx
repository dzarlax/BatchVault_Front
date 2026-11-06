import React, { useEffect, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { CostEstimate, CostMode, ProductPackage, Recipe } from '../../types/api';
import { CostingDraft, costingPayload, decimalInput } from '../../utils/costing';
import fetcher from '../../utils/fetcher';
import CostBreakdown from './CostBreakdown';

export default function ProductCostingEditor({ draft, onChange, recipes, selectedPackage, packageId, workspaceId, linkedRecipes, currency, show }: {
  draft: CostingDraft; onChange: (draft: CostingDraft) => void; recipes: Recipe[]; selectedPackage?: ProductPackage;
  packageId: number | null; workspaceId: string | null; linkedRecipes: number[]; currency: string; show: boolean;
}) {
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const payload = JSON.stringify({ ...costingPayload(draft), package_id: packageId });
  useEffect(() => {
    setEstimate(null); setError(''); setLoading(false);
    if (!show || draft.cost_mode === 'manual' || !packageId || !workspaceId) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await fetcher('/api/products/cost-preview', { method: 'POST', headers: { 'X-Workspace-ID': workspaceId }, body: payload, signal: controller.signal });
        if (active) setEstimate(result);
      } catch (err) {
        if (active && !controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to preview cost');
      } finally { if (active) setLoading(false); }
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [payload, workspaceId, packageId, draft.cost_mode, show]);
  const update = (patch: Partial<CostingDraft>) => onChange({ ...draft, ...patch, reviewed: false });
  const sum = draft.components.reduce((total, row) => total + (decimalInput(row.quantity_g) ?? 0), 0);
  const target = selectedPackage?.net_weight_g;
  return <section className="form-section p-3 rounded mt-3" aria-label="Cost calculation">
    <h5>Cost calculation</h5>
    <Form.Group controlId="costMode" className="mb-3">
      <Form.Label>Cost source</Form.Label>
      <Form.Select value={draft.cost_mode} onChange={e => update({ cost_mode: e.target.value as CostMode, cost_recipe_id: null, components: [] })}>
        <option value="manual">Manual total</option><option value="recipe">From one recipe</option><option value="assortment">Fixed assortment</option>
      </Form.Select>
    </Form.Group>
    {draft.cost_mode === 'manual' ? <p className="small text-secondary mb-0">Enter the complete sale-unit cost above. Packaging is not added again.</p> : <>
      {draft.cost_mode === 'recipe' ? <Form.Group controlId="costRecipe" className="mb-3">
        <Form.Label>Recipe used for costing</Form.Label>
        <Form.Select value={draft.cost_recipe_id ?? ''} onChange={e => update({ cost_recipe_id: Number(e.target.value) || null })}>
          <option value="">Choose one recipe</option>{recipes.map(recipe => <option value={recipe.id} key={recipe.id}>{recipe.name}</option>)}
        </Form.Select>
        {linkedRecipes.length === 1 && <Button size="sm" variant="outline-secondary" className="mt-2" onClick={() => update({ cost_recipe_id: linkedRecipes[0] })}>Use the linked recipe</Button>}
      </Form.Group> : <>
        {linkedRecipes.length > 1 && <Button size="sm" variant="outline-secondary" className="mb-2" onClick={() => update({ components: [...new Set(linkedRecipes)].map(recipe_id => ({ recipe_id, quantity_g: '' })) })}>Use linked flavours (enter grams explicitly)</Button>}
        {draft.components.map((row, index) => <div className="d-flex flex-wrap gap-2 mb-2 align-items-end" key={index}>
          <Form.Group style={{ flex: '1 1 180px' }} controlId={`component-recipe-${index}`}><Form.Label>Flavour {index + 1}</Form.Label>
            <Form.Select value={row.recipe_id || ''} onChange={e => update({ components: draft.components.map((item, i) => i === index ? { ...item, recipe_id: Number(e.target.value) } : item) })}>
              <option value="">Choose recipe</option>{recipes.map(recipe => <option value={recipe.id} key={recipe.id}>{recipe.name}</option>)}
            </Form.Select></Form.Group>
          <Form.Group style={{ flex: '0 1 110px' }} controlId={`component-grams-${index}`}><Form.Label>Grams</Form.Label><Form.Control inputMode="decimal" value={row.quantity_g} onChange={e => update({ components: draft.components.map((item, i) => i === index ? { ...item, quantity_g: e.target.value } : item) })} /></Form.Group>
          <Button variant="outline-danger" aria-label={`Remove flavour ${index + 1}`} onClick={() => update({ components: draft.components.filter((_, i) => i !== index) })}>Remove</Button>
        </div>)}
        <Button size="sm" variant="outline-primary" onClick={() => update({ components: [...draft.components, { recipe_id: 0, quantity_g: '' }] })}>Add flavour</Button>
        <p className="mt-2 mb-2">Contents: <strong>{Number(sum.toFixed(3))} g</strong> / package: <strong>{target ?? 'unknown'} g</strong>{target != null ? ` · Remaining: ${Number((target - sum).toFixed(3))} g` : ''}</p>
      </>}
      <Form.Check className="my-3" id="contentOnlyReview" type="checkbox" checked={draft.reviewed} onChange={e => onChange({ ...draft, reviewed: e.target.checked })} label="I reviewed these recipes: they contain product ingredients only, without packaging." />
      <p className="small text-secondary">The selected packaging format sets the net weight. Its cost is added once. Incomplete inputs can be saved for setup, but cannot supply a new order cost.</p>
      {loading && <p role="status">Calculating…</p>}
      {error && <Alert variant="warning">{error}</Alert>}
      {estimate && <CostBreakdown estimate={estimate} currency={currency} />}
    </>}
  </section>;
}
