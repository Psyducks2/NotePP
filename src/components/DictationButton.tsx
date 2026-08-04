import { useEffect, useRef, useState } from "react";
import {
  getDictationStatus,
  onDictationStatus,
  toggleDictation,
  type DictationStatus,
} from "../lib/dictation";

const LABELS: Record<DictationStatus, string> = {
  idle: "Ditar por voz",
  recording: "Gravando… clique para parar",
  transcribing: "Transcrevendo…",
  cleaning: "Limpando texto…",
  empty: "Nada foi captado",
  error: "Erro no ditado — clique para tentar de novo",
};

const RECORDING_LINES = [
  "Gravando… pode falar!",
  "Ouvindo você com atenção 👂",
  "Gravando… sem gaguejar, hein",
  "Captando sua voz…",
  "No ar. Manda a real.",
];

const TRANSCRIBING_LINES = [
  "Transcrevendo sua fala…",
  "Convertendo som em letras…",
  "Decifrando o que você disse…",
  "Passando a fala a limpo…",
];

const CLEANING_LINES = [
  "Limpando o texto com IA…",
  'Tirando os "né", "tipo" e "ééé"…',
  "Deixando suas palavras apresentáveis…",
  "Passando o texto no batom 💄",
  "Filtrando os pigarros…",
];

const EMPTY_LINES = [
  "Não captei nada… tenta de novo?",
  "Silêncio total por aqui 🤫",
  "Acho que o microfone não te ouviu",
  "Nada gravado — fala um pouco mais alto",
];

function pickLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

export function DictationButton() {
  const [status, setStatusState] = useState<DictationStatus>(
    getDictationStatus(),
  );
  const [errorText, setErrorText] = useState("");
  const [message, setMessage] = useState("");
  const lastStatus = useRef<DictationStatus>(status);

  useEffect(
    () =>
      onDictationStatus((next, error) => {
        setStatusState(next);
        if (error) setErrorText(error);
        if (next !== lastStatus.current) {
          lastStatus.current = next;
          if (next === "recording") setMessage(pickLine(RECORDING_LINES));
          else if (next === "transcribing") setMessage(pickLine(TRANSCRIBING_LINES));
          else if (next === "cleaning") setMessage(pickLine(CLEANING_LINES));
          else if (next === "empty") setMessage(pickLine(EMPTY_LINES));
        }
      }),
    [],
  );

  const busy = status === "transcribing" || status === "cleaning";
  const bubbleText = status === "error" ? errorText || LABELS.error : message;

  return (
    <div className="dictation-wrap">
      <button
        type="button"
        className={`dictation-button status-${status}`}
        title={LABELS[status]}
        aria-label={LABELS[status]}
        aria-pressed={status === "recording"}
        disabled={busy}
        onClick={() => void toggleDictation()}
      >
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
        {status === "recording" && (
          <span className="dictation-pulse" aria-hidden="true" />
        )}
      </button>

      {status !== "idle" && (
        <div className={`dictation-bubble status-${status}`} role="status">
          {status === "recording" && (
            <span className="dictation-rec-dot" aria-hidden="true" />
          )}
          {busy && (
            <span className="dictation-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
          <span>{bubbleText}</span>
        </div>
      )}
    </div>
  );
}
