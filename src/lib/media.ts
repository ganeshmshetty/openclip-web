/** Public base for clips hosted on R2. Site clips sit at the root, extension demos in `extensions/`. */
export const MEDIA_BASE = 'https://assets.getopenclip.app';

export function mediaURL(path: string): string {
  return `${MEDIA_BASE}/${path.replace(/^\/+/, '')}`;
}
