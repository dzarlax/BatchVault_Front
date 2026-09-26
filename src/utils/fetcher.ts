import { getApiUrl } from './runtimeConfig';

// Global auth handler for automatic logout on auth errors
let authErrorHandler: (() => void) | null = null;

export const setAuthErrorHandler = (handler: () => void) => {
  authErrorHandler = handler;
};

// Enhanced error class with structured error support
class FetchError extends Error {
  status: number;
  field?: string;
  value?: string;
  existing_id?: number;
  workspace_linked?: boolean;
  workspace_ingredient_id?: number;
  workspace_ingredient?: any;
  
  constructor(message: string, status: number, errorData?: any) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    
    // Include structured error data if available
    if (errorData) {
      this.field = errorData.field;
      this.value = errorData.value;
      this.existing_id = errorData.existing_id;
      this.workspace_linked = errorData.workspace_linked;
      this.workspace_ingredient_id = errorData.workspace_ingredient_id;
      this.workspace_ingredient = errorData.workspace_ingredient;
    }
  }
}

const shouldSendWorkspaceHeader = (endpoint: string) => {
  return endpoint !== '/api/workspaces' && !endpoint.startsWith('/api/auth/');
};

const getCurrentUserId = () => {
  if (typeof window === 'undefined') return null;
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const userId = user?.id || user?.userID || user?.userId;
    if (userId) return String(userId);
  } catch {
    // Fall back to the token when persisted user data is unavailable.
  }

  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    const userId = payload.userID || payload.userId || payload.sub;
    return userId ? String(userId) : null;
  } catch {
    return null;
  }
};

const getValidatedWorkspaceId = (endpoint: string) => {
  if (typeof window === 'undefined' || !shouldSendWorkspaceHeader(endpoint)) {
    return null;
  }

  const validatedUserId = sessionStorage.getItem('workspace:validated-user-id');
  if (!validatedUserId || validatedUserId !== getCurrentUserId()) return null;

  return localStorage.getItem(`workspace:selected:${validatedUserId}`);
};

export default async function fetcher(endpoint, options: any = {}) {
  const baseUrl = getApiUrl();

  const url = `${baseUrl}${endpoint}`;
  
  // Get token if we're on the client side
  let token = null;
  if (typeof window !== 'undefined') {
      token = localStorage.getItem('token');
  }

  const workspaceId = getValidatedWorkspaceId(endpoint);
  const callerHeaders = options.headers || {};
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...(workspaceId && { 'X-Workspace-ID': workspaceId }),
    ...callerHeaders,
  };
  const { headers: _ignoredHeaders, ignoreForbiddenAuthError = false, ...requestOptions } = options;

  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...requestOptions,
      headers,
    });

    // Handle authentication errors
    if (response.status === 401 || (response.status === 403 && !ignoreForbiddenAuthError)) {
      console.warn('Authentication failed, token may be expired or invalid');
      
      // Clear localStorage and call auth error handler if available
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
      
      // Call the global auth error handler to logout user
      if (authErrorHandler) {
        authErrorHandler();
      }
      
      throw new FetchError('Authentication failed', response.status);
    }

    if (!response.ok) {
      let errorData = null;
      let errorMessage = `Failed to fetch: ${response.status} ${response.statusText}`;
      
      try {
        // Try to parse JSON error response
        const errorText = await response.text();
        if (errorText) {
          try {
            errorData = JSON.parse(errorText);
            // Use server error message if available
            if (errorData.error) {
              errorMessage = errorData.error;
            }
          } catch (parseError) {
            // If JSON parsing fails, use the text as is
            errorMessage = errorText;
          }
        }
      } catch (textError) {
        console.warn('Failed to read error response text:', textError);
      }
      
      console.error('Fetch Error:', {
        status: response.status,
        statusText: response.statusText,
        errorData: errorData,
      });
      
      throw new FetchError(errorMessage, response.status, errorData);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    // If it's already a FetchError, rethrow as is
    if (error instanceof FetchError) {
      throw error;
    }
    
    console.error('Fetch request failed:', error);
    throw error;
  }
}
