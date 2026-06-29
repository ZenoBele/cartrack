import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineDistanceKm } from "../lib/haversine";

export const PENDING_CHECKINS_KEY = "pending_checkins";

export type DutyStage = "departure" | "site_1" | "site_2" | "site_3";

export type PendingCheckin = {
  user_id: string;
  stage: DutyStage;
  latitude: number;
  longitude: number;
  timestamp: string;
  synced: false;
};

export type DutyCheckinRow = {
  id: string;
  user_id: string;
  checkin_date: string;
  stage: DutyStage;
  latitude: number;
  longitude: number;
  created_at: string;
  distance_from_previous: number | null;
  warning: string | null;
  is_synced: boolean;
};

const stageOrder: DutyStage[] = ["departure", "site_1", "site_2", "site_3"];

export function getCheckinDate(timestamp = new Date()) {
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function readPendingCheckins() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(PENDING_CHECKINS_KEY);
    return value ? (JSON.parse(value) as PendingCheckin[]) : [];
  } catch {
    return [];
  }
}

export function writePendingCheckins(checkins: PendingCheckin[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PENDING_CHECKINS_KEY, JSON.stringify(checkins));
}

export function queuePendingCheckin(checkin: PendingCheckin) {
  writePendingCheckins([...readPendingCheckins(), checkin]);
}

export function removePendingCheckin(checkin: PendingCheckin) {
  writePendingCheckins(
    readPendingCheckins().filter(
      (pending) =>
        !(
          pending.user_id === checkin.user_id &&
          pending.stage === checkin.stage &&
          pending.timestamp === checkin.timestamp
        ),
    ),
  );
}

function getPreviousStage(stage: DutyStage) {
  const currentIndex = stageOrder.indexOf(stage);
  return currentIndex > 0 ? stageOrder[currentIndex - 1] : null;
}

export async function buildCheckinPayload(
  supabase: SupabaseClient,
  checkin: PendingCheckin,
) {
  const checkinDate = getCheckinDate(new Date(checkin.timestamp));
  const previousStage = getPreviousStage(checkin.stage);
  let distance_from_previous: number | null = null;
  let warning: string | null = null;

  if (previousStage) {
    const { data: previous } = await supabase
      .from("duty_checkins")
      .select("latitude, longitude")
      .eq("user_id", checkin.user_id)
      .eq("checkin_date", checkinDate)
      .eq("stage", previousStage)
      .maybeSingle();

    if (previous) {
      distance_from_previous = haversineDistanceKm(
        {
          latitude: previous.latitude,
          longitude: previous.longitude,
        },
        {
          latitude: checkin.latitude,
          longitude: checkin.longitude,
        },
      );

      if (checkin.stage === "site_1" && distance_from_previous < 3) {
        warning = "Suspicious: Site 1 too close to departure";
      }

      if (
        (checkin.stage === "site_2" || checkin.stage === "site_3") &&
        distance_from_previous < 0.5
      ) {
        warning = "Minimal movement detected";
      }
    }
  }

  return {
    user_id: checkin.user_id,
    stage: checkin.stage,
    latitude: checkin.latitude,
    longitude: checkin.longitude,
    created_at: checkin.timestamp,
    checkin_date: checkinDate,
    distance_from_previous,
    warning,
    is_synced: true,
  };
}

export async function sendCheckinToSupabase(
  supabase: SupabaseClient,
  checkin: PendingCheckin,
) {
  const payload = await buildCheckinPayload(supabase, checkin);

  return supabase.from("duty_checkins").insert(payload).select().single();
}

export function isUniqueCheckinConflict(error: { code?: string } | null) {
  return error?.code === "23505";
}

export async function syncPendingCheckins(supabase: SupabaseClient) {
  const pending = readPendingCheckins();
  const failed: PendingCheckin[] = [];
  const synced: DutyCheckinRow[] = [];
  let skippedDuplicates = 0;

  for (const checkin of pending) {
    const { data, error } = await sendCheckinToSupabase(supabase, checkin);

    if (error) {
      if (isUniqueCheckinConflict(error)) {
        skippedDuplicates += 1;
      } else {
        failed.push(checkin);
      }
    } else if (data) {
      synced.push(data as DutyCheckinRow);
    }
  }

  writePendingCheckins(failed);

  return {
    synced,
    failed,
    skippedDuplicates,
  };
}

export function createOnlineSyncListener(
  supabase: SupabaseClient,
  onSynced?: (result: Awaited<ReturnType<typeof syncPendingCheckins>>) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const listener = async () => {
    const result = await syncPendingCheckins(supabase);
    onSynced?.(result);
  };

  window.addEventListener("online", listener);

  return () => window.removeEventListener("online", listener);
}
