import { AgentDetails, AgentApiResponse } from '../types/agent';
import { config } from '../config/config';

export class AgentService {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || config.api.baseUrl;
  }

  async fetchAgentDetails(agentId: string): Promise<AgentDetails> {
    try {
      const response = await fetch(`${this.baseUrl}/api/agents/${agentId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch agent details: ${response.status}`);
      }
      const result: AgentApiResponse = await response.json();
      
      if (!result.success) {
        throw new Error('Failed to fetch agent details');
      }
      
      return result.data;
    } catch (error) {
      console.error('Error fetching agent details:', error);
      throw error;
    }
  }
} 