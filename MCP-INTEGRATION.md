# MCP Server Integration Guide

## Overview

LetterForge Pro now supports **MCP (Model Context Protocol)** server integration, allowing you to connect to any AI-compatible MCP server instead of being locked to a specific provider.

## What Changed

### Before (Qwen OAuth Only)
- Required authentication with Qwen API
- Limited to one AI provider
- API key management and rate limits

### After (MCP Server Support)
- Connect to **any MCP-compatible AI server**
- No authentication required (your server, your rules)
- Full control over AI backend
- Still supports Qwen AI as fallback

## How to Use

### 1. Open the AI Panel
Click the **"AI Assistant"** section in the right panel to expand it.

### 2. Configure MCP Server
You'll see:
- **Server URL input**: Enter your MCP server address (default: `http://localhost:3000`)
- **Status indicator**: Shows connection status (green = connected, yellow = connecting, red = error)
- **Start/Stop button**: Toggle connection to MCP server

### 3. Connect to Server
1. Enter your MCP server URL
2. Click **"Avvia Server MCP"** (Start MCP Server)
3. Wait for connection confirmation (green dot)
4. The chat interface will appear automatically

### 4. Use AI Assistant
Once connected, you can:
- Type requests in the chat input
- Ask the AI to modify text, colors, positions, etc.
- The AI will return structured commands to update your canvas
- Clear history anytime with the "Clear" button

## MCP Server Protocol

Your MCP server should support these endpoints:

### `GET /health`
Health check endpoint. Returns 200 OK when server is running.

**Response:**
```json
{
  "status": "ok"
}
```

### `POST /process`
Process AI requests. Receives canvas state and user prompt.

**Request Body:**
```json
{
  "prompt": "Move the text 'Hello' 50px to the right",
  "canvasState": {
    "letters": [
      {
        "id": 0,
        "ch": "Hello",
        "x": 400,
        "y": 250,
        "fontSize": 80,
        "fill": "#111111",
        "sx": 1,
        "sy": 1,
        "rot": 0,
        "skew": 0,
        "op": 1,
        "borderWidth": 0,
        "borderColor": "#000000",
        "layer": 2,
        "isSvgImport": false,
        "fontName": "sans-serif",
        "selected": true
      }
    ],
    "canvasW": 800,
    "canvasH": 500,
    "svgs": [],
    "fonts": {},
    "uid": 1
  },
  "timestamp": "2026-04-07T10:30:00.000Z"
}
```

**Response Format:**
```json
{
  "operations": [
    {
      "type": "move",
      "target": "selected",
      "properties": {
        "dx": 50
      }
    }
  ],
  "explanation": "Moved selected text 50px to the right",
  "needs_clarification": false,
  "warnings": []
}
```

## Operation Types

The AI can perform these operations on your canvas:

| Operation | Description | Example |
|-----------|-------------|---------|
| `modify` | Change element properties | Change color, size, rotation |
| `add` | Add new element | Add text or SVG |
| `duplicate` | Copy existing element | Create duplicate |
| `move` | Move element(s) | Shift position |
| `resize` | Resize element(s) | Scale up/down |
| `delete` | Remove element(s) | Delete from canvas |
| `recolor` | Change color | Update fill color |

## Example MCP Server Implementation

Here's a simple Node.js MCP server example:

```javascript
const express = require('express');
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Process AI requests
app.post('/process', async (req, res) => {
  const { prompt, canvasState } = req.body;
  
  // Your AI logic here
  // Parse the prompt and determine operations
  
  const response = {
    operations: [
      // Your operations here
    ],
    explanation: "What was done",
    needs_clarification: false,
    warnings: []
  };
  
  res.json(response);
});

app.listen(3000, () => {
  console.log('MCP Server running on http://localhost:3000');
});
```

## Auto-Connect

The app automatically:
- Saves your last MCP server URL
- Reconnects on next launch
- Shows connection status in real-time

## Troubleshooting

### Connection Failed
- Verify MCP server is running
- Check URL is correct (include `http://` or `https://`)
- Ensure firewall allows connection
- Check server logs for errors

### AI Not Responding
- Verify server `/process` endpoint works
- Check server logs for incoming requests
- Ensure response format matches specification
- Increase timeout if needed (currently 60 seconds)

### Operations Not Applying
- Check operation format is correct
- Verify target IDs match canvas elements
- Look for errors in developer console (Ctrl+Shift+I)

## Files Modified

- `src/index.html` - UI changes (login → MCP control)
- `ai-integration.js` - Added MCP support
- `mcp-server.js` - **NEW** MCP client module
- `main.js` - Added MCP IPC handlers
- `preload.js` - Exposed MCP functions to renderer

## Backward Compatibility

The old Qwen AI integration is still available as a fallback. The system prioritizes MCP when connected, but can still use direct Qwen API if needed.

## Benefits

✅ **Flexibility**: Use any AI provider you want  
✅ **Privacy**: Run AI locally, no data leaves your machine  
✅ **Cost**: No API fees if you host your own model  
✅ **Customization**: Train/fine-tune models for your workflow  
✅ **No Rate Limits**: Your server, your rules  

## Support

For issues or questions:
1. Check this documentation
2. Look at browser console (Ctrl+Shift+I)
3. Check MCP server logs
4. Verify network connectivity

---

**Last Updated**: April 7, 2026  
**Version**: LetterForge Pro with MCP Support
