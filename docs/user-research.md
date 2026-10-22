# What PLAB 2 candidates say they need

October 2026. This tool has had very few real users yet, so before claiming it solves anyone's problem I went
to where candidates already talk about preparing for PLAB 2 and read what they say. This is that reading,
and how the design answers it, including the parts it does not answer.

**Method.** 123 public Reddit threads with their comments, January 2025 to October 2026, mostly r/PLABprep,
plus nearby subreddits for UK finals and IMGs. The threads were found by keyword search and read in full with
the help of an AI research assistant; every claim below links to the thread it came from. Official facts
about the exam were checked on GMC pages. Short quotes only, and no usernames.

**Limits.** Reddit is not a sample of candidates. People post when something went wrong, academies and tool
makers post too (several accounts in these threads were open about being founders), and a thread count is not
a measure of how many people feel something. Read this as the shape of the problem, not its size.

## How candidates actually prepare

The pattern that comes up again and again: free community notes, one paid course, a human practice partner,
and one or two mock exams. AI practice tools are mentioned as a stand-in for when no partner is available,
not as the main method. I found no first-hand post from anyone saying they passed mainly because of an AI
marker, and none saying an AI marker told them they were ready and they then failed.

### What candidates recommend to each other

Counted as the number of the 123 threads that mention each resource (keyword matching, so approximate;
mentions by founders and known promotional accounts are excluded where they were identifiable).

| Resource | What it is | Threads | What candidates praise |
|---|---|---|---|
| GK notes | Free downloadable PLAB 2 notes, plus a paid site | 44 | "the best notes to study from" ([1x1ijv9](https://www.reddit.com/comments/1x1ijv9/)); also called overwhelming in volume ([1u1htge](https://www.reddit.com/comments/1u1htge/)) |
| Dr Lovaan's course | Online lecture course | 34 | "really understands how this exam works" ([1sngv89](https://www.reddit.com/comments/1sngv89/)) |
| Dr AZT's prescribing course | Short course on the prescribing stations | 18 | "made prescription so easy" ([1uk0vsi](https://www.reddit.com/comments/1uk0vsi/)); mentioned in most pass write-ups, rarely criticised |
| Academies with mock exams (several, in London and Manchester) | In-person courses, mocks and manikin practice | 5–16 each | Mocks and manikin practice; opinions on individual academies are sharply divided |
| OSCE Revisions | Notes plus an AI patient, voice-first | 14 | Practising alone, consultation templates |
| Geeky Medics | Question bank, videos, AI patient | 9 | "AI patient is lowkey amazing" ([1jz88fo](https://www.reddit.com/comments/1jz88fo/)); auto-ticked checklists |
| General chatbots (ChatGPT and others) | Self-made role play | 10 | Free and "good enough" for some ([1vd9wph](https://www.reddit.com/comments/1vd9wph/)); others distrust their consistency |
| NICE CKS | Official clinical guidance | 7 | Used instead of paid notes for management; not reachable from outside the UK for some ([1k9y6tr](https://www.reddit.com/comments/1k9y6tr/)) |

Recalled exam questions also circulate widely (16 threads). This tool does not use them; see the table below.

Two things stand out. The resources candidates trust most are written by people (notes, a lecturer, a
prescribing course) and practised with people (partners, mocks). And the most praised feature of any AI tool
is the same as the most praised feature of a good partner: it tells you what you missed.

The real exam is not marked with a checklist. Each station gets an overall judgement in three equally
weighted domains (data gathering, clinical management, interpersonal skills), the pass mark for each station
is set by borderline regression, and examiners pick from ten published feedback statements
([GMC: understanding your results](https://www.gmc-uk.org/registration-and-licensing/join-our-registers/plab/plab-2-guide/understanding-your-results)).
Any item-by-item checklist, this one included, is a teaching proxy for that judgement, and the report says so.

## Pain points, and what this design does about them

| What candidates describe | Evidence | What this tool does | Status |
|---|---|---|---|
| **Partners cancel; practice depends on finding someone.** | [1vd9wph](https://www.reddit.com/comments/1vd9wph/), [1p2xp1t](https://www.reddit.com/comments/1p2xp1t/); "practicing with a partner is non-negotiable" ([1q63y4b](https://www.reddit.com/comments/1q63y4b/)) | A station you can run alone, any time, on a phone. | Addressed for history taking. It does not replace a partner. |
| **An AI patient that contradicts itself**, answering the same question two ways or changing the presenting complaint. | [1vcq8pt](https://www.reddit.com/comments/1vcq8pt/); "intra-model inconsistency" ([1tvjys9](https://www.reddit.com/comments/1tvjys9/)) | The patient only holds the facts you have unlocked, and the facts are fixed in the case file. Asked about something the case never mentions, it says it isn't sure instead of inventing. | Addressed. Measured: invented answers went from 70% to 0% once the engine, not the prompt, enforced it (see the README's Evaluation). |
| **Real role players wait for the right question.** One candidate describes an actor who waits for "the magic question". | [1vwjhcj](https://www.reddit.com/comments/1vwjhcj/) | Facts unlock only when you ask for them; one worry stays hidden until you ask about concerns or build rapport. | Addressed, and it is the core of the design. |
| **Marked down for something they did ask.** | [1vcq8pt](https://www.reddit.com/comments/1vcq8pt/), [1thja69](https://www.reddit.com/comments/1thja69/) | Every mark quotes the question that earned it and opens that line in the conversation; the mark scheme and unlock rules are public. | Addressed: you can check and dispute any mark. Other tools also claim to link marks to the transcript; publishing the rules is what is different here. |
| **Feedback that names what was missed.** Praise for tools goes to the ones that "point out what I missed". | Section three of the research notes | The report leads with the missed critical item and the hidden concern, and every missed item has a "try asking it like this". | Addressed. |
| **Cost.** The exam fee is £1,036 ([GMC fees](https://www.gmc-uk.org/registration-and-licensing/managing-your-registration/fees-and-funding/fees-for-doctors), from April 2026); candidates split subscriptions and ask for PDFs. | [1ns9zmz](https://www.reddit.com/comments/1ns9zmz/), [1mbncft](https://www.reddit.com/comments/1mbncft/) | Free, no signup, open source. | Addressed. |
| **Distrust of promotion.** Moderators acknowledge a spam problem; some recommendations come from founders. | [1oeaz7z](https://www.reddit.com/comments/1oeaz7z/), [1mbncft](https://www.reddit.com/comments/1mbncft/) | Everything that produces a mark is public code, and the measurements are published. | Partly. Openness helps, but anyone posting about their own tool will be doubted, and should say who they are. |
| **Recalled exam questions.** In September 2026 the MPTS suspended two tutors at a PLAB academy over sharing exam content. | [1wxmnqm](https://www.reddit.com/comments/1wxmnqm/), [MPTS decision](https://www.mpts-uk.org/hearings-and-decisions/tribunal-hearings-and-decisions/dr-hamed-salehi--sep-26) | Cases are built only from published, openly licensed mock consultations. No recalls. | Addressed. |
| **Management and timing are why people fail.** Several candidates say they never reached management in eight minutes; the advice is to start it by minute six. | [1lj90tk](https://www.reddit.com/comments/1lj90tk/), [1uk0vsi](https://www.reddit.com/comments/1uk0vsi/), [1m8cz4s](https://www.reddit.com/comments/1m8cz4s/), [1vwjhcj](https://www.reddit.com/comments/1vwjhcj/) | History taking only; management is not marked, and the report says so. | **Not addressed.** The most important gap. |
| **They need to practise out loud.** Every competing AI tool is voice-first. | [1we7th4](https://www.reddit.com/comments/1we7th4/) and the competitor survey | Typed; a phone keyboard's dictation works as a stand-in. | **Not addressed.** Token Factory has no speech model. |
| **Sounding scripted costs rapport marks** ("use of stock phrases" is one of the GMC's ten statements). | [1q63y4b](https://www.reddit.com/comments/1q63y4b/), [1thulc1](https://www.reddit.com/comments/1thulc1/) | The report marks rapport only from what the text shows, and says tone cannot be judged. | **Not addressed.** Typed practice cannot judge warmth or pace. |
| Manikins, prescribing, SimMan stations. | Research notes, section two | — | Out of scope. |

## What this changes

- The tool's honest place is **free, checkable history-taking practice when no partner is available**. It is
  not an exam simulator and should not be described as one.
- The biggest unmet needs are management and timing, and speaking out loud. Those are the next things to
  build, in that order: management can be added to the same engine; speech needs a speech model on the
  platform.
- Before the tool claims any effect on outcomes it needs real candidates, a comparison against human examiner
  judgements, and a clinician reviewing the cases.
