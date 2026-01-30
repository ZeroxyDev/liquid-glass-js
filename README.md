# Liquid Glass

Liquid Glass brings high-fidelity optical distortion and physics to the web. It combines refractive displacement maps with a spring-mass system to create glass elements that feel organic and tactile.

## The Concept

The library solves two main challenges: **optics** and **interaction**.

1.  **Optical Simulation**: We approximate Snell's Law to calculate how light bends through different glass profiles. Whether it's a "squircle" or a concave lens, we generate a displacement map that distorts the content behind it realistically.
2.  **Physics**: Static glass is boring. We use a spring physics model so that when you interact with the element, it reacts with weight and inertia.

It's built on hardware-accelerated SVG filters and native `backdrop-filter`. Where browsers allow it, we use the native compositor; where they don't, we have a robust fallback system that clones content to ensure the effect works everywhere.

## Installation

### ES Module
If you're using Vite, Webpack, or Rollup, simply include the files in your project:

```javascript
import LiquidGlass from './lib/liquid-glass.js';
// Don't forget to include the CSS
import './lib/liquid-glass.css'; 
```

### UMD (Script Tag)
For dropping directly into an HTML file:

```html
<link rel="stylesheet" href="liquid-glass.css">
<script src="liquid-glass.umd.js"></script>
```

## Usage

You can initialize Liquid Glass programmatically or via HTML attributes.

### JavaScript API

```javascript
import LiquidGlass from './lib/liquid-glass.js';

// Create a glass instance
const glass = new LiquidGlass('#target', {
  surfaceType: 'convex_squircle',
  bezelWidth: 30,
  glassThickness: 150,
  refractionScale: 1.5,
  draggable: true
});

// Update it on the fly
glass.setOptions({
  refractionScale: 2.0
});
```

### HTML Attributes

Useful for static sites or quick prototyping. Add `data-liquid-glass` to any element.

```html
<div 
  data-liquid-glass
  data-lg-surface="convex_squircle"
  data-lg-refraction="1.5"
></div>

<script>
  // Finds all matching elements and initializes them
  LiquidGlass.autoInit();
</script>
```

## Configuration

| Option | Default | What it does |
| :--- | :--- | :--- |
| `surfaceType` | `'convex_squircle'` | Defines the lens profile. Start with `convex_squircle` or `convex_circle`. |
| `bezelWidth` | `30` | The width of the edge bevel in pixels. |
| `glassThickness` | `150` | Affects the depth and intensity of the refraction. |
| `refractionScale` | `1.5` | Multiplier for the distortion. Higher is stronger. |
| `specularOpacity` | `1.0` | Visibility of the light reflection on the surface (0.0 to 1.0). |
| `draggable` | `false` | Enables the physics-based drag interaction. |
| `springConfig` | `{ stiffness: 400, damping: 25 }` | Tweak these to change the "weight" of the glass. |

## Browser Support & Performance

We use a tiered approach for detailed rendering:

*   **Chromium & Edge**: Uses native `backdrop-filter`. This is the most performant path as the browser handles the compositing.
*   **Firefox & Safari**: Uses a content cloning technique. Since these browsers handle backdrop filters differently, we mirror the content behind the glass to apply the displacement maps.

**Note**: The effect relies on chained SVG filters (`feDisplacementMap`, `feImage`). While optimized, avoid putting this on hundreds of elements at once if you're targeting low-end mobile devices.

## Credits

Created by [ZeroxyDev](https://github.com/ZeroxyDev).
Inspired by the optical effects seen at WWDC 2025.
