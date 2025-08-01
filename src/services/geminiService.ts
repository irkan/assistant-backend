import { GoogleGenAI, MediaResolution, Modality, Session } from '@google/genai';
import { AgentDetails } from '../types/agent';
import { config } from '../config/config';

export interface GeminiCallbacks {
  onopen?: () => void;
  onmessage?: (message: any) => void;
  onerror?: (error: any) => void;
  onclose?: (event: any) => void;
}

export class GeminiService {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async createSession(
    systemPrompt: string,
    callbacks: GeminiCallbacks
  ): Promise<Session> {
    return await this.client.live.connect({
      model: config.gemini.model,
      config: {
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        temperature: config.gemini.temperature,
        contextWindowCompression: {
          triggerTokens: config.gemini.triggerTokens,
          slidingWindow: {
            targetTokens: config.gemini.targetTokens
          }
        },
        systemInstruction: systemPrompt,
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: config.gemini.voiceName } }
        },
      },
      callbacks: {
        onopen: () => {
          console.log('Gemini session opened: ' + new Date().toISOString());
          callbacks.onopen?.();
        },
        onmessage: (message) => {
          try {
            if (message.serverContent?.interrupted) {
              console.log('[INTERRUPTED]Gemini interrupted: ' + new Date().toISOString());
            }
            if (message.serverContent?.modelTurn?.parts?.length) {
              console.log('Gemini message chunk received: ' + message.serverContent?.modelTurn?.parts?.length);
            }
            if (!message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
              console.log('Gemini message: ' + JSON.stringify(message));
            }
          } catch (e) {
            console.error('Error parsing Gemini message:', e);
          }

          callbacks.onmessage?.(message);
        },
        onerror: (e) => {
          console.error('Gemini error:', e.message, new Date().toISOString());
          callbacks.onerror?.(e);
        },
        onclose: (e) => {
          console.log('Gemini session closed', e.reason, new Date().toISOString());
          callbacks.onclose?.(e);
        },
      },
    });
  }

  sendAudioInput(session: Session, audioBuffer: Buffer): void {
    const media = {
      data: audioBuffer.toString('base64'),
      mimeType: 'audio/pcm;rate=16000',
    };
    session?.sendRealtimeInput({ media });
  }

  sendTextInput(session: Session, text: string): void {
    session?.sendRealtimeInput({ text });
  }

  closeSession(session: Session): void {
    session.close();
  }
} 