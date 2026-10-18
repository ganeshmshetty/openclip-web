const REPO = 'ganeshmshetty/openclip';
const GITHUB_RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const FALLBACK_RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

let cachedDmgUrl: string | null = null;
let fetchPromise: Promise<string> | null = null;

/**
 * Resolves the latest DMG release asset URL directly from GitHub API
 * in the client's browser (consuming the visitor's IP rate limit).
 */
export async function getLatestDmgUrl(): Promise<string> {
  if (cachedDmgUrl) {
    return cachedDmgUrl;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  const promise: Promise<string> = (async (): Promise<string> => {
    try {
      const res = await fetch(GITHUB_RELEASE_API_URL, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const dmgAsset = data.assets?.find((a: { name: string; browser_download_url: string }) =>
          a.name.endsWith('.dmg')
        );
        if (dmgAsset?.browser_download_url) {
          const url: string = dmgAsset.browser_download_url;
          cachedDmgUrl = url;
          return url;
        }
      }
    } catch (err) {
      console.error('Failed to resolve latest release DMG from client:', err);
    } finally {
      fetchPromise = null;
    }

    return FALLBACK_RELEASES_URL;
  })();

  fetchPromise = promise;
  return promise;
}

/**
 * Triggers the DMG download in the user's browser via /download.
 */
export async function downloadLatestDmg() {
  window.location.href = '/download';
}
