import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import { Modal, Form, Button, Row, Col, Alert, Badge } from 'react-bootstrap';
import useTranslation from 'next-translate/useTranslation';
import { FaPlus, FaTag, FaUtensils } from 'react-icons/fa';
import { Ingredient } from '../../../types/api';
import SelectDropdown from '../../../components/SelectDropdown';
import { getIngredientTypeOptions } from '../../../utils/ingredientTypes';

interface AddIngredientModalProps {
  show: boolean;
  onClose: () => void;
  onSave: (ingredientData: {
    type: string;
    name: string;
  }) => Promise<void>;
  onAddExisting: (ingredientId: number) => Promise<void>;
  onSearchGlobalIngredients: (query: string) => Promise<Ingredient[]>;
  existingIngredients: Ingredient[];
}

const AddIngredientModal: React.FC<AddIngredientModalProps> = ({ 
  show, 
  onClose, 
  onSave, 
  onAddExisting,
  onSearchGlobalIngredients,
  existingIngredients = [] 
}) => {
  const { t } = useTranslation('common');
  const titleId = `ingredient-modal-title-${useId()}`;
  const [ingredientType, setIngredientType] = useState('');
  const [ingredientName, setIngredientName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showError, setShowError] = useState(false);
  const [errorField, setErrorField] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Ingredient[]>([]);
  const ingredientNameRef = useRef<HTMLInputElement>(null);
  const workspaceIngredientIds = useMemo(
    () => new Set(existingIngredients.map((ingredient) => ingredient.id)),
    [existingIngredients]
  );
  const normalizedIngredientName = ingredientName.trim().toLowerCase();
  const exactExistingIngredient = normalizedIngredientName
    ? searchResults.find((ingredient) => ingredient.name.trim().toLowerCase() === normalizedIngredientName)
    : undefined;
  const isCreatingNewIngredient = !exactExistingIngredient;

  useEffect(() => {
    if (!show) {
      setIngredientType('');
      setIngredientName('');
      setErrorMessage('');
      setShowError(false);
      setErrorField('');
      setSearchResults([]);
    }
  }, [show]);

  useEffect(() => {
    const query = ingredientName.trim();
    if (!show || query.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await onSearchGlobalIngredients(query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [ingredientName, onSearchGlobalIngredients, show]);

  const ingredientTypeOptions = useMemo(() => getIngredientTypeOptions(t), [t]);

  const validateForm = () => {
    const trimmedName = ingredientName.trim();
    
    if (!trimmedName) {
      setErrorMessage(t('ingredientNameRequired'));
      setShowError(true);
      ingredientNameRef.current?.focus();
      return false;
    }

    if (exactExistingIngredient) {
      setErrorMessage(t('ingredientExistsUseSuggestion'));
      setErrorField('name');
      setShowError(true);
      ingredientNameRef.current?.focus();
      return false;
    }

    if (!ingredientType) {
      setErrorMessage(t('ingredientTypeRequired'));
      setShowError(true);
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      await onSave({
        type: ingredientType,
        name: ingredientName.trim()
      });
      
      setIngredientType('');
      setIngredientName('');
      setErrorMessage('');
      setShowError(false);
      onClose();
    } catch (error: any) {
      if (error?.workspace_linked) {
        setIngredientType('');
        setIngredientName('');
        setErrorMessage('');
        setShowError(false);
        onClose();
        return;
      }

      if (error?.message === 'Ingredient with this name already exists' || 
          error?.message?.includes('already exists')) {
        setErrorMessage(t('ingredientExistsServer', { 
          name: error.value || ingredientName,
          id: error.existing_id || 'unknown'
        }));
        setErrorField('name');
        ingredientNameRef.current?.focus();
      } else if (error?.field === 'name') {
        setErrorMessage(error.message || t('invalidIngredientName'));
        setErrorField('name');
        ingredientNameRef.current?.focus();
      } else {
        setErrorMessage(error?.message || t('failedToAddIngredient'));
        setErrorField('');
      }
      
      setShowError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddExisting = async (ingredient: Ingredient) => {
    setIsLoading(true);
    try {
      await onAddExisting(ingredient.id);
      setIngredientType('');
      setIngredientName('');
      setSearchResults([]);
      onClose();
    } catch (error: any) {
      setErrorMessage(error?.message || t('failedToAddIngredient'));
      setErrorField('');
      setShowError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} size="lg" className="add-ingredient-modal ui-workflow-modal" aria-labelledby={titleId}>
      <Modal.Header closeButton closeLabel={t('close')}>
        <Modal.Title id={titleId}>
          <FaPlus className="me-2 text-primary" />
          {t('addIngredient')}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {showError && (
            <Alert variant="danger" onClose={() => setShowError(false)} dismissible>
              <strong>{t('error')}:</strong> {errorMessage}
            </Alert>
          )}

          <Row className="g-3">
            <Col md={12}>
              <Form.Group controlId="ingredientName">
                <Form.Label className="fw-semibold">
                  <FaUtensils className="me-1 text-primary" />
                  {t('ingredientName')} <span className="text-danger">*</span>
                </Form.Label>
                                  <Form.Control
                    ref={ingredientNameRef}
                    type="text"
                    placeholder={t('enterIngredientName')}
                    value={ingredientName}
                    onChange={(e) => {
                      setIngredientName(e.target.value);
                      if (showError) {
                        setShowError(false);
                        setErrorField('');
                      }
                    }}
                    isInvalid={showError && errorField === 'name'}
                    required
                  />
                <Form.Control.Feedback type="invalid">
                  {errorMessage}
                </Form.Control.Feedback>
              </Form.Group>

              {(ingredientName.trim().length >= 2 || isSearching || searchResults.length > 0) && (
                <div className="existing-ingredient-suggestions modal-token-panel mt-2 p-2">
                  {isSearching ? (
                    <small className="text-muted">{t('loading')}...</small>
                  ) : searchResults.length === 0 ? (
                    <small className="text-muted">{t('noExistingIngredientsFound')}</small>
                  ) : (
                    <div className="d-flex flex-column gap-1">
                      {searchResults.map((ingredient) => {
                        const isAlreadyInList = workspaceIngredientIds.has(ingredient.id);
                        return (
                          <button
                            key={ingredient.id}
                            type="button"
                            className="btn modal-token-option existing-ingredient-suggestion d-flex align-items-center justify-content-between gap-2 text-start"
                            onClick={() => handleAddExisting(ingredient)}
                            disabled={isLoading || isAlreadyInList}
                          >
                            <span className="d-flex align-items-center flex-wrap gap-2">
                              <strong>{ingredient.name}</strong>
                              <small className="text-muted">{t(ingredient.type)}</small>
                              {isAlreadyInList && (
                                <Badge bg="secondary">{t('alreadyInIngredientList')}</Badge>
                              )}
                            </span>
                            <small className={isAlreadyInList ? 'text-muted' : 'text-primary'}>
                              {isAlreadyInList ? t('alreadyAdded') : t('addExistingIngredient')}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Col>

            {isCreatingNewIngredient && (
              <Col md={12}>
                <SelectDropdown
                  value={ingredientTypeOptions.find(option => option.value === ingredientType) || null}
                  onChange={(option) => {
                    setIngredientType(option ? option.value : '');
                    if (showError) {
                      setShowError(false);
                      setErrorField('');
                    }
                  }}
                  options={ingredientTypeOptions}
                  isClearable
                  placeholder={t('chooseType')}
                  label={t('ingredientType')}
                  required
                  icon={FaTag}
                />

                <div className="modal-token-panel mt-3 p-3">
                  <h6 className="modal-section-title mb-2">{t('ingredientTypes')}:</h6>
                  <div className="d-flex flex-wrap gap-2">
                    {ingredientTypeOptions.map(option => {
                      const IconComponent = option.icon;
                      return (
                        <div key={option.value} className="d-flex align-items-center">
                          <IconComponent className="me-1" />
                          <small className="text-muted">{option.label}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Col>
            )}
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={isLoading}>
            {t('cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={isLoading || !!exactExistingIngredient}>
            {isLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                {t('loading')}...
              </>
            ) : (
              <>
                <FaPlus className="me-2" />
                {t('addIngredient')}
              </>
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default AddIngredientModal;
