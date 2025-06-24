import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, Session } from '@google/genai';
import { systemInstructionText } from './systemprompt';
import * as fs from 'fs';
import * as path from 'path';
import { Writer, Reader } from 'wav';
import { SpeechDetector } from "speech-detector";
import { ReadableStream, ReadableStreamDefaultController } from 'stream/web';


const PORT = 3001;
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server started on port ${PORT}`);

const recordingsDir = path.join(__dirname, "..", "recordings");
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir);
}


wss.on('connection', async (ws) => {
  console.log('Client connected');

  let session: Session | undefined;
  const audioChunks: Buffer[] = [];

  let audioStreamController: ReadableStreamDefaultController<Float32Array>;
  const audioStream = new ReadableStream<Float32Array>({
    start(controller) {
      audioStreamController = controller;
    }
  });

  (async () => {
    try {
      const speechDetector = await SpeechDetector.create(1536, 0.1);
      const speechSegments = await speechDetector.process(audioStream);

      for await (const segment of speechSegments) {

        console.log(`Received speech segment:`, segment);
        // TODO: Do something with the speech segment, e.g., send to Gemini
        const int16Array = new Int16Array(segment.length);
        for (let i = 0; i < segment.length; i++) {
          const s = Math.max(-1, Math.min(1, segment[i]));
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        const pcmData = Buffer.from(int16Array.buffer);

        if (process.env.MOCK_GEMINI === 'true') {
          const mockAudioPath = path.join(__dirname, '..', 'mock_recording', 'mock_playback.wav');
          const fileStream = fs.createReadStream(mockAudioPath);
          const reader = new Reader();

          const pcmChunks: Buffer[] = [];
          reader.on('data', (chunk) => {
            pcmChunks.push(chunk);
          });

          reader.on('end', () => {
            const pcmData = Buffer.concat(pcmChunks);
            const sampleRate = 16000;
            const chunkSize = 160; // bytes
            const chunkDurationMs = 1;
            let offset = 0;

            function sendChunk() {
              if (offset >= pcmData.length) {
                return;
              }
              const chunk = pcmData.subarray(offset, offset + chunkSize);
              const message = {
                serverContent: {
                  modelTurn: {
                    parts: [
                      {
                        inlineData: {
                          data: chunk.toString('base64'),
                          mimeType: `audio/pcm;rate=${sampleRate}`
                        }
                      }
                    ]
                  }
                }
              };
              ws.send(JSON.stringify({ type: 'gemini', data: message }));
              offset += chunkSize;
              
              setTimeout(sendChunk, chunkDurationMs);
            }
            sendChunk();
          });

          fileStream.pipe(reader);

        } else if (session) {
          const media = {
            data: pcmData.toString('base64'),
            mimeType: 'audio/pcm;rate=16000',
          };
          session.sendRealtimeInput({ media });
        }
      }
    } catch (e) {
      console.error('Error in speech detection processing:', e);
    }
  })();

  if (process.env.MOCK_GEMINI === 'true') {
    console.log('Using mocked Gemini response.');
    ws.send(JSON.stringify({ type: 'status', data: 'Gemini session opened (mocked)' }));
  } else {
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
            try {
              const json = JSON.stringify(message);
              console.log(json);
            } catch (e) {
              console.error('Error parsing Gemini message:', e);
            }
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
  }


  ws.on('message', async (message) => {
    // The message from the client is a Buffer of Int16 PCM data.
    // We need to Base64 encode it and send it in the format Gemini expects.
    // console.log(`Received message from client: ${new Date().toISOString()}`);
    if (message instanceof Buffer) {
      audioChunks.push(message);

      const int16Array = new Int16Array(message.buffer, message.byteOffset, message.byteLength / 2);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32767.0;
      }
      if (audioStreamController) {
        audioStreamController.enqueue(float32Array);
      }

    } else {
      try {
        const parsed = JSON.parse(message.toString());
        console.log('Received control message from client: ' + new Date().toISOString());
        // You could handle control messages here, e.g., to start/stop
      } catch (e) {
        // Not a JSON message, likely audio
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (audioStreamController) {
      audioStreamController.close();
    }
    if (session) {
      session.close();
    }

    if (audioChunks.length > 0) {
      const pcmData = Buffer.concat(audioChunks);
      const fileName = `recording-${new Date().toISOString()}.wav`;
      const filePath = path.join(recordingsDir, fileName);

      const writer = new Writer({
        channels: 1,
        sampleRate: 16000,
        bitDepth: 16,
      });

      const fileStream = fs.createWriteStream(filePath);
      writer.pipe(fileStream);
      writer.end(pcmData);

      console.log(`Saved audio to ${filePath}`);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    if (session) {
      session.close();
    }
  });
});

