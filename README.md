# 🔬 Science Lens

&gt; An interactive physics sandbox built with **p5.js** that simulates gravitational and electromagnetic N-body dynamics in real-time.

---

## What is this?

**Science Lens** is a creative coding project that visualizes complex physical systems — from stable solar systems to chaotic particle fields — directly in the browser. It demonstrates an understanding of **numerical integration**, **collision physics**, **vector field computation**, and **interactive real-time rendering**.

This isn't just a visual toy. Under the hood, it implements:
- **Three numerical integrators**: Semi-Implicit Euler, 4th-order Runge-Kutta (RK4), and Velocity Verlet
- **Softened N-body gravity** with Coulomb electrostatics
- **Elastic collision resolution** (momentum-conserving) and inelastic merging
- **Roche limit physics** for tidal disruption
- **Matter-antimatter annihilation** with debris fragmentation
- **Lagrange point visualization** for two-body systems
- **Real-time trajectory prediction** using forward integration

---

## Quick Start

### Option 1: Open Locally
Simply open `index.html` in any modern web browser. No build step, no dependencies — just a single HTML file that loads p5.js from CDN.

### Option 2: p5.js Web Editor
1. Go to [editor.p5js.org](https://editor.p5js.org/)
2. Copy the contents of `sketch.js` into a new sketch
3. Run — the simulation starts immediately

---

## Controls

| Key / Action | Function |
|-------------|----------|
| `Space` | Pause / Resume simulation |
| `Left Click` (empty space) | Spawn a new body |
| `Shift + Left Click` | Spawn a negatively charged body |
| `Left Click + Drag` (on body) | Grab and throw bodies with physics |
| `Right Click + Drag` | Pan the camera |
| `Scroll Wheel` | Zoom in / out |
| `F` | Toggle camera tracking on the most massive body |
| `B` | Toggle collision mode: **Bounce** (elastic) vs **Merge** (absorb) |
| `D` | Spawn an accretion disk around the heaviest body |
| `V` | Toggle vector field overlay |
| `E` | Toggle energy monitoring panel |
| `T` | Toggle orbital trails |
| `Z` | Toggle zone overlays (drag fields) |
| `M` | Switch between **Solar System** and **Chaotic Field** modes |
| `R` | Restart with the same random seed |
| `N` | Generate a new random seed and restart |
| `C` | Clear all bodies |
| `+` / `-` | Increase / decrease simulation speed |
| `1` / `2` / `3` | Switch integration method: Euler / RK4 / Verlet |

---

## Simulation Modes

### 🌞 Solar System Mode
- **Gravity only** (G = 0.5), realistic mass ratios
- Spawns a central star + 5 orbiting planets with Keplerian velocities
- Enables **trajectory prediction** and **Lagrange point visualization**
- Bodies merge on contact; smaller bodies are tidally disrupted beyond the Roche limit

### ⚡ Chaotic Field Mode
- **Mixed gravity + electromagnetism** (G = 2.0, kCoulomb = 3.0)
- 12 randomly placed charged particles with high initial energy
- Uses **RK4 integration** for stability under strong forces
- Color-coded by charge: red (+), blue (-), grey (neutral)

---

## Architecture & Code Structure

### Core Classes

| Class | Responsibility |
|-------|---------------|
| `Particle` | Represents a physical body with position, velocity, acceleration, mass, radius, and charge. Handles three integration methods and color mapping. |
| `Trail` | Stores and renders fading orbital path history as a line strip with alpha falloff. |
| `Shockwave` | Visual FX for collisions, merges, and annihilation events — expanding ring with alpha decay. |
| `Zone` (base) + `DragPool` (subclass) | Spatial regions that apply forces to bodies inside them. `DragPool` simulates atmospheric drag proportional to velocity squared. |

### Physics Pipeline (`updatePhysics()`)

1. **Force Accumulation**: O(n²) pairwise gravity + Coulomb force calculation with softening
2. **Zone Effects**: Apply drag / environmental forces
3. **Integration Step**: Update position/velocity using selected method (Euler / RK4 / Verlet)
4. **Trail Recording**: Sample position every 2nd frame
5. **Collision Handling**: Bounce (elastic) or merge (mass/charge conservation) or annihilate (opposite charges)
6. **Cleanup**: Remove escaped or evaporated bodies
7. **Energy Budget**: Compute total kinetic + potential energy for conservation monitoring

### Integration Methods

| Method | Use Case | Characteristics |
|--------|----------|-----------------|
| **Semi-Implicit Euler** | Solar System | Fast, stable for orbital mechanics, energy drift over long timescales |
| **RK4** | Chaotic / High-Force | Most accurate, 4x force evaluations per step, excellent for strong EM fields |
| **Velocity Verlet** | General | Symplectic (conserves energy well), good middle ground |

---

## Technical Highlights

- **Softening Parameter**: Prevents force singularities at close approach by adding a constant `softening²` to distance² — critical for numerical stability.
- **Roche Limit**: Bodies with mass ratio &gt; 10:1 trigger tidal disruption when the smaller body enters `r_roche = R_heavy × (2 × M_heavy/M_light)^(1/3)`, capped at 2.5× the heavy body's radius.
- **Annihilation Physics**: When opposite charges (&lt; -1.5 product) collide, both bodies are destroyed and 4–6 debris fragments are spawned with randomized velocities — conserving total mass.
- **Camera System**: Lerp-smoothed pan/zoom with world-space coordinate transformation for mouse interaction.
- **Real-Time Trajectory**: 180-step forward Euler prediction for the second-most-massive body, rendered as a semi-transparent yellow curve.

---

## Tech Stack

- **p5.js** — Creative coding framework (canvas rendering, vector math, input handling)
- **Vanilla JavaScript** — No frameworks, no build tools, no dependencies beyond p5.js CDN
- **HTML5 Canvas** — Hardware-accelerated 2D rendering

---

## Project Structure
science-lens/
├── index.html          # Entry point — loads p5.js CDN + sketch
├── sketch.js           # Main simulation (~850 lines)
├── style.css           # Minimal dark theme styling
├── README.md           # This file
└── assets/             # (Optional) images, sounds, data files
