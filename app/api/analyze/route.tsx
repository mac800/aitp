import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chatInput = body?.chatInput;

    if (!chatInput || typeof chatInput !== "string" || !chatInput.trim()) {
      return NextResponse.json(
        { error: "Chat input is required." },
        { status: 400 }
      );
    }

    if (chatInput.length > 5000) {
      return NextResponse.json(
        { error: "Chat input is too long." },
        { status: 400 }
      );
    }

    const prompt = `
You are analyzing a pasted dating chat.

Your job:
Return a short, punchy, emotionally sharp verdict about how the user comes across.

Rules:
- Be concise
- Be direct
- Be screenshot-friendly
- No long explanations
- No therapy language
- No safety disclaimers
- Focus on dating dynamics only

Return valid JSON with exactly this shape:
{
  "verdict": "string",
  "score": 0,
  "callouts": ["string", "string", "string"]
}

Requirements:
- "verdict": max 12 words
- "score": integer from 0 to 100, where higher means the user looks more like the problem
- "callouts": exactly 3 short lines, each max 12 words

User chat:
"""${chatInput}"""
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You produce sharp, compact dating-chat verdicts in strict JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      return NextResponse.json(
        { error: "No response from model." },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(raw);

    if (
      typeof parsed.verdict !== "string" ||
      typeof parsed.score !== "number" ||
      !Array.isArray(parsed.callouts)
    ) {
      return NextResponse.json(
        { error: "Invalid model response." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      verdict: parsed.verdict,
      score: parsed.score,
      callouts: parsed.callouts.slice(0, 3),
    });
  } catch (error) {
    console.error("Analyze error:", error);

    return NextResponse.json(
      { error: "Failed to analyze chat." },
      { status: 500 }
    );
  }
}