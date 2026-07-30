import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import {
  ShieldCheck, KeyRound, Activity, QrCode, Building2, Loader2, CheckCircle2,
  Receipt, FileText, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import type { Severity } from "@/lib/buildpos/format";
import { useAuth } from "@/lib/api/auth";
import { useBranches } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";
import {
  useZatcaIdentity, useZatcaSettings, useZatcaInvoices, useSubmitZatcaInvoice,
  useUpsertZatcaSettings, useGenerateZatcaCsr, useZatcaComplianceCsid, useZatcaProductionOnboarding, useSetZatcaEnvironment,
  type UpsertZatcaSettingsRequest, type ZatcaComplianceTestDto,
} from "@/lib/api/zatca";

const ENVIRONMENT_OPTIONS = [
  { value: "NonProduction", label: "Sandbox (developer portal)" },
  { value: "Simulation", label: "Simulation" },
  { value: "Production", label: "Production" },
];

function onboardingLabel(status?: string) {
  switch (status) {
    case "CsrGenerated": return "CSR generated";
    case "ComplianceCsidObtained": return "Compliance CSID";
    case "ProductionReady": return "Production ready";
    default: return "Not started";
  }
}

function errMsg(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: Severity }) {
  const toneKpi: Record<Severity, string> = {
    critical: "bg-critical/10 text-critical border-critical/20",
    warning: "bg-warning/15 text-[oklch(0.4_0.13_70)] border-warning/30",
    success: "bg-success/10 text-[oklch(0.35_0.1_155)] border-success/30",
    info: "bg-info/10 text-[oklch(0.35_0.12_235)] border-info/30",
    muted: "bg-black/5 text-foreground/70 border-black/10",
  };
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,10,50,0.04)]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold text-foreground">{value}</p>
      <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneKpi[tone]}`}>{sub}</span>
    </div>
  );
}

const emptyDraft: UpsertZatcaSettingsRequest = {
  branchId: 0, vatRegistrationNumber: "", sellerName: "", crNumber: "", street: "", city: "", postalCode: "", buildingNumber: "",
};

export function ZatcaSettingsPage() {
  const { hasAccess } = useAuth();
  const canEdit = hasAccess("/admin/zatca-settings", "Edit");

  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number | null>(null);
  useEffect(() => {
    if (branchId === null && branches && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);
  const branch = branches?.find((b) => b.id === branchId) ?? null;

  const { data: identity, isLoading: identityLoading } = useZatcaIdentity(branchId);
  const { data: settingsList } = useZatcaSettings();
  const { data: invoices } = useZatcaInvoices(branchId ?? undefined);

  const upsertSettings = useUpsertZatcaSettings();
  const generateCsr = useGenerateZatcaCsr();
  const complianceCsid = useZatcaComplianceCsid();
  const productionOnboarding = useZatcaProductionOnboarding();
  const setEnvironment = useSetZatcaEnvironment();
  const submitInvoice = useSubmitZatcaInvoice();
  const [complianceTests, setComplianceTests] = useState<ZatcaComplianceTestDto[]>([]);
  useEffect(() => setComplianceTests([]), [branchId]);

  async function handleRetry(orderId: number) {
    try {
      await submitInvoice.mutateAsync(orderId);
      toast.success("Invoice resubmitted to ZATCA");
    } catch (err) {
      toast.error(errMsg(err, "Failed to resubmit invoice"));
    }
  }

  const [draft, setDraft] = useState<UpsertZatcaSettingsRequest>(emptyDraft);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  useEffect(() => {
    if (!branchId || !settingsList || loadedFor === branchId) return;
    const existing = settingsList.find((s) => s.branchId === branchId);
    setDraft(existing ? {
      branchId, vatRegistrationNumber: existing.vatRegistrationNumber, sellerName: existing.sellerName, crNumber: existing.crNumber,
      street: existing.street, city: existing.city, postalCode: existing.postalCode, buildingNumber: existing.buildingNumber,
    } : { ...emptyDraft, branchId });
    setLoadedFor(branchId);
  }, [branchId, settingsList, loadedFor]);

  const [otp, setOtp] = useState("");

  async function handleSave() {
    if (!branchId || !canEdit) return;
    try {
      await upsertSettings.mutateAsync({ ...draft, branchId });
      toast.success("ZATCA settings saved");
    } catch (err) {
      toast.error(errMsg(err, "Failed to save ZATCA settings"));
    }
  }

  async function handleGenerateCsr() {
    if (!branchId || !canEdit) return;
    try {
      await generateCsr.mutateAsync(branchId);
      toast.success("CSR generated — paste it into the ZATCA Fatoora portal to get an OTP");
    } catch (err) {
      toast.error(errMsg(err, "Failed to generate CSR"));
    }
  }

  async function handleComplianceCsid() {
    if (!branchId || !otp || !canEdit) return;
    try {
      await complianceCsid.mutateAsync({ branchId, otp });
      toast.success("Compliance CSID obtained");
      setOtp("");
    } catch (err) {
      toast.error(errMsg(err, "Failed to obtain compliance CSID"));
    }
  }

  async function handleProduction() {
    if (!branchId || !canEdit) return;
    try {
      const result = await productionOnboarding.mutateAsync(branchId);
      setComplianceTests(result.complianceTests);
      toast.success("Production CSID obtained — ZATCA onboarding complete");
    } catch (err) {
      toast.error(errMsg(err, "Failed to run onboarding to production"));
    }
  }

  async function handleEnvironmentChange(value: string) {
    if (!branchId || !canEdit) return;
    try {
      await setEnvironment.mutateAsync({ branchId, environment: value });
      toast.success(`ZATCA environment set to ${value}`);
    } catch (err) {
      toast.error(errMsg(err, "Failed to update ZATCA environment"));
    }
  }

  const enabled = identity?.phase2Enabled ?? false;
  const latestInvoiceWithQr = invoices?.find((i) => i.qrCodeBase64);
  const clearedCount = invoices?.filter((i) => i.status === "Cleared").length ?? 0;
  const failedInvoices = invoices?.filter((i) => i.status === "Failed") ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">Admin</p>
        <h1 className="font-display text-2xl font-bold text-foreground">ZATCA Phase 2 — Billing &amp; Orders</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Company billing info, invoice rules, credit/debit/refund notes and integration health
        </p>
      </div>

      <div className="ui-card-grid">
        <KpiCard label="Phase 2 Status" value={enabled ? "Enabled" : "Disabled"} sub={enabled ? "Live" : "Pending onboarding"} tone={enabled ? "success" : "warning"} />
        <KpiCard label="Onboarding" value={onboardingLabel(identity?.onboardingStatus)} sub={identity?.onboardingStatus === "ProductionReady" ? "Complete" : "In progress"} tone={identity?.onboardingStatus === "ProductionReady" ? "success" : "warning"} />
        <KpiCard label="Environment" value={identity?.environment ?? "Simulate"} sub={identity?.environment === "Production" ? "Live" : "Test mode"} tone={identity?.environment === "Production" ? "success" : "info"} />
        <KpiCard label="EGS Serial" value={identity?.hasProductionCsid || identity?.hasComplianceCsid || identity?.hasCsr ? "Assigned" : "Not generated"} sub={identity?.egsSerial ?? "—"} tone={identity?.hasCsr ? "success" : "warning"} />
      </div>

      <Tabs defaultValue="company">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="company" className="gap-1.5 data-[state=active]:bg-brand/10 data-[state=active]:text-brand"><Building2 className="h-4 w-4" />Company Billing</TabsTrigger>
          <TabsTrigger value="invoice" className="gap-1.5 data-[state=active]:bg-brand/10 data-[state=active]:text-brand"><Receipt className="h-4 w-4" />Invoice Config</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5 data-[state=active]:bg-brand/10 data-[state=active]:text-brand"><FileText className="h-4 w-4" />Order Billing</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5 data-[state=active]:bg-brand/10 data-[state=active]:text-brand"><FileText className="h-4 w-4" />Credit / Debit</TabsTrigger>
          <TabsTrigger value="refund" className="gap-1.5 data-[state=active]:bg-brand/10 data-[state=active]:text-brand"><Receipt className="h-4 w-4" />Refund Invoice</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5 data-[state=active]:bg-brand/10 data-[state=active]:text-brand"><Activity className="h-4 w-4" />Integration Logs</TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5 data-[state=active]:bg-brand/10 data-[state=active]:text-brand"><AlertTriangle className="h-4 w-4" />Error Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4 space-y-4">
          <SectionCard className="border-success/30 bg-success/5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-success/15 text-[oklch(0.35_0.1_155)]">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold text-foreground">ZATCA Phase 2 — {branch?.nameEn ?? "No branch available"}</h3>
                    <Pill tone={identity?.onboardingStatus === "ProductionReady" ? "success" : "warning"}>{onboardingLabel(identity?.onboardingStatus)}</Pill>
                  </div>
                  <p className="text-sm text-muted-foreground">Applied automatically on every billing &amp; order issued from POS / MPOS / Web</p>
                </div>
              </div>
              <div className="flex flex-none items-center gap-3">
                <Select value={branchId ? String(branchId) : undefined} onValueChange={(v) => setBranchId(Number(v))}>
                  <SelectTrigger className="h-9 w-[200px]"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.nameEn}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Switch checked={enabled} disabled title="Enabled automatically once production onboarding completes" />
              </div>
            </div>
          </SectionCard>

          {!branch ? (
            <p className="text-sm text-muted-foreground">No branch available to configure ZATCA for.</p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <SectionCard title="Company information">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Seller name (as registered with ZATCA)</Label>
                      <Input className="h-9" value={draft.sellerName} onChange={(e) => setDraft((p) => ({ ...p, sellerName: e.target.value }))} placeholder={branch.nameEn} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">VAT Number</Label>
                        <Input className="h-9" value={draft.vatRegistrationNumber} onChange={(e) => setDraft((p) => ({ ...p, vatRegistrationNumber: e.target.value }))} placeholder="300012345600003" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">CR Number (branch)</Label>
                        <Input className="h-9" value={draft.crNumber ?? ""} onChange={(e) => setDraft((p) => ({ ...p, crNumber: e.target.value }))} placeholder="1010010000" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Environment</Label>
                      <Select value={identity?.environment} onValueChange={handleEnvironmentChange} disabled={!canEdit || setEnvironment.isPending}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select environment" /></SelectTrigger>
                        <SelectContent>
                          {ENVIRONMENT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleSave} disabled={upsertSettings.isPending || !canEdit} className="bg-brand text-brand-foreground hover:bg-brand/90">
                        {upsertSettings.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save company info"}
                      </Button>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Registered address">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Street name</Label>
                        <Input className="h-9" value={draft.street} onChange={(e) => setDraft((p) => ({ ...p, street: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Building number</Label>
                        <Input className="h-9" value={draft.buildingNumber} onChange={(e) => setDraft((p) => ({ ...p, buildingNumber: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">City subdivision (district)</Label>
                        <Input className="h-9" value={draft.city} onChange={(e) => setDraft((p) => ({ ...p, city: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Postal zone</Label>
                        <Input className="h-9" value={draft.postalCode} onChange={(e) => setDraft((p) => ({ ...p, postalCode: e.target.value }))} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">City</Label>
                      <Input className="h-9" value={branch.city ?? ""} disabled title="Edit on the Branches page" />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleSave} disabled={upsertSettings.isPending || !canEdit} className="bg-brand text-brand-foreground hover:bg-brand/90">
                        {upsertSettings.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save address"}
                      </Button>
                    </div>
                  </div>
                </SectionCard>
              </div>

              <SectionCard>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-brand" />
                    <h4 className="text-sm font-semibold text-foreground">ZATCA onboarding</h4>
                  </div>
                  <p className="text-xs text-muted-foreground">Each branch is its own ZATCA EGS device with its own certificate and invoice chain — complete these three steps once per branch to start submitting real invoices from it.</p>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2 rounded-xl border border-black/10 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">1. Generate CSR</span>
                        {identity?.hasCsr && <CheckCircle2 className="h-4 w-4 text-[oklch(0.35_0.1_155)]" />}
                      </div>
                      <p className="text-xs text-muted-foreground">Creates a signing key and certificate request using {branch.nameEn}'s saved VAT number and address.</p>
                      {!draft.vatRegistrationNumber && (
                        <p className="text-xs text-critical">Save this branch's VAT number under Company information above first.</p>
                      )}
                      <Button size="sm" variant="outline" className="w-full" onClick={handleGenerateCsr} disabled={generateCsr.isPending || !canEdit || identityLoading || !draft.vatRegistrationNumber}>
                        {generateCsr.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : identity?.hasCsr ? "Regenerate CSR" : "Generate CSR"}
                      </Button>
                      {identity?.csr && (
                        <div className="space-y-1">
                          <Label className="text-[11px]">Paste this CSR into the ZATCA Fatoora portal to get an OTP</Label>
                          <textarea readOnly value={identity.csr} onFocus={(e) => e.target.select()} className="h-20 w-full rounded-md border border-black/10 bg-black/[0.02] p-2 font-mono text-[10px]" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 rounded-xl border border-black/10 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">2. Compliance CSID</span>
                        {identity?.hasComplianceCsid && <CheckCircle2 className="h-4 w-4 text-[oklch(0.35_0.1_155)]" />}
                      </div>
                      <p className="text-xs text-muted-foreground">Enter the OTP ZATCA gave you for the CSR above.</p>
                      <Input className="h-9" placeholder="OTP from Fatoora portal" value={otp} onChange={(e) => setOtp(e.target.value)} disabled={!identity?.hasCsr || !canEdit} />
                      <Button size="sm" variant="outline" className="w-full" onClick={handleComplianceCsid} disabled={complianceCsid.isPending || !otp || !identity?.hasCsr || !canEdit}>
                        {complianceCsid.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Get Compliance CSID"}
                      </Button>
                    </div>

                    <div className="space-y-2 rounded-xl border border-black/10 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">3. Go to Production</span>
                        {identity?.hasProductionCsid && <CheckCircle2 className="h-4 w-4 text-[oklch(0.35_0.1_155)]" />}
                      </div>
                      <p className="text-xs text-muted-foreground">Runs the required compliance checks, then requests the Production CSID.</p>
                      <Button size="sm" variant="outline" className="w-full" onClick={handleProduction} disabled={productionOnboarding.isPending || !identity?.hasComplianceCsid || !canEdit}>
                        {productionOnboarding.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run Compliance Tests & Get Production CSID"}
                      </Button>
                    </div>
                  </div>

                  {complianceTests.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="py-2 pr-3">Document</th>
                            <th className="py-2 pr-3">ZATCA status</th>
                            <th className="py-2 pr-3">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {complianceTests.map((t) => (
                            <tr key={t.documentType} className="border-t border-black/5">
                              <td className="py-2 pr-3">{t.documentType}</td>
                              <td className="py-2 pr-3 font-mono text-xs">{t.zatcaStatus}</td>
                              <td className="py-2 pr-3"><Pill tone={t.passed ? "success" : "critical"}>{t.passed ? "Passed" : "Failed"}</Pill></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </SectionCard>
            </>
          )}
        </TabsContent>

        <TabsContent value="invoice" className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <SectionCard title="Invoice types enabled">
              <div className="space-y-2">
                {["Simplified Tax Invoice", "Standard Tax Invoice", "Credit Note", "Debit Note", "Refund Invoice"].map((t, i) => (
                  <div key={t} className="flex items-center justify-between rounded-xl border border-black/10 p-3"><span className="text-sm">{t}</span><Switch defaultChecked={i < 4} /></div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Invoice numbering sequence">
              <div className="space-y-3">
                <div className="space-y-1"><Label className="text-xs">Prefix</Label><Input className="h-9" defaultValue="INV-" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Pattern</Label><Input className="h-9" defaultValue="YYYY-######" /></div>
                  <div className="space-y-1"><Label className="text-xs">Next ICV</Label><Input className="h-9" value={String((identity?.lastIcv ?? 0) + 1)} disabled /></div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-black/10 p-3"><span className="text-sm">Reset numbering daily</span><Switch defaultChecked /></div>
                <div className="flex items-center justify-between rounded-xl border border-black/10 p-3"><span className="text-sm">Auto-attach QR to every invoice</span><Switch defaultChecked /></div>
              </div>
            </SectionCard>
          </div>
          <SectionCard title="Invoice QR preview" action={<Pill tone="success">Compliant TLV</Pill>}>
            <div className="flex flex-wrap items-center gap-4">
              {latestInvoiceWithQr?.qrCodeBase64 ? (
                <>
                  <div className="grid h-32 w-32 place-items-center rounded-2xl bg-white p-2">
                    <QRCodeSVG value={latestInvoiceWithQr.qrCodeBase64} size={112} />
                  </div>
                  <div className="min-w-0 space-y-1 font-mono text-xs text-muted-foreground">
                    <div>invoice: {latestInvoiceWithQr.invoiceNumber}</div>
                    <div>total: {latestInvoiceWithQr.totalAmount.toFixed(2)} SAR · vat: {latestInvoiceWithQr.taxAmount.toFixed(2)} SAR</div>
                    <div>hash: {latestInvoiceWithQr.invoiceHash.slice(0, 12)}…</div>
                    <div>submitted: {new Date(latestInvoiceWithQr.issueDate).toLocaleString("en-GB")}</div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="grid h-32 w-32 place-items-center rounded-2xl bg-black/5 text-muted-foreground">
                    <QrCode className="h-16 w-16" />
                  </div>
                  <p className="max-w-xs text-xs text-muted-foreground">No cleared invoice with a QR code yet — complete ZATCA onboarding (Generate CSR) above, then submit an order from POS Checkout.</p>
                </div>
              )}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-3">
          <SectionCard title="Order → Invoice mapping">
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">When to issue invoice</Label>
                  <Select defaultValue="on_pay">
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on_pay">On payment</SelectItem>
                      <SelectItem value="on_confirm">On order confirmation</SelectItem>
                      <SelectItem value="on_dispatch">On dispatch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Failure behaviour</Label>
                  <Select defaultValue="queue">
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="queue">Queue offline &amp; retry</SelectItem>
                      <SelectItem value="block">Block the sale</SelectItem>
                      <SelectItem value="warn">Warn cashier &amp; continue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {["Auto-issue for online orders", "Send invoice over WhatsApp", "Send invoice over email", "Include branch logo"].map((t, i) => (
                <div key={t} className="flex items-center justify-between rounded-xl border border-black/10 p-3"><span className="text-sm">{t}</span><Switch defaultChecked={i !== 3} /></div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <SectionCard title="Credit note rules">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Default reason</Label>
                  <Select defaultValue="return">
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="return">Customer return</SelectItem>
                      <SelectItem value="discount">Post-sale discount</SelectItem>
                      <SelectItem value="error">Billing error</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-black/10 p-3"><span className="text-sm">Require manager approval</span><Switch defaultChecked /></div>
                <div className="flex items-center justify-between rounded-xl border border-black/10 p-3"><span className="text-sm">Auto link to original invoice</span><Switch defaultChecked /></div>
              </div>
            </SectionCard>
            <SectionCard title="Debit note rules">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Default reason</Label>
                  <Select defaultValue="under">
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="under">Under-billing correction</SelectItem>
                      <SelectItem value="extra">Additional service charge</SelectItem>
                      <SelectItem value="tax">Tax recalculation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-black/10 p-3"><span className="text-sm">Require manager approval</span><Switch defaultChecked /></div>
                <div className="flex items-center justify-between rounded-xl border border-black/10 p-3"><span className="text-sm">Notify customer automatically</span><Switch /></div>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="refund" className="mt-4 space-y-3">
          <SectionCard title="Refund invoice settings">
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label className="text-xs">Refund invoice prefix</Label><Input className="h-9" defaultValue="REF-" /></div>
                <div className="space-y-1"><Label className="text-xs">Maximum refund window</Label><Input className="h-9" defaultValue="14 days" /></div>
              </div>
              {["Reverse VAT on refund", "Reverse custom fees on refund", "Print refund receipt automatically"].map((t) => (
                <div key={t} className="flex items-center justify-between rounded-xl border border-black/10 p-3"><span className="text-sm">{t}</span><Switch defaultChecked /></div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="logs" className="mt-4 space-y-3">
          <SectionCard title="Integration logs" desc={`${invoices?.length ?? 0} submissions · ${clearedCount} cleared`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3">Order</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Submitted</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {(invoices ?? []).slice(0, 20).map((i) => (
                    <tr key={i.id} className="border-t border-black/5">
                      <td className="py-2 pr-3 font-mono text-xs">{i.invoiceNumber}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{i.orderNo}</td>
                      <td className="py-2 pr-3">{i.type}</td>
                      <td className="py-2 pr-3">{new Date(i.issueDate).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="py-2 pr-3">
                        <Pill tone={i.status === "Cleared" || i.status === "Submitted" ? "success" : i.status === "Failed" ? "critical" : "warning"}>{i.status}</Pill>
                      </td>
                      <td className="py-2 pr-3">
                        {i.status !== "Cleared" && (
                          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => handleRetry(i.orderId)} disabled={submitInvoice.isPending}>
                            <RefreshCw className="h-3 w-3" />Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!invoices?.length && (
                    <tr><td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No invoices submitted yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="errors" className="mt-4 space-y-3">
          <SectionCard title="Error logs" desc={`${failedInvoices.length} failed submission${failedInvoices.length === 1 ? "" : "s"}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3">Order</th>
                    <th className="py-2 pr-3">Reason</th>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {failedInvoices.map((i) => (
                    <tr key={i.id} className="border-t border-black/5">
                      <td className="py-2 pr-3 font-mono text-xs">{i.invoiceNumber}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{i.orderNo}</td>
                      <td className="py-2 pr-3">{i.zatcaResponse ?? "Clearance rejected"}</td>
                      <td className="py-2 pr-3">{new Date(i.issueDate).toLocaleString("en-GB")}</td>
                      <td className="py-2 pr-3">
                        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => handleRetry(i.orderId)} disabled={submitInvoice.isPending}>
                          <RefreshCw className="h-3 w-3" />Retry submission
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!failedInvoices.length && (
                    <tr><td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No failed submissions.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
