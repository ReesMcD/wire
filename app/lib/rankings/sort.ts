import type { Row, Table } from '@tanstack/react-table'

/**
 * Same ordering TanStack applies after `sortingFn`: desc flip, then
 * `invertSorting` (see table-core getSortedRowModel).
 */
function sortDirectionMultiplier<TData>(row: Row<TData>, columnId: string): number {
  const table = row.getAllCells()[0]?.getContext().table as Table<TData> | undefined
  if (!table) return 1
  const sortEntry = table.getState().sorting.find((s) => s.id === columnId)
  const isDesc = sortEntry?.desc ?? false
  const invert = table.getColumn(columnId)?.columnDef.invertSorting ?? false
  return (isDesc ? -1 : 1) * (invert ? -1 : 1)
}

/**
 * Generic sortingFn that always pushes null/undefined values to the bottom,
 * regardless of asc/desc or `invertSorting`. TanStack expects an ascending
 * comparison then multiplies by -1 when `desc`; a fixed +1/-1 for nulls would
 * flip to the top when descending unless we align with that multiplier.
 * TanStack's `sortUndefined: 'last'` only handles `undefined`; many accessors
 * return `null`.
 *
 * Typed with a generic parameter (rather than `SortingFn<unknown>`) so it can
 * be assigned to any column's `sortingFn` without forcing the table's row
 * type to unify with `unknown`.
 */
export function sortNullsLast<TData>(a: Row<TData>, b: Row<TData>, columnId: string): number {
  const av = a.getValue<unknown>(columnId)
  const bv = b.getValue<unknown>(columnId)
  const an = av == null
  const bn = bv == null
  const m = sortDirectionMultiplier(a, columnId)
  if (an && bn) return 0
  if (an) return m
  if (bn) return -m
  if (typeof av === 'number' && typeof bv === 'number') {
    if (av === bv) return 0
    return av < bv ? -1 : 1
  }
  return String(av).localeCompare(String(bv))
}
