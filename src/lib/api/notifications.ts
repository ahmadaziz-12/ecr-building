import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./client";

export type NotificationDto = {
  id: string;
  type: string;
  severity: "Critical" | "Warning" | "Info";
  message: string;
  asOf: string;
  link: string | null;
};

export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiGet<NotificationDto[]>("/api/notifications"),
    enabled,
    refetchInterval: 60_000,
  });
