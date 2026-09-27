import { fetchWithRetry } from '../utils/http-fetch.ts';

export function fetchPageWithRetry(url: string) {
  return fetchWithRetry(url, {
    validateContentType(contentType) {
      if (
        contentType &&
        !/text\/html|application\/xhtml\+xml/i.test(contentType)
      ) {
        throw new Error(`Expected an HTML response, received ${contentType}`);
      }
    },
  });
}
