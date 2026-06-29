"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type UserRole = "learner" | "manager";

const branches = ["Rosebank 222", "Pretoria", "East Rand", "Vanderbijlpark"];

const addTwelveMonths = (date: string) => {
  if (!date) return "";

  const endDate = new Date(`${date}T00:00:00`);
  endDate.setMonth(endDate.getMonth() + 12);

  return endDate.toISOString().split("T")[0];
};

export default function SignupPage() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>("learner");
  const [fullName, setFullName] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [branch, setBranch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const endDate = useMemo(() => addTwelveMonths(startDate), [startDate]);
  const isLearner = role === "learner";

  const handleSignup = async () => {
    if (!fullName || !email || !password || !employeeNumber || !phoneNumber) {
      alert(
        "Please fill in full name, email, employee number, phone number and password.",
      );
      return;
    }

    if (isLearner && (!branch || !startDate)) {
      alert("Please complete all learner details.");
      return;
    }

    setLoading(true);

    const { data: existingUser, error: existingUserError } = await supabase
      .from("users")
      .select("id")
      .eq("employee_number", employeeNumber)
      .maybeSingle();

    if (existingUserError) {
      setLoading(false);
      alert(existingUserError.message);
      return;
    }

    if (existingUser) {
      setLoading(false);
      alert("User already exists. This employee number is already registered.");
      return;
    }

    const authProfileData = {
      role,
      full_name: fullName,
      employee_number: employeeNumber,
      email,
      phone_number: phoneNumber,
      branch: isLearner ? branch : null,
      contract_start: isLearner ? startDate : null,
      contract_end: isLearner ? endDate : null,
    };

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: authProfileData,
      },
    });

    if (signupError) {
      setLoading(false);
      alert(
        signupError.message.toLowerCase().includes("already")
          ? "User already exists. This email is already registered."
          : signupError.message,
      );
      return;
    }

    if (!signupData.user) {
      setLoading(false);
      alert("Account was created, but the user profile could not be saved.");
      return;
    }

    if (signupData.user.identities?.length === 0) {
      setLoading(false);
      alert("User already exists. This email is already registered.");
      return;
    }

    const { error: profileError } = await supabase.from("users").upsert(
      {
        id: signupData.user.id,
        role,
        full_name: fullName,
        employee_number: employeeNumber,
        phone_number: phoneNumber,
        branch: isLearner ? branch : null,
        contract_start: isLearner ? startDate : null,
        contract_end: isLearner ? endDate : null,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      setLoading(false);
      alert(profileError.message);
      return;
    }

    if (isLearner) {
      const { error: timelineError } = await supabase.from("timeline").upsert(
        {
          user_id: signupData.user.id,
          contract_start: startDate,
          contract_end: endDate,
          test_date: null,
          saturdays_required: 2,
          saturdays_completed: 0,
          training_status: "not_started",
        },
        { onConflict: "user_id" },
      );

      if (timelineError) {
        setLoading(false);
        alert(timelineError.message);
        return;
      }
    }

    setLoading(false);
    alert("Account created successfully");
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 items-center justify-center bg-[#0B1220] p-10 text-white md:flex">
        <div>
          <h1 className="text-5xl font-bold tracking-wide">Cartrack Academy</h1>

          <p className="mt-4 text-lg text-gray-300">
            Learner Technician Management System
          </p>

          <div className="mt-10 space-y-3 text-sm text-gray-400">
            <p>Attendance Tracking</p>
            <p>Progress Monitoring</p>
            <p>Manager Communication</p>
            <p>Training Timeline</p>
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-gray-100 p-6 md:w-1/2">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
          <h2 className="text-3xl font-bold text-gray-900">Create Account</h2>

          <p className="mb-8 mt-2 text-gray-500">
            Register as a {isLearner ? "learner" : "manager"}
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setRole("learner")}
                className={`rounded-md py-2 text-sm font-semibold transition ${
                  isLearner
                    ? "bg-red-600 text-white"
                    : "text-gray-600 hover:bg-white"
                }`}
              >
                Learner
              </button>

              <button
                type="button"
                onClick={() => setRole("manager")}
                className={`rounded-md py-2 text-sm font-semibold transition ${
                  !isLearner
                    ? "bg-red-600 text-white"
                    : "text-gray-600 hover:bg-white"
                }`}
              >
                Manager
              </button>
            </div>

            <input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
            />

            <input
              type="text"
              placeholder="Employee Number"
              value={employeeNumber}
              onChange={(event) => setEmployeeNumber(event.target.value)}
              className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
            />

            <input
              type="email"
              placeholder="Work or Personal Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
            />

            {isLearner ? (
              <>
                <select
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="">Select Branch</option>
                  {branches.map((branchName) => (
                    <option key={branchName} value={branchName}>
                      {branchName}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                />

                <input
                  type="date"
                  value={endDate}
                  readOnly
                  className="w-full rounded-lg border bg-gray-100 px-4 py-3 text-gray-600 outline-none"
                />
              </>
            ) : null}

            <input
              type="tel"
              placeholder="Phone Number"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
            />

            <button
              type="button"
              onClick={handleSignup}
              disabled={loading}
              className="w-full rounded-lg bg-red-600 py-3 font-semibold text-white transition hover:bg-red-700 disabled:bg-red-300"
            >
              {loading ? "Creating..." : "Create Account"}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <span
              onClick={() => router.push("/login")}
              className="cursor-pointer font-semibold text-red-600"
            >
              Login
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
