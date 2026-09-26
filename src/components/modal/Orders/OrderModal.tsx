import React from 'react';
import { Modal, Form, Button, FormControl } from 'react-bootstrap';
import { FaTimes } from 'react-icons/fa';
import useTranslation from 'next-translate/useTranslation';
import SelectDropdown from '../../SelectDropdown';
import { useWorkspace } from '../../../utils/workspaceContext';

interface OrderItem {
  product_id: number;
  quantity: number;
  price: number;
  cost_price: number;
}

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
  show: boolean;
  onClose: () => void;
  onSave: () => void;
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
  statusOptions,
  clientId,
  status,
  comment,
  items,
  setClientId,
  setStatus,
  setComment,
  handleProductChange,
  handleQuantityChange,
  handleItemChange,
  handleRemoveItem,
  handleAddItem
}) => {
  const { t } = useTranslation('common');
  const { selectedCurrency } = useWorkspace();

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{t('orderDetails')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <SelectDropdown
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
                          options={productOptions}
                          value={item.product_id > 0 ? productOptions.find(option => option.value === item.product_id) : null}
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
                          readOnly
                          value={item.cost_price}
                        />
                      </Form.Group>
                    </div>
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
        <Button variant="outline-secondary" className="me-2" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={onSave}
          disabled={items.length === 0 || !clientId}
        >
          {t('saveChanges')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default React.memo(OrderModal);
