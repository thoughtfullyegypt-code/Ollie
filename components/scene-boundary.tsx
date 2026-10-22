"use client";
import { Component, type ReactNode } from "react";
export default class SceneBoundary extends Component<
  { children: ReactNode; onList: () => void; onFind: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    console.error(
      JSON.stringify({
        event: "scene_render_failed",
        view: "illustrated_table",
      }),
    );
  }
  render() {
    if (this.state.failed)
      return (
        <section className="scene-fallback" role="status">
          <p className="eyebrow">A LITTLE ILLUSTRATION INTERRUPTION</p>
          <h2>The company is still here.</h2>
          <p>
            You can browse every public guest in the accessible list or find
            your own place while the illustration is unavailable.
          </p>
          <div>
            <button className="btn btn-secondary" onClick={this.props.onList}>
              Browse the guest list
            </button>
            <button className="btn btn-primary" onClick={this.props.onFind}>
              Find an available seat
            </button>
          </div>
        </section>
      );
    return this.props.children;
  }
}
