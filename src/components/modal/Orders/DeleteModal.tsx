import React, { useState, useId } from 'react';
import { Modal, Button, Spinner, Alert } from 'react-bootstrap';
import useTranslation from 'next-translate/useTranslation';

interface DeleteModalProps {
  show: boolean;
  onClose: () => void;
  onDelete: () => void;
}

const DeleteModal: React.FC<DeleteModalProps> = ({
  show,
  onClose,
  onDelete
}) => {
  const { t } = useTranslation('common');
  const titleId = `order-delete-modal-title-${useId()}`;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await onDelete(); // Ожидание выполнения удаления
      onClose();        // Закрытие модального окна после успешного удаления
    } catch (err) {
      setError(t('deleteError')); // Сообщение об ошибке
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} className="ui-workflow-modal" aria-labelledby={titleId}>
      <Modal.Header closeButton closeLabel={t('close')}>
        <Modal.Title id={titleId}>{t('confirmDelete')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {t('deleteConfirmationMessage')}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {t('cancel')}
        </Button>
        <Button variant="danger" onClick={handleDelete} disabled={loading}>
          {loading ? <Spinner as="span" animation="border" size="sm" /> : t('delete')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default DeleteModal;
