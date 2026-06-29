"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const branches = [
  "Rosebank 222",
  "Pretoria",
  "East Rand",
  "Vanderbijlpark",
];

export default function ProfilePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const fallbackInitial = fullName.charAt(0).toUpperCase() || "U";

  useEffect(() => {
    const fetchProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from("users")
        .select("full_name, employee_number, phone_number, photo_url, branch")
        .eq("id", user.id)
        .single();

      setLoading(false);

      if (error) {
        alert(error.message);
        return;
      }

      setFullName(data.full_name ?? "");
      setEmployeeNumber(data.employee_number ?? "");
      setPhoneNumber(data.phone_number ?? "");
      setPhotoUrl(data.photo_url ?? "");
      setBranch(data.branch ?? "");
    };

    fetchProfile();
  }, [router]);

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!userId) return;

    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Profile photo must be smaller than 5MB.");
      return;
    }

    setUploadingPhoto(true);

    const fileExtension = file.name.split(".").pop() || "jpg";
    const filePath = `${userId}/profile.${fileExtension}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-pictures")
      .upload(filePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      setUploadingPhoto(false);
      alert(uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("profile-pictures").getPublicUrl(filePath);

    const freshPhotoUrl = `${publicUrl}?v=${Date.now()}`;
    setPhotoUrl(freshPhotoUrl);

    const { error: updateError } = await supabase
      .from("users")
      .update({ photo_url: freshPhotoUrl })
      .eq("id", userId);

    setUploadingPhoto(false);

    if (updateError) {
      alert(updateError.message);
      return;
    }

    alert("Profile photo updated successfully");
  };

  const handleUpdate = async () => {
    if (!userId) return;

    if (!fullName || !employeeNumber || !phoneNumber) {
      alert("Please fill in full name, employee number and phone number.");
      return;
    }

    setSaving(true);

    const { data: existingUser, error: existingUserError } = await supabase
      .from("users")
      .select("id")
      .eq("employee_number", employeeNumber)
      .neq("id", userId)
      .maybeSingle();

    if (existingUserError) {
      setSaving(false);
      alert(existingUserError.message);
      return;
    }

    if (existingUser) {
      setSaving(false);
      alert("This employee number is already used by another user.");
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({
        full_name: fullName,
        employee_number: employeeNumber,
        phone_number: phoneNumber,
        photo_url: photoUrl || null,
        branch: branch || null,
      })
      .eq("id", userId);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Profile updated successfully");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-4 md:p-8">
        <div className="mx-auto max-w-5xl rounded-lg border bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Loading profile...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 border-l-4 border-red-600 pl-4">
          <p className="text-xs font-bold uppercase tracking-wide text-red-600">
            Cartrack LMS
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 md:text-3xl">
            Profile Settings
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Keep your employee details accurate for learner records, manager
            communication, and account access.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <section className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-red-100 text-4xl font-bold text-red-600 shadow">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt="Profile"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  fallbackInitial
                )}
              </div>

              <h2 className="mt-4 max-w-full truncate text-lg font-bold text-slate-950">
                {fullName || "No name"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {employeeNumber || "No employee number"}
              </p>

              <label className="mt-5 w-full cursor-pointer rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700">
                {uploadingPhoto ? "Uploading..." : "Upload Photo"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                  className="sr-only"
                />
              </label>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                JPG, PNG, or WebP. Maximum size 5MB.
              </p>
            </div>
          </section>

          <section className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Full Name
                </span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Employee Number
                </span>
                <input
                  type="text"
                  value={employeeNumber}
                  onChange={(e) => setEmployeeNumber(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Phone Number
                </span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Branch
                </span>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                >
                  <option value="">Select Branch</option>
                  {branches.map((branchName) => (
                    <option key={branchName} value={branchName}>
                      {branchName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleUpdate}
                disabled={saving}
                className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:bg-red-300"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
