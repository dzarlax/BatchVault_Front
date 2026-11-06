// Helper functions for order calculations and formatting
// Pure functions that can be easily tested

import { OrderItem, Product } from '../types/api';
import { effectiveProductCost, costIssues } from './costing';

/**
 * Calculate total price for order items
 */
export const calculateTotalPrice = (items: OrderItem[]): number => {
  return items.reduce((total, item) => total + item.quantity * item.price, 0);
};

/**
 * Calculate total cost price for order items
 */
export const calculateTotalCostPrice = (items: OrderItem[]): number => {
  return items.reduce((total, item) => total + item.quantity * item.cost_price, 0);
};

/**
 * Calculate profit (revenue - cost)
 */
export const calculateProfit = (items: OrderItem[]): number => {
  return calculateTotalPrice(items) - calculateTotalCostPrice(items);
};

/**
 * Group order items by product_id and sum quantities
 */
export const groupOrderItems = (items: OrderItem[]): OrderItem[] => {
  const itemMap: { [key: string]: OrderItem } = {};

  items.forEach((item) => {
    const key = item.id ?? `${item.product_id}:${item.price}:${item.cost_price}`;
    if (!itemMap[key]) {
      itemMap[key] = { ...item, quantity: 0 };
    }
    itemMap[key].quantity += item.quantity;
  });

  return Object.values(itemMap);
};

/**
 * Format currency with proper decimal places
 */
export const formatCurrency = (amount: number): string => {
  return amount.toFixed(2);
};

/**
 * Create empty order item
 */
export const createEmptyOrderItem = (): OrderItem => {
  return {
    product_id: 0,
    quantity: 1,
    price: 0,
    cost_price: 0,
  };
};

/**
 * Create order item from product
 */
export const createOrderItemFromProduct = (
  product: Pick<Product, 'id' | 'price' | 'cost' | 'cost_estimate' | 'cost_mode'>
): OrderItem => {
  return {
    product_id: product.id,
    quantity: 1,
    price: product.price,
    cost_price: effectiveProductCost(product) ?? Number.NaN,
    cost_source: product.cost_mode || 'manual',
  };
};

/**
 * Update order item field
 */
export const updateOrderItem = (
  items: OrderItem[],
  index: number,
  field: keyof OrderItem,
  value: string | number
): OrderItem[] => {
  const updatedItems = [...items];
  updatedItems[index] = { ...updatedItems[index], [field]: value };
  return updatedItems;
};

/**
 * Remove order item by index
 */
export const removeOrderItem = (items: OrderItem[], index: number): OrderItem[] => {
  const updatedItems = [...items];
  updatedItems.splice(index, 1);
  return updatedItems;
};

/**
 * Add new order item
 */
export const addOrderItem = (items: OrderItem[]): OrderItem[] => {
  return [...items, createEmptyOrderItem()];
};


// A quote refresh deliberately returns only costing fields, never order quantities or sale prices.
export const refreshOrderItemEstimate = async (
  item: OrderItem,
  loadProduct: (productId: number) => Promise<Product>
): Promise<Pick<OrderItem, 'cost_price' | 'cost_source' | 'cost_snapshot'>> => {
  if (item.cost_snapshot) throw new Error('Saved order cost cannot be refreshed.');
  const product = await loadProduct(item.product_id);
  if (product.id !== item.product_id) throw new Error('The refreshed product does not match this order item.');
  const cost = effectiveProductCost(product);
  if (cost == null || !Number.isFinite(cost) || cost < 0) throw new Error(costIssues(product.cost_estimate));
  return { cost_price: cost, cost_source: product.cost_estimate?.source || product.cost_mode || 'manual', cost_snapshot: undefined };
};
