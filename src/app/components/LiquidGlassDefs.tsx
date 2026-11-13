/**
 * SVG filter definitions for the Liquid Glass surfaces.
 *
 * `feDisplacementMap` is the only way to actually refract the backdrop: it
 * samples the displacement map and shifts each pixel by (channel − 128) × scale.
 * Blurring first, then displacing, gives a frosted body with a crisp refracted
 * rim — the opposite order would smear the refraction away.
 *
 * Rendered once at the root of the document; `.glass-surface` references it by
 * id. The filter region is padded to 160% because refraction samples content
 * from just outside the element's own box.
 *
 * The map is a small PNG, not an SVG. Chromium re-rasterizes an SVG `feImage`
 * at the element's full size and ships it across processes every time the
 * glass repaints, so hovering a navbar chip made the backdrop blink for a
 * frame. A raster is decoded once and only scaled.
 *
 * Map layout: red is the horizontal shift, green the vertical one, 128 means
 * "no shift". Red ramps 0→128 over the first 3.5% of the width and 128→255
 * over the last 3.5%; green does the same over the top and bottom 22% of the
 * height. The centre stays at 128, so only the rim refracts.
 */
export default function LiquidGlassDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', pointerEvents: 'none' }}
    >
      <defs>
        <filter
          id="liquid-glass"
          x="-30%"
          y="-30%"
          width="160%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href="/glass/displacement-map.png"
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="map"
          />
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="frost" />
          <feDisplacementMap
            in="frost"
            in2="map"
            scale="14"
            xChannelSelector="R"
            yChannelSelector="G"
            result="lens"
          />
        </filter>
      </defs>
    </svg>
  );
}
