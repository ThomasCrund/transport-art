/**
 * Analyzes SVG outline paths from map data
 * Calculates angles between lines, points, and segment lengths
 */

function parseOutlinePath(pathString) {
  // Remove M, Z and split by spaces
  const cleaned = pathString.replace(/[MZ]/g, "").trim();
  const values = cleaned.split(/\s+/).map(Number);

  const points = [];
  for (let i = 0; i < values.length; i += 2) {
    points.push({ x: values[i], y: values[i + 1] });
  }

  return points;
}

function calculateDistance(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function calculateAngle(p1, p2) {
  // Angle of line from p1 to p2 in degrees
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
}

function calculateAngleBetweenLines(p1, p2, p3) {
  // Angle between line (p1->p2) and line (p2->p3)
  const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);

  let angleDiff = (angle2 - angle1) * (180 / Math.PI);

  // Normalize to -180 to 180
  while (angleDiff > 180) angleDiff -= 360;
  while (angleDiff < -180) angleDiff += 360;

  return angleDiff;
}

function calculateCentroid(points) {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), {
    x: 0,
    y: 0,
  });
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

function analyzeOutlinePath(data) {
  const points = parseOutlinePath(data.outlinePath);

  // Close the path by adding first point at end for calculations
  const closedPoints = [...points, points[0]];

  // The center point from data (x, y) - typically the LED position
  const dataCenter = { x: data.x, y: data.y };

  // Calculate start-to-center and center-to-end metrics
  const startToCenter = {
    length: calculateDistance(data.startPoint, dataCenter),
    angle: calculateAngle(data.startPoint, dataCenter),
  };

  const centerToEnd = {
    length: calculateDistance(dataCenter, data.endPoint),
    angle: calculateAngle(dataCenter, data.endPoint),
  };

  const result = {
    id: data.id,
    originalAngle: data.angle,

    // Key points from data
    dataStartPoint: data.startPoint,
    dataCenter: dataCenter,
    dataEndPoint: data.endPoint,

    // Calculated metrics for start -> center -> end
    startToCenter: startToCenter,
    centerToEnd: centerToEnd,

    // Key points from outline path
    outlineStartPoint: points[0],
    outlineCentrePoint: calculateCentroid(points),
    outlineEndPoint: points[points.length - 1],

    // All vertices
    vertices: points,

    // Line segments with lengths and angles
    segments: [],

    // Angles at each vertex (between adjacent lines)
    vertexAngles: [],
  };

  // Calculate segment lengths and angles
  for (let i = 0; i < closedPoints.length - 1; i++) {
    const p1 = closedPoints[i];
    const p2 = closedPoints[i + 1];

    result.segments.push({
      from: i,
      to: (i + 1) % points.length,
      fromPoint: p1,
      toPoint: p2,
      length: calculateDistance(p1, p2),
      angle: calculateAngle(p1, p2),
    });
  }

  // Calculate angles at each vertex (between incoming and outgoing lines)
  for (let i = 0; i < points.length; i++) {
    const prevIdx = (i - 1 + points.length) % points.length;
    const nextIdx = (i + 1) % points.length;

    const p1 = points[prevIdx];
    const p2 = points[i];
    const p3 = points[nextIdx];

    result.vertexAngles.push({
      vertexIndex: i,
      vertex: p2,
      angleBetweenLines: calculateAngleBetweenLines(p1, p2, p3),
      interiorAngle: 180 - Math.abs(calculateAngleBetweenLines(p1, p2, p3)),
    });
  }

  // Calculate total perimeter
  result.totalPerimeter = result.segments.reduce(
    (sum, seg) => sum + seg.length,
    0,
  );

  return result;
}

function formatOutput(analysis) {
  console.log("=".repeat(60));
  console.log(`Analysis for: ${analysis.id}`);
  console.log("=".repeat(60));

  console.log("\n--- Data Points (startPoint, x/y, endPoint) ---");
  console.log(
    `Start Point:  (${analysis.dataStartPoint.x.toFixed(3)}, ${analysis.dataStartPoint.y.toFixed(3)})`,
  );
  console.log(
    `Center (x,y): (${analysis.dataCenter.x.toFixed(3)}, ${analysis.dataCenter.y.toFixed(3)})`,
  );
  console.log(
    `End Point:    (${analysis.dataEndPoint.x.toFixed(3)}, ${analysis.dataEndPoint.y.toFixed(3)})`,
  );

  console.log("\n--- Start → Center → End Metrics ---");
  console.log(
    `Start → Center: Length = ${analysis.startToCenter.length.toFixed(3)}, Angle = ${analysis.startToCenter.angle.toFixed(3)}°`,
  );
  console.log(
    `Center → End:   Length = ${analysis.centerToEnd.length.toFixed(3)}, Angle = ${analysis.centerToEnd.angle.toFixed(3)}°`,
  );

  console.log("\n--- Outline Path Key Points ---");
  console.log(
    `Outline Start:  (${analysis.outlineStartPoint.x.toFixed(3)}, ${analysis.outlineStartPoint.y.toFixed(3)})`,
  );
  console.log(
    `Outline Centre: (${analysis.outlineCentrePoint.x.toFixed(3)}, ${analysis.outlineCentrePoint.y.toFixed(3)})`,
  );
  console.log(
    `Outline End:    (${analysis.outlineEndPoint.x.toFixed(3)}, ${analysis.outlineEndPoint.y.toFixed(3)})`,
  );

  console.log("\n--- All Vertices ---");
  analysis.vertices.forEach((v, i) => {
    console.log(`  Vertex ${i}: (${v.x.toFixed(3)}, ${v.y.toFixed(3)})`);
  });

  console.log("\n--- Segment Lengths & Angles ---");
  analysis.segments.forEach((seg, i) => {
    console.log(
      `  Segment ${i} (${seg.from} → ${seg.to}): Length = ${seg.length.toFixed(3)}, Angle = ${seg.angle.toFixed(3)}°`,
    );
  });

  console.log("\n--- Angles Between Lines at Each Vertex ---");
  analysis.vertexAngles.forEach((va) => {
    console.log(
      `  Vertex ${va.vertexIndex}: Turn angle = ${va.angleBetweenLines.toFixed(3)}°, Interior angle = ${va.interiorAngle.toFixed(3)}°`,
    );
  });

  console.log(`\n--- Summary ---`);
  console.log(`Total Perimeter: ${analysis.totalPerimeter.toFixed(3)}`);
  console.log(`Original angle from data: ${analysis.originalAngle}°`);
  console.log("");
}

// Example usage with the provided data
const sampleData = {
  id: "path764",
  x: 748.998,
  y: 1532.1184,
  angle: 7.317021751568053,
  ledCount: 1,
  width: 42.3373322749,
  height: 78.36533137420001,
  outlinePath:
    "M 727.837 1491.472 756.227 1486.043 770.175 1558.977 741.787 1564.408 Z",
  ledPositions: [
    {
      x: 748.998,
      y: 1532.1184,
      id: "path768",
    },
  ],
  startJointId: "joint-6",
  endJointId: "joint-7",
  startPoint: {
    x: 724.2015837562079,
    y: 1528.934417986137,
  },
  endPoint: {
    x: 773.7944162437922,
    y: 1535.302382013863,
  },
};

const sampleData2 = {
  id: "path792",
  x: 779.5446666666667,
  y: 1688.4327,
  angle: 79.17251721860893,
  ledCount: 3,
  width: 70.7373315649,
  height: 226.85332766200003,
  outlinePath:
    "M 744.185 1573.541 772.575 1568.111 814.923 1789.535 786.535 1794.965 z",
  ledPositions: [
    {
      x: 765.3448,
      y: 1614.1879,
      id: "path796",
    },
    {
      x: 779.54467,
      y: 1688.4327,
      id: "path800",
    },
    {
      x: 793.74453,
      y: 1762.6775,
      id: "path804",
    },
  ],
  startJointId: "joint-10",
  endJointId: "joint-11",
  startPoint: {
    x: 760.6484884537989,
    y: 1589.6329685633002,
  },
  endPoint: {
    x: 798.4408415462011,
    y: 1787.2324314366997,
  },
};

// Run analysis
const analysis = analyzeOutlinePath(sampleData2);
formatOutput(analysis);

// Export for use as ES module
export { analyzeOutlinePath, parseOutlinePath, formatOutput };
