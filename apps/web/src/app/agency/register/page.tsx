"use client";
import { CheckCircle2, FileUp, Flame } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Map } from "@/components/map/Map";
import { Button, Card, CardContent, Field, Input, NativeSelect, OmcBadge } from "@/components/ui";
import { post } from "@/lib/api";

const AREAS = [
  { label: "Uppal", lat: 17.4056, lng: 78.5591, pincodes: "500039, 500098" },
  { label: "Miyapur", lat: 17.4969, lng: 78.3715, pincodes: "500049, 500050" },
  { label: "Banjara Hills", lat: 17.4156, lng: 78.4347, pincodes: "500034" },
  { label: "Malakpet", lat: 17.3753, lng: 78.5035, pincodes: "500036" },
];

/** A1 — Agency registration / KYC (mock) */
export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ name: "", omc: "HP", distributorCode: "", gstin: "", ownerName: "", ownerPhone: "", ownerEmail: "", area: AREAS[0].label, pincodes: AREAS[0].pincodes, radiusKm: 5 });
  const [docs, setDocs] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const area = AREAS.find((a) => a.label === f.area) ?? AREAS[0];

  const submit = async () => {
    setBusy(true);
    try {
      const r = await post("/agencies/register", { ...f, center: { lat: area.lat, lng: area.lng }, pincodes: f.pincodes.split(/[,\s]+/).filter(Boolean), radiusKm: Number(f.radiusKm) });
      setDone(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const Doc = ({ k, label }: { k: string; label: string }) => (
    <button type="button" onClick={() => setDocs({ ...docs, [k]: !docs[k] })} className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm ${docs[k] ? "border-success bg-success-soft" : "hover:bg-muted"}`}>
      {docs[k] ? <CheckCircle2 className="size-5 text-success" /> : <FileUp className="size-5 text-muted-foreground" />}
      <span className="flex-1">{label}</span>
      <span className="text-xs text-muted-foreground">{docs[k] ? "uploaded (mock)" : "tap to upload"}</span>
    </button>
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white">
          <Flame className="size-4" />
        </span>
        <div>
          <p className="font-bold leading-tight">Register your gas agency</p>
          <p className="text-xs text-muted-foreground">Any oil company · approval in 1–2 working days</p>
        </div>
        <Link href="/" className="ml-auto text-xs text-primary">
          Back to home
        </Link>
      </div>
      {done ? (
        <Card>
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="mx-auto size-12 text-success" />
            <p className="mt-3 text-lg font-bold">Application submitted</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {done.name} ({done.omc}) is <span className="font-semibold text-foreground">Pending approval</span>. The platform team reviews KYC and you'll get an email.
            </p>
            <p className="mt-4 text-xs text-faint">Demo: approve it from Admin → Agency approvals, then it becomes assignable for pincodes {done.serviceArea.pincodes.join(", ")}.</p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="outline" onClick={() => (window.location.href = "/login?as=admin")}>
                Open admin approvals
              </Button>
              <Button onClick={() => (window.location.href = "/")}>Done</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <ol className="mb-6 flex gap-2 text-xs">
              {["Business", "Owner & KYC", "Service area"].map((s, i) => (
                <li key={s} className={`flex-1 rounded-full px-3 py-1.5 text-center font-medium ${step === i + 1 ? "bg-primary text-white" : step > i + 1 ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                  {i + 1}. {s}
                </li>
              ))}
            </ol>
            {step === 1 ? (
              <div className="grid gap-4">
                <Field label="Business name">
                  <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Uppal Sri Sai HP Gas" />
                </Field>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Oil company">
                    <div className="flex gap-2">
                      {["HP", "IOCL", "BPCL"].map((o) => (
                        <button key={o} type="button" onClick={() => setF({ ...f, omc: o })} className={`flex-1 rounded-xl border py-2 ${f.omc === o ? "border-primary bg-primary-soft" : ""}`}>
                          <OmcBadge omc={o} />
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Distributor code">
                    <Input value={f.distributorCode} onChange={(e) => setF({ ...f, distributorCode: e.target.value })} placeholder="HP-123456" />
                  </Field>
                  <Field label="GSTIN">
                    <Input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} placeholder="36AAAAA0000A1Z5" />
                  </Field>
                </div>
                <Button className="justify-self-end" disabled={!f.name || !f.distributorCode} onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            ) : null}
            {step === 2 ? (
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Owner name">
                    <Input value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} />
                  </Field>
                  <Field label="Mobile">
                    <Input value={f.ownerPhone} onChange={(e) => setF({ ...f, ownerPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
                  </Field>
                  <Field label="Email (login)">
                    <Input value={f.ownerEmail} onChange={(e) => setF({ ...f, ownerEmail: e.target.value })} placeholder="owner@agency.in" />
                  </Field>
                </div>
                <p className="text-xs font-medium text-muted-foreground">KYC documents (placeholders)</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <Doc k="dist" label="OMC distributorship letter" />
                  <Doc k="gst" label="GST certificate" />
                  <Doc k="pan" label="Owner PAN / Aadhaar" />
                  <Doc k="bank" label="Cancelled cheque" />
                </div>
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button disabled={!f.ownerName || !f.ownerPhone || !f.ownerEmail} onClick={() => setStep(3)}>
                    Continue
                  </Button>
                </div>
              </div>
            ) : null}
            {step === 3 ? (
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Godown area">
                    <NativeSelect value={f.area} onChange={(e) => { const a = AREAS.find((x) => x.label === e.target.value)!; setF({ ...f, area: a.label, pincodes: a.pincodes }); }}>
                      {AREAS.map((a) => (
                        <option key={a.label}>{a.label}</option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Pincodes served">
                    <Input value={f.pincodes} onChange={(e) => setF({ ...f, pincodes: e.target.value })} />
                  </Field>
                  <Field label="Radius (km)">
                    <Input type="number" value={f.radiusKm} onChange={(e) => setF({ ...f, radiusKm: Number(e.target.value) })} />
                  </Field>
                </div>
                <Map height={240} pins={[{ id: "c", lat: area.lat, lng: area.lng, kind: "agency", label: f.name || "Your godown" }]} circles={[{ lat: area.lat, lng: area.lng, radiusKm: Number(f.radiusKm) }]} fit={false} center={area} zoom={12} />
                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button onClick={submit} loading={busy}>
                    Submit for approval
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
