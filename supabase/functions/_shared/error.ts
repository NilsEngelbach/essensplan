// Supported AI providers, controlled by the AI_PROVIDER env var.
export type AIProvider = 'openai' | 'opencode'

// Error types and codes
export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  MISSING_AUTH_HEADER = 'MISSING_AUTH_HEADER',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  OPENAI_NOT_CONFIGURED = 'OPENAI_NOT_CONFIGURED',
  OPENAI_REQUEST_FAILED = 'OPENAI_REQUEST_FAILED',
  AI_PROVIDER_NOT_CONFIGURED = 'AI_PROVIDER_NOT_CONFIGURED',
  AI_REQUEST_FAILED = 'AI_REQUEST_FAILED',
  AI_PROVIDER_NOT_SUPPORTED = 'AI_PROVIDER_NOT_SUPPORTED',
  FEATURE_DISABLED = 'FEATURE_DISABLED',
  URL_FETCH_FAILED = 'URL_FETCH_FAILED',
  IMAGE_FETCH_FAILED = 'IMAGE_FETCH_FAILED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// Error factory functions
export const createAppError = {
  unauthorized: (message = 'Unauthorized access'): AppError => 
    new AppError(ErrorCode.UNAUTHORIZED, message, 401),
    
  missingAuthHeader: (): AppError => 
    new AppError(ErrorCode.MISSING_AUTH_HEADER, 'Authorization header is required', 401),
    
  invalidRequest: (message: string): AppError => 
    new AppError(ErrorCode.INVALID_REQUEST, message, 400),
    
  missingRequiredField: (fieldName: string): AppError => 
    new AppError(ErrorCode.MISSING_REQUIRED_FIELD, `${fieldName} is required`, 400),
    
  openAINotConfigured: (): AppError =>
    new AppError(ErrorCode.OPENAI_NOT_CONFIGURED, 'OpenAI API key not configured', 500),

  openAIRequestFailed: (details?: string): AppError =>
    new AppError(ErrorCode.OPENAI_REQUEST_FAILED, 'OpenAI request failed', 500, details),

  aiProviderNotConfigured: (provider: AIProvider): AppError =>
    new AppError(ErrorCode.AI_PROVIDER_NOT_CONFIGURED, `AI provider "${provider}" is not configured`, 500),

  aiRequestFailed: (details?: string): AppError =>
    new AppError(ErrorCode.AI_REQUEST_FAILED, 'AI request failed', 500, details),

  aiProviderNotSupported: (feature: string, provider: AIProvider): AppError =>
    new AppError(ErrorCode.AI_PROVIDER_NOT_SUPPORTED, `Feature "${feature}" is not supported by AI provider "${provider}"`, 501),

  featureDisabled: (feature: string): AppError =>
    new AppError(ErrorCode.FEATURE_DISABLED, `Feature "${feature}" is currently disabled`, 501),

  urlFetchFailed: (details?: string): AppError =>
    new AppError(ErrorCode.URL_FETCH_FAILED, 'Failed to fetch URL content', 502, details),

  imageFetchFailed: (details?: string): AppError =>
    new AppError(ErrorCode.IMAGE_FETCH_FAILED, 'Failed to fetch image', 500, details),

  internalServerError: (message = 'Internal server error', details?: string): AppError =>
    new AppError(ErrorCode.INTERNAL_SERVER_ERROR, message, 500, details)
}