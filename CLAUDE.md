# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quilltap image provider plugin that wraps the WaveSpeed AI API for text-to-image generation. Implements the `LLMProviderPlugin` interface from `@quilltap/plugin-types` and acts as an adapter between Quilltap's image generation interface and WaveSpeed's API.

## Build Commands

- **Build:** `npm run build` — bundles TypeScript via esbuild into `dist/index.js` (CommonJS, Node.js platform)
- **Clean:** `npm run clean` — removes `dist/`
- **No test infrastructure** — no test runner or test files exist yet

## Architecture

Three source files, each with a clear role:

- **`index.ts`** — Plugin entry point. Exports the `plugin` object (`LLMProviderPlugin`) with metadata, supported models/sizes/aspect ratios, prompting guidance, and factory methods (`createImageProvider`, `validateApiKey`, `getAvailableModels`).
- **`image-provider.ts`** — `WaveSpeedImageProvider` class implementing `ImageGenProvider`. Handles API communication via the `wavespeed` SDK Client, parameter normalization, polling for results (180s timeout, 1s interval), response parsing (base64/data URL/remote URL), and model caching (5-min TTL).
- **`types.ts`** — Re-exports types from `@quilttap/plugin-types` and `@quilttap/plugin-utils`.

## Key Details

- Peer dependencies `@quilltap/plugin-types` and `@quilltap/plugin-utils` (^2.2.0) define the plugin contract; they are also installed as devDependencies for local development.
- The `wavespeed` npm package (^0.2.3) is the only runtime dependency.
- Published as `@quilltap/qtap-plugin-wavespeed` — only `dist/` and `manifest.json` are included in the package.
- `manifest.json` declares plugin capabilities, compatibility constraints (Quilltap >=1.7.0, Node >=18), and network permissions (`api.wavespeed.ai`).
- No tsconfig.json — TypeScript compilation is handled entirely by esbuild CLI flags in the build script.
