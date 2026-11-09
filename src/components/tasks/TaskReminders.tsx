"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BellRing, Check } from "lucide-react";
import { formatFullDateTimeParis } from "@/lib/date";
import { isReminderDue, TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/tasks";
import { PRIORITY_STYLES, TASKS_CHANGED_EVENT } from "./TasksClient";

interface ReminderTask {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  remind_at: string;
  completed_at: null;
  created_by_name: string | null;
}

/** Au-delà, les rappels suivants sont résumés par un lien vers la page Tâches. */
const MAX_VISIBLE = 3;
const POLL_INTERVAL_MS = 3 * 60 * 1000;
const TICK_MS = 15 * 1000;

/**
 * Rappels de tâches : une carte par tâche dont l'heure de rappel est passée.
 * Volontairement sans bouton « fermer » : la carte reste tant que la tâche
 * n'est pas validée.
 *
 * Le serveur renvoie aussi les rappels des prochaines 24 h ; l'horloge locale
 * les fait apparaître à l'heure exacte, sans poller à la minute.
 */
export function TaskReminders({ tasksHref }: { tasksHref: string }) {
  const [tasks, setTasks] = useState<ReminderTask[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks/due", { credentials: "include" });
      if (res.ok) setTasks(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchReminders();
    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (!interval) interval = setInterval(fetchReminders, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stopPolling();
      else {
        fetchReminders();
        startPolling();
      }
    };
    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(TASKS_CHANGED_EVENT, fetchReminders);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(TASKS_CHANGED_EVENT, fetchReminders);
    };
  }, [fetchReminders]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const due = tasks.filter((t) => isReminderDue(t, now));

  const handleComplete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completed: true }),
      });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
        window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
        // Met aussi à jour le compteur du menu et la page Tâches si elle est ouverte.
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  if (due.length === 0) return null;

  const visible = due.slice(0, MAX_VISIBLE);
  const hidden = due.length - visible.length;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm"
      aria-live="polite"
    >
      {visible.map((task) => {
        const style = PRIORITY_STYLES[task.priority];
        return (
          <div
            key={task.id}
            className={`rounded-[14px] border border-line border-l-4 ${style.border} bg-white shadow-[0_6px_20px_rgba(16,24,40,.18)] p-4`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
              <BellRing
                className={`w-4 h-4 ${task.priority === "urgent" ? "text-red-600" : "text-orange-500"}`}
              />
              <span className="text-subtle">Rappel de tâche</span>
              <span className={`ml-auto px-2 py-0.5 rounded-full border ${style.badge} flex items-center gap-1`}>
                {task.priority === "urgent" && <AlertTriangle className="w-3 h-3" />}
                {TASK_PRIORITY_LABELS[task.priority]}
              </span>
            </div>
            <p className="font-semibold text-ink mt-2 break-words">{task.title}</p>
            {task.description && (
              <p className="text-sm text-subtle mt-0.5 line-clamp-2 break-words">{task.description}</p>
            )}
            <p className="text-xs text-faint mt-1">
              {formatFullDateTimeParis(task.remind_at)}
              {task.created_by_name ? ` · De : ${task.created_by_name}` : ""}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => router.push(tasksHref)}
                className="px-3 py-1.5 text-sm rounded-[8px] border border-line text-subtle hover:bg-line-soft"
              >
                Voir
              </button>
              <button
                type="button"
                onClick={() => handleComplete(task.id)}
                disabled={busyId === task.id}
                className="px-3 py-1.5 text-sm rounded-[8px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-1 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                Valider
              </button>
            </div>
          </div>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => router.push(tasksHref)}
          className="rounded-[14px] bg-ink text-white text-sm font-medium px-4 py-2 shadow-[0_6px_20px_rgba(16,24,40,.18)] hover:bg-ink-soft"
        >
          + {hidden} autre{hidden > 1 ? "s" : ""} rappel{hidden > 1 ? "s" : ""} — voir les tâches
        </button>
      )}
    </div>
  );
}
