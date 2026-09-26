# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**JerkyVault Frontend** is a Next.js 14 web application for comprehensive management of jerky production operations. It communicates with a separate Go backend API (`BatchVault_Back`) for all data operations.

**Architecture:**
- **Frontend:** Next.js 14 with TypeScript, Pages Router (not App Router)
- **Backend:** Separate Go REST API repository (`../BatchVault_Back/`)
- **UI Framework:** React Bootstrap 5.3 with custom design system
- **State Management:** SWR for data fetching, React Context for authentication
- **Internationalization:** next-translate (English, Russian `ru`, Serbian `rs`)
- **Theming:** Custom dark/light theme with CSS variables (Smoked Ember design system)

**Module Paths:** Uses `~/*` alias for `./src/*` directory imports.

## Development Commands

```bash
# Development server (runs on port 3000)
npm run dev

# Production build
npm run build

# Start production server (custom server.js)
npm start

# Linting
npm run lint

# Docker-optimized build (skips env validation)
npm run build:docker

# Build without static generation
npm run build:no-ssg

# Docker Compose (with rebuild)
docker-compose up -d --build jerky_vault_frontend
```

**Environment Setup:**
Create `.env.local` with:
- `NEXT_PUBLIC_API_URL` - Backend API URL (e.g., `http://localhost:8080/api`)
- `NEXT_PUBLIC_FRONTEND_URL` - Frontend URL for CORS
- `NEXT_PUBLIC_AUTH_ENABLED` - Enable/disable authentication (`true`/`false`)
- `JWT_SECRET`, `SECRET` - For JWT validation (if needed)

## Architecture & File Structure

### Pages Router (Not App Router)

This project uses the **Pages Router** (`src/pages/`), not the newer App Router. Key differences:
- Routes defined as files in `src/pages/` directory
- `_app.tsx` wraps all pages with providers and layout
- `_document.tsx` for document-level configuration
- Custom `server.js` for SSR with environment variable injection

**Pages Structure:**
- `src/pages/index.tsx` - Dashboard with analytics and recent orders
- `src/pages/auth/` - Authentication pages (signin, signup)
- `src/pages/recipes.tsx` - Recipe management
- `src/pages/orders.tsx` - Order management with status changes
- `src/pages/products.tsx` - Product catalog
- `src/pages/clients.tsx` - Client database
- `src/pages/ingredients.tsx` - Ingredient inventory
- `src/pages/prices.tsx` - Price management
- `src/pages/profile.tsx` - User profile

### Authentication System

**Authentication Flow:**
1. JWT token stored in `localStorage` (token + user data)
2. `AuthProvider` (`src/utils/authContext.tsx`) manages auth state globally
3. Token validation on app init with 5-minute expiration buffer
4. Automatic logout on token expiration or 401/403 responses
5. Cross-tab synchronization via storage event listeners
6. `withAuth()` HOC protects authenticated routes

**Key Files:**
- `src/utils/authContext.tsx` - Auth context provider and `withAuth` HOC
- `src/utils/fetcher.ts` - Global fetch wrapper with auth headers and error handling
- `src/utils/useAuthHandler.tsx` - Cross-tab sync and cleanup hooks

**Protected Routes:**
Use the `withAuth()` HOC to wrap page components requiring authentication. During SSR/static generation, the component renders without auth checks to prevent build errors.

### Data Fetching with SWR

**SWR Configuration** (`src/utils/swrConfig.ts`):
- `dashboard` - 30s refresh for real-time analytics
- `list` - 60s refresh for lists/tables
- `static` - No auto-refresh for reference data (clients, products, ingredients)
- `realtime` - 5s refresh for critical live data

**Fetcher Pattern:**
All API calls use `src/utils/fetcher.ts` which:
- Automatically includes JWT token from localStorage
- Handles 401/403 with automatic logout via global error handler
- Returns structured `FetchError` with field/value for validation errors
- Sets `Authorization: Bearer ${token}` header

**Example Usage:**
```typescript
const { data, error, mutate } = useSWR(
  auth.isAuthenticated ? '/api/orders' : null,
  fetcher,
  swrConfigs.list
);
```

### Component Architecture

**Reusable Components** (`src/components/`):
- `SelectDropdown.tsx` - Unified dropdown component (replaces all react-select usage)
- `Header.tsx` - Top navigation with auth-aware links
- `Sidebar.tsx` - Main navigation (260px wide, grouped sections, language switcher)
- `LoadingState.tsx` - Consistent loading indicator
- `ErrorState.tsx` - Error display with retry functionality
- `AuthErrorNotification.tsx` - Auth-specific error messages
- `Breadcrumbs.tsx` - Navigation breadcrumbs
- `ProductCard.tsx` - Product display card
- `ProductSkeleton.tsx` - Product loading skeleton

**Modal Components** (`src/components/modal/`):
- `Orders/OrderModal.tsx` - Card-based layout with SelectDropdown
- `Orders/StatusModal.tsx` - Status change modal
- `Orders/DeleteModal.tsx` - Delete confirmation
- `Orders/ClientModal.tsx` - Client selection/creation
- `Products/ProductModal.tsx` - Product CRUD with dark theme support
- `Products/PackageModal.tsx` - Package management
- `Recipe/CreateRecipeModal.tsx` - Recipe creation
- `Recipe/EditRecipeModal.tsx` - Recipe editing
- `Clients/ClientModal.tsx` - Client management
- `Prices/AddPriceModal.tsx` - Price management
- `Ingredients/AddIngredientModal.tsx` - Ingredient CRUD

**Charts Components** (`src/components/charts/`):
- `DonutChart.tsx` - Interactive donut chart with tooltips (D3.js)

**Calculator Component:**
- `calculator/RecipeCalculator.tsx` - Recipe cost calculator with ingredient management

### Internationalization (i18n)

**Structure:**
- `locales/{lang}/common.json` - Translation files for en, ru, rs
- `i18n.cjs` - i18n configuration (next-translate)
- Uses `next-translate/useTranslation` hook

**Usage:**
```typescript
const { t } = useTranslation('common');
<h1>{t('dashboard')}</h1>
```

**Translation Keys:**
All user-facing text uses translation keys. Keys are organized by domain (auth, orders, products, etc.). When adding new features, add corresponding keys to all language files.

### Environment Validation

**File:** `src/env.js`
Uses `@t3-oss/env-nextjs` with Zod schemas for:
- Server-side: `NODE_ENV`, `MAPBOX_ACCESS_TOKEN`, `SKIP_ENV_VALIDATION`
- Client-side: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_FRONTEND_URL`, `NEXT_PUBLIC_AUTH_ENABLED`

**Build Flags:**
- `SKIP_ENV_VALIDATION=true` - Skip validation for Docker builds
- `NEXT_DISABLE_SSG=true` - Disable static generation for authenticated routes

### Styling & Theming System

**Design System:** Smoked Ember (custom design system based on burgundy/wine color)

**CSS Variables** (`src/styles/design-system.css`):
- Colors: `--brand-500: #8B2635` (primary burgundy), `--brand-400: #A93444` (light burgundy)
- Surfaces: `--surface-primary`, `--surface-secondary`, `--surface-tertiary`
- Text: `--text-primary`, `--text-secondary`, `--text-tertiary`
- Spacing: `--space-1` through `--space-10`
- Radius: `--radius-sm`, `--radius-md`, `--radius-lg`
- Transitions: `--transition-fast`, `--transition-base`

**Theme Switching:**
- Light theme: White/light gray surfaces, dark text
- Dark theme: Dark gray surfaces, light text
- Toggle in sidebar with moon/sun icons
- Theme preference stored in localStorage

**File Structure:**
- `src/styles/design-system.css` - CSS variables and design tokens
- `src/styles/globals.css` - Global styles and resets
- `src/styles/components.css` - Component-specific styles

**Bootstrap Integration:**
- Bootstrap 5.3 CSS imported in `src/pages/_app.tsx`
- React Bootstrap components for forms, modals, navigation
- Custom styles override Bootstrap where needed

**Responsive Design:**
- Desktop: Fixed sidebar (260px wide)
- Mobile (< 992px): Hamburger menu with overlay sidebar
- Mobile toggle button positioned fixed at top-left
- All modals responsive on mobile

### Sidebar Navigation

**Structure:**
- Fixed 260px width on desktop
- Grouped into sections with icons:
  - **Main** (FaThLarge): Dashboard, Recipes, Ingredients
  - **Management** (FaSlidersH): Products, Orders, Clients, Prices
  - **Account** (FaUser): Profile
- Language switcher: Three buttons with flags (EN, RU, RS)
- Theme toggle: Moon/Sun icon button
- Sign out button: Red outline button with confirmation

**Desktop:**
- Always visible
- Sticky header with logo
- Footer with language/theme controls

**Mobile:**
- Hidden by default
- Slides in from left when toggled
- Overlay backdrop when open
- Close button in header

### Form Components

**SelectDropdown** (Unified dropdown component):
- Replaces all react-select usage across the application
- Features:
  - Portal rendering to document.body (z-index: 9999)
  - Fixed positioning for dropdown menus
  - Dark theme support
  - Error state with helper text
  - Label with optional icon and required indicator
  - Loading/no options messages
- Used in: All modals, filters, and forms

**Usage:**
```typescript
<SelectDropdown
  options={options}
  value={selectedValue}
  onChange={handleChange}
  placeholder="Choose..."
  label="Field Label"
  isSearchable
  isClearable
  required
  error={errorMessage}
/>
```

### Charts & Analytics

**DonutChart** (`src/components/charts/DonutChart.tsx`):
- Built with D3.js (not react-chartjs-2)
- Interactive tooltips on hover
- Shows value and percentage
- Color-coded segments
- Center text support
- No legend (tooltips only)

**Dashboard Charts:**
- Order Status Distribution (5 statuses)
- Ingredient Types (5 types)
- Revenue vs Cost vs Profit

**Tooltip Features:**
- Follows cursor
- Shows segment name with colored square
- Displays absolute value
- Shows percentage with color coding (green ≥20%, orange <20%)
- Smart positioning (avoids screen edges)

### Icons

**Icon Libraries:**
- `react-icons/fa` - FontAwesome icons (imported as `Fa*`)
  - Navigation, actions, UI elements
- `react-icons/bs` - Bootstrap icons (imported as `Bs*`)
  - Used sparingly for specific Bootstrap elements

**Common Icons:**
- `FaHome`, `FaClipboardList`, `FaLeaf`, `FaTag`, `FaUsers`, `FaBoxOpen`, `FaShoppingCart`, `FaUser`
- `FaMoon`, `FaSun` - Theme toggle
- `FaGlobe` - Language selector
- `FaSignOutAlt` - Logout
- `FaTimes`, `FaTrash`, `FaPencilAlt` - Actions

### Next.js Configuration

**File:** `next.config.js`
- Uses `next-translate-plugin` for i18n
- Custom webpack config for SVG handling
- `output: 'standalone'` for Docker deployment
- TypeScript/ESLint errors ignored during build (for speed)
- Static generation disabled to prevent auth errors

**Custom Server:** `server.js`
- Custom HTTP server for SSR with environment variable injection
- Runs on port 3000
- Disables SSG and env validation for server context

## Backend Integration

**Backend Repository:** `../BatchVault_Back/` (Go with Gin framework)

**API Endpoints:**
- Base URL: `NEXT_PUBLIC_API_URL` environment variable
- All requests include JWT in `Authorization: Bearer ${token}` header
- Standard error response: `{ "error": "message" }`
- Dashboard: `/api/dashboard`, `/api/dashboard/profit`
- CRUD endpoints for orders, recipes, products, clients, ingredients, prices

**Rate Limiting:**
- Backend enforces 60 requests/minute for authenticated endpoints
- 10 requests/minute for auth endpoints

## Conventions & Best Practices

1. **Authentication:** Always check `auth.isAuthenticated` before fetching data
2. **Data Fetching:** Use SWR with appropriate config (dashboard/list/static)
3. **Error Handling:** Use `LoadingState` and `ErrorState` components consistently
4. **Modals:** Keep modal state in parent component, pass handlers as props
5. **Forms:**
   - Use React Bootstrap form components with proper validation
   - Use SelectDropdown for all dropdowns (never react-select directly)
   - Add proper error messages and required field indicators
6. **Internationalization:** All user-facing text must use translation keys
7. **TypeScript:** Maintain type definitions for API responses in component files
8. **Theming:** Always support both light and dark themes
9. **Responsive:** Test mobile view with sidebar toggle functionality
10. **Route Protection:** Use `withAuth()` HOC for authenticated pages
11. **Mutations:** Call `mutate()` after create/update/delete to refresh SWR cache

## Common Patterns

### Creating a New CRUD Page

1. Create page file in `src/pages/`
2. Add modal component in `src/components/modal/`
3. Use SWR for data fetching:
   ```typescript
   const { data, error, mutate } = useSWR(
     auth.isAuthenticated ? '/api/resource' : null,
     fetcher,
     swrConfigs.list
   );
   ```
4. Wrap page export with `withAuth()`
5. Add translation keys to all `locales/*/common.json`
6. Handle loading/error states with LoadingState/ErrorState components
7. Use modals for create/edit operations
8. Use SelectDropdown for all dropdown inputs

### Adding New Translation Keys

Add to all three language files in alphabetical order:
- `locales/en/common.json`
- `locales/ru/common.json`
- `locales/rs/common.json`

### Adding a New Modal

1. Create in appropriate `src/components/modal/` subdirectory
2. Accept `show`, `onClose`, and data props
3. Emit `onSave` callback with form data
4. Use React Bootstrap Modal component
5. Include proper TypeScript types for props
6. Use SelectDropdown for all dropdowns
7. Add dark theme styles for custom sections

### Styling Components

1. Use CSS variables from design-system.css
2. Add dark theme styles with `[data-theme="dark"]` selector
3. Follow component naming convention: `.component-name`, `.component-name-element`
4. Use BEM-ish naming for nested elements
5. Add hover/active states with `--transition-fast`
6. Test in both light and dark themes

## Testing Authentication Flow

When testing auth features:
- Check localStorage for `token` and `user` keys
- Verify token format (3 parts separated by dots)
- Token expiration checked with 5-minute buffer
- Cross-tab logout should work via storage events
- 401/403 responses trigger automatic logout

## Docker Deployment

**Build:**
```bash
npm run build:docker
docker build -t jerky-vault .
```

**Run:**
```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://backend:8080/api \
  -e NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000 \
  jerky-vault
```

**Configuration:**
- Uses standalone output for minimal container
- Environment validation skipped in Docker
- Custom server.js handles SSR with env injection

**Docker Compose:**
```bash
# Build and start frontend
docker-compose up -d --build jerky_vault_frontend

# Rebuild after changes
docker-compose up -d --build jerky_vault_frontend
```
