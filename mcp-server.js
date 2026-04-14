/**
 * MCP Server for LetterForge Pro
 * Hosts an MCP-compatible server that exposes canvas editing tools
 * External AI clients can connect and use these tools to modify the canvas
 */

const http = require('http');
const { EventEmitter } = require('events');

class MCPServer extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.port = 3100;
    this.isRunning = false;
    this.canvasState = null;
    this.pendingOperations = [];
    this.clients = new Map();
  }

  /**
   * Start MCP server
   */
  start(port = 3100) {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        resolve({ success: true, message: `Server already running on port ${this.port}` });
        return;
      }

      this.port = port;

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });

      this.server.listen(port, () => {
        this.isRunning = true;
        console.log(`[MCP Server] Running on http://localhost:${port}`);
        this.emit('started', { port });
        resolve({ success: true, port, url: `http://localhost:${port}` });
      });
    });
  }

  /**
   * Stop MCP server
   */
  stop() {
    return new Promise((resolve) => {
      if (!this.isRunning || !this.server) {
        resolve({ success: true, message: 'Server not running' });
        return;
      }

      this.server.close(() => {
        this.isRunning = false;
        console.log('[MCP Server] Stopped');
        this.emit('stopped');
        resolve({ success: true, message: 'Server stopped' });
      });
    });
  }

  /**
   * Update canvas state from main app
   */
  updateCanvasState(state) {
    this.canvasState = state;
    this.emit('state-updated', state);
  }

  /**
   * Get current canvas state
   */
  getCanvasState() {
    return this.canvasState;
  }

  /**
   * Execute operation from AI client
   */
  async executeOperation(operation) {
    return new Promise((resolve) => {
      this.emit('execute-operation', operation, resolve);
    });
  }

  /**
   * Handle HTTP requests (MCP Protocol)
   */
  async handleRequest(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      this.handleHealth(res);
      return;
    }

    // MCP endpoint
    if (req.method === 'POST' && req.url === '/mcp') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const request = JSON.parse(body);
          const response = await this.handleMCPRequest(request);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32700, message: error.message },
            id: null
          }));
        }
      });
      return;
    }

    // Tools endpoint (for discovery)
    if (req.method === 'GET' && req.url === '/tools') {
      this.handleToolsDiscovery(res);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Handle health check
   */
  handleHealth(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      server: 'LetterForge MCP Server',
      version: '1.0.0',
      tools: this.getToolsList()
    }));
  }

  /**
   * Handle tools discovery
   */
  handleToolsDiscovery(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      tools: this.getToolsList()
    }));
  }

  /**
   * Get list of available tools
   */
  getToolsList() {
    return [
      {
        name: 'get_canvas_state',
        description: 'Get the current state of the canvas including all elements, their properties, bounding boxes, and available resources. Returns canvas dimensions (canvasW, canvasH), all elements with their bounding boxes (bbox), the last element for reference, available fonts and SVGs.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_element_bounds',
        description: 'Get the bounding box and dimensions of specific elements. Returns x, y, x2, y2, width, height, center coordinates for each element.',
        inputSchema: {
          type: 'object',
          properties: {
            elementIds: {
              type: 'array',
              items: { type: 'number' },
              description: 'Array of element IDs to get bounds for. If empty, returns bounds for all elements.'
            }
          },
          required: []
        }
      },
      {
        name: 'get_last_element',
        description: 'Get the last element added to the canvas with its position and dimensions. Useful for positioning new elements relative to the last one.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'calculate_position_relative',
        description: 'Calculate the position to place a new element relative to an existing element. Supports positions like: left, right, above, below, top-left, top-right, bottom-left, bottom-right, with optional padding.',
        inputSchema: {
          type: 'object',
          properties: {
            referenceElementId: { type: 'number', description: 'ID of the reference element' },
            position: {
              type: 'string',
              enum: ['left', 'right', 'above', 'below', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
              description: 'Position relative to the reference element'
            },
            padding: { type: 'number', description: 'Padding/gap from the reference element in pixels (default: 20)' },
            targetWidth: { type: 'number', description: 'Width of the new element (for accurate positioning)' },
            targetHeight: { type: 'number', description: 'Height of the new element (for accurate positioning)' }
          },
          required: ['referenceElementId', 'position']
        }
      },
      {
        name: 'resize_canvas',
        description: 'Resize the canvas to new dimensions. Useful when adding large text that does not fit.',
        inputSchema: {
          type: 'object',
          properties: {
            width: { type: 'number', description: 'New canvas width in pixels' },
            height: { type: 'number', description: 'New canvas height in pixels' }
          },
          required: []
        }
      },
      {
        name: 'add_text',
        description: 'Add a new text element to the canvas',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text content to add' },
            x: { type: 'number', description: 'X position (default: center)' },
            y: { type: 'number', description: 'Y position (default: center)' },
            fontSize: { type: 'number', description: 'Font size in pixels (default: 80)' },
            fill: { type: 'string', description: 'Text color in hex (default: #111111)' },
            fontFamily: { type: 'string', description: 'Font family name' },
            rotation: { type: 'number', description: 'Rotation in degrees (default: 0)' }
          },
          required: ['text']
        }
      },
      {
        name: 'modify_element',
        description: 'Modify properties of an existing canvas element',
        inputSchema: {
          type: 'object',
          properties: {
            elementId: { type: 'number', description: 'ID of the element to modify' },
            properties: {
              type: 'object',
              description: 'Properties to update (x, y, fontSize, fill, sx, sy, rot, skew, op, layer, etc.)',
              additionalProperties: true
            }
          },
          required: ['elementId', 'properties']
        }
      },
      {
        name: 'move_element',
        description: 'Move an element to a new position',
        inputSchema: {
          type: 'object',
          properties: {
            elementId: { type: 'number', description: 'ID of the element to move' },
            x: { type: 'number', description: 'New X position' },
            y: { type: 'number', description: 'New Y position' },
            dx: { type: 'number', description: 'Relative X offset' },
            dy: { type: 'number', description: 'Relative Y offset' }
          },
          required: ['elementId']
        }
      },
      {
        name: 'delete_element',
        description: 'Delete one or more elements from the canvas',
        inputSchema: {
          type: 'object',
          properties: {
            elementIds: {
              type: 'array',
              items: { type: 'number' },
              description: 'Array of element IDs to delete'
            }
          },
          required: ['elementIds']
        }
      },
      {
        name: 'duplicate_element',
        description: 'Duplicate an existing element',
        inputSchema: {
          type: 'object',
          properties: {
            elementId: { type: 'number', description: 'ID of the element to duplicate' },
            offsetX: { type: 'number', description: 'X offset for the duplicate (default: 50)' },
            offsetY: { type: 'number', description: 'Y offset for the duplicate (default: 50)' }
          },
          required: ['elementId']
        }
      },
      {
        name: 'recolor_element',
        description: 'Change the color of an element',
        inputSchema: {
          type: 'object',
          properties: {
            elementId: { type: 'number', description: 'ID of the element to recolor' },
            fill: { type: 'string', description: 'New fill color in hex' }
          },
          required: ['elementId', 'fill']
        }
      },
      {
        name: 'resize_element',
        description: 'Resize an element',
        inputSchema: {
          type: 'object',
          properties: {
            elementId: { type: 'number', description: 'ID of the element to resize' },
            scaleX: { type: 'number', description: 'Scale factor X (default: 1)' },
            scaleY: { type: 'number', description: 'Scale factor Y (default: 1)' },
            fontSize: { type: 'number', description: 'New font size (for text elements)' }
          },
          required: ['elementId']
        }
      },
      {
        name: 'set_element_layer',
        description: 'Change the layer order of an element',
        inputSchema: {
          type: 'object',
          properties: {
            elementId: { type: 'number', description: 'ID of the element' },
            layer: { type: 'number', description: 'Layer number (1, 2, or 3)' }
          },
          required: ['elementId', 'layer']
        }
      },
      {
        name: 'add_svg',
        description: 'Add an SVG from the library to the canvas',
        inputSchema: {
          type: 'object',
          properties: {
            svgName: { type: 'string', description: 'Name of the SVG from the library' },
            x: { type: 'number', description: 'X position (default: center)' },
            y: { type: 'number', description: 'Y position (default: center)' },
            scaleX: { type: 'number', description: 'Scale factor X (default: 1)' },
            scaleY: { type: 'number', description: 'Scale factor Y (default: 1)' }
          },
          required: ['svgName']
        }
      },
      {
        name: 'select_elements',
        description: 'Select specific elements on the canvas',
        inputSchema: {
          type: 'object',
          properties: {
            elementIds: {
              type: 'array',
              items: { type: 'number' },
              description: 'Array of element IDs to select'
            }
          },
          required: ['elementIds']
        }
      },
      {
        name: 'get_available_fonts',
        description: 'Get list of available fonts loaded in the app',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_available_svgs',
        description: 'Get list of available SVGs in the library',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ];
  }

  /**
   * Handle MCP JSON-RPC 2.0 requests
   */
  async handleMCPRequest(request) {
    const { method, params, id, jsonrpc } = request;

    if (jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC version');
    }

    // Handle notifications (id is null) - no response expected
    if (id === null || id === undefined) {
      // Silently ignore notifications we don't need to handle
      console.log(`[MCP Server] Ignoring notification: ${method}`);
      return null;
    }

    let result;

    switch (method) {
      case 'initialize':
        result = await this.toolInitialize(params);
        break;

      case 'tools/list':
        result = { tools: this.getToolsList() };
        break;

      case 'tools/call':
        result = await this.toolCall(params);
        break;

      case 'ping':
        result = {};
        break;

      default:
        throw new Error(`Method not found: ${method}`);
    }

    return {
      jsonrpc: '2.0',
      result,
      id
    };
  }

  /**
   * Handle initialize request
   */
  async toolInitialize(params) {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: true
        }
      },
      serverInfo: {
        name: 'LetterForge MCP Server',
        version: '1.0.0'
      }
    };
  }

  /**
   * Handle tool call
   */
  async toolCall(params) {
    const { name, arguments: args } = params;

    console.log(`[MCP Server] Tool call: ${name}`, args);

    switch (name) {
      case 'get_canvas_state':
        return await this.toolGetCanvasState();

      case 'get_element_bounds':
        return await this.toolGetElementBounds(args);

      case 'get_last_element':
        return await this.toolGetLastElement();

      case 'calculate_position_relative':
        return await this.toolCalculatePositionRelative(args);

      case 'resize_canvas':
        return await this.toolResizeCanvas(args);

      case 'add_text':
        return await this.toolAddText(args);
      
      case 'modify_element':
        return await this.toolModifyElement(args);
      
      case 'move_element':
        return await this.toolMoveElement(args);
      
      case 'delete_element':
        return await this.toolDeleteElement(args);
      
      case 'duplicate_element':
        return await this.toolDuplicateElement(args);
      
      case 'recolor_element':
        return await this.toolRecolorElement(args);
      
      case 'resize_element':
        return await this.toolResizeElement(args);
      
      case 'set_element_layer':
        return await this.toolSetElementLayer(args);
      
      case 'add_svg':
        return await this.toolAddSVG(args);
      
      case 'select_elements':
        return await this.toolSelectElements(args);
      
      case 'get_available_fonts':
        return await this.toolGetAvailableFonts();
      
      case 'get_available_svgs':
        return await this.toolGetAvailableSVGs();
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Tool: Get canvas state
   */
  async toolGetCanvasState() {
    if (!this.canvasState) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'No canvas state available' })
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(this.canvasState, null, 2)
      }]
    };
  }

  /**
   * Tool: Get element bounds
   */
  async toolGetElementBounds(args) {
    if (!this.canvasState) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'No canvas state available' })
        }]
      };
    }

    const letters = this.canvasState.letters || [];
    let targetElements = letters;

    // Filter by element IDs if provided
    if (args.elementIds && args.elementIds.length > 0) {
      targetElements = letters.filter(l => args.elementIds.includes(l.id));
    }

    const boundsData = targetElements.map(el => ({
      id: el.id,
      index: el.index,
      type: el.type,
      ch: el.ch,
      position: { x: el.x, y: el.y },
      bbox: el.bbox,
      dimensions: el.bbox ? {
        width: el.bbox.w,
        height: el.bbox.h,
        centerX: el.bbox.cx,
        centerY: el.bbox.cy
      } : null
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          elements: boundsData,
          canvasDimensions: {
            width: this.canvasState.canvasW,
            height: this.canvasState.canvasH
          }
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: Get last element
   */
  async toolGetLastElement() {
    if (!this.canvasState) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'No canvas state available' })
        }]
      };
    }

    const lastElement = this.canvasState.lastElement;

    if (!lastElement) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, lastElement: null, message: 'Canvas is empty' })
        }]
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          lastElement: {
            id: lastElement.id,
            index: lastElement.index,
            type: lastElement.type,
            ch: lastElement.ch,
            position: { x: lastElement.x, y: lastElement.y },
            fontSize: lastElement.fontSize,
            bbox: lastElement.bbox,
            dimensions: lastElement.bbox ? {
              width: lastElement.bbox.w,
              height: lastElement.bbox.h,
              rightEdge: lastElement.bbox.x2,
              bottomEdge: lastElement.bbox.y2,
              centerX: lastElement.bbox.cx,
              centerY: lastElement.bbox.cy
            } : null,
            svgDimensions: (lastElement.isSvgImport && lastElement.svgW && lastElement.svgH) ? {
              width: lastElement.svgW,
              height: lastElement.svgH
            } : null
          }
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: Calculate position relative
   */
  async toolCalculatePositionRelative(args) {
    if (!this.canvasState) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'No canvas state available' })
        }]
      };
    }

    const letters = this.canvasState.letters || [];
    const refElement = letters.find(l => l.id === args.referenceElementId);

    if (!refElement) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Element with ID ${args.referenceElementId} not found`,
            availableElementIds: letters.map(l => l.id)
          })
        }]
      };
    }

    if (!refElement.bbox) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Reference element has no bounding box data',
            element: refElement
          })
        }]
      };
    }

    const bbox = refElement.bbox;
    const padding = args.padding || 20;
    let x, y;

    // Calculate position based on requested placement
    switch (args.position) {
      case 'left':
        x = bbox.x - (args.targetWidth || 0) - padding;
        y = bbox.cy - (args.targetHeight || 0) / 2;
        break;

      case 'right':
        x = bbox.x2 + padding;
        y = bbox.cy - (args.targetHeight || 0) / 2;
        break;

      case 'above':
        x = bbox.cx - (args.targetWidth || 0) / 2;
        y = bbox.y - (args.targetHeight || 0) - padding;
        break;

      case 'below':
        x = bbox.cx - (args.targetWidth || 0) / 2;
        y = bbox.y2 + padding;
        break;

      case 'top-left':
        x = bbox.x - (args.targetWidth || 0) - padding;
        y = bbox.y - (args.targetHeight || 0) - padding;
        break;

      case 'top-right':
        x = bbox.x2 + padding;
        y = bbox.y - (args.targetHeight || 0) - padding;
        break;

      case 'bottom-left':
        x = bbox.x - (args.targetWidth || 0) - padding;
        y = bbox.y2 + padding;
        break;

      case 'bottom-right':
        x = bbox.x2 + padding;
        y = bbox.y2 + padding;
        break;

      default:
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: `Invalid position: ${args.position}`,
              validPositions: ['left', 'right', 'above', 'below', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
            })
          }]
        };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          referenceElement: {
            id: refElement.id,
            ch: refElement.ch,
            bbox: bbox
          },
          calculatedPosition: {
            x: Math.round(x),
            y: Math.round(y),
            position: args.position,
            padding: padding,
            targetDimensions: {
              width: args.targetWidth || 0,
              height: args.targetHeight || 0
            }
          },
          suggestion: `Place new element at x=${Math.round(x)}, y=${Math.round(y)}`
        }, null, 2)
      }]
    };
  }

  /**
   * Tool: Resize canvas
   */
  async toolResizeCanvas(args) {
    const operation = {
      type: 'resize_canvas',
      width: args.width,
      height: args.height
    };

    const result = await this.executeOperation(operation);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          operation,
          result,
          newDimensions: {
            width: args.width || this.canvasState?.canvasW,
            height: args.height || this.canvasState?.canvasH
          }
        })
      }]
    };
  }

  /**
   * Tool: Add text
   */
  async toolAddText(args) {
    const operation = {
      type: 'add',
      text: args.text,
      x: args.x || (this.canvasState?.canvasW / 2) || 400,
      y: args.y || (this.canvasState?.canvasH / 2) || 250,
      fontSize: args.fontSize || 80,
      fill: args.fill || '#111111',
      fontFamily: args.fontFamily || 'sans-serif',
      rotation: args.rotation || 0
    };

    const result = await this.executeOperation(operation);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, operation, result })
      }]
    };
  }

  /**
   * Tool: Modify element
   */
  async toolModifyElement(args) {
    const operation = {
      type: 'modify',
      elementId: args.elementId,
      properties: args.properties
    };

    const result = await this.executeOperation(operation);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, operation, result })
      }]
    };
  }

  /**
   * Tool: Move element
   */
  async toolMoveElement(args) {
    const operation = {
      type: 'move',
      elementId: args.elementId,
      x: args.x,
      y: args.y,
      dx: args.dx,
      dy: args.dy
    };

    const result = await this.executeOperation(operation);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, operation, result })
      }]
    };
  }

  /**
   * Tool: Delete element
   */
  async toolDeleteElement(args) {
    const operation = {
      type: 'delete',
      elementIds: args.elementIds
    };

    const result = await this.executeOperation(operation);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, operation, result })
      }]
    };
  }

  /**
   * Tool: Duplicate element
   */
  async toolDuplicateElement(args) {
    const operation = {
      type: 'duplicate',
      elementId: args.elementId,
      offsetX: args.offsetX || 50,
      offsetY: args.offsetY || 50
    };

    const result = await this.executeOperation(operation);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, operation, result })
      }]
    };
  }

  /**
   * Tool: Recolor element
   */
  async toolRecolorElement(args) {
    const operation = {
      type: 'recolor',
      elementId: args.elementId,
      fill: args.fill
    };

    const result = await this.executeOperation(operation);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, operation, result })
      }]
    };
  }

  /**
   * Tool: Resize element
   */
  async toolResizeElement(args) {
    const operation = {
      type: 'resize',
      elementId: args.elementId,
      scaleX: args.scaleX,
      scaleY: args.scaleY,
      fontSize: args.fontSize
    };

    const result = await this.executeOperation(operation);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, operation, result })
      }]
    };
  }

  /**
   * Tool: Set element layer
   */
  async toolSetElementLayer(args) {
    const operation = {
      type: 'set_layer',
      elementId: args.elementId,
      layer: args.layer
    };

    const result = await this.executeOperation(operation);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, operation, result })
      }]
    };
  }

  /**
   * Tool: Add SVG
   */
  async toolAddSVG(args) {
    const canvasW = this.canvasState?.canvasW || 800;
    const canvasH = this.canvasState?.canvasH || 500;
    
    // Trova le dimensioni dell'SVG dalla lista disponibile
    const svgInfo = this.canvasState?.svgs?.find(s => s.name === args.svgName);
    const svgMaxDim = svgInfo ? Math.max(svgInfo.width || 100, svgInfo.height || 100) : 100;
    
    // Calcola scala automatica: 8% del lato più piccolo del canvas
    const targetSize = Math.min(canvasW, canvasH) * 0.08;
    const autoScale = targetSize / svgMaxDim;

    const operation = {
      type: 'add_svg',
      svgName: args.svgName,
      x: args.x || canvasW / 2,
      y: args.y || canvasH / 2,
      scaleX: args.scaleX !== undefined ? args.scaleX : autoScale,
      scaleY: args.scaleY !== undefined ? args.scaleY : autoScale
    };

    const result = await this.executeOperation(operation);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, operation, result })
      }]
    };
  }

  /**
   * Tool: Select elements
   */
  async toolSelectElements(args) {
    const operation = {
      type: 'select',
      elementIds: args.elementIds
    };

    const result = await this.executeOperation(operation);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, operation, result })
      }]
    };
  }

  /**
   * Tool: Get available fonts
   */
  async toolGetAvailableFonts() {
    const fonts = this.canvasState?.fonts || {};
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ fonts: Object.keys(fonts) })
      }]
    };
  }

  /**
   * Tool: Get available SVGs
   */
  async toolGetAvailableSVGs() {
    const svgs = this.canvasState?.svgs || [];
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ svgs: svgs.map(s => ({ name: s.name, width: s.width, height: s.height })) })
      }]
    };
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      url: this.isRunning ? `http://localhost:${this.port}` : null,
      toolsCount: this.getToolsList().length
    };
  }
}

// Export singleton instance
module.exports = new MCPServer();
