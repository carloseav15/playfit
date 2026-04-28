import type {
  GameRecord,
  ProfileRow,
  RecommendationRow,
} from "../../data/schema";
import { topProfileSignals } from "../../domain/summaries";
import { renderSummarySection } from "./summary";
import { humanizeValue } from "../utils";

const PERSONA_CODEX = [
  {
    title: "The Explorer",
    desc: "You enjoy a well-rounded variety of experiences across different paces and styles.",
  },
  {
    title: "The Adrenaline Chaser",
    desc: "You prioritize pure gameplay momentum. If the combat loop is tight and the pacing is relentless, you will forgive almost any narrative flaw.",
  },
  {
    title: "The Deep Storyteller",
    desc: "You are looking for an arc. You are willing to endure mechanical friction or slow pacing as long as the world-building and narrative payoff are exceptional.",
  },
  {
    title: "The Systems Optimizer",
    desc: "You play to overcome complex friction. You don't just want to passively experience a game, you want to master its underlying math and systems.",
  },
];

export function renderPatternsSection(
  records: GameRecord[],
  profile: ProfileRow[],
  recommendations: RecommendationRow[],
) {
  const positiveSignals = topProfileSignals(profile, "likes", 3);
  const avoidSignals = topProfileSignals(profile, "avoid", 3);

  let personaTitle = "The Explorer";
  let personaDesc =
    "You enjoy a well-rounded variety of experiences across different paces and styles.";

  const leadSignal = positiveSignals[0]?.value || "";
  if (leadSignal.includes("pacing_fast") || leadSignal.includes("combat_high")) {
    personaTitle = "The Adrenaline Chaser";
    personaDesc =
      "You prioritize pure gameplay momentum. If the combat loop is tight and the pacing is relentless, you will forgive almost any narrative flaw.";
  } else if (
    leadSignal.includes("story_high") ||
    leadSignal.includes("payoff_high")
  ) {
    personaTitle = "The Deep Storyteller";
    personaDesc =
      "You are looking for an arc. You are willing to endure mechanical friction or slow pacing as long as the world-building and narrative payoff are exceptional.";
  } else if (
    leadSignal.includes("challenge_high") ||
    leadSignal.includes("systemic")
  ) {
    personaTitle = "The Systems Optimizer";
    personaDesc =
      "You play to overcome complex friction. You don't just want to passively experience a game, you want to master its underlying math and systems.";
  }

  let kryptoniteText =
    "You don't have enough data yet to show strong aversion patterns.";
  if (avoidSignals.length > 0) {
    const avoidLabels = avoidSignals.map((signal) => humanizeValue(signal.value)).join(" and ");
    kryptoniteText = `Your data shows you consistently stall, pause, or drop titles when they rely heavily on <strong>${avoidLabels}</strong>. Beware of purchasing games where this is the core loop.`;
  }

  return `
    ${renderSummarySection(records, profile, recommendations)}
    <section class="panel section-theme section-theme-patterns">
      <div class="patterns-container">
        <p class="eyebrow">Gamer Persona Assessment</p>

        <div class="persona-hero-card">
          <div class="persona-glow" aria-hidden="true"></div>

          <h1 class="persona-title">${personaTitle}</h1>
          <p class="persona-desc">${personaDesc}</p>

          <div class="persona-kryptonite">
            <h3 class="kryptonite-label">Your Kryptonite</h3>
            <p class="kryptonite-text">${kryptoniteText}</p>
          </div>
        </div>

        <div class="persona-codex-section">
          <p class="eyebrow">The Persona Codex</p>

          <div class="persona-codex-grid">
            ${PERSONA_CODEX.map((persona) => {
              const isActive = persona.title === personaTitle;
              return `
                <div class="persona-codex-card ${isActive ? "is-active" : ""}">
                  <h4>${persona.title}</h4>
                  <p>${persona.desc}</p>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}
