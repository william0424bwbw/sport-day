// I5：篩選列（年級晶片、場地、人員搜尋），讀寫 useSession().filter
export interface FilterBarProps {
  /** horizontal：電腦版單列；stacked：手機篩選面板 */
  layout?: 'horizontal' | 'stacked';
}

export function FilterBar(_props: FilterBarProps) {
  return null;
}
