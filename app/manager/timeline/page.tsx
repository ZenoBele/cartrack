"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";

type Learner = {
  id: string;
  full_name: string | null;
  employee_number?: string | null;
  department?: string | null;
  branch?: string | null;
  phone_number?: string | null;
};

type TimelineRecord = {
  id: string;
  user_id: string | null;
  contract_start: string | null;
  contract_end: string | null;
  test_date: string | null;
  saturdays_required: number | null;
  saturdays_completed: number | null;
  training_status: string | null;
};

type LearnerTimeline = Learner & {
  timeline: TimelineRecord | null;
};

const CONTRACT_ENDING_SOON_DAYS = 30;

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function formatLabel(value?: string | null) {
  if (!value) return "Not set";
  return value.replace(/_/g, " ");
}

function getDaysUntil(value?: string | null) {
  if (!value) return null;

  const today = new Date();
  const target = new Date(`${value}T00:00:00`);
  today.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function getContractProgress(timeline: TimelineRecord | null) {
  if (!timeline?.contract_start || !timeline.contract_end) return 0;

  const start = new Date(`${timeline.contract_start}T00:00:00`).getTime();
  const end = new Date(`${timeline.contract_end}T00:00:00`).getTime();
  const now = new Date().getTime();

  if (end <= start) return 0;

  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

function getSaturdayProgress(timeline: TimelineRecord | null) {
  const required = timeline?.saturdays_required ?? 0;
  const completed = timeline?.saturdays_completed ?? 0;

  if (required <= 0) return 0;

  return Math.min(100, Math.round((completed / required) * 100));
}

function getContractEndMessage(timeline: TimelineRecord | null) {
  const days = getDaysUntil(timeline?.contract_end);

  if (days === null) return "No contract end";
  if (days < 0) return `${Math.abs(days)} days expired`;
  if (days === 0) return "Ends today";

  return `${days} days left`;
}

function getContractEndClass(timeline: TimelineRecord | null) {
  const days = getDaysUntil(timeline?.contract_end);

  if (days === null) return "text-slate-500";
  if (days < 0) return "text-red-700";
  if (days <= CONTRACT_ENDING_SOON_DAYS) return "text-amber-700";

  return "text-slate-500";
}

function getStatusClass(status?: string | null) {
  const normalized = status?.toLowerCase() ?? "";

  if (["complete", "completed", "passed"].includes(normalized)) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (["behind", "at_risk", "failed", "incomplete"].includes(normalized)) {
    return "bg-red-100 text-red-700";
  }

  if (["testing", "pending", "scheduled"].includes(normalized)) {
    return "bg-amber-100 text-amber-800";
  }

  if (normalized) return "bg-sky-100 text-sky-800";

  return "bg-slate-100 text-slate-700";
}

export default function ManagerTimelinePage() {
  const [learners, setLearners] = useState<LearnerTimeline[]>([]);
  const [selectedLearner, setSelectedLearner] =
    useState<LearnerTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const stats = useMemo(() => {
    const withTimeline = learners.filter((learner) => learner.timeline);
    const testingSoon = withTimeline.filter((learner) => {
      const days = getDaysUntil(learner.timeline?.test_date);
      return days !== null && days >= 0 && days <= 14;
    }).length;
    const contractsEndingSoon = withTimeline.filter((learner) => {
      const days = getDaysUntil(learner.timeline?.contract_end);
      return (
        days !== null &&
        days >= 0 &&
        days <= CONTRACT_ENDING_SOON_DAYS
      );
    }).length;
    const completedSaturdays = withTimeline.filter((learner) => {
      const required = learner.timeline?.saturdays_required ?? 0;
      const completed = learner.timeline?.saturdays_completed ?? 0;
      return required > 0 && completed >= required;
    }).length;
    const missingTimeline = learners.length - withTimeline.length;

    return {
      total: learners.length,
      testingSoon,
      contractsEndingSoon,
      completedSaturdays,
      missingTimeline,
    };
  }, [learners]);

  const fetchTimelines = async () => {
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

    const { data: timelineData, error: timelineError } = await supabase
      .from("timeline")
      .select(
        "id, user_id, contract_start, contract_end, test_date, saturdays_required, saturdays_completed, training_status",
      )
      .in("user_id", learnerIds);

    if (timelineError) {
      setError(timelineError.message);
      setLoading(false);
      return;
    }

    const timelinesByUserId = new Map(
      ((timelineData ?? []) as TimelineRecord[]).map((timeline) => [
        timeline.user_id,
        timeline,
      ]),
    );

    setLearners(
      assignedLearners.map((learner) => ({
        ...learner,
        timeline: timelinesByUserId.get(learner.id) ?? null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    void fetchTimelines();
  }, []);

  return (
    <ProtectedRoute allowedRoles={["manager", "admin"]}>
      <div className="flex min-h-screen bg-slate-100">
        <Sidebar />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                Learner Timelines
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Contract dates, test dates, Saturdays, and training status.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchTimelines}
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
            <Stat label="Learners" value={stats.total} />
            <Stat label="Tests soon" value={stats.testingSoon} tone="warning" />
            <Stat
              label="Contracts ending"
              value={stats.contractsEndingSoon}
              tone="warning"
            />
            <Stat
              label="Missing timelines"
              value={stats.missingTimeline}
              tone="danger"
            />
          </div>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-950">
                Timeline Overview
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Select a learner to view their full timeline.
              </p>
            </div>

            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-600">
                Loading timelines...
              </p>
            ) : learners.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-600">
                No learners assigned.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {learners.map((learner) => {
                  const timeline = learner.timeline;
                  const testDays = getDaysUntil(timeline?.test_date);
                  const saturdayProgress = getSaturdayProgress(timeline);

                  return (
                    <button
                      key={learner.id}
                      type="button"
                      onClick={() => setSelectedLearner(learner)}
                      className="grid w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_auto]"
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
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${getStatusClass(
                            timeline?.training_status,
                          )}`}
                        >
                          {formatLabel(timeline?.training_status)}
                        </span>
                        <p className="mt-1 text-xs text-slate-500">
                          Test: {formatDate(timeline?.test_date)}
                        </p>
                        <p
                          className={`mt-1 text-xs font-semibold ${getContractEndClass(
                            timeline,
                          )}`}
                        >
                          Contract: {getContractEndMessage(timeline)}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>Saturdays</span>
                          <span>
                            {timeline?.saturdays_completed ?? 0}/
                            {timeline?.saturdays_required ?? 0}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-red-600"
                            style={{ width: `${saturdayProgress}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {testDays === null
                            ? "No test date"
                            : testDays < 0
                              ? `${Math.abs(testDays)} days past test`
                              : `${testDays} days until test`}
                        </p>
                      </div>

                      <span className="self-center rounded-md border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700">
                        View
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </main>

        {selectedLearner ? (
          <TimelineModal
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
  tone?: "default" | "warning" | "success" | "danger";
}) {
  const toneClass = {
    default: "text-slate-950",
    warning: "text-amber-700",
    success: "text-emerald-700",
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

function TimelineModal({
  learner,
  onClose,
}: {
  learner: LearnerTimeline;
  onClose: () => void;
}) {
  const timeline = learner.timeline;
  const contractProgress = getContractProgress(timeline);
  const saturdayProgress = getSaturdayProgress(timeline);
  const testDays = getDaysUntil(timeline?.test_date);

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

        <div className="max-h-[64vh] overflow-y-auto px-5 py-4">
          {!timeline ? (
            <p className="text-sm text-slate-600">
              This learner does not have a timeline record yet.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${getStatusClass(
                    timeline.training_status,
                  )}`}
                >
                  {formatLabel(timeline.training_status)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                  {testDays === null
                    ? "No test date"
                    : testDays < 0
                      ? `${Math.abs(testDays)} days past test`
                      : `${testDays} days until test`}
                </span>
              </div>

              <section className="rounded-lg border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-950">
                  Contract
                </h4>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <Detail
                    label="Contract start"
                    value={formatDate(timeline.contract_start)}
                  />
                  <Detail
                    label="Contract end"
                    value={formatDate(timeline.contract_end)}
                  />
                </dl>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Contract progress</span>
                    <span>{Math.round(contractProgress)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-red-600"
                      style={{ width: `${contractProgress}%` }}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-950">
                  Training Milestones
                </h4>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <Detail label="Test date" value={formatDate(timeline.test_date)} />
                  <Detail
                    label="Training status"
                    value={formatLabel(timeline.training_status)}
                  />
                  <Detail
                    label="Saturdays required"
                    value={(timeline.saturdays_required ?? 0).toString()}
                  />
                  <Detail
                    label="Saturdays completed"
                    value={(timeline.saturdays_completed ?? 0).toString()}
                  />
                </dl>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Saturday completion</span>
                    <span>{saturdayProgress}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-red-600"
                      style={{ width: `${saturdayProgress}%` }}
                    />
                  </div>
                </div>
              </section>
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
