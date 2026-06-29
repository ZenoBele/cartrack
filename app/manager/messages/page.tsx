"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useMemo, useState } from "react";

type Learner = {
  id: string;
  full_name: string | null;
  employee_number?: string | null;
  department?: string | null;
  branch?: string | null;
  phone_number?: string | null;
};

type MessageRow = {
  id: string;
  sender_id: string | null;
  receiver_id: string | null;
  message: string | null;
  type: string | null;
  created_at: string | null;
};

type LearnerConversation = Learner & {
  messages: MessageRow[];
  latestMessage: MessageRow | null;
  learnerMessageCount: number;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function formatLabel(value?: string | null) {
  if (!value) return "Message";
  return value.replace(/_/g, " ");
}

function getMessageTime(message: MessageRow) {
  return message.created_at;
}

function getMessagePreview(message: MessageRow | null) {
  if (!message) return "No messages yet";
  if (message.message) return message.message;
  return "Message has no text";
}

const messageColumns = "id, sender_id, receiver_id, message, type, created_at";

export default function ManagerMessagesPage() {
  const [managerId, setManagerId] = useState("");
  const [conversations, setConversations] = useState<LearnerConversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<LearnerConversation | null>(null);
  const [openedLearnerMessageIds, setOpenedLearnerMessageIds] = useState<
    Set<string>
  >(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const getNewLearnerMessageCount = (conversation: LearnerConversation) =>
    conversation.messages.filter(
      (message) =>
        message.sender_id === conversation.id &&
        !openedLearnerMessageIds.has(message.id),
    ).length;

  const stats = useMemo(() => {
    const conversationsWithNewMessages = conversations.filter(
      (conversation) => getNewLearnerMessageCount(conversation) > 0,
    );

    return {
      learners: conversations.length,
      learnersMessaged: conversationsWithNewMessages.length,
    };
  }, [conversations, openedLearnerMessageIds]);

  const fetchMessages = async () => {
    setLoading(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setManagerId(user.id);

    const { data: learnerData, error: learnerError } = await supabase
      .from("users")
      .select(
        "id, full_name, employee_number, department, branch, phone_number",
      )
      .eq("manager_id", user.id)
      .order("full_name", { ascending: true });

    if (learnerError) {
      setError(learnerError.message);
      setLoading(false);
      return;
    }

    const learners = (learnerData ?? []) as Learner[];
    const learnerIds = learners.map((learner) => learner.id);

    if (learnerIds.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const participantIds = [user.id, ...learnerIds];

    const { data: messageData, error: messageError } = await supabase
      .from("messages")
      .select(messageColumns)
      .or(
        `sender_id.in.(${participantIds.join(",")}),receiver_id.in.(${participantIds.join(",")})`,
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (messageError) {
      setError(messageError.message);
      setLoading(false);
      return;
    }

    const messages = (messageData ?? []) as MessageRow[];

    const nextConversations = learners.map((learner) => {
      const learnerMessages = messages
        .filter(
          (message) =>
            message.sender_id === learner.id ||
            message.receiver_id === learner.id,
        )
        .sort(
          (first, second) =>
            new Date(getMessageTime(second)).getTime() -
            new Date(getMessageTime(first)).getTime(),
        );

      return {
        ...learner,
        messages: learnerMessages,
        latestMessage: learnerMessages[0] ?? null,
        learnerMessageCount: learnerMessages.filter(
          (message) => message.sender_id === learner.id,
        ).length,
      };
    });

    setConversations(nextConversations);
    setLoading(false);
  };

  const sendMessage = async (
    conversation: LearnerConversation,
    messageText: string,
  ) => {
    const trimmedMessage = messageText.trim();

    if (!trimmedMessage) return;

    setSending(true);
    setError("");

    const { data, error: sendError } = await supabase
      .from("messages")
      .insert({
        sender_id: managerId,
        receiver_id: conversation.id,
        message: trimmedMessage,
        type: "private_message",
        created_at: new Date().toISOString(),
      })
      .select(messageColumns)
      .single();

    if (sendError) {
      setError(sendError.message);
      setSending(false);
      return;
    }

    const newMessage = data as MessageRow;

    setConversations((current) =>
      current.map((item) => {
        if (item.id !== conversation.id) return item;

        return {
          ...item,
          messages: [newMessage, ...item.messages],
          latestMessage: newMessage,
        };
      }),
    );

    setSelectedConversation((current) => {
      if (!current || current.id !== conversation.id) return current;

      return {
        ...current,
        messages: [newMessage, ...current.messages],
        latestMessage: newMessage,
      };
    });

    setSending(false);
  };

  const openConversation = (conversation: LearnerConversation) => {
    setSelectedConversation(conversation);
    setOpenedLearnerMessageIds((current) => {
      const next = new Set(current);

      conversation.messages.forEach((message) => {
        if (message.sender_id === conversation.id) {
          next.add(message.id);
        }
      });

      return next;
    });
  };

  useEffect(() => {
    void fetchMessages();
  }, []);

  return (
    <ProtectedRoute allowedRoles={["manager", "admin"]}>
      <div className="flex min-h-screen bg-slate-100">
        <Sidebar />

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-950">Messages</h1>
              <p className="mt-1 text-sm text-slate-600">
                Review private learner conversations and send direct replies.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchMessages}
              className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 sm:w-auto"
            >
              Refresh
            </button>
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <Stat label="Learners" value={stats.learners} tone="info" />
            <Stat
              label="Learners messaged"
              value={stats.learnersMessaged}
              tone="success"
            />
          </div>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-950">
                Private Inbox
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Select a learner to view the full private thread.
              </p>
            </div>

            {loading ? (
              <p className="px-4 py-6 text-sm text-slate-600">
                Loading messages...
              </p>
            ) : conversations.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-600">
                No learners assigned.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => openConversation(conversation)}
                    className="grid w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.7fr)_minmax(0,0.8fr)_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">
                        {conversation.full_name ?? "Unnamed learner"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {[conversation.employee_number, conversation.department]
                          .filter(Boolean)
                          .join(" - ") || "No staff details"}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-800">
                        {getMessagePreview(conversation.latestMessage)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {conversation.latestMessage
                          ? formatDateTime(
                              getMessageTime(conversation.latestMessage),
                            )
                          : "No activity"}
                      </p>
                    </div>

                    <div>
                      {getNewLearnerMessageCount(conversation) > 0 ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                          {getNewLearnerMessageCount(conversation)} new message
                          {getNewLearnerMessageCount(conversation) === 1
                            ? ""
                            : "s"}
                        </span>
                      ) : null}
                    </div>

                    <span className="self-center rounded-md border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700">
                      View
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>

        {selectedConversation ? (
          <MessageThreadModal
            managerId={managerId}
            conversation={selectedConversation}
            sending={sending}
            onClose={() => setSelectedConversation(null)}
            onSend={sendMessage}
          />
        ) : null}
      </div>
    </ProtectedRoute>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "info" | "success" | "danger";
}) {
  const toneClasses = {
    default: {
      card: "border-slate-200 bg-white",
      label: "text-slate-500",
      value: "text-slate-950",
    },
    info: {
      card: "border-blue-200 bg-blue-50",
      label: "text-blue-700",
      value: "text-blue-950",
    },
    success: {
      card: "border-emerald-200 bg-emerald-50",
      label: "text-emerald-700",
      value: "text-emerald-950",
    },
    danger: {
      card: "border-red-200 bg-red-50",
      label: "text-red-700",
      value: "text-red-700",
    },
  }[tone];

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClasses.card}`}>
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${toneClasses.label}`}
      >
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${toneClasses.value}`}>{value}</p>
    </div>
  );
}

function MessageThreadModal({
  managerId,
  conversation,
  sending,
  onClose,
  onSend,
}: {
  managerId: string;
  conversation: LearnerConversation;
  sending: boolean;
  onClose: () => void;
  onSend: (
    conversation: LearnerConversation,
    messageText: string,
  ) => Promise<void>;
}) {
  const [messageText, setMessageText] = useState("");

  const sortedMessages = [...conversation.messages].sort(
    (first, second) =>
      new Date(getMessageTime(first)).getTime() -
      new Date(getMessageTime(second)).getTime(),
  );

  const handleSend = async () => {
    await onSend(conversation, messageText);
    setMessageText("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-950">
              {conversation.full_name ?? "Unnamed learner"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {[conversation.employee_number, conversation.branch, conversation.phone_number]
                .filter(Boolean)
                .join(" - ") || "Learner details unavailable"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="max-h-[54vh] overflow-y-auto bg-slate-50 px-5 py-4">
          {sortedMessages.length === 0 ? (
            <p className="text-sm text-slate-600">
              No messages with this learner yet.
            </p>
          ) : (
            <div className="space-y-3">
              {sortedMessages.map((message) => {
                const isManager = message.sender_id === managerId;

                return (
                  <div
                    key={message.id}
                    className={`flex ${isManager ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-lg border px-4 py-3 ${
                        isManager
                          ? "border-red-200 bg-red-600 text-white"
                          : "border-slate-200 bg-white text-slate-900"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            isManager
                              ? "bg-white/20 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {isManager ? "Manager" : "Learner"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            isManager
                              ? "bg-white/20 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {formatLabel(message.type)}
                        </span>
                      </div>

                      <p className="whitespace-pre-wrap text-sm">
                        {message.message ?? "No message text"}
                      </p>

                      <p
                        className={`mt-2 text-xs ${
                          isManager ? "text-white/75" : "text-slate-500"
                        }`}
                      >
                        {formatDateTime(getMessageTime(message))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          <label className="block text-sm font-semibold text-slate-950">
            Reply
            <textarea
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="Type a message to the learner..."
            />
          </label>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !messageText.trim()}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send message"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
