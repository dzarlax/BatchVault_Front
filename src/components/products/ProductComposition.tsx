import React from 'react';
import useTranslation from 'next-translate/useTranslation';
import type { CostSnapshot, Product } from '../../types/api';
import type { ProductPackage } from '../../types/api';
import { currentProductType } from '../../utils/productTypes';

export default function ProductComposition({ product, snapshot, historical = false, compact = false, detailsOnly = false, packages = [] }: { product?: Product; snapshot?: CostSnapshot | null; historical?: boolean; compact?: boolean; detailsOnly?: boolean; packages?: ProductPackage[] }) {
  const { t } = useTranslation('common');
  const provenance = snapshot?.provenance;
  const type = historical ? provenance?.product_type : product && currentProductType(product);
  const details = historical ? provenance?.components : product?.cost_estimate?.composition_details;
  const basis = historical ? provenance?.composition_basis : product?.composition_basis;
  const packaging = historical ? provenance?.package : product?.package || packages?.find(item => item?.id === product?.package_id);
  if (compact) return <div className="product-composition-summary small text-secondary mt-1">
    <span className="badge bg-secondary">{type === 'assortment' ? t('productTypeAssortment') : type === 'standard' ? t('productTypeStandard') : t('productTypeUnavailable')}</span>
    {packaging && <span className="product-composition-package product-package-chip">{packaging.name}{packaging.net_weight_g != null ? ` · ${packaging.net_weight_g} ${t('productGramsUnit')}` : ''}</span>}
  </div>;
  return <div className="small text-secondary mt-2">
    {!detailsOnly && <span className="badge bg-secondary">{type === 'assortment' ? t('productTypeAssortment') : type === 'standard' ? t('productTypeStandard') : t('productTypeUnavailable')}</span>}
    {historical && <p className="mb-1">{t('productAtOrderTime')}</p>}
    {historical && !provenance ? <p className="mb-1">{t('productHistoricalCompositionMissing')}</p> : <>
      {type === 'assortment' && <>
        {basis === 'legacy_recipes' && <p className="mb-1">{t('productLegacyComposition')}</p>}
        {details?.length ? <ul className="mb-1 ps-3">{details.map((row, index) => <li key={`${row.component_product_id}-${row.recipe_id}-${index}`}>{row.product_name || row.recipe_name} · {row.quantity_g} {t('productGramsUnit')}</li>)}</ul> : <p className="mb-1">{t('productCompositionUnavailable')}</p>}
      </>}
      {!detailsOnly && packaging && <p className="mb-0">{type === 'assortment' ? t('productCommonPackage') : t('package')}: {packaging.name}{packaging.net_weight_g != null ? ` · ${packaging.net_weight_g} ${t('productGramsUnit')}` : ''}</p>}
    </>}
  </div>;
}
