#!/usr/bin/env npx tsx
/**
 * Quick test script for the WaveSpeed plugin.
 *
 * Usage:
 *   WAVESPEED_API_KEY=ws-... npx tsx test-wavespeed.ts [--model <model-id>] [prompt]
 *
 * If no prompt is supplied a default one is used.
 * If no model is specified the first available model is used.
 * Generated images are saved to the current directory as test-output-*.png.
 */

import { writeFileSync } from 'fs';
import { WaveSpeedImageProvider } from './image-provider';
import { plugin } from './index';

const apiKey = process.env.WAVESPEED_API_KEY;
if (!apiKey) {
  console.error('Error: set WAVESPEED_API_KEY in the environment.');
  process.exit(1);
}

let selectedModel: string | undefined;
const args = process.argv.slice(2);
const modelFlagIndex = args.indexOf('--model');
if (modelFlagIndex !== -1) {
  selectedModel = args[modelFlagIndex + 1];
  if (!selectedModel) {
    console.error('Error: --model requires a model ID.');
    process.exit(1);
  }
  args.splice(modelFlagIndex, 2);
}

const prompt =
  args.join(' ') ||
  'A red fox standing in a neon-lit Tokyo alley, cinematic photography, rainy night, shallow depth of field';

async function main() {
  const provider = new WaveSpeedImageProvider();

  // --- 1. Validate the API key ------------------------------------------------
  console.log('Validating API key...');
  const valid = await provider.validateApiKey(apiKey);
  if (!valid) {
    console.error('API key validation failed.');
    process.exit(1);
  }
  console.log('API key is valid.\n');

  // --- 2. List built-in models ------------------------------------------------
  console.log('Built-in image models:');
  for (const m of plugin.getImageGenerationModels!()) {
    console.log(`  ${m.id}  —  ${m.name} (${m.description})`);
  }

  // --- 3. List models from the API --------------------------------------------
  console.log('\nModels from the API:');
  const models = await provider.getAvailableModels(apiKey);
  for (const id of models) {
    console.log(`  ${id}`);
  }

  // --- 4. Generate a test image -----------------------------------------------
  const model = selectedModel ?? models[0] ?? 'wavespeed-ai/z-image/turbo';
  if (selectedModel && !models.includes(selectedModel)) {
    console.warn(`\nWarning: "${selectedModel}" not found in available models. Trying anyway...`);
  }
  console.log(`\nGenerating image with model "${model}"...`);
  console.log(`Prompt: "${prompt}"\n`);

  const response = await provider.generateImage(
    { prompt, model, size: '1024x1024' },
    apiKey,
  );

  for (const [i, image] of response.images.entries()) {
    const filename = `test-output-${i}.png`;
    const buf = Buffer.from(image.data, 'base64');
    writeFileSync(filename, buf);
    console.log(`Saved ${filename} (${(buf.length / 1024).toFixed(1)} KB)`);
    if (image.revisedPrompt) {
      console.log(`  Revised prompt: ${image.revisedPrompt}`);
    }
    if ((image as any).url) {
      console.log(`  Remote URL: ${(image as any).url}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
