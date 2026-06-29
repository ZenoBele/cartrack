"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { type TouchEvent, useEffect, useState } from "react";

type UserProfile = {
  email: string | null;
  fullName: string | null;
  employeeNumber: string | null;
  phoneNumber: string | null;
  photoUrl: string | null;
};

type MessageRow = {
  sender_id: string | null;
  receiver_id: string | null;
  created_at: string | null;
};

const messagesOpenedStorageKey = (managerId: string) =>
  `manager-messages-opened-at:${managerId}`;

function getMessagesOpenedAt(managerId: string) {
  if (typeof window === "undefined") return 0;

  const storedValue = window.localStorage.getItem(
    messagesOpenedStorageKey(managerId),
  );

  return storedValue ? new Date(storedValue).getTime() : 0;
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUserId, setCurrentUserId] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [messageAttentionCount, setMessageAttentionCount] = useState(0);
  const [profile, setProfile] = useState<UserProfile>({
    email: null,
    fullName: null,
    employeeNumber: null,
    phoneNumber: null,
    photoUrl: null,
  });
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const fetchMessageAttentionCount = async (managerId: string) => {
    const { data: learnerData } = await supabase
      .from("users")
      .select("id")
      .eq("manager_id", managerId);

    const learnerIds = (learnerData ?? []).map((learner) => learner.id);

    if (learnerIds.length === 0) {
      setMessageAttentionCount(0);
      return;
    }

    const participantIds = [managerId, ...learnerIds];

    const { data: messageData } = await supabase
      .from("messages")
      .select("sender_id, receiver_id, created_at")
      .or(
        `sender_id.in.(${participantIds.join(",")}),receiver_id.in.(${participantIds.join(",")})`,
      )
      .order("created_at", { ascending: false });

    const messages = (messageData ?? []) as MessageRow[];
    const messagesOpenedAt = getMessagesOpenedAt(managerId);

    const needsAttention = learnerIds.reduce((count, learnerId) => {
      const learnerMessages = messages.filter(
        (message) =>
          message.sender_id === learnerId || message.receiver_id === learnerId,
      );
      const latestLearnerMessage = learnerMessages.find(
        (message) => message.sender_id === learnerId && message.created_at,
      );
      const latestManagerReply = learnerMessages.find(
        (message) => message.sender_id === managerId && message.created_at,
      );

      if (!latestLearnerMessage?.created_at) return count;
      if (
        messagesOpenedAt > 0 &&
        new Date(latestLearnerMessage.created_at).getTime() <= messagesOpenedAt
      ) {
        return count;
      }

      if (!latestManagerReply?.created_at) return count + 1;

      return new Date(latestLearnerMessage.created_at).getTime() >
        new Date(latestManagerReply.created_at).getTime()
        ? count + 1
        : count;
    }, 0);

    setMessageAttentionCount(needsAttention);
  };

  const fetchUserProfile = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setCurrentUserId(user.id);

    const { data, error } = await supabase
      .from("users")
      .select("role, full_name, employee_number, phone_number, photo_url")
      .eq("id", user.id)
      .single();

    if (data) {
      setRole(data.role);
      setProfile({
        email: user.email ?? null,
        fullName: data.full_name ?? null,
        employeeNumber: data.employee_number ?? null,
        phoneNumber: data.phone_number ?? null,
        photoUrl: data.photo_url ?? null,
      });

      if (data.role === "manager" || data.role === "admin") {
        await fetchMessageAttentionCount(user.id);
      }

      return;
    }

    if (error) {
      const { data: roleData } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      if (roleData) {
        setRole(roleData.role);

        if (roleData.role === "manager" || roleData.role === "admin") {
          await fetchMessageAttentionCount(user.id);
        }
      }
    }

    setProfile({
      email: user.email ?? null,
      fullName: null,
      employeeNumber: null,
      phoneNumber: null,
      photoUrl: null,
    });
  };

  useEffect(() => {
    fetchUserProfile();
  }, []);

  useEffect(() => {
    if (
      pathname !== "/manager/messages" ||
      !currentUserId ||
      (role !== "manager" && role !== "admin") ||
      typeof window === "undefined"
    ) {
      return;
    }

    window.localStorage.setItem(
      messagesOpenedStorageKey(currentUserId),
      new Date().toISOString(),
    );
    setMessageAttentionCount(0);
  }, [currentUserId, pathname, role]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const openMobileProfile = () => setMobileProfileOpen(true);
  const closeMobileProfile = () => setMobileProfileOpen(false);

  const markMessagesOpened = () => {
    if (!currentUserId || typeof window === "undefined") return;

    window.localStorage.setItem(
      messagesOpenedStorageKey(currentUserId),
      new Date().toISOString(),
    );
    setMessageAttentionCount(0);
  };

  const handleMobileTouchStart = (event: TouchEvent) => {
    setTouchStartY(event.touches[0].clientY);
  };

  const handleMobileTouchEnd = (event: TouchEvent) => {
    if (touchStartY === null) return;

    const touchEndY = event.changedTouches[0].clientY;
    const swipeDistance = touchStartY - touchEndY;

    if (swipeDistance > 40) {
      openMobileProfile();
    }

    setTouchStartY(null);
  };

  const linkClass = (path: string) =>
    `block px-4 py-2 rounded-lg text-sm font-medium transition ${
      pathname === path
        ? "bg-red-600 text-white"
        : "text-gray-700 hover:bg-gray-200"
    }`;

  const mobileLinkClass = (path: string) =>
    `flex flex-col items-center justify-center text-xs ${
      pathname === path ? "text-red-600 font-bold" : "text-gray-600"
    }`;

  const messageBadge =
    messageAttentionCount > 0 ? (
      <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white">
        {messageAttentionCount}
      </span>
    ) : null;

  const fallbackInitial =
    profile.fullName?.charAt(0).toUpperCase() ??
    profile.email?.charAt(0).toUpperCase() ??
    "U";

  return (
    <>
      <div className="hidden w-64 shrink-0 md:block" aria-hidden="true" />

      <aside className="fixed left-0 top-0 z-40 hidden h-dvh w-64 flex-col border-r bg-white p-4 shadow-sm md:flex">
        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-6 shrink-0 text-xl font-bold text-red-600">
            Cartrack LMS
          </h2>

          <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {role === "learner" && (
              <>
                <Link href="/dashboard" className={linkClass("/dashboard")}>
                  Dashboard
                </Link>
                <Link href="/progress" className={linkClass("/progress")}>
                  Progress
                </Link>
                <Link href="/requests" className={linkClass("/requests")}>
                  Requests
                </Link>
                <Link href="/timeline" className={linkClass("/timeline")}>
                  Timeline
                </Link>
                <Link href="/managers" className={linkClass("/managers")}>
                  Managers
                </Link>
              </>
            )}

            {(role === "manager" || role === "admin") && (
              <>
                <Link href="/manager" className={linkClass("/manager")}>
                  Dashboard
                </Link>
                <Link
                  href="/manager/progress"
                  className={linkClass("/manager/progress")}
                >
                  Progress Control
                </Link>
                <Link
                  href="/manager/requests"
                  className={linkClass("/manager/requests")}
                >
                  Requests
                </Link>
                <Link
                  href="/manager/timeline"
                  className={linkClass("/manager/timeline")}
                >
                  Timeline
                </Link>
                <Link
                  href="/manager/messages"
                  onClick={markMessagesOpened}
                  className={`${linkClass(
                    "/manager/messages",
                  )} flex items-center justify-between`}
                >
                  <span>Messages</span>
                  {messageBadge}
                </Link>
              </>
            )}
          </nav>
        </div>

        <div className="mt-4 shrink-0 space-y-3">
          <div className="rounded-lg border bg-gray-50 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-red-100 text-sm font-bold text-red-600">
                {profile.photoUrl ? (
                  <img
                    src={profile.photoUrl}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  fallbackInitial
                )}
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-800">
                  {profile.fullName ?? "No name"}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {profile.employeeNumber ?? "No employee number"}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {profile.email ?? "No email"}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {profile.phoneNumber ?? "No phone number"}
                </p>
              </div>
            </div>

            <Link
              href="/profile"
              className="mt-3 block rounded-lg bg-white px-3 py-2 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-200"
            >
              Edit Profile
            </Link>
          </div>

          <button
            onClick={logout}
            className="w-full rounded-lg bg-gray-100 py-2 text-sm text-gray-700 transition hover:bg-red-600 hover:text-white"
          >
            Logout
          </button>
        </div>
      </aside>

      {mobileProfileOpen && (
        <button
          type="button"
          aria-label="Close profile menu"
          onClick={closeMobileProfile}
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm md:hidden"
        />
      )}

      <section
        className={`fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t bg-white px-5 pb-6 pt-3 shadow-2xl transition-transform duration-300 md:hidden ${
          mobileProfileOpen ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ height: "50dvh" }}
        onTouchStart={handleMobileTouchStart}
        onTouchEnd={handleMobileTouchEnd}
      >
        <button
          type="button"
          aria-label="Close profile menu"
          onClick={closeMobileProfile}
          className="mx-auto mb-5 block h-1.5 w-12 rounded-full bg-gray-300"
        />

        <div className="flex h-full flex-col justify-between overflow-y-auto pb-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-red-100 text-lg font-bold text-red-600">
                {profile.photoUrl ? (
                  <img
                    src={profile.photoUrl}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  fallbackInitial
                )}
              </div>

              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-gray-900">
                  {profile.fullName ?? "No name"}
                </p>
                <p className="truncate text-sm text-gray-500">
                  {profile.employeeNumber ?? "No employee number"}
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-600">
              <p className="truncate">{profile.email ?? "No email"}</p>
              <p className="mt-1 truncate">
                {profile.phoneNumber ?? "No phone number"}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Link
              href="/profile"
              onClick={closeMobileProfile}
              className="block rounded-lg bg-gray-100 px-4 py-3 text-center text-sm font-semibold text-gray-800 transition hover:bg-gray-200"
            >
              Edit Profile
            </Link>

            <button
              onClick={logout}
              className="w-full rounded-lg bg-red-600 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </section>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex justify-around border-t bg-white py-3 shadow-lg md:hidden"
        onTouchStart={handleMobileTouchStart}
        onTouchEnd={handleMobileTouchEnd}
      >
        {role === "learner" && (
          <>
            <Link href="/dashboard" className={mobileLinkClass("/dashboard")}>
              Home
            </Link>
            <Link href="/progress" className={mobileLinkClass("/progress")}>
              Progress
            </Link>
            <Link href="/requests" className={mobileLinkClass("/requests")}>
              Requests
            </Link>
            <Link href="/timeline" className={mobileLinkClass("/timeline")}>
              Timeline
            </Link>
            <Link href="/managers" className={mobileLinkClass("/managers")}>
              Managers
            </Link>
          </>
        )}

        {(role === "manager" || role === "admin") && (
          <>
            <Link href="/manager" className={mobileLinkClass("/manager")}>
              Home
            </Link>
            <Link
              href="/manager/progress"
              className={mobileLinkClass("/manager/progress")}
            >
              Progress
            </Link>
            <Link
              href="/manager/requests"
              className={mobileLinkClass("/manager/requests")}
            >
              Requests
            </Link>
            <Link
              href="/manager/timeline"
              className={mobileLinkClass("/manager/timeline")}
            >
              Timeline
            </Link>
            <Link
              href="/manager/messages"
              onClick={markMessagesOpened}
              className={`${mobileLinkClass("/manager/messages")} relative`}
            >
              Messages
              {messageAttentionCount > 0 ? (
                <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {messageAttentionCount}
                </span>
              ) : null}
            </Link>
          </>
        )}
      </nav>
    </>
  );
}
