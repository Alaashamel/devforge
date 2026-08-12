export function isUniqueViolation(err) {
  return err?.code === '23505';
}

export function isForeignKeyViolation(err) {
  return err?.code === '23503';
}
