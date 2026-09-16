"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Map } from "@/components/map/Map";
import { PageHeader } from "@/components/shell/Shell";
import { Button, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, ErrorState, Field, Input, Switch, TBody, THead, Table, Tr } from "@/components/ui";
import { q, useAgencyId, get, patch, put } from "@/features/hooks";
import { useSession } from "@/lib/session";

/** A9 — Pricing & settings */
export default function SettingsPage() {
  const agencyId = useAgencyId();
  const qc = useQueryClient();
  const agency = useQuery(q.agency(agencyId));
  const prices = useQuery(q.prices(agencyId));
  const types = useQuery({ queryKey: ["cylinder-types"], queryFn: () => get("/cylinder-types") });
  const login = useSession((s) => s.login);
  const user = useSession((s) => s.user);
  const [rows, setRows] = useState<{ cylinderTypeId: string; price: number; deliveryCharge: number }[]>([]);
  const [settings, setSettings] = useState<{ codEnabled: boolean; phone: string; pincodes: string; radiusKm: number; slots: { id: string; label: string; capacity: number }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (prices.data) setRows(prices.data.map((p: any) => ({ cylinderTypeId: p.cylinderTypeId, price: p.price, deliveryCharge: p.deliveryCharge })));
  }, [prices.data]);
  useEffect(() => {
    if (agency.data && !settings) setSettings({ codEnabled: agency.data.codEnabled, phone: agency.data.phone, pincodes: agency.data.serviceArea.pincodes.join(", "), radiusKm: agency.data.serviceArea.radiusKm, slots: agency.data.slots });
  }, [agency.data, settings]);

  const savePrices = async () => {
    setBusy(true);
    try {
      await put(`/agency/${agencyId}/prices`, { rows });
      qc.invalidateQueries({ queryKey: ["prices"] });
      toast.success("Prices updated", { description: "Customers now see the new prices when booking." });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveSettings = async () => {
    if (!settings || !agency.data) return;
    setBusy(true);
    try {
      const updated = await patch(`/agency/${agencyId}`, { codEnabled: settings.codEnabled, phone: settings.phone, slots: settings.slots, serviceArea: { ...agency.data.serviceArea, pincodes: settings.pincodes.split(/[,\s]+/).filter(Boolean), radiusKm: Number(settings.radiusKm) } });
      qc.invalidateQueries({ queryKey: ["agency"] });
      if (user) login(user, updated);
      toast.success("Settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (agency.isLoading || prices.isLoading || !settings) return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>;
  if (agency.isError || !agency.data) return <ErrorState onRetry={() => agency.refetch()} />;
  const a = agency.data;
  const nameOf = (id: string) => (types.data ?? []).find((t: any) => t.id === id)?.name ?? id;

  return (
    <>
      <PageHeader title="Pricing & settings" subtitle={`${a.name} · Distributor code ${a.distributorCode} · GSTIN ${a.gstin}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Price list</CardTitle>
              <CardDescription>Illustrative prices. Domestic rates follow OMC notified prices in production.</CardDescription>
            </div>
            <Button size="sm" onClick={savePrices} loading={busy}>
              Save prices
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <THead>
                <tr>
                  <th>Cylinder</th>
                  <th className="w-36">Price (₹)</th>
                  <th className="w-36">Delivery (₹)</th>
                </tr>
              </THead>
              <TBody>
                {rows.map((r, i) => (
                  <Tr key={r.cylinderTypeId}>
                    <td className="font-medium">{nameOf(r.cylinderTypeId)}</td>
                    <td>
                      <Input type="number" className="h-8" value={r.price} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} aria-label={`${nameOf(r.cylinderTypeId)} price`} />
                    </td>
                    <td>
                      <Input type="number" className="h-8" value={r.deliveryCharge} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, deliveryCharge: Number(e.target.value) } : x)))} aria-label={`${nameOf(r.cylinderTypeId)} delivery charge`} />
                    </td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Delivery settings</CardTitle>
              <CardDescription>Cash on delivery, slots and capacity</CardDescription>
            </div>
            <Button size="sm" onClick={saveSettings} loading={busy}>
              Save settings
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium">Accept cash on delivery</p>
                <p className="text-xs text-muted-foreground">Customers see COD at checkout; staff collect and deposit.</p>
              </div>
              <Switch checked={settings.codEnabled} onCheckedChange={(v) => setSettings({ ...settings, codEnabled: v })} aria-label="Cash on delivery" />
            </div>
            <Field label="Customer-facing phone">
              <Input value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} />
            </Field>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Slots & daily capacity</p>
              <div className="grid gap-2">
                {settings.slots.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm">{s.label}</span>
                    <Input type="number" className="h-8 w-24" value={s.capacity} onChange={(e) => setSettings({ ...settings, slots: settings.slots.map((x, j) => (j === i ? { ...x, capacity: Number(e.target.value) } : x)) })} aria-label={`${s.label} capacity`} />
                    <span className="w-14 text-xs text-muted-foreground">/ day</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Service area</CardTitle>
              <CardDescription>Pincodes you serve, plus a radius around your godown for auto-assignment</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-3">
              <Field label="Pincodes (comma separated)">
                <Input value={settings.pincodes} onChange={(e) => setSettings({ ...settings, pincodes: e.target.value })} />
              </Field>
              <Field label="Radius (km)">
                <Input type="number" min={1} max={25} value={settings.radiusKm} onChange={(e) => setSettings({ ...settings, radiusKm: Number(e.target.value) })} />
              </Field>
              <p className="text-xs text-faint">
                Centre: {a.serviceArea.center.lat.toFixed(4)}, {a.serviceArea.center.lng.toFixed(4)}
              </p>
            </div>
            <div className="md:col-span-2">
              <Map height={260} pins={[{ id: "ag", lat: a.serviceArea.center.lat, lng: a.serviceArea.center.lng, kind: "agency", label: a.name }]} circles={[{ lat: a.serviceArea.center.lat, lng: a.serviceArea.center.lng, radiusKm: Number(settings.radiusKm) }]} fit={false} center={a.serviceArea.center} zoom={12} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
