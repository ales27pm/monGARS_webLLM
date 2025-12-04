import React from "react";
import { palette } from "../../theme";
import "../../layout/layout.css";

type ScreenKey = "Home" | "Voice" | "Settings" | "Reasoning" | "Capabilities";

type NavigationRailProps = {
  active: ScreenKey;
  onNavigate: (screen: ScreenKey) => void;
  items: { key: ScreenKey; label: string }[];
  layout?: "side" | "bottom";
};

const NavigationRail: React.FC<NavigationRailProps> = ({
  active,
  onNavigate,
  items,
  layout = "side",
}) => {
  const isSide = layout === "side";
  const containerClass = `navigation-rail navigation-rail--${layout}`;
  const itemsClass = `navigation-rail__items ${
    isSide ? "navigation-rail__items--side" : "navigation-rail__items--bottom"
  }`;

  return (
    <nav
      className={containerClass}
      aria-label={isSide ? "Navigation latérale" : "Navigation principale mobile"}
      style={isSide ? { position: "sticky", top: 20 } : {}}
    >
      <div className={itemsClass}>
        {items.map((item) => {
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`navigation-rail__button ${
                isActive ? "navigation-rail__button--active" : ""
              }`.trim()}
              onClick={() => onNavigate(item.key)}
              style={{
                borderColor: isActive ? palette.accent : undefined,
              }}
            >
              <span
                aria-hidden
                className="navigation-rail__icon"
                style={{ background: isActive ? palette.accent : undefined }}
              />
              <span className="navigation-rail__button-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export type { ScreenKey };
export default NavigationRail;
