"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";

type ProgressRecord = {
  id?: string;
  user_id?: string;
  skill_name: string;
  level: number;
  understands: boolean;
  needs_help: boolean;
  notes: string | null;
  updated_at?: string;
};

type AttendanceRecord = {
  id: string;
  type: string;
  date: string;
  created_at: string;
  checklist: string[] | null;
};

type UserProfile = {
  contract_start: string | null;
  start_date?: string | null;
};

const skillPlan = [
  { name: "CN6 Installation", expectedMonth: 3 },
  { name: "CN5 Installation", expectedMonth: 4 },
  { name: "CT9 Installation", expectedMonth: 5 },
  { name: "Road Vision", expectedMonth: 5 },
  { name: "Dual Vision", expectedMonth: 6 },
  { name: "Fleet Light", expectedMonth: 7 },
  { name: "Panic Button", expectedMonth: 8 },
  { name: "Tag Installation", expectedMonth: 8 },
  { name: "Fault Finding", expectedMonth: 9 },
  { name: "Job Card Completion", expectedMonth: 2 },
];

const checklistSkillMap: Record<string, string> = {
  "Fitted a CN6": "CN6 Installation",
  CN6: "CN6 Installation",
  CN5: "CN5 Installation",
  CT9: "CT9 Installation",
  "Road Vision": "Road Vision",
  "Dual Vision": "Dual Vision",
  "Fleet Light": "Fleet Light",
  Panic: "Panic Button",
  Tag: "Tag Installation",
};

const monthDiff = (startDate: string | null) => {
  if (!startDate) return 0;

  const start = new Date(startDate);
  const today = new Date();

  const months =
    (today.getFullYear() - start.getFullYear()) * 12 +
    today.getMonth() -
    start.getMonth();

  return Math.max(0, months + 1);
};

const getBarColor = (level: number) => {
  if (level < 40) return "bg-red-500";
  if (level < 70) return "bg-orange-500";
  return "bg-green-500";
};

const getFeedbackColor = (feedback: string) => {
  if (feedback === "falling behind") return "bg-red-100 text-red-700";
  if (feedback === "exceeding") return "bg-blue-100 text-blue-700";
  return "bg-green-100 text-green-700";
};

export default function ProgressPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [contractMonth, setContractMonth] = useState(0);
  const [progress, setProgress] = useState<ProgressRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchProgressData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setUserId(user.id);

    const [{ data: profile }, { data: progressData }, { data: attendanceData }] =
      await Promise.all([
        supabase
          .from("users")
          .select("contract_start, start_date")
          .eq("id", user.id)
          .single<UserProfile>(),
        supabase
          .from("progress")
          .select("*")
          .eq("user_id", user.id)
          .order("skill_name"),
        supabase
          .from("attendance")
          .select("id, type, date, created_at, checklist")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

    const startDate = profile?.contract_start ?? profile?.start_date ?? null;
    setContractMonth(monthDiff(startDate));
    setAttendance(attendanceData ?? []);

    const savedProgress = progressData ?? [];
    const mergedProgress = skillPlan.map((skill) => {
      const savedSkill = savedProgress.find(
        (record) => record.skill_name === skill.name
      );

      return {
        skill_name: skill.name,
        level: savedSkill?.level ?? 0,
        understands: savedSkill?.understands ?? false,
        needs_help: savedSkill?.needs_help ?? false,
        notes: savedSkill?.notes ?? "",
      };
    });

    setProgress(mergedProgress);
  };

  useEffect(() => {
    fetchProgressData();
  }, []);

  const attendedSkillCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    attendance.forEach((record) => {
      record.checklist?.forEach((item) => {
        const skillName = checklistSkillMap[item];

        if (skillName) {
          counts[skillName] = (counts[skillName] ?? 0) + 1;
        }
      });
    });

    return counts;
  }, [attendance]);

  const expectedSkills = skillPlan.filter(
    (skill) => contractMonth >= skill.expectedMonth
  );

  const overall =
    progress.length > 0
      ? Math.round(
          progress.reduce((sum, skill) => sum + Number(skill.level), 0) /
            progress.length
        )
      : 0;

  const expectedOverall =
    skillPlan.length > 0
      ? Math.round((expectedSkills.length / skillPlan.length) * 100)
      : 0;

  const understoodExpected = expectedSkills.filter((skill) => {
    const record = progress.find((item) => item.skill_name === skill.name);
    return record && record.level >= 60 && record.understands;
  }).length;

  const feedback =
    overall >= expectedOverall + 15
      ? "exceeding"
      : expectedSkills.length > 0 &&
          understoodExpected / expectedSkills.length < 0.65
        ? "falling behind"
        : "on target";

  const updateSkill = (
    skillName: string,
    updates: Partial<ProgressRecord>
  ) => {
    setProgress((records) =>
      records.map((record) =>
        record.skill_name === skillName ? { ...record, ...updates } : record
      )
    );
  };

  const saveProgress = async () => {
    if (!userId) return;

    setSaving(true);

    const rows = progress.map((record) => ({
      user_id: userId,
      skill_name: record.skill_name,
      level: Number(record.level),
      understands: record.understands,
      needs_help: record.needs_help,
      notes: record.notes || null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("progress")
      .upsert(rows, { onConflict: "user_id,skill_name" });

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Progress updated successfully");
    await fetchProgressData();
  };

  return (
    <ProtectedRoute allowedRoles={["learner"]}>
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />

        <main className="flex-1 p-6 md:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Progress Overview
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Track what you understand, where you need support, and how your
              reported job experience compares to your training month.
            </p>
          </div>

          <section className="mb-8 grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl bg-white p-6 shadow-md">
              <h2 className="text-sm text-gray-500">Overall Progress</h2>
              <p className="mt-2 text-4xl font-bold">{overall}%</p>
              <div className="mt-4 h-3 w-full rounded-full bg-gray-200">
                <div
                  className="h-3 rounded-full bg-red-600 transition-all"
                  style={{ width: `${overall}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-md">
              <h2 className="text-sm text-gray-500">Training Month</h2>
              <p className="mt-2 text-4xl font-bold">{contractMonth || 1}</p>
              <p className="mt-3 text-sm text-gray-500">
                Expected progress: {expectedOverall}%
              </p>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-md">
              <h2 className="text-sm text-gray-500">Feedback</h2>
              <span
                className={`mt-3 inline-block rounded-full px-4 py-2 text-sm font-bold capitalize ${getFeedbackColor(
                  feedback
                )}`}
              >
                {feedback}
              </span>
              <p className="mt-3 text-sm text-gray-500">
                Based on your self-assessment and the skills expected by this
                month of training.
              </p>
            </div>
          </section>

          <section className="mb-8 rounded-xl bg-white p-6 shadow-md">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Update My Progress</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Answer honestly so your manager can support you properly.
                </p>
              </div>

              <button
                onClick={saveProgress}
                disabled={saving}
                className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:bg-red-300"
              >
                {saving ? "Saving..." : "Save Progress"}
              </button>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              {progress.map((skill) => {
                const expected = skillPlan.find(
                  (item) => item.name === skill.skill_name
                );
                const shouldKnow = expected
                  ? contractMonth >= expected.expectedMonth
                  : false;

                return (
                  <div key={skill.skill_name} className="rounded-xl border p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-gray-900">
                          {skill.skill_name}
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Expected from month {expected?.expectedMonth}
                        </p>
                      </div>

                      {shouldKnow && (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                          Should know now
                        </span>
                      )}
                    </div>

                    <div className="mb-4">
                      <div className="mb-2 flex justify-between text-sm">
                        <span>Confidence level</span>
                        <span className="font-semibold">{skill.level}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={skill.level}
                        onChange={(e) =>
                          updateSkill(skill.skill_name, {
                            level: Number(e.target.value),
                          })
                        }
                        className="w-full accent-red-600"
                      />
                      <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                        <div
                          className={`h-2 rounded-full ${getBarColor(
                            skill.level
                          )}`}
                          style={{ width: `${skill.level}%` }}
                        />
                      </div>
                    </div>

                    <div className="mb-4 grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={skill.understands}
                          onChange={(e) =>
                            updateSkill(skill.skill_name, {
                              understands: e.target.checked,
                            })
                          }
                        />
                        I understand this
                      </label>

                      <label className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={skill.needs_help}
                          onChange={(e) =>
                            updateSkill(skill.skill_name, {
                              needs_help: e.target.checked,
                            })
                          }
                        />
                        I still need help
                      </label>
                    </div>

                    <textarea
                      placeholder="What do you understand or still not get?"
                      value={skill.notes ?? ""}
                      onChange={(e) =>
                        updateSkill(skill.skill_name, {
                          notes: e.target.value,
                        })
                      }
                      className="min-h-24 w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500"
                    />

                    <p className="mt-3 text-xs text-gray-500">
                      Reported job exposure:{" "}
                      <span className="font-semibold">
                        {attendedSkillCounts[skill.skill_name] ?? 0}
                      </span>
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow-md">
            <h2 className="mb-4 text-xl font-bold">Attendance-Based Signals</h2>

            {Object.keys(attendedSkillCounts).length === 0 ? (
              <p className="text-sm text-gray-500">
                No fitted-job checklist items found yet. These come from the
                Off Duty checklist on your dashboard.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(attendedSkillCounts).map(([skill, count]) => (
                  <div
                    key={skill}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <span className="font-medium">{skill}</span>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-700">
                      {count} reports
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}
