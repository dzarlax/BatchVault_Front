import React from 'react';
import ProductComposition from '../../products/ProductComposition';
import { OrderItem, Product } from '../../../types/api';
import { calculatedSnapshot, costSourceLabel, supportedCostSnapshot } from '../../../utils/costing';
import { Modal, Form, Button, FormControl } from 'react-bootstrap';
import { FaTimes } from 'react-icons/fa';
import useTranslation from 'next-translate/useTranslation';
import SelectDropdown from '../../SelectDropdown';
import { useWorkspace } from '../../../utils/workspaceContext';
import { orderEditorIsDirty, orderEditorSnapshot } from '../../../utils/editorDraftState';



interface Client {
  id: number;
  name: string;
  surname: string;
  telegram?: string;
  instagram?: string;
  phone?: string;
  address?: string;
  source: string;
}

interface OrderModalProps {
  products?: Product[];
  show: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  clientOptions: { value: number, label: string }[];
  productOptions: { value: number, label: string }[];
  statusOptions: { value: string, label: string }[];
  clientId: number | null;
  status: string;
  comment: string;
  items: OrderItem[];
  setClientId: (clientId: number | null) => void;
  setStatus: (status: string) => void;
  setComment: (comment: string) => void;
  handleProductChange: (index: number, product_id: number) => void;
  handleRefreshItemCost: (index: number) => Promise<void>;
  handleQuantityChange: (index: number, quantity: number) => void;
  handleItemChange: (index: number, field: keyof OrderItem, value: string | number) => void;
  handleRemoveItem: (index: number) => void;
  handleAddItem: () => void;
}

const OrderModal: React.FC<OrderModalProps> = ({
  show,
  onClose,
  onSave,
  clientOptions,
  productOptions,
  products = [],
  statusOptions,
  clientId,
  status,
  comment,
  items,
  setClientId,
  setStatus,
  setComment,
  handleProductChange,
  handleRefreshItemCost,
  handleQuantityChange,
  handleItemChange,
  handleRemoveItem,
  handleAddItem
}) => {
  const { t } = useTranslation('common');
  const { selectedCurrency, selectedWorkspaceId } = useWorkspace();
  const titleId = React.useId();
  const baseline = React.useRef<string | null>(null);
  const draftValues = { clientId, status, comment, items };
  const [isBusy, setIsBusy] = React.useState(false);
  const busy = React.useRef(false);
  const operationVersion = React.useRef(0);
  const previousWorkspace = React.useRef(selectedWorkspaceId);

  const runOperation = async (operation: () => void | Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    const version = ++operationVersion.current;
    setIsBusy(true);
    try { await operation(); }
    finally {
      if (operationVersion.current === version) {
        busy.current = false;
        setIsBusy(false);
      }
    }
  };

  React.useEffect(() => {
    if (show && baseline.current == null) {
      baseline.current = orderEditorSnapshot(draftValues);
    }
    if (!show) {
      baseline.current = null;
      operationVersion.current++;
      busy.current = false;
      setIsBusy(false);
    }
  }, [show, clientId, status, comment, items]);

  React.useEffect(() => {
    if (previousWorkspace.current !== selectedWorkspaceId) {
      previousWorkspace.current = selectedWorkspaceId;
      operationVersion.current++;
      busy.current = false;
      setIsBusy(false);
      onClose();
    }
  }, [selectedWorkspaceId, onClose]);

  React.useEffect(() => () => { operationVersion.current++; }, []);
  const closeWhenIdle = () => {
    if (busy.current) return;
    if (orderEditorIsDirty(baseline.current, draftValues) && !window.confirm(t('uiDiscardUnsaved'))) return;
    onClose();
  };

  return (
    <Modal show={show} onHide={closeWhenIdle} backdrop={isBusy ? "static" : true} keyboard={!isBusy} size="lg" className="ui-workflow-modal" aria-labelledby={titleId}>
      <Modal.Header closeButton={!isBusy} closeLabel={t('close')}>
        <Modal.Title id={titleId}>{t('orderDetails')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <fieldset disabled={isBusy} aria-busy={isBusy}>
          <SelectDropdown
            isDisabled={isBusy}
            options={clientOptions}
            value={clientId ? clientOptions.find(option => option.value === clientId) : null}
            onChange={option => setClientId(option?.value || null)}
            placeholder={t('chooseClient')}
            label={t('client')}
            isClearable
            required
          />

          <Form.Group controlId="commentTextarea" className="mt-4">
            <Form.Label>{t('comment')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('orderCommentPlaceholder')}
            />
          </Form.Group>

          <div className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0">{t('products')}</h5>
              <Button variant="primary" onClick={handleAddItem}>
                + {t('addProduct')}
              </Button>
            </div>

            <div className="order-items-list">
              {items.map((item, index) => (
                <div key={index} className="order-item-card">
                  <div className="order-item-header">
                    <span className="text-secondary small">Item {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(index)}
                    >
                      <FaTimes />
                    </Button>
                  </div>

                  <div className="order-item-body">
                    <div className="form-row">
                      <Form.Group className="flex-1">
                        <SelectDropdown
                          isDisabled={isBusy}
                          options={productOptions}
                          value={item.product_id > 0 ? (productOptions.find(option => option.value === item.product_id) ?? { value: item.product_id, label: t('costingUnavailableProduct', { id: item.product_id }) }) : null}
                          onChange={option => handleProductChange(index, option?.value || 0)}
                          placeholder={t('selectProduct')}
                          label={t('product')}
                          isSearchable
                          isClearable
                          required
                        />
                      </Form.Group>

                      <Form.Group className="quantity-group">
                        <Form.Label>{t('quantity')}</Form.Label>
                        <FormControl
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => handleQuantityChange(index, parseInt(e.target.value) || 1)}
                        />
                      </Form.Group>
                    </div>

                    <div className="form-row">
                      <Form.Group className="flex-1">
                        <Form.Label>{t('price')}</Form.Label>
                        <FormControl
                          type="number"
                          min="0"
                          step="0.01"
                          readOnly
                          value={item.price}
                        />
                      </Form.Group>

                      <Form.Group className="flex-1">
                        <Form.Label>{t('costPrice')}</Form.Label>
                        <FormControl
                          type="number"
                          min="0"
                          step="0.01"
                          readOnly={!supportedCostSnapshot(item.cost_snapshot) || calculatedSnapshot(item.cost_snapshot) || item.cost_source === 'recipe' || item.cost_source === 'assortment'}
                          value={Number.isFinite(item.cost_price) ? item.cost_price : ''}
                          onChange={event => handleItemChange(index, 'cost_price', event.target.value.trim() ? Number(event.target.value) : Number.NaN)}
                        />
                      </Form.Group>
                    </div>
                    {!supportedCostSnapshot(item.cost_snapshot) && <p className="small text-warning">{t('productSnapshotReadOnly')}</p>}
                    <ProductComposition product={products.find(product => product.id === item.product_id)} snapshot={item.cost_snapshot} historical={Boolean(item.cost_snapshot || (item.id && !item.cost_source))} />
                    <p className="small text-secondary mb-1">{item.id && !item.cost_source ? t('costingSavedOrderCost') : t('costingCurrentEstimate')} · {costSourceLabel(item.cost_snapshot?.source || item.cost_source, t)}</p>
                    {!item.cost_snapshot && (item.cost_source === 'recipe' || item.cost_source === 'assortment') && <Button size="sm" variant="outline-secondary" onClick={() => void runOperation(() => handleRefreshItemCost(index))}>{t('costingRefreshEstimate')}</Button>}
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-tertiary">{t('noProductsAdded')}</p>
                </div>
              )}
            </div>
          </div>
          </fieldset>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        {items.length > 0 && (
          <div className="order-summary me-auto">
            <div className="summary-row">
              <span className="summary-label">{t('totalPrice')}:</span>
              <span className="summary-value fw-bold">
                {items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)} {selectedCurrency || ''}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label text-secondary">{t('totalCost')}:</span>
              <span className="summary-value text-secondary">
                {items.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0).toFixed(2)} {selectedCurrency || ''}
              </span>
            </div>
            <div className="summary-row">
              <span className="summary-label text-success">{t('profit')}:</span>
              <span className="summary-value text-success fw-bold">
                {(
                  items.reduce((sum, item) => sum + (item.price * item.quantity), 0) -
                  items.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0)
                ).toFixed(2)} {selectedCurrency || ''}
              </span>
            </div>
          </div>
        )}
        <Button variant="outline-secondary" className="me-2" onClick={closeWhenIdle} disabled={isBusy}>
          {t('cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={() => void runOperation(onSave)}
          disabled={isBusy || items.length === 0 || !clientId || items.some(item => !supportedCostSnapshot(item.cost_snapshot) || !item.product_id || !Number.isFinite(item.cost_price) || item.cost_price < 0)}
        >
          {t('saveChanges')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default React.memo(OrderModal);
