import React from 'react';
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

  const recipeNames = (product.options || [])
    .map(option => {
      const embeddedRecipeName = option.recipe?.name?.trim();
      if (embeddedRecipeName) return embeddedRecipeName;

      const recipe = recipes?.find(r => Number(r.id) === Number(option.recipe_id));
      return recipe?.name?.trim();
    })
    .filter((name): name is string => Boolean(name));
  const visibleRecipeNames = recipeNames.slice(0, 2).join(', ');
  const hiddenRecipeCount = Math.max(recipeNames.length - 2, 0);

  const profit = product.price - product.cost;
  const profitMargin = product.price > 0 ? ((profit / product.price) * 100).toFixed(1) : '0';
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

        <div className="product-card-recipes">
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

        <div className="product-card-metrics">
          <div className="product-metric">
            <span className="product-metric-label">{t('price')}:</span>
            <span className="product-metric-value price">{formatMoney(product.price)}</span>
          </div>

          <div className="product-metric">
            <span className="product-metric-label">{t('cost')}:</span>
            <span className="product-metric-value cost">{formatMoney(product.cost)}</span>
          </div>

          <div className="product-metric">
            <span className="product-metric-label">{t('profit')}:</span>
            <span className={`product-metric-value ${profit >= 0 ? 'price' : 'cost'}`}>
              {formatMoney(profit)}
            </span>
          </div>

          <div className="product-metric">
            <span className="product-metric-label">{t('margin')}:</span>
            <span className={`product-metric-value ${profit >= 0 ? 'price' : 'cost'}`}>
              {profitMargin}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductCard);
