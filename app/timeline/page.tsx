"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";

type UserTimeline = {
  contract_start: string | null;
  contract_end: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type TestRequest = {
  id: string;
  type: string;
  reason: string;
  status: string;
  details: {
    preferred_date?: string;
    test_area?: string;
  } | null;
  created_at: string;
};

const formatDate = (date: string | null | undefined) => {
  if (!date) return "Not set";

  return new Date(date).toLocaleDateString();
};

const daysBetween = (date: string | null | undefined) => {
  if (!date) return null;

  const today = new Date();
  const targetDate = new Date(date);

  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  return Math.ceil(
    (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
};

const addDays = (date: string, days: number) => {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + days);

  return newDate.toISOString().split("T")[0];
};

const calculateSystemTestDate = (contractEnd: string | null) => {
  if (!contractEnd) return null;

  return addDays(contractEnd, -30);
};

const getStatusText = (daysLeft: number | null) => {
  if (daysLeft === null) return "Waiting for contract dates";
  if (daysLeft < 0) return "Contract ended";
  if (daysLeft <= 30) return "Final month";
  if (daysLeft <= 90) return "Closing phase";
  return "In training";
};

const getStatusColor = (daysLeft: number | null) => {
  if (daysLeft === null) return "bg-gray-100 text-gray-700";
  if (daysLeft < 0) return "bg-red-100 text-red-700";
  if (daysLeft <= 30) return "bg-orange-100 text-orange-700";
  if (daysLeft <= 90) return "bg-blue-100 text-blue-700";
  return "bg-green-100 text-green-700";
};

export default function TimelinePage() {
  const [timeline, setTimeline] = useState<UserTimeline | null>(null);
  const [testRequests, setTestRequests] = useState<TestRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTimeline = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const [{ data: userData }, { data: requestData }] = await Promise.all([
      supabase
        .from("users")
        .select("contract_start, contract_end")
        .eq("id", user.id)
        .single<UserTimeline>(),
      supabase
        .from("requests")
        .select("id, type, reason, status, details, created_at")
        .eq("user_id", user.id)
        .eq("type", "test_request")
        .order("created_at", { ascending: false }),
    ]);

    setTimeline(userData ?? null);
    setTestRequests(requestData ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTimeline();
  }, []);

  const contractStart = timeline?.contract_start ?? timeline?.start_date ?? null;
  const contractEnd = timeline?.contract_end ?? timeline?.end_date ?? null;
  const systemTestDate = calculateSystemTestDate(contractEnd);
  const daysLeft = daysBetween(contractEnd);
  const testDaysLeft = daysBetween(systemTestDate);
  const statusText = getStatusText(daysLeft);

  const latestRequestedTestDate = useMemo(() => {
    return testRequests.find((request) => request.details?.preferred_date)
      ?.details?.preferred_date;
  }, [testRequests]);

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={["learner"]}>
        <div className="flex min-h-screen bg-gray-100">
          <Sidebar />
          <main className="flex-1 p-8">
            <p className="text-gray-500">Loading timeline...</p>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["learner"]}>
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />

        <main className="flex-1 p-6 md:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Training Timeline
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Track your contract countdown and the system-set test date near
              the end of your learner period.
            </p>
          </div>

          <div className="mb-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl bg-white p-6 shadow-md">
              <h2 className="text-sm text-gray-500">Contract Ends In</h2>
              <p className="mt-2 text-3xl font-bold">
                {daysLeft === null
                  ? "Not set"
                  : daysLeft < 0
                    ? "Ended"
                    : `${daysLeft} days`}
              </p>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-md">
              <h2 className="text-sm text-gray-500">System Test Countdown</h2>
              <p className="mt-2 text-3xl font-bold">
                {testDaysLeft === null
                  ? "Not set"
                  : testDaysLeft < 0
                    ? "Due"
                    : `${testDaysLeft} days`}
              </p>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-md">
              <h2 className="text-sm text-gray-500">Timeline Status</h2>
              <span
                className={`mt-3 inline-block rounded-full px-4 py-2 font-semibold ${getStatusColor(
                  daysLeft
                )}`}
              >
                {statusText}
              </span>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-xl bg-white p-6 shadow-md">
              <h2 className="mb-6 text-xl font-semibold">Contract Details</h2>

              <div className="space-y-4 text-gray-700">
                <div className="flex justify-between border-b pb-2">
                  <span>Contract Start</span>
                  <span className="font-medium">{formatDate(contractStart)}</span>
                </div>

                <div className="flex justify-between border-b pb-2">
                  <span>Contract End</span>
                  <span className="font-medium">{formatDate(contractEnd)}</span>
                </div>

                <div className="flex justify-between border-b pb-2">
                  <span>System Test Date</span>
                  <span className="font-medium">
                    {formatDate(systemTestDate)}
                  </span>
                </div>

                <div className="flex justify-between border-b pb-2">
                  <span>Latest Requested Test Date</span>
                  <span className="font-medium">
                    {formatDate(latestRequestedTestDate)}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-xl bg-white p-6 shadow-md">
              <h2 className="mb-2 text-xl font-semibold">Test Planning</h2>
              <p className="mb-6 text-sm text-gray-500">
                The system date is automatically set 30 days before your
                contract ends, whether you requested a test or not.
              </p>

              {testRequests.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No test requests found yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {testRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border p-4">
                      <div className="mb-2 flex items-center justify-between gap-4">
                        <p className="font-semibold">
                          {request.details?.test_area ?? "Test request"}
                        </p>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            request.status === "approved"
                              ? "bg-green-100 text-green-700"
                              : request.status === "rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {request.status ?? "pending"}
                        </span>
                      </div>

                      <p className="text-sm text-gray-600">
                        Requested date:{" "}
                        <span className="font-medium">
                          {formatDate(request.details?.preferred_date)}
                        </span>
                      </p>
                      <p className="mt-2 text-sm text-gray-500">
                        {request.reason}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
