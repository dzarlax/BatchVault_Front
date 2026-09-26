// Centralized API types for BatchVault
// All API response/request types should be defined here

// ===================== ORDER TYPES =====================

export interface OrderItem {
  product_id: number;
  quantity: number;
  price: number;
  cost_price: number;
}

export interface Order {
  id: number;
  client_id: number;
  status: OrderStatus;
  comment?: string;
  created_at: string;
  updated_at?: string;
  items: OrderItem[];
  client?: Client; // Populated by backend
}

export type OrderStatus = 'new' | 'in_progress' | 'ready' | 'finished' | 'canceled';

export const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'finished', label: 'Finished' },
  { value: 'canceled', label: 'Canceled' },
];

// ===================== CLIENT TYPES =====================

export interface Client {
  id: number;
  name: string;
  surname: string;
  telegram?: string;
  instagram?: string;
  phone?: string;
  address?: string;
  source: string;
  created_at?: string;
}

// ===================== PRODUCT TYPES =====================

export interface ProductPackage {
  id: number;
  name: string;
  weight: number;
}

export interface ProductOption {
  recipe_id: number;
  recipe?: Recipe;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  cost: number;
  package_id: number;
  package?: ProductPackage;
  image?: string;
  image_url?: string;
  options: ProductOption[];
  created_at?: string;
}

// ===================== INGREDIENT TYPES =====================

export interface Ingredient {
  id: number;
  name: string;
  type: string;
  unit: string;
  quantity: number;
  cost_per_unit: number;
  supplier?: string;
  created_at?: string;
}

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  account_id?: number;
  role: string;
  currency?: string;
}

export type UnitProfile = 'mass' | 'fine_mass' | 'volume' | 'count' | 'time';

export interface WorkspaceIngredient {
  id: number;
  created_at: string;
  updated_at: string;
  workspace_id: number;
  ingredient_id: number;
  active: boolean;
  alias?: string;
  category?: string;
  ingredient: Ingredient;
  latest_price?: Price;
  unit_profile?: UnitProfile;
  default_unit?: string;
  allowed_units?: string[];
}

// ===================== RECIPE TYPES =====================

export interface RecipeIngredient {
  id: number;
  recipe_id: number;
  ingredient_id: number;
  quantity: string;  // Go expects string, not number!
  unit: string;
  ingredient?: Ingredient;
  ingredientCost?: string;  // Calculated field from backend
}

export interface Recipe {
  id: number;
  name: string;
  description?: string;
  instructions?: string;
  servings: number;
  created_at?: string;
  ingredients?: RecipeIngredient[];
  recipe_ingredients?: RecipeIngredient[];
}

// ===================== PRICE TYPES =====================

export interface Price {
  id: number;
  ingredient_id: number;
  ingredient: Ingredient;
  price: number;
  unit: string;
  quantity: number;
  date: string;
  user_id?: number;
  workspace_id?: number;
  created_at?: string;
  updated_at?: string;
}

// ===================== DASHBOARD TYPES =====================

export interface DashboardStats {
  total_recipes: number;
  total_products: number;
  total_orders: number;
  pending_orders: number;
  recent_orders: RecentOrderSummary[];
  order_type_distribution: OrderTypeDistribution[];
}

export interface RecentOrderSummary {
  id: number;
  client_name: string;
  total_amount: number;
  status: string;
  order_date: string;
}

export interface OrderTypeDistribution {
  type: string;
  count: number;
}

export interface ProfitData {
  total_revenue: number;
  total_costs: number;
  total_profit: number;
  order_count: number;
}

// ===================== USER TYPES =====================

export interface User {
  id: number;
  username: string;
  email?: string;
  created_at?: string;
}

// ===================== API RESPONSE TYPES =====================

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}
