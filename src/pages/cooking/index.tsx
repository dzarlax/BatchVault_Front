import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/router';
import { Alert, Button, Form, Table } from 'react-bootstrap';
import { FaFlask, FaPlus, FaSync } from 'react-icons/fa';
import SelectDropdown from '../../components/SelectDropdown';
import LoadingState from '../../components/LoadingState';
import ErrorState from '../../components/ErrorState';
import { useAuth, withAuth } from '../../utils/authContext';
import { useWorkspace } from '../../utils/workspaceContext';
import { workspaceFetcher, workspaceKey } from '../../utils/workspaceSWR';
import { cookingApiFor, cookingOperationScope, cookingRequestBody, getCookingPendingBody, clearCookingOperationId, displayGrams, operationErrorMessage, operationWasRejected, parseDecimalInput, parseSignedDecimalInput, hasBaseSelectionIssue } from '../../utils/cooking';
import type { CookingPlanInput, CookingPlanPreview, CookingRun, CookingStock } from '../../types/cooking';
import type { Order, Product, Recipe } from '../../types/api';

const CookingHome = () => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { auth } = useAuth();
  const { selectedWorkspaceId, selectedWorkspace, isWorkspaceReady } = useWorkspace();
  const enabled = auth.isAuthenticated && isWorkspaceReady && selectedWorkspace?.capabilities?.cooking_v1 === true;
  const contextKey = `${cookingOperationScope(selectedWorkspaceId)}|${auth.user?.id || auth.user?.userID || ''}`;
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;
  const api = useMemo(() => cookingApiFor(selectedWorkspaceId), [selectedWorkspaceId]);
  const key = (path: string) => workspaceKey(path, selectedWorkspaceId, enabled);
  const { data: orders, error: ordersError } = useSWR<Order[]>(key('/api/orders'), workspaceFetcher);
  const { data: products } = useSWR<Product[]>(key('/api/products'), workspaceFetcher);
  const { data: recipes } = useSWR<Recipe[]>(key('/api/recipes'), workspaceFetcher);
  const { data: runs, error: runsError, mutate: refreshRuns } = useSWR<{ items: CookingRun[]; next_cursor?: string | null }>(key('/api/cooking-runs'), workspaceFetcher);
  const { data: stock, mutate: refreshStock } = useSWR<CookingStock>(key('/api/cooking-stock'), workspaceFetcher);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [extraRecipe, setExtraRecipe] = useState<number | null>(null);
  const [extraGrams, setExtraGrams] = useState('');
  const [preview, setPreview] = useState<CookingPlanPreview | null>(null);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [baseSelections, setBaseSelections] = useState<Record<string, number>>({});
  const [acknowledged, setAcknowledged] = useState<number[]>([]);
  const [olderRuns, setOlderRuns] = useState<CookingRun[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingStockAction, setPendingStockAction] = useState<string | null>(null);
  const [stockKind, setStockKind] = useState<'initial' | 'correction' | 'waste' | 'return'>('initial');
  const [stockLot, setStockLot] = useState<number | null>(null);
  const [stockRecipe, setStockRecipe] = useState<number | null>(null);
  const [stockProduct, setStockProduct] = useState<number | null>(null);
  const [stockItemType, setStockItemType] = useState<'recipe' | 'product'>('recipe');
  const [stockQuantity, setStockQuantity] = useState('');
  const [stockReason, setStockReason] = useState('');
  const unfinishedOrders = useMemo(() => (orders || []).filter(order => !['finished', 'canceled'].includes(order.status)), [orders]);
  const recipeOptions = (recipes || []).map(recipe => ({ value: recipe.id, label: recipe.name }));
  const selectedStockLot = stock?.lots.find(lot => lot.id === stockLot);
  const stockQuantityUnit = ['initial', 'return'].includes(stockKind) ? stockItemType === 'product' ? 'pcs' : 'g' : selectedStockLot?.unit || 'g';
  const stockQuantityNumber = Number(stockQuantity.replace(',', '.'));
  const stockQuantityValid = stockKind === 'correction'
    ? Boolean(parseSignedDecimalInput(stockQuantity)) && stockQuantityNumber !== 0 && (stockQuantityUnit !== 'pcs' || Number.isInteger(stockQuantityNumber))
    : Boolean(parseDecimalInput(stockQuantity)) && stockQuantityNumber > 0 && (stockQuantityUnit !== 'pcs' || Number.isInteger(stockQuantityNumber));
  const baseSelectionComplete = (preview?.plan.flavors || []).every(flavor => {
    const ids = flavor.recipe_snapshot.ingredients.filter(row => row.type.toLowerCase() === 'base' && ['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms'].includes(row.unit.trim().toLowerCase())).map(row => row.recipe_ingredient_id);
    const requiresExplicit = hasBaseSelectionIssue(flavor.issues) || ids.length > 1;
    const selected = baseSelections[String(flavor.recipe_id)] || (!requiresExplicit ? flavor.base_recipe_ingredient_id : 0);
    return ids.length > 0 && ids.includes(selected);
  });

  useEffect(() => {
    setBusy(false);
    setLoadingMore(false);
    setSelectedOrders([]); setExtraRecipe(null); setExtraGrams(''); setPreview(null); setPreviewDirty(false); setTitle(''); setBaseSelections({}); setAcknowledged([]); setError('');
    setStockKind('initial'); setStockLot(null); setStockRecipe(null); setStockProduct(null); setStockItemType('recipe'); setStockQuantity(''); setStockReason('');
    setOlderRuns([]); setNextCursor(null); setPendingCreate(Boolean(getCookingPendingBody('new', 'create', selectedWorkspaceId)));
    const stockAction = ['initial','correction','waste','return'].map(kind => `stock-${kind}`).find(action => getCookingPendingBody('new', action, selectedWorkspaceId));
    setPendingStockAction(stockAction || null);
  }, [contextKey, selectedWorkspaceId]);
  useEffect(() => { setNextCursor(runs?.next_cursor ?? null); }, [runs?.next_cursor, contextKey]);

  const allRuns = useMemo(() => [...(runs?.items || []), ...olderRuns.filter(old => !(runs?.items || []).some(current => current.id === old.id))], [runs?.items, olderRuns]);

  const input: CookingPlanInput = {
    order_ids: selectedOrders,
    extras: extraRecipe && parseDecimalInput(extraGrams) ? [{ recipe_id: extraRecipe, finished_g: parseDecimalInput(extraGrams) }] : [],
    ...(Object.keys(baseSelections).length ? { base_selections: baseSelections } : {}),
    ...(acknowledged.length ? { acknowledged_run_ids: acknowledged } : {}),
  };

  const runPreview = async () => {
    const requestContext = contextKey;
    setBusy(true); setError('');
    try { const result = await api.plan(input); if (activeContext.current === requestContext) { setPreview(result); setPreviewDirty(false); } }
    catch (cause) { if (activeContext.current === requestContext) setError(operationErrorMessage(cause)); }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  };

  const loadMoreRuns = async () => {
    if (!nextCursor) return;
    const requestContext = contextKey;
    setLoadingMore(true);
    try { const page = await api.runs(nextCursor); if (activeContext.current === requestContext) { setOlderRuns(current => [...current, ...page.items]); setNextCursor(page.next_cursor ?? null); } }
    catch (cause) { if (activeContext.current === requestContext) setError(operationErrorMessage(cause)); }
    finally { if (activeContext.current === requestContext) setLoadingMore(false); }
  };

  const canStartFreshMutation = () => {
    const createPending = Boolean(getCookingPendingBody('new', 'create', selectedWorkspaceId));
    const stockAction = ['initial', 'correction', 'waste', 'return'].map(kind => `stock-${kind}`).find(action => getCookingPendingBody('new', action, selectedWorkspaceId));
    if (createPending || stockAction || pendingCreate || pendingStockAction) {
      setPendingCreate(createPending || pendingCreate);
      setPendingStockAction(stockAction || pendingStockAction);
      setError('ambiguous');
      return false;
    }
    return !busy;
  };

  const createRun = async () => {
    if (!canStartFreshMutation()) return;
    if (!preview || previewDirty) return;
    const requestContext = contextKey;
    const operationScope = cookingOperationScope(selectedWorkspaceId);
    setBusy(true); setError('');
    const body = cookingRequestBody('new', 'create', operation_id => ({ ...input, title: title.trim() || t('cookingNewRun'), date: new Date().toISOString(), source_signature: preview.source_signature, stock_version: preview.stock_version, operation_id }), selectedWorkspaceId);
    try {
      const run = await api.createRun(body);
      clearCookingOperationId('new', 'create', selectedWorkspaceId, operationScope);
      if (activeContext.current !== requestContext) return;
      setPendingCreate(false);
      await refreshRuns();
      router.push(`/cooking/${run.id}`);
    } catch (cause) { if (operationWasRejected(cause)) { clearCookingOperationId('new', 'create', selectedWorkspaceId, operationScope); if (activeContext.current === requestContext) setPendingCreate(false); } if (activeContext.current === requestContext) { if (operationErrorMessage(cause) === 'ambiguous') setPendingCreate(true); setError(operationErrorMessage(cause)); } }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  };

  const saveStockAdjustment = async () => {
    if (!canStartFreshMutation()) return;
    const quantity = stockKind === 'correction' ? parseSignedDecimalInput(stockQuantity) : parseDecimalInput(stockQuantity);
    if (!stock || !quantity || !stockReason.trim() || (stockQuantityUnit === 'pcs' && !Number.isInteger(stockQuantityNumber))) return;
    const requestContext = contextKey;
    const operationScope = cookingOperationScope(selectedWorkspaceId);
    setBusy(true); setError('');
    const action = `stock-${stockKind}`;
    const body = cookingRequestBody('new', action, operation_id => ({ operation_id, stock_version: stock.version, kind: stockKind, reason: stockReason.trim(), quantity, ...(['initial', 'return'].includes(stockKind) ? (stockItemType === 'recipe' ? { recipe_id: stockRecipe || undefined } : { product_id: stockProduct || undefined }) : { lot_id: stockLot || undefined }) }), selectedWorkspaceId);
    try {
      await api.adjustStock(body);
      clearCookingOperationId('new', action, selectedWorkspaceId, operationScope); if (activeContext.current === requestContext) { setPendingStockAction(null); setStockQuantity(''); setStockReason(''); await refreshStock(); }
    } catch (cause) { if (operationWasRejected(cause)) clearCookingOperationId('new', action, selectedWorkspaceId, operationScope); if (activeContext.current === requestContext) { if (operationWasRejected(cause)) setPendingStockAction(null); else if (operationErrorMessage(cause) === 'ambiguous') setPendingStockAction(action); setError(operationErrorMessage(cause)); } }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  };

  const retryPendingCreate = async () => {
    const operationScope = cookingOperationScope(selectedWorkspaceId);
    const body = getCookingPendingBody<any>('new', 'create', selectedWorkspaceId);
    if (!body) { setPendingCreate(false); return; }
    const requestContext = contextKey;
    setBusy(true); setError('');
    try {
      const run = await api.createRun(body);
      clearCookingOperationId('new', 'create', selectedWorkspaceId, operationScope);
      if (activeContext.current !== requestContext) return;
      setPendingCreate(false); await refreshRuns(); void router.push(`/cooking/${run.id}`);
    } catch (cause) {
      if (operationWasRejected(cause)) { clearCookingOperationId('new', 'create', selectedWorkspaceId, operationScope); if (activeContext.current === requestContext) setPendingCreate(false); }
      if (activeContext.current === requestContext) setError(operationErrorMessage(cause));
    } finally { if (activeContext.current === requestContext) setBusy(false); }
  };

  const retryPendingStock = async () => {
    if (!pendingStockAction) return;
    const operationScope = cookingOperationScope(selectedWorkspaceId);
    const body = getCookingPendingBody<any>('new', pendingStockAction, selectedWorkspaceId);
    if (!body) { setPendingStockAction(null); return; }
    const requestContext = contextKey;
    setBusy(true); setError('');
    try {
      await api.adjustStock(body);
      clearCookingOperationId('new', pendingStockAction, selectedWorkspaceId, operationScope);
      if (activeContext.current === requestContext) { setPendingStockAction(null); setStockQuantity(''); setStockReason(''); await refreshStock(); }
    } catch (cause) {
      if (operationWasRejected(cause)) { clearCookingOperationId('new', pendingStockAction, selectedWorkspaceId, operationScope); if (activeContext.current === requestContext) setPendingStockAction(null); }
      if (activeContext.current === requestContext) setError(operationErrorMessage(cause));
    } finally { if (activeContext.current === requestContext) setBusy(false); }
  };

  if (!isWorkspaceReady) return <LoadingState />;
  if (!enabled) return <div className="page-container"><Alert variant="info"><h1 className="h4">{t('cookingTitle')}</h1>{t('cookingUnavailable')}</Alert></div>;
  if (!orders && ordersError) return <ErrorState message={t('cookingLoadError')} onRetry={() => location.reload()} />;

  return <div className="page-container cooking-page">
    <header className="page-header"><div><h1 className="page-title"><FaFlask className="text-primary me-2" />{t('cookingTitle')}</h1><p className="page-subtitle">{t('cookingSubtitle')}</p></div><div className="cooking-header-stock"><span>{t('cookingStockLots')}: <strong>{stock?.lots?.length ?? '—'}</strong></span></div></header>
    {error && <Alert variant={error === 'conflict' ? 'warning' : 'danger'} role="alert">{t(error === 'conflict' ? 'cookingConflict' : error === 'ambiguous' ? 'cookingAmbiguous' : 'cookingSaveError')} <Button size="sm" variant="outline-secondary" disabled={busy || pendingCreate} onClick={() => void runPreview()}><FaSync className="me-1" />{t('refresh')}</Button></Alert>}
    {pendingCreate && <Alert variant="warning">{t('cookingPendingCreate')} <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => void retryPendingCreate()}>{t('cookingRetry')}</Button></Alert>}
    {pendingStockAction && <Alert variant="warning">{t('cookingPendingStock')} <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => void retryPendingStock()}>{t('cookingRetry')}</Button></Alert>}

    <section className="cooking-panel">
      <div className="cooking-section-heading"><div><span className="cooking-step">01</span><h2>{t('cookingPlanTitle')}</h2></div><span className="text-tertiary">{t('cookingPlanHint')}</span></div>
      {ordersError && <ErrorState compact message={t('cookingLoadError')} />}
      <div className="table-responsive cooking-order-table"><Table hover className="align-middle mb-0"><thead><tr><th>{t('select')}</th><th>{t('id')}</th><th>{t('client')}</th><th>{t('items')}</th><th>{t('status')}</th></tr></thead><tbody>
        {unfinishedOrders.map(order => <tr key={order.id}><td><Form.Check aria-label={`${t('select')} #${order.id}`} disabled={pendingCreate} checked={selectedOrders.includes(order.id)} onChange={event => { setPreview(null); setSelectedOrders(current => event.target.checked ? [...current, order.id] : current.filter(id => id !== order.id)); }} /></td><td>#{order.id}</td><td>{order.client?.name || t('unknownClient')}</td><td>{order.items?.map(item => `${products?.find(p => p.id === item.product_id)?.name || `#${item.product_id}`} × ${item.quantity}`).join(', ')}</td><td>{t(order.status)}</td></tr>)}
      </tbody></Table>{!unfinishedOrders.length && <p className="p-3 mb-0 text-tertiary">{t('cookingNoOrders')}</p>}</div>
      <div className="cooking-extra-row"><div className="cooking-extra-copy"><strong>{t('cookingExtra')}</strong><span className="text-tertiary">{t('cookingExtraHint')}</span></div><div className="cooking-extra-controls"><SelectDropdown isDisabled={pendingCreate} options={recipeOptions} value={recipeOptions.find(option => option.value === extraRecipe) || null} onChange={(option: {value:number}|null) => { setPreview(null); setExtraRecipe(option?.value ?? null); }} placeholder={t('chooseRecipe')} aria-label={t('chooseRecipe')} /><Form.Control disabled={pendingCreate} inputMode="decimal" value={extraGrams} onChange={event => { setPreview(null); setExtraGrams(event.target.value); }} placeholder={t('cookingFinishedGrams')} aria-label={t('cookingFinishedGrams')} /></div></div>
      {preview?.active_runs?.length > 0 && <Alert variant="warning"><strong>{t('cookingActiveRuns')}</strong>{preview.active_runs.map(run => <Form.Check key={run.id} label={`${run.title} (#${run.id})`} disabled={pendingCreate} checked={acknowledged.includes(run.id)} onChange={event => { setPreview(null); setAcknowledged(current => event.target.checked ? [...current, run.id] : current.filter(id => id !== run.id)); }} />)}</Alert>}
      <div className="cooking-actions"><Button variant="outline-primary" onClick={() => void runPreview()} disabled={busy || pendingCreate || Boolean(pendingStockAction) || (!selectedOrders.length && !(extraRecipe && parseDecimalInput(extraGrams)))}><FaSync className="me-2" />{t('cookingPreview')}</Button></div>
      {preview && <div className="cooking-preview" aria-live="polite"><h3>{t('cookingSuggestedTargets')}</h3>{previewDirty && <Alert variant="warning" className="py-2">{t('cookingPreviewStale')}</Alert>}<div className="cooking-flavor-grid">{preview.plan.flavors.map(flavor => { const baseRows = flavor.recipe_snapshot.ingredients.filter(row => row.type.toLowerCase() === 'base' && ['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms'].includes(row.unit.trim().toLowerCase())); const options = baseRows.map(row => ({value: row.recipe_ingredient_id, label: `${row.name} · ${row.quantity} ${row.unit}`})); const needsExplicit = hasBaseSelectionIssue(flavor.issues) || options.length > 1; const selectedBase = baseSelections[String(flavor.recipe_id)] || (!needsExplicit ? flavor.base_recipe_ingredient_id : 0); return <article className="cooking-flavor-card" key={flavor.recipe_id}><span className="text-tertiary">{t('recipe')}</span><strong>{flavor.name}</strong><span>{t('cookingTarget')}: <b>{displayGrams(flavor.target_finished_g)} g</b></span><span>{t('cookingSuggestedMeat')}: <b>{displayGrams(flavor.suggested_meat_g)} g</b></span>{flavor.issues.map(issue => <small className="text-warning" key={issue.code}>{cookingIssueLabel(issue.code, t)}</small>)}{options.length > 0 && <Form.Group className="mt-2"><SelectDropdown isDisabled={pendingCreate} label={t('cookingBaseIngredient')} options={options} value={options.find(option => option.value === selectedBase) || null} onChange={(option: {value:number}|null) => { setPreviewDirty(true); setBaseSelections(current => ({...current, [String(flavor.recipe_id)]: option?.value || 0})); }} /></Form.Group>}{!options.length && <small className="text-warning">{t('cookingBaseNotAvailable')}</small>}</article>; })}</div>
        {preview.plan.issues.map((issue, index) => <Alert variant="warning" key={`${issue.code}-${index}`}>{cookingIssueLabel(issue.code, t)}</Alert>)}
        <div className="cooking-create-run"><Form.Control disabled={pendingCreate} value={title} onChange={event => setTitle(event.target.value)} placeholder={t('cookingRunName')} aria-label={t('cookingRunName')} /><Button onClick={() => void createRun()} disabled={busy || pendingCreate || Boolean(pendingStockAction) || previewDirty || !baseSelectionComplete || preview.active_runs.some(run => !acknowledged.includes(run.id))}><FaPlus className="me-2" />{t('cookingStartRun')}</Button></div>
      </div>}
    </section>

    <section className="cooking-panel"><div className="cooking-section-heading"><div><span className="cooking-step">02</span><h2>{t('cookingRuns')}</h2></div><Button variant="outline-secondary" size="sm" onClick={() => void refreshRuns()}><FaSync className="me-1" />{t('refresh')}</Button></div>
      {!runs && !runsError ? <LoadingState /> : runsError ? <ErrorState compact message={t('cookingLoadError')} onRetry={() => void refreshRuns()} /> : <div className="cooking-run-list">{allRuns.map(run => <button type="button" className="cooking-run-row" key={run.id} onClick={() => void router.push(`/cooking/${run.id}`)}><span><strong>{run.title}</strong><small>#{run.id} · {new Date(run.date).toLocaleDateString(router.locale)}</small></span><span className={`cooking-state cooking-state-${run.state}`}>{t(`cookingState_${run.state}`)}</span></button>)}{!allRuns.length && <p className="text-tertiary mb-0">{t('cookingNoRuns')}</p>}{nextCursor && <Button className="align-self-start mt-2" variant="outline-secondary" size="sm" disabled={loadingMore} onClick={() => void loadMoreRuns()}>{loadingMore ? t('loading') : t('cookingLoadOlderRuns')}</Button>}</div>}
    </section>
    <section className="cooking-panel"><div className="cooking-section-heading"><div><span className="cooking-step">03</span><h2>{t('cookingStockHistory')}</h2></div><Button variant="outline-secondary" size="sm" onClick={() => void refreshStock()}><FaSync className="me-1" />{t('refresh')}</Button></div>
      <div className="cooking-run-list">{stock?.lots.map(lot => <div className="cooking-stock-row" key={lot.id}><span><strong>{lot.name}</strong><small>#{lot.id} · {t(lot.kind === 'bulk' ? 'cookingLotBulk' : 'cookingLotPackaged')} · {new Date(lot.created_at).toLocaleDateString(router.locale)}</small></span><span>{displayGrams(lot.available)} {lot.unit === 'g' ? 'g' : t('cookingPacks')}</span></div>)}{stock && stock.lots.length === 0 && <p className="text-tertiary">{t('cookingStockEmpty')}</p>}</div>
      <details className="cooking-history"><summary>{t('cookingEventHistory')}</summary>{(stock?.events || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8).map(event => <div className="cooking-stock-row" key={event.id}><span><strong>{cookingEventLabel(event.kind, t)}</strong><small>{new Date(event.created_at).toLocaleString(router.locale)}</small></span></div>)}{!stock?.events?.length && <p className="text-tertiary">{t('cookingNoHistory')}</p>}</details>
      {stock && <div className="cooking-stock-adjustment"><h3>{t('cookingInventoryAdjustment')}</h3><p className="text-tertiary">{t(`cookingAdjustmentHelp_${stockKind}`)}</p><div className="cooking-stock-form"><Form.Group><SelectDropdown isDisabled={Boolean(pendingStockAction)} label={t('cookingStockKind')} options={(['initial','correction','waste','return'] as const).map(kind => ({value:kind,label:t(`cookingAdjustment_${kind}`)}))} value={{value:stockKind,label:t(`cookingAdjustment_${stockKind}`)}} onChange={(option: {value:typeof stockKind}|null) => option && setStockKind(option.value)} /></Form.Group>
        {['initial', 'return'].includes(stockKind) ? <><Form.Group><SelectDropdown isDisabled={Boolean(pendingStockAction)} label={t('cookingStockItemType')} options={[{value:'recipe',label:t('recipe')},{value:'product',label:t('products')}]} value={{value:stockItemType,label:t(stockItemType === 'recipe' ? 'recipe' : 'products')}} onChange={(option: {value:'recipe'|'product'}|null) => option && setStockItemType(option.value)} /></Form.Group>{stockItemType === 'recipe' ? <Form.Group><SelectDropdown isDisabled={Boolean(pendingStockAction)} label={t('recipe')} options={recipeOptions} value={recipeOptions.find(option => option.value === stockRecipe) || null} onChange={(option: {value:number}|null) => setStockRecipe(option?.value ?? null)} placeholder={t('chooseRecipe')} /></Form.Group> : <Form.Group><SelectDropdown isDisabled={Boolean(pendingStockAction)} label={t('products')} options={(products || []).map(product => ({ value: product.id, label: product.name }))} value={(products || []).map(product => ({ value: product.id, label: product.name })).find(option => option.value === stockProduct) || null} onChange={(option: {value:number}|null) => setStockProduct(option?.value ?? null)} placeholder={t('choose')} /></Form.Group>}</> : <Form.Group><SelectDropdown isDisabled={Boolean(pendingStockAction)} label={t('cookingStockLots')} options={(stock.lots || []).map(lot => ({value:lot.id,label:`${lot.name} · ${displayGrams(lot.available)} ${lot.unit}`}))} value={stock.lots.map(lot => ({value:lot.id,label:`${lot.name} · ${displayGrams(lot.available)} ${lot.unit}`})).find(option => option.value === stockLot) || null} onChange={(option: {value:number}|null) => setStockLot(option?.value ?? null)} placeholder={t('choose')} /></Form.Group>}
        <Form.Group><Form.Label>{t(stockKind === 'correction' ? 'cookingStockDelta' : 'cookingStockQuantity')} ({stockQuantityUnit === 'pcs' ? t('cookingPacks') : 'g'})</Form.Label><Form.Control disabled={Boolean(pendingStockAction)} inputMode={stockQuantityUnit === 'pcs' ? 'numeric' : 'decimal'} value={stockQuantity} onChange={event => setStockQuantity(event.target.value)} /></Form.Group><Form.Group><Form.Label>{t('cookingStockReason')}</Form.Label><Form.Control disabled={Boolean(pendingStockAction)} value={stockReason} onChange={event => setStockReason(event.target.value)} /></Form.Group><Button disabled={busy || pendingCreate || Boolean(pendingStockAction) || !stockQuantityValid || !stockReason.trim() || (['initial', 'return'].includes(stockKind) ? stockItemType === 'recipe' ? !stockRecipe : !stockProduct : !stockLot)} onClick={() => void saveStockAdjustment()}>{t('cookingStockSave')}</Button></div></div>}
    </section>
  </div>;
};

export default withAuth(CookingHome);

const cookingEventLabel = (kind: string, t: (key: string) => string) => {
  const known: Record<string, string> = { plan: 'cookingEventPlan', replan: 'cookingEventPlan', preparation: 'cookingEventPreparation', result: 'cookingEventResults', packing: 'cookingEventPacking', adjustment: 'cookingEventStock', archive: 'cookingEventArchive', order_stock: 'cookingEventStock', plan_created: 'cookingEventPlan', preparation_saved: 'cookingEventPreparation', results_saved: 'cookingEventResults', packing_created: 'cookingEventPacking', stock_adjusted: 'cookingEventStock', archived: 'cookingEventArchive' };
  return t(known[kind] || 'cookingEventOther');
};
const cookingIssueLabel = (code: string, t: (key: string) => string) => {
  const known: Record<string, string> = { base_selection_required: 'cookingIssueBaseSelection', base_ingredient_unavailable: 'cookingIssueBaseUnavailable', recipe_unavailable: 'cookingIssueRecipeUnavailable', product_unavailable: 'cookingIssueProductUnavailable', insufficient_stock: 'cookingIssueStock', active_run_conflict: 'cookingIssueActiveRun' };
  return t(known[code] || 'cookingIssueGeneric');
};
