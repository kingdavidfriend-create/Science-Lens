let bodies = [];
let zones = [];
let fxEffects = []; // New visual flash FX container
let mode;
let seed;
let paused = false;
let showVectors = false;
let showEnergy = false;
let showTrails = true;
let showZones = true;
let bounceMode = false; // New physics state toggle
let simSpeed = 1.0;
let G = 0.5;
let kCoulomb = 5.0;
let softening = 10;
let damping = 1.0;
let mergeThreshold = 1.0;
let integrationMethod = 'SEMI_EULER';
let timeStep = 1.0;
let frameCount = 0;
let totalKE = 0;
let totalPE = 0;
let systemEnergy = 0;
let colorScheme = 'mass';
let trailLength = 50;
let camera = { x: 0, y: 0, zoom: 1.0 };
let draggingBody = null;
let mouseVel = null;
let trackedBody = null;

const MODES = {
  SOLAR: {
    name: "Solar System",
    G: 0.5,
    kCoulomb: 0,
    softening: 10,
    damping: 1.0,
    integration: 'SEMI_EULER',
    spawnPreset: 'solar',
    colorScheme: 'realistic',
    trailLength: 100,
    description: "Stable orbital mechanics with realistic mass ratios. Gravity only.",
  },
  CHAOS: {
    name: "Chaotic Field",
    G: 2.0,
    kCoulomb: 3.0,
    softening: 2,
    damping: 0.98,
    integration: 'RK4',
    spawnPreset: 'random',
    colorScheme: 'charge',
    trailLength: 30,
    description: "High-energy random initial conditions. Mixed gravity and EM.",
  }
};

let modeKeys = ['SOLAR', 'CHAOS'];
let currentModeIndex = 0;

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.elt.oncontextmenu = () => false; 
  textFont('monospace');

  seed = floor(random(100000));
  randomSeed(seed);
  noiseSeed(seed);

  switchMode('SOLAR');
  zones.push(new DragPool(width/2, height/2, 150, 0.02));
}

function draw() {
  if (trackedBody) {
    if (!bodies.includes(trackedBody)) {
      trackedBody = null;
    } else {
      camera.x = lerp(camera.x, width / 2 - trackedBody.position.x, 0.1);
      camera.y = lerp(camera.y, height / 2 - trackedBody.position.y, 0.1);
    }
  }

  background(5, 5, 15);

  if (!paused) {
    for (let s = 0; s < simSpeed; s++) {
      updatePhysics();
      frameCount++;
    }
  }

  push();
  translate(width/2 + camera.x, height/2 + camera.y);
  scale(camera.zoom);
  translate(-width/2, -height/2);

  if (showZones) {
    for (let z of zones) z.display();
  }
  
  if (showTrails) {
    for (let b of bodies) {
      if (b.trail) b.trail.display();
    }
  }

  if (showVectors) {
    displayVectorField();
  }

  if (mode.name === "Solar System") {
    drawTrajectoryPrediction();
  }

  // Draw expansion flashes
  for (let i = fxEffects.length - 1; i >= 0; i--) {
    fxEffects[i].update();
    fxEffects[i].display();
    if (fxEffects[i].alpha <= 0) fxEffects.splice(i, 1);
  }

  for (let b of bodies) {
    b.display();
  }

  if (mode.name === "Solar System" && bodies.length >= 2) {
    displayLagrangePoints();
  }

  pop();

  drawUI();

  if (draggingBody && mouseVel) {
    stroke(255, 200);
    strokeWeight(2);
    let mx = mouseX;
    let my = mouseY;
    line(mx, my, mx + mouseVel.x * 10 * camera.zoom, my + mouseVel.y * 10 * camera.zoom);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function updatePhysics() {
  let forces = [];
  for (let i = 0; i < bodies.length; i++) {
    forces.push(createVector(0, 0));
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      let f = calculateForce(bodies[i], bodies[j]);
      forces[i].add(f);
      forces[j].sub(f);
    }
  }
  
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].applyForce(forces[i]);

    for (let z of zones) {
      if (z.contains(bodies[i])) {
        z.applyEffect(bodies[i]);
      }
    }

    if (integrationMethod === 'RK4') {
      bodies[i].updateRK4(timeStep);
    } else if (integrationMethod === 'VERLET') {
      bodies[i].updateVerlet(timeStep);
    } else {
      bodies[i].updateSemiEuler(timeStep);
    }
    
    if (frameCount % 2 === 0) {
      bodies[i].trail.addPoint(bodies[i].position.copy());
    }
  }

  handleCollisions();
  cleanupBodies();
  calculateEnergy();
}

function calculateForce(a, b) {
  let r = p5.Vector.sub(b.position, a.position);
  let dist = r.mag();
  let softenedDist = sqrt(dist*dist + softening*softening);

  let force = createVector(0, 0);

  if (G > 0) {
    let fG = (G * a.mass * b.mass) / (softenedDist * softenedDist);
    let gVec = r.copy().setMag(fG);
    force.add(gVec);
  }

  if (kCoulomb > 0) {
    let fC = (kCoulomb * abs(a.charge * b.charge)) / (softenedDist * softenedDist);
    let sign = (a.charge * b.charge > 0) ? 1 : -1;
    let cVec = r.copy().setMag(fC * sign);
    force.add(cVec);
  }

  return force;
}

function handleCollisions() {
  for (let i = bodies.length - 1; i >= 0; i--) {
    for (let j = i - 1; j >= 0; j--) {
      if (!bodies[i] || !bodies[j]) continue;

      let b1 = bodies[i];
      let b2 = bodies[j];
      let d = p5.Vector.dist(b1.position, b2.position);
      let threshold = (b1.radius + b2.radius) * mergeThreshold;

      if (d < threshold) {
        if (bounceMode) {
          resolveBounce(b1, b2);
        } else {
          if (b1.charge * b2.charge < -1.5) {
            spawnAnnihilationDebris(b1.position, b1.mass + b2.mass);
            bodies.splice(max(i, j), 1);
            bodies.splice(min(i, j), 1);
          } else {
            let merged = mergeBodies(b1, b2);
            bodies.splice(max(i, j), 1);
            bodies.splice(min(i, j), 1);
            bodies.push(merged);
          }
        }
        return; 
      }

      if (mode.name === "Solar System" && bodies.length > 0) {
        let heavy = b1.mass > b2.mass ? b1 : b2;
        let light = b1.mass > b2.mass ? b2 : b1;
        
        if (light.isDebris || light.mass < 1.5) continue;

        if (heavy.mass / light.mass > 10) {
          let rocheLimit = heavy.radius * pow(2 * (heavy.mass / light.mass), 1/3);
          let maxDestructionZone = heavy.radius * 2.5;
          let finalLimit = min(rocheLimit, maxDestructionZone);
          
          if (d < finalLimit && d > (heavy.radius + light.radius)) {
            spawnAnnihilationDebris(light.position, light.mass);
            let idx = bodies.indexOf(light);
            if (idx !== -1) bodies.splice(idx, 1);
            return; 
          }
        }
      }
    }
  }
}

function resolveBounce(a, b) {
  let normal = p5.Vector.sub(b.position, a.position).normalize();
  let tangent = createVector(-normal.y, normal.x);

  let v1n = a.velocity.dot(normal);
  let v1t = a.velocity.dot(tangent);
  let v2n = b.velocity.dot(normal);
  let v2t = b.velocity.dot(tangent);

  let m1 = a.mass;
  let m2 = b.mass;

  let newV1n = (v1n * (m1 - m2) + 2 * m2 * v2n) / (m1 + m2);
  let newV2n = (v2n * (m2 - m1) + 2 * m1 * v1n) / (m1 + m2);

  a.velocity = p5.Vector.mult(normal, newV1n).add(p5.Vector.mult(tangent, v1t));
  b.velocity = p5.Vector.mult(normal, newV2n).add(p5.Vector.mult(tangent, v2t));

  // Push apart instantly to break overlap sticking locks
  let overlap = (a.radius + b.radius) - p5.Vector.dist(a.position, b.position);
  a.position.sub(p5.Vector.mult(normal, overlap * 0.5));
  b.position.add(p5.Vector.mult(normal, overlap * 0.5));

  fxEffects.push(new Shockwave(p5.Vector.lerp(a.position, b.position, 0.5), a.radius + b.radius, color(255, 255, 100)));
}

function mergeBodies(a, b) {
  let totalMass = a.mass + b.mass;
  let newVel = p5.Vector.add(
    p5.Vector.mult(a.velocity, a.mass),
    p5.Vector.mult(b.velocity, b.mass)
  ).div(totalMass);

  let newPos = p5.Vector.add(
    p5.Vector.mult(a.position, a.mass),
    p5.Vector.mult(b.position, b.mass)
  ).div(totalMass);

  let newRadius = pow(pow(a.radius, 3) + pow(b.radius, 3), 1/3);
  let newCharge = a.charge + b.charge;

  fxEffects.push(new Shockwave(newPos, newRadius * 2.5, color(255, 150, 50)));

  let p = new Particle(newPos, newVel, totalMass, newRadius, newCharge);
  p.trail = new Trail(trailLength);
  p.trail.addPoint(newPos.copy());
  return p;
}

function spawnAnnihilationDebris(pos, totalMass) {
  let fragments = floor(random(4, 7)); 
  fxEffects.push(new Shockwave(pos, totalMass * 4, color(255, 80, 80)));

  for (let i = 0; i < fragments; i++) {
    let angle = random(TWO_PI);
    let speed = random(1.5, 3.5);
    let vel = createVector(cos(angle) * speed, sin(angle) * speed);
    let fragMass = totalMass / fragments; 
    
    let p = new Particle(pos, vel, fragMass, max(2, fragMass * 1.5), 0);
    p.trail = new Trail(12);
    p.isDebris = true; 
    bodies.push(p);
  }
}

function spawnAccretionDisk() {
  if (bodies.length === 0) return;
  let centerBody = bodies.reduce((max, b) => b.mass > max.mass ? b : max, bodies[0]);

  for (let i = 0; i < 40; i++) {
    let radiusOffset = random(centerBody.radius * 2.0, centerBody.radius * 4.5);
    let angle = random(TWO_PI);
    
    let orbitPos = p5.Vector.add(centerBody.position, createVector(cos(angle) * radiusOffset, sin(angle) * radiusOffset));
    let vMag = sqrt((G > 0 ? G : 1.0) * centerBody.mass / radiusOffset);
    let orbitVel = createVector(-sin(angle) * vMag, cos(angle) * vMag).add(centerBody.velocity);

    let asteroid = new Particle(orbitPos, orbitVel, 0.15, random(2, 3.5), 0);
    asteroid.isDebris = true;
    bodies.push(asteroid);
  }
}

function cleanupBodies() {
  for (let i = bodies.length - 1; i >= 0; i--) {
    let b = bodies[i];
    let margin = 1200;
    
    if (b.position.x < -margin || b.position.x > width + margin ||
        b.position.y < -margin || b.position.y > height + margin) {
      bodies.splice(i, 1);
      continue;
    }
    
    if (b.mass < 0.05) {
      bodies.splice(i, 1);
      continue;
    }
  }
}

function calculateEnergy() {
  totalKE = 0;
  totalPE = 0;

  for (let b of bodies) {
    totalKE += 0.5 * b.mass * b.velocity.magSq();
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      let d = p5.Vector.dist(bodies[i].position, bodies[j].position);
      let softD = sqrt(d*d + softening*softening);
      if (G > 0) {
        totalPE -= (G * bodies[i].mass * bodies[j].mass) / softD;
      }
      if (kCoulomb > 0) {
        totalPE += (kCoulomb * bodies[i].charge * bodies[j].charge) / softD;
      }
    }
  }
  systemEnergy = totalKE + totalPE;
}

class Particle {
  constructor(pos, vel, mass, radius, charge = 0) {
    this.position = pos.copy();
    this.velocity = vel.copy();
    this.acceleration = createVector(0, 0);
    this.mass = mass;
    this.radius = radius;
    this.charge = charge;
    this.isDebris = false;
    this.trail = new Trail(trailLength);
    this.trail.addPoint(pos.copy());
    this.id = floor(random(1000000));
  }

  applyForce(force) {
    let f = force.copy();
    f.div(this.mass);
    this.acceleration.add(f);
  }

  updateSemiEuler(dt) {
    this.velocity.add(p5.Vector.mult(this.acceleration, dt));
    this.velocity.mult(damping);
    this.position.add(p5.Vector.mult(this.velocity, dt));
    this.acceleration.mult(0);
  }

  updateVerlet(dt) {
    let currentAcc = this.acceleration.copy();
    this.position.add(p5.Vector.mult(this.velocity, dt)).add(p5.Vector.mult(currentAcc, 0.5 * dt * dt));
    this.velocity.add(p5.Vector.mult(currentAcc, dt));
    this.velocity.mult(damping);
    this.acceleration.mult(0);
  }

  updateRK4(dt) {
    let origPos = this.position.copy();
    let origVel = this.velocity.copy();
    let k1v = this.acceleration.copy();
    let k1r = this.velocity.copy();
    
    this.position = p5.Vector.add(origPos, p5.Vector.mult(k1r, dt*0.5));
    this.velocity = p5.Vector.add(origVel, p5.Vector.mult(k1v, dt*0.5));
    let k2v = this.acceleration.copy();
    let k2r = this.velocity.copy();
    
    this.position = p5.Vector.add(origPos, p5.Vector.mult(k2r, dt*0.5));
    this.velocity = p5.Vector.add(origVel, p5.Vector.mult(k2v, dt*0.5));
    let k3v = this.acceleration.copy();
    let k3r = this.velocity.copy();
    
    this.position = p5.Vector.add(origPos, p5.Vector.mult(k3r, dt));
    this.velocity = p5.Vector.add(origVel, p5.Vector.mult(k3v, dt));
    let k4v = this.acceleration.copy();
    let k4r = this.velocity.copy();
    
    this.position = origPos;
    this.velocity = origVel;

    this.velocity.add(p5.Vector.mult(k1v, dt/6));
    this.velocity.add(p5.Vector.mult(k2v, dt/3));
    this.velocity.add(p5.Vector.mult(k3v, dt/3));
    this.velocity.add(p5.Vector.mult(k4v, dt/6));

    this.velocity.mult(damping);
    this.position.add(p5.Vector.mult(this.velocity, dt));
    this.acceleration.mult(0);
  }

  display() {
    push();
    translate(this.position.x, this.position.y);
    let col = this.getColor();

    noStroke();
    for (let g = 3; g > 0; g--) {
      fill(red(col), green(col), blue(col), 30 / g);
      ellipse(0, 0, this.radius * 2 * (1 + g*0.5));
    }

    fill(col);
    ellipse(0, 0, this.radius * 2);

    if (abs(this.charge) > 0.1) {
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(this.radius);
      text(this.charge > 0 ? '+' : '-', 0, 0);
    }
    pop();
  }

  getColor() {
    if (colorScheme === 'charge') {
      if (this.charge > 0.1) return color(255, 80, 80);
      if (this.charge < -0.1) return color(80, 80, 255);
      return color(200, 200, 200);
    } else if (colorScheme === 'realistic') {
      let t = map(this.mass, 1, 50, 0, 1);
      return lerpColor(color(139, 125, 107), color(255, 200, 150), t);
    } else {
      let speed = this.velocity.mag();
      let t = map(speed, 0, 6, 0, 1);
      return lerpColor(color(100, 200, 255), color(255, 100, 100), t);
    }
  }
}

class Trail {
  constructor(maxLen) {
    this.points = [];
    this.maxLen = maxLen;
  }

  addPoint(pos) {
    this.points.push(pos.copy());
    if (this.points.length > this.maxLen) {
      this.points.shift();
    }
  }

  display() {
    if (this.points.length < 2) return;
    noFill();
    for (let i = 1; i < this.points.length; i++) {
      let alpha = map(i, 0, this.points.length, 0, 200);
      let weight = map(i, 0, this.points.length, 0.5, 2);
      stroke(255, alpha);
      strokeWeight(weight);
      line(this.points[i-1].x, this.points[i-1].y, this.points[i].x, this.points[i].y);
    }
  }
}

class Shockwave {
  constructor(pos, targetSize, col) {
    this.pos = pos.copy();
    this.currentSize = 0;
    this.targetSize = targetSize;
    this.col = col;
    this.alpha = 255;
  }
  update() {
    this.currentSize = lerp(this.currentSize, this.targetSize, 0.15);
    this.alpha -= 8;
  }
  display() {
    noFill();
    stroke(red(this.col), green(this.col), blue(this.col), this.alpha);
    strokeWeight(3);
    ellipse(this.pos.x, this.pos.y, this.currentSize);
  }
}

class Zone {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color(100, 100, 255, 30);
  }

  contains(body) {
    return dist(body.position.x, body.position.y, this.x, this.y) < this.radius;
  }

  display() {
    noFill();
    stroke(this.color);
    strokeWeight(2);
    ellipse(this.x, this.y, this.radius * 2);

    fill(255, 150);
    noStroke();
    textAlign(CENTER);
    textSize(10);
    text(this.label || "Zone", this.x, this.y - this.radius - 5);
  }
  applyEffect(body) {}
}

class DragPool extends Zone {
  constructor(x, y, radius, coefficient) {
    super(x, y, radius);
    this.coefficient = coefficient;
    this.color = color(100, 200, 255, 40);
    this.label = "Drag Field";
  }

  applyEffect(body) {
    let drag = body.velocity.copy().normalize().mult(-this.coefficient * body.velocity.magSq());
    body.applyForce(drag);
  }
}

function displayVectorField() {
  let spacing = 65; 
  strokeWeight(1);

  for (let x = 0; x < width; x += spacing) {
    for (let y = 0; y < height; y += spacing) {
      let testPoint = createVector(x, y);
      let field = computeFieldAt(testPoint);

      if (field.mag() > 0.001) {
        let mag = field.mag();
        let displayLen = map(log(mag + 1), 0, 5, 5, 25);
        field.setMag(displayLen);

        let col = lerpColor(color(50, 100, 255), color(255, 100, 50), map(mag, 0, 2, 0, 1));
        stroke(red(col), green(col), blue(col), 100);

        let endX = x + field.x;
        let endY = y + field.y;
        line(x, y, endX, endY);

        let angle = field.heading();
        push();
        translate(endX, endY);
        rotate(angle);
        line(0, 0, -5, -2);
        line(0, 0, -5, 2);
        pop();
      }
    }
  }
}

function computeFieldAt(point) {
  let field = createVector(0, 0);
  for (let b of bodies) {
    let r = p5.Vector.sub(b.position, point);
    let d = r.mag();
    let softD = sqrt(d*d + softening*softening);

    if (G > 0) {
      let g = (G * b.mass) / (softD * softD);
      field.add(r.copy().setMag(g));
    }
    if (kCoulomb > 0) {
      let e = (kCoulomb * b.charge) / (softD * softD);
      field.add(r.copy().setMag(e));
    }
  }
  return field;
}

function drawTrajectoryPrediction() {
  if (bodies.length < 2 || paused) return;
  
  let sorted = [...bodies].sort((a, b) => b.mass - a.mass);
  let p1 = { pos: sorted[1].position.copy(), vel: sorted[1].velocity.copy(), mass: sorted[1].mass };
  let primary = sorted[0];

  noFill();
  stroke(255, 255, 0, 50);
  strokeWeight(1.5);
  beginShape();
  
  for (let step = 0; step < 180; step++) {
    let r = p5.Vector.sub(primary.position, p1.pos);
    let d = r.mag();
    let softD = sqrt(d*d + softening*softening);
    
    if (d > 5) {
      let fG = (G * p1.mass * primary.mass) / (softD * softD);
      let force = r.setMag(fG);
      p1.vel.add(force.div(p1.mass).mult(timeStep));
      p1.pos.add(p5.Vector.mult(p1.vel, timeStep));
      vertex(p1.pos.x, p1.pos.y);
    }
  }
  endShape();
}

function displayLagrangePoints() {
  let sorted = [...bodies].sort((a, b) => b.mass - a.mass);
  if (sorted.length < 2) return;

  let m1 = sorted[0];
  let m2 = sorted[1];
  let r = p5.Vector.dist(m1.position, m2.position);
  let dir = p5.Vector.sub(m2.position, m1.position).normalize();
  
  let l1 = p5.Vector.add(m1.position, p5.Vector.mult(dir, r * 0.6));
  let l2 = p5.Vector.add(m2.position, p5.Vector.mult(dir, r * 0.3));
  let l3 = p5.Vector.add(m1.position, p5.Vector.mult(dir, -r * 0.7));

  let rVector = p5.Vector.sub(m2.position, m1.position);
  let l4 = p5.Vector.add(m1.position, rVector.copy().rotate(PI / 3));
  let l5 = p5.Vector.add(m1.position, rVector.copy().rotate(-PI / 3));

  fill(255, 255, 0, 100);
  noStroke();
  for (let pt of [l1, l2, l3]) ellipse(pt.x, pt.y, 8, 8);

  fill(0, 255, 255, 120);
  for (let pt of [l4, l5]) ellipse(pt.x, pt.y, 8, 8);

  fill(255, 200);
  textSize(10);
  text("L1", l1.x + 8, l1.y);
  text("L2", l2.x + 8, l2.y);
  text("L3", l3.x + 8, l3.y);
  text("L4", l4.x + 8, l4.y);
  text("L5", l5.x + 8, l5.y);
}

function drawUI() {
  fill(0, 0, 0, 180);
  noStroke();
  rect(10, 10, 290, showEnergy ? 470 : 330, 8);

  fill(255);
  textAlign(LEFT);
  textSize(14);

  let y = 30;
  text(`Mode: ${mode.name}`, 20, y); y += 20;
  text(`Collision Style: ${bounceMode ? "BOUNCE (Elastic)" : "MERGE/ABSORB"}`, 20, y); y += 20;
  text(`Bodies: ${bodies.length}`, 20, y); y += 20;
  text(`Integration: ${integrationMethod}`, 20, y); y += 20;
  text(`Speed: ${simSpeed.toFixed(1)}x`, 20, y); y += 20;
  text(`G: ${G} | k: ${kCoulomb}`, 20, y); y += 20;
  text(`Zoom: ${camera.zoom.toFixed(2)}x`, 20, y); y += 20;
  text(`Tracking: ${trackedBody ? "ON (Star)" : "OFF"}`, 20, y); y += 25;

  if (showEnergy) {
    y += 10;
    text("System Energy:", 20, y); y += 20;
    let maxE = max(abs(totalKE), abs(totalPE), 100);
    drawBar("KE", totalKE, color(255, 100, 100), 20, y, 200, 16, maxE); y += 22;
    drawBar("PE", totalPE, color(100, 100, 255), 20, y, 200, 16, maxE); y += 22;
    drawBar("Total", systemEnergy, color(255), 20, y, 200, 16, maxE); y += 30;
  }

  y += 5;
  textSize(11);
  fill(200);
  text("Controls:", 20, y); y += 16;
  text("Left-Click: spawn | Shift+Click: -charge", 20, y); y += 14;
  text("Left-Drag body: throw physics object", 20, y); y += 14;
  text("Right-Drag canvas: Pan | Scroll: Zoom", 20, y); y += 14;
  text("Space: pause | F: Toggle Central Focus", 20, y); y += 14;
  text("B: Swap Bounce/Merge | D: Spawns Ring", 20, y); y += 14;
  text("V: vectors | E: energy | T: trails", 20, y); y += 14;
  text("Z: zones | M: toggle mode | +/-: speed", 20, y); y += 14;
  text("R: restart seed | N: new seed", 20, y); y += 14;
  text("C: clear | 1-3: Integration models", 20, y);

  fill(255, 220, 150);
  textSize(12);
  textAlign(RIGHT);
  text(mode.description, width - 20, 30);
}

function drawBar(label, value, col, x, y, w, h, maxVal) {
  fill(50);
  rect(x, y, w, h, 3);
  let pct = constrain(map(abs(value), 0, maxVal, 0, 1), 0, 1);
  fill(col);
  rect(x, y, w * pct, h, 3);
  fill(255);
  textAlign(LEFT, CENTER);
  textSize(10);
  text(`${label}: ${value.toFixed(1)}`, x + 5, y + h/2);
}

function switchMode(modeKey) {
  mode = MODES[modeKey];
  G = mode.G;
  kCoulomb = mode.kCoulomb;
  softening = mode.softening;
  damping = mode.damping;
  integrationMethod = mode.integration;
  colorScheme = mode.colorScheme;
  trailLength = mode.trailLength;
  trackedBody = null;

  spawnPreset(mode.spawnPreset);
}

function spawnPreset(preset) {
  bodies = [];
  fxEffects = [];

  if (preset === 'solar') {
    let sun = new Particle(createVector(width/2, height/2), createVector(0, 0), 50, 30, 0);
    sun.trail = new Trail(trailLength);
    bodies.push(sun);

    for (let i = 0; i < 5; i++) {
      let dist = 80 + i * 50;
      let angle = random(TWO_PI);
      let pos = createVector(width/2 + cos(angle)*dist, height/2 + sin(angle)*dist);
      let velMag = sqrt(G * sun.mass / dist);
      let vel = createVector(-sin(angle)*velMag, cos(angle)*velMag);
      let mass = random(2, 8);
      let p = new Particle(pos, vel, mass, map(mass, 2, 8, 5, 12), 0);
      p.trail = new Trail(trailLength);
      bodies.push(p);
    }
  } else if (preset === 'random') {
    for (let i = 0; i < 12; i++) {
      let pos = createVector(random(width), random(height));
      let vel = createVector(random(-2, 2), random(-2, 2));
      let mass = random(1, 10);
      let charge = random() > 0.5 ? random(1, 3) : random(-3, -1);
      let p = new Particle(pos, vel, mass, map(mass, 1, 10, 3, 15), charge);
      p.trail = new Trail(trailLength);
      bodies.push(p);
    }
  }
}

function restartSameSeed() {
  randomSeed(seed);
  noiseSeed(seed);
  switchMode(modeKeys[currentModeIndex]);
  frameCount = 0;
}

function newSeed() {
  seed = floor(random(100000));
  randomSeed(seed);
  noiseSeed(seed);
  switchMode(modeKeys[currentModeIndex]);
  frameCount = 0;
}

function mousePressed() {
  if (mouseX < 300 && mouseY < (showEnergy ? 470 : 330)) return;

  let worldX = (mouseX - (width/2 + camera.x)) / camera.zoom + width/2;
  let worldY = (mouseY - (height/2 + camera.y)) / camera.zoom + height/2;
  let mPos = createVector(worldX, worldY);

  if (mouseButton === LEFT) {
    for (let b of bodies) {
      if (p5.Vector.dist(mPos, b.position) < b.radius + 10) {
        draggingBody = b;
        mouseVel = createVector(0, 0);
        return;
      }
    }

    let charge = keyIsDown(SHIFT) ? -2 : 2;
    if (mode.name === "Solar System") charge = 0;

    let mass = random(2, 8);
    let p = new Particle(mPos, createVector(0, 0), mass, map(mass, 2, 8, 5, 12), charge);
    p.trail = new Trail(trailLength);
    bodies.push(p);
  }
}

function mouseDragged() {
  if (mouseButton === LEFT && draggingBody) {
    let worldX = (mouseX - (width/2 + camera.x)) / camera.zoom + width/2;
    let worldY = (mouseY - (height/2 + camera.y)) / camera.zoom + height/2;
    let currentPos = createVector(worldX, worldY);
    mouseVel = p5.Vector.sub(currentPos, draggingBody.position);
    draggingBody.position = currentPos;
    draggingBody.velocity.mult(0);
  } else if (mouseButton === RIGHT) {
    trackedBody = null; 
    camera.x += mouseX - pmouseX;
    camera.y += mouseY - pmouseY;
  }
}

function mouseReleased() {
  if (mouseButton === LEFT && draggingBody && mouseVel) {
    draggingBody.velocity = p5.Vector.mult(mouseVel, 0.3);
  }
  draggingBody = null;
  mouseVel = null;
}

function mouseWheel(event) {
  let zoomFactor = event.delta > 0 ? 0.92 : 1.08;
  camera.zoom = constrain(camera.zoom * zoomFactor, 0.05, 8.0);
  return false; 
}

function keyPressed() {
  switch(key.toLowerCase()) {
    case ' ': paused = !paused; break;
    case 'f':
      if (trackedBody) { trackedBody = null; } 
      else if (bodies.length > 0) { trackedBody = bodies.reduce((max, b) => b.mass > max.mass ? b : max, bodies[0]); }
      break;
    case 'b': bounceMode = !bounceMode; break;
    case 'd': spawnAccretionDisk(); break;
    case 'v': showVectors = !showVectors; break;
    case 'e': showEnergy = !showEnergy; break;
    case 't': showTrails = !showTrails; break;
    case 'z': showZones = !showZones; break;
    case 'm':
      currentModeIndex = (currentModeIndex + 1) % modeKeys.length;
      switchMode(modeKeys[currentModeIndex]);
      break;
    case 'r': restartSameSeed(); break;
    case 'n': newSeed(); break;
    case 'c': bodies = []; trackedBody = null; fxEffects = []; break;
    case '+': case '=': simSpeed = min(simSpeed + 0.5, 5); break;
    case '-': case '_': simSpeed = max(simSpeed - 0.5, 0.5); break;
  }

  if (key === '1') integrationMethod = 'SEMI_EULER';
  if (key === '2') integrationMethod = 'RK4';
  if (key === '3') integrationMethod = 'VERLET';
}
