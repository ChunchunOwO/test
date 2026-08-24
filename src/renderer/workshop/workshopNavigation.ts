export type WorkshopPane = 'discover' | 'installed';

const pendingWorkshopPaneStorageKey = 'echo.workshop.pending-pane';

const isWorkshopPane = (value: string | null): value is WorkshopPane =>
  value === 'discover' || value === 'installed';

export const navigateToWorkshopPane = (pane: WorkshopPane): void => {
  try {
    window.sessionStorage.setItem(pendingWorkshopPaneStorageKey, pane);
  } catch {
    // Navigation still works when sessionStorage is unavailable.
  }
  window.dispatchEvent(new CustomEvent('app:navigate:route', { detail: 'workshop' }));
};

export const consumePendingWorkshopPane = (): WorkshopPane | null => {
  try {
    const pane = window.sessionStorage.getItem(pendingWorkshopPaneStorageKey);
    window.sessionStorage.removeItem(pendingWorkshopPaneStorageKey);
    return isWorkshopPane(pane) ? pane : null;
  } catch {
    return null;
  }
};
