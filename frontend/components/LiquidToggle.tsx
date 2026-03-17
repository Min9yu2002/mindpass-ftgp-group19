"use client";

import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { useId, useRef, useState } from "react";

type LiquidToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
};

export default function LiquidToggle({
  checked,
  onChange,
  label,
  disabled = false,
}: LiquidToggleProps) {
  const gooId = useId().replace(/:/g, "");
  const knockoutId = useId().replace(/:/g, "");
  const removeBlackId = useId().replace(/:/g, "");
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startComplete: number;
    moved: boolean;
  } | null>(null);
  const [visualComplete, setVisualComplete] = useState(checked ? 100 : 0);
  const [isActive, setIsActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [delta, setDelta] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const complete = isDragging ? visualComplete : checked ? 100 : 0;

  const commitToggle = (nextChecked: boolean) => {
    setVisualComplete(nextChecked ? 100 : 0);
    setIsDragging(false);
    setDelta(0);
    setIsActive(false);
    setIsPressed(false);
    if (nextChecked !== checked) {
      onChange(nextChecked);
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    const button = buttonRef.current;
    if (!button) {
      return;
    }

    button.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startComplete: checked ? 100 : 0,
      moved: false,
    };
    setIsDragging(true);
    setIsPressed(true);
    setIsActive(true);
    setDelta(0);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || !dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    const button = buttonRef.current;
    if (!button) {
      return;
    }

    const maxTravel = Math.max(button.offsetWidth * 0.42, 1);
    const dragged = event.clientX - dragStateRef.current.startX;
    if (Math.abs(dragged) > 3) {
      dragStateRef.current.moved = true;
    }

    const nextComplete = Math.min(
      100,
      Math.max(0, dragStateRef.current.startComplete + (dragged / maxTravel) * 100),
    );

    setVisualComplete(nextComplete);
    setDelta(Math.min(Math.abs(dragged), 12));
  };

  const releasePointer = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    const dragState = dragStateRef.current;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (event.type === "pointercancel") {
      setVisualComplete(checked ? 100 : 0);
      setIsDragging(false);
      setDelta(0);
      setIsActive(false);
      setIsPressed(false);
      return;
    }

    if (!dragState.moved) {
      commitToggle(!checked);
      return;
    }

    commitToggle(visualComplete >= 50);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      setIsActive(true);
      setIsPressed(true);
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      commitToggle(!checked);
    }
  };

  return (
    <div
      className="liquid-toggle-wrapper"
      data-checked={checked ? "true" : "false"}
      data-active={isActive ? "true" : "false"}
      data-pressed={isPressed ? "true" : "false"}
      data-bounce="true"
      data-mapped="false"
      style={
        {
          ["--complete" as string]: complete,
          ["--delta" as string]: delta,
          ["--liquid-goo-filter" as string]: `url(#${gooId})`,
          ["--liquid-knockout-filter" as string]: `url(#${knockoutId})`,
          ["--liquid-remove-black-filter" as string]: `url(#${removeBlackId})`,
        } as CSSProperties
      }
    >
      <svg
        aria-hidden="true"
        className="liquid-toggle-filters"
        focusable="false"
      >
        <defs>
          <filter id={gooId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="13" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 13 -10"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
          <filter id={knockoutId} colorInterpolationFilters="sRGB">
            <feColorMatrix
              result="knocked"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      -1 -1 -1 1 0"
            />
            <feComponentTransfer>
              <feFuncR type="linear" slope="3" intercept="-1" />
              <feFuncG type="linear" slope="3" intercept="-1" />
              <feFuncB type="linear" slope="3" intercept="-1" />
            </feComponentTransfer>
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0 0 0 0 0 1 1 1 1 1" />
              <feFuncG type="table" tableValues="0 0 0 0 0 1 1 1 1 1" />
              <feFuncB type="table" tableValues="0 0 0 0 0 1 1 1 1 1" />
            </feComponentTransfer>
          </filter>
          <filter id={removeBlackId}>
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      -255 -255 -255 0 1"
              result="black-pixels"
            />
            <feMorphology
              in="black-pixels"
              operator="dilate"
              radius="0.5"
              result="smoothed"
            />
            <feComposite in="SourceGraphic" in2="smoothed" operator="out" />
          </filter>
        </defs>
      </svg>

      <button
        ref={buttonRef}
        type="button"
        aria-pressed={checked}
        aria-label={label}
        disabled={disabled}
        className="liquid-toggle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
      >
        <span className="knockout">
          <span className="indicator indicator--masked">
            <span className="mask" />
          </span>
        </span>

        <span className="indicator__liquid">
          <span className="shadow" />
          <span className="wrapper">
            <span className="liquids">
              <span className="liquid__shadow" />
              <span className="liquid__track" />
            </span>
          </span>
          <span className="cover" />
        </span>
      </button>
    </div>
  );
}
