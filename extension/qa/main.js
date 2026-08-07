import { readState } from './bridge.js';

export const start = () => {
  readState().then((state) => console.log('[task-tabs] qa state:', state));
};
