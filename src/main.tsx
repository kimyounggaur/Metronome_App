import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initializePwa } from "./pwa";
import "./styles/globals.css";

declare global { interface Window { __pulseReactProfile?: { commits:number; totalActualDuration:number; maxActualDuration:number }; } }
if(import.meta.env.DEV)window.__pulseReactProfile={commits:0,totalActualDuration:0,maxActualDuration:0};
const profile: React.ProfilerOnRenderCallback = (_id,_phase,actualDuration) => {
  const metrics=window.__pulseReactProfile;
  if(metrics){metrics.commits++;metrics.totalActualDuration+=actualDuration;metrics.maxActualDuration=Math.max(metrics.maxActualDuration,actualDuration);}
};
const app=<ErrorBoundary><App /></ErrorBoundary>;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {import.meta.env.DEV ? <React.Profiler id="Pulse" onRender={profile}>{app}</React.Profiler> : app}
  </React.StrictMode>,
);

initializePwa();
