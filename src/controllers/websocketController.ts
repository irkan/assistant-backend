import { WebSocket } from 'ws';
import { Session } from '@google/genai';
import { AgentService } from '../services/agentService';
import { GeminiService } from '../services/geminiService';
import { AgentDetails } from '../types/agent';
import { config } from '../config/config';

export class WebSocketController {
  private agentService: AgentService;
  private geminiService: GeminiService;

  constructor(agentService: AgentService, geminiService: GeminiService) {
    this.agentService = agentService;
    this.geminiService = geminiService;
  }

  async handleConnection(ws: WebSocket, request: any): Promise<void> {
    console.log('Client connected');

    const agentId = this.extractAgentId(request);
    if (!agentId) {
      console.error('No agent ID provided');
      ws.close(1008, 'Agent ID is required');
      return;
    }

    console.log(`Agent ID received: ${agentId}`);

    let session: Session | undefined;
    let greetingSent = false;
    let agentDetails: AgentDetails;

    try {
      agentDetails = await this.agentService.fetchAgentDetails(agentId);
      console.log(`Agent details fetched: ${agentDetails.name}`);
    } catch (error) {
      console.error('Failed to fetch agent details:', error);
      ws.close(1011, 'Failed to fetch agent details');
      return;
    }

    try {
      session = await this.createGeminiSession(ws, agentDetails, greetingSent);
    } catch (error) {
      console.error('Failed to connect to Gemini:', error);
      ws.close(1011, 'Failed to establish Gemini session.');
      return;
    }

    this.setupWebSocketEventHandlers(ws, session);
  }

  private extractAgentId(request: any): string | null {
    const url = new URL(request.url || '', `http://localhost:${config.server.port}`);
    return url.searchParams.get('agentId');
  }

  private async createGeminiSession(
    ws: WebSocket,
    agentDetails: AgentDetails,
    greetingSent: boolean
  ): Promise<Session> {
    console.log("Creating Gemini session", agentDetails.details);
    const session = await this.geminiService.createSession(
      agentDetails.details.systemPrompt,
      {
        onopen: () => {
          ws.send(JSON.stringify({ type: 'status', data: 'Gemini session opened' }));
        },
        onmessage: (message) => {
          ws.send(JSON.stringify({ type: 'gemini', data: message }));
        },
        onerror: (e) => {
          ws.send(JSON.stringify({ type: 'error', data: e.message }));
        },
        onclose: (e) => {
          ws.send(JSON.stringify({ type: 'status', data: `Gemini session closed: ${e.reason}` }));
        },
      }
    );

    // Send first message after session is created
    if (agentDetails.details.interactionMode === 'agent_speak_first' && !greetingSent) {
      console.log('Sending initial greeting to user');
      this.geminiService.sendTextInput(session, agentDetails.details.firstMessage);
    }

    return session;
  }

  private setupWebSocketEventHandlers(ws: WebSocket, session: Session): void {
    ws.on('message', async (message: Buffer) => {
      if (session) {
        this.geminiService.sendAudioInput(session, message);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      if (session) {
        this.geminiService.closeSession(session);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      if (session) {
        this.geminiService.closeSession(session);
      }
    });
  }
} 