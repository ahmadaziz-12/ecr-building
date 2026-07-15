import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, UserPlus, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useHrStore, type Employee } from "@/lib/hr/store";

const STEPS = ["Personal", "Employment", "Shift", "System Access", "Documents", "Review"];

export function AddEmployeeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [step, setStep] = useState(0);
  const departments = useHrStore((s) => s.departments);
  const shifts = useHrStore((s) => s.shifts);
  const addEmployee = useHrStore((s) => s.addEmployee);
  const addDoc = useHrStore((s) => s.addDoc);
  const addContract = useHrStore((s) => s.addContract);

  const [f, setF] = useState({
    firstName: "",
    lastName: "",
    arabicName: "",
    nationality: "Saudi",
    dob: "",
    gender: "Male" as "Male" | "Female",
    mobile: "",
    email: "",
    nationalId: "",
    iqamaExpiry: "",
    address: "",
    emergencyContact: "",
    joiningDate: new Date().toISOString().slice(0, 10),
    employmentType: "Full-Time" as Employee["employmentType"],
    department: "Delivery & Dispatch",
    designation: "Driver",
    reportingManager: "",
    branch: "Riyadh Main Branch",
    status: "Probation" as Employee["status"],
    shiftId: "HRS-004",
    attendanceMethod: "Biometric" as "PIN" | "Biometric" | "Manual" | "Terminal Check-In",
    createUser: true,
    username: "",
    role: "Driver",
    drivingLicense: "",
    licenseExpiry: "",
    contractStart: new Date().toISOString().slice(0, 10),
    contractEnd: "",
  });

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) setTimeout(() => setStep(0), 200);
  }

  function submit() {
    if (!f.firstName || !f.lastName || !f.mobile) { toast.error("First name, last name and mobile are required."); return; }
    if (!f.department || !f.branch) { toast.error("Department and branch are required."); return; }
    if (f.designation.toLowerCase().includes("driver") && !f.drivingLicense) { toast.error("Driver designation requires a driving licence."); return; }
    if (f.employmentType === "Contract" && !f.contractEnd) { toast.error("Contract employee requires contract end date."); return; }

    const emp = addEmployee({
      firstName: f.firstName,
      lastName: f.lastName,
      arabicName: f.arabicName || undefined,
      nationality: f.nationality,
      dob: f.dob || undefined,
      gender: f.gender,
      mobile: f.mobile,
      email: f.email || undefined,
      nationalId: f.nationalId || undefined,
      iqamaExpiry: f.iqamaExpiry || undefined,
      address: f.address || undefined,
      emergencyContact: f.emergencyContact || undefined,
      joiningDate: f.joiningDate,
      employmentType: f.employmentType,
      department: f.department,
      designation: f.designation,
      reportingManager: f.reportingManager || undefined,
      branch: f.branch,
      status: f.status,
      shiftId: f.shiftId,
      userId: f.createUser ? `USR-${String(Date.now()).slice(-3)}` : undefined,
      role: f.role || undefined,
      drivingLicense: f.drivingLicense || undefined,
      licenseExpiry: f.licenseExpiry || undefined,
    });

    if (f.drivingLicense && f.licenseExpiry) {
      addDoc({ empId: emp.id, type: "Driving Licence", number: f.drivingLicense, expiryDate: f.licenseExpiry, status: "Valid", fileName: "licence.pdf" });
    }
    if (f.contractEnd) {
      addContract({ empId: emp.id, type: f.employmentType === "Full-Time" ? "Full-Time" : "Fixed-Term", start: f.contractStart, end: f.contractEnd, jobTitle: f.designation, department: f.department, branch: f.branch, status: "Active" });
    }

    toast.success(`${emp.id} created`, { description: f.createUser ? `Linked to user ${emp.userId}` : "No user account created" });
    close(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl overflow-hidden p-0 sm:rounded-2xl">
        <div className="grid md:grid-cols-[220px_1fr]">
          <div className="relative hidden bg-sidebar-bg p-5 text-sidebar-fg md:block">
            <div className="pointer-events-none absolute inset-0 blueprint-grid-dark opacity-40" />
            <div className="relative">
              <div className="mb-4 flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/10"><UserPlus className="h-4 w-4" /></div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">HR</p>
                  <p className="text-sm font-semibold">Add Employee</p>
                </div>
              </div>
              <ol className="space-y-1">
                {STEPS.map((s, i) => (
                  <li key={s}>
                    <button
                      onClick={() => i <= step && setStep(i)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                        i === step ? "bg-white/10 text-white" : i < step ? "text-white/80 hover:bg-white/5" : "text-white/40"
                      }`}
                    >
                      <span className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-bold ${
                        i < step ? "bg-success text-success-foreground" : i === step ? "bg-white text-brand" : "bg-white/10 text-white/60"
                      }`}>
                        {i < step ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <span className="truncate font-medium">{s}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="relative flex max-h-[85vh] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-black/5 px-6 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">Step {step + 1} of {STEPS.length}</p>
                <h2 className="font-display text-lg font-bold">{STEPS[step]}</h2>
              </div>
              <button onClick={() => close(false)} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-black/5"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {step === 0 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <T label="First Name *" v={f.firstName} on={(v) => setF({ ...f, firstName: v })} />
                  <T label="Last Name *" v={f.lastName} on={(v) => setF({ ...f, lastName: v })} />
                  <T label="Arabic Name" v={f.arabicName} on={(v) => setF({ ...f, arabicName: v })} />
                  <T label="Nationality" v={f.nationality} on={(v) => setF({ ...f, nationality: v })} />
                  <T label="Date of Birth" type="date" v={f.dob} on={(v) => setF({ ...f, dob: v })} />
                  <S label="Gender" v={f.gender} on={(v) => setF({ ...f, gender: v as "Male" | "Female" })} options={["Male", "Female"]} />
                  <T label="Mobile *" v={f.mobile} on={(v) => setF({ ...f, mobile: v })} />
                  <T label="Email" v={f.email} on={(v) => setF({ ...f, email: v })} />
                  <T label="National ID / Iqama" v={f.nationalId} on={(v) => setF({ ...f, nationalId: v })} />
                  <T label="Iqama Expiry" type="date" v={f.iqamaExpiry} on={(v) => setF({ ...f, iqamaExpiry: v })} />
                  <T label="Emergency Contact" v={f.emergencyContact} on={(v) => setF({ ...f, emergencyContact: v })} />
                  <T label="Address" v={f.address} on={(v) => setF({ ...f, address: v })} />
                </div>
              )}

              {step === 1 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <T label="Joining Date" type="date" v={f.joiningDate} on={(v) => setF({ ...f, joiningDate: v })} />
                  <S label="Employment Type" v={f.employmentType} on={(v) => setF({ ...f, employmentType: v as Employee["employmentType"] })} options={["Full-Time", "Part-Time", "Contract", "Temporary"]} />
                  <S label="Department" v={f.department} on={(v) => setF({ ...f, department: v })} options={departments.map((d) => d.name)} />
                  <T label="Designation" v={f.designation} on={(v) => setF({ ...f, designation: v })} />
                  <T label="Reporting Manager" v={f.reportingManager} on={(v) => setF({ ...f, reportingManager: v })} />
                  <S label="Branch" v={f.branch} on={(v) => setF({ ...f, branch: v })} options={["Riyadh Main Branch", "Jeddah Branch", "Dammam Branch", "Makkah Branch", "Madinah Branch", "Khobar Building Materials Branch"]} />
                  <S label="Employment Status" v={f.status} on={(v) => setF({ ...f, status: v as Employee["status"] })} options={["Active", "Probation", "On Leave", "Suspended", "Resigned", "Terminated", "Inactive"]} />
                  <T label="Contract End" type="date" v={f.contractEnd} on={(v) => setF({ ...f, contractEnd: v })} />
                </div>
              )}

              {step === 2 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <S label="Shift" v={f.shiftId} on={(v) => setF({ ...f, shiftId: v })} options={shifts.map((s) => `${s.id}`)} />
                  <S label="Attendance Method" v={f.attendanceMethod} on={(v) => setF({ ...f, attendanceMethod: v as typeof f.attendanceMethod })} options={["PIN", "Biometric", "Manual", "Terminal Check-In"]} />
                </div>
              )}

              {step === 3 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="md:col-span-2 flex items-center gap-2 rounded-lg border border-black/5 bg-canvas p-3 text-sm">
                    <input type="checkbox" checked={f.createUser} onChange={(e) => setF({ ...f, createUser: e.target.checked })} />
                    Create linked user account
                  </label>
                  <T label="Username" v={f.username} on={(v) => setF({ ...f, username: v })} />
                  <T label="Role" v={f.role} on={(v) => setF({ ...f, role: v })} />
                </div>
              )}

              {step === 4 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <T label="Driving Licence" v={f.drivingLicense} on={(v) => setF({ ...f, drivingLicense: v })} />
                  <T label="Licence Expiry" type="date" v={f.licenseExpiry} on={(v) => setF({ ...f, licenseExpiry: v })} />
                  <p className="md:col-span-2 rounded bg-info/10 px-3 py-2 text-xs text-foreground/80">
                    Uploads are simulated — file name is recorded; actual bytes aren't sent anywhere. For real uploads enable Lovable Cloud storage.
                  </p>
                </div>
              )}

              {step === 5 && (
                <div className="rounded-xl border border-black/5 bg-canvas p-4 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">Summary</p>
                  <ul className="mt-2 grid grid-cols-2 gap-y-1">
                    <li><span className="text-muted-foreground">Name:</span> <strong>{f.firstName} {f.lastName}</strong></li>
                    <li><span className="text-muted-foreground">Department:</span> <strong>{f.department}</strong></li>
                    <li><span className="text-muted-foreground">Designation:</span> <strong>{f.designation}</strong></li>
                    <li><span className="text-muted-foreground">Branch:</span> <strong>{f.branch}</strong></li>
                    <li><span className="text-muted-foreground">Shift:</span> <strong>{f.shiftId}</strong></li>
                    <li><span className="text-muted-foreground">User account:</span> <strong>{f.createUser ? "Yes" : "No"}</strong></li>
                    <li><span className="text-muted-foreground">Licence:</span> <strong>{f.drivingLicense || "—"}</strong></li>
                    <li><span className="text-muted-foreground">Contract end:</span> <strong>{f.contractEnd || "—"}</strong></li>
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-white px-6 py-3">
              <Button variant="ghost" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}><ChevronLeft className="h-4 w-4" /> Back</Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => close(false)}>Cancel</Button>
                {step < STEPS.length - 1 ? (
                  <Button size="sm" onClick={() => setStep(step + 1)} className="bg-brand text-brand-foreground hover:bg-brand/90">Continue <ChevronRight className="h-4 w-4" /></Button>
                ) : (
                  <Button size="sm" onClick={submit} className="bg-brand text-brand-foreground hover:bg-brand/90"><Check className="h-4 w-4" /> Save Employee</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function T({ label, v, on, type = "text" }: { label: string; v: string; on: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
    </div>
  );
}
function S({ label, v, on, options }: { label: string; v: string; on: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <select value={v} onChange={(e) => on(e.target.value)} className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}