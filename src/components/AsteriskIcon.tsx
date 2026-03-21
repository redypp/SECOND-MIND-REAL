interface AsteriskIconProps {
  className?: string;
}

export function AsteriskIcon({ className = "w-6 h-6" }: AsteriskIconProps) {
  // Bold 6-pointed asterisk with wide trapezoidal petals matching reference image
  // Each petal is a wide trapezoid: narrow at center, wide at tip
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="rotate(-15 50 50)">
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <polygon
            key={angle}
            points="42,38 58,38 66,4 34,4"
            transform={`rotate(${angle} 50 50)`}
          />
        ))}
      </g>
    </svg>
  );
}
