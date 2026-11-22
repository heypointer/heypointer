// The npm (ESM) build loads author mode as a separate chunk. The script-tag build aliases this file to author-import.iife.ts.
export const importAuthor = () => import('./author/index');
