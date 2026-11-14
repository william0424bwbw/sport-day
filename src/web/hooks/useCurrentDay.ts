import type { Day } from '@shared/types';
import { useProject } from '../stores/project';
import { useSession } from '../stores/session';

/** 目前選取的比賽日（沒有選取時用第一天） */
export function useCurrentDay(): Day | null {
  const dates = useProject((s) => s.dates);
  const currentDayId = useSession((s) => s.currentDayId);
  return dates.find((d) => d.id === currentDayId) ?? dates[0] ?? null;
}
