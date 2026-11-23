# Procedural Reptile Interactive Cursor

An interactive procedural animation of a skeletal reptile / lizard cursor that dynamically follows the mouse pointer using 2-bone Inverse Kinematics (IK), distance constraints, and angle-bounded spine physics.

Inspired by procedural animation techniques (Argonaut, FABRIK, and biological chain kinematics).

![Reptile Cursor Preview](cursor-demo.html)

## Features

- **2-Bone Inverse Kinematics (IK)**: Each leg uses analytical law-of-cosines joint solving for natural outward and backward knee flex.
- **Alternating Stepping Gait**: Opposite legs step asynchronously, planting firmly on the ground while the opposing limb strides forward.
- **Organic Spine Undulation**: Continuous distance-constrained vertebrae with strict angular bending bounds (`±20°`), accompanied by subtle sinusoidal slither dynamics.
- **Detailed Skeletal Wireframe**:
  - Crescent ribcage arcs that bow backward along the torso with dual flank contour lines.
  - Herringbone chevron spines (`>`) tapering down to the tail tip.
  - Detailed skull complete with snout ring, eye sockets, jaw corners, and feelers.
  - 5 radiating claws/toes on each foot.
- **Multi-Species Presets**:
  - **Reptile (5 pairs)**: Multi-limbed crawling dragon / reptile (matches screenshot).
  - **Classic Lizard (2 pairs)**: 4-legged quadruped gecko/lizard.
  - **Centipede (8 pairs)**: Multi-legged undulating millipede/centipede.
  - **Serpent (No legs)**: Pure slithering snake.
- **Interactive Controls**:
  - **Sprint**: Click and hold to sprint.
  - **Food Bait**: Press <kbd>Space</kbd> to drop glowing prey particles that the reptile stalks and devours.
  - **Audio**: Optional subtle procedural audio clicks for footsteps.
  - **Customizable**: Live speed slider, spine length slider, and glow effect toggles.
- **Custom Cursor Overlay Mode**: Included `cursor-demo.html` shows how to make the reptile trail your mouse over any real website layout with click-through transparency (`pointer-events: none`).

## Quick Start

Open `index.html` directly in your browser:

```bash
# In terminal / macOS:
open /Users/Lewis/Desktop/reptile/index.html
```

Or view via the local server:
- Standalone Lab & HUD: [http://localhost:8080/index.html](http://localhost:8080/index.html)
- Custom Cursor Overlay Demo: [http://localhost:8080/cursor-demo.html](http://localhost:8080/cursor-demo.html)

## How to Embed on Any Website as a Cursor

To add this reptile as a cursor trail on your own website:

1. Add a transparent overlay canvas to your HTML:
   ```html
   <canvas id="cursor-canvas" style="position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;"></canvas>
   ```

2. Include `reptile.js`:
   ```html
   <script src="reptile.js"></script>
   ```

3. That's it! `reptile.js` will automatically detect `#cursor-canvas`, track mouse events across the window, and animate the creature without intercepting clicks on your buttons, links, or inputs.

## Architecture

- `index.html` - Minimalist standalone lab with rounded frame and glassmorphic HUD.
- `style.css` - Pure dark theme styling matching the screenshot aesthetic.
- `reptile.js` - Procedural IK solver, spine constraint resolver, step gait manager, and canvas renderer.
- `cursor-demo.html` - Fullpage interactive website demo showing the reptile operating as a non-blocking custom cursor.
