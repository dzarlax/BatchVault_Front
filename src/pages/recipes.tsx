import React, { useState, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';
import fetcher from '../utils/fetcher';
import useTranslation from 'next-translate/useTranslation';
import { Button } from 'react-bootstrap';
import RecipeBuilderModal from '../components/modal/Recipe/RecipeBuilderModal';
import RecipeCalculator from '../components/calculator/RecipeCalculator';
import RecipeCardSkeleton from '../components/skeletons/RecipeCardSkeleton';
import EmptyState from '../components/EmptyState';
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

const Recipes: React.FC = () => {
  const { auth } = useAuth();
  const { selectedWorkspaceId, selectedCurrency, isWorkspaceReady } = useWorkspace();
  const { t } = useTranslation('common');
  const { success, error: showError } = useNotification();
  const router = useRouter();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [recipesWorkspaceId, setRecipesWorkspaceId] = useState<string | null>(null);
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

  // Fetch списков рецептов и ингредиентов
  const { data: recipeNames } = useSWR(
    workspaceKey('/api/recipes', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const { data: workspaceIngredients } = useSWR<WorkspaceIngredient[]>(
    workspaceKey('/api/workspace-ingredients', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const ingredients = useMemo(
    () => workspaceIngredients?.map((workspaceIngredient) => workspaceIngredient.ingredient) || [],
    [workspaceIngredients]
  );

  useEffect(() => {
    if (!isWorkspaceReady || !selectedWorkspaceId) {
      setIsLoading(true);
      return;
    }
    if (filterIngredient) {
      setIsLoading(true);
      if (workspaceIngredients === undefined) return;
      loadRecipes();
    } else if (recipeNames !== undefined && workspaceIngredients !== undefined) {
      setRecipes(recipeNames || []);
      setRecipesWorkspaceId(selectedWorkspaceId);
      setIsLoading(false);
    }
  }, [filterIngredient, recipeNames, workspaceIngredients, selectedWorkspaceId, isWorkspaceReady]);

  const filteredRecipes = useMemo(() => {
    if (!isWorkspaceReady || !selectedWorkspaceId || recipesWorkspaceId !== selectedWorkspaceId) return [];
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return recipes;

    return recipes.filter((recipe) =>
      String(recipe.name || '').toLowerCase().includes(normalizedSearch)
    );
  }, [isWorkspaceReady, recipesWorkspaceId, recipes, searchTerm, selectedWorkspaceId]);

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
    if (!workspaceId || !isWorkspaceReady) return;
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

      if (response && selectedWorkspaceIdRef.current === workspaceId) {
        setRecipes(response);
        setRecipesWorkspaceId(workspaceId);
        setIsLoading(false);
      } else {
        if (selectedWorkspaceIdRef.current === workspaceId) showError(t('failedToLoadRecipes'));
      }
    } catch (error) {
      if (selectedWorkspaceIdRef.current === workspaceId) {
        setIsLoading(false);
        showError(t('failedToLoadRecipes'));
      }
    }
  };

  const deleteRecipe = async () => {
    if (!editingRecipe) return;
    try {
      if (!auth.isAuthenticated || !auth.token) {
        router.push('/auth/signin');
        return;
      }

      const response = await fetcher(`/api/recipes/${editingRecipe.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response) {
        loadRecipes();
        setShowModal(false);
        success(t('recipeDeleted'));
      } else {
        showError(t('failedToDeleteRecipe'));
      }
    } catch (error) {
      showError(t('failedToDeleteRecipe'));
    }
  };

  const cloneRecipe = async () => {
    if (!editingRecipe) return;

    if (!auth.isAuthenticated || !auth.token) {
      router.push('/auth/signin');
      return;
    }

    // Инициализация поля recipe_ingredients как пустого массива, если оно отсутствует
    const recipeIngredients = editingRecipe.recipe_ingredients || [];

    if (!Array.isArray(recipeIngredients)) {
      showError(t('invalidRecipeFormat'));
      return;
    }

    // Создаем копию рецепта с новым именем
    const response = await fetcher('/api/recipes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: `${editingRecipe.name} (Copy)`, ingredients: [] }),
    });

    if (response) {
      const newRecipe = response;

      // Добавляем ингредиенты в новый рецепт
      for (const ingredient of recipeIngredients) {
        if (ingredient.ingredient_id) {  // Используем правильный идентификатор ингредиента
          await fetcher(`/api/recipes/${newRecipe.id}/ingredients`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${auth.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ingredient_id: ingredient.ingredient_id,  // Используем поле ingredient_id
              quantity: ingredient.quantity,
              unit: ingredient.unit,
            }),
          });
        } else {
          console.warn('Missing ingredient ID:', ingredient);
        }
      }

      loadRecipes();
      setShowModal(false);
      success(t('recipeCloned'));
    } else {
      showError(t('failedToCloneRecipe'));
    }
  };

  const refreshEditingRecipe = async (recipeId: number) => {
    if (!auth.isAuthenticated || !auth.token) {
      router.push('/auth/signin');
      throw new Error('Authentication required');
    }

    const updatedRecipe = await fetcher(`/api/recipes/${recipeId}`, {
      headers: {
        'Authorization': `Bearer ${auth.token}`,
      },
    });

    setEditingRecipe(updatedRecipe);
    await loadRecipes();
  };

  const addIngredientToEditingRecipe = async (ingredient: {
    ingredient_id: number;
    quantity: string;
    unit: string;
  }) => {
    if (!editingRecipe) return;

    if (!auth.isAuthenticated || !auth.token) {
      router.push('/auth/signin');
      throw new Error('Authentication required');
    }

    await fetcher(`/api/recipes/${editingRecipe.id}/ingredients`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ingredient),
    });

    await refreshEditingRecipe(editingRecipe.id);
  };

  const deleteIngredientFromEditingRecipe = async (ingredientId: number) => {
    if (!editingRecipe) return;

    if (!auth.isAuthenticated || !auth.token) {
      router.push('/auth/signin');
      throw new Error('Authentication required');
    }

    await fetcher(`/api/recipes/${editingRecipe.id}/ingredients/${ingredientId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
    });

    await refreshEditingRecipe(editingRecipe.id);
  };

  const handleCreateRecipe = async (name: string, ingredients: any[]) => {
    try {
      if (!auth.isAuthenticated || !auth.token) {
        router.push('/auth/signin');
        throw new Error('Authentication required');
      }

      const response = await fetcher('/api/recipes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (response) {
        const createdRecipe = response;
        const recipeId = createdRecipe.id;

        try {
          for (const ingredient of ingredients) {
            const ingredientResponse = await fetcher(`/api/recipes/${recipeId}/ingredients`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${auth.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ingredient_id: ingredient.id,
                quantity: ingredient.quantity,
                unit: ingredient.unit.value,
              }),
            });

            if (!ingredientResponse) {
              throw new Error('Failed to add ingredient');
            }
          }
        } catch (ingredientError) {
          await fetcher(`/api/recipes/${recipeId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${auth.token}`,
              'Content-Type': 'application/json',
            },
          }).catch(() => undefined);

          showError(t('failedToAddIngredient'));
          throw new Error('Failed to add ingredient');
        }

        loadRecipes();
        setShowCreateModal(false);
        success(t('recipeCreated'));
      } else {
        showError(t('failedToCreateRecipe'));
        throw new Error('Failed to create recipe');
      }
    } catch (error) {
      if (!(error instanceof Error && error.message === 'Failed to add ingredient')) {
        showError(t('failedToCreateRecipe'));
      }
      throw error;
    }
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
  const ingredientFilterLabel = filterIngredient
    ? ingredients?.find((ingredient: any) => ingredient.id === parseInt(filterIngredient))?.name
    : '';

  const getRecipeIngredients = (recipe: any) =>
    Array.isArray(recipe?.recipe_ingredients) ? recipe.recipe_ingredients : [];

  const isMissingCost = (value: any) => {
    const numericValue = typeof value === 'number' ? value : parseFloat(value);
    return !Number.isFinite(numericValue) || numericValue <= 0;
  };

  const formatCost = (value: any) => {
    if (isMissingCost(value)) {
      return `N/A ${selectedCurrency || ''}`;
    }

    const numericValue = typeof value === 'number' ? value : parseFloat(value);
    return `${numericValue.toFixed(2)} ${selectedCurrency || ''}`;
  };

  const getMissingCostCount = (recipe: any) =>
    getRecipeIngredients(recipe).filter((ingredient: any) => isMissingCost(ingredient.calculated_cost)).length;

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
            <span className="recipe-cost-label">{t('totalCost')}</span>
            <strong>{formatCost(recipe.total_cost)}</strong>
          </div>
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
                <span className={isMissingCost(ri.calculated_cost) ? 'recipe-detail-cost-missing' : ''}>
                  {formatCost(ri.calculated_cost)}
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
        >
          <FaPlus className="me-2" />
          {t('addRecipe')}
        </Button>
      </div>

      <FilterBar className="recipe-filter-strip">
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

      {/* Recipes Grid */}
      {isLoading ? (
        <div className="recipe-workbench recipe-workbench-loading">
          {Array.from({ length: 6 }).map((_, index) => (
            <RecipeCardSkeleton key={index} />
          ))}
        </div>
      ) : filteredRecipes.length === 0 ? (
        <EmptyState
          type="recipes"
          message={hasActiveFilters ? t('noRecipesFound') : t('noRecipes')}
          actionLabel={t('addRecipe')}
          onAction={() => setShowCreateModal(true)}
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
                    <span className="recipe-list-cost">{formatCost(recipe.total_cost)}</span>
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
