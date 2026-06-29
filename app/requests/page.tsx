"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";

type RequestType =
  | ""
  | "test_request"
  | "technician_change"
  | "uniform_request"
  | "resignation";

type UniformItem = {
  name: string;
  price: number;
  sizes: string[];
};

type UniformSelection = {
  size: string;
  quantity: number;
};

type RequestRecord = {
  id: string;
  type: string;
  reason: string;
  status: string;
  details: any;
  created_at: string;
};

const uniformItems: UniformItem[] = [
  { name: "Jacket", price: 650, sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"] },
  { name: "Golf Shirt", price: 280, sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"] },
  { name: "Work Pants", price: 420, sizes: ["28", "30", "32", "34", "36", "38", "40", "42", "44"] },
  { name: "Safety Boots", price: 750, sizes: ["5", "6", "7", "8", "9", "10", "11", "12"] },
  { name: "Cap", price: 120, sizes: ["One Size"] },
  { name: "Rain Suit", price: 520, sizes: ["S", "M", "L", "XL", "2XL", "3XL"] },
];

const resignationChecklist = [
  "Return all company tools and equipment",
  "Submit final attendance and outstanding reports",
  "Complete handover with current technician or manager",
  "Clear pending jobs or explain incomplete work",
  "Confirm last working day with manager",
];

const formatType = (type: string) =>
  type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function RequestsPage() {
  const [type, setType] = useState<RequestType>("");
  const [reason, setReason] = useState("");
  const [testArea, setTestArea] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [deductionMonths, setDeductionMonths] = useState("1");
  const [salaryAgreement, setSalaryAgreement] = useState(false);
  const [resignationDate, setResignationDate] = useState("");
  const [checkedResignationItems, setCheckedResignationItems] = useState<string[]>([]);
  const [uniformSelections, setUniformSelections] = useState<Record<string, UniformSelection>>({});
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchRequests = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!data) return;

    setRequests(data);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const uniformOrder = useMemo(() => {
    return uniformItems
      .map((item) => {
        const selection = uniformSelections[item.name];
        const quantity = Number(selection?.quantity ?? 0);

        return {
          name: item.name,
          size: selection?.size ?? "",
          quantity,
          price: item.price,
          total: quantity * item.price,
        };
      })
      .filter((item) => item.quantity > 0);
  }, [uniformSelections]);

  const uniformTotal = uniformOrder.reduce((sum, item) => sum + item.total, 0);
  const monthlyDeduction = uniformTotal / Number(deductionMonths || 1);

  const resetForm = () => {
    setType("");
    setReason("");
    setTestArea("");
    setPreferredDate("");
    setTechnicianName("");
    setDeductionMonths("1");
    setSalaryAgreement(false);
    setResignationDate("");
    setCheckedResignationItems([]);
    setUniformSelections({});
  };

  const validateRequest = () => {
    if (!type) return "Please select a request type.";

    if (type === "test_request" && (!preferredDate)) {
      return "Please add the preferred date.";
    }

    if (type === "technician_change" && (!technicianName || !reason)) {
      return "Please add the technician name and the reason for the change.";
    }

    if (type === "uniform_request") {
      if (uniformOrder.length === 0) {
        return "Please choose at least one uniform item.";
      }

      const missingSize = uniformOrder.some((item) => !item.size);

      if (missingSize) {
        return "Please select a size for every uniform item.";
      }

      if (!salaryAgreement) {
        return "Please agree that the uniform cost can be deducted from your salary.";
      }
    }

    if (
      type === "resignation" &&
      (!resignationDate ||
        !reason ||
        checkedResignationItems.length !== resignationChecklist.length)
    ) {
      return "Please add your last working day, reason and complete the resignation checklist.";
    }

    return "";
  };

  const buildRequestPayload = () => {
    if (type === "test_request") {
      return {
        reason,
        details: {
          test_area: testArea,
          preferred_date: preferredDate,
        },
      };
    }

    if (type === "technician_change") {
      return {
        reason,
        details: {
          technician_name: technicianName,
        },
      };
    }

    if (type === "uniform_request") {
      return {
        reason: "Uniform request",
        details: {
          items: uniformOrder,
          total_cost: uniformTotal,
          deduction_months: Number(deductionMonths),
          monthly_deduction: Number(monthlyDeduction.toFixed(2)),
          salary_deduction_agreed: salaryAgreement,
        },
      };
    }

    return {
      reason,
      details: {
        last_working_day: resignationDate,
        checklist: checkedResignationItems,
      },
    };
  };

  const submitRequest = async () => {
    const validationMessage = validateRequest();

    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const payload = buildRequestPayload();

    setSubmitting(true);

    const { error } = await supabase.from("requests").insert({
      user_id: user.id,
      type,
      reason: payload.reason,
      details: payload.details,
      status: "pending",
    });

    setSubmitting(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Request submitted");
    resetForm();
    fetchRequests();
  };

  const updateUniformSelection = (
    itemName: string,
    updates: Partial<UniformSelection>
  ) => {
    setUniformSelections((selections) => ({
      ...selections,
      [itemName]: {
        size: selections[itemName]?.size ?? "",
        quantity: selections[itemName]?.quantity ?? 0,
        ...updates,
      },
    }));
  };

  return (
    <ProtectedRoute allowedRoles={["learner"]}>
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />

        <main className="flex-1 p-6 md:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Requests</h1>
            <p className="mt-2 text-sm text-gray-500">
              Submit training, technician, uniform and resignation requests.
            </p>
          </div>

          <section className="mb-8 rounded-xl bg-white p-6 shadow-md">
            <h2 className="mb-4 text-xl font-semibold">Submit New Request</h2>

            <div className="space-y-4">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as RequestType)}
                className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Select request type</option>
                <option value="test_request">Request To Be Tested</option>
                <option value="technician_change">Change Technician</option>
                <option value="uniform_request">Uniform Request</option>
                <option value="resignation">Resignation Request</option>
              </select>

              {type === "test_request" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <input
                    type="date"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    className="rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              )}

              {type === "technician_change" && (
                <input
                  type="text"
                  placeholder="Current technician name and Code"
                  value={technicianName}
                  onChange={(e) => setTechnicianName(e.target.value)}
                  className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                />
              )}

              {(type === "test_request" ||
                type === "technician_change" ||
                type === "resignation") && (
                <textarea
                  placeholder="Enter your reason or details..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-32 w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                />
              )}

              {type === "uniform_request" && (
                <div className="space-y-4">
                  <div className="rounded-xl border">
                    <div className="grid grid-cols-12 gap-2 border-b bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <span className="col-span-5">Item</span>
                      <span className="col-span-2 text-right">Price</span>
                      <span className="col-span-3">Size</span>
                      <span className="col-span-2 text-right">Qty</span>
                    </div>

                    <div className="divide-y">
                      {uniformItems.map((item) => (
                      <div
                        key={item.name}
                        className="grid grid-cols-12 items-center gap-2 px-3 py-2"
                      >
                        <span className="col-span-5 text-sm font-medium text-gray-900">
                          {item.name}
                        </span>
                        <span className="col-span-2 text-right text-sm text-gray-600">
                          R{item.price}
                        </span>
                        <select
                          value={uniformSelections[item.name]?.size ?? ""}
                          onChange={(e) =>
                            updateUniformSelection(item.name, {
                              size: e.target.value,
                            })
                          }
                          className="col-span-3 h-9 rounded-md border px-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
                        >
                          <option value="">Size</option>
                          {item.sizes.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          value={uniformSelections[item.name]?.quantity ?? 0}
                          onChange={(e) =>
                            updateUniformSelection(item.name, {
                              quantity: Number(e.target.value),
                            })
                          }
                          className="col-span-2 h-9 rounded-md border px-2 text-right text-sm outline-none focus:ring-2 focus:ring-red-500"
                        />
                      </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-gray-50 p-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-xs font-medium text-gray-500">
                          Total Cost
                        </p>
                        <p className="text-xl font-bold text-gray-900">
                          R{uniformTotal}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-xs font-medium text-gray-500">
                          Deduct Over
                        </p>
                        <select
                          value={deductionMonths}
                          onChange={(e) => setDeductionMonths(e.target.value)}
                          className="mt-1 h-9 w-full rounded-md border px-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
                        >
                          <option value="1">1 month</option>
                          <option value="2">2 months</option>
                          <option value="3">3 months</option>
                        </select>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-xs font-medium text-gray-500">
                          Monthly Deduction
                        </p>
                        <p className="text-xl font-bold text-gray-900">
                          R{monthlyDeduction.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <label className="mt-3 flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={salaryAgreement}
                        onChange={(e) => setSalaryAgreement(e.target.checked)}
                        className="mt-1"
                      />
                      I agree that the approved uniform cost may be deducted
                      from my salary over the selected period.
                    </label>
                  </div>
                </div>
              )}

              {type === "resignation" && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <label className="block text-sm font-semibold text-red-800">
                    Last working day
                  </label>
                  <input
                    type="date"
                    value={resignationDate}
                    onChange={(e) => setResignationDate(e.target.value)}
                    className="mt-2 w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
                  />

                  <p className="mt-5 font-semibold text-red-800">
                    Required before resigning
                  </p>
                  <div className="mt-3 space-y-2">
                    {resignationChecklist.map((item) => (
                      <label
                        key={item}
                        className="flex items-start gap-3 text-sm text-red-800"
                      >
                        <input
                          type="checkbox"
                          checked={checkedResignationItems.includes(item)}
                          onChange={(e) =>
                            setCheckedResignationItems((items) =>
                              e.target.checked
                                ? [...items, item]
                                : items.filter((checkedItem) => checkedItem !== item)
                            )
                          }
                          className="mt-1"
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={submitRequest}
                disabled={submitting}
                className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700 disabled:bg-red-300"
              >
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </section>

          <section className="rounded-xl bg-white p-6 shadow-md">
            <h2 className="mb-6 text-xl font-semibold">Request History</h2>

            {requests.length === 0 ? (
              <p className="text-gray-500">No requests submitted yet.</p>
            ) : (
              <div className="space-y-4">
                {requests.map((request) => (
                  <div key={request.id} className="rounded-xl border p-4">
                    <div className="mb-2 flex justify-between gap-4">
                      <h3 className="font-semibold">{formatType(request.type)}</h3>

                      <span
                        className={`rounded-full px-3 py-1 text-sm font-medium ${
                          request.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : request.status === "rejected"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {request.status ?? "pending"}
                      </span>
                    </div>

                    <p className="mb-2 text-gray-700">{request.reason}</p>

                    {request.type === "uniform_request" &&
                      request.details?.total_cost && (
                        <p className="mb-2 text-sm text-gray-600">
                          Uniform total: R{request.details.total_cost} over{" "}
                          {request.details.deduction_months} month(s)
                        </p>
                      )}

                    <p className="text-sm text-gray-500">
                      Submitted:{" "}
                      {new Date(request.created_at).toLocaleDateString()}
                    </p>
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
