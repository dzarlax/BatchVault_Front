import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { FaPlus, FaSave, FaTrash } from 'react-icons/fa';
import useTranslation from 'next-translate/useTranslation';
import { focusFirstProductError, ProductEditorErrors } from '../../../utils/productEditorState';
import { useWorkspace } from '../../../utils/workspaceContext';
import SelectDropdown from '../../SelectDropdown';
import PackageModal from './PackageModal';
import LegacyProductModal from './LegacyProductModal';

export interface ProductModalProps {
  modern?: boolean; busy?: boolean; readOnly?: boolean; message?: string; onReload?: () => void; savedRefreshRequired?: boolean; onRefresh?: () => void;
  validationErrors?: ProductEditorErrors;
  typeControls?: React.ReactNode;
  configurationControls?: (packaging: React.ReactNode, attempted: boolean) => React.ReactNode;
  calculatedCost?: boolean; costingValid?: boolean; costingControls?: React.ReactNode;
  show: boolean; onClose: () => void; onSave: () => void; onDelete: () => void;
  product?: { id: number; name: string } | null;
  name: string; setName: (value: string) => void; description: string; setDescription: (value: string) => void;
  price: string; setPrice: (value: string) => void; cost: string; setCost: (value: string) => void;
  image: string; setImage: (value: string) => void;
  selectedRecipes: { value: number; label: string }[]; setSelectedRecipes: (value: { value: number; label: string }[]) => void;
  recipeOptions: { value: number; label: string }[]; packageId: number | null; setPackageId: (value: number | null) => void;
  packageOptions: { value: number; label: string }[];
}
export default function ProductModal(props: ProductModalProps) {
  return props.modern ? <ModernProductModal {...props} /> : <LegacyProductModal {...props} />;
}
function ModernProductModal(props: ProductModalProps) {
  const { t } = useTranslation('common');
  const { selectedCurrency } = useWorkspace();
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const [attempted, setAttempted] = useState(false);
  const [showPackage, setShowPackage] = useState(false);
  const wasOpen = useRef(false);
  useEffect(() => { if (!props.show || !wasOpen.current) { setAttempted(false); setShowPackage(false); } wasOpen.current = props.show; }, [props.show]);
  const { busy = false, readOnly = false } = props;
  const errors = props.validationErrors || {};
  const valid = Object.keys(errors).length === 0;
  const issue = (id: string) => attempted && errors[id] ? t(errors[id].key, errors[id].values) : undefined;
  const feedback = (id: string) => issue(id) ? <div id={`${id}-error`} className="invalid-feedback d-block">{issue(id)}</div> : null;
  const handleSave = () => {
    if (busy || readOnly) return;
    if (props.savedRefreshRequired) { props.onRefresh?.(); return; }
    setAttempted(true);
    if (valid) props.onSave(); else focusFirstProductError(bodyRef.current);
  };
  const packaging = <Form.Group className="mb-2"><div className="d-flex justify-content-between align-items-center mb-2">
    <Form.Label htmlFor="packageId" className="mb-0">{t('package')} *</Form.Label>
    <Button variant="outline-primary" size="sm" aria-label={t('addPackage')} onClick={() => setShowPackage(true)} disabled={busy || readOnly || props.savedRefreshRequired}><FaPlus /></Button></div>
    <SelectDropdown inputId="packageId" options={props.packageOptions} value={props.packageOptions.find(option => option.value === props.packageId) ?? null}
      onChange={option => props.setPackageId(option?.value ?? null)} placeholder={t('choosePackage')} isSearchable isClearable required
      error={issue('packageId')} isDisabled={busy || readOnly || props.savedRefreshRequired} />
  </Form.Group>;
  return <>
    <Modal show={props.show} onHide={() => { if (!busy) props.onClose(); }} backdrop={busy ? 'static' : true} keyboard={!busy} centered size="lg" className="product-modal product-type-modal" aria-labelledby={titleId}>
      <Modal.Header closeButton={!busy} closeLabel={t('close')}><Modal.Title id={titleId}>{props.product ? t('editProduct') : t('addProduct')}</Modal.Title></Modal.Header>
      <Modal.Body ref={bodyRef}>
        {readOnly && <Alert variant="info">{t('productTypeUnavailable')}</Alert>}
        <Form onSubmit={event => { event.preventDefault(); handleSave(); }}>
          <fieldset disabled={busy || readOnly || props.savedRefreshRequired} className="border-0 p-0 m-0">
            {props.typeControls}
            <section className="product-configuration-section"><h5>{t('basicInfo')}</h5>
              <Form.Group controlId="name" className="mb-3"><Form.Label>{t('productNameLabel')} *</Form.Label><Form.Control value={props.name} onChange={event => props.setName(event.target.value)} isInvalid={Boolean(issue('name'))} aria-invalid={Boolean(issue('name'))} aria-describedby={issue('name') ? 'name-error' : undefined} />{feedback('name')}</Form.Group>
              <Form.Group controlId="description" className="mb-3"><Form.Label>{t('description')} *</Form.Label><Form.Control as="textarea" rows={2} value={props.description} onChange={event => props.setDescription(event.target.value)} isInvalid={Boolean(issue('description'))} aria-invalid={Boolean(issue('description'))} aria-describedby={issue('description') ? 'description-error' : undefined} />{feedback('description')}</Form.Group>
              <Form.Group controlId="price" className="mb-3"><Form.Label>{t('price')} *</Form.Label><div className="input-group"><span className="input-group-text">{selectedCurrency || ''}</span><Form.Control inputMode="decimal" value={props.price} onChange={event => props.setPrice(event.target.value)} isInvalid={Boolean(issue('price'))} aria-invalid={Boolean(issue('price'))} aria-describedby={issue('price') ? 'price-error' : undefined} /></div>{feedback('price')}</Form.Group>
              <details><summary className="small text-secondary">{t('imageUrl')}</summary><Form.Group controlId="image" className="mt-2"><Form.Control value={props.image} onChange={event => props.setImage(event.target.value)} aria-label={t('imageUrl')} isInvalid={Boolean(issue('image'))} aria-invalid={Boolean(issue('image'))} aria-describedby={issue('image') ? 'image-error' : undefined} />{feedback('image')}</Form.Group></details>
            </section>
            {props.configurationControls?.(packaging, attempted)}
          </fieldset>
        </Form>
      </Modal.Body>
      <Modal.Footer className="d-flex gap-2 product-modal-footer">
        {attempted && !valid && <div role="alert" className="product-editor-action-message text-danger w-100">{t('pleaseFixErrors')}: {t(Object.values(errors)[0].key, Object.values(errors)[0].values)}</div>}
        {props.message && <div className="product-editor-action-message w-100"><Alert variant="warning" className="mb-0">{props.message}{props.onReload && <Button variant="outline-secondary" size="sm" className="ms-2" disabled={busy} onClick={props.onReload}>{t('productReloadConfiguration')}</Button>}</Alert></div>}
        {props.product && <Button variant="outline-danger" disabled={busy || readOnly || props.savedRefreshRequired} onClick={props.onDelete} aria-label={t('delete')}><FaTrash /></Button>}
        <Button variant="outline-secondary" disabled={busy} onClick={props.onClose}>{t('cancel')}</Button>
        <Button variant="primary" className="ms-auto" disabled={busy || readOnly} onClick={handleSave}><FaSave className="me-2" />{t(props.savedRefreshRequired ? 'productRetryRead' : 'save')}</Button>
      </Modal.Footer>
    </Modal>
    <PackageModal show={showPackage && props.show} onClose={() => setShowPackage(false)} onPackageCreated={pkg => { props.setPackageId(pkg.id); }} />
  </>;
}
