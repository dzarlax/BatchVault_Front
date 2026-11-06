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
    if (!name.trim() || (weight.trim() && (parsedWeight == null || parsedWeight <= 0)) || (cost.trim() && parsedCost == null)) { setError('Enter a name, positive net weight and non-negative package cost, or leave unknown values blank.'); return; }
    if (editingId && !products) { setError('Wait for linked products to load before editing this format.'); return; }
    const initializes = current?.net_weight_g == null && parsedWeight != null && linked.length > 0;
    if (initializes && !reviewed) { setError('Review the linked products and confirm the initial net weight.'); return; }
    if (editingId && linked.length > 0 && parsedCost !== current?.unit_cost && !window.confirm(`This changes current estimates for products using this format:\n${linked.map(product => product.name).join('\n')}\nStored order costs stay unchanged. Continue?`)) return;
    setSaving(true); setError('');
    try {
      const pkg = await fetcher(editingId ? `/api/packages/${editingId}` : '/api/packages', { method: editingId ? 'PATCH' : 'POST', headers: { 'X-Workspace-ID': selectedWorkspaceId }, body: JSON.stringify({ name: name.trim(), net_weight_g: parsedWeight, unit_cost: parsedCost, confirm_weight_initialization: initializes && reviewed }) });
      await invalidateCosting(selectedWorkspaceId); onPackageCreated(pkg); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save package'); }
    finally { setSaving(false); }
  };
  return <Modal show={show} onHide={onClose} centered size="lg"><Modal.Header closeButton><Modal.Title>Packaging formats</Modal.Title></Modal.Header><Modal.Body>
    {error && <Alert variant="danger">{error}</Alert>}
    <Form.Group controlId="packagingFormatToEdit" className="mb-3"><Form.Label>Format to edit</Form.Label><Form.Select value={editingId} onChange={e => choose(Number(e.target.value))}><option value={0}>Create a new format</option>{packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.name}{pkg.net_weight_g != null ? ` · ${pkg.net_weight_g} g` : ' · weight unknown'}</option>)}</Form.Select></Form.Group>
    <Form.Group controlId="packageName" className="mb-3"><Form.Label>Name</Form.Label><Form.Control value={name} onChange={e => setName(e.target.value)} /></Form.Group>
    <Form.Group controlId="packageNetWeight" className="mb-3"><Form.Label>Net product weight (g)</Form.Label><Form.Control inputMode="decimal" value={weight} disabled={established || saving} onChange={e => { setWeight(e.target.value); setReviewed(false); }} placeholder="Unknown" /><Form.Text>Finished content only; the empty package weight is excluded. Up to three decimal places.</Form.Text></Form.Group>
    <Form.Group controlId="packageUnitCost" className="mb-3"><Form.Label>Packaging cost per unit</Form.Label><Form.Control inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="Unknown" /><Form.Text>One complete package including its label. Explicit 0 means free; blank means unknown.</Form.Text></Form.Group>
    {editingId !== 0 && <div className="mb-3"><strong>Linked products</strong>{products ? <ul>{linked.map(product => <li key={product.id}>{product.name}</li>)}</ul> : <p>Loading linked products…</p>}{!linked.length && products && <p>No active products use this format.</p>}</div>}
    {current?.net_weight_g == null && linked.length > 0 && <Form.Check id="reviewPackageInitialization" checked={reviewed} onChange={e => setReviewed(e.target.checked)} label="I reviewed the linked products and confirm this format's initial net weight. Products with a different size will be reassigned explicitly." />}
    {established && <Alert variant="info">This used format has an established weight. Create a new format for another size.<div><Button size="sm" variant="outline-primary" onClick={() => { setEditingId(0); setName(`${name} (Copy)`); setReviewed(false); }}>Copy as new format</Button></div></Alert>}
  </Modal.Body><Modal.Footer><Button variant="outline-secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || !isWorkspaceReady} onClick={save}>{saving ? 'Saving…' : 'Save format'}</Button></Modal.Footer></Modal>;
}
