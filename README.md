# Regulations.gov Assistant

A conversational chat application for exploring U.S. federal regulations. Ask natural language questions and get answers backed by live data from [Regulations.gov](https://www.regulations.gov).

## Features

- Natural language queries routed to the correct Regulations.gov endpoint
- Rich result cards showing document type, agency, date, status, links
- Public comment text display
- "Load more" pagination
- Conversation history maintained across questions

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18 or later |
| npm | 9 or later |

---

## 1. Get API Keys

**Regulations.gov API key** — free, instant:
1. Visit https://api.regulations.gov/
2. Click **Get API Key** and fill in the form
3. Your key is emailed immediately

**Google Gemini API key** (for natural language understanding):
1. Visit https://aistudio.google.com/apikey
2. Click **Create API key** — free tier available

---

## 2. Set Environment Variables

You must export both keys in the terminal where you run the backend.

### Mac / Linux

```bash
export REGULATIONS_GOV_API_KEY="your_regulations_key_here"
export GEMINI_API_KEY="your_gemini_key_here"
```

To persist across sessions, add those lines to `~/.zshrc` or `~/.bashrc` and run `source ~/.zshrc`.

### Windows (PowerShell)

```powershell
$env:REGULATIONS_GOV_API_KEY="your_regulations_key_here"
$env:GEMINI_API_KEY="your_gemini_key_here"
```

### Windows (Command Prompt)

```cmd
set REGULATIONS_GOV_API_KEY=your_regulations_key_here
set GEMINI_API_KEY=your_gemini_key_here
```

---

## 3. Install & Run

Open **two terminals**.

### Terminal 1 — Backend

```bash
cd regulations-chat/backend
npm install
npm start
```

You should see:
```
✅  Backend running on http://localhost:3001
   REGULATIONS_GOV_API_KEY: set
   GEMINI_API_KEY:          set
```

### Terminal 2 — Frontend

```bash
cd regulations-chat/frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 4. Example Questions

| Question | What it does |
|----------|-------------|
| `What regulations exist about clean water?` | Searches documents for clean water rules |
| `Show me recent proposed rules from the FDA` | Filters by agency FDA and document type |
| `Find dockets related to immigration policy` | Searches rulemaking dockets |
| `Show me comments on docket EPA-HQ-OAR-2003-0129` | Fetches public comments for a specific docket |
| `What is document FDA-2009-N-0501-0012?` | Retrieves a single document by ID |
| `Show me recent public comments about healthcare` | Searches comment submissions |
| `Find all notices from the Department of Transportation` | Agency + type filter |

---

## Project Structure

```
regulations-chat/
├── backend/
│   ├── server.js          # Express server + Claude tool-use loop
│   ├── package.json
│   └── .env.example       # Template for required env vars
├── frontend/
│   ├── src/
│   │   ├── App.jsx                         # Root component + state
│   │   ├── App.module.css
│   │   ├── main.jsx
│   │   ├── index.css
│   │   └── components/
│   │       ├── ChatWindow.jsx              # Scrollable message list
│   │       ├── MessageBubble.jsx           # Per-message display
│   │       ├── ResultCard.jsx              # Document/comment/docket card
│   │       └── SearchSuggestions.jsx       # Clickable starter questions
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## API Rate Limits

Regulations.gov enforces:
- **50 requests / minute**
- **500 requests / hour**

The app surfaces rate limit errors clearly so you know when to pause.

---

## Security Notes

- The `REGULATIONS_GOV_API_KEY` is **never** sent to the browser — all Regulations.gov requests are proxied through the backend
- The `ANTHROPIC_API_KEY` is backend-only
- Never commit `.env` files or hardcode keys
