import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { FaPlus, FaSave, FaTrash } from 'react-icons/fa';
import useTranslation from 'next-translate/useTranslation';
import { decimalInput } from '../../../utils/costing';
import SelectDropdown from '../../SelectDropdown';
import PackageModal from './PackageModal';
import LegacyProductModal from './LegacyProductModal';

export interface ProductModalProps {
  modern?: boolean; busy?: boolean; readOnly?: boolean; message?: string; onReload?: () => void; savedRefreshRequired?: boolean; onRefresh?: () => void;
  typeControls?: React.ReactNode;
  configurationControls?: (packaging: React.ReactNode) => React.ReactNode;
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
  const [attempted, setAttempted] = useState(false);
  const [showPackage, setShowPackage] = useState(false);
  const wasOpen = useRef(false);
  useEffect(() => { if (!props.show || !wasOpen.current) { setAttempted(false); setShowPackage(false); } wasOpen.current = props.show; }, [props.show]);
  const { busy = false, readOnly = false } = props;
  const valid = props.name.trim() && props.description.trim() && decimalInput(props.price) != null && Number(decimalInput(props.price)) > 0 && props.packageId && props.costingValid &&
    (props.calculatedCost || decimalInput(props.cost) != null) && (!props.image.trim() || (() => { try { new URL(props.image); return true; } catch { return false; } })());
  const packaging = <Form.Group className="mb-2"><div className="d-flex justify-content-between align-items-center mb-2">
    <Form.Label htmlFor="packageId" className="mb-0">{t('package')} *</Form.Label>
    <Button variant="outline-primary" size="sm" aria-label={t('addPackage')} onClick={() => setShowPackage(true)} disabled={busy || readOnly || props.savedRefreshRequired}><FaPlus /></Button></div>
    <SelectDropdown inputId="packageId" options={props.packageOptions} value={props.packageOptions.find(option => option.value === props.packageId) ?? null}
      onChange={option => props.setPackageId(option?.value ?? null)} placeholder={t('choosePackage')} isSearchable isClearable required
      error={attempted && !props.packageId ? t('packageRequired') : undefined} isDisabled={busy || readOnly || props.savedRefreshRequired} />
  </Form.Group>;
  return <>
    <Modal show={props.show} onHide={() => { if (!busy) props.onClose(); }} backdrop={busy ? 'static' : true} keyboard={!busy} centered size="lg" className="product-modal product-type-modal">
      <Modal.Header closeButton={!busy}><Modal.Title>{props.product ? t('editProduct') : t('addProduct')}</Modal.Title></Modal.Header>
      <Modal.Body>
        {props.message && <Alert variant="warning">{props.message}{props.onReload && <Button variant="outline-secondary" size="sm" className="ms-2" disabled={busy} onClick={props.onReload}>{t('productReloadConfiguration')}</Button>}</Alert>}
        {readOnly && <Alert variant="info">{t('productTypeUnavailable')}</Alert>}
        {attempted && !valid && <Alert variant="danger">{t('productConfigurationInvalid')}</Alert>}
        <Form onSubmit={event => { event.preventDefault(); setAttempted(true); if (valid && !busy && !readOnly) props.onSave(); }}>
          <fieldset disabled={busy || readOnly || props.savedRefreshRequired} className="border-0 p-0 m-0">
            {props.typeControls}
            <section className="product-configuration-section"><h5>{t('basicInfo')}</h5>
              <Form.Group controlId="name" className="mb-3"><Form.Label>{t('name')} *</Form.Label><Form.Control value={props.name} onChange={event => props.setName(event.target.value)} isInvalid={attempted && !props.name.trim()} /></Form.Group>
              <Form.Group controlId="description" className="mb-3"><Form.Label>{t('description')} *</Form.Label><Form.Control as="textarea" rows={2} value={props.description} onChange={event => props.setDescription(event.target.value)} isInvalid={attempted && !props.description.trim()} /></Form.Group>
              <Form.Group controlId="price" className="mb-3"><Form.Label>{t('price')} *</Form.Label><Form.Control inputMode="decimal" value={props.price} onChange={event => props.setPrice(event.target.value)} isInvalid={attempted && !(Number(decimalInput(props.price)) > 0)} /></Form.Group>
              <details><summary className="small text-secondary">{t('imageUrl')}</summary><Form.Group controlId="image" className="mt-2"><Form.Control value={props.image} onChange={event => props.setImage(event.target.value)} aria-label={t('imageUrl')} /></Form.Group></details>
            </section>
            {props.configurationControls?.(packaging)}
          </fieldset>
        </Form>
      </Modal.Body>
      <Modal.Footer className="d-flex gap-2">
        {props.product && <Button variant="outline-danger" disabled={busy || readOnly || props.savedRefreshRequired} onClick={props.onDelete} aria-label={t('delete')}><FaTrash /></Button>}
        <Button variant="outline-secondary" disabled={busy} onClick={props.onClose}>{t('cancel')}</Button>
        <Button variant="primary" className="ms-auto" disabled={busy || readOnly} onClick={() => { setAttempted(true); if (props.savedRefreshRequired) props.onRefresh?.(); else if (valid) props.onSave(); }}><FaSave className="me-2" />{t(props.savedRefreshRequired ? 'productRetryRead' : 'save')}</Button>
      </Modal.Footer>
    </Modal>
    <PackageModal show={showPackage && props.show} onClose={() => setShowPackage(false)} onPackageCreated={pkg => { props.setPackageId(pkg.id); }} />
  </>;
}
