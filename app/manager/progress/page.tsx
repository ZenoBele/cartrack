"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type Learner = {
  id: string;
  full_name: string | null;
  employee_number?: string | null;
  department?: string | null;
  branch?: string | null;
  phone_number?: string | null;
};

type ProgressRecord = {
  id: string;
  user_id: string;
  skill_name: string;
  level: number;
  understands: boolean;
  needs_help: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type LearnerProgressSummary = Learner & {
  records: ProgressRecord[];
  averageLevel: number;
  understandsCount: number;
  needsHelpCount: number;
  latestUpdate: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function getLevelLabel(level: number) {
  if (level >= 4) return "Strong";
  if (level >= 3) return "Developing";
  if (level >= 2) return "Needs practice";
  return "Starting";
}

function getProgressTone(summary: LearnerProgressSummary) {
  if (summary.records.length === 0) return "bg-slate-100 text-slate-700";
  if (summary.needsHelpCount > 0) return "bg-amber-100 text-amber-800";
  if (summary.averageLevel >= 4) return "bg-emerald-100 text-emerald-800";
  return "bg-sky-100 text-sky-800";
}

export default function ManagerProgressPage() {
  const [learners, setLearners] = useState<LearnerProgressSummary[]>([]);
  const [selectedLearner, setSelectedLearner] =
    useState<LearnerProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const stats = useMemo(() => {
    const allRecords = learners.flatMap((learner) => learner.records);
    const learnersNeedingHelp = learners.filter(
      (learner) => learner.needsHelpCount > 0,
    ).length;
    const averageLevel =
      allRecords.length === 0
        ? 0
        : allRecords.reduce((total, record) => total + record.level, 0) /
          allRecords.length;

    return {
      totalLearners: learners.length,
      totalSkills: allRecords.length,
      learnersNeedingHelp,
      averageLevel,
    };
  }, [learners]);

  const fetchProgress = async () => {
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

    const { data: progressData, error: progressError } = await supabase
      .from("progress")
      .select(
        "id, user_id, skill_name, level, understands, needs_help, notes, created_at, updated_at",
      )
      .in("user_id", learnerIds)
      .order("updated_at", { ascending: false });

    if (progressError) {
      setError(progressError.message);
      setLoading(false);
      return;
    }

    const progressRecords = (progressData ?? []) as ProgressRecord[];

    setLearners(
      assignedLearners.map((learner) => {
        const records = progressRecords.filter(
          (record) => record.user_id === learner.id,
        );
        const averageLevel =
          records.length === 0
            ? 0
            : records.reduce((total, record) => total + record.level, 0) /
              records.length;

        return {
          ...learner,
          records,
          averageLevel,
          understandsCount: records.filter((record) => record.understands)
            .length,
          needsHelpCount: records.filter((record) => record.needs_help).length,
          latestUpdate: records[0]?.updated_at ?? null,
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    void fetchProgress();
  }, []);

  return (
    <ProtectedRoute allowedRoles={["manager", "admin"]}>
      <div className="flex min-h-screen bg-slate-100">
        <Sidebar />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                Learner Progress
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Skills, confidence, support needs, and manager notes.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchProgress}
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
            <Stat label="Learners" value={stats.totalLearners.toString()} />
            <Stat label="Skills recorded" value={stats.totalSkills.toString()} />
            <Stat
              label="Need help"
              value={stats.learnersNeedingHelp.toString()}
              tone="warning"
            />
            <Stat
              label="Average level"
              value={stats.averageLevel ? stats.averageLevel.toFixed(1) : "0"}
              tone="info"
            />
          </div>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-950">
                Progress Overview
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Select a learner to review their full skill progress.
              </p>
            </div>

            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-600">
                Loading progress...
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
                    className="grid w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
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
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getProgressTone(
                          learner,
                        )}`}
                      >
                        {learner.records.length === 0
                          ? "No progress"
                          : getLevelLabel(Math.round(learner.averageLevel))}
                      </span>
                    </div>

                    <div className="text-sm text-slate-700">
                      <p>
                        {learner.records.length} skill
                        {learner.records.length === 1 ? "" : "s"} recorded
                      </p>
                      <p className="text-xs text-slate-500">
                        {learner.needsHelpCount > 0
                          ? `${learner.needsHelpCount} need help`
                          : `Updated ${formatDateTime(learner.latestUpdate)}`}
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
          <ProgressModal
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
  value: string;
  tone?: "default" | "warning" | "info";
}) {
  const toneClass = {
    default: "text-slate-950",
    warning: "text-amber-700",
    info: "text-sky-700",
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

function ProgressModal({
  learner,
  onClose,
}: {
  learner: LearnerProgressSummary;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl">
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

        <div className="grid gap-3 border-b border-slate-200 px-5 py-4 sm:grid-cols-4">
          <Stat label="Skills" value={learner.records.length.toString()} />
          <Stat
            label="Average"
            value={learner.averageLevel ? learner.averageLevel.toFixed(1) : "0"}
            tone="info"
          />
          <Stat
            label="Understands"
            value={learner.understandsCount.toString()}
          />
          <Stat
            label="Needs help"
            value={learner.needsHelpCount.toString()}
            tone="warning"
          />
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-5 py-4">
          {learner.records.length === 0 ? (
            <p className="text-sm text-slate-600">
              This learner has no progress records yet.
            </p>
          ) : (
            <div className="space-y-3">
              {learner.records.map((record) => (
                <div
                  key={record.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {record.skill_name}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Updated {formatDateTime(record.updated_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge tone="info">
                        Level {record.level} - {getLevelLabel(record.level)}
                      </Badge>
                      <Badge tone={record.understands ? "success" : "muted"}>
                        {record.understands
                          ? "Understands"
                          : "Still learning"}
                      </Badge>
                      {record.needs_help ? (
                        <Badge tone="warning">Needs help</Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-red-600"
                      style={{ width: `${Math.min(record.level, 5) * 20}%` }}
                    />
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <Detail label="Created" value={formatDateTime(record.created_at)} />
                    <Detail label="Last updated" value={formatDateTime(record.updated_at)} />
                  </dl>

                  {record.notes ? (
                    <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {record.notes}
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

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "success" | "warning" | "info" | "muted";
}) {
  const toneClass = {
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    info: "bg-sky-100 text-sky-800",
    muted: "bg-slate-100 text-slate-700",
  }[tone];

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${toneClass}`}>
      {children}
    </span>
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
