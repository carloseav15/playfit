# Portfolio Summary

## Games Taste Engine

An AI-assisted recommendation prototype focused on a simple question:

Which games am I actually likely to enjoy and finish?

## Problem

I kept starting games because they were popular, critically acclaimed, or culturally expected.

That created a mismatch:

- many of those games were respected
- some of them were still not right for me
- I lost time trying to force fit instead of choosing based on real affinity

I wanted a system that could help me move away from external validation and toward better personal decisions.

## Insight

Most game discovery tools optimize for quality in general.

This project optimizes for personal fit.

The goal is not to answer:

- what is the best game?

The goal is to answer:

- what should I continue?
- what should I play next?
- what should I resume later?
- what should I avoid even if it looks appealing?

## What I Built

I built a local-first browser app that combines:

- game metadata
- personal preferences
- play history
- drop and friction patterns
- platform access
- upcoming release tracking

The app runs entirely client-side and surfaces:

- current run
- next up
- best resume
- avoid for now
- searchable game finder with affinity scoring
- upcoming releases with fit predictions

## How It Works

The recommendation system is explainable and rule-based.

It evaluates:

- affinity
- priority
- trap risk
- watch risk

Instead of returning only a score, the system also explains why a game is being recommended or flagged as risky.

## AI's Role

AI is used as an operational layer, not as the source of truth.

It helps with:

- turning natural language into structured tags
- enriching metadata
- estimating affinity for games without personal history
- generating short explanations
- maintaining future release data

It does not decide:

- whether I actually liked a game
- whether a recommendation was truly correct
- what the business rules of the product should be

## Why This Matters

This project is not just a UI exercise.

It demonstrates:

- product thinking from a real user pain point
- explainable recommendation logic
- structured data design
- cold-start onboarding thinking
- a practical use of AI inside a constrained product

## Current State

Right now, this works as a self-serve Next.js portfolio app:

- game metadata loads from CSV seed files at boot
- user data persists in IndexedDB (no accounts, no backend)
- the scoring engine runs client-side with deterministic rules
- the visible stack is Next.js, React, TypeScript, Tailwind, shadcn/ui-style primitives, Zod, React Hook Form, and Motion

It is a usable recommendation product with onboarding, library tracking, and explainable scoring.

## Next Step

The next milestone is to integrate AI-assisted flows:

- AI-assisted onboarding to reduce cold-start friction
- session check-ins for continuous profile refinement
- expanded game catalog with richer metadata

## One-Line Framing

Games Taste Engine is an AI-assisted product concept that helps players stop choosing games for prestige and start choosing them for real personal fit.
