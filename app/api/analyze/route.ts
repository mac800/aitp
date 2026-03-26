import OpenAI from "openai";
import { NextResponse } from "next/server";
import { fetchUrlMetadata } from "@/app/lib/url-metadata";

type Level = "low" | "medium" | "high";
type InputType = "image" | "url";

type AnalyzeRequest = {
  state?: {
    stress?: Level;
    selfDoubt?: Level;
    socialOverwhelm?: Level;
    costSensitivity?: Level;
  };
  inputType?: InputType;
  imageBase64?: string;
  url?: string;
  location?: {
    latitude: number;
    longitude: number;
  } | null;
};

type AnalyzeResponse = {
  callout: string;
  sanity: string;
  rule: string;
  alternative: string;
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const LEVELS: Level[] = ["low", "medium", "high"];

const DEFAULT_STATE = {
  stress: "medium" as Level,
  selfDoubt: "medium" as Level,
  socialOverwhelm: "medium" as Level,
  costSensitivity: "medium" as Level,
};

function isLevel(value: unknown): value is Level {
  return typeof value === "string" && LEVELS.includes(value as Level);
}

function fallbackResult(reason: string): AnalyzeResponse {
  const byReason: Record<string, AnalyzeResponse> = {
    weak_image: {
      callout: "Zu wenig Bildsignal. Keine Story erfinden.",
      sanity: "Das Motiv ist unklar, also bleibt die Empfehlung nüchtern.",
      rule: "Nur entscheiden, wenn ein klares Detail wirklich sichtbar ist.",
      alternative: "Mach ein neues Foto mit einem eindeutigen Fokus.",
    },
    weak_url: {
      callout: "Die URL liefert kaum Substanz. Kein Ratespiel.",
      sanity: "Ohne belastbaren Kontext ist die sichere Regel besser.",
      rule: "Wenn Titel und Beschreibung dünn sind: Tempo rausnehmen.",
      alternative: "Öffne die Quelle direkt und prüfe zwei harte Fakten.",
    },
    model_invalid: {
      callout: "Signal ist da, Antwort war aber unsauber.",
      sanity: "Lieber klare Baseline als pseudo-smarte Halluzination.",
      rule: "Eine Aktion, kleiner Einsatz, schnell rückgängig machbar.",
      alternative: "Nimm die günstigste, reversible Option für heute.",
    },
  };

  return (
    byReason[reason] ?? {
      callout: "Nicht genug belastbares Signal für eine scharfe Aussage.",
      sanity: "Die Datenlage ist dünn, deshalb konservative Empfehlung.",
      rule: "Wenn unsicher: kleinen Test statt großer Entscheidung.",
      alternative: "24 Stunden warten und dann mit frischem Blick prüfen.",
    }
  );
}

function sanitizeOutput(input: unknown): AnalyzeResponse | null {
  if (!input || typeof input !== "object") return null;
  const parsed = input as Record<string, unknown>;

  const callout = typeof parsed.callout === "string" ? parsed.callout.trim() : "";
  const sanity = typeof parsed.sanity === "string" ? parsed.sanity.trim() : "";
  const rule = typeof parsed.rule === "string" ? parsed.rule.trim() : "";
  const alternative =
    typeof parsed.alternative === "string" ? parsed.alternative.trim() : "";

  if (!callout || !sanity || !rule || !alternative) return null;

  return {
    callout: callout.slice(0, 180),
    sanity: sanity.slice(0, 180),
    rule: rule.slice(0, 180),
    alternative: alternative.slice(0, 180),
  };
}

function toImageDataUrl(imageBase64: string): string {
  const normalized = imageBase64.trim();
  if (normalized.startsWith("data:image/")) return normalized;
  if (normalized.startsWith("data:")) {
    const commaIndex = normalized.indexOf(",");
    const payload = commaIndex >= 0 ? normalized.slice(commaIndex + 1) : normalized;
    return `data:image/jpeg;base64,${payload}`;
  }
  return `data:image/jpeg;base64,${normalized}`;
}

function normalizeUrl(raw: string): string | null {
  try {
    const value = raw.trim();
    const withProto = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(withProto).toString();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeRequest;
    const state = {
      stress: isLevel(body?.state?.stress) ? body.state.stress : DEFAULT_STATE.stress,
      selfDoubt: isLevel(body?.state?.selfDoubt)
        ? body.state.selfDoubt
        : DEFAULT_STATE.selfDoubt,
      socialOverwhelm: isLevel(body?.state?.socialOverwhelm)
        ? body.state.socialOverwhelm
        : DEFAULT_STATE.socialOverwhelm,
      costSensitivity: isLevel(body?.state?.costSensitivity)
        ? body.state.costSensitivity
        : DEFAULT_STATE.costSensitivity,
    };

    const hasImage = typeof body?.imageBase64 === "string" && body.imageBase64.length > 24;
    const normalizedUrl = typeof body?.url === "string" ? normalizeUrl(body.url) : null;

    let inputType: InputType | null = null;
    if (hasImage) inputType = "image";
    else if (normalizedUrl) inputType = "url";
    else if (body?.inputType === "image" || body?.inputType === "url") {
      inputType = body.inputType;
    }

    if (!inputType) {
      return NextResponse.json(
        { error: "Bitte Bild oder URL angeben." },
        { status: 400 }
      );
    }

    if (inputType === "image" && !hasImage) {
      return NextResponse.json(fallbackResult("weak_image"));
    }

    const safeLocation =
      body?.location &&
      typeof body.location.latitude === "number" &&
      typeof body.location.longitude === "number"
        ? {
            latitude: Number(body.location.latitude.toFixed(2)),
            longitude: Number(body.location.longitude.toFixed(2)),
          }
        : null;

    const urlMetadata =
      inputType === "url" && normalizedUrl
        ? await fetchUrlMetadata(normalizedUrl)
        : { title: null, description: null, ogImage: null };

    if (inputType === "url" && !urlMetadata.title && !urlMetadata.description) {
      return NextResponse.json(fallbackResult("weak_url"));
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(fallbackResult("model_invalid"));
    }

    const prompt = `
Du bist ein situativer, pragmatischer Assistent für schnelle Mikro-Entscheidungen.

Kontext:
- State: stress=${state.stress}, selfDoubt=${state.selfDoubt}, socialOverwhelm=${state.socialOverwhelm}, costSensitivity=${state.costSensitivity}
- InputType: ${inputType}
- Standort: ${
      safeLocation
        ? `lat=${safeLocation.latitude}, lon=${safeLocation.longitude}`
        : "nicht vorhanden"
    }

URL-Signal (falls vorhanden):
- url: ${normalizedUrl ?? "n/a"}
- title: ${urlMetadata.title ?? "n/a"}
- description: ${urlMetadata.description ?? "n/a"}
- ogImage: ${urlMetadata.ogImage ?? "n/a"}

Anforderungen:
- callout: frech, präzise, screenshotfähig
- sanity: kurz, plausibel, nicht therapeutisch
- rule: knapp, konkret
- alternative: alltagsnah, sofort machbar, nicht creepy
- Wenn Signal schwach ist: nüchterner Fallback statt Pseudo-Tiefe

Antworte nur als valides JSON mit genau diesem Schema:
{
  "callout": "string",
  "sanity": "string",
  "rule": "string",
  "alternative": "string"
}
`;

    const messageContent =
      inputType === "image"
        ? [
            { type: "text" as const, text: prompt },
            {
              type: "image_url" as const,
              image_url: { url: toImageDataUrl(body.imageBase64 ?? "") },
            },
          ]
        : prompt;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Du gibst kurze, realistische Handlungsimpulse. Kein Coaching-Jargon.",
        },
        {
          role: "user",
          content: messageContent,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json(fallbackResult("model_invalid"));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(fallbackResult("model_invalid"));
    }

    const cleaned = sanitizeOutput(parsed);
    if (!cleaned) {
      return NextResponse.json(fallbackResult("model_invalid"));
    }

    return NextResponse.json(cleaned);
  } catch (error) {
    console.error("Analyze route error:", error);
    return NextResponse.json(fallbackResult("model_invalid"));
  }
}
