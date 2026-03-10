import { readFileSync, writeFileSync } from 'fs';
import { DOMParser } from '@xmldom/xmldom';

interface PCB {
  id: string;
  x: number;
  y: number;
  angle: number;
  ledCount: number;
  width: number;
  height: number;
  outlinePath: string;  // Pre-transformed path, no transform needed
  ledPositions: { x: number; y: number; id: string }[];
  startJointId: string | null;
  endJointId: string | null;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
}

interface Street {
  id: string;
  d: string;  // Pre-transformed path
  color: string;
  hasLeds: boolean;
}

interface Layer4Path {
  id: string;
  d: string;  // Pre-transformed path
  color: string;
}

interface Joint {
  id: string;
  x: number;
  y: number;
  name?: string;
  connections: {
    pcbId: string;
    end: 'start' | 'end';
  }[];
}

interface MapData {
  viewBox: { width: number; height: number };
  streets: Street[];
  pcbs: PCB[];
  layer4: Layer4Path[];
  joints: Joint[];
}

interface TransformMatrix {
  a: number; b: number; c: number; d: number; e: number; f: number;
}

function parseTransformMatrix(transform: string): TransformMatrix {
  const matrixMatch = transform.match(/matrix\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*\)/);

  if (matrixMatch) {
    return {
      a: parseFloat(matrixMatch[1]),
      b: parseFloat(matrixMatch[2]),
      c: parseFloat(matrixMatch[3]),
      d: parseFloat(matrixMatch[4]),
      e: parseFloat(matrixMatch[5]),
      f: parseFloat(matrixMatch[6])
    };
  }

  // Identity matrix
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

// Apply matrix transform to a point: [a c e] [x]   [ax + cy + e]
//                                    [b d f] [y] = [bx + dy + f]
//                                    [0 0 1] [1]   [1]
function transformPoint(x: number, y: number, m: TransformMatrix): { x: number; y: number } {
  return {
    x: m.a * x + m.c * y + m.e,
    y: m.b * x + m.d * y + m.f
  };
}

// Transform an SVG path by applying the matrix to all coordinates
function transformPath(d: string, m: TransformMatrix): string {
  // Check if path uses relative (lowercase) or absolute (uppercase) commands
  const isRelative = d.trim().startsWith('m');

  // Parse path and transform coordinates
  const parts = d.trim().split(/(?=[mMlLhHvVcCsSqQtTaAzZ])/);
  const transformed: string[] = [];

  let currentX = 0, currentY = 0;

  for (const part of parts) {
    if (!part.trim()) continue;

    const cmd = part[0];
    const coordStr = part.slice(1).trim();

    if (cmd === 'z' || cmd === 'Z') {
      transformed.push(cmd);
      continue;
    }

    const nums = coordStr.split(/[\s,]+/).filter(n => n).map(parseFloat);

    if (cmd === 'M' || cmd === 'm') {
      // Move to - process pairs of coordinates
      const newCoords: number[] = [];
      for (let i = 0; i < nums.length; i += 2) {
        let x = nums[i], y = nums[i + 1];
        if (cmd === 'm' && i > 0) {
          // After first point in relative moveto, subsequent points are relative lineto
          x += currentX;
          y += currentY;
        } else if (cmd === 'm' && i === 0) {
          x += currentX;
          y += currentY;
        }
        const pt = transformPoint(cmd === 'M' || i > 0 ? x : x, cmd === 'M' || i > 0 ? y : y, m);
        if (cmd === 'm' && i === 0) {
          const pt0 = transformPoint(currentX, currentY, m);
          // For relative, we need the transformed point minus transformed origin
          newCoords.push(pt.x, pt.y);
        } else {
          newCoords.push(pt.x, pt.y);
        }
        currentX = cmd === 'M' ? x : currentX + (cmd === 'm' ? nums[i] : 0);
        currentY = cmd === 'M' ? y : currentY + (cmd === 'm' ? nums[i+1] : 0);
      }
      // Always output as absolute M after transform
      transformed.push('M ' + newCoords.map(n => n.toFixed(3)).join(' '));
    } else if (cmd === 'L' || cmd === 'l') {
      const newCoords: number[] = [];
      for (let i = 0; i < nums.length; i += 2) {
        let x = nums[i], y = nums[i + 1];
        if (cmd === 'l') {
          x += currentX;
          y += currentY;
        }
        const pt = transformPoint(x, y, m);
        newCoords.push(pt.x, pt.y);
        currentX = x;
        currentY = y;
      }
      transformed.push('L ' + newCoords.map(n => n.toFixed(3)).join(' '));
    } else if (cmd === 'H' || cmd === 'h') {
      for (const n of nums) {
        const x = cmd === 'H' ? n : currentX + n;
        const pt = transformPoint(x, currentY, m);
        transformed.push('L ' + pt.x.toFixed(3) + ' ' + pt.y.toFixed(3));
        currentX = x;
      }
    } else if (cmd === 'V' || cmd === 'v') {
      for (const n of nums) {
        const y = cmd === 'V' ? n : currentY + n;
        const pt = transformPoint(currentX, y, m);
        transformed.push('L ' + pt.x.toFixed(3) + ' ' + pt.y.toFixed(3));
        currentY = y;
      }
    } else if (cmd === 'C' || cmd === 'c') {
      // Cubic bezier
      const newCoords: number[] = [];
      for (let i = 0; i < nums.length; i += 6) {
        const offX = cmd === 'c' ? currentX : 0;
        const offY = cmd === 'c' ? currentY : 0;
        const p1 = transformPoint(nums[i] + offX, nums[i+1] + offY, m);
        const p2 = transformPoint(nums[i+2] + offX, nums[i+3] + offY, m);
        const p3 = transformPoint(nums[i+4] + offX, nums[i+5] + offY, m);
        newCoords.push(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        currentX = nums[i+4] + offX;
        currentY = nums[i+5] + offY;
      }
      transformed.push('C ' + newCoords.map(n => n.toFixed(3)).join(' '));
    } else if (cmd === 'S' || cmd === 's') {
      // Smooth cubic bezier
      const newCoords: number[] = [];
      for (let i = 0; i < nums.length; i += 4) {
        const offX = cmd === 's' ? currentX : 0;
        const offY = cmd === 's' ? currentY : 0;
        const p2 = transformPoint(nums[i] + offX, nums[i+1] + offY, m);
        const p3 = transformPoint(nums[i+2] + offX, nums[i+3] + offY, m);
        newCoords.push(p2.x, p2.y, p3.x, p3.y);
        currentX = nums[i+2] + offX;
        currentY = nums[i+3] + offY;
      }
      transformed.push('S ' + newCoords.map(n => n.toFixed(3)).join(' '));
    } else if (cmd === 'Q' || cmd === 'q') {
      // Quadratic bezier
      const newCoords: number[] = [];
      for (let i = 0; i < nums.length; i += 4) {
        const offX = cmd === 'q' ? currentX : 0;
        const offY = cmd === 'q' ? currentY : 0;
        const p1 = transformPoint(nums[i] + offX, nums[i+1] + offY, m);
        const p2 = transformPoint(nums[i+2] + offX, nums[i+3] + offY, m);
        newCoords.push(p1.x, p1.y, p2.x, p2.y);
        currentX = nums[i+2] + offX;
        currentY = nums[i+3] + offY;
      }
      transformed.push('Q ' + newCoords.map(n => n.toFixed(3)).join(' '));
    } else {
      // For other commands, just pass through (may not be fully correct)
      transformed.push(part);
    }
  }

  return transformed.join(' ');
}

function parseTransform(transform: string): { tx: number; ty: number; scaleX: number; scaleY: number; yFlipped: boolean; rotation: number } {
  const m = parseTransformMatrix(transform);

  const scaleX = Math.sqrt(m.a * m.a + m.b * m.b);
  const scaleY = Math.sqrt(m.c * m.c + m.d * m.d);
  const yFlipped = m.d < 0;
  const rotation = Math.atan2(m.b, m.a) * (180 / Math.PI);

  return { tx: m.e, ty: m.f, scaleX, scaleY, yFlipped, rotation };
}

// Calculate angle from a pre-transformed path by finding the longest edge
function calculateAngleFromTransformedPath(d: string): number {
  // Parse all vertices from the transformed path (which uses absolute M and L commands)
  const vertices: { x: number; y: number }[] = [];

  // Split into commands
  const parts = d.trim().split(/(?=[MLZmlz])/);

  for (const part of parts) {
    if (!part.trim()) continue;
    const cmd = part[0];
    const coordStr = part.slice(1).trim();

    if (cmd === 'z' || cmd === 'Z') continue;

    const nums = coordStr.split(/[\s,]+/).filter(n => n).map(parseFloat);

    if (cmd === 'M' || cmd === 'L') {
      // Absolute coordinates - process pairs
      for (let i = 0; i < nums.length; i += 2) {
        if (i + 1 < nums.length) {
          vertices.push({ x: nums[i], y: nums[i + 1] });
        }
      }
    }
  }

  if (vertices.length < 2) return 0;

  // Find the longest edge
  let longestLen = 0;
  let longestDx = 0;
  let longestDy = 0;

  for (let i = 0; i < vertices.length; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % vertices.length];

    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len > longestLen) {
      longestLen = len;
      longestDx = dx;
      longestDy = dy;
    }
  }

  return Math.atan2(longestDy, longestDx) * (180 / Math.PI);
}

// Calculate the center of an SVG path in local coordinates by tracing all commands
function getPathCenter(d: string): { x: number; y: number } {
  let x = 0, y = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const trackPoint = (px: number, py: number) => {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  };

  const parts = d.trim().split(/(?=[mMlLhHvVcCsSqQtTaAzZ])/);

  for (const part of parts) {
    if (!part.trim()) continue;
    const cmd = part[0];
    const coordStr = part.slice(1).trim();
    if (cmd === 'z' || cmd === 'Z') continue;

    const nums = coordStr.split(/[\s,]+/).filter(n => n).map(parseFloat);

    if (cmd === 'M') {
      for (let i = 0; i < nums.length; i += 2) { x = nums[i]; y = nums[i+1]; trackPoint(x, y); }
    } else if (cmd === 'm') {
      for (let i = 0; i < nums.length; i += 2) { x += nums[i]; y += nums[i+1]; trackPoint(x, y); }
    } else if (cmd === 'L') {
      for (let i = 0; i < nums.length; i += 2) { x = nums[i]; y = nums[i+1]; trackPoint(x, y); }
    } else if (cmd === 'l') {
      for (let i = 0; i < nums.length; i += 2) { x += nums[i]; y += nums[i+1]; trackPoint(x, y); }
    } else if (cmd === 'H') {
      for (const n of nums) { x = n; trackPoint(x, y); }
    } else if (cmd === 'h') {
      for (const n of nums) { x += n; trackPoint(x, y); }
    } else if (cmd === 'V') {
      for (const n of nums) { y = n; trackPoint(x, y); }
    } else if (cmd === 'v') {
      for (const n of nums) { y += n; trackPoint(x, y); }
    } else if (cmd === 'C') {
      for (let i = 0; i < nums.length; i += 6) {
        trackPoint(nums[i], nums[i+1]); trackPoint(nums[i+2], nums[i+3]);
        x = nums[i+4]; y = nums[i+5]; trackPoint(x, y);
      }
    } else if (cmd === 'c') {
      for (let i = 0; i < nums.length; i += 6) {
        trackPoint(x + nums[i], y + nums[i+1]); trackPoint(x + nums[i+2], y + nums[i+3]);
        x += nums[i+4]; y += nums[i+5]; trackPoint(x, y);
      }
    }
  }

  if (minX === Infinity) return { x: 0, y: 0 };
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function getPathDimensions(d: string): { width: number; height: number } {
  const coords: { x: number; y: number }[] = [];
  let x = 0, y = 0;

  const parts = d.split(/(?=[mMlLzZ])/);

  for (const part of parts) {
    const cmd = part[0];
    const nums = part.slice(1).trim().split(/[\s,]+/).filter(n => n).map(parseFloat);

    if (cmd === 'm' || cmd === 'M') {
      for (let i = 0; i < nums.length; i += 2) {
        if (i === 0) {
          x = cmd === 'm' ? x + nums[i] : nums[i];
          y = cmd === 'm' ? y + nums[i + 1] : nums[i + 1];
        } else {
          x = cmd === 'm' ? x + nums[i] : nums[i];
          y = cmd === 'm' ? y + nums[i + 1] : nums[i + 1];
        }
        coords.push({ x, y });
      }
    }
  }

  if (coords.length < 2) return { width: 0, height: 0 };

  const xs = coords.map(c => c.x);
  const ys = coords.map(c => c.y);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

// Calculate PCB endpoints based on LED positions (first and last LED define the line)
// For single LED PCBs, use the fallback angle to determine direction
function calculatePcbEndpoints(
  ledPositions: { x: number; y: number }[],
  fallbackAngle: number
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  if (ledPositions.length === 0) {
    return { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } };
  }

  const extension = 25; // Extend 25 units beyond LEDs

  if (ledPositions.length === 1) {
    // For single LED PCBs, use the fallback angle
    const led = ledPositions[0];
    const angleRad = fallbackAngle * (Math.PI / 180);
    const ux = Math.cos(angleRad);
    const uy = Math.sin(angleRad);

    return {
      start: {
        x: led.x - ux * extension,
        y: led.y - uy * extension
      },
      end: {
        x: led.x + ux * extension,
        y: led.y + uy * extension
      }
    };
  }

  // First and last LED define the PCB line
  const first = ledPositions[0];
  const last = ledPositions[ledPositions.length - 1];

  // Extend beyond the LEDs to get actual PCB endpoints
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len === 0) {
    // LEDs at same position, use transform rotation
    const angleRad = transformRotation * (Math.PI / 180);
    const ux = Math.cos(angleRad);
    const uy = Math.sin(angleRad);
    return {
      start: {
        x: first.x - ux * extension,
        y: first.y - uy * extension
      },
      end: {
        x: first.x + ux * extension,
        y: first.y + uy * extension
      }
    };
  }

  const ux = dx / len;
  const uy = dy / len;

  return {
    start: {
      x: first.x - ux * extension,
      y: first.y - uy * extension
    },
    end: {
      x: last.x + ux * extension,
      y: last.y + uy * extension
    }
  };
}

function isWhiteFilled(style: string): boolean {
  return style.includes('fill:#ffffff');
}

function hasNoCurves(d: string): boolean {
  return !/[cCsS]/.test(d);
}

function hasCurves(d: string): boolean {
  return /[cC]/.test(d);
}

function parseSVG(svgContent: string): MapData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svg = doc.documentElement;

  const viewBoxAttr = svg.getAttribute('viewBox')?.split(' ').map(parseFloat) || [0, 0, 2645, 2948];

  const result: MapData = {
    viewBox: { width: viewBoxAttr[2], height: viewBoxAttr[3] },
    streets: [],
    pcbs: [],
    layer4: [],
    joints: []
  };

  // Parse layer-MC0 (streets)
  const layerMC0 = doc.getElementById('layer-MC0');
  if (layerMC0) {
    const paths = layerMC0.getElementsByTagName('path');
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const d = path.getAttribute('d') || '';
      const style = path.getAttribute('style') || '';
      const transform = path.getAttribute('transform') || '';
      const id = path.getAttribute('id') || `street-${i}`;

      // Pre-apply transform to path
      const matrix = parseTransformMatrix(transform);
      const transformedPath = transformPath(d, matrix);

      const strokeMatch = style.match(/stroke:(#[0-9a-fA-F]+)/);
      const color = strokeMatch ? strokeMatch[1].toLowerCase() : '#000000';

      const hasLeds = color.startsWith('#f') && (color.includes('5a') || color.includes('59'));

      result.streets.push({ id, d: transformedPath, color, hasLeds });
    }
  }

  // Parse layer-MC3 (PCBs and LEDs)
  const layerMC3 = doc.getElementById('layer-MC3');
  if (layerMC3) {
    const paths = layerMC3.getElementsByTagName('path');

    const allPaths: { el: Element; isWhite: boolean; isRect: boolean; isCircle: boolean }[] = [];

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const d = path.getAttribute('d') || '';
      const style = path.getAttribute('style') || '';

      const isWhite = isWhiteFilled(style);
      const isRect = hasNoCurves(d) && d.toLowerCase().includes('z');
      const isCircle = hasCurves(d);

      allPaths.push({ el: path, isWhite, isRect, isCircle });
    }

    let i = 0;
    while (i < allPaths.length) {
      const current = allPaths[i];

      if (current.isWhite && current.isRect) {
        const pcbPath = current.el;
        const d = pcbPath.getAttribute('d') || '';
        const transform = pcbPath.getAttribute('transform') || '';
        const id = pcbPath.getAttribute('id') || `pcb-${result.pcbs.length}`;

        // Parse and apply transform
        const matrix = parseTransformMatrix(transform);
        const transformedPath = transformPath(d, matrix);
        const transformData = parseTransform(transform);
        const dims = getPathDimensions(d);

        i++;
        if (i < allPaths.length && !allPaths[i].isWhite && allPaths[i].isRect) {
          i++;
        }

        const ledPositions: { x: number; y: number; id: string }[] = [];

        while (i < allPaths.length) {
          const next = allPaths[i];

          if (next.isRect) break;

          if (next.isWhite && next.isCircle) {
            const ledD = next.el.getAttribute('d') || '';
            const ledTransform = next.el.getAttribute('transform') || '';
            const ledMatrix = parseTransformMatrix(ledTransform);
            // Find the center of the LED circle in local coordinates, then transform to world space
            const localCenter = getPathCenter(ledD);
            const worldCenter = transformPoint(localCenter.x, localCenter.y, ledMatrix);
            ledPositions.push({
              x: worldCenter.x,
              y: worldCenter.y,
              id: next.el.getAttribute('id') || ''
            });
          }

          i++;
        }

        const ledCount = ledPositions.length;
        if (ledCount >= 1 && ledCount <= 5) {
          // Calculate PCB center from LED positions
          const centerX = ledPositions.reduce((sum, p) => sum + p.x, 0) / ledCount;
          const centerY = ledPositions.reduce((sum, p) => sum + p.y, 0) / ledCount;

          // Calculate angle from the longest edge of the PCB outline path
          const angle = calculateAngleFromTransformedPath(transformedPath);

          // Calculate endpoints using the path-based angle
          const endpoints = calculatePcbEndpoints(ledPositions, angle);

          result.pcbs.push({
            id,
            x: centerX,
            y: centerY,
            angle,
            ledCount,
            width: dims.width * Math.abs(transformData.scaleX),
            height: dims.height * Math.abs(transformData.scaleY),
            outlinePath: transformedPath,
            ledPositions,
            startJointId: null,
            endJointId: null,
            startPoint: endpoints.start,
            endPoint: endpoints.end
          });
        } else if (ledCount > 0) {
          console.warn(`PCB ${id} has ${ledCount} LEDs (expected 1-5), skipping`);
        }
      } else {
        i++;
      }
    }
  }

  // Parse layer-MC4
  const layerMC4 = doc.getElementById('layer-MC4');
  if (layerMC4) {
    const paths = layerMC4.getElementsByTagName('path');
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const d = path.getAttribute('d') || '';
      const style = path.getAttribute('style') || '';
      const transform = path.getAttribute('transform') || '';
      const id = path.getAttribute('id') || `layer4-${i}`;

      // Pre-apply transform to path
      const matrix = parseTransformMatrix(transform);
      const transformedPath = transformPath(d, matrix);

      const strokeMatch = style.match(/stroke:(#[0-9a-fA-F]+)/);
      const color = strokeMatch ? strokeMatch[1].toLowerCase() : '#000000';

      result.layer4.push({ id, d: transformedPath, color });
    }
  }

  // Auto-detect joints by finding PCB endpoints that are close together
  const JOINT_DISTANCE_THRESHOLD = 50; // PCBs within 50 units are considered connected
  const endpoints: { pcbId: string; end: 'start' | 'end'; x: number; y: number }[] = [];

  for (const pcb of result.pcbs) {
    endpoints.push({ pcbId: pcb.id, end: 'start', x: pcb.startPoint.x, y: pcb.startPoint.y });
    endpoints.push({ pcbId: pcb.id, end: 'end', x: pcb.endPoint.x, y: pcb.endPoint.y });
  }

  // Group endpoints into joints
  const used = new Set<string>();

  for (const ep of endpoints) {
    const epKey = `${ep.pcbId}-${ep.end}`;
    if (used.has(epKey)) continue;

    // Find all endpoints close to this one
    const nearby = endpoints.filter(other => {
      const otherKey = `${other.pcbId}-${other.end}`;
      if (used.has(otherKey)) return false;
      if (other.pcbId === ep.pcbId && other.end === ep.end) return false;

      const dist = Math.sqrt(Math.pow(other.x - ep.x, 2) + Math.pow(other.y - ep.y, 2));
      return dist < JOINT_DISTANCE_THRESHOLD;
    });

    // Create a joint for this endpoint (and any nearby ones)
    const jointId = `joint-${result.joints.length}`;
    const connections = [{ pcbId: ep.pcbId, end: ep.end }];

    // Calculate average position
    let sumX = ep.x;
    let sumY = ep.y;

    for (const other of nearby) {
      connections.push({ pcbId: other.pcbId, end: other.end });
      sumX += other.x;
      sumY += other.y;
      used.add(`${other.pcbId}-${other.end}`);
    }

    const avgX = sumX / connections.length;
    const avgY = sumY / connections.length;

    result.joints.push({
      id: jointId,
      x: avgX,
      y: avgY,
      connections
    });

    // Update PCB joint references
    for (const conn of connections) {
      const pcb = result.pcbs.find(p => p.id === conn.pcbId);
      if (pcb) {
        if (conn.end === 'start') {
          pcb.startJointId = jointId;
        } else {
          pcb.endJointId = jointId;
        }
      }
    }

    used.add(epKey);
  }

  return result;
}

// Main execution
const svgPath = process.argv[2] || '../streetsv2consistentangles.svg';
console.log(`Parsing SVG: ${svgPath}`);

const svgContent = readFileSync(svgPath, 'utf-8');
const data = parseSVG(svgContent);

console.log(`\nExtracted data:`);
console.log(`  Streets: ${data.streets.length}`);
console.log(`    - With LEDs (orange): ${data.streets.filter(s => s.hasLeds).length}`);
console.log(`    - Without LEDs (green): ${data.streets.filter(s => !s.hasLeds).length}`);
console.log(`  PCBs: ${data.pcbs.length}`);
console.log(`  Layer 4 paths: ${data.layer4.length}`);
console.log(`  Joints: ${data.joints.length}`);

// Show PCB LED counts distribution
const ledCounts: Record<number, number> = {};
for (const pcb of data.pcbs) {
  ledCounts[pcb.ledCount] = (ledCounts[pcb.ledCount] || 0) + 1;
}
console.log(`\nPCB LED distribution:`);
Object.entries(ledCounts)
  .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
  .forEach(([count, num]) => {
    console.log(`    ${count} LED${count !== '1' ? 's' : ''}: ${num} PCB${num !== 1 ? 's' : ''}`);
  });

// Total LEDs
const totalLeds = data.pcbs.reduce((sum, pcb) => sum + pcb.ledCount, 0);
console.log(`  Total LEDs: ${totalLeds}`);

// Joint statistics
const jointConnections: Record<number, number> = {};
for (const joint of data.joints) {
  const connCount = joint.connections.length;
  jointConnections[connCount] = (jointConnections[connCount] || 0) + 1;
}
console.log(`\nJoint connections:`);
Object.entries(jointConnections)
  .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
  .forEach(([count, num]) => {
    console.log(`    ${count} PCB${count !== '1' ? 's' : ''}: ${num} joint${num !== 1 ? 's' : ''}`);
  });

// Save to JSON
const outputPath = './public/map_data.json';
writeFileSync(outputPath, JSON.stringify(data, null, 2));
console.log(`\nSaved to ${outputPath}`);
