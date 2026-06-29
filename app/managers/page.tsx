"use client";

import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";

type Manager = {
  id: string;
  full_name: string | null;
  employee_number: string | null;
  phone_number: string | null;
  branch: string | null;
  role: string;
};

type LearnerProfile = {
  branch: string | null;
};

export default function ManagersPage() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [learnerBranch, setLearnerBranch] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchManagers = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const [{ data: learnerData }, { data: managerData }] = await Promise.all([
      supabase
        .from("users")
        .select("branch")
        .eq("id", user.id)
        .single<LearnerProfile>(),
      supabase
        .from("users")
        .select("id, full_name, employee_number, phone_number, branch, role")
        .eq("role", "manager")
        .order("full_name", { ascending: true }),
    ]);

    setLearnerBranch(learnerData?.branch ?? null);
    setManagers(managerData ?? []);
    setLoading(false);
  };

  const filteredManagers = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return managers;

    return managers.filter((manager) =>
      [
        manager.full_name,
        manager.employee_number,
        manager.phone_number,
        manager.branch,
      ]
        .filter(Boolean)
        .some((field) => field?.toLowerCase().includes(value))
    );
  }, [managers, search]);

  const branchManagers = filteredManagers.filter(
    (manager) => learnerBranch && manager.branch === learnerBranch
  );

  const otherManagers = filteredManagers.filter(
    (manager) => !learnerBranch || manager.branch !== learnerBranch
  );

  const managerInitial = (name: string | null) =>
    name?.charAt(0).toUpperCase() ?? "M";

  const renderManagerCard = (manager: Manager, isBranchManager = false) => {
    const phoneHref = manager.phone_number
      ? `tel:${manager.phone_number.replace(/\s/g, "")}`
      : "";

    return (
      <div key={manager.id} className="rounded-xl bg-white p-5 shadow-md">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 text-lg font-bold text-red-600">
            {managerInitial(manager.full_name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-bold text-gray-900">
                {manager.full_name ?? "Unnamed Manager"}
              </h3>

              {isBranchManager && (
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                  Your Branch
                </span>
              )}
            </div>

            <div className="mt-2 space-y-1 text-sm text-gray-600">
              <p>Branch: {manager.branch ?? "Not assigned"}</p>
              <p>Employee No: {manager.employee_number ?? "Not available"}</p>
              <p>Phone: {manager.phone_number ?? "Not available"}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/managers/${manager.id}`}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Messages
          </Link>

          {phoneHref && (
            <a
              href={phoneHref}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Call
            </a>
          )}
        </div>
      </div>
    );
  };

  useEffect(() => {
    fetchManagers();
  }, []);

  return (
    <ProtectedRoute allowedRoles={["learner"]}>
      <div className="min-h-screen flex bg-gray-100">
        <Sidebar />

        <main className="flex-1 p-6 md:p-8">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Managers
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                Find the right manager for guidance, approvals and support.
              </p>
              {learnerBranch && (
                <p className="mt-2 text-sm font-medium text-gray-700">
                  Your branch: {learnerBranch}
                </p>
              )}
            </div>

            <input
              type="search"
              placeholder="Search manager, branch, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-red-500 lg:max-w-sm"
            />
          </div>

          {loading ? (
            <section className="rounded-xl bg-white p-6 shadow-md">
              <p className="text-gray-500">Loading managers...</p>
            </section>
          ) : filteredManagers.length === 0 ? (
            <section className="rounded-xl bg-white p-6 shadow-md">
              <p className="text-gray-500">No managers found.</p>
            </section>
          ) : (
            <div className="space-y-8">
              {branchManagers.length > 0 && (
                <section>
                  <h2 className="mb-4 text-xl font-bold text-gray-900">
                    Managers In Your Branch
                  </h2>
                  <div className="grid gap-5 xl:grid-cols-2">
                    {branchManagers.map((manager) =>
                      renderManagerCard(manager, true)
                    )}
                  </div>
                </section>
              )}

              {otherManagers.length > 0 && (
                <section>
                  <h2 className="mb-4 text-xl font-bold text-gray-900">
                    Other Managers
                  </h2>
                  <div className="grid gap-5 xl:grid-cols-2">
                    {otherManagers.map((manager) => renderManagerCard(manager))}
                  </div>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
