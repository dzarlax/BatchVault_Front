import React from 'react';
import { CostEstimate } from '../../types/api';
import { costSourceLabel } from '../../utils/costing';

export default function CostBreakdown({ estimate, currency, compact = false }: { estimate?: CostEstimate | null; currency: string; compact?: boolean }) {
  if (!estimate) return <p className="text-secondary">Cost source information is unavailable.</p>;
  const money = (amount: number | null) => amount == null ? 'Unavailable' : `${amount.toFixed(2)} ${currency}`;
  const complete = estimate.status === 'complete' && estimate.total_cost !== null;
  return <div className="mt-3" aria-live="polite">
    <span className={`badge ${complete ? 'bg-secondary' : 'bg-warning text-dark'}`}>{costSourceLabel(estimate.source)}{complete ? '' : ' · Incomplete calculation'}</span>
    {!complete && <ul className="mt-2 mb-2">{estimate.issues.map((issue, index) => <li key={`${issue.code}-${issue.recipe_id}-${issue.ingredient_id}-${index}`}>{issue.message}</li>)}</ul>}
    <details open={!compact} className="mt-2">
      <summary>View calculation</summary>
      {estimate.source !== 'manual' && <>
        <div className="table-responsive"><table className="table table-sm mt-2">
          <thead><tr><th scope="col">Recipe / flavour</th><th scope="col">Grams</th><th scope="col">Content cost</th></tr></thead>
          <tbody>{estimate.components.map((row, index) => <tr key={`${row.recipe_id}-${index}`}>
            <td>{row.name || `Recipe #${row.recipe_id}`}<div className="small text-secondary">Known ingredient subtotal: {money(row.recipe_cost)} · Planned yield: {row.planned_yield_g ?? 'unknown'} g{row.cost_per_gram != null && <> · Finished content: {money(row.cost_per_gram * 1000)} / kg</>}</div></td>
            <td>{row.quantity_g}</td><td>{money(row.content_cost)}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="mb-1">Contents: {money(estimate.content_cost)}</p>
        <p className="mb-1">One package{estimate.net_weight_g != null ? ` · ${estimate.net_weight_g} g net` : ''}: {money(estimate.packaging_cost)}</p>
      </>}
      <p className="mb-1"><strong>{estimate.source === 'manual' ? 'Manual cost' : 'Estimated cost'}: {money(complete ? estimate.total_cost : null)}</strong></p>
      {estimate.source !== 'manual' && <p className="small text-secondary mb-0">Ingredients and packaging only. Labour, energy, delivery and other overheads are excluded.</p>}
    </details>
  </div>;
}
