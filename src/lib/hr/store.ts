import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuditStore } from "@/lib/store/audit";

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
};

/* --- seed --- */

const seedEmployees: Employee[] = [
  { id: "EMP-001", firstName: "Ahmed", lastName: "Al-Harbi", arabicName: "أحمد الحربي", department: "Store Operations", designation: "Store Manager", branch: "Riyadh Main Branch", reportingManager: "Regional Operations Manager", joiningDate: "2024-01-15", employmentType: "Full-Time", shiftId: "HRS-001", mobile: "+966 50 100 2001", email: "ahmed.harbi@albinaa.sa", status: "Active", userId: "USR-001", role: "Store Manager" },
  { id: "EMP-002", firstName: "Fahad", lastName: "Al-Qahtani", department: "Cashier Operations", designation: "Senior Cashier", branch: "Riyadh Main Branch", joiningDate: "2024-03-01", employmentType: "Full-Time", shiftId: "HRS-001", mobile: "+966 50 200 2002", status: "Active", userId: "USR-014", role: "Senior Cashier" },
  { id: "EMP-003", firstName: "Sara", lastName: "Al-Otaibi", department: "Cashier Operations", designation: "Cashier", branch: "Riyadh Main Branch", joiningDate: "2025-09-01", employmentType: "Full-Time", shiftId: "HRS-001", mobile: "+966 50 300 2003", status: "Active", role: "Cashier" },
  { id: "EMP-004", firstName: "Khalid", lastName: "Al-Mutairi", department: "Cashier Operations", designation: "Cashier", branch: "Riyadh Main Branch", joiningDate: "2024-11-20", employmentType: "Full-Time", shiftId: "HRS-002", mobile: "+966 50 400 2004", status: "Active", role: "Cashier" },
  { id: "EMP-005", firstName: "Noura", lastName: "Al-Salem", department: "Inventory", designation: "Inventory Officer", branch: "Riyadh Main Branch", joiningDate: "2024-05-10", employmentType: "Full-Time", shiftId: "HRS-001", mobile: "+966 50 500 2005", status: "Active", role: "Inventory Officer" },
  { id: "EMP-006", firstName: "Hamad", lastName: "Al-Qahtani", department: "Delivery & Dispatch", designation: "Driver", branch: "Riyadh Main Branch", joiningDate: "2024-04-01", employmentType: "Full-Time", shiftId: "HRS-004", mobile: "+966 50 311 4567", status: "Active", drivingLicense: "DL-966-77821", licenseExpiry: "2027-03-18", vehicleId: "TRK-07", role: "Driver" },
  { id: "EMP-007", firstName: "Maha", lastName: "Al-Rashid", department: "Procurement", designation: "Procurement Manager", branch: "Riyadh Main Branch", joiningDate: "2023-08-15", employmentType: "Full-Time", shiftId: "HRS-001", mobile: "+966 50 700 2007", status: "Active", userId: "USR-052", role: "Procurement Manager" },
  { id: "EMP-014", firstName: "Saad", lastName: "Al-Dossari", department: "Delivery & Dispatch", designation: "Driver", branch: "Riyadh Main Branch", joiningDate: "2024-06-01", employmentType: "Full-Time", shiftId: "HRS-004", mobile: "+966 50 411 2234", status: "Active", drivingLicense: "DL-966-88112", licenseExpiry: "2027-08-01", vehicleId: "VAN-02" },
  { id: "EMP-020", firstName: "Khaled", lastName: "Al-Harthi", department: "Delivery & Dispatch", designation: "Driver", branch: "Riyadh Main Branch", joiningDate: "2024-07-01", employmentType: "Full-Time", shiftId: "HRS-004", mobile: "+966 50 511 3345", status: "Active", drivingLicense: "DL-966-99034", licenseExpiry: "2026-12-11", vehicleId: "TRK-03" },
  { id: "EMP-021", firstName: "Faisal", lastName: "Al-Mutairi", department: "Delivery & Dispatch", designation: "Driver", branch: "Dammam Branch", joiningDate: "2025-02-01", employmentType: "Full-Time", shiftId: "HRS-004", mobile: "+966 50 611 4456", status: "Active", drivingLicense: "DL-966-11223", licenseExpiry: "2027-02-04", vehicleId: "VAN-05" },
  { id: "EMP-022", firstName: "Omar", lastName: "Al-Ghamdi", department: "Delivery & Dispatch", designation: "Dispatch Supervisor", branch: "Riyadh Main Branch", joiningDate: "2023-11-01", employmentType: "Full-Time", shiftId: "HRS-001", mobile: "+966 50 711 5567", status: "On Leave" },
];

const seedDepartments: Department[] = [
  { id: "DEP-001", name: "Store Operations", arabicName: "عمليات المتجر", code: "STO", managerEmpId: "EMP-001", branchScope: "All Branches", status: "Active" },
  { id: "DEP-002", name: "Cashier Operations", arabicName: "عمليات الصندوق", code: "CSH", managerEmpId: "EMP-002", branchScope: "All Branches", status: "Active" },
  { id: "DEP-003", name: "Inventory", arabicName: "إدارة المخزون", code: "INV", managerEmpId: "EMP-005", branchScope: "All Branches", status: "Active" },
  { id: "DEP-004", name: "Procurement", arabicName: "المشتريات", code: "PRO", managerEmpId: "EMP-007", branchScope: "All Branches", status: "Active" },
  { id: "DEP-005", name: "Delivery & Dispatch", arabicName: "التوصيل والتوزيع", code: "DEL", managerEmpId: "EMP-022", branchScope: "All Branches", status: "Active" },
  { id: "DEP-006", name: "Finance", arabicName: "المالية", code: "FIN", branchScope: "All Branches", status: "Active" },
  { id: "DEP-007", name: "HR & Administration", arabicName: "الموارد البشرية والإدارة", code: "HR", branchScope: "All Branches", status: "Active" },
  { id: "DEP-008", name: "IT Support", arabicName: "دعم تقنية المعلومات", code: "IT", branchScope: "All Branches", status: "Active" },
];

const seedShifts: Shift[] = [
  { id: "HRS-001", name: "Morning Shift", code: "MOR-01", start: "08:00", end: "16:00", breakMin: 60, workingHours: 7, graceMin: 5, departments: ["Store Operations", "Cashier Operations", "Inventory", "Procurement", "Finance"], status: "Active" },
  { id: "HRS-002", name: "Mid Shift", code: "MID-01", start: "10:00", end: "18:00", breakMin: 60, workingHours: 7, graceMin: 5, status: "Active" },
  { id: "HRS-003", name: "Evening Shift", code: "EVE-01", start: "14:00", end: "22:00", breakMin: 60, workingHours: 7, graceMin: 5, status: "Active" },
  { id: "HRS-004", name: "Driver Early Shift", code: "DRV-01", start: "07:00", end: "15:00", breakMin: 45, workingHours: 7.25, graceMin: 10, departments: ["Delivery & Dispatch"], status: "Active" },
];

const today = new Date().toISOString().slice(0, 10);
const seedAttendance: Attendance[] = [
  { id: "ATT-2026-0715-001", empId: "EMP-001", date: today, shiftId: "HRS-001", scheduledIn: "08:00", scheduledOut: "16:00", checkIn: "07:52", status: "Present", source: "Biometric" },
  { id: "ATT-2026-0715-002", empId: "EMP-002", date: today, shiftId: "HRS-001", scheduledIn: "09:00", scheduledOut: "17:00", checkIn: "08:57", status: "Present", source: "PIN" },
  { id: "ATT-2026-0715-003", empId: "EMP-005", date: today, shiftId: "HRS-001", scheduledIn: "08:00", scheduledOut: "16:00", checkIn: "08:05", lateMin: 5, status: "Late", source: "Biometric" },
  { id: "ATT-2026-0715-004", empId: "EMP-006", date: today, shiftId: "HRS-004", scheduledIn: "07:00", scheduledOut: "15:00", checkIn: "07:45", lateMin: 45, status: "Late", source: "Mobile", note: "Supervisor manual entry" },
  { id: "ATT-2026-0715-005", empId: "EMP-022", date: today, status: "On Leave", source: "Manual" },
  { id: "ATT-2026-0715-006", empId: "EMP-003", date: today, shiftId: "HRS-001", scheduledIn: "08:00", scheduledOut: "16:00", checkIn: "08:28", status: "Present", source: "Terminal" },
  { id: "ATT-2026-0715-007", empId: "EMP-004", date: today, shiftId: "HRS-002", scheduledIn: "10:00", scheduledOut: "18:00", checkIn: "09:56", status: "Present", source: "Terminal" },
];

const seedLeaves: Leave[] = [
  { id: "LEV-2026-0081", empId: "EMP-022", type: "Annual Leave", start: "2026-07-15", end: "2026-07-18", days: 4, handoverTo: "EMP-006", status: "Approved", approver: "EMP-001" },
  { id: "LEV-2026-0082", empId: "EMP-003", type: "Sick Leave", start: "2026-07-16", end: "2026-07-17", days: 2, attachment: "Medical-Certificate-0082.pdf", status: "Pending Manager" },
  { id: "LEV-2026-0083", empId: "EMP-005", type: "Emergency Leave", start: "2026-07-20", end: "2026-07-20", days: 1, status: "Submitted" },
];

const seedDocs: EmployeeDoc[] = [
  { id: "DOC-1001", empId: "EMP-006", type: "Driving Licence", number: "DL-966-77821", issueDate: "2022-03-18", expiryDate: "2027-03-18", status: "Valid", verifiedBy: "EMP-007", fileName: "hamad-license.pdf" },
  { id: "DOC-1002", empId: "EMP-003", type: "National ID / Iqama", number: "2456789123", expiryDate: "2026-08-28", status: "Expiring Soon", fileName: "sara-iqama.pdf" },
  { id: "DOC-1003", empId: "EMP-005", type: "Professional Certification", issuer: "Inventory Control Level 2", expiryDate: "2026-12-10", status: "Valid" },
];

const seedContracts: Contract[] = [
  { id: "CON-2001", empId: "EMP-001", type: "Full-Time", start: "2024-01-15", end: "2027-01-14", jobTitle: "Store Manager", department: "Store Operations", branch: "Riyadh Main Branch", status: "Active" },
  { id: "CON-2002", empId: "EMP-003", type: "Fixed-Term", start: "2025-09-01", end: "2026-08-31", jobTitle: "Cashier", department: "Cashier Operations", branch: "Riyadh Main Branch", status: "Expiring Soon" },
  { id: "CON-2003", empId: "EMP-006", type: "Full-Time", start: "2024-04-01", end: "2027-03-31", jobTitle: "Driver", department: "Delivery & Dispatch", branch: "Riyadh Main Branch", status: "Active" },
];

type S = {
  employees: Employee[];
  departments: Department[];
  shifts: Shift[];
  attendance: Attendance[];
  leaves: Leave[];
  docs: EmployeeDoc[];
  contracts: Contract[];
  empSeq: number;
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

export const useHrStore = create<S>()(
  persist(
    (set, get) => ({
      employees: seedEmployees,
      departments: seedDepartments,
      shifts: seedShifts,
      attendance: seedAttendance,
      leaves: seedLeaves,
      docs: seedDocs,
      contracts: seedContracts,
      empSeq: 30,
      addEmployee: (e) => {
        const id = `EMP-${String(get().empSeq).padStart(3, "0")}`;
        const emp: Employee = { ...e, id };
        set((s) => ({ employees: [emp, ...s.employees], empSeq: s.empSeq + 1 }));
        useAuditStore.getState().log({
          module: "hr", event: "EMPLOYEE_CREATED", recordId: id, employee: `${emp.firstName} ${emp.lastName}`, branch: emp.branch, severity: "info", newValue: emp.department,
        });
        return emp;
      },
      updateEmployee: (id, p) => {
        set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, ...p } : e)) }));
        useAuditStore.getState().log({ module: "hr", event: "EMPLOYEE_UPDATED", recordId: id, severity: "info" });
      },
      deactivateEmployee: (id) => {
        set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, status: "Inactive" } : e)) }));
        useAuditStore.getState().log({ module: "hr", event: "EMPLOYEE_DEACTIVATED", recordId: id, severity: "warning" });
      },
      addDepartment: (d) =>
        set((s) => {
          const id = `DEP-${String(s.departments.length + 1).padStart(3, "0")}`;
          useAuditStore.getState().log({ module: "hr", event: "DEPARTMENT_CREATED", recordId: id, severity: "info", newValue: d.name });
          return { departments: [...s.departments, { ...d, id }] };
        }),
      updateDepartment: (id, p) =>
        set((s) => ({ departments: s.departments.map((d) => (d.id === id ? { ...d, ...p } : d)) })),
      addShift: (sh) =>
        set((s) => {
          const id = `HRS-${String(s.shifts.length + 1).padStart(3, "0")}`;
          useAuditStore.getState().log({ module: "hr", event: "SHIFT_TEMPLATE_CREATED", recordId: id, severity: "info", newValue: sh.name });
          return { shifts: [...s.shifts, { ...sh, id }] };
        }),
      checkIn: (empId, source, time) => {
        const t = time ?? nowHHMM();
        const emp = get().employees.find((e) => e.id === empId);
        const shift = emp?.shiftId ? get().shifts.find((sh) => sh.id === emp.shiftId) : undefined;
        const late = shift ? Math.max(0, minutesBetween(shift.start, t) - shift.graceMin) : 0;
        const rec: Attendance = {
          id: `ATT-${Date.now()}`,
          empId,
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
          module: "hr", event: "EMPLOYEE_CHECKED_IN", recordId: rec.id, employee: emp ? `${emp.firstName} ${emp.lastName}` : empId, branch: emp?.branch, severity: late > 0 ? "warning" : "info", newValue: t,
        });
        return rec;
      },
      checkOut: (empId, time) => {
        const t = time ?? nowHHMM();
        set((s) => {
          const idx = s.attendance.findIndex((a) => a.empId === empId && a.date === new Date().toISOString().slice(0, 10) && a.checkIn && !a.checkOut);
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
      },
      adjustAttendance: (id, patch, reason) => {
        set((s) => ({ attendance: s.attendance.map((a) => (a.id === id ? { ...a, ...patch, status: "Manual Adjustment" } : a)) }));
        useAuditStore.getState().log({ module: "hr", event: "ATTENDANCE_ADJUSTMENT_APPROVED", recordId: id, reason, severity: "warning" });
      },
      addLeave: (l) => {
        const id = `LEV-2026-${String((get().leaves.length + 84)).padStart(4, "0")}`;
        const rec: Leave = { ...l, id };
        set((s) => ({ leaves: [rec, ...s.leaves] }));
        useAuditStore.getState().log({ module: "hr", event: "LEAVE_CREATED", recordId: id, employee: l.empId, severity: "info", newValue: l.type });
        return rec;
      },
      updateLeaveStatus: (id, status, approver) => {
        set((s) => ({ leaves: s.leaves.map((l) => (l.id === id ? { ...l, status, approver: approver ?? l.approver } : l)) }));
        useAuditStore.getState().log({ module: "hr", event: `LEAVE_${status.toUpperCase().replace(/\s/g, "_")}`, recordId: id, severity: status === "Rejected" ? "warning" : "info", newValue: status });
        // If approved, mark today's/attendance days as On Leave for range dates that match today
        if (status === "Approved") {
          const l = get().leaves.find((x) => x.id === id);
          if (l) {
            const emp = get().employees.find((e) => e.id === l.empId);
            if (emp) {
              const t = new Date().toISOString().slice(0, 10);
              if (t >= l.start && t <= l.end) {
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
        }
      },
      addDoc: (d) =>
        set((s) => {
          const id = `DOC-${String(1000 + s.docs.length + 4).padStart(4, "0")}`;
          useAuditStore.getState().log({ module: "hr", event: "DOCUMENT_UPLOADED", recordId: id, employee: d.empId, severity: "info", newValue: d.type });
          return { docs: [{ ...d, id }, ...s.docs] };
        }),
      verifyDoc: (id, by) => {
        set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, status: "Valid", verifiedBy: by } : d)) }));
        useAuditStore.getState().log({ module: "hr", event: "DOCUMENT_VERIFIED", recordId: id, severity: "info", newValue: by });
      },
      addContract: (c) =>
        set((s) => {
          const id = `CON-${String(2000 + s.contracts.length + 4).padStart(4, "0")}`;
          useAuditStore.getState().log({ module: "hr", event: "CONTRACT_CREATED", recordId: id, employee: c.empId, severity: "info" });
          return { contracts: [{ ...c, id }, ...s.contracts] };
        }),
      renewContract: (id, newC) =>
        set((s) => {
          const nextId = `CON-${String(2000 + s.contracts.length + 4).padStart(4, "0")}`;
          const next = s.contracts.map((c) => (c.id === id ? { ...c, status: "Renewed" as const, supersededBy: nextId } : c));
          useAuditStore.getState().log({ module: "hr", event: "CONTRACT_RENEWED", recordId: nextId, employee: newC.empId, severity: "info", oldValue: id });
          return { contracts: [{ ...newC, id: nextId }, ...next] };
        }),
      reset: () =>
        set({
          employees: seedEmployees, departments: seedDepartments, shifts: seedShifts,
          attendance: seedAttendance, leaves: seedLeaves, docs: seedDocs, contracts: seedContracts, empSeq: 30,
        }),
    }),
    { name: "buildpos-hr-v1" }
  )
);

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