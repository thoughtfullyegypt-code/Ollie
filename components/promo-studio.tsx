"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clapperboard, Play, RotateCcw } from "lucide-react";
import {
  GuestArt,
  DishArt,
  EmptyChair,
  DecorationArt,
} from "./art/illustrations";
import "./promo-studio.css";
const stages = [
  "An empty chair",
  "Someone peculiar arrives",
  "A little company appears",
  "An invitation beside them",
];
export default function PromoStudio({
  recording = false,
  brandName,
}: {
  recording?: boolean;
  brandName: string;
}) {
  const [stage, setStage] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [run, setRun] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(preference.matches);
      if (preference.matches) setStage(3);
    };
    update();
    preference.addEventListener("change", update);
    const visibility = () => {
      if (root.current) root.current.dataset.paused = String(document.hidden);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    if (reduced) {
      setStage(3);
      return;
    }
    if (recording || run > 0) {
      setStage(0);
      [900, 2200, 3500].forEach((delay, i) =>
        timers.current.push(setTimeout(() => setStage(i + 1), delay)),
      );
    }
    return () => timers.current.forEach(clearTimeout);
  }, [run, recording, reduced]);
  function restart() {
    if (reduced) {
      setStage(3);
      return;
    }
    setRun((n) => n + 1);
  }
  return (
    <main
      ref={root}
      id="main"
      className={`promo-studio ${recording ? "recording" : ""} ${reduced ? "promo-reduced" : ""}`}
    >
      <header className="promo-header">
        <Link href="/admin">
          <ArrowLeft size={16} /> The host’s desk
        </Link>
        <span>
          {brandName}
          <i>.</i>
        </span>
        <span className="promo-demo-label">DEMONSTRATION · STAGED ARTWORK</span>
      </header>
      <section className="promo-intro">
        <p className="eyebrow">A LITTLE DINNER REHEARSAL</p>
        <h1>
          A chair. A character.
          <br />
          <em>A reason to come back.</em>
        </h1>
        {!recording && (
          <p>
            This scene uses only demonstration artwork. No inventory,
            reservations, accounts, payments, or donation totals are created.
          </p>
        )}
      </section>
      <section
        className={`promo-scene promo-stage-${stage}`}
        role="img"
        aria-label={`Demonstration: ${stages[stage]}`}
      >
        <div className="promo-world">
          <div className="promo-guest promo-left-neighbor">
            <GuestArt
              customization={{
                base: "grandma",
                accessory: "sunglasses",
                outfit: "cardigan",
              }}
              variant={3}
            />
          </div>
          <div className="promo-guest promo-main-chair">
            <EmptyChair />
          </div>
          <div className="promo-guest promo-main-guest">
            <GuestArt
              customization={{
                base: "raccoon",
                accessory: "none",
                outfit: "suit",
              }}
              variant={4}
            />
          </div>
          <div className="promo-guest promo-right-neighbor">
            <GuestArt
              customization={{ base: "plant", outfit: "bowtie" }}
              variant={5}
            />
          </div>
          <div className="promo-spare-chair">
            <EmptyChair color="#d7b97d" />
          </div>
          <div className="promo-gingham" />
          <div className="promo-food">
            <DishArt dish="fries" />
          </div>
          <div className="promo-flowers">
            <DecorationArt kind="flowers" />
          </div>
          <div className="promo-other-food">
            <DishArt dish="cake" />
          </div>
          <div className="promo-invitation">
            Dinner would be
            <br />
            <em>weirder with you.</em>
          </div>
        </div>
        <span className="promo-scene-label">
          DEMO · NOT REAL GUESTS OR SEAT AVAILABILITY
        </span>
      </section>
      <p className="promo-story-caption" aria-live="polite">
        {stages[stage]}.
      </p>
      {!recording && (
        <section className="promo-controls">
          <div className="promo-play-controls">
            <button className="btn btn-primary" onClick={restart}>
              <Play size={16} /> {run ? "Restart scene" : "Start scene"}
            </button>
            <Link className="btn btn-secondary" href="/admin/studio?record=1">
              <Clapperboard size={17} />
              Browser recording mode
            </Link>
          </div>
          <div className="promo-stages" aria-label="Storyboard stages">
            {stages.map((name, i) => (
              <button
                aria-pressed={stage === i}
                key={name}
                onClick={() => {
                  timers.current.forEach(clearTimeout);
                  setStage(i);
                }}
              >
                <span>0{i + 1}</span>
                {name}
              </button>
            ))}
          </div>
          <p>
            {reduced
              ? "Reduced motion is enabled: the complete scene appears immediately. Every stage remains available through the labeled controls."
              : "The scene lasts about five seconds. Browser recording mode hides these controls while keeping the demonstration label visible."}
          </p>
          <details>
            <summary>How to record this scene</summary>
            <ol>
              <li>
                Use a verified administrator account. Open browser recording
                mode in a landscape window.
              </li>
              <li>
                Start your device’s screen recorder, then reload the recording
                page. It automatically stages the chair, guest, nearby company,
                and invitation.
              </li>
              <li>
                Stop recording after five seconds. Keep the demonstration label
                in the exported footage.
              </li>
            </ol>
            <p>
              No video has been generated by this page. It is a reproducible
              recording scene, not a video exporter.
            </p>
          </details>
        </section>
      )}
    </main>
  );
}
