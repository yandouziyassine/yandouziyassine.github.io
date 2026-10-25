---
title: Slipstream
kind: software
area: Systems
order: 201
metric:
  value: '1'
  unit: writer thread · zero locks on the hot path
summary: >-
  Slices large orders over time (TWAP, VWAP, POV, Almgren-Chriss), routes each slice across Kraken and Coinbase by
  all-in price, and checks every fill against hard risk limits in C++. Deterministic clock for exact replays. Paper
  trading only.
stack:
  - C++20
  - gRPC
  - Protocol Buffers
  - Python
  - GoogleTest
  - ASan/UBSan
cover: /images/slipstream-cover.svg
links:
  code: https://github.com/yandouziyassine/slipstream
---

*Smart order execution engine · C++20 + Python over gRPC*

Slices large orders over time (TWAP, VWAP, POV, Almgren-Chriss), routes each slice across Kraken and Coinbase by all-in price, and checks every fill against hard risk limits in C++. Deterministic clock for exact replays. Paper trading only.

**Stack:** C++20 · gRPC · Protocol Buffers · Python · GoogleTest · ASan/UBSan

[Code and README on GitHub](https://github.com/yandouziyassine/slipstream)
