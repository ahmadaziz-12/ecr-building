import { create } from "zustand";
import { useAuditStore } from "@/lib/store/audit";
import {
  apiCheckIn, apiCheckOut, apiAdjustAttendance, apiUpdateLeaveStatus, apiVerifyDoc, backendEmpId,
  ATTENDANCE_SOURCE_TO_BACKEND, LEAVE_TYPE_TO_BACKEND, LEAVE_STATUS_TO_BACKEND, DOC_TYPE_TO_BACKEND, CONTRACT_TYPE_TO_BACKEND,
} from "@/lib/api/hr";
import { apiPost, apiPut } from "@/lib/api/client";

export type EmploymentStatus =
  | "Active"
  | "Probation"
  | "On Leave"
  | "Suspended"
  | "Resigned"
  | "Terminated"
  | "Inactive";

export type AttendanceStatus =
  | "Present"
  | "Late"
  | "Absent"
  | "On Leave"
  | "Half Day"
  | "Off Day"
  | "Holiday"
  | "Missing Check-In"
  | "Missing Check-Out"
  | "Manual Adjustment";

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  arabicName?: string;
  nationality?: string;
  dob?: string;
  gender?: "Male" | "Female";
  mobile: string;
  email?: string;
  nationalId?: string;
  iqamaExpiry?: string;
  address?: string;
  emergencyContact?: string;
  joiningDate: string;
  employmentType: "Full-Time" | "Part-Time" | "Contract" | "Temporary";
  department: string;
  designation: string;
  reportingManager?: string;
  branch: string;
  status: EmploymentStatus;
  shiftId?: string;
  workingDays?: string[];
  weeklyOff?: string;
  userId?: string;
  role?: string;
  drivingLicense?: string;
  licenseExpiry?: string;
  vehicleId?: string;
  profileImage?: string;
  _backendId?: number;
  _departmentId?: number;
  _branchId?: number;
};

export type Department = {
  id: string;
  name: string;
  arabicName?: string;
  code: string;
  managerEmpId?: string;
  branchScope: "All Branches" | "Selected Branches" | "Single Branch";
  branches?: string[];
  status: "Active" | "Inactive";
  parent?: string;
  _backendId?: number;
};

export type Shift = {
  id: string;
  name: string;
  code: string;
  start: string; // HH:mm
  end: string;
  breakMin: number;
  workingHours: number;
  graceMin: number;
  overtimeStartMin?: number;
  crossMidnight?: boolean;
  departments?: string[];
  status: "Active" | "Inactive";
  _backendId?: number;
};

export type Attendance = {
  id: string;
  empId: string;
  date: string; // ISO date
  shiftId?: string;
  scheduledIn?: string;
  scheduledOut?: string;
  checkIn?: string;
  checkOut?: string;
  workedHours?: number;
  lateMin?: number;
  overtimeMin?: number;
  status: AttendanceStatus;
  source: "Biometric" | "PIN" | "Terminal" | "Manual" | "Mobile";
  note?: string;
  _backendId?: number;
};

export type Leave = {
  id: string;
  empId: string;
  type: "Annual Leave" | "Sick Leave" | "Emergency Leave" | "Unpaid Leave" | "Other Approved Leave";
  start: string;
  end: string;
  days: number;
  halfDay?: boolean;
  reason?: string;
  handoverTo?: string;
  attachment?: string;
  approver?: string;
  status: "Draft" | "Submitted" | "Pending Manager" | "Pending HR" | "Approved" | "Rejected" | "Cancelled" | "Completed";
  _backendId?: number;
};

export type EmployeeDoc = {
  id: string;
  empId: string;
  type:
    | "National ID / Iqama"
    | "Employment Contract"
    | "Driving Licence"
    | "Professional Certification"
    | "Branch Assignment Letter"
    | "Warning Letter"
    | "Medical Certificate"
    | "Training Certificate"
    | "Other";
  number?: string;
  issueDate?: string;
  expiryDate?: string;
  issuer?: string;
  status: "Valid" | "Expiring Soon" | "Expired" | "Pending Verification" | "Rejected" | "Replaced";
  verifiedBy?: string;
  notes?: string;
  fileName?: string;
  _backendId?: number;
};

export type Contract = {
  id: string;
  empId: string;
  type: "Full-Time" | "Part-Time" | "Fixed-Term" | "Temporary";
  number?: string;
  start: string;
  end: string;
  probationEnd?: string;
  jobTitle: string;
  department: string;
  branch: string;
  workingHours?: string;
  workingDays?: string;
  noticePeriod?: string;
  status: "Draft" | "Active" | "Expiring Soon" | "Expired" | "Renewed" | "Closed" | "Terminated";
  supersededBy?: string;
  attachment?: string;
  _backendId?: number;
};

type Lookups = { departmentIdByName: Record<string, number>; branchIdByName: Record<string, number> };

type S = {
  employees: Employee[];
  departments: Department[];
  shifts: Shift[];
  attendance: Attendance[];
  leaves: Leave[];
  docs: EmployeeDoc[];
  contracts: Contract[];
  empSeq: number;
  lookups: Lookups;
  setSynced: (data: Partial<Pick<S, "employees" | "departments" | "shifts" | "attendance" | "leaves" | "docs" | "contracts" | "lookups">>) => void;
  addEmployee: (e: Omit<Employee, "id">) => Employee;
  updateEmployee: (id: string, p: Partial<Employee>) => void;
  deactivateEmployee: (id: string) => void;
  addDepartment: (d: Omit<Department, "id">) => void;
  updateDepartment: (id: string, p: Partial<Department>) => void;
  addShift: (s: Omit<Shift, "id">) => void;
  checkIn: (empId: string, source: Attendance["source"], time?: string) => Attendance;
  checkOut: (empId: string, time?: string) => void;
  adjustAttendance: (id: string, patch: Partial<Attendance>, reason: string) => void;
  addLeave: (l: Omit<Leave, "id">) => Leave;
  updateLeaveStatus: (id: string, status: Leave["status"], approver?: string) => void;
  addDoc: (d: Omit<EmployeeDoc, "id">) => void;
  verifyDoc: (id: string, by: string) => void;
  addContract: (c: Omit<Contract, "id">) => void;
  renewContract: (id: string, newC: Omit<Contract, "id">) => void;
  reset: () => void;
};

function nowHHMM() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

function minutesBetween(a?: string, b?: string) {
  if (!a || !b) return 0;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

let empSeqCounter = 30;

export const useHrStore = create<S>()((set, get) => ({
  employees: [],
  departments: [],
  shifts: [],
  attendance: [],
  leaves: [],
  docs: [],
  contracts: [],
  empSeq: empSeqCounter,
  lookups: { departmentIdByName: {}, branchIdByName: {} },
  setSynced: (data) => set((s) => ({ ...s, ...data })),

  addEmployee: (e) => {
    const id = `EMP-${String(get().empSeq).padStart(3, "0")}`;
    const emp: Employee = { ...e, id };
    set((s) => ({ employees: [emp, ...s.employees], empSeq: s.empSeq + 1 }));
    useAuditStore.getState().log({
      module: "hr", event: "EMPLOYEE_CREATED", recordId: id, employee: `${emp.firstName} ${emp.lastName}`, branch: emp.branch, severity: "info", newValue: emp.department,
    });

    const { departmentIdByName, branchIdByName } = get().lookups;
    const departmentId = departmentIdByName[emp.department];
    const branchId = branchIdByName[emp.branch];
    if (departmentId && branchId) {
      apiPost("/api/hr/employees", {
        firstName: emp.firstName, lastName: emp.lastName, arabicName: emp.arabicName ?? null,
        mobile: emp.mobile, email: emp.email ?? null, joiningDate: emp.joiningDate,
        employmentType: emp.employmentType.replace("-", ""), departmentId, designation: emp.designation,
        reportingManagerId: null, branchId, shiftId: emp.shiftId ? Number(emp.shiftId.replace("HRS-", "")) : null,
        userId: null, createUserAccount: false, password: null,
        drivingLicense: emp.drivingLicense ?? null, licenseExpiry: emp.licenseExpiry ?? null,
      }).then((created: unknown) => {
        const backendId = (created as { id: number }).id;
        set((s) => ({ employees: s.employees.map((x) => (x.id === id ? { ...x, _backendId: backendId } : x)) }));
      }).catch((err) => console.warn("Employee not persisted to backend:", err));
    }
    return emp;
  },
  updateEmployee: (id, p) => {
    set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, ...p } : e)) }));
    useAuditStore.getState().log({ module: "hr", event: "EMPLOYEE_UPDATED", recordId: id, severity: "info" });
  },
  deactivateEmployee: (id) => {
    set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, status: "Inactive" } : e)) }));
    useAuditStore.getState().log({ module: "hr", event: "EMPLOYEE_DEACTIVATED", recordId: id, severity: "warning" });
    const backendId = get().employees.find((e) => e.id === id)?._backendId;
    if (backendId) apiPut(`/api/hr/employees/${backendId}/deactivate`).catch((err) => console.warn("Deactivation not persisted:", err));
  },
  addDepartment: (d) =>
    set((s) => {
      const id = `DEP-${String(s.departments.length + 1).padStart(3, "0")}`;
      useAuditStore.getState().log({ module: "hr", event: "DEPARTMENT_CREATED", recordId: id, severity: "info", newValue: d.name });
      apiPost("/api/hr/departments", {
        name: d.name, arabicName: d.arabicName ?? null, code: d.code,
        managerEmployeeId: backendEmpId(d.managerEmpId) ?? null, branchScope: d.branchScope.replace(/\s/g, ""), parentId: null,
      }).catch((err) => console.warn("Department not persisted:", err));
      return { departments: [...s.departments, { ...d, id }] };
    }),
  updateDepartment: (id, p) =>
    set((s) => ({ departments: s.departments.map((d) => (d.id === id ? { ...d, ...p } : d)) })),
  addShift: (sh) =>
    set((s) => {
      const id = `HRS-${String(s.shifts.length + 1).padStart(3, "0")}`;
      useAuditStore.getState().log({ module: "hr", event: "SHIFT_TEMPLATE_CREATED", recordId: id, severity: "info", newValue: sh.name });
      apiPost("/api/hr/shifts", {
        name: sh.name, code: sh.code, start: sh.start, end: sh.end, breakMin: sh.breakMin, workingHours: sh.workingHours, graceMin: sh.graceMin,
      }).catch((err) => console.warn("Shift not persisted:", err));
      return { shifts: [...s.shifts, { ...sh, id }] };
    }),
  checkIn: (empIdStr, source, time) => {
    const t = time ?? nowHHMM();
    const emp = get().employees.find((e) => e.id === empIdStr);
    const shift = emp?.shiftId ? get().shifts.find((sh) => sh.id === emp.shiftId) : undefined;
    const late = shift ? Math.max(0, minutesBetween(shift.start, t) - shift.graceMin) : 0;
    const rec: Attendance = {
      id: `ATT-${Date.now()}`,
      empId: empIdStr,
      date: new Date().toISOString().slice(0, 10),
      shiftId: shift?.id,
      scheduledIn: shift?.start,
      scheduledOut: shift?.end,
      checkIn: t,
      lateMin: late,
      status: late > 0 ? "Late" : "Present",
      source,
    };
    set((s) => ({ attendance: [rec, ...s.attendance] }));
    useAuditStore.getState().log({
      module: "hr", event: "EMPLOYEE_CHECKED_IN", recordId: rec.id, employee: emp ? `${emp.firstName} ${emp.lastName}` : empIdStr, branch: emp?.branch, severity: late > 0 ? "warning" : "info", newValue: t,
    });

    const backendId = backendEmpId(empIdStr);
    if (backendId) {
      apiCheckIn({ employeeId: backendId, source: ATTENDANCE_SOURCE_TO_BACKEND[source] ?? source })
        .catch((err) => console.warn("Check-in not persisted:", err));
    }
    return rec;
  },
  checkOut: (empIdStr, time) => {
    const t = time ?? nowHHMM();
    set((s) => {
      const idx = s.attendance.findIndex((a) => a.empId === empIdStr && a.date === new Date().toISOString().slice(0, 10) && a.checkIn && !a.checkOut);
      if (idx === -1) return {};
      const a = s.attendance[idx];
      const worked = Math.max(0, minutesBetween(a.checkIn, t)) / 60;
      const shift = a.shiftId ? s.shifts.find((sh) => sh.id === a.shiftId) : undefined;
      const breakMin = shift?.breakMin ?? 0;
      const workedH = Math.max(0, worked - breakMin / 60);
      const next = [...s.attendance];
      next[idx] = { ...a, checkOut: t, workedHours: Number(workedH.toFixed(2)) };
      useAuditStore.getState().log({ module: "hr", event: "EMPLOYEE_CHECKED_OUT", recordId: a.id, employee: a.empId, severity: "info", newValue: t });
      return { attendance: next };
    });
    const backendId = backendEmpId(empIdStr);
    if (backendId) apiCheckOut({ employeeId: backendId }).catch((err) => console.warn("Check-out not persisted:", err));
  },
  adjustAttendance: (id, patch, reason) => {
    set((s) => ({ attendance: s.attendance.map((a) => (a.id === id ? { ...a, ...patch, status: "Manual Adjustment" } : a)) }));
    useAuditStore.getState().log({ module: "hr", event: "ATTENDANCE_ADJUSTMENT_APPROVED", recordId: id, reason, severity: "warning" });
    const backendId = get().attendance.find((a) => a.id === id)?._backendId;
    if (backendId) apiAdjustAttendance(backendId, { checkIn: patch.checkIn, checkOut: patch.checkOut, reason }).catch((err) => console.warn("Adjustment not persisted:", err));
  },
  addLeave: (l) => {
    const id = `LEV-2026-${String((get().leaves.length + 84)).padStart(4, "0")}`;
    const rec: Leave = { ...l, id };
    set((s) => ({ leaves: [rec, ...s.leaves] }));
    useAuditStore.getState().log({ module: "hr", event: "LEAVE_CREATED", recordId: id, employee: l.empId, severity: "info", newValue: l.type });

    const backendId = backendEmpId(l.empId);
    if (backendId) {
      apiPost("/api/hr/leaves", {
        employeeId: backendId, type: LEAVE_TYPE_TO_BACKEND[l.type] ?? l.type, start: l.start, end: l.end, days: l.days,
        halfDay: l.halfDay ?? false, reason: l.reason ?? null, handoverToEmployeeId: backendEmpId(l.handoverTo) ?? null, attachment: l.attachment ?? null,
      }).then((created: unknown) => {
        const backendLeaveId = (created as { id: number }).id;
        set((s) => ({ leaves: s.leaves.map((x) => (x.id === id ? { ...x, _backendId: backendLeaveId } : x)) }));
      }).catch((err) => console.warn("Leave not persisted:", err));
    }
    return rec;
  },
  updateLeaveStatus: (id, status, approver) => {
    set((s) => ({ leaves: s.leaves.map((l) => (l.id === id ? { ...l, status, approver: approver ?? l.approver } : l)) }));
    useAuditStore.getState().log({ module: "hr", event: `LEAVE_${status.toUpperCase().replace(/\s/g, "_")}`, recordId: id, severity: status === "Rejected" ? "warning" : "info", newValue: status });

    const l = get().leaves.find((x) => x.id === id);
    if (l) {
      const emp = get().employees.find((e) => e.id === l.empId);
      if (emp) {
        const t = new Date().toISOString().slice(0, 10);
        if (status === "Approved" && t >= l.start && t <= l.end) {
          set((s) => ({
            employees: s.employees.map((e) => (e.id === l.empId ? { ...e, status: "On Leave" } : e)),
            attendance: [
              { id: `ATT-${Date.now()}`, empId: l.empId, date: t, status: "On Leave", source: "Manual" as const },
              ...s.attendance.filter((a) => !(a.empId === l.empId && a.date === t)),
            ],
          }));
        }
      }
    }
    const backendId = l?._backendId;
    if (backendId) {
      apiUpdateLeaveStatus(backendId, { status: LEAVE_STATUS_TO_BACKEND[status] ?? status, approverEmployeeId: backendEmpId(approver) })
        .catch((err) => console.warn("Leave status not persisted:", err));
    }
  },
  addDoc: (d) =>
    set((s) => {
      const id = `DOC-${String(1000 + s.docs.length + 4).padStart(4, "0")}`;
      useAuditStore.getState().log({ module: "hr", event: "DOCUMENT_UPLOADED", recordId: id, employee: d.empId, severity: "info", newValue: d.type });
      const backendId = backendEmpId(d.empId);
      if (backendId) {
        apiPost("/api/hr/documents", {
          employeeId: backendId, type: DOC_TYPE_TO_BACKEND[d.type] ?? d.type, number: d.number ?? null,
          issueDate: d.issueDate ?? null, expiryDate: d.expiryDate ?? null, issuer: d.issuer ?? null, fileName: d.fileName ?? null,
        }).catch((err) => console.warn("Document not persisted:", err));
      }
      return { docs: [{ ...d, id }, ...s.docs] };
    }),
  verifyDoc: (id, by) => {
    set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, status: "Valid", verifiedBy: by } : d)) }));
    useAuditStore.getState().log({ module: "hr", event: "DOCUMENT_VERIFIED", recordId: id, severity: "info", newValue: by });
    const backendId = get().docs.find((d) => d.id === id)?._backendId;
    const byBackendId = backendEmpId(by) ?? get().employees.find((e) => `${e.firstName} ${e.lastName}` === by)?._backendId;
    if (backendId && byBackendId) apiVerifyDoc(backendId, { verifiedByEmployeeId: byBackendId }).catch((err) => console.warn("Doc verify not persisted:", err));
  },
  addContract: (c) =>
    set((s) => {
      const id = `CON-${String(2000 + s.contracts.length + 4).padStart(4, "0")}`;
      useAuditStore.getState().log({ module: "hr", event: "CONTRACT_CREATED", recordId: id, employee: c.empId, severity: "info" });
      const backendId = backendEmpId(c.empId);
      const { departmentIdByName, branchIdByName } = get().lookups;
      const departmentId = departmentIdByName[c.department];
      const branchId = branchIdByName[c.branch];
      if (backendId && departmentId && branchId) {
        apiPost("/api/hr/contracts", {
          employeeId: backendId, type: CONTRACT_TYPE_TO_BACKEND[c.type] ?? c.type, number: c.number ?? null,
          start: c.start, end: c.end, probationEnd: c.probationEnd ?? null, jobTitle: c.jobTitle, departmentId, branchId,
        }).catch((err) => console.warn("Contract not persisted:", err));
      }
      return { contracts: [{ ...c, id }, ...s.contracts] };
    }),
  renewContract: (id, newC) =>
    set((s) => {
      const nextId = `CON-${String(2000 + s.contracts.length + 4).padStart(4, "0")}`;
      const next = s.contracts.map((c) => (c.id === id ? { ...c, status: "Renewed" as const, supersededBy: nextId } : c));
      useAuditStore.getState().log({ module: "hr", event: "CONTRACT_RENEWED", recordId: nextId, employee: newC.empId, severity: "info", oldValue: id });
      return { contracts: [{ ...newC, id: nextId }, ...next] };
    }),
  reset: () => set({ employees: [], departments: [], shifts: [], attendance: [], leaves: [], docs: [], contracts: [], empSeq: 30 }),
}));

/* --- selectors --- */

export function employeeName(e: Employee | undefined) {
  if (!e) return "—";
  return `${e.firstName} ${e.lastName}`;
}

/** Driver availability derived from HR state: leave, license, employee status. */
export function driverAvailable(empId: string): { ok: boolean; reason?: string } {
  const s = useHrStore.getState();
  const emp = s.employees.find((e) => e.id === empId);
  if (!emp) return { ok: false, reason: "Employee not found" };
  if (emp.status !== "Active") return { ok: false, reason: `Status: ${emp.status}` };
  if (emp.licenseExpiry && new Date(emp.licenseExpiry) < new Date()) return { ok: false, reason: "Driving licence expired" };
  const today = new Date().toISOString().slice(0, 10);
  const onLeave = s.leaves.find((l) => l.empId === empId && l.status === "Approved" && today >= l.start && today <= l.end);
  if (onLeave) return { ok: false, reason: "On approved leave" };
  const att = s.attendance.find((a) => a.empId === empId && a.date === today);
  if (att?.status === "On Leave") return { ok: false, reason: "On leave" };
  return { ok: true };
}
