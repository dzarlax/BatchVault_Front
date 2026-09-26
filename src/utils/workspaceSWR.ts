import fetcher from './fetcher';

export type WorkspaceSWRKey = [string, string];

export const workspaceKey = (
  endpoint: string,
  workspaceId?: string | null,
  enabled = true
): WorkspaceSWRKey | null => {
  if (!enabled || !workspaceId) return null;
  return [endpoint, workspaceId];
};

export const workspaceFetcher = ([endpoint, workspaceId]: WorkspaceSWRKey) => fetcher(endpoint, {
  headers: { 'X-Workspace-ID': workspaceId },
});
