import { productEditorErrors, productEditorIsDirty, productEditorSnapshot } from '../utils/productEditorState';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ProductCostingEditor from '../components/products/ProductCostingEditor';
import LegacyProductCostingEditor from '../components/products/LegacyProductCostingEditor';
import { changeProductType, conversionContextKey, currentProductType, emptyProductDraft, productConfigurationPayload, productDraft, validProductDraft } from '../utils/productTypes';
import { CostingDraft, emptyCostingDraft, costingPayload, decimalInput, validCostingDraft, effectiveProductCost } from '../utils/costing';
import useSWR from 'swr';
import fetcher from '../utils/fetcher';
import { useRouter } from 'next/router';
import useTranslation from 'next-translate/useTranslation';
import { useAuth, withAuth } from '../utils/authContext';
import { Button, Form } from 'react-bootstrap';
import { SingleValue } from 'react-select';
import ProductModal from '../components/modal/Products/ProductModal';
import PackageModal from '../components/modal/Products/PackageModal';
import { FaPlus, FaTag } from 'react-icons/fa';
import ProductCard from '../components/ProductCard';
import { cookingApiFor, cookingOperationScope } from '../utils/cooking';
import type { CookingStock } from '../types/cooking';
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
  const { selectedWorkspaceId, selectedCurrency, isWorkspaceReady, selectedWorkspace } = useWorkspace();
  const { success, error: showError } = useNotification();
  const { data: products, mutate: mutateProducts, error: productsError } = useSWR<Product[]>(
    workspaceKey('/api/products', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const { data: recipes, error: recipesError, mutate: mutateRecipes } = useSWR<Recipe[]>(
    workspaceKey('/api/recipes', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const { data: packages, mutate: mutatePackages, error: packagesError } = useSWR<ProductPackage[]>(
    workspaceKey('/api/packages', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const cookingEnabled = selectedWorkspace?.capabilities?.cooking_v1 === true;
  const { data: finishedStock, error: finishedStockError, mutate: refreshFinishedStock } = useSWR<CookingStock>(
    auth.isAuthenticated && isWorkspaceReady && cookingEnabled ? ['cooking-product-stock', cookingOperationScope(selectedWorkspaceId)] : null,
    () => cookingApiFor(selectedWorkspaceId).stock()
  );
  const packagedStock = useMemo(() => {
    const balances = new Map<number, { total: number; reserved: number; available: number }>();
    for (const lot of finishedStock?.lots || []) {
      if (lot.kind !== 'packaged' || !lot.product_id) continue;
      const current = balances.get(lot.product_id) || { total: 0, reserved: 0, available: 0 };
      current.total += Number(lot.quantity);
      current.reserved += Number(lot.reserved);
      current.available += Number(lot.available);
      balances.set(lot.product_id, current);
    }
    return balances;
  }, [finishedStock]);
  const router = useRouter();
  const modern = selectedWorkspace?.capabilities?.product_types_v1 === true;
  const [busy, setBusy] = useState(false);
  const [productMessage, setProductMessage] = useState('');
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const [savedProductId, setSavedProductId] = useState<number | null>(null);
  const baseline = useRef<string | null>(null);
  const [conversionChoice, setConversionChoice] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const operation = useRef<object | null>(null);
  const scope = useRef({ id: selectedWorkspaceId, epoch: 0 });
  if (scope.current.id !== selectedWorkspaceId) scope.current = { id: selectedWorkspaceId, epoch: scope.current.epoch + 1 };
  const draftValid = (draft: CostingDraft, weight?: number | null) => modern ? validProductDraft(draft, weight, conversionContextKey(draft, packageId, packages?.find(pkg => pkg.id === packageId), cost, products || [], recipes || [], selectedWorkspaceId)) : validCostingDraft(draft, weight);

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
    baseline.current = null; setConversionChoice(false);
    operation.current = null; setBusy(false); setProductMessage(''); setReloadNeeded(false); setSavedProductId(null); setTypeFilter(null);
    setShowProductModal(false); setShowPackageModal(false); setEditingProduct(null);
    setName(''); setDescription(''); setPrice(''); setCost(''); setImage(''); setPackageId(null);
    setRecipeIds([]); setSelectedRecipes([]); setCostingDraft(emptyCostingDraft());
    setSelectedProduct(null); setSelectedPackage(null); setSelectedRecipe(null);
  }, [selectedWorkspaceId]);

  const filteredProducts = useMemo(() => {
    let filtered = products || [];
    if (typeFilter) filtered = filtered.filter(product => currentProductType(product) === typeFilter);
    if (selectedRecipe) {
      filtered = filtered.filter(product =>
        (product.options || []).some(option => option.recipe_id === selectedRecipe.value) || product.cost_recipe_id === selectedRecipe.value || (product.components || []).some(row => row.recipe_id === selectedRecipe.value) || (product.assortment_components || []).some(row => { const source = products?.find(item => item.id === row.component_product_id); return source?.recipe_id === selectedRecipe.value || source?.cost_recipe_id === selectedRecipe.value; })
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
  }, [products, selectedPackage, selectedProduct, selectedRecipe, typeFilter]);

  const handleEditProduct = (product: Product) => {
    if (operation.current || !recipes || !packages || recipesError || packagesError) {
      console.warn('Recipes or packages data not loaded yet');
      return;
    }

    setProductMessage(''); setReloadNeeded(false); setSavedProductId(null);
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description || '');
    setPrice(product.price.toString());
    setCost(String(effectiveProductCost(product) ?? ''));
    const draft: CostingDraft = modern ? productDraft(product) : { cost_mode: product.cost_mode || 'manual', cost_recipe_id: product.cost_recipe_id ?? null,
      components: (product.components || []).map(row => ({ recipe_id: row.recipe_id, quantity_g: String(row.quantity_g) })),
      reviewed: product.cost_mode === 'recipe' || product.cost_mode === 'assortment' };
    setCostingDraft(draft);
    setImage(product.image || product.image_url || '');

    const selected = (product.options || []).map(option => {
      const recipe = recipes?.find(recipe => recipe.id === option.recipe_id);
      return recipe ? { value: recipe.id, label: recipe.name } : null;
    }).filter(option => option !== null) as { value: number; label: string }[];

    setSelectedRecipes(selected);
    setRecipeIds(selected.map(r => r.value));
    setPackageId(product.package_id);
    setConversionChoice(false);
    baseline.current = productEditorSnapshot({ name: product.name, description: product.description || '', price: String(product.price), cost: String(effectiveProductCost(product) ?? ''), image: product.image || product.image_url || '', packageId: product.package_id, draft, recipeIds: selected.map(row => row.value) });
    setShowProductModal(true);
  };

  const editorValues = { name, description, price, cost, image, packageId, draft: costingDraft, recipeIds: selectedRecipes.map(row => row.value), conversionChoice };
  const validationErrors = productEditorErrors(editorValues, modern, draftValid(costingDraft, packages?.find(pkg => pkg.id === packageId)?.net_weight_g), packages?.find(pkg => pkg.id === packageId)?.net_weight_g);
  const closeProductModal = () => {
    if (operation.current) return;
    baseline.current = null; setConversionChoice(false);
    setProductMessage(''); setReloadNeeded(false); setSavedProductId(null);
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

  const requestCloseProductModal = () => {
    if (operation.current) return;
    if (!savedProductId && productEditorIsDirty(baseline.current, editorValues) && !window.confirm(t('productDiscardChanges'))) return;
    closeProductModal();
  };

  const handleSaveProductChanges = async () => {
    if (operation.current || savedProductId || !selectedWorkspaceId) return;
    const token = {};
    operation.current = token; setBusy(true); setProductMessage('');
    const epoch = scope.current.epoch;
    const current = () => operation.current === token && scope.current.epoch === epoch;
    try {
      if (!auth.token) { router.push('/auth/signin'); return; }
      const weight = packages?.find(pkg => pkg.id === packageId)?.net_weight_g;
      if (!name.trim() || !description.trim() || !(Number(decimalInput(price)) > 0) || decimalInput(price) == null || !packageId || !draftValid(costingDraft, weight) ||
          (costingDraft.cost_mode === 'manual' && decimalInput(cost) == null)) {
        setProductMessage(t('productConfigurationInvalid')); return;
      }
      const payload = {
        name, description, price: decimalInput(price), image: image || null, package_id: packageId,
        ...(costingDraft.cost_mode === 'manual' ? { cost: decimalInput(cost) } : {}),
        ...(modern ? productConfigurationPayload(costingDraft) : { ...costingPayload(costingDraft), recipe_ids: selectedRecipes.map(recipe => recipe.value) }),
      };
      const saved = await fetcher(editingProduct ? `/api/products/${editingProduct.id}` : '/api/products', {
        method: editingProduct ? 'PUT' : 'POST', headers: { 'X-Workspace-ID': selectedWorkspaceId }, body: JSON.stringify(payload),
      }) as Product;
      if (!current()) return;
      if (saved.refresh_required) {
        setSavedProductId(saved.id); setProductMessage(t('productSavedRefreshRequired'));
        return;
      }
      // A confirmed write is never repeated when the follow-up catalog read fails.
      setSavedProductId(saved.id);
      try { await mutateProducts(); }
      catch { if (current()) setProductMessage(t('productSavedRefreshRequired')); return; }
      if (!current()) return;
      operation.current = null;
      closeProductModal();
      success(editingProduct ? t('productUpdated') : t('productCreated'));
    } catch (error) {
      if (!current()) return;
      const code = (error as { code?: string; status?: number }).status;
      setReloadNeeded(code === 409);
      setProductMessage(t(code === 409 ? 'productConfigurationConflict' : 'failedToSaveProduct'));
    } finally { if (current()) operation.current = null; if (scope.current.epoch === epoch) setBusy(false); }
  };

  const refreshSavedProduct = async () => {
    if (!savedProductId || operation.current || !selectedWorkspaceId) return;
    const token = {}; operation.current = token; setBusy(true);
    const epoch = scope.current.epoch;
    try {
      await fetcher(`/api/products/${savedProductId}`, { headers: { 'X-Workspace-ID': selectedWorkspaceId } });
      await mutateProducts();
      if (scope.current.epoch !== epoch || operation.current !== token) return;
      operation.current = null; closeProductModal(); success(t('productUpdated'));
    } catch { if (scope.current.epoch === epoch) setProductMessage(t('productSavedRefreshRequired')); }
    finally { if (operation.current === token) operation.current = null; if (scope.current.epoch === epoch) setBusy(false); }
  };

  const reloadProductConfiguration = async () => {
    if (!editingProduct || operation.current || !selectedWorkspaceId || !window.confirm(t('productDiscardReload'))) return;
    const token = {}; operation.current = token; setBusy(true);
    const epoch = scope.current.epoch;
    try {
      const fresh = await fetcher(`/api/products/${editingProduct.id}`, { headers: { 'X-Workspace-ID': selectedWorkspaceId } });
      if (operation.current !== token || scope.current.epoch !== epoch) return;
      operation.current = null; handleEditProduct(fresh);
    } catch { if (scope.current.epoch === epoch) setProductMessage(t('failedToLoadProducts')); }
    finally { if (operation.current === token) operation.current = null; if (scope.current.epoch === epoch) setBusy(false); }
  };

  const handleDeleteProduct = async () => {
    if (!editingProduct || operation.current || savedProductId || !selectedWorkspaceId) return;
    if (!auth.token) { router.push('/auth/signin'); return; }
    if (!window.confirm(t('confirmDeleteProduct'))) return;
    const token = {}; operation.current = token; setBusy(true); setProductMessage('');
    const epoch = scope.current.epoch;
    const current = () => operation.current === token && scope.current.epoch === epoch;
    try {
      await fetcher(`/api/products/${editingProduct.id}`, { method: 'DELETE', headers: { 'X-Workspace-ID': selectedWorkspaceId } });
      if (!current()) return;
      // The delete is confirmed even if refreshing the catalog later fails.
      await mutateProducts().catch(() => undefined);
      if (!current()) return;
      operation.current = null; closeProductModal(); success(t('productDeleted'));
    } catch {
      if (current()) { setProductMessage(t('failedToDeleteProduct')); showError(t('failedToDeleteProduct')); }
    } finally { if (current()) operation.current = null; if (scope.current.epoch === epoch) setBusy(false); }
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
  const packageOptions = packages?.map(pkg => ({ value: pkg.id, label: `${pkg.name} · ${pkg.net_weight_g != null ? t('costingNetGrams', { weight: pkg.net_weight_g }) : t('costingWeightUnknown')}` })) || [];
  const productOptions = products?.map(product => ({ value: product.id, label: product.name })) || [];
  const hasActiveFilters = !!(selectedRecipe || selectedPackage || selectedProduct || typeFilter);
  const openNewProduct = () => {
    if (operation.current) return;
    const draft = modern ? emptyProductDraft() : emptyCostingDraft();
    setEditingProduct(null); setName(''); setDescription(''); setPrice(''); setCost(''); setImage(''); setPackageId(null); setSelectedRecipes([]); setRecipeIds([]); setConversionChoice(false);
    setCostingDraft(draft); setProductMessage(''); setReloadNeeded(false); setSavedProductId(null);
    baseline.current = productEditorSnapshot({ name: '', description: '', price: '', cost: '', image: '', packageId: null, draft, recipeIds: [] });
    setShowProductModal(true);
  };
  const clearFilters = () => { setTypeFilter(null); setSelectedRecipe(null); setSelectedPackage(null); setSelectedProduct(null); };
  const activeFilterCount = [typeFilter, selectedRecipe, selectedProduct, selectedPackage].filter(Boolean).length;
  const filterSummary = [typeFilter ? t(typeFilter === 'standard' ? 'productTypeStandard' : 'productTypeAssortment') : null, selectedRecipe?.label, selectedProduct?.label, selectedPackage?.label].filter(Boolean).join(' · ');

  // Check request errors.
  const hasError = productsError || recipesError || packagesError;
  
  // Check loading state.
  const isLoading = !products && !productsError;

  return (
    <div className="page-container products-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title d-flex align-items-center gap-3">
            <FaTag className="text-primary" />
            {t('products')}
          </h1>
          {!isLoading && (
            <p className="page-subtitle">
              {t('productTotalCount', { count: products?.length || 0 })}
              {filteredProducts.length !== products?.length && (
                <span className="text-tertiary"> / {filteredProducts.length} {t('filtered').toLowerCase()}</span>
              )}
            </p>
          )}
        </div>
        <Button
          className="btn btn-primary"
          onClick={openNewProduct}
          disabled={!recipes || !packages || Boolean(recipesError || packagesError)}
        >
          <FaPlus className="me-2" />
          {t('addProduct')}
        </Button>
      </div>

      {/* Filter Section */}
      <FilterBar className="products-filter-bar" mobileCollapsible activeCount={activeFilterCount} summary={filterSummary} onClear={clearFilters}>
        <div className="filter-group"><SelectDropdown inputId="product-type-filter" label={t('productType')}
          options={[{ value: 'standard', label: t('productTypeStandard') }, { value: 'assortment', label: t('productTypeAssortment') }]}
          value={typeFilter ? { value: typeFilter, label: t(typeFilter === 'standard' ? 'productTypeStandard' : 'productTypeAssortment') } : null}
          onChange={option => setTypeFilter(option?.value ?? null)} isClearable placeholder={t('productAllTypes')} /></div>
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
            disabled={Boolean(packagesError)}
            title={t('addPackage')}
            aria-label={t('addPackage')}
          >
            <FaPlus />
          </button>
        </div>
      )}

      </FilterBar>

      {hasError && <ErrorState message={t('failedToLoadProducts')} compact={Boolean(products)} onRetry={() => { void Promise.allSettled([mutateProducts(), mutateRecipes(), mutatePackages()]); }} />}

      {cookingEnabled && finishedStockError && <ErrorState message={t('cookingLoadError')} compact onRetry={() => void refreshFinishedStock()} />}
      {cookingEnabled && finishedStock && !finishedStockError && finishedStock.lots.length === 0 && <Button variant="link" onClick={() => void router.push('/cooking')}>{t('cookingStockEmpty')}</Button>}

      {/* Products Grid */}
      {!products && hasError ? null : isLoading ? (
        <div className="products-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          type="products"
          message={t(hasActiveFilters ? 'noProductsFound' : 'noProducts')}
          actionLabel={hasActiveFilters ? t('clear') : recipes && packages && !recipesError && !packagesError ? t('addProduct') : undefined}
          onAction={hasActiveFilters ? clearFilters : openNewProduct}
        />
      ) : (
        <div className="products-grid">
          {filteredProducts.map((product: Product) => (
            <div key={product.id} className="product-grid-item">
              <ProductCard
                product={product}
                recipes={recipes || []}
                packages={packages || []}
                editDisabled={!recipes || !packages || Boolean(recipesError || packagesError)}
                stock={cookingEnabled && finishedStock && !finishedStockError ? packagedStock.get(product.id) || { total: 0, reserved: 0, available: 0 } : undefined}
                onEdit={handleEditProduct}
              />
            </div>
          ))}
        </div>
      )}

      {/* Product Modal */}
      <ProductModal
        validationErrors={validationErrors}
        modern={modern} busy={busy} readOnly={modern && Boolean(editingProduct && !currentProductType(editingProduct))}
        message={productMessage} onReload={reloadNeeded ? reloadProductConfiguration : undefined} savedRefreshRequired={savedProductId != null} onRefresh={refreshSavedProduct}
        typeControls={<section className="product-configuration-section"><h5>{t('productType')}</h5>
          <div className="product-choice-group" role="group" aria-label={t('productType')}>
            {(['standard', 'assortment'] as const).map(type => <Form.Check key={type} type="radio" name="productType" id={`product-type-${type}`}
              label={t(type === 'standard' ? 'productTypeStandard' : 'productTypeAssortment')} checked={costingDraft.product_type === type}
              onChange={() => { if (costingDraft.product_type !== type && (costingDraft.cost_recipe_id || costingDraft.components.length || costingDraft.assortment_components?.length) && !window.confirm(t('productChangeTypeConfirmation'))) return; setCostingDraft(changeProductType(costingDraft, type)); if (costingDraft.cost_mode === 'manual') setCost(''); }} />)}
          </div></section>}
        configurationControls={(packaging, attempted) => <ProductCostingEditor validationErrors={attempted ? validationErrors : {}} onConversionChoice={setConversionChoice} draft={costingDraft} onChange={next => { if (!operation.current && !savedProductId) setCostingDraft(next); }} recipes={recipes || []} products={products || []} productId={editingProduct?.id}
          selectedPackage={packages?.find(pkg => pkg.id === packageId)} packageId={packageId} workspaceId={selectedWorkspaceId}
          originalCost={editingProduct ? effectiveProductCost(editingProduct) : null} currency={selectedCurrency || ''} show={showProductModal} packageControls={packaging} cost={cost} setCost={setCost} />}
        show={showProductModal}
        onClose={requestCloseProductModal}
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
        costingValid={draftValid(costingDraft, packages?.find(pkg => pkg.id === packageId)?.net_weight_g)}
        costingControls={<LegacyProductCostingEditor draft={costingDraft} onChange={next => { if (!operation.current && !savedProductId) setCostingDraft(next); }} recipes={recipes || []}
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
