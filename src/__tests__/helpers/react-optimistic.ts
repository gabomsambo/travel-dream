/**
 * React 18.3, which Jest loads, does not export `useOptimistic`. Next's
 * compiled runtime does, and the duplicates page already calls it. Patch the
 * CJS export before a test renders that page.
 */
const react = require('react') as { useOptimistic?: (state: unknown) => [unknown, () => void] };

if (typeof react.useOptimistic !== 'function') {
  react.useOptimistic = (state: unknown) => [state, () => undefined];
}

export {};
