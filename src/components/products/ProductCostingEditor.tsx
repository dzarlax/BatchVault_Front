import React, { useEffect, useRef, useState } from 'react';
import { Alert, Form } from 'react-bootstrap';
import useTranslation from 'next-translate/useTranslation';
import type { CostEstimate, Product, ProductPackage, Recipe } from '../../types/api';
import type { CostingDraft } from '../../utils/costing';
import { conversionContextKey, productConfigurationPayload } from '../../utils/productTypes';
import fetcher from '../../utils/fetcher';
import SelectDropdown from '../SelectDropdown';
import CostBreakdown from './CostBreakdown';
import AssortmentCompositionEditor from './AssortmentCompositionEditor';

export default function ProductCostingEditor({ draft, onChange, recipes, products, productId, selectedPackage, packageId, workspaceId, currency, show, packageControls, cost, setCost, originalCost }: {
  draft: CostingDraft; onChange: (draft: CostingDraft) => void; recipes: Recipe[]; products: Product[]; productId?: number;
  selectedPackage?: ProductPackage; packageId: number | null; workspaceId: string | null; currency: string; show: boolean;
  packageControls: React.ReactNode; cost: string; setCost: (value: string) => void; originalCost?: number | null;
}) {
  const { t } = useTranslation('common');
  const [result, setResult] = useState<{ context: string; estimate: CostEstimate } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const payload = JSON.stringify({ ...productConfigurationPayload(draft), package_id: packageId });
  const packageWeight = selectedPackage?.net_weight_g;
  const packageCost = selectedPackage?.unit_cost;
  const contextKey = conversionContextKey(draft, packageId, selectedPackage, cost, products, recipes, workspaceId);
  const currentPreview = useRef({ context: contextKey, generation: 0, draft, onChange });
  if (currentPreview.current.context !== contextKey) currentPreview.current.generation++;
  currentPreview.current.context = contextKey; currentPreview.current.draft = draft; currentPreview.current.onChange = onChange;
  const estimate = result?.context === contextKey ? result.estimate : null;
  const estimateKey = estimate ? JSON.stringify(estimate) : undefined;
  const accepted = Boolean(draft.conversionAccepted && draft.conversionAcceptedContext === contextKey && (draft.cost_mode === 'manual' || (estimate?.status === 'complete' && draft.conversionAcceptedEstimate === estimateKey)));
  useEffect(() => {
    setResult(null); setFailed(false); setLoading(false);
    if (draft.converting && draft.cost_mode !== 'manual') onChange({ ...draft, conversionAccepted: false, conversionPreview: undefined });
    if (!show || draft.cost_mode === 'manual' || !workspaceId || !packageId) return;
    let active = true;
    const generation = currentPreview.current.generation;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await fetcher('/api/products/cost-preview', { method: 'POST', headers: { 'X-Workspace-ID': workspaceId }, body: payload, signal: controller.signal });
        if (active && currentPreview.current.context === contextKey && currentPreview.current.generation === generation) {
          setResult({ context: contextKey, estimate: result });
          if (currentPreview.current.draft.converting) currentPreview.current.onChange({ ...currentPreview.current.draft, conversionAccepted: false, conversionPreview: { context: contextKey, estimate: JSON.stringify(result), complete: result.status === 'complete' && result.total_cost != null } });
        }
      } catch { if (active && !controller.signal.aborted) setFailed(true); }
      finally { if (active) setLoading(false); }
    }, 350);
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [payload, workspaceId, packageId, draft.cost_mode, show, packageWeight, packageCost, contextKey]);
  const recipeOptions = recipes.map(recipe => ({ value: recipe.id, label: recipe.name }));
  const selectedRecipe = recipes.find(recipe => recipe.id === draft.cost_recipe_id);
  return <>
    {draft.product_type === 'assortment' ? <AssortmentCompositionEditor draft={draft} onChange={onChange} products={products} recipes={recipes} productId={productId} estimate={estimate} currency={currency} packageWeight={packageWeight} />
      : <section className="product-configuration-section"><h5>{t('recipe')}</h5>
        <SelectDropdown inputId="costRecipe" label={t('productPrimaryRecipe')} options={recipeOptions}
          value={recipeOptions.find(option => option.value === draft.cost_recipe_id) ?? null}
          onChange={option => onChange({ ...draft, cost_recipe_id: option?.value ?? null })} isSearchable isClearable
          loadingMessage={t('costingSelectLoading')} noOptionsMessage={t('costingSelectEmpty')} placeholder={t('costingChooseRecipe')} />
        <p className="small text-secondary mt-2">{selectedRecipe?.planned_yield_g != null ? `${t('costingPlannedYield')}: ${selectedRecipe.planned_yield_g} ${t('productGramsUnit')}` : t('productRecipeHelp')}</p>
      </section>}
    <section className="product-configuration-section"><h5>{draft.product_type === 'assortment' ? t('productCommonPackage') : t('package')}</h5>{packageControls}
      <p className="small text-secondary mb-0">{draft.product_type === 'assortment' ? t('productCommonPackageHelp') : t('costingPackageHelp')}
        {packageCost != null && <> · {t('costingOnePackage')}: {packageCost.toFixed(2)} {currency}</>}</p>
    </section>
    <section className="product-configuration-section" aria-label={t('costingTitle')}><h5>{t('costingTitle')}</h5>
      <div className="product-choice-group mb-3" role="group" aria-label={t('productCostMethod')}>
        {['automatic', 'manual'].map(method => <Form.Check key={method} type="radio" name="costMethod" id={`cost-method-${method}`} label={t(method === 'manual' ? 'productCostManual' : 'productCostAutomatic')}
          checked={(draft.cost_mode === 'manual') === (method === 'manual')} onChange={() => onChange({ ...draft, cost_mode: method === 'manual' ? 'manual' : draft.product_type === 'assortment' ? 'assortment' : 'recipe', conversionAccepted: false })} />)}
      </div>
      {draft.cost_mode === 'manual' ? <Form.Group controlId="cost"><Form.Label>{t('productFullUnitCost')}</Form.Label>
        <div className="input-group"><span className="input-group-text">{currency}</span><Form.Control inputMode="decimal" value={cost} onChange={event => setCost(event.target.value)} /></div>
        <Form.Text>{t('productManualIncludesPackage')}</Form.Text>
      </Form.Group> : <>
        {loading && <p role="status">{t('costingCalculating')}</p>}
        {failed && <Alert variant="warning">{t('costingPreviewFailed')}</Alert>}
        {estimate && <><CostBreakdown estimate={estimate} currency={currency} />{estimate.status === 'incomplete' && <p className="small text-warning">{t('productIncompleteSaveHelp')}</p>}</>}
      </>}
      {draft.converting && <p className="small text-secondary mt-3">{t('productConversionOldCost')}: {originalCost != null ? `${originalCost.toFixed(2)} ${currency}` : t('costingUnavailable')} · {t('productConversionNewCost')}: {draft.cost_mode === 'manual' ? `${cost || '—'} ${currency}` : estimate?.total_cost != null ? `${estimate.total_cost.toFixed(2)} ${currency}` : t('costingUnavailable')}</p>}
      {draft.converting && <Form.Check className="mt-3" id="accept-conversion" checked={accepted} disabled={draft.cost_mode !== 'manual' && (!estimate || estimate.status !== 'complete' || loading)}
        onChange={event => onChange({ ...draft, conversionAccepted: event.target.checked, conversionAcceptedContext: contextKey, conversionAcceptedEstimate: estimateKey })} label={t('productAcceptConversion')} />}
    </section>
  </>;
}
