import React, { useMemo } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import useTranslation from 'next-translate/useTranslation';
import { FaTrash } from 'react-icons/fa';
import type { CostEstimate, Product, Recipe } from '../../types/api';
import type { CostingDraft } from '../../utils/costing';
import { componentWeight, currentProductType } from '../../utils/productTypes';
import SelectDropdown from '../SelectDropdown';

export default function AssortmentCompositionEditor({ draft, onChange, products, recipes, productId, estimate, currency, packageWeight }: {
  draft: CostingDraft; onChange: (value: CostingDraft) => void; products: Product[]; recipes: Recipe[];
  productId?: number; estimate: CostEstimate | null; currency: string; packageWeight?: number | null;
}) {
  const { t } = useTranslation('common');
  const options = useMemo(() => products.filter(product => product.id !== productId && currentProductType(product) === 'standard').map(product => ({ value: product.id, label: product.name })), [products, productId]);
  const rows = draft.assortment_components || [];
  const update = (next: typeof rows) => onChange({ ...draft, assortment_components: next, conversionAccepted: false });
  const total = componentWeight(draft);
  return <section className="product-configuration-section" aria-label={t('productComposition')}>
    <h5>{t('productComposition')}</h5><p className="small text-secondary">{t('productCompositionHelp')}</p>
    {draft.composition_basis === 'legacy_recipes' ? <>
      <Alert variant="info">{t('productLegacyComposition')}</Alert>
      <ul>{draft.components.map(row => <li key={row.recipe_id}>{recipes.find(recipe => recipe.id === row.recipe_id)?.name || t('costingRecipeReference', { id: row.recipe_id })} · {row.quantity_g} {t('productGramsUnit')}</li>)}</ul>
      <Button variant="outline-primary" size="sm" onClick={() => onChange({ ...draft, composition_basis: 'products', converting: true, conversionAccepted: false,
        assortment_components: draft.components.map((row, position) => ({ component_product_id: 0, quantity_g: row.quantity_g, position })) })}>{t('productConvertComposition')}</Button>
    </> : <>
      {draft.converting && <Alert variant="info">{t('productConversionHelp')}</Alert>}
      {rows.map((row, index) => {
        const excluded = new Set(rows.filter((_, i) => i !== index).map(item => item.component_product_id));
        const selected = options.find(option => option.value === row.component_product_id);
        const detail = estimate?.composition_details?.find(item => item.component_product_id === row.component_product_id);
        return <div className="assortment-component-row" key={index}>
          <div className="assortment-component-product"><SelectDropdown inputId={`component-product-${index}`} label={t('productComponentNumber', { number: index + 1 })}
            options={options.filter(option => !excluded.has(option.value))} value={selected || (row.component_product_id ? { value: row.component_product_id, label: t('costingUnavailableProduct', { id: row.component_product_id }) } : null)}
            onChange={option => update(rows.map((item, i) => i === index ? { ...item, component_product_id: option?.value ?? 0 } : item))}
            placeholder={t('chooseProduct')} isClearable isSearchable loadingMessage={t('costingSelectLoading')} noOptionsMessage={t('costingSelectEmpty')} /></div>
          <Form.Group controlId={`component-grams-${index}`} className="assortment-component-weight"><Form.Label>{t('costingGrams')}</Form.Label>
            <Form.Control inputMode="decimal" value={row.quantity_g} onChange={event => update(rows.map((item, i) => i === index ? { ...item, quantity_g: event.target.value } : item))} />
          </Form.Group>
          {draft.cost_mode !== 'manual' && <output className="assortment-component-cost" aria-label={t('productComponentCost', { number: index + 1 })}>{detail?.content_cost != null ? `${detail.content_cost.toFixed(2)} ${currency}` : t('costingUnavailable')}</output>}
          <Button variant="outline-danger" aria-label={t('productRemoveComponent', { number: index + 1 })} onClick={() => update(rows.filter((_, i) => i !== index))}><FaTrash /></Button>
        </div>;
      })}
      <Button variant="outline-primary" size="sm" onClick={() => update([...rows, { component_product_id: 0, quantity_g: '', position: rows.length }])}>{t('productAddComponent')}</Button>
    </>}
    <p className={`mt-3 mb-0 ${total != null && packageWeight != null && total === packageWeight ? 'text-success' : 'text-secondary'}`} role="status">
      {t('productWeightCheck', { total: total ?? '—', target: packageWeight ?? '—' })}
      {total != null && packageWeight != null && total !== packageWeight && <> · {t('productWeightRemaining', { weight: Number((packageWeight - total).toFixed(3)) })}</>}
    </p>
    {packageWeight == null && <p className="small text-warning">{t('productUnknownWeightHelp')}</p>}
  </section>;
}
