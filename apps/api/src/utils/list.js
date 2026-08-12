export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function parsePagination({ page, pageSize } = {}) {
  const parsedPage = Number.parseInt(page, 10);
  const parsedSize = Number.parseInt(pageSize, 10);
  const p = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE;
  const ps = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : DEFAULT_PAGE_SIZE;
  return { page: p, pageSize: Math.min(ps, MAX_PAGE_SIZE), limit: Math.min(ps, MAX_PAGE_SIZE), offset: (p - 1) * Math.min(ps, MAX_PAGE_SIZE) };
}

// Parses a `?sort=` value like `-created_at` (desc) or `title` (asc) against a
// whitelist of column names. Returns `ORDER BY ...` SQL or the default.
export function buildOrder(sort, allowedColumns, defaultOrder = 'created_at DESC') {
  if (!sort || sort === '-created_at') {
    return `ORDER BY ${defaultOrder}`;
  }
  const descending = sort.startsWith('-');
  const column = descending ? sort.slice(1) : sort;
  if (!allowedColumns.includes(column)) {
    return `ORDER BY ${defaultOrder}`;
  }
  return `ORDER BY ${column} ${descending ? 'DESC' : 'ASC'}`;
}

// Builds a weighted ILIKE search clause across searchable columns. `q` is
// escaped so user input cannot break out of the literal.
export function buildSearchClause(q, searchable) {
  if (!q || searchable.length === 0) {
    return { sql: '', params: [] };
  }
  const escaped = String(q).replace(/[\\%_]/g, (ch) => `\\${ch}`);
  const like = `%${escaped}%`;
  const clause = searchable.map((col) => `${col} ILIKE $1`).join(' OR ');
  return { sql: `(${clause})`, params: [like] };
}

// Runs a COUNT + SELECT pair for a list endpoint and returns
// `{ data, meta: { page, pageSize, total, totalPages } }`.
// `baseFrom` is the FROM + JOIN part; `where` is the full WHERE clause
// (may be empty); `orderBy` must be a fully-formed `ORDER BY ...` string.
// When `baseFrom` multiplies rows (joins), pass `countDistinct` (e.g. `p.id`)
// so totals stay correct, and `groupBy` so the data query's aggregates group.
export async function paginate(pool, { baseFrom, where = '', params = [], orderBy, select, groupBy = '', countDistinct, page, pageSize }) {
  const whereSql = where ? `WHERE ${where}` : '';
  const countExpr = countDistinct ? `count(DISTINCT ${countDistinct})::int AS total` : 'count(*)::int AS total';
  const { rows: countRows } = await pool.query(
    `SELECT ${countExpr} FROM ${baseFrom} ${whereSql}`,
    params,
  );
  const total = countRows[0].total;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const { rows } = await pool.query(
    `${select} FROM ${baseFrom} ${whereSql} ${groupBy} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { data: rows, meta: { page, pageSize, total, totalPages } };
}
