"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Building2, CircleDollarSign, LayoutDashboard, LogOut, Menu, PackageCheck, RefreshCw, Users, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Composable header / content / footer structure follows shadcn's Sidebar pattern.
export function DashboardShell({ title, section, navigation, context, username, role, onRefresh, onSignOut, refreshing, children }: {
  title: string; section: string; navigation: ReactNode; context?: ReactNode;
  username?: string; role?: string; onRefresh: () => void; onSignOut: () => void;
  refreshing?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const sidebar = <>
    <div className="flex h-20 shrink-0 items-center gap-3 border-b px-5"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white"><Building2 className="size-5" /></span><div><p className="text-sm font-semibold tracking-tight">Munna Gas Connect</p><p className="text-xs text-muted-foreground">{title}</p></div></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-3"><p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Workspace</p><nav aria-label={`${title} navigation`} className="dashboard-navigation grid gap-1" onClick={(event) => { if ((event.target as HTMLElement).closest("a,button")) setOpen(false); }}>{navigation}</nav>{context ? <div className="mt-6 border-t px-2 pt-4 text-xs text-muted-foreground">{context}</div> : null}</div>
    <div className="shrink-0 border-t p-3" data-slot="sidebar-footer"><div className="mb-3 flex min-w-0 items-center gap-3 px-2 py-2"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold" aria-hidden="true">{(username || "User").split(/\s+/).slice(0,2).map(word => word[0]).join("")}</span><div className="min-w-0"><p className="truncate text-sm font-medium" title={username}>{username || "Signed in"}</p><p className="truncate text-xs capitalize text-muted-foreground" title={role}>{role?.replaceAll("_", " ") || title}</p></div></div><div className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" loading={refreshing} onClick={onRefresh}><RefreshCw />Refresh</Button><Button variant="ghost" size="sm" onClick={onSignOut}><LogOut />Sign out</Button></div></div>
  </>;
  return <div className="min-h-screen bg-background text-foreground"><aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">{sidebar}</aside><div className="min-w-0 lg:pl-64"><header className="flex h-16 items-center gap-3 border-b px-5 lg:px-8"><Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation"><Menu /></Button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" /><Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[90vw] flex-col bg-sidebar shadow-xl" aria-describedby={undefined}><Dialog.Title className="sr-only">{title} navigation</Dialog.Title><Dialog.Close className="absolute right-2 top-2 rounded p-1 hover:bg-muted" aria-label="Close navigation"><X className="size-4" /></Dialog.Close>{sidebar}</Dialog.Content></Dialog.Portal></Dialog.Root><span className="hidden text-sm text-muted-foreground sm:inline">{title}</span><span className="hidden text-border sm:inline">/</span><h1 className="text-sm font-medium">{section}</h1></header><main className="min-w-0">{children}</main></div></div>;
}

export function OperationsNavigation({ owner }: { owner?: boolean }) {
  const pathname = usePathname();
  const items = [{ href: "/operations/dashboard", label: "Overview", icon: LayoutDashboard }, { href: "/operations/orders", label: "Orders", icon: PackageCheck }, { href: "/operations/accounts", label: "Accounts & collections", icon: WalletCards }, ...(owner ? [{ href: "/operations/dashboard#cylinder-prices", label: "Cylinder prices", icon: CircleDollarSign }, { href: "/operations/administration", label: "Agency administration", icon: Users }] : [])];
  return items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", pathname === href && "bg-primary-soft text-primary")}><Icon className="size-4 shrink-0" />{label}</Link>);
}
