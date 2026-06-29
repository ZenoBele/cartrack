"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) {
  const router = useRouter();
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const hasVerifiedAccess = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error || !profile || !allowedRoles.includes(profile.role)) {
        router.replace("/login");
        return;
      }

      hasVerifiedAccess.current = true;

      if (isMounted) {
        setInitialCheckDone(true);
      }
    };

    checkUser();

    return () => {
      isMounted = false;
    };
  }, [router, allowedRoles]);

  if (!initialCheckDone && !hasVerifiedAccess.current) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-3 text-gray-600 text-sm">
            Verifying access...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}