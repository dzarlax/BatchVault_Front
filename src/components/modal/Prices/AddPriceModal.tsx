import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Row, Col, Alert, InputGroup } from 'react-bootstrap';
import useTranslation from 'next-translate/useTranslation';
import { FaPlus, FaDollarSign, FaWeight, FaRulerCombined, FaTag } from 'react-icons/fa';
import { WorkspaceIngredient } from '../../../types/api';
import { useWorkspace } from '../../../utils/workspaceContext';
import SelectDropdown from '../../../components/SelectDropdown';
import {
  getWorkspaceIngredientLabel,
  resolveWorkspaceIngredientUnits,
  toUnitOptions,
} from '../../../utils/ingredientUnitContract';

const isPositiveDecimalInput = (value: string) => {
  const normalizedValue = value.trim();
  if (!/^(?:\d+|\d+\.\d+|\.\d+)$/.test(normalizedValue)) {
    return false;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) && parsedValue > 0;
};

interface AddPriceModalProps {
  show: boolean;
  onClose: () => void;
  onSave: (priceData: {
    ingredient_id: number;
    price: string;
    quantity: string;
    unit: string;
  }) => Promise<void>;
  workspaceIngredients: WorkspaceIngredient[];
}

const AddPriceModal: React.FC<AddPriceModalProps> = ({ 
  show, 
  onClose, 
  onSave, 
  workspaceIngredients = []
}) => {
  const { t } = useTranslation('common');
  const { selectedCurrency } = useWorkspace();
  const [ingredientId, setIngredientId] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [units, setUnits] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    updateUnits();
  }, [ingredientId]);

  useEffect(() => {
    if (!show) {
      // Сброс формы при закрытии модального окна
      setIngredientId('');
      setPrice('');
      setQuantity('');
      setUnit('');
      setErrors([]);
    }
  }, [show]);

  const updateUnits = () => {
    const selectedWorkspaceIngredient = workspaceIngredients?.find((workspaceIngredient) =>
      workspaceIngredient.ingredient_id === parseInt(ingredientId, 10)
    );
    if (!selectedWorkspaceIngredient) {
      setUnits([]);
      setUnit('');
      return;
    }

    const { units: availableUnits, defaultUnit } = resolveWorkspaceIngredientUnits(selectedWorkspaceIngredient);
    setUnits(availableUnits);
    setUnit(defaultUnit);
  };

  const validateForm = () => {
    const validationErrors = [];
    
    if (!ingredientId) validationErrors.push(t('ingredientRequired'));
    if (!isPositiveDecimalInput(price)) validationErrors.push(t('validPriceRequired'));
    if (!isPositiveDecimalInput(quantity)) validationErrors.push(t('validQuantityRequired'));
    if (!unit) validationErrors.push(t('unitRequired'));
    
    setErrors(validationErrors);
    return validationErrors.length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      await onSave({
        ingredient_id: parseInt(ingredientId, 10),
        price,
        quantity,
        unit
      });
      
      // Сброс формы после успешного сохранения
      setIngredientId('');
      setPrice('');
      setQuantity('');
      setUnit('');
      setErrors([]);
      onClose();
    } catch (error: any) {
      
      // Обработка структурированной ошибки от сервера
      if (error?.field) {
        const fieldErrors = [];
        switch (error.field) {
          case 'ingredient_id':
            fieldErrors.push(error.message || t('ingredientRequired'));
            break;
          case 'price':
            fieldErrors.push(error.message || t('validPriceRequired'));
            break;
          case 'quantity':
            fieldErrors.push(error.message || t('validQuantityRequired'));
            break;
          case 'unit':
            fieldErrors.push(error.message || t('unitRequired'));
            break;
          default:
            fieldErrors.push(error.message || t('failedToAddPrice'));
        }
        setErrors(fieldErrors);
      } else {
        setErrors([error?.message || t('failedToAddPrice')]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const ingredientOptions = workspaceIngredients ? workspaceIngredients.map((workspaceIngredient) => ({
    value: workspaceIngredient.ingredient_id,
    label: getWorkspaceIngredientLabel(workspaceIngredient)
  })) : [];
  
  const unitOptions = toUnitOptions(units, t);

  return (
    <Modal show={show} onHide={onClose} size="lg" className="add-price-modal">
      <Modal.Header closeButton>
        <Modal.Title>
          <FaPlus className="me-2 text-primary" />
          {t('addPrice')}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {errors.length > 0 && (
            <Alert variant="danger" className="mb-4">
              <strong>{t('pleaseFixErrors')}:</strong>
              <ul className="mb-0 mt-2">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Row className="g-3">
            <Col md={6}>
              <SelectDropdown
                value={ingredientOptions.find(option => option.value === parseInt(ingredientId)) || null}
                onChange={(option) => setIngredientId(option ? option.value.toString() : '')}
                options={ingredientOptions}
                isClearable
                placeholder={t('chooseIngredient')}
                label={t('ingredient')}
                required
                icon={FaTag}
              />
            </Col>
            <Col md={6}>
              <SelectDropdown
                value={unitOptions.find(option => option.value === unit) || null}
                onChange={(option) => setUnit(option ? option.value : '')}
                options={unitOptions}
                placeholder={t('chooseUnit')}
                label={t('unit')}
                required
                icon={FaRulerCombined}
                isDisabled={!ingredientId}
              />
            </Col>
          </Row>

          <Row className="g-3 mt-2">
            <Col md={6}>
              <Form.Group controlId="priceInput">
                <Form.Label className="fw-semibold">
                  <FaDollarSign className="me-1 text-primary" />
                  {t('price')} <span className="text-danger">*</span>
                </Form.Label>
                <InputGroup>
                  <InputGroup.Text>{selectedCurrency || ''}</InputGroup.Text>
                  <Form.Control
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                </InputGroup>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group controlId="quantityInput">
                <Form.Label className="fw-semibold">
                  <FaWeight className="me-1 text-primary" />
                  {t('quantity')} <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={isLoading}>
            {t('cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                {t('loading')}...
              </>
            ) : (
              <>
                <FaPlus className="me-2" />
                {t('addPrice')}
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default AddPriceModal;
