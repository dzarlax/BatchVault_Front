import { useState } from 'react';
import useSWR from 'swr';
import fetcher from '../utils/fetcher';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/router';
import { Button, Col } from 'react-bootstrap';
import ClientModal from '../components/modal/Clients/ClientModal';
import ClientCardSkeleton from '../components/skeletons/ClientCardSkeleton';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { FaPlus, FaUsers, FaEdit } from 'react-icons/fa';
import { useAuth } from '../utils/authContext';
import { useNotification } from '../hooks/useNotification';
import { Client } from '../types/api';
import { getMapboxToken } from '../utils/runtimeConfig';
import { useWorkspace } from '../utils/workspaceContext';
import { workspaceFetcher, workspaceKey } from '../utils/workspaceSWR';
import { ClearFiltersButton, FilterBar, SearchFilter } from '../components/filters/FilterBar';

const Clients = ({ mapboxToken }) => {
  const { t, lang } = useTranslation('common');
  const { auth } = useAuth();
  const { selectedWorkspaceId, isWorkspaceReady } = useWorkspace();
  const { success, error: showError } = useNotification();
  const { data: clients, mutate, error: clientsError } = useSWR<Client[]>(
    workspaceKey('/api/clients', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const router = useRouter();

  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [telegram, setTelegram] = useState('');
  const [instagram, setInstagram] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [source, setSource] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  const openClientModal = (client = null) => {
    if (client) {
      setEditingClient(client);
      setName(client.name);
      setSurname(client.surname);
      setTelegram(client.telegram);
      setInstagram(client.instagram);
      setPhone(client.phone);
      setAddress(client.address);
      setSource(client.source);
    } else {
      setEditingClient(null);
      setName('');
      setSurname('');
      setTelegram('');
      setInstagram('');
      setPhone('');
      setAddress('');
      setSource('');
    }
    setShowClientModal(true);
  };

  const handleSaveClient = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/auth/signin');
        return;
      }
    const clientData = { name, surname, telegram, instagram, phone, address, source };

    if (editingClient) {
      await fetcher(`/api/clients/${editingClient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(clientData),
      });
    } else {
      await fetcher('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(clientData),
      });
    }

    mutate();
    setShowClientModal(false);
    success(editingClient ? t('clientUpdated') : t('clientCreated'));
  } catch (error) {
    showError(t('failedToSaveClient'));
  }
  };

  const deleteClient = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/auth/signin');
        return;
      }
    if (confirm(t('confirmDeleteClient'))) {
      await fetcher(`/api/clients/${editingClient.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      mutate();
      setShowClientModal(false);
      success(t('clientDeleted'));
    }
  } catch (error) {
    showError(t('failedToDeleteClient'));
  }
  };

  const filteredClients = clients?.filter(client =>
    client.name.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
    client.surname.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
    client.telegram?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
    client.instagram?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
    client.phone?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
    client.address?.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
    client.source?.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  const clearSearch = () => {
    setSearchTerm('');
  };

  const isLoading = !clients && !clientsError;

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title d-flex align-items-center gap-3">
            <FaUsers className="text-primary" />
            {t('clients')}
          </h1>
          {!isLoading && (
            <p className="page-subtitle">
              {t('total')}: {clients?.length || 0} {t('clients').toLowerCase()}
              {filteredClients && filteredClients.length !== clients.length && (
                <span className="text-tertiary"> / {filteredClients.length} {t('filtered').toLowerCase()}</span>
              )}
            </p>
          )}
        </div>
        <Button
          className="btn btn-primary"
          onClick={() => openClientModal()}
        >
          <FaPlus className="me-2" />
          {t('addClient')}
        </Button>
      </div>

      {/* Search Section */}
      <FilterBar mobileCollapsible activeCount={searchTerm.trim() ? 1 : 0} summary={searchTerm.trim()} onClear={clearSearch}>
        <SearchFilter
          label={t('search')}
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder={t('searchClientsPlaceholder')}
          ariaLabel={t('search')}
        />
        <ClearFiltersButton
          label={t('clear')}
          onClick={clearSearch}
          visible={!!searchTerm.trim()}
        />
      </FilterBar>

      {clientsError && <ErrorState message={t('failedToLoadClients')} compact={Boolean(clients)} onRetry={() => { void mutate(); }} />}

      {/* Clients Grid */}
      <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
        {!clients && clientsError ? null : isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <Col key={index}>
              <ClientCardSkeleton />
            </Col>
          ))
        ) : filteredClients.length === 0 ? (
          <div className="col-12">
            <EmptyState
              type="clients"
              message={searchTerm.trim() ? t('noClientsFound') : t('noClients')}
              actionLabel={t(searchTerm.trim() ? 'clear' : 'addClient')}
              onAction={searchTerm.trim() ? clearSearch : () => openClientModal()}
            />
          </div>
        ) : (
          filteredClients.map((client) => (
          <div key={client.id} className="col">
            <div className="client-card">
              <div className="client-card-header">
                <h3 className="client-name">{client.name} {client.surname}</h3>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => openClientModal(client)}
                  title={t('edit')} aria-label={`${t('edit')} ${client.name} ${client.surname}`}
                >
                  <FaEdit size={14} />
                </button>
              </div>
              <div className="client-card-body">
                <div className="client-contact-info">
                  {client.telegram && (
                    <a href={`https://t.me/${client.telegram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="client-contact-link telegram">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.287 5.906c-.778.324-2.334.994-4.666 2.01-.378.15-.577.298-.595.442-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294.26.006.549-.1.868-.32 2.179-1.471 3.304-2.214 3.374-2.23.05-.012.12-.026.166.016.047.041.042.12.037.141-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8.154 8.154 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629.093.06.183.125.27.187.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.426 1.426 0 0 0-.013-.315.337.337 0 0 0-.114-.217.526.526 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09z"/>
                      </svg>
                      <span>{client.telegram}</span>
                    </a>
                  )}

                  {client.instagram && (
                    <a href={`https://instagram.com/${client.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="client-contact-link instagram">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.917 3.917 0 0 0-1.417.923A3.927 3.927 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.916 3.916 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.926 3.926 0 0 0-.923-1.417A3.911 3.911 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0h.003zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599.28.28.453.546.598.92.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.47 2.47 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.478 2.478 0 0 1-.92-.598 2.48 2.48 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233 0-2.136.008-2.388.046-3.231.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92.28-.28.546-.453.92-.598.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045v.002zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92zm-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217zm0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334z"/>
                      </svg>
                      <span>{client.instagram}</span>
                    </a>
                  )}

                  {client.phone && (
                    <a href={`tel:${client.phone}`} className="client-contact-link phone">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path fillRule="evenodd" d="M1.885.511a1.745 1.745 0 0 1 2.61.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.678.678 0 0 0 .178.643l2.457 2.457a.678.678 0 0 0 .644.178l2.189-.547a1.745 1.745 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.634 18.634 0 0 1-7.01-4.42 18.634 18.634 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877L1.885.511z"/>
                      </svg>
                      <span>{client.phone}</span>
                    </a>
                  )}

                  {client.address && (
                    <a href={`https://maps.google.com/?q=${encodeURIComponent(client.address)}`} target="_blank" rel="noopener noreferrer" className="client-contact-link address">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
                      </svg>
                      <span>{client.address}</span>
                    </a>
                  )}
                </div>

                {client.source && (
                  <div className="client-source">
                    <span className="source-label">{t('source')}:</span>
                    <span className="source-value">{client.source}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))
        )}
      </div>

      <ClientModal
        show={showClientModal}
        onHide={() => setShowClientModal(false)}
        onDelete={deleteClient}
        onSave={handleSaveClient}
        client={editingClient}
        name={name}
        surname={surname}
        telegram={telegram}
        instagram={instagram}
        phone={phone}
        address={address}
        source={source}
        setName={setName}
        setSurname={setSurname}
        setTelegram={setTelegram}
        setInstagram={setInstagram}
        setPhone={setPhone}
        setAddress={setAddress}
        setSource={setSource}
        mapboxToken={mapboxToken}
        t={t}
      />
    </div>
  );
};

export async function getServerSideProps(context) {
  // Server-side: use process.env for SSR
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || '';
  return {
    props: { mapboxToken },
  };
}

export default Clients;
