import { createIcoreApi } from '@icore/template-shared';

let onUnauthorized = () => {
  window.location.assign('/login');
};

export function setApiUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export const api = createIcoreApi({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api',
  onUnauthorized: () => onUnauthorized(),
});
