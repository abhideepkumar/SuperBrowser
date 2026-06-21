# 🚀 SuperBrowser

**SuperBrowser** is a next-generation autonomous browser automation platform powered by LLMs and built on top of the Vercel `agent-browser` engine. It enables users to automate complex web interactions using plain text prompts, achieving the reliability and speed of traditional engineering scripts with zero maintenance.

---

## ✨ Key Features

### 🧠 Zero-Shot Autonomous Execution
Unlike traditional RPA tools that require brittle step-by-step scripts, SuperBrowser figures out the path to a goal on the fly. Simply provide a natural language prompt (e.g., *"Log into LinkedIn and find the latest post by Satya Nadella"*), and the agent handles the navigation, interaction, and data extraction dynamically.

### 🛡️ Dynamic UI Resilience
Traditional scrapers break when a CSS class changes or a button moves. SuperBrowser uses an **Accessibility Tree (AX Tree) + Annotated Screenshot** system. It labels every interactive element with a unique reference (e.g., `[@e1]`, `[@e2]`) at runtime. The LLM analyzes the *live* structure, making the automation inherently immune to UI redesigns.

### 🔐 Secure Credential Management
SuperBrowser supports encrypted credential injection. Use placeholders like `{{LINKEDIN_PASSWORD}}` in your goals, and the agent will securely substitute them at the moment of interaction, ensuring real credentials are never exposed to the LLM or frontend logs.

### 👁️ Deep Observability & Visual Replay
Every step the agent takes is logged with:
- **Reasoning**: Why the agent chose a specific action.
- **Annotated Screenshots**: Visual confirmation of the element the agent interacted with.
- **AX Tree Snapshots**: The semantic state of the page at each step.

---

## 🛠️ Tech Stack

- **Execution Engine**: Vercel `agent-browser` (Native Rust/Node)
- **Language**: TypeScript / Node.js
- **LLM Reasoning**: OpenAI GPT-4o (Default) or Anthropic Claude 3.5 Sonnet
- **Infrastructure**: Optimized for Vercel Serverless & AWS ECS

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- `agent-browser` CLI installed and available in your PATH.
- OpenAI API Key.

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-repo/super-browser.git
cd super-browser

# Install dependencies
npm install
```

### 3. Configuration
Create a `.env` file in the root directory (use `.env.example` as a template):
```env
OPENAI_API_KEY=your_key_here
MODEL_NAME=gpt-4o
MAX_STEPS=20
```

### 4. Running the Agent
Run the agent directly from the CLI by providing a goal:
```bash
npm run agent -- "Go to https://news.ycombinator.com and tell me the title of the top story"
```

## 📖 Documentation

For more detailed information, check out:
- [Product Vision](file:///c:/Users/itsab/Desktop/SuperBrowser/PRODUCT.md): Detailed feature breakdown and competitive strategy.
- [Technical Roadmap](file:///c:/Users/itsab/Desktop/SuperBrowser/ROADMAP.md): Current challenges, anti-bot strategies, and development phases.

---

## 📂 Project Structure

- `src/agent.ts`: The main autonomous loop (Observe -> Plan -> Act).
- `src/browser.ts`: Low-level wrapper for the `agent-browser` CLI.
- `src/llm.ts`: Integration with OpenAI/Anthropic for planning and reasoning.
- `src/prompt.ts`: Specialized system prompts for browser navigation.
- `src/credentials.ts`: Logic for secure credential substitution and goal sanitization.
- `screenshots/`: (Generated) Visual logs of the agent's progress.

---

## 🏗️ Architecture: The OPA Loop

SuperBrowser operates on a continuous **Observe-Plan-Act** cycle:
1. **Observe**: Captures a semantic AX Tree snapshot and an annotated screenshot.
2. **Plan**: Sends the visual + semantic context to the LLM to decide the next logical set of actions.
3. **Act**: Executes the planned actions (click, fill, scroll, etc.) using the `agent-browser` engine.
4. **Repeat**: Re-observes the new state and continues until the goal is achieved or `MAX_STEPS` is reached.

---

## 📄 License
MIT License. See [LICENSE](LICENSE) for details.
