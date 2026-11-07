import React from 'react';
import ProductComposition from './products/ProductComposition';
import CostBreakdown from './products/CostBreakdown';
import { effectiveProductCost } from '../utils/costing';
import useTranslation from 'next-translate/useTranslation';
import { FaEdit } from 'react-icons/fa';
import { Product, ProductPackage, Recipe } from '../types/api';
import { useWorkspace } from '../utils/workspaceContext';

interface ProductCardProps {
  product: Product;
  recipes: Recipe[];
  packages: ProductPackage[];
  onEdit: (product: Product) => void;
  editDisabled?: boolean;
  stock?: { total: number; reserved: number; available: number };
}

const ProductCard: React.FC<ProductCardProps> = ({ product, recipes, packages, onEdit, editDisabled = false, stock }) => {
  const { t } = useTranslation('common');
  const { selectedCurrency } = useWorkspace();
  const currentCost = effectiveProductCost(product);
  const profit = currentCost == null ? null : product.price - currentCost;
  const profitMargin = profit != null && product.price > 0 ? ((profit / product.price) * 100).toFixed(1) : null;
  const currency = selectedCurrency || '';
  const formatMoney = (value: number) => `${value.toFixed(2)} ${currency}`;

  return <div className="product-card">
    <div className="product-card-content">
      <div className="product-card-header">
        <div className="product-card-heading">
          <h3 className="product-card-title">{product.name}</h3>
            <ProductComposition product={product} compact packages={packages} />
        </div>
        <button className="btn btn-ghost btn-sm product-card-edit" disabled={editDisabled} onClick={() => onEdit(product)} title={t('edit')} aria-label={`${t('edit')} ${product.name}`}>
          <FaEdit size={14} />
        </button>
      </div>

      <div className="product-card-primary-price">
        <span className="product-metric-label">{t('price')}</span>
        <span className="product-metric-value price">{formatMoney(product.price)}</span>
      </div>
      <div className="product-card-primary-metrics">
        <span>{t('margin')}: {profitMargin == null ? t('costingUnavailable') : `${profitMargin}%`}</span>
      </div>

      {stock && <div className="product-card-primary-metrics" aria-label={t('cookingStock')}>
        <span>{t('cookingStockTotal')}: <strong>{stock.total}</strong></span>
        <span>{t('cookingStockReserved')}: <strong>{stock.reserved}</strong></span>
        <span>{t('cookingStockAvailable')}: <strong>{stock.available}</strong></span>
      </div>}

      <details className="product-card-details">
        <summary>{t('productDetails')}</summary>
        <div className="product-card-description">{product.description || t('noDescription')}</div>
        <ProductComposition product={product} detailsOnly />
        {product.composition_basis !== 'products' && <div className="product-card-recipes">
          <span>{t('costingRecipeFlavour')}: </span>
          <span>{recipesForProduct(product, recipes, t)}</span>
        </div>}
        <div className="product-card-financial-detail">
          <span>{t('cost')}: {currentCost == null ? t('costingUnavailable') : formatMoney(currentCost)}</span>
          <span>{t('profit')}: {profit == null ? t('costingUnavailable') : formatMoney(profit)}</span>
        </div>
      </details>
      <CostBreakdown estimate={product.cost_estimate} currency={currency} presentation="card" />
    </div>
  </div>;
};

function recipesForProduct(product: Product, recipes: Recipe[], t: (key: string, vars?: Record<string, unknown>) => string) {
  const costingRecipeIds = product.cost_mode === 'recipe' && product.cost_recipe_id ? [product.cost_recipe_id]
    : product.cost_mode === 'assortment' ? (product.components || []).map(row => row.recipe_id) : [];
  const names = product.composition_basis === 'products' ? (product.cost_estimate?.composition_details || []).map(row => row.product_name)
    : costingRecipeIds.length > 0 ? costingRecipeIds.map(id => product.cost_estimate?.components.find(row => row.recipe_id === id)?.name || recipes.find(recipe => recipe.id === id)?.name || t('costingRecipeReference', { id }))
      : (product.options || []).map(option => option.recipe?.name?.trim() || recipes.find(recipe => recipe.id === option.recipe_id)?.name).filter((name): name is string => Boolean(name));
  return names.length ? names.join(', ') : t('noRecipes');
}

export default React.memo(ProductCard);
