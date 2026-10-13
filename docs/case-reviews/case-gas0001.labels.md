# Labelling sheet: case-gas0001

Source: GAS0001.txt. 4 conversations, 32 candidate lines in total.

Open `eval/labels/case-gas0001.todo.json` and, for each line, put the ids of the rubric
items that line covers into its `items` list. Most lines cover one; some cover none, and `[]` is
the right answer for those. Judge only what that line asks for, not what the conversation has
covered by then, because that is what the judge is asked to do.

When it is done, rename it to drop `.todo`, put your name in `labelledBy`, and run:

```bash
npm run eval -- agreement --online --case cases/case-gas0001.json --labels eval/labels/case-gas0001.json
```

## The items in this case

| id | what it is | an example question |
|---|---|---|
| `intro_consent` | Introduces self and explains the purpose of the conversation | Hello, I'm one of the doctors. Is it okay if I ask you some questions today? |
| `open_question` | Opens with an open question and lets the patient speak | What brings you in today? |
| `onset_duration` | Asks when it started and how it has changed | When did this start, and has it changed since? |
| `character_severity` | Asks what it is like and how bad it is | What does it feel like, and how bad does it get? |
| `associated_symptoms` | Asks about associated symptoms | Have you noticed anything else along with it? |
| `past_medical` | Takes a past medical history | Do you have any medical conditions, or have you had any operations? |
| `medications_allergies` | Asks about medicines and allergies | Are you taking any medicines, and do you have any allergies? |
| `family_history` | Asks about family history | Does anything like this run in your family? |
| `social_smoking_alcohol` | Takes a smoking and alcohol history | Do you smoke, and how much alcohol do you drink in a week? |
| `social_life` | Asks about work, home and daily life | What do you do for work, and who is at home with you? |
| `systems_review` | Screens the systems relevant to the complaint | Any weight loss, fevers or night sweats? |
| `ice_concerns` | Explores the patient's ideas, concerns and expectations | Is there anything in particular you are worried this might be? |
| `closing` | Summarises, checks understanding and invites questions | Can I summarise what you have told me? Do you have any questions? |
| `safety_netting` | Says what to do if it gets worse | If it gets worse, or you feel much more unwell, call 111 or come straight back. |

## Why the lines look like this

They are a real doctor’s questions from a published consultation, with the real patient’s replies,
so the conversation was not written by the tool being measured. Transcriber marks and filler are
left as they were recorded.
