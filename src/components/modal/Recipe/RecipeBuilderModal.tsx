import React, { useEffect, useMemo, useState } from 'react';
import fetcher from '../../../utils/fetcher';
import { useWorkspace } from '../../../utils/workspaceContext';
import { decimalInput, invalidateCosting } from '../../../utils/costing';
import { Modal, Button, Form } from 'react-bootstrap';
import { FaExclamationTriangle, FaLayerGroup, FaPlus, FaTrash } from 'react-icons/fa';
import { WorkspaceIngredient } from '../../../types/api';
import SelectDropdown from '../../../components/SelectDropdown';
import { formatCount } from '../../../utils/pluralize';
import { acknowledgeRecipeEditorSave, advanceEditorOperationScope, commitEditorWrite, EditorOperationScope, recipeEditorHasPendingIngredient, recipeEditorIsDirty, recipeEditorSnapshot, RecipeEditorSnapshot } from '../../../utils/editorDraftState';
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
  refreshRequired?: boolean;
  onRefresh?: () => Promise<void>;
  onRefreshRequired?: () => void;
  onAddIngredientToRecipe?: (ingredient: { ingredient_id: number; quantity: string; unit: string }) => Promise<void>;
  onDeleteIngredientFromRecipe?: (ingredientId: number) => Promise<void>;
  onDeleteRecipe?: () => void | Promise<void>;
  onCloneRecipe?: () => void | Promise<void>;
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
  onCreateRecipe, onYieldSaved, refreshRequired = false, onRefresh, onRefreshRequired,
  onAddIngredientToRecipe,
  onDeleteIngredientFromRecipe,
  onDeleteRecipe,
  onCloneRecipe,
}) => {
  const isEdit = mode === 'edit';
  const [recipeName, setRecipeName] = useState('');
  const [plannedYield, setPlannedYield] = useState('');
  const { selectedWorkspaceId } = useWorkspace();
  const [draftIngredients, setDraftIngredients] = useState<DraftIngredient[]>([]);
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<UnitOption | null>(null);
  const [formError, setFormError] = useState('');
  const [ingredientError, setIngredientError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [yieldRefreshRequired, setYieldRefreshRequired] = useState(false);
  const needsRefresh = refreshRequired || yieldRefreshRequired;
  const titleId = React.useId();
  const baseline = React.useRef<RecipeEditorSnapshot | null>(null);
  const busy = React.useRef(false);
  const operationVersion = React.useRef(0);
  const previousWorkspace = React.useRef(selectedWorkspaceId);
  const operationScope = React.useRef<EditorOperationScope | null>(null);
  operationScope.current = advanceEditorOperationScope(operationScope.current, JSON.stringify([selectedWorkspaceId, show, mode, recipe?.id]));
  const openRecipe = React.useRef<string | null>(null);
  const entryIngredient = React.useRef('');
  const draftValues = {
    mode, name: recipeName, plannedYield, ingredients: draftIngredients,
    entry: { ingredientId, quantity, unit: unit?.value || '' },
  };

  const canDiscard = () => !busy.current && (
    !recipeEditorIsDirty(baseline.current, draftValues) || window.confirm(t('uiDiscardUnsaved'))
  );
  const requestClose = () => { if (canDiscard()) onHide(); };
  const beginOperation = () => {
    if (busy.current) return null;
    busy.current = true;
    setIsSaving(true);
    const version = ++operationVersion.current;
    const scope = operationScope.current;
    return {
      isCurrent: () => operationVersion.current === version && operationScope.current === scope,
      finish: () => {
        if (operationVersion.current !== version) return;
        busy.current = false;
        setIsSaving(false);
      },
    };
  };

  const saveYield = async () => {
    if (busy.current || needsRefresh) return;
    const submittedYield = plannedYield;
    const value = submittedYield.trim() ? decimalInput(submittedYield) : null;
    if (submittedYield.trim() && (value == null || value <= 0)) { setFormError(t('costingYieldPositive')); return; }
    const operation = beginOperation();
    if (!operation) return;
    setFormError('');
    try {
      await commitEditorWrite({
        write: () => fetcher(`/api/recipes/${recipe.id}`, { method: 'PATCH', headers: { 'X-Workspace-ID': selectedWorkspaceId }, body: JSON.stringify({ planned_yield_g: value }) }),
        acknowledge: updated => {
          baseline.current = acknowledgeRecipeEditorSave(baseline.current, { plannedYield: submittedYield });
          onYieldSaved?.(updated);
        },
        refresh: () => invalidateCosting(selectedWorkspaceId),
        requireRefresh: () => {
          setYieldRefreshRequired(true);
          onRefreshRequired?.();
        },
        isCurrent: operation.isCurrent,
      });
    } catch (err) {
      if (operation.isCurrent()) setFormError(t('costingYieldSaveFailed'));
    } finally { operation.finish(); }
  };

  const runRecipeAction = async (action: () => void | Promise<void>) => {
    if (needsRefresh || !canDiscard()) return;
    const operation = beginOperation();
    if (!operation) return;
    try { await action(); }
    catch (error) { if (operation.isCurrent()) setFormError(t('errorOccurred')); }
    finally { operation.finish(); }
  };


  const retryRecipeRead = async () => {
    if (!onRefresh) return;
    const operation = beginOperation();
    if (!operation) return;
    setFormError('');
    try {
      await onRefresh();
      if (operation.isCurrent()) setYieldRefreshRequired(false);
    } catch (error) {
      if (operation.isCurrent()) setYieldRefreshRequired(true);
    } finally { operation.finish(); }
  };

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
  const canAddIngredient = Boolean(ingredientId && quantity.trim() && unit && !isSaving && !needsRefresh);
  const canSaveCreate = Boolean(recipeName.trim() && draftIngredients.length > 0 && !isSaving);

  useEffect(() => {
    const identity = `${mode}:${recipe?.id ?? 'new'}`;
    if (!show || openRecipe.current !== identity) {
      operationVersion.current++;
      busy.current = false;
      setIsSaving(false);
      setYieldRefreshRequired(false);
      const initialYield = isEdit && recipe?.planned_yield_g != null ? String(recipe.planned_yield_g) : '';
      const initialName = isEdit ? recipe?.name || '' : '';
      setRecipeName(initialName);
      setPlannedYield(initialYield);
      setDraftIngredients([]);
      setIngredientId('');
      setQuantity('');
      setUnit(null);
      entryIngredient.current = '';
      setFormError('');
      setIngredientError('');
      baseline.current = show ? recipeEditorSnapshot({
        mode, name: initialName, plannedYield: initialYield, ingredients: [],
        entry: { ingredientId: '', quantity: '', unit: '' },
      }) : null;
      openRecipe.current = show ? identity : null;
    }
  }, [isEdit, mode, recipe?.id, recipe?.name, recipe?.planned_yield_g, show]);

  useEffect(() => {
    if (previousWorkspace.current === selectedWorkspaceId) return;
    previousWorkspace.current = selectedWorkspaceId;
    operationVersion.current++;
    busy.current = false;
    setIsSaving(false);
    onHide();
  }, [selectedWorkspaceId, onHide]);

  useEffect(() => () => { operationVersion.current++; }, []);

  useEffect(() => {
    // A reference-data refresh must not overwrite a unit the user already chose.
    if (entryIngredient.current === ingredientId) return;
    entryIngredient.current = ingredientId;
    const defaultOption = resolvedUnits.defaultUnit
      ? unitOptions.find((option) => option.value === resolvedUnits.defaultUnit)
      : null;
    setUnit(ingredientId ? defaultOption || unitOptions[0] || null : null);
    setIngredientError('');
  }, [ingredientId, resolvedUnits.defaultUnit, unitOptions]);

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
    if (busy.current || needsRefresh) return;
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

    const operation = beginOperation();
    if (!operation) return;
    try {
      await onAddIngredientToRecipe({
        ingredient_id: selectedWorkspaceIngredient.ingredient_id,
        quantity: quantity.trim(),
        unit: unit.value,
      });
      if (!operation.isCurrent()) return;
      resetIngredientEntry();
      baseline.current = acknowledgeRecipeEditorSave(baseline.current, { entry: { ingredientId: '', quantity: '', unit: '' } });
    } catch (error) {
      if (operation.isCurrent()) setFormError(t('failedToAddIngredient'));
    } finally {
      operation.finish();
    }
  };

  const removeIngredient = async (ingredientIdToRemove: number) => {
    if (busy.current || needsRefresh) return;
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

    const operation = beginOperation();
    if (!operation) return;
    try {
      await onDeleteIngredientFromRecipe(ingredientIdToRemove);
    } catch (error) {
      if (operation.isCurrent()) setFormError(t('errorOccurred'));
    } finally {
      operation.finish();
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    setFormError('');
    setIngredientError('');

    if (isEdit) {
      requestClose();
      return;
    }

    if (!recipeName.trim()) {
      setFormError(t('recipeNameRequired'));
      return;
    }

    if (recipeEditorHasPendingIngredient(draftValues.entry)) {
      setFormError(t('uiRecipePendingIngredient'));
      return;
    }

    if (draftIngredients.length === 0) {
      setFormError(t('atLeastOneIngredientRequired'));
      return;
    }

    if (!onCreateRecipe) {
      return;
    }

    const operation = beginOperation();
    if (!operation) return;
    try {
      const yieldValue = plannedYield.trim() ? decimalInput(plannedYield) : null;
      if (plannedYield.trim() && (yieldValue == null || yieldValue <= 0)) { setFormError(t('costingYieldPositive')); return; }
      await onCreateRecipe(recipeName.trim(), draftIngredients, yieldValue);
    } catch (error) {
      if (!operation.isCurrent()) return;
      setFormError(error instanceof Error && error.message === 'Failed to add ingredient'
        ? t('failedToAddIngredient')
        : t('failedToCreateRecipe'));
    } finally {
      operation.finish();
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
    <Modal show={show} onHide={requestClose} backdrop={isSaving ? "static" : true} keyboard={!isSaving} size="lg" className="recipe-builder-modal ui-workflow-modal" aria-labelledby={titleId} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton={!isSaving} closeLabel={t('close')}>
          <div>
            <Modal.Title id={titleId}>{isEdit ? t('editRecipe') : t('addRecipe')}</Modal.Title>
            <div className="recipe-builder-subtitle">
              {isEdit ? recipe?.name || t('recipe') : t('recipeBuilderSubtitle')}
            </div>
          </div>
        </Modal.Header>

        <Modal.Body>
          {needsRefresh && (
            <div className="alert alert-warning" role="alert">
              <p>{t('uiRecipeSavedReadFailed')}</p>
              {onRefresh && <Button variant="outline-secondary" type="button" onClick={() => void retryRecipeRead()} disabled={isSaving}>{t('tryAgain')}</Button>}
            </div>
          )}
          <fieldset disabled={isSaving} aria-busy={isSaving}>
          <section className="recipe-builder-section mb-3">
            <Form.Group controlId={`${titleId}-planned-yield`}><Form.Label>{t('costingYieldLabel')}</Form.Label>
              <Form.Control inputMode="decimal" value={plannedYield} onChange={event => setPlannedYield(event.target.value)} placeholder={t('costingUnknown')} />
              <Form.Text>{t('costingYieldHelp')}</Form.Text>
            </Form.Group>
            {isEdit && <Button type="button" size="sm" className="mt-2" disabled={isSaving || needsRefresh} onClick={saveYield}>{t('costingSaveYield')}</Button>}
          </section>
          <div className="recipe-builder-layout">
            <div className="recipe-builder-main">
              <section className="recipe-builder-section">
                <Form.Group controlId={`${titleId}-recipe-name`}>
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
                    isDisabled={isSaving}
                    inputId={`${titleId}-ingredient`}
                    value={selectedIngredientOption}
                    onChange={(selectedOption: any) => setIngredientId(selectedOption ? selectedOption.value : '')}
                    options={ingredientOptions}
                    isClearable
                    placeholder={t('chooseIngredient')}
                    label={t('ingredient')}
                    error={ingredientError === t('ingredientRequired') ? ingredientError : undefined}
                  />
                  <Form.Group controlId={`${titleId}-ingredient-quantity`}>
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
                    isDisabled={isSaving}
                    inputId={`${titleId}-ingredient-unit`}
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
                        disabled={isSaving || needsRefresh}
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
          </fieldset>
        </Modal.Body>

        <Modal.Footer>
          <div className="recipe-builder-footer-status">
            {isEdit || summaryIngredients.length > 0
              ? formatCount(t, summaryIngredients.length, 'ingredient')
              : t('recipeBuilderNotReady')}
          </div>
          <div className="recipe-builder-footer-actions">
            {isEdit && onDeleteRecipe && (
              <Button variant="outline-danger" type="button" onClick={() => void runRecipeAction(onDeleteRecipe)} disabled={isSaving || needsRefresh}>
                <FaTrash className="me-2" />
                {t('delete')}
              </Button>
            )}
            {isEdit && onCloneRecipe && (
              <Button variant="outline-secondary" type="button" onClick={() => void runRecipeAction(onCloneRecipe)} disabled={isSaving || needsRefresh}>
                {t('cloneRecipe')}
              </Button>
            )}
            <Button variant="outline-secondary" type="button" onClick={requestClose} disabled={isSaving}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              type={isEdit ? 'button' : 'submit'}
              onClick={isEdit ? requestClose : undefined}
              disabled={isEdit ? isSaving : !canSaveCreate}
            >
              {isSaving ? t('loading') : t(isEdit ? 'done' : 'save')}
            </Button>
          </div>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default RecipeBuilderModal;
