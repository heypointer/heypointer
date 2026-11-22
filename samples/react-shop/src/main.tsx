import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(<App />);

// Author mode (record steps): test-only. It needs this env flag AND ?heypointer-author=1; a production build has neither.
if (import.meta.env.VITE_HEYPOINTER_ALLOW_AUTHOR && new URLSearchParams(location.search).has('heypointer-author')) {
  void import('@heypointerhq/sdk/author').then((m) => m.startAuthoring());
}
