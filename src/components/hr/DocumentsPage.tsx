import { useState } from "react";
import { toast } from "sonner";
import { Upload, RefreshCw, Check } from "lucide-react";
import { PageHeader } from "@/components/buildpos/PageHeader";
import { Pill, SectionCard } from "@/components/buildpos/sections";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHrStore, employeeName, type EmployeeDoc, type Contract } from "@/lib/hr/store";

const TABS = ["Documents", "Contracts", "Expiring", "Document Types", "Contract Templates", "History"];

export function DocumentsPage() {
  const employees = useHrStore((s) => s.employees);
  const docs = useHrStore((s) => s.docs);
  const contracts = useHrStore((s) => s.contracts);
  const addDoc = useHrStore((s) => s.addDoc);
  const verifyDoc = useHrStore((s) => s.verifyDoc);
  const addContract = useHrStore((s) => s.addContract);
  const renew = useHrStore((s) => s.renewContract);
  const [tab, setTab] = useState(0);
  const [docOpen, setDocOpen] = useState(false);
  const [conOpen, setConOpen] = useState(false);
  const [df, setDf] = useState({ empId: "", type: "Driving Licence" as EmployeeDoc["type"], number: "", expiryDate: "", fileName: "" });
  const [cf, setCf] = useState({ empId: "", type: "Full-Time" as Contract["type"], start: new Date().toISOString().slice(0, 10), end: "", jobTitle: "", department: "Delivery & Dispatch", branch: "Riyadh Main Branch" });

  return (
    <div className="space-y-4">
      <PageHeader group="HRMS" title="Documents & Contracts" desc="Employee documents (Iqama, licence, certifications) and contracts. Expiring items alert HR and block operational assignments." primary={tab === 1 ? "New Contract" : "Upload Document"} onPrimary={() => (tab === 1 ? setConOpen(true) : setDocOpen(true))} />
      <div className="flex flex-wrap gap-1 border-b border-black/5">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className={`relative px-3 py-2 text-sm font-medium ${i === tab ? "text-brand" : "text-muted-foreground hover:text-foreground"}`}>
            {t}
            {i === tab && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      {(tab === 0 || tab === 2) && (
        <SectionCard title={tab === 2 ? "Expiring Documents" : "Employee Documents"} desc={`${docs.length} in ledger`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-2 py-2 text-left">DOC #</th><th className="px-2 py-2 text-left">Employee</th><th className="px-2 py-2 text-left">Type</th><th className="px-2 py-2 text-left">Number</th><th className="px-2 py-2 text-left">Expiry</th><th className="px-2 py-2 text-left">Status</th><th className="px-2 py-2 text-left">Verified By</th><th /></tr>
              </thead>
              <tbody>
                {docs.filter((d) => tab !== 2 || d.status === "Expiring Soon" || d.status === "Expired").map((d) => (
                  <tr key={d.id} className="border-t border-black/5">
                    <td className="px-2 py-2 font-mono text-xs">{d.id}</td>
                    <td className="px-2 py-2">{employeeName(employees.find((e) => e.id === d.empId))}</td>
                    <td className="px-2 py-2">{d.type}</td>
                    <td className="px-2 py-2 font-mono text-xs">{d.number ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{d.expiryDate ?? "—"}</td>
                    <td className="px-2 py-2"><Pill tone={d.status === "Valid" ? "success" : d.status === "Expired" ? "critical" : "warning"}>{d.status}</Pill></td>
                    <td className="px-2 py-2 text-xs">{d.verifiedBy ?? "—"}</td>
                    <td className="px-2 py-2 text-right">
                      {d.status === "Pending Verification" ? (
                        <button onClick={() => { verifyDoc(d.id, "HR"); toast.success("Verified"); }} className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] hover:border-success/40 hover:text-success"><Check className="inline h-3 w-3" /> Verify</button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{d.fileName ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === 1 && (
        <SectionCard title="Employment Contracts" desc={`${contracts.length} on file`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr><th className="px-2 py-2 text-left">CON #</th><th className="px-2 py-2 text-left">Employee</th><th className="px-2 py-2 text-left">Type</th><th className="px-2 py-2 text-left">Start</th><th className="px-2 py-2 text-left">End</th><th className="px-2 py-2 text-left">Job Title</th><th className="px-2 py-2 text-left">Status</th><th /></tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="border-t border-black/5">
                    <td className="px-2 py-2 font-mono text-xs">{c.id}</td>
                    <td className="px-2 py-2">{employeeName(employees.find((e) => e.id === c.empId))}</td>
                    <td className="px-2 py-2">{c.type}</td>
                    <td className="px-2 py-2">{c.start}</td>
                    <td className="px-2 py-2">{c.end}</td>
                    <td className="px-2 py-2">{c.jobTitle}</td>
                    <td className="px-2 py-2"><Pill tone={c.status === "Active" ? "success" : c.status === "Expired" ? "critical" : c.status === "Renewed" ? "muted" : "warning"}>{c.status}</Pill>{c.supersededBy && <span className="ml-1 text-[10px] text-muted-foreground">→ {c.supersededBy}</span>}</td>
                    <td className="px-2 py-2 text-right">
                      {c.status !== "Renewed" && c.status !== "Closed" && (
                        <button
                          onClick={() => {
                            const nextEnd = new Date(c.end); nextEnd.setFullYear(nextEnd.getFullYear() + 1);
                            renew(c.id, { empId: c.empId, type: c.type, start: c.end, end: nextEnd.toISOString().slice(0, 10), jobTitle: c.jobTitle, department: c.department, branch: c.branch, status: "Active" });
                            toast.success("Contract renewed");
                          }}
                          className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] hover:border-brand/40 hover:text-brand"
                        >
                          <RefreshCw className="inline h-3 w-3" /> Renew
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {tab === 3 && (
        <SectionCard title="Document Types">
          <ul className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            {["National ID / Iqama", "Employment Contract", "Driving Licence", "Professional Certification", "Branch Assignment Letter", "Warning Letter", "Medical Certificate", "Training Certificate", "Other"].map((t) => (
              <li key={t} className="rounded-lg border border-black/5 bg-canvas p-3 font-medium">{t}</li>
            ))}
          </ul>
        </SectionCard>
      )}
      {tab === 4 && (
        <SectionCard title="Contract Templates">
          <ul className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            {["Full-Time · Standard", "Part-Time", "Fixed-Term", "Temporary"].map((t) => (
              <li key={t} className="rounded-lg border border-black/5 bg-canvas p-3 font-medium">{t}</li>
            ))}
          </ul>
        </SectionCard>
      )}
      {tab === 5 && (
        <SectionCard title="Activity History">
          <p className="text-sm text-muted-foreground">Uploads, verifications, replacements and renewals appear in <strong>HR Activity Logs</strong> with severity and reason.</p>
        </SectionCard>
      )}

      {/* Upload doc */}
      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <select value={df.empId} onChange={(e) => setDf({ ...df, empId: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm">
              <option value="">Employee…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{employeeName(e)}</option>)}
            </select>
            <select value={df.type} onChange={(e) => setDf({ ...df, type: e.target.value as EmployeeDoc["type"] })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm">
              {["National ID / Iqama", "Employment Contract", "Driving Licence", "Professional Certification", "Medical Certificate", "Training Certificate", "Other"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input placeholder="Document number" value={df.number} onChange={(e) => setDf({ ...df, number: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm" />
            <input type="date" placeholder="Expiry" value={df.expiryDate} onChange={(e) => setDf({ ...df, expiryDate: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm" />
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-black/20 bg-canvas p-3 text-xs text-muted-foreground">
              <Upload className="h-4 w-4" />
              <input type="file" onChange={(e) => setDf({ ...df, fileName: e.target.files?.[0]?.name ?? "uploaded.pdf" })} className="flex-1 text-xs" />
            </label>
            <Button onClick={() => {
              if (!df.empId || !df.type) { toast.error("Employee and type required."); return; }
              const isExpiring = df.expiryDate && new Date(df.expiryDate).getTime() - Date.now() < 60 * 86400_000;
              addDoc({ ...df, status: isExpiring ? "Expiring Soon" : "Pending Verification" });
              toast.success("Document uploaded");
              setDf({ empId: "", type: "Driving Licence", number: "", expiryDate: "", fileName: "" });
              setDocOpen(false);
            }} className="bg-brand text-brand-foreground hover:bg-brand/90">Upload</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New contract */}
      <Dialog open={conOpen} onOpenChange={setConOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <select value={cf.empId} onChange={(e) => setCf({ ...cf, empId: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm">
              <option value="">Employee…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{employeeName(e)}</option>)}
            </select>
            <select value={cf.type} onChange={(e) => setCf({ ...cf, type: e.target.value as Contract["type"] })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm">
              {["Full-Time", "Part-Time", "Fixed-Term", "Temporary"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={cf.start} onChange={(e) => setCf({ ...cf, start: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm" />
              <input type="date" value={cf.end} onChange={(e) => setCf({ ...cf, end: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm" />
            </div>
            <input placeholder="Job Title" value={cf.jobTitle} onChange={(e) => setCf({ ...cf, jobTitle: e.target.value })} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm" />
            <Button onClick={() => {
              if (!cf.empId || !cf.end || !cf.jobTitle) { toast.error("Employee, end date and job title required."); return; }
              if (cf.end <= cf.start) { toast.error("End date must be after start date."); return; }
              addContract({ ...cf, status: "Active" });
              toast.success("Contract created");
              setConOpen(false);
            }} className="bg-brand text-brand-foreground hover:bg-brand/90">Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}