# Technical Roadmap & Challenges

This document outlines the current technical hurdles and the planned phases for evolving the SuperBrowser POC into a production-ready SaaS.

## 🔴 Current Technical Challenges

### 1. The Orchestration Loop
The `agent-browser` engine is a stateless executor. The "brain" resides in our loop controller (`agent.ts`). 
- **Goal**: Improve reliability of the "Done" state detection and handle AJAX loading states more gracefully.
- **Strategy**: Implement an **Action Validation Gate**—re-analyzing the page after each action to confirm success before proceeding.

### 2. Anti-Bot Detection (The "LinkedIn Problem")
Major platforms (LinkedIn, Amazon) use aggressive fingerprinting and CAPTCHAs.
- **Challenge**: `agent-browser` (Playwright) is easily detected.
- **Strategy**: Integrate proxy rotation (BrightData) and CAPTCHA solving services (2Captcha). For the POC, focus on non-protected sites.

### 3. Cost Optimization
Running GPT-4o for every step is expensive (~$0.10 - $0.50 per flow).
- **Strategy**: Implement "Snapshot Caching" and convert verified AI paths into deterministic JSON scripts that only call the LLM if they break.

### 4. Windows Compatibility
`agent-browser` has known daemon issues on Windows.
- **Recommendation**: Run execution in **WSL2** or **Docker** to ensure stability and path consistency.

---

## 🏗️ Development Phases

### Phase 1: Core Loop (COMPLETED)
- [x] Basic CLI agent loop.
- [x] AX Tree snapshotting.
- [x] LLM action planning (JSON).
- [x] Credential substitution.

### Phase 2: Reliability & UX (CURRENT)
- [ ] Implement multi-step action validation.
- [ ] Add auto-dismiss logic for cookie banners and popups.
- [ ] Create a simple Web UI to visualize real-time agent reasoning.

### Phase 3: Production Readiness
- [ ] Session persistence (saving/loading cookies).
- [ ] Integrated proxy support.
- [ ] "Record to Workflow" feature (saving LLM paths as JSON).

### Phase 4: Scale
- [ ] Global selector database for auto-healing.
- [ ] Template marketplace for community-driven automations.
