"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { DutyButton } from "@/components/DutyButton";

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const supabase = useMemo<SupabaseClient | null>(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setError(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      setLoading(false);
      return;
    }

    const loadUser = async () => {
      const { data, error: userError } = await supabase.auth.getUser();

      if (userError) {
        setError(userError.message);
      }

      setUser(data.user);
      setLoading(false);
    };

    void loadUser();
  }, [supabase]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
        <div className="mx-auto max-w-md rounded-lg bg-white p-4 shadow-sm">
          Loading duty check-in...
        </div>
      </main>
    );
  }

  if (error || !supabase) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
        <div className="mx-auto max-w-md rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
          {error}
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
        <div className="mx-auto max-w-md rounded-lg bg-white p-4 shadow-sm">
          Sign in first, then reload this page to test duty check-in.
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-5">
      <DutyButton supabase={supabase} userId={user.id} />
    </main>
  );
}
