import { useCallback } from 'react';
import { useI18n } from './I18nProvider';

export const useT = () => {
  const { t } = useI18n();

  const translate = useCallback(
    (key: string, fallback?: string, params?: Record<string, string | number>) =>
      t(key, fallback, params),
    [t]
  );

  return translate;
};

