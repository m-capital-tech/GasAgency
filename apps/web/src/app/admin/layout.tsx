"use client";
import { BadgeCheck, Building2, LayoutDashboard, MessageSquareWarning, SlidersHorizontal, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shell, type NavItem } from "@/components/shell/Shell";
import { q, useLiveSync } from "@/features/hooks";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const agencies = useQuery(q.adminAgencies());
  const pending = (agencies.data ?? []).filter((a: any) => a.status === "pending").length;
  const businesses = useQuery(q.adminBusinesses(""));
  const bizQueue = (businesses.data ?? []).filter((b) => b.status === "pending" || b.credit.status === "requested").length;
  useLiveSync((e) => {
    if (e.type === "notification" && e.notification.userId === "usr_admin") toast.info(e.notification.title, { description: e.notification.body });
  });
  const nav: NavItem[] = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/approvals", label: "Agency approvals", icon: BadgeCheck, badge: pending },
    { href: "/admin/agencies", label: "Agencies", icon: Building2 },
    { href: "/admin/businesses", label: "Businesses", icon: Users, badge: bizQueue },
    { href: "/admin/disputes", label: "Disputes", icon: MessageSquareWarning },
    { href: "/admin/config", label: "Config", icon: SlidersHorizontal },
  ];
  return (
    <Shell nav={nav} title="Platform admin" mode="admin">
      {children}
    </Shell>
  );
}
