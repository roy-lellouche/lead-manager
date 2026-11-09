"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  addDays,
  isWithinInterval,
} from "date-fns";
import { fr } from "date-fns/locale";
import { formatTimeParis } from "@/lib/date";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgendaEvent {
  id: string;
  title: string;
  phone: string;
  callback_at: string;
}

interface AgendaClientProps {
  events: AgendaEvent[];
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function AgendaClient({ events }: AgendaClientProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const router = useRouter();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const getEventsForDay = (date: Date) => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    return events.filter((e) => {
      const eventDate = new Date(e.callback_at);
      return isWithinInterval(eventDate, { start: dayStart, end: dayEnd });
    });
  };

  const handleEventClick = (leadId: string) => {
    router.push(`/telepro/leads/${leadId}`);
  };

  return (
    <div className="rounded-[14px] border border-line bg-white shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: fr })}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            aria-label="Mois précédent"
            className="h-8 w-8 text-subtle hover:text-ink"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 h-8 text-sm text-subtle hover:text-ink"
          >
            Aujourd&apos;hui
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            aria-label="Mois suivant"
            className="h-8 w-8 text-subtle hover:text-ink"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-7 gap-px bg-line rounded-lg overflow-hidden">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="bg-panel py-2 text-center text-xs font-medium text-subtle uppercase tracking-wide"
            >
              {d}
            </div>
          ))}
          {days.map((date) => {
            const dayEvents = getEventsForDay(date);
            const isCurrentMonth = isSameMonth(date, currentMonth);
            const isToday = isSameDay(date, new Date());

            return (
              <div
                key={date.toISOString()}
                className={`min-h-[100px] p-2 ${
                  !isCurrentMonth ? "bg-panel/60" : "bg-white"
                }`}
              >
                <div
                  className={`text-sm font-medium mb-1 ${
                    isToday
                      ? "bg-brand text-white w-7 h-7 rounded-full flex items-center justify-center text-xs"
                      : isCurrentMonth
                      ? "text-ink"
                      : "text-faint"
                  }`}
                >
                  {format(date, "d")}
                </div>
                <div className="space-y-1 overflow-y-auto max-h-[80px]">
                  {dayEvents.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => handleEventClick(event.id)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 transition-colors truncate"
                      title={`${event.title} - ${event.phone}`}
                    >
                      <span className="font-medium block truncate">
                        {formatTimeParis(event.callback_at)} - {event.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {events.length === 0 && (
        <div className="px-4 mx-4 mb-4 bg-panel rounded-[8px] border border-line text-center py-6">
          <p className="font-medium text-ink text-sm">Aucun rappel planifié</p>
          <p className="text-sm mt-1 text-subtle">
            Les leads en statut &quot;À rappeler&quot; avec une date de rappel apparaîtront ici.
          </p>
        </div>
      )}
    </div>
  );
}
