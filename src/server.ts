import 'dotenv/config';
import { WebSocketServer } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { AgentService } from './services/agentService';
import { GeminiService } from './services/geminiService';
import { WebSocketController } from './controllers/websocketController';
import { config } from './config/config';

// Initialize services
const agentService = new AgentService();
const geminiService = new GeminiService(config.gemini.apiKey);

// Initialize controller
const websocketController = new WebSocketController(agentService, geminiService);

// Create WebSocket server
const wss = new WebSocketServer({ port: config.server.port });

console.log(`WebSocket server started on port ${config.server.port}`);

// Ensure recordings directory exists
const recordingsDir = path.join(__dirname, "..", config.recordings.directory);
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir);
}

// Handle WebSocket connections
wss.on('connection', async (ws, request) => {
  await websocketController.handleConnection(ws, request);
});

