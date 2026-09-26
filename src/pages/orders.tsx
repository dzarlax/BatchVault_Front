import React, { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import fetcher from "../utils/fetcher";
import useTranslation from "next-translate/useTranslation";
import { Table, Button } from "react-bootstrap";
import { SingleValue } from 'react-select';
import TableSkeleton from '../components/skeletons/TableSkeleton';
import EmptyState from '../components/EmptyState';
import { StatusBadge } from '../components/StatusBadge';
import SelectDropdown from '../components/SelectDropdown';
import OrderModal from "../components/modal/Orders/OrderModal";
import ClientModal from "../components/modal/Orders/ClientModal";
import StatusModal from "../components/modal/Orders/StatusModal";
import DeleteModal from "../components/modal/Orders/DeleteModal";
import { useRouter } from 'next/router';
import { useAuth } from '../utils/authContext';
import { useNotification } from '../hooks/useNotification';
import { Order, OrderItem, Client, Product, ORDER_STATUSES } from '../types/api';
import { FaSync, FaPencilAlt, FaTrash, FaPlus, FaShoppingCart } from "react-icons/fa";
import { useWorkspace } from '../utils/workspaceContext';
import { workspaceFetcher, workspaceKey } from '../utils/workspaceSWR';
import { ClearFiltersButton, FilterBar } from '../components/filters/FilterBar';

const Orders = () => {
  const { t } = useTranslation("common");
  const { auth } = useAuth();
  const { selectedWorkspaceId, selectedCurrency, isWorkspaceReady } = useWorkspace();
  const { success, error: showError } = useNotification();
  const router = useRouter();

  const { data: ordersData, mutate: mutateOrders } = useSWR<Order[]>(
    workspaceKey("/api/orders", selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const { data: clientsData = [], mutate: mutateClients } = useSWR<Client[]>(
    workspaceKey("/api/clients", selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );
  const { data: productsData = [], mutate: mutateProducts } = useSWR<Product[]>(
    workspaceKey("/api/products", selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher
  );

  const orders = ordersData ?? [];
  const clients = clientsData;
  const products = productsData;

  const [clientId, setClientId] = useState<number | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [comment, setComment] = useState<string>("");
  const [showOrderModal, setShowOrderModal] = useState<boolean>(false);
  const [showClientModal, setShowClientModal] = useState<boolean>(false);
  const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [showCreateOrderModal, setShowCreateOrderModal] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [statusOrderId, setStatusOrderId] = useState<number | null>(null);
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<SingleValue<{ value: string; label: string }> | null>(null);
  const [selectedClientFilter, setSelectedClientFilter] = useState<SingleValue<{ value: number; label: string }> | null>(null);

  const statusOptions = useMemo(() => ORDER_STATUSES.map(status => ({
    value: status.value,
    label: t(status.value),
  })), [t]);

  const filteredOrders = useMemo(() => {
    let filtered = orders;

    if (selectedStatus) {
      filtered = filtered.filter((order) => order.status === selectedStatus.value);
    }

    if (selectedClientFilter) {
      filtered = filtered.filter((order) => order.client_id === selectedClientFilter.value);
    }

    return filtered;
  }, [selectedStatus, selectedClientFilter, orders]);

  const handleEditOrder = useCallback((order: Order) => {
    setEditingOrder(order);
    setClientId(order.client_id);
    setStatus(order.status);
    setComment(order.comment || "");
    setItems(
      order.items
        ? order.items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
            cost_price: item.cost_price,
          }))
        : []
    );
    setShowOrderModal(true);
  }, [t]);

  const handleCloseOrderModal = () => {
    setEditingOrder(null);
    setClientId(null);
    setStatus("");
    setComment("");
    setItems([]);
    setShowOrderModal(false);
    setShowCreateOrderModal(false);
  };

  const handleSaveOrderChanges = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
          router.push('/auth/signin');
          return;
      }
      const order = { client_id: clientId, status, comment, items };

      if (editingOrder) {
        await fetcher(`/api/orders/${editingOrder.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(order),
        });
        mutateOrders();
      } else {
        await fetcher("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(order),
        });
        mutateOrders();
      }

      handleCloseOrderModal();
      success(editingOrder ? t('orderUpdated') : t('orderCreated'));
    } catch (error) {
      showError(t('failedToSaveOrder'));
    }
  };

  const handleCreateOrder = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
          router.push('/auth/signin');
          return;
      }
      const order = { client_id: clientId, status: "new", comment, items };

      await fetcher("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(order),
      });
      setClientId(null);
      setComment("");
      setItems([]);
      mutateOrders();
      setShowCreateOrderModal(false);
      success(t('orderCreated'));
    } catch (error) {
      showError(t('failedToCreateOrder'));
    }
  };

  const handleItemChange = (
    index: number,
    field: keyof OrderItem,
    value: string | number
  ) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setItems(updatedItems);
  };

  const handleAddItem = () => {
    setItems([...items, { product_id: 0, quantity: 1, price: 0, cost_price: 0 }]);
  };

  const handleProductChange = (index: number, product_id: number) => {
    const product = products.find((p) => p.id === product_id);
    if (product) {
      const updatedItems = [...items];
      updatedItems[index] = { ...updatedItems[index], product_id, price: product.price, cost_price: product.cost };
      setItems(updatedItems);
    }
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], quantity };
    setItems(updatedItems);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleClientClick = (client: Client) => {
    setSelectedClient(client);
    setShowClientModal(true);
  };

  const handleCloseClientModal = () => {
    setSelectedClient(null);
    setShowClientModal(false);
  };

  const handleChangeStatus = (orderId: number) => {
    const order = orders.find((order) => order.id === orderId);
    if (order) {
      setStatus(order.status);
    }
    setStatusOrderId(orderId);
    setShowStatusModal(true);
  };

  const handleSaveStatusChange = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
          router.push('/auth/signin');
          return;
      }
      if (!statusOrderId || !status) return;

      await fetcher(`/api/orders/${statusOrderId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      mutateOrders();
      setStatusOrderId(null);
      setShowStatusModal(false);
      success(t('statusUpdated'));
    } catch (error) {
      showError(t('failedToUpdateStatus'));
    }
  };

  const handleDeleteOrder = (orderId: number) => {
    setDeleteOrderId(orderId);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
          router.push('/auth/signin');
          return;
      }
      if (!deleteOrderId) return;

      await fetcher(`/api/orders/${deleteOrderId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          'Authorization': `Bearer ${token}`,
        },
      });
      mutateOrders();
      setDeleteOrderId(null);
      setShowDeleteModal(false);
      success(t('orderDeleted'));
    } catch (error) {
      showError(t('failedToDeleteOrder'));
    }
  };

  const clientOptions = clients.map((client) => ({
    value: client.id,
    label: `${client.name} ${client.surname}`,
  }));

  const productOptions = products.map((product) => ({
    value: product.id,
    label: product.name,
  }));

  const clearFilters = () => {
    setSelectedStatus(null);
    setSelectedClientFilter(null);
  };

  const hasActiveFilters = selectedStatus || selectedClientFilter;
  const isLoading = !ordersData;

  const formatCurrency = (value: number) => {
    return `${value.toFixed(2)} ${selectedCurrency || ''}`;
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title d-flex align-items-center gap-3">
            <FaShoppingCart className="text-primary" />
            {t('orders')}
          </h1>
          {!isLoading && (
            <p className="page-subtitle">
              {t('total')}: {orders.length} {t('orders').toLowerCase()}
              {hasActiveFilters && (
                <span className="text-tertiary"> / {filteredOrders.length} {t('filtered').toLowerCase()}</span>
              )}
            </p>
          )}
        </div>
        <Button
          className="btn btn-primary"
          onClick={() => {
            setClientId(null);
            setStatus("new");
            setComment("");
            setItems([{ product_id: 0, quantity: 1, price: 0, cost_price: 0 }]);
            setShowCreateOrderModal(true);
          }}
        >
          <FaPlus className="me-2" />
          {t('createOrder')}
        </Button>
      </div>

      {/* Filter Section */}
      <FilterBar>
        <div className="filter-group">
          <SelectDropdown
            options={statusOptions}
            value={selectedStatus}
            onChange={setSelectedStatus}
            placeholder={t('allStatuses')}
            isClearable
            label={t('status')}
          />
        </div>
        <div className="filter-group">
          <SelectDropdown
            options={clientOptions}
            value={selectedClientFilter}
            onChange={setSelectedClientFilter}
            placeholder={t('allClients')}
            isClearable
            label={t('client')}
          />
        </div>
        <ClearFiltersButton
          label={t('clear')}
          onClick={clearFilters}
          visible={!!hasActiveFilters}
        />
      </FilterBar>

      {/* Orders Table */}
      {isLoading ? (
        <TableSkeleton rows={10} columns={10} />
      ) : orders.length === 0 ? (
        <EmptyState
          type="orders"
          message={t('noOrders')}
          actionLabel={t('createOrder')}
          onAction={() => {
            setClientId(null);
            setStatus("new");
            setComment("");
            setItems([{ product_id: 0, quantity: 1, price: 0, cost_price: 0 }]);
            setShowCreateOrderModal(true);
          }}
        />
      ) : (
        <div className="table-responsive orders-table-wrap">
          <Table className="table orders-table">
            <thead>
              <tr>
                <th>{t('id')}</th>
                <th>{t('client')}</th>
                <th>{t('status')}</th>
                <th>{t('date')}</th>
                <th>{t('items')}</th>
                <th>{t('total')}</th>
                <th>{t('cost')}</th>
                <th>{t('profit')}</th>
                <th className="text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td className="text-secondary">#{order.id}</td>
                  <td>
                    <button
                      onClick={() =>
                        handleClientClick(
                          clients.find((client) => client.id === order.client_id) ||
                            ({} as Client)
                        )
                      }
                      className="btn-link"
                    >
                      {clients.find((client) => client.id === order.client_id)?.name ||
                        t("unknownClient")}
                    </button>
                  </td>
                  <td>
                    <StatusBadge
                      status={t(order.status)}
                      variant={
                        order.status === 'new' ? 'brand' :
                        order.status === 'in_progress' ? 'warning' :
                        order.status === 'canceled' ? 'error' :
                        order.status === 'ready' ? 'info' : 'success'
                      }
                    />
                  </td>
                  <td className="text-secondary small">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="text-secondary">
                      {order.items?.map((item) => {
                        const product = products.find((p) => p.id === item.product_id);
                        return (
                          <div key={item.product_id} className="small">
                            {product ? product.name : t("unknownProduct")} x {item.quantity}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <span className="fw-semibold">
                      {formatCurrency(order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0)}
                    </span>
                  </td>
                  <td className="text-secondary">
                    {formatCurrency(order.items?.reduce((sum, item) => sum + (item.cost_price * item.quantity), 0) || 0)}
                  </td>
                  <td className={(order.items?.reduce((sum, item) => sum + ((item.price - item.cost_price) * item.quantity), 0) || 0) >= 0 ? 'text-success' : 'text-error'}>
                    <span className="fw-semibold">
                      {formatCurrency(order.items?.reduce((sum, item) => sum + ((item.price - item.cost_price) * item.quantity), 0) || 0)}
                    </span>
                  </td>
                  <td>
                    <div className="order-actions">
                      <button
                        onClick={() => handleChangeStatus(order.id)}
                        className="btn btn-ghost btn-sm"
                        title={t("changeStatus")}
                      >
                        <FaSync size={14} />
                      </button>
                      <button
                        onClick={() => handleEditOrder(order)}
                        className="btn btn-ghost btn-sm"
                        title={t("edit")}
                      >
                        <FaPencilAlt size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteOrder(order.id)}
                        className="btn btn-ghost btn-sm text-error"
                        title={t("delete")}
                      >
                        <FaTrash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Modals */}
      <OrderModal
        show={showOrderModal || showCreateOrderModal}
        onClose={handleCloseOrderModal}
        onSave={editingOrder ? handleSaveOrderChanges : handleCreateOrder}
        clientOptions={clientOptions}
        productOptions={productOptions}
        statusOptions={statusOptions}
        clientId={clientId}
        status={status}
        comment={comment}
        items={items}
        setClientId={setClientId}
        setStatus={setStatus}
        setComment={setComment}
        handleProductChange={handleProductChange}
        handleQuantityChange={handleQuantityChange}
        handleItemChange={handleItemChange}
        handleRemoveItem={handleRemoveItem}
        handleAddItem={handleAddItem}
      />

      <ClientModal
        show={showClientModal}
        onClose={handleCloseClientModal}
        client={selectedClient}
        getTelegramLink={(telegram) => `https://t.me/${telegram.replace('@', '')}`}
        getInstagramLink={(instagram) => `https://instagram.com/${instagram.replace('@', '')}`}
        getPhoneLink={(phone) => `tel:${phone}`}
        getMapLink={(address) => `https://maps.google.com/?q=${encodeURIComponent(address)}`}
      />

      <StatusModal
        show={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        onSave={handleSaveStatusChange}
        statusOptions={statusOptions}
        status={status}
        setStatus={setStatus}
      />

      <DeleteModal
        show={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDelete={handleConfirmDelete}
      />
    </div>
  );
};

export default Orders;
