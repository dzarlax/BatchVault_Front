import React, { useId } from 'react';
import { Modal, Button } from 'react-bootstrap';
import useTranslation from 'next-translate/useTranslation';

interface Client {
    id: number;  // Изменен тип id на number
    name: string;
    surname: string;
    telegram?: string;
    instagram?: string;
    phone?: string;
    address?: string;
    source: string;
}

interface ClientModalProps {
  show: boolean;
  onClose: () => void;
  client: Client | null;
  getTelegramLink: (username: string) => string;
  getInstagramLink: (username: string) => string;
  getPhoneLink: (phone: string) => string;
  getMapLink: (address: string) => string;
}

const ClientModal: React.FC<ClientModalProps> = ({
  show,
  onClose,
  client,
  getTelegramLink,
  getInstagramLink,
  getPhoneLink,
  getMapLink
}) => {
  const { t } = useTranslation('common');
  const titleId = `order-client-modal-title-${useId()}`;

  return (
    <Modal show={show} onHide={onClose} className="ui-workflow-modal" aria-labelledby={titleId}>
      <Modal.Header closeButton closeLabel={t('close')}>
        <Modal.Title id={titleId}>{t('clientDetails')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {client && (
          <div>
            <h4>{client.name} {client.surname}</h4>
            {client.telegram && (
              <p><strong>{t('telegram')}:</strong> <a href={getTelegramLink(client.telegram)} target="_blank" rel="noopener noreferrer">{client.telegram}</a></p>
            )}
            {client.instagram && (
              <p><strong>{t('instagram')}:</strong> <a href={getInstagramLink(client.instagram)} target="_blank" rel="noopener noreferrer">{client.instagram}</a></p>
            )}
            {client.phone && (
              <p><strong>{t('phone')}:</strong> <a href={getPhoneLink(client.phone)}>{client.phone}</a></p>
            )}
            {client.address && (
              <p><strong>{t('address')}:</strong> <a href={getMapLink(client.address)} target="_blank" rel="noopener noreferrer">{client.address}</a></p>
            )}
            <p><strong>{t('source')}:</strong> {client.source}</p>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>{t('close')}</Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ClientModal;
