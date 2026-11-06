import React from 'react';
import useTranslation from 'next-translate/useTranslation';
import { CostEstimate } from '../../types/api';
import { costIssueMessage, costSourceLabel } from '../../utils/costing';

type Presentation = 'default' | 'card' | 'editor';

export default function CostBreakdown({ estimate, currency, compact = false, presentation = 'default' }: { estimate?: CostEstimate | null; currency: string; compact?: boolean; presentation?: Presentation }) {
  const { t } = useTranslation('common');
  if (!estimate) return <p className="text-secondary">{t('costingInformationUnavailable')}</p>;
  const money = (amount: number | null) => amount == null ? t('costingUnavailable') : `${amount.toFixed(2)} ${currency}`;
  const complete = estimate.status === 'complete' && estimate.total_cost !== null;
  const modern = presentation !== 'default';
  const issues = !complete && <ul className="mt-2 mb-2">{estimate.issues.map((issue, index) => <li key={`${issue.code}-${issue.recipe_id}-${issue.ingredient_id}-${index}`}>{costIssueMessage(issue, t)}</li>)}</ul>;
  const rows = estimate.source !== 'manual' && <>
    {estimate.composition_details?.length ? estimate.composition_details.map((row, index) => <div className="product-cost-row" key={`${row.component_product_id}-${index}`}><dt>{row.product_name || row.recipe_name}</dt><dd>{row.quantity_g} {t('productGramsUnit')} · {money(row.content_cost)}</dd></div>) : estimate.components.map((row, index) => <div className="product-cost-row" key={`${row.recipe_id}-${index}`}><dt>{row.name || t('costingRecipeReference', { id: row.recipe_id })}</dt><dd>{row.quantity_g} {t('productGramsUnit')} · {money(row.content_cost)}<span className="small text-secondary"> · {t('costingKnownSubtotal')}: {money(row.recipe_cost)} · {t('costingPlannedYield')}: {t('costingGramsValue', { weight: row.planned_yield_g ?? t('costingUnknown') })}{row.cost_per_gram != null && <> · {t('costingFinishedContent')}: {money(row.cost_per_gram * 1000)} / kg</>}</span></dd></div>)}
  </>;
  const body = <>
    {estimate.source !== 'manual' && <>
      {modern ? <dl className="product-cost-rows">{rows}</dl> : <div className="table-responsive"><table className="table table-sm mt-2">
        <thead><tr><th scope="col">{t('costingRecipeFlavour')}</th><th scope="col">{t('costingGrams')}</th><th scope="col">{t('costingContentCost')}</th></tr></thead>
        <tbody>{estimate.composition_details?.length ? estimate.composition_details.map((row, index) => <tr key={`${row.component_product_id}-${index}`}><td>{row.product_name || row.recipe_name}</td><td>{row.quantity_g}</td><td>{money(row.content_cost)}</td></tr>) : estimate.components.map((row, index) => <tr key={`${row.recipe_id}-${index}`}>
          <td>{row.name || t('costingRecipeReference', { id: row.recipe_id })}<div className="small text-secondary">{t('costingKnownSubtotal')}: {money(row.recipe_cost)} · {t('costingPlannedYield')}: {t('costingGramsValue', { weight: row.planned_yield_g ?? t('costingUnknown') })}{row.cost_per_gram != null && <> · {t('costingFinishedContent')}: {money(row.cost_per_gram * 1000)} / kg</>}</div></td>
          <td>{row.quantity_g}</td><td>{money(row.content_cost)}</td>
        </tr>)}</tbody>
      </table></div>}
      <p className="mb-1">{t('costingContents')}: {money(estimate.content_cost)}</p>
      <p className="mb-1">{t('costingOnePackage')}{estimate.net_weight_g != null ? ` · ${t('costingNetGrams', { weight: estimate.net_weight_g })}` : ''}: {money(estimate.packaging_cost)}</p>
    </>}
    <p className="mb-1"><strong>{estimate.source === 'manual' ? t('costingManualCost') : t('costingEstimatedCost')}: {money(complete ? estimate.total_cost : null)}</strong></p>
    {estimate.source !== 'manual' && <p className="small text-secondary mb-0">{t('costingExclusions')}</p>}
  </>;
  if (!modern) return <div className="mt-3" aria-live="polite">
    <span className={`badge ${complete ? 'bg-secondary' : 'bg-warning text-dark'}`}>{costSourceLabel(estimate.source, t)}{complete ? '' : ` · ${t('costingIncomplete')}`}</span>
    {issues}<details open={!compact} className="mt-2"><summary>{t('costingViewCalculation')}</summary>{body}</details>
  </div>;

  return <div className={`product-cost-summary product-cost-${presentation}`} aria-live="polite">
    <div className="product-cost-status">
      <span>{t('costingSource')}: {costSourceLabel(estimate.source, t)}</span>
      <span className={`badge ${complete ? 'bg-secondary' : 'bg-warning text-dark'}`}>{complete ? t('costingComplete') : t('costingIncomplete')}</span>
    </div>
    {presentation === 'editor' && <>
      {estimate.source !== 'manual' && <>
        <p className="mb-1">{t('costingContents')}: {money(estimate.content_cost)}</p>
        <p className="mb-1">{t('costingOnePackage')}: {money(estimate.packaging_cost)}</p>
      </>}
      <p className="mb-1"><strong>{estimate.source === 'manual' ? t('costingManualCost') : t('costingEstimatedCost')}: {money(complete ? estimate.total_cost : null)}</strong></p>
    </>}
    {issues}
    <details className="mt-2">
      <summary>{t('costingViewCalculation')}</summary>
      {rows && <dl className="product-cost-rows">{rows}</dl>}
      {presentation === 'card' && <>
        {estimate.source !== 'manual' && <>
          <p className="mb-1">{t('costingContents')}: {money(estimate.content_cost)}</p>
          <p className="mb-1">{t('costingOnePackage')}: {money(estimate.packaging_cost)}</p>
        </>}
        <p className="mb-1"><strong>{estimate.source === 'manual' ? t('costingManualCost') : t('costingEstimatedCost')}: {money(complete ? estimate.total_cost : null)}</strong></p>
      </>}
      {estimate.source !== 'manual' && <p className="small text-secondary mb-0">{t('costingExclusions')}</p>}
    </details>
  </div>;
}
