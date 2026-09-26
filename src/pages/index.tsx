import React, { useMemo, useCallback, useState } from 'react';
import { Container, Row, Col, Card, Table, Button, ProgressBar } from 'react-bootstrap';
import useSWR from 'swr';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/router';
import fetcher from '../utils/fetcher';
import { useAuth, withAuth } from '../utils/authContext';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import OrderModal from '../components/modal/Orders/OrderModal';
import StatusModal from '../components/modal/Orders/StatusModal';
import DeleteModal from '../components/modal/Orders/DeleteModal';
import { MetricCard } from '../components/MetricCard';
import { DonutChart } from '../components/charts';
import StatusBadge from '../components/StatusBadge';
import { swrConfigs } from '../utils/swrConfig';
import {
  FaBook,
  FaLeaf,
  FaBoxOpen,
  FaShoppingCart,
  FaChartPie,
  FaCalendarAlt,
  FaUser,
  FaArrowUp,
  FaDollarSign,
  FaClock,
  FaEye,
  FaCheckCircle,
  FaExclamationTriangle,
  FaUsers,
  FaChartLine,
  FaSync,
  FaPencilAlt,
  FaTrash
} from 'react-icons/fa';
import { Order, Client, Product, Ingredient, OrderItem, DashboardStats, ProfitData, ORDER_STATUSES, WorkspaceIngredient } from '../types/api';
import { calculateTotalPrice, calculateTotalCostPrice, groupOrderItems, createEmptyOrderItem, createOrderItemFromProduct, updateOrderItem, removeOrderItem, addOrderItem } from '../utils/orderHelpers';
import { formatDate } from '../utils/contactHelpers';
import { useNotification } from '../hooks/useNotification';
import { useWorkspace } from '../utils/workspaceContext';
import { workspaceFetcher, workspaceKey } from '../utils/workspaceSWR';

type DashboardStatusVariant = 'brand' | 'success' | 'warning' | 'error' | 'info';

const dashboardChartColors = [
  'var(--chart-accent-brand)',
  'var(--chart-accent-warn)',
  'var(--chart-accent-info)',
  'var(--chart-accent-good)',
  'var(--chart-accent-danger)',
] as const;

const getOrderStatusVariant = (status: string): DashboardStatusVariant => {
  switch (status) {
    case 'new':
      return 'brand';
    case 'in_progress':
      return 'warning';
    case 'finished':
    case 'completed':
      return 'success';
    case 'canceled':
      return 'error';
    default:
      return 'info';
  }
};

const Dashboard = () => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { auth } = useAuth();
  const { selectedWorkspaceId, selectedCurrency, isWorkspaceReady } = useWorkspace();
  const { success, error: showError } = useNotification();

  const { data: dashboardStats, error: dashboardError, mutate: mutateDashboardStats } = useSWR<DashboardStats>(
    workspaceKey('/api/dashboard', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher,
    {
      ...swrConfigs.dashboard,
      fallbackData: {
        total_recipes: 0,
        total_products: 0,
        total_orders: 0,
        pending_orders: 0,
        recent_orders: [],
        order_type_distribution: []
      }
    }
  );

  const { data: clients = [] } = useSWR<Client[]>(
    workspaceKey('/api/clients', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher,
    swrConfigs.static
  );

  const { data: orders = [], mutate: mutateOrders } = useSWR<Order[]>(
    workspaceKey('/api/orders', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher,
    swrConfigs.list
  );

  const { data: workspaceIngredients = [] } = useSWR<WorkspaceIngredient[]>(
    workspaceKey('/api/workspace-ingredients', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher,
    swrConfigs.static
  );
  const ingredients: Ingredient[] = workspaceIngredients.map((workspaceIngredient) => workspaceIngredient.ingredient);

  const { data: recipes = [] } = useSWR(
    workspaceKey('/api/recipes', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher,
    swrConfigs.static
  );

  const { data: products = [] } = useSWR<Product[]>(
    workspaceKey('/api/products', selectedWorkspaceId, auth.isAuthenticated && isWorkspaceReady),
    workspaceFetcher,
    swrConfigs.static
  );

    // State for order modal
  const [showOrderModal, setShowOrderModal] = React.useState(false);
  const [editingOrder, setEditingOrder] = React.useState<Order | null>(null);
  const [clientId, setClientId] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState<string>("");
  const [comment, setComment] = React.useState<string>("");
  const [items, setItems] = React.useState<Array<{
    product_id: number;
    quantity: number;
    price: number;
    cost_price: number;
  }>>([]); 

  // State for status and delete modals
  const [showStatusModal, setShowStatusModal] = React.useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = React.useState<boolean>(false);
  const [statusOrderId, setStatusOrderId] = React.useState<number | null>(null);
  const [deleteOrderId, setDeleteOrderId] = React.useState<number | null>(null);

  const { data: profitData, error: profitError } = useSWR<ProfitData>(
    workspaceKey('/api/dashboard/profit', selectedWorkspaceId, (auth.isAuthenticated || typeof window === 'undefined') && isWorkspaceReady),
    workspaceFetcher,
    {
      ...swrConfigs.dashboard,
      fallbackData: {
        total_revenue: 0,
        total_costs: 0,
        total_profit: 0,
        order_count: 0
      }
    }
  );

  // Calculate real order statistics from actual orders data
  const orderStats = useMemo(() => {
    if (!orders.length) return { total: 0, new: 0, in_progress: 0, ready: 0, finished: 0, canceled: 0 };
    
    return orders.reduce((stats, order) => {
      stats.total++;
      switch (order.status) {
        case 'new':
          stats.new++;
          break;
        case 'in_progress':
          stats.in_progress++;
          break;
        case 'ready':
          stats.ready++;
          break;
        case 'finished':
          stats.finished++;
          break;
        case 'canceled':
          stats.canceled++;
          break;
      }
      return stats;
    }, { total: 0, new: 0, in_progress: 0, ready: 0, finished: 0, canceled: 0 });
  }, [orders]);

  // Get pending orders from real data
  const pendingOrders = useMemo(() => {
    if (!orders.length) return [];
    
    return orders
      .filter(order => order.status === 'new' || order.status === 'in_progress')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [orders]);

  // Calculate completion rate from real data
  const completionRate = orderStats.total > 0 
    ? (orderStats.finished / orderStats.total) * 100 
    : 0;

  const statusOptions = useMemo(() => ORDER_STATUSES.map(status => ({
    value: status.value,
    label: t(status.value),
  })), [t]);

  const chartData = useMemo(() => {
    return {
      labels: statusOptions.map(opt => opt.label),
      datasets: [
        {
          data: [orderStats.new, orderStats.in_progress, orderStats.ready, orderStats.finished, orderStats.canceled],
          backgroundColor: ['#3f51b5', '#ff9800', '#9c27b0', '#4caf50', '#f44336'],
          hoverBackgroundColor: ['#303f9f', '#f57c00', '#7b1fa2', '#388e3c', '#d32f2f'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [orderStats, statusOptions]);

  const orderStatusData = useMemo(() => {
    if (!dashboardStats?.order_type_distribution?.length) return null;
    
    return {
      labels: dashboardStats.order_type_distribution?.map((item) => t(item.type.toLowerCase())) || [],
      datasets: [
        {
          data: dashboardStats.order_type_distribution?.map((item) => item.count) || [],
          backgroundColor: ['#3f51b5', '#ff4081', '#4caf50', '#ff9800', '#673ab7'],
          hoverBackgroundColor: ['#303f9f', '#f50057', '#388e3c', '#f57c00', '#512da8'],
          borderWidth: 0,
        },
      ],
    };
  }, [dashboardStats?.order_type_distribution, t]);

  const ingredientTypesData = useMemo(() => {
    if (!ingredients.length) return null;

    const typeCount: { [key: string]: number } = {};
    ingredients.forEach((ingredient: Ingredient) => {
      const type = ingredient.type || 'Unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;
    });

    const types = Object.keys(typeCount);
    const counts = Object.values(typeCount);
    
    return {
      labels: types,
      datasets: [
        {
          data: counts,
          backgroundColor: ['#3f51b5', '#ff4081', '#4caf50', '#ff9800', '#673ab7', '#e91e63', '#9c27b0', '#607d8b'],
          hoverBackgroundColor: ['#303f9f', '#f50057', '#388e3c', '#f57c00', '#512da8', '#c2185b', '#7b1fa2', '#455a64'],
          borderWidth: 0,
        },
      ],
    };
  }, [ingredients]);

  const profitChartData = useMemo(() => {
    if (!profitData || profitData.total_revenue === 0) return null;
    
    return {
      labels: [t('totalRevenue'), t('totalCosts'), t('totalProfit')],
      datasets: [
        {
          data: [profitData.total_revenue, profitData.total_costs, profitData.total_profit],
          backgroundColor: ['#4caf50', '#ff9800', profitData.total_profit >= 0 ? '#2196f3' : '#f44336'],
          hoverBackgroundColor: ['#388e3c', '#f57c00', profitData.total_profit >= 0 ? '#1976d2' : '#d32f2f'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [profitData, t]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 15,
          usePointStyle: true,
          color: '#333333',
          font: {
            size: 11,
            weight: 'bold' as const
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 8,
        titleFont: { size: 12 },
        bodyFont: { size: 11 },
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8
      }
    }
  };

  // Handle order editing (copied from orders.tsx)
  const handleEditOrder = (order: Order) => {
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
  };

  const handleCloseOrderModal = () => {
    setEditingOrder(null);
    setClientId(null);
    setStatus("");
    setComment("");
    setItems([]);
    setShowOrderModal(false);
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
        // Refresh orders data
        mutateOrders();
        mutateDashboardStats(); // Refresh dashboard stats (including recent_orders table)
        success(editingOrder ? t('orderUpdated') : t('orderCreated'));
      }
      handleCloseOrderModal();
    } catch (error) {
      showError(t('failedToSaveOrder'));
    }
  };

  // Handle product changes in order modal
  const handleProductChange = (index: number, product_id: number) => {
    const product = products.find((p) => p.id === product_id);
    if (product) {
      const updatedItems = [...items];
      updatedItems[index] = createOrderItemFromProduct(product);
      setItems(updatedItems);
    }
  };

  const handleQuantityChange = (index: number, quantity: number) => {
    setItems(updateOrderItem(items, index, 'quantity', quantity));
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: string | number) => {
    setItems(updateOrderItem(items, index, field, value));
  };

  const handleRemoveItem = (index: number) => {
    setItems(removeOrderItem(items, index));
  };

  const handleAddItem = () => {
    setItems(addOrderItem(items));
  };

  // Handle status change (copied from orders.tsx)
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
      mutateOrders(); // Refresh orders data
      mutateDashboardStats(); // Refresh dashboard stats (including recent_orders table)
      setStatusOrderId(null);
      setShowStatusModal(false);
      success(t('statusUpdated'));
    } catch (error) {
      showError(t('failedToUpdateStatus'));
    }
  };

  // Handle delete order (copied from orders.tsx)
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
      mutateOrders(); // Refresh orders data
      mutateDashboardStats(); // Refresh dashboard stats (including recent_orders table)
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

  if (!auth.isAuthenticated) {
    return (
      <Container className="text-center py-5">
        <h2>{t('pleaseSignIn')}</h2>
        <Button 
          variant="primary" 
          className="mt-3" 
          onClick={() => router.push('/auth/signin')}
        >
          {t('signIn')}
        </Button>
      </Container>
    );
  }

  if (dashboardError) {
    return (
      <ErrorState 
        message={t('failedToLoadDashboard')} 
        onRetry={() => mutateDashboardStats()} 
      />
    );
  }

  if (!dashboardStats) {
    return <LoadingState fullPage />;
  }

  return (
    <div className="page-container dashboard-page">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title d-flex align-items-center gap-3">
            <FaChartPie className="text-primary" />
            {t('dashboard')}
          </h1>
          <p className="page-subtitle">
            {t('dashboardDescription')}
          </p>
        </div>
        <Button variant="outline-primary" size="sm" onClick={() => mutateDashboardStats()}>
          <FaSync className="me-2" />
          {t('refresh')}
        </Button>
      </div>

      <div className="page-content">
        {/* Main Statistics Cards with Sparklines */}
        <Row className="dashboard-stat-grid g-3 mb-4">
          <Col xs={12} md={6} xxl={3}>
            <MetricCard
              title={t('totalOrders')}
              value={orderStats.total || 0}
              icon={<FaShoppingCart size={20} />}
              iconVariant="primary"
            />
          </Col>

          <Col xs={12} md={6} xxl={3}>
            <MetricCard
              title={t('totalIngredients')}
              value={ingredients.length || 0}
              icon={<FaLeaf size={20} />}
              iconVariant="success"
            />
          </Col>

          <Col xs={12} md={6} xxl={3}>
            <MetricCard
              title={t('totalClients')}
              value={clients.length}
              icon={<FaUsers size={20} />}
              iconVariant="warning"
            />
          </Col>

          <Col xs={12} md={6} xxl={3}>
            <MetricCard
              title={t('totalProducts')}
              value={dashboardStats?.total_products || 0}
              icon={<FaBoxOpen size={20} />}
              iconVariant="info"
            />
          </Col>
        </Row>

        {/* Profit Analytics Section */}
        {profitData && (
          <>
            <div className="section-header mb-3">
              <h4 className="section-title d-flex align-items-center gap-2">
                <FaChartLine className="text-primary" />
                {t('profitAnalytics')}
              </h4>
            </div>

            <Row className="dashboard-stat-grid g-3 mb-4">
              <Col xs={12} md={6} xxl={3}>
                <MetricCard
                  title={t('totalRevenue')}
                  value={`${profitData.total_revenue?.toFixed(0) || '0'} ${selectedCurrency || ''}`}
                  icon={<FaArrowUp size={20} />}
                  iconVariant="success"
                />
              </Col>

              <Col xs={12} md={6} xxl={3}>
                <MetricCard
                  title={t('totalCosts')}
                  value={`${profitData.total_costs?.toFixed(0) || '0'} ${selectedCurrency || ''}`}
                  icon={<FaDollarSign size={20} />}
                  iconVariant="warning"
                />
              </Col>

              <Col xs={12} md={6} xxl={3}>
                <MetricCard
                  title={t('totalProfit')}
                  value={`${profitData.total_profit?.toFixed(0) || '0'} ${selectedCurrency || ''}`}
                  icon={<FaChartLine size={20} />}
                  iconVariant="success"
                />
              </Col>

              <Col xs={12} md={6} xxl={3}>
                <MetricCard
                  title={`${t('profit')} / ${t('order').toLowerCase()}`}
                  value={`${profitData.order_count > 0 ? (profitData.total_profit / profitData.order_count).toFixed(0) : '0'} ${selectedCurrency || ''}`}
                  icon={<FaCheckCircle size={20} />}
                  iconVariant="info"
                />
              </Col>
            </Row>
          </>
        )}

        {/* Performance Metrics */}
        <Row className="dashboard-performance-grid g-3 mb-4">
          <Col xs={12} md={6} xxl={3}>
            <Card className="border-0 h-100 shadow-sm">
              <Card.Body className="p-3">
                <Card.Title className="mb-3 fs-6 d-flex align-items-center">
                  <FaCheckCircle className="me-2 text-success" />
                  {t('orderCompletion')}
                </Card.Title>
                <div className="mb-2">
                  <div className="d-flex justify-content-between mb-1">
                    <small className="text-muted">{t('completed')}</small>
                    <small className="fw-bold">{completionRate.toFixed(1)}%</small>
                  </div>
                  <ProgressBar 
                    now={completionRate} 
                    variant="success" 
                    style={{ height: '8px' }}
                  />
                </div>
                <div className="small text-muted">
                  {orderStats.finished || 0} {t('of')} {orderStats.total || 0} {t('orders')}
                </div>
              </Card.Body>
            </Card>
          </Col>
          
          <Col xs={12} md={6} xxl={3}>
            <Card className="border-0 h-100 shadow-sm rounded-lg">
              <Card.Body className="p-3">
                <Card.Title className="mb-3 fs-6 d-flex align-items-center">
                  <FaChartLine className="me-2 text-primary" />
                  {t('orderStatus')}
                </Card.Title>
                {orderStats.total > 0 ? (
                  <DonutChart
                    data={[
                      { label: t('new'), value: orderStats.new, color: 'var(--chart-accent-brand)' },
                      { label: t('inProgress'), value: orderStats.in_progress, color: 'var(--chart-accent-warn)' },
                      { label: t('ready'), value: orderStats.ready, color: 'var(--chart-accent-info)' },
                      { label: t('finished'), value: orderStats.finished, color: 'var(--chart-accent-good)' },
                      { label: t('canceled'), value: orderStats.canceled, color: 'var(--chart-accent-danger)' }
                    ].filter(d => d.value > 0)}
                    size={200}
                    innerRadius={60}
                    showLegend={false}
                    centerText={orderStats.total.toString()}
                    centerSubtext={t('orders')}
                  />
                ) : (
                  <div className="text-center py-4">
                    <small className="text-muted">{t('noOrdersFound')}</small>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col xs={12} md={6} xxl={3}>
            <Card className="border-0 h-100 shadow-sm rounded-lg">
              <Card.Body className="p-3">
                <Card.Title className="mb-3 fs-6 d-flex align-items-center">
                  <FaLeaf className="me-2 text-success" />
                  {t('ingredientTypes')}
                </Card.Title>
                {ingredientTypesData ? (
                  <DonutChart
                    data={ingredientTypesData.labels.map((label, i) => ({
                      label,
                      value: ingredientTypesData.datasets[0].data[i],
                      color: dashboardChartColors[i % dashboardChartColors.length]
                    }))}
                    size={200}
                    innerRadius={60}
                    showLegend={false}
                    centerText={ingredients.length.toString()}
                    centerSubtext={t('ingredients')}
                  />
                ) : (
                  <div className="text-center py-4">
                    <small className="text-muted">{t('noIngredientsFound')}</small>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col xs={12} md={6} xxl={3}>
            <Card className="border-0 h-100 shadow-sm rounded-lg">
              <Card.Body className="p-3">
                <Card.Title className="mb-3 fs-6 d-flex align-items-center">
                  <FaDollarSign className="me-2 text-warning" />
                  {t('revenueVsCosts')}
                </Card.Title>
                {profitChartData && profitData && profitData.total_revenue > 0 ? (
                  <DonutChart
                    data={[
                      { label: t('totalRevenue'), value: profitData.total_revenue, color: 'var(--chart-accent-good)' },
                      { label: t('totalCosts'), value: profitData.total_costs, color: 'var(--chart-accent-warn)' },
                      { label: t('totalProfit'), value: Math.abs(profitData.total_profit), color: profitData.total_profit >= 0 ? 'var(--chart-accent-info)' : 'var(--chart-accent-danger)' }
                    ]}
                    size={200}
                    innerRadius={60}
                    showLegend={false}
                    centerText={`${profitData.total_revenue > 0 ? ((profitData.total_profit / profitData.total_revenue) * 100).toFixed(0) : '0'}%`}
                    centerSubtext={t('margin')}
                    currency={selectedCurrency || ''}
                  />
                ) : (
                  <div className="text-center py-4">
                    <small className="text-muted">{t('noPendingOrders')}</small>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Recent Orders Table */}
        <Row>
          <Col>
            <Card className="border-0 shadow-sm">
              <Card.Body className="p-3">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <Card.Title className="mb-0 fs-5 d-flex align-items-center">
                    <FaCalendarAlt className="me-2 text-primary" />
                    {t('recentOrders')}
                  </Card.Title>
                  <Button 
                    variant="outline-primary" 
                    size="sm"
                    onClick={() => router.push('/orders')}
                  >
                    <FaEye className="me-1" />
                    {t('viewAll')}
                  </Button>
                </div>
                
                {(dashboardStats?.recent_orders?.length || pendingOrders.length) > 0 ? (
                  <div className="table-responsive">
                    <Table hover size="sm" className="mb-0">
                      <thead className="table-light">
                        <tr>
                          <th className="border-0">{t('order')}</th>
                          <th className="border-0">{t('client')}</th>
                          <th className="border-0">{t('status')}</th>
                          <th className="border-0">{t('amount')}</th>
                          <th className="border-0">{t('date')}</th>
                          <th className="border-0 text-center">{t('actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(dashboardStats?.recent_orders?.length ? dashboardStats.recent_orders : pendingOrders).map((order) => {
                          const isApiOrder = 'client_name' in order;
                          const statusVariant = getOrderStatusVariant(order.status);
                          
                          return (
                            <tr key={order.id}>
                              <td className="fw-bold">#{order.id}</td>
                              <td>
                                {isApiOrder 
                                  ? (order as any).client_name || t('unknownClient')
                                  : (() => {
                                      const client = clients.find(c => c.id === (order as any).client_id);
                                      return client ? `${client.name} ${client.surname || ''}`.trim() : t('unknownClient');
                                    })()
                                }
                              </td>
                              <td>
                                <StatusBadge status={t(order.status)} variant={statusVariant} />
                              </td>
                              <td className="fw-bold text-success">
                                {isApiOrder 
                                  ? order.total_amount.toFixed(2)
                                  : ((order as any).items?.reduce((total: number, item: any) => total + (item.quantity * item.price), 0).toFixed(2) || '0.00')
                                } {selectedCurrency || ''}
                              </td>
                              <td className="text-muted">
                                {formatDate(isApiOrder ? (order as any).order_date : (order as any).created_at)}
                              </td>
                              <td className="text-center">
                                <div className="d-flex gap-1 align-items-center justify-content-center">
                                  <button 
                                    onClick={() => handleChangeStatus(order.id)}
                                    className="action-icon-btn"
                                    title={t("changeStatus")}
                                  >
                                    <FaSync size={12} />
                                  </button>
                                  <button 
                                    onClick={() => {
                                      const fullOrder = orders.find(o => o.id === order.id);
                                      if (fullOrder) handleEditOrder(fullOrder);
                                    }}
                                    className="action-icon-btn"
                                    title={t("edit")}
                                  >
                                    <FaPencilAlt size={12} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteOrder(order.id)}
                                    className="action-icon-btn text-danger"
                                    title={t("delete")}
                                  >
                                    <FaTrash size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <FaExclamationTriangle className="text-muted mb-2" size={24} />
                    <p className="text-muted mb-0">{t('noPendingOrders')}</p>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Order Modal */}
      <OrderModal
        show={showOrderModal}
        onClose={handleCloseOrderModal}
        onSave={handleSaveOrderChanges}
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

      {/* Status Modal */}
      <StatusModal
        show={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        onSave={handleSaveStatusChange}
        statusOptions={statusOptions}
        status={status}
        setStatus={setStatus}
      />

      {/* Delete Modal */}
      <DeleteModal
        show={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDelete={handleConfirmDelete}
      />
    </div>
  );
};

export default withAuth(Dashboard);
