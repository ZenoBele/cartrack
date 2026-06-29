"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createOnlineSyncListener,
  getCheckinDate,
  isUniqueCheckinConflict,
  queuePendingCheckin,
  readPendingCheckins,
  removePendingCheckin,
  sendCheckinToSupabase,
  syncPendingCheckins,
} from "../utils/offlineSync";
import type {
  DutyCheckinRow,
  DutyStage,
  PendingCheckin,
} from "../utils/offlineSync";

type StageConfig = {
  stage: DutyStage;
  label: string;
  currentStage: string;
  startHour: number;
  endHour: number;
};

type DutyStatus =
  | "loading"
  | "ready"
  | "locked"
  | "completed"
  | "waiting"
  | "submitting"
  | "error";

type UseDutyCheckinOptions = {
  supabase: SupabaseClient;
  userId: string | null;
  now?: Date;
};

const stages: StageConfig[] = [
  {
    stage: "departure",
    label: "Start Departure",
    currentStage: "Departure",
    startHour: 0,
    endHour: 8,
  },
  {
    stage: "site_1",
    label: "Check In Site 1",
    currentStage: "Site 1",
    startHour: 8,
    endHour: 10,
  },
  {
    stage: "site_2",
    label: "Check In Site 2",
    currentStage: "Site 2",
    startHour: 10,
    endHour: 13,
  },
  {
    stage: "site_3",
    label: "Check In Site 3",
    currentStage: "Site 3",
    startHour: 13,
    endHour: 17,
  },
];

function getMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function getWindowStage(now: Date) {
  const minutes = getMinutes(now);

  return stages.find(
    (stage) => minutes >= stage.startHour * 60 && minutes < stage.endHour * 60,
  );
}

function getNextIncompleteStage(completed: Set<DutyStage>, now: Date) {
  const windowStage = getWindowStage(now);

  if (!windowStage) {
    return stages.find((stage) => !completed.has(stage.stage)) ?? null;
  }

  const windowIndex = stages.findIndex(
    (stage) => stage.stage === windowStage.stage,
  );

  return (
    stages
      .slice(windowIndex)
      .find((stage) => !completed.has(stage.stage)) ?? null
  );
}

function getGeolocation() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
    });
  });
}

export function useDutyCheckin({
  supabase,
  userId,
  now: suppliedNow,
}: UseDutyCheckinOptions) {
  const [now, setNow] = useState(() => suppliedNow ?? new Date());
  const [checkins, setCheckins] = useState<DutyCheckinRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<DutyStatus>("loading");
  const [message, setMessage] = useState("");
  const [isOnline, setIsOnline] = useState(true);

  const refreshCheckins = useCallback(async () => {
    if (!userId) {
      setCheckins([]);
      setStatus("locked");
      return;
    }

    const { data, error } = await supabase
      .from("duty_checkins")
      .select("*")
      .eq("user_id", userId)
      .eq("checkin_date", getCheckinDate(now))
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(error.message);
      setStatus("error");
      return;
    }

    setCheckins((data ?? []) as DutyCheckinRow[]);
    setPendingCount(readPendingCheckins().length);
  }, [now, supabase, userId]);

  useEffect(() => {
    setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    void refreshCheckins();
  }, [refreshCheckins]);

  useEffect(() => {
    if (suppliedNow) {
      setNow(suppliedNow);
      return;
    }

    const interval = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(interval);
  }, [suppliedNow]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);

    window.addEventListener("online", online);
    window.addEventListener("offline", offline);

    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    return createOnlineSyncListener(supabase, ({ synced }) => {
      setPendingCount(readPendingCheckins().length);

      if (synced.length > 0) {
        void refreshCheckins();
      }
    });
  }, [refreshCheckins, supabase]);

  useEffect(() => {
    if (!navigator.onLine) {
      return;
    }

    void syncPendingCheckins(supabase).then(({ synced }) => {
      setPendingCount(readPendingCheckins().length);

      if (synced.length > 0) {
        void refreshCheckins();
      }
    });
  }, [refreshCheckins, supabase]);

  const derived = useMemo(() => {
    const completed = new Set(checkins.map((checkin) => checkin.stage));
    const pending = readPendingCheckins().filter(
      (checkin) => checkin.user_id === userId,
    );

    pending.forEach((checkin) => completed.add(checkin.stage));

    const hasDeparture = completed.has("departure");
    const minutes = getMinutes(now);

    if (!hasDeparture && minutes >= 8 * 60) {
      return {
        activeStage: null,
        buttonLabel: "Start Departure",
        currentStage: "Locked",
        disabled: true,
        status: "locked" as DutyStatus,
        message: "You missed your departure check-in. Contact manager.",
      };
    }

    const nextStage = getNextIncompleteStage(completed, now);

    if (!nextStage) {
      return {
        activeStage: null,
        buttonLabel: "All Check-Ins Complete",
        currentStage: "Complete",
        disabled: true,
        status: "completed" as DutyStatus,
        message: "All duty check-ins are complete for today.",
      };
    }

    const minutesUntilStart = nextStage.startHour * 60 - minutes;
    const isBeforeWindow = minutesUntilStart > 0;
    const isAfterWindow = minutes >= nextStage.endHour * 60;

    return {
      activeStage: nextStage,
      buttonLabel: nextStage.label,
      currentStage: nextStage.currentStage,
      disabled: isBeforeWindow || isAfterWindow,
      status: isBeforeWindow || isAfterWindow ? "waiting" : "ready",
      message: isBeforeWindow
        ? `${nextStage.currentStage} opens at ${String(nextStage.startHour).padStart(2, "0")}:00.`
        : isAfterWindow
          ? `${nextStage.currentStage} check-in window has closed.`
          : "",
    };
  }, [checkins, now, pendingCount, userId]);

  useEffect(() => {
    setStatus((current) =>
  current === "submitting" ? current : (derived.status as DutyStatus),
);
    setMessage(derived.message);
  }, [derived.message, derived.status]);

  const submitCheckin = useCallback(async () => {
    if (!userId || !derived.activeStage || derived.disabled) {
      return;
    }

    setStatus("submitting");
    setMessage("Getting GPS location...");

    try {
      const position = await getGeolocation();
      const timestamp = new Date().toISOString();
      const checkin: PendingCheckin = {
        user_id: userId,
        stage: derived.activeStage.stage,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp,
        synced: false,
      };

      queuePendingCheckin(checkin);
      setPendingCount(readPendingCheckins().length);

      if (navigator.onLine) {
        const { error } = await sendCheckinToSupabase(supabase, checkin);

        if (!error || isUniqueCheckinConflict(error)) {
          removePendingCheckin(checkin);
          setPendingCount(readPendingCheckins().length);
          await refreshCheckins();
          setMessage(
            error ? "This stage was already saved." : "Check-in saved.",
          );
          setStatus("ready");
          return;
        }
      }

      setMessage("Saved offline. It will sync when your connection returns.");
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(
        typeof GeolocationPositionError !== "undefined" &&
          error instanceof GeolocationPositionError
          ? error.message
          : "Could not complete check-in.",
      );
    }
  }, [derived.activeStage, derived.disabled, refreshCheckins, supabase, userId]);

  const lastCheckin = checkins.at(-1) ?? null;

  return {
    buttonLabel: derived.buttonLabel,
    currentStage: derived.currentStage,
    disabled: derived.disabled || status === "submitting",
    isOnline,
    lastCheckin,
    message,
    pendingCount,
    status,
    submitCheckin,
    syncStatus:
      pendingCount > 0
        ? `Pending Sync (${pendingCount})`
        : isOnline
          ? "Online"
          : "Pending Sync",
  };
}
