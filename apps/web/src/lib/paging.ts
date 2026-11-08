/** A ?page= value as a page number (1-9999), or 0 when it isn't one (the page then 404s). */
export function pageNumber(param: string | null): number {
  const value = param ?? '1';
  return /^[1-9][0-9]{0,3}$/.test(value) ? Number(value) : 0;
}

/** One page of a list, plus how many pages there are (at least 1, so empty lists still render). */
export function paginate<T>(items: readonly T[], page: number, perPage: number) {
  return {
    items: items.slice((page - 1) * perPage, page * perPage),
    pages: Math.max(1, Math.ceil(items.length / perPage)),
  };
}
