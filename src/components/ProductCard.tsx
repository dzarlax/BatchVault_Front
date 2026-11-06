import React from 'react';
import ProductComposition from './products/ProductComposition';
import CostBreakdown from './products/CostBreakdown';
import { effectiveProductCost } from '../utils/costing';
import useTranslation from 'next-translate/useTranslation';
import { FaEdit, FaBoxOpen, FaUtensils } from 'react-icons/fa';
import { Product, ProductPackage, Recipe } from '../types/api';
import { useWorkspace } from '../utils/workspaceContext';

interface ProductCardProps {
  product: Product;
  recipes: Recipe[];
  packages: ProductPackage[];
  onEdit: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  recipes,
  packages,
  onEdit
}) => {
  const { t } = useTranslation('common');
  const { selectedCurrency } = useWorkspace();

  const packageName = product.package?.name || packages?.find(pkg => pkg.id === product.package_id)?.name || t('unknownPackage');

  const costingRecipeIds = product.cost_mode === 'recipe' && product.cost_recipe_id ? [product.cost_recipe_id]
    : product.cost_mode === 'assortment' ? (product.components || []).map(row => row.recipe_id) : [];
  const recipeNames = product.composition_basis === 'products' ? (product.cost_estimate?.composition_details || []).map(row => row.product_name) : costingRecipeIds.length > 0 ? costingRecipeIds.map(id =>
    product.cost_estimate?.components.find(row => row.recipe_id === id)?.name || recipes.find(recipe => recipe.id === id)?.name || t('costingRecipeReference', { id })
  ) : (product.options || []).map(option => option.recipe?.name?.trim() || recipes.find(recipe => recipe.id === option.recipe_id)?.name).filter((name): name is string => Boolean(name));
  const visibleRecipeNames = recipeNames.slice(0, 2).join(', ');
  const hiddenRecipeCount = Math.max(recipeNames.length - 2, 0);

  const currentCost = effectiveProductCost(product);
  const profit = currentCost == null ? null : product.price - currentCost;
  const profitMargin = profit != null && product.price > 0 ? ((profit / product.price) * 100).toFixed(1) : null;
  const currency = selectedCurrency || '';
  const formatMoney = (value: number) => `${value.toFixed(2)} ${currency}`;

  return (
    <div className="product-card">
      <div className="product-card-content">
        <div className="product-card-header">
          <div className="product-card-heading">
            <h3 className="product-card-title">{product.name}</h3>
            <div className="product-package-chip" title={packageName}>
              <FaBoxOpen size={12} />
              <span>{packageName}</span>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm product-card-edit"
            onClick={() => onEdit(product)}
            title={t("edit")}
            aria-label={`${t("edit")} ${product.name}`}
          >
            <FaEdit size={14} />
          </button>
        </div>

        <p className="product-card-description">
          {product.description || t('noDescription')}
        </p>

        <ProductComposition product={product} />
        <div className="product-card-recipes" hidden={product.composition_basis === 'products'}>
          <FaUtensils size={13} />
          <span>
            {recipeNames.length > 0 ? (
              <>
                {visibleRecipeNames}
                {hiddenRecipeCount > 0 ? ` +${hiddenRecipeCount}` : ''}
              </>
            ) : (
              t('noRecipes')
            )}
          </span>
        </div>

        {product.package?.net_weight_g != null && <p className="small text-secondary">{t('costingNetGrams', { weight: product.package.net_weight_g })}</p>}
        <div className="product-card-metrics">
          <div className="product-metric">
            <span className="product-metric-label">{t('price')}:</span>
            <span className="product-metric-value price">{formatMoney(product.price)}</span>
          </div>

          <div className="product-metric">
            <span className="product-metric-label">{t('cost')}:</span>
            <span className="product-metric-value cost">{currentCost == null ? t('costingUnavailable') : formatMoney(currentCost)}</span>
          </div>

          <div className="product-metric">
            <span className="product-metric-label">{t('profit')}:</span>
            <span className={`product-metric-value ${profit != null && profit >= 0 ? 'price' : 'cost'}`}>
              {profit == null ? t('costingUnavailable') : formatMoney(profit)}
            </span>
          </div>

          <div className="product-metric">
            <span className="product-metric-label">{t('margin')}:</span>
            <span className={`product-metric-value ${profit != null && profit >= 0 ? 'price' : 'cost'}`}>
              {profitMargin == null ? t('costingUnavailable') : `${profitMargin}%`}
            </span>
          </div>
        </div>
        <CostBreakdown estimate={product.cost_estimate} currency={currency} compact />
      </div>
    </div>
  );
};

export default React.memo(ProductCard);
