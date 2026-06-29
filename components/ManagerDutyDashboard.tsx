"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DutyCheckinRow } from "../utils/offlineSync";

type Profile = {
  id: string;
  full_name: string | null;
};

type ManagerRow = DutyCheckinRow & {
  learner_name: string;
};

type ManagerDutyDashboardProps = {
  supabase: SupabaseClient;
};

function formatDistance(value: number | null) {
  if (value === null) {
    return "-";
  }

  if (value < 1) {
    return `${Math.round(value * 1000)} m`;
  }

  return `${value.toFixed(2)} km`;
}

export function ManagerDutyDashboard({ supabase }: ManagerDutyDashboardProps) {
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadRows = async () => {
      setLoading(true);
      setError("");

      const { data: checkins, error: checkinsError } = await supabase
        .from("duty_checkins")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (checkinsError) {
        setError(checkinsError.message);
        setLoading(false);
        return;
      }

      const userIds = Array.from(
        new Set((checkins ?? []).map((checkin) => checkin.user_id)),
      );

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      const profilesById = new Map(
        ((profiles ?? []) as Profile[]).map((profile) => [profile.id, profile]),
      );

      setRows(
        ((checkins ?? []) as DutyCheckinRow[]).map((checkin) => ({
          ...checkin,
          learner_name:
            profilesById.get(checkin.user_id)?.full_name ?? "Unknown learner",
        })),
      );
      setLoading(false);
    };

    void loadRows();
  }, [supabase]);

  return (
    <section className="w-full px-4 py-5">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-950">
            Duty Check-Ins
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Latest learner technician check-ins.
          </p>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Learner</th>
                <th className="px-3 py-3">Stage</th>
                <th className="px-3 py-3">Timestamp</th>
                <th className="px-3 py-3">Coordinates</th>
                <th className="px-3 py-3">Distance moved</th>
                <th className="px-3 py-3">Warning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td className="px-3 py-4 text-slate-600" colSpan={6}>
                    Loading check-ins...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-600" colSpan={6}>
                    No check-ins yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-950">
                      {row.learner_name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {row.stage.replace("_", " ")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {formatDistance(row.distance_from_previous)}
                    </td>
                    <td className="px-3 py-3">
                      {row.warning ? (
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                          {row.warning}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
