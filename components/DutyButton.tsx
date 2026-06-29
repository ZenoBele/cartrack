"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useDutyCheckin } from "../hooks/useDutyCheckin";

type DutyButtonProps = {
  supabase: SupabaseClient;
  userId: string | null;
};

export function DutyButton({ supabase, userId }: DutyButtonProps) {
  const {
    buttonLabel,
    currentStage,
    disabled,
    lastCheckin,
    message,
    status,
    submitCheckin,
    syncStatus,
  } = useDutyCheckin({ supabase, userId });

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-500">Current stage</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">
          {currentStage}
        </h2>
      </div>

      <button
        className="min-h-14 w-full rounded-lg bg-emerald-700 px-5 py-4 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        disabled={disabled}
        onClick={submitCheckin}
        type="button"
      >
        {status === "submitting" ? "Saving..." : buttonLabel}
      </button>

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="font-medium text-slate-500">Last check-in</p>
          <p className="mt-1 text-slate-950">
            {lastCheckin
              ? `${lastCheckin.stage.replace("_", " ")} at ${new Date(
                  lastCheckin.created_at,
                ).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "None today"}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="font-medium text-slate-500">Sync status</p>
          <p className="mt-1 text-slate-950">{syncStatus}</p>
        </div>
      </div>

      {message ? (
        <p
          className={
            status === "locked" || status === "error"
              ? "rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
              : "rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700"
          }
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
