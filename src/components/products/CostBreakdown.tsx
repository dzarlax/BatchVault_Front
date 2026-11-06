import React from 'react';
import useTranslation from 'next-translate/useTranslation';
import { CostEstimate } from '../../types/api';
import { costIssueMessage, costSourceLabel } from '../../utils/costing';

export default function CostBreakdown({ estimate, currency, compact = false }: { estimate?: CostEstimate | null; currency: string; compact?: boolean }) {
  const { t } = useTranslation('common');
  if (!estimate) return <p className="text-secondary">{t('costingInformationUnavailable')}</p>;
  const money = (amount: number | null) => amount == null ? t('costingUnavailable') : `${amount.toFixed(2)} ${currency}`;
  const complete = estimate.status === 'complete' && estimate.total_cost !== null;
  return <div className="mt-3" aria-live="polite">
    <span className={`badge ${complete ? 'bg-secondary' : 'bg-warning text-dark'}`}>{costSourceLabel(estimate.source, t)}{complete ? '' : ` · ${t('costingIncomplete')}`}</span>
    {!complete && <ul className="mt-2 mb-2">{estimate.issues.map((issue, index) => <li key={`${issue.code}-${issue.recipe_id}-${issue.ingredient_id}-${index}`}>{costIssueMessage(issue, t)}</li>)}</ul>}
    <details open={!compact} className="mt-2">
      <summary>{t('costingViewCalculation')}</summary>
      {estimate.source !== 'manual' && <>
        <div className="table-responsive"><table className="table table-sm mt-2">
          <thead><tr><th scope="col">{t('costingRecipeFlavour')}</th><th scope="col">{t('costingGrams')}</th><th scope="col">{t('costingContentCost')}</th></tr></thead>
          <tbody>{estimate.components.map((row, index) => <tr key={`${row.recipe_id}-${index}`}>
            <td>{row.name || t('costingRecipeReference', { id: row.recipe_id })}<div className="small text-secondary">{t('costingKnownSubtotal')}: {money(row.recipe_cost)} · {t('costingPlannedYield')}: {t('costingGramsValue', { weight: row.planned_yield_g ?? t('costingUnknown') })}{row.cost_per_gram != null && <> · {t('costingFinishedContent')}: {money(row.cost_per_gram * 1000)} / kg</>}</div></td>
            <td>{row.quantity_g}</td><td>{money(row.content_cost)}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="mb-1">{t('costingContents')}: {money(estimate.content_cost)}</p>
        <p className="mb-1">{t('costingOnePackage')}{estimate.net_weight_g != null ? ` · ${t('costingNetGrams', { weight: estimate.net_weight_g })}` : ''}: {money(estimate.packaging_cost)}</p>
      </>}
      <p className="mb-1"><strong>{estimate.source === 'manual' ? t('costingManualCost') : t('costingEstimatedCost')}: {money(complete ? estimate.total_cost : null)}</strong></p>
      {estimate.source !== 'manual' && <p className="small text-secondary mb-0">{t('costingExclusions')}</p>}
    </details>
  </div>;
}
