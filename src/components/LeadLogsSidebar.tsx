"use client";

import { type LeadStatus } from "@/lib/types";
import { formatDateTimeParis } from "@/lib/date";
import { StatusBadge } from "@/components/StatusBadge";

export interface LogEntry {
  id: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
  profile?: { full_name: string };
}

interface LeadLogsSidebarProps {
  logs: LogEntry[];
}

export function LeadLogsSidebar({ logs }: LeadLogsSidebarProps) {
  return (
    <div className="w-80 shrink-0">
      <div className="bg-white rounded-[14px] border border-line p-4 shadow-card sticky top-24">
        <h2 className="text-lg font-semibold text-ink mb-4">Historique</h2>
        <div className="space-y-3 max-h-[calc(100vh-12rem)] overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-sm text-subtle">Aucun log</p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col gap-1 py-2 border-b border-line last:border-0"
              >
                <span className="text-xs text-subtle">
                  {formatDateTimeParis(log.created_at)}
                </span>
                <span className="text-sm text-ink">
                  {log.action}
                </span>
                {(log.old_status || log.new_status) && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {log.old_status && (
                      <StatusBadge status={log.old_status as LeadStatus} />
                    )}
                    {log.old_status && log.new_status && (
                      <span className="text-xs text-subtle">→</span>
                    )}
                    {log.new_status && (
                      <StatusBadge status={log.new_status as LeadStatus} />
                    )}
                  </div>
                )}
                {log.profile && (
                  <span className="text-xs text-subtle">
                    {(log.profile as { full_name: string }).full_name}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
