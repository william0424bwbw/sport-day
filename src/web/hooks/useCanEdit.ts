import { useSession } from '../stores/session';

/** 可以修改賽程：管理者視角，且管理者密碼已通過驗證 */
export function useCanEdit(): boolean {
  return useSession((s) => s.role === 'admin' && s.sync.adminVerified);
}
