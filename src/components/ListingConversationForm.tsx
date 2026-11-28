import { useUiText } from "../lib";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Send } from "lucide-react";
import type { Listing } from "../../shared/types";
import { api, json } from "../lib";
import { Field, FormError, Modal } from "./ui";

export function ListingConversationForm({
  listing,
  onClose,
}: {
  listing: Listing;
  onClose: () => void;
}) {
  const tr = useUiText();
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const client = useQueryClient();
  const send = useMutation({
    mutationFn: () =>
      api<{ id: string }>(`/listings/${listing.id}/conversations`, {
        method: "POST",
        body: json({ text: message }),
      }),
    onSuccess: ({ id }) => {
      void client.invalidateQueries({ queryKey: ["conversations"] });
      onClose();
      navigate(`/dashboard/messages/${id}`);
    },
  });
  return (
    <Modal title={tr("Написать автору")} onClose={onClose}>
      <p className="modal-description">{listing.title}</p>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (message.trim() && !send.isPending) send.mutate();
        }}
      >
        <Field label={tr("Ваше сообщение")}>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
            required
            placeholder={tr("Здравствуйте! Объявление ещё актуально?")}
            rows={4}
          />
        </Field>
        <FormError message={send.error?.message} />
        <button
          className="button primary full"
          disabled={send.isPending || !message.trim()}
        >
          <Send size={16} /> {tr("Отправить сообщение")}
        </button>
      </form>
    </Modal>
  );
}
