import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  listAudioInputDevices,
  testMicrophone,
  type AudioDeviceInfo,
} from "../lib/audioDevices";
import { persistCurrentSettings } from "../lib/session";
import {
  CLEANUP_MODEL_ID,
  cleanTranscript,
  cleanupModelStatus,
  deleteCleanupModel,
  deleteWhisperModel,
  downloadCleanupModel,
  downloadWhisperModel,
  formatBytes,
  listWhisperModels,
  onCleanupDownloadProgress,
  onWhisperDownloadProgress,
  type CleanupModelStatus,
  type WhisperModelStatus,
} from "../lib/voiceModels";
import { DEFAULT_CLEANUP_PROMPT, useSettingsStore } from "../store/settingsStore";

type MicTestState =
  | { phase: "idle" }
  | { phase: "testing" }
  | {
      phase: "done";
      detected: boolean;
      level: number;
      peak: number;
      sampleCount: number;
    }
  | { phase: "error"; message: string };

export function VoiceSettings() {
  const sttModel = useSettingsStore((s) => s.sttModel);
  const cleanupEnabled = useSettingsStore((s) => s.cleanupEnabled);
  const cleanupPrompt = useSettingsStore((s) => s.cleanupPrompt);
  const micDeviceId = useSettingsStore((s) => s.micDeviceId);
  const whisperUseGpu = useSettingsStore((s) => s.whisperUseGpu);

  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [devicesError, setDevicesError] = useState("");
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [gpuCompiled, setGpuCompiled] = useState(false);
  const [micTest, setMicTest] = useState<MicTestState>({ phase: "idle" });
  const [models, setModels] = useState<WhisperModelStatus[]>([]);
  const [cleanupModel, setCleanupModel] = useState<CleanupModelStatus | null>(
    null,
  );
  const [downloading, setDownloading] = useState<Record<string, number>>({});
  const [promptDraft, setPromptDraft] = useState(cleanupPrompt);
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");

  const refreshDevices = async () => {
    setDevicesLoading(true);
    setDevicesError("");
    try {
      const list = await listAudioInputDevices();
      setDevices(list);
      const saved = useSettingsStore.getState().micDeviceId;
      if (saved && !list.some((d) => d.id === saved)) {
        await persistCurrentSettings({ micDeviceId: null });
        setMicTest({ phase: "idle" });
      }
    } catch (e) {
      setDevices([]);
      setDevicesError(String(e));
    } finally {
      setDevicesLoading(false);
    }
  };

  useEffect(() => {
    void refreshDevices();
    void invoke<{ compiledWithGpu: boolean }>("whisper_gpu_status")
      .then((s) => setGpuCompiled(s.compiledWithGpu))
      .catch(() => setGpuCompiled(false));
  }, []);

  const onToggleGpu = (enabled: boolean) => {
    if (enabled) {
      if (!gpuCompiled) {
        window.alert(
          "Este build do NotePP foi compilado sem suporte a GPU (Vulkan). A transcrição continua na CPU.",
        );
        return;
      }
      const ok = window.confirm(
        "Autorizar aceleração por GPU (Vulkan) para o Whisper?\n\n" +
          "Isso pode deixar a transcrição bem mais rápida na sua placa de vídeo. " +
          "O modelo será recarregado na próxima ditagem.",
      );
      if (!ok) return;
    }
    void persistCurrentSettings({ whisperUseGpu: enabled });
  };

  const runMicTest = async () => {
    setMicTest({ phase: "testing" });
    try {
      const result = await testMicrophone(micDeviceId);
      setMicTest({
        phase: "done",
        detected: result.detected,
        level: result.level,
        peak: result.peak,
        sampleCount: result.sampleCount,
      });
    } catch (e) {
      setMicTest({ phase: "error", message: String(e) });
    }
  };

  const refreshModels = () => {
    void listWhisperModels().then(setModels);
    void cleanupModelStatus().then(setCleanupModel);
  };

  useEffect(() => {
    refreshModels();
    let unlistenWhisper: (() => void) | undefined;
    let unlistenCleanup: (() => void) | undefined;

    const handleProgress = (id: string, downloadedBytes: number, total: number) => {
      setDownloading((d) => ({ ...d, [id]: total ? downloadedBytes / total : 0 }));
      if (total > 0 && downloadedBytes >= total) {
        setDownloading((d) => {
          const next = { ...d };
          delete next[id];
          return next;
        });
        refreshModels();
      }
    };

    void onWhisperDownloadProgress((p) =>
      handleProgress(p.id, p.downloaded, p.total),
    ).then((u) => (unlistenWhisper = u));
    void onCleanupDownloadProgress((p) =>
      handleProgress(p.id, p.downloaded, p.total),
    ).then((u) => (unlistenCleanup = u));

    return () => {
      unlistenWhisper?.();
      unlistenCleanup?.();
    };
  }, []);

  useEffect(() => setPromptDraft(cleanupPrompt), [cleanupPrompt]);

  const restoreDefaultPrompt = () => {
    setPromptDraft(DEFAULT_CLEANUP_PROMPT);
  };

  const runTest = async () => {
    setTesting(true);
    setTestError("");
    setTestOutput("");
    try {
      const result = await cleanTranscript(testInput, promptDraft);
      setTestOutput(result);
    } catch (e) {
      setTestError(String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="voice-settings">
      <section className="voice-section">
        <h3>Microfone</h3>
        <p className="hint">
          Escolha o microfone (entrada), não um item “Monitor of…” — esses ouvem
          o que sai no fone, não a sua voz. Confira se está captando som antes de
          gravar de verdade.
        </p>
        <div className="mic-select-row">
          <select
            className="mic-select"
            value={micDeviceId ?? ""}
            disabled={devicesLoading}
            onChange={(e) => {
              const value = e.target.value || null;
              void persistCurrentSettings({ micDeviceId: value });
              setMicTest({ phase: "idle" });
            }}
          >
            <option value="">Padrão do sistema</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.isDefault ? " (padrão)" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void refreshDevices()}
            disabled={devicesLoading}
            title="Atualizar lista de microfones"
          >
            {devicesLoading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
        {devicesError && <p className="hint error">{devicesError}</p>}

        <div className="mic-test">
          <button
            type="button"
            onClick={() => void runMicTest()}
            disabled={micTest.phase === "testing"}
          >
            {micTest.phase === "testing" ? "Ouvindo… fale algo agora" : "Testar microfone"}
          </button>

          {micTest.phase === "done" && (
            <div className={`mic-test-result ${micTest.detected ? "ok" : "warn"}`}>
              <div className="mic-level-bar">
                <div
                  className="mic-level-fill"
                  style={{
                    width: `${Math.min(100, Math.round(Math.max(micTest.level, micTest.peak) * 250))}%`,
                  }}
                />
              </div>
              <span>
                {micTest.sampleCount === 0
                  ? "Nenhum sample chegou do dispositivo — tente outro microfone ou Atualizar a lista."
                  : micTest.detected
                    ? `Som detectado (nível ${micTest.level.toFixed(3)}, pico ${micTest.peak.toFixed(3)}) — microfone ok.`
                    : `Sinal muito fraco ou silêncio (nível ${micTest.level.toFixed(3)}, pico ${micTest.peak.toFixed(3)}). Fale perto do boom do mic; no H510 o “Wireless” costuma ficar mudo — use “USB Gaming Headset Mono”. Confira se o mute físico do microfone está desligado.`}
              </span>
            </div>
          )}
          {micTest.phase === "error" && (
            <p className="hint error">{micTest.message}</p>
          )}
        </div>
      </section>

      <section className="voice-section">
        <h3>Modelo de voz (Whisper local)</h3>
        <p className="hint">
          Roda 100% no seu computador — nenhum áudio sai da máquina. Modelos
          maiores transcrevem com mais precisão, mas demoram mais.
        </p>
        <div className="model-list">
          {models.map((m) => {
            const progress = downloading[m.id];
            const active = sttModel === m.id;
            return (
              <div key={m.id} className={`model-row ${active ? "active" : ""}`}>
                <button
                  type="button"
                  className="model-row-main"
                  disabled={!m.downloaded}
                  title={m.downloaded ? "Usar este modelo" : "Baixe o modelo para poder usá-lo"}
                  onClick={() => void persistCurrentSettings({ sttModel: m.id })}
                >
                  <span className="model-name">{m.label}</span>
                  {m.recommended && <span className="badge">Recomendado</span>}
                  {active && <span className="badge badge-active">Ativo</span>}
                  <span className="model-size">{formatBytes(m.sizeBytes)}</span>
                </button>
                {progress !== undefined ? (
                  <div className="model-progress" title={`${Math.round(progress * 100)}%`}>
                    <div
                      className="model-progress-bar"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                ) : m.downloaded ? (
                  <button
                    type="button"
                    className="model-remove"
                    onClick={() => void deleteWhisperModel(m.id).then(refreshModels)}
                  >
                    Remover
                  </button>
                ) : (
                  <button
                    type="button"
                    className="model-download"
                    onClick={() => void downloadWhisperModel(m.id)}
                  >
                    Baixar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="voice-section">
        <label className="setting-row">
          <input
            type="checkbox"
            checked={whisperUseGpu}
            onChange={(e) => onToggleGpu(e.target.checked)}
          />
          Acelerar Whisper com GPU
        </label>
        <p className="hint">
          {gpuCompiled
            ? "Opcional. Usa a placa de vídeo (Vulkan) só se você autorizar. Sem isso, a transcrição roda na CPU."
            : "Este executável não inclui suporte a GPU. Recompile com a feature whisper-gpu (Vulkan) para habilitar."}
        </p>
      </section>

      <section className="voice-section">
        <label className="setting-row">
          <input
            type="checkbox"
            checked={cleanupEnabled}
            onChange={(e) =>
              void persistCurrentSettings({ cleanupEnabled: e.target.checked })
            }
          />
          Limpar texto ditado com IA local
        </label>
        <p className="hint">
          Depois de transcrever, um modelo de linguagem pequeno roda no seu
          computador para corrigir a fala e remover vícios de linguagem,
          seguindo o prompt abaixo.
        </p>

        {cleanupModel && (
          <div className="model-row">
            <div className="model-row-main">
              <span className="model-name">Qwen2.5 1.5B Instruct</span>
              <span className="model-size">
                {formatBytes(cleanupModel.sizeBytes)}
              </span>
            </div>
            {downloading[CLEANUP_MODEL_ID] !== undefined ? (
              <div className="model-progress">
                <div
                  className="model-progress-bar"
                  style={{
                    width: `${Math.round((downloading[CLEANUP_MODEL_ID] ?? 0) * 100)}%`,
                  }}
                />
              </div>
            ) : cleanupModel.downloaded ? (
              <button
                type="button"
                className="model-remove"
                onClick={() => void deleteCleanupModel().then(refreshModels)}
              >
                Remover
              </button>
            ) : (
              <button
                type="button"
                className="model-download"
                onClick={() => void downloadCleanupModel()}
              >
                Baixar
              </button>
            )}
          </div>
        )}
      </section>

      <section className="voice-section">
        <h3>Estúdio de prompts</h3>
        <p className="hint">Personalize como a IA limpa o texto ditado.</p>
        <textarea
          className="prompt-editor"
          value={promptDraft}
          onChange={(e) => setPromptDraft(e.target.value)}
          rows={10}
        />
        <div className="prompt-actions">
          <button type="button" onClick={restoreDefaultPrompt}>
            Restaurar padrão
          </button>
          <button
            type="button"
            disabled={promptDraft === cleanupPrompt}
            onClick={() => void persistCurrentSettings({ cleanupPrompt: promptDraft })}
          >
            Salvar prompt
          </button>
        </div>

        <div className="prompt-test">
          <textarea
            placeholder="Cole aqui uma transcrição de exemplo para testar o prompt…"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            rows={3}
          />
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing || !testInput.trim() || !cleanupModel?.downloaded}
          >
            {testing ? "Testando…" : "Testar"}
          </button>
          {!cleanupModel?.downloaded && (
            <p className="hint">Baixe o modelo de limpeza acima para testar.</p>
          )}
          {testError && <p className="hint error">{testError}</p>}
          {testOutput && <div className="prompt-test-output">{testOutput}</div>}
        </div>
      </section>
    </div>
  );
}
