"use client";

import { CheckCircle2, KeyRound, Pencil, Shield, ShieldOff, UserPlus, UserX, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, NativeSelect, Textarea } from "@/components/ui";
import { controlApi, type AdminAgency, type AdminPermission, type AdminRole, type TeamMember } from "@/lib/control-api";
import type { OperationsSession } from "@/lib/operations-api";

function message(cause: unknown) { return cause instanceof Error ? cause.message : "The request could not be completed."; }
type MemberAction = "suspend" | "reinstate" | "revoke";

export function TeamRbacPanel({ session, roles, permissions, members, agencies, reload }: { session: OperationsSession; roles: AdminRole[]; permissions: AdminPermission[]; members: TeamMember[]; agencies: AdminAgency[]; reload: () => Promise<void> }) {
  const superAdmin = session.platformAccess?.roleTypes.includes("super_admin") ?? false;
  const [mode, setMode] = useState<"members" | "roles">("members");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [verified, setVerified] = useState(false);
  const activeRoles = useMemo(() => roles.filter((role) => role.status === "active"), [roles]);
  const [invite, setInvite] = useState({ fullName: "", phone: "", email: "", rolePublicId: "", scopeKind: superAdmin ? "global" : "city", scopeValue: "Bengaluru", tenantPublicId: "", reason: "Assigned to commercial LPG platform operations" });
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
  const [memberChange, setMemberChange] = useState<{ member: TeamMember; action: MemberAction } | null>(null);
  const [memberReason, setMemberReason] = useState("");
  const [rolePublicId, setRolePublicId] = useState<string>("new");
  const [roleForm, setRoleForm] = useState({ name: "", roleType: "platform_team", status: "active", reason: "Defined operational permission ceiling" });
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null); setNotice(null);
    try { await operation(); await reload(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  const selectRole = (value: string) => {
    setRolePublicId(value);
    if (value === "new") { setRoleForm({ name: "", roleType: "platform_team", status: "active", reason: "Defined operational permission ceiling" }); setSelectedPermissions([]); return; }
    const role = roles.find((candidate) => candidate.publicId === value);
    if (role) { setRoleForm({ name: role.name, roleType: role.roleType, status: role.status, reason: "Updated operational permission ceiling" }); setSelectedPermissions(role.permissionKeys); }
  };

  const verify = () => run(async () => {
    await controlApi.stepUpMfa(mfaCode); setMfaCode(""); setVerified(true); setNotice("Privileged role and access changes are unlocked for 10 minutes.");
  });

  const createMember = () => run(async () => {
    const scope = invite.scopeKind === "global" ? { kind: "global" }
      : invite.scopeKind === "agency" ? { kind: "agency", agencyPublicId: selectedAgencies[0] }
      : invite.scopeKind === "selected_agencies" ? { kind: "selected_agencies", agencyPublicIds: selectedAgencies }
      : invite.scopeKind === "tenant" ? { kind: "tenant", tenantPublicId: invite.tenantPublicId }
      : { kind: invite.scopeKind, value: invite.scopeValue };
    await controlApi.createTeamMember({ fullName: invite.fullName, phoneE164: `+91${invite.phone}`, ...(invite.email ? { email: invite.email } : {}), rolePublicId: invite.rolePublicId, scope, reason: invite.reason });
    setInvite((current) => ({ ...current, fullName: "", phone: "", email: "" })); setNotice("Team access was created and the SMS invitation was queued.");
  });

  const saveRole = () => run(async () => {
    if (rolePublicId === "new") await controlApi.createRole({ name: roleForm.name, roleType: roleForm.roleType, permissionKeys: selectedPermissions, reason: roleForm.reason });
    else await controlApi.updateRole(rolePublicId, { name: roleForm.name, permissionKeys: selectedPermissions, status: roleForm.status, reason: roleForm.reason });
    setNotice(rolePublicId === "new" ? "The delegated role was created." : "The role and permission ceiling were updated.");
  });

  const applyMemberChange = () => {
    if (!memberChange) return;
    void run(async () => {
      await controlApi.changeTeamMemberAccess(memberChange.member.assignmentPublicId, { action: memberChange.action, reason: memberReason });
      setNotice(`${memberChange.member.fullName}'s assignment was ${memberChange.action === "reinstate" ? "reinstated" : memberChange.action === "suspend" ? "suspended" : "revoked"}.`);
      setMemberChange(null); setMemberReason("");
    });
  };

  const roleAllowsInvite = invite.rolePublicId && activeRoles.some((role) => role.publicId === invite.rolePublicId);
  const scopeValid = invite.scopeKind === "global" || (["region", "city"].includes(invite.scopeKind) && invite.scopeValue.trim().length >= 2) || (invite.scopeKind === "agency" && selectedAgencies.length === 1) || (invite.scopeKind === "selected_agencies" && selectedAgencies.length > 0) || (invite.scopeKind === "tenant" && /^[0-9a-f-]{36}$/i.test(invite.tenantPublicId));
  const visiblePermissions = permissions.filter((permission) => roleForm.roleType === "platform_admin" || !permission.reserved);

  return <div className="grid gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-2"><Users className="size-5 text-primary" /><h2 className="text-xl font-bold">Team and role access</h2></div><p className="mt-1 text-sm text-muted-foreground">Named users, explicit scopes, permission ceilings, MFA, and audited access lifecycle.</p></div><div className="flex gap-2"><Button size="sm" variant={mode === "members" ? "default" : "outline"} onClick={() => setMode("members")}>Members</Button><Button size="sm" variant={mode === "roles" ? "default" : "outline"} onClick={() => setMode("roles")}>Roles</Button></div></div>
    {error ? <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</div> : null}{notice ? <div className="flex items-center gap-2 rounded-xl bg-success-soft p-3 text-sm text-success"><CheckCircle2 className="size-4" />{notice}</div> : null}
    <Card><CardHeader><div><CardTitle>Verify privileged action</CardTitle><p className="mt-1 text-xs text-muted-foreground">Fresh MFA is required before creating, editing, suspending, or revoking role access.</p></div>{verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Locked</Badge>}</CardHeader><CardContent className="flex flex-wrap gap-2"><Input className="max-w-xs" placeholder="Authenticator or recovery code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.trim())} /><Button variant="navy" loading={busy} disabled={mfaCode.length < 6} onClick={() => void verify()}><KeyRound />Verify</Button></CardContent></Card>

    {mode === "members" ? <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Card><CardHeader><div><CardTitle>Managed team</CardTitle><p className="mt-1 text-xs text-muted-foreground">Active and suspended assignments in your management boundary</p></div><Badge tone="primary">{members.length}</Badge></CardHeader><CardContent className="grid gap-3">{members.length ? members.map((member) => <div key={member.assignmentPublicId} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{member.fullName}</p><p className="mt-1 text-xs text-muted-foreground">{member.phoneE164} · {member.roleName}</p><p className="mt-1 text-xs text-muted-foreground">{member.scope.kind}{member.scope.value ? `: ${member.scope.value}` : ""}{member.scope.agencies.length ? ` · ${member.scope.agencies.map((agency) => agency.displayName).join(", ")}` : ""}</p></div><div className="text-right"><Badge tone={member.assignmentStatus === "active" ? "success" : "warning"} dot>{member.assignmentStatus}</Badge><p className="mt-1 text-[11px] text-muted-foreground">{member.mfaRequired ? "MFA required" : "MFA missing"}</p></div></div>{member.publicId !== session.user.publicId ? <div className="mt-4 flex flex-wrap gap-2">{member.assignmentStatus === "active" ? <Button size="sm" variant="outline" onClick={() => setMemberChange({ member, action: "suspend" })}><ShieldOff />Suspend</Button> : <Button size="sm" variant="success" onClick={() => setMemberChange({ member, action: "reinstate" })}><Shield />Reinstate</Button>}<Button size="sm" variant="danger" onClick={() => setMemberChange({ member, action: "revoke" })}><UserX />Revoke</Button></div> : <p className="mt-3 text-xs text-muted-foreground">Your own access must be changed by another authorized administrator.</p>}</div>) : <p className="py-12 text-center text-sm text-muted-foreground">No managed assignments yet.</p>}</CardContent></Card>
      <Card><CardHeader><div><CardTitle>Add team member</CardTitle><p className="mt-1 text-xs text-muted-foreground">Invitation delivery is SMS first; MessageIndia credentials remain deferred.</p></div></CardHeader><CardContent className="grid gap-3"><Field label="Full name"><Input value={invite.fullName} onChange={(event) => setInvite((current) => ({ ...current, fullName: event.target.value }))} /></Field><Field label="Mobile number"><div className="flex gap-2"><span className="flex items-center rounded-xl border bg-muted px-3 text-sm">+91</span><Input inputMode="numeric" value={invite.phone} onChange={(event) => setInvite((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))} /></div></Field><Field label="Email"><Input type="email" value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} /></Field><Field label="Role"><NativeSelect value={invite.rolePublicId} onChange={(event) => setInvite((current) => ({ ...current, rolePublicId: event.target.value }))}><option value="">Select active role</option>{activeRoles.map((role) => <option key={role.publicId} value={role.publicId}>{role.name} · {role.roleType.replaceAll("_", " ")}</option>)}</NativeSelect></Field><Field label="Scope"><NativeSelect value={invite.scopeKind} onChange={(event) => { setInvite((current) => ({ ...current, scopeKind: event.target.value })); setSelectedAgencies([]); }}><option value="city">City</option><option value="region">Region / state</option><option value="agency">One agency</option><option value="selected_agencies">Selected agencies</option><option value="tenant">One tenant</option>{superAdmin ? <option value="global">Global</option> : null}</NativeSelect></Field>{["city", "region"].includes(invite.scopeKind) ? <Field label={invite.scopeKind === "city" ? "City" : "Region / state code"}><Input value={invite.scopeValue} onChange={(event) => setInvite((current) => ({ ...current, scopeValue: event.target.value }))} /></Field> : null}{["agency", "selected_agencies"].includes(invite.scopeKind) ? <div><p className="mb-2 text-xs font-medium text-muted-foreground">Agencies</p><div className="max-h-44 overflow-y-auto rounded-xl border p-2">{agencies.map((agency) => <label key={agency.publicId} className="flex gap-2 border-b p-2 text-xs last:border-0"><input type={invite.scopeKind === "agency" ? "radio" : "checkbox"} name="agency-scope" checked={selectedAgencies.includes(agency.publicId)} onChange={(event) => setSelectedAgencies((current) => invite.scopeKind === "agency" ? (event.target.checked ? [agency.publicId] : []) : event.target.checked ? [...current, agency.publicId] : current.filter((id) => id !== agency.publicId))} />{agency.displayName} · {agency.city}</label>)}</div></div> : null}{invite.scopeKind === "tenant" ? <Field label="Tenant public ID"><Input value={invite.tenantPublicId} onChange={(event) => setInvite((current) => ({ ...current, tenantPublicId: event.target.value }))} /></Field> : null}<Field label="Assignment reason"><Textarea value={invite.reason} onChange={(event) => setInvite((current) => ({ ...current, reason: event.target.value }))} /></Field><Button loading={busy} disabled={!invite.fullName || invite.phone.length !== 10 || !roleAllowsInvite || !scopeValid || invite.reason.trim().length < 3} onClick={() => void createMember()}><UserPlus />Add member and queue invite</Button></CardContent></Card></div> : null}

    {mode === "roles" ? <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><Card><CardHeader><div><CardTitle>Managed roles</CardTitle><p className="mt-1 text-xs text-muted-foreground">Select a role to edit or create a new permission ceiling.</p></div></CardHeader><CardContent className="grid gap-2"><button className={`rounded-xl border p-3 text-left text-sm ${rolePublicId === "new" ? "border-primary bg-primary-soft" : ""}`} onClick={() => selectRole("new")}><strong>+ New delegated role</strong></button>{roles.map((role) => <button key={role.publicId} className={`rounded-xl border p-3 text-left ${rolePublicId === role.publicId ? "border-primary bg-primary-soft" : ""}`} onClick={() => selectRole(role.publicId)}><div className="flex justify-between gap-2"><strong className="text-sm">{role.name}</strong><Badge tone={role.status === "active" ? "success" : "warning"}>{role.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{role.roleType.replaceAll("_", " ")} · {role.permissionKeys.length} permissions</p></button>)}</CardContent></Card><Card><CardHeader><div><CardTitle>{rolePublicId === "new" ? "Create delegated role" : "Edit role and permission ceiling"}</CardTitle><p className="mt-1 text-xs text-muted-foreground">A role can never exceed your own permissions. Reserved permissions remain blocked for ordinary team roles.</p></div><Pencil className="size-4 text-muted-foreground" /></CardHeader><CardContent className="grid gap-3"><Field label="Role name"><Input value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="Role level"><NativeSelect disabled={rolePublicId !== "new"} value={roleForm.roleType} onChange={(event) => { setRoleForm((current) => ({ ...current, roleType: event.target.value })); setSelectedPermissions([]); }}><option value="platform_team">Platform team</option>{superAdmin ? <option value="platform_admin">Platform Admin</option> : null}</NativeSelect></Field>{rolePublicId !== "new" ? <Field label="Role status"><NativeSelect value={roleForm.status} onChange={(event) => setRoleForm((current) => ({ ...current, status: event.target.value }))}><option value="active">Active</option><option value="suspended">Suspended</option></NativeSelect></Field> : null}<div><p className="mb-2 text-xs font-medium text-muted-foreground">Permissions</p><div className="max-h-80 overflow-y-auto rounded-xl border p-2">{visiblePermissions.map((permission) => <label key={permission.key} className="flex gap-2 border-b p-2 text-xs last:border-0"><input type="checkbox" checked={selectedPermissions.includes(permission.key)} onChange={(event) => setSelectedPermissions((current) => event.target.checked ? [...current, permission.key] : current.filter((key) => key !== permission.key))} /><span><strong>{permission.key}</strong>{permission.reserved ? <Badge className="ml-2" tone="warning">Reserved</Badge> : null}<br /><span className="text-muted-foreground">{permission.description}</span></span></label>)}</div></div><Field label="Mandatory reason"><Textarea value={roleForm.reason} onChange={(event) => setRoleForm((current) => ({ ...current, reason: event.target.value }))} /></Field><Button loading={busy} disabled={roleForm.name.trim().length < 2 || !selectedPermissions.length || roleForm.reason.trim().length < 3} onClick={() => void saveRole()}>{rolePublicId === "new" ? "Create role" : "Save role changes"}</Button></CardContent></Card></div> : null}

    {memberChange ? <Card className="border-danger/20"><CardHeader><div><CardTitle>{memberChange.action[0]!.toUpperCase() + memberChange.action.slice(1)} {memberChange.member.fullName}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Suspension and revocation immediately invalidate active sessions.</p></div></CardHeader><CardContent className="grid gap-3"><Field label="Mandatory reason"><Textarea value={memberReason} onChange={(event) => setMemberReason(event.target.value)} /></Field><div className="flex gap-2"><Button variant={memberChange.action === "reinstate" ? "success" : "danger"} loading={busy} disabled={memberReason.trim().length < 3} onClick={applyMemberChange}>{memberChange.action === "reinstate" ? <Shield /> : <ShieldOff />}Confirm {memberChange.action}</Button><Button variant="ghost" onClick={() => { setMemberChange(null); setMemberReason(""); }}>Cancel</Button></div></CardContent></Card> : null}
  </div>;
}
