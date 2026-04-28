# Portfolio Case Study

## Project

Games Taste Engine

## Summary

I built this project to solve a personal decision problem:

I was spending time on critically acclaimed or socially validated games that looked important to play, but did not consistently fit my actual taste, pace, or play habits.

The result was predictable:

- I started games because they were respected
- I tried to finish them because they were culturally approved
- I often stalled, dropped them, or watched the rest instead of playing

The project began as a way to use structured data and AI assistance to answer a more useful question:

Not “which games are good?” but “which games are actually likely to work for me?”

## The Problem

Most game recommendation systems optimize for public signals:

- popularity
- review scores
- critical acclaim
- release visibility

Those signals are useful for discovery, but weak for personal follow-through.

They do not tell a player:

- which game they are likely to enjoy
- which game they are likely to finish
- which game looks attractive but is a poor fit in practice

That gap was the core product problem.

## The Product Idea

The idea was to build a small recommendation product focused on:

- current run
- next best game
- best game to resume
- games to avoid for now
- upcoming releases that are likely to fit

The goal was not to produce generic recommendations.

The goal was to reduce wasted time and help the user move toward safer, more personally aligned choices.

## Product Thesis

Good recommendation for games should optimize for personal affinity and likelihood of follow-through, not general quality.

This creates a more honest promise:

The system should help a user understand:

- what tends to fit
- what tends to fail
- why a recommendation exists
- why something attractive may still be risky

## Why This Was Worth Building

This project became interesting because the problem was not only visual or technical.

It involved:

- product framing
- structured data modeling
- explainable decision logic
- AI-assisted enrichment
- cold-start thinking

That made it a good portfolio candidate because it goes beyond interface work into product and system design.

## Current Prototype

The current implementation is a CSV-backed recommendation prototype.

### How it works today

- game metadata is stored in CSV files
- personal opinions, statuses, and session data are also stored in CSV files
- Codex is used as an operator layer to structure, enrich, and maintain the data
- the web app reads those CSV files and renders the current state

In other words:

The current version is operator-assisted, not yet a user-self-serve product.

That distinction matters.

## Key Product Insight

The most important insight was that this should not become a generic “games database”.

That would destroy the value.

The real value is in treating recommendation as a taste and friction problem.

The useful outputs are:

- continue this
- start this next
- resume this later
- avoid this even though it looks tempting

That framing keeps the product small, concrete, and explainable.

## Data Model

The system currently uses structured datasets for:

- game catalog metadata
- personal preferences
- game opinions and statuses
- check-ins and friction signals
- recommendations
- upcoming releases
- platform ownership and access

This allows the system to combine:

- explicit taste signals
- behavioral signals
- catalog-level metadata

instead of relying on popularity or critic consensus.

## Decision Logic

The recommendation layer is explainable and rule-based.

It separates:

- affinity
- priority
- trap risk
- watch risk

and now also distinguishes:

- current run
- next up
- best resume
- avoid for now

This was an intentional product choice.

I did not want a black-box recommendation that only outputs a number.

I wanted a system that can show why it made a call.

## AI's Role

AI is not the source of truth in this project.

That was an important design decision.

AI is used for:

- turning natural language into structured tags
- enriching metadata
- estimating affinity for unseen games
- generating short explanations
- maintaining upcoming release data

AI is not used to decide:

- whether a user actually liked a game
- whether a recommendation was correct
- what the product rules should be

That separation made the product more credible and easier to reason about.

## Cold Start Challenge

A major design problem was the new-user flow.

The current prototype depends on manually curated CSVs, which is fine for prototyping but not for a real user product.

To solve that, I designed a future onboarding flow based on:

- platform access
- 3 liked games
- 3 disliked or dropped games
- a short AI interview
- profile confirmation

This keeps onboarding lightweight while still creating enough signal for first recommendations.

## Design and UX Direction

The interface evolved away from dense overlays and noisy metadata toward clearer recommendation surfaces.

Examples of UX decisions made during the project:

- cover cards now prioritize artwork and title clarity
- active `playing` status is treated as a single current run
- `Upcoming` became a date-ordered list with fit signals instead of a vague franchise surface
- platform availability is now modeled structurally and shown as `Available to you`

These changes made the UI more product-oriented and less like a raw data browser.

## Constraints and Tradeoffs

I intentionally kept the system narrow.

What I did not optimize for:

- universal catalog completeness
- cloud sync
- multi-user support
- social features
- opaque machine learning

Those would have added complexity without strengthening the core product idea.

Instead, I optimized for:

- explainability
- speed of iteration
- strong personal-fit logic
- clarity of recommendation surfaces

## What This Project Demonstrates

This project demonstrates:

- product thinking from a real user pain point
- conversion of a personal workflow into a product concept
- structured data design
- explainable recommendation logic
- AI as an operational layer rather than a magic black box
- a realistic path from internal prototype to user-facing product

## Current State

Today, the project functions as:

- a working recommendation prototype
- a structured data system
- a product thesis with defined MVP and onboarding logic

It is not yet:

- a self-serve application for new users
- a live AI-native onboarding experience
- a full productized backend

## Next Step

The next product milestone is not “more data”.

It is:

- building a user-facing onboarding flow
- adding a searchable game finder with predicted affinity
- replacing manual operator actions with AI-assisted product flows

That is the transition from internal prototype to actual product.

## Closing

This project started as a personal attempt to stop choosing games for external approval and start choosing them based on real fit.

It evolved into a small product idea:

An AI-assisted taste engine that helps a player decide what to continue, what to play next, and what to avoid, using structured data, explicit preferences, and explainable logic.
