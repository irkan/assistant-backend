import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { Reader } from 'wav';
import { SpeechDetector } from "speech-detector";
import { ReadableStream, ReadableStreamDefaultController } from 'stream/web';

const PORT = 3001;

const mockRecordingsDir = path.join(__dirname, '..', 'mock_recording');
const commonVoiceFiles = fs.readdirSync(mockRecordingsDir)
  .filter(file => file.startsWith('common_voice_az_') && file.endsWith('.wav'))
  .map(file => path.join(mockRecordingsDir, file));

if (commonVoiceFiles.length === 0) {
  console.warn('Warning: No common_voice_az_*.wav files found in mock_recording directory. Random playback will not work.');
}

const wss = new WebSocketServer({ port: PORT });

console.log(`Mock WebSocket server started on port ${PORT}`);

// Threshold for detecting user speech for interruption. This may need tuning.
const VAD_THRESHOLD = 0.2; // Lowered from 0.2 for more sensitivity

wss.on('connection', async (ws) => {
  console.log('Client connected to mock server');

  let audioStreamController: ReadableStreamDefaultController<Float32Array>;
  const audioStream = new ReadableStream<Float32Array>({
    start(controller) {
      audioStreamController = controller;
    }
  });

  let playbackInterval: NodeJS.Timeout | null = null;
  
  const stopPlayback = () => {
    if (playbackInterval) {
      clearInterval(playbackInterval);
      playbackInterval = null;
      console.log('Playback stopped.');
    }
  };

  const startPlayback = () => {
    stopPlayback(); // Ensure any previous playback is stopped
    
    if (commonVoiceFiles.length === 0) {
      console.error("Cannot start playback: No common_voice_az_*.wav files found.");
      return;
    }

    console.log('Starting playback...');

    const mockAudioPath = commonVoiceFiles[Math.floor(Math.random() * commonVoiceFiles.length)];
    console.log(`Playing random file: ${path.basename(mockAudioPath)}`);
    const fileBuffer = fs.readFileSync(mockAudioPath);
    const reader = new Reader();

    reader.on('format', (format) => {
      console.log('Playback audio format from file:', format);
      const { sampleRate, bitDepth } = format;
      const bytesPerSample = bitDepth / 8;
      
      const chunkSize = Math.floor(sampleRate * bytesPerSample * 0.04); // 40ms chunks
      let offset = 44; // Start after WAV header

      playbackInterval = setInterval(() => {
        if (offset >= fileBuffer.length) {
          stopPlayback();
          return;
        }
        
        const chunkEnd = Math.min(offset + chunkSize, fileBuffer.length);
        const chunk = fileBuffer.subarray(offset, chunkEnd);
        offset = chunkEnd;

        const message = {
          serverContent: {
            modelTurn: {
              parts: [{ inlineData: { data: chunk.toString('base64'), mimeType: `audio/pcm;rate=${sampleRate}` } }]
            }
          }
        };
        ws.send(JSON.stringify({ type: 'gemini', data: message }));
      }, 10);
    });
    
    reader.write(fileBuffer);
  };
  
  (async () => {
    try {
      const speechDetector = await SpeechDetector.create(undefined, 0.3, 0.1, 5, 2);
      const speechSegments = await speechDetector.process(audioStream);

      for await (const segment of speechSegments) {
        console.log(`User speech segment detected, length: ${segment.length}. Starting mock response.`);
        setTimeout(startPlayback, 100);
      }
    } catch (e: any) {
      if (!e.message.includes('closed')) {
        console.error('Error in speech segment processing:', e);
      }
    }
  })();

  ws.on('message', async (message) => {
    if (message instanceof Buffer) {
      const int16Array = new Int16Array(message.buffer, message.byteOffset, message.byteLength / 2);
      const float32Array = new Float32Array(int16Array.length);
      
      let sumOfSquares = 0.0;
      for (let i = 0; i < int16Array.length; i++) {
        const sample = int16Array[i] / 32768.0;
        float32Array[i] = sample;
        sumOfSquares += sample * sample;
      }
      
      const rms = Math.sqrt(sumOfSquares / int16Array.length);
      if (rms > VAD_THRESHOLD && playbackInterval) {
        console.log(`Interruption detected! RMS: ${rms.toFixed(2)}`);
        stopPlayback();
        ws.send(JSON.stringify({ type: 'gemini', data: { serverContent: { interrupted: true } } }));
      }

      if (audioStreamController && audioStreamController.desiredSize != null && audioStreamController.desiredSize > 0) {
        audioStreamController.enqueue(float32Array);
      }
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    stopPlayback();
    if (audioStreamController) audioStreamController.close();
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    stopPlayback();
    if (audioStreamController) audioStreamController.close();
  });
}); 