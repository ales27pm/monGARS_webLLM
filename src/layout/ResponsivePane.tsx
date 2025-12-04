import React from "react";
import "./layout.css";

type ResponsivePaneProps = {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
  style?: React.CSSProperties;
};

const ResponsivePane: React.FC<ResponsivePaneProps> = ({
  children,
  variant = "primary",
  className,
  style,
}) => {
  return (
    <div
      className={`responsive-pane responsive-pane--${variant} ${className ?? ""}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
};

export default ResponsivePane;
