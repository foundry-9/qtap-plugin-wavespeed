import { Client } from 'wavespeed';
import type {
  ImageGenParams,
  ImageGenProvider,
  ImageGenResponse,
} from './types';

const API_BASE_URL = 'https://api.wavespeed.ai';
const DEFAULT_MODEL = 'wavespeed-ai/z-image/turbo';
const DEFAULT_SIZE = '1024*1024';

const FALLBACK_MODELS = [
  'wavespeed-ai/z-image/turbo',
  'wavespeed-ai/z-image/base',
] as const;

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const availableModelsCache = new Map<
  string,
  { expiresAt: number; models: string[] }
>();

const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  '1:1': '1024*1024',
  '16:9': '1536*864',
  '9:16': '864*1536',
  '4:3': '1536*1152',
  '3:4': '1152*1536',
  '3:2': '1536*1024',
  '2:3': '1024*1536',
};

type GeneratedImage = ImageGenResponse['images'][number];

interface WaveSpeedModelSchema {
  type?: string;
  method?: string;
  api_path?: string;
  request_schema?: {
    properties?: Record<string, unknown>;
  };
}

interface WaveSpeedModelRecord {
  model_id: string;
  name?: string;
  description?: string;
  type?: string;
  api_schema?: {
    api_schemas?: WaveSpeedModelSchema[];
  };
}

interface WaveSpeedListModelsResponse {
  data?: WaveSpeedModelRecord[];
}

export class WaveSpeedImageProvider implements ImageGenProvider {
  readonly provider = 'WAVESPEED';
  readonly supportedModels = [...FALLBACK_MODELS];

  async generateImage(
    params: ImageGenParams,
    apiKey: string
  ): Promise<ImageGenResponse> {
    if (!apiKey?.trim()) {
      throw new Error('WaveSpeed API key is required');
    }

    if (!params.prompt?.trim()) {
      throw new Error('A prompt is required to generate an image');
    }

    const model = this.normalizeModel(params.model);
    const client = new Client(apiKey.trim());
    const size = normalizeSize(params.size, params.aspectRatio);

    const request: Record<string, unknown> = {
      prompt: params.prompt.trim(),
      size,
      seed: typeof params.seed === 'number' ? params.seed : -1,
      output_format: 'png',
      enable_base64_output: true,
    };

    if (params.negativePrompt?.trim()) {
      request.negative_prompt = params.negativePrompt.trim();
    }

    const result = await client.run(model, request, {
      timeout: 180,
      pollInterval: 1,
      maxRetries: 1,
    });

    const outputs = Array.isArray(result.outputs) ? result.outputs : [];
    if (outputs.length === 0) {
      throw new Error('WaveSpeed returned no image output');
    }

    const images = await Promise.all(
      outputs.map((output) => this.toGeneratedImage(output, params.prompt))
    );

    return {
      images,
      raw: {
        model,
        size,
        ...result,
      },
    };
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    if (!apiKey?.trim()) {
      return false;
    }

    try {
      await fetchAvailableModelsFromApi(apiKey.trim());
      return true;
    } catch {
      return false;
    }
  }

  async getAvailableModels(apiKey?: string): Promise<string[]> {
    if (!apiKey?.trim()) {
      return [...this.supportedModels];
    }

    try {
      return await fetchAvailableModelsFromApi(apiKey.trim());
    } catch {
      return [...this.supportedModels];
    }
  }

  private normalizeModel(model?: string): string {
    const trimmed = model?.trim();
    return trimmed || DEFAULT_MODEL;
  }

  private async toGeneratedImage(
    output: unknown,
    fallbackPrompt: string
  ): Promise<GeneratedImage> {
    if (typeof output === 'string') {
      return this.fromStringOutput(output, fallbackPrompt);
    }

    if (output && typeof output === 'object') {
      const record = output as Record<string, unknown>;
      const candidate = record.url ?? record.data ?? record.b64_json;
      const revisedPrompt =
        typeof record.revisedPrompt === 'string'
          ? record.revisedPrompt
          : fallbackPrompt;

      if (typeof candidate === 'string') {
        return this.fromStringOutput(candidate, revisedPrompt);
      }
    }

    throw new Error('WaveSpeed returned an unsupported image format');
  }

  private async fromStringOutput(
    value: string,
    revisedPrompt: string
  ): Promise<GeneratedImage> {
    const trimmed = value.trim();

    if (!trimmed) {
      throw new Error('WaveSpeed returned an empty image payload');
    }

    if (trimmed.startsWith('data:')) {
      const [header, data] = trimmed.split(',', 2);
      const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? 'image/png';

      return {
        data,
        mimeType,
        revisedPrompt,
      };
    }

    if (this.looksLikeUrl(trimmed)) {
      const response = await fetch(trimmed);
      if (!response.ok) {
        throw new Error(`Failed to download generated image: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return {
        data: Buffer.from(arrayBuffer).toString('base64'),
        mimeType:
          response.headers.get('content-type')?.split(';')[0] ??
          guessMimeTypeFromUrl(trimmed),
        revisedPrompt,
        url: trimmed,
      };
    }

    if (this.looksLikeBase64(trimmed)) {
      return {
        data: trimmed,
        mimeType: 'image/png',
        revisedPrompt,
      };
    }

    throw new Error('WaveSpeed returned an unrecognized image payload');
  }

  private looksLikeUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private looksLikeBase64(value: string): boolean {
    return value.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(value);
  }
}

async function fetchAvailableModelsFromApi(apiKey: string): Promise<string[]> {
  const cached = availableModelsCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.models;
  }

  const response = await fetch(`${API_BASE_URL}/api/v3/models`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('WaveSpeed API key is invalid or unauthorized');
  }

  if (!response.ok) {
    throw new Error(`Failed to list WaveSpeed models: ${response.status}`);
  }

  const payload = (await response.json()) as WaveSpeedListModelsResponse;
  const dynamicModels = [...new Set(
    (payload.data ?? [])
      .filter(isTextToImageModel)
      .map((model) => model.model_id)
      .filter((modelId): modelId is string => Boolean(modelId))
  )].sort((a, b) => a.localeCompare(b));

  const models = dynamicModels.length > 0 ? dynamicModels : [...FALLBACK_MODELS];
  availableModelsCache.set(apiKey, {
    expiresAt: Date.now() + MODEL_CACHE_TTL_MS,
    models,
  });

  return models;
}

function isTextToImageModel(model: WaveSpeedModelRecord): boolean {
  const type = model.type?.toLowerCase();
  if (type === 'text-to-image') {
    return true;
  }

  if (type) {
    return false;
  }

  const apiSchemas = model.api_schema?.api_schemas ?? [];
  return apiSchemas.some((schema) => {
    const properties = schema.request_schema?.properties;
    const apiPath = (schema.api_path ?? '').toLowerCase();

    return (
      schema.type === 'model_run' &&
      schema.method === 'POST' &&
      Boolean(properties?.prompt) &&
      apiPath.includes('image') &&
      !apiPath.includes('video')
    );
  });
}

function normalizeSize(size?: string, aspectRatio?: string): string {
  if (size?.trim()) {
    const normalized = size.trim().replace(/\s+/g, '').replace(/x/gi, '*');
    if (/^\d+\*\d+$/.test(normalized)) {
      return normalized;
    }
  }

  if (aspectRatio && ASPECT_RATIO_TO_SIZE[aspectRatio]) {
    return ASPECT_RATIO_TO_SIZE[aspectRatio];
  }

  return DEFAULT_SIZE;
}

function guessMimeTypeFromUrl(url: string): string {
  if (/\.jpe?g($|\?)/i.test(url)) {
    return 'image/jpeg';
  }

  if (/\.webp($|\?)/i.test(url)) {
    return 'image/webp';
  }

  return 'image/png';
}
