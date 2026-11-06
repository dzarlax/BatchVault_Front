import React, { useId } from 'react';
import { Modal, Form, Button } from 'react-bootstrap';
import useTranslation from 'next-translate/useTranslation';
import SelectDropdown from '../../../components/SelectDropdown';

interface StatusOption {
  value: string; // Если статус всегда будет строкой, оставьте как есть.
  label: string;
}

interface StatusModalProps {
  show: boolean;
  onClose: () => void;
  onSave: () => void;
  statusOptions: StatusOption[];
  status: string;
  setStatus: (status: string) => void;
}

const StatusModal: React.FC<StatusModalProps> = ({
  show,
  onClose,
  onSave,
  statusOptions,
  status,
  setStatus
}) => {
  const { t } = useTranslation('common');
  const titleId = `order-status-modal-title-${useId()}`;

  return (
    <Modal show={show} onHide={onClose} className="ui-workflow-modal" aria-labelledby={titleId}>
      <Modal.Header closeButton closeLabel={t('close')}>
        <Modal.Title id={titleId}>{t('changeStatus')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <SelectDropdown
            options={statusOptions}
            value={statusOptions.find(option => option.value === status)}
            onChange={option => setStatus(option?.value || '')} // Ensure status is handled properly
            label={t('status')}
          />
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>{t('close')}</Button>
        <Button variant="primary" onClick={onSave}>{t('saveChanges')}</Button>
      </Modal.Footer>
    </Modal>
  );
};

export default StatusModal;
