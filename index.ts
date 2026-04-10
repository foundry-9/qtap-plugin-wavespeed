import type { ImageGenerationModelInfo, LLMProviderPlugin } from './types';
import { WaveSpeedImageProvider } from './image-provider';

const SUPPORTED_SIZES = [
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '1536x864',
  '864x1536',
];

const SUPPORTED_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '3:2', '2:3'];

const metadata = {
  providerName: 'WAVESPEED',
  displayName: 'WaveSpeed',
  description:
    'Fast text-to-image generation with WaveSpeedAI Z Image models',
  colors: {
    bg: 'bg-cyan-100',
    text: 'text-cyan-900',
    icon: 'text-cyan-600',
  },
  abbreviation: 'WS',
} as const;

const config = {
  requiresApiKey: true,
  requiresBaseUrl: false,
  apiKeyLabel: 'WaveSpeed API Key',
} as const;

const capabilities = {
  chat: false,
  imageGeneration: true,
  embeddings: false,
  webSearch: false,
} as const;

const attachmentSupport = {
  supportsAttachments: false,
  supportedMimeTypes: [] as string[],
  description: 'No file attachments supported',
};

const imageModels: ImageGenerationModelInfo[] = [
  {
    id: 'wavespeed-ai/z-image/turbo',
    name: 'Z Image Turbo',
    supportedSizes: SUPPORTED_SIZES,
    supportedAspectRatios: SUPPORTED_ASPECT_RATIOS,
    description: 'Fastest WaveSpeed text-to-image model for interactive use.',
  },
  {
    id: 'wavespeed-ai/z-image/base',
    name: 'Z Image Base',
    supportedSizes: SUPPORTED_SIZES,
    supportedAspectRatios: SUPPORTED_ASPECT_RATIOS,
    description:
      'Higher-control model with negative prompt support and flexible sizing.',
  },
];

export const plugin: LLMProviderPlugin = {
  metadata,
  config,
  capabilities,
  attachmentSupport,

  createProvider: () => {
    throw new Error('WaveSpeed only supports image generation');
  },

  createImageProvider: () => new WaveSpeedImageProvider(),

  getAvailableModels: async (apiKey: string) => {
    const provider = new WaveSpeedImageProvider();
    return provider.getAvailableModels(apiKey);
  },

  validateApiKey: async (apiKey: string) => {
    const provider = new WaveSpeedImageProvider();
    return provider.validateApiKey(apiKey);
  },

  getImageGenerationModels: () => imageModels,

  getImageProviderConstraints: () => ({
    maxPromptBytes: 4000,
    promptConstraintWarning:
      'Short, concrete prompts tend to work best for WaveSpeed image generation.',
    maxImagesPerRequest: 1,
    supportedSizes: SUPPORTED_SIZES,
    supportedAspectRatios: SUPPORTED_ASPECT_RATIOS,
    promptingGuidance: `# WaveSpeed Image Prompting Guide

## Recommended structure
Subject + setting + style + lighting + camera/composition details

Example: "A red fox standing in a neon-lit Tokyo alley, cinematic photography, rainy night, shallow depth of field"

## Best practices
- Put the main subject first
- Add concrete style and lighting details
- Use the Turbo model for fast iterations
- Use the Base model when you want more control or a negative prompt
- Keep prompts concise and specific`,
  }),

  icon: {
    svg: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wavespeed-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#06b6d4" />
          <stop offset="100%" stop-color="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="12" fill="url(#wavespeed-gradient)" />
      <path d="M4 15.5C6.2 12.5 7.8 12.5 10 15.5C12.2 18.5 13.8 18.5 16 15.5C17.2 13.9 18.1 13.2 20 13" stroke="white" stroke-width="2" stroke-linecap="round" />
      <path d="M4 10.5C6.2 7.5 7.8 7.5 10 10.5C12.2 13.5 13.8 13.5 16 10.5C17.2 8.9 18.1 8.2 20 8" stroke="white" stroke-width="2" stroke-linecap="round" opacity="0.9" />
    </svg>`,
  },
};

export default plugin;
