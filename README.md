# Lenticular Lens & Holographic Card Simulator

An interactive, high-performance WebGPU-powered simulator for lenticular printing and holographic trading card effects. This project reproduces the complex optical behaviors of physical collectible cards, featuring multi-image transitions and various rare holographic foils.

https://github.com/user-attachments/assets/770cdb1c-3128-4e5d-a312-218329ae6bea

## Visual Effects

This simulator combines multiple rendering techniques to achieve a realistic "Premium Card" look:

### 1. Lenticular Printing (Image Switching)
The core mechanic of the card. It simulates a physical lenticular lens array that reveals different images based on your viewing angle.
*   **3-Image Transition**: Seamlessly switches between three different artworks (Boa, Nico, and Nami) as you tilt the card horizontally.
*   **Adjustable Ridge Strength**: Simulates the physical 3D "feel" of the lens ridges with dynamic highlights and shadows.
*   **Lens Swing**: Controls the "speed" of the transition within each individual lens strip.

### 2. Holographic Foil Layers
Multiple overlapping holographic effects that can be toggled and customized:
*   **Cosmos Glitter**: High-frequency sparkling particles in star, diamond, and circle shapes. These "twinkle" independently as the card tilts, restricted specifically to the artwork area.
*   **Holo Beams**: Vertical striated beams of light that shift through the rainbow spectrum based on the light source's position.
*   **Radiant Holofoil**: A sophisticated "criss-cross" diagonal pattern that uses `Exclusion` and `Color Dodge` blend modes to create a vibrant, metallic shimmer across the entire card.
*   **Pokemon V (Full Art)**: Dynamic diagonal foil strips moving in opposite directions. This layer is masked by a unique **Fingerprint Texture**, reproducing the etched texture found on high-end collectible cards.

### 3. Surface & Material Aesthetics
*   **Dynamic Glare**: A soft radial shine that follows the simulated light source as you rotate the card.
*   **Gloss & Fresnel Reflection**: Simulates a laminated plastic finish. Reflections become more intense at "glancing angles" (the edges of the card) for realistic depth.
*   **Procedural Grain**: Adds a subtle micro-texture to the surface to prevent "digitally perfect" gradients and enhance realism.
*   **Soft Dynamic Shadows**: A real-time shadow that scales and softens based on the card's 3D position and orientation.

## Controls

The simulator features a comprehensive control panel (`lil-gui`) allowing you to customize every aspect of the card:

*   **Lenticular**: Adjust strip density, transition smoothness, ridge intensity, and lens swing.
*   **Holographic**: Toggle and tune Glare, Glitter, Holo Beams, Radiant Holofoil, and the Pokemon V effect.
*   **Card**: Control glossiness, overall scale, rotation speed, and shadow intensity.
*   **Interaction**: Toggle **Auto Rotate** or use your **Mouse/Touch** to manually tilt and inspect the card from any angle.

## Tech Stack

*   **WebGPU**: For high-performance, low-level GPU access and advanced fragment shader effects.
*   **WGSL**: Modern shader language for all visual computations.
*   **TypeScript**: For robust, type-safe application logic.
*   **Vite**: Fast development server and optimized production builds.
*   **lil-gui**: Lightweight controller for real-time parameter tuning.

## Getting Started

### Prerequisites
*   A browser that supports **WebGPU** (e.g., Chrome 113+, Edge 113+).

### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/jeantimex/lenticular-lens.git
    cd lenticular-lens
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
4.  Build for production:
    ```bash
    npm run build
    ```

## Assets
The project uses several textures for the effects:
*   `boa.png`, `nico.png`, `nami.png`: The three base images for the lenticular effect.
*   `background.jpg`: An environment map for the scene.
*   `illusion-mask.png`: The "fingerprint" etched texture used for the Pokemon V foil.

---
Created by [jeantimex](https://github.com/jeantimex)
