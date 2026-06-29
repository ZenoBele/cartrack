"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      alert(error.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: profile } = await supabase
      .from("users")
      .select("*")
      .eq("id", user?.id)
      .single();

    setLoading(false);

    if (!profile) {
      alert("Profile not found.");
      return;
    }

    if (profile.role === "learner") {
      router.push("/dashboard");
    } else if (profile.role === "manager") {
      router.push("/manager");
    } else {
      router.push("/admin");
    }
  };

  return (
    <div className="min-h-screen flex">
      
      {/* Left Branding Side */}
      <div className="hidden md:flex w-1/2 bg-[#0B1220] text-white items-center justify-center p-10">
        <div>
          <h1 className="text-5xl font-bold tracking-wide">
            Cartrack Academy
          </h1>

          <p className="mt-4 text-gray-300 text-lg">
            Technician Learner Portal
          </p>

          <div className="mt-10 space-y-3 text-sm text-gray-400">
            <p>✔ Live Attendance</p>
            <p>✔ Progress Tracking</p>
            <p>✔ Direct Manager Support</p>
            <p>✔ Training Timeline</p>
          </div>
        </div>
      </div>

      {/* Right Form Side */}
      <div className="w-full md:w-1/2 flex items-center justify-center bg-gray-100 p-6">
        <div className="bg-white shadow-xl rounded-2xl w-full max-w-md p-8">

          <h2 className="text-3xl font-bold text-gray-900">
            Welcome Back
          </h2>

          <p className="text-gray-500 mt-2 mb-8">
            Login to continue
          </p>

          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
            />

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition"
            >
              {loading ? "Signing in..." : "Login"}
            </button>
          </div>

          <p className="text-sm text-gray-500 mt-6 text-center">
            Don’t have an account?{" "}
            <span
              onClick={() => router.push("/signup")}
              className="text-red-600 cursor-pointer font-semibold"
            >
              Create Account
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}