import React, { useState } from "react";
import { Modal, Button, Form, Row, Col, Alert, InputGroup } from "react-bootstrap";
import { FaTrash, FaSave, FaTimes, FaPlus, FaInfoCircle, FaTag, FaDollarSign, FaCog, FaUtensils, FaBoxOpen } from "react-icons/fa";
import useTranslation from "next-translate/useTranslation";
import PackageModal from "./PackageModal";
import SelectDropdown from "../../SelectDropdown";
import { useWorkspace } from '../../../utils/workspaceContext';

interface ProductModalProps {
  show: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  product?: { id: number; name: string } | null;
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (description: string) => void;
  price: string;
  setPrice: (price: string) => void;
  cost: string;
  setCost: (cost: string) => void;
  image: string;
  setImage: (image: string) => void;
  selectedRecipes: { value: number; label: string }[];
  setSelectedRecipes: (recipes: { value: number; label: string }[]) => void;
  recipeOptions: { value: number; label: string }[];
  packageId: number | null;
  setPackageId: (id: number | null) => void;
  packageOptions: { value: number; label: string }[];
}

const ProductModal: React.FC<ProductModalProps> = ({
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
}) => {
  const { t } = useTranslation("common");
  const { selectedCurrency } = useWorkspace();
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  
  const handlePackageCreated = (newPackage: { id: number; name: string }) => {
    // Update the packageId with the newly created package
    setPackageId(newPackage.id);
    
    // Refresh the packages list in the parent component
    // This will be handled by the parent component through SWR's mutate
  };

  // Validation function
  const validateForm = () => {
    const validationErrors = [];
    
    if (!name.trim()) validationErrors.push(t('productNameRequired'));
    if (!description.trim()) validationErrors.push(t('productDescriptionRequired'));
    if (!price || parseFloat(price) <= 0) validationErrors.push(t('validPriceRequired'));
    if (!cost || parseFloat(cost) <= 0) validationErrors.push(t('validCostRequired'));
    if (!packageId) validationErrors.push(t('packageRequired'));
    if (selectedRecipes.length === 0) validationErrors.push(t('atLeastOneRecipeRequired'));
    
    // Validate image URL if provided
    if (image.trim()) {
      try {
        new URL(image);
      } catch (_) {
        validationErrors.push(t('invalidImageUrl'));
      }
    }
    
    setErrors(validationErrors);
    return validationErrors.length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      setErrors([]);
      onSave();
    }
  };

  const isFieldInvalid = (fieldName: string) => {
    switch (fieldName) {
      case 'name': return !name.trim();
      case 'description': return !description.trim();
      case 'price': return !price || parseFloat(price) <= 0;
      case 'cost': return !cost || parseFloat(cost) <= 0;
      case 'package': return !packageId;
      case 'recipes': return selectedRecipes.length === 0;
      case 'image': return image.trim() && (() => { try { new URL(image); return false; } catch { return true; } })();
      default: return false;
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered size="lg" className="product-modal">
      <Modal.Header closeButton className="border-0 pb-0">
        <Modal.Title className="w-100">
          <div className="d-flex align-items-center justify-content-between">
            <h4 className="mb-0 text-primary">
              <FaTag className="me-2" />
              {product ? t("editProduct") : t("addProduct")}
            </h4>
            {product && (
              <Button
                variant="outline-danger"
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
      <Modal.Body className="pt-0 px-3 px-md-4">
        {errors.length > 0 && (
          <Alert variant="danger" className="mb-3">
            <FaInfoCircle className="me-2" />
            <strong>{t('pleaseFixErrors')}:</strong>
            <ul className="mb-0 mt-2">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </Alert>
        )}
        
        <Form>
          <div className="form-section mb-3 p-3 rounded">
            <h5 className="section-title text-primary mb-3">
              <FaInfoCircle className="me-2" />
              {t("basicInfo")}
            </h5>
            <Row className="g-2">
              <Col md={6}>
                <Form.Group controlId="name" className="mb-3">
                  <Form.Label>
                    {t("name")} <span className="text-danger">*</span>
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
                      isInvalid={isFieldInvalid('name')}
                    />
                  </InputGroup>
                  {isFieldInvalid('name') && (
                    <Form.Control.Feedback type="invalid">
                      {t('productNameRequired')}
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
                    isInvalid={isFieldInvalid('image')}
                  />
                  {isFieldInvalid('image') && (
                    <Form.Control.Feedback type="invalid">
                      {t('invalidImageUrl')}
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
                isInvalid={isFieldInvalid('description')}
              />
              {isFieldInvalid('description') && (
                <Form.Control.Feedback type="invalid">
                  {t('productDescriptionRequired')}
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
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      required
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      isInvalid={isFieldInvalid('price')}
                    />
                  </InputGroup>
                  {isFieldInvalid('price') && (
                    <Form.Control.Feedback type="invalid">
                      {t('validPriceRequired')}
                    </Form.Control.Feedback>
                  )}
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="cost" className="mb-3">
                  <Form.Label>
                    {t("cost")} <span className="text-danger">*</span>
                  </Form.Label>
                  <InputGroup>
                    <InputGroup.Text>{selectedCurrency || ''}</InputGroup.Text>
                    <Form.Control
                      type="number"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      required
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      isInvalid={isFieldInvalid('cost')}
                    />
                  </InputGroup>
                  {isFieldInvalid('cost') && (
                    <Form.Control.Feedback type="invalid">
                      {t('validCostRequired')}
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
                  <SelectDropdown
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
                      {t("recipes")} <span className="text-danger">*</span>
                    </Form.Label>
                    {selectedRecipes.length > 0 && (
                      <span className="badge bg-primary ms-2">
                        {selectedRecipes.length}
                      </span>
                    )}
                  </div>
                  <SelectDropdown
                    isMulti
                    options={recipeOptions}
                    value={selectedRecipes}
                    onChange={(selectedOptions) => {
                      setSelectedRecipes(selectedOptions as { value: number; label: string }[]);
                    }}
                    placeholder={t("chooseRecipe")}
                    closeMenuOnSelect={false}
                    error={isFieldInvalid('recipes') ? t('atLeastOneRecipeRequired') : undefined}
                    required
                    helperText={selectedRecipes.length === 0 ? t('selectRecipesHelp') : undefined}
                  />
                </Form.Group>
              </Col>
            </Row>
          </div>
        </Form>
      </Modal.Body>
      <Modal.Footer className="border-0 pt-3 px-3 px-md-4 product-modal-footer">
        <Button variant="outline-secondary" onClick={onClose} className="w-100 mb-2 mb-sm-0 me-sm-2">
          <FaTimes className="me-2" /> {t("cancel")}
        </Button>
        <Button 
          variant="primary" 
          onClick={handleSave} 
          className="w-100"
        >
          <FaSave className="me-2" /> {t("save")}
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
