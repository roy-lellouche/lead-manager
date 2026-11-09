"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Calendar as CalendarIcon, Plus, Trash2 } from "lucide-react";
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatTimeParis, formatDateParis, fromDatetimeLocalValueParis, toDatetimeLocalValueParis } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui-kit/PageHeader";

const INPUT_CLS =
  "w-full px-3 py-2 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40";
const SELECT_CLS =
  "w-full px-3 py-2 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40";
const LABEL_CLS = "block text-sm font-medium text-ink mb-1";

interface CourrierEvent {
  id: string;
  type: "courrier";
  title: string;
  phone: string;
  callback_at: string;
  first_name: string;
  last_name: string;
  nrp_count: number;
  created_at: string;
  updated_at: string;
}

interface RappelEvent {
  id: string;
  type: "rappel";
  title: string;
  description: string | null;
  callback_at: string;
  created_at: string;
}

type CalendarEvent = CourrierEvent | RappelEvent;

interface AgendaCourrierClientProps {
  courrierEvents: CourrierEvent[];
  rappelEvents: RappelEvent[];
}

function getDaysSinceCreation(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function AgendaCourrierClient({ courrierEvents, rappelEvents }: AgendaCourrierClientProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showCourrierModal, setShowCourrierModal] = useState<CourrierEvent | null>(null);
  const [showRappelModal, setShowRappelModal] = useState<RappelEvent | null>(null);
  const [showCreateRappel, setShowCreateRappel] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [followUpAction, setFollowUpAction] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [newRappelName, setNewRappelName] = useState("");
  const [newRappelDesc, setNewRappelDesc] = useState("");
  const [newRappelDate, setNewRappelDate] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const allEvents: CalendarEvent[] = [...courrierEvents, ...rappelEvents];

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
    return allEvents.filter((e) => {
      const eventDate = new Date(e.callback_at);
      return isWithinInterval(eventDate, { start: dayStart, end: dayEnd });
    });
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (event.type === "courrier") {
      setShowCourrierModal(event);
      setFollowUpAction("");
      setCallbackDate("");
    } else {
      setShowRappelModal(event);
    }
  };

  const handleFollowUp = async () => {
    if (!showCourrierModal || !followUpAction) return;
    setActionLoading(true);
    try {
      const body: Record<string, unknown> = { action: followUpAction };
      if (followUpAction === "a_rappeler" && callbackDate) {
        body.callback_at = fromDatetimeLocalValueParis(callbackDate);
      }
      await fetch(`/api/admin/code-courrier/${showCourrierModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      setShowCourrierModal(null);
      setFollowUpAction("");
      setCallbackDate("");
      router.refresh();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateRappel = async () => {
    if (!newRappelName.trim() || !newRappelDate) return;
    setCreating(true);
    try {
      const res = await fetch("/api/admin/rappels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newRappelName.trim(),
          description: newRappelDesc.trim() || null,
          callback_at: fromDatetimeLocalValueParis(newRappelDate),
        }),
      });
      if (res.ok) {
        setShowCreateRappel(false);
        setNewRappelName("");
        setNewRappelDesc("");
        setNewRappelDate("");
        router.refresh();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRappel = async () => {
    if (!showRappelModal) return;
    setActionLoading(true);
    try {
      await fetch(`/api/admin/rappels/${showRappelModal.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setShowRappelModal(null);
      router.refresh();
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      {/* Header */}
      <PageHeader
        title="Agenda"
        subtitle="Rappels des codes courrier et rappels personnels"
        actions={
          <Button
            onClick={() => {
              setShowCreateRappel(true);
              setNewRappelDate(toDatetimeLocalValueParis(new Date().toISOString()));
            }}
            className="gap-2 bg-brand hover:bg-brand-hover text-white"
          >
            <Plus className="w-4 h-4" />
            Nouveau rappel
          </Button>
        }
      />

      {/* Calendrier */}
      <div className="rounded-[14px] border border-line bg-white shadow-card overflow-hidden">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">
            {format(currentMonth, "MMMM yyyy", { locale: fr })}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 rounded-[9px] hover:bg-line-soft text-subtle"
              aria-label="Mois précédent"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-3 py-1 text-sm text-subtle hover:bg-line-soft rounded-[9px]"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 rounded-[9px] hover:bg-line-soft text-subtle"
              aria-label="Mois suivant"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-7 gap-px bg-line rounded-[9px] overflow-hidden">
            {WEEKDAYS.map((d) => (
              <div key={d} className="bg-panel py-2 text-center text-sm font-medium text-subtle">
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
                  className={`min-h-[100px] p-2 bg-white ${!isCurrentMonth ? "bg-panel" : ""}`}
                >
                  <div
                    className={`text-sm font-medium mb-1 ${
                      isToday
                        ? "bg-brand text-white w-8 h-8 rounded-full flex items-center justify-center"
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
                        onClick={() => handleEventClick(event)}
                        className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors truncate ${
                          event.type === "courrier"
                            ? "bg-rose-100 text-rose-800 hover:bg-rose-200"
                            : "bg-brand-soft text-brand-hover hover:bg-brand-soft"
                        }`}
                        title={event.type === "courrier" ? `${event.title} - ${(event as CourrierEvent).phone}` : event.title}
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

        {allEvents.length === 0 && (
          <div className="p-4 mx-4 mb-4 bg-panel rounded-[9px] border border-line text-center text-subtle">
            <p className="font-medium">Aucun rappel planifié</p>
            <p className="text-sm mt-1">
              Les rappels et codes courrier avec une date de rappel apparaîtront ici.
            </p>
          </div>
        )}
      </div>

      {/* Modal création rappel */}
      {showCreateRappel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-[14px] border border-line bg-white shadow-[0_4px_24px_rgba(16,24,40,.12)] w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-line">
              <h3 className="text-lg font-semibold text-ink">Nouveau rappel</h3>
              <button
                onClick={() => { setShowCreateRappel(false); setNewRappelName(""); setNewRappelDesc(""); setNewRappelDate(""); }}
                className="p-1 rounded-[9px] hover:bg-line-soft text-subtle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className={LABEL_CLS}>Nom du rappel</label>
                <input
                  type="text"
                  value={newRappelName}
                  onChange={(e) => setNewRappelName(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="Ex: Appeler M. Dupont"
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Description</label>
                <textarea
                  value={newRappelDesc}
                  onChange={(e) => setNewRappelDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-line rounded-[9px] bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
                  placeholder="Description optionnelle..."
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Date et heure du rappel</label>
                <input
                  type="datetime-local"
                  value={newRappelDate}
                  onChange={(e) => setNewRappelDate(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
            </div>
            <div className="p-4 border-t border-line flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowCreateRappel(false); setNewRappelName(""); setNewRappelDesc(""); setNewRappelDate(""); }}
                className="border-line text-subtle hover:bg-line-soft"
              >
                Annuler
              </Button>
              <Button
                onClick={handleCreateRappel}
                disabled={creating || !newRappelName.trim() || !newRappelDate}
                className="bg-brand hover:bg-brand-hover text-white disabled:opacity-50"
              >
                {creating ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal détail code courrier */}
      {showCourrierModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-[14px] border border-line bg-white shadow-[0_4px_24px_rgba(16,24,40,.12)] w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-line">
              <h3 className="text-lg font-semibold text-ink">Code courrier</h3>
              <button
                onClick={() => { setShowCourrierModal(null); setFollowUpAction(""); setCallbackDate(""); }}
                className="p-1 rounded-[9px] hover:bg-line-soft text-subtle"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-subtle">Nom</p>
                  <p className="font-medium text-ink">{showCourrierModal.last_name}</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">Prénom</p>
                  <p className="font-medium text-ink">{showCourrierModal.first_name}</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">Téléphone</p>
                  <p className="font-medium text-ink">{showCourrierModal.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">Date de création</p>
                  <p className="font-medium text-ink">{formatDateParis(showCourrierModal.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">Jours écoulés</p>
                  <p className="font-medium text-ink">{getDaysSinceCreation(showCourrierModal.created_at)} jour(s)</p>
                </div>
                <div>
                  <p className="text-xs text-subtle">NRP</p>
                  <p className="font-medium text-ink">{showCourrierModal.nrp_count}</p>
                </div>
              </div>

              {showCourrierModal.callback_at && (
                <div className="bg-brand-soft border border-brand-line rounded-[9px] p-3">
                  <p className="text-sm text-brand-hover">
                    <CalendarIcon className="w-4 h-4 inline mr-1" />
                    Rappel prévu le {formatDateParis(showCourrierModal.callback_at)}
                  </p>
                </div>
              )}

              <div className="border-t border-line pt-3">
                <label className={LABEL_CLS + " mb-2"}>Suivi</label>
                <select
                  value={followUpAction}
                  onChange={(e) => {
                    setFollowUpAction(e.target.value);
                    if (e.target.value === "a_rappeler") {
                      setCallbackDate(toDatetimeLocalValueParis(new Date().toISOString()));
                    } else {
                      setCallbackDate("");
                    }
                  }}
                  className={SELECT_CLS}
                >
                  <option value="">Sélectionner une action...</option>
                  <option value="nrp">NRP</option>
                  <option value="a_rappeler">À rappeler</option>
                  <option value="annule">Annulé</option>
                </select>

                {followUpAction === "a_rappeler" && (
                  <div className="mt-3">
                    <label className={LABEL_CLS}>Date et heure du rappel</label>
                    <input
                      type="datetime-local"
                      value={callbackDate}
                      onChange={(e) => setCallbackDate(e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-line flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowCourrierModal(null); setFollowUpAction(""); setCallbackDate(""); }}
                className="border-line text-subtle hover:bg-line-soft"
              >
                Fermer
              </Button>
              <Button
                onClick={handleFollowUp}
                disabled={actionLoading || !followUpAction || (followUpAction === "a_rappeler" && !callbackDate)}
                className="bg-brand hover:bg-brand-hover text-white disabled:opacity-50"
              >
                {actionLoading ? "En cours..." : "Valider"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal détail rappel libre */}
      {showRappelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-[14px] border border-line bg-white shadow-[0_4px_24px_rgba(16,24,40,.12)] w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-line">
              <h3 className="text-lg font-semibold text-ink">Rappel</h3>
              <button onClick={() => setShowRappelModal(null)} className="p-1 rounded-[9px] hover:bg-line-soft text-subtle">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs text-subtle">Nom</p>
                <p className="font-medium text-ink">{showRappelModal.title}</p>
              </div>
              {showRappelModal.description && (
                <div>
                  <p className="text-xs text-subtle">Description</p>
                  <p className="text-ink text-sm whitespace-pre-wrap">{showRappelModal.description}</p>
                </div>
              )}
              <div className="bg-brand-soft border border-brand-line rounded-[9px] p-3">
                <p className="text-sm text-brand-hover">
                  <CalendarIcon className="w-4 h-4 inline mr-1" />
                  {formatDateParis(showRappelModal.callback_at)} à {formatTimeParis(showRappelModal.callback_at)}
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-line flex justify-between">
              <Button
                variant="ghost"
                onClick={handleDeleteRappel}
                disabled={actionLoading}
                className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
                {actionLoading ? "Suppression..." : "Supprimer"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRappelModal(null)}
                className="border-line text-subtle hover:bg-line-soft"
              >
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
