// Validate required environment variables
function validateConfig() {
  const requiredEnvVars = ['GEMINI_API_KEY'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  // Validate numeric values
  const port = parseInt(process.env.SERVER_PORT || '3001', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('SERVER_PORT must be a valid port number (1-65535)');
  }

  const temperature = parseFloat(process.env.GEMINI_TEMPERATURE || '1');
  if (isNaN(temperature) || temperature < 0 || temperature > 2) {
    throw new Error('GEMINI_TEMPERATURE must be a number between 0 and 2');
  }
}

// Validate on module load
validateConfig();

export const config = {
  server: {
    port: parseInt(process.env.SERVER_PORT || '3001', 10),
  },
  api: {
    baseUrl: process.env.ADMINPANEL_BACKEND_BASE_URL || 'http://localhost:3000',
  },
  gemini: {
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-preview-native-audio-dialog',
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '1'),
    triggerTokens: process.env.GEMINI_TRIGGER_TOKENS || '25600',
    targetTokens: process.env.GEMINI_TARGET_TOKENS || '12800',
    voiceName: process.env.GEMINI_VOICE_NAME || 'Orus',
    apiKey: process.env.GEMINI_API_KEY || '',
  },
  recordings: {
    directory: process.env.RECORDINGS_DIRECTORY || 'recordings',
  },
} as const; 