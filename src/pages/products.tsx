import React, { useEffect, useMemo, useState } from 'react';
import ProductCostingEditor from '../components/products/ProductCostingEditor';
import { CostingDraft, emptyCostingDraft, costingPayload, decimalInput, validCostingDraft } from '../utils/costing';
import useSWR from 'swr';
import fetcher from '../utils/fetcher';
import { useRouter } from 'next/router';
import useTranslation from 'next-translate/useTranslation';
import { useAuth, withAuth } from '../utils/authContext';
import { Button } from 'react-bootstrap';
import { SingleValue } from 'react-select';
import ProductModal from '../components/modal/Products/ProductModal';
import PackageModal from '../components/modal/Products/PackageModal';
import { FaPlus, FaTag } from 'react-icons/fa';
import ProductCard from '../components/ProductCard';
import ProductCardSkeleton from '../components/skeletons/ProductCardSkeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import Breadcrumbs from '../components/Breadcrumbs';
import { Product, Recipe, ProductPackage } from '../types/api';
import { useNotification } from '../hooks/useNotification';
import SelectDropdown from '../components/SelectDropdown';
import { useWorkspace } from '../utils/workspaceContext';
import { workspaceFetcher, workspaceKey } from '../utils/workspaceSWR';
import { ClearFiltersButton, FilterBar } from '../components/filters/FilterBar';

const Products = () => {
  const { t } = useTranslation('common');
  const { auth } = useAuth();
  const { selectedWorkspaceId, selectedCurrency, isWorkspaceReady } = useWorkspace();
  const { success, error: showError } = useNotification();
  const { data: products, mutate: mutateProducts, error: productsError } = useSWR<Product[]>(
    workspaceKey('/api/products', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const { data: recipes, error: recipesError } = useSWR<Recipe[]>(
    workspaceKey('/api/recipes', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const { data: packages, mutate: mutatePackages, error: packagesError } = useSWR<ProductPackage[]>(
    workspaceKey('/api/packages', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [costingDraft, setCostingDraft] = useState<CostingDraft>(emptyCostingDraft);
  const [image, setImage] = useState('');
  const [recipeIds, setRecipeIds] = useState<number[]>([]);
  const [selectedRecipes, setSelectedRecipes] = useState<{ value: number; label: string }[]>([]);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<SingleValue<{ value: number; label: string }> | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<SingleValue<{ value: number; label: string }> | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<SingleValue<{ value: number; label: string }> | null>(null);

  useEffect(() => {
    setShowProductModal(false); setShowPackageModal(false); setEditingProduct(null);
    setName(''); setDescription(''); setPrice(''); setCost(''); setImage(''); setPackageId(null);
    setRecipeIds([]); setSelectedRecipes([]); setCostingDraft(emptyCostingDraft());
    setSelectedProduct(null); setSelectedPackage(null); setSelectedRecipe(null);
  }, [selectedWorkspaceId]);

  const filteredProducts = useMemo(() => {
    let filtered = products || [];
    if (selectedRecipe) {
      filtered = filtered.filter(product =>
        (product.options || []).some(option => option.recipe_id === selectedRecipe.value) || product.cost_recipe_id === selectedRecipe.value || (product.components || []).some(row => row.recipe_id === selectedRecipe.value)
      );
    }

    if (selectedPackage) {
      filtered = filtered.filter(product =>
        product.package_id === selectedPackage.value
      );
    }

    if (selectedProduct) {
      filtered = filtered.filter(product => product.id === selectedProduct.value);
    }

    return filtered;
  }, [products, selectedPackage, selectedProduct, selectedRecipe]);

  const handleEditProduct = (product: Product) => {
    if (!recipes || !packages) {
      console.warn('Recipes or packages data not loaded yet');
      return;
    }

    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description || '');
    setPrice(product.price.toString());
    setCost(product.cost.toString());
    setCostingDraft({ cost_mode: product.cost_mode || 'manual', cost_recipe_id: product.cost_recipe_id ?? null,
      components: (product.components || []).map(row => ({ recipe_id: row.recipe_id, quantity_g: String(row.quantity_g) })),
      reviewed: product.cost_mode === 'recipe' || product.cost_mode === 'assortment' });
    setImage(product.image || product.image_url || '');

    const selected = (product.options || []).map(option => {
      const recipe = recipes?.find(recipe => recipe.id === option.recipe_id);
      return recipe ? { value: recipe.id, label: recipe.name } : null;
    }).filter(option => option !== null) as { value: number; label: string }[];

    setSelectedRecipes(selected);
    setRecipeIds(selected.map(r => r.value));
    setPackageId(product.package_id);
    setShowProductModal(true);
  };

  const handleCloseProductModal = () => {
    setEditingProduct(null);
    setName('');
    setDescription('');
    setPrice('');
    setCost('');
    setCostingDraft(emptyCostingDraft());
    setImage('');
    setRecipeIds([]);
    setSelectedRecipes([]);
    setPackageId(null);
    setShowProductModal(false);
  };

  const handleSaveProductChanges = async () => {
    try {
      if (!auth.token) {
        router.push('/auth/signin');
        return;
      }
  
      // Improved validation with specific error messages
      const errors = [];
      
      if (!name) errors.push(t('productNameRequired'));
      if (!description) errors.push(t('productDescriptionRequired'));
      if (!price || parseFloat(price) <= 0) errors.push(t('validPriceRequired'));
      if (costingDraft.cost_mode === 'manual' && (decimalInput(cost) == null)) errors.push('Enter a non-negative manual cost.');
      if (!validCostingDraft(costingDraft, packages?.find(pkg => pkg.id === packageId)?.net_weight_g)) errors.push('Review the content-only recipes, select a source and make component grams match the package.');
      if (!packageId) errors.push(t('packageRequired'));

      
      if (errors.length > 0) {
        alert(errors.join('\n'));
        return;
      }
  
      const parsedPrice = parseFloat(price);
      const parsedCost = decimalInput(cost);
  
      // Only validate the image URL if it's not empty
      if (image.trim()) {
        try {
          new URL(image);
        } catch (_) {
          alert(t('invalidImageUrl'));
          return;
        }
      }
  
      // Build legacy recipe links from the explicit selection.
      const recipeIds = selectedRecipes.map(recipe => recipe.value);
  
      const product = {
        name,
        description,
        price: parsedPrice,
        ...(costingDraft.cost_mode === 'manual' ? { cost: parsedCost } : {}),
        ...costingPayload(costingDraft),
        image: image || null,
        recipe_ids: recipeIds,
        package_id: packageId,
      };
  
      if (editingProduct) {
        await fetcher(`/api/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.token}`,
          },
          body: JSON.stringify(product),
        });
        mutateProducts();
      } else {
        await fetcher('/api/products', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.token}`,
          },
          body: JSON.stringify(product),
        });
        mutateProducts();
      }

      handleCloseProductModal();
      success(editingProduct ? t('productUpdated') : t('productCreated'));
    } catch (error) {
      showError(error instanceof Error ? error.message : t('failedToSaveProduct'));
    }
  };

  const handleDeleteProduct = async () => {
    if (!editingProduct) return;

    try {
      if (!auth.token) {
        router.push('/auth/signin');
        return;
      }

      const confirmed = window.confirm(t('confirmDeleteProduct'));
      if (!confirmed) return;

      await fetcher(`/api/products/${editingProduct.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`,
        },
      });

      mutateProducts();
      handleCloseProductModal();
      success(t('productDeleted'));
    } catch (error) {
      showError(t('failedToDeleteProduct'));
    }
  };

  const handlePackageCreated = (newPackage: { id: number; name: string }) => {
    const option = { value: newPackage.id, label: newPackage.name };
    setSelectedPackage(option);
    mutatePackages();
  };

  const handleSelectPackage = (option: { value: number; label: string } | null) => {
    setSelectedPackage(option);
  };

  const recipeOptions = recipes?.map(recipe => ({ value: recipe.id, label: recipe.name })) || [];
  const packageOptions = packages?.map(pkg => ({ value: pkg.id, label: `${pkg.name}${pkg.net_weight_g != null ? ` · ${pkg.net_weight_g} g net` : ' · weight unknown'}` })) || [];
  const productOptions = products?.map(product => ({ value: product.id, label: product.name })) || [];
  const hasActiveFilters = !!(selectedRecipe || selectedPackage || selectedProduct);

  // Check request errors.
  const hasError = productsError || recipesError || packagesError;
  
  // Check loading state.
  const isLoading = !products || !recipes || !packages;

  // Show a recoverable loading error.
  if (hasError) {
    return (
      <ErrorState 
        message={t('failedToLoadProducts')} 
        onRetry={() => {
          mutateProducts();
        }} 
      />
    );
  }

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title d-flex align-items-center gap-3">
            <FaTag className="text-primary" />
            {t('products')}
          </h1>
          {!isLoading && (
            <p className="page-subtitle">
              {t('total')}: {products?.length || 0} {t('products').toLowerCase()}
              {filteredProducts.length !== products?.length && (
                <span className="text-tertiary"> / {filteredProducts.length} {t('filtered').toLowerCase()}</span>
              )}
            </p>
          )}
        </div>
        <Button
          className="btn btn-primary"
          onClick={() => setShowProductModal(true)}
        >
          <FaPlus className="me-2" />
          {t('addProduct')}
        </Button>
      </div>

      {/* Filter Section */}
      <FilterBar className="products-filter-bar">
        <div className="filter-group">
          <SelectDropdown
            options={recipeOptions}
            onChange={setSelectedRecipe}
            value={selectedRecipe}
            placeholder={t('allRecipes')}
            isClearable
            label={t('recipe')}
          />
        </div>
        <div className="filter-group">
          <SelectDropdown
            options={productOptions}
            onChange={setSelectedProduct}
            value={selectedProduct}
            placeholder={t('allProducts')}
            isClearable
            label={t('product')}
          />
        </div>
        <ClearFiltersButton
          label={t('clear')}
          onClick={() => {
            setSelectedRecipe(null);
            setSelectedPackage(null);
            setSelectedProduct(null);
          }}
          visible={hasActiveFilters}
        />
      </FilterBar>

      {!isLoading && (
        <div className="package-chip-strip" aria-label={t('package')}>
          <button
            type="button"
            className={`package-chip ${selectedPackage ? '' : 'active'}`}
            onClick={() => handleSelectPackage(null)}
            aria-pressed={!selectedPackage}
          >
            {t('allPackages')}
            <span className="package-chip-count">{products?.length || 0}</span>
          </button>
          {packageOptions.map((option) => {
            const packageProductCount = products?.filter(product => product.package_id === option.value).length || 0;

            return (
              <button
                key={option.value}
                type="button"
                className={`package-chip ${selectedPackage?.value === option.value ? 'active' : ''}`}
                onClick={() => handleSelectPackage(option)}
                aria-pressed={selectedPackage?.value === option.value}
                title={option.label}
              >
                <span className="package-chip-label">{option.label}</span>
                <span className="package-chip-count">{packageProductCount}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="package-chip package-chip-add"
            onClick={() => setShowPackageModal(true)}
            title={t('addPackage')}
            aria-label={t('addPackage')}
          >
            <FaPlus />
          </button>
        </div>
      )}

      {/* Products Grid */}
      {isLoading ? (
        <div className="products-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          type="products"
          message={t('noProductsFound')}
          actionLabel={t('addProduct')}
          onAction={() => setShowProductModal(true)}
        />
      ) : (
        <div className="products-grid">
          {filteredProducts.map((product: Product) => (
            <div key={product.id} className="product-grid-item">
              <ProductCard
                product={product}
                recipes={recipes || []}
                packages={packages || []}
                onEdit={handleEditProduct}
              />
            </div>
          ))}
        </div>
      )}

      {/* Product Modal */}
      <ProductModal
        show={showProductModal}
        onClose={handleCloseProductModal}
        onSave={handleSaveProductChanges}
        onDelete={handleDeleteProduct}
        product={editingProduct}
        name={name}
        setName={setName}
        description={description}
        setDescription={setDescription}
        price={price}
        setPrice={setPrice}
        cost={cost}
        setCost={setCost}
        calculatedCost={costingDraft.cost_mode !== 'manual'}
        costingValid={validCostingDraft(costingDraft, packages?.find(pkg => pkg.id === packageId)?.net_weight_g)}
        costingControls={<ProductCostingEditor draft={costingDraft} onChange={setCostingDraft} recipes={recipes || []}
          selectedPackage={packages?.find(pkg => pkg.id === packageId)} packageId={packageId} workspaceId={selectedWorkspaceId}
          linkedRecipes={selectedRecipes.map(row => row.value)} currency={selectedCurrency || ''} show={showProductModal} />}
        image={image}
        setImage={setImage}
        selectedRecipes={selectedRecipes}
        setSelectedRecipes={setSelectedRecipes}
        recipeOptions={recipeOptions}
        packageId={packageId}
        setPackageId={setPackageId}
        packageOptions={packageOptions}
      />

      <PackageModal
        show={showPackageModal}
        onClose={() => setShowPackageModal(false)}
        onPackageCreated={handlePackageCreated}
      />
    </div>
  );
};

export default withAuth(Products);
