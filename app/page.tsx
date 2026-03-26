"use client";

import { useState } from "react";

type VerdictResult = {
  verdict: string;
  score: number;
  callouts: string[];
};

export default function Home() {
  const [chatInput, setChatInput] = useState("");
  const [result, setResult] = useState<VerdictResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!chatInput.trim()) return;

    setIsAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chatInput }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Analyze failed");
      }

      setResult({
        verdict: data.verdict,
        score: data.score,
        callouts: data.callouts,
      });
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
        <div className="mb-10">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-neutral-400">
            Am I The Problem?
          </p>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Paste the chat. Get the verdict.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-300 sm:text-lg">
            Find out how you actually come across — and what to say next.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl">
          <label
            htmlFor="chatInput"
            className="mb-3 block text-sm font-medium text-neutral-200"
          >
            Paste your dating chat
          </label>

          <textarea
            id="chatInput"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={`You: Hey, how was your day?
Them: good
You: Nice
Them: lol`}
            className="min-h-[220px] w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-neutral-500"
          />

          <button
            onClick={handleAnalyze}
            disabled={!chatInput.trim() || isAnalyzing}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnalyzing ? "Analyzing..." : "Analyze the chat"}
          </button>

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>

        {result && (
          <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                  Verdict
                </p>
                <h2 className="mt-2 text-2xl font-bold text-white">
                  {result.verdict}
                </h2>
              </div>

              <div className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-200">
                {result.score} / 100
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {result.callouts.map((callout) => (
                <div
                  key={callout}
                  className="rounded-xl bg-neutral-950 p-4 text-sm text-neutral-200"
                >
                  {callout}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-neutral-700 bg-neutral-950 p-4">
              <p className="text-sm text-neutral-300">
                Get the exact reply you should send next.
              </p>
              <button className="mt-3 inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90">
                Unlock the fix
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}