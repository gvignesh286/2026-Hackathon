# Regulations.gov Assistant

A conversational chat application for exploring U.S. federal regulations. Ask natural language questions and get answers backed by live data from [Regulations.gov](https://www.regulations.gov).

##Hackathon Reflection
CrimsonCode 2026 Hackathon Reflection
- We participated at Washington State University for the CrimsonCode 2026 Hackathon. This year, we wanted to help U.S. federal regulations be more accessible to everyday people. So we built an AI assistant that answers users' questions about those federal regulations using data from live Regulations.gov (federal regulation database) APIs.
- Technical Choices: We chose Node.js and Express as our backend and created the frontend using React + Vite to develop our application quickly. Instead of preloading all of the regulations information, we set up our backend to proxy user requests for real-time data through the Regulations.gov API. We integrated Google Gemini on our AI layer to manage natural language understanding and direct queries to the appropriate API endpoint, eliminating the need for us to build our own intent-classification systems. We made sure that any rate limiting error encountered by users would be displayed clearly, rather than failing to notify users of the issue.
- Contributions:We created this project as a team of three people; my work focused on front-end development, which included developing the component hierarchy, design token system, and UI for rendering rich results from documents, dockets, or comment data. I also was responsible for managing conversational state to ensure that the previous question/answer pair would be preserved when the user asked additional questions.
- Quality Assessment: I’m pleased with the outcome of the application: it worked from one end to the other, had a good user interface, and effectively routed AI-generated requests. If I could go back, I would make the following changes: I would have spent more time on stress testing AI request routing with edge cases and less time on early design, as well as enforcing stricter time boxes around frontend deliverables so I could allocate some of that available bandwidth towards back-end stability.
![IMG_1366](https://github.com/user-attachments/assets/174dc42e-ec94-4464-902d-21a585bdc34f)

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


