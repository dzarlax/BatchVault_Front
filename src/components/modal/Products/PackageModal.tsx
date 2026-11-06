import useTranslation from 'next-translate/useTranslation';
import { useId } from 'react';
import SelectDropdown from '../../SelectDropdown';
import React, { useEffect, useState } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import useSWR from 'swr';
import fetcher from '../../../utils/fetcher';
import { useAuth } from '../../../utils/authContext';
import { useWorkspace } from '../../../utils/workspaceContext';
import { workspaceFetcher, workspaceKey } from '../../../utils/workspaceSWR';
import { Product, ProductPackage } from '../../../types/api';
import { decimalInput, invalidateCosting } from '../../../utils/costing';

interface PackageModalProps { show: boolean; onClose: () => void; onPackageCreated: (pkg: ProductPackage) => void; }
export default function PackageModal({ show, onClose, onPackageCreated }: PackageModalProps) {
  const { t } = useTranslation('common');
  const titleId = `package-modal-title-${useId()}`;
  const { auth } = useAuth();
  const { selectedWorkspaceId, isWorkspaceReady } = useWorkspace();
  const { data: packages = [] } = useSWR<ProductPackage[]>(workspaceKey('/api/packages', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady), workspaceFetcher);
  const { data: products } = useSWR<Product[]>(workspaceKey('/api/products', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady), workspaceFetcher);
  const [editingId, setEditingId] = useState(0);
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [cost, setCost] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const current = packages.find(pkg => pkg.id === editingId);
  const linked = products?.filter(product => product.package_id === editingId) ?? [];
  const established = Boolean(current?.net_weight_g != null && linked.length > 0);
  useEffect(() => { setEditingId(0); setName(''); setWeight(''); setCost(''); setReviewed(false); setError(''); }, [show, selectedWorkspaceId]);
  const choose = (id: number) => {
    const pkg = packages.find(item => item.id === id);
    setEditingId(id); setName(pkg?.name ?? ''); setWeight(pkg?.net_weight_g == null ? '' : String(pkg.net_weight_g)); setCost(pkg?.unit_cost == null ? '' : String(pkg.unit_cost)); setReviewed(false); setError('');
  };
  const save = async () => {
    const parsedWeight = weight.trim() ? decimalInput(weight) : null;
    const parsedCost = cost.trim() ? decimalInput(cost) : null;
    if (!name.trim() || (weight.trim() && (parsedWeight == null || parsedWeight <= 0)) || (cost.trim() && parsedCost == null)) { setError(t('costingPackageValidation')); return; }
    if (editingId && !products) { setError(t('costingWaitLinked')); return; }
    const initializes = current?.net_weight_g == null && parsedWeight != null && linked.length > 0;
    if (initializes && !reviewed) { setError(t('costingConfirmInitialWeight')); return; }
    if (editingId && linked.length > 0 && parsedCost !== current?.unit_cost && !window.confirm(t('costingPackageCostConfirmation', { products: linked.map(product => product.name).join('\n') }))) return;
    setSaving(true); setError('');
    try {
      const pkg = await fetcher(editingId ? `/api/packages/${editingId}` : '/api/packages', { method: editingId ? 'PATCH' : 'POST', headers: { 'X-Workspace-ID': selectedWorkspaceId }, body: JSON.stringify({ name: name.trim(), net_weight_g: parsedWeight, unit_cost: parsedCost, confirm_weight_initialization: initializes && reviewed }) });
      await invalidateCosting(selectedWorkspaceId); onPackageCreated(pkg); onClose();
    } catch (err) { setError(t('costingPackageSaveFailed')); }
    finally { setSaving(false); }
  };
  const formatOptions = [{ value: 0, label: t('costingCreateFormat') }, ...packages.map(pkg => ({ value: pkg.id, label: `${pkg.name} · ${pkg.net_weight_g != null ? t('costingGramsValue', { weight: pkg.net_weight_g }) : t('costingWeightUnknown')}` }))];
  return <Modal show={show} onHide={onClose} centered size="lg" className="ui-workflow-modal" aria-labelledby={titleId}><Modal.Header closeButton closeLabel={t('close')}><Modal.Title id={titleId}>{t('costingPackagingFormats')}</Modal.Title></Modal.Header><Modal.Body>
    {error && <Alert variant="danger">{error}</Alert>}
    <Form.Group className="mb-3"><SelectDropdown inputId="packagingFormatToEdit" aria-label={t('costingFormatToEdit')} label={t('costingFormatToEdit')}
      options={formatOptions} value={formatOptions.find(option => option.value === editingId)} onChange={option => choose(option?.value ?? 0)} isSearchable
      loadingMessage={t('costingSelectLoading')} noOptionsMessage={t('costingSelectEmpty')} /></Form.Group>
    <Form.Group controlId="packageName" className="mb-3"><Form.Label>{t('name')}</Form.Label><Form.Control value={name} onChange={e => setName(e.target.value)} /></Form.Group>
    <Form.Group controlId="packageNetWeight" className="mb-3"><Form.Label>{t('costingNetWeight')}</Form.Label><Form.Control inputMode="decimal" value={weight} disabled={established || saving} onChange={e => { setWeight(e.target.value); setReviewed(false); }} placeholder={t('costingUnknown')} /><Form.Text>{t('costingNetWeightHelp')}</Form.Text></Form.Group>
    <Form.Group controlId="packageUnitCost" className="mb-3"><Form.Label>{t('costingPackageUnitCost')}</Form.Label><Form.Control inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder={t('costingUnknown')} /><Form.Text>{t('costingPackageCostHelp')}</Form.Text></Form.Group>
    {editingId !== 0 && <div className="mb-3"><strong>{t('costingLinkedProducts')}</strong>{products ? <ul>{linked.map(product => <li key={product.id}>{product.name}</li>)}</ul> : <p>{t('costingLoadingLinked')}</p>}{!linked.length && products && <p>{t('costingNoLinkedProducts')}</p>}</div>}
    {current?.net_weight_g == null && linked.length > 0 && <Form.Check id="reviewPackageInitialization" checked={reviewed} onChange={e => setReviewed(e.target.checked)} label={t('costingReviewPackageWeight')} />}
    {established && <Alert variant="info">{t('costingEstablishedWeight')}<div><Button size="sm" variant="outline-primary" onClick={() => { setEditingId(0); setName(t('costingCopyName', { name })); setReviewed(false); }}>{t('costingCopyFormat')}</Button></div></Alert>}
  </Modal.Body><Modal.Footer><Button variant="outline-secondary" disabled={saving} onClick={onClose}>{t('cancel')}</Button><Button disabled={saving || !isWorkspaceReady} onClick={save}>{saving ? t('costingSaving') : t('costingSaveFormat')}</Button></Modal.Footer></Modal>;
}
