"use client";

import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  type: string;
  created_at: string;
};

type Manager = {
  id: string;
  full_name: string | null;
  branch: string | null;
  phone_number: string | null;
};

export default function ChatPage() {
  const params = useParams();
  const managerId = params.id as string;
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchChat = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const [{ data: managerData }, { data: messageData, error }] =
      await Promise.all([
        supabase
          .from("users")
          .select("id, full_name, branch, phone_number")
          .eq("id", managerId)
          .single<Manager>(),
        supabase
          .from("messages")
          .select("*")
          .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${managerId}),and(sender_id.eq.${managerId},receiver_id.eq.${user.id})`
          )
          .order("created_at", { ascending: true }),
      ]);

    setManager(managerData ?? null);
    setMessages(error ? [] : messageData ?? []);
    setLoading(false);
  };

  const sendMessage = async () => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || !userId || sending) return;

    setSending(true);

    const { error } = await supabase.from("messages").insert({
      sender_id: userId,
      receiver_id: managerId,
      message: trimmedMessage,
      type: "private",
    });

    setSending(false);

    if (error) {
      alert(error.message);
      return;
    }

    setMessage("");
    await fetchChat();
  };

  useEffect(() => {
    fetchChat();
  }, [managerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <main className="flex flex-1 flex-col p-4 md:p-6">
        <section className="mb-4 rounded-xl bg-white p-4 shadow-md">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-lg font-bold text-red-600">
                {manager?.full_name?.charAt(0).toUpperCase() ?? "M"}
              </div>

              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {manager?.full_name ?? "Manager Chat"}
                </h1>
                <p className="text-sm text-gray-500">
                  {manager?.branch ?? "Branch not assigned"}
                  {manager?.phone_number ? ` • ${manager.phone_number}` : ""}
                </p>
              </div>
            </div>

            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
              Private
            </span>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded-xl bg-white shadow-md">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
            {loading ? (
              <p className="mt-10 text-center text-gray-500">
                Loading conversation...
              </p>
            ) : messages.length === 0 ? (
              <div className="mx-auto mt-16 max-w-sm text-center">
                <h2 className="text-lg font-bold text-gray-900">
                  Start the conversation
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  Send a clear message about what you need help with, approval
                  for, or feedback on.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === userId;

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        isMine
                          ? "rounded-br-md bg-red-600 text-white"
                          : "rounded-bl-md bg-gray-100 text-gray-800"
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {msg.message}
                      </p>
                      <p
                        className={`mt-2 text-[11px] ${
                          isMine ? "text-red-100" : "text-gray-500"
                        }`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}

            <div ref={bottomRef} />
          </div>

          <div className="border-t p-3 md:p-4">
            <div className="flex gap-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type a message..."
                className="max-h-32 min-h-11 flex-1 resize-none rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-red-500"
              />

              <button
                onClick={sendMessage}
                disabled={sending || !message.trim()}
                className="self-end rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700 disabled:bg-red-300"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
