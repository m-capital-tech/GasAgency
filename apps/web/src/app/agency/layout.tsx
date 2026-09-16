"use client";
import { BadgeIndianRupee, Boxes, CreditCard, LayoutDashboard, MapPinned, MessageSquareWarning, Package, Settings, Users, UsersRound } from "lucide-react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Shell, type NavItem } from "@/components/shell/Shell";
import { useLiveSync, useOrders } from "@/features/hooks";
import { useSession } from "@/lib/session";
import { playNewOrderChime } from "@/lib/sound";

function AgencyShell({ children }: { children: React.ReactNode }) {
  const agency = useSession((s) => s.agency);
  const orders = useOrders();
  const pending = (orders.data ?? []).filter((b) => b.status === "PLACED").length;
  useLiveSync((e) => {
    if (!agency) return;
    if (e.type === "booking.created" && e.booking.agencyId === agency.id) {
      playNewOrderChime();
      toast(`New order ${e.booking.code}`, { description: `${e.booking.items.reduce((s, i) => s + i.qty, 0)} cylinder(s) · ${e.booking.slot === "express" ? "⚡ Express" : "Standard"} · ${e.booking.payment.method === "cod" ? "COD" : "Prepaid"}`, action: { label: "Open board", onClick: () => (window.location.href = "/agency/orders") } });
    }
    if (e.type === "booking.updated" && e.booking.agencyId === agency.id && e.booking.status === "DELIVERY_FAILED") toast.error(`Delivery failed · ${e.booking.code}`, { description: "Back in your queue for rescheduling." });
    if (e.type === "booking.updated" && e.booking.agencyId === agency.id && e.booking.status === "DELIVERED") toast.success(`Delivered · ${e.booking.code}`);
    if (e.type === "notification" && e.notification.userId === agency.ownerUserId && e.notification.type === "system") toast.info(e.notification.title, { description: e.notification.body });
  });
  const nav: NavItem[] = [
    { href: "/agency", label: "Dashboard", icon: LayoutDashboard },
    { href: "/agency/orders", label: "Orders", icon: Package, badge: pending },
    { href: "/agency/tracking", label: "Live tracking", icon: MapPinned },
    { href: "/agency/staff", label: "Delivery staff", icon: UsersRound },
    { href: "/agency/customers", label: "Customers", icon: Users },
    { href: "/agency/inventory", label: "Inventory", icon: Boxes },
    { href: "/agency/payments", label: "Payments", icon: BadgeIndianRupee },
    { href: "/agency/complaints", label: "Complaints", icon: MessageSquareWarning },
    { href: "/agency/subscription", label: "Subscription", icon: CreditCard },
    { href: "/agency/settings", label: "Pricing & settings", icon: Settings },
  ];
  return (
    <Shell nav={nav} title={agency?.name ?? "Agency LMS"} mode="agency">
      {children}
    </Shell>
  );
}

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/agency/register") return <>{children}</>;
  return <AgencyShell>{children}</AgencyShell>;
}
