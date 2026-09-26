import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import fetcher from '../utils/fetcher';
import useTranslation from 'next-translate/useTranslation';
import { Form, Button, Table } from 'react-bootstrap';
import TableSkeleton from '../components/skeletons/TableSkeleton';
import EmptyState from '../components/EmptyState';
import IngredientTypeBadge from '../components/IngredientTypeBadge';
import { useRouter } from 'next/router';
import { FaPlus, FaDollarSign, FaSortAmountDown, FaSortAmountUp } from 'react-icons/fa';
import AddPriceModal from '../components/modal/Prices/AddPriceModal';
import { useAuth } from '../utils/authContext';
import { Ingredient, Price, WorkspaceIngredient } from '../types/api';
import SelectDropdown from '../components/SelectDropdown';
import { useWorkspace } from '../utils/workspaceContext';
import { workspaceFetcher, workspaceKey } from '../utils/workspaceSWR';
import { ClearFiltersButton, FilterBar, FilterField } from '../components/filters/FilterBar';

const formatLocalDateInputValue = (dateValue: string) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parsePositiveDecimal = (value: string) => {
  const normalizedValue = value.trim();
  if (!/^(?:\d+|\d+\.\d+|\.\d+)$/.test(normalizedValue)) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
};

const Prices = () => {
  const { t, lang } = useTranslation('common');
  const { auth } = useAuth();
  const { selectedWorkspaceId, selectedCurrency, isWorkspaceReady } = useWorkspace();
  const { data: workspaceIngredients, error: ingredientsError } = useSWR<WorkspaceIngredient[]>(
    workspaceKey('/api/workspace-ingredients', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const { data: prices, error: pricesError, mutate: mutatePrices } = useSWR<Price[]>(
    workspaceKey('/api/prices', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const ingredients = useMemo(
    () => workspaceIngredients?.map((workspaceIngredient) => workspaceIngredient.ingredient) || [],
    [workspaceIngredients]
  );

  const [filterIngredientId, setFilterIngredientId] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showAddModal, setShowAddModal] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (router.locale !== lang) {
      router.push(router.pathname, router.asPath, { locale: lang });
    }
  }, [lang, router]);

  const ingredientOptions = useMemo(
    () => ingredients.map((ingredient: Ingredient) => ({ value: ingredient.id, label: ingredient.name })),
    [ingredients]
  );
  const priceSortOptions = useMemo(
    () => [
      { value: 'ingredient.type', label: t('ingredientType') },
      { value: 'ingredient.name', label: t('ingredientName') },
      { value: 'price', label: t('price') },
      { value: 'quantity', label: t('quantity') },
      { value: 'unit', label: t('unit') },
      { value: 'date', label: t('date') },
    ],
    [t]
  );

  useEffect(() => {
    if (!router.isReady || ingredientOptions.length === 0) {
      return;
    }

    const queryIngredientId = Array.isArray(router.query.ingredient_id)
      ? router.query.ingredient_id[0]
      : router.query.ingredient_id;

    if (queryIngredientId && ingredientOptions.some(option => String(option.value) === queryIngredientId)) {
      setFilterIngredientId(queryIngredientId);
    }
  }, [ingredientOptions, router.isReady, router.query.ingredient_id]);

  const handleAddPrice = async (priceData: {
    ingredient_id: number;
    price: string;
    quantity: string;
    unit: string;
  }) => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth/signin');
      return;
    }

    try {
      const currentDate = new Date().toISOString();
      const price = parsePositiveDecimal(priceData.price);
      const quantity = parsePositiveDecimal(priceData.quantity);

      if (price === null) {
        throw new Error(t('validPriceRequired'));
      }

      if (quantity === null) {
        throw new Error(t('validQuantityRequired'));
      }

      const requestData = {
        ingredient_id: priceData.ingredient_id,
        price,
        quantity,
        unit: priceData.unit,
        date: currentDate
      };

      const response = await fetcher('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response || response.error) {
        throw response || { error: 'Failed to add price' };
      }

      mutatePrices();
    } catch (error) {
      throw error;
    }
  };

  const clearFilters = () => {
    setFilterIngredientId('');
    setFilterDate('');
  };

  const sortPrices = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const hasActiveFilters = filterIngredientId || filterDate;

  const hasError = ingredientsError || pricesError;
  const isLoading = !isWorkspaceReady || !workspaceIngredients || !prices;

  const filteredPrices = useMemo(() => {
    const rows = [...(prices || [])].filter((price) => {
      const ingredientMatch = !filterIngredientId || String(price.ingredient_id) === filterIngredientId;
      const dateMatch = !filterDate || formatLocalDateInputValue(price.date) === filterDate;
      return ingredientMatch && dateMatch;
    });

    if (!sortColumn) {
      return rows;
    }

    const direction = sortDirection === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      const getValue = (price: Price) => {
        switch (sortColumn) {
          case 'ingredient.type':
            return price.ingredient.type;
          case 'ingredient.name':
            return price.ingredient.name;
          case 'price':
            return price.price;
          case 'quantity':
            return price.quantity;
          case 'unit':
            return price.unit;
          case 'date':
            return new Date(price.date).getTime();
          default:
            return '';
        }
      };

      const left = getValue(a);
      const right = getValue(b);

      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * direction;
      }

      return String(left).localeCompare(String(right), router.locale) * direction;
    });
  }, [filterDate, filterIngredientId, prices, router.locale, sortColumn, sortDirection]);

  return (
    <div className="page-container prices-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title d-flex align-items-center gap-3">
            <FaDollarSign className="text-primary" />
            {t('prices')}
          </h1>
          {!isLoading && (
            <p className="page-subtitle">
              {t('total')}: {prices?.length || 0} {t('prices').toLowerCase()}
              {hasActiveFilters && (
                <span className="text-tertiary"> / {filteredPrices.length} {t('filtered').toLowerCase()}</span>
              )}
            </p>
          )}
        </div>
        <Button
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          <FaPlus className="me-2" />
          {t('addPrice')}
        </Button>
      </div>

      {/* Filter Section */}
      <FilterBar>
        <div className="filter-group">
          <SelectDropdown
            value={ingredientOptions.find(option => String(option.value) === filterIngredientId) || null}
            onChange={(option) => setFilterIngredientId(option ? String(option.value) : '')}
            options={ingredientOptions}
            isClearable
            placeholder={t('allIngredients')}
            label={t('ingredient')}
          />
        </div>
        <FilterField label={t('date')}>
          <Form.Control
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="form-control filter-control"
          />
        </FilterField>
        <ClearFiltersButton
          label={t('clear')}
          onClick={clearFilters}
          visible={!!hasActiveFilters}
        />
      </FilterBar>

      <div className="mobile-sort-bar">
        <div className="filter-group">
          <SelectDropdown
            value={priceSortOptions.find(option => option.value === sortColumn) || null}
            onChange={(option) => {
              setSortColumn(option ? option.value : '');
              setSortDirection('asc');
            }}
            options={priceSortOptions}
            isClearable
            placeholder={t('chooseSort')}
            label={t('sortBy')}
          />
        </div>
        <Button
          variant="outline-secondary"
          type="button"
          onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
          disabled={!sortColumn}
          className="mobile-sort-direction"
          aria-label={sortDirection === 'asc' ? t('ascending') : t('descending')}
        >
          {sortDirection === 'asc' ? <FaSortAmountUp className="me-2" /> : <FaSortAmountDown className="me-2" />}
          {sortDirection === 'asc' ? t('ascending') : t('descending')}
        </Button>
      </div>

      {/* Prices Table */}
      <div className="table-responsive prices-table-wrap">
        {hasError ? (
          <div className="text-center py-5">
            <p className="text-error">
              {ingredientsError ? t('ingredientsError') : t('pricesError')}
            </p>
          </div>
        ) : isLoading ? (
          <TableSkeleton rows={10} columns={6} />
        ) : filteredPrices.length === 0 ? (
          <EmptyState
            type="prices"
            message={hasActiveFilters ? t('noPricesFound') : t('noPrices')}
            actionLabel={t('addPrice')}
            onAction={() => setShowAddModal(true)}
          />
        ) : (
          <Table className="table prices-table">
            <thead>
              <tr>
                <th onClick={() => sortPrices('ingredient.type')} className="cursor-pointer">{t('ingredientType')}</th>
                <th onClick={() => sortPrices('ingredient.name')} className="cursor-pointer">{t('ingredientName')}</th>
                <th onClick={() => sortPrices('price')} className="cursor-pointer">{t('price')}</th>
                <th onClick={() => sortPrices('quantity')} className="cursor-pointer">{t('quantity')}</th>
                <th onClick={() => sortPrices('unit')} className="cursor-pointer">{t('unit')}</th>
                <th onClick={() => sortPrices('date')} className="cursor-pointer">{t('date')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrices.map((price: Price) => (
              <tr key={price.id}>
                <td data-label={t('ingredientType')}>
                  <IngredientTypeBadge type={price.ingredient.type} label={t(price.ingredient.type)} />
                </td>
                <td data-label={t('ingredientName')}>{price.ingredient.name}</td>
                <td className="fw-semibold" data-label={t('price')}>{price.price} {selectedCurrency || ''}</td>
                <td data-label={t('quantity')}>{price.quantity}</td>
                <td data-label={t('unit')}>{t(price.unit)}</td>
                <td className="text-secondary small" data-label={t('date')}>
                  {new Date(price.date).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        )}
      </div>

      <AddPriceModal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddPrice}
        workspaceIngredients={workspaceIngredients || []}
      />
    </div>
  );
};

export default Prices;
