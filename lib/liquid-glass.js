/**
 * Liquid Glass Library
 * A reusable library for applying Apple's Liquid Glass effect to any element.
 * 
 * Based on the Liquid Glass effect from WWDC 2025.
 * 
 * @version 1.0.0
 * @author ZeroxyDev (https://github.com/ZeroxyDev)
 */

// Surface equations - define the height profile of the glass bezel
const SurfaceEquations = {
    convex_circle: (x) => Math.sqrt(1 - Math.pow(1 - x, 2)),
    convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 1 / 4),
    concave: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)),
    lip: (x) => {
        const convex = Math.pow(1 - Math.pow(1 - Math.min(x * 2, 1), 4), 1 / 4);
        const concave = 1 - Math.sqrt(1 - Math.pow(1 - x, 2)) + 0.1;
        const smootherstep =
            6 * Math.pow(x, 5) - 15 * Math.pow(x, 4) + 10 * Math.pow(x, 3);
        return convex * (1 - smootherstep) + concave * smootherstep;
    },
};

/**
 * Simple spring physics class for animations
 */
class Spring {
    constructor(value, stiffness = 300, damping = 20) {
        this.value = value;
        this.target = value;
        this.velocity = 0;
        this.stiffness = stiffness;
        this.damping = damping;
    }

    setTarget(target) {
        this.target = target;
    }

    update(dt) {
        const force = (this.target - this.value) * this.stiffness;
        const dampingForce = this.velocity * this.damping;
        this.velocity += (force - dampingForce) * dt;
        this.value += this.velocity * dt;
        return this.value;
    }

    isSettled() {
        return (
            Math.abs(this.target - this.value) < 0.001 &&
            Math.abs(this.velocity) < 0.001
        );
    }
}

// Unique ID counter for filter elements
let instanceCounter = 0;

/**
 * Default configuration options
 */
const defaultOptions = {
    surfaceType: 'convex_squircle',
    bezelWidth: 30,
    glassThickness: 150,
    refractiveIndex: 1.5,
    refractionScale: 1.5,
    specularOpacity: 1,
    blur: 0.5,
    borderRadius: 'auto',
    applyToChildren: true,
    draggable: false,
    springAnimation: true,
    useBackdropFilter: 'auto',
    springConfig: { stiffness: 400, damping: 25 },
    width: 'auto',
    height: 'auto',
    onDragStart: null,
    onDrag: null,
    onDragEnd: null,
};

/**
 * LiquidGlass class - Apply liquid glass effect to any element
 */
class LiquidGlass {
    /**
     * Create a LiquidGlass instance
     * @param {string|HTMLElement} element - Selector or element to apply effect to
     * @param {Object} options - Configuration options
     */
    constructor(element, options = {}) {
        // Get element
        this.element = typeof element === 'string'
            ? document.querySelector(element)
            : element;

        if (!this.element) {
            console.error('LiquidGlass: Element not found');
            return;
        }

        // Merge options with defaults
        this.options = { ...defaultOptions, ...options };

        // Generate unique ID for this instance
        this.id = `lg-${++instanceCounter}`;

        // State
        this.state = {
            isDragging: false,
            dragOffset: { x: 0, y: 0 },
            velocityX: 0,
            velocityY: 0,
            lastX: 0,
            lastY: 0,
            lastTime: 0,
            maximumDisplacement: 0,
        };

        // Springs for animation
        this.springs = {
            scale: new Spring(0.85, this.options.springConfig.stiffness, this.options.springConfig.damping),
            scaleX: new Spring(1, this.options.springConfig.stiffness, this.options.springConfig.damping + 5),
            scaleY: new Spring(1, this.options.springConfig.stiffness, this.options.springConfig.damping + 5),
            shadowOffsetX: new Spring(0, this.options.springConfig.stiffness, this.options.springConfig.damping + 5),
            shadowOffsetY: new Spring(4, this.options.springConfig.stiffness, this.options.springConfig.damping + 5),
            shadowBlur: new Spring(12, this.options.springConfig.stiffness, this.options.springConfig.damping + 5),
            shadowAlpha: new Spring(0.15, this.options.springConfig.stiffness - 100, this.options.springConfig.damping),
            refractionBoost: new Spring(0.8, this.options.springConfig.stiffness - 100, this.options.springConfig.damping - 7),
        };

        this.animationFrameId = null;
        this.useBackdropFilter = false;
        this.backdropFilterSupported = false;

        // Bound event handlers
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
        this._onResize = this._onResize.bind(this);

        // Initialize
        this._init();
    }

    /**
     * Initialize the liquid glass effect
     */
    _init() {
        this._detectBackdropFilterSupport();
        this._setupDOM();
        this._updateFilter();
        this._setupEventListeners();

        if (this.options.springAnimation) {
            this.springs.scale.value = 0.85;
            this.springs.scale.target = 0.85;
            this._startAnimationLoop();
        }
    }

    /**
     * Detect if browser supports backdrop-filter with SVG url()
     */
    _detectBackdropFilterSupport() {
        const isChromium = !!window.chrome;
        const testEl = document.createElement('div');
        testEl.style.backdropFilter = 'url(#test)';
        const supportsBackdropFilterUrl = testEl.style.backdropFilter.includes('url');

        this.backdropFilterSupported = isChromium && supportsBackdropFilterUrl;

        if (this.options.useBackdropFilter === 'auto') {
            this.useBackdropFilter = this.backdropFilterSupported;
        } else {
            this.useBackdropFilter = this.options.useBackdropFilter;
        }
    }

    /**
     * Setup DOM elements for the effect
     */
    _setupDOM() {
        const el = this.element;

        // Add base class
        el.classList.add('lg-element');

        // Get dimensions
        const rect = el.getBoundingClientRect();
        const width = this.options.width === 'auto' ? rect.width : this.options.width;
        const height = this.options.height === 'auto' ? rect.height : this.options.height;

        // Get border radius
        let borderRadius = this.options.borderRadius;
        if (borderRadius === 'auto') {
            borderRadius = getComputedStyle(el).borderRadius || '0';
        }
        const radiusValue = parseInt(borderRadius) || 0;

        // Store dimensions
        this.dimensions = { width, height, borderRadius: radiusValue };

        // Create content clone for fallback mode
        this.contentClone = document.createElement('div');
        this.contentClone.className = 'lg-content-clone';
        this.contentClone.id = `${this.id}-clone`;

        this.contentCloneInner = document.createElement('div');
        this.contentCloneInner.className = 'lg-content-clone-inner';
        this.contentCloneInner.id = `${this.id}-clone-inner`;

        // Clone content if applyToChildren is true
        if (this.options.applyToChildren) {
            this.contentCloneInner.innerHTML = el.innerHTML;
        }

        this.contentClone.appendChild(this.contentCloneInner);

        // Create SVG filter
        this._createSVGFilter(width, height, radiusValue);

        // Create inner element for shadows
        this.innerElement = document.createElement('div');
        this.innerElement.className = 'lg-inner';
        this.innerElement.id = `${this.id}-inner`;

        // Insert elements
        el.insertBefore(this.contentClone, el.firstChild);
        el.insertBefore(this.filterSvg, el.firstChild);
        el.appendChild(this.innerElement);

        // Apply filter
        if (this.useBackdropFilter) {
            el.classList.add('lg-use-backdrop-filter');
            this.innerElement.style.backdropFilter = `url(#${this.id}-filter)`;
            this.innerElement.style.webkitBackdropFilter = `url(#${this.id}-filter)`;
        } else {
            this.contentClone.style.filter = `url(#${this.id}-filter)`;
        }

        // Apply styles
        if (this.options.width !== 'auto') {
            el.style.width = `${width}px`;
        }
        if (this.options.height !== 'auto') {
            el.style.height = `${height}px`;
        }
        if (borderRadius) {
            el.style.borderRadius = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius;
        }

        // Initial position update
        this._updateContentClonePosition(true);
    }

    /**
     * Create SVG filter element
     */
    _createSVGFilter(width, height, radius) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'lg-filter-svg');
        svg.setAttribute('id', `${this.id}-svg`);
        svg.style.cssText = 'width: 0; height: 0; position: absolute; pointer-events: none;';

        svg.innerHTML = `
      <defs>
        <filter
          id="${this.id}-filter"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
          color-interpolation-filters="sRGB"
        >
          <feGaussianBlur
            id="${this.id}-blur"
            in="SourceGraphic"
            stdDeviation="${this.options.blur}"
            result="blurred"
          />
          <feImage
            id="${this.id}-displacement-image"
            href=""
            x="0"
            y="0"
            width="${width}"
            height="${height}"
            result="displacement_map"
            preserveAspectRatio="none"
          />
          <feDisplacementMap
            id="${this.id}-displacement-map"
            in="blurred"
            in2="displacement_map"
            scale="50"
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />
          <feColorMatrix
            in="displaced"
            type="saturate"
            values="1.3"
            result="displaced_saturated"
          />
          <feImage
            id="${this.id}-specular-image"
            href=""
            x="0"
            y="0"
            width="${width}"
            height="${height}"
            result="specular_layer"
            preserveAspectRatio="none"
          />
          <feComponentTransfer
            in="specular_layer"
            result="specular_faded"
          >
            <feFuncA
              id="${this.id}-specular-alpha"
              type="linear"
              slope="${this.options.specularOpacity}"
            />
          </feComponentTransfer>
          <feBlend
            in="specular_faded"
            in2="displaced_saturated"
            mode="screen"
          />
        </filter>
        <clipPath id="${this.id}-clip">
          <rect
            x="0"
            y="0"
            width="${width}"
            height="${height}"
            rx="${radius}"
            ry="${radius}"
          />
        </clipPath>
      </defs>
    `;

        this.filterSvg = svg;
    }

    /**
     * Calculate 1D displacement map using Snell's Law
     */
    _calculateDisplacementMap1D(glassThickness, bezelWidth, surfaceFn, refractiveIndex, samples = 128) {
        const eta = 1 / refractiveIndex;

        function refract(normalX, normalY) {
            const dot = normalY;
            const k = 1 - eta * eta * (1 - dot * dot);
            if (k < 0) return null;
            const kSqrt = Math.sqrt(k);
            return [
                -(eta * dot + kSqrt) * normalX,
                eta - (eta * dot + kSqrt) * normalY,
            ];
        }

        const result = [];
        for (let i = 0; i < samples; i++) {
            const x = i / samples;
            const y = surfaceFn(x);
            const dx = x < 1 ? 0.0001 : -0.0001;
            const y2 = surfaceFn(Math.max(0, Math.min(1, x + dx)));
            const derivative = (y2 - y) / dx;
            const magnitude = Math.sqrt(derivative * derivative + 1);
            const normal = [-derivative / magnitude, -1 / magnitude];
            const refracted = refract(normal[0], normal[1]);

            if (!refracted) {
                result.push(0);
            } else {
                const remainingHeightOnBezel = y * bezelWidth;
                const remainingHeight = remainingHeightOnBezel + glassThickness;
                result.push(refracted[0] * (remainingHeight / refracted[1]));
            }
        }
        return result;
    }

    /**
     * Calculate 2D displacement map
     */
    _calculateDisplacementMap2D(canvasWidth, canvasHeight, objectWidth, objectHeight, radius, bezelWidth, maximumDisplacement, precomputedMap) {
        const imageData = new ImageData(canvasWidth, canvasHeight);

        for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = 128;
            imageData.data[i + 1] = 128;
            imageData.data[i + 2] = 0;
            imageData.data[i + 3] = 255;
        }

        const radiusSquared = radius * radius;
        const radiusPlusOneSquared = (radius + 1) * (radius + 1);
        const radiusMinusBezelSquared = Math.max(0, (radius - bezelWidth) * (radius - bezelWidth));
        const widthBetweenRadiuses = objectWidth - radius * 2;
        const heightBetweenRadiuses = objectHeight - radius * 2;
        const objectX = (canvasWidth - objectWidth) / 2;
        const objectY = (canvasHeight - objectHeight) / 2;

        for (let y1 = 0; y1 < objectHeight; y1++) {
            for (let x1 = 0; x1 < objectWidth; x1++) {
                const idx = ((objectY + y1) * canvasWidth + objectX + x1) * 4;
                const isOnLeftSide = x1 < radius;
                const isOnRightSide = x1 >= objectWidth - radius;
                const isOnTopSide = y1 < radius;
                const isOnBottomSide = y1 >= objectHeight - radius;

                const x = isOnLeftSide
                    ? x1 - radius
                    : isOnRightSide
                        ? x1 - radius - widthBetweenRadiuses
                        : 0;
                const y = isOnTopSide
                    ? y1 - radius
                    : isOnBottomSide
                        ? y1 - radius - heightBetweenRadiuses
                        : 0;

                const distanceToCenterSquared = x * x + y * y;
                const isInBezel =
                    distanceToCenterSquared <= radiusPlusOneSquared &&
                    distanceToCenterSquared >= radiusMinusBezelSquared;

                if (isInBezel) {
                    const opacity =
                        distanceToCenterSquared < radiusSquared
                            ? 1
                            : 1 -
                            (Math.sqrt(distanceToCenterSquared) - Math.sqrt(radiusSquared)) /
                            (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));
                    const distanceFromCenter = Math.sqrt(distanceToCenterSquared);
                    const distanceFromSide = radius - distanceFromCenter;
                    const cos = distanceFromCenter > 0 ? x / distanceFromCenter : 0;
                    const sin = distanceFromCenter > 0 ? y / distanceFromCenter : 0;
                    const bezelRatio = Math.max(0, Math.min(1, distanceFromSide / bezelWidth));
                    const bezelIndex = Math.floor(bezelRatio * precomputedMap.length);
                    const distance = precomputedMap[Math.max(0, Math.min(bezelIndex, precomputedMap.length - 1))] || 0;
                    const dX = maximumDisplacement > 0 ? (-cos * distance) / maximumDisplacement : 0;
                    const dY = maximumDisplacement > 0 ? (-sin * distance) / maximumDisplacement : 0;

                    imageData.data[idx] = Math.max(0, Math.min(255, 128 + dX * 127 * opacity));
                    imageData.data[idx + 1] = Math.max(0, Math.min(255, 128 + dY * 127 * opacity));
                    imageData.data[idx + 2] = 0;
                    imageData.data[idx + 3] = 255;
                }
            }
        }
        return imageData;
    }

    /**
     * Calculate specular highlight
     */
    _calculateSpecularHighlight(objectWidth, objectHeight, radius, bezelWidth, specularAngle = Math.PI / 3) {
        const imageData = new ImageData(objectWidth, objectHeight);
        const specularVector = [Math.cos(specularAngle), Math.sin(specularAngle)];
        const specularThickness = 1.5;
        const radiusSquared = radius * radius;
        const radiusPlusOneSquared = (radius + 1) * (radius + 1);
        const radiusMinusSpecularSquared = Math.max(0, (radius - specularThickness) * (radius - specularThickness));
        const widthBetweenRadiuses = objectWidth - radius * 2;
        const heightBetweenRadiuses = objectHeight - radius * 2;

        for (let y1 = 0; y1 < objectHeight; y1++) {
            for (let x1 = 0; x1 < objectWidth; x1++) {
                const idx = (y1 * objectWidth + x1) * 4;
                const isOnLeftSide = x1 < radius;
                const isOnRightSide = x1 >= objectWidth - radius;
                const isOnTopSide = y1 < radius;
                const isOnBottomSide = y1 >= objectHeight - radius;

                const x = isOnLeftSide
                    ? x1 - radius
                    : isOnRightSide
                        ? x1 - radius - widthBetweenRadiuses
                        : 0;
                const y = isOnTopSide
                    ? y1 - radius
                    : isOnBottomSide
                        ? y1 - radius - heightBetweenRadiuses
                        : 0;

                const distanceToCenterSquared = x * x + y * y;
                const isNearEdge =
                    distanceToCenterSquared <= radiusPlusOneSquared &&
                    distanceToCenterSquared >= radiusMinusSpecularSquared;

                if (isNearEdge) {
                    const distanceFromCenter = Math.sqrt(distanceToCenterSquared);
                    const distanceFromSide = radius - distanceFromCenter;
                    const opacity =
                        distanceToCenterSquared < radiusSquared
                            ? 1
                            : 1 -
                            (distanceFromCenter - Math.sqrt(radiusSquared)) /
                            (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));
                    const cos = distanceFromCenter > 0 ? x / distanceFromCenter : 0;
                    const sin = distanceFromCenter > 0 ? -y / distanceFromCenter : 0;
                    const dotProduct = Math.abs(cos * specularVector[0] + sin * specularVector[1]);
                    const edgeRatio = Math.max(0, Math.min(1, distanceFromSide / specularThickness));
                    const sharpFalloff = Math.sqrt(1 - (1 - edgeRatio) * (1 - edgeRatio));
                    const coefficient = dotProduct * sharpFalloff;
                    const color = Math.min(255, 255 * coefficient);
                    const finalOpacity = Math.min(255, color * coefficient * opacity);

                    imageData.data[idx] = color;
                    imageData.data[idx + 1] = color;
                    imageData.data[idx + 2] = color;
                    imageData.data[idx + 3] = finalOpacity;
                }
            }
        }
        return imageData;
    }

    /**
     * Convert ImageData to data URL
     */
    _imageDataToDataURL(imageData) {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL();
    }

    /**
     * Update the SVG filter with new displacement and specular maps
     */
    _updateFilter(updateScale = true) {
        const { width, height, borderRadius } = this.dimensions;
        const surfaceFn = SurfaceEquations[this.options.surfaceType];

        const precomputed = this._calculateDisplacementMap1D(
            this.options.glassThickness,
            this.options.bezelWidth,
            surfaceFn,
            this.options.refractiveIndex
        );

        this.state.maximumDisplacement = Math.max(...precomputed.map(Math.abs));

        const displacementData = this._calculateDisplacementMap2D(
            width,
            height,
            width,
            height,
            borderRadius,
            this.options.bezelWidth,
            this.state.maximumDisplacement || 1,
            precomputed
        );

        const specularData = this._calculateSpecularHighlight(
            width,
            height,
            borderRadius,
            this.options.bezelWidth
        );

        const displacementUrl = this._imageDataToDataURL(displacementData);
        const specularUrl = this._imageDataToDataURL(specularData);

        document.getElementById(`${this.id}-displacement-image`)?.setAttribute('href', displacementUrl);
        document.getElementById(`${this.id}-specular-image`)?.setAttribute('href', specularUrl);

        if (updateScale) {
            document.getElementById(`${this.id}-displacement-map`)?.setAttribute('scale', this.state.maximumDisplacement * this.options.refractionScale);
        }

        document.getElementById(`${this.id}-specular-alpha`)?.setAttribute('slope', this.options.specularOpacity);
        document.getElementById(`${this.id}-blur`)?.setAttribute('stdDeviation', this.options.blur);

        this._updateContentClonePosition();
    }

    /**
     * Update the position of cloned content
     */
    _updateContentClonePosition(force = false) {
        if (this.useBackdropFilter) return;

        const rect = this.element.getBoundingClientRect();
        const parentRect = this.element.parentElement?.getBoundingClientRect() || rect;

        const left = parseFloat(this.element.style.left) || 0;
        const top = parseFloat(this.element.style.top) || 0;

        this.contentCloneInner.style.width = `${parentRect.width}px`;
        this.contentCloneInner.style.height = `${parentRect.height}px`;
        this.contentCloneInner.style.transform = `translate(${-left}px, ${-top}px)`;
    }

    /**
     * Setup event listeners
     */
    _setupEventListeners() {
        if (this.options.draggable) {
            this.element.addEventListener('mousedown', this._onMouseDown);
            this.element.addEventListener('touchstart', this._onTouchStart, { passive: false });
            document.addEventListener('mousemove', this._onMouseMove);
            document.addEventListener('touchmove', this._onTouchMove, { passive: false });
            document.addEventListener('mouseup', this._onMouseUp);
            document.addEventListener('touchend', this._onTouchEnd);
        }

        window.addEventListener('resize', this._onResize);
    }

    /**
     * Mouse/touch event handlers
     */
    _onMouseDown(e) {
        this._startDrag(e.clientX, e.clientY);
        e.preventDefault();
    }

    _onTouchStart(e) {
        this._startDrag(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    }

    _onMouseMove(e) {
        if (!this.state.isDragging) return;
        this._drag(e.clientX, e.clientY);
        e.preventDefault();
    }

    _onTouchMove(e) {
        if (!this.state.isDragging) return;
        this._drag(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    }

    _onMouseUp() {
        this._endDrag();
    }

    _onTouchEnd() {
        this._endDrag();
    }

    _onResize() {
        this._updateContentClonePosition(true);
    }

    /**
     * Drag functionality
     */
    _startDrag(clientX, clientY) {
        this.state.isDragging = true;

        const rect = this.element.getBoundingClientRect();
        const currentScale = this.springs.scale.value;

        this.state.dragOffset.x = (clientX - rect.left) / currentScale;
        this.state.dragOffset.y = (clientY - rect.top) / currentScale;
        this.state.lastX = clientX;
        this.state.lastY = clientY;
        this.state.lastTime = performance.now();
        this.state.velocityX = 0;
        this.state.velocityY = 0;

        if (this.options.onDragStart) {
            this.options.onDragStart(this);
        }

        this._startAnimationLoop();
    }

    _drag(clientX, clientY) {
        const parentRect = this.element.parentElement?.getBoundingClientRect();
        if (!parentRect) return;

        const now = performance.now();
        const dt = Math.max(1, now - this.state.lastTime) / 1000;

        this.state.velocityX = (clientX - this.state.lastX) / dt;
        this.state.velocityY = (clientY - this.state.lastY) / dt;
        this.state.lastX = clientX;
        this.state.lastY = clientY;
        this.state.lastTime = now;

        let newX = clientX - parentRect.left - this.state.dragOffset.x;
        let newY = clientY - parentRect.top - this.state.dragOffset.y;

        const maxX = parentRect.width - this.dimensions.width;
        const maxY = parentRect.height - this.dimensions.height;

        // Elastic boundaries
        if (newX < 0) newX = newX * 0.3;
        else if (newX > maxX) newX = maxX + (newX - maxX) * 0.3;

        if (newY < 0) newY = newY * 0.3;
        else if (newY > maxY) newY = maxY + (newY - maxY) * 0.3;

        this.element.style.left = `${newX}px`;
        this.element.style.top = `${newY}px`;

        if (this.options.onDrag) {
            this.options.onDrag(this, { x: newX, y: newY });
        }

        this._updateContentClonePosition();
    }

    _endDrag() {
        if (!this.state.isDragging) return;
        this.state.isDragging = false;

        const parentRect = this.element.parentElement?.getBoundingClientRect();
        if (parentRect) {
            let currentX = parseFloat(this.element.style.left) || 0;
            let currentY = parseFloat(this.element.style.top) || 0;

            const maxX = parentRect.width - this.dimensions.width;
            const maxY = parentRect.height - this.dimensions.height;

            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(0, Math.min(currentY, maxY));

            this.element.style.left = `${currentX}px`;
            this.element.style.top = `${currentY}px`;
        }

        if (this.options.onDragEnd) {
            this.options.onDragEnd(this);
        }

        this._updateContentClonePosition();
        this._startAnimationLoop();
    }

    /**
     * Animation loop for spring physics
     */
    _animationLoop(timestamp) {
        const dt = Math.min(0.032, 1 / 60);

        if (this.state.isDragging) {
            this.springs.scale.setTarget(1.0);
            this.springs.shadowOffsetX.setTarget(4);
            this.springs.shadowOffsetY.setTarget(16);
            this.springs.shadowBlur.setTarget(24);
            this.springs.shadowAlpha.setTarget(0.22);
            this.springs.refractionBoost.setTarget(1.0);
        } else {
            this.springs.scale.setTarget(0.85);
            this.springs.shadowOffsetX.setTarget(0);
            this.springs.shadowOffsetY.setTarget(4);
            this.springs.shadowBlur.setTarget(12);
            this.springs.shadowAlpha.setTarget(0.15);
            this.springs.refractionBoost.setTarget(0.8);
        }

        const velocityMagnitude = Math.sqrt(
            this.state.velocityX ** 2 + this.state.velocityY ** 2
        );
        const squishAmount = Math.min(0.15, velocityMagnitude / 3000);

        if (velocityMagnitude > 50) {
            const vxNorm = this.state.velocityX / velocityMagnitude;
            const vyNorm = this.state.velocityY / velocityMagnitude;
            this.springs.scaleX.setTarget(
                1 + squishAmount * Math.abs(vxNorm) - squishAmount * 0.5 * Math.abs(vyNorm)
            );
            this.springs.scaleY.setTarget(
                1 + squishAmount * Math.abs(vyNorm) - squishAmount * 0.5 * Math.abs(vxNorm)
            );
        } else {
            this.springs.scaleX.setTarget(1);
            this.springs.scaleY.setTarget(1);
        }

        const scale = this.springs.scale.update(dt);
        const scaleX = this.springs.scaleX.update(dt);
        const scaleY = this.springs.scaleY.update(dt);
        const shadowOffsetX = this.springs.shadowOffsetX.update(dt);
        const shadowOffsetY = this.springs.shadowOffsetY.update(dt);
        const shadowBlur = this.springs.shadowBlur.update(dt);
        const shadowAlpha = this.springs.shadowAlpha.update(dt);
        const refractionBoost = this.springs.refractionBoost.update(dt);

        this.element.style.transform = `scale(${scale * scaleX}, ${scale * scaleY})`;

        const insetAlpha = shadowAlpha * 0.6;
        this.innerElement.style.boxShadow = `
      ${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowAlpha}),
      inset ${shadowOffsetX * 0.3}px ${shadowOffsetY * 0.4}px 16px rgba(0, 0, 0, ${insetAlpha}),
      inset ${-shadowOffsetX * 0.3}px ${-shadowOffsetY * 0.4}px 16px rgba(255, 255, 255, ${insetAlpha * 0.8})
    `;

        const dynamicRefractionScale = this.options.refractionScale * refractionBoost;
        document.getElementById(`${this.id}-displacement-map`)?.setAttribute(
            'scale',
            this.state.maximumDisplacement * dynamicRefractionScale
        );

        if (!this.state.isDragging) {
            this.state.velocityX *= 0.95;
            this.state.velocityY *= 0.95;
        }

        const allSettled =
            Object.values(this.springs).every((s) => s.isSettled()) &&
            Math.abs(this.state.velocityX) < 1 &&
            Math.abs(this.state.velocityY) < 1;

        if (!allSettled) {
            this.animationFrameId = requestAnimationFrame((t) => this._animationLoop(t));
        } else {
            this.animationFrameId = null;
        }
    }

    _startAnimationLoop() {
        if (!this.animationFrameId && this.options.springAnimation) {
            this.animationFrameId = requestAnimationFrame((t) => this._animationLoop(t));
        }
    }

    /**
     * Update options dynamically
     * @param {Object} newOptions - New options to merge
     */
    setOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        this._updateFilter();
    }

    /**
     * Get current options
     * @returns {Object} Current options
     */
    getOptions() {
        return { ...this.options };
    }

    /**
     * Destroy the instance and clean up
     */
    destroy() {
        // Cancel animation
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // Remove event listeners
        if (this.options.draggable) {
            this.element.removeEventListener('mousedown', this._onMouseDown);
            this.element.removeEventListener('touchstart', this._onTouchStart);
            document.removeEventListener('mousemove', this._onMouseMove);
            document.removeEventListener('touchmove', this._onTouchMove);
            document.removeEventListener('mouseup', this._onMouseUp);
            document.removeEventListener('touchend', this._onTouchEnd);
        }

        window.removeEventListener('resize', this._onResize);

        // Remove DOM elements
        this.contentClone?.remove();
        this.filterSvg?.remove();
        this.innerElement?.remove();

        // Remove classes
        this.element.classList.remove('lg-element', 'lg-use-backdrop-filter');

        // Clear references
        this.element = null;
        this.contentClone = null;
        this.contentCloneInner = null;
        this.filterSvg = null;
        this.innerElement = null;
    }

    /**
     * Static method to initialize multiple elements
     * @param {string} selector - CSS selector for elements
     * @param {Object} options - Configuration options
     * @returns {LiquidGlass[]} Array of LiquidGlass instances
     */
    static init(selector, options = {}) {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).map((el) => new LiquidGlass(el, options));
    }

    /**
     * Static method to auto-initialize elements with data attributes
     * @returns {LiquidGlass[]} Array of LiquidGlass instances
     */
    static autoInit() {
        const elements = document.querySelectorAll('[data-liquid-glass]');
        return Array.from(elements).map((el) => {
            const options = {};

            // Parse data attributes
            if (el.dataset.lgSurface) options.surfaceType = el.dataset.lgSurface;
            if (el.dataset.lgBezel) options.bezelWidth = parseFloat(el.dataset.lgBezel);
            if (el.dataset.lgThickness) options.glassThickness = parseFloat(el.dataset.lgThickness);
            if (el.dataset.lgRefraction) options.refractionScale = parseFloat(el.dataset.lgRefraction);
            if (el.dataset.lgSpecular) options.specularOpacity = parseFloat(el.dataset.lgSpecular);
            if (el.dataset.lgBlur) options.blur = parseFloat(el.dataset.lgBlur);
            if (el.dataset.lgRadius) options.borderRadius = el.dataset.lgRadius;
            if (el.dataset.lgDraggable) options.draggable = el.dataset.lgDraggable === 'true';
            if (el.dataset.lgChildren) options.applyToChildren = el.dataset.lgChildren !== 'false';

            return new LiquidGlass(el, options);
        });
    }
}

// Export for ES modules
export { LiquidGlass, Spring, SurfaceEquations };
export default LiquidGlass;

// UMD export for script tag usage
if (typeof window !== 'undefined') {
    window.LiquidGlass = LiquidGlass;
    window.LiquidGlass.Spring = Spring;
    window.LiquidGlass.SurfaceEquations = SurfaceEquations;
}
