"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout, type User } from "@/lib/api";
import { cn, normalizeRole } from "@/lib/utils";
import {
  Building2,
  Users,
  Globe,
  BarChart3,
  MonitorDot,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  user: User;
}

const NAV_ITEMS = [
  { href: "/orgs", label: "Organizations", icon: Building2, roles: ["global_admin"] },
  { href: "/users", label: "Users", icon: Users, roles: ["global_admin", "org_admin"] },
  { href: "/apis", label: "APIs", icon: Globe, roles: ["global_admin", "org_admin", "user"] },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["global_admin", "org_admin", "user"] },
  { href: "/sessions", label: "Sessions", icon: MonitorDot, roles: ["global_admin", "org_admin"] },
];

export default function Sidebar({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const role = normalizeRole(user.role ?? user.role_name ?? "");

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      {/* Brand */}
      <div className="border-b border-border px-4 py-4">
        <span className="text-base font-bold text-primary tracking-tight">API Manager</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-border p-3 space-y-2">
        <div className="px-3 py-1">
          <p className="text-xs text-muted-foreground truncate">{user.username}</p>
          <p className="text-xs text-primary/70 capitalize">{role.replace(/_/g, " ")}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
