"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import { DutyButton } from "@/components/DutyButton";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";

type AttendanceType =
  | "on_duty"
  | "buddy_tech_absent"
  | "sick"
  | "emergency"
  | "leave"
  | "off_duty";

type ModalType = AttendanceType | "history" | "sick_note" | "duty_checkin";

type AttendanceRecord = {
  id: string;
  type: AttendanceType;
  created_at: string;
  date: string;
  reason: string | null;
  sick_note_url: string | null;
  leave_start: string | null;
  leave_end: string | null;
  manager_approved: boolean | null;
  checklist: string[] | null;
};

const offDutyChecklist = [
  "Fitted a CN6",
  "Road Vision",
  "Dual Vision",
  "CT9",
  "CN5",
  "Fleet Light",
  "Panic",
  "Tag",
];

const todayDate = () => new Date().toISOString().split("T")[0];

const formatType = (type: string) =>
  type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [saturdaysDone, setSaturdaysDone] = useState(0);
  const [currentStatus, setCurrentStatus] = useState("No status yet");
  const [todayHistory, setTodayHistory] = useState<AttendanceRecord[]>([]);
  const [allHistory, setAllHistory] = useState<AttendanceRecord[]>([]);
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [reason, setReason] = useState("");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [managerApproved, setManagerApproved] = useState(false);
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [sickNoteRecordId, setSickNoteRecordId] = useState<string | null>(null);
  const [sickNoteFile, setSickNoteFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const getCurrentUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUserId(user?.id ?? null);
    return user;
  };

  const fetchSaturdays = async () => {
    const user = await getCurrentUser();

    if (!user) return;

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    const { data } = await supabase
      .from("attendance")
      .select("date")
      .eq("user_id", user.id)
      .eq("type", "on_duty")
      .gte("date", startOfMonth)
      .lte("date", endOfMonth);

    if (!data) return;

    const saturdayCount = data.filter((record) => {
      const day = new Date(record.date).getDay();
      return day === 6;
    }).length;

    setSaturdaysDone(saturdayCount);
  };

  const fetchCurrentStatus = async () => {
    const user = await getCurrentUser();

    if (!user) return;

    const { data } = await supabase
      .from("attendance")
      .select("type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setCurrentStatus(formatType(data.type));
    }
  };

  const fetchTodayHistory = async () => {
    const user = await getCurrentUser();

    if (!user) return;

    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", todayDate())
      .order("created_at", { ascending: false });

    if (!data) return;

    setTodayHistory(data);
    const sickWithoutNote = data.find(
      (record) => record.type === "sick" && !record.sick_note_url,
    );
    setSickNoteRecordId(sickWithoutNote?.id ?? null);
  };

  const fetchAllHistory = async () => {
    const user = await getCurrentUser();

    if (!user) return;

    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      setAllHistory(data);
    }
  };

  const refreshDashboard = async () => {
    await fetchSaturdays();
    await fetchCurrentStatus();
    await fetchTodayHistory();
  };

  const canReportBefore = (hour: number) => {
    const now = new Date();
    return now.getHours() < hour;
  };

  const reportStatus = async (
    type: AttendanceType,
    extraData: Record<string, unknown> = {},
  ) => {
    const user = await getCurrentUser();

    if (!user) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("attendance")
      .insert({
        user_id: user.id,
        type,
        date: todayDate(),
        ...extraData,
      })
      .select()
      .single();

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    if (type === "sick" && data) {
      setSickNoteRecordId(data.id);
    }

    closeModal();
    await refreshDashboard();
  };

  const handleActionClick = (type: AttendanceType) => {
    if (type === "on_duty") {
      if (!canReportBefore(8)) {
        alert("On Duty can only be submitted before 8:00 AM.");
        return;
      }

      reportStatus("on_duty");
      return;
    }

    if (type === "sick") {
      if (!canReportBefore(7)) {
        alert("Sick can only be submitted before 7:00 AM.");
        return;
      }
    }

    setActiveModal(type);
  };

  const submitSick = () => {
    if (!reason.trim()) {
      alert("Please explain the sickness or problem.");
      return;
    }

    reportStatus("sick", { reason });
  };

  const submitEmergency = () => {
    if (!reason.trim()) {
      alert("Please add a brief emergency description.");
      return;
    }

    reportStatus("emergency", { reason });
  };

  const submitLeave = () => {
    if (!managerApproved || !leaveStart || !leaveEnd) {
      alert("Please confirm manager approval and add the leave dates.");
      return;
    }

    reportStatus("leave", {
      manager_approved: managerApproved,
      leave_start: leaveStart,
      leave_end: leaveEnd,
    });
  };

  const submitOffDuty = () => {
    if (checkedItems.length === 0) {
      alert("Please select at least one completed job item.");
      return;
    }

    reportStatus("off_duty", { checklist: checkedItems });
  };

  const uploadSickNote = async () => {
    if (!sickNoteRecordId || !sickNoteFile) {
      alert("Please choose a PDF or image sick note.");
      return;
    }

    const user = await getCurrentUser();

    if (!user) return;

    const fileExt = sickNoteFile.name.split(".").pop();
    const filePath = `${user.id}/${sickNoteRecordId}.${fileExt}`;

    setLoading(true);

    const { error: uploadError } = await supabase.storage
      .from("sick-notes")
      .upload(filePath, sickNoteFile, { upsert: true });

    if (uploadError) {
      setLoading(false);
      alert(uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("sick-notes")
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from("attendance")
      .update({ sick_note_url: publicUrlData.publicUrl })
      .eq("id", sickNoteRecordId);

    setLoading(false);

    if (updateError) {
      alert(updateError.message);
      return;
    }

    setSickNoteRecordId(null);
    setSickNoteFile(null);
    closeModal();
    await refreshDashboard();
  };

  const closeModal = () => {
    setActiveModal(null);
    setReason("");
    setLeaveStart("");
    setLeaveEnd("");
    setManagerApproved(false);
    setCheckedItems([]);
  };

  const openHistory = async () => {
    await fetchAllHistory();
    setActiveModal("history");
  };

  useEffect(() => {
    refreshDashboard();
  }, []);

  const actionButtons = [
    { label: "On Duty", value: "on_duty" as AttendanceType },
    { label: "Buddy Tech Absent", value: "buddy_tech_absent" as AttendanceType },
    { label: "Sick", value: "sick" as AttendanceType },
    { label: "Emergency", value: "emergency" as AttendanceType },
    { label: "On Leave", value: "leave" as AttendanceType },
    { label: "Off Duty", value: "off_duty" as AttendanceType },
  ];

  return (
    <ProtectedRoute allowedRoles={["learner"]}>
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />

        <main className="flex-1 p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Learner Dashboard
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Report your day and keep your training record current.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {sickNoteRecordId && (
                <button
                  onClick={() => setActiveModal("sick_note")}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-200 transition hover:bg-red-700"
                >
                  Sick note required
                </button>
              )}

              <button
                onClick={() => setActiveModal("duty_checkin")}
                className="rounded-full border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
                type="button"
              >
                Duty Check-In
              </button>
            </div>
          </div>

          <section className="mb-8 rounded-2xl bg-gray-950 p-6 text-white shadow-xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-red-300">
                  Quick Actions
                </p>
                <h2 className="mt-1 text-2xl font-bold">Today&apos;s report</h2>
              </div>

              <span className="rounded-full bg-white/10 px-4 py-2 text-sm">
                Current: {currentStatus}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {actionButtons.map((button) => (
                <button
                  key={button.value}
                  onClick={() => handleActionClick(button.value)}
                  disabled={loading}
                  className="rounded-xl border border-white/10 bg-white px-4 py-4 text-left text-sm font-bold text-gray-950 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-50 disabled:opacity-60"
                >
                  {button.label}
                </button>
              ))}
            </div>
          </section>

          <div className="mb-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl bg-white p-6 shadow-md">
              <h2 className="text-sm text-gray-500">Saturdays Completed</h2>
              <p className="mt-2 text-3xl font-bold">{saturdaysDone}/2</p>
              <p className="mt-2 text-sm text-gray-500">
                Monthly target counts Saturday on-duty reports only.
              </p>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-md">
              <h2 className="text-sm text-gray-500">Current Status</h2>
              <span className="mt-3 inline-block rounded-full bg-red-100 px-4 py-2 font-semibold text-red-700">
                {currentStatus}
              </span>
            </div>
          </div>

          <section className="rounded-xl bg-white p-6 shadow-md">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Today&apos;s Activities</h2>
              <button
                onClick={openHistory}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                View My History
              </button>
            </div>

            {todayHistory.length === 0 ? (
              <p className="text-gray-500">No activity recorded today.</p>
            ) : (
              <div className="space-y-4">
                {todayHistory.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between border-b pb-3"
                  >
                    <div>
                      <p className="font-medium">{formatType(record.type)}</p>
                      {record.reason && (
                        <p className="text-sm text-gray-500">{record.reason}</p>
                      )}
                    </div>

                    <span className="text-sm text-gray-500">
                      {new Date(record.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        {activeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              {activeModal === "duty_checkin" && (
                <>
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h2 className="text-xl font-bold">Duty Check-In</h2>
                    <button
                      onClick={closeModal}
                      className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                      type="button"
                    >
                      Close
                    </button>
                  </div>
                  <DutyButton supabase={supabase} userId={userId} />
                </>
              )}

              {activeModal === "buddy_tech_absent" && (
                <>
                  <h2 className="text-xl font-bold">Buddy Tech Absent</h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Confirm that your buddy technician is absent today.
                  </p>
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => reportStatus("buddy_tech_absent")}
                      className="flex-1 rounded-lg bg-red-600 py-3 font-semibold text-white hover:bg-red-700"
                    >
                      Submit
                    </button>
                    <button
                      onClick={closeModal}
                      className="flex-1 rounded-lg bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {activeModal === "sick" && (
                <>
                  <h2 className="text-xl font-bold">Sick Report</h2>
                  <textarea
                    placeholder="What is the problem?"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-4 min-h-28 w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={submitSick}
                      className="flex-1 rounded-lg bg-red-600 py-3 font-semibold text-white hover:bg-red-700"
                    >
                      Submit Sick
                    </button>
                    <button
                      onClick={closeModal}
                      className="flex-1 rounded-lg bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {activeModal === "sick_note" && (
                <>
                  <h2 className="text-xl font-bold">Submit Sick Note</h2>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => setSickNoteFile(e.target.files?.[0] ?? null)}
                    className="mt-4 w-full rounded-lg border px-4 py-3"
                  />
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={uploadSickNote}
                      disabled={loading}
                      className="flex-1 rounded-lg bg-red-600 py-3 font-semibold text-white hover:bg-red-700 disabled:bg-red-300"
                    >
                      Upload
                    </button>
                    <button
                      onClick={closeModal}
                      className="flex-1 rounded-lg bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {activeModal === "emergency" && (
                <>
                  <h2 className="text-xl font-bold">Emergency</h2>
                  <textarea
                    placeholder="Briefly describe the emergency"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-4 min-h-28 w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={submitEmergency}
                      className="flex-1 rounded-lg bg-red-600 py-3 font-semibold text-white hover:bg-red-700"
                    >
                      Submit
                    </button>
                    <button
                      onClick={closeModal}
                      className="flex-1 rounded-lg bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {activeModal === "leave" && (
                <>
                  <h2 className="text-xl font-bold">On Leave</h2>
                  <label className="mt-4 flex items-center gap-3 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={managerApproved}
                      onChange={(e) => setManagerApproved(e.target.checked)}
                    />
                    Manager approved this leave
                  </label>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input
                      type="date"
                      value={leaveStart}
                      onChange={(e) => setLeaveStart(e.target.value)}
                      className="rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <input
                      type="date"
                      value={leaveEnd}
                      onChange={(e) => setLeaveEnd(e.target.value)}
                      className="rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={submitLeave}
                      className="flex-1 rounded-lg bg-red-600 py-3 font-semibold text-white hover:bg-red-700"
                    >
                      Submit Leave
                    </button>
                    <button
                      onClick={closeModal}
                      className="flex-1 rounded-lg bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {activeModal === "off_duty" && (
                <>
                  <h2 className="text-xl font-bold">Off Duty Checklist</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {offDutyChecklist.map((item) => (
                      <label
                        key={item}
                        className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checkedItems.includes(item)}
                          onChange={(e) =>
                            setCheckedItems((items) =>
                              e.target.checked
                                ? [...items, item]
                                : items.filter((checkedItem) => checkedItem !== item),
                            )
                          }
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={submitOffDuty}
                      className="flex-1 rounded-lg bg-red-600 py-3 font-semibold text-white hover:bg-red-700"
                    >
                      Submit Off Duty
                    </button>
                    <button
                      onClick={closeModal}
                      className="flex-1 rounded-lg bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {activeModal === "history" && (
                <>
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h2 className="text-xl font-bold">My History</h2>
                    <button
                      onClick={closeModal}
                      className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-96 space-y-3 overflow-y-auto">
                    {allHistory.length === 0 ? (
                      <p className="text-sm text-gray-500">No history found.</p>
                    ) : (
                      allHistory.map((record) => (
                        <div key={record.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold">{formatType(record.type)}</p>
                            <span className="text-xs text-gray-500">
                              {new Date(record.created_at).toLocaleString()}
                            </span>
                          </div>
                          {record.reason && (
                            <p className="mt-1 text-sm text-gray-500">
                              {record.reason}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
