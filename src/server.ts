import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, Session } from '@google/genai';
import { systemInstructionText } from './systemprompt';

const PORT = 3001;
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server started on port ${PORT}`);

wss.on('connection', async (ws) => {
  console.log('Client connected');

  let session: Session;

  try {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';
    session = await client.live.connect({
      model: model,
      config: {
        systemInstruction: systemInstructionText,
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } },
        },
      },
      callbacks: {
        onopen: () => {
          console.log('Gemini session opened: ' + new Date().toISOString());
          ws.send(JSON.stringify({ type: 'status', data: 'Gemini session opened' }));
        },
        onmessage: (message) => {
          // Forward message to client
          console.log('Gemini message: ' + new Date().toISOString());
          ws.send(JSON.stringify({ type: 'gemini', data: message }));
        },
        onerror: (e) => {
          console.error('Gemini error:', e.message, new Date().toISOString());
          ws.send(JSON.stringify({ type: 'error', data: e.message }));
        },
        onclose: (e) => {
          console.log('Gemini session closed', e.reason, new Date().toISOString());
          ws.send(JSON.stringify({ type: 'status', data: `Gemini session closed: ${e.reason}` }));
        },
      },
    });

  } catch (e) {
    console.error('Failed to connect to Gemini:', e);
    ws.close(1011, 'Failed to establish Gemini session.');
    return;
  }


  ws.on('message', async (message) => {
    // The message from the client is a Buffer of Int16 PCM data.
    // We need to Base64 encode it and send it in the format Gemini expects.
    console.log(`Received message from client: ${new Date().toISOString()}`);
    if (session && message instanceof Buffer) {
      const media = {
        data: message.toString('base64'),
        mimeType: 'audio/pcm;rate=16000',
      };
      session.sendRealtimeInput({ media });
    } else {
      try {
        const parsed = JSON.parse(message.toString());
        // You could handle control messages here, e.g., to start/stop
      } catch (e) {
        // Not a JSON message, likely audio
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (session) {
      session.close();
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    if (session) {
      session.close();
    }
  });
});

