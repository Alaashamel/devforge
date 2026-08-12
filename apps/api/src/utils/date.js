// Formats a `date` column value returned by pg (a Date at local midnight) back
// to a plain `YYYY-MM-DD` string so API responses stay timezone-independent.
export function formatDate(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
