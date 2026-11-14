/** Postgres benzersizlik ihlali (23505): aynı adisyona ikinci kazanım/harcama satırı. */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
