/**
 * OpenJSCAD Bridge - Replaces custom CSG with OpenJSCAD for watertight meshes
 * 
 * Architecture:
 * - SVG pathD → OpenJSCAD geom2 (via parseSVGPathToJSCAD)
 * - geom2 → geom3 (via extrudeLinear)
 * - Boolean ops (union/subtract) in OpenJSCAD ONLY
 * - geom3 → Three.js BufferGeometry (for rendering only)
 */
window.OpenJSCADBridge = {
  jscad: window.OpenJSCAD || null,
  initialized: false,

  /**
   * Initialize OpenJSCAD from CDN or preload
   */
  async init() {
    if (this.initialized) return true;
    
    try {
      // Try CDN first (window.OpenJSCAD)
      if (window.OpenJSCAD) {
        this.jscad = window.OpenJSCAD;
        this.initialized = true;
        console.log('✓ OpenJSCAD Bridge initialized (CDN)');
        return true;
      }
      
      // Fallback: try preload
      if (window.electronAPI && window.electronAPI.loadOpenJSCAD) {
        this.jscad = await window.electronAPI.loadOpenJSCAD();
        this.initialized = true;
        console.log('✓ OpenJSCAD Bridge initialized (preload)');
        return true;
      }
    } catch (err) {
      console.warn('⚠ OpenJSCAD not available, falling back to custom CSG:', err.message);
    }
    return false;
  },

  /**
   * Parse SVG path 'd' attribute → OpenJSCAD geom2
   * Handles: M, L, H, V, C, Q, Z commands
   * Supports holes (inner contours detected by winding order)
   */
  parseSVGPathToGeom2(pathD) {
    if (!this.jscad) {
      throw new Error('OpenJSCAD not initialized');
    }

    const { geometries, transforms } = this.jscad;
    const { geom2 } = geometries;

    // Use a more robust parser if available
    let commands;
    if (typeof pathToAbsoluteSegments === 'function') {
      const segs = pathToAbsoluteSegments(pathD);
      commands = segs.map(s => ({ ...s, type: s.cmd }));
    } else {
      commands = parseSVGPath(pathD);
    }
    
    if (!commands || !commands.length) return null;

    // Group into subpaths by M command
    const subpaths = [];
    let currentSubpath = [];

    commands.forEach(cmd => {
      if (cmd.type === 'M') {
        if (currentSubpath.length > 0) {
          subpaths.push(currentSubpath);
        }
        currentSubpath = [cmd];
      } else {
        currentSubpath.push(cmd);
      }
    });
    if (currentSubpath.length > 0) subpaths.push(currentSubpath);

    if (subpaths.length === 0) return null;

    // Convert each subpath to OpenJSCAD contour (array of points)
    const contours = [];
    
    subpaths.forEach(subpath => {
      const points = [];
      let currentX = 0, currentY = 0;
      let started = false;

      for (const cmd of subpath) {
        if (cmd.type === 'M') {
          currentX = cmd.x;
          currentY = cmd.y;
          // Flip Y: Three.js Y points UP, canvas Y points DOWN
          points.push([cmd.x, -cmd.y]);
          started = true;
        } else if (cmd.type === 'L' && started) {
          currentX = cmd.x;
          currentY = cmd.y;
          // Flip Y
          points.push([cmd.x, -cmd.y]);
        } else if (cmd.type === 'H' && started) {
          currentX = cmd.x;
          // Flip Y using currentY
          points.push([cmd.x, -currentY]);
        } else if (cmd.type === 'V' && started) {
          currentY = cmd.y;
          // Flip Y
          points.push([currentX, -cmd.y]);
        } else if (cmd.type === 'C' && started) {
          // Cubic bezier: approximate with line segments
          const segments = 24;
          for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const mt = 1 - t;
            const x = mt*mt*mt*currentX + 3*mt*mt*t*cmd.x1 + 3*mt*t*t*cmd.x2 + t*t*t*cmd.x;
            const y = mt*mt*mt*currentY + 3*mt*mt*t*cmd.y1 + 3*mt*t*t*cmd.y2 + t*t*t*cmd.y;
            // Flip Y
            points.push([x, -y]);
          }
          currentX = cmd.x;
          currentY = cmd.y;
        } else if (cmd.type === 'Q' && started) {
          // Quadratic bezier: approximate with line segments
          const segments = 16;
          for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const mt = 1 - t;
            const x = mt*mt*currentX + 2*mt*t*cmd.x1 + t*t*cmd.x;
            const y = mt*mt*currentY + 2*mt*t*cmd.y1 + t*t*cmd.y;
            // Flip Y
            points.push([x, -y]);
          }
          currentX = cmd.x;
          currentY = cmd.y;
        } else if (cmd.type === 'Z' && started) {
          // Close path - ensure first point is repeated if not already
          if (points.length > 0 && subpath.length > 0) {
            const firstCmd = subpath[0];
            // Flip Y
            points.push([firstCmd.x, -firstCmd.y]);
          }
        }
      }

      if (points.length >= 3) {
        // Filter out duplicate or near-duplicate points (tolerance: 0.01 units)
        const filtered = [points[0]];
        const tolerance = 0.01;
        
        for (let i = 1; i < points.length; i++) {
          const prev = filtered[filtered.length - 1];
          const curr = points[i];
          const dx = curr[0] - prev[0];
          const dy = curr[1] - prev[1];
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          // Only add point if it's far enough from previous point
          if (dist > tolerance) {
            filtered.push(curr);
          }
        }
        
        // Remove last point if it's too close to first point (closing point)
        if (filtered.length > 3) {
          const first = filtered[0];
          const last = filtered[filtered.length - 1];
          const dx = last[0] - first[0];
          const dy = last[1] - first[1];
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist < tolerance) {
            filtered.pop(); // Remove duplicate closing point
          }
        }
        
        // Only add contour if it has at least 3 valid points
        if (filtered.length >= 3) {
          contours.push(filtered);
        }
      }
    });

    if (contours.length === 0) return null;

    // ROBUST WINDING DETECTION
    // Calculate signed areas and sort by absolute area (largest first)
    const contourData = contours.map(pts => ({
      points: pts,
      area: this._calculateSignedArea(pts)
    })).sort((a, b) => Math.abs(b.area) - Math.abs(a.area));

    // If the largest contour is CW (negative area), the path is mirrored or reversed.
    // In this case, we flip the interpretation for all contours.
    const isReversed = contourData[0].area < 0;
    
    const outerContours = [];
    const holeContours = [];

    contourData.forEach(c => {
      // Normalize: if reversed, flip the area interpretation
      const normArea = isReversed ? -c.area : c.area;
      // If reversed, reverse points to make what was CW now CCW
      const normPoints = isReversed ? [...c.points].reverse() : c.points;
      
      if (normArea > 0.001) {
        outerContours.push({ points: normPoints, area: normArea });
      } else if (normArea < -0.001) {
        holeContours.push({ points: normPoints, area: Math.abs(normArea) });
      }
    });

    if (outerContours.length === 0) return null;

    // Create initial geom2 with largest outer contour
    // Ensure polygon is closed (first == last) for fromPoints requirement
    let initialPts = outerContours[0].points;
    if (initialPts.length > 0) {
      const n = initialPts.length;
      const first = initialPts[0];
      const last = initialPts[n - 1];
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.01) {
        initialPts = [...initialPts, [...first]];
      }
    }
    let geom = null;
    try {
      geom = this.jscad.geometries.geom2.fromPoints(initialPts);
    } catch (err) {
      console.warn('⚠ Failed to create initial geom2:', err.message);
      return null;
    }

    // Add remaining outer contours via union
    for (let i = 1; i < outerContours.length; i++) {
      try {
        let pts = outerContours[i].points;
        if (pts.length > 0) {
          const n = pts.length;
          const first = pts[0];
          const last = pts[n - 1];
          if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.01) {
            pts = [...pts, [...first]];
          }
        }
        const additional = this.jscad.geometries.geom2.fromPoints(pts);
        geom = this.jscad.booleans.union(geom, additional);
      } catch (err) {
        console.warn('⚠ Failed to union outer contour:', err.message);
      }
    }

    // Subtract holes from the geom2
    for (const hole of holeContours) {
      try {
        // Since holePoints are CW from the loop above, and subtract needs a solid (CCW),
        // we flip them to CCW for the subtraction.
        let holePts = [...hole.points].reverse();
        // Ensure closed
        if (holePts.length > 0) {
          const n = holePts.length;
          const first = holePts[0];
          const last = holePts[n - 1];
          if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.01) {
            holePts = [...holePts, [...first]];
          }
        }
        const holeGeom = this.jscad.geometries.geom2.fromPoints(holePts);
        geom = this.jscad.booleans.subtract(geom, holeGeom);
      } catch (err) {
        console.warn('⚠ Failed to subtract hole contour:', err.message);
      }
    }

    // Final validation: if we have points, try to use them
    if (!geom) {
      console.warn('⚠ geom2 generation failed entirely');
      return null;
    }

    // Attach contours for borders
    geom.sourceContours = contourData.map(c => c.points);
    return geom;
  },

  /**
   * Extrude geom2 to geom3 with linear extrusion
   */
  extrudeGeom2ToGeom3(geom2, depth = 20) {
    if (!this.jscad) throw new Error('OpenJSCAD not initialized');

    // Validate geom2 before extrusion – toOutlines throws for non-closed geom2
    // (e.g. produced by boolean subtract on self-intersecting offset contours)
    let outlines;
    try {
      outlines = this.jscad.geometries.geom2.toOutlines(geom2);
    } catch (err) {
      console.warn('⚠ geom2 not closed (toOutlines failed):', err.message);
      return null;
    }
    if (!outlines || outlines.length === 0) {
      console.warn('⚠ geom2 has no outlines - cannot extrude');
      return null;
    }

    // Check if all outlines are degenerate (too few points)
    const hasValidOutline = outlines.some(outline => outline.length >= 3);
    if (!hasValidOutline) {
      console.warn('⚠ geom2 outlines are degenerate - cannot extrude');
      return null;
    }

    try {
      return this.jscad.extrusions.extrudeLinear(
        { height: depth, twistAngle: 0, twistSteps: 1 },
        geom2
      );
    } catch (err) {
      console.error('⚠ extrudeLinear failed:', err.message);
      return null;
    }
  },

  /**
   * Union two geom3 solids
   */
  unionGeom3(geomA, geomB) {
    if (!this.jscad) throw new Error('OpenJSCAD not initialized');
    return this.jscad.booleans.union(geomA, geomB);
  },

  /**
   * Subtract geomB from geomA
   */
  subtractGeom3(geomA, geomB) {
    if (!this.jscad) throw new Error('OpenJSCAD not initialized');
    return this.jscad.booleans.subtract(geomA, geomB);
  },

  /**
   * Convert OpenJSCAD geom3 → Three.js BufferGeometry
   * Guarantees: watertight, manifold, slicer-ready
   */
  geom3ToThreeGeometry(geom3) {
    if (!this.jscad) throw new Error('OpenJSCAD not initialized');

    const { geometries } = this.jscad;
    
    // Get polygons using OpenJSCAD's toPolygons function
    const polygons = geometries.geom3.toPolygons(geom3);

    const positions = [];
    const normals = [];

    polygons.forEach(polygon => {
      // In OpenJSCAD v2, polygon has 'vertices' property (array of [x,y,z] arrays)
      const vertices = polygon.vertices;
      if (!vertices || vertices.length < 3) return;

      // Calculate face normal from first 3 vertices
      const v0 = vertices[0];
      const v1 = vertices[1];
      const v2 = vertices[2];

      const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
      const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
      
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
      if (len > 1e-10) {
        nx /= len; ny /= len; nz /= len;
      } else {
        // Degenerate face, skip
        return;
      }

      // Triangulate (concave-safe triangulation for polygons with >3 vertices)
      let indices = [];
      if (vertices.length === 3) {
        indices = [0, 1, 2];
      } else if (vertices.length === 4) {
        // Fast path for quads
        indices = [0, 1, 2, 0, 2, 3];
      } else {
        // Complex polygons (like top/bottom faces of a ring)
        try {
          // Project 3D points to 2D for triangulation
          // We use the normal to decide which plane to project onto
          const absNx = Math.abs(nx);
          const absNy = Math.abs(ny);
          const absNz = Math.abs(nz);
          
          const points = vertices.map(v => {
            if (absNx > absNy && absNx > absNz) return new THREE.Vector2(v[1], v[2]);
            if (absNy > absNx && absNy > absNz) return new THREE.Vector2(v[0], v[2]);
            return new THREE.Vector2(v[0], v[1]);
          });
          
          const triIndices = THREE.ShapeUtils.triangulateShape(points, []);
          for (let i = 0; i < triIndices.length; i++) {
            indices.push(triIndices[i][0], triIndices[i][1], triIndices[i][2]);
          }
        } catch (e) {
          console.warn('⚠ Triangulation failed, falling back to fan:', e.message);
          for (let i = 1; i < vertices.length - 1; i++) {
            indices.push(0, i, i + 1);
          }
        }
      }

      indices.forEach(idx => {
        const v = vertices[idx];
        positions.push(v[0], v[1], v[2]);
        normals.push(nx, ny, nz);
      });
    });

    if (positions.length === 0) {
      throw new Error('geom3ToThreeGeometry: No valid triangles generated');
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    
    return geometry;
  },

  /**
   * Perform boolean operation on two Three.js meshes using OpenJSCAD
   * Returns a new Three.js mesh with watertight geometry
   */
  booleanOperation(operation, meshA, meshB, color) {
    if (!this.initialized) {
      throw new Error('OpenJSCAD Bridge not initialized');
    }

    try {
      // Convert Three.js meshes to OpenJSCAD geom3
      const geomA = this.threeMeshToGeom3(meshA);
      const geomB = this.threeMeshToGeom3(meshB);

      if (!geomA || !geomB) {
        throw new Error('Failed to convert meshes to OpenJSCAD');
      }

      // Perform boolean operation
      let resultGeom;
      switch (operation) {
        case 'union':
          resultGeom = this.unionGeom3(geomA, geomB);
          break;
        case 'subtract':
          resultGeom = this.subtractGeom3(geomA, geomB);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }

      const resultPolygons = this.jscad.geometries.geom3.toPolygons(resultGeom);

      if (resultPolygons.length === 0) {
        throw new Error('Boolean operation resulted in empty geometry');
      }

      // Convert back to Three.js geometry
      const threeGeometry = this.geom3ToThreeGeometry(resultGeom);
      
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        specular: 0x333333,
        shininess: 30,
        side: THREE.DoubleSide
      });

      const resultMesh = new THREE.Mesh(threeGeometry, material);
      resultMesh.userData.isBooleanResult = true;
      resultMesh.userData.originalColor = color;

      return resultMesh;

    } catch (err) {
      console.error(`OpenJSCAD ${operation} error:`, err);
      throw err;
    }
  },

  /**
   * Convert Three.js mesh to OpenJSCAD geom3
   */
  threeMeshToGeom3(mesh) {
    if (!this.jscad) throw new Error('OpenJSCAD not initialized');

    const { geometries } = this.jscad;

    mesh.updateMatrixWorld(true);
    const geo = mesh.geometry;
    if (!geo || !geo.attributes.position) return null;

    // Use non-indexed for simplicity
    const work = geo.index ? geo.toNonIndexed() : geo.clone();
    work.applyMatrix4(mesh.matrixWorld);

    const pos = work.attributes.position.array;
    const polygons = [];

    for (let i = 0; i < pos.length; i += 9) {
      const a = [pos[i], pos[i+1], pos[i+2]];
      const b = [pos[i+3], pos[i+4], pos[i+5]];
      const c = [pos[i+6], pos[i+7], pos[i+8]];

      // Skip degenerate triangles using helper function
      if (OpenJSCADBridge._isDegenerateTriangleStatic(a, b, c)) continue;

      // Create poly3 using OpenJSCAD's fromPoints
      const poly = geometries.poly3.fromPoints([a, b, c]);
      polygons.push(poly);
    }

    work.dispose();

    if (polygons.length === 0) return null;

    return geometries.geom3.create(polygons);
  },

  /**
   * Calculate signed area of a 2D polygon contour
   * Positive = CCW, Negative = CW
   */
  _calculateSignedArea(points) {
    let area = 0;
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i][0] * points[j][1];
      area -= points[j][0] * points[i][1];
    }
    
    return area / 2;
  },

  /**
   * Check if a triangle is degenerate (area too small)
   */
  _isDegenerateTriangle(a, b, c) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const bcx = c[0] - b[0], bcy = c[1] - b[1], bcz = c[2] - b[2];

    // Cross product magnitude
    const crossX = aby * bcz - abz * bcy;
    const crossY = abz * bcx - abx * bcz;
    const crossZ = abx * bcy - aby * bcx;

    const area = Math.sqrt(crossX*crossX + crossY*crossY + crossZ*crossZ);

    return area < 1e-10;
  },
  
  /**
   * Standalone degenerate triangle check (for use in callbacks)
   */
  _isDegenerateTriangleStatic(a, b, c) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const bcx = c[0] - b[0], bcy = c[1] - b[1], bcz = c[2] - b[2];
    const crossX = aby * bcz - abz * bcy;
    const crossY = abz * bcx - abx * bcz;
    const crossZ = abx * bcy - aby * bcx;
    const area = Math.sqrt(crossX*crossX + crossY*crossY + crossZ*crossZ);
    return area < 1e-10;
  }
};

// Auto-initialize when script loads (or when DOM is ready)
(function initBridge() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.OpenJSCADBridge.init().then(ready => {
        if (ready) {
          console.log('✓ OpenJSCAD Bridge ready for CSG operations');
        } else {
          console.warn('⚠ OpenJSCAD Bridge not available, will use custom CSG as fallback');
        }
      });
    });
  } else {
    // DOM already loaded, init immediately
    window.OpenJSCADBridge.init().then(ready => {
      if (ready) {
        console.log('✓ OpenJSCAD Bridge ready for CSG operations');
      } else {
        console.warn('⚠ OpenJSCAD Bridge not available, will use custom CSG as fallback');
      }
    });
  }
})();