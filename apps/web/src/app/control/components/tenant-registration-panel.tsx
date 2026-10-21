"use client";

import { MapPin, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, NativeSelect, Textarea } from "@/components/ui";
import type { AdminAgency } from "@/lib/control-api";

const businessTypes = ["restaurant", "hotel", "cloud_kitchen", "tiffin_centre", "canteen", "bakery", "tea_stall", "hospital", "hostel", "other"];
const days = [{ value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 0, label: "Sun" }];

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "The request could not be completed.";
}

function optionalPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `+91${digits}` : undefined;
}

export function TenantRegistrationPanel({ agencies, onCreated }: { agencies: AdminAgency[]; onCreated: (body: Record<string, unknown>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    legalName: "", displayName: "", businessType: "restaurant", gstin: "", fssaiNumber: "", alternatePhone: "", internalNotes: "",
    ownerName: "", ownerPhone: "", ownerEmail: "", outletLabel: "Main kitchen", addressLine1: "", addressLine2: "", city: "Bengaluru", stateCode: "KA", pincode: "",
    latitude: "", longitude: "", contactName: "", contactPhone: "", deliveryInstructions: "", inUse: "0", spareFull: "0", empty: "0",
    quantity19: "", quantity475: "", period: "week", slot: "standard", agencyPublicId: "", paymentMode: "prepaid", creditLimit: "50000", netTerms: "15",
    assignmentReason: "Selected for commercial LPG service coverage",
  });
  const [preferredDays, setPreferredDays] = useState<number[]>([]);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const requirementItems = useMemo(() => [
    ...(Number(form.quantity19) > 0 ? [{ cylinderTypeCode: "commercial_19kg", expectedQuantity: Number(form.quantity19) }] : []),
    ...(Number(form.quantity475) > 0 ? [{ cylinderTypeCode: "commercial_47_5kg", expectedQuantity: Number(form.quantity475) }] : []),
  ], [form.quantity19, form.quantity475]);
  const valid = form.legalName.trim().length >= 2 && form.displayName.trim().length >= 2 && form.gstin.length === 15 && form.ownerName.trim().length >= 2 && form.ownerPhone.length === 10 && form.addressLine1.trim().length >= 3 && form.city.trim().length >= 2 && form.stateCode.length === 2 && form.pincode.length === 6 && form.latitude !== "" && form.longitude !== "" && Number(form.latitude) >= -90 && Number(form.latitude) <= 90 && Number(form.longitude) >= -180 && Number(form.longitude) <= 180 && requirementItems.length > 0 && Boolean(form.agencyPublicId) && form.assignmentReason.trim().length >= 3 && (form.paymentMode !== "credit" || Number(form.creditLimit) > 0);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await onCreated({
        legalName: form.legalName, displayName: form.displayName, businessType: form.businessType, gstin: form.gstin,
        ...(form.fssaiNumber ? { fssaiNumber: form.fssaiNumber } : {}),
        ...(optionalPhone(form.alternatePhone) ? { alternatePhoneE164: optionalPhone(form.alternatePhone) } : {}),
        ...(form.internalNotes ? { internalNotes: form.internalNotes } : {}),
        owner: { fullName: form.ownerName, phoneE164: `+91${form.ownerPhone}`, ...(form.ownerEmail ? { email: form.ownerEmail } : {}) },
        outlet: {
          label: form.outletLabel, addressLine1: form.addressLine1, ...(form.addressLine2 ? { addressLine2: form.addressLine2 } : {}), city: form.city,
          stateCode: form.stateCode.toUpperCase(), pincode: form.pincode, latitude: Number(form.latitude), longitude: Number(form.longitude),
          ...(form.contactName ? { contactName: form.contactName } : {}), ...(optionalPhone(form.contactPhone) ? { contactPhoneE164: optionalPhone(form.contactPhone) } : {}),
          ...(form.deliveryInstructions ? { deliveryInstructions: form.deliveryInstructions } : {}),
          stock: { inUse: Number(form.inUse), spareFull: Number(form.spareFull), empty: Number(form.empty) },
        },
        requirement: { period: form.period, preferredDeliveryDays: preferredDays, preferredSlot: form.slot, items: requirementItems },
        agencyPublicId: form.agencyPublicId, assignmentReason: form.assignmentReason,
        commercial: form.paymentMode === "credit"
          ? { requestedPaymentMode: "credit", proposedCreditLimit: Number(form.creditLimit), proposedNetTermDays: Number(form.netTerms), proposalNote: form.assignmentReason }
          : { requestedPaymentMode: "prepaid", proposalNote: form.assignmentReason },
      });
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  return <Card><CardHeader><div><CardTitle>Register a business tenant</CardTitle><p className="mt-1 text-xs text-muted-foreground">Create the business, owner, first outlet, LPG requirement, and explicit serving-agency assignment.</p></div></CardHeader><CardContent className="grid gap-7">
    {error ? <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
    <section><h3 className="mb-3 text-sm font-semibold">Business identity</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Field label="Legal business name"><Input value={form.legalName} onChange={(event) => set("legalName", event.target.value)} /></Field><Field label="Display name"><Input value={form.displayName} onChange={(event) => set("displayName", event.target.value)} /></Field><Field label="Business type"><NativeSelect value={form.businessType} onChange={(event) => set("businessType", event.target.value)}>{businessTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</NativeSelect></Field><Field label="GSTIN (required)"><Input value={form.gstin} maxLength={15} onChange={(event) => set("gstin", event.target.value.toUpperCase().replace(/\s/g, ""))} /></Field><Field label="FSSAI number"><Input value={form.fssaiNumber} onChange={(event) => set("fssaiNumber", event.target.value)} /></Field><Field label="Alternate mobile"><Input inputMode="numeric" value={form.alternatePhone} onChange={(event) => set("alternatePhone", event.target.value.replace(/\D/g, "").slice(0, 10))} /></Field></div><Field label="Internal admin notes"><Textarea className="mt-3" value={form.internalNotes} onChange={(event) => set("internalNotes", event.target.value)} placeholder="Visible only to authorized platform users" /></Field></section>

    <section><h3 className="mb-3 text-sm font-semibold">Owner contact</h3><div className="grid gap-3 md:grid-cols-3"><Field label="Full name"><Input value={form.ownerName} onChange={(event) => set("ownerName", event.target.value)} /></Field><Field label="Registered mobile"><div className="flex gap-2"><span className="flex items-center rounded-xl border bg-muted px-3 text-sm">+91</span><Input inputMode="numeric" value={form.ownerPhone} onChange={(event) => set("ownerPhone", event.target.value.replace(/\D/g, "").slice(0, 10))} /></div></Field><Field label="Email"><Input type="email" value={form.ownerEmail} onChange={(event) => set("ownerEmail", event.target.value)} /></Field></div></section>

    <section><div className="mb-3 flex items-center gap-2"><MapPin className="size-4 text-primary" /><h3 className="text-sm font-semibold">Initial outlet and address</h3></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Field label="Outlet label"><Input value={form.outletLabel} onChange={(event) => set("outletLabel", event.target.value)} /></Field><Field label="Address line 1"><Input value={form.addressLine1} onChange={(event) => set("addressLine1", event.target.value)} /></Field><Field label="Address line 2 / landmark"><Input value={form.addressLine2} onChange={(event) => set("addressLine2", event.target.value)} /></Field><Field label="City"><Input value={form.city} onChange={(event) => set("city", event.target.value)} /></Field><Field label="State code"><Input value={form.stateCode} maxLength={2} onChange={(event) => set("stateCode", event.target.value.toUpperCase())} /></Field><Field label="Pincode"><Input inputMode="numeric" value={form.pincode} onChange={(event) => set("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))} /></Field><Field label="Latitude"><Input type="number" step="0.000001" value={form.latitude} onChange={(event) => set("latitude", event.target.value)} placeholder="Confirm from map/location" /></Field><Field label="Longitude"><Input type="number" step="0.000001" value={form.longitude} onChange={(event) => set("longitude", event.target.value)} placeholder="Confirm from map/location" /></Field><Field label="Outlet contact name"><Input value={form.contactName} onChange={(event) => set("contactName", event.target.value)} /></Field><Field label="Outlet contact mobile"><Input inputMode="numeric" value={form.contactPhone} onChange={(event) => set("contactPhone", event.target.value.replace(/\D/g, "").slice(0, 10))} /></Field></div><Field label="Delivery instructions"><Textarea className="mt-3" value={form.deliveryInstructions} onChange={(event) => set("deliveryInstructions", event.target.value)} /></Field></section>

    <section><h3 className="mb-3 text-sm font-semibold">Commercial LPG requirement</h3><div className="grid gap-3 md:grid-cols-3"><Field label="19 kg quantity"><Input type="number" min={0} value={form.quantity19} onChange={(event) => set("quantity19", event.target.value)} placeholder="0" /></Field><Field label="47.5 kg quantity"><Input type="number" min={0} value={form.quantity475} onChange={(event) => set("quantity475", event.target.value)} placeholder="0" /></Field><Field label="Requirement period"><NativeSelect value={form.period} onChange={(event) => set("period", event.target.value)}><option value="week">Per week</option><option value="month">Per month</option></NativeSelect></Field><Field label="Cylinders in use"><Input type="number" min={0} value={form.inUse} onChange={(event) => set("inUse", event.target.value)} /></Field><Field label="Spare full cylinders"><Input type="number" min={0} value={form.spareFull} onChange={(event) => set("spareFull", event.target.value)} /></Field><Field label="Empty cylinders held"><Input type="number" min={0} value={form.empty} onChange={(event) => set("empty", event.target.value)} /></Field><Field label="Preferred slot"><NativeSelect value={form.slot} onChange={(event) => set("slot", event.target.value)}><option value="before_opening">Before opening</option><option value="standard">Standard</option><option value="evening">Evening</option><option value="express">Express</option></NativeSelect></Field></div><div className="mt-3"><p className="mb-2 text-xs font-medium text-muted-foreground">Preferred delivery days (optional)</p><div className="flex flex-wrap gap-2">{days.map((day) => <label key={day.value} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold ${preferredDays.includes(day.value) ? "border-primary bg-primary-soft text-primary" : "bg-card"}`}><input className="sr-only" type="checkbox" checked={preferredDays.includes(day.value)} onChange={(event) => setPreferredDays((current) => event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value))} />{day.label}</label>)}</div></div></section>

    <section><h3 className="mb-3 text-sm font-semibold">Agency and commercial request</h3><div className="grid gap-3 md:grid-cols-3"><Field label="Serving agency (explicit selection)"><NativeSelect value={form.agencyPublicId} onChange={(event) => set("agencyPublicId", event.target.value)}><option value="">Select approved agency</option>{agencies.map((agency) => <option key={agency.publicId} value={agency.publicId}>{agency.displayName} · {agency.city}</option>)}</NativeSelect></Field><Field label="Requested payment mode"><NativeSelect value={form.paymentMode} onChange={(event) => set("paymentMode", event.target.value)}><option value="prepaid">Prepaid / COD</option><option value="credit">Request credit</option></NativeSelect></Field>{form.paymentMode === "credit" ? <><Field label="Proposed credit limit"><Input type="number" min={1} value={form.creditLimit} onChange={(event) => set("creditLimit", event.target.value)} /></Field><Field label="Proposed net terms"><NativeSelect value={form.netTerms} onChange={(event) => set("netTerms", event.target.value)}><option value="7">Net 7</option><option value="15">Net 15</option><option value="30">Net 30</option></NativeSelect></Field></> : null}</div><Field label="Agency assignment and proposal note"><Textarea className="mt-3" value={form.assignmentReason} onChange={(event) => set("assignmentReason", event.target.value)} /></Field></section>

    <div className="rounded-xl border border-primary/20 bg-primary-soft/30 p-4 text-sm"><strong>Maker–checker flow:</strong> this action creates and submits the tenant. A different Platform Admin must approve before the registration SMS is queued.</div>
    <Button size="lg" loading={busy} disabled={!valid} onClick={() => void submit()}><Plus />Create draft and submit for approval</Button>
  </CardContent></Card>;
}
