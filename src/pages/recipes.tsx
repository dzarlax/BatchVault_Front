import { invalidateCosting, costIssues } from '../utils/costing';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';
import fetcher from '../utils/fetcher';
import useTranslation from 'next-translate/useTranslation';
import { Button } from 'react-bootstrap';
import RecipeBuilderModal from '../components/modal/Recipe/RecipeBuilderModal';
import RecipeCalculator from '../components/calculator/RecipeCalculator';
import RecipeCardSkeleton from '../components/skeletons/RecipeCardSkeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { useRouter } from 'next/router';
import { useAuth, withAuth } from '../utils/authContext';
import { useNotification } from '../hooks/useNotification';
import { FaPlus, FaUtensils, FaCalculator, FaEdit, FaExclamationTriangle } from 'react-icons/fa';
import SelectDropdown from '../components/SelectDropdown';
import { formatCount } from '../utils/pluralize';
import { useWorkspace } from '../utils/workspaceContext';
import { workspaceFetcher, workspaceKey } from '../utils/workspaceSWR';
import { WorkspaceIngredient } from '../types/api';
import { ClearFiltersButton, FilterBar, SearchFilter } from '../components/filters/FilterBar';
import { advanceEditorOperationScope, commitEditorWrite, createRecipeWithIngredients, EditorOperationScope } from '../utils/editorDraftState';

const Recipes: React.FC = () => {
  const { auth } = useAuth();
  const { selectedWorkspaceId, selectedCurrency, isWorkspaceReady } = useWorkspace();
  const { t } = useTranslation('common');
  const { success, error: showError } = useNotification();
  const router = useRouter();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [recipesWorkspaceId, setRecipesWorkspaceId] = useState<string | null>(null);
  const [loadedFilter, setLoadedFilter] = useState('');
  const [filteredReadError, setFilteredReadError] = useState(false);
  const readVersion = useRef(0);
  const selectedWorkspaceIdRef = useRef(selectedWorkspaceId);
  selectedWorkspaceIdRef.current = selectedWorkspaceId;
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterIngredient, setFilterIngredient] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);

  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingRecipe, setEditingRecipe] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showCalculator, setShowCalculator] = useState<boolean>(false);
  const [calculatorRecipe, setCalculatorRecipe] = useState<any>(null);
  const [editingRecipeNeedsRefresh, setEditingRecipeNeedsRefresh] = useState(false);
  const editingRecipeNeedsRefreshRef = useRef(false);
  const recipeRefreshLocks = useRef(new Set<string>());
  const selectedRecipeRefreshKey = JSON.stringify([selectedWorkspaceId, editingRecipe?.id]);
  editingRecipeNeedsRefreshRef.current = recipeRefreshLocks.current.has(selectedRecipeRefreshKey);
  const workspaceScope = useRef<EditorOperationScope | null>(null);
  workspaceScope.current = advanceEditorOperationScope(workspaceScope.current, selectedWorkspaceId || '');
  const renderedWorkspaceScope = workspaceScope.current;
  const editorScope = useRef<EditorOperationScope | null>(null);
  const nextEditorScope = advanceEditorOperationScope(editorScope.current,
    `${renderedWorkspaceScope.epoch}:${showModal ? `edit:${editingRecipe?.id}` : 'closed'}:${showCreateModal ? 'create' : 'closed'}`);
  editorScope.current = nextEditorScope;
  const renderedEditorScope = nextEditorScope;
  const resetWorkspaceScope = useRef(renderedWorkspaceScope);

  useEffect(() => {
    setEditingRecipeNeedsRefresh(recipeRefreshLocks.current.has(selectedRecipeRefreshKey));
  }, [renderedEditorScope, selectedRecipeRefreshKey]);

  useEffect(() => {
    if (resetWorkspaceScope.current === renderedWorkspaceScope) return;
    resetWorkspaceScope.current = renderedWorkspaceScope;
    readVersion.current++;
    setShowModal(false);
    setEditingRecipe(null);
    setShowCreateModal(false);
    setShowCalculator(false);
    setCalculatorRecipe(null);
    setSelectedRecipeId(null);
  }, [renderedWorkspaceScope]);


  // Fetch списков рецептов и ингредиентов
  const { data: recipeNames, error: recipesError, mutate: mutateRecipeNames } = useSWR(
    workspaceKey('/api/recipes', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const { data: workspaceIngredients, error: ingredientsError, mutate: mutateIngredients } = useSWR<WorkspaceIngredient[]>(
    workspaceKey('/api/workspace-ingredients', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const ingredients = useMemo(
    () => workspaceIngredients?.map((workspaceIngredient) => workspaceIngredient.ingredient) || [],
    [workspaceIngredients]
  );

  useEffect(() => {
    readVersion.current++;
    setFilteredReadError(false);
    if (!isWorkspaceReady || !selectedWorkspaceId) {
      setIsLoading(true);
      return;
    }
    if (filterIngredient) {
      void loadRecipes();
    } else if (recipeNames !== undefined) {
      setRecipes(recipeNames || []);
      setRecipesWorkspaceId(selectedWorkspaceId);
      setLoadedFilter('');
      setIsLoading(false);
    } else {
      setIsLoading(!recipesError);
    }
  }, [filterIngredient, recipeNames, recipesError, selectedWorkspaceId, isWorkspaceReady]);

  const filteredRecipes = useMemo(() => {
    if (!isWorkspaceReady || !selectedWorkspaceId || recipesWorkspaceId !== selectedWorkspaceId || loadedFilter !== String(filterIngredient)) return [];
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return recipes;

    return recipes.filter((recipe) =>
      String(recipe.name || '').toLowerCase().includes(normalizedSearch)
    );
  }, [isWorkspaceReady, recipesWorkspaceId, recipes, searchTerm, selectedWorkspaceId, loadedFilter, filterIngredient]);

  useEffect(() => {
    if (filteredRecipes.length === 0) {
      setSelectedRecipeId(null);
      return;
    }

    const selectedRecipeIsVisible = filteredRecipes.some((recipe) => recipe.id === selectedRecipeId);
    if (!selectedRecipeIsVisible) {
      setSelectedRecipeId(filteredRecipes[0].id);
    }
  }, [filteredRecipes, selectedRecipeId]);

  const loadRecipes = async () => {
    const workspaceId = selectedWorkspaceId;
    const scope = renderedWorkspaceScope;
    if (!workspaceId || !isWorkspaceReady || workspaceScope.current !== scope) return;
    const version = ++readVersion.current;
    const requestedFilter = String(filterIngredient);
    setFilteredReadError(false);
    setIsLoading(true);
    const query = new URLSearchParams();
    if (filterIngredient) query.append('ingredient_id', filterIngredient);

    try {
      if (!auth.isAuthenticated || !auth.token) {
        router.push('/auth/signin');
        return;
      }

      // Используем fetcher для получения данных с авторизацией
      const response = await fetcher(`/api/recipes?${query.toString()}`, {
        headers: {
          'Authorization': `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
          'X-Workspace-ID': workspaceId,
        },
      });

      if (response && workspaceScope.current === scope && selectedWorkspaceIdRef.current === workspaceId && readVersion.current === version) {
        setRecipes(response);
        setRecipesWorkspaceId(workspaceId);
        setLoadedFilter(requestedFilter);
        setIsLoading(false);
      } else {
        if (workspaceScope.current === scope && selectedWorkspaceIdRef.current === workspaceId && readVersion.current === version) { setFilteredReadError(true); setIsLoading(false); }
      }
    } catch (error) {
      if (workspaceScope.current === scope && selectedWorkspaceIdRef.current === workspaceId && readVersion.current === version) {
        setIsLoading(false);
        setFilteredReadError(true);
      }
    }
  };

  type RecipeContext = { scope: EditorOperationScope; workspaceId: string; recipeId?: number };
  const recipeContext = (): RecipeContext => ({
    scope: renderedEditorScope,
    workspaceId: selectedWorkspaceId || '',
    recipeId: showModal ? editingRecipe?.id : undefined,
  });
  const isCurrentRecipeContext = (context: RecipeContext) => Boolean(
    context.workspaceId && editorScope.current === context.scope
  );
  const requireEditingRecipeRefresh = (context: RecipeContext) => {
    if (!isCurrentRecipeContext(context)) return;
    recipeRefreshLocks.current.add(JSON.stringify([context.workspaceId, context.recipeId]));
    editingRecipeNeedsRefreshRef.current = true;
    setEditingRecipeNeedsRefresh(true);
  };
  const ensureRecipeMutationAllowed = (context: RecipeContext) => {
    if (!isCurrentRecipeContext(context)) return false;
    if (context.recipeId && recipeRefreshLocks.current.has(JSON.stringify([context.workspaceId, context.recipeId]))) throw new Error('Recipe refresh required');
    if (!auth.isAuthenticated || !auth.token) {
      void router.push('/auth/signin');
      throw new Error('Authentication required');
    }
    return true;
  };
  const recipeHeaders = (context: RecipeContext) => ({
    'Authorization': `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
    'X-Workspace-ID': context.workspaceId,
  });

  const deleteRecipe = async () => {
    const context = recipeContext();
    if (!showModal || !context.recipeId || !ensureRecipeMutationAllowed(context)) return;
    try {
      const response = await fetcher(`/api/recipes/${context.recipeId}`, {
        method: 'DELETE', headers: recipeHeaders(context),
      });
      if (!isCurrentRecipeContext(context)) return;
      if (response) {
        void loadRecipes();
        setShowModal(false);
        success(t('recipeDeleted'));
      } else showError(t('failedToDeleteRecipe'));
    } catch (error) {
      if (isCurrentRecipeContext(context)) showError(t('failedToDeleteRecipe'));
    }
  };

  const cloneRecipe = async () => {
    const context = recipeContext();
    if (!showModal || !context.recipeId || !ensureRecipeMutationAllowed(context)) return;
    const recipeIngredients = editingRecipe.recipe_ingredients || [];
    if (!Array.isArray(recipeIngredients)) {
      showError(t('invalidRecipeFormat'));
      return;
    }
    const request = {
      headers: recipeHeaders(context),
      body: JSON.stringify({ name: `${editingRecipe.name} (Copy)`, planned_yield_g: editingRecipe.planned_yield_g ?? null }),
      ingredientBodies: recipeIngredients.filter(ingredient => ingredient.ingredient_id).map(ingredient => JSON.stringify({
        ingredient_id: ingredient.ingredient_id, quantity: ingredient.quantity, unit: ingredient.unit,
      })),
    };
    try {
      await createRecipeWithIngredients(request, fetcher);
      if (!isCurrentRecipeContext(context)) return;
      void loadRecipes();
      setShowModal(false);
      success(t('recipeCloned'));
    } catch (error) {
      if (!isCurrentRecipeContext(context)) return;
      showError(t('failedToCloneRecipe'));
      throw error;
    }
  };

  const refreshEditingRecipe = async (recipeId: number, context = recipeContext()) => {
    if (!isCurrentRecipeContext(context) || context.recipeId !== recipeId) return;
    if (!auth.isAuthenticated || !auth.token) {
      void router.push('/auth/signin');
      throw new Error('Authentication required');
    }
    const updatedRecipe = await fetcher(`/api/recipes/${recipeId}`, { headers: recipeHeaders(context) });
    if (!isCurrentRecipeContext(context)) return;
    if (!updatedRecipe || updatedRecipe.id !== recipeId) throw new Error('Recipe refresh failed');
    setEditingRecipe(updatedRecipe);
    recipeRefreshLocks.current.delete(JSON.stringify([context.workspaceId, context.recipeId]));
    editingRecipeNeedsRefreshRef.current = false;
    setEditingRecipeNeedsRefresh(false);
    await loadRecipes();
  };

  const refreshAfterIngredientWrite = async (context: RecipeContext) => {
    await refreshEditingRecipe(context.recipeId!, context);
    if (!isCurrentRecipeContext(context)) return;
    await invalidateCosting(context.workspaceId);
  };

  const addIngredientToEditingRecipe = async (ingredient: { ingredient_id: number; quantity: string; unit: string }) => {
    const context = recipeContext();
    if (!showModal || !context.recipeId || !ensureRecipeMutationAllowed(context)) return;
    await commitEditorWrite({
      write: () => fetcher(`/api/recipes/${context.recipeId}/ingredients`, {
        method: 'POST', headers: recipeHeaders(context), body: JSON.stringify(ingredient),
      }),
      acknowledge: () => undefined,
      refresh: () => refreshAfterIngredientWrite(context),
      requireRefresh: () => requireEditingRecipeRefresh(context),
      isCurrent: () => isCurrentRecipeContext(context),
    });
  };

  const deleteIngredientFromEditingRecipe = async (ingredientId: number) => {
    const context = recipeContext();
    if (!showModal || !context.recipeId || !ensureRecipeMutationAllowed(context)) return;
    await commitEditorWrite({
      write: () => fetcher(`/api/recipes/${context.recipeId}/ingredients/${ingredientId}`, {
        method: 'DELETE', headers: recipeHeaders(context),
      }),
      acknowledge: () => undefined,
      refresh: () => refreshAfterIngredientWrite(context),
      requireRefresh: () => requireEditingRecipeRefresh(context),
      isCurrent: () => isCurrentRecipeContext(context),
    });
  };

  const handleCreateRecipe = async (name: string, ingredients: any[], plannedYield?: number | null) => {
    const context = recipeContext();
    if (!showCreateModal || !ensureRecipeMutationAllowed(context)) return;
    const request = {
      headers: recipeHeaders(context),
      body: JSON.stringify({ name, planned_yield_g: plannedYield ?? null }),
      ingredientBodies: ingredients.map(ingredient => JSON.stringify({
        ingredient_id: ingredient.id, quantity: ingredient.quantity, unit: ingredient.unit.value,
      })),
    };
    try {
      await createRecipeWithIngredients(request, fetcher);
      if (!isCurrentRecipeContext(context)) return;
      void loadRecipes();
      setShowCreateModal(false);
      success(t('recipeCreated'));
    } catch (error) {
      if (!isCurrentRecipeContext(context)) return;
      showError(t(error instanceof Error && error.message === 'Failed to add ingredient' ? 'failedToAddIngredient' : 'failedToCreateRecipe'));
      throw error;
    }
  };

  const handleYieldSaved = (updated: any) => {
    const context = recipeContext();
    if (isCurrentRecipeContext(context) && showModal && updated?.id === context.recipeId) setEditingRecipe(updated);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterIngredient('');
  };

  const selectedRecipe = useMemo(
    () => filteredRecipes.find((recipe) => recipe.id === selectedRecipeId) || null,
    [filteredRecipes, selectedRecipeId]
  );

  const hasActiveFilters = searchTerm.trim() || filterIngredient;
  const hasLoadedRecipes = recipesWorkspaceId === selectedWorkspaceId && loadedFilter === String(filterIngredient);
  const hasReadError = filteredReadError || recipesError || ingredientsError;
  const referencesUnavailable = !workspaceIngredients || Boolean(ingredientsError);
  const retryReads = () => {
    void Promise.allSettled([mutateRecipeNames(), mutateIngredients(), ...(filterIngredient ? [loadRecipes()] : [])]);
  };
  const ingredientFilterLabel = filterIngredient
    ? ingredients?.find((ingredient: any) => ingredient.id === parseInt(filterIngredient))?.name
    : '';

  const getRecipeIngredients = (recipe: any) =>
    Array.isArray(recipe?.recipe_ingredients) ? recipe.recipe_ingredients : [];

  const isMissingCost = (value: any) => {
    const numericValue = typeof value === 'number' ? value : parseFloat(value);
    return !Number.isFinite(numericValue) || numericValue < 0;
  };

  const formatCost = (value: any) => {
    if (isMissingCost(value)) {
      return `N/A ${selectedCurrency || ''}`;
    }

    const numericValue = typeof value === 'number' ? value : parseFloat(value);
    return `${numericValue.toFixed(2)} ${selectedCurrency || ''}`;
  };

  const getMissingCostCount = (recipe: any) =>
    getRecipeIngredients(recipe).filter((ingredient: any) => ingredient.cost_status === 'incomplete' || isMissingCost(ingredient.calculated_cost)).length;

  const renderRecipeDetails = (recipe: any, variant: 'desktop' | 'mobile') => {
    const recipeIngredients = getRecipeIngredients(recipe);
    const missingCostCount = getMissingCostCount(recipe);

    return (
      <div className={`recipe-detail-panel recipe-detail-panel-${variant}`}>
        <div className="recipe-detail-header">
          <div>
            <h2 className="recipe-detail-title">{recipe.name}</h2>
            <div className="recipe-detail-meta">
              <span>{formatCount(t, recipeIngredients.length, 'ingredient')}</span>
              {missingCostCount > 0 && (
                <span className="recipe-warning-chip">
                  <FaExclamationTriangle size={12} />
                  {formatCount(t, missingCostCount, 'missingCost')}
                </span>
              )}
            </div>
          </div>
          <div className="recipe-detail-cost">
            <span className="recipe-cost-label">{recipe.cost_estimate?.status === 'complete' ? t('costingIngredientSubtotal') : t('costingKnownSubtotal')}</span>
            <strong>{formatCost(recipe.total_cost)}</strong>
          </div>
        </div>

        <div className="mb-3 small">
          <p className="mb-1">{t('costingPlannedYield')}: <strong>{t('costingGramsValue', { weight: recipe.planned_yield_g ?? t('costingUnknown') })}</strong></p>
          {recipe.cost_estimate?.status === 'complete' && recipe.cost_estimate.cost_per_gram != null ? <p>{t('costingFinishedContent')}: {(recipe.cost_estimate.cost_per_gram * 1000).toFixed(2)} {selectedCurrency || ''} / kg</p> : <div className="alert alert-warning py-2">{t('costingIncompleteContent')}: {costIssues(recipe.cost_estimate, t)}</div>}
        </div>
        {recipeIngredients.length > 0 ? (
          <div className="recipe-detail-table">
            <div className="recipe-detail-table-head">
              <span>{t('ingredient')}</span>
              <span>{t('quantity')}</span>
              <span>{t('cost')}</span>
            </div>
            {recipeIngredients.map((ri: any) => (
              <div key={ri.id || ri.ingredient_id} className="recipe-detail-row">
                <span className="recipe-detail-ingredient">{ri.ingredient?.name || t('unknown')}</span>
                <span className="recipe-detail-quantity">{ri.quantity} {ri.unit}</span>
                <span className={ri.cost_status === 'incomplete' || isMissingCost(ri.calculated_cost) ? 'recipe-detail-cost-missing' : ''}>
                  {ri.cost_status === 'incomplete' ? t('costingUnavailable') : formatCost(ri.calculated_cost)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-ingredients">{t('noIngredientsAvailable')}</div>
        )}

        <div className="recipe-detail-actions">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => {
              setCalculatorRecipe(recipe);
              setShowCalculator(true);
            }}
          >
            <FaCalculator className="me-2" />
            {t('calculate')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={referencesUnavailable}
            onClick={() => {
              setEditingRecipe(recipe);
              setShowModal(true);
            }}
          >
            <FaEdit className="me-2" />
            {t('edit')}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header recipe-page-header">
        <div className="recipe-page-heading">
          <h1 className="page-title d-flex align-items-center gap-3">
            <FaUtensils className="text-primary" />
            {t('recipes')}
          </h1>
          <div className="page-subtitle">
            {t('total')}: {formatCount(t, recipeNames?.length || 0, 'recipe')}
            {hasActiveFilters && (
              <span className="text-tertiary"> / {t('filtered').toLowerCase()}</span>
            )}
          </div>
        </div>
        <Button
          className="btn btn-primary recipe-page-add-button"
          onClick={() => setShowCreateModal(true)}
          disabled={referencesUnavailable}
        >
          <FaPlus className="me-2" />
          {t('addRecipe')}
        </Button>
      </div>

      <FilterBar className="recipe-filter-strip" mobileCollapsible activeCount={[searchTerm.trim(), filterIngredient].filter(Boolean).length} summary={[searchTerm.trim(), ingredientFilterLabel].filter(Boolean).join(' · ')} onClear={clearFilters}>
        <SearchFilter
          label={t('searchRecipes')}
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder={t('searchByName')}
        />
        <div className="filter-group">
          <SelectDropdown
            value={
              filterIngredient
                ? { value: filterIngredient, label: ingredients?.find((ingredient: any) => ingredient.id === parseInt(filterIngredient))?.name }
                : null
            }
            onChange={(selectedOption: any) => setFilterIngredient(selectedOption ? selectedOption.value : '')}
            options={
              ingredients
                ? ingredients.map((ingredient: any) => ({
                    value: ingredient.id,
                    label: ingredient.name,
                  }))
                : []
            }
            isClearable
            isDisabled={referencesUnavailable}
            placeholder={t('allIngredients')}
            label={t('ingredient')}
          />
        </div>
        <div className="recipe-filter-summary">
          {filteredRecipes.length} {t('of')} {formatCount(t, recipeNames?.length || 0, 'recipe')}
        </div>
        <ClearFiltersButton
          label={t('clear')}
          onClick={clearFilters}
          visible={!!hasActiveFilters}
        />
      </FilterBar>

      {hasReadError && <ErrorState message={t(ingredientsError && !recipesError && !filteredReadError ? 'uiRecipeReferencesUnavailable' : 'failedToLoadRecipes')} compact={hasLoadedRecipes} onRetry={retryReads} />}

      {/* Recipes Grid */}
      {!hasLoadedRecipes && hasReadError ? null : isLoading && !hasLoadedRecipes ? (
        <div className="recipe-workbench recipe-workbench-loading">
          {Array.from({ length: 6 }).map((_, index) => (
            <RecipeCardSkeleton key={index} />
          ))}
        </div>
      ) : filteredRecipes.length === 0 ? (
        <EmptyState
          type="recipes"
          message={hasActiveFilters ? t('noRecipesFound') : t('noRecipes')}
          actionLabel={hasActiveFilters ? t('clear') : !referencesUnavailable ? t('addRecipe') : undefined}
          onAction={hasActiveFilters ? clearFilters : () => setShowCreateModal(true)}
        />
      ) : (
        <div className="recipe-workbench">
          <div className="recipe-list-panel" aria-label={t('recipes')}>
            {hasActiveFilters && (
              <div className="recipe-active-filters">
                {searchTerm.trim() && (
                  <span>{t('search')}: {searchTerm.trim()}</span>
                )}
                {ingredientFilterLabel && (
                  <span>{t('ingredient')}: {ingredientFilterLabel}</span>
                )}
              </div>
            )}
            {filteredRecipes.map((recipe) => {
              const recipeIngredients = getRecipeIngredients(recipe);
              const missingCostCount = getMissingCostCount(recipe);
              const isSelected = recipe.id === selectedRecipeId;

              return (
                <div
                  key={recipe.id}
                  className={`recipe-list-item ${isSelected ? 'is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="recipe-list-button"
                    onClick={() => setSelectedRecipeId(recipe.id)}
                    aria-pressed={isSelected}
                  >
                    <span className="recipe-list-name">{recipe.name}</span>
                    <span className="recipe-list-cost">{recipe.cost_estimate?.status === 'complete' ? `${t('costingIngredientSubtotal')}: ` : `${t('costingKnownSubtotal')}: `}{formatCost(recipe.total_cost)}</span>
                    <span className="recipe-list-meta">
                      {formatCount(t, recipeIngredients.length, 'ingredient')}
                      {missingCostCount > 0 && ` · ${formatCount(t, missingCostCount, 'missingCost')}`}
                    </span>
                  </button>
                  {isSelected && renderRecipeDetails(recipe, 'mobile')}
                </div>
              );
            })}
          </div>

          {selectedRecipe && renderRecipeDetails(selectedRecipe, 'desktop')}
        </div>
      )}

      <RecipeBuilderModal
        mode="edit"
        show={showModal}
        onHide={() => setShowModal(false)}
        recipe={editingRecipe}
        workspaceIngredients={workspaceIngredients || []}
        t={t}
        onDeleteRecipe={deleteRecipe}
        onCloneRecipe={cloneRecipe}
        onYieldSaved={handleYieldSaved}
        refreshRequired={editingRecipeNeedsRefresh || editingRecipeNeedsRefreshRef.current}
        onRefreshRequired={() => requireEditingRecipeRefresh(recipeContext())}
        onRefresh={() => editingRecipe?.id ? refreshEditingRecipe(editingRecipe.id) : Promise.resolve()}
        onAddIngredientToRecipe={addIngredientToEditingRecipe}
        onDeleteIngredientFromRecipe={deleteIngredientFromEditingRecipe}
      />

      <RecipeBuilderModal
        mode="create"
        show={showCreateModal}
        onHide={() => setShowCreateModal(false)}
        workspaceIngredients={workspaceIngredients || []}
        t={t}
        onCreateRecipe={handleCreateRecipe}
      />

      <RecipeCalculator
        show={showCalculator}
        onHide={() => setShowCalculator(false)}
        recipe={calculatorRecipe}
        t={t}
      />
    </div>
  );
};

export default withAuth(Recipes);
