import { useEffect } from "react";
import {
  useEmployeesApi, useDepartmentsApi, useShiftsApi, useAttendanceApi, useLeavesApi, useDocsApi, useContractsApi,
  mapApiEmployee, mapApiDepartment, mapApiShift, mapApiAttendance, mapApiLeave, mapApiDoc, mapApiContract,
} from "./hr";
import { useBranches } from "./admin";
import { useHrStore } from "@/lib/hr/store";

// Mounted once (in AppLayout) — mirrors the live backend into the existing Zustand HR store so
// every hr/*.tsx component keeps working unchanged, but now reads real DB data.
export function HrSync() {
  const employees = useEmployeesApi();
  const departments = useDepartmentsApi();
  const shifts = useShiftsApi();
  const attendance = useAttendanceApi();
  const leaves = useLeavesApi();
  const docs = useDocsApi();
  const contracts = useContractsApi();
  const branches = useBranches();
  const setSynced = useHrStore((s) => s.setSynced);

  useEffect(() => {
    if (employees.data) setSynced({ employees: employees.data.map(mapApiEmployee) });
  }, [employees.data, setSynced]);

  useEffect(() => {
    if (departments.data) setSynced({ departments: departments.data.map(mapApiDepartment) });
  }, [departments.data, setSynced]);

  useEffect(() => {
    if (shifts.data) setSynced({ shifts: shifts.data.map(mapApiShift) });
  }, [shifts.data, setSynced]);

  useEffect(() => {
    if (attendance.data) setSynced({ attendance: attendance.data.map(mapApiAttendance) });
  }, [attendance.data, setSynced]);

  useEffect(() => {
    if (leaves.data) setSynced({ leaves: leaves.data.map(mapApiLeave) });
  }, [leaves.data, setSynced]);

  useEffect(() => {
    if (docs.data) setSynced({ docs: docs.data.map(mapApiDoc) });
  }, [docs.data, setSynced]);

  useEffect(() => {
    if (contracts.data) setSynced({ contracts: contracts.data.map(mapApiContract) });
  }, [contracts.data, setSynced]);

  useEffect(() => {
    if (departments.data && branches.data) {
      setSynced({
        lookups: {
          departmentIdByName: Object.fromEntries(departments.data.map((d) => [d.name, d.id])),
          branchIdByName: Object.fromEntries(branches.data.map((b) => [b.nameEn, b.id])),
        },
      });
    }
  }, [departments.data, branches.data, setSynced]);

  return null;
}
