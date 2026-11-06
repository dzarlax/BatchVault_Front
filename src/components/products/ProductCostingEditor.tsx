import React, { useEffect, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import useTranslation from 'next-translate/useTranslation';
import { CostEstimate, CostMode, ProductPackage, Recipe } from '../../types/api';
import { CostingDraft, costingPayload, decimalInput } from '../../utils/costing';
import fetcher from '../../utils/fetcher';
import SelectDropdown from '../SelectDropdown';
import CostBreakdown from './CostBreakdown';

export default function ProductCostingEditor({ draft, onChange, recipes, selectedPackage, packageId, workspaceId, linkedRecipes, currency, show }: {
  draft: CostingDraft; onChange: (draft: CostingDraft) => void; recipes: Recipe[]; selectedPackage?: ProductPackage;
  packageId: number | null; workspaceId: string | null; linkedRecipes: number[]; currency: string; show: boolean;
}) {
  const { t } = useTranslation('common');
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [hasError, setHasError] = useState(false);
  const [loading, setLoading] = useState(false);
  const payload = JSON.stringify({ ...costingPayload(draft), package_id: packageId });
  const packageWeight = selectedPackage?.net_weight_g;
  const packageCost = selectedPackage?.unit_cost;
  useEffect(() => {
    setEstimate(null); setHasError(false); setLoading(false);
    if (!show || draft.cost_mode === 'manual' || !packageId || !workspaceId) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await fetcher('/api/products/cost-preview', { method: 'POST', headers: { 'X-Workspace-ID': workspaceId }, body: payload, signal: controller.signal });
        if (active) setEstimate(result);
      } catch {
        if (active && !controller.signal.aborted) setHasError(true);
      } finally { if (active) setLoading(false); }
    }, 350);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [payload, workspaceId, packageId, draft.cost_mode, show, packageWeight, packageCost]);
  const update = (patch: Partial<CostingDraft>) => onChange({ ...draft, ...patch, reviewed: false });
  const sum = draft.components.reduce((total, row) => total + (decimalInput(row.quantity_g) ?? 0), 0);
  const modeOptions: { value: CostMode; label: string }[] = [
    { value: 'manual', label: t('costingModeManual') },
    { value: 'recipe', label: t('costingModeRecipe') },
    { value: 'assortment', label: t('costingModeAssortment') },
  ];
  const recipeOptions = recipes.map(recipe => ({ value: recipe.id, label: recipe.name }));
  const dropdownMessages = { loadingMessage: t('costingSelectLoading'), noOptionsMessage: t('costingSelectEmpty') };
  return <section className="form-section p-3 rounded mt-3" aria-label={t('costingTitle')}>
    <h5>{t('costingTitle')}</h5>
    <Form.Group className="mb-3">
      <SelectDropdown inputId="costMode" aria-label={t('costingSource')} label={t('costingSource')} options={modeOptions}
        value={modeOptions.find(option => option.value === draft.cost_mode)} isSearchable={false}
        onChange={option => { if (option) update({ cost_mode: option.value, cost_recipe_id: null, components: [] }); }} {...dropdownMessages} />
    </Form.Group>
    {draft.cost_mode === 'manual' ? <p className="small text-secondary mb-0">{t('costingManualHelp')}</p> : <>
      {draft.cost_mode === 'recipe' ? <Form.Group className="mb-3">
        <SelectDropdown inputId="costRecipe" aria-label={t('costingRecipe')} label={t('costingRecipe')} options={recipeOptions} isSearchable isClearable
          placeholder={t('costingChooseRecipe')} value={recipeOptions.find(option => option.value === draft.cost_recipe_id) ?? null}
          onChange={option => update({ cost_recipe_id: option?.value ?? null })} {...dropdownMessages} />
        {linkedRecipes.length === 1 && <Button size="sm" variant="outline-secondary" className="mt-2" onClick={() => update({ cost_recipe_id: linkedRecipes[0] })}>{t('costingUseLinkedRecipe')}</Button>}
      </Form.Group> : <>
        {linkedRecipes.length > 1 && <Button size="sm" variant="outline-secondary" className="mb-2" onClick={() => update({ components: [...new Set(linkedRecipes)].map(recipe_id => ({ recipe_id, quantity_g: '' })) })}>{t('costingUseLinkedFlavours')}</Button>}
        {draft.components.map((row, index) => <div className="d-flex flex-wrap gap-2 mb-2 align-items-end" key={index}>
          <Form.Group style={{ flex: '1 1 180px' }}>
            <SelectDropdown inputId={`component-recipe-${index}`} aria-label={t('costingFlavour', { number: index + 1 })} label={t('costingFlavour', { number: index + 1 })} options={recipeOptions} isSearchable isClearable
              placeholder={t('costingChooseRecipe')} value={recipeOptions.find(option => option.value === row.recipe_id) ?? null}
              onChange={option => update({ components: draft.components.map((item, i) => i === index ? { ...item, recipe_id: option?.value ?? 0 } : item) })} {...dropdownMessages} />
          </Form.Group>
          <Form.Group style={{ flex: '0 1 110px' }} controlId={`component-grams-${index}`}><Form.Label>{t('costingGrams')}</Form.Label><Form.Control inputMode="decimal" value={row.quantity_g} onChange={e => update({ components: draft.components.map((item, i) => i === index ? { ...item, quantity_g: e.target.value } : item) })} /></Form.Group>
          <Button variant="outline-danger" aria-label={t('costingRemoveFlavour', { number: index + 1 })} onClick={() => update({ components: draft.components.filter((_, i) => i !== index) })}>{t('costingRemove')}</Button>
        </div>)}
        <Button size="sm" variant="outline-primary" onClick={() => update({ components: [...draft.components, { recipe_id: 0, quantity_g: '' }] })}>{t('costingAddFlavour')}</Button>
        <p className="mt-2 mb-2">{t('costingContents')}: <strong>{t('costingGramsValue', { weight: Number(sum.toFixed(3)) })}</strong> / {t('costingPackage')}: <strong>{t('costingGramsValue', { weight: packageWeight ?? t('costingUnknown') })}</strong>{packageWeight != null ? ` · ${t('costingRemainingGrams', { weight: Number((packageWeight - sum).toFixed(3)) })}` : ''}</p>
      </>}
      <Form.Check className="my-3" id="contentOnlyReview" type="checkbox" checked={draft.reviewed} onChange={e => onChange({ ...draft, reviewed: e.target.checked })} label={t('costingReviewRecipes')} />
      <p className="small text-secondary">{t('costingPackageHelp')}</p>
      {loading && <p role="status">{t('costingCalculating')}</p>}
      {hasError && <Alert variant="warning">{t('costingPreviewFailed')}</Alert>}
      {estimate && <CostBreakdown estimate={estimate} currency={currency} />}
    </>}
  </section>;
}
