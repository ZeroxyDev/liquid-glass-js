/**
 * Liquid Glass Library - UMD Build
 * A reusable library for applying Apple's Liquid Glass effect to any element.
 * 
 * Usage:
 * <script src="liquid-glass.umd.js"></script>
 * <script>
 *   const glass = new LiquidGlass('#element', { draggable: true });
 * </script>
 * 
 * @version 1.0.0
 * @author ZeroxyDev (https://github.com/ZeroxyDev)
 */

(function (global, factory) {
    // UMD pattern
    if (typeof exports === 'object' && typeof module !== 'undefined') {
        // CommonJS
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else {
        // Browser globals
        var lib = factory();
        global.LiquidGlass = lib.LiquidGlass;
        global.Spring = lib.Spring;
        global.SurfaceEquations = lib.SurfaceEquations;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Surface equations - define the height profile of the glass bezel
    var SurfaceEquations = {
        convex_circle: function (x) { return Math.sqrt(1 - Math.pow(1 - x, 2)); },
        convex_squircle: function (x) { return Math.pow(1 - Math.pow(1 - x, 4), 1 / 4); },
        concave: function (x) { return 1 - Math.sqrt(1 - Math.pow(x, 2)); },
        lip: function (x) {
            var convex = Math.pow(1 - Math.pow(1 - Math.min(x * 2, 1), 4), 1 / 4);
            var concave = 1 - Math.sqrt(1 - Math.pow(1 - x, 2)) + 0.1;
            var smootherstep = 6 * Math.pow(x, 5) - 15 * Math.pow(x, 4) + 10 * Math.pow(x, 3);
            return convex * (1 - smootherstep) + concave * smootherstep;
        }
    };

    /**
     * Simple spring physics class for animations
     */
    function Spring(value, stiffness, damping) {
        this.value = value;
        this.target = value;
        this.velocity = 0;
        this.stiffness = stiffness || 300;
        this.damping = damping || 20;
    }

    Spring.prototype.setTarget = function (target) {
        this.target = target;
    };

    Spring.prototype.update = function (dt) {
        var force = (this.target - this.value) * this.stiffness;
        var dampingForce = this.velocity * this.damping;
        this.velocity += (force - dampingForce) * dt;
        this.value += this.velocity * dt;
        return this.value;
    };

    Spring.prototype.isSettled = function () {
        return Math.abs(this.target - this.value) < 0.001 && Math.abs(this.velocity) < 0.001;
    };

    // Unique ID counter for filter elements
    var instanceCounter = 0;

    // Default configuration options
    var defaultOptions = {
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
        onDragEnd: null
    };

    /**
     * LiquidGlass class - Apply liquid glass effect to any element
     */
    function LiquidGlass(element, options) {
        var self = this;

        // Get element
        this.element = typeof element === 'string'
            ? document.querySelector(element)
            : element;

        if (!this.element) {
            console.error('LiquidGlass: Element not found');
            return;
        }

        // Merge options with defaults
        this.options = {};
        for (var key in defaultOptions) {
            this.options[key] = defaultOptions[key];
        }
        for (var key in options) {
            this.options[key] = options[key];
        }

        // Generate unique ID for this instance
        this.id = 'lg-' + (++instanceCounter);

        // State
        this.state = {
            isDragging: false,
            dragOffset: { x: 0, y: 0 },
            velocityX: 0,
            velocityY: 0,
            lastX: 0,
            lastY: 0,
            lastTime: 0,
            maximumDisplacement: 0
        };

        // Springs for animation
        var springConfig = this.options.springConfig;
        this.springs = {
            scale: new Spring(0.85, springConfig.stiffness, springConfig.damping),
            scaleX: new Spring(1, springConfig.stiffness, springConfig.damping + 5),
            scaleY: new Spring(1, springConfig.stiffness, springConfig.damping + 5),
            shadowOffsetX: new Spring(0, springConfig.stiffness, springConfig.damping + 5),
            shadowOffsetY: new Spring(4, springConfig.stiffness, springConfig.damping + 5),
            shadowBlur: new Spring(12, springConfig.stiffness, springConfig.damping + 5),
            shadowAlpha: new Spring(0.15, springConfig.stiffness - 100, springConfig.damping),
            refractionBoost: new Spring(0.8, springConfig.stiffness - 100, springConfig.damping - 7)
        };

        this.animationFrameId = null;
        this.useBackdropFilter = false;
        this.backdropFilterSupported = false;

        // Bound event handlers
        this._onMouseDown = function (e) { self._handleMouseDown(e); };
        this._onMouseMove = function (e) { self._handleMouseMove(e); };
        this._onMouseUp = function (e) { self._handleMouseUp(e); };
        this._onTouchStart = function (e) { self._handleTouchStart(e); };
        this._onTouchMove = function (e) { self._handleTouchMove(e); };
        this._onTouchEnd = function (e) { self._handleTouchEnd(e); };
        this._onResize = function () { self._handleResize(); };

        // Initialize
        this._init();
    }

    LiquidGlass.prototype._init = function () {
        this._detectBackdropFilterSupport();
        this._setupDOM();
        this._updateFilter();
        this._setupEventListeners();

        if (this.options.springAnimation) {
            this.springs.scale.value = 0.85;
            this.springs.scale.target = 0.85;
            this._startAnimationLoop();
        }
    };

    LiquidGlass.prototype._detectBackdropFilterSupport = function () {
        var isChromium = !!window.chrome;
        var testEl = document.createElement('div');
        testEl.style.backdropFilter = 'url(#test)';
        var supportsBackdropFilterUrl = testEl.style.backdropFilter.indexOf('url') !== -1;

        this.backdropFilterSupported = isChromium && supportsBackdropFilterUrl;

        if (this.options.useBackdropFilter === 'auto') {
            this.useBackdropFilter = this.backdropFilterSupported;
        } else {
            this.useBackdropFilter = this.options.useBackdropFilter;
        }
    };

    LiquidGlass.prototype._setupDOM = function () {
        var el = this.element;

        // Add base class
        el.classList.add('lg-element');

        // Get dimensions
        var rect = el.getBoundingClientRect();
        var width = this.options.width === 'auto' ? rect.width : this.options.width;
        var height = this.options.height === 'auto' ? rect.height : this.options.height;

        // Get border radius
        var borderRadius = this.options.borderRadius;
        if (borderRadius === 'auto') {
            borderRadius = getComputedStyle(el).borderRadius || '0';
        }
        var radiusValue = parseInt(borderRadius) || 0;

        // Store dimensions
        this.dimensions = { width: width, height: height, borderRadius: radiusValue };

        // Create content clone for fallback mode
        this.contentClone = document.createElement('div');
        this.contentClone.className = 'lg-content-clone';
        this.contentClone.id = this.id + '-clone';

        this.contentCloneInner = document.createElement('div');
        this.contentCloneInner.className = 'lg-content-clone-inner';
        this.contentCloneInner.id = this.id + '-clone-inner';

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
        this.innerElement.id = this.id + '-inner';

        // Insert elements
        el.insertBefore(this.contentClone, el.firstChild);
        el.insertBefore(this.filterSvg, el.firstChild);
        el.appendChild(this.innerElement);

        // Apply filter
        if (this.useBackdropFilter) {
            el.classList.add('lg-use-backdrop-filter');
            this.innerElement.style.backdropFilter = 'url(#' + this.id + '-filter)';
            this.innerElement.style.webkitBackdropFilter = 'url(#' + this.id + '-filter)';
        } else {
            this.contentClone.style.filter = 'url(#' + this.id + '-filter)';
        }

        // Apply styles
        if (this.options.width !== 'auto') {
            el.style.width = width + 'px';
        }
        if (this.options.height !== 'auto') {
            el.style.height = height + 'px';
        }
        if (borderRadius) {
            el.style.borderRadius = typeof borderRadius === 'number' ? borderRadius + 'px' : borderRadius;
        }

        // Initial position update
        this._updateContentClonePosition(true);
    };

    LiquidGlass.prototype._createSVGFilter = function (width, height, radius) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'lg-filter-svg');
        svg.setAttribute('id', this.id + '-svg');
        svg.style.cssText = 'width: 0; height: 0; position: absolute; pointer-events: none;';

        svg.innerHTML = '\
      <defs>\
        <filter id="' + this.id + '-filter" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">\
          <feGaussianBlur id="' + this.id + '-blur" in="SourceGraphic" stdDeviation="' + this.options.blur + '" result="blurred"/>\
          <feImage id="' + this.id + '-displacement-image" href="" x="0" y="0" width="' + width + '" height="' + height + '" result="displacement_map" preserveAspectRatio="none"/>\
          <feDisplacementMap id="' + this.id + '-displacement-map" in="blurred" in2="displacement_map" scale="50" xChannelSelector="R" yChannelSelector="G" result="displaced"/>\
          <feColorMatrix in="displaced" type="saturate" values="1.3" result="displaced_saturated"/>\
          <feImage id="' + this.id + '-specular-image" href="" x="0" y="0" width="' + width + '" height="' + height + '" result="specular_layer" preserveAspectRatio="none"/>\
          <feComponentTransfer in="specular_layer" result="specular_faded">\
            <feFuncA id="' + this.id + '-specular-alpha" type="linear" slope="' + this.options.specularOpacity + '"/>\
          </feComponentTransfer>\
          <feBlend in="specular_faded" in2="displaced_saturated" mode="screen"/>\
        </filter>\
        <clipPath id="' + this.id + '-clip">\
          <rect x="0" y="0" width="' + width + '" height="' + height + '" rx="' + radius + '" ry="' + radius + '"/>\
        </clipPath>\
      </defs>';

        this.filterSvg = svg;
    };

    LiquidGlass.prototype._calculateDisplacementMap1D = function (glassThickness, bezelWidth, surfaceFn, refractiveIndex, samples) {
        samples = samples || 128;
        var eta = 1 / refractiveIndex;

        function refract(normalX, normalY) {
            var dot = normalY;
            var k = 1 - eta * eta * (1 - dot * dot);
            if (k < 0) return null;
            var kSqrt = Math.sqrt(k);
            return [
                -(eta * dot + kSqrt) * normalX,
                eta - (eta * dot + kSqrt) * normalY
            ];
        }

        var result = [];
        for (var i = 0; i < samples; i++) {
            var x = i / samples;
            var y = surfaceFn(x);
            var dx = x < 1 ? 0.0001 : -0.0001;
            var y2 = surfaceFn(Math.max(0, Math.min(1, x + dx)));
            var derivative = (y2 - y) / dx;
            var magnitude = Math.sqrt(derivative * derivative + 1);
            var normal = [-derivative / magnitude, -1 / magnitude];
            var refracted = refract(normal[0], normal[1]);

            if (!refracted) {
                result.push(0);
            } else {
                var remainingHeightOnBezel = y * bezelWidth;
                var remainingHeight = remainingHeightOnBezel + glassThickness;
                result.push(refracted[0] * (remainingHeight / refracted[1]));
            }
        }
        return result;
    };

    LiquidGlass.prototype._calculateDisplacementMap2D = function (canvasWidth, canvasHeight, objectWidth, objectHeight, radius, bezelWidth, maximumDisplacement, precomputedMap) {
        var imageData = new ImageData(canvasWidth, canvasHeight);

        for (var i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = 128;
            imageData.data[i + 1] = 128;
            imageData.data[i + 2] = 0;
            imageData.data[i + 3] = 255;
        }

        var radiusSquared = radius * radius;
        var radiusPlusOneSquared = (radius + 1) * (radius + 1);
        var radiusMinusBezelSquared = Math.max(0, (radius - bezelWidth) * (radius - bezelWidth));
        var widthBetweenRadiuses = objectWidth - radius * 2;
        var heightBetweenRadiuses = objectHeight - radius * 2;
        var objectX = (canvasWidth - objectWidth) / 2;
        var objectY = (canvasHeight - objectHeight) / 2;

        for (var y1 = 0; y1 < objectHeight; y1++) {
            for (var x1 = 0; x1 < objectWidth; x1++) {
                var idx = ((objectY + y1) * canvasWidth + objectX + x1) * 4;
                var isOnLeftSide = x1 < radius;
                var isOnRightSide = x1 >= objectWidth - radius;
                var isOnTopSide = y1 < radius;
                var isOnBottomSide = y1 >= objectHeight - radius;

                var x = isOnLeftSide ? x1 - radius : isOnRightSide ? x1 - radius - widthBetweenRadiuses : 0;
                var y = isOnTopSide ? y1 - radius : isOnBottomSide ? y1 - radius - heightBetweenRadiuses : 0;

                var distanceToCenterSquared = x * x + y * y;
                var isInBezel = distanceToCenterSquared <= radiusPlusOneSquared && distanceToCenterSquared >= radiusMinusBezelSquared;

                if (isInBezel) {
                    var opacity = distanceToCenterSquared < radiusSquared
                        ? 1
                        : 1 - (Math.sqrt(distanceToCenterSquared) - Math.sqrt(radiusSquared)) / (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));
                    var distanceFromCenter = Math.sqrt(distanceToCenterSquared);
                    var distanceFromSide = radius - distanceFromCenter;
                    var cos = distanceFromCenter > 0 ? x / distanceFromCenter : 0;
                    var sin = distanceFromCenter > 0 ? y / distanceFromCenter : 0;
                    var bezelRatio = Math.max(0, Math.min(1, distanceFromSide / bezelWidth));
                    var bezelIndex = Math.floor(bezelRatio * precomputedMap.length);
                    var distance = precomputedMap[Math.max(0, Math.min(bezelIndex, precomputedMap.length - 1))] || 0;
                    var dX = maximumDisplacement > 0 ? (-cos * distance) / maximumDisplacement : 0;
                    var dY = maximumDisplacement > 0 ? (-sin * distance) / maximumDisplacement : 0;

                    imageData.data[idx] = Math.max(0, Math.min(255, 128 + dX * 127 * opacity));
                    imageData.data[idx + 1] = Math.max(0, Math.min(255, 128 + dY * 127 * opacity));
                    imageData.data[idx + 2] = 0;
                    imageData.data[idx + 3] = 255;
                }
            }
        }
        return imageData;
    };

    LiquidGlass.prototype._calculateSpecularHighlight = function (objectWidth, objectHeight, radius, bezelWidth, specularAngle) {
        specularAngle = specularAngle || Math.PI / 3;
        var imageData = new ImageData(objectWidth, objectHeight);
        var specularVector = [Math.cos(specularAngle), Math.sin(specularAngle)];
        var specularThickness = 1.5;
        var radiusSquared = radius * radius;
        var radiusPlusOneSquared = (radius + 1) * (radius + 1);
        var radiusMinusSpecularSquared = Math.max(0, (radius - specularThickness) * (radius - specularThickness));
        var widthBetweenRadiuses = objectWidth - radius * 2;
        var heightBetweenRadiuses = objectHeight - radius * 2;

        for (var y1 = 0; y1 < objectHeight; y1++) {
            for (var x1 = 0; x1 < objectWidth; x1++) {
                var idx = (y1 * objectWidth + x1) * 4;
                var isOnLeftSide = x1 < radius;
                var isOnRightSide = x1 >= objectWidth - radius;
                var isOnTopSide = y1 < radius;
                var isOnBottomSide = y1 >= objectHeight - radius;

                var x = isOnLeftSide ? x1 - radius : isOnRightSide ? x1 - radius - widthBetweenRadiuses : 0;
                var y = isOnTopSide ? y1 - radius : isOnBottomSide ? y1 - radius - heightBetweenRadiuses : 0;

                var distanceToCenterSquared = x * x + y * y;
                var isNearEdge = distanceToCenterSquared <= radiusPlusOneSquared && distanceToCenterSquared >= radiusMinusSpecularSquared;

                if (isNearEdge) {
                    var distanceFromCenter = Math.sqrt(distanceToCenterSquared);
                    var distanceFromSide = radius - distanceFromCenter;
                    var opacity = distanceToCenterSquared < radiusSquared
                        ? 1
                        : 1 - (distanceFromCenter - Math.sqrt(radiusSquared)) / (Math.sqrt(radiusPlusOneSquared) - Math.sqrt(radiusSquared));
                    var cos = distanceFromCenter > 0 ? x / distanceFromCenter : 0;
                    var sin = distanceFromCenter > 0 ? -y / distanceFromCenter : 0;
                    var dotProduct = Math.abs(cos * specularVector[0] + sin * specularVector[1]);
                    var edgeRatio = Math.max(0, Math.min(1, distanceFromSide / specularThickness));
                    var sharpFalloff = Math.sqrt(1 - (1 - edgeRatio) * (1 - edgeRatio));
                    var coefficient = dotProduct * sharpFalloff;
                    var color = Math.min(255, 255 * coefficient);
                    var finalOpacity = Math.min(255, color * coefficient * opacity);

                    imageData.data[idx] = color;
                    imageData.data[idx + 1] = color;
                    imageData.data[idx + 2] = color;
                    imageData.data[idx + 3] = finalOpacity;
                }
            }
        }
        return imageData;
    };

    LiquidGlass.prototype._imageDataToDataURL = function (imageData) {
        var canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        var ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL();
    };

    LiquidGlass.prototype._updateFilter = function (updateScale) {
        if (updateScale === undefined) updateScale = true;

        var dimensions = this.dimensions;
        var surfaceFn = SurfaceEquations[this.options.surfaceType];

        var precomputed = this._calculateDisplacementMap1D(
            this.options.glassThickness,
            this.options.bezelWidth,
            surfaceFn,
            this.options.refractiveIndex
        );

        this.state.maximumDisplacement = Math.max.apply(null, precomputed.map(Math.abs));

        var displacementData = this._calculateDisplacementMap2D(
            dimensions.width,
            dimensions.height,
            dimensions.width,
            dimensions.height,
            dimensions.borderRadius,
            this.options.bezelWidth,
            this.state.maximumDisplacement || 1,
            precomputed
        );

        var specularData = this._calculateSpecularHighlight(
            dimensions.width,
            dimensions.height,
            dimensions.borderRadius,
            this.options.bezelWidth
        );

        var displacementUrl = this._imageDataToDataURL(displacementData);
        var specularUrl = this._imageDataToDataURL(specularData);

        var displacementImage = document.getElementById(this.id + '-displacement-image');
        var specularImage = document.getElementById(this.id + '-specular-image');
        var displacementMap = document.getElementById(this.id + '-displacement-map');
        var specularAlpha = document.getElementById(this.id + '-specular-alpha');
        var blur = document.getElementById(this.id + '-blur');

        if (displacementImage) displacementImage.setAttribute('href', displacementUrl);
        if (specularImage) specularImage.setAttribute('href', specularUrl);
        if (updateScale && displacementMap) {
            displacementMap.setAttribute('scale', this.state.maximumDisplacement * this.options.refractionScale);
        }
        if (specularAlpha) specularAlpha.setAttribute('slope', this.options.specularOpacity);
        if (blur) blur.setAttribute('stdDeviation', this.options.blur);

        this._updateContentClonePosition();
    };

    LiquidGlass.prototype._updateContentClonePosition = function (force) {
        if (this.useBackdropFilter) return;

        var rect = this.element.getBoundingClientRect();
        var parentRect = this.element.parentElement ? this.element.parentElement.getBoundingClientRect() : rect;

        var left = parseFloat(this.element.style.left) || 0;
        var top = parseFloat(this.element.style.top) || 0;

        this.contentCloneInner.style.width = parentRect.width + 'px';
        this.contentCloneInner.style.height = parentRect.height + 'px';
        this.contentCloneInner.style.transform = 'translate(' + (-left) + 'px, ' + (-top) + 'px)';
    };

    LiquidGlass.prototype._setupEventListeners = function () {
        if (this.options.draggable) {
            this.element.addEventListener('mousedown', this._onMouseDown);
            this.element.addEventListener('touchstart', this._onTouchStart, { passive: false });
            document.addEventListener('mousemove', this._onMouseMove);
            document.addEventListener('touchmove', this._onTouchMove, { passive: false });
            document.addEventListener('mouseup', this._onMouseUp);
            document.addEventListener('touchend', this._onTouchEnd);
        }

        window.addEventListener('resize', this._onResize);
    };

    LiquidGlass.prototype._handleMouseDown = function (e) {
        this._startDrag(e.clientX, e.clientY);
        e.preventDefault();
    };

    LiquidGlass.prototype._handleTouchStart = function (e) {
        this._startDrag(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    };

    LiquidGlass.prototype._handleMouseMove = function (e) {
        if (!this.state.isDragging) return;
        this._drag(e.clientX, e.clientY);
        e.preventDefault();
    };

    LiquidGlass.prototype._handleTouchMove = function (e) {
        if (!this.state.isDragging) return;
        this._drag(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
    };

    LiquidGlass.prototype._handleMouseUp = function () {
        this._endDrag();
    };

    LiquidGlass.prototype._handleTouchEnd = function () {
        this._endDrag();
    };

    LiquidGlass.prototype._handleResize = function () {
        this._updateContentClonePosition(true);
    };

    LiquidGlass.prototype._startDrag = function (clientX, clientY) {
        this.state.isDragging = true;

        var rect = this.element.getBoundingClientRect();
        var currentScale = this.springs.scale.value;

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
    };

    LiquidGlass.prototype._drag = function (clientX, clientY) {
        var parentRect = this.element.parentElement ? this.element.parentElement.getBoundingClientRect() : null;
        if (!parentRect) return;

        var now = performance.now();
        var dt = Math.max(1, now - this.state.lastTime) / 1000;

        this.state.velocityX = (clientX - this.state.lastX) / dt;
        this.state.velocityY = (clientY - this.state.lastY) / dt;
        this.state.lastX = clientX;
        this.state.lastY = clientY;
        this.state.lastTime = now;

        var newX = clientX - parentRect.left - this.state.dragOffset.x;
        var newY = clientY - parentRect.top - this.state.dragOffset.y;

        var maxX = parentRect.width - this.dimensions.width;
        var maxY = parentRect.height - this.dimensions.height;

        // Elastic boundaries
        if (newX < 0) newX = newX * 0.3;
        else if (newX > maxX) newX = maxX + (newX - maxX) * 0.3;

        if (newY < 0) newY = newY * 0.3;
        else if (newY > maxY) newY = maxY + (newY - maxY) * 0.3;

        this.element.style.left = newX + 'px';
        this.element.style.top = newY + 'px';

        if (this.options.onDrag) {
            this.options.onDrag(this, { x: newX, y: newY });
        }

        this._updateContentClonePosition();
    };

    LiquidGlass.prototype._endDrag = function () {
        if (!this.state.isDragging) return;
        this.state.isDragging = false;

        var parentRect = this.element.parentElement ? this.element.parentElement.getBoundingClientRect() : null;
        if (parentRect) {
            var currentX = parseFloat(this.element.style.left) || 0;
            var currentY = parseFloat(this.element.style.top) || 0;

            var maxX = parentRect.width - this.dimensions.width;
            var maxY = parentRect.height - this.dimensions.height;

            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(0, Math.min(currentY, maxY));

            this.element.style.left = currentX + 'px';
            this.element.style.top = currentY + 'px';
        }

        if (this.options.onDragEnd) {
            this.options.onDragEnd(this);
        }

        this._updateContentClonePosition();
        this._startAnimationLoop();
    };

    LiquidGlass.prototype._animationLoop = function () {
        var self = this;
        var dt = Math.min(0.032, 1 / 60);

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

        var velocityMagnitude = Math.sqrt(
            this.state.velocityX * this.state.velocityX + this.state.velocityY * this.state.velocityY
        );
        var squishAmount = Math.min(0.15, velocityMagnitude / 3000);

        if (velocityMagnitude > 50) {
            var vxNorm = this.state.velocityX / velocityMagnitude;
            var vyNorm = this.state.velocityY / velocityMagnitude;
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

        var scale = this.springs.scale.update(dt);
        var scaleX = this.springs.scaleX.update(dt);
        var scaleY = this.springs.scaleY.update(dt);
        var shadowOffsetX = this.springs.shadowOffsetX.update(dt);
        var shadowOffsetY = this.springs.shadowOffsetY.update(dt);
        var shadowBlur = this.springs.shadowBlur.update(dt);
        var shadowAlpha = this.springs.shadowAlpha.update(dt);
        var refractionBoost = this.springs.refractionBoost.update(dt);

        this.element.style.transform = 'scale(' + (scale * scaleX) + ', ' + (scale * scaleY) + ')';

        var insetAlpha = shadowAlpha * 0.6;
        this.innerElement.style.boxShadow =
            shadowOffsetX + 'px ' + shadowOffsetY + 'px ' + shadowBlur + 'px rgba(0, 0, 0, ' + shadowAlpha + '), ' +
            'inset ' + (shadowOffsetX * 0.3) + 'px ' + (shadowOffsetY * 0.4) + 'px 16px rgba(0, 0, 0, ' + insetAlpha + '), ' +
            'inset ' + (-shadowOffsetX * 0.3) + 'px ' + (-shadowOffsetY * 0.4) + 'px 16px rgba(255, 255, 255, ' + (insetAlpha * 0.8) + ')';

        var dynamicRefractionScale = this.options.refractionScale * refractionBoost;
        var displacementMap = document.getElementById(this.id + '-displacement-map');
        if (displacementMap) {
            displacementMap.setAttribute('scale', this.state.maximumDisplacement * dynamicRefractionScale);
        }

        if (!this.state.isDragging) {
            this.state.velocityX *= 0.95;
            this.state.velocityY *= 0.95;
        }

        var allSettled = true;
        for (var key in this.springs) {
            if (!this.springs[key].isSettled()) {
                allSettled = false;
                break;
            }
        }
        allSettled = allSettled && Math.abs(this.state.velocityX) < 1 && Math.abs(this.state.velocityY) < 1;

        if (!allSettled) {
            this.animationFrameId = requestAnimationFrame(function () { self._animationLoop(); });
        } else {
            this.animationFrameId = null;
        }
    };

    LiquidGlass.prototype._startAnimationLoop = function () {
        var self = this;
        if (!this.animationFrameId && this.options.springAnimation) {
            this.animationFrameId = requestAnimationFrame(function () { self._animationLoop(); });
        }
    };

    LiquidGlass.prototype.setOptions = function (newOptions) {
        for (var key in newOptions) {
            this.options[key] = newOptions[key];
        }
        this._updateFilter();
    };

    LiquidGlass.prototype.getOptions = function () {
        var result = {};
        for (var key in this.options) {
            result[key] = this.options[key];
        }
        return result;
    };

    LiquidGlass.prototype.destroy = function () {
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
        if (this.contentClone) this.contentClone.remove();
        if (this.filterSvg) this.filterSvg.remove();
        if (this.innerElement) this.innerElement.remove();

        // Remove classes
        this.element.classList.remove('lg-element', 'lg-use-backdrop-filter');

        // Clear references
        this.element = null;
        this.contentClone = null;
        this.contentCloneInner = null;
        this.filterSvg = null;
        this.innerElement = null;
    };

    // Static methods
    LiquidGlass.init = function (selector, options) {
        var elements = document.querySelectorAll(selector);
        var instances = [];
        for (var i = 0; i < elements.length; i++) {
            instances.push(new LiquidGlass(elements[i], options));
        }
        return instances;
    };

    LiquidGlass.autoInit = function () {
        var elements = document.querySelectorAll('[data-liquid-glass]');
        var instances = [];

        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var options = {};

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

            instances.push(new LiquidGlass(el, options));
        }

        return instances;
    };

    // Return exports
    return {
        LiquidGlass: LiquidGlass,
        Spring: Spring,
        SurfaceEquations: SurfaceEquations
    };
});
