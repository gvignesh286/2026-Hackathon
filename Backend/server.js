import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

// ── Environment checks ─────────────────────────────────────────────────────
const REGULATIONS_API_KEY = process.env.REGULATIONS_GOV_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!REGULATIONS_API_KEY) {
  console.error('\n❌  REGULATIONS_GOV_API_KEY is not set.');
  console.error('    Run:  export REGULATIONS_GOV_API_KEY="your_key_here"');
  console.error('    Get a free key at https://api.regulations.gov/\n');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('\n❌  GEMINI_API_KEY is not set.');
  console.error('    Run:  export GEMINI_API_KEY="your_key_here"');
  console.error('    Get a free key at https://aistudio.google.com/apikey\n');
  process.exit(1);
}

// ── Setup ──────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

const REGULATIONS_BASE = 'https://api.regulations.gov/v4';
const REG_HEADERS = { 'X-Api-Key': REGULATIONS_API_KEY };

// ── Gemini client ──────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ── Tool (function) declarations for Gemini ────────────────────────────────
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'search_documents',
        description:
          'Search for regulatory documents on Regulations.gov. Use for questions about finding rules, proposed rules, notices, or other regulatory documents.',
        parameters: {
          type: 'object',
          properties: {
            searchTerm: {
              type: 'string',
              description: 'The search term to find documents',
            },
            agencyId: {
              type: 'string',
              description:
                'Optional: filter by agency acronym, e.g. EPA, FDA, DOT, USDA',
            },
            documentType: {
              type: 'string',
              description:
                'Optional: filter by document type — Rule, Proposed Rule, Notice, Supporting & Related Material, or Other',
            },
            page: {
              type: 'integer',
              description: 'Page number for pagination (default: 1)',
            },
          },
          required: ['searchTerm'],
        },
      },
      {
        name: 'get_document',
        description:
          'Retrieve a specific document by its document ID from Regulations.gov.',
        parameters: {
          type: 'object',
          properties: {
            documentId: {
              type: 'string',
              description:
                'The exact document ID, e.g. EPA-HQ-OAR-2003-0129-0001 or FDA-2009-N-0501-0012',
            },
          },
          required: ['documentId'],
        },
      },
      {
        name: 'search_comments',
        description:
          'Search for public comments on Regulations.gov. Use for questions about comments submitted on regulations.',
        parameters: {
          type: 'object',
          properties: {
            searchTerm: {
              type: 'string',
              description: 'The search term to find comments',
            },
            docketId: {
              type: 'string',
              description: 'Optional: filter comments by docket ID',
            },
            page: {
              type: 'integer',
              description: 'Page number for pagination (default: 1)',
            },
          },
          required: ['searchTerm'],
        },
      },
      {
        name: 'get_comment',
        description:
          'Retrieve a specific comment by its comment ID from Regulations.gov.',
        parameters: {
          type: 'object',
          properties: {
            commentId: {
              type: 'string',
              description: 'The exact comment ID',
            },
          },
          required: ['commentId'],
        },
      },
      {
        name: 'search_dockets',
        description:
          'Search for dockets (rulemaking folders) on Regulations.gov. A docket is a collection of all documents and comments for a specific rulemaking.',
        parameters: {
          type: 'object',
          properties: {
            searchTerm: {
              type: 'string',
              description: 'The search term to find dockets',
            },
            agencyId: {
              type: 'string',
              description: 'Optional: filter by agency acronym',
            },
            page: {
              type: 'integer',
              description: 'Page number for pagination (default: 1)',
            },
          },
          required: ['searchTerm'],
        },
      },
      {
        name: 'get_docket',
        description:
          'Retrieve a specific docket by its docket ID from Regulations.gov.',
        parameters: {
          type: 'object',
          properties: {
            docketId: {
              type: 'string',
              description:
                'The exact docket ID, e.g. EPA-HQ-OAR-2003-0129',
            },
          },
          required: ['docketId'],
        },
      },
    ],
  },
];

// ── System prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a helpful assistant for Regulations.gov — the U.S. government's official portal for public access to federal regulatory materials. You help users find and understand federal regulations, proposed rules, public comments, and regulatory dockets.

You have access to tools that search and retrieve live data from Regulations.gov. When a user asks a question:
1. Decide what they are looking for: documents (rules/notices), comments (public submissions), or dockets (rulemaking folders).
2. Call the most appropriate tool with a clear, focused search term.
3. After receiving results, summarize what you found in a concise, helpful response. Mention the total count if available.

For direct links to items on regulations.gov use these patterns:
- Document:  https://www.regulations.gov/document/{id}
- Comment:   https://www.regulations.gov/comment/{id}
- Docket:    https://www.regulations.gov/docket/{id}

If the user asks about a specific document ID like "FDA-2009-N-0501-0012", call get_document directly.
If the user references a docket ID like "EPA-HQ-OAR-2003-0129", call get_docket directly, or search_comments with that docket ID if they ask about comments on it.

When no results are found, say so clearly and suggest rephrasing or broadening the search.
When an error occurs, explain what happened and suggest alternatives.
Keep responses concise — the UI will display rich result cards, so you don't need to repeat every field in your text.`;

// ── Gemini error formatter ─────────────────────────────────────────────────
function formatGeminiError(err) {
  const msg = err.message || '';

  if (msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('RESOURCE_EXHAUSTED')) {
    const retryMatch = msg.match(/retry in ([\d.]+s)/i) || msg.match(/"retryDelay":"(\d+s)"/);
    const retryDelay = retryMatch ? retryMatch[1] : null;

    const metricMatch = msg.match(/Quota exceeded for metric:\s*([\w./]+)/i);
    const metric = metricMatch ? metricMatch[1] : null;

    let friendly = 'AI quota exceeded: You\'ve reached the Gemini API rate limit.';
    if (metric) friendly += ` (Metric: ${metric})`;
    if (retryDelay) friendly += ` Please retry in ${retryDelay}.`;
    friendly += ' See https://ai.google.dev/gemini-api/docs/rate-limits for details.';
    return friendly;
  }

  if (msg.includes('API_KEY') || msg.includes('API key')) {
    return 'Invalid or missing Gemini API key. Check your GEMINI_API_KEY environment variable.';
  }

  return msg || 'An unexpected AI error occurred.';
}

// ── Gemini model instance ──────────────────────────────────────────────────
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: TOOLS,
  systemInstruction: SYSTEM_PROMPT,
});

// ── Tool executor ──────────────────────────────────────────────────────────
async function runTool(name, args) {
  try {
    switch (name) {
      case 'search_documents': {
        const params = {
          'filter[searchTerm]': args.searchTerm,
          'page[number]': args.page || 1,
          'page[size]': 5,
          sort: '-postedDate',
        };
        if (args.agencyId) params['filter[agencyId]'] = args.agencyId;
        if (args.documentType) params['filter[documentType]'] = args.documentType;
        const res = await axios.get(`${REGULATIONS_BASE}/documents`, {
          params,
          headers: REG_HEADERS,
        });
        return { type: 'documents', data: res.data };
      }

      case 'get_document': {
        const res = await axios.get(
          `${REGULATIONS_BASE}/documents/${args.documentId}`,
          { headers: REG_HEADERS }
        );
        return { type: 'document', data: res.data };
      }

      case 'search_comments': {
        const params = {
          'filter[searchTerm]': args.searchTerm,
          'page[number]': args.page || 1,
          'page[size]': 5,
          sort: '-postedDate',
        };
        if (args.docketId) params['filter[docketId]'] = args.docketId;
        const res = await axios.get(`${REGULATIONS_BASE}/comments`, {
          params,
          headers: REG_HEADERS,
        });
        return { type: 'comments', data: res.data };
      }

      case 'get_comment': {
        const res = await axios.get(
          `${REGULATIONS_BASE}/comments/${args.commentId}`,
          { params: { include: 'attachments' }, headers: REG_HEADERS }
        );
        return { type: 'comment', data: res.data };
      }

      case 'search_dockets': {
        const params = {
          'filter[searchTerm]': args.searchTerm,
          'page[number]': args.page || 1,
          'page[size]': 5,
          sort: '-lastModifiedDate',
        };
        if (args.agencyId) params['filter[agencyId]'] = args.agencyId;
        const res = await axios.get(`${REGULATIONS_BASE}/dockets`, {
          params,
          headers: REG_HEADERS,
        });
        return { type: 'dockets', data: res.data };
      }

      case 'get_docket': {
        const res = await axios.get(
          `${REGULATIONS_BASE}/dockets/${args.docketId}`,
          { headers: REG_HEADERS }
        );
        return { type: 'docket', data: res.data };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      if (status === 429)
        return { error: 'Rate limit reached (50 req/min or 500 req/hour). Please wait a moment and try again.' };
      if (status === 404)
        return { error: `Not found: the requested ID does not exist on Regulations.gov.` };
      const detail =
        err.response.data?.errors?.[0]?.detail ||
        JSON.stringify(err.response.data);
      return { error: `Regulations.gov API error (${status}): ${detail}` };
    }
    return { error: err.message };
  }
}

// ── POST /api/chat ─────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  let lastResults = null;
  let pagination = null;

  try {
    // Start a Gemini chat session, passing prior conversation history
    const chat = model.startChat({ history });

    // Send the user message and begin the agentic loop
    let currentResult = await chat.sendMessage(message);

    while (true) {
      const response = currentResult.response;
      const functionCalls = response.functionCalls() ?? [];

      if (functionCalls.length === 0) {
        // No more tool calls — Claude is done. Return final text + results.
        const text = response.text();
        const updatedHistory = await chat.getHistory();
        return res.json({
          response: text,
          results: lastResults,
          pagination,
          history: updatedHistory,
        });
      }

      // Execute every function call Gemini requested
      const responseParts = [];
      for (const call of functionCalls) {
        const result = await runTool(call.name, call.args);

        if (!result.error) {
          lastResults = result;
          const meta = result.data?.meta;
          if (meta) {
            pagination = {
              hasMore: meta.hasNextPage || false,
              page: meta.pageNumber || 1,
              totalElements: meta.totalElements || 0,
              toolName: call.name,
              toolInput: call.args,
            };
          } else {
            pagination = null; // single-item fetch — no pagination
          }
        }

        responseParts.push({
          functionResponse: {
            name: call.name,
            response: result,
          },
        });
      }

      // Feed all function responses back to Gemini
      currentResult = await chat.sendMessage(responseParts);
    }
  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({ error: formatGeminiError(err) });
  }
});

// ── POST /api/load-more ────────────────────────────────────────────────────
app.post('/api/load-more', async (req, res) => {
  const { toolName, toolInput } = req.body;
  if (!toolName || !toolInput)
    return res.status(400).json({ error: 'toolName and toolInput are required' });

  const nextInput = { ...toolInput, page: (toolInput.page || 1) + 1 };

  try {
    const result = await runTool(toolName, nextInput);

    let pagination = null;
    const meta = result.data?.meta;
    if (meta) {
      pagination = {
        hasMore: meta.hasNextPage || false,
        page: meta.pageNumber || 1,
        totalElements: meta.totalElements || 0,
        toolName,
        toolInput: nextInput,
      };
    }

    return res.json({ results: result, pagination });
  } catch (err) {
    console.error('Load-more error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/summarize  (Feature A) ───────────────────────────────────────
app.post('/api/summarize', async (req, res) => {
  const { item, resultType } = req.body;
  if (!item) return res.status(400).json({ error: 'item is required' });

  // Fetch richer details from the single-item endpoint
  let fullData = item;
  try {
    const toolMap = { documents: 'get_document', document: 'get_document', comments: 'get_comment', comment: 'get_comment', dockets: 'get_docket', docket: 'get_docket' };
    const idKey  = { documents: 'documentId',   document: 'documentId',   comments: 'commentId',  comment: 'commentId',  dockets: 'docketId',    docket: 'docketId'   };
    const tool   = toolMap[resultType];
    if (tool && item.id) {
      const r = await runTool(tool, { [idKey[resultType]]: item.id });
      if (!r.error && r.data?.data) fullData = r.data.data;
    }
  } catch (_) {}

  try {
    const m = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const r = await m.generateContent(`You are analyzing a U.S. federal regulatory document from Regulations.gov.

Document data:
${JSON.stringify(fullData, null, 2)}

Provide a structured plain-English analysis with exactly these sections (use **Section Title** format):

**Summary**
2-3 sentences explaining what this regulation/document is about in plain English.

**Key Points**
• 3-5 bullet points covering the most important aspects.

**Who Is Affected**
Which people, businesses, industries, or organizations are impacted?

**Important Dates**
Any deadlines, effective dates, comment periods, or compliance timelines. Say "None specified" if unavailable.

**Bottom Line**
One clear sentence: what does this mean in practice?

Use plain language. No legal jargon.`);
    res.json({ summary: r.response.text() });
  } catch (err) {
    res.status(500).json({ error: formatGeminiError(err) });
  }
});

// ── POST /api/document-qa  (Feature A) ─────────────────────────────────────
app.post('/api/document-qa', async (req, res) => {
  const { question, item, qaHistory = [] } = req.body;
  if (!question || !item) return res.status(400).json({ error: 'question and item are required' });

  try {
    const m = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `You answer questions about a specific U.S. federal regulatory document. Be concise and clear. If the answer isn't in the data, say so and suggest where to find it.\n\nDocument:\n${JSON.stringify(item, null, 2)}`,
    });
    const chat = m.startChat({ history: qaHistory });
    const result = await chat.sendMessage(question);
    res.json({ answer: result.response.text(), qaHistory: await chat.getHistory() });
  } catch (err) {
    res.status(500).json({ error: formatGeminiError(err) });
  }
});

// ── POST /api/draft-comment  (Feature B) ───────────────────────────────────
app.post('/api/draft-comment', async (req, res) => {
  const { document: doc, position, perspective } = req.body;
  if (!doc || !position || !perspective)
    return res.status(400).json({ error: 'document, position, and perspective required' });

  try {
    const deadline = doc.attributes?.commentEndDate
      ? new Date(doc.attributes.commentEndDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'see regulations.gov';

    const m = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const r = await m.generateContent(`You are helping a member of the public write a formal public comment for submission to the U.S. government via Regulations.gov.

REGULATION:
Title: ${doc.attributes?.title || 'Unknown'}
Agency: ${doc.attributes?.agencyId || 'Unknown'}
Document ID: ${doc.id}
Type: ${doc.attributes?.documentType || 'Unknown'}
Comment Deadline: ${deadline}

COMMENTER'S POSITION: ${position}

COMMENTER'S BACKGROUND AND CONCERNS:
${perspective}

Write a formal public comment (250–400 words) that:
1. Opens with who the commenter is and their clear position
2. Provides substantive reasoning drawn from the commenter's perspective
3. If opposing or modifying, makes specific, actionable recommendations
4. Closes with a direct request to the agency

Write it as a final, ready-to-submit comment. No placeholders.`);
    res.json({ comment: r.response.text() });
  } catch (err) {
    res.status(500).json({ error: formatGeminiError(err) });
  }
});

// ── GET /api/open-for-comment  (Feature C) ─────────────────────────────────
app.get('/api/open-for-comment', async (req, res) => {
  const { agencyId, searchTerm, page = 1 } = req.query;
  try {
    const params = {
      'filter[withinCommentPeriod]': 'true',
      'page[number]': parseInt(page),
      'page[size]': 10,
      sort: 'commentEndDate',
    };
    if (agencyId)    params['filter[agencyId]']    = agencyId;
    if (searchTerm)  params['filter[searchTerm]']  = searchTerm;
    const response = await axios.get(`${REGULATIONS_BASE}/documents`, { params, headers: REG_HEADERS });
    res.json(response.data);
  } catch (err) {
    if (err.response?.status === 429) return res.status(429).json({ error: 'Rate limit reached.' });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/profile-briefing  (Feature D) ────────────────────────────────
app.post('/api/profile-briefing', async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: 'description is required' });

  try {
    // Step 1: Extract smart search queries
    const em = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const er = await em.generateContent(`Based on this description: "${description}"

Generate exactly 3 specific Regulations.gov search queries most relevant to this person/org. Return ONLY a valid JSON array of 3 strings, nothing else.
Example: ["food safety labeling small business","restaurant sanitation FDA","food manufacturing permits"]`);

    let queries = [description.slice(0, 60)];
    try {
      const text = er.response.text().trim().replace(/```(?:json)?\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length) queries = parsed;
    } catch (_) {}

    // Step 2: Run searches in parallel
    const searchResults = await Promise.all(
      queries.slice(0, 3).map(q => runTool('search_documents', { searchTerm: q }))
    );

    // Step 3: Deduplicate
    const allItems = [];
    const seen = new Set();
    for (const r of searchResults) {
      if (!r.error && Array.isArray(r.data?.data)) {
        for (const item of r.data.data.slice(0, 4)) {
          if (!seen.has(item.id)) { seen.add(item.id); allItems.push(item); }
        }
      }
    }

    // Step 4: Generate briefing
    const bm = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const br = await bm.generateContent(`Create a personalized U.S. federal regulatory briefing.

Person/Organization: "${description}"

Most relevant regulations found:
${JSON.stringify(allItems.map(i => ({
  id: i.id, title: i.attributes?.title, agency: i.attributes?.agencyId,
  type: i.attributes?.documentType, date: i.attributes?.postedDate,
  openForComment: i.attributes?.openForComment, commentEndDate: i.attributes?.commentEndDate,
})), null, 2)}

Write a personalized briefing (3–4 paragraphs) using **Section Title** headers:

**Your Regulatory Landscape**
Which federal agencies and areas are most relevant to you and why.

**Key Regulations to Know**
The most important items from the list and what they mean for you specifically.

**Time-Sensitive Items**
Any open-for-comment periods, upcoming deadlines, or urgent actions.

**Your Next Steps**
2–3 concrete actions to take. Be specific and actionable. Write directly to the user ("you/your").`);

    res.json({ briefing: br.response.text(), items: allItems });
  } catch (err) {
    res.status(500).json({ error: formatGeminiError(err) });
  }
});

// ── POST /api/synthesize  (Feature E) ──────────────────────────────────────
app.post('/api/synthesize', async (req, res) => {
  const { items, resultType, originalQuery } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'items are required' });

  try {
    const m = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const r = await m.generateContent(`You are a regulatory analyst synthesizing multiple U.S. federal regulatory documents.

Search topic: "${originalQuery || 'regulatory search'}"
Result type: ${resultType}

Documents:
${JSON.stringify(items.map(i => ({
  id: i.id, title: i.attributes?.title, agency: i.attributes?.agencyId,
  type: i.attributes?.documentType, date: i.attributes?.postedDate,
  docket: i.attributes?.docketId, openForComment: i.attributes?.openForComment,
  commentEndDate: i.attributes?.commentEndDate,
})), null, 2)}

Provide an analytical synthesis with **Section Title** headers:

**Regulatory Landscape**
What is the overall picture on this topic? Who are the key federal players?

**Key Themes & Trends**
What patterns emerge? What direction is regulation moving?

**Most Significant Items**
Which 1–2 documents matter most and why?

**Action Items**
What should someone tracking this topic do next? Any comment deadlines?

Be analytical — give insight beyond what you'd get reading each card individually.`);
    res.json({ synthesis: r.response.text() });
  } catch (err) {
    res.status(500).json({ error: formatGeminiError(err) });
  }
});

// ── GET /api/status ────────────────────────────────────────────────────────
app.get('/api/status', (_req, res) => {
  res.json({
    regulationsApiKey: !!REGULATIONS_API_KEY,
    geminiApiKey: !!GEMINI_API_KEY,
  });
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n✅  Backend running on http://localhost:${PORT}`);
  console.log(`   REGULATIONS_GOV_API_KEY: set`);
  console.log(`   GEMINI_API_KEY:          set\n`);
});
