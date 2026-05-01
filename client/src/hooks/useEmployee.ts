import { trpc } from "@/lib/trpc";

export function useEmployee() {
  const { data: employee, isLoading, refetch } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    employee: employee ?? null,
    isLoading,
    isAuthenticated: !!employee,
    isManager: employee?.role === "manager" || employee?.role === "admin" || employee?.role === "super_admin",
    isAdmin: employee?.role === "admin" || employee?.role === "super_admin",
    isSuperAdmin: employee?.role === "super_admin",
    refetch,
  };
}
