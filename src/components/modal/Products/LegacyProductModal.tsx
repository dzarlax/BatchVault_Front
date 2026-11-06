import React, { useEffect, useRef, useState } from "react";
import { focusFirstProductError } from '../../../utils/productEditorState';
import type { ProductModalProps } from './ProductModal';
import { Modal, Button, Form, Row, Col, Alert, InputGroup } from "react-bootstrap";
import { FaTrash, FaSave, FaTimes, FaPlus, FaInfoCircle, FaTag, FaDollarSign, FaCog, FaUtensils, FaBoxOpen } from "react-icons/fa";
import useTranslation from "next-translate/useTranslation";
import PackageModal from "./PackageModal";
import SelectDropdown from "../../SelectDropdown";
import { useWorkspace } from '../../../utils/workspaceContext';

const ProductModal: React.FC<ProductModalProps> = ({
  message, busy = false, readOnly = false, savedRefreshRequired = false, onRefresh, onReload, validationErrors = {},
  show,
  onClose,
  onSave,
  onDelete,
  product,
  name,
  setName,
  description,
  setDescription,
  price,
  setPrice,
  cost,
  setCost,
  image,
  setImage,
  selectedRecipes,
  setSelectedRecipes,
  recipeOptions,
  packageId,
  setPackageId,
  packageOptions,
  calculatedCost = false, costingControls,
}) => {
  const { t } = useTranslation("common");
  const { selectedCurrency } = useWorkspace();
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const issue = (field: string) => attempted && validationErrors[field] ? t(validationErrors[field].key, validationErrors[field].values) : undefined;
  const errors = attempted ? Object.values(validationErrors).map(error => t(error.key, error.values)) : [];
  useEffect(() => { if (!show) { setShowPackageModal(false); setAttempted(false); } }, [show]);

  const handlePackageCreated = (newPackage: { id: number; name: string }) => {
    // Update the packageId with the newly created package
    setPackageId(newPackage.id);

    // Refresh the packages list in the parent component
    // This will be handled by the parent component through SWR's mutate
  };

  const handleSave = () => {
    if (busy || readOnly) return;
    if (savedRefreshRequired) { onRefresh?.(); return; }
    setAttempted(true);
    if (Object.keys(validationErrors).length === 0) onSave(); else focusFirstProductError(bodyRef.current);
  };
  const isFieldInvalid = (field: string) => Boolean(issue(field === 'package' ? 'packageId' : field));

  return (
    <Modal show={show} onHide={() => { if (!busy) onClose(); }} backdrop={busy ? 'static' : true} keyboard={!busy} centered size="lg" className="product-modal" aria-labelledby={titleId}>
      <Modal.Header closeButton={!busy} closeLabel={t('close')} className="border-0 pb-0">
        <Modal.Title className="w-100">
          <div className="d-flex align-items-center justify-content-between">
            <h4 id={titleId} className="mb-0 text-primary">
              <FaTag className="me-2" />
              {product ? t("editProduct") : t("addProduct")}
            </h4>
            {product && (
              <Button
                variant="outline-danger"
                disabled={busy || readOnly || savedRefreshRequired}
                onClick={onDelete}
                className="btn-icon product-modal-delete-header d-none d-sm-inline-flex"
                title={t("delete")}
                aria-label={t("delete") + " " + product.name}
              >
                <FaTrash />
              </Button>
            )}
          </div>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body ref={bodyRef} className="pt-0 px-3 px-md-4">
        <Form onSubmit={event => { event.preventDefault(); handleSave(); }}>
          <fieldset disabled={busy || readOnly || savedRefreshRequired} className="border-0 p-0 m-0">
          <div className="form-section mb-3 p-3 rounded">
            <h5 className="section-title text-primary mb-3">
              <FaInfoCircle className="me-2" />
              {t("basicInfo")}
            </h5>
            <Row className="g-2">
              <Col md={6}>
                <Form.Group controlId="name" className="mb-3">
                  <Form.Label>
                    {t("productNameLabel")} <span className="text-danger">*</span>
                  </Form.Label>
                  <InputGroup>
                    <InputGroup.Text>
                      <FaTag />
                    </InputGroup.Text>
                    <Form.Control
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder={t("enterName")}
                      isInvalid={isFieldInvalid('name')} aria-invalid={isFieldInvalid('name')} aria-describedby={isFieldInvalid('name') ? 'name-error' : undefined}
                    />
                  </InputGroup>
                  {isFieldInvalid('name') && (
                    <Form.Control.Feedback id="name-error" className="d-block" type="invalid">
                      {issue('name')}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="image" className="mb-3">
                  <Form.Label>{t("imageUrl")}</Form.Label>
                  <Form.Control
                    type="text"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    isInvalid={isFieldInvalid('image')} aria-invalid={isFieldInvalid('image')} aria-describedby={isFieldInvalid('image') ? 'image-error' : undefined}
                  />
                  {isFieldInvalid('image') && (
                    <Form.Control.Feedback id="image-error" className="d-block" type="invalid">
                      {issue('image')}
                    </Form.Control.Feedback>
                  )}
                  <Form.Text className="text-muted">
                    {t('imageUrlOptional')}
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>
            <Form.Group controlId="description" className="mb-3">
              <Form.Label>
                {t("description")} <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                placeholder={t("enterDescription")}
                isInvalid={isFieldInvalid('description')} aria-invalid={isFieldInvalid('description')} aria-describedby={isFieldInvalid('description') ? 'description-error' : undefined}
              />
              {isFieldInvalid('description') && (
                <Form.Control.Feedback id="description-error" className="d-block" type="invalid">
                  {issue('description')}
                </Form.Control.Feedback>
              )}
            </Form.Group>
          </div>

          <div className="form-section mb-3 p-3 rounded">
            <h5 className="section-title text-primary mb-3">
              <FaDollarSign className="me-2" />
              {t("prices")}
            </h5>
            <Row className="g-2">
              <Col md={6}>
                <Form.Group controlId="price" className="mb-3">
                  <Form.Label>
                    {t("price")} <span className="text-danger">*</span>
                  </Form.Label>
                  <InputGroup>
                    <InputGroup.Text>{selectedCurrency || ''}</InputGroup.Text>
                    <Form.Control
                      type="text" inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      isInvalid={isFieldInvalid('price')} aria-invalid={isFieldInvalid('price')} aria-describedby={isFieldInvalid('price') ? 'price-error' : undefined}
                    />
                  </InputGroup>
                  {isFieldInvalid('price') && (
                    <Form.Control.Feedback id="price-error" className="d-block" type="invalid">
                      {issue('price')}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="cost" className="mb-3" hidden={calculatedCost}>
                  <Form.Label>
                    {t("cost")} <span className="text-danger">*</span>
                  </Form.Label>
                  <InputGroup>
                    <InputGroup.Text>{selectedCurrency || ''}</InputGroup.Text>
                    <Form.Control
                      type="text" inputMode="decimal"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      required
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      isInvalid={isFieldInvalid('cost')} aria-invalid={isFieldInvalid('cost')} aria-describedby={isFieldInvalid('cost') ? 'cost-error' : undefined}
                    />
                  </InputGroup>
                  {isFieldInvalid('cost') && (
                    <Form.Control.Feedback id="cost-error" className="d-block" type="invalid">
                      {issue('cost')}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
              </Col>
            </Row>
          </div>

          <div className="form-section p-3 rounded">
            <h5 className="section-title text-primary mb-3">
              <FaCog className="me-2" />
              {t("details")}
            </h5>
            <Row className="g-2">
              <Col md={6}>
                <Form.Group controlId="packageId" className="mb-3">
                  <div className="product-modal-field-header d-flex align-items-center mb-2">
                    <Form.Label className="mb-0 me-1">
                      <FaBoxOpen className="me-1" />
                      {t("package")} <span className="text-danger">*</span>
                    </Form.Label>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="ms-auto"
                      onClick={() => setShowPackageModal(true)}
                      title={t("addPackage")}
                    >
                      <FaPlus />
                    </Button>
                  </div>
                  <SelectDropdown isDisabled={busy || readOnly || savedRefreshRequired} inputId="packageId"
                    options={packageOptions}
                    value={packageOptions.find(
                      (option) => option.value === packageId
                    ) || null}
                    onChange={(selectedOption) =>
                      setPackageId(selectedOption?.value || null)
                    }
                    placeholder={t("choosePackage")}
                    isClearable
                    error={isFieldInvalid('package') ? t('packageRequired') : undefined}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="recipeIds" className="mb-3">
                  <div className="product-modal-field-header d-flex align-items-center mb-2">
                    <Form.Label className="mb-0 me-1">
                      <FaUtensils className="me-1" />
                      {t("recipes")} ({t("costingOptionalLinks")})
                    </Form.Label>
                    {selectedRecipes.length > 0 && (
                      <span className="badge bg-primary ms-2">
                        {selectedRecipes.length}
                      </span>
                    )}
                  </div>
                  <SelectDropdown isDisabled={busy || readOnly || savedRefreshRequired} inputId="recipeIds"
                    isMulti
                    options={recipeOptions}
                    value={selectedRecipes}
                    onChange={(selectedOptions) => {
                      setSelectedRecipes(selectedOptions as { value: number; label: string }[]);
                    }}
                    placeholder={t("chooseRecipe")}
                    closeMenuOnSelect={false}
                    error={isFieldInvalid('recipes') ? t('atLeastOneRecipeRequired') : undefined}
                    helperText={t('costingLegacyLinksHelp')}
                  />
                </Form.Group>
              </Col>
            </Row>
          </div>
          <div id="product-configuration" tabIndex={-1} aria-invalid={Boolean(issue('product-configuration'))} aria-describedby={issue('product-configuration') ? 'product-configuration-error' : undefined}>
            {costingControls}
            {issue('product-configuration') && <p id="product-configuration-error" className="text-danger">{issue('product-configuration')}</p>}
          </div>
          </fieldset>
        </Form>
      </Modal.Body>
      <Modal.Footer className="border-0 pt-3 px-3 px-md-4 product-modal-footer">
        {errors.length > 0 && <div role="alert" className="product-editor-action-message text-danger w-100">{t('pleaseFixErrors')}: {errors[0]}</div>}
        {message && <div className="product-editor-action-message w-100"><Alert variant="warning" className="mb-0">{message}{onReload && <Button variant="outline-secondary" size="sm" className="ms-2" disabled={busy} onClick={onReload}>{t('productReloadConfiguration')}</Button>}</Alert></div>}
        <Button variant="outline-secondary" disabled={busy} onClick={onClose} className="w-100 mb-2 mb-sm-0 me-sm-2">
          <FaTimes className="me-2" /> {t("cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={busy || readOnly}
          onClick={handleSave}
          className="w-100"
        >
          <FaSave className="me-2" /> {t(savedRefreshRequired ? 'productRetryRead' : 'save')}
        </Button>
        {product && (
          <div className="product-modal-danger-zone d-sm-none">
            <Button
              variant="outline-danger"
              onClick={onDelete}
              className="w-100"
              aria-label={t("delete") + " " + product.name}
            >
              <FaTrash className="me-2" /> {t("delete")}
            </Button>
          </div>
        )}
      </Modal.Footer>

      <PackageModal
        show={showPackageModal}
        onClose={() => setShowPackageModal(false)}
        onPackageCreated={handlePackageCreated}
      />
    </Modal>
  );
};

export default React.memo(ProductModal);
