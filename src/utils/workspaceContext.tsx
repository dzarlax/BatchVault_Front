import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import fetcher from './fetcher';
import { useAuth } from './authContext';
import { Workspace } from '../types/api';

interface WorkspaceContextType {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  selectedWorkspace: Workspace | null;
  selectedCurrency: string | null;
  isWorkspaceReady: boolean;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
  updateSelectedWorkspace: (workspace: Workspace) => void;
}

const defaultWorkspaceContext: WorkspaceContextType = {
  workspaces: [],
  selectedWorkspaceId: null,
  selectedWorkspace: null,
  selectedCurrency: null,
  isWorkspaceReady: false,
  setSelectedWorkspaceId: () => {},
  refreshWorkspaces: async () => {},
  updateSelectedWorkspace: () => {},
};

const WorkspaceContext = createContext<WorkspaceContextType>(defaultWorkspaceContext);

export const useWorkspace = () => useContext(WorkspaceContext);

const selectedWorkspaceKey = (userId: string | number) => `workspace:selected:${userId}`;

const getUserIdFromToken = (token?: string | null) => {
  if (!token || typeof window === 'undefined') return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''));
    return payload.userID || payload.userId || payload.sub || null;
  } catch {
    return null;
  }
};

const markWorkspaceValidated = (userId: string | number) => {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('workspace:validated-user-id', String(userId));
  }
};

const clearWorkspaceValidation = () => {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('workspace:validated-user-id');
  }
};

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { auth } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceIdState] = useState<string | null>(null);
  const [isWorkspaceReady, setIsWorkspaceReady] = useState(false);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const [readyForUserId, setReadyForUserId] = useState<string | null>(null);
  const requestVersion = React.useRef(0);

  const userIdValue = auth.user?.id || auth.user?.userID || getUserIdFromToken(auth.token);
  const userId = userIdValue ? String(userIdValue) : null;
  const userIdRef = React.useRef(userId);
  userIdRef.current = userId;

  const applyValidatedWorkspace = useCallback((availableWorkspaces: Workspace[]) => {
    if (!userId || typeof window === 'undefined') return;

    const storedWorkspaceId = localStorage.getItem(selectedWorkspaceKey(userId));
    const selectedWorkspace = availableWorkspaces.find((workspace) => String(workspace.id) === storedWorkspaceId)
      || availableWorkspaces[0]
      || null;

    if (selectedWorkspace) {
      const workspaceId = String(selectedWorkspace.id);
      localStorage.setItem(selectedWorkspaceKey(userId), workspaceId);
      setSelectedWorkspaceIdState(workspaceId);
      markWorkspaceValidated(userId);
    } else {
      localStorage.removeItem(selectedWorkspaceKey(userId));
      setSelectedWorkspaceIdState(null);
      clearWorkspaceValidation();
    }
  }, [userId]);

  const refreshWorkspaces = useCallback(async () => {
    const requestId = ++requestVersion.current;
    if (!auth.isAuthenticated || !userId) {
      setWorkspaces([]);
      setSelectedWorkspaceIdState(null);
      setIsWorkspaceReady(false);
      setLoadedForUserId(null);
      setReadyForUserId(null);
      clearWorkspaceValidation();
      return;
    }

    const availableWorkspaces = await fetcher('/api/workspaces');
    if (requestId !== requestVersion.current || userIdRef.current !== userId) return;
    const nextWorkspaces: Workspace[] = availableWorkspaces || [];
    setWorkspaces((current) => nextWorkspaces.map((workspace) => {
      const previousWorkspaces = loadedForUserId === userId ? current : [];
      const old = previousWorkspaces.find((item) => String(item.id) === String(workspace.id));
      return workspace.currency ? workspace : { ...workspace, currency: old?.currency };
    }));
    setLoadedForUserId(userId);
    applyValidatedWorkspace(nextWorkspaces);
    const storedId = typeof window !== 'undefined' ? localStorage.getItem(selectedWorkspaceKey(userId)) : null;
    if (storedId) {
      try {
        const currentWorkspace = await fetcher('/api/workspaces/current');
        if (requestId === requestVersion.current && userIdRef.current === userId && String(currentWorkspace?.id) === storedId) {
          setWorkspaces((current) => current.map((workspace) => String(workspace.id) === storedId
            ? { ...workspace, ...currentWorkspace }
            : workspace));
        }
      } catch {
        // Older backend compatibility: currency is resolved by the RSD display fallback.
      }
    }
    if (requestId === requestVersion.current && userIdRef.current === userId) {
      setReadyForUserId(userId);
      setIsWorkspaceReady(true);
    }
  }, [applyValidatedWorkspace, auth.isAuthenticated, userId]);

  useEffect(() => {
    refreshWorkspaces().catch(() => {
      // Keep the last known workspace visible after transient refresh failures.
      if (userIdRef.current === userId) setIsWorkspaceReady(true);
    });
  }, [refreshWorkspaces, userId]);

  const setSelectedWorkspaceId = useCallback((workspaceId: string) => {
    if (!auth.isAuthenticated || !userId || loadedForUserId !== userId) return;

    const workspaceExists = workspaces.some((workspace) => String(workspace.id) === workspaceId);
    if (!workspaceExists) return;

    requestVersion.current += 1;

    localStorage.setItem(selectedWorkspaceKey(userId), workspaceId);
    setSelectedWorkspaceIdState(workspaceId);
    markWorkspaceValidated(userId);
    void refreshWorkspaces().catch(() => {
      if (userIdRef.current === userId) {
        setReadyForUserId(userId);
        setIsWorkspaceReady(true);
      }
    });
  }, [auth.isAuthenticated, userId, loadedForUserId, workspaces, refreshWorkspaces]);

  const accountDataReady = auth.isAuthenticated && Boolean(userId) && loadedForUserId === userId;
  const visibleWorkspaces = accountDataReady ? workspaces : [];
  const visibleSelectedWorkspaceId = accountDataReady ? selectedWorkspaceId : null;
  const visibleWorkspaceReady = accountDataReady && isWorkspaceReady && readyForUserId === userId;
  const selectedWorkspace = useMemo(
    () => accountDataReady ? workspaces.find((workspace) => String(workspace.id) === selectedWorkspaceId) || null : null,
    [accountDataReady, selectedWorkspaceId, workspaces]
  );

  const updateSelectedWorkspace = useCallback((workspace: Workspace) => {
    // A refresh started before this mutation may contain the old currency.
    requestVersion.current += 1;
    setWorkspaces((current) => current.map((item) => String(item.id) === String(workspace.id)
      ? { ...item, ...workspace }
      : item));
  }, []);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const refresh = () => { void refreshWorkspaces().catch(() => {}); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [auth.isAuthenticated, refreshWorkspaces]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces: visibleWorkspaces,
        selectedWorkspaceId: visibleSelectedWorkspaceId,
        selectedWorkspace,
        selectedCurrency: visibleWorkspaceReady && selectedWorkspace ? (selectedWorkspace.currency || 'RSD') : null,
        isWorkspaceReady: visibleWorkspaceReady,
        setSelectedWorkspaceId,
        refreshWorkspaces,
        updateSelectedWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};
