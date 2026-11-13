import React from "react";
export default function Brand({ light = false }) {
  return (
    <img
      className="brand-lockup"
      src={`${import.meta.env.BASE_URL}brand/lockup-${light ? "white" : "navy"}.svg`}
      alt="Shypit"
      width="180"
      height="47"
    />
  );
}
