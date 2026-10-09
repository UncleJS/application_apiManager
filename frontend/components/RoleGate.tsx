"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { normalizeRole } from "@/lib/utils";

export default function RoleGate({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuth();
  const role = normalizeRole(user?.role ?? user?.role_name ?? "");
  if (!roles.includes(role)) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Forbidden</h1>
        <p className="text-sm text-foreground/70">You do not have access to this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
