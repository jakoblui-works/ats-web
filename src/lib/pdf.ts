/**
 * Whether a file starts with `%PDF-`. Rejects if the file can't be read (a folder, or a file that
 * was moved after it was picked), which callers treat as "can't tell".
 */
export const looksLikePdf = async (file: Blob): Promise<boolean> =>
  (await file.slice(0, 5).text()) === "%PDF-";
