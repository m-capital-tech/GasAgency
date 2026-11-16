"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { operationsApi, type OperationsAgency, type OperationsCylinderPrice } from "@/lib/operations-api";

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

function CylinderPriceForm({ price, agencyId }: { price: OperationsCylinderPrice; agencyId: string }) {
  const [current, setCurrent] = useState(price.baseUnitPrice);
  const [amount, setAmount] = useState(price.baseUnitPrice ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setError("");
    setSaving(true);
    try {
      const result = await operationsApi.setCylinderPrice(agencyId, {
        cylinderTypeCode: price.cylinderTypeCode, baseUnitPrice: amount.trim(), expectedBaseUnitPrice: current, reason: reason.trim(),
      });
      setCurrent(result.price.baseUnitPrice);
      setAmount(result.price.baseUnitPrice ?? "");
      setReason("");
      setNotice("Price saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this price.");
    } finally {
      setSaving(false);
    }
  }

  return <form aria-label={price.displayName} onSubmit={save} className="grid gap-3 rounded-xl border p-4">
    <div><h3 className="font-semibold">{price.displayName}</h3>
      <p className="text-sm text-muted-foreground">Current rate · {current === null ? "Not set" : rupees.format(Number(current))}</p></div>
    <label className="grid gap-1 text-sm">Base rate per cylinder (₹, before GST)
      <Input inputMode="decimal" required pattern="(0|[1-9][0-9]{0,9})([.][0-9]{1,2})?" title="Enter a positive rupee amount with up to two decimal places."
        value={amount} disabled={saving} onChange={(event) => { setAmount(event.target.value); setNotice(""); }} /></label>
    <label className="grid gap-1 text-sm">Reason for change
      <Input required minLength={3} maxLength={500} disabled={saving} value={reason} onChange={(event) => { setReason(event.target.value); setNotice(""); }} /></label>
    <div><Button type="submit" size="sm" loading={saving} disabled={saving || !(Number(amount) > 0) || Number(amount) === Number(current) || reason.trim().length < 3}>Save price</Button></div>
    {notice && <p role="status" className="text-sm text-success">{notice}</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </form>;
}

export function CylinderPrices({ agency }: { agency: OperationsAgency }) {
  const [prices, setPrices] = useState<OperationsCylinderPrice[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    operationsApi.cylinderPrices(agency.publicId).then((result) => {
      if (active) setPrices(result.prices);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load cylinder prices.");
    });
    return () => { active = false; };
  }, [agency.publicId, reload]);

  return <section id="cylinder-prices" aria-label="Cylinder prices" className="scroll-mt-4">
    <Card><CardHeader><div><CardTitle>Cylinder prices</CardTitle>
      <p className="mt-1 text-sm text-muted-foreground">Set the standard rate for {agency.displayName}. Vendors can order a cylinder once it has a rate. A lower agreed or quantity price still applies.</p></div>
      <Button type="button" size="sm" variant="outline" disabled={!prices && !error} onClick={() => { setPrices(null); setError(""); setReload((value) => value + 1); }}>Reload prices</Button>
    </CardHeader><CardContent>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : prices === null ? <p role="status">Loading prices…</p> :
        prices.length ? <div className="grid gap-4 md:grid-cols-2">{prices.map((price) => <CylinderPriceForm key={price.cylinderTypeCode} agencyId={agency.publicId} price={price} />)}</div> :
          <p>No active cylinder types are available.</p>}
    </CardContent></Card>
  </section>;
}
