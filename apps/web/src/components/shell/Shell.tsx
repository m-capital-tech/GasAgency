"use client";
import type { LucideIcon } from "lucide-react";
import { Bell, Flame, LogOut, Moon, Sun, Wifi, WifiOff } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui";
import { q } from "@/features/hooks";
import { post } from "@/lib/api";
import { useLiveStatus } from "@/lib/live";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { DemoControls } from "./DemoControls";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export function Shell({ nav, title, children, mode }: { nav: NavItem[]; title: string; children: React.ReactNode; mode: "agency" | "admin" }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, agency, logout } = useSession();
  const { theme, setTheme } = useTheme();
  const live = useLiveStatus();
  const qc = useQueryClient();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wrongRole = !!user && (mode === "agency" ? !agency : user.role !== "admin");
  useEffect(() => {
    if (mounted && (!user || wrongRole)) router.replace(`/login?as=${mode}`);
  }, [mounted, user, wrongRole, router, mode]);
  const notifications = useQuery({ ...q.notifications(user?.id ?? ""), refetchInterval: 20000 });
  const unread = (notifications.data ?? []).filter((n: any) => !n.read).length;
  if (!mounted || !user || wrongRole) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
            <Flame className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold">GasSetu</p>
            <p className="text-[11px] text-muted-foreground">{title}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((n) => {
            const active = n.href === `/${mode}` ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors", active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <n.icon className="size-4" />
                <span className="flex-1">{n.label}</span>
                {n.badge ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">{n.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center gap-2 rounded-xl px-2 py-1.5">
            <Avatar name={user.name} color={user.avatarColor} size={30} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{agency?.name ?? "Platform admin"}</p>
            </div>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
          <div className="md:hidden flex items-center gap-2">
            <Flame className="size-4 text-primary" />
            <span className="text-sm font-bold">GasSetu</span>
          </div>
          <nav className="md:hidden flex gap-1 overflow-x-auto">
            {nav.slice(0, 5).map((n) => (
              <Link key={n.href} href={n.href} className={cn("rounded-lg px-2 py-1 text-xs whitespace-nowrap", pathname === n.href ? "bg-primary-soft text-primary" : "text-muted-foreground")}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex-1" />
          <span className={cn("hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex", live === "open" ? "bg-success-soft text-success" : "bg-warning-soft text-[#9a6b00]")} title="WebSocket to the mock API">
            {live === "open" ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {live === "open" ? "Live" : "Reconnecting"}
          </span>
          <DemoControls />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Notifications, ${unread} unread`} className="relative">
                <Bell />
                {unread ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-background" /> : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 p-0">
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-sm font-semibold">Notifications</p>
                <button
                  className="text-xs text-primary"
                  onClick={async () => {
                    await post(`/users/${user.id}/notifications/read`);
                    qc.invalidateQueries({ queryKey: ["notifications"] });
                  }}
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto border-t">
                {(notifications.data ?? []).length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">No notifications yet</p>
                ) : (
                  (notifications.data ?? []).slice(0, 15).map((n: any) => (
                    <div key={n.id} className={cn("border-b px-3 py-2 last:border-0", !n.read && "bg-primary-soft/40")}>
                      <div className="flex justify-between gap-2">
                        <p className="text-xs font-semibold">{n.title}</p>
                        <span className="text-[10px] text-faint">{relativeTime(n.createdAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{n.body}</p>
                    </div>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full" aria-label="Account menu">
                <Avatar name={user.name} color={user.avatarColor} size={32} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="px-2 py-1.5">
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push(mode === "agency" ? "/login?as=admin" : "/login?as=agency")}>Switch to {mode === "agency" ? "Admin" : "Agency"}</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  logout();
                  router.replace("/");
                }}
              >
                <LogOut /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export { Badge };
