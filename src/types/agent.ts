export interface AgentDetails {
  id: number;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
  organization: {
    id: number;
    name: string;
    shortName: string;
    active: boolean;
  };
  details: {
    firstMessage: string;
    systemPrompt: string;
    interactionMode: 'agent_speak_first' | 'user_speak_first';
  };
}

export interface AgentApiResponse {
  success: boolean;
  data: AgentDetails;
} 