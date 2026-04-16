# Developers Have Had AI Assistants for Two Years. Everyone Else Is About to Catch Up.

For the past two years, software developers have been quietly living in a different world. Tools like GitHub Copilot, Claude Code, Cursor, and Codex aren't novelties anymore. They're how real work gets done. Developers describe their days in terms that would have sounded absurd in 2023: "I paired with my agent on the refactor," "the agent handled the migration while I reviewed." They're not using AI to generate snippets. They're working alongside it. The AI has context about their codebase, remembers what they're building, understands their patterns, and executes real tasks from start to finish.

Meanwhile, the rest of the knowledge workforce, including senior executives at the most AI-forward companies on the planet, is still using AI to summarize meeting notes and draft email replies.

That gap is enormous. And it's not about intelligence or technical skill. Developers didn't get ahead because they're smarter. They got ahead because the way they work happened to be ready for agents. The question now is what it takes to bring everyone else along. The answer isn't better models. It's rethinking how we set up the work itself.

## The Ceiling Everyone Hits

If you work in an enterprise today, you've probably hit the same wall. You open your AI assistant, ask it to help with something, and it does a reasonable job. It summarizes a document. It drafts a response. It reformats your notes. Useful. Genuinely useful. But not transformative.

Here's the thing most people miss: the ceiling isn't the technology. The models are extraordinary. They can reason, plan, write, analyze data, and orchestrate across systems. The capabilities have been ready for a while. The ceiling is us.

Most knowledge workers approach AI the way they approach a search engine. Open it, ask a question, get an answer, close it. That habit made perfect sense for every generation of software before this one. But AI assistants aren't search engines. They're closer to a new team member. And you wouldn't onboard a new team member by handing them one task at a time with no context about your priorities, your communication style, or how your week actually flows.

The technology can already handle the Q3 pipeline review being your top priority this week. It can learn that you prefer direct communication with your West Coast team but a softer tone with other groups. It can know that when you say "update the tracker" you mean a very specific SharePoint list three clicks deep in your department's site. But only if you set it up that way. Only if you're willing to work with the assistant differently than you've worked with every other piece of software in your career.

That's the real gap. Not AI capability, but how people engage with it. The assistant stays a capable stranger because we keep treating it like one.

## The Executive Who Said Yes

I work with an executive at a Fortune 100 software company. She runs a specialist seller team, is already surrounded by AI tools, and is ahead of the curve. But she wants more than what the current tools offer. Not another AI feature inside an existing product. A real assistant. One that can flag critical emails before they get buried, track to-do items as they materialize across email and Teams, prepare her for her rhythm-of-business cadence, pull data from sales systems, and help her craft the documents and decks that fill a senior leader's week.

She's not describing a chatbot. She's describing a chief of staff.

We're building this right now (L.C.G repo). It's experimental, evolving, and we're learning as we go. What makes this engagement different is that she understood from the start that getting this right would require her to change how she works. Not dramatically, but meaningfully. How does your week actually flow? Which tasks can the assistant handle without checking with you? How much of your institutional knowledge does it need to be genuinely useful?

Our working sessions have been design conversations, not product demos. We're mapping her workflow, defining autonomy boundaries, and talking through trust calibration. It feels less like setting up software and more like onboarding a very capable new hire.

## What the Developers Figured Out First

To understand why we approached her AI chief of staff this way, it helps to look at where AI agents have already proven themselves. Not in enterprise dashboards. Not in corporate chatbots. In software development.

Developers have been working with coding agents that don't just answer questions. They navigate codebases, make changes across dozens of files, run tests, fix what breaks, and ship working software. The productivity gains aren't marginal. Teams describe entire categories of work, migrations, refactors, boilerplate, that used to take weeks now taking hours.

Why did it work there first? Not because the models are tuned for code. The models are general-purpose. It worked because the developer's world happened to have the right properties. Code lives in files that agents can read and edit. Every change is tracked through version control. There are tests to validate whether something worked. There's a clear definition of "done." If something goes wrong, you can roll it back. The work is visible, structured, and auditable by default.

In other words, developers didn't build anything special for agents. They just worked in a way that was already agent-friendly.

Lee Robinson, now at Cursor, [made this point sharply](https://leerob.com/agents) when he migrated cursor.com from a headless CMS back to raw code and Markdown files. The CMS was the "grown-up" choice. It gave marketers a GUI to edit pages without touching code. But it also meant AI agents couldn't help with the website anymore. Every change required clicking through a content management interface instead of editing files directly. Robinson moved the site back to plain files and turned the agents loose. The migration that was estimated to take weeks, possibly requiring an outside agency, took three days and cost $260 in API tokens.

His conclusion: "The cost of an abstraction has never been higher."

To be clear, the lesson here isn't "frontends are bad" or "GUIs need to go." Cursor still has a website. It still has a user interface. The point is more specific and more important: when a system becomes the only way to interact with the underlying work, when it hides the files, the state, the structure behind a click path that only humans can navigate, it cuts agents out of the loop entirely. The CMS wasn't a problem because it had a GUI. It was a problem because the GUI was the only door to the content, and agents couldn't walk through it.

That distinction matters for every enterprise. An abstraction is a layer that hides work behind a simplified interface. A CMS, a dashboard, an admin portal, a ticketing system. For decades, these were smart investments. They made complex systems accessible to people who didn't want to deal with the underlying machinery. But the moment you want an agent to not just advise but actually participate in the work, to read it, edit it, and ship it alongside you, everything you hid becomes a wall. The agent can't navigate your draft modes and preview states. It can't operate inside the tribal knowledge of "ask Sarah, she knows how that system works." And it can't improve what it can't touch.

The developers who got the most from AI agents weren't the ones with the best tools. They were the ones whose work was already accessible, expressed in forms that agents could see, understand, and act on.

## Translating the Playbook

So we're testing a question: can we give a non-technical executive the same kind of agent leverage that developers have been getting? Not by turning her into a developer. By borrowing the architecture that makes developer agents work and applying it to her world.

The parallels are surprisingly direct. A coding agent has deep context about its codebase, skills it can invoke for specific tasks, and memory that persists across sessions. Our executive's assistant needs the same: deep context about her work, skills like drafting a deck in her voice or triaging her inbox against her actual priorities, and a growing understanding of how she operates that compounds over time.

The architecture we're building reflects this. At the core is an agent backend, built on tools like Microsoft's Copilot CLI Agent, extended with custom skills and integrations connected to her actual work systems: email, calendar, Teams, sales platforms, document creation. The agent doesn't live behind a purpose-built dashboard. It doesn't have a custom React frontend. That's a deliberate choice.

The instinct in enterprise software is always to build a UI. But every screen you build is a constraint. It freezes the experience at the moment of design and creates another abstraction between the agent and the work. Instead, the executive interacts with her assistant through natural language, the same paradigm that makes Claude Code and Cursor powerful for developers. You tell the agent what you need, in plain language, and it figures out how to do it using the skills and context it has.

Critically, this also means the agent can do real work, not just suggest it. The assistant doesn't just report on her task list or summarize what's in her inbox. It can update tasks, draft communications, and prepare documents. For routine actions, the agent operates autonomously. For higher-stakes work, it uses a draft-and-wait pattern: prepare the output, hold it for her review, learn from the feedback. We're starting with tight guardrails and expanding autonomy over time as trust builds, the same way you'd ramp up any new team member.

For a richer working environment, we're considering Obsidian as a viable and effective frontend. It's a note-taking tool that becomes her external brain. The assistant connects into that same space through extensions, with access to her notes for context and a chat interface for interaction. Her knowledge and the assistant's capabilities meet in one place. Not a polished app with fixed screens, but a workspace that both the human and the agent can see and operate in.

## The Abstraction Problem at Scale

This executive's project is one engagement. But the pattern it exposes is everywhere.

Over the past two decades, enterprises invested heavily in systems designed to make complex work accessible to non-technical users. CRM platforms, project management tools, reporting dashboards, ticketing systems. Each one wrapped an underlying process in a graphical interface. These were good investments. They democratized access and enabled scale. But they also made the work invisible, migrating it behind interfaces that only humans can navigate by clicking through screens.

Now we want agents to help with that work. And the agents can't get to it. The agent can talk about your CRM data if you paste it into a chat window. But it can't go into the system, pull the data it needs, update the record, and come back with a recommendation. The work is locked behind the abstraction.

The question isn't "should we throw out our enterprise software?" It's: where are the abstractions costing you more than they're worth? Every system that gives agents a programmatic path to read, edit, and act on real work data becomes a system where AI can deliver on its promise. Every system that remains a GUI-only click path stays one where the best AI can do is advise from the sideline.

## The Bigger Shift

This project with one executive is a small story. The shift it points to is not.

The developer community has been the proving ground for AI agents for two years now. They've worked out the patterns: how to give an agent context, how to define skills, how to build memory, how to calibrate autonomy. These weren't just coding tricks. They were workflow innovations. And they're portable.

That transition is coming for every knowledge worker. The executive who needed a polished dashboard to understand her pipeline data may soon have an agent that pulls it directly and presents exactly what she needs, at the moment she asks. The project manager who clicks through a project management tool to update statuses may have an agent that maintains project state in a shared workspace. The analyst who builds reports by pulling data from three different portals may have an agent that does the assembly while they focus on the interpretation.

The pattern is the same in every case. The people who get the most from AI agents will be the ones who make their work visible and editable, expressed in forms that both humans and agents can see, understand, and act on. The organizations that move fastest will be the ones that look honestly at their own workflows and ask: where is the work actually hiding?

## What This Means for You

Two years ago, a developer opened a terminal, described a problem in plain English, and watched an AI agent solve it. That moment didn't stay in the developer world. It just started there.

The executive I'm working with isn't technical. She doesn't write code. She doesn't need to. What she's doing is more fundamental: she's reorganizing how she works so that an AI agent can work alongside her. We don't have all the answers yet. We're building, testing, and learning in real time. But she's willing to engage with a new kind of interface, not because it's trendy, but because she understands that the more directly her assistant can access and act on her real work, the more valuable it becomes.

That willingness is the difference. Not technical skill. Not AI literacy. The willingness to stop treating an AI assistant like a search box and start treating it like a partner that needs to understand your world.

The technology is not the bottleneck. The models are capable. The tools are available today. The hard part is the human work: mapping your workflows honestly, deciding where an agent can act autonomously and where it needs your judgment, and being willing to change habits that were designed for a world where software couldn't think. The developers didn't get ahead by waiting for better tools. They got there by working in ways that agents could participate in.

The same opportunity is in front of every knowledge worker right now. The playbook exists. The question is whether you'll pick it up.
