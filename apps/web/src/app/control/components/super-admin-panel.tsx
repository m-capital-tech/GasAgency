"use client";

import { AlertTriangle, CheckCircle2, KeyRound, Save, Settings2, Shield, ShieldOff, UserPlus, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, NativeSelect, Switch, Textarea } from "@/components/ui";
import { controlApi, type AdminRole, type PlatformSetting, type TeamMember } from "@/lib/control-api";

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "The request could not be completed.";
}

type AccessAction = "suspend" | "reinstate" | "revoke";

export function SuperAdminPanel({ roles, members, mfaVerifiedAt, reload, openTeam }: { roles: AdminRole[]; members: TeamMember[]; mfaVerifiedAt: string | null; reload: () => Promise<void>; openTeam: () => void }) {
  const platformAdminRoles = useMemo(() => roles.filter((role) => role.roleType === "platform_admin" && role.status === "active"), [roles]);
  const platformAdmins = useMemo(() => members.filter((member) => member.roleType === "platform_admin"), [members]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [verifiedUntil, setVerifiedUntil] = useState<Date | null>(() => mfaVerifiedAt ? new Date(new Date(mfaVerifiedAt).getTime() + 10 * 60_000) : null);
  const [invite, setInvite] = useState({ fullName: "", phone: "", email: "", rolePublicId: platformAdminRoles[0]?.publicId ?? "", scopeKind: "global", scopeValue: "", reason: "Appointed as a Platform Admin for commercial LPG operations" });
  const [change, setChange] = useState<{ member: TeamMember; action: AccessAction } | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [settingDrafts, setSettingDrafts] = useState<Record<string, boolean | number>>({});
  const [configurationReason, setConfigurationReason] = useState("");
  const [configurationLoading, setConfigurationLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void controlApi.configuration().then(({ settings: loaded }) => {
      if (!active) return;
      setSettings(loaded);
      setSettingDrafts(Object.fromEntries(loaded.map((setting) => [setting.key, setting.value])));
    }).catch((cause) => {
      if (active) setError(message(cause));
    }).finally(() => {
      if (active) setConfigurationLoading(false);
    });
    return () => { active = false; };
  }, []);

  const changedSettings = useMemo(() => settings.filter((setting) => settingDrafts[setting.key] !== undefined && settingDrafts[setting.key] !== setting.value), [settingDrafts, settings]);
  const workflowSettings = useMemo(() => settings.filter((setting) => setting.category === "workflow"), [settings]);
  const operationsSettings = useMemo(() => settings.filter((setting) => setting.category === "operations"), [settings]);
  const featureSettings = useMemo(() => settings.filter((setting) => setting.category === "feature"), [settings]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null);
    try { await operation(); await reload(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  const verify = () => run(async () => {
    const result = await controlApi.stepUpMfa(mfaCode);
    setVerifiedUntil(new Date(Date.now() + result.validForSeconds * 1_000));
    setMfaCode("");
    setNotice("Privileged actions are unlocked for 10 minutes on this session.");
  });

  const createPlatformAdmin = () => run(async () => {
    await controlApi.createTeamMember({
      fullName: invite.fullName,
      phoneE164: `+91${invite.phone}`,
      ...(invite.email ? { email: invite.email } : {}),
      rolePublicId: invite.rolePublicId,
      scope: invite.scopeKind === "global" ? { kind: "global" } : { kind: invite.scopeKind, value: invite.scopeValue },
      reason: invite.reason,
    });
    setInvite((current) => ({ ...current, fullName: "", phone: "", email: "" }));
    setNotice("Platform Admin access was created and the SMS invitation was queued.");
  });

  const applyLifecycle = () => {
    if (!change) return;
    void run(async () => {
      await controlApi.changeTeamMemberAccess(change.member.assignmentPublicId, { action: change.action, reason: changeReason });
      setNotice(`${change.member.fullName}'s Platform Admin access was ${change.action === "reinstate" ? "reinstated" : change.action === "suspend" ? "suspended" : "revoked"}.`);
      setChange(null); setChangeReason("");
    });
  };

  const saveConfiguration = () => run(async () => {
    await controlApi.updateConfiguration({
      changes: changedSettings.map((setting) => ({ key: setting.key, value: settingDrafts[setting.key]!, expectedVersion: setting.version })),
      reason: configurationReason,
    });
    const { settings: loaded } = await controlApi.configuration();
    setSettings(loaded);
    setSettingDrafts(Object.fromEntries(loaded.map((setting) => [setting.key, setting.value])));
    setConfigurationReason("");
    setNotice("Platform controls were updated and recorded in the immutable audit log.");
  });

  return <div className="grid gap-5">
    <div><div className="flex items-center gap-2"><Shield className="size-5 text-primary" /><h2 className="text-xl font-bold">Super Admin governance</h2></div><p className="mt-1 text-sm text-muted-foreground">Global Platform Admin access, permission ceilings, and privileged execution safeguards.</p></div>
    {error ? <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</div> : null}
    {notice ? <div className="flex items-center gap-2 rounded-xl bg-success-soft p-3 text-sm text-success"><CheckCircle2 className="size-4" />{notice}</div> : null}

    <Card><CardHeader><div><CardTitle>Privileged action verification</CardTitle><p className="mt-1 text-xs text-muted-foreground">A fresh authenticator or recovery code is required for role and access changes.</p></div>{verifiedUntil && verifiedUntil > new Date() ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Verification required</Badge>}</CardHeader><CardContent className="flex flex-wrap gap-2"><Input className="max-w-xs" inputMode="numeric" autoComplete="one-time-code" placeholder="Authenticator or recovery code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.trim())} /><Button variant="navy" loading={busy} disabled={mfaCode.length < 6} onClick={() => void verify()}><KeyRound />Verify privileged action</Button></CardContent></Card>

    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Card><CardHeader><div><CardTitle>Platform Administrators</CardTitle><p className="mt-1 text-xs text-muted-foreground">Named accounts only. Suspending or revoking access also revokes their active sessions.</p></div><Badge tone="primary">{platformAdmins.length} assignments</Badge></CardHeader><CardContent className="grid gap-3">{platformAdmins.length ? platformAdmins.map((member) => <div key={member.assignmentPublicId} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{member.fullName}</p><p className="mt-1 text-xs text-muted-foreground">{member.phoneE164}{member.email ? ` · ${member.email}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">{member.roleName} · {member.scope.kind}{member.scope.value ? `: ${member.scope.value}` : ""}</p></div><Badge tone={member.assignmentStatus === "active" ? "success" : "warning"} dot>{member.assignmentStatus}</Badge></div><div className="mt-4 flex flex-wrap gap-2">{member.assignmentStatus === "active" ? <Button size="sm" variant="outline" onClick={() => setChange({ member, action: "suspend" })}><ShieldOff />Suspend access</Button> : <Button size="sm" variant="success" onClick={() => setChange({ member, action: "reinstate" })}><Shield />Reinstate</Button>}<Button size="sm" variant="danger" onClick={() => setChange({ member, action: "revoke" })}><UserX />Revoke</Button></div></div>) : <div className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm"><strong>No Platform Admin assignments found.</strong><p className="mt-1 text-muted-foreground">Create a Platform Admin role with an explicit permission ceiling, then add the first named administrator.</p></div>}</CardContent></Card>

      <Card><CardHeader><div><CardTitle>Add Platform Admin</CardTitle><p className="mt-1 text-xs text-muted-foreground">The user receives an SMS invitation and must complete OTP plus MFA.</p></div></CardHeader><CardContent className="grid gap-3">{platformAdminRoles.length ? <><Field label="Full name"><Input value={invite.fullName} onChange={(event) => setInvite((current) => ({ ...current, fullName: event.target.value }))} /></Field><Field label="Mobile number"><div className="flex gap-2"><span className="flex items-center rounded-xl border bg-muted px-3 text-sm">+91</span><Input inputMode="numeric" value={invite.phone} onChange={(event) => setInvite((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))} /></div></Field><Field label="Email"><Input type="email" value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} /></Field><Field label="Permission ceiling"><NativeSelect value={invite.rolePublicId} onChange={(event) => setInvite((current) => ({ ...current, rolePublicId: event.target.value }))}><option value="">Select Platform Admin role</option>{platformAdminRoles.map((role) => <option key={role.publicId} value={role.publicId}>{role.name} · {role.permissionKeys.length} permissions</option>)}</NativeSelect></Field><Field label="Operating scope"><NativeSelect value={invite.scopeKind} onChange={(event) => setInvite((current) => ({ ...current, scopeKind: event.target.value }))}><option value="global">Global</option><option value="region">Region / state code</option><option value="city">City</option></NativeSelect></Field>{invite.scopeKind !== "global" ? <Field label={invite.scopeKind === "region" ? "State code / region" : "City"}><Input value={invite.scopeValue} onChange={(event) => setInvite((current) => ({ ...current, scopeValue: event.target.value }))} /></Field> : null}<Field label="Appointment reason"><Textarea value={invite.reason} onChange={(event) => setInvite((current) => ({ ...current, reason: event.target.value }))} /></Field><Button loading={busy} disabled={!invite.fullName || invite.phone.length !== 10 || !invite.rolePublicId || (invite.scopeKind !== "global" && invite.scopeValue.trim().length < 2) || invite.reason.trim().length < 3} onClick={() => void createPlatformAdmin()}><UserPlus />Create Platform Admin access</Button></> : <div className="grid gap-3"><div className="flex gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p>Create a Platform Admin role and permission ceiling before appointing an administrator.</p></div><Button variant="outline" onClick={openTeam}>Open Team & RBAC</Button></div>}</CardContent></Card>
    </div>

    <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Settings2 className="size-5 text-primary" /><h3 className="text-lg font-bold">Platform execution controls</h3></div><p className="mt-1 text-sm text-muted-foreground">Backend-enforced workflow gates and operating thresholds. Every change requires fresh MFA and a recorded reason.</p></div>{changedSettings.length ? <Badge tone="warning">{changedSettings.length} unsaved</Badge> : <Badge tone="success">Configuration current</Badge>}</div>

    {configurationLoading ? <Card><CardContent className="p-5 text-sm text-muted-foreground">Loading governed platform controls…</CardContent></Card> : <div className="grid gap-5 xl:grid-cols-3">
      <Card><CardHeader><div><CardTitle>Commercial workflows</CardTitle><p className="mt-1 text-xs text-muted-foreground">Emergency and release gates for transaction-producing flows.</p></div></CardHeader><CardContent className="grid gap-3">{workflowSettings.map((setting) => <div key={setting.key} className="flex items-start justify-between gap-4 rounded-xl border p-3"><div><p className="text-sm font-semibold">{setting.displayName}</p><p className="mt-1 text-xs text-muted-foreground">{setting.description}</p></div><Switch checked={settingDrafts[setting.key] === true} disabled={busy} onCheckedChange={(value) => setSettingDrafts((current) => ({ ...current, [setting.key]: value }))} aria-label={setting.displayName} /></div>)}</CardContent></Card>

      <Card><CardHeader><div><CardTitle>Operational thresholds</CardTitle><p className="mt-1 text-xs text-muted-foreground">Shared policy inputs for alerts, queues and future agency defaults.</p></div></CardHeader><CardContent className="grid gap-3">{operationsSettings.map((setting) => <Field key={setting.key} label={setting.displayName} hint={setting.description}><Input type="number" min={setting.key === "operations.approval_sla_hours" ? 1 : 0} max={setting.key === "operations.approval_sla_hours" ? 168 : 500} value={Number(settingDrafts[setting.key] ?? setting.value)} disabled={busy} onChange={(event) => setSettingDrafts((current) => ({ ...current, [setting.key]: Number(event.target.value) }))} /></Field>)}</CardContent></Card>

      <Card><CardHeader><div><CardTitle>Feature rollout gates</CardTitle><p className="mt-1 text-xs text-muted-foreground">Keep infrastructure-dependent features off until their production services are ready.</p></div></CardHeader><CardContent className="grid gap-3">{featureSettings.map((setting) => <div key={setting.key} className="flex items-start justify-between gap-4 rounded-xl border p-3"><div><p className="text-sm font-semibold">{setting.displayName}</p><p className="mt-1 text-xs text-muted-foreground">{setting.description}</p></div><Switch checked={settingDrafts[setting.key] === true} disabled={busy} onCheckedChange={(value) => setSettingDrafts((current) => ({ ...current, [setting.key]: value }))} aria-label={setting.displayName} /></div>)}</CardContent></Card>
    </div>}

    {!configurationLoading ? <Card className={changedSettings.length ? "border-warning/30" : undefined}><CardHeader><div><CardTitle>Approve configuration change</CardTitle><p className="mt-1 text-xs text-muted-foreground">Optimistic version checks prevent overwriting another administrator’s newer decision.</p></div></CardHeader><CardContent className="grid gap-3"><Field label="Mandatory change reason" hint="Minimum 10 characters; retained with the before/after values in the audit trail."><Textarea value={configurationReason} onChange={(event) => setConfigurationReason(event.target.value)} placeholder="Explain the operational, safety or rollout reason" /></Field><div className="flex flex-wrap items-center gap-3"><Button variant="navy" loading={busy} disabled={!changedSettings.length || configurationReason.trim().length < 10} onClick={() => void saveConfiguration()}><Save />{changedSettings.length ? `Apply ${changedSettings.length} change${changedSettings.length === 1 ? "" : "s"}` : "Apply configuration"}</Button>{changedSettings.length ? <Button variant="ghost" onClick={() => { setSettingDrafts(Object.fromEntries(settings.map((setting) => [setting.key, setting.value]))); setConfigurationReason(""); }}>Discard changes</Button> : null}</div></CardContent></Card> : null}

    {change ? <Card className="border-danger/20"><CardHeader><div><CardTitle>{change.action === "reinstate" ? "Reinstate" : change.action === "suspend" ? "Suspend" : "Revoke"} {change.member.fullName}</CardTitle><p className="mt-1 text-xs text-muted-foreground">This change is explicit, MFA-protected, and written to the immutable audit log.</p></div></CardHeader><CardContent className="grid gap-3"><Field label="Mandatory reason"><Textarea value={changeReason} onChange={(event) => setChangeReason(event.target.value)} placeholder="Record the governance or operational reason" /></Field><div className="flex gap-2"><Button variant={change.action === "reinstate" ? "success" : "danger"} loading={busy} disabled={changeReason.trim().length < 3} onClick={applyLifecycle}>{change.action === "reinstate" ? <Shield /> : <ShieldOff />}Confirm {change.action}</Button><Button variant="ghost" onClick={() => { setChange(null); setChangeReason(""); }}>Cancel</Button></div></CardContent></Card> : null}
  </div>;
}
