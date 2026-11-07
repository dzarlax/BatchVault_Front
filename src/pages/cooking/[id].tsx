import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import { Alert, Button, Form } from 'react-bootstrap';
import { FaArrowLeft, FaBox, FaCheck, FaSync } from 'react-icons/fa';
import LoadingState from '../../components/LoadingState';
import ErrorState from '../../components/ErrorState';
import SelectDropdown from '../../components/SelectDropdown';
import { useAuth, withAuth } from '../../utils/authContext';
import { useWorkspace } from '../../utils/workspaceContext';
import { workspaceFetcher, workspaceKey } from '../../utils/workspaceSWR';
import { cookingApiFor, cookingRequestBody, cookingOperationScope, cookingOperationId, clearCookingOperationId, displayGrams, operationErrorMessage, operationWasRejected, parseDecimalInput, getCookingPendingBody, hasBaseSelectionIssue } from '../../utils/cooking';
import type { CookingPackingLine, CookingRun, CookingStock } from '../../types/cooking';

const CookingRunPage = () => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const id = Number(router.query.id);
  const { auth } = useAuth();
  const { selectedWorkspaceId, selectedWorkspace, isWorkspaceReady } = useWorkspace();
  const contextKey = `${cookingOperationScope(selectedWorkspaceId)}|${auth.user?.id || auth.user?.userID || ''}|run:${id}`;
  const activeContext = React.useRef(contextKey);
  activeContext.current = contextKey;
  const enabled = auth.isAuthenticated && isWorkspaceReady && selectedWorkspace?.capabilities?.cooking_v1 === true;
  const api = useMemo(() => cookingApiFor(selectedWorkspaceId), [selectedWorkspaceId]);
  const { data: run, error, mutate } = useSWR<CookingRun>(workspaceKey(id > 0 ? `/api/cooking-runs/${id}` : '', selectedWorkspaceId, enabled && id > 0), workspaceFetcher);
  const { mutate: refreshStock } = useSWR<CookingStock>(workspaceKey('/api/cooking-stock', selectedWorkspaceId, enabled), workspaceFetcher);
  const [preparedMeat, setPreparedMeat] = useState('');
  const [actualMeat, setActualMeat] = useState<Record<number, string>>({});
  const [prepPreview, setPrepPreview] = useState<any>(null);
  const [usable, setUsable] = useState<Record<number, string>>({});
  const [packLines, setPackLines] = useState<Record<number, string>>({});
  const [packPreview, setPackPreview] = useState<any>(null);
  const [laterPack, setLaterPack] = useState<Record<number, string>>({});
  const [laterPreview, setLaterPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [selection, setSelection] = useState<Record<number, number>>({});
  const [editingPreparation, setEditingPreparation] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<{ action: string; body: any } | null>(null);
  const [replanPreview, setReplanPreview] = useState<any>(null);
  const [replanPreviewDirty, setReplanPreviewDirty] = useState(false);
  const [replanBases, setReplanBases] = useState<Record<string, number>>({});
  const [replanAcknowledged, setReplanAcknowledged] = useState<number[]>([]);

  const flavorPlans = run?.plan.flavors || [];
  const packageOptions = (run?.plan.products || []).map(product => ({ value: product.id, label: `${product.name} · ${displayGrams(product.net_weight_g)} g` }));
  const outputLines = useMemo(() => flavorPlans.map(flavor => ({ recipe_id: flavor.recipe_id, quantity_g: parseDecimalInput(usable[flavor.recipe_id] || '') })).filter(row => row.quantity_g), [flavorPlans, usable]);
  const initialPackLines: CookingPackingLine[] = Object.entries(packLines).map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity: Number(quantity) })).filter(row => Number.isInteger(row.quantity) && row.quantity > 0);
  const ingredientOptions = (recipeId: number) => {
    const rows = run?.plan.flavors.find(flavor => flavor.recipe_id === recipeId)?.recipe_snapshot.ingredients || [];
    return rows.filter(row => row.type.toLowerCase() === 'base' && ['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms'].includes(row.unit.trim().toLowerCase())).map(row => ({ value: row.recipe_ingredient_id, label: `${row.name} · ${row.quantity} ${row.unit}` }));
  };
  const selectedBaseForFlavor = (recipeId: number) => {
    const flavor = flavorPlans.find(row => row.recipe_id === recipeId);
    const options = ingredientOptions(recipeId);
    const requiresExplicit = hasBaseSelectionIssue(flavor?.issues) || options.length > 1;
    return selection[recipeId] || (!requiresExplicit ? flavor?.base_recipe_ingredient_id || 0 : 0);
  };
  const preparationComplete = parseDecimalInput(preparedMeat) !== '' && flavorPlans.every(flavor => parseDecimalInput(actualMeat[flavor.recipe_id] || '') !== '' && ingredientOptions(flavor.recipe_id).some(row => row.value === selectedBaseForFlavor(flavor.recipe_id)));
  const replanBaseSelectionComplete = (replanPreview?.plan.flavors || []).every((flavor:any) => {
    const ids = flavor.recipe_snapshot.ingredients.filter((row:any) => row.type.toLowerCase() === 'base' && ['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms'].includes(row.unit.trim().toLowerCase())).map((row:any) => row.recipe_ingredient_id);
    const requiresExplicit = hasBaseSelectionIssue(flavor.issues) || ids.length > 1;
    const previous = run?.plan_input?.base_selections?.[String(flavor.recipe_id)];
    const selected = replanBases[String(flavor.recipe_id)] || (requiresExplicit ? previous || 0 : flavor.base_recipe_ingredient_id);
    return ids.length > 0 && ids.includes(selected);
  });

  useEffect(() => {
    setBusy(false);
    setPreparedMeat(''); setActualMeat({}); setPrepPreview(null); setUsable({}); setPackLines({}); setPackPreview(null); setLaterPack({}); setLaterPreview(null); setSelection({}); setEditingPreparation(false); setReplanPreview(null); setReplanPreviewDirty(false); setReplanBases({}); setReplanAcknowledged([]);
    const action = id > 0 ? ['preparation', 'results', 'packing', 'archive', 'replan'].find(name => getCookingPendingBody(id, name, selectedWorkspaceId)) : undefined;
    const body = action ? getCookingPendingBody(id, action, selectedWorkspaceId) : null;
    setPendingRecovery(action && body ? { action, body } : null);
    setErrorKey(action && body ? 'ambiguous' : '');
  }, [contextKey, id, selectedWorkspaceId]);

  const canStartFreshMutation = () => {
    const action = pendingRecovery?.action || ['preparation', 'results', 'packing', 'archive', 'replan'].find(name => getCookingPendingBody(id, name, selectedWorkspaceId));
    if (action) {
      setPendingRecovery({ action, body: getCookingPendingBody(id, action, selectedWorkspaceId) });
      setErrorKey('ambiguous');
      return false;
    }
    return !busy;
  };

  const prepBody = () => ({
    run_id: id,
    prepared_meat_g: parseDecimalInput(preparedMeat),
    source_signature: run?.source_signature,
    version: run?.version,
    flavors: flavorPlans.map(flavor => ({ recipe_id: flavor.recipe_id, actual_meat_g: parseDecimalInput(actualMeat[flavor.recipe_id] || ''), base_recipe_ingredient_id: selectedBaseForFlavor(flavor.recipe_id) })),
  });
  const perform = async (action: string, call: (operationId: string) => Promise<unknown>, refresh = true) => {
    if (pendingRecovery) return;
    const requestContext = contextKey;
    const operationScope = cookingOperationScope(selectedWorkspaceId);
    setBusy(true); setErrorKey('');
    const operationId = cookingOperationId(id, action, selectedWorkspaceId);
    try { await call(operationId); clearCookingOperationId(id, action, selectedWorkspaceId, operationScope); if (activeContext.current !== requestContext) return; if (refresh) { await mutate(); await refreshStock(); setPendingRecovery(null); if (action === 'preparation') setEditingPreparation(false); if (action === 'replan') { setReplanPreview(null); setReplanPreviewDirty(false); } } }
    catch (cause) {
      const outcome = operationErrorMessage(cause);
      if (operationWasRejected(cause)) clearCookingOperationId(id, action, selectedWorkspaceId, operationScope);
      if (activeContext.current === requestContext) {
        if (operationWasRejected(cause)) setPendingRecovery(null);
        if (outcome === 'ambiguous') setPendingRecovery({ action, body: getCookingPendingBody(id, action, selectedWorkspaceId) });
        setErrorKey(outcome);
      }
    }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  };

  const previewPreparation = async () => {
    const requestContext = contextKey;
    setBusy(true); setErrorKey('');
    try { const result = await api.preparationPreview(prepBody()); if (activeContext.current === requestContext) setPrepPreview(result); }
    catch (cause) { if (activeContext.current === requestContext) setErrorKey(operationErrorMessage(cause)); }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  };
  const savePreparation = () => {
    if (!canStartFreshMutation()) return;
    const body = cookingRequestBody(id, 'preparation', operation_id => ({ ...prepBody(), operation_id }), selectedWorkspaceId);
    return perform('preparation', () => api.savePreparation(id, body));
  };
  const previewPacking = async () => {
    const requestContext = contextKey;
    setBusy(true); setErrorKey('');
    try { const result = await api.packingPreview(id, { lines: initialPackLines, actual_usable_g: outputLines }); if (activeContext.current === requestContext) setPackPreview(result); }
    catch (cause) { if (activeContext.current === requestContext) setErrorKey(operationErrorMessage(cause)); }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  };
  const saveResults = () => {
    if (!canStartFreshMutation()) return;
    const body = cookingRequestBody(id, 'results', operation_id => ({ version: run!.version, stock_version: run!.stock_version, operation_id, actual_usable_g: outputLines, ...(initialPackLines.length ? { packing: { lines: initialPackLines } } : {}) }), selectedWorkspaceId);
    return perform('results', () => api.results(id, body));
  };
  const previewLater = async () => {
    const requestContext = contextKey;
    setBusy(true); setErrorKey('');
    try { const result = await api.packingPreview(id, { lines: Object.entries(laterPack).map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity: Number(quantity) })).filter(line => line.quantity > 0) }); if (activeContext.current === requestContext) setLaterPreview(result); }
    catch (cause) { if (activeContext.current === requestContext) setErrorKey(operationErrorMessage(cause)); }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  };
  const saveLaterPacking = () => {
    if (!canStartFreshMutation()) return;
    const body = cookingRequestBody(id, 'packing', operation_id => ({ version: run!.version, stock_version: run!.stock_version, operation_id, lines: Object.entries(laterPack).map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity: Number(quantity) })).filter(line => line.quantity > 0) }), selectedWorkspaceId);
    return perform('packing', () => api.pack(id, body));
  };
  const archive = () => {
    if (!canStartFreshMutation()) return;
    const body = cookingRequestBody(id, 'archive', operation_id => ({ version: run!.version, operation_id }), selectedWorkspaceId);
    return perform('archive', () => api.archive(id, body));
  };

  const previewReplan = async () => {
    if (!run?.plan_input) return;
    const requestContext = contextKey;
    setBusy(true); setErrorKey('');
    try {
      const result = await api.plan({ ...run.plan_input, run_id: id, ...(Object.keys(replanBases).length ? { base_selections: replanBases } : {}), acknowledged_run_ids: replanAcknowledged });
      if (activeContext.current === requestContext) { setReplanPreview(result); setReplanPreviewDirty(false); }
    } catch (cause) { if (activeContext.current === requestContext) setErrorKey(operationErrorMessage(cause)); }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  };
  const confirmReplan = () => {
    if (!canStartFreshMutation()) return;
    if (!run || !replanPreview || replanPreviewDirty || !run.plan_input) return;
    const planInput = { ...run.plan_input, run_id: id, ...(Object.keys(replanBases).length ? { base_selections: replanBases } : {}), acknowledged_run_ids: replanAcknowledged };
    const body = cookingRequestBody(id, 'replan', operation_id => ({ ...planInput, title: run.title, date: run.date, source_signature: replanPreview.source_signature, stock_version: replanPreview.stock_version, version: run.version, operation_id }), selectedWorkspaceId);
    return perform('replan', () => api.replan(id, body));
  };

  const retryPending = async () => {
    if (!pendingRecovery) return;
    const requestContext = contextKey;
    const operationScope = cookingOperationScope(selectedWorkspaceId);
    setBusy(true); setErrorKey('');
    try {
      const { action, body } = pendingRecovery;
      const updated = action === 'preparation' ? await api.savePreparation(id, body)
        : action === 'results' ? await api.results(id, body)
          : action === 'packing' ? await api.pack(id, body)
            : action === 'replan' ? await api.replan(id, body)
              : await api.archive(id, body);
      clearCookingOperationId(id, action, selectedWorkspaceId, operationScope); if (activeContext.current === requestContext) { setPendingRecovery(null); await mutate(); await refreshStock(); if (action === 'preparation') setEditingPreparation(false); if (action === 'replan') { setReplanPreview(null); setReplanPreviewDirty(false); } }
    } catch (cause) { if (operationWasRejected(cause)) { clearCookingOperationId(id, pendingRecovery.action, selectedWorkspaceId, operationScope); if (activeContext.current === requestContext) setPendingRecovery(null); } if (activeContext.current === requestContext) setErrorKey(operationErrorMessage(cause)); }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  };

  const refreshRun = async () => { setReplanPreview(null); setReplanPreviewDirty(false); setErrorKey(''); await mutate(); };

  if (!isWorkspaceReady || (enabled && id > 0 && !run && !error)) return <LoadingState />;
  if (!enabled) return <div className="page-container"><Alert variant="info">{t('cookingUnavailable')}</Alert></div>;
  if (error && !run) return <ErrorState message={t('cookingLoadError')} onRetry={() => void mutate()} />;
  if (!run) return null;

  return <div className="page-container cooking-page">
    <div className="cooking-backline"><Button variant="link" onClick={() => void router.push('/cooking')}><FaArrowLeft className="me-2" />{t('cookingTitle')}</Button><span className={`cooking-state cooking-state-${run.state}`}>{t(`cookingState_${run.state}`)}</span></div>
    <header className="page-header"><div><h1 className="page-title">{run.title}</h1><p className="page-subtitle">#{run.id} · {new Date(run.date).toLocaleDateString(router.locale)} · {t('cookingVersion', { version: run.version })}</p></div><Button variant="outline-secondary" onClick={() => void refreshRun()}><FaSync className="me-2" />{t('refresh')}</Button></header>
    {errorKey && <Alert variant={errorKey === 'conflict' ? 'warning' : 'danger'} role="alert">{t(errorKey === 'conflict' ? 'cookingConflict' : errorKey === 'ambiguous' ? 'cookingAmbiguous' : 'cookingSaveError')} <Button size="sm" variant="outline-secondary" onClick={() => void refreshRun()}>{t('refresh')}</Button></Alert>}
    {pendingRecovery && <Alert variant="warning">{t('cookingRetryExact')} <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => void retryPending()}>{t('cookingRetry')}</Button></Alert>}
    {run.order_changes?.length ? <Alert variant="warning">{t('cookingOrderChanged')} {run.order_changes.map((issue, index) => <div key={`${issue.code}-${index}`}>{t('cookingIssueGeneric')}</div>)}</Alert> : null}

    {(run.state === 'draft' || run.state === 'prepared') && run.actual_output.length === 0 && run.plan_input && <section className="cooking-panel"><div className="cooking-section-heading"><div><span className="cooking-step">↻</span><h2>{t('cookingReplanTitle')}</h2></div><Button variant="outline-primary" disabled={busy} onClick={() => void previewReplan()}>{t('cookingPreviewReplan')}</Button></div><p className="text-tertiary">{t('cookingReplanHint')}</p>{replanPreview && <>{replanPreviewDirty && <Alert variant="warning" className="py-2">{t('cookingPreviewStale')}</Alert>}<div className="cooking-flavor-grid">{replanPreview.plan.flavors.map((flavor:any) => { const options = flavor.recipe_snapshot.ingredients.filter((row:any) => row.type.toLowerCase() === 'base' && ['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms'].includes(row.unit.trim().toLowerCase())).map((row:any) => ({value:row.recipe_ingredient_id,label:`${row.name} · ${row.quantity} ${row.unit}`})); const needsExplicit = hasBaseSelectionIssue(flavor.issues) || options.length > 1; const previous = run.plan_input?.base_selections?.[String(flavor.recipe_id)]; const selected = replanBases[String(flavor.recipe_id)] || (needsExplicit ? previous || 0 : flavor.base_recipe_ingredient_id); return <article className="cooking-flavor-card" key={flavor.recipe_id}><strong>{flavor.name}</strong><span>{t('cookingTarget')}: {displayGrams(flavor.target_finished_g)} g</span><span>{t('cookingSuggestedMeat')}: {displayGrams(flavor.suggested_meat_g)} g</span>{options.length > 0 && <Form.Group><SelectDropdown label={t('cookingBaseIngredient')} options={options} value={options.find((option:any) => option.value === selected) || null} onChange={(option:{value:number}|null) => { setReplanPreviewDirty(true); setReplanBases(current => ({...current,[String(flavor.recipe_id)]:option?.value || 0})); }} /></Form.Group>}{!options.length && <small className="text-warning">{t('cookingBaseNotAvailable')}</small>}</article>; })}</div>{replanPreview.active_runs?.length > 0 && <Alert variant="warning">{t('cookingActiveRuns')}{replanPreview.active_runs.map((active:any) => <Form.Check key={active.id} label={active.title} disabled={pendingRecovery !== null} checked={replanAcknowledged.includes(active.id)} onChange={event => { setReplanPreviewDirty(true); setReplanAcknowledged(current => event.target.checked ? [...current, active.id] : current.filter(value => value !== active.id)); }} />)}</Alert>}<Alert variant="warning">{t('cookingReplanResetWarning')}</Alert><div className="cooking-actions"><Button disabled={busy || pendingRecovery !== null || replanPreviewDirty || !replanBaseSelectionComplete || replanPreview.active_runs?.some((active:any) => !replanAcknowledged.includes(active.id))} onClick={confirmReplan}>{t('cookingConfirmReplan')}</Button></div></>}</section>}

    <section className="cooking-panel"><div className="cooking-section-heading"><div><span className="cooking-step">01</span><h2>{t('cookingPlanTitle')}</h2></div></div><div className="cooking-flavor-grid">{flavorPlans.map(flavor => <article className="cooking-flavor-card" key={flavor.recipe_id}><strong>{flavor.name}</strong><span>{t('cookingTarget')}: <b>{displayGrams(flavor.target_finished_g)} g</b></span><span>{t('cookingSuggestedMeat')}: <b>{displayGrams(flavor.suggested_meat_g)} g</b></span></article>)}</div></section>

    {run.preparation && <section className="cooking-panel"><div className="cooking-section-heading"><div><span className="cooking-step">02</span><h2>{t('cookingActualMeat')}</h2></div>{run.state === 'prepared' && run.actual_output.length === 0 && <Button variant="outline-secondary" size="sm" onClick={() => { setPreparedMeat(run.preparation!.prepared_meat_g); setActualMeat(Object.fromEntries(run.preparation!.flavors.map(flavor => [flavor.recipe_id, flavor.actual_meat_g]))); setSelection(Object.fromEntries(run.preparation!.flavors.map(flavor => [flavor.recipe_id, flavor.recipe_snapshot.base_recipe_ingredient_id]))); setPrepPreview(run.preparation); setEditingPreparation(true); }}>{t('cookingEditPreparation')}</Button>}</div><div className="cooking-total-line">{t('cookingPreparedMeatTotal')}: <strong>{displayGrams(run.preparation.prepared_meat_g)} g</strong> · {t('cookingAllocatedMeat')}: <strong>{displayGrams(run.preparation.allocated_meat_g)} g</strong> · {t('cookingUnallocatedMeat')}: <strong>{displayGrams(run.preparation.unallocated_meat_g)} g</strong></div><div className="cooking-flavor-grid mt-3">{run.preparation.flavors.map(flavor => <article className="cooking-flavor-card" key={flavor.recipe_id}><strong>{flavor.name} · {displayGrams(flavor.actual_meat_g)} g</strong>{flavor.ingredients.map(ingredient => <span key={`${ingredient.ingredient_id}-${ingredient.recipe_ingredient_id}`}>{ingredient.name}: {ingredient.quantity} {ingredient.unit}</span>)}</article>)}</div><CombinedIngredients ingredients={run.preparation.ingredients_total} t={t} /></section>}

    {run.state === 'cooked' && <section className="cooking-panel"><div className="cooking-section-heading"><div><span className="cooking-step">03</span><h2>{t('cookingSavedYield')}</h2></div></div><div className="cooking-flavor-grid">{run.actual_output.map(item => <article className="cooking-flavor-card" key={item.recipe_id}><strong>{flavorPlans.find(flavor => flavor.recipe_id === item.recipe_id)?.name || `#${item.recipe_id}`}</strong><span>{t('cookingUsableGrams')}: {displayGrams(item.quantity_g)} g</span></article>)}</div></section>}

    {(run.state === 'draft' || (run.state === 'prepared' && editingPreparation)) && <section className="cooking-panel"><div className="cooking-section-heading"><div><span className="cooking-step">02</span><h2>{t('cookingActualMeat')}</h2></div>{editingPreparation && <Button variant="outline-secondary" size="sm" onClick={() => setEditingPreparation(false)}>{t('cancel')}</Button>}</div><Alert variant="light" className="cooking-note">{t('cookingActualMeatNote')}</Alert>
      <Form.Group className="cooking-total-input"><Form.Label>{t('cookingPreparedMeatTotal')} (g)</Form.Label><Form.Control disabled={pendingRecovery !== null} inputMode="decimal" value={preparedMeat} onChange={event => { setPreparedMeat(event.target.value); setPrepPreview(null); }} /></Form.Group>
      <div className="cooking-actual-grid">{flavorPlans.map(flavor => <div className="cooking-actual-row" key={flavor.recipe_id}><strong>{flavor.name}</strong><Form.Group><Form.Label>{t('cookingActualFlavorMeat')} (g)</Form.Label><Form.Control disabled={pendingRecovery !== null} inputMode="decimal" value={actualMeat[flavor.recipe_id] || ''} onChange={event => { setActualMeat(current => ({ ...current, [flavor.recipe_id]: event.target.value })); setPrepPreview(null); }} /></Form.Group><Form.Group><SelectDropdown isDisabled={pendingRecovery !== null} label={t('cookingBaseIngredient')} options={ingredientOptions(flavor.recipe_id)} value={ingredientOptions(flavor.recipe_id).find(option => option.value === selectedBaseForFlavor(flavor.recipe_id)) || null} onChange={(option: {value:number}|null) => { setSelection(current => ({ ...current, [flavor.recipe_id]: option?.value || 0 })); setPrepPreview(null); }} /></Form.Group></div>)}</div>
      <div className="cooking-actions"><Button variant="outline-primary" disabled={busy || pendingRecovery !== null || !preparationComplete} onClick={() => void previewPreparation()}>{t('cookingPreviewMarinade')}</Button>{prepPreview && <Button disabled={busy} onClick={savePreparation}><FaCheck className="me-2" />{t('cookingSavePreparation')}</Button>}</div>
      {prepPreview && <div className="cooking-marinade"><h3>{t('cookingMarinadeIngredients')}</h3><div className="cooking-flavor-grid">{prepPreview.flavors?.map((flavor: any) => <article className="cooking-flavor-card" key={flavor.recipe_id}><strong>{flavor.name}</strong><span>{t('cookingActualFlavorMeat')}: {displayGrams(flavor.actual_meat_g)} g</span>{flavor.ingredients.map((ingredient: any) => <span key={`${ingredient.ingredient_id}-${ingredient.recipe_ingredient_id}`}>{ingredient.name}: {ingredient.quantity} {ingredient.unit}</span>)}</article>)}</div><div className="cooking-total-line">{t('cookingAllocatedMeat')}: <strong>{displayGrams(prepPreview.allocated_meat_g)} g</strong> · {t('cookingUnallocatedMeat')}: <strong>{displayGrams(prepPreview.unallocated_meat_g)} g</strong></div><CombinedIngredients ingredients={prepPreview.ingredients_total || []} t={t} /></div>}
    </section>}

    {(run.state === 'prepared' || run.state === 'cooked') && <section className="cooking-panel"><div className="cooking-section-heading"><div><span className="cooking-step">03</span><h2>{t('cookingYieldPacking')}</h2></div></div>
      {run.state === 'prepared' && <><p className="text-tertiary">{t('cookingUsableHint')}</p><div className="cooking-actual-grid">{flavorPlans.map(flavor => <div className="cooking-actual-row" key={flavor.recipe_id}><strong>{flavor.name}</strong><Form.Group><Form.Label>{t('cookingUsableGrams')} (g)</Form.Label><Form.Control disabled={pendingRecovery !== null} inputMode="decimal" value={usable[flavor.recipe_id] || ''} onChange={event => { setUsable(current => ({ ...current, [flavor.recipe_id]: event.target.value })); setPackPreview(null); }} /></Form.Group></div>)}</div><h3 className="h5 mt-4">{t('cookingPackNow')}</h3><ProductPackInputs disabled={pendingRecovery !== null} options={packageOptions} values={packLines} onChange={value => { setPackLines(value); setPackPreview(null); }} t={t} /><div className="cooking-actions"><Button variant="outline-primary" disabled={busy || pendingRecovery !== null || outputLines.length !== flavorPlans.length} onClick={() => void previewPacking()}>{t('cookingPreviewPacking')}</Button>{outputLines.length === flavorPlans.length && <Button disabled={busy || pendingRecovery !== null} onClick={saveResults}>{t('cookingSaveResults')}</Button>}</div>{packPreview && <PackingSummary data={packPreview} flavors={flavorPlans} t={t} />}</>}
      {run.state === 'cooked' && <><p className="text-tertiary">{t('cookingCookedAvailable')}</p><ProductPackInputs disabled={pendingRecovery !== null} options={packageOptions} values={laterPack} onChange={setLaterPack} t={t} /><div className="cooking-actions"><Button variant="outline-primary" disabled={busy || pendingRecovery !== null} onClick={() => void previewLater()}>{t('cookingPreviewPacking')}</Button><Button disabled={busy || pendingRecovery !== null || !Object.values(laterPack).some(value => Number(value) > 0)} onClick={saveLaterPacking}><FaBox className="me-2" />{t('cookingSavePacking')}</Button></div>{laterPreview && <PackingSummary data={laterPreview} flavors={flavorPlans} t={t} />}</>}
      {run.lots?.length > 0 && <div className="cooking-lots"><h3 className="h5">{t('cookingOutputLots')}</h3>{run.lots.map(lot => <div className="cooking-stock-row" key={lot.id}><strong>{lot.name}</strong><span>{displayGrams(lot.available)} {lot.unit === 'g' ? 'g' : t('cookingPacks')}</span></div>)}</div>}
    </section>}

    {run.state !== 'archived' && <div className="cooking-archive"><Button variant="outline-secondary" disabled={busy || pendingRecovery !== null} onClick={archive}>{t('cookingArchive')}</Button></div>}
  </div>;
};

const ProductPackInputs: React.FC<{ options: {value:number;label:string}[]; values: Record<number,string>; onChange: React.Dispatch<React.SetStateAction<Record<number,string>>>; t: (key:string)=>string; disabled?: boolean }> = ({ options, values, onChange, t, disabled = false }) => <div className="cooking-pack-list">{options.map(option => <Form.Group key={option.value}><Form.Label>{option.label}</Form.Label><Form.Control disabled={disabled} inputMode="numeric" type="number" min="0" step="1" value={values[option.value] || ''} onChange={event => onChange(current => ({ ...current, [option.value]: event.target.value }))} placeholder={t('cookingPacksCount')} /></Form.Group>)}</div>;

const CombinedIngredients: React.FC<{ ingredients: {recipe_ingredient_id:number;ingredient_id:number;name:string;unit:string;quantity:string}[]; t:(key:string)=>string }> = ({ ingredients, t }) => ingredients?.length ? <div className="cooking-marinade mt-3"><h3>{t('cookingCombinedIngredients')}</h3><div className="cooking-flavor-grid">{ingredients.map(ingredient => <span className="cooking-stock-row" key={`${ingredient.ingredient_id}-${ingredient.recipe_ingredient_id}`}><strong>{ingredient.name}</strong><span>{ingredient.quantity} {ingredient.unit}</span></span>)}</div></div> : null;

const PackingSummary: React.FC<{ data:any; flavors:{recipe_id:number;name:string}[]; t:(key:string)=>string }> = ({ data, flavors, t }) => <div className="cooking-preview cooking-pack-preview"><strong>{t('cookingTotalPacks')}: {data.total_packs}</strong><div className="cooking-flavor-grid">{data.consumption?.map((row:any) => <span className="cooking-stock-row" key={`used-${row.recipe_id}`}>{t('cookingConsumed')} · {flavors.find(flavor => flavor.recipe_id === row.recipe_id)?.name || `#${row.recipe_id}`}: {displayGrams(row.quantity_g)} g</span>)}{data.remaining?.map((row:any) => <span className="cooking-stock-row" key={`left-${row.recipe_id}`}>{t('cookingRemaining')} · {flavors.find(flavor => flavor.recipe_id === row.recipe_id)?.name || `#${row.recipe_id}`}: {displayGrams(row.quantity_g)} g</span>)}</div></div>;

export default withAuth(CookingRunPage);
