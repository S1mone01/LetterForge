# OpenJSCAD Integration Guide

## Overview

This project now uses **OpenJSCAD (@jscad/modeling)** as the primary CSG engine for 3D boolean operations, replacing the custom BufferGeometry-based CSG implementation. OpenJSCAD produces **watertight, manifold meshes** suitable for 3D printing slicers.

## Architecture

### Before (Legacy CSG)
```
SVG Path → THREE.ExtrudeGeometry → BufferGeometry
                                 ↓
                    Custom CSG on triangles (non-manifold)
                                 ↓
                    Holes, errors in slicers ❌
```

### After (OpenJSCAD)
```
SVG Path → OpenJSCAD geom2 → extrudeLinear → geom3
                                 ↓
                    Boolean ops in OpenJSCAD ONLY
                                 ↓
                    Convert geom3 → Three.js BufferGeometry
                                 ↓
                    Watertight, manifold, slicer-ready ✓
```

## Key Changes

### 1. **Dependencies Added**
- `@jscad/modeling` v2.13.0 - OpenJSCAD CSG engine

### 2. **Files Modified**

#### `package.json`
- Added `@jscad/modeling` dependency

#### `preload.js`
- Loads OpenJSCAD from node_modules via Electron's `require()`
- Exposes `loadOpenJSCAD()` API to renderer process

#### `src/index.html`
- **OpenJSCADBridge** object (lines ~18-426):
  - `parseSVGPathToGeom2()` - Converts SVG paths to OpenJSCAD 2D geometry
  - `extrudeGeom2ToGeom3()` - Extrudes 2D to 3D solid
  - `unionGeom3()`, `subtractGeom3()` - Boolean operations
  - `geom3ToThreeGeometry()` - Converts OpenJSCAD to Three.js geometry
  - `booleanOperation()` - High-level API for union/subtract
  
- **union3DObjects()** (lines ~5980-6160):
  - Tries OpenJSCAD first
  - Falls back to legacy CSG if OpenJSCAD unavailable
  - Shows toast notification indicating which engine was used

- **subtract3DObjects()** (lines ~6160-6320):
  - Same OpenJSCAD-first approach with legacy fallback

- **build3DObjects()** (lines ~5210-5340):
  - Uses OpenJSCAD for extrusion when available
  - Creates watertight meshes from SVG paths
  - Falls back to THREE.ExtrudeGeometry if needed

### 3. **Legacy CSG Preserved**
The custom CSG library is **still available** as a fallback when OpenJSCAD is not loaded. This ensures:
- Backward compatibility
- Graceful degradation
- No breaking changes

## How It Works

### SVG Path → OpenJSCAD geom2 Conversion

```javascript
window.OpenJSCADBridge.parseSVGPathToGeom2(pathD)
```

**Supported SVG Commands:**
- `M` - Move to
- `L` - Line to
- `H` - Horizontal line
- `V` - Vertical line
- `C` - Cubic bezier (approximated with 12 segments)
- `Q` - Quadratic bezier (approximated with 8 segments)
- `Z` - Close path

**Hole Detection:**
- Outer contours detected by **counter-clockwise (CCW)** winding (positive signed area)
- Hole contours detected by **clockwise (CW)** winding (negative signed area)
- Holes are subtracted from outer contours using OpenJSCAD's `subtract()`

### Extrusion to 3D

```javascript
const geom3 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2, depth)
```

Uses OpenJSCAD's `extrudeLinear()` with:
- `height`: Extrusion depth (default: 20)
- `twistAngle`: 0 (no twist)
- `twistSteps`: 1

### Boolean Operations

```javascript
// Union
const result = window.OpenJSCADBridge.unionGeom3(geomA, geomB)

// Subtract
const result = window.OpenJSCADBridge.subtractGeom3(geomA, geomB)
```

Operations are performed **entirely in OpenJSCAD** using BSP trees, ensuring:
- ✓ Watertight output
- ✓ Manifold geometry
- ✓ No duplicate triangles
- ✓ Proper vertex welding

### Conversion to Three.js

```javascript
const threeGeometry = window.OpenJSCADBridge.geom3ToThreeGeometry(geom3)
```

**Process:**
1. Extract polygons from OpenJSCAD geom3
2. Calculate face normals for each polygon
3. Triangulate using fan triangulation
4. Create THREE.BufferGeometry with position + normal attributes

**Result:**
- Flat shading (most slicer-compatible)
- Double-sided rendering
- Preserves watertight property

## Usage Examples

### Manual Boolean Operation

```javascript
// Get two selected meshes
const meshA = threeSelectionOrder[0]
const meshB = threeSelectionOrder[1]

// Perform union with OpenJSCAD
if (window.OpenJSCADBridge.initialized) {
  const resultMesh = window.OpenJSCADBridge.booleanOperation('union', meshA, meshB, 0xff0000)
  
  // Add to scene
  threeScene.add(resultMesh)
  threeMeshes.push(resultMesh)
}
```

### Manual SVG to 3D

```javascript
const pathD = 'M0,0 L100,0 L100,100 L0,100 Z'  // Square

// Convert to OpenJSCAD
const geom2 = window.OpenJSCADBridge.parseSVGPathToGeom2(pathD)
const geom3 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2, 20)

// Convert to Three.js
const geometry = window.OpenJSCADBridge.geom3ToThreeGeometry(geom3)
const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 })
const mesh = new THREE.Mesh(geometry, material)
```

## Verification

### Check OpenJSCAD Status

Open browser console (Ctrl+Shift+I) and look for:
```
✓ OpenJSCAD modeling loaded in preload
✓ OpenJSCAD Bridge initialized
✓ OpenJSCAD Bridge ready for CSG operations
```

If you see warnings instead:
```
⚠ OpenJSCAD not available, will use custom CSG as fallback
```

This means the legacy CSG will be used (still functional, but may produce non-manifold meshes).

### Test Watertight Mesh

1. Launch app: `npm start`
2. Add text or SVG elements
3. Open 3D preview
4. Select 2 objects (Shift+click)
5. Click **Union** or **Subtract** button

**Expected output:**
```
✓ Using OpenJSCAD for union operation
✓ OpenJSCAD: Created watertight solid from SVG path
✓ Union done: 1234 triangles, watertight: true
```

**Fallback output:**
```
⚠ OpenJSCAD not available, using legacy CSG
```

### Export to STL

1. After boolean operations, click **Export STL**
2. Open exported file in slicer (PrusaSlicer, Cura, Bambu Studio)
3. Verify:
   - ✓ No "non-manifold" errors
   - ✓ No "holes" warnings
   - ✓ Proper slicing preview

## Troubleshooting

### OpenJSCAD Not Loading

**Symptom:** Console shows "OpenJSCAD not available"

**Solutions:**
1. Verify installation: `npm list @jscad/modeling`
2. Reinstall: `npm install`
3. Check preload.js for errors in main process console

### Boolean Operation Fails

**Symptom:** "Boolean operation resulted in empty geometry"

**Causes:**
- Meshes don't overlap (subtract)
- Invalid geometry (self-intersecting SVG paths)

**Solution:**
- Ensure objects intersect before boolean operation
- Simplify complex SVG paths

### Non-Manifold Output

**Symptom:** Slicer still shows errors

**This should NOT happen with OpenJSCAD!** Verify:
1. OpenJSCAD is actually being used (check console logs)
2. Toast message says "(OpenJSCAD)" not "(legacy CSG)"
3. Mesh has `userData.isJSCAD = true`

## Performance Notes

### OpenJSCAD vs Legacy CSG

| Metric | OpenJSCAD | Legacy CSG |
|--------|-----------|------------|
| Watertight | ✓ Yes | ✗ Sometimes |
| Manifold | ✓ Yes | ✗ No |
| Speed | Medium | Fast |
| Memory | Higher | Lower |
| Slicer-compatible | ✓ Yes | ✗ No |

### When to Use Which

**OpenJSCAD (Default):**
- 3D printing / STL export
- Boolean operations (union/subtract)
- When watertight mesh is required

**Legacy CSG (Fallback):**
- Quick visualization only
- When OpenJSCAD fails to load
- Simple operations where manifold isn't critical

## Future Improvements

Potential enhancements:
- [ ] Add `intersect` operation UI button
- [ ] Support beveled extrusion in OpenJSCAD
- [ ] Batch multiple boolean operations
- [ ] Add mesh validation before export
- [ ] Integrate `manifold-3d` library as alternative engine

## References

- **OpenJSCAD Docs:** https://openjscad.xyz/docs/
- **@jscad/modeling NPM:** https://www.npmjs.com/package/@jscad/modeling
- **OpenJSCAD GitHub:** https://github.com/jscad/OpenJSCAD.org
- **CSG Tutorial:** https://openjscad.xyz/docs/tutorial-02_modelingBasics.html

## Support

For issues or questions:
1. Check console logs for error messages
2. Verify all dependencies are installed
3. Test with simple shapes first
4. Compare OpenJSCAD vs legacy CSG output

---

**Last Updated:** 2026-04-11
**Version:** 4.1.9
**OpenJSCAD Version:** 2.13.0
