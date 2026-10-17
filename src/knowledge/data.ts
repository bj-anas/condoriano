/** Every knowledge-base markdown file, bundled as text. Kept in its own chunk (see index.ts). */
export const files = import.meta.glob('/knowledge-base/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
