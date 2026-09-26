import React, { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button, Table } from 'react-bootstrap';
import useTranslation from 'next-translate/useTranslation';
import fetcher from '../utils/fetcher';
import EmptyState from '../components/EmptyState';
import IngredientTypeBadge from '../components/IngredientTypeBadge';
import { useRouter } from 'next/router';
import { useAuth, withAuth } from '../utils/authContext';
import { FaPlus, FaList, FaHistory } from 'react-icons/fa';
import AddIngredientModal from '../components/modal/Ingredients/AddIngredientModal';
import { WorkspaceIngredient } from '../types/api';
import { useWorkspace } from '../utils/workspaceContext';
import { workspaceFetcher, workspaceKey } from '../utils/workspaceSWR';
import { getIngredientTypeOptions } from '../utils/ingredientTypes';
import { ClearFiltersButton, FilterBar, FilterChipGroup, SearchFilter } from '../components/filters/FilterBar';

type PriceStateFilter = 'all' | 'missing' | 'priced';

const Ingredients: React.FC = () => {
  const { auth } = useAuth();
  const { selectedWorkspaceId, selectedCurrency, isWorkspaceReady } = useWorkspace();
  const { data: workspaceIngredients, mutate } = useSWR<WorkspaceIngredient[]>(
    workspaceKey('/api/workspace-ingredients', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const { t } = useTranslation('common');
  const [filter, setFilter] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterPriceState, setFilterPriceState] = useState<PriceStateFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const router = useRouter();

  const ingredientTypeOptions = useMemo(() => getIngredientTypeOptions(t, { includeAll: true }), [t]);

  const priceStateOptions: { value: PriceStateFilter; label: string }[] = [
    { value: 'all', label: t('allPriceStates') },
    { value: 'missing', label: t('missingPrice') },
    { value: 'priced', label: t('hasPrice') },
  ];

  const ingredients = workspaceIngredients?.map((workspaceIngredient) => workspaceIngredient.ingredient) || [];

  const handleAddIngredient = async (ingredientData: {
    type: string;
    name: string;
  }) => {
    if (!auth.isAuthenticated || !auth.token) {
      router.push('/auth/signin');
      return;
    }

    try {
      const response = await fetcher('/api/ingredients', {
        method: 'POST',
        body: JSON.stringify(ingredientData),
      });

      if (!response || response.error) {
        throw response || { error: 'Failed to add ingredient' };
      }

      mutate();
    } catch (error: any) {
      if (error?.workspace_linked) {
        mutate();
        return;
      }
      throw error;
    }
  };

  const handleAddExistingIngredient = async (ingredientId: number) => {
    await fetcher('/api/workspace-ingredients', {
      method: 'POST',
      body: JSON.stringify({ ingredient_id: ingredientId }),
    });
    mutate();
  };

  const handleSearchGlobalIngredients = useCallback(async (query: string) => {
    return fetcher(`/api/ingredients/search?query=${encodeURIComponent(query)}`);
  }, []);

  const handleDeactivateIngredient = async (workspaceIngredient: WorkspaceIngredient) => {
    if (!window.confirm(t('confirmRemoveIngredientFromList', { name: workspaceIngredient.ingredient.name }))) {
      return;
    }

    await fetcher(`/api/workspace-ingredients/${workspaceIngredient.id}`, {
      method: 'DELETE',
    });
    mutate();
  };

  const clearFilters = () => {
    setFilter('');
    setFilterType('all');
    setFilterPriceState('all');
  };

  const openPrices = (ingredientId: number) => {
    router.push(
      {
        pathname: '/prices',
        query: { ingredient_id: String(ingredientId) },
      },
      undefined,
      { locale: router.locale }
    );
  };

  const isLoading = !isWorkspaceReady || !workspaceIngredients;

  const filteredIngredients = useMemo(() => {
    return workspaceIngredients?.filter((workspaceIngredient) => {
      const nameMatch = workspaceIngredient.ingredient.name.toLowerCase().includes(filter.toLowerCase());
      const typeMatch = filterType === 'all' || workspaceIngredient.ingredient.type === filterType;
      const priceStateMatch =
        filterPriceState === 'all' ||
        (filterPriceState === 'missing' && !workspaceIngredient.latest_price) ||
        (filterPriceState === 'priced' && !!workspaceIngredient.latest_price);

      return nameMatch && typeMatch && priceStateMatch;
    }) || [];
  }, [filter, filterPriceState, filterType, workspaceIngredients]);

  const hasActiveFilters = !!filter || filterType !== 'all' || filterPriceState !== 'all';

  return (
    <div className="page-container ingredients-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title d-flex align-items-center gap-3">
            <FaList className="text-primary" />
            {t('ingredients')}
          </h1>
          {!isLoading && (
            <p className="page-subtitle">
              {t('total')}: {ingredients?.length || 0} {t('ingredients').toLowerCase()}
              {hasActiveFilters && (
                <span className="text-tertiary"> / {filteredIngredients.length} {t('filtered').toLowerCase()}</span>
              )}
            </p>
          )}
        </div>
        <Button
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          <FaPlus className="me-2" />
          {t('addIngredient')}
        </Button>
      </div>

      {/* Filter Section */}
      <FilterBar className="ingredients-filter-bar">
        <SearchFilter
          label={t('search')}
          value={filter}
          onChange={setFilter}
          placeholder={t('filterIngredients')}
        />
        <FilterChipGroup
          label={t('type')}
          options={ingredientTypeOptions}
          value={filterType}
          onChange={setFilterType}
          ariaLabel={t('type')}
          className="ingredients-chip-filter"
        />
        <FilterChipGroup
          label={t('priceState')}
          options={priceStateOptions}
          value={filterPriceState}
          onChange={(value) => setFilterPriceState(value as PriceStateFilter)}
          ariaLabel={t('priceState')}
          className="ingredients-chip-filter"
        />
        <ClearFiltersButton
          label={t('clear')}
          onClick={clearFilters}
          visible={hasActiveFilters}
        />
      </FilterBar>

      {/* Ingredients List */}
      {isLoading ? (
        <div className="text-center py-5">
          <p className="text-secondary">{t('loading')}</p>
        </div>
      ) : filteredIngredients.length === 0 ? (
        <EmptyState
          type="ingredients"
          message={hasActiveFilters ? t('noIngredientsFound') : t('noIngredients')}
          actionLabel={t('addIngredient')}
          onAction={() => setShowAddModal(true)}
        />
      ) : (
        <div className="table-responsive ingredients-table-wrap">
          <Table className="table workspace-ingredients-table">
            <thead>
              <tr>
                <th>{t('name')}</th>
                <th>{t('type')}</th>
                <th>{t('latestPrice')}</th>
                <th>{t('priceState')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredIngredients.map((workspaceIngredient) => (
                <tr key={workspaceIngredient.id}>
                  <td className="fw-medium" data-label={t('name')}>{workspaceIngredient.ingredient.name}</td>
                  <td data-label={t('type')}>
                    <IngredientTypeBadge
                      type={workspaceIngredient.ingredient.type}
                      label={t(workspaceIngredient.ingredient.type)}
                    />
                  </td>
                  <td data-label={t('latestPrice')}>
                    {workspaceIngredient.latest_price ? (
                      <div className="text-secondary small">
                        <div>
                          {workspaceIngredient.latest_price.price} {selectedCurrency || ''} / {workspaceIngredient.latest_price.quantity} {t(workspaceIngredient.latest_price.unit)}
                        </div>
                        <div className="text-tertiary">
                          {t('latestPriceDate', {
                            date: new Date(workspaceIngredient.latest_price.date).toLocaleDateString(router.locale),
                          })}
                        </div>
                      </div>
                    ) : (
                      <span className="text-tertiary small">{t('noLatestPrice')}</span>
                    )}
                  </td>
                  <td data-label={t('priceState')}>
                    <span className={`price-state-badge ${workspaceIngredient.latest_price ? 'is-priced' : 'is-missing'}`}>
                      {workspaceIngredient.latest_price ? t('hasPrice') : t('missingPrice')}
                    </span>
                  </td>
                  <td data-label={t('actions')}>
                    <div className="ingredient-actions">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => openPrices(workspaceIngredient.ingredient.id)}
                      >
                        <FaHistory className="me-2" />
                        {t('openPrices')}
                      </Button>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => handleDeactivateIngredient(workspaceIngredient)}
                      >
                        {t('removeFromIngredientList')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <AddIngredientModal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddIngredient}
        onAddExisting={handleAddExistingIngredient}
        onSearchGlobalIngredients={handleSearchGlobalIngredients}
        existingIngredients={ingredients || []}
      />
    </div>
  );
};

export default withAuth(Ingredients);
