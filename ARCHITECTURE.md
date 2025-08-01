# Voice Assistant Backend Architecture

This project follows a clean, layered architecture pattern with clear separation of concerns.

## Project Structure

```
src/
├── config/
│   └── config.ts          # Centralized configuration
├── types/
│   └── agent.ts           # TypeScript interfaces and types
├── services/
│   ├── agentService.ts    # Agent-related API operations
│   └── geminiService.ts   # Gemini AI integration
├── controllers/
│   └── websocketController.ts  # WebSocket connection handling
└── server.ts              # Main application entry point
```

## Architecture Layers

### 1. Configuration Layer (`config/`)
- **Purpose**: Centralized configuration management
- **Responsibilities**: 
  - Read environment variables with fallback defaults
  - Validate required environment variables
  - Type-safe configuration access
  - Environment-specific settings
  - API endpoints and server settings

### 2. Types Layer (`types/`)
- **Purpose**: Type definitions and interfaces
- **Responsibilities**:
  - Define data structures
  - API response types
  - Service interfaces

### 3. Services Layer (`services/`)
- **Purpose**: Business logic and external integrations
- **Responsibilities**:
  - **AgentService**: Handle agent-related API calls
  - **GeminiService**: Manage Gemini AI interactions
  - External API communication
  - Data transformation

### 4. Controllers Layer (`controllers/`)
- **Purpose**: Request handling and coordination
- **Responsibilities**:
  - WebSocket connection management
  - Orchestrate service interactions
  - Handle client communication
  - Error handling and validation

### 5. Application Layer (`server.ts`)
- **Purpose**: Application entry point and setup
- **Responsibilities**:
  - Initialize services and controllers
  - Start the WebSocket server
  - Setup event handlers

## Key Principles

### Single Responsibility Principle
Each class has a single, well-defined responsibility:
- `AgentService`: Only handles agent API operations
- `GeminiService`: Only manages Gemini AI interactions
- `WebSocketController`: Only handles WebSocket connections

### Dependency Injection
Services are injected into controllers, making the code:
- More testable
- Loosely coupled
- Easier to mock and replace

### Configuration Management
All configuration is centralized in `config/config.ts`, making it:
- Easy to modify settings via environment variables
- Environment-specific configuration
- Type-safe configuration access
- Validation of required environment variables
- Fallback defaults for optional settings

### Error Handling
Each layer handles errors appropriately:
- Services throw errors for business logic failures
- Controllers catch and handle errors gracefully
- Proper error messages sent to clients

## Usage

The WebSocket server accepts connections with an agent ID parameter:
```
ws://localhost:3001?agentId=1
```

The server will:
1. Extract the agent ID from query parameters
2. Fetch agent details from the API
3. Create a Gemini session with the agent's system prompt
4. Handle the interaction mode (agent_speak_first vs user_speak_first)
5. Manage the WebSocket communication

## Benefits

1. **Maintainability**: Clear separation of concerns makes code easier to understand and modify
2. **Testability**: Each layer can be tested independently
3. **Scalability**: Easy to add new services or modify existing ones
4. **Reusability**: Services can be reused across different controllers
5. **Type Safety**: Strong TypeScript typing throughout the application 