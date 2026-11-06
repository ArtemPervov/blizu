import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Flag, Send } from "lucide-react";
import { REPORT_CATEGORIES, type ReportCategory } from "../../shared/operator";
import { api, json, useAuth, useToast } from "../lib";
import { Field, FormError, Modal } from "./ui";

export type ReportTarget = {
  targetType: "listing" | "user";
  targetId: string;
  targetLabel: string;
  ownerId: string;
};

export function ReportButton({
  targetType,
  targetId,
  targetLabel,
  ownerId,
  onReport,
}: {
  targetType: "listing" | "user";
  targetId: string;
  targetLabel: string;
  ownerId: string;
  onReport: (target: ReportTarget) => void;
}) {
  const { user } = useAuth();
  if (user?.id === ownerId || user?.isOperator) return null;
  return (
    <>
      <button
        className="report-button"
        onClick={() => onReport({ targetType, targetId, targetLabel, ownerId })}
      >
        <Flag size={14} />
        {targetType === "listing"
          ? "Пожаловаться на предложение"
          : "Пожаловаться на исполнителя"}
      </button>
    </>
  );
}
export function ReportModal({
  targetType,
  targetId,
  targetLabel,
  onClose,
}: {
  targetType: "listing" | "user";
  targetId: string;
  targetLabel: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [category, setCategory] = useState<ReportCategory>("other");
  const [description, setDescription] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      api("/reports", {
        method: "POST",
        body: json({ targetType, targetId, category, description }),
      }),
    onSuccess: () => {
      onClose();
      toast(
        "Обращение отправлено. Ответ придёт в уведомления сервиса.",
        "success",
      );
    },
  });
  return (
    <Modal
      title="Сообщить о проблеме"
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <p className="operator-modal-target">{targetLabel}</p>
      <p className="modal-description">
        Обращение увидит команда сервиса. Если проблема касается уже
        оформленного заказа, откройте спор внутри него — так арбитру будет
        доступна история.
      </p>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Причина обращения">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ReportCategory)}
          >
            {Object.entries(REPORT_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Что произошло?"
          hint="Не менее 10 символов. Опишите факты, которые помогут разобраться."
        >
          <textarea
            aria-label="Что произошло?"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            autoFocus
          />
        </Field>
        <FormError message={mutation.error?.message} />
        <button className="button primary full" disabled={mutation.isPending}>
          {mutation.isPending ? "Отправляем…" : "Отправить обращение"}
          <Send size={16} />
        </button>
      </form>
    </Modal>
  );
}
