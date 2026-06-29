"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Learner = {
  id: string;
  full_name: string | null;
  employee_number?: string | null;
  department?: string | null;
  branch?: string | null;
  phone_number?: string | null;
};

type DutyCheckin = {
  id: string;
  user_id: string;
  checkin_date: string;
  stage: string;
  latitude: number;
  longitude: number;
  created_at: string | null;
  distance_from_previous: number | null;
  warning: string | null;
  is_synced: boolean | null;
};

type LearnerDutySummary = Learner & {
  latestCheckin: DutyCheckin | null;
  checkins: DutyCheckin[];
  todayCount: number;
  warningCount: number;
  unsyncedCount: number;
};

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const today = getLocalDateKey();

function formatStage(stage?: string | null) {
  if (!stage) return "No check-in";
  return stage.replace(/_/g, " ");
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function formatDistance(value?: number | null) {
  if (value === null || value === undefined) return "N/A";
  if (value < 1) return `${Math.round(value * 1000)} m`;
  return `${value.toFixed(2)} km`;
}

function getStatusStyle(summary: LearnerDutySummary) {
  if (!summary.latestCheckin) {
    return "bg-slate-100 text-slate-700";
  }

  if (summary.warningCount > 0) {
    return "bg-amber-100 text-amber-800";
  }

  if (summary.latestCheckin.checkin_date === today) {
    return "bg-emerald-100 text-emerald-800";
  }

  return "bg-slate-100 text-slate-700";
}

export default function ManagerPage() {
  const [learners, setLearners] = useState<LearnerDutySummary[]>([]);
  const [selectedLearner, setSelectedLearner] =
    useState<LearnerDutySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const stats = useMemo(() => {
    return {
      total: learners.length,
      checkedInToday: learners.filter((learner) => learner.todayCount > 0)
        .length,
      warnings: learners.reduce(
        (total, learner) => total + learner.warningCount,
        0,
      ),
      unsynced: learners.reduce(
        (total, learner) => total + learner.unsyncedCount,
        0,
      ),
    };
  }, [learners]);

  const fetchLearnerDutyCheckins = async () => {
    setLoading(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: learnerData, error: learnerError } = await supabase
      .from("users")
      .select(
        "id, full_name, employee_number, department, branch, phone_number",
      )
      .eq("manager_id", user.id)
      .order("full_name", { ascending: true });

    if (learnerError) {
      setError(learnerError.message);
      setLoading(false);
      return;
    }

    const assignedLearners = (learnerData ?? []) as Learner[];
    const learnerIds = assignedLearners.map((learner) => learner.id);

    if (learnerIds.length === 0) {
      setLearners([]);
      setLoading(false);
      return;
    }

    const { data: checkinData, error: checkinError } = await supabase
      .from("duty_checkins")
      .select(
        "id, user_id, checkin_date, stage, latitude, longitude, created_at, distance_from_previous, warning, is_synced",
      )
      .in("user_id", learnerIds)
      .order("created_at", { ascending: false })
      .limit(250);

    if (checkinError) {
      setError(checkinError.message);
      setLoading(false);
      return;
    }

    const checkins = (checkinData ?? []) as DutyCheckin[];

    setLearners(
      assignedLearners.map((learner) => {
        const learnerCheckins = checkins.filter(
          (checkin) => checkin.user_id === learner.id,
        );

        return {
          ...learner,
          latestCheckin: learnerCheckins[0] ?? null,
          checkins: learnerCheckins,
          todayCount: learnerCheckins.filter(
            (checkin) => checkin.checkin_date === today,
          ).length,
          warningCount: learnerCheckins.filter((checkin) => checkin.warning)
            .length,
          unsyncedCount: learnerCheckins.filter(
            (checkin) => checkin.is_synced === false,
          ).length,
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    void fetchLearnerDutyCheckins();
  }, []);

  return (
    <ProtectedRoute allowedRoles={["manager", "admin"]}>
      <div className="flex min-h-screen bg-slate-100">
        <Sidebar />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                Manager Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Duty check-ins from your assigned learners.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchLearnerDutyCheckins}
              className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 sm:w-auto"
            >
              Refresh
            </button>
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Total learners" value={stats.total} />
            <Stat label="Checked in today" value={stats.checkedInToday} />
            <Stat label="Warnings" value={stats.warnings} tone="warning" />
            <Stat label="Not synced" value={stats.unsynced} tone="danger" />
          </div>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-950">
                Learner Duty Check-ins
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Compact list with the latest stage, time, and location signal.
              </p>
            </div>

            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-600">
                Loading learner check-ins...
              </p>
            ) : learners.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-600">
                No learners assigned.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {learners.map((learner) => (
                  <button
                    key={learner.id}
                    type="button"
                    onClick={() => setSelectedLearner(learner)}
                    className="grid w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">
                        {learner.full_name ?? "Unnamed learner"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {[learner.employee_number, learner.department]
                          .filter(Boolean)
                          .join(" - ") || "No staff details"}
                      </p>
                    </div>

                    <div>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${getStatusStyle(
                          learner,
                        )}`}
                      >
                        {formatStage(learner.latestCheckin?.stage)}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700">
                      <p>{formatDateTime(learner.latestCheckin?.created_at)}</p>
                      <p className="text-xs text-slate-500">
                        {learner.todayCount} today
                        {learner.warningCount > 0
                          ? ` - ${learner.warningCount} warning`
                          : ""}
                      </p>
                    </div>

                    <span className="self-center rounded-md border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700">
                      View
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>

        {selectedLearner ? (
          <LearnerCheckinModal
            learner={selectedLearner}
            onClose={() => setSelectedLearner(null)}
          />
        ) : null}
      </div>
    </ProtectedRoute>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-slate-950",
    warning: "text-amber-700",
    danger: "text-red-700",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-red-700"
    >
      {label}
    </Link>
  );
}

function LearnerCheckinModal({
  learner,
  onClose,
}: {
  learner: LearnerDutySummary;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-950">
              {learner.full_name ?? "Unnamed learner"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {[learner.employee_number, learner.branch, learner.phone_number]
                .filter(Boolean)
                .join(" - ") || "Learner details unavailable"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="grid gap-3 border-b border-slate-200 px-5 py-4 sm:grid-cols-3">
          <Stat label="Today" value={learner.todayCount} />
          <Stat label="Warnings" value={learner.warningCount} tone="warning" />
          <Stat label="Not synced" value={learner.unsyncedCount} tone="danger" />
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-5 py-4">
          {learner.checkins.length === 0 ? (
            <p className="text-sm text-slate-600">
              This learner has no duty check-ins yet.
            </p>
          ) : (
            <div className="space-y-3">
              {learner.checkins.map((checkin) => (
                <div
                  key={checkin.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold capitalize text-slate-950">
                        {formatStage(checkin.stage)}
                      </p>
                      <p className="text-sm text-slate-600">
                        {formatDateTime(checkin.created_at)}
                      </p>
                    </div>

                    <span
                      className={`w-fit rounded-full px-2 py-1 text-xs font-semibold ${
                        checkin.is_synced === false
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {checkin.is_synced === false ? "Not synced" : "Synced"}
                    </span>
                  </div>

                  <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <Detail label="Date" value={checkin.checkin_date} />
                    <Detail
                      label="Distance from previous"
                      value={formatDistance(checkin.distance_from_previous)}
                    />
                    <Detail
                      label="Latitude"
                      value={checkin.latitude.toFixed(6)}
                    />
                    <Detail
                      label="Longitude"
                      value={checkin.longitude.toFixed(6)}
                    />
                  </dl>

                  {checkin.warning ? (
                    <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                      {checkin.warning}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-slate-800">{value}</dd>
    </div>
  );
}
