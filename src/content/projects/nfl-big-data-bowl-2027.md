---
title: NFL Big Data Bowl 2027
kind: software
area: Sports analytics
order: 302
metric:
  value: 10 Hz
  unit: Combine 40-yard tracking vs rookie game movement
summary: >-
  Does how fast a player builds speed in the first second of the 40-yard dash predict how he moves in NFL games, beyond
  the official 40 time? A reproducible tracking pipeline, cohort-held-out models and an honest answer: mostly no.
stack:
  - Python
  - pandas
  - scikit-learn
  - NumPy
  - Jupyter
  - Kaggle
cover: /images/nfl-cover.svg
links:
  code: https://github.com/yandouziyassine/nfl-combine-speed-profiles
---

*Kaggle competition · Oct. 2026*

## The question

The NFL Combine times every prospect over 40 yards. The official numbers are the 40 time and the 10-yard split. The Big Data Bowl 2027 also gives the **10 Hz tracking** of each dash, so the whole speed curve is visible. This project asks whether the shape of that curve, especially how speed builds during the first second, adds information about a player's later NFL movement beyond the 40 time, the split and his body measurements.

## What was built

- A 10 Hz Combine tracking pipeline: early acceleration, later acceleration, speed retention and position-aware drill profiles.
- Data-quality and linkage audits: trace cadence, movement onset, course-axis assumptions, repeated attempts and Combine-to-game player matching.
- Player-level models (ridge regression) evaluated **leave-one-draft-cohort-out**, with preprocessing fitted on the training cohorts only.
- A nested feature-selection audit, measurement-reliability analyses, outcome and role sensitivities, and a registry of every analysis tried.
- A reproducible Kaggle notebook with pinned requirements and a source bundle.

## What it found

The honest headline is mostly negative. For defensive linemen, first-second acceleration is associated with the 90th percentile of rookie peak speed, but that result came out of a feature search and is not confirmatory. The broader selection-aware search showed little average lift over the official 40 time and split, and the direct first-step blitz-speed analysis did not show added predictive value. The project documents these negative and uncertain results instead of turning them into a scouting score.

## Limits

- Only three draft cohorts, and 2025 was used in feature screening, so there is no untouched confirmation set.
- Rookie tracking exposure depends on playing time, role, health and assignment.
- Movement onset is a speed threshold, not a reaction time: the data have no start-signal timestamp.
- The competition data and player-level outputs are not redistributed (Kaggle competition rules).

**Stack:** Python · pandas · scikit-learn · NumPy · Jupyter · Kaggle

[Code and README on GitHub](https://github.com/yandouziyassine/nfl-combine-speed-profiles)
