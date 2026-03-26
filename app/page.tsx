"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Level = "low" | "medium" | "high";
type InputType = "image" | "url";

type AnalyzePayload = {
  state: {
    stress: Level;
    selfDoubt: Level;
    socialOverwhelm: Level;
    costSensitivity: Level;
  };
  inputType: InputType;
  imageBase64?: string;
  url?: string;
  location?: {
    latitude: number;
    longitude: number;
  } | null;
};

type AnalyzeResult = {
  callout: string;
  sanity: string;
  rule: string;
  alternative: string;
};

const LEVELS: Level[] = ["low", "medium", "high"];
const LEVEL_TO_INDEX: Record<Level, number> = { low: 0, medium: 1, high: 2 };
const INDEX_TO_LEVEL: Level[] = ["low", "medium", "high"];

const INITIAL_STATE: AnalyzePayload["state"] = {
  stress: "medium",
  selfDoubt: "medium",
  socialOverwhelm: "medium",
  costSensitivity: "medium",
};

async function fileToBase64Payload(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function getHost(input: string): string {
  try {
    return new URL(input).host.replace(/^www\./, "");
  } catch {
    return input;
  }
}

export default function Home() {
  const [stateLevels, setStateLevels] = useState(INITIAL_STATE);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [location, setLocation] = useState<AnalyzePayload["location"]>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const hasImage = Boolean(imageFile);
  const hasUrl = urlInput.trim().length > 0;
  const canAnalyze = hasImage || hasUrl;

  const activeInputType: InputType | null = useMemo(() => {
    if (hasImage) return "image";
    if (hasUrl) return "url";
    return null;
  }, [hasImage, hasUrl]);

  const setLevel = (key: keyof AnalyzePayload["state"], value: Level) =>
    setStateLevels((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        setLocation(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 600000,
      }
    );
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);
    setImagePreviewFailed(false);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setUrlInput("");
    event.target.value = "";
  };

  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    if (value.trim()) {
      setImageFile(null);
      setImagePreviewFailed(false);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setImagePreviewUrl(null);
    }
  };

  const clearInput = () => {
    setImageFile(null);
    setImagePreviewFailed(false);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setUrlInput("");
    setResult(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!activeInputType) {
      setError("Bitte zuerst ein Bild auswählen oder eine URL einfügen.");
      return;
    }

    let encodedImage: string | undefined;
    if (activeInputType === "image") {
      if (!imageFile) {
        setError("Kein Bild gefunden. Bitte erneut aufnehmen oder hochladen.");
        return;
      }
      try {
        encodedImage = await fileToBase64Payload(imageFile);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Bild konnte nicht gelesen werden.";
        setError(message);
        return;
      }
    }

    const payload: AnalyzePayload = {
      state: stateLevels,
      inputType: activeInputType,
      location,
      ...(activeInputType === "image"
        ? { imageBase64: encodedImage }
        : { url: urlInput.trim() }),
    };

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Analyse fehlgeschlagen.");
      }

      setResult({
        callout: String(data.callout ?? ""),
        sanity: String(data.sanity ?? ""),
        rule: String(data.rule ?? ""),
        alternative: String(data.alternative ?? ""),
      });
    } catch (err: unknown) {
      const rawMessage =
        err instanceof Error ? err.message : "Analyse war nicht möglich.";
      const message =
        rawMessage === "The string did not match the expected pattern."
          ? "Technischer URL-Fehler im Browser. Bitte Seite neu laden und erneut versuchen."
          : rawMessage;
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isAnalyzing) return;
    void handleAnalyze();
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-fuchsia-100 text-neutral-900">
      <noscript>
        <div className="bg-red-600 p-2 text-center text-sm font-semibold text-white">
          JavaScript ist deaktiviert oder blockiert.
        </div>
      </noscript>
      <div className="mx-auto w-full max-w-md px-4 pb-28 pt-6">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fuchsia-600">
            situative entscheidungshilfe
          </p>
          <h1 className="mt-2 text-3xl font-black leading-tight">Mehr klare nächste Aktion.</h1>
        </header>

        <form
          id="analyze-form"
          onSubmit={handleSubmit}
          noValidate
          className="space-y-5 rounded-3xl border border-fuchsia-200 bg-white/90 p-4 shadow-[0_18px_50px_rgba(217,70,239,0.18)]"
        >
          <div>
            <p className="mb-2 text-sm font-semibold text-neutral-700">A. State Check</p>
            <div className="space-y-3">
              {(Object.keys(stateLevels) as Array<keyof AnalyzePayload["state"]>).map(
                (key) => (
                  <div key={key}>
                    <p className="mb-1 text-sm capitalize text-neutral-600">{key}</p>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={1}
                      value={LEVEL_TO_INDEX[stateLevels[key]]}
                      onChange={(e) =>
                        setLevel(key, INDEX_TO_LEVEL[Number(e.target.value)] ?? "medium")
                      }
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-fuchsia-200 accent-fuchsia-500 touch-manipulation"
                    />
                    <div className="mt-1 grid grid-cols-3 text-xs font-semibold text-fuchsia-700">
                      {LEVELS.map((level) => (
                        <span key={level} className="text-center">
                          {level}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-neutral-700">B. Input (genau eins)</p>
            <div className="rounded-2xl border border-dashed border-fuchsia-300 bg-fuchsia-50 p-4 text-center">
              <span className="text-sm font-semibold text-fuchsia-700">
                Foto / Screenshot hochladen
              </span>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageChange}
              onInput={(e) => handleImageChange(e as unknown as ChangeEvent<HTMLInputElement>)}
              className="mt-2 block w-full text-sm text-fuchsia-700 file:mr-3 file:rounded-lg file:border-0 file:bg-fuchsia-500 file:px-3 file:py-2 file:font-semibold file:text-white"
            />
            {imageFile && (
              <p className="mt-2 text-xs font-semibold text-fuchsia-700">
                Bild ausgewählt: {imageFile.name || "Kameraaufnahme"}
              </p>
            )}
            <div className="mt-3">
              <input
                type="text"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                suppressHydrationWarning
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com/item"
                className="w-full rounded-xl border border-fuchsia-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-fuchsia-500"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
              <span>
                Aktiv:{" "}
                {activeInputType === "image"
                  ? "Bild"
                  : activeInputType === "url"
                    ? "URL"
                    : "keins"}
              </span>
              <button
                type="button"
                onClick={clearInput}
                className="font-semibold text-fuchsia-700"
              >
                Zurücksetzen
              </button>
            </div>
          </div>

          <p className="text-xs text-neutral-500">
            {canAnalyze
              ? "Input erkannt. Analyse kann gestartet werden."
              : "Lade ein Bild hoch oder gib eine URL ein."}
          </p>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </form>

        {result && (
          <section className="mt-6 rounded-3xl bg-neutral-950 p-5 text-white shadow-2xl">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-3">
              {imagePreviewUrl && !imagePreviewFailed ? (
                <img
                  src={imagePreviewUrl}
                  alt="Input preview"
                  className="h-36 w-full rounded-xl object-cover"
                  onError={() => setImagePreviewFailed(true)}
                />
              ) : (
                <div className="rounded-xl bg-white/10 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-fuchsia-200">
                    {imageFile ? "bild" : "url"}
                  </p>
                  <p className="mt-1 break-all text-sm text-white">
                    {imageFile
                      ? imageFile.name || "Bild erfasst (Vorschau nicht verfügbar)"
                      : getHost(urlInput)}
                  </p>
                </div>
              )}
            </div>

            <p className="mt-4 text-2xl font-black leading-tight text-fuchsia-300">
              {result.callout}
            </p>
            <p className="mt-2 text-sm text-neutral-200">{result.sanity}</p>

            <div className="mt-4 space-y-2">
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-neutral-300">rule</p>
                <p className="mt-1 text-sm">{result.rule}</p>
              </div>
              <div className="rounded-xl bg-fuchsia-500/20 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-fuchsia-200">
                  alternative
                </p>
                <p className="mt-1 text-sm">{result.alternative}</p>
              </div>
            </div>
          </section>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-fuchsia-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-1">
          <button
            type="submit"
            form="analyze-form"
            disabled={isAnalyzing}
            className="w-full rounded-2xl bg-fuchsia-500 px-4 py-3 text-base font-bold text-white shadow-lg shadow-fuchsia-200 touch-manipulation active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnalyzing ? "Analyzing..." : "C. Analyse erzeugen"}
          </button>
        </div>
      </div>
    </main>
  );
}
