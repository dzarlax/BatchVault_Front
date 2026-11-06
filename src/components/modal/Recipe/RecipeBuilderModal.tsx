import React, { useEffect, useMemo, useState } from 'react';
import fetcher from '../../../utils/fetcher';
import { useWorkspace } from '../../../utils/workspaceContext';
import { decimalInput, invalidateCosting } from '../../../utils/costing';
import { Modal, Button, Form } from 'react-bootstrap';
import { FaExclamationTriangle, FaLayerGroup, FaPlus, FaTrash } from 'react-icons/fa';
import { WorkspaceIngredient } from '../../../types/api';
import SelectDropdown from '../../../components/SelectDropdown';
import { formatCount } from '../../../utils/pluralize';
import {
  getWorkspaceIngredientLabel,
  resolveWorkspaceIngredientUnits,
  toUnitOptions,
} from '../../../utils/ingredientUnitContract';

type UnitOption = {
  value: string;
  label: string;
};

type DraftIngredient = {
  id: number;
  name: string;
  type?: string;
  quantity: string;
  unit: UnitOption;
};

type RecipeIngredientRow = {
  id?: number;
  ingredient_id: number;
  quantity: string;
  unit: string;
  ingredient?: {
    name?: string;
    type?: string;
  };
  ingredientCost?: string;
  calculated_cost?: string | number;
};

type RecipeBuilderModalProps = {
  mode: 'create' | 'edit';
  show: boolean;
  onHide: () => void;
  workspaceIngredients?: WorkspaceIngredient[];
  t: (key: string) => string;
  recipe?: any;
  onCreateRecipe?: (name: string, ingredients: DraftIngredient[], plannedYield?: number | null) => Promise<void>;
  onYieldSaved?: (recipe: any) => void;
  onAddIngredientToRecipe?: (ingredient: { ingredient_id: number; quantity: string; unit: string }) => Promise<void>;
  onDeleteIngredientFromRecipe?: (ingredientId: number) => Promise<void>;
  onDeleteRecipe?: () => void;
  onCloneRecipe?: () => void;
};

const getRecipeIngredients = (recipe: any): RecipeIngredientRow[] => (
  Array.isArray(recipe?.recipe_ingredients) ? recipe.recipe_ingredients : []
);

const isDraftIngredient = (
  ingredient: DraftIngredient | RecipeIngredientRow
): ingredient is DraftIngredient => 'name' in ingredient;

const RecipeBuilderModal: React.FC<RecipeBuilderModalProps> = ({
  mode,
  show,
  onHide,
  workspaceIngredients = [],
  t,
  recipe,
  onCreateRecipe, onYieldSaved,
  onAddIngredientToRecipe,
  onDeleteIngredientFromRecipe,
  onDeleteRecipe,
  onCloneRecipe,
}) => {
  const isEdit = mode === 'edit';
  const [recipeName, setRecipeName] = useState('');
  const [plannedYield, setPlannedYield] = useState('');
  const { selectedWorkspaceId } = useWorkspace();
  useEffect(() => { setPlannedYield(recipe?.planned_yield_g == null ? '' : String(recipe.planned_yield_g)); }, [show, recipe?.id, recipe?.planned_yield_g, selectedWorkspaceId]);
  const saveYield = async () => {
    const value = plannedYield.trim() ? decimalInput(plannedYield) : null;
    if (plannedYield.trim() && (value == null || value <= 0)) { setFormError('Planned yield must be positive grams.'); return; }
    setIsSaving(true); setFormError('');
    try {
      const updated = await fetcher(`/api/recipes/${recipe.id}`, { method: 'PATCH', headers: { 'X-Workspace-ID': selectedWorkspaceId }, body: JSON.stringify({ planned_yield_g: value }) });
      onYieldSaved?.(updated); await invalidateCosting(selectedWorkspaceId);
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Failed to save planned yield'); }
    finally { setIsSaving(false); }
  };
  const [draftIngredients, setDraftIngredients] = useState<DraftIngredient[]>([]);
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<UnitOption | null>(null);
  const [formError, setFormError] = useState('');
  const [ingredientError, setIngredientError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedWorkspaceIngredient = useMemo(
    () => workspaceIngredients.find((workspaceIngredient) =>
      workspaceIngredient.ingredient_id === parseInt(ingredientId, 10)
    ),
    [workspaceIngredients, ingredientId]
  );

  const selectedIngredient = selectedWorkspaceIngredient?.ingredient;

  const resolvedUnits = useMemo(
    () => resolveWorkspaceIngredientUnits(selectedWorkspaceIngredient),
    [selectedWorkspaceIngredient]
  );

  const unitOptions = useMemo(
    () => toUnitOptions(resolvedUnits.units, t),
    [resolvedUnits.units, t]
  );

  const ingredientOptions = useMemo(
    () => workspaceIngredients.map((workspaceIngredient) => ({
      value: String(workspaceIngredient.ingredient_id),
      label: workspaceIngredient.ingredient.type
        ? `${getWorkspaceIngredientLabel(workspaceIngredient)} · ${t(workspaceIngredient.ingredient.type)}`
        : getWorkspaceIngredientLabel(workspaceIngredient),
    })),
    [workspaceIngredients, t]
  );

  const selectedIngredientOption = ingredientId
    ? ingredientOptions.find((option) => option.value === ingredientId) || null
    : null;

  const existingIngredients = useMemo(
    () => getRecipeIngredients(recipe),
    [recipe]
  );

  const summaryIngredients = isEdit ? existingIngredients : draftIngredients;
  const canAddIngredient = Boolean(ingredientId && quantity.trim() && unit && !isSaving);
  const canSaveCreate = Boolean(recipeName.trim() && draftIngredients.length > 0 && !isSaving);

  useEffect(() => {
    if (!show) {
      setRecipeName('');
      setDraftIngredients([]);
      setIngredientId('');
      setQuantity('');
      setUnit(null);
      setFormError('');
      setIngredientError('');
      setIsSaving(false);
      return;
    }

    if (isEdit) {
      setRecipeName(recipe?.name || '');
    }
  }, [isEdit, recipe?.name, show]);

  useEffect(() => {
    const defaultOption = resolvedUnits.defaultUnit
      ? unitOptions.find((option) => option.value === resolvedUnits.defaultUnit)
      : null;
    setUnit(defaultOption || unitOptions[0] || null);
    setIngredientError('');
  }, [resolvedUnits.defaultUnit, unitOptions]);

  const resetIngredientEntry = () => {
    setIngredientId('');
    setQuantity('');
    setUnit(null);
  };

  const validateQuantity = () => {
    const normalizedQuantity = quantity.trim().replace(',', '.');
    const numericQuantity = Number(normalizedQuantity);
    return Number.isFinite(numericQuantity) && numericQuantity > 0;
  };

  const hasIngredient = (id: number) => (
    isEdit
      ? existingIngredients.some((ingredient) => ingredient.ingredient_id === id)
      : draftIngredients.some((ingredient) => ingredient.id === id)
  );

  const addIngredient = async () => {
    setIngredientError('');
    setFormError('');

    if (!selectedWorkspaceIngredient || !selectedIngredient) {
      setIngredientError(t('ingredientRequired'));
      return;
    }

    if (!quantity.trim() || !validateQuantity()) {
      setIngredientError(t('validQuantityRequired'));
      return;
    }

    if (!unit) {
      setIngredientError(t('unitRequired'));
      return;
    }

    if (hasIngredient(selectedWorkspaceIngredient.ingredient_id)) {
      setIngredientError(t('ingredientAlreadyExists'));
      return;
    }

    if (!isEdit) {
      setDraftIngredients((currentIngredients) => [
        ...currentIngredients,
        {
          id: selectedIngredient.id,
          name: getWorkspaceIngredientLabel(selectedWorkspaceIngredient),
          type: selectedIngredient.type,
          quantity: quantity.trim(),
          unit,
        },
      ]);
      resetIngredientEntry();
      return;
    }

    if (!onAddIngredientToRecipe) {
      return;
    }

    try {
      setIsSaving(true);
      await onAddIngredientToRecipe({
        ingredient_id: selectedWorkspaceIngredient.ingredient_id,
        quantity: quantity.trim(),
        unit: unit.value,
      });
      resetIngredientEntry();
    } catch (error) {
      setFormError(t('failedToAddIngredient'));
    } finally {
      setIsSaving(false);
    }
  };

  const removeIngredient = async (ingredientIdToRemove: number) => {
    setFormError('');

    if (!isEdit) {
      setDraftIngredients((currentIngredients) =>
        currentIngredients.filter((ingredient) => ingredient.id !== ingredientIdToRemove)
      );
      return;
    }

    if (!onDeleteIngredientFromRecipe) {
      return;
    }

    try {
      setIsSaving(true);
      await onDeleteIngredientFromRecipe(ingredientIdToRemove);
    } catch (error) {
      setFormError(t('errorOccurred'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setIngredientError('');

    if (isEdit) {
      onHide();
      return;
    }

    if (!recipeName.trim()) {
      setFormError(t('recipeNameRequired'));
      return;
    }

    if (draftIngredients.length === 0) {
      setFormError(t('atLeastOneIngredientRequired'));
      return;
    }

    if (!onCreateRecipe) {
      return;
    }

    setIsSaving(true);
    try {
      const yieldValue = plannedYield.trim() ? decimalInput(plannedYield) : null;
      if (plannedYield.trim() && (yieldValue == null || yieldValue <= 0)) { setFormError('Planned yield must be positive grams.'); return; }
      await onCreateRecipe(recipeName.trim(), draftIngredients, yieldValue);
    } catch (error) {
      setFormError(error instanceof Error && error.message === 'Failed to add ingredient'
        ? t('failedToAddIngredient')
        : t('failedToCreateRecipe'));
    } finally {
      setIsSaving(false);
    }
  };

  const getSummaryName = (ingredient: DraftIngredient | RecipeIngredientRow) => {
    if (isDraftIngredient(ingredient)) {
      return ingredient.name;
    }

    return ingredient.ingredient?.name || t('unknown');
  };

  const getSummaryType = (ingredient: DraftIngredient | RecipeIngredientRow) => {
    if (isDraftIngredient(ingredient)) {
      return ingredient.type;
    }

    return ingredient.ingredient?.type
      || workspaceIngredients.find((workspaceIngredient) =>
        workspaceIngredient.ingredient_id === ingredient.ingredient_id
      )?.ingredient.type;
  };

  const getSummaryQuantity = (ingredient: DraftIngredient | RecipeIngredientRow) => {
    if (isDraftIngredient(ingredient)) {
      return `${ingredient.quantity} ${t(ingredient.unit.value)}`;
    }

    return `${ingredient.quantity} ${t(ingredient.unit)}`;
  };

  const getSummaryKey = (ingredient: DraftIngredient | RecipeIngredientRow) => (
    isDraftIngredient(ingredient) ? ingredient.id : ingredient.id || ingredient.ingredient_id
  );

  const getRemoveId = (ingredient: DraftIngredient | RecipeIngredientRow) => (
    isDraftIngredient(ingredient) ? ingredient.id : ingredient.ingredient_id
  );

  return (
    <Modal show={show} onHide={onHide} size="lg" className="recipe-builder-modal" centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <div>
            <Modal.Title>{isEdit ? t('editRecipe') : t('addRecipe')}</Modal.Title>
            <div className="recipe-builder-subtitle">
              {isEdit ? recipe?.name || t('recipe') : t('recipeBuilderSubtitle')}
            </div>
          </div>
        </Modal.Header>

        <Modal.Body>
          <section className="recipe-builder-section mb-3">
            <Form.Group controlId="plannedFinishedYield"><Form.Label>Planned finished yield (g)</Form.Label>
              <Form.Control inputMode="decimal" value={plannedYield} onChange={event => setPlannedYield(event.target.value)} placeholder="Unknown" />
              <Form.Text>Finished content after cooking/drying from exactly the listed ingredient quantities. Up to three decimal places; blank means unknown.</Form.Text>
            </Form.Group>
            {isEdit && <Button type="button" size="sm" className="mt-2" disabled={isSaving} onClick={saveYield}>Save planned yield</Button>}
          </section>
          <div className="recipe-builder-layout">
            <div className="recipe-builder-main">
              <section className="recipe-builder-section">
                <Form.Group>
                  <Form.Label>{t('recipeName')}</Form.Label>
                  <Form.Control
                    type="text"
                    value={isEdit ? recipe?.name || '' : recipeName}
                    onChange={(event) => {
                      setRecipeName(event.target.value);
                      setFormError('');
                    }}
                    placeholder={t('recipeName')}
                    isInvalid={Boolean(formError && !recipeName.trim() && !isEdit)}
                    readOnly={isEdit}
                  />
                </Form.Group>
              </section>

              <section className="recipe-builder-section">
                <div className="recipe-builder-section-header">
                  <div>
                    <h3>{t('addIngredient')}</h3>
                    <p>{t('recipeBuilderIngredientHelp')}</p>
                  </div>
                </div>

                <div className="recipe-builder-entry-grid">
                  <SelectDropdown
                    value={selectedIngredientOption}
                    onChange={(selectedOption: any) => setIngredientId(selectedOption ? selectedOption.value : '')}
                    options={ingredientOptions}
                    isClearable
                    placeholder={t('chooseIngredient')}
                    label={t('ingredient')}
                    error={ingredientError === t('ingredientRequired') ? ingredientError : undefined}
                  />
                  <Form.Group>
                    <Form.Label>{t('quantity')}</Form.Label>
                    <Form.Control
                      type="text"
                      inputMode="decimal"
                      value={quantity}
                      onChange={(event) => {
                        setQuantity(event.target.value);
                        setIngredientError('');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addIngredient();
                        }
                      }}
                      isInvalid={ingredientError === t('validQuantityRequired')}
                    />
                  </Form.Group>
                  <SelectDropdown
                    value={unit}
                    onChange={(selectedOption) => {
                      setUnit(selectedOption || null);
                      setIngredientError('');
                    }}
                    options={unitOptions}
                    isClearable
                    placeholder={t('chooseUnit')}
                    label={t('unit')}
                    error={ingredientError === t('unitRequired') ? ingredientError : undefined}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    onClick={addIngredient}
                    disabled={!canAddIngredient}
                    className="recipe-builder-add-button"
                  >
                    <FaPlus className="me-2" />
                    {isSaving ? t('loading') : t('add')}
                  </Button>
                </div>

                {ingredientError && ![t('ingredientRequired'), t('validQuantityRequired'), t('unitRequired')].includes(ingredientError) && (
                  <div className="recipe-builder-inline-error">
                    <FaExclamationTriangle />
                    {ingredientError}
                  </div>
                )}
              </section>
            </div>

            <aside className="recipe-builder-summary">
              <div className="recipe-builder-summary-header">
                <div>
                  <h3>{t('recipeComposition')}</h3>
                  <p>
                    {summaryIngredients.length} {t('of')} {formatCount(t, workspaceIngredients.length, 'ingredient')}
                  </p>
                </div>
                <div className="recipe-builder-count">
                  <FaLayerGroup />
                  {summaryIngredients.length}
                </div>
              </div>

              {summaryIngredients.length > 0 ? (
                <div className="recipe-builder-list">
                  {summaryIngredients.map((ingredient) => (
                    <div key={getSummaryKey(ingredient)} className="recipe-builder-list-item">
                      <div>
                        <strong>{getSummaryName(ingredient)}</strong>
                        {getSummaryType(ingredient) && <span>{t(getSummaryType(ingredient) || '')}</span>}
                      </div>
                      <div className="recipe-builder-list-quantity">
                        {getSummaryQuantity(ingredient)}
                      </div>
                      <Button
                        type="button"
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeIngredient(getRemoveId(ingredient))}
                        aria-label={t('removeIngredientFromRecipe')}
                        className="recipe-builder-remove-button"
                        disabled={isSaving}
                      >
                        <FaTrash />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="recipe-builder-empty">
                  <FaLayerGroup />
                  <strong>{isEdit ? t('noIngredientsInRecipe') : t('noIngredientsAddedYet')}</strong>
                  <span>{t('recipeBuilderEmptyHelp')}</span>
                </div>
              )}
            </aside>
          </div>

          {formError && (
            <div className="recipe-builder-form-error">
              <FaExclamationTriangle />
              {formError}
            </div>
          )}
        </Modal.Body>

        <Modal.Footer>
          <div className="recipe-builder-footer-status">
            {isEdit || summaryIngredients.length > 0
              ? formatCount(t, summaryIngredients.length, 'ingredient')
              : t('recipeBuilderNotReady')}
          </div>
          <div className="recipe-builder-footer-actions">
            {isEdit && onDeleteRecipe && (
              <Button variant="outline-danger" type="button" onClick={onDeleteRecipe} disabled={isSaving}>
                <FaTrash className="me-2" />
                {t('delete')}
              </Button>
            )}
            {isEdit && onCloneRecipe && (
              <Button variant="outline-secondary" type="button" onClick={onCloneRecipe} disabled={isSaving}>
                {t('cloneRecipe')}
              </Button>
            )}
            <Button variant="outline-secondary" type="button" onClick={onHide} disabled={isSaving}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              type={isEdit ? 'button' : 'submit'}
              onClick={isEdit ? onHide : undefined}
              disabled={isEdit ? isSaving : !canSaveCreate}
            >
              {isSaving ? t('loading') : t('save')}
            </Button>
          </div>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default RecipeBuilderModal;
