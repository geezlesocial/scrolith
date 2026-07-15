/**
 * Domain ingest adapters — reserved for later phases.
 * Phase 10.2: no adapters registered; producers unchanged.
 */

export type NotificationIngestAdapter = {
  name: string;
};

const registry: NotificationIngestAdapter[] = [];

export const listNotificationIngestAdapters = () => [...registry];
