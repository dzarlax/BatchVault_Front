import React, { useState, useEffect, useId } from 'react';
import { Modal, Form, Button, ListGroup, Alert, Spinner } from 'react-bootstrap';
import { FaCalculator } from 'react-icons/fa';
import { Recipe, RecipeIngredient } from '../../types/api';
import SelectDropdown from '../SelectDropdown';
import { useWorkspace } from '../../utils/workspaceContext';
import { cookingApiFor, parseDecimalInput } from '../../utils/cooking';

interface RecipeCalculatorProps { show: boolean; onHide: () => void; recipe: Recipe; t: (key: string) => string }
type CalculatorRow = { id: number; quantity: string; unit: string; ingredient?: { name: string } };

const RecipeCalculator: React.FC<RecipeCalculatorProps> = ({ show, onHide, recipe, t }) => {
  const titleId = `recipe-calculator-modal-title-${useId()}`;
  const { selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const cookingEnabled = selectedWorkspace?.capabilities?.cooking_v1 === true;
  const ingredients = recipe?.recipe_ingredients || recipe?.ingredients || [];
  const baseOptions = ingredients.filter(item => item.ingredient?.type?.toLowerCase() === 'base' && ['g', 'kg'].includes(item.unit.trim().toLowerCase())).map(item => ({ value: item.id, label: `${item.ingredient?.name || t('unknownIngredient')} · ${item.quantity} ${item.unit}` }));
  const [baseIngredientId, setBaseIngredientId] = useState<number | null>(null);
  const [baseWeight, setBaseWeight] = useState('');
  const [calculatedIngredients, setCalculatedIngredients] = useState<CalculatorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(false);
  const baseIngredient = ingredients.find(item => item.id === baseIngredientId) || null;
  const multipleBaseOptions = baseOptions.length > 1;

  useEffect(() => {
    setBaseIngredientId(baseOptions.length === 1 ? baseOptions[0].value : null);
    setBaseWeight(baseOptions.length === 1 ? ingredients.find(item => item.id === baseOptions[0].value)?.quantity || '' : '');
    setCalculatedIngredients(ingredients);
    setServerError(false);
  }, [recipe?.id]);

  useEffect(() => {
    if (!recipe || !baseIngredient || !baseWeight || cookingEnabled) return;
    const originalWeight = Number(baseIngredient.quantity);
    const newWeight = Number(baseWeight.replace(',', '.'));
    if (!Number.isFinite(originalWeight) || !Number.isFinite(newWeight) || originalWeight <= 0) return;
    const ratio = newWeight / originalWeight;
    setCalculatedIngredients(ingredients.map((item: RecipeIngredient) => ({
      ...item, quantity: (Number(item.quantity) * ratio).toFixed(2),
    })));
  }, [baseWeight, baseIngredient, recipe, cookingEnabled]);

  const previewOnServer = async () => {
    if (!baseIngredientId || !parseDecimalInput(baseWeight)) return;
    setLoading(true); setServerError(false);
    try {
      const result: any = await cookingApiFor(selectedWorkspaceId).preparationPreview({ recipe_id: recipe.id, prepared_meat_g: parseDecimalInput(baseWeight), flavors: [{ recipe_id: recipe.id, actual_meat_g: parseDecimalInput(baseWeight), base_recipe_ingredient_id: baseIngredientId }] });
      const flavor = result.flavors?.[0];
      setCalculatedIngredients((flavor?.ingredients || []).map((item: any) => ({ id: item.recipe_ingredient_id, quantity: item.quantity, unit: item.unit, ingredient: { name: item.name } })));
    } catch { setServerError(true); }
    finally { setLoading(false); }
  };

  if (!recipe) return null;

  return <Modal show={show} onHide={onHide} centered className="ui-workflow-modal" aria-labelledby={titleId}>
    <Modal.Header closeButton closeLabel={t('close')}><Modal.Title id={titleId}><FaCalculator className="me-2" />{t('recipeCalculator')} - {recipe.name}</Modal.Title></Modal.Header>
    <Modal.Body>
      {baseOptions.length > 1 && <Form.Group className="mb-3"><Form.Label>{t('cookingBaseIngredient')}</Form.Label><SelectDropdown options={baseOptions} value={baseOptions.find(option => option.value === baseIngredientId) || null} onChange={(option: {value:number}|null) => setBaseIngredientId(option?.value ?? null)} placeholder={t('cookingChooseBase')} /></Form.Group>}
      {baseOptions.length === 0 && <Alert variant="warning">{t('cookingBaseNotAvailable')}</Alert>}
      {baseIngredient && <Form.Group className="mb-3" controlId={`${titleId}-base-weight`}><Form.Label>{t('baseIngredient')}: <strong>{baseIngredient.ingredient?.name || t('unknownIngredient')}</strong></Form.Label><Form.Control inputMode="decimal" value={baseWeight} onChange={event => setBaseWeight(event.target.value)} placeholder={t('enterNewWeight')} /></Form.Group>}
      {cookingEnabled && <div className="d-flex justify-content-end mb-3"><Button disabled={loading || !baseIngredientId || !parseDecimalInput(baseWeight)} onClick={() => void previewOnServer()}>{loading ? <Spinner size="sm" className="me-2" /> : null}{t('cookingPreviewMarinade')}</Button></div>}
      {serverError && <Alert variant="danger" role="alert">{t('cookingPreparationPreviewError')}</Alert>}
      <ListGroup>{calculatedIngredients.map(ingredient => <ListGroup.Item key={ingredient.id}><div className="d-flex justify-content-between align-items-center"><span>{ingredient.ingredient?.name || t('unknownIngredient')}</span><span>{ingredient.quantity} {ingredient.unit}</span></div></ListGroup.Item>)}</ListGroup>
    </Modal.Body>
    <Modal.Footer><Button variant="secondary" onClick={onHide}>{t('close')}</Button></Modal.Footer>
  </Modal>;
};

export default React.memo(RecipeCalculator);
