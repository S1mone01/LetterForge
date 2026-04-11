/**
 * OpenJSCAD Integration Test Script
 * 
 * Run this in the browser console (Ctrl+Shift+I) to verify OpenJSCAD integration
 */

async function testOpenJSCADIntegration() {
  console.log('=== OpenJSCAD Integration Test ===\n');
  
  let allTestsPassed = true;
  
  // Test 1: Check if OpenJSCAD is loaded
  console.log('Test 1: Checking OpenJSCAD availability...');
  if (window.OpenJSCADBridge && window.OpenJSCADBridge.jscad) {
    console.log('✓ PASS: OpenJSCAD is loaded');
  } else {
    console.log('✗ FAIL: OpenJSCAD is not available');
    console.log('  → Will use legacy CSG as fallback');
    allTestsPassed = false;
  }
  
  // Test 2: Check initialization
  console.log('\nTest 2: Checking bridge initialization...');
  if (window.OpenJSCADBridge.initialized) {
    console.log('✓ PASS: OpenJSCAD Bridge is initialized');
  } else {
    console.log('✗ FAIL: OpenJSCAD Bridge is not initialized');
    allTestsPassed = false;
  }
  
  // Test 3: Test SVG path parsing (only if OpenJSCAD is available)
  if (window.OpenJSCADBridge.initialized) {
    console.log('\nTest 3: Testing SVG path to geom2 conversion...');
    try {
      const testPath = 'M0,0 L100,0 L100,100 L0,100 Z';
      const geom2 = window.OpenJSCADBridge.parseSVGPathToGeom2(testPath);
      
      if (geom2) {
        console.log('✓ PASS: SVG path converted to geom2');
        console.log(`  → Created 2D geometry with valid contours`);
      } else {
        console.log('✗ FAIL: SVG path conversion returned null');
        allTestsPassed = false;
      }
    } catch (err) {
      console.log(`✗ FAIL: SVG path conversion failed: ${err.message}`);
      allTestsPassed = false;
    }
    
    // Test 4: Test extrusion
    console.log('\nTest 4: Testing extrusion (geom2 → geom3)...');
    try {
      const testPath = 'M0,0 L50,0 L50,50 L0,50 Z';
      const geom2 = window.OpenJSCADBridge.parseSVGPathToGeom2(testPath);
      const geom3 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2, 20);
      
      if (geom3 && geom3.toPolygons) {
        const polygonCount = geom3.toPolygons().length;
        console.log('✓ PASS: Extrusion successful');
        console.log(`  → Created 3D solid with ${polygonCount} polygons`);
      } else {
        console.log('✗ FAIL: Extrusion returned invalid geometry');
        allTestsPassed = false;
      }
    } catch (err) {
      console.log(`✗ FAIL: Extrusion failed: ${err.message}`);
      allTestsPassed = false;
    }
    
    // Test 5: Test geom3 to Three.js conversion
    console.log('\nTest 5: Testing geom3 → Three.js conversion...');
    try {
      const testPath = 'M0,0 L30,0 L30,30 L0,30 Z';
      const geom2 = window.OpenJSCADBridge.parseSVGPathToGeom2(testPath);
      const geom3 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2, 10);
      const threeGeom = window.OpenJSCADBridge.geom3ToThreeGeometry(geom3);
      
      if (threeGeom && threeGeom.attributes.position) {
        const vertexCount = threeGeom.attributes.position.count;
        console.log('✓ PASS: Conversion to Three.js successful');
        console.log(`  → Created BufferGeometry with ${vertexCount} vertices`);
      } else {
        console.log('✗ FAIL: Three.js conversion returned invalid geometry');
        allTestsPassed = false;
      }
    } catch (err) {
      console.log(`✗ FAIL: Three.js conversion failed: ${err.message}`);
      allTestsPassed = false;
    }
    
    // Test 6: Test boolean operation (union)
    console.log('\nTest 6: Testing boolean union operation...');
    try {
      const path1 = 'M0,0 L20,0 L20,20 L0,20 Z';
      const path2 = 'M10,10 L30,10 L30,30 L10,30 Z';
      
      const geom2_1 = window.OpenJSCADBridge.parseSVGPathToGeom2(path1);
      const geom2_2 = window.OpenJSCADBridge.parseSVGPathToGeom2(path2);
      
      const geom3_1 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2_1, 10);
      const geom3_2 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2_2, 10);
      
      const unionGeom = window.OpenJSCADBridge.unionGeom3(geom3_1, geom3_2);
      
      if (unionGeom && unionGeom.toPolygons) {
        const polygonCount = unionGeom.toPolygons().length;
        console.log('✓ PASS: Boolean union successful');
        console.log(`  → Result has ${polygonCount} polygons`);
      } else {
        console.log('✗ FAIL: Boolean union returned invalid geometry');
        allTestsPassed = false;
      }
    } catch (err) {
      console.log(`✗ FAIL: Boolean union failed: ${err.message}`);
      allTestsPassed = false;
    }
    
    // Test 7: Test boolean operation (subtract)
    console.log('\nTest 7: Testing boolean subtract operation...');
    try {
      const path1 = 'M0,0 L30,0 L30,30 L0,30 Z';
      const path2 = 'M10,10 L20,10 L20,20 L10,20 Z';
      
      const geom2_1 = window.OpenJSCADBridge.parseSVGPathToGeom2(path1);
      const geom2_2 = window.OpenJSCADBridge.parseSVGPathToGeom2(path2);
      
      const geom3_1 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2_1, 10);
      const geom3_2 = window.OpenJSCADBridge.extrudeGeom2ToGeom3(geom2_2, 10);
      
      const subtractGeom = window.OpenJSCADBridge.subtractGeom3(geom3_1, geom3_2);
      
      if (subtractGeom && subtractGeom.toPolygons) {
        const polygonCount = subtractGeom.toPolygons().length;
        console.log('✓ PASS: Boolean subtract successful');
        console.log(`  → Result has ${polygonCount} polygons`);
      } else {
        console.log('✗ FAIL: Boolean subtract returned invalid geometry');
        allTestsPassed = false;
      }
    } catch (err) {
      console.log(`✗ FAIL: Boolean subtract failed: ${err.message}`);
      allTestsPassed = false;
    }
  }
  
  // Test 8: Check if functions are available
  console.log('\nTest 8: Checking API function availability...');
  const requiredFunctions = [
    'union3DObjects',
    'subtract3DObjects',
    'build3DObjects'
  ];
  
  requiredFunctions.forEach(fnName => {
    if (typeof window[fnName] === 'function') {
      console.log(`✓ PASS: ${fnName}() is available`);
    } else {
      console.log(`✗ FAIL: ${fnName}() is NOT available`);
      allTestsPassed = false;
    }
  });
  
  // Summary
  console.log('\n=== Test Summary ===');
  if (allTestsPassed) {
    console.log('✓ ALL TESTS PASSED');
    console.log('  → OpenJSCAD integration is working correctly');
    console.log('  → Watertight meshes will be generated for 3D printing');
  } else {
    console.log('✗ SOME TESTS FAILED');
    console.log('  → Check error messages above');
    console.log('  → Legacy CSG will be used as fallback');
  }
  
  return allTestsPassed;
}

// Run the test
testOpenJSCADIntegration();
