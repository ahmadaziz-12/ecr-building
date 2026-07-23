import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./client";
import type { Employee, Department, Shift, Attendance, Leave, EmployeeDoc, Contract } from "@/lib/hr/store";

export type ApiEmployee = {
  id: number; firstName: string; lastName: string; arabicName: string | null; mobile: string; email: string | null;
  joiningDate: string; employmentType: string; departmentId: number; departmentName: string; designation: string;
  reportingManagerId: number | null; reportingManagerName: string | null; branchId: number; branchName: string; status: string;
  shiftId: number | null; shiftName: string | null; userId: number | null; role: string | null;
  drivingLicense: string | null; licenseExpiry: string | null; profileImage: string | null;
};
export type ApiDepartment = {
  id: number; name: string; arabicName: string | null; code: string; managerEmployeeId: number | null; managerName: string | null;
  branchScope: string; status: string; parentId: number | null; headCount: number;
};
export type ApiShift = { id: number; name: string; code: string; start: string; end: string; breakMin: number; workingHours: number; graceMin: number; overtimeStartMin: number | null; crossMidnight: boolean; status: string };
export type ApiAttendance = { id: number; employeeId: number; employeeName: string; date: string; shiftId: number | null; scheduledIn: string | null; scheduledOut: string | null; checkIn: string | null; checkOut: string | null; workedHours: number | null; lateMin: number | null; status: string; source: string; note: string | null };
export type ApiLeave = { id: number; employeeId: number; employeeName: string; type: string; start: string; end: string; days: number; halfDay: boolean; reason: string | null; handoverToEmployeeId: number | null; handoverToName: string | null; attachment: string | null; approverName: string | null; status: string };
export type ApiDoc = { id: number; employeeId: number; employeeName: string; type: string; number: string | null; issueDate: string | null; expiryDate: string | null; issuer: string | null; status: string; verifiedByName: string | null; notes: string | null; fileName: string | null };
export type ApiContract = { id: number; employeeId: number; employeeName: string; type: string; number: string | null; start: string; end: string; probationEnd: string | null; jobTitle: string; departmentId: number; departmentName: string; branchId: number; branchName: string; status: string; supersededByContractId: number | null };

const EMPLOYMENT_STATUS: Record<string, Employee["status"]> = {
  Active: "Active", Probation: "Probation", OnLeave: "On Leave", Suspended: "Suspended", Resigned: "Resigned", Terminated: "Terminated", Inactive: "Inactive",
};
const EMPLOYMENT_TYPE: Record<string, Employee["employmentType"]> = { FullTime: "Full-Time", PartTime: "Part-Time", Contract: "Contract", Temporary: "Temporary" };
const ATTENDANCE_STATUS: Record<string, Attendance["status"]> = {
  Present: "Present", Late: "Late", Absent: "Absent", OnLeave: "On Leave", HalfDay: "Half Day", OffDay: "Off Day",
  Holiday: "Holiday", MissingCheckIn: "Missing Check-In", MissingCheckOut: "Missing Check-Out", ManualAdjustment: "Manual Adjustment",
};
const ATTENDANCE_SOURCE: Record<string, Attendance["source"]> = { Biometric: "Biometric", Pin: "PIN", Terminal: "Terminal", Manual: "Manual", Mobile: "Mobile" };
export const ATTENDANCE_SOURCE_TO_BACKEND: Record<string, string> = { Biometric: "Biometric", PIN: "Pin", Terminal: "Terminal", Manual: "Manual", Mobile: "Mobile" };
const LEAVE_TYPE: Record<string, Leave["type"]> = { AnnualLeave: "Annual Leave", SickLeave: "Sick Leave", EmergencyLeave: "Emergency Leave", UnpaidLeave: "Unpaid Leave", OtherApprovedLeave: "Other Approved Leave" };
export const LEAVE_TYPE_TO_BACKEND: Record<string, string> = Object.fromEntries(Object.entries(LEAVE_TYPE).map(([k, v]) => [v, k]));
const LEAVE_STATUS: Record<string, Leave["status"]> = { Draft: "Draft", Submitted: "Submitted", PendingManager: "Pending Manager", PendingHr: "Pending HR", Approved: "Approved", Rejected: "Rejected", Cancelled: "Cancelled", Completed: "Completed" };
export const LEAVE_STATUS_TO_BACKEND: Record<string, string> = Object.fromEntries(Object.entries(LEAVE_STATUS).map(([k, v]) => [v, k]));
const DOC_TYPE: Record<string, EmployeeDoc["type"]> = {
  NationalIdIqama: "National ID / Iqama", EmploymentContract: "Employment Contract", DrivingLicence: "Driving Licence",
  ProfessionalCertification: "Professional Certification", BranchAssignmentLetter: "Branch Assignment Letter",
  WarningLetter: "Warning Letter", MedicalCertificate: "Medical Certificate", TrainingCertificate: "Training Certificate", Other: "Other",
};
export const DOC_TYPE_TO_BACKEND: Record<string, string> = Object.fromEntries(Object.entries(DOC_TYPE).map(([k, v]) => [v, k]));
const DOC_STATUS: Record<string, EmployeeDoc["status"]> = { Valid: "Valid", ExpiringSoon: "Expiring Soon", Expired: "Expired", PendingVerification: "Pending Verification", Rejected: "Rejected", Replaced: "Replaced" };
const CONTRACT_TYPE: Record<string, Contract["type"]> = { FullTime: "Full-Time", PartTime: "Part-Time", FixedTerm: "Fixed-Term", Temporary: "Temporary" };
export const CONTRACT_TYPE_TO_BACKEND: Record<string, string> = Object.fromEntries(Object.entries(CONTRACT_TYPE).map(([k, v]) => [v, k]));
const CONTRACT_STATUS: Record<string, Contract["status"]> = { Draft: "Draft", Active: "Active", ExpiringSoon: "Expiring Soon", Expired: "Expired", Renewed: "Renewed", Closed: "Closed", Terminated: "Terminated" };

export const empId = (id: number) => `EMP-${id}`;
export const backendEmpId = (empId?: string) => (empId ? Number(empId.replace("EMP-", "")) : undefined);

export function mapApiEmployee(e: ApiEmployee): Employee {
  return {
    id: empId(e.id), firstName: e.firstName, lastName: e.lastName, arabicName: e.arabicName ?? undefined,
    mobile: e.mobile, email: e.email ?? undefined, joiningDate: e.joiningDate.slice(0, 10),
    employmentType: EMPLOYMENT_TYPE[e.employmentType] ?? "Full-Time", department: e.departmentName, designation: e.designation,
    reportingManager: e.reportingManagerName ?? undefined, branch: e.branchName, status: EMPLOYMENT_STATUS[e.status] ?? "Active",
    shiftId: e.shiftId ? String(e.shiftId) : undefined, userId: e.userId ? String(e.userId) : undefined, role: e.role ?? undefined,
    drivingLicense: e.drivingLicense ?? undefined, licenseExpiry: e.licenseExpiry?.slice(0, 10),
    _backendId: e.id, _departmentId: e.departmentId, _branchId: e.branchId,
  } as Employee;
}

export function mapApiDepartment(d: ApiDepartment): Department {
  return {
    id: `DEP-${d.id}`, name: d.name, arabicName: d.arabicName ?? undefined, code: d.code,
    managerEmpId: d.managerEmployeeId ? empId(d.managerEmployeeId) : undefined,
    branchScope: (d.branchScope === "AllBranches" ? "All Branches" : d.branchScope === "SingleBranch" ? "Single Branch" : "Selected Branches"),
    status: d.status as Department["status"], _backendId: d.id,
  } as Department;
}

export function mapApiShift(s: ApiShift): Shift {
  return {
    id: `HRS-${s.id}`, name: s.name, code: s.code, start: s.start, end: s.end, breakMin: s.breakMin,
    workingHours: s.workingHours, graceMin: s.graceMin, overtimeStartMin: s.overtimeStartMin ?? undefined,
    crossMidnight: s.crossMidnight, status: s.status as Shift["status"], _backendId: s.id,
  } as Shift;
}

export function mapApiAttendance(a: ApiAttendance): Attendance {
  return {
    id: `ATT-${a.id}`, empId: empId(a.employeeId), date: a.date.slice(0, 10), shiftId: a.shiftId ? `HRS-${a.shiftId}` : undefined,
    scheduledIn: a.scheduledIn ?? undefined, scheduledOut: a.scheduledOut ?? undefined, checkIn: a.checkIn ?? undefined,
    checkOut: a.checkOut ?? undefined, workedHours: a.workedHours ?? undefined, lateMin: a.lateMin ?? undefined,
    status: ATTENDANCE_STATUS[a.status] ?? "Present", source: ATTENDANCE_SOURCE[a.source] ?? "Manual", note: a.note ?? undefined,
    _backendId: a.id,
  } as Attendance;
}

export function mapApiLeave(l: ApiLeave): Leave {
  return {
    id: `LEV-${l.id}`, empId: empId(l.employeeId), type: LEAVE_TYPE[l.type] ?? "Annual Leave", start: l.start.slice(0, 10),
    end: l.end.slice(0, 10), days: l.days, halfDay: l.halfDay, reason: l.reason ?? undefined,
    handoverTo: l.handoverToEmployeeId ? empId(l.handoverToEmployeeId) : undefined, attachment: l.attachment ?? undefined,
    approver: l.approverName ?? undefined, status: LEAVE_STATUS[l.status] ?? "Submitted", _backendId: l.id,
  } as Leave;
}

export function mapApiDoc(d: ApiDoc): EmployeeDoc {
  return {
    id: `DOC-${d.id}`, empId: empId(d.employeeId), type: DOC_TYPE[d.type] ?? "Other", number: d.number ?? undefined,
    issueDate: d.issueDate?.slice(0, 10), expiryDate: d.expiryDate?.slice(0, 10), issuer: d.issuer ?? undefined,
    status: DOC_STATUS[d.status] ?? "Pending Verification", verifiedBy: d.verifiedByName ?? undefined, fileName: d.fileName ?? undefined,
    _backendId: d.id,
  } as EmployeeDoc;
}

export function mapApiContract(c: ApiContract): Contract {
  return {
    id: `CON-${c.id}`, empId: empId(c.employeeId), type: CONTRACT_TYPE[c.type] ?? "Full-Time", number: c.number ?? undefined,
    start: c.start.slice(0, 10), end: c.end.slice(0, 10), probationEnd: c.probationEnd?.slice(0, 10), jobTitle: c.jobTitle,
    department: c.departmentName, branch: c.branchName, status: CONTRACT_STATUS[c.status] ?? "Active",
    supersededBy: c.supersededByContractId ? `CON-${c.supersededByContractId}` : undefined, _backendId: c.id,
  } as Contract;
}

export const useEmployeesApi = () => useQuery({ queryKey: ["hr", "employees"], queryFn: () => apiGet<ApiEmployee[]>("/api/hr/employees") });
export const useDepartmentsApi = () => useQuery({ queryKey: ["hr", "departments"], queryFn: () => apiGet<ApiDepartment[]>("/api/hr/departments") });
export const useShiftsApi = () => useQuery({ queryKey: ["hr", "shifts"], queryFn: () => apiGet<ApiShift[]>("/api/hr/shifts") });
export const useAttendanceApi = () => useQuery({ queryKey: ["hr", "attendance"], queryFn: () => apiGet<ApiAttendance[]>("/api/hr/attendance") });
export const useLeavesApi = () => useQuery({ queryKey: ["hr", "leaves"], queryFn: () => apiGet<ApiLeave[]>("/api/hr/leaves") });
export const useDocsApi = () => useQuery({ queryKey: ["hr", "documents"], queryFn: () => apiGet<ApiDoc[]>("/api/hr/documents") });
export const useContractsApi = () => useQuery({ queryKey: ["hr", "contracts"], queryFn: () => apiGet<ApiContract[]>("/api/hr/contracts") });

export function useInvalidateHr() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["hr"] });
}

export const apiCheckIn = (body: { employeeId: number; source: string; reason?: string }) => apiPost<ApiAttendance>("/api/hr/attendance/check-in", body);
export const apiCheckOut = (body: { employeeId: number }) => apiPost<ApiAttendance>("/api/hr/attendance/check-out", body);
export const apiAdjustAttendance = (id: number, body: { checkIn?: string; checkOut?: string; status?: string; reason: string }) => apiPut<ApiAttendance>(`/api/hr/attendance/${id}/adjust`, body);
export const apiUpdateLeaveStatus = (id: number, body: { status: string; approverEmployeeId?: number }) => apiPut<ApiLeave>(`/api/hr/leaves/${id}/status`, body);
export const apiVerifyDoc = (id: number, body: { verifiedByEmployeeId: number }) => apiPut<ApiDoc>(`/api/hr/documents/${id}/verify`, body);
