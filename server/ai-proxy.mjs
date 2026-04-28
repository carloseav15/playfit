import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const envFiles = [".env", ".env.local"];

for (const file of envFiles) {
  const fullPath = path.join(cwd, file);
  if (!fs.existsSync(fullPath)) {
    continue;
  }

  const content = fs.readFileSync(fullPath, "utf8");
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/gu, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

const PORT = Number(process.env.PRODUCT_PROXY_PORT || "8787");
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, jsonHeaders);
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  if (!Array.isArray(payload?.output)) {
    return null;
  }

  const parts = [];

  for (const item of payload.output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const piece of content) {
      if (typeof piece?.text === "string") {
        parts.push(piece.text);
      }
    }
  }

  return parts.join("\n").trim() || null;
}

async function callOpenAI({ systemPrompt, userPrompt, schemaName, schema }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          schema,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error ||
      `OpenAI request failed with status ${response.status}`;
    throw new Error(message);
  }

  const text = extractOutputText(payload);
  if (!text) {
    throw new Error("OpenAI response did not contain structured output.");
  }

  return JSON.parse(text);
}

const onboardingSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "priorities",
    "avoidPatterns",
    "likedGenres",
    "avoidedGenres",
    "watchVsPlayRisk",
    "signals",
  ],
  properties: {
    summary: { type: "string" },
    priorities: {
      type: "object",
      additionalProperties: false,
      required: ["story", "progression", "hook", "aesthetic", "emotional", "combat", "pace"],
      properties: {
        story: { type: "string", enum: ["low", "medium", "high"] },
        progression: { type: "string", enum: ["low", "medium", "high"] },
        hook: { type: "string", enum: ["low", "medium", "high"] },
        aesthetic: { type: "string", enum: ["low", "medium", "high"] },
        emotional: { type: "string", enum: ["low", "medium", "high"] },
        combat: { type: "string", enum: ["low", "medium", "high"] },
        pace: { type: "string", enum: ["low", "medium", "high"] },
      },
    },
    avoidPatterns: {
      type: "object",
      additionalProperties: false,
      required: [
        "slowStart",
        "repetition",
        "confusingSystems",
        "weakEmotionalPull",
        "shallowCombat",
      ],
      properties: {
        slowStart: { type: "boolean" },
        repetition: { type: "boolean" },
        confusingSystems: { type: "boolean" },
        weakEmotionalPull: { type: "boolean" },
        shallowCombat: { type: "boolean" },
      },
    },
    likedGenres: { type: "array", items: { type: "string" } },
    avoidedGenres: { type: "array", items: { type: "string" } },
    watchVsPlayRisk: { type: "string", enum: ["low", "medium", "high"] },
    signals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "tone", "label", "reason"],
        properties: {
          id: { type: "string" },
          tone: { type: "string", enum: ["positive", "negative"] },
          label: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
};

const finderSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "fitReasons", "cautionReasons", "confidence"],
  properties: {
    summary: { type: "string" },
    fitReasons: { type: "array", items: { type: "string" } },
    cautionReasons: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
};

const checkinSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "tags"],
  properties: {
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
};

const server = http.createServer(async (request, response) => {
  if (!request.url || !request.method) {
    sendJson(response, 400, { error: "Invalid request." });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, jsonHeaders);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/api/ai/health") {
    sendJson(response, 200, {
      ok: true,
      configured: Boolean(OPENAI_API_KEY),
      model: MODEL,
    });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const body = await readJson(request);

    if (request.url === "/api/ai/onboarding-profile") {
      const result = await callOpenAI({
        systemPrompt:
          "You convert short gaming preferences into a compact structured profile. Stay concrete, avoid generic praise, and do not invent impossible certainty.",
        userPrompt: JSON.stringify(body),
        schemaName: "onboarding_profile",
        schema: onboardingSchema,
      });
      sendJson(response, 200, result);
      return;
    }

    if (request.url === "/api/ai/finder-insight") {
      const result = await callOpenAI({
        systemPrompt:
          "You explain whether a game is a fit based on a provided taste profile. Keep it concise, balanced, and grounded in the supplied metadata only.",
        userPrompt: JSON.stringify(body),
        schemaName: "finder_insight",
        schema: finderSchema,
      });
      sendJson(response, 200, result);
      return;
    }

    if (request.url === "/api/ai/checkin-interpretation") {
      const result = await callOpenAI({
        systemPrompt:
          "You convert a short player check-in into a compact summary and a few durable friction or momentum tags.",
        userPrompt: JSON.stringify(body),
        schemaName: "checkin_interpretation",
        schema: checkinSchema,
      });
      sendJson(response, 200, result);
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, OPENAI_API_KEY ? 502 : 503, {
      error: error instanceof Error ? error.message : "Unexpected AI proxy error.",
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`AI proxy listening on http://127.0.0.1:${PORT}`);
});
