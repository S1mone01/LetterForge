# MCP Server Host Guide

## Overview

LetterForge Pro now **hosts its own MCP server**, allowing external AI clients to connect and use powerful canvas editing tools.

## How It Works

Instead of connecting to an external AI service, **LetterForge becomes the AI server**. Your external AI (Claude, GPT, custom scripts, etc.) connects to LetterForge's MCP server and uses the available tools to modify your canvas.

```
┌─────────────────────────────────────┐
│      External AI Client            │
│   (Claude, GPT, Custom Script)     │
└──────────────┬──────────────────────┘
               │
               │ HTTP POST to
               │ http://localhost:3100/mcp
               │
┌──────────────▼──────────────────────┐
│    LetterForge MCP Server          │
│                                    │
│  Tools Available:                  │
│  • get_canvas_state                │
│  • add_text                        │
│  • modify_element                  │
│  • move_element                    │
│  • delete_element                  │
│  • duplicate_element               │
│  • recolor_element                 │
│  • resize_element                  │
│  • set_element_layer               │
│  • add_svg                         │
│  • select_elements                 │
│  • get_available_fonts             │
│  • get_available_svgs              │
└────────────────────────────────────┘
```

## Quick Start

### 1. Open AI Panel
Click the **"AI Assistant"** section in the right panel.

### 2. Configure Port
Default port: **3100** (you can change it if needed)

### 3. Start Server
Click **"Avvia Host MCP"** button.

You'll see:
- Green dot = Server running
- Server URL displayed
- List of available tools

### 4. Connect Your AI
Point your AI client to: `http://localhost:3100`

## MCP Protocol

LetterForge implements the **JSON-RPC 2.0** based MCP protocol.

### Endpoint
```
POST http://localhost:3100/mcp
Content-Type: application/json
```

### Initialize Connection
```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "My AI Client",
      "version": "1.0.0"
    }
  },
  "id": 1
}
```

### List Available Tools
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {},
  "id": 2
}
```

### Call a Tool
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "add_text",
    "arguments": {
      "text": "Hello World",
      "x": 400,
      "y": 250,
      "fontSize": 80,
      "fill": "#111111"
    }
  },
  "id": 3
}
```

## Available Tools

### 1. `get_canvas_state`
Get complete canvas state including all elements.

**Parameters:** None

**Returns:**
```json
{
  "letters": [...],
  "canvasW": 800,
  "canvasH": 500,
  "svgs": [...],
  "fonts": {...},
  "uid": 5
}
```

### 2. `add_text`
Add a new text element to the canvas.

**Parameters:**
```json
{
  "text": "Hello",              // Required
  "x": 400,                     // Optional (default: center)
  "y": 250,                     // Optional (default: center)
  "fontSize": 80,               // Optional (default: 80)
  "fill": "#111111",            // Optional (default: #111111)
  "fontFamily": "sans-serif",   // Optional
  "rotation": 0                 // Optional (default: 0)
}
```

### 3. `modify_element`
Modify properties of an existing element.

**Parameters:**
```json
{
  "elementId": 0,               // Required
  "properties": {               // Properties to update
    "x": 500,
    "y": 300,
    "fill": "#ff0000",
    "fontSize": 100,
    "rot": 45
    // ... any element property
  }
}
```

### 4. `move_element`
Move an element to a new position.

**Parameters:**
```json
{
  "elementId": 0,               // Required
  "x": 500,                     // Absolute X
  "y": 300,                     // Absolute Y
  "dx": 50,                     // Relative X offset
  "dy": 50                      // Relative Y offset
}
```

### 5. `delete_element`
Delete one or more elements.

**Parameters:**
```json
{
  "elementIds": [0, 1, 2]       // Array of IDs to delete
}
```

### 6. `duplicate_element`
Duplicate an existing element.

**Parameters:**
```json
{
  "elementId": 0,               // Required
  "offsetX": 50,                // Optional (default: 50)
  "offsetY": 50                 // Optional (default: 50)
}
```

### 7. `recolor_element`
Change element color.

**Parameters:**
```json
{
  "elementId": 0,               // Required
  "fill": "#ff6600"             // Required (hex color)
}
```

### 8. `resize_element`
Resize an element.

**Parameters:**
```json
{
  "elementId": 0,               // Required
  "scaleX": 1.5,                // Scale factor X
  "scaleY": 1.5,                // Scale factor Y
  "fontSize": 120               // New font size (for text)
}
```

### 9. `set_element_layer`
Change element layer (1, 2, or 3).

**Parameters:**
```json
{
  "elementId": 0,               // Required
  "layer": 2                    // 1, 2, or 3
}
```

### 10. `add_svg`
Add an SVG from the library to canvas.

**Parameters:**
```json
{
  "svgName": "star.svg",        // Required (must exist in library)
  "x": 400,                     // Optional (default: center)
  "y": 250,                     // Optional (default: center)
  "scaleX": 1,                  // Optional (default: 1)
  "scaleY": 1                   // Optional (default: 1)
}
```

### 11. `select_elements`
Select specific elements on canvas.

**Parameters:**
```json
{
  "elementIds": [0, 2, 4]       // Array of IDs to select
}
```

### 12. `get_available_fonts`
Get list of loaded fonts.

**Returns:**
```json
{
  "fonts": ["Arial", "DM Mono", "Syne"]
}
```

### 13. `get_available_svgs`
Get list of available SVGs.

**Returns:**
```json
{
  "svgs": [
    {"name": "star.svg", "width": 100, "height": 100},
    {"name": "heart.svg", "width": 80, "height": 80}
  ]
}
```

## Example AI Client (Python)

```python
import requests
import json

MCP_URL = "http://localhost:3100/mcp"
request_id = 1

def mcp_request(method, params={}):
    global request_id
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": request_id
    }
    request_id += 1
    
    response = requests.post(MCP_URL, json=payload)
    return response.json()

# Initialize
print(mcp_request("initialize", {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {"name": "Python Client", "version": "1.0"}
}))

# Get canvas state
state = mcp_request("tools/call", {
    "name": "get_canvas_state",
    "arguments": {}
})
print(state)

# Add text
mcp_request("tools/call", {
    "name": "add_text",
    "arguments": {
        "text": "Hello from Python!",
        "x": 400,
        "y": 250,
        "fontSize": 60,
        "fill": "#00ff00"
    }
})

# Get elements and modify
state = mcp_request("tools/call", {
    "name": "get_canvas_state",
    "arguments": {}
})

if state['result']['content'][0]['text']:
    canvas = json.loads(state['result']['content'][0]['text'])
    if canvas['letters']:
        element_id = canvas['letters'][0]['id']
        
        # Move element
        mcp_request("tools/call", {
            "name": "move_element",
            "arguments": {
                "elementId": element_id,
                "dx": 100,
                "dy": 50
            }
        })
        
        # Recolor
        mcp_request("tools/call", {
            "name": "recolor_element",
            "arguments": {
                "elementId": element_id,
                "fill": "#ff6600"
            }
        })
```

## Example AI Client (Node.js)

```javascript
const MCP_URL = 'http://localhost:3100/mcp';
let requestId = 1;

async function mcpRequest(method, params = {}) {
    const response = await fetch(MCP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: requestId++
        })
    });
    
    return await response.json();
}

// Initialize
await mcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'Node.js Client', version: '1.0' }
});

// Add text
await mcpRequest('tools/call', {
    name: 'add_text',
    arguments: {
        text: 'Hello from Node.js!',
        x: 400,
        y: 250,
        fontSize: 60,
        fill: '#00aaff'
    }
});

// Get canvas state
const stateResp = await mcpRequest('tools/call', {
    name: 'get_canvas_state',
    arguments: {}
});

const canvas = JSON.parse(stateResp.result.content[0].text);
console.log('Canvas has', canvas.letters.length, 'elements');
```

## Example AI Client (curl)

```bash
# Initialize
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"1.0"}},"id":1}'

# Add text
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"add_text","arguments":{"text":"Hello from curl!","x":400,"y":250,"fontSize":60}},"id":2}'

# Get canvas state
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_canvas_state","arguments":{}},"id":3}'
```

## Auto-Start

The app automatically:
- Remembers the last used port
- Can auto-start when you open the AI panel

## Health Check

```
GET http://localhost:3100/health
```

Returns:
```json
{
  "status": "ok",
  "server": "LetterForge MCP Server",
  "version": "1.0.0",
  "tools": ["get_canvas_state", "add_text", ...]
}
```

## Tools Discovery

```
GET http://localhost:3100/tools
```

Returns full tool descriptions with schemas.

## Stopping the Server

Click **"Arresta Host MCP"** button in the AI panel.

## Tips for AI Integration

### Using with ChatGPT/Claude
1. Get canvas state first to understand what's on canvas
2. Ask the AI what changes to make
3. Use tools to implement those changes
4. Verify results with another get_canvas_state call

### Common Workflow
```
1. GET canvas state
2. AI analyzes current state
3. AI decides what to change
4. AI calls tools to make changes
5. GET canvas state to verify
6. Repeat if needed
```

### Error Handling
All tool calls return:
```json
{
  "success": true/false,
  "message": "...",
  "error": "..." // if failed
}
```

## Troubleshooting

### Port Already in Use
- Change to a different port (e.g., 3101)
- Or kill the process using that port: `netstat -ano | findstr :3100`

### AI Can't Connect
- Verify server is running (green dot in UI)
- Check firewall isn't blocking port 3100
- Test with: `curl http://localhost:3100/health`

### Tools Not Working
- Check tool name is correct
- Verify parameters match the schema
- Look at developer console (Ctrl+Shift+I) for errors

## Architecture

```
┌──────────────────────────────────────────────┐
│  LetterForge Electron App                   │
│                                              │
│  ┌────────────────┐    ┌──────────────────┐ │
│  │  Renderer      │    │  Main Process    │ │
│  │  (index.html)  │◄──►│  (main.js)       │ │
│  │                │    │                  │ │
│  │  - UI          │    │  - MCP Server    │ │
│  │  - Canvas      │    │    (port 3100)   │ │
│  │  - Operations  │    │                  │ │
│  └────────────────┘    └──────────────────┘ │
└──────────────────────────────────────────────┘
           ▲
           │ HTTP
           │
┌──────────┴──────────────────────────────────┐
│  External AI Client                         │
│  (Python, Node.js, curl, etc.)              │
└─────────────────────────────────────────────┘
```

## Benefits

✅ **Full Control**: You decide what the AI can do  
✅ **Local Processing**: No data leaves your machine  
✅ **No API Costs**: Unlimited use, no per-request fees  
✅ **Flexible**: Connect any AI that speaks HTTP/JSON  
✅ **Extensible**: Easy to add new tools  

---

**Last Updated**: April 7, 2026  
**Version**: LetterForge Pro with MCP Host Server  
**Protocol**: JSON-RPC 2.0 / MCP 2024-11-05
