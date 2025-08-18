// Error types and codes
export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  MISSING_AUTH_HEADER = 'MISSING_AUTH_HEADER',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  OPENAI_NOT_CONFIGURED = 'OPENAI_NOT_CONFIGURED',
  OPENAI_REQUEST_FAILED = 'OPENAI_REQUEST_FAILED',
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
    
  imageFetchFailed: (details?: string): AppError => 
    new AppError(ErrorCode.IMAGE_FETCH_FAILED, 'Failed to fetch image', 500, details),
    
  internalServerError: (message = 'Internal server error', details?: string): AppError => 
    new AppError(ErrorCode.INTERNAL_SERVER_ERROR, message, 500, details)
}