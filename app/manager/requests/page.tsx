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

type LearnerRequest = {
  id: string;
  user_id: string;
  type: string;
  reason: string;
  status: string;
  details: Record<string, unknown>;
  manager_note: string | null;
  created_at: string;
  updated_at: string;
};

type RequestWithLearner = LearnerRequest & {
  learner: Learner | null;
};

const statusOptions = ["all", "pending", "approved", "rejected"];

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function formatLabel(value?: string | null) {
  if (!value) return "Unknown";
  return value.replace(/_/g, " ");
}

function getStatusClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "approved") return "bg-emerald-100 text-emerald-800";
  if (normalized === "rejected" || normalized === "declined") {
    return "bg-red-100 text-red-700";
  }
  if (normalized === "pending") return "bg-amber-100 text-amber-800";

  return "bg-slate-100 text-slate-700";
}

function stringifyDetailValue(value: unknown) {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export default function ManagerRequestsPage() {
  const [requests, setRequests] = useState<RequestWithLearner[]>([]);
  const [selectedRequest, setSelectedRequest] =
    useState<RequestWithLearner | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredRequests = useMemo(() => {
    if (statusFilter === "all") return requests;

    return requests.filter(
      (request) => request.status.toLowerCase() === statusFilter,
    );
  }, [requests, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter(
        (request) => request.status.toLowerCase() === "pending",
      ).length,
      approved: requests.filter(
        (request) => request.status.toLowerCase() === "approved",
      ).length,
      rejected: requests.filter((request) =>
        ["rejected", "declined"].includes(request.status.toLowerCase()),
      ).length,
    };
  }, [requests]);

  const fetchRequests = async () => {
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

    const learners = (learnerData ?? []) as Learner[];
    const learnerIds = learners.map((learner) => learner.id);

    if (learnerIds.length === 0) {
      setRequests([]);
      setLoading(false);
      return;
    }

    const { data: requestData, error: requestError } = await supabase
      .from("requests")
      .select(
        "id, user_id, type, reason, status, details, manager_note, created_at, updated_at",
      )
      .in("user_id", learnerIds)
      .order("created_at", { ascending: false });

    if (requestError) {
      setError(requestError.message);
      setLoading(false);
      return;
    }

    const learnersById = new Map(learners.map((learner) => [learner.id, learner]));

    setRequests(
      ((requestData ?? []) as LearnerRequest[]).map((request) => ({
        ...request,
        learner: learnersById.get(request.user_id) ?? null,
      })),
    );
    setLoading(false);
  };

  const updateRequestStatus = async (
    request: RequestWithLearner,
    status: "approved" | "rejected",
    managerNote: string,
  ) => {
    setSaving(true);
    setError("");

    const { data, error: updateError } = await supabase
      .from("requests")
      .update({
        status,
        manager_note: managerNote.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .select(
        "id, user_id, type, reason, status, details, manager_note, created_at, updated_at",
      )
      .single();

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    const updatedRequest = {
      ...(data as LearnerRequest),
      learner: request.learner,
    };

    setRequests((current) =>
      current.map((item) =>
        item.id === updatedRequest.id ? updatedRequest : item,
      ),
    );
    setSelectedRequest(updatedRequest);
    setSaving(false);
  };

  useEffect(() => {
    void fetchRequests();
  }, []);

  return (
    <ProtectedRoute allowedRoles={["manager", "admin"]}>
      <div className="flex min-h-screen bg-slate-100">
        <Sidebar />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                Manage Requests
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Review learner requests, see context, and respond with notes.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchRequests}
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
            <Stat label="Total" value={stats.total} />
            <Stat label="Pending" value={stats.pending} tone="warning" />
            <Stat label="Approved" value={stats.approved} tone="success" />
            <Stat label="Rejected" value={stats.rejected} tone="danger" />
          </div>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Request Queue
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Select a request to see full details and respond.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-md px-3 py-1 text-sm font-semibold capitalize transition ${
                      statusFilter === status
                        ? "bg-red-600 text-white"
                        : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-600">
                Loading requests...
              </p>
            ) : filteredRequests.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-600">
                No requests found.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredRequests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => setSelectedRequest(request)}
                    className="grid w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">
                        {request.learner?.full_name ?? "Unknown learner"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {[request.learner?.employee_number, request.learner?.department]
                          .filter(Boolean)
                          .join(" - ") || "No staff details"}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm font-semibold capitalize text-slate-900">
                        {formatLabel(request.type)}
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ${getStatusClass(
                          request.status,
                        )}`}
                      >
                        {formatLabel(request.status)}
                      </span>
                    </div>

                    <div className="min-w-0 text-sm text-slate-700">
                      <p className="truncate">{request.reason}</p>
                      <p className="text-xs text-slate-500">
                        Sent {formatDateTime(request.created_at)}
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

        {selectedRequest ? (
          <RequestModal
            request={selectedRequest}
            saving={saving}
            onClose={() => setSelectedRequest(null)}
            onUpdate={updateRequestStatus}
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

function RequestModal({
  request,
  saving,
  onClose,
  onUpdate,
}: {
  request: RequestWithLearner;
  saving: boolean;
  onClose: () => void;
  onUpdate: (
    request: RequestWithLearner,
    status: "approved" | "rejected",
    managerNote: string,
  ) => Promise<void>;
}) {
  const [managerNote, setManagerNote] = useState(request.manager_note ?? "");

  useEffect(() => {
    setManagerNote(request.manager_note ?? "");
  }, [request.id, request.manager_note]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-950">
              {formatLabel(request.type)}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {request.learner?.full_name ?? "Unknown learner"} -{" "}
              {formatDateTime(request.created_at)}
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
          <div className="mb-4 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${getStatusClass(
                request.status,
              )}`}
            >
              {formatLabel(request.status)}
            </span>
            {request.learner?.employee_number ? (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {request.learner.employee_number}
              </span>
            ) : null}
          </div>

          <section className="mb-4 rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold text-slate-950">Reason</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {request.reason}
            </p>
          </section>

          <section className="mb-4 rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold text-slate-950">Details</h4>
            {Object.keys(request.details ?? {}).length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No extra details.</p>
            ) : (
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                {Object.entries(request.details).map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {formatLabel(key)}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-slate-800">
                      {stringifyDetailValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="mb-4 rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold text-slate-950">
              Request timeline
            </h4>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Created" value={formatDateTime(request.created_at)} />
              <Detail label="Last updated" value={formatDateTime(request.updated_at)} />
            </dl>
          </section>

          <label className="block text-sm font-semibold text-slate-950">
            Manager note
            <textarea
              value={managerNote}
              onChange={(event) => setManagerNote(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="Add a short note for the learner..."
            />
          </label>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onUpdate(request, "rejected", managerNote)}
            disabled={saving}
            className="rounded-md border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => onUpdate(request, "approved", managerNote)}
            disabled={saving}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : "Approve"}
          </button>
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
