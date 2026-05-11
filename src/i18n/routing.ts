import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // Supported locales
  locales: ['en', 'vi'],

  // Default locale (used when no locale matches)
  defaultLocale: 'en',

  // Always show locale prefix in URL (/en/dashboard, /vi/dashboard)
  // Set 'as-needed' nếu muốn default locale không prefix
  localePrefix: 'always'
});
